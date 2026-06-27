"""
Regression tests for the artist/release/playlist visibility bug.

Bug recap:
  Production dashboard showed 11 artists, but Artist Roster screen showed
  0 because /api/artists 500'd on Pydantic v2 strict validation when a
  single legacy/AI-generated doc had a malformed shape. The frontend
  dataStore caught the 500 and silently set `artists: []`.

Fix shape (per user spec):
  1. Read MongoDB doc
  2. Normalize known legacy/malformed shapes (preserving recoverable info)
  3. Validate against Pydantic
  4. Return if valid
  5. Only skip if still invalid after normalization
  6. Log id + sanitized error when skipped

These tests prove each clause.
"""

import datetime as _dt
import logging
import os
import sys
import uuid

import httpx
import pytest
from pymongo import MongoClient

# Make local backend importable (for direct imports of the normalizer)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from doc_normalizer import (  # noqa: E402
    normalize_artist_doc,
    normalize_collection_doc,
    safe_validate,
    safe_validate_many,
)
from server import Artist  # noqa: E402

# Sync mongo handle for test setup/teardown. FastAPI uses motor (async)
# bound to its own event loop, which doesn't compose well with sync test
# fixtures — sync pymongo over the same local mongo is the standard
# pattern here. Tests hit the live supervisor-managed backend on
# localhost:8001 over HTTP rather than going through TestClient (which
# would spin up a second motor instance on a different event loop).
from dotenv import load_dotenv  # noqa: E402
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))
_sync = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]

# Live local backend (managed by supervisor at 0.0.0.0:8001).
BACKEND_URL = os.environ.get("BACKEND_TEST_URL", "http://127.0.0.1:8001")


# ---------------------------------------------------------------------------
# Auth helper — register a fresh user per test, return its bearer token
# ---------------------------------------------------------------------------


def _make_test_user(client: httpx.Client) -> tuple[str, str, str]:
    email = f"reg_{uuid.uuid4().hex[:10]}@test.local"
    res = client.post("/api/auth/register", json={
        "email": email,
        "password": "test-pw-123!",
        "name": f"Tester {email}",
    })
    assert res.status_code == 200, f"register failed: {res.status_code} {res.text}"
    data = res.json()
    return data["access_token"], data["user"]["id"], email


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# Some tests need to plant docs directly in Mongo, bypassing the create
# endpoints (which apply Pydantic validation BEFORE write). This is how we
# simulate the legacy/malformed shapes that already exist in prod Atlas.
def _insert_artist_raw(doc: dict) -> None:
    _sync.artists.insert_one(doc)

def _insert_collection_raw(doc: dict) -> None:
    _sync.collections.insert_one(doc)

def _purge_for_user(user_id: str) -> None:
    """Tear-down helper: remove all test docs for this synthetic user."""
    _sync.artists.delete_many({"user_id": user_id})
    _sync.songs.delete_many({"user_id": user_id})
    _sync.collections.delete_many({"user_id": user_id})
    _sync.ideas.delete_many({"user_id": user_id})
    # also remove unrecoverable broken docs (no user_id, but with team_id)
    _sync.artists.delete_many({"team_id": user_id, "name": {"$regex": "^(Broken|ProvableBad)"}})
    _sync.users.delete_one({"id": user_id})


@pytest.fixture
def client():
    """httpx.Client against the live local backend (supervisor uvicorn on
    127.0.0.1:8001). We avoid TestClient because FastAPI + motor on a
    second event loop causes 'Event loop is closed' errors after the
    first request."""
    with httpx.Client(base_url=BACKEND_URL, timeout=15.0) as c:
        yield c


@pytest.fixture
def user(client):
    token, uid, email = _make_test_user(client)
    yield {"token": token, "id": uid, "email": email, "headers": _h(token)}
    # Tear down — keep the test DB tidy (sync, no event-loop dependency)
    _purge_for_user(uid)


