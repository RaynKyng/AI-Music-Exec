# AI Music Manager — Migration to Render + MongoDB Atlas

This guide moves your backend off Emergent's Cloudflare-blocked hosting onto
**Render.com** (free, no Cloudflare bot filtering, works with your Android APK)
and **MongoDB Atlas** (free 512 MB cluster). Your existing frontend code,
EAS builds, and GitHub repo stay exactly as they are — only the backend URL
changes.

**Total cost:** $0/month (free tiers everywhere)
**Estimated time:** 60–90 minutes, mostly waiting for deploys.
**End state:** Your APK works on cellular or any WiFi, your wife uses it from
her phone, neither requires your laptop to be open.

---

## PART 1 — MongoDB Atlas (15 min)

1. Go to https://www.mongodb.com/cloud/atlas/register — sign up with Google.
2. Click **"Build a Database"** → pick **M0 FREE** ($0 forever, 512 MB).
3. Provider/Region: **AWS / us-east-1** (closest to Render Oregon for latency).
4. Cluster name: leave default (`Cluster0`).
5. **Security setup popup**:
   - Username: `aimusicexec`
   - Password: click "Autogenerate Secure Password" → **COPY IT, you'll need it**.
   - Click **"Create Database User"**.
6. **Network Access** (left sidebar):
   - Click **"Add IP Address"** → **"Allow access from anywhere"** → confirm `0.0.0.0/0`.
   - This lets Render reach your DB. (For tighter security later, restrict to Render's IPs.)
7. **Connect**:
   - Cluster overview → click **"Connect"** → **"Drivers"** → Driver: **Python**.
   - Copy the connection string. It looks like:
     `mongodb+srv://aimusicexec:<password>@cluster0.abc123.mongodb.net/?retryWrites=true&w=majority`
   - Replace `<password>` with the password you copied in step 5.
   - **SAVE THIS FULL STRING** — you'll paste it into Render in Part 3.

---

## PART 2 — Render account + connect GitHub (5 min)

1. Go to https://render.com → **Sign Up** with GitHub.
2. Authorize Render to access your `RaynKyng/AI-Music-Exec` repo.
3. Stay on the dashboard. You'll deploy in Part 3.

---

## PART 3 — Deploy backend to Render (15 min)

1. In Render dashboard click **"New +"** → **"Blueprint"**.
2. Connect your repo: `RaynKyng/AI-Music-Exec`.
3. Render auto-detects `backend/render.yaml` (the file I added in this Emergent
   session). It'll show **"ai-music-exec-backend"** ready to deploy.
4. Click **"Apply"** to start the build.
5. While it builds (~5 min), set the secrets. Click into the
   `ai-music-exec-backend` service → **Environment** tab:
   - `MONGO_URL` — paste the full Atlas connection string from Part 1 step 7.
   - `JWT_SECRET` — paste a long random string. Use `openssl rand -hex 32` or
     just mash your keyboard for 40+ characters.
   - `EMERGENT_LLM_KEY` — `sk-emergent-473CfEa08Aa41C0B68` (from your existing
     Emergent backend .env)
   - `DB_NAME` should already be set to `music_artist_manager`.
6. Click **"Save Changes"** — Render redeploys with the new env vars (~3 min).
7. When deploy is **Live**, copy your new backend URL from the top of the
   Render service page. It looks like:
   `https://ai-music-exec-backend.onrender.com`
8. Verify it works — visit `https://ai-music-exec-backend.onrender.com/api/` in
   any browser. You should see `{"detail":"Not Found"}` (correct FastAPI 404).
   First request may take 30s to wake from sleep — that's the free tier.

---

## PART 4 — Migrate your existing data (15 min)

Your current data (artists, songs, ideas, collections, users) lives in
Emergent's MongoDB. We export it to JSON, then import to Atlas.

### Option A — You don't need the existing data
Skip this part. Start fresh in your new app. Re-create your account on first
login. Faster, cleaner.

### Option B — Preserve all data (recommended)
1. On your laptop install MongoDB Database Tools:
   https://www.mongodb.com/try/download/database-tools
2. We need to export data from Emergent's MongoDB. The simplest way: ask
   Emergent support for a dump of your `music_artist_manager` database — they
   should provide it as a `.bson` or `.json` files. Email support@emergent.sh
   with: *"Please export my MongoDB `music_artist_manager` database for
   project artist-catalog-pro so I can migrate. Thanks."*
3. When you have the dump, run on your laptop:
   ```
   mongorestore --uri="<your Atlas connection string>" --db music_artist_manager <path-to-dump>/music_artist_manager
   ```
4. Verify in Atlas: cluster → Collections → you'll see `users`, `artists`,
   `songs`, `ideas`, `collections`, etc. with your data.

---

## PART 5 — Point your APK at the new backend (10 min)

1. In your local repo, edit `frontend/eas.json` — change both `preview.env`
   and `production.env`:
   ```
   "EXPO_PUBLIC_BACKEND_URL": "https://ai-music-exec-backend.onrender.com"
   ```
2. Also edit `frontend/src/stores/authStore.ts`, `frontend/src/stores/dataStore.ts`,
   `frontend/src/utils/api.ts`, and `frontend/app/index.tsx` — replace the
   hardcoded fallback URL `https://artist-catalog-pro.emergent.host` with
   `https://ai-music-exec-backend.onrender.com` (search-replace, 4 files).

3. Commit + push to GitHub:
   ```
   cd C:\Projects\AI-Music-Exec
   git add -A
   git commit -m "switch backend to Render"
   git push origin main
   ```

4. Rebuild the APK (one final time, then OTA forever):
   ```
   cd frontend
   eas build --profile preview --platform android --clear-cache
   ```

5. Install the new APK from the EAS build link on your phone.
6. Sign in. Login takes ~30s the first time (Render cold-start), instant after.

---

## PART 6 — Web access for your wife (5 min, optional)

If your wife wants to use a browser instead of installing the APK:

1. Go to https://vercel.com → sign up with GitHub.
2. **"Add New Project"** → import `RaynKyng/AI-Music-Exec`.
3. Framework preset: **Expo** (auto-detected). Root directory: `frontend`.
4. Environment variable: `EXPO_PUBLIC_BACKEND_URL=https://ai-music-exec-backend.onrender.com`
5. Click **Deploy**. ~3 min.
6. You get a URL like `ai-music-exec-raynkyng.vercel.app`. Share with your wife.
7. She opens in Chrome → menu (⋮) → "Install app" → home screen icon.

---

## PART 7 — Decommission Emergent (when you're confident)

Once Render + Atlas are working for a few days:

1. Emergent → Manage Deployments → **"Take app offline"** → **"Shutdown"**.
   This stops the 50 credits/month charge.
2. Email support@emergent.sh requesting refund of unused subscription days
   plus the troubleshooting credits.

You can keep using the Emergent web interface for code edits if you want — it
still works as a dev environment — but the deployment itself is gone.

---

## Cost summary

| Service | Free tier | Paid upgrade if needed |
|---|---|---|
| MongoDB Atlas M0 | 512 MB, shared | $9/mo for dedicated M10 |
| Render free | 512 MB RAM, sleeps after 15 min | $7/mo Starter = always-on |
| Vercel hobby | 100 GB bandwidth/mo | $20/mo Pro |
| **Total** | **$0/mo** | $16/mo if you want zero cold-starts |

For a private app for you + your wife, free tier is more than enough. The 30s
cold-start on the first request after idle is the only tradeoff.

---

## Why this fixes everything

- **No Cloudflare bot blocking** — Render uses standard HTTPS, your APK fetches work.
- **Always reachable** — Render's URL is stable, not tied to your laptop preview tab.
- **You own your data** — MongoDB Atlas account is yours, can export/move anytime.
- **OTA still works** — `eas update` continues to work as before.
- **Future fixes** — push to GitHub, Render auto-deploys backend, you `eas update` for frontend. No re-builds needed.

---

## Need help during migration?

Pop back to this Emergent chat any time. I have access to the same codebase
you're migrating, so I can answer questions or write any new code you need.

Good luck. This is the path forward.
