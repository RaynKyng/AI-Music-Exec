#====================================================================================================
# Testing Data
#====================================================================================================

user_problem_statement: "Build an AI Music Artist Management app - now adding 4 features: search/filtering, platform-specific sharing, Suno generation tracking, distribution UI"

backend:
  - task: "Search Endpoints (Artists, Songs, Ideas)"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Added search query params to artists, songs, ideas endpoints"

  - task: "Platform Formatting Endpoint"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "POST /api/songs/{id}/format-for-sharing generates platform-specific content for Instagram, TikTok, YouTube, Twitter, Spotify, Apple Music, SoundCloud"

  - task: "Suno Generation CRUD"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "POST/DELETE /api/songs/{id}/suno-generations for tracking Suno links, prompts, ratings"

  - task: "Distribution CRUD"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Full CRUD for distributions with platform entries, status tracking"

  - task: "Version Delete Endpoint"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "DELETE /api/songs/{id}/versions/{version_id}"

frontend:
  - task: "Search Bars on Artists/Songs/Ideas tabs"
    implemented: true
    working: true
    file: "/app/frontend/app/(tabs)/artists.tsx, songs.tsx, ideas.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "SearchBar component added to all three tabs with debounced API calls"

  - task: "Artist Filter on Songs Tab"
    implemented: true
    working: true
    file: "/app/frontend/app/(tabs)/songs.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Horizontal artist filter chips on Songs tab, combined with status filter"

  - task: "Platform Sharing Screen"
    implemented: true
    working: true
    file: "/app/frontend/app/song/share/[id].tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Full sharing screen with expandable platform cards, copy-to-clipboard, formatted content for 7 platforms"

  - task: "Distribution Tracking Screen"
    implemented: true
    working: true
    file: "/app/frontend/app/song/distribution/[id].tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Distribution screen with platform cards, status badges, URL tracking, edit modal"

  - task: "Suno Generations Section in Song Detail"
    implemented: true
    working: true
    file: "/app/frontend/app/song/[id].tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Suno generations list with add modal, rating stars, delete, URL/prompt tracking"

  - task: "Share & Distribution Action Buttons"
    implemented: true
    working: true
    file: "/app/frontend/app/song/[id].tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Share and Distribution action buttons at bottom of song detail"

metadata:
  created_by: "main_agent"
  version: "2.0"
  test_sequence: 2
  run_ui: true

  - task: "Team Workspace Endpoints (invite-code, join, members, leave)"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: "All endpoints verified: POST /api/team/invite-code returns 6-char A-Z0-9 code with expires_at + invited_by_name. POST /api/team/join joins with valid code, returns 404 on bad code, 400 when user already on that team. GET /api/team/members returns members of current team with id/name/email/role/is_self fields. POST /api/team/leave reverts user to personal workspace (team_id = user id), returns 400 when already on personal. GET /api/auth/me returns team_id and role correctly. B's team_id updates correctly after join."

  - task: "Saved Prompts on Songs (POST/DELETE)"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: "POST /api/songs/{id}/saved-prompts returns prompt with id, saved_by_id, saved_by_name, created_at. Prompt is pushed to song.saved_prompts and visible via GET /api/songs/{id}. DELETE /api/songs/{id}/saved-prompts/{prompt_id} removes it correctly."

  - task: "Team-Aware Data Filtering (artists/songs/collections/ideas)"
    implemented: true
    working: false
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: false
        agent: "testing"
        comment: "Sharing across team members works: after B joins A's team, both users see each other's artists/songs/ideas/collections via list endpoints. Dashboard stats counts team-wide items. After B leaves, B no longer sees A's data. HOWEVER, is_private filtering is BROKEN for Artist/Idea/Collection/Distribution/Revenue models because their *Create models do NOT declare an is_private field. Creating an artist with body {is_private: true} silently drops the field (Pydantic ignores unknown fields), resulting in is_private=False on disk. Song works correctly because SongCreate declares is_private. Fix: add 'is_private: bool = False' to ArtistCreate, IdeaCreate, CollectionCreate (and optionally DistributionCreate/RevenueEntryCreate) so clients can mark records private. The team_query() filter itself is correctly implemented - verified by creating a private Song (A) and confirming B cannot see it."

  - task: "Existing Endpoints Sanity After Team Migration"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: "Verified: auth/register, auth/login, CRUD on artists/songs/ideas/collections, distributions CRUD, revenue CRUD, POST /api/songs/csv-import (imported 1 row), POST /api/songs/{id}/versions, POST /api/songs/quick-add (returns song + ai_suggestions JSON via Emergent LLM), POST /api/ai/assistant (returns response + session_id). All endpoints still work after team migration. Note: review referenced /api/songs/analyze-quick-add; actual endpoint is /api/songs/quick-add and it works fine."

test_plan:
  current_focus:
    - "is_private field missing from ArtistCreate/IdeaCreate/CollectionCreate models"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: "Implemented all 4 features: 1) Search bars on Artists/Songs/Ideas with backend search support, 2) Platform-specific sharing screen at /song/share/{id}, 3) Distribution tracking at /song/distribution/{id}, 4) Suno generation management in song detail with add/delete/rate. All accessible from song detail screen via Share and Distribution action buttons."
  - agent: "main"
    message: "Major feature pass: (1) Added Team Workspace system - users can generate invite codes and join shared workspaces. Each user has team_id (defaults to own user_id). All artists/songs/collections/ideas/distributions/revenue records now have team_id set on creation and queries are filtered through team_query() helper that returns records belonging to current user's team while excluding others' is_private items. (2) Added saved_prompts on Song model with POST /api/songs/{id}/saved-prompts and DELETE /api/songs/{id}/saved-prompts/{prompt_id} endpoints. (3) Lazy migration on backend startup ensures existing records get team_id = user_id. Test credentials in /app/memory/test_credentials.md. Please verify: team invite/join/leave/members endpoints, saved-prompts CRUD on a song, and confirm existing artist/song/collection/idea CRUD still works."
  - agent: "testing"
    message: "Ran /app/backend_test.py against the public base URL — 53/54 checks pass. Team invite/join/leave/members, saved-prompts CRUD, team-aware list sharing, post-leave visibility, auth/me team fields, and all existing CRUD (artists/songs/ideas/collections/distributions/revenue/csv-import/versions/quick-add/ai-assistant) all PASS. ONE BUG: is_private is not settable on Artist/Idea/Collection/(Distribution/Revenue) because their *Create Pydantic models do not declare the is_private field (Pydantic silently drops unknown fields). team_query() privacy filter itself works correctly (verified with Song where SongCreate.is_private exists). Fix: add `is_private: bool = False` to ArtistCreate, IdeaCreate, CollectionCreate models. No code was modified during testing."
