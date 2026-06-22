"""Live test against the local backend (proxied via REACT_APP_BACKEND_URL).

Verifies the llm_client shim fix for `name 'LlmChat' is not defined`.
"""
import os
import time
import requests

BASE = "https://artist-catalog-pro.preview.emergentagent.com"
API = f"{BASE}/api"


def section(name):
    print(f"\n{'='*60}\n{name}\n{'='*60}")


def assert_no_llmchat_error(resp, label):
    txt = resp.text.lower() if resp.text else ""
    if "name 'llmchat' is not defined" in txt or "nameerror" in txt and "llmchat" in txt:
        print(f"  ❌ {label}: NameError LlmChat present in response: {resp.text[:300]}")
        return False
    return True


results = []


def record(name, ok, detail=""):
    status = "✅" if ok else "❌"
    print(f"  {status} {name}{(' — '+detail) if detail else ''}")
    results.append((name, ok, detail))
    return ok


# ----------------------------------------------------------------------
section("1. Health check GET /api/")
r = requests.get(f"{API}/", timeout=15)
record(
    "GET /api/ returns non-500",
    r.status_code != 500,
    f"status={r.status_code} body={r.text[:120]}",
)
assert_no_llmchat_error(r, "GET /api/")


# ----------------------------------------------------------------------
section("2. Auth flow")
# Try login with seeded test user
login_payload = {"email": "test@example.com", "password": "password123"}
r = requests.post(f"{API}/auth/login", json=login_payload, timeout=15)
token = None
if r.status_code == 200:
    token = r.json().get("access_token")
    record("Login test@example.com", True, f"token len={len(token) if token else 0}")
else:
    # Try register
    reg_payload = {
        "email": "test@example.com",
        "password": "password123",
        "name": "Test User",
    }
    r2 = requests.post(f"{API}/auth/register", json=reg_payload, timeout=15)
    if r2.status_code in (200, 201):
        token = r2.json().get("access_token")
        record("Registered test@example.com", True)
    else:
        # Fall back to a fresh user
        ts = int(time.time())
        reg_payload = {
            "email": f"ai.fix.{ts}@example.com",
            "password": "password123",
            "name": "AI Fix Tester",
        }
        r3 = requests.post(f"{API}/auth/register", json=reg_payload, timeout=15)
        record(
            f"Fallback register fresh user ({reg_payload['email']})",
            r3.status_code in (200, 201),
            f"status={r3.status_code}",
        )
        if r3.status_code in (200, 201):
            token = r3.json().get("access_token")
            # Re-login to confirm
            rl = requests.post(
                f"{API}/auth/login",
                json={"email": reg_payload["email"], "password": "password123"},
                timeout=15,
            )
            record("Re-login fresh user", rl.status_code == 200, f"status={rl.status_code}")

if not token:
    print("FATAL: could not obtain token; aborting")
    raise SystemExit(1)

H = {"Authorization": f"Bearer {token}"}

# /auth/me
r = requests.get(f"{API}/auth/me", headers=H, timeout=15)
record("GET /api/auth/me works", r.status_code == 200, f"status={r.status_code}")


# ----------------------------------------------------------------------
section("3. AI endpoints — verify NO NameError 500")

# POST /api/ai/analyze
r = requests.post(
    f"{API}/ai/analyze",
    headers=H,
    json={"content": "These are test lyrics about the city at night", "analysis_type": "lyrics"},
    timeout=120,
)
no_err = assert_no_llmchat_error(r, "/api/ai/analyze")
record(
    "POST /api/ai/analyze NOT a NameError 500",
    no_err and (r.status_code != 500 or "llmchat" not in r.text.lower()),
    f"status={r.status_code}",
)
if r.status_code == 200:
    body = r.json()
    has_text = bool(body.get("analysis") or body.get("response") or body.get("text") or body)
    record("POST /api/ai/analyze 200 returned text", has_text, f"keys={list(body.keys())[:6]}")
    print(f"     preview: {str(body)[:200]}")
else:
    print(f"     non-200 body: {r.text[:300]}")

# POST /api/ai/suno-prompt?genre=trap&mood=moody&tempo=medium
r = requests.post(
    f"{API}/ai/suno-prompt",
    headers=H,
    params={"genre": "trap", "mood": "moody", "tempo": "medium"},
    timeout=120,
)
no_err = assert_no_llmchat_error(r, "/api/ai/suno-prompt")
record(
    "POST /api/ai/suno-prompt NOT a NameError 500",
    no_err and r.status_code != 500,
    f"status={r.status_code}",
)
if r.status_code == 200:
    body = r.json()
    sp = body.get("suno_prompt")
    record(
        "POST /api/ai/suno-prompt returns 'suno_prompt' string",
        isinstance(sp, str) and len(sp) > 0,
        f"len={len(sp) if sp else 0}",
    )
    print(f"     preview: {(sp or '')[:200]}")
else:
    print(f"     non-200 body: {r.text[:300]}")

# POST /api/ai/assistant
r = requests.post(
    f"{API}/ai/assistant",
    headers=H,
    json={"message": "hello", "session_id": "test"},
    timeout=120,
)
no_err = assert_no_llmchat_error(r, "/api/ai/assistant")
record(
    "POST /api/ai/assistant NOT a NameError 500",
    no_err and r.status_code != 500,
    f"status={r.status_code}",
)
if r.status_code == 200:
    body = r.json()
    resp = body.get("response")
    record(
        "POST /api/ai/assistant returns 'response' text",
        isinstance(resp, str) and len(resp) > 0,
        f"len={len(resp) if resp else 0}",
    )
    print(f"     preview: {(resp or '')[:200]}")
else:
    print(f"     non-200 body: {r.text[:300]}")


# ----------------------------------------------------------------------
section("4. Non-AI endpoint regression sanity")

# GET /api/artists
r = requests.get(f"{API}/artists", headers=H, timeout=15)
record("GET /api/artists 200", r.status_code == 200, f"status={r.status_code}")

# GET /api/songs
r = requests.get(f"{API}/songs", headers=H, timeout=15)
record("GET /api/songs 200", r.status_code == 200, f"status={r.status_code}")

# GET /api/collections
r = requests.get(f"{API}/collections", headers=H, timeout=15)
record("GET /api/collections 200", r.status_code == 200, f"status={r.status_code}")

# POST /api/artists (CRUD) — create then delete
ts = int(time.time())
r = requests.post(
    f"{API}/artists",
    headers=H,
    json={"name": f"AI Fix Artist {ts}", "genres": ["test"]},
    timeout=15,
)
created = r.status_code == 200
record("POST /api/artists 200", created, f"status={r.status_code}")
if created:
    aid = r.json().get("id")
    rd = requests.delete(f"{API}/artists/{aid}", headers=H, timeout=15)
    record("DELETE /api/artists/{id} 200", rd.status_code == 200, f"status={rd.status_code}")


# ----------------------------------------------------------------------
section("Summary")
passed = sum(1 for _, ok, _ in results if ok)
failed = sum(1 for _, ok, _ in results if not ok)
print(f"PASSED: {passed}/{len(results)}")
print(f"FAILED: {failed}")
for n, ok, d in results:
    if not ok:
        print(f"  FAIL: {n} — {d}")
