"""
Backend test for the updated POST /api/songs/quick-add endpoint.
Verifies that the new `collection_id` and `playlist_ids` fields are honored,
that the song is properly counted into both a release and a playlist,
and that backward compatibility (calls without these fields) still works.
"""
import os
import time
import random
import string
import requests

BASE = "https://artist-catalog-pro.preview.emergentagent.com"
API = f"{BASE}/api"

results = []
def record(name, ok, detail=""):
    results.append((name, ok, detail))
    flag = "PASS" if ok else "FAIL"
    print(f"[{flag}] {name}  {detail}")


def rand_str(n=8):
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=n))


def main():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})

    # ------------------------------------------------------------------
    # Step 1: Sign up a fresh test user
    # ------------------------------------------------------------------
    email = f"qa.quickadd.{int(time.time())}.{rand_str(4)}@example.com"
    password = "password123"
    name = f"QuickAdd Tester {rand_str(3).upper()}"

    r = s.post(f"{API}/auth/register", json={
        "email": email,
        "password": password,
        "name": name,
    }, timeout=30)
    record("1. POST /api/auth/register", r.status_code == 200, f"status={r.status_code}")
    if r.status_code != 200:
        print("Register body:", r.text[:500])
        return summarize()
    auth_data = r.json()
    token = auth_data.get("token") or auth_data.get("access_token")
    if not token:
        # try login
        rl = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
        if rl.status_code == 200:
            token = rl.json().get("token") or rl.json().get("access_token")
    record("1b. Token captured", bool(token), f"token_len={len(token) if token else 0}")
    if not token:
        return summarize()
    s.headers["Authorization"] = f"Bearer {token}"

    # ------------------------------------------------------------------
    # Step 2: Create artist
    # ------------------------------------------------------------------
    r = s.post(f"{API}/artists", json={"name": "QuickAddTest Artist"}, timeout=15)
    record("2. POST /api/artists", r.status_code == 200, f"status={r.status_code}")
    if r.status_code != 200:
        print("Artist body:", r.text[:300])
        return summarize()
    artist_id = r.json()["id"]
    print(f"   artist_id = {artist_id}")

    # ------------------------------------------------------------------
    # Step 3: Create release (EP) with artist_id
    # ------------------------------------------------------------------
    r = s.post(f"{API}/collections", json={
        "title": "QuickAddTest EP",
        "collection_type": "EP",
        "artist_id": artist_id,
    }, timeout=15)
    record("3. POST /api/collections (EP)", r.status_code == 200, f"status={r.status_code}")
    if r.status_code != 200:
        print("Release body:", r.text[:300])
        return summarize()
    release_id = r.json()["id"]
    initial_release_count = r.json().get("track_count", 0)
    print(f"   release_id = {release_id}  initial track_count={initial_release_count}")

    # ------------------------------------------------------------------
    # Step 4: Create playlist (no artist_id)
    # ------------------------------------------------------------------
    r = s.post(f"{API}/collections", json={
        "title": "QuickAddTest Playlist",
        "collection_type": "Playlist",
    }, timeout=15)
    record("4. POST /api/collections (Playlist, no artist)", r.status_code == 200, f"status={r.status_code}")
    if r.status_code != 200:
        print("Playlist body:", r.text[:300])
        return summarize()
    playlist_id = r.json()["id"]
    initial_playlist_count = r.json().get("track_count", 0)
    print(f"   playlist_id = {playlist_id}  initial track_count={initial_playlist_count}")

    # ------------------------------------------------------------------
    # Step 5: Main test — POST /api/songs/quick-add WITH collection_id + playlist_ids
    # ------------------------------------------------------------------
    body = {
        "title": "Test Track 1",
        "lyrics": "",
        "style_prompt": "",
        "artist_id": artist_id,
        "authorship": "original",
        "collection_id": release_id,
        "playlist_ids": [playlist_id],
    }
    r = s.post(f"{API}/songs/quick-add", json=body, timeout=120)
    record("5. POST /api/songs/quick-add (with collection_id + playlist_ids)",
           r.status_code == 200, f"status={r.status_code}")
    if r.status_code != 200:
        print("quick-add body:", r.text[:500])
        return summarize()
    payload = r.json()
    song = payload.get("song", {})
    song_id = song.get("id")
    print(f"   song.id = {song_id}")
    print(f"   song.collection_id = {song.get('collection_id')}")
    print(f"   song.playlist_ids  = {song.get('playlist_ids')}")

    record("5a. response.song.collection_id == release_id",
           song.get("collection_id") == release_id,
           f"got={song.get('collection_id')}")
    record("5b. response.song.playlist_ids contains playlist_id",
           isinstance(song.get("playlist_ids"), list) and playlist_id in (song.get("playlist_ids") or []),
           f"got={song.get('playlist_ids')}")
    record("5c. response.song.artist_id matches",
           song.get("artist_id") == artist_id,
           f"got={song.get('artist_id')}")
    record("5d. response.song.title matches",
           song.get("title") == "Test Track 1",
           f"got={song.get('title')!r}")

    # ------------------------------------------------------------------
    # Step 6: GET /api/collections/{release_id} → track_count >= 1
    # ------------------------------------------------------------------
    r = s.get(f"{API}/collections/{release_id}", timeout=15)
    ok = r.status_code == 200
    if ok:
        tc = r.json().get("track_count", 0)
        ok = tc >= 1
        record("6. GET /api/collections/{release_id} track_count >= 1",
               ok, f"status=200 track_count={tc}")
    else:
        record("6. GET /api/collections/{release_id}", False, f"status={r.status_code}")

    # ------------------------------------------------------------------
    # Step 7: GET /api/collections/{playlist_id} → track_count >= 1
    # ------------------------------------------------------------------
    r = s.get(f"{API}/collections/{playlist_id}", timeout=15)
    ok = r.status_code == 200
    if ok:
        tc = r.json().get("track_count", 0)
        ok = tc >= 1
        record("7. GET /api/collections/{playlist_id} track_count >= 1",
               ok, f"status=200 track_count={tc}")
    else:
        record("7. GET /api/collections/{playlist_id}", False, f"status={r.status_code}")

    # ------------------------------------------------------------------
    # Step 8: GET /api/collections/{release_id}/songs → new song appears
    # ------------------------------------------------------------------
    r = s.get(f"{API}/collections/{release_id}/songs", timeout=15)
    if r.status_code == 200:
        songs = r.json()
        ids = [x.get("id") for x in (songs if isinstance(songs, list) else songs.get("songs", []))]
        record("8. GET /api/collections/{release_id}/songs contains new song",
               song_id in ids, f"status=200 song_in_list={song_id in ids} count={len(ids)}")
    else:
        record("8. GET /api/collections/{release_id}/songs", False, f"status={r.status_code}")

    # ------------------------------------------------------------------
    # Step 9: GET /api/collections/{playlist_id}/songs → new song appears
    # ------------------------------------------------------------------
    r = s.get(f"{API}/collections/{playlist_id}/songs", timeout=15)
    if r.status_code == 200:
        songs = r.json()
        ids = [x.get("id") for x in (songs if isinstance(songs, list) else songs.get("songs", []))]
        record("9. GET /api/collections/{playlist_id}/songs contains new song",
               song_id in ids, f"status=200 song_in_list={song_id in ids} count={len(ids)}")
    else:
        record("9. GET /api/collections/{playlist_id}/songs", False, f"status={r.status_code}")

    # ------------------------------------------------------------------
    # Step 10: Backward compatibility — quick-add WITHOUT collection_id/playlist_ids
    # ------------------------------------------------------------------
    body2 = {"title": "Test Track 2 (no collection)", "artist_id": artist_id}
    r = s.post(f"{API}/songs/quick-add", json=body2, timeout=60)
    record("10. POST /api/songs/quick-add (no collection/playlist)",
           r.status_code == 200, f"status={r.status_code}")
    song2_id = None
    if r.status_code == 200:
        song2 = r.json().get("song", {})
        song2_id = song2.get("id")
        record("10a. song.collection_id is null",
               song2.get("collection_id") in (None, ""),
               f"got={song2.get('collection_id')!r}")
        record("10b. song.playlist_ids is empty list",
               song2.get("playlist_ids") == [] or song2.get("playlist_ids") is None,
               f"got={song2.get('playlist_ids')!r}")
        record("10c. song.artist_id preserved",
               song2.get("artist_id") == artist_id,
               f"got={song2.get('artist_id')}")
    else:
        print("quick-add#2 body:", r.text[:300])

    # ------------------------------------------------------------------
    # Best-effort cleanup
    # ------------------------------------------------------------------
    print("\n--- Cleanup ---")
    for sid in [song_id, song2_id]:
        if sid:
            cr = s.delete(f"{API}/songs/{sid}", timeout=15)
            print(f"  DELETE /songs/{sid}: {cr.status_code}")
    for cid in [release_id, playlist_id]:
        cr = s.delete(f"{API}/collections/{cid}", timeout=15)
        print(f"  DELETE /collections/{cid}: {cr.status_code}")
    cr = s.delete(f"{API}/artists/{artist_id}", timeout=15)
    print(f"  DELETE /artists/{artist_id}: {cr.status_code}")

    return summarize()


def summarize():
    print("\n" + "=" * 70)
    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print(f"RESULT: {passed}/{total} checks passed")
    print("=" * 70)
    for name, ok, detail in results:
        flag = "PASS" if ok else "FAIL"
        print(f"  [{flag}] {name}  {detail}")
    return passed, total


if __name__ == "__main__":
    main()