def _base_artist_doc(user_id: str, **over) -> dict:
    """Minimum legal artist doc skeleton. Override fields to simulate bad shapes."""
    base = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "team_id": user_id,
        "name": "Default Test Artist",
        "bio": "",
        "unique_sound": "",
        "genres": [],
        "themes": [],
        "tone": "",
        "patterns": [],
        "branding": {"color_palette": [], "visual_style": "",
                     "aesthetic": "", "mood_keywords": []},
        "image_url": "",
        "profile_image": "",
        "character_images": [],
        "visual_brief": "",
        "visual_references": [],
        "suno_voice": "",
        "suno_exclusions": "",
        "notes": "",
        "saved_prompts": [],
        "is_private": False,
        "song_count": 0,
        "created_at": _dt.datetime.utcnow(),
        "updated_at": _dt.datetime.utcnow(),
    }
    base.update(over)
    return base


def _base_collection_doc(user_id: str, **over) -> dict:
    base = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "team_id": user_id,
        "title": "Default Test Release",
        "artist_id": None,
        "collection_type": "EP",
        "cover_image": "",
        "cover_image_url": "",
        "description": "",
        "release_date": None,
        "status": "in_progress",
        "notes": "",
        "is_private": False,
        "track_count": 0,
        "created_at": _dt.datetime.utcnow(),
        "updated_at": _dt.datetime.utcnow(),
    }
    base.update(over)
    return base


# ==========================================================================
# Test 1: clean artist documents return normally
# ==========================================================================


def test_1_clean_artists_return_normally(client, user):
    for i in range(3):
        _insert_artist_raw(_base_artist_doc(user["id"], name=f"Clean {i}")
        )

    res = client.get("/api/artists", headers=user["headers"])
    assert res.status_code == 200
    names = sorted([a["name"] for a in res.json()])
    assert names == ["Clean 0", "Clean 1", "Clean 2"]


# ==========================================================================
# Test 2: string branding is preserved through normalization (aesthetic field)
# ==========================================================================


def test_2_string_branding_preserved(client, user):
    doc = _base_artist_doc(
        user["id"], name="String Branding",
        branding="dark neon synth-noir aesthetic",
    )
    _insert_artist_raw(doc)

    res = client.get("/api/artists", headers=user["headers"])
    assert res.status_code == 200
    artists = res.json()
    a = next(a for a in artists if a["name"] == "String Branding")
    # The text MUST land in branding.aesthetic — not be silently dropped.
    assert a["branding"]["aesthetic"] == "dark neon synth-noir aesthetic"
    assert a["branding"]["color_palette"] == []


# ==========================================================================
# Test 3: object-based color palette values become strings
# ==========================================================================


def test_3_object_color_palette_becomes_strings(client, user):
    doc = _base_artist_doc(
        user["id"], name="Hex Objects",
        branding={
            "color_palette": [{"hex": "#fff"}, {"hex": "#000"}, {"name": "neon-pink"}],
            "visual_style": "noir",
            "aesthetic": "moody",
            "mood_keywords": ["dark", "ethereal"],
        },
    )
    _insert_artist_raw(doc)

    res = client.get("/api/artists", headers=user["headers"])
    assert res.status_code == 200
    a = next(a for a in res.json() if a["name"] == "Hex Objects")
    # Three values extracted from the dict items, in order.
    assert a["branding"]["color_palette"] == ["#fff", "#000", "neon-pink"]


# ==========================================================================
# Test 4: string genres/themes become one-item lists
# ==========================================================================


def test_4_string_genres_themes_become_one_item_list(client, user):
    doc = _base_artist_doc(
        user["id"], name="StringGenres",
        genres="hyperpop", themes="midnight drive",
    )
    _insert_artist_raw(doc)

    res = client.get("/api/artists", headers=user["headers"])
    assert res.status_code == 200
    a = next(a for a in res.json() if a["name"] == "StringGenres")
    assert a["genres"] == ["hyperpop"]
    assert a["themes"] == ["midnight drive"]


# ==========================================================================
# Test 5: object-based character_images entries preserve URL
# ==========================================================================


