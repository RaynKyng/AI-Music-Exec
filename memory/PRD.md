# AI Music Manager — Product Requirements Document

## Vision
Your personal AI Music Executive — an end-to-end platform to develop fictional/AI artists, manage their songs, run collaborative writing sessions, generate Suno/Sora-ready creative assets, and roll out releases. Built for a music exec couple working as a team on a shared catalog.

## Core Personas
- **Music Executive (Owner):** Builds and curates the artist roster, writes/co-writes songs, generates AI prompts, plans releases, tracks revenue.
- **Collaborator (Wife/Partner):** Joins the exec's team, has full read/edit access to the shared catalog, and maintains a parallel slot for personal songs (mark as private).

## Feature Set (current)

### 1. Authentication & Team Workspaces
- Email/password sign-up & sign-in (JWT).
- Each user has a `team_id` (defaults to own user ID = solo/personal workspace).
- **Invite codes:** Generate a 6-character invite code (7-day expiry) → share → recipient joins → both share artists/songs/collections/ideas/distributions/revenue.
- **Privacy flag:** Any artist/song/collection/idea can be marked `is_private` so only its creator sees it (still inside the shared workspace).
- Leave team → reset back to personal workspace; original creator's records stay where they are.

### 2. Artist Roster
- Profile: name, bio, unique sound, themes, tone, branding (color palette, mood keywords, aesthetic, visual style).
- Profile image (base64 upload or URL).
- **Character Gallery:** multiple reference photos per artist (different outfits, angles, moods) for music videos / branding.
- Visual brief generator and brief detail screen.
- Suno voice ID and default exclusions per artist.
- Search + filtering, song count badge.

### 3. Song Catalog
- Full info card: title, primary artist, featured artists, collection, lyrics, mood/tempo/genre/themes, status (draft/in_progress/final/released), notes, todo list, track number.
- **Authorship type:** original (you wrote), ai_generated, or collab — to keep your "voice" distinct from AI-generated lyrics.
- **3 style fields:** primary, secondary, alternative — for A/B testing on Suno.
- **Style exclusions** prompt.
- **Suno generations** list per song (URL + prompt + rating + notes).
- **Versions** list (e.g., "demo", "final cut", "TikTok edit") with linked URLs.
- **AI Prompts Gallery** on each song's profile — saved Suno style prompts, video storyboards, chat outputs, all copy-pasteable.
- Search + filtering, multi-status sort.
- **Quick Add** workflow: paste lyrics → AI auto-fills themes / styles / mood / genre → confirm → save.
- **CSV Bulk Import** with tab-delimited auto-mapping, validation, and missing-collection auto-creation.
- Share → platform-specific copy (Instagram, TikTok, YouTube, Twitter, Spotify, Apple Music, SoundCloud).
- Distribution tracker (where the song is posted/uploaded).

### 4. Collections / Releases
- Album, EP, LP, Single, Playlist, Project containers.
- Cover art, release date, status, description.
- Tracklist with up/down reordering.
- Auto track-count badge.

### 5. Ideas / Brainstorming Board
- Sparks, concepts, lyrics, melody ideas, style notes, visuals.
- Tags, linked artist/song.

### 6. Revenue Dashboard
- Revenue chart by month/platform/song.
- Per-song revenue entries (streaming, sync, licensing, merch, social).
- Aggregated stats card on home tab.

### 7. AI Tools Tab
- **Lyric / theme analyzer.**
- **Suno Prompt Generator** with primary/secondary/alternative outputs.
- **Video Storyboard Generator** outputting copy-paste Sora/Runway parameters + 60s TikTok cut script.
- "Save to Song" button on every output → drops into that song's AI Prompts Gallery.

### 8. Creative Assistant (Conversational AI)
- Multi-turn chat with full memory of the user's roster + linked artist/song context.
- Suggested prompts to get started: brainstorming, voice tuning, branding, release planning, Suno styles, video pitches.
- Save any AI message into a linked song's gallery with one tap.

### 9. Collaborative Comments
- Each artist / song / idea has its own comments thread for back-and-forth notes between team members.

### 10. AI Artist Generator (NEW)
- Brief form: location, real-life influences (chip-input), genre hints, vibe, custom direction
- Returns: 3-5 name suggestions, bio + backstory, sonic signature, branding (palette, mood, visual style), Suno voice + style template, **influence breakdown** (signature sound + what we pull + what we drop per influence), 3 starter song ideas, recurring themes, synthesized recipe
- Tap "Add to Roster" → artist created with full generation log saved to their AI Prompts Gallery
- "Suno" fields are guaranteed name-free (sonic descriptors only) for copyright-safe pasting

### 11. Quick Add Analyzer Upgrades (NEW)
- Real-life artist fit suggestions (with reference tracks)
- Per-roster-artist fit analysis (low/medium/high/perfect + how to alter the song)
- Left-field inspiration that opens the AI Artist Generator pre-filled

### 12. In-App Audio Player (NEW)
- Cross-platform (web HTML audio + native expo-audio)
- Mini player floats above tab bar; persists across screens
- Direct audio file URLs play in-app; page URLs (suno.com/song/...) gracefully fall back to opening externally
- Play buttons on song list cards and individual Suno generations on song detail
- Auto-advance through queue; tap mini player to jump to song detail

## Tech Stack
- **Frontend:** Expo Router (React Native + Web), Zustand state, Pressable for cross-platform clickability, expo-image-picker, expo-clipboard.
- **Backend:** FastAPI + Motor (MongoDB async).
- **AI:** Emergent LLM Key (gpt-5.2 via emergentintegrations) for analyze, suno-prompt, video storyboard, quick-add analyze, and creative assistant.
- **Auth:** JWT bearer tokens.

## Test Credentials
- exec@music.com / password123
- test@example.com / password123

## Endpoints Highlights
- `POST /api/auth/register`, `/auth/login`, `GET /auth/me`
- `POST /api/team/invite-code`, `/team/join`, `GET /team/members`, `POST /team/leave`
- `GET/POST/PUT/DELETE /api/artists`, `/songs`, `/collections`, `/ideas`, `/revenue`, `/distributions`
- `POST /api/songs/{id}/saved-prompts`, `DELETE /api/songs/{id}/saved-prompts/{prompt_id}`
- `POST /api/songs/quick-add` (AI auto-fill)
- `POST /api/ai/analyze`, `/ai/suno-prompt`, `/ai/video-storyboard`, `/ai/assistant`
- `POST /api/songs/csv-import`
- `POST /api/songs/{id}/format-for-sharing`

## Open Backlog
- Global in-app audio player.
- Per-song activity timeline.
- Push notifications when a collaborator edits something.
