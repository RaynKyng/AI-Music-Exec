"""Regression test for DB query projection optimisations on AI Music Exec backend.

Verifies:
- GET /api/artists returns full Artist model fields with saved_prompts = [] (projection excludes saved_prompts)
- GET /api/artists/{id} STILL returns saved_prompts (detail not projected)
- GET /api/songs returns full Song model fields with saved_prompts = []
- GET /api/songs/{id} STILL returns saved_prompts
- GET /api/ideas returns all fields, no _id leak
- POST /api/ai/assistant with artist_id still works (no 500 from leaner projection)
- POST /api/songs, /api/artists, /api/ideas, /api/comments still 200 (log_activity team-size find().limit(2) works)
"""
import os
import sys
import json
import uuid
import time
import requests

BASE = "https://artist-catalog-pro.preview.emergentagent.com/api"
EMAIL = "exec@music.com"
PASSWORD = "password123"

ARTIST_FIELDS = [
    "id", "name", "bio", "unique_sound", "genres", "themes", "tone",
    "patterns", "branding", "image_url", "profile_image", "character_images",
    "visual_brief", "visual_references", "suno_voice", "suno_exclusions",
    "notes", "is_private", "song_count", "created_at", "updated_at",
    "saved_prompts",  # must be present (default [] when projection drops it)
]
SONG_FIELDS = [
    "id", "title", "artist_id", "featured_artist_ids", "collection_id",
    "lyrics", "authorship", "style_prompt", "style_secondary", "style_alternate",
    "additional_styles", "exclusions", "genre", "mood", "tempo", "themes",
    "status", "notes", "todo", "versions", "suno_generations",
    "saved_prompts", "track_number", "is_private", "created_at", "updated_at",
]
IDEA_FIELDS = [
    "id", "title", "content", "type", "tags", "linked_artist_id",
    "linked_song_id", "is_private", "created_at", "updated_at",
]

results = []  # (name, ok, msg)


def record(name, ok, msg=""):
    results.append((name, ok, msg))
    status = "PASS" if ok else "FAIL"
    print(f"[{status}] {name}{(' — ' + msg) if msg else ''}")