def test_5_character_image_objects_preserve_url(client, user):
    doc = _base_artist_doc(
        user["id"], name="CharObjects",
        character_images=[
            {"url": "https://cdn.example.com/a.jpg"},
            {"src": "https://cdn.example.com/b.png"},
            "https://cdn.example.com/c.gif",  # mixed: string also kept
        ],
    )
    _insert_artist_raw(doc)

    res = client.get("/api/artists", headers=user["headers"])
    assert res.status_code == 200
    a = next(a for a in res.json() if a["name"] == "CharObjects")
    assert a["character_images"] == [
        "https://cdn.example.com/a.jpg",
        "https://cdn.example.com/b.png",
        "https://cdn.example.com/c.gif",
    ]


# ==========================================================================
# Test 6: null list fields become empty lists
# ==========================================================================


def test_6_null_lists_become_empty(client, user):
    doc = _base_artist_doc(
        user["id"], name="NullLists",
        genres=None, themes=None, patterns=None,
        character_images=None, visual_references=None,
        saved_prompts=None,
    )
    _insert_artist_raw(doc)

    res = client.get("/api/artists", headers=user["headers"])
    assert res.status_code == 200
    a = next(a for a in res.json() if a["name"] == "NullLists")
    assert a["genres"] == []
    assert a["themes"] == []
    assert a["patterns"] == []
    assert a["character_images"] == []
    assert a["visual_references"] == []


# ==========================================================================
# Test 7: datetime release_date becomes ISO string
# ==========================================================================


def test_7_datetime_release_date_becomes_string(client, user):
    rd = _dt.datetime(2026, 7, 4, 12, 0, 0)
    doc = _base_collection_doc(
        user["id"], title="Summer EP", release_date=rd,
    )
    _insert_collection_raw(doc)

    res = client.get("/api/collections", headers=user["headers"])
    assert res.status_code == 200
    c = next(c for c in res.json() if c["title"] == "Summer EP")
    # ISO string round-trip
    assert isinstance(c["release_date"], str)
    assert c["release_date"].startswith("2026-07-04")


# ==========================================================================
# Test 8: an unrecoverable document does NOT cause a 500
# ==========================================================================


def test_8_unrecoverable_doc_does_not_500(client, user):
    """A doc with no user_id is unrecoverable (would break team scoping
    if we invented one). The list endpoint must still return 200 with
    the OTHER artists visible."""
    _insert_artist_raw(_base_artist_doc(user["id"], name="Good A")
    )
    _insert_artist_raw(_base_artist_doc(user["id"], name="Good B")
    )

    # Inject an unrecoverable doc INTO THIS USER'S TEAM scope. The team_id
    # MUST match so team_query picks it up; but we deliberately strip
    # user_id to keep it unrecoverable.
    broken = _base_artist_doc(user["id"], name="Broken")
    broken.pop("user_id", None)
    broken["team_id"] = user["id"]  # ensure team_query finds it
    _insert_artist_raw(broken)

    res = client.get("/api/artists", headers=user["headers"])
    assert res.status_code == 200, res.text
    names = sorted([a["name"] for a in res.json()])
    # The two good artists are visible; the unrecoverable one is skipped.
    assert "Good A" in names and "Good B" in names
    assert "Broken" not in names


# ==========================================================================
# Test 9: unrecoverable doc produces a warning containing its ID
# ==========================================================================


def test_9_unrecoverable_doc_logs_id_and_error(caplog):
    """`safe_validate_many` MUST emit a warning that contains both the
    document id and the field path that failed — so ops can locate it."""
    import logging
    caplog.set_level(logging.WARNING, logger="doc_normalizer")

    target_id = f"unrecoverable-{uuid.uuid4().hex[:8]}"
    bad_doc = {
        # name set so the normalizer has nothing to coerce; but
        # `user_id` missing is unrecoverable.
        "id": target_id,
        "name": "ProvableBad",
        # Intentionally NO user_id
    }

    objs, counts, skipped = safe_validate_many(
        Artist, [bad_doc], normalize_artist_doc, log_label="TEST"
    )

    assert objs == []
    assert counts["skipped"] == 1
    assert any(target_id in r.message for r in caplog.records), (
        f"warning should reference id={target_id}; got: {[r.message for r in caplog.records]}"
    )
    # Sanitized error must reference user_id field
    assert "user_id" in (skipped[0]["error"] or "")


