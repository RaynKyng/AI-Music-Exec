"""Tests for the new Playlist Brainstorm Workspace endpoints.

Run: python3 /app/backend_brainstorm_test.py
"""
import os
import sys
import json
import time
import uuid
import requests

BASE = os.environ.get(
    "BACKEND_URL", "https://artist-catalog-pro.preview.emergentagent.com"
).rstrip("/")
API = f"{BASE}/api"

EXEC_EMAIL = "exec@music.com"
EXEC_PASS = "password123"

PASS = []
FAIL = []


def record(ok: bool, label: str, info: str = ""):
    line = f"{'PASS' if ok else 'FAIL'}: {label}"
    if info:
        line += f" — {info}"
    print(line)
    (PASS if ok else FAIL).append(line)


def login() -> str:
    r = requests.post(f"{API}/auth/login", json={"email": EXEC_EMAIL, "password": EXEC_PASS}, timeout=30)
    record(r.status_code == 200, "POST /api/auth/login (exec@music.com)", f"status={r.status_code}")
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def H(token: str):
    return {"Authorization": f"Bearer {token}"}


def get_or_create_collection(token: str) -> dict:
    # Try to find "Second Nature" first
    r = requests.get(f"{API}/collections", headers=H(token), timeout=30)
    record(r.status_code == 200, "GET /api/collections (sanity)", f"status={r.status_code} count={len(r.json()) if r.status_code==200 else '?'}")
    if r.status_code == 200:
        for c in r.json():
            if c.get("title", "").lower() == "second nature":
                print(f"  → using existing 'Second Nature' collection: {c['id']}")
                return c
        if r.json():
            c = r.json()[0]
            print(f"  → using first existing collection '{c.get('title')}': {c['id']}")
            return c

    # Need an artist to attach
    r2 = requests.get(f"{API}/artists", headers=H(token), timeout=30)
    artist_id = ""
    if r2.status_code == 200 and r2.json():
        artist_id = r2.json()[0]["id"]
    else:
        ra = requests.post(
            f"{API}/artists",
            headers=H(token),
            json={"name": f"Test Artist {uuid.uuid4().hex[:6]}", "bio": "", "genres": ["lofi"]},
            timeout=30,
        )
        artist_id = ra.json()["id"]

    body = {
        "title": f"Brainstorm Test Playlist {uuid.uuid4().hex[:6]}",
        "artist_id": artist_id,
        "collection_type": "Playlist",
        "description": "Late-night chill driving playlist for brainstorm regression test",
    }
    r3 = requests.post(f"{API}/collections", headers=H(token), json=body, timeout=30)
    record(r3.status_code == 200, "POST /api/collections (created scratch playlist for test)", f"status={r3.status_code}")
    assert r3.status_code == 200, r3.text
    return r3.json()


def test_get_brainstorm_initial(token: str, coll_id: str):
    r = requests.get(f"{API}/collections/{coll_id}/brainstorm", headers=H(token), timeout=30)
    ok = r.status_code == 200
    record(ok, "GET /api/collections/{id}/brainstorm — initial fetch", f"status={r.status_code}")
    if ok:
        body = r.json()
        record("chat" in body and "song_starters" in body, "Initial response has chat[] and song_starters[]", f"keys={list(body.keys())}")


def test_post_freeform(token: str, coll_id: str):
    body = {"message": "What vibe should this playlist have?", "mode": "freeform"}
    r = requests.post(f"{API}/collections/{coll_id}/brainstorm", headers=H(token), json=body, timeout=120)
    ok = r.status_code == 200
    record(ok, "POST /api/collections/{id}/brainstorm (freeform)", f"status={r.status_code}")
    if not ok:
        print(f"   body: {r.text[:500]}")
        return
    j = r.json()
    record(isinstance(j.get("response"), str) and len(j["response"]) > 0, "Freeform returns non-empty response string", f"len={len(j.get('response',''))}")
    record(j.get("parsed_song_starters") == [], "Freeform mode produces NO parsed_song_starters", f"got={j.get('parsed_song_starters')}")
    record(j.get("parsed_roster_matches") == [], "Freeform mode produces NO parsed_roster_matches")


def test_post_song_starters(token: str, coll_id: str) -> list:
    body = {
        "message": "Give me 5 song starters for a chill late-night driving playlist",
        "mode": "song_starters",
    }
    r = requests.post(f"{API}/collections/{coll_id}/brainstorm", headers=H(token), json=body, timeout=180)
    ok = r.status_code == 200
    record(ok, "POST /api/collections/{id}/brainstorm (song_starters)", f"status={r.status_code}")
    if not ok:
        print(f"   body: {r.text[:500]}")
        return []
    j = r.json()
    starters = j.get("parsed_song_starters") or []
    record(isinstance(starters, list) and len(starters) >= 1, "parsed_song_starters has >=1 entry", f"count={len(starters)}")
    # Verify structure of first starter
    if starters:
        first = starters[0]
        has_keys = all(k in first for k in ("title", "concept", "suno_style", "suggested_artist"))
        record(has_keys, "First starter has title/concept/suno_style/suggested_artist keys", f"keys={list(first.keys()) if isinstance(first, dict) else type(first)}")
        # Confirm no real artist names in suno_style (looser check: just verify it's a non-empty string)
        record(isinstance(first.get("suno_style"), str) and len(first["suno_style"]) > 5, "suno_style is non-empty descriptor")
    return starters


