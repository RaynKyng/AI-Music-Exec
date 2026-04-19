# AI Music Artist Manager - PRD

## Overview
A comprehensive AI-powered mobile app for managing AI music artists and songs from concept to release. Built for a husband-wife creative team - operates like an AI Music Executive building a roster of artists with consistent sounds, looks, branding, and visuals.

## Core Features

### 1. Artist Roster with Identity Package
- Full profiles: Name, bio, unique sound, genres, themes, tone, patterns
- **Profile image upload** (device upload as base64 or paste URL)
- Visual branding: style, aesthetic, mood keywords, color palette
- **Visual Identity Brief** - shareable description for collaborators to understand visual direction
- **Identity Package API** - consolidated artist identity for quick reference
- **Collaborative Notes** - leave visual suggestions, remix ideas, feedback (notes from different users appear with different styling)

### 2. Song Catalog with Assigned vs Alternate Versions
- Lyrics, Suno-formatted style prompts, genre, mood, tempo
- **Version system with clear separation:**
  - **Assigned** (primary, marked with star) - the version used for this artist
  - **Alternates/Renditions** - can be repurposed, remixed, linked to different artists
  - Version labels: Original, Acoustic, TikTok Cut, Extended, etc.
  - Alternate versions can be linked to different artists
- Status workflow: Draft → In Progress → Final → Released
- Suno Generation link tracking with ratings
- To-do lists, notes, themes
- Search + filter by status + filter by artist
- **Collaborative Notes** per song
- Collection/EP/LP assignment

### 3. Collections (EP/LP/Album) - "Releases" Tab
- Organize songs into EPs, LPs, Singles, Albums
- Cover art support
- Artist assignment + track counting
- Status: In Progress → Completed → Released

### 4. CSV Bulk Import
- **Paste CSV directly** from Google Sheets (comma, tab, or custom delimiter)
- Auto-maps columns: title, genre, mood, style_prompt, status, lyrics, tempo, themes
- Preview count before importing
- Assign all to a specific artist
- Error reporting per row

### 5. Revenue/Monetization Tracking
- Track income per song, per platform, per period
- Revenue types: Streaming, Sync, Licensing, Merch, Social
- **Chart data API**: totals by period, by platform, top songs
- Summary dashboard

### 6. AI Tools Suite
- **Suno Prompt Generator** - copyright-free style prompts
- **Content Analyzer** - lyrics analysis, artist matching, enhancement
- **Video Storyboard Generator** - scene-by-scene prompts for YouTube, TikTok, Instagram
  - Timestamps, camera directions, lighting, mood per scene
  - Platform-adapted formats
  - Artist identity-aware

### 7. Collaborative Workflow
- **Comments on artists and songs** with 4 types: Note, Visual Suggestion, Remix Idea, Feedback
- **Creator vs Collaborator** visual distinction (different border colors, "Collaborator" badge)
- Own comments deletable, collaborator notes highlighted in pink
- Wife can leave visual ideas, remix suggestions; creator implements or discards

### 8. Platform-Specific Sharing (7 platforms)
### 9. Distribution Tracking (8 platforms with status)
### 10. Quick Idea Capture (6 types with tags)
### 11. Dashboard with stats

## Tech Stack
- **Frontend**: Expo React Native (SDK 54), expo-router, Zustand, expo-image-picker
- **Backend**: FastAPI, MongoDB (Motor), JWT auth
- **AI**: OpenAI GPT-5.2 via Emergent LLM Integration
- **Auth**: JWT-based for multi-user access

## Navigation: 6 tabs
Home | Artists | Songs | Releases | Ideas | AI