def login():
    r = requests.post(f"{BASE}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


def main():
    token = login()
    H = {"Authorization": f"Bearer {token}"}
    record("login as exec@music.com", True)

    # ---- A) GET /api/artists -------------------------------------------------
    r = requests.get(f"{BASE}/artists", headers=H, timeout=30)
    record("GET /api/artists 200", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
    artists = r.json() if r.status_code == 200 else []
    if not artists:
        record("artists list non-empty", False, "no artists seeded — cannot validate fields")
        artist_id = None
    else:
        a0 = artists[0]
        missing = [f for f in ARTIST_FIELDS if f not in a0]
        record("artists list contains all Artist fields", not missing, f"missing={missing}")
        # saved_prompts must be [] (dropped by projection, Pydantic default)
        sp_empty = a0.get("saved_prompts") == []
        record("artists list saved_prompts == []", sp_empty, f"got={a0.get('saved_prompts')!r:.120s}")
        # No _id should be leaked (projection drops it; Pydantic would also strip but explicit check)
        record("artists list has no _id field", "_id" not in a0)
        artist_id = a0["id"]

    # ---- B) GET /api/artists/{id} -- saved_prompts present
    if artist_id:
        r = requests.get(f"{BASE}/artists/{artist_id}", headers=H, timeout=30)
        record("GET /api/artists/{id} 200", r.status_code == 200, r.text[:200])
        if r.status_code == 200:
            detail = r.json()
            # Even if empty list, key must exist
            record(
                "artist detail has saved_prompts key (not projected away)",
                "saved_prompts" in detail,
                f"keys={list(detail.keys())[:25]}",
            )

    # ---- C) GET /api/songs ---------------------------------------------------
    r = requests.get(f"{BASE}/songs", headers=H, timeout=30)
    record("GET /api/songs 200", r.status_code == 200, r.text[:200])
    songs = r.json() if r.status_code == 200 else []
    if not songs:
        record("songs list non-empty", False, "no songs seeded — cannot validate fields")
        song_id = None
    else:
        s0 = songs[0]
        missing = [f for f in SONG_FIELDS if f not in s0]
        record("songs list contains all Song fields (incl. lyrics/versions/suno_generations/themes)", not missing, f"missing={missing}")
        record("songs list saved_prompts == []", s0.get("saved_prompts") == [], f"got={s0.get('saved_prompts')!r:.120s}")
        record("songs list has no _id field", "_id" not in s0)
        # Pick a song that has versions or saved_prompts for the detail check (any will do)
        song_id = s0["id"]

    # ---- D) GET /api/songs/{id} ---------------------------------------------
    if song_id:
        r = requests.get(f"{BASE}/songs/{song_id}", headers=H, timeout=30)
        record("GET /api/songs/{id} 200", r.status_code == 200, r.text[:200])
        if r.status_code == 200:
            detail = r.json()
            record(
                "song detail has saved_prompts key (not projected away)",
                "saved_prompts" in detail,
                f"keys={list(detail.keys())[:30]}",
            )

    # ---- E) GET /api/ideas ---------------------------------------------------
    r = requests.get(f"{BASE}/ideas", headers=H, timeout=30)
    record("GET /api/ideas 200", r.status_code == 200, r.text[:200])
    ideas = r.json() if r.status_code == 200 else []
    if ideas:
        i0 = ideas[0]
        missing = [f for f in IDEA_FIELDS if f not in i0]
        record("ideas list contains all Idea fields", not missing, f"missing={missing}")
        record("ideas list has no _id field", "_id" not in i0)
    else:
        # Will create one below; this is informational
        record("ideas list empty (will create one in POST step)", True)

    # ---- G) Creates (log_activity team-size find().limit(2)) -----------------
    suffix = uuid.uuid4().hex[:8]

    new_artist_payload = {
        "name": f"Proj Test Artist {suffix}",
        "bio": "Regression test artist",
        "genres": ["test", "regression"],
    }
    r = requests.post(f"{BASE}/artists", json=new_artist_payload, headers=H, timeout=30)
    record("POST /api/artists 200", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
    created_artist = r.json() if r.status_code == 200 else {}
    new_artist_id = created_artist.get("id")

    new_song_payload = {
        "title": f"Proj Test Song {suffix}",
        "artist_id": new_artist_id,
        "lyrics": "verse 1: regression\nchorus: projection test",
        "status": "draft",
    }
    r = requests.post(f"{BASE}/songs", json=new_song_payload, headers=H, timeout=30)
    record("POST /api/songs 200 (log_activity team-size hook fires)", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
    created_song = r.json() if r.status_code == 200 else {}
    new_song_id = created_song.get("id")

    new_idea_payload = {
        "title": f"Proj Test Idea {suffix}",
        "content": "Idea created during projection regression test",
        "type": "spark",
    }
    r = requests.post(f"{BASE}/ideas", json=new_idea_payload, headers=H, timeout=30)
    record("POST /api/ideas 200", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")

    # POST /api/comments on the new song
    if new_song_id:
        comment_payload = {
            "target_type": "song",
            "target_id": new_song_id,
            "content": "Regression projection test comment",
            "comment_type": "note",
        }
        r = requests.post(f"{BASE}/comments", json=comment_payload, headers=H, timeout=30)
        record("POST /api/comments 200", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")

    # Verify song persists and Pydantic model rehydrates (saved_prompts default fired)
    if new_song_id:
        r = requests.get(f"{BASE}/songs/{new_song_id}", headers=H, timeout=30)
        record("GET created song detail 200", r.status_code == 200)
        if r.status_code == 200:
            detail = r.json()
            record("created song has title persisted", detail.get("title") == new_song_payload["title"])

    # Verify newly created artist appears in GET /api/artists list (and saved_prompts=[])
    r = requests.get(f"{BASE}/artists", headers=H, timeout=30)
    if r.status_code == 200 and new_artist_id:
        match = next((a for a in r.json() if a.get("id") == new_artist_id), None)
        if match:
            record(
                "new artist appears in list with saved_prompts == []",
                match.get("saved_prompts") == [],
                f"got={match.get('saved_prompts')!r:.120s}",
            )
        else:
            record("new artist appears in list", False, "not found in /api/artists response")

    # ---- F) POST /api/ai/assistant with artist_id ----------------------------
    # Use any existing artist (prefer ALPHiiN if present, else first)
    target_artist_id = None
    r = requests.get(f"{BASE}/artists", headers=H, timeout=30)
    if r.status_code == 200:
        all_artists = r.json()
        alphiin = next((a for a in all_artists if a.get("name", "").lower() == "alphiin"), None)
        target_artist_id = (alphiin or (all_artists[0] if all_artists else {})).get("id")

    if target_artist_id:
        payload = {
            "message": "Suggest a hook idea in this artist's voice.",
            "artist_id": target_artist_id,
        }
        r = requests.post(f"{BASE}/ai/assistant", json=payload, headers=H, timeout=120)
        ok = r.status_code == 200
        body = r.text[:300]
        record(
            "POST /api/ai/assistant with artist_id returns 200 (no crash from projection)",
            ok,
            f"status={r.status_code} body={body}",
        )
        if ok:
            data = r.json()
            record(
                "assistant response has 'response' field",
                isinstance(data, dict) and "response" in data,
                f"keys={list(data.keys()) if isinstance(data, dict) else type(data)}",
            )

    # ---- Summary -------------------------------------------------------------
    passed = sum(1 for _, ok, _ in results if ok)
    failed = [name for name, ok, _ in results if not ok]
    print()
    print("=" * 70)
    print(f"TOTAL: {passed}/{len(results)} passed")
    if failed:
        print("FAILURES:")
        for name in failed:
            print(f"  - {name}")
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main())
