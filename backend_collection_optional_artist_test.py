"""
Regression test for CollectionCreate.artist_id being Optional[str] = None.
Verifies playlists (artist-agnostic) can be created + full CRUD + relationships still work.
"""
import requests
import uuid
import sys

BASE = "https://artist-catalog-pro.preview.emergentagent.com/api"
EMAIL = "exec@music.com"
PASSWORD = "password123"

results = []
def log(name, ok, detail=""):
    status = "PASS" if ok else "FAIL"
    results.append((name, ok, detail))
    print(f"[{status}] {name}{(' — ' + detail) if detail else ''}")

def main():
    # Login
    r = requests.post(f"{BASE}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    if r.status_code != 200:
        log("login", False, f"{r.status_code} {r.text[:200]}")
        return
    token = r.json()["access_token"]
    H = {"Authorization": f"Bearer {token}"}
    log("login", True)

    # Get an existing artist for valid-artist test
    r = requests.get(f"{BASE}/artists", headers=H, timeout=30)
    artists = r.json() if r.status_code == 200 else []
    valid_artist_id = artists[0]["id"] if artists else None
    valid_artist_name = artists[0]["name"] if artists else ""
    log("fetch artists for setup", bool(valid_artist_id), f"using {valid_artist_name} ({valid_artist_id})")

    created_ids = []

    # 1) POST /api/collections — Playlist, NO artist_id
    title_pl = f"Regression Playlist {uuid.uuid4().hex[:6]}"
    r = requests.post(f"{BASE}/collections", headers=H, json={
        "title": title_pl,
        "collection_type": "Playlist",
    }, timeout=30)
    ok = r.status_code == 200
    body = r.json() if ok else {}
    playlist_id = body.get("id")
    if playlist_id:
        created_ids.append(playlist_id)
    log("1. POST /collections (Playlist, no artist_id) -> 200", ok, f"status={r.status_code} body={r.text[:200] if not ok else 'id=' + str(playlist_id)}")
    log("   artist_id is null on response", body.get("artist_id") in (None, ""), f"got {body.get('artist_id')!r}")
    log("   collection_type=Playlist", body.get("collection_type") == "Playlist", f"got {body.get('collection_type')!r}")

    # 2) POST /api/collections — EP WITH valid artist_id
    if valid_artist_id:
        title_ep = f"Regression EP {uuid.uuid4().hex[:6]}"
        r = requests.post(f"{BASE}/collections", headers=H, json={
            "title": title_ep,
            "collection_type": "EP",
            "artist_id": valid_artist_id,
        }, timeout=30)
        ok = r.status_code == 200
        body2 = r.json() if ok else {}
        ep_id = body2.get("id")
        if ep_id:
            created_ids.append(ep_id)
        log("2. POST /collections (EP, with artist_id) -> 200", ok, f"status={r.status_code}")
        log("   artist_id preserved", body2.get("artist_id") == valid_artist_id, f"got {body2.get('artist_id')!r}")
    else:
        log("2. POST /collections (EP w/ artist_id)", False, "skipped, no artist available")

    # 3) POST /api/collections — EP WITHOUT artist_id (backend should accept since model permits)
    r = requests.post(f"{BASE}/collections", headers=H, json={
        "title": f"Regression Bad-EP {uuid.uuid4().hex[:6]}",
        "collection_type": "EP",
    }, timeout=30)
    ok = r.status_code == 200
    body3 = r.json() if ok else {}
    bad_ep_id = body3.get("id")
    if bad_ep_id:
        created_ids.append(bad_ep_id)
    log("3. POST /collections (EP, no artist_id) -> 200 at backend", ok, f"status={r.status_code} body={r.text[:200] if not ok else ''}")
    log("   artist_id is null", body3.get("artist_id") in (None, ""), f"got {body3.get('artist_id')!r}")

    # 4) GET /api/collections — includes the new playlist
    r = requests.get(f"{BASE}/collections", headers=H, timeout=30)
    ok = r.status_code == 200
    listing = r.json() if ok else []
    log("4. GET /collections -> 200", ok, f"status={r.status_code}, count={len(listing)}")
    if playlist_id:
        found = next((c for c in listing if c.get("id") == playlist_id), None)
        log("   new playlist appears in list", found is not None)
        if found:
            log("   listed playlist artist_id is null", found.get("artist_id") in (None, ""), f"got {found.get('artist_id')!r}")

    # 5) GET /api/collections/{playlist_id}
    if playlist_id:
        r = requests.get(f"{BASE}/collections/{playlist_id}", headers=H, timeout=30)
        ok = r.status_code == 200
        body = r.json() if ok else {}
        log("5. GET /collections/{playlist_id} -> 200", ok, f"status={r.status_code}")
        log("   artist_id is null on detail", body.get("artist_id") in (None, ""), f"got {body.get('artist_id')!r}")
        log("   title matches", body.get("title") == title_pl)

    # 6) PUT /api/collections/{playlist_id} with artist_id: null
    if playlist_id:
        r = requests.put(f"{BASE}/collections/{playlist_id}", headers=H, json={
            "title": title_pl + " (updated)",
            "collection_type": "Playlist",
            "artist_id": None,
            "description": "updated via regression test",
        }, timeout=30)
        ok = r.status_code == 200
        body = r.json() if ok else {}
        log("6. PUT /collections/{playlist_id} {artist_id: null} -> 200", ok, f"status={r.status_code} body={r.text[:200] if not ok else ''}")
        log("   artist_id stays null after PUT", body.get("artist_id") in (None, ""), f"got {body.get('artist_id')!r}")
        log("   description updated", body.get("description") == "updated via regression test")
        log("   track_count present", "track_count" in body, f"got {body.get('track_count')!r}")

    # 7) GET /api/collections/{playlist_id}/songs — should work even when collection has no artist
    if playlist_id:
        r = requests.get(f"{BASE}/collections/{playlist_id}/songs", headers=H, timeout=30)
        ok = r.status_code == 200
        log("7. GET /collections/{playlist_id}/songs -> 200", ok, f"status={r.status_code}")
        if ok:
            log("   returns a list (possibly empty)", isinstance(r.json(), list), f"type={type(r.json()).__name__}")

    # 8) POST /api/collections/{playlist_id}/add-songs — works on artist-less playlists
    # Need at least one song. Fetch songs.
    r = requests.get(f"{BASE}/songs", headers=H, timeout=30)
    songs = r.json() if r.status_code == 200 else []
    song_ids_to_add = [s["id"] for s in songs[:2]] if songs else []
    if playlist_id and song_ids_to_add:
        r = requests.post(f"{BASE}/collections/{playlist_id}/add-songs", headers=H, json={
            "song_ids": song_ids_to_add,
        }, timeout=30)
        ok = r.status_code == 200
        body = r.json() if ok else {}
        log("8. POST /collections/{playlist_id}/add-songs -> 200", ok, f"status={r.status_code} body={r.text[:200]}")
        log("   response ok=true", body.get("ok") is True)
        log("   added field present", "added" in body, f"added={body.get('added')!r}")

        # Verify by GET songs
        r2 = requests.get(f"{BASE}/collections/{playlist_id}/songs", headers=H, timeout=30)
        if r2.status_code == 200:
            returned_ids = [s["id"] for s in r2.json()]
            all_present = all(sid in returned_ids for sid in song_ids_to_add)
            log("   added songs visible in /songs list", all_present, f"expected {song_ids_to_add}, got {returned_ids[:5]}...")
    else:
        log("8. POST /collections/{playlist_id}/add-songs", False, f"skipped (playlist_id={playlist_id}, songs available={len(songs)})")

    # Cleanup created collections
    for cid in created_ids:
        try:
            requests.delete(f"{BASE}/collections/{cid}", headers=H, timeout=15)
        except Exception:
            pass

    # Summary
    print("\n" + "=" * 60)
    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print(f"RESULT: {passed}/{total} passed")
    failed = [n for n, ok, _ in results if not ok]
    if failed:
        print("FAILED:")
        for n in failed:
            print(f"  - {n}")
        sys.exit(1)
    sys.exit(0)

if __name__ == "__main__":
    main()
