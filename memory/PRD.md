# AI Music Artist Manager - PRD

## Overview
A comprehensive AI-powered mobile app for managing AI music artists and songs from concept to release. Operates like an AI Music Executive building a roster of artists with consistent sounds, looks, branding, and visuals.

## Core Features

### 1. Artist Roster Management
- Create/edit/delete artists with detailed profiles
- Fields: Name, bio, unique sound, genres, themes, tone, patterns
- Branding: visual style, aesthetic, mood keywords, color palette
- Song count tracking per artist
- **Search** by name, bio, sound description

### 2. Song Catalog Management
- Full CRUD for songs with comprehensive metadata
- Version tracking: Primary, Secondary, Alternate versions
- Status workflow: Draft -> In Progress -> Final -> Released
- Lyrics, style prompts (Suno-formatted), genre, mood, tempo, themes
- To-do lists and notes per song
- **Search** by title, lyrics, notes
- **Filter** by status AND by artist (combined filters)

### 3. Quick Idea Capture
- Rapid brainstorming with type categories: Spark, Concept, Lyrics, Melody, Style, Visual
- Tags, content capture, artist/song linking
- Quick capture modal for on-the-go inspiration
- **Search** by title, content, tags
- **Filter** by type

### 4. AI Tools (OpenAI GPT-5.2)
- **Suno Prompt Generator**: Copyright-free style prompts for AI music generators
- **Content Analyzer**: Analyze lyrics, match artist styles, enhance lyrics
- Analysis types: Lyrics, Style, Artist Match, Suno Prompt, Enhance Lyrics
- Copy-to-clipboard for all AI outputs

### 5. Suno Generation Tracking
- Track multiple Suno generation links per song
- Store: URL, prompt used, style tags, rating (1-5 stars), notes
- Favorite marking
- Add/delete generations
- Quick link management

### 6. Platform-Specific Sharing
- Auto-generate formatted content for 7 platforms:
  - **Instagram**: Caption with hashtags, line breaks, char limit info
  - **TikTok**: Short hook + hashtags, video format tips
  - **YouTube**: Title, description with sections, tags
  - **Twitter/X**: Compact tweet format, 280 char limit
  - **Spotify**: Metadata + pitch description for playlist submission
  - **Apple Music**: Metadata + submission guidelines
  - **SoundCloud**: Title, description, tags
- Copy individual fields or copy all content per platform
- Platform-specific tips and requirements

### 7. Distribution Tracking
- Track where each song is distributed across 8 platforms
- Status tracking: Pending, Submitted, Live, Rejected
- URL tracking per platform
- Notes and format requirements
- Edit inline via modal

### 8. Dashboard
- Overview stats: Artist count, Song count, Idea count
- Song status breakdown (Draft/In Progress/Final/Released)
- Recent songs and recent ideas
- Pull-to-refresh

## Authentication
- JWT-based auth for 2-user access (personal + wife)
- Register/Login flow with password hashing (bcrypt)

## Tech Stack
- **Frontend**: Expo React Native (SDK 54), expo-router, Zustand
- **Backend**: FastAPI, MongoDB (Motor), JWT auth
- **AI**: OpenAI GPT-5.2 via Emergent LLM Integration
- **Storage**: MongoDB for all data, AsyncStorage for auth tokens

## Test Credentials
- Email: exec@music.com / Password: password123
- Email: test@example.com / Password: test123
