"""
Backend tests for the new Push Notifications feature + regression on log_activity hooks.

Focus per /app/test_result.md current_focus:
- Push Notifications: token registration + Expo Push API + activity-driven team notifications
"""
import os
import sys
import time
import json
import uuid
import requests
from typing import Any, Dict, Optional, Tuple

BASE_URL = os.environ.get(
    "BACKEND_BASE_URL",
    "https://artist-catalog-pro.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"

PRIMARY = {"email": "exec@music.com", "password": "password123", "name": "Music Exec"}
SECONDARY = {"email": "test@example.com", "password": "password123", "name": "Test User"}

results = []  # (name, ok, detail)


def record(name, ok, detail=""):
    status = "PASS" if ok else "FAIL"
    print(f"[{status}] {name}" + (f" — {detail}" if detail else ""))
    results.append((name, ok, detail))


def req(method, path, token=None, body=None, params=None, raw_body=None, timeout=30):
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if body is not None or raw_body is not None:
        headers["Content-Type"] = "application/json"
    url = f"{API}{path}"
    if method == "GET":
        return requests.get(url, headers=headers, params=params or {}, timeout=timeout)
    if method == "POST":
        return requests.post(url, headers=headers, json=body, data=raw_body, timeout=timeout)
    if method == "PUT":
        return requests.put(url, headers=headers, json=body, timeout=timeout)
    if method == "DELETE":
        # Many APIs accept body on DELETE via requests.request
        return requests.request("DELETE", url, headers=headers, json=body, timeout=timeout)
    raise ValueError(method)


def login_or_register(creds):
    r = req("POST", "/auth/login", body={"email": creds["email"], "password": creds["password"]})
    if r.status_code == 200:
        return r.json().get("access_token") or r.json().get("token")
    # Try register
    r = req("POST", "/auth/register", body=creds)
    if r.status_code in (200, 201):
        return r.json().get("access_token") or r.json().get("token")
    raise RuntimeError(f"Cannot login/register {creds['email']}: {r.status_code} {r.text[:200]}")


def get_me(token):
    r = req("GET", "/auth/me", token=token)
    r.raise_for_status()
    return r.json()


def ensure_personal_workspace(token):
    """If user is on a non-personal team, leave it."""
    me = get_me(token)
    if me.get("team_id") and me.get("team_id") != me.get("id"):
        r = req("POST", "/team/leave", token=token)
        # 200 ok or 400 already personal - both fine
        return r.status_code in (200, 400)
    return True


# =========================================================================
# 1. POST /api/users/push-token
# =========================================================================

def test_push_token_register(token_a):
    fake_token = "ExponentPushToken[abc123-fake-test-001]"

    # No auth
    r = req("POST", "/users/push-token", body={"push_token": fake_token, "platform": "android"})
    record(
        "POST /users/push-token without auth → 401/403",
        r.status_code in (401, 403),
        f"got {r.status_code}",
    )

    # Empty body / missing push_token
    r = req("POST", "/users/push-token", token=token_a, body={})
    record(
        "POST /users/push-token missing push_token → 400/422",
        r.status_code in (400, 422),
        f"got {r.status_code} body={r.text[:150]}",
    )

    # Empty string push_token
    r = req("POST", "/users/push-token", token=token_a, body={"push_token": "", "platform": "android"})
    record(
        "POST /users/push-token empty push_token → 400",
        r.status_code == 400,
        f"got {r.status_code} body={r.text[:120]}",
    )

    # Valid registration #1
    r = req("POST", "/users/push-token", token=token_a, body={"push_token": fake_token, "platform": "android"})
    body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    ok = r.status_code == 200 and body.get("ok") is True
    record(
        "POST /users/push-token valid → 200 ok=true",
        ok,
        f"status={r.status_code} body={body}",
    )

    # Verify token is stored: register again and ensure de-dup (count should remain 1)
    r2 = req("POST", "/users/push-token", token=token_a, body={"push_token": fake_token, "platform": "android"})
    record("POST /users/push-token (2nd call same token) → 200", r2.status_code == 200, f"status={r2.status_code}")

    # Indirect verification through /notifications/test which counts tokens
    r3 = req("POST", "/notifications/test", token=token_a)
    if r3.status_code == 200:
        b3 = r3.json()
        record(
            "De-dup: only 1 token after 2 registrations of same token",
            b3.get("tokens") == 1,
            f"tokens={b3.get('tokens')} sent={b3.get('sent')}",
        )
    else:
        record(
            "De-dup verify via /notifications/test",
            False,
            f"status={r3.status_code} body={r3.text[:200]}",
        )

    return fake_token


# =========================================================================
# 2. DELETE /api/users/push-token
# =========================================================================

def test_push_token_delete(token_a, fake_token):
    # Without auth
    r = req("DELETE", "/users/push-token", body={"push_token": fake_token})
    record(
        "DELETE /users/push-token without auth → 401/403",
        r.status_code in (401, 403),
        f"got {r.status_code}",
    )

    # Delete on existing
    r = req("DELETE", "/users/push-token", token=token_a, body={"push_token": fake_token})
    body = r.json() if r.status_code == 200 else {}
    record(
        "DELETE /users/push-token existing → 200 ok=true",
        r.status_code == 200 and body.get("ok") is True,
        f"status={r.status_code} body={body}",
    )

    # Idempotent — delete again
    r2 = req("DELETE", "/users/push-token", token=token_a, body={"push_token": fake_token})
    record(
        "DELETE /users/push-token non-existent → 200 (idempotent)",
        r2.status_code == 200,
        f"status={r2.status_code} body={r2.text[:120]}",
    )

    # /notifications/test should now 400 since 0 tokens
    r3 = req("POST", "/notifications/test", token=token_a)
    record(
        "POST /notifications/test with 0 tokens → 400",
        r3.status_code == 400,
        f"status={r3.status_code} body={r3.text[:160]}",
    )


# =========================================================================
# 3. POST /api/notifications/test
# =========================================================================

def test_notifications_test(token_a):
    # Ensure 0 tokens first
    me = get_me(token_a)
    fake_token = f"ExponentPushToken[notif-test-{uuid.uuid4().hex[:8]}]"
    # No tokens path — should 400
    # (Caller should have cleared tokens before; if not, this may pass, so we don't fail here)

    # Register a token
    r = req("POST", "/users/push-token", token=token_a, body={"push_token": fake_token, "platform": "ios"})
    record(
        "Register ios push token for notif test",
        r.status_code == 200,
        f"status={r.status_code}",
    )

    # Send test (will hit real Expo API)
    r = req("POST", "/notifications/test", token=token_a, timeout=60)
    body = {}
    try:
        body = r.json()
    except Exception:
        pass
    ok = r.status_code == 200 and body.get("ok") is True and isinstance(body.get("sent"), int) and isinstance(body.get("tokens"), int)
    record(
        "POST /notifications/test with ≥1 token → 200 ok/sent/tokens",
        ok,
        f"status={r.status_code} body={body}",
    )

    # Cleanup
    req("DELETE", "/users/push-token", token=token_a, body={"push_token": fake_token})


# =========================================================================
# 4. CRUD regression — log_activity hooks must not 500
# =========================================================================

def test_crud_regressions(token_a):
    # Create artist (needed for songs)
    r = req(
        "POST", "/artists", token=token_a,
        body={"name": f"Push Reg Artist {uuid.uuid4().hex[:6]}", "bio": "regression test"},
    )
    if r.status_code not in (200, 201):
        record("Create artist (precondition)", False, f"status={r.status_code} body={r.text[:200]}")
        return
    artist_id = r.json()["id"]
    record("Create artist (precondition)", True, f"id={artist_id}")

    # POST /api/songs
    r = req(
        "POST", "/songs", token=token_a,
        body={
            "title": f"Push Reg Song {uuid.uuid4().hex[:6]}",
            "artist_id": artist_id,
            "lyrics": "Verse one\nChorus two",
            "status": "draft",
            "genre": "pop",
        },
    )
    ok = r.status_code in (200, 201)
    record("POST /songs (with log_activity hook)", ok, f"status={r.status_code} body={r.text[:200]}")
    if not ok:
        return
    song_id = r.json()["id"]

    # PUT /api/songs/{id}  status change — endpoint expects full SongCreate body
    full_song_body = {
        "title": r.json().get("title") if False else "Push Reg Song updated",
        "artist_id": artist_id,
        "lyrics": "Verse one\nChorus two\nNew bridge",
        "status": "in_progress",  # status change
        "notes": "moved forward",
        "genre": "pop",
    }
    r = req("PUT", f"/songs/{song_id}", token=token_a, body=full_song_body)
    record("PUT /songs/{id} (status change)", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")

    # POST /api/ideas (IdeaCreate requires title + content)
    r = req(
        "POST", "/ideas", token=token_a,
        body={
            "title": f"Push Reg Idea {uuid.uuid4().hex[:6]}",
            "content": "a new idea body content",
            "type": "concept",
        },
    )
    record("POST /ideas (newly logs activity)", r.status_code in (200, 201), f"status={r.status_code} body={r.text[:200]}")

    # POST /api/comments on song
    r = req(
        "POST", "/comments", token=token_a,
        body={
            "target_type": "song",
            "target_id": song_id,
            "content": "Great hook here",
            "comment_type": "feedback",
        },
    )
    record("POST /comments (newly logs activity)", r.status_code in (200, 201), f"status={r.status_code} body={r.text[:200]}")

    # POST /api/songs/{id}/re-analyze (Emergent LLM; 200 or 503 acceptable, NOT 500)
    r = req("POST", f"/songs/{song_id}/re-analyze", token=token_a, body={"custom_prompt": "", "focus": "all"}, timeout=120)
    ok = r.status_code in (200, 503)
    record(
        "POST /songs/{id}/re-analyze (no 500 from push hook)",
        ok,
        f"status={r.status_code} body={r.text[:200]}",
    )

    # GET /api/songs/{id}/activity — verify activities including 'commented'
    r = req("GET", f"/songs/{song_id}/activity", token=token_a)
    if r.status_code == 200:
        acts = r.json()
        actions = {a.get("action") for a in acts}
        has_created = "created" in actions
        has_commented = "commented" in actions
        has_updated = "updated" in actions
        record(
            "GET /songs/{id}/activity has created+updated+commented",
            has_created and has_commented and has_updated,
            f"actions={actions}",
        )
    else:
        record("GET /songs/{id}/activity", False, f"status={r.status_code} body={r.text[:200]}")

    return song_id, artist_id


# =========================================================================
# 5. Notify-team flow
# =========================================================================

def test_notify_team_flow(token_a, token_b):
    # Make sure A and B are in personal workspaces first
    ensure_personal_workspace(token_b)

    me_a = get_me(token_a)
    me_b = get_me(token_b)

    # If A is not on personal workspace AND already has team members, that's fine. We need B to join A.
    # Simplest: ensure A is also in personal first so we get a clean shared team.
    ensure_personal_workspace(token_a)
    me_a = get_me(token_a)

    # Generate invite as A
    r = req("POST", "/team/invite-code", token=token_a)
    if r.status_code != 200:
        record("Team invite-code generation", False, f"status={r.status_code} body={r.text[:200]}")
        return
    code = r.json().get("code") or r.json().get("invite_code")
    record("Team invite-code generation", bool(code), f"code={code}")
    if not code:
        return

    # B joins
    r = req("POST", "/team/join", token=token_b, body={"code": code})
    if r.status_code != 200:
        record("B joins team", False, f"status={r.status_code} body={r.text[:200]}")
        return
    record("B joins team", True, f"resp={r.json()}")

    # Verify B's team_id == A's team_id
    me_a2 = get_me(token_a)
    me_b2 = get_me(token_b)
    record(
        "A and B share team_id after join",
        me_a2.get("team_id") == me_b2.get("team_id") and me_a2.get("team_id") is not None,
        f"A.team_id={me_a2.get('team_id')} B.team_id={me_b2.get('team_id')}",
    )

    # Register a fake push token for B
    fake_b_token = f"ExponentPushToken[teammate-{uuid.uuid4().hex[:8]}]"
    r = req("POST", "/users/push-token", token=token_b, body={"push_token": fake_b_token, "platform": "android"})
    record("Register push token for teammate B", r.status_code == 200, f"status={r.status_code}")

    # As A, create an artist + song. log_activity should fire notify_team to B.
    r = req("POST", "/artists", token=token_a, body={"name": f"Notify Artist {uuid.uuid4().hex[:5]}", "bio": "notify_team test"})
    if r.status_code not in (200, 201):
        record("Create artist (notify-team flow)", False, f"status={r.status_code}")
    else:
        notify_artist_id = r.json()["id"]
        r = req(
            "POST", "/songs", token=token_a,
            body={
                "title": f"Notify Song {uuid.uuid4().hex[:5]}",
                "artist_id": notify_artist_id,
                "status": "draft",
            },
        )
        ok = r.status_code in (200, 201)
        record("Create song as A (triggers notify_team to B)", ok, f"status={r.status_code} body={r.text[:200]}")
        if ok:
            song_id = r.json()["id"]
            # Verify activity doc exists
            time.sleep(0.5)
            r2 = req("GET", f"/songs/{song_id}/activity", token=token_a)
            if r2.status_code == 200:
                acts = r2.json()
                created_acts = [a for a in acts if a.get("action") == "created"]
                record(
                    "activity doc exists for created song",
                    len(created_acts) >= 1,
                    f"activities={len(acts)} created_count={len(created_acts)}",
                )
            else:
                record("activity doc fetch for created song", False, f"status={r2.status_code}")

    # Cleanup: B leaves team
    r = req("POST", "/team/leave", token=token_b)
    record("B leaves team (cleanup)", r.status_code in (200, 400), f"status={r.status_code}")

    # Cleanup B's token
    req("DELETE", "/users/push-token", token=token_b, body={"push_token": fake_b_token})


# =========================================================================
# Main
# =========================================================================

def main():
    print(f"Running push-notifications backend tests against {API}")

    # Login both users
    try:
        token_a = login_or_register(PRIMARY)
        record("Login PRIMARY (exec)", True)
    except Exception as e:
        record("Login PRIMARY (exec)", False, str(e))
        sys.exit(1)

    try:
        token_b = login_or_register(SECONDARY)
        record("Login SECONDARY (test)", True)
    except Exception as e:
        record("Login SECONDARY (test)", False, str(e))
        token_b = None

    # Pre-clean: ensure A has zero push tokens by calling delete on common ones is hard.
    # Just leverage /notifications/test → if 200, drain via direct DB? We don't have DB.
    # Instead: register a token then delete using same fake_token so we know baseline.
    # The de-dup test logically covers this.

    # First ensure A starts with no leftover tokens — try deleting several known fakes
    # by using the test sequence below which deletes after each.

    # 1+2. Push token register + delete tests
    fake = test_push_token_register(token_a)
    test_push_token_delete(token_a, fake)

    # 3. Notifications test (real Expo network call)
    test_notifications_test(token_a)

    # 4. CRUD regression
    test_crud_regressions(token_a)

    # 5. Notify-team flow (requires both users)
    if token_b:
        test_notify_team_flow(token_a, token_b)
    else:
        record("notify-team flow", False, "no SECONDARY token")

    # Summary
    print("\n========== SUMMARY ==========")
    failed = [r for r in results if not r[1]]
    print(f"Total: {len(results)}  Passed: {len(results)-len(failed)}  Failed: {len(failed)}")
    if failed:
        print("\nFailures:")
        for n, ok, d in failed:
            print(f"  - {n}: {d}")
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main())
