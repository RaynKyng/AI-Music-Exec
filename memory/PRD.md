# AI Music Artist Manager - PRD

## Overview
Full-stack AI-powered mobile app for managing AI music artists and songs from concept to release. Built for a husband-wife creative team operating like an AI Music Executive.

## Navigation: 6 Tabs
Home | Artists | Songs | Releases | Ideas | AI

## Feature Summary

### Dashboard (Home)
- Stats: Artists, Songs, Ideas
- Song status breakdown
- **Revenue visualization**: Total earnings, bar charts by platform & period, top earning songs
- Recent songs & ideas

### Artist Management
- Full profiles with profile image upload (base64 + URL)
- Sound identity: unique sound, genres, themes, tone, patterns
- Visual branding: style, aesthetic, mood keywords, color palette
- **Visual Identity Brief** for collaborator reference
- **"View Artist Brief" button** → standalone visual reference card
- **Collaborative Notes** (4 types: Note, Visual Suggestion, Remix Idea, Feedback)

### Song Catalog
- Lyrics, Suno-formatted style prompts, genre, mood, tempo
- **Assigned vs Alternate versions** (clear visual separation, cross-artist linking)
- Status workflow, to-do lists, Suno generation tracking
- Search + status filter + artist filter
- **CSV Bulk Import modal** with paste-from-Sheets, artist assignment, preview
- Collaborative Notes, Share & Distribution buttons

### Releases (Collections)
- EPs, LPs, Singles, Albums with cover art
- Track counting, status tracking

### Ideas
- Quick capture with 6 types, tags, search, artist/song linking

### AI Tools
- Suno Prompt Generator
- Content Analyzer (5 analysis types)
- Video Storyboard Generator (YouTube, TikTok, Instagram)

### Revenue Tracking
- Income per song/platform/period
- Chart data with platform bars, period trends, top songs

### Platform Sharing (7 platforms) + Distribution Tracking (8 platforms)

## Tech Stack
- Expo React Native (SDK 54), FastAPI, MongoDB, OpenAI GPT-5.2 via Emergent LLM
