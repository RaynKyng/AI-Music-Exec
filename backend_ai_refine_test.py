"""Test suite for POST /api/artists/ai-refine endpoint."""
import os
import sys
import json
import time
import requests

BASE = "https://artist-catalog-pro.preview.emergentagent.com/api"
EMAIL = "exec@music.com"
PASSWORD = "password123"

results = []

def record(name, passed, detail=""):
    status = "PASS" if passed else "FAIL"
    results.append((status, name, detail))
    print(f"[{status}] {name}" + (f" — {detail}" if detail else ""))

def login():
    r = requests.post(f"{BASE}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]

def main():
    token = login()
    H = {"Authorization": f"Bearer {token}"}
    record("Login exec@music.com", True)

    # Step 2: ai-generate
    gen_body = {
        "location": "Baltimore, MD",
        "influences": ["JID", "Damian Marley"],
        "genres": ["hip-hop"],
        "vibe": "",
    }
    print("\n--- Calling /artists/ai-generate (20-40s)... ---")
    t0 = time.time()
    r = requests.post(f"{BASE}/artists/ai-generate", json=gen_body, headers=H, timeout=120)
    print(f"ai-generate took {time.time()-t0:.1f}s, status={r.status_code}")
    if r.status_code != 200:
        record("ai-generate returns 200", False, f"status={r.status_code} body={r.text[:300]}")
        return
    profile = r.json()
    record("ai-generate returns 200", True)
    top_keys = set(profile.keys())
    print(f"Generated profile top-level keys: {sorted(top_keys)}")
    record("Generated profile has primary_name", "primary_name" in profile, f"primary_name={profile.get('primary_name')!r}")
    record("Generated profile has synthesized_profile", "synthesized_profile" in profile)
    record("Generated profile has bio", "bio" in profile)
    record("Generated profile has branding", "branding" in profile)

    # Step 3: ai-refine
    print("\n--- Calling /artists/ai-refine (20-40s)... ---")
    refine_body = {
        "current_profile": profile,
        "instruction": "Make him grittier, less reggae",
        "brief": gen_body,
    }
    t0 = time.time()
    r = requests.post(f"{BASE}/artists/ai-refine", json=refine_body, headers=H, timeout=120)
    print(f"ai-refine took {time.time()-t0:.1f}s, status={r.status_code}")
    if r.status_code != 200:
        record("ai-refine returns 200", False, f"status={r.status_code} body={r.text[:500]}")
    else:
        refined = r.json()
        record("ai-refine returns 200", True)
        refined_keys = set(refined.keys())
        print(f"Refined profile top-level keys: {sorted(refined_keys)}")

        # Same top-level keys as input (allowing the new refinement_history key)
        missing = top_keys - refined_keys
        record(
            "Refined preserves input top-level keys",
            len(missing) == 0,
            f"missing={missing}" if missing else f"{len(refined_keys)} keys present",
        )

        # Specific keys per review request
        for k in ["synthesized_profile", "primary_name", "name_suggestions", "bio", "backstory", "branding"]:
            record(f"Refined has '{k}'", k in refined, f"value type={type(refined.get(k)).__name__}")
        # voice_synthesis - the original output uses suno_voice_suggestion / suno_style_template.
        # We'll accept either to satisfy review intent.
        has_voice = any(k in refined for k in ["voice_synthesis", "suno_voice_suggestion", "suno_voice"])
        record("Refined has voice synthesis-style field", has_voice,
               f"keys present among voice_synthesis/suno_voice_suggestion/suno_voice: "
               f"{[k for k in ['voice_synthesis','suno_voice_suggestion','suno_voice'] if k in refined]}")

        # Differs from original
        orig_json = json.dumps(profile, sort_keys=True)
        refined_copy = dict(refined)
        refined_copy.pop("refinement_history", None)
        refined_json = json.dumps(refined_copy, sort_keys=True)
        record("Refined profile differs from original", orig_json != refined_json,
               f"original len={len(orig_json)}, refined len={len(refined_json)}")

        # refinement_history
        hist = refined.get("refinement_history")
        is_list = isinstance(hist, list)
        record("refinement_history is a list", is_list, f"type={type(hist).__name__}")
        if is_list:
            record("refinement_history has >=1 entry", len(hist) >= 1, f"len={len(hist)}")
            if hist:
                entry = hist[-1]
                instr_match = isinstance(entry, dict) and entry.get("instruction") == "Make him grittier, less reggae"
                record("refinement_history last entry contains instruction", instr_match, f"entry={entry}")

        # Show a sample diff
        diff_keys = []
        for k in sorted(top_keys & refined_keys):
            try:
                if json.dumps(profile.get(k), sort_keys=True) != json.dumps(refined.get(k), sort_keys=True):
                    diff_keys.append(k)
            except Exception:
                pass
        print(f"Keys whose values changed after refine: {diff_keys}")

    # Step 4: empty instruction -> 400
    print("\n--- Negative: empty instruction ---")
    r = requests.post(
        f"{BASE}/artists/ai-refine",
        json={"current_profile": profile, "instruction": "", "brief": gen_body},
        headers=H, timeout=30,
    )
    record("Empty instruction → 400", r.status_code == 400, f"status={r.status_code} body={r.text[:200]}")

    r = requests.post(
        f"{BASE}/artists/ai-refine",
        json={"current_profile": profile, "instruction": "   ", "brief": gen_body},
        headers=H, timeout=30,
    )
    record("Whitespace-only instruction → 400", r.status_code == 400, f"status={r.status_code}")

    # Step 5: empty current_profile -> 400
    print("\n--- Negative: empty current_profile ---")
    r = requests.post(
        f"{BASE}/artists/ai-refine",
        json={"current_profile": {}, "instruction": "make him grittier", "brief": gen_body},
        headers=H, timeout=30,
    )
    record("Empty current_profile → 400", r.status_code == 400, f"status={r.status_code} body={r.text[:200]}")

    # Step 6: no auth -> 401/403
    print("\n--- Negative: no auth ---")
    r = requests.post(
        f"{BASE}/artists/ai-refine",
        json={"current_profile": profile, "instruction": "make him grittier", "brief": gen_body},
        timeout=30,
    )
    record("No auth → 401/403", r.status_code in (401, 403), f"status={r.status_code} body={r.text[:200]}")

    # Summary
    print("\n" + "=" * 60)
    passed = sum(1 for s, _, _ in results if s == "PASS")
    failed = sum(1 for s, _, _ in results if s == "FAIL")
    print(f"TOTAL: {passed}/{passed+failed} PASS")
    if failed:
        print("\nFAILED:")
        for s, n, d in results:
            if s == "FAIL":
                print(f"  - {n}: {d}")
        sys.exit(1)


if __name__ == "__main__":
    main()
