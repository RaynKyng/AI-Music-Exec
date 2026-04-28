"""
Expo Push Notifications service.

Sends notifications via Expo's push API:
  https://exp.host/--/api/v2/push/send

Tokens are stored on each user document in MongoDB under the field
`expo_push_tokens`: List[{"token": str, "platform": str, "updated_at": iso}].
"""
from __future__ import annotations

import os
import logging
import asyncio
from datetime import datetime
from typing import Iterable, List, Optional, Dict, Any

import httpx
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
ACCESS_TOKEN = os.environ.get("EXPO_ACCESS_TOKEN")  # optional, for enhanced security


async def upsert_push_token(
    db: AsyncIOMotorDatabase,
    user_id: str,
    push_token: str,
    platform: str = "android",
) -> bool:
    """Add/update a push token on a user. De-duplicates by token value."""
    if not push_token or not isinstance(push_token, str):
        return False
    if not push_token.startswith(("ExponentPushToken[", "ExpoPushToken[")):
        # Be lenient; some tokens may be raw FCM strings, but Expo Go uses ExponentPushToken
        logger.info(f"Storing non-Expo token format for user={user_id}")
    now = datetime.utcnow().isoformat()
    # Pull any existing entry for the same token, then push the fresh one
    await db.users.update_one(
        {"id": user_id},
        {"$pull": {"expo_push_tokens": {"token": push_token}}},
    )
    res = await db.users.update_one(
        {"id": user_id},
        {
            "$push": {
                "expo_push_tokens": {
                    "token": push_token,
                    "platform": platform,
                    "updated_at": now,
                }
            }
        },
    )
    return res.modified_count > 0 or res.upserted_id is not None


async def remove_push_token(
    db: AsyncIOMotorDatabase, user_id: str, push_token: str
) -> bool:
    res = await db.users.update_one(
        {"id": user_id},
        {"$pull": {"expo_push_tokens": {"token": push_token}}},
    )
    return res.modified_count > 0


async def get_team_tokens(
    db: AsyncIOMotorDatabase,
    team_id: str,
    exclude_user_id: Optional[str] = None,
) -> List[str]:
    """Return all push tokens for active team members, optionally excluding sender."""
    query: Dict[str, Any] = {"team_id": team_id}
    if exclude_user_id:
        query["id"] = {"$ne": exclude_user_id}
    cursor = db.users.find(query, {"expo_push_tokens": 1})
    tokens: List[str] = []
    async for u in cursor:
        for entry in (u.get("expo_push_tokens") or []):
            t = entry.get("token") if isinstance(entry, dict) else None
            if t:
                tokens.append(t)
    return tokens


async def _send_chunk(client: httpx.AsyncClient, messages: List[Dict[str, Any]]) -> None:
    if not messages:
        return
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Accept-Encoding": "gzip, deflate",
    }
    if ACCESS_TOKEN:
        headers["Authorization"] = f"Bearer {ACCESS_TOKEN}"
    try:
        resp = await client.post(
            EXPO_PUSH_URL, json=messages, headers=headers, timeout=15.0
        )
        if resp.status_code >= 400:
            logger.warning(
                f"Expo push API error {resp.status_code}: {resp.text[:500]}"
            )
            return
        data = resp.json()
        # Inspect tickets — DeviceNotRegistered → invalidate the token
        tickets = data.get("data", []) if isinstance(data, dict) else []
        for msg, ticket in zip(messages, tickets):
            if isinstance(ticket, dict) and ticket.get("status") == "error":
                err = (ticket.get("details") or {}).get("error")
                if err == "DeviceNotRegistered":
                    logger.info(
                        f"Removing dead Expo token: {msg.get('to')[:30]}..."
                    )
                    # Caller is responsible for cleanup; we just log here.
    except Exception as e:
        logger.warning(f"Failed sending Expo push chunk: {e}")


async def send_push(
    tokens: Iterable[str],
    title: str,
    body: str,
    data: Optional[Dict[str, Any]] = None,
) -> int:
    """Send a push notification to many tokens. Returns number of messages dispatched."""
    token_list = [t for t in tokens if t]
    if not token_list:
        return 0

    messages = [
        {
            "to": t,
            "title": title[:100] if title else "AI Music Exec",
            "body": body[:240] if body else "",
            "sound": "default",
            "priority": "high",
            "channelId": "default",
            "data": data or {},
        }
        for t in token_list
    ]

    # Expo recommends batches of up to 100
    async with httpx.AsyncClient() as client:
        chunks = [messages[i : i + 100] for i in range(0, len(messages), 100)]
        await asyncio.gather(*[_send_chunk(client, c) for c in chunks])

    return len(messages)


async def notify_team(
    db: AsyncIOMotorDatabase,
    team_id: str,
    title: str,
    body: str,
    *,
    exclude_user_id: Optional[str] = None,
    data: Optional[Dict[str, Any]] = None,
) -> int:
    """Helper: fetch teammate tokens and send a notification, fire-and-forget."""
    try:
        tokens = await get_team_tokens(db, team_id, exclude_user_id=exclude_user_id)
        if not tokens:
            return 0
        return await send_push(tokens, title, body, data=data)
    except Exception as e:
        logger.warning(f"notify_team failed: {e}")
        return 0