def test_get_brainstorm_after(token: str, coll_id: str, expected_chat_min: int, expected_starters_min: int):
    r = requests.get(f"{API}/collections/{coll_id}/brainstorm", headers=H(token), timeout=30)
    ok = r.status_code == 200
    record(ok, "GET /api/collections/{id}/brainstorm — after 2 posts", f"status={r.status_code}")
    if not ok:
        return None
    body = r.json()
    chat = body.get("chat", [])
    starters = body.get("song_starters", [])
    record(
        len(chat) >= expected_chat_min,
        f"Chat history has >={expected_chat_min} entries",
        f"got={len(chat)} (expect 2 user + 2 assistant)",
    )
    # Verify role alternation
    if len(chat) >= 4:
        roles = [c.get("role") for c in chat[-4:]]
        record(roles == ["user", "assistant", "user", "assistant"], "Last 4 chat entries alternate user/assistant", f"roles={roles}")
    record(len(starters) >= expected_starters_min, f"brainstorm_song_starters has >={expected_starters_min}", f"got={len(starters)}")
    return body


def test_save_song(token: str, coll_id: str, starter: dict):
    title = starter.get("title") or "Saved Brainstorm Song"
    body = {
        "title": title,
        "concept": starter.get("concept", ""),
        "suno_style": starter.get("suno_style", ""),
        "lyrics": "",
        "suggested_artist": starter.get("suggested_artist", "open"),
    }
    r = requests.post(f"{API}/collections/{coll_id}/brainstorm/save-song", headers=H(token), json=body, timeout=30)
    ok = r.status_code == 200
    record(ok, "POST /api/collections/{id}/brainstorm/save-song", f"status={r.status_code}")
    if not ok:
        print(f"   body: {r.text[:500]}")
        return None
    j = r.json()
    record(j.get("ok") is True and j.get("song_id"), "save-song returned ok=true + song_id", f"resp={j}")
    song_id = j.get("song_id")

    # Verify song was created and linked
    r2 = requests.get(f"{API}/songs/{song_id}", headers=H(token), timeout=30)
    record(r2.status_code == 200, "GET /api/songs/{new_song_id}", f"status={r2.status_code}")
    if r2.status_code == 200:
        song = r2.json()
        record(song.get("collection_id") == coll_id, "New song collection_id matches the playlist", f"got={song.get('collection_id')} expected={coll_id}")
        record(song.get("title") == title, "New song title preserved", f"got={song.get('title')}")
        # saved_prompts should include brainstorm_origin
        sp = song.get("saved_prompts") or []
        bo = [p for p in sp if p.get("prompt_type") == "brainstorm_origin"]
        record(len(bo) >= 1, "Saved song has brainstorm_origin in saved_prompts", f"count={len(bo)}")

    # Verify starter removed from brainstorm_song_starters
    r3 = requests.get(f"{API}/collections/{coll_id}/brainstorm", headers=H(token), timeout=30)
    if r3.status_code == 200:
        remaining = r3.json().get("song_starters", [])
        titles = [s.get("title") for s in remaining]
        record(title not in titles, "Starter removed from brainstorm_song_starters after save", f"remaining_titles_count={len(titles)}")
    return song_id


def test_delete_brainstorm(token: str, coll_id: str):
    r = requests.delete(f"{API}/collections/{coll_id}/brainstorm", headers=H(token), timeout=30)
    ok = r.status_code == 200 and r.json().get("ok") is True
    record(ok, "DELETE /api/collections/{id}/brainstorm", f"status={r.status_code} body={r.text[:120]}")
    # Now GET should show empty
    r2 = requests.get(f"{API}/collections/{coll_id}/brainstorm", headers=H(token), timeout=30)
    if r2.status_code == 200:
        body = r2.json()
        record(body.get("chat") == [] and body.get("song_starters") == [], "After DELETE both chat and starters are empty", f"chat_len={len(body.get('chat',[]))} starters_len={len(body.get('song_starters',[]))}")


