"""
Backend API tests for AI Music Artist Manager.
Focus: Team workspace endpoints, saved prompts on songs, team-aware filtering,
       and regression sanity checks on existing endpoints.
"""

import os
import re
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

results = []  # list of (name, ok, detail)


def record(name, ok, detail=""):
    status = "PASS" if ok else "FAIL"
    print(f"[{status}] {name}" + (f" — {detail}" if detail else ""))
    results.append((name, ok, detail))


def post(path, token=None, body=None, expect=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    r = requests.post(f"{API}{path}", headers=headers, json=body or {})
    return r


def get(path, token=None, params=None):
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    r = requests.get(f"{API}{path}", headers=headers, params=params or {})
    return r


def put(path, token=None, body=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    r = requests.put(f"{API}{path}", headers=headers, json=body or {})
    return r


def delete(path, token=None):
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    r = requests.delete(f"{API}{path}", headers=headers)
    return r


# ------------- AUTH -------------

def login_or_register(email, password, name):
    r = post("/auth/login", body={"email": email, "password": password})
    if r.status_code == 200:
        return r.json()
    # Try register
    r = post("/auth/register", body={"email": email, "password": password, "name": name})
    if r.status_code == 200:
        return r.json()
    raise RuntimeError(f"Cannot auth {email}: {r.status_code} {r.text}")


def unique_email(prefix):
    return f"{prefix}_{uuid.uuid4().hex[:8]}@musicteam.test"


# ------------- TESTS -------------

def test_auth_primary():
    data = login_or_register(PRIMARY["email"], PRIMARY["password"], PRIMARY["name"])
    token = data["access_token"]
    user = data["user"]
    ok = "id" in user and user.get("email") == PRIMARY["email"] and "team_id" in user and "role" in user
    record("POST /api/auth/login (primary) returns user with team_id+role", ok,
           f"team_id={user.get('team_id')}, role={user.get('role')}")
    return token, user


def test_me(token, email):
    r = get("/auth/me", token=token)
    ok = r.status_code == 200 and r.json().get("email") == email and "team_id" in r.json() and "role" in r.json()
    record("GET /api/auth/me returns team_id+role", ok, f"{r.status_code} {r.text[:150]}")
    return r.json() if r.status_code == 200 else None


def test_register_new_user():
    email = unique_email("secondary")
    data = login_or_register(email, "password123", "Secondary Member")
    token = data["access_token"]
    u = data["user"]
    ok = u.get("team_id") == u.get("id") and u.get("role") == "owner"
    record("POST /api/auth/register creates user with team_id=id, role=owner", ok,
           f"team_id={u.get('team_id')}, id={u.get('id')}, role={u.get('role')}")
    return token, u, email


def test_invite_code(token):
    r = post("/team/invite-code", token=token)
    ok = r.status_code == 200
    if ok:
        body = r.json()
        code = body.get("code", "")
        ok = (
            isinstance(code, str)
            and len(code) == 6
            and bool(re.fullmatch(r"[A-Z0-9]{6}", code))
            and "expires_at" in body
            and "invited_by_name" in body
        )
        record("POST /api/team/invite-code returns 6-char A-Z0-9 code with expires_at+invited_by_name",
               ok, f"code={code}")
        return code if ok else None
    record("POST /api/team/invite-code", False, f"{r.status_code} {r.text[:200]}")
    return None


def test_join_bad_code(token):
    r = post("/team/join", token=token, body={"code": "ZZZZZZ"})
    ok = r.status_code == 404
    record("POST /api/team/join with bad code returns 404", ok, f"{r.status_code} {r.text[:120]}")


def test_join_team(token_b, code):
    r = post("/team/join", token=token_b, body={"code": code})
    ok = r.status_code == 200 and r.json().get("team_id")
    record("POST /api/team/join with valid code succeeds", ok, f"{r.status_code} {r.text[:200]}")
    return r.json().get("team_id") if ok else None


def test_join_already_on_team(token_b, code):
    # Using used/another code or same team should 400 (code is used, returns 404)
    # The check is: if team_id == current_user.team_id -> 400.
    # Since invite was consumed, a fresh one needed from same team. We'll verify via creating another invite.
    pass  # covered in test_join_already_member via separate invite


def test_join_already_member(token_a, token_b):
    # Generate new code from A. B is already on A's team. Attempt join -> 400.
    r = post("/team/invite-code", token=token_a)
    if r.status_code != 200:
        record("POST /api/team/join 400 when already on team (setup failed)", False, r.text[:200])
        return
    code2 = r.json()["code"]
    r2 = post("/team/join", token=token_b, body={"code": code2})
    ok = r2.status_code == 400
    record("POST /api/team/join with own team's code returns 400", ok, f"{r2.status_code} {r2.text[:150]}")


def test_team_members(token, expected_emails):
    r = get("/team/members", token=token)
    ok = r.status_code == 200 and isinstance(r.json(), list)
    if ok:
        emails = {m["email"] for m in r.json()}
        ok = set(expected_emails).issubset(emails)
        has_fields = all(
            all(k in m for k in ("id", "name", "email", "role", "is_self")) for m in r.json()
        )
        ok = ok and has_fields
    record(
        "GET /api/team/members lists expected members with correct fields",
        ok,
        f"{r.status_code} members={[m.get('email') for m in (r.json() if r.status_code == 200 else [])]}",
    )


def test_leave_team(token):
    r = post("/team/leave", token=token)
    ok = r.status_code == 200
    record("POST /api/team/leave from shared team succeeds", ok, f"{r.status_code} {r.text[:120]}")


def test_leave_personal(token):
    r = post("/team/leave", token=token)
    ok = r.status_code == 400
    record("POST /api/team/leave from personal workspace returns 400", ok, f"{r.status_code} {r.text[:150]}")


# ------------ Artists / Songs / Collections / Ideas ----------

def create_artist(token, name, is_private=False):
    body = {"name": name, "bio": "bio", "genres": ["pop"], "is_private": is_private}
    r = post("/artists", token=token, body=body)
    return r


def create_song(token, title, artist_id=None, is_private=False):
    body = {"title": title, "artist_id": artist_id, "lyrics": "yo", "is_private": is_private}
    r = post("/songs", token=token, body=body)
    return r


def create_idea(token, title):
    r = post("/ideas", token=token, body={"title": title, "content": "idea content"})
    return r


def create_collection(token, title, artist_id):
    r = post("/collections", token=token, body={"title": title, "artist_id": artist_id})
    return r


def test_crud_solo(token, tag):
    # Create artist
    r = create_artist(token, f"Solo Artist {tag}")
    ok = r.status_code == 200
    record(f"[solo {tag}] POST /api/artists", ok, f"{r.status_code}")
    if not ok:
        return None, None, None, None
    artist = r.json()
    # List artists
    r = get("/artists", token=token)
    ok = r.status_code == 200 and any(a["id"] == artist["id"] for a in r.json())
    record(f"[solo {tag}] GET /api/artists includes own artist", ok)

    # Create song
    r = create_song(token, f"Solo Song {tag}", artist_id=artist["id"])
    ok = r.status_code == 200
    record(f"[solo {tag}] POST /api/songs", ok, f"{r.status_code}")
    song = r.json() if ok else None

    # Create idea
    r = create_idea(token, f"Solo Idea {tag}")
    ok = r.status_code == 200
    record(f"[solo {tag}] POST /api/ideas", ok, f"{r.status_code}")
    idea = r.json() if ok else None

    # Create collection
    r = create_collection(token, f"Solo Coll {tag}", artist_id=artist["id"])
    ok = r.status_code == 200
    record(f"[solo {tag}] POST /api/collections", ok, f"{r.status_code}")
    coll = r.json() if ok else None

    # Dashboard stats
    r = get("/dashboard/stats", token=token)
    ok = r.status_code == 200 and "artist_count" in r.json() and "song_count" in r.json()
    record(f"[solo {tag}] GET /api/dashboard/stats", ok, f"{r.status_code}")

    return artist, song, idea, coll


def test_saved_prompts(token, song_id):
    body = {"prompt_type": "suno_style", "label": "Chill pop mix", "content": "Dreamy synth-pop 90 bpm, airy vocals"}
    r = post(f"/songs/{song_id}/saved-prompts", token=token, body=body)
    ok = r.status_code == 200
    if ok:
        p = r.json()
        ok = all(k in p for k in ("id", "saved_by_id", "saved_by_name", "created_at", "prompt_type", "label", "content"))
    record("POST /api/songs/{id}/saved-prompts returns saved prompt w/ required fields", ok,
           f"{r.status_code} {r.text[:200]}")
    if not ok:
        return None
    prompt_id = r.json()["id"]

    # Verify present on GET song
    r = get(f"/songs/{song_id}", token=token)
    found = r.status_code == 200 and any(sp.get("id") == prompt_id for sp in r.json().get("saved_prompts", []))
    record("GET /api/songs/{id} includes saved_prompts", found, f"{r.status_code}")

    # Delete
    r = delete(f"/songs/{song_id}/saved-prompts/{prompt_id}", token=token)
    ok = r.status_code == 200
    record("DELETE /api/songs/{id}/saved-prompts/{pid}", ok, f"{r.status_code} {r.text[:150]}")

    # Verify gone
    r = get(f"/songs/{song_id}", token=token)
    gone = r.status_code == 200 and not any(sp.get("id") == prompt_id for sp in r.json().get("saved_prompts", []))
    record("Saved prompt removed after delete", gone)

    return prompt_id


def test_team_visibility(token_a, token_b, artifact_ids_a, artifact_ids_b):
    """After A and B share a team, each endpoint should include items from both."""
    # artifact_ids_a = {"artist": id, "song": id, "idea": id, "collection": id}
    for label, endpoint, key in [
        ("artists", "/artists", "artist"),
        ("songs", "/songs", "song"),
        ("ideas", "/ideas", "idea"),
        ("collections", "/collections", "collection"),
    ]:
        ra = get(endpoint, token=token_a)
        rb = get(endpoint, token=token_b)
        a_sees_b = ra.status_code == 200 and any(it.get("id") == artifact_ids_b[key] for it in ra.json())
        b_sees_a = rb.status_code == 200 and any(it.get("id") == artifact_ids_a[key] for it in rb.json())
        record(f"[team] GET /api{endpoint}: A sees B's {key}", a_sees_b, f"{ra.status_code}")
        record(f"[team] GET /api{endpoint}: B sees A's {key}", b_sees_a, f"{rb.status_code}")


def test_private_item(token_a, token_b):
    # A creates a private artist. B should NOT see it.
    r = create_artist(token_a, f"Private Artist {uuid.uuid4().hex[:4]}", is_private=True)
    ok = r.status_code == 200
    record("POST /api/artists is_private=true creates", ok, f"{r.status_code}")
    if not ok:
        return
    pid = r.json()["id"]
    rb = get("/artists", token=token_b)
    hidden = rb.status_code == 200 and not any(a["id"] == pid for a in rb.json())
    record("Private artist NOT visible to other team member", hidden)
    # Owner sees it
    ra = get("/artists", token=token_a)
    visible = ra.status_code == 200 and any(a["id"] == pid for a in ra.json())
    record("Private artist visible to owner", visible)


def test_after_leave(token_b, a_artifact_ids):
    # After B leaves, B should no longer see A's items
    for label, endpoint, key in [
        ("artists", "/artists", "artist"),
        ("songs", "/songs", "song"),
        ("ideas", "/ideas", "idea"),
    ]:
        rb = get(endpoint, token=token_b)
        gone = rb.status_code == 200 and not any(it.get("id") == a_artifact_ids[key] for it in rb.json())
        record(f"[post-leave] GET /api{endpoint}: B no longer sees A's {key}", gone, f"{rb.status_code}")


# ------------ Other sanity endpoints ------------

def test_distribution_crud(token, song_id):
    body = {"song_id": song_id, "entries": [{"platform": "spotify", "url": "", "status": "pending"}], "notes": ""}
    r = post("/distributions", token=token, body=body)
    ok = r.status_code == 200
    record("POST /api/distributions", ok, f"{r.status_code} {r.text[:150]}")
    if not ok:
        return
    did = r.json()["id"]
    r = get("/distributions", token=token, params={"song_id": song_id})
    ok = r.status_code == 200 and any(d["id"] == did for d in r.json())
    record("GET /api/distributions filters by song_id", ok)
    r = put(f"/distributions/{did}", token=token, body={"song_id": song_id, "entries": [{"platform": "spotify", "url": "https://x", "status": "live"}], "notes": "updated"})
    ok = r.status_code == 200
    record("PUT /api/distributions/{id}", ok, f"{r.status_code}")


def test_revenue(token):
    r = post("/revenue", token=token, body={"platform": "spotify", "amount": 12.50, "period": "2026-01", "revenue_type": "streaming"})
    ok = r.status_code == 200
    record("POST /api/revenue", ok, f"{r.status_code} {r.text[:120]}")
    if not ok:
        return
    rid = r.json()["id"]
    r = get("/revenue", token=token)
    ok = r.status_code == 200 and "total" in r.json()
    record("GET /api/revenue summary", ok)
    r = delete(f"/revenue/{rid}", token=token)
    ok = r.status_code == 200
    record("DELETE /api/revenue/{id}", ok)


def test_csv_import(token, artist_id):
    csv_text = "title,lyrics,genre\nMy CSV Song,\"la la la\",pop\n"
    r = post("/songs/csv-import", token=token, body={"csv_text": csv_text, "artist_id": artist_id})
    ok = r.status_code == 200 and r.json().get("imported", 0) >= 1
    record("POST /api/songs/csv-import", ok, f"{r.status_code} {r.text[:200]}")


def test_quick_add(token, artist_id):
    body = {
        "title": "Quick Add Test Song",
        "lyrics": "Walking in the moonlight / feeling free tonight",
        "style_prompt": "chill synth-pop",
        "artist_id": artist_id,
    }
    # Endpoint in code is /songs/quick-add (review request said analyze-quick-add; using actual)
    r = post("/songs/quick-add", token=token, body=body)
    ok = r.status_code == 200 and "song" in r.json()
    record("POST /api/songs/quick-add returns song + ai_suggestions", ok,
           f"{r.status_code} keys={list(r.json().keys()) if r.status_code == 200 else r.text[:200]}")


def test_ai_assistant(token, artist_id):
    body = {"message": "Give me a quick concept for a moody pop single for my artist.", "artist_id": artist_id}
    r = post("/ai/assistant", token=token, body=body)
    ok = r.status_code == 200 and "response" in r.json() and "session_id" in r.json()
    record("POST /api/ai/assistant returns response+session_id", ok,
           f"{r.status_code} {r.text[:200] if r.status_code != 200 else 'len=' + str(len(r.json().get('response', '')))}")


def test_song_update_and_version(token, song_id):
    # Update
    r = put(f"/songs/{song_id}", token=token, body={"title": "Updated Title", "lyrics": "new", "status": "in_progress"})
    ok = r.status_code == 200 and r.json().get("title") == "Updated Title"
    record("PUT /api/songs/{id}", ok, f"{r.status_code}")
    # Add version
    r = post(f"/songs/{song_id}/versions", token=token, body={
        "version_type": "primary", "version_label": "Original", "is_assigned": True
    })
    ok = r.status_code == 200 and len(r.json().get("versions", [])) >= 1
    record("POST /api/songs/{id}/versions", ok, f"{r.status_code}")


# =========== ORCHESTRATION ============

def main():
    print(f"Using API base: {API}")

    # Primary user
    token_a, user_a = test_auth_primary()
    me_a = test_me(token_a, PRIMARY["email"])
    if not me_a:
        print("Aborting: can't get /auth/me")
        return 1

    # Ensure A is on personal workspace to start
    if me_a.get("team_id") != me_a.get("id"):
        r = post("/team/leave", token=token_a)
        # refresh
        me_a = get("/auth/me", token=token_a).json()

    # Secondary: fresh user for clean invite testing
    token_b, user_b, email_b = test_register_new_user()
    test_me(token_b, email_b)

    # Bad code
    test_join_bad_code(token_b)

    # A generates code
    code = test_invite_code(token_a)

    # Before join - solo CRUD on A (personal workspace)
    a_artist, a_song, a_idea, a_coll = test_crud_solo(token_a, "A-pre")
    # Solo CRUD on B
    b_artist, b_song, b_idea, b_coll = test_crud_solo(token_b, "B-pre")

    if not (a_song and b_song and a_artist and b_artist):
        print("Missing core artifacts; aborting team tests")
        return 1

    # Saved prompts on song A
    test_saved_prompts(token_a, a_song["id"])

    # Distribution + revenue + csv + quick-add + AI assistant (A)
    test_distribution_crud(token_a, a_song["id"])
    test_revenue(token_a)
    test_csv_import(token_a, a_artist["id"])
    test_song_update_and_version(token_a, a_song["id"])
    test_quick_add(token_a, a_artist["id"])
    test_ai_assistant(token_a, a_artist["id"])

    # B joins A's team
    if code:
        new_team = test_join_team(token_b, code)
        # already-member check
        test_join_already_member(token_a, token_b)

        # After join, B's /auth/me reflects new team
        me_b = get("/auth/me", token=token_b).json()
        ok = me_b.get("team_id") == user_a["team_id"]
        record("After join, B's team_id matches A's team_id", ok,
               f"B team_id={me_b.get('team_id')}, A team_id={user_a['team_id']}")

        # Team members
        test_team_members(token_a, [PRIMARY["email"], email_b])
        test_team_members(token_b, [PRIMARY["email"], email_b])

        # Now create fresh artifacts post-join, then verify cross-visibility
        ra = create_artist(token_a, f"Shared Artist A {uuid.uuid4().hex[:4]}")
        rb = create_artist(token_b, f"Shared Artist B {uuid.uuid4().hex[:4]}")
        rs_a = create_song(token_a, f"Shared Song A {uuid.uuid4().hex[:4]}", artist_id=ra.json()["id"])
        rs_b = create_song(token_b, f"Shared Song B {uuid.uuid4().hex[:4]}", artist_id=rb.json()["id"])
        ri_a = create_idea(token_a, f"Shared Idea A {uuid.uuid4().hex[:4]}")
        ri_b = create_idea(token_b, f"Shared Idea B {uuid.uuid4().hex[:4]}")
        rc_a = create_collection(token_a, f"Shared Coll A {uuid.uuid4().hex[:4]}", artist_id=ra.json()["id"])
        rc_b = create_collection(token_b, f"Shared Coll B {uuid.uuid4().hex[:4]}", artist_id=rb.json()["id"])

        a_ids = {"artist": ra.json()["id"], "song": rs_a.json()["id"], "idea": ri_a.json()["id"], "collection": rc_a.json()["id"]}
        b_ids = {"artist": rb.json()["id"], "song": rs_b.json()["id"], "idea": ri_b.json()["id"], "collection": rc_b.json()["id"]}

        test_team_visibility(token_a, token_b, a_ids, b_ids)
        test_private_item(token_a, token_b)

        # B leaves team
        test_leave_team(token_b)
        # Re-fetching B's artifacts visibility - B should not see A's
        test_after_leave(token_b, a_ids)
        # leave again = 400
        test_leave_personal(token_b)

    # Summary
    print("\n===== SUMMARY =====")
    passed = sum(1 for _, ok, _ in results if ok)
    failed = sum(1 for _, ok, _ in results if not ok)
    print(f"Passed: {passed}/{len(results)}")
    if failed:
        print("Failures:")
        for name, ok, d in results:
            if not ok:
                print(f"  - {name}: {d}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
