"""
Backend test for the new Multi-Playlist Membership endpoints.
Tests the new playlist_ids field on Songs and the /add-songs and /songs/{id} endpoints.
"""
import os
import requests
import uuid
import sys
import json

BASE = "https://artist-catalog-pro.preview.emergentagent.com/api"

EMAIL = "exec@music.com"
PASSWORD = "password123"

passes = 0
fails = 0
failures = []

def check(cond, label, detail=""):
    global passes, fails
    if cond:
        passes += 1
        print(f"  PASS: {label}")
    else:
        fails += 1
        failures.append(f"{label} — {detail}")
        print(f"  FAIL: {label} — {detail}")

def auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def main():
    print("=" * 70)
    print("Multi-Playlist Membership Endpoints Test")
    print("=" * 70)

    # A) Login
    print("\n[A] Login")
    r = requests.post(f"{BASE}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    check(r.status_code == 200, "POST /auth/login 200", f"got {r.status_code} body={r.text[:200]}")
    if r.status_code != 200:
        return
    token = r.json()["access_token"]
    h = auth_headers(token)

    # B) Pick a collection
    print("\n[B] Find a collection (prefer 'Second Nature')")
    r = requests.get(f"{BASE}/collections", headers=h, timeout=30)
    check(r.status_code == 200, "GET /collections 200")
    colls = r.json()
    check(len(colls) > 0, f"At least one collection exists (found {len(colls)})")
    if not colls:
        return

    target_coll = None
    for c in colls:
        if "second nature" in c.get("title", "").lower():
            target_coll = c
            break
    if not target_coll:
        target_coll = colls[0]
    coll_id = target_coll["id"]
    print(f"  Using collection: '{target_coll['title']}' ({coll_id})")

    # C) Initial GET /collections/{coll_id}/songs
    print("\n[C] GET initial tracks for the playlist")
    r = requests.get(f"{BASE}/collections/{coll_id}/songs", headers=h, timeout=30)
    check(r.status_code == 200, "GET /collections/{id}/songs 200")
    initial_tracks = r.json()
    initial_track_ids = {s["id"] for s in initial_tracks}
    print(f"  Initial tracks in playlist: {len(initial_tracks)}")

    # Find a song that is NOT in this playlist (collection_id != coll_id and coll_id not in playlist_ids)
    print("\n  Finding a song NOT currently in this playlist...")
    r = requests.get(f"{BASE}/songs", headers=h, timeout=30)
    check(r.status_code == 200, "GET /songs 200")
    all_songs = r.json()
    check(len(all_songs) > 0, f"At least one song exists in catalog (found {len(all_songs)})")
    
    candidate_song = None
    for s in all_songs:
        if s["id"] in initial_track_ids:
            continue
        if s.get("collection_id") == coll_id:
            continue
        if coll_id in (s.get("playlist_ids") or []):
            continue
        # Found a candidate
        candidate_song = s
        break
    
    if not candidate_song:
        # Create a fresh draft song to test with
        print("  No suitable existing song — creating a fresh draft for the test...")
        body = {"title": f"Playlist Test Song {uuid.uuid4().hex[:6]}", "lyrics": "test lyrics", "status": "draft"}
        r = requests.post(f"{BASE}/songs", headers=h, json=body, timeout=30)
        check(r.status_code == 200, f"POST /songs (create draft) 200", f"got {r.status_code} body={r.text[:200]}")
        candidate_song = r.json()
    
    song_id = candidate_song["id"]
    print(f"  Test song: '{candidate_song['title']}' ({song_id})")
    print(f"  Original collection_id: {candidate_song.get('collection_id')}")
    print(f"  Original playlist_ids: {candidate_song.get('playlist_ids')}")
    
    # Verify the POST /api/songs response includes playlist_ids field (Pydantic default)
    if "playlist_ids" in candidate_song:
        check(isinstance(candidate_song.get("playlist_ids"), list), "Song has playlist_ids list field (Pydantic default)")
    
    original_collection_id = candidate_song.get("collection_id")

    # D) POST /add-songs
    print("\n[D] POST /collections/{id}/add-songs with the song")
    r = requests.post(f"{BASE}/collections/{coll_id}/add-songs", headers=h, json={"song_ids": [song_id]}, timeout=30)
    check(r.status_code == 200, "POST /add-songs 200", f"got {r.status_code} body={r.text[:200]}")
    if r.status_code == 200:
        body = r.json()
        check(body.get("ok") is True, "response.ok == true")
        check(body.get("added") == 1, f"response.added == 1 (got {body.get('added')})")

    # E) GET /songs/{song_id} — verify playlist_ids contains coll_id, collection_id unchanged
    print("\n[E] GET /songs/{song_id} after add")
    r = requests.get(f"{BASE}/songs/{song_id}", headers=h, timeout=30)
    check(r.status_code == 200, "GET /songs/{id} 200")
    s = r.json()
    check(coll_id in (s.get("playlist_ids") or []), f"playlist_ids contains coll_id (got {s.get('playlist_ids')})")
    check(s.get("collection_id") == original_collection_id, f"collection_id unchanged (got {s.get('collection_id')}, expected {original_collection_id})")

    # F) GET /collections/{coll_id}/songs — song appears
    print("\n[F] GET /collections/{id}/songs — song now appears")
    r = requests.get(f"{BASE}/collections/{coll_id}/songs", headers=h, timeout=30)
    check(r.status_code == 200, "GET /collections/{id}/songs 200")
    tracks = r.json()
    track_ids = {t["id"] for t in tracks}
    check(song_id in track_ids, f"song_id is in the playlist tracks (got {len(tracks)} tracks)")

    # G) Repeat POST /add-songs — idempotency
    print("\n[G] POST /add-songs again with same id — idempotent")
    r = requests.post(f"{BASE}/collections/{coll_id}/add-songs", headers=h, json={"song_ids": [song_id]}, timeout=30)
    check(r.status_code == 200, "POST /add-songs (2nd time) 200")
    body = r.json()
    check(body.get("ok") is True, "response.ok == true on 2nd call")
    # modified_count may be 0 because no document changed (already had coll_id in playlist_ids)
    print(f"  added count on 2nd call: {body.get('added')}")
    # Verify the song's playlist_ids does NOT have duplicates
    r = requests.get(f"{BASE}/songs/{song_id}", headers=h, timeout=30)
    s = r.json()
    pids = s.get("playlist_ids") or []
    count_coll = sum(1 for pid in pids if pid == coll_id)
    check(count_coll == 1, f"playlist_ids has coll_id exactly once after idempotent re-add (count={count_coll}, list={pids})")

    # H) DELETE /collections/{coll_id}/songs/{song_id}
    print("\n[H] DELETE /collections/{coll_id}/songs/{song_id}")
    r = requests.delete(f"{BASE}/collections/{coll_id}/songs/{song_id}", headers=h, timeout=30)
    check(r.status_code == 200, "DELETE /songs/{id} 200", f"got {r.status_code} body={r.text[:200]}")
    if r.status_code == 200:
        check(r.json().get("ok") is True, "response.ok == true")

    # I) Verify song no longer has coll_id in playlist_ids, but still exists & collection_id untouched
    print("\n[I] GET /songs/{song_id} after DELETE — playlist_ids no longer contains coll_id")
    r = requests.get(f"{BASE}/songs/{song_id}", headers=h, timeout=30)
    check(r.status_code == 200, "GET /songs/{id} 200 (song still exists in catalog)")
    s = r.json()
    check(coll_id not in (s.get("playlist_ids") or []), f"playlist_ids does NOT contain coll_id (got {s.get('playlist_ids')})")
    check(s.get("collection_id") == original_collection_id, f"collection_id still unchanged (got {s.get('collection_id')}, expected {original_collection_id})")

    # J) GET /collections/{coll_id}/songs — song no longer in tracks
    print("\n[J] GET /collections/{id}/songs — song no longer in tracks")
    r = requests.get(f"{BASE}/collections/{coll_id}/songs", headers=h, timeout=30)
    tracks = r.json()
    track_ids = {t["id"] for t in tracks}
    check(song_id not in track_ids, f"song_id NOT in playlist tracks anymore")

    # K) Edge case: song whose collection_id == coll_id, DELETE it from playlist
    print("\n[K] Edge case: song with collection_id == coll_id")
    print("    Create a fresh song with collection_id set to this collection, then DELETE from playlist")
    body = {"title": f"Primary Song {uuid.uuid4().hex[:6]}", "collection_id": coll_id, "status": "draft"}
    r = requests.post(f"{BASE}/songs", headers=h, json=body, timeout=30)
    check(r.status_code == 200, "POST /songs (with collection_id=coll_id) 200", f"got {r.status_code} body={r.text[:200]}")
    if r.status_code != 200:
        print(f"  Skipping K — could not create song")
    else:
        primary_song = r.json()
        primary_song_id = primary_song["id"]
        check(primary_song.get("collection_id") == coll_id, f"newly created song has collection_id == coll_id")
        check("playlist_ids" in primary_song and isinstance(primary_song["playlist_ids"], list), "newly created song has playlist_ids list (Pydantic default)")
        
        # GET the playlist tracks — should include it
        r = requests.get(f"{BASE}/collections/{coll_id}/songs", headers=h, timeout=30)
        tracks = r.json()
        track_ids = {t["id"] for t in tracks}
        check(primary_song_id in track_ids, "primary song appears in playlist via collection_id matching")
        
        # DELETE it from the playlist
        r = requests.delete(f"{BASE}/collections/{coll_id}/songs/{primary_song_id}", headers=h, timeout=30)
        check(r.status_code == 200, "DELETE primary song from playlist 200")
        
        # Verify: collection_id is now null, playlist_ids does not include coll_id
        r = requests.get(f"{BASE}/songs/{primary_song_id}", headers=h, timeout=30)
        check(r.status_code == 200, "GET song after DELETE — song still exists")
        s = r.json()
        check(s.get("collection_id") is None, f"collection_id set to null (got {s.get('collection_id')})")
        check(coll_id not in (s.get("playlist_ids") or []), f"playlist_ids does not contain coll_id (got {s.get('playlist_ids')})")
        
        # Song still in master catalog
        r = requests.get(f"{BASE}/songs", headers=h, timeout=30)
        all_now = r.json()
        check(primary_song_id in {x["id"] for x in all_now}, "song still in /songs master catalog after playlist removal")
        
        # Verify not in playlist tracks anymore
        r = requests.get(f"{BASE}/collections/{coll_id}/songs", headers=h, timeout=30)
        tracks_after = r.json()
        check(primary_song_id not in {t["id"] for t in tracks_after}, "primary song removed from playlist tracks")

    # L) Test 404 on non-existent collection id
    print("\n[L] 404 on non-existent collection id")
    bogus_id = str(uuid.uuid4())
    r = requests.post(f"{BASE}/collections/{bogus_id}/add-songs", headers=h, json={"song_ids": [song_id]}, timeout=30)
    check(r.status_code == 404, f"POST /add-songs on bogus coll_id returns 404 (got {r.status_code})")
    
    # DELETE on non-existent song_id (per spec: 404 if song doesn't exist)
    bogus_song_id = str(uuid.uuid4())
    r = requests.delete(f"{BASE}/collections/{coll_id}/songs/{bogus_song_id}", headers=h, timeout=30)
    check(r.status_code == 404, f"DELETE /songs/{{bogus}} returns 404 (got {r.status_code})")

    # ===== Regression checks =====
    print("\n[REGRESSION] CRUD checks")
    
    # Songs CRUD
    r = requests.post(f"{BASE}/songs", headers=h, json={"title": f"Regression Song {uuid.uuid4().hex[:4]}", "status": "draft"}, timeout=30)
    check(r.status_code == 200, "POST /songs (regression) 200")
    if r.status_code == 200:
        rs = r.json()
        check("playlist_ids" in rs and rs["playlist_ids"] == [], "POST /songs response includes empty playlist_ids (Pydantic default)")
        reg_song_id = rs["id"]
        # GET
        r = requests.get(f"{BASE}/songs/{reg_song_id}", headers=h, timeout=30)
        check(r.status_code == 200, "GET /songs/{id} (regression) 200")
        # PUT
        upd = {"title": rs["title"] + " (edited)", "status": "draft"}
        r = requests.put(f"{BASE}/songs/{reg_song_id}", headers=h, json=upd, timeout=30)
        check(r.status_code == 200, "PUT /songs/{id} (regression) 200")
        # DELETE
        r = requests.delete(f"{BASE}/songs/{reg_song_id}", headers=h, timeout=30)
        check(r.status_code == 200, "DELETE /songs/{id} (regression) 200")
    
    # Artists CRUD
    r = requests.post(f"{BASE}/artists", headers=h, json={"name": f"Regression Artist {uuid.uuid4().hex[:4]}"}, timeout=30)
    check(r.status_code == 200, "POST /artists (regression) 200")
    if r.status_code == 200:
        a_id = r.json()["id"]
        r = requests.get(f"{BASE}/artists/{a_id}", headers=h, timeout=30)
        check(r.status_code == 200, "GET /artists/{id} (regression) 200")
        r = requests.put(f"{BASE}/artists/{a_id}", headers=h, json={"name": "Regression Artist edited"}, timeout=30)
        check(r.status_code == 200, "PUT /artists/{id} (regression) 200")
        r = requests.delete(f"{BASE}/artists/{a_id}", headers=h, timeout=30)
        check(r.status_code == 200, "DELETE /artists/{id} (regression) 200")
    
    # Ideas CRUD
    r = requests.post(f"{BASE}/ideas", headers=h, json={"title": "Regression Idea", "content": "test"}, timeout=30)
    check(r.status_code == 200, "POST /ideas (regression) 200")
    if r.status_code == 200:
        i_id = r.json()["id"]
        r = requests.get(f"{BASE}/ideas/{i_id}", headers=h, timeout=30)
        check(r.status_code == 200, "GET /ideas/{id} (regression) 200")
        r = requests.delete(f"{BASE}/ideas/{i_id}", headers=h, timeout=30)
        check(r.status_code == 200, "DELETE /ideas/{id} (regression) 200")
    
    # Collections CRUD
    # Need a real artist_id for collection
    r = requests.get(f"{BASE}/artists", headers=h, timeout=30)
    artists = r.json()
    if artists:
        artist_id = artists[0]["id"]
        r = requests.post(f"{BASE}/collections", headers=h, json={"title": f"Regression Coll {uuid.uuid4().hex[:4]}", "artist_id": artist_id, "collection_type": "Playlist"}, timeout=30)
        check(r.status_code == 200, "POST /collections (regression) 200")
        if r.status_code == 200:
            new_coll = r.json()
            new_coll_id = new_coll["id"]
            r = requests.get(f"{BASE}/collections/{new_coll_id}", headers=h, timeout=30)
            check(r.status_code == 200, "GET /collections/{id} (regression) 200")
            # PUT to trigger track_count recount logic
            r = requests.put(f"{BASE}/collections/{new_coll_id}", headers=h, json={"title": new_coll["title"], "artist_id": artist_id, "collection_type": "Playlist"}, timeout=30)
            check(r.status_code == 200, "PUT /collections/{id} (regression — also re-counts via $or) 200")
            if r.status_code == 200:
                check("track_count" in r.json(), "PUT response has track_count field")
            r = requests.delete(f"{BASE}/collections/{new_coll_id}", headers=h, timeout=30)
            check(r.status_code == 200, "DELETE /collections/{id} (regression) 200")
    
    # Brainstorm endpoints sanity
    print("\n[REGRESSION] Brainstorm endpoints sanity")
    r = requests.get(f"{BASE}/collections/{coll_id}/brainstorm", headers=h, timeout=30)
    check(r.status_code == 200, "GET /collections/{id}/brainstorm 200")
    if r.status_code == 200:
        body = r.json()
        check("chat" in body and "song_starters" in body, "Brainstorm GET returns chat + song_starters")

    # PUT collection re-counts including playlist_ids
    print("\n[REGRESSION] Collection PUT track_count includes playlist_ids")
    # First add a song to the collection's playlist_ids
    r = requests.get(f"{BASE}/songs", headers=h, timeout=30)
    sample = [s for s in r.json() if s.get("collection_id") != coll_id and coll_id not in (s.get("playlist_ids") or [])]
    if sample:
        sid = sample[0]["id"]
        requests.post(f"{BASE}/collections/{coll_id}/add-songs", headers=h, json={"song_ids": [sid]}, timeout=30)
        # Now PUT the collection
        r = requests.put(f"{BASE}/collections/{coll_id}", headers=h, json={"title": target_coll["title"], "artist_id": target_coll.get("artist_id", ""), "collection_type": target_coll.get("collection_type", "EP")}, timeout=30)
        check(r.status_code == 200, "PUT /collections/{id} 200")
        if r.status_code == 200:
            new_count = r.json().get("track_count", 0)
            # Verify count matches GET /songs in collection
            r2 = requests.get(f"{BASE}/collections/{coll_id}/songs", headers=h, timeout=30)
            actual = len(r2.json())
            check(new_count == actual, f"PUT track_count {new_count} matches actual GET songs count {actual}")
        # Clean up — remove the song from playlist
        requests.delete(f"{BASE}/collections/{coll_id}/songs/{sid}", headers=h, timeout=30)

    # Summary
    print("\n" + "=" * 70)
    print(f"RESULTS: {passes} passed, {fails} failed (of {passes + fails} total)")
    print("=" * 70)
    if failures:
        print("\nFAILURES:")
        for f in failures:
            print(f"  - {f}")
    return fails == 0


if __name__ == "__main__":
    ok = main()
    sys.exit(0 if ok else 1)