def test_negative_404(token: str):
    bogus = str(uuid.uuid4())
    r1 = requests.get(f"{API}/collections/{bogus}/brainstorm", headers=H(token), timeout=30)
    record(r1.status_code == 404, "GET brainstorm on non-existent coll → 404", f"got {r1.status_code}")
    r2 = requests.post(f"{API}/collections/{bogus}/brainstorm", headers=H(token), json={"message": "hi", "mode": "freeform"}, timeout=30)
    record(r2.status_code == 404, "POST brainstorm on non-existent coll → 404", f"got {r2.status_code}")
    r3 = requests.delete(f"{API}/collections/{bogus}/brainstorm", headers=H(token), timeout=30)
    record(r3.status_code == 404, "DELETE brainstorm on non-existent coll → 404", f"got {r3.status_code}")
    r4 = requests.post(
        f"{API}/collections/{bogus}/brainstorm/save-song",
        headers=H(token),
        json={"title": "x", "concept": "", "suno_style": "", "lyrics": "", "suggested_artist": "open"},
        timeout=30,
    )
    record(r4.status_code == 404, "POST save-song on non-existent coll → 404", f"got {r4.status_code}")


def regression_checks(token: str, coll_id: str):
    # Auth login already done
    for path, name in [
        ("/artists", "GET /api/artists"),
        ("/songs", "GET /api/songs"),
        ("/ideas", "GET /api/ideas"),
        ("/collections", "GET /api/collections"),
    ]:
        r = requests.get(f"{API}{path}", headers=H(token), timeout=30)
        record(r.status_code == 200, f"{name} regression", f"status={r.status_code}")

    # GET /api/collections/{id} still returns full collection
    r = requests.get(f"{API}/collections/{coll_id}", headers=H(token), timeout=30)
    record(r.status_code == 200, "GET /api/collections/{id} regression", f"status={r.status_code}")
    if r.status_code == 200:
        body = r.json()
        # brainstorm_chat / brainstorm_song_starters may exist; field presence not required by Collection model
        record(body.get("id") == coll_id, "Collection detail returns matching id")

    # log_activity 'brainstormed' hook visible in /activity/recent
    r = requests.get(f"{API}/activity/recent?limit=50", headers=H(token), timeout=30)
    record(r.status_code == 200, "GET /api/activity/recent regression", f"status={r.status_code}")
    if r.status_code == 200:
        acts = r.json()
        brainstormed = [a for a in acts if a.get("action") == "brainstormed" and a.get("target_id") == coll_id]
        record(len(brainstormed) >= 1, "log_activity emitted 'brainstormed' for this collection", f"count={len(brainstormed)}")


def regression_reanalyze(token: str):
    # Pick any song and call re-analyze
    r = requests.get(f"{API}/songs", headers=H(token), timeout=30)
    if r.status_code != 200 or not r.json():
        record(False, "Regression: re-analyze (no songs available, skipping)")
        return
    # Pick a song that already has lyrics if possible
    target = None
    for s in r.json():
        if s.get("lyrics"):
            target = s
            break
    if not target:
        target = r.json()[0]
    sid = target["id"]
    r2 = requests.post(f"{API}/songs/{sid}/re-analyze", headers=H(token), json={"custom_prompt": "", "focus": "all"}, timeout=180)
    record(r2.status_code in (200, 400), f"POST /api/songs/{{id}}/re-analyze (regression, song={sid})", f"status={r2.status_code}")
    # 400 acceptable only if lyrics empty; 200 is the success case
    if r2.status_code == 200:
        try:
            j = r2.json()
            record(isinstance(j, dict), "re-analyze returned JSON object")
        except Exception:
            pass


def main():
    print(f"BACKEND: {BASE}")
    token = login()
    coll = get_or_create_collection(token)
    coll_id = coll["id"]
    print(f"\n=== Testing against collection: {coll.get('title')} ({coll_id}) ===\n")

    # Start fresh: clear any previous brainstorm state
    requests.delete(f"{API}/collections/{coll_id}/brainstorm", headers=H(token), timeout=30)

    # C) initial GET
    test_get_brainstorm_initial(token, coll_id)

    # D) freeform
    test_post_freeform(token, coll_id)

    # E) song_starters
    starters = test_post_song_starters(token, coll_id)

    # F) state after 2 posts
    body_after = test_get_brainstorm_after(token, coll_id, expected_chat_min=4, expected_starters_min=1 if starters else 0)

    # G) save one starter as a song
    saved_song_id = None
    if starters:
        saved_song_id = test_save_song(token, coll_id, starters[0])
    else:
        record(False, "Skipped save-song test (no starters returned by AI)")

    # H) DELETE
    test_delete_brainstorm(token, coll_id)

    # I) negative cases
    test_negative_404(token)

    # Regression
    print("\n=== Regression checks ===\n")
    regression_checks(token, coll_id)
    regression_reanalyze(token)

    # Summary
    print("\n" + "=" * 60)
    print(f"RESULTS: {len(PASS)} PASS / {len(FAIL)} FAIL")
    if FAIL:
        print("\nFAILURES:")
        for f in FAIL:
            print(f"  {f}")
    print("=" * 60)
    sys.exit(0 if not FAIL else 1)


if __name__ == "__main__":
    main()