# ==========================================================================
# Test 10: dashboard count matches visible roster when all docs are clean
#          or recoverable.
# ==========================================================================


def test_10_dashboard_matches_visible_roster_when_recoverable(client, user):
    # 3 clean + 1 with string branding (recoverable via normalization)
    for i in range(3):
        _insert_artist_raw(_base_artist_doc(user["id"], name=f"Clean {i}")
        )
    _insert_artist_raw(_base_artist_doc(
            user["id"], name="Recoverable", branding="dark moody aesthetic"
        )
    )

    stats = client.get("/api/dashboard/stats", headers=user["headers"]).json()
    artists = client.get("/api/artists", headers=user["headers"]).json()

    assert stats["artist_count"] == 4
    assert len(artists) == 4
    assert sorted(a["name"] for a in artists) == ["Clean 0", "Clean 1", "Clean 2", "Recoverable"]


# ==========================================================================
# Test 11: songs and ideas list endpoints remain unaffected
# ==========================================================================


def test_11_songs_and_ideas_endpoints_unaffected(client, user):
    # Create one of each via the regular API so we exercise the WRITE path
    # too, ensuring our changes didn't accidentally touch songs/ideas.
    s = client.post("/api/songs", json={"title": "Unaffected Song"}, headers=user["headers"])
    assert s.status_code == 200, s.text
    i = client.post("/api/ideas", json={"title": "Unaffected Idea", "content": "spark", "type": "spark"}, headers=user["headers"])
    assert i.status_code == 200, i.text

    songs = client.get("/api/songs", headers=user["headers"]).json()
    ideas = client.get("/api/ideas", headers=user["headers"]).json()
    assert any(x["title"] == "Unaffected Song" for x in songs)
    assert any(x["title"] == "Unaffected Idea" for x in ideas)


# ==========================================================================
# Test 12: diagnostic endpoint returns counts + sanitized records
# ==========================================================================


def test_12_diagnostic_returns_counts_and_sanitized_records(client, user):
    # 2 clean + 1 normalized (string branding) + 1 unrecoverable (no user_id)
    _insert_artist_raw(_base_artist_doc(user["id"], name="CleanA")
    )
    _insert_artist_raw(_base_artist_doc(user["id"], name="CleanB")
    )
    _insert_artist_raw(_base_artist_doc(user["id"], name="WithStrBrand",
                                            branding="dark")
    )
    bad = _base_artist_doc(user["id"], name="Broken")
    bad.pop("user_id")
    bad["team_id"] = user["id"]
    _insert_artist_raw(bad)

    res = client.get("/api/_diag/validate?collection=artists", headers=user["headers"])
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["collection"] == "artists"
    assert body["counts"]["total"] == 4
    assert body["counts"]["clean"] >= 2
    assert body["counts"]["normalized"] >= 1
    assert body["counts"]["skipped"] >= 1
    assert body["dashboard_count"] == 4
    assert body["visible_count"] == 3
    assert body["discrepancy"] == 1
    # Sanitization: no bio/notes/lyrics/image_url/branding details should appear in records
    for rec in body["records"]:
        assert set(rec.keys()) <= {"id", "display_name", "status", "error"}
        if rec["error"]:
            # Sanitized: contains field path / type, no raw doc contents
            assert "user_id" in rec["error"] or rec["error"].startswith(("validation", "field"))


# ==========================================================================
# Bonus: diagnostic endpoint rejects unauthenticated requests
# ==========================================================================


def test_diagnostic_requires_auth(client):
    res = client.get("/api/_diag/validate?collection=artists")
    assert res.status_code in (401, 403)
