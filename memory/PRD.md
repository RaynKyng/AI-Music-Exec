# AI Music Artist Manager - PRD

## Overview
A comprehensive AI-powered mobile app for managing AI music artists and songs from concept to release. Operates like an AI Music Executive building a roster of artists with consistent sounds, looks, branding, and visuals.

## Core Features

### 1. Artist Roster with Identity Package
- Full artist profiles: Name, bio, unique sound, genres, themes, tone, patterns
- **Profile image upload** (device upload as base64 or paste URL)
- Visual branding: style, aesthetic, mood keywords, color palette
- **Visual Identity Brief** - shareable description for collaborators (wife) to understand the artist's visual direction
- **Identity Package API** - consolidated view of artist identity for quick reference
- Search by name, bio, sound

### 2. Song Catalog with Versions & Suno Tracking
- Full CRUD with lyrics, Suno-formatted style prompts, genre, mood, tempo
- Version tracking: Primary, Secondary, Alternate
- Status workflow: Draft -> In Progress -> Final -> Released
- **Suno Generation Links** - track multiple Suno URLs with prompts used and star ratings
- To-do lists, notes, themes
- Search + filter by status + filter by artist (combined)
- **Collection/EP/LP assignment** with track numbers

### 3. Collections (EP/LP/Album Releases)
- **New Releases tab** - organize songs into EPs, LPs, Singles, Albums
- Cover art support (URL-based)
- Artist assignment, track counting
- Status: In Progress, Completed, Released
- Search and browse all releases

### 4. Quick Idea Capture
- Types: Spark, Concept, Lyrics, Melody, Style, Visual
- Tags, artist/song linking, search

### 5. AI Tools Suite
- **Suno Prompt Generator** - copyright-free style prompts
- **Content Analyzer** - lyrics analysis, artist matching, enhancement
- **Video Storyboard Generator** (NEW) - AI-generated scene-by-scene video prompts with:
  - Timestamps following song structure
  - Camera directions, lighting, mood per scene
  - Platform-adapted formats: YouTube (16:9), TikTok (9:16 vertical), Instagram Reels
  - Artist identity-aware visual directions

### 6. Platform-Specific Sharing
- Auto-formatted content for 7 platforms (Instagram, TikTok, YouTube, Twitter, Spotify, Apple Music, SoundCloud)
- Copy-to-clipboard per platform

### 7. Distribution Tracking
- 8 platforms with status badges (Pending/Submitted/Live/Rejected)
- URL + notes per platform

### 8. Revenue/Monetization Tracking
- Track income per song, per platform, per period
- Revenue types: Streaming, Sync, Licensing, Merch, Social
- Summary with totals by platform and by type
- Expert-level structure ready for scaling

### 9. Bulk Import
- Import multiple songs at once via JSON array
- Supports all song fields including artist assignment
- CSV-to-JSON format guide for Google Sheets users

### 10. Dashboard
- Stats: Artists, Songs, Ideas counts
- Song status breakdown
- Recent activity

## Tech Stack
- **Frontend**: Expo React Native (SDK 54), expo-router, Zustand, expo-image-picker
- **Backend**: FastAPI, MongoDB (Motor), JWT auth
- **AI**: OpenAI GPT-5.2 via Emergent LLM Integration
- **Auth**: JWT-based for multi-user (you + wife)
