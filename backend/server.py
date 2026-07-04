from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Form
from fastapi.staticfiles import StaticFiles
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import re
import json
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, timedelta
import jwt
from passlib.context import CryptContext
# LLM client: a thin wrapper around `litellm` that mirrors the public API
# of `emergentintegrations.llm.chat` (LlmChat / UserMessage). This removes
# the runtime dependency on the private `emergentintegrations` package
# (which doesn't install on Render without a custom pip index) while
# preserving every existing call site untouched.
from llm_client import LlmChat, UserMessage
# Read-time normalizer for Artist / Collection documents. Recovers
# legacy / AI-generated shapes so a single bad doc doesn't 500 the whole
# list endpoint. See doc_normalizer.py for the full rules.
from doc_normalizer import (
    normalize_artist_doc,
    normalize_collection_doc,
    safe_validate,
    safe_validate_many,
)
import push_service

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'music_artist_manager')]

# JWT settings
SECRET_KEY = os.environ.get('JWT_SECRET', 'your-secret-key-change-in-production')
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 30

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

# LLM Key
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

# Create the main app
app = FastAPI(title="AI Music Artist Manager")

@app.get("/api/")
async def api_root():
    return {"status": "ok"}

# Set up uploads directory
import pathlib
UPLOAD_DIR = pathlib.Path("./uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
(UPLOAD_DIR / "audio").mkdir(parents=True, exist_ok=True)
app.mount("/api/audio", StaticFiles(directory=str(UPLOAD_DIR / "audio")), name="audio")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ============== Models ==============

class UserCreate(BaseModel):
    email: str
    password: str
    name: str

class UserLogin(BaseModel):
    email: str
    password: str

class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str
    name: str
    team_id: str = ""
    role: str = "owner"  # owner, member
    created_at: datetime = Field(default_factory=datetime.utcnow)

class Token(BaseModel):
    access_token: str
    token_type: str
    user: User

class TeamInvite(BaseModel):
    code: str
    team_id: str
    invited_by_name: str
    invited_by_email: str
    expires_at: datetime

class TeamJoinRequest(BaseModel):
    code: str

# Artist Models
class ArtistBranding(BaseModel):
    color_palette: List[str] = []
    visual_style: str = ""
    aesthetic: str = ""
    mood_keywords: List[str] = []

class ArtistCreate(BaseModel):
    name: str
    bio: str = ""
    unique_sound: str = ""
    genres: List[str] = []
    themes: List[str] = []
    tone: str = ""
    patterns: List[str] = []
    branding: ArtistBranding = ArtistBranding()
    image_url: str = ""
    profile_image: str = ""  # base64 encoded image
    character_images: List[str] = []  # additional character/mood board images (URLs)
    visual_brief: str = ""  # shareable visual identity description
    visual_references: List[str] = []  # reference image URLs
    suno_voice: str = ""  # saved Suno voice ID/name for this artist
    suno_exclusions: str = ""  # default exclusions prompt for this artist
    notes: str = ""
    saved_prompts: List[dict] = []  # AI generation logs and saved prompts
    is_private: bool = False  # if true, only visible to the creator within their team

class Artist(ArtistCreate):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    team_id: str = ""
    is_private: bool = False
    song_count: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

# Suno Generation Models
class SunoGeneration(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    suno_url: str = ""  # the Suno page URL (e.g., https://suno.com/song/abc-123)
    audio_url: str = ""  # direct playable audio file URL (mp3/wav/etc.) for in-app playback
    prompt_used: str = ""
    style_tags: str = ""
    rating: int = 0  # 0-5 stars
    is_favorite: bool = False
    notes: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)

# Song Version Models
class SongVersion(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    version_type: str  # primary, secondary, alternate
    version_label: str = ""  # e.g., "Original", "Acoustic", "TikTok Cut", "Extended"
    is_assigned: bool = False  # True = this is the primary assigned version
    assigned_artist_id: Optional[str] = None  # alternate can be linked to different artist
    audio_url: str = ""
    suno_link: str = ""
    suno_voice: str = ""  # which Suno voice was used
    exclusions_prompt: str = ""  # song exclusions prompt used
    style_prompt_used: str = ""  # which style (primary/secondary/alt) was used
    suno_generations: List[SunoGeneration] = []
    notes: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)

# Collaborative Comment Model
class CommentCreate(BaseModel):
    target_type: str  # "artist" or "song"
    target_id: str
    content: str
    comment_type: str = "note"  # note, visual_suggestion, remix_idea, feedback

class Comment(CommentCreate):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    author_id: str
    author_name: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)

class SongCreate(BaseModel):
    title: str
    artist_id: Optional[str] = None  # primary artist
    featured_artist_ids: List[str] = []  # featured/collaborating artists
    collection_id: Optional[str] = None  # primary/home EP/LP it belongs to (legacy single)
    playlist_ids: List[str] = []  # additional playlists this song is curated into (many-to-many)
    lyrics: str = ""
    authorship: str = "original"  # original, ai_generated, collab
    style_prompt: str = ""  # primary style (Suno-formatted)
    style_secondary: str = ""  # secondary style option
    style_alternate: str = ""  # alternative style option
    additional_styles: List[str] = []  # expandable list of additional style ideas
    exclusions: str = ""  # song exclusions prompt
    genre: str = ""
    mood: str = ""
    tempo: str = ""
    themes: List[str] = []
    status: str = "draft"  # draft, in_progress, final, released
    notes: str = ""
    todo: List[str] = []
    versions: List[SongVersion] = []
    suno_generations: List[SunoGeneration] = []  # song-level Suno links
    saved_prompts: List[dict] = []  # AI-generated prompts saved to this song's profile
    track_number: int = 0  # position in collection
    is_private: bool = False  # if true, only visible to the creator within their team

class Song(SongCreate):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    team_id: str = ""  # which team workspace this belongs to
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class SavedPromptCreate(BaseModel):
    prompt_type: str  # suno_style, video_storyboard, lyrics_enhance, custom
    label: str  # short human-readable label
    content: str  # the actual prompt text

# Idea/Brainstorm Models
class IdeaCreate(BaseModel):
    title: str
    content: str
    type: str = "spark"  # spark, concept, lyrics, melody, style, visual
    tags: List[str] = []
    linked_artist_id: Optional[str] = None
    linked_song_id: Optional[str] = None
    is_private: bool = False

class Idea(IdeaCreate):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    team_id: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

# Distribution Models
class DistributionEntry(BaseModel):
    platform: str  # spotify, apple_music, youtube, instagram, tiktok, etc.
    url: str = ""
    status: str = "pending"  # pending, submitted, live, rejected
    format_notes: str = ""
    submitted_at: Optional[datetime] = None

class DistributionCreate(BaseModel):
    song_id: str
    entries: List[DistributionEntry] = []
    notes: str = ""

class Distribution(DistributionCreate):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

# AI Analysis Request/Response
class AIAnalysisRequest(BaseModel):
    content: str
    analysis_type: str  # lyrics, style, artist_match, suno_prompt, enhance_lyrics
    artist_id: Optional[str] = None

class AIAnalysisResponse(BaseModel):
    analysis: str
    suggestions: List[str] = []
    suno_prompt: Optional[str] = None

# Collection Models (EP/LP)
class CollectionCreate(BaseModel):
    title: str
    artist_id: Optional[str] = None  # Optional — playlists are artist-agnostic; required for EP/LP/Album/Single
    collection_type: str = "EP"  # EP, LP, Single, Album, Playlist
    cover_image: str = ""  # base64 or URL
    cover_image_url: str = ""
    description: str = ""
    release_date: Optional[str] = None
    status: str = "in_progress"  # in_progress, completed, released
    notes: str = ""
    is_private: bool = False

class Collection(CollectionCreate):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    team_id: str = ""
    track_count: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

# Revenue Models
class RevenueEntryCreate(BaseModel):
    song_id: Optional[str] = None
    artist_id: Optional[str] = None
    platform: str  # spotify, apple_music, youtube, tiktok, licensing, etc.
    amount: float = 0.0
    currency: str = "USD"
    period: str = ""  # e.g., "2026-01", "Q1 2026"
    revenue_type: str = "streaming"  # streaming, sync, licensing, merch, social
    notes: str = ""

class RevenueEntry(RevenueEntryCreate):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

# Bulk Import Model
class BulkSongImport(BaseModel):
    songs: List[dict]  # list of song dicts with title, lyrics, genre, etc.

# Video Prompt Request
class VideoPromptRequest(BaseModel):
    song_id: Optional[str] = None
    lyrics: str = ""
    artist_id: Optional[str] = None
    style: str = ""  # visual style direction
    platforms: List[str] = ["youtube", "tiktok", "instagram"]

# ============== Auth Helpers ==============

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        user = await db.users.find_one({"id": user_id})
        if user is None:
            raise HTTPException(status_code=401, detail="User not found")
        # Lazy migration: ensure user has team_id
        if not user.get("team_id"):
            await db.users.update_one({"id": user_id}, {"$set": {"team_id": user_id, "role": "owner"}})
            user["team_id"] = user_id
            user["role"] = "owner"
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_team_user_ids(current_user: dict) -> List[str]:
    team_id = current_user.get("team_id") or current_user["id"]
    members = await db.users.find({"team_id": team_id}).to_list(100)
    ids = [m["id"] for m in members]
    if current_user["id"] not in ids:
        ids.append(current_user["id"])
    return ids

def team_query(current_user: dict, base: dict = None, include_deleted: bool = False) -> dict:
    """Build a query that filters records to the user's current team workspace, excluding others' private items.
    By default, soft-deleted items (with deleted_at field set) are excluded."""
    q = dict(base or {})
    team_id = current_user.get("team_id") or current_user["id"]
    q["team_id"] = team_id
    user_id = current_user["id"]
    privacy_clause = {"$or": [{"user_id": user_id}, {"is_private": {"$ne": True}}]}
    if "$or" in q:
        existing_or = q.pop("$or")
        q["$and"] = q.get("$and", []) + [{"$or": existing_or}, privacy_clause]
    elif "$and" in q:
        q["$and"] = q["$and"] + [privacy_clause]
    else:
        q.update(privacy_clause)
    if not include_deleted:
        q["deleted_at"] = {"$in": [None, ""]}  # null or missing
    return q

async def team_filter(current_user: dict, base_query: dict = None) -> dict:
    return team_query(current_user, base_query)

async def filter_team_accessible(items: List[dict], current_user: dict) -> List[dict]:
    return [i for i in items if not i.get("is_private") or i.get("user_id") == current_user["id"]]

@app.on_event("startup")
async def migrate_team_ids():
    """One-time lazy migration: ensure all existing records have team_id (= user_id by default)."""
    try:
        # Update users without team_id
        await db.users.update_many(
            {"$or": [{"team_id": {"$exists": False}}, {"team_id": ""}, {"team_id": None}]},
            [{"$set": {"team_id": "$id", "role": "owner"}}]
        )
        # Update collections that use user_id ownership
        for coll_name in ["artists", "songs", "ideas", "collections", "distributions", "revenue", "comments"]:
            await db[coll_name].update_many(
                {"$or": [{"team_id": {"$exists": False}}, {"team_id": ""}, {"team_id": None}]},
                [{"$set": {"team_id": "$user_id"}}]
            )
        logger.info("Team ID migration complete")
    except Exception as e:
        logger.error(f"Team ID migration error: {e}")

# ============== Auth Routes ==============

@api_router.post("/auth/register", response_model=Token)
async def register(user_data: UserCreate):
    # Check if user exists
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create user
    user_dict = {
        "id": str(uuid.uuid4()),
        "email": user_data.email,
        "name": user_data.name,
        "password_hash": get_password_hash(user_data.password),
        "team_id": "",  # set below
        "role": "owner",
        "created_at": datetime.utcnow()
    }
    user_dict["team_id"] = user_dict["id"]  # default: own team
    await db.users.insert_one(user_dict)
    
    # Create token
    access_token = create_access_token(data={"sub": user_dict["id"]})
    
    return Token(
        access_token=access_token,
        token_type="bearer",
        user=User(id=user_dict["id"], email=user_dict["email"], name=user_dict["name"], team_id=user_dict["team_id"], role=user_dict["role"])
    )

@api_router.post("/auth/login", response_model=Token)
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email})
    if not user or not verify_password(credentials.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    # Lazy migration
    if not user.get("team_id"):
        await db.users.update_one({"id": user["id"]}, {"$set": {"team_id": user["id"], "role": "owner"}})
        user["team_id"] = user["id"]
        user["role"] = "owner"
    
    access_token = create_access_token(data={"sub": user["id"]})
    
    return Token(
        access_token=access_token,
        token_type="bearer",
        user=User(id=user["id"], email=user["email"], name=user["name"], team_id=user.get("team_id", user["id"]), role=user.get("role", "owner"))
    )

@api_router.get("/auth/me", response_model=User)
async def get_me(current_user: dict = Depends(get_current_user)):
    return User(id=current_user["id"], email=current_user["email"], name=current_user["name"], team_id=current_user.get("team_id", current_user["id"]), role=current_user.get("role", "owner"))

# ============== Team / Collaborator Routes ==============

@api_router.post("/team/invite-code")
async def create_invite_code(current_user: dict = Depends(get_current_user)):
    """Generate a 6-character invite code that expires in 7 days."""
    import random
    import string
    code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
    invite = {
        "id": str(uuid.uuid4()),
        "code": code,
        "team_id": current_user.get("team_id", current_user["id"]),
        "invited_by_id": current_user["id"],
        "invited_by_name": current_user.get("name", ""),
        "invited_by_email": current_user.get("email", ""),
        "expires_at": datetime.utcnow() + timedelta(days=7),
        "used": False,
        "created_at": datetime.utcnow(),
    }
    await db.invites.insert_one(invite)
    return {"code": code, "expires_at": invite["expires_at"].isoformat(), "invited_by_name": invite["invited_by_name"]}

@api_router.post("/team/join")
async def join_team(data: TeamJoinRequest, current_user: dict = Depends(get_current_user)):
    """Join a team using an invite code. The user's existing personal data stays accessible (still owned by them) but they share the team workspace."""
    invite = await db.invites.find_one({"code": data.code.upper().strip(), "used": False})
    if not invite:
        raise HTTPException(status_code=404, detail="Invalid or expired invite code")
    if invite["expires_at"] < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Invite code expired")
    if invite["team_id"] == current_user.get("team_id"):
        raise HTTPException(status_code=400, detail="You're already on this team")
    
    # Update user's team_id
    new_team_id = invite["team_id"]
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"team_id": new_team_id, "role": "member"}}
    )
    # Mark invite as used
    await db.invites.update_one({"id": invite["id"]}, {"$set": {"used": True, "used_by_id": current_user["id"], "used_at": datetime.utcnow()}})
    
    return {"message": "Joined team successfully", "team_id": new_team_id, "invited_by": invite["invited_by_name"]}

@api_router.get("/team/members")
async def get_team_members(current_user: dict = Depends(get_current_user)):
    team_id = current_user.get("team_id", current_user["id"])
    members = await db.users.find({"team_id": team_id}).to_list(100)
    return [
        {"id": m["id"], "name": m.get("name", ""), "email": m.get("email", ""), "role": m.get("role", "owner"), "is_self": m["id"] == current_user["id"]}
        for m in members
    ]

@api_router.post("/team/leave")
async def leave_team(current_user: dict = Depends(get_current_user)):
    """Leave current team and revert to a personal solo workspace (own user_id as team_id)."""
    if current_user.get("team_id") == current_user["id"]:
        raise HTTPException(status_code=400, detail="Already in your personal workspace")
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"team_id": current_user["id"], "role": "owner"}}
    )
    return {"message": "Left team. You're back in your personal workspace."}

# ============== Push Notifications ==============

class PushTokenRequest(BaseModel):
    push_token: str
    platform: str = "android"

@api_router.post("/users/push-token")
async def register_push_token(data: PushTokenRequest, current_user: dict = Depends(get_current_user)):
    """Register a device's Expo push token for the current user."""
    if not data.push_token:
        raise HTTPException(status_code=400, detail="push_token required")
    ok = await push_service.upsert_push_token(
        db, current_user["id"], data.push_token, data.platform or "android"
    )
    return {"ok": True, "stored": ok}

@api_router.delete("/users/push-token")
async def unregister_push_token(data: PushTokenRequest, current_user: dict = Depends(get_current_user)):
    """Unregister a device's push token (e.g. on logout)."""
    if not data.push_token:
        raise HTTPException(status_code=400, detail="push_token required")
    await push_service.remove_push_token(db, current_user["id"], data.push_token)
    return {"ok": True}

@api_router.post("/notifications/test")
async def send_test_notification(current_user: dict = Depends(get_current_user)):
    """Send a test push notification to ALL of the current user's registered devices."""
    user = await db.users.find_one({"id": current_user["id"]})
    tokens = [t.get("token") for t in (user.get("expo_push_tokens") or []) if t.get("token")]
    if not tokens:
        raise HTTPException(status_code=400, detail="No push tokens registered for this user. Open the app on your phone (in a dev build) to register.")
    sent = await push_service.send_push(
        tokens,
        "AI Music Exec",
        "Push notifications are working! 🎵",
        data={"url": "/"},
    )
    return {"ok": True, "sent": sent, "tokens": len(tokens)}

# ============== Artist Routes ==============

@api_router.post("/artists", response_model=Artist)
async def create_artist(artist_data: ArtistCreate, current_user: dict = Depends(get_current_user)):
    artist_dict = artist_data.dict()
    artist_dict["id"] = str(uuid.uuid4())
    artist_dict["user_id"] = current_user["id"]
    artist_dict["team_id"] = current_user.get("team_id", current_user["id"])
    artist_dict["song_count"] = 0
    artist_dict["created_at"] = datetime.utcnow()
    artist_dict["updated_at"] = datetime.utcnow()
    
    await db.artists.insert_one(artist_dict)
    return Artist(**artist_dict)

# ============== AI Artist Generator ==============

class ArtistGenerateRequest(BaseModel):
    location: str = ""  # e.g., "Baltimore, MD"
    influences: List[str] = []  # e.g., ["Juice WRLD", "Travis Scott", "XXXTentacion"]
    genres: List[str] = []  # optional genre hints
    vibe: str = ""  # optional descriptor
    custom_prompt: str = ""  # optional free-form direction

@api_router.post("/artists/ai-generate")
async def ai_generate_artist(data: ArtistGenerateRequest, current_user: dict = Depends(get_current_user)):
    """Generate a unique fictional artist profile based on location + real-life influences."""
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=503, detail="AI not configured")
    if not data.influences and not data.custom_prompt:
        raise HTTPException(status_code=400, detail="Provide at least one influence or a custom prompt")
    
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"artistgen-{uuid.uuid4()}",
            system_message="""You are a creative A&R / brand strategist. Given real-life artist influences and a location, you craft an original fictional artist profile that fuses those influences into something fresh. Always ground your suggestions in real, recognizable production/sonic signatures. Return ONLY valid JSON.

CRITICAL COPYRIGHT RULE FOR SUNO PROMPTS:
The fields `suno_style_template`, `suno_voice_suggestion`, and `first_3_song_ideas[].suno_style` MUST NEVER contain real artist names. Use only sonic descriptors (e.g., "melodic emo rap, autotuned cracked vocals, atmospheric trap drums, foggy synths, 808 sub bass, distorted hooks, BPM 75-90"). Real artist names ARE allowed in `bio`, `backstory`, `synthesized_profile`, and `influence_breakdown` because those are internal references."""
        ).with_model("openai", "gpt-5.2")
        
        prompt_parts = []
        if data.location:
            prompt_parts.append(f"Location/origin: {data.location}")
        if data.influences:
            prompt_parts.append(f"Real-life influences: {', '.join(data.influences)}")
        if data.genres:
            prompt_parts.append(f"Genre hints: {', '.join(data.genres)}")
        if data.vibe:
            prompt_parts.append(f"Vibe: {data.vibe}")
        if data.custom_prompt:
            prompt_parts.append(f"Additional direction: {data.custom_prompt}")
        
        prompt = f"""Brief:
{chr(10).join(prompt_parts)}

Generate a complete artist profile. Return ONLY this JSON:
{{
  "name_suggestions": ["3-5 unique artist name ideas"],
  "primary_name": "the strongest single name pick from the list",
  "bio": "Public-facing 2-3 sentence bio",
  "backstory": "Imaginary 4-6 sentence origin story to inspire catalog themes (where they grew up, what shaped them, how they came up, key turning points)",
  "unique_sound": "One-sentence pitch of their sonic signature",
  "tone": "voice/personality (e.g., 'introspective and raw', 'cocky and playful')",
  "themes": ["3-5 recurring lyrical themes they would explore"],
  "genres": ["primary genre", "secondary genre"],
  "branding": {{
    "color_palette": ["hex or color name", "..."],
    "visual_style": "describe their look/aesthetic in one phrase",
    "aesthetic": "broader cultural/visual mood",
    "mood_keywords": ["3-5 mood descriptors"]
  }},
  "suno_voice_suggestion": "Suggested Suno voice keywords (e.g., 'male tenor, raspy, melodic')",
  "suno_style_template": "A starter Suno style prompt that captures the synthesized sound (no real-artist names)",
  "suno_exclusions": "Default exclusions to keep them on-brand",
  "influence_breakdown": [
    {{
      "influence": "real-life artist name (must be from the brief)",
      "signature_sound": "describe their actual production/vocal/lyrical signature in detail",
      "what_we_pull": "specific elements being borrowed (e.g., 'Travis Scott\\'s atmospheric ad-libs and pitched-down vocals'); be concrete",
      "what_we_drop": "what we intentionally leave out so we don't sound like a clone"
    }}
  ],
  "synthesized_profile": "A cohesive 3-4 sentence summary of how the influences fuse into this NEW unique artist (this is the 'recipe').",
  "first_3_song_ideas": [
    {{"title": "song title idea", "concept": "1-2 sentence concept", "suno_style": "starter style prompt"}}
  ],
  "next_steps": ["actionable suggestions like 'commission cover art', 'write 3 hooks in this voice', etc."]
}}"""
        
        user_message = UserMessage(text=prompt)
        response = await chat.send_message(user_message)
        
        import json
        result = None
        try:
            json_start = response.find('{')
            json_end = response.rfind('}') + 1
            if json_start >= 0 and json_end > json_start:
                result = json.loads(response[json_start:json_end])
        except Exception as e:
            logger.error(f"Failed to parse artist generation: {e}")
            result = {"raw": response}
        
        return result
    except Exception as e:
        logger.error(f"AI generate artist error: {e}")
        raise HTTPException(status_code=500, detail=f"AI generation failed: {str(e)}")

class ArtistRefineRequest(BaseModel):
    current_profile: dict
    instruction: str
    brief: dict = {}

@api_router.post("/artists/ai-refine")
async def refine_ai_artist(data: ArtistRefineRequest, current_user: dict = Depends(get_current_user)):
    """Iteratively refine an AI-generated artist profile. Returns the updated profile in the same shape."""
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=503, detail="AI service not configured")
    if not data.instruction or not data.instruction.strip():
        raise HTTPException(status_code=400, detail="instruction required")
    if not data.current_profile:
        raise HTTPException(status_code=400, detail="current_profile required")

    brief = data.brief or {}
    influences = brief.get("influences", [])
    location = brief.get("location", "")

    system_message = f"""You are an A&R / creative director. You will REFINE an existing AI-generated artist profile based on the user's new instruction. Keep the parts they didn't ask to change. Only modify what the instruction targets.

CRITICAL OUTPUT RULES:
- Return ONLY valid JSON, no preamble, no code-fence, no explanation
- Preserve the EXACT same top-level keys as the input profile
- Maintain all sub-keys inside `branding`, `influence_breakdown` items, `starter_songs` items, etc.
- If the instruction is vague, make a reasonable creative decision but keep the existing flavor where possible
- Do NOT include real artist names in the artist's own bio/backstory/branding (only fine in `influence_breakdown.influence` field which refers to real artists for context)
- Suno style prompts (in `suno_voice` and `starter_songs[].suno_style`) MUST use sonic descriptors only — NEVER real artist names
- Keep the same JSON structure so the frontend doesn't break"""

    user_text = f"""ORIGINAL BRIEF:
- Location: {location or 'unspecified'}
- Real-life influences: {', '.join(influences) if influences else 'unspecified'}
- Genres: {', '.join(brief.get('genres', []))}
- Vibe: {brief.get('vibe', '')}
- Custom direction: {brief.get('custom_prompt', '')}

CURRENT PROFILE (refine THIS in place):
{json.dumps(data.current_profile, indent=2)}

REFINEMENT INSTRUCTION FROM USER:
"{data.instruction}"

Return the FULL refined profile JSON with the same keys. No markdown fence, no explanation, just the JSON."""

    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"artist-refine-{current_user['id']}-{int(datetime.utcnow().timestamp())}",
            system_message=system_message,
        ).with_model("openai", "gpt-5.2")
        response = await chat.send_message(UserMessage(text=user_text))

        # Strip potential code fences and parse JSON
        raw = response.strip()
        if raw.startswith("```"):
            raw = re.sub(r"^```(?:json)?\s*", "", raw)
            raw = re.sub(r"\s*```\s*$", "", raw)
        try:
            refined = json.loads(raw)
        except Exception:
            # Fallback: try to extract the largest JSON object from the response
            m = re.search(r"\{.*\}", raw, re.DOTALL)
            if not m:
                raise HTTPException(status_code=500, detail="AI refinement returned non-JSON output")
            refined = json.loads(m.group(0))

        # Preserve any keys the AI may have dropped by merging on top of the original
        merged = {**data.current_profile, **refined}
        # Track refinement history for the UI
        history = merged.get("refinement_history", [])
        if not isinstance(history, list):
            history = []
        history.append({
            "instruction": data.instruction,
            "timestamp": datetime.utcnow().isoformat(),
            "user_name": current_user.get("name", ""),
        })
        merged["refinement_history"] = history
        return merged
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"AI refine artist error: {e}")
        raise HTTPException(status_code=500, detail=f"AI refinement failed: {str(e)}")

@api_router.post("/artists/from-ai-generation")
async def create_artist_from_ai(data: dict, current_user: dict = Depends(get_current_user)):
    """Create an artist record using a previously-generated AI profile, saving the full generation log to saved_prompts."""
    profile = data.get("profile", {})
    raw_brief = data.get("brief", {})  # original ArtistGenerateRequest
    
    name = data.get("name") or profile.get("primary_name") or (profile.get("name_suggestions") or [""])[0]
    if not name:
        raise HTTPException(status_code=400, detail="Artist name required")
    
    # Build summary text for saved prompt
    lines = [f"=== AI Artist Generation ===\nGenerated: {datetime.utcnow().strftime('%b %d, %Y at %H:%M UTC')}\n"]
    if raw_brief:
        lines.append("--- Brief ---")
        if raw_brief.get("location"): lines.append(f"Location: {raw_brief['location']}")
        if raw_brief.get("influences"): lines.append(f"Influences: {', '.join(raw_brief['influences'])}")
        if raw_brief.get("genres"): lines.append(f"Genres: {', '.join(raw_brief['genres'])}")
        if raw_brief.get("vibe"): lines.append(f"Vibe: {raw_brief['vibe']}")
        if raw_brief.get("custom_prompt"): lines.append(f"Direction: {raw_brief['custom_prompt']}")
    lines.append("")
    if profile.get("synthesized_profile"):
        lines.append(f"--- Synthesis ---\n{profile['synthesized_profile']}\n")
    if profile.get("backstory"):
        lines.append(f"--- Backstory ---\n{profile['backstory']}\n")
    if profile.get("influence_breakdown"):
        lines.append("--- Influence Breakdown ---")
        for inf in profile["influence_breakdown"]:
            if isinstance(inf, dict):
                lines.append(f"\n{inf.get('influence', '')}:")
                lines.append(f"  Signature: {inf.get('signature_sound', '')}")
                lines.append(f"  Pulling: {inf.get('what_we_pull', '')}")
                lines.append(f"  Dropping: {inf.get('what_we_drop', '')}")
    if profile.get("first_3_song_ideas"):
        lines.append("\n--- Starter Song Ideas ---")
        for i, s in enumerate(profile["first_3_song_ideas"]):
            if isinstance(s, dict):
                lines.append(f"{i+1}. {s.get('title', '')}: {s.get('concept', '')}")
                if s.get("suno_style"):
                    lines.append(f"   Suno style: {s['suno_style']}")
    if profile.get("next_steps"):
        lines.append("\n--- Next Steps ---")
        for s in profile["next_steps"]:
            lines.append(f"- {s}")
    saved_summary = "\n".join(lines)
    
    artist_dict = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "team_id": current_user.get("team_id", current_user["id"]),
        "name": name,
        "bio": profile.get("bio", ""),
        "unique_sound": profile.get("unique_sound", ""),
        "genres": profile.get("genres", []),
        "themes": profile.get("themes", []),
        "tone": profile.get("tone", ""),
        "patterns": [],
        "branding": profile.get("branding", {"color_palette": [], "visual_style": "", "aesthetic": "", "mood_keywords": []}),
        "image_url": "",
        "profile_image": "",
        "character_images": [],
        "visual_brief": "",
        "visual_references": [],
        "suno_voice": profile.get("suno_voice_suggestion", ""),
        "suno_exclusions": profile.get("suno_exclusions", ""),
        "notes": profile.get("backstory", ""),
        "is_private": False,
        "song_count": 0,
        "saved_prompts": [
            {
                "id": str(uuid.uuid4()),
                "prompt_type": "ai_artist_generation",
                "label": f"AI Generation \u00b7 {datetime.utcnow().strftime('%b %d, %Y')}",
                "content": saved_summary,
                "saved_by_id": current_user["id"],
                "saved_by_name": current_user.get("name", ""),
                "created_at": datetime.utcnow().isoformat(),
            }
        ],
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    await db.artists.insert_one(artist_dict)
    return {k: v for k, v in artist_dict.items() if k != "_id"}

# ============== Saved Prompts on Artists ==============

@api_router.post("/artists/{artist_id}/saved-prompts")
async def add_artist_saved_prompt(artist_id: str, data: SavedPromptCreate, current_user: dict = Depends(get_current_user)):
    artist = await db.artists.find_one(team_query(current_user, {"id": artist_id}))
    if not artist:
        raise HTTPException(status_code=404, detail="Artist not found")
    prompt = {
        "id": str(uuid.uuid4()),
        "prompt_type": data.prompt_type,
        "label": data.label,
        "content": data.content,
        "saved_by_id": current_user["id"],
        "saved_by_name": current_user.get("name", ""),
        "created_at": datetime.utcnow().isoformat(),
    }
    await db.artists.update_one(
        {"id": artist_id},
        {"$push": {"saved_prompts": prompt}, "$set": {"updated_at": datetime.utcnow()}}
    )
    return prompt

@api_router.delete("/artists/{artist_id}/saved-prompts/{prompt_id}")
async def delete_artist_saved_prompt(artist_id: str, prompt_id: str, current_user: dict = Depends(get_current_user)):
    artist = await db.artists.find_one(team_query(current_user, {"id": artist_id}))
    if not artist:
        raise HTTPException(status_code=404, detail="Artist not found")
    await db.artists.update_one(
        {"id": artist_id},
        {"$pull": {"saved_prompts": {"id": prompt_id}}, "$set": {"updated_at": datetime.utcnow()}}
    )
    return {"message": "Saved prompt deleted"}

@api_router.get("/artists", response_model=None)
async def get_artists(
    search: Optional[str] = None,
    genre: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """List artists for the current team workspace.

    Reads each MongoDB doc, normalizes any legacy/malformed shape via
    `normalize_artist_doc`, then validates against the Artist Pydantic
    model. Documents that are still invalid after normalization are
    skipped with a warning log (id + sanitized error) so a single
    corrupt record cannot 500 the entire endpoint.
    """
    query = team_query(current_user)

    # Projection excludes the big `saved_prompts` arrays for list view. Pydantic Artist defaults to [].
    artists = await db.artists.find(
    	query,
    	{
            "_id": 0,
            "saved_prompts": 0,
            "profile_image": 0,
            "character_images": 0,
            "visual_references": 0,
    	},
    ).to_list(1000)

    # Apply text/genre filters BEFORE Pydantic validation so the filter
    # criteria operate on raw shapes too (e.g. a doc with genres as a
    # string still gets filtered correctly).
    if search:
        search_lower = search.lower()
        artists = [a for a in artists if
                   search_lower in (a.get("name") or "").lower() or
                   search_lower in (a.get("bio") or "").lower() or
                   search_lower in (a.get("unique_sound") or "").lower()]

    if genre:
        genre_lower = genre.lower()
        def _has_genre(a):
            g = a.get("genres") or []
            if isinstance(g, str):
                return genre_lower in g.lower()
            return any(genre_lower in str(x).lower() for x in g if isinstance(x, (str, dict)))
        artists = [a for a in artists if _has_genre(a)]

    objects, _counts, _skipped = safe_validate_many(
        Artist, artists, normalize_artist_doc, log_label="GET /api/artists",
    )
    return objects

@api_router.get("/artists/{artist_id}", response_model=None)
async def get_artist(artist_id: str, current_user: dict = Depends(get_current_user)):
    artist = await db.artists.find_one(
        team_query(current_user, {"id": artist_id}),
        {
            "_id": 0,
            "saved_prompts": 0,
            "profile_image": 0,
            "character_images": 0,
            "visual_references": 0,
        },
    )
    if not artist:
        raise HTTPException(status_code=404, detail="Artist not found")
    obj, status, err = safe_validate(Artist, artist, normalize_artist_doc)
    if obj is None:
        # Truly unrecoverable single doc — log and surface a clear 422 so
        # the client can show a "this artist record is corrupt" message
        # rather than silently empty data.
        logger.warning("[GET /api/artists/%s] unrecoverable: %s", artist_id, err)
        raise HTTPException(
            status_code=422,
            detail=f"Artist record is malformed and could not be normalized: {err}",
        )
    return obj

@api_router.put("/artists/{artist_id}", response_model=Artist)
async def update_artist(artist_id: str, artist_data: ArtistCreate, current_user: dict = Depends(get_current_user)):
    artist = await db.artists.find_one(team_query(current_user, {"id": artist_id}))
    if not artist:
        raise HTTPException(status_code=404, detail="Artist not found")
    
    update_dict = artist_data.dict()
    update_dict["updated_at"] = datetime.utcnow()
    
    await db.artists.update_one({"id": artist_id}, {"$set": update_dict})
    updated = await db.artists.find_one({"id": artist_id})
    return Artist(**updated)

@api_router.delete("/artists/{artist_id}")
async def delete_artist(artist_id: str, current_user: dict = Depends(get_current_user)):
    artist = await db.artists.find_one(team_query(current_user, {"id": artist_id}))
    if not artist:
        raise HTTPException(status_code=404, detail="Artist not found")
    await db.artists.update_one(
        {"id": artist_id},
        {"$set": {"deleted_at": datetime.utcnow(), "deleted_by_id": current_user["id"]}}
    )
    return {"message": "Artist moved to trash. Restore from Trash within 30 days."}

# ============== Song Routes ==============

@api_router.post("/songs", response_model=Song)
async def create_song(song_data: SongCreate, current_user: dict = Depends(get_current_user)):
    song_dict = song_data.dict()
    song_dict["id"] = str(uuid.uuid4())
    song_dict["user_id"] = current_user["id"]
    song_dict["team_id"] = current_user.get("team_id", current_user["id"])
    song_dict["created_at"] = datetime.utcnow()
    song_dict["updated_at"] = datetime.utcnow()
    
    # Update artist song count
    if song_data.artist_id:
        await db.artists.update_one(
            team_query(current_user, {"id": song_data.artist_id}),
            {"$inc": {"song_count": 1}}
        )
    
    await db.songs.insert_one(song_dict)
    await log_activity(current_user, "created", "song", song_dict["id"], {"title": song_dict["title"]})
    return Song(**song_dict)

@api_router.get("/songs", response_model=List[Song])
async def get_songs(
    artist_id: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    genre: Optional[str] = None,
    has_versions: Optional[bool] = None,
    current_user: dict = Depends(get_current_user)
):
    query = team_query(current_user)
    if artist_id:
        query["artist_id"] = artist_id
    if status:
        query["status"] = status
    if genre:
        query["genre"] = {"$regex": genre, "$options": "i"}
    if has_versions is not None:
        if has_versions:
            query["versions"] = {"$exists": True, "$ne": []}
        else:
            query["$or"] = [{"versions": {"$exists": False}}, {"versions": []}]
    
    # Projection excludes huge `saved_prompts` arrays for list view (they can be 5-20KB each)
    songs = await db.songs.find(query, {"_id": 0, "saved_prompts": 0}).sort("updated_at", -1).to_list(1000)
    
    # Apply text search filter if provided
    if search:
        search_lower = search.lower()
        songs = [s for s in songs if 
                 search_lower in s.get("title", "").lower() or 
                 search_lower in s.get("lyrics", "").lower() or
                 search_lower in s.get("notes", "").lower()]
    
    return [Song(**s) for s in songs]

@api_router.get("/songs/{song_id}", response_model=Song)
async def get_song(song_id: str, current_user: dict = Depends(get_current_user)):
    song = await db.songs.find_one(team_query(current_user, {"id": song_id}))
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")
    return Song(**song)

@api_router.put("/songs/{song_id}", response_model=Song)
async def update_song(song_id: str, song_data: SongCreate, current_user: dict = Depends(get_current_user)):
    song = await db.songs.find_one(team_query(current_user, {"id": song_id}))
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")
    
    update_dict = song_data.dict()
    update_dict["updated_at"] = datetime.utcnow()
    
    status_changed = song.get("status") != update_dict.get("status")
    
    await db.songs.update_one({"id": song_id}, {"$set": update_dict})
    updated = await db.songs.find_one({"id": song_id})
    activity_details = {"title": updated.get("title", "")}
    if status_changed:
        activity_details["status_changed"] = True
        activity_details["new_status"] = update_dict.get("status", "")
        activity_details["old_status"] = song.get("status", "")
    await log_activity(current_user, "updated", "song", song_id, activity_details)
    return Song(**updated)

@api_router.delete("/songs/{song_id}")
async def delete_song(song_id: str, current_user: dict = Depends(get_current_user)):
    song = await db.songs.find_one(team_query(current_user, {"id": song_id}))
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")
    
    # Decrement artist song count
    if song.get("artist_id"):
        await db.artists.update_one(
            {"id": song["artist_id"]},
            {"$inc": {"song_count": -1}}
        )
    
    await db.songs.update_one(
        {"id": song_id},
        {"$set": {"deleted_at": datetime.utcnow(), "deleted_by_id": current_user["id"]}}
    )
    await log_activity(current_user, "deleted", "song", song_id, {"title": song.get("title", "")})
    return {"message": "Song moved to trash. Restore from Trash within 30 days."}

# Add version to song
@api_router.post("/songs/{song_id}/versions", response_model=Song)
async def add_song_version(song_id: str, version: SongVersion, current_user: dict = Depends(get_current_user)):
    song = await db.songs.find_one(team_query(current_user, {"id": song_id}))
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")
    
    version_dict = version.dict()
    version_dict["id"] = str(uuid.uuid4())
    version_dict["created_at"] = datetime.utcnow()
    
    await db.songs.update_one(
        {"id": song_id},
        {
            "$push": {"versions": version_dict},
            "$set": {"updated_at": datetime.utcnow()}
        }
    )
    
    updated = await db.songs.find_one({"id": song_id})
    return Song(**updated)

# ============== Ideas Routes ==============

@api_router.post("/ideas", response_model=Idea)
async def create_idea(idea_data: IdeaCreate, current_user: dict = Depends(get_current_user)):
    idea_dict = idea_data.dict()
    idea_dict["id"] = str(uuid.uuid4())
    idea_dict["user_id"] = current_user["id"]
    idea_dict["team_id"] = current_user.get("team_id", current_user["id"])
    idea_dict["created_at"] = datetime.utcnow()
    idea_dict["updated_at"] = datetime.utcnow()
    
    await db.ideas.insert_one(idea_dict)
    await log_activity(current_user, "created", "idea", idea_dict["id"], {"title": idea_dict.get("title", "")})
    return Idea(**idea_dict)

@api_router.get("/ideas", response_model=List[Idea])
async def get_ideas(
    type: Optional[str] = None,
    search: Optional[str] = None,
    linked_artist_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = team_query(current_user)
    if type:
        query["type"] = type
    if linked_artist_id:
        query["linked_artist_id"] = linked_artist_id
    
    ideas = await db.ideas.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    if search:
        search_lower = search.lower()
        ideas = [i for i in ideas if 
                 search_lower in i.get("title", "").lower() or 
                 search_lower in i.get("content", "").lower() or
                 any(search_lower in t.lower() for t in i.get("tags", []))]
    
    return [Idea(**i) for i in ideas]

@api_router.get("/ideas/{idea_id}", response_model=Idea)
async def get_idea(idea_id: str, current_user: dict = Depends(get_current_user)):
    idea = await db.ideas.find_one(team_query(current_user, {"id": idea_id}))
    if not idea:
        raise HTTPException(status_code=404, detail="Idea not found")
    return Idea(**idea)

@api_router.put("/ideas/{idea_id}", response_model=Idea)
async def update_idea(idea_id: str, idea_data: IdeaCreate, current_user: dict = Depends(get_current_user)):
    idea = await db.ideas.find_one(team_query(current_user, {"id": idea_id}))
    if not idea:
        raise HTTPException(status_code=404, detail="Idea not found")
    
    update_dict = idea_data.dict()
    update_dict["updated_at"] = datetime.utcnow()
    
    await db.ideas.update_one({"id": idea_id}, {"$set": update_dict})
    updated = await db.ideas.find_one({"id": idea_id})
    return Idea(**updated)

@api_router.delete("/ideas/{idea_id}")
async def delete_idea(idea_id: str, current_user: dict = Depends(get_current_user)):
    idea = await db.ideas.find_one(team_query(current_user, {"id": idea_id}))
    if not idea:
        raise HTTPException(status_code=404, detail="Idea not found")
    await db.ideas.update_one(
        {"id": idea_id},
        {"$set": {"deleted_at": datetime.utcnow(), "deleted_by_id": current_user["id"]}}
    )
    return {"message": "Idea moved to trash"}

# ============== Distribution Routes ==============

@api_router.post("/distributions", response_model=Distribution)
async def create_distribution(dist_data: DistributionCreate, current_user: dict = Depends(get_current_user)):
    dist_dict = dist_data.dict()
    dist_dict["id"] = str(uuid.uuid4())
    dist_dict["user_id"] = current_user["id"]
    dist_dict["team_id"] = current_user.get("team_id", current_user["id"])
    dist_dict["created_at"] = datetime.utcnow()
    dist_dict["updated_at"] = datetime.utcnow()
    
    await db.distributions.insert_one(dist_dict)
    return Distribution(**dist_dict)

@api_router.get("/distributions", response_model=List[Distribution])
async def get_distributions(
    song_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = team_query(current_user)
    if song_id:
        query["song_id"] = song_id
    
    dists = await db.distributions.find(query).to_list(1000)
    return [Distribution(**d) for d in dists]

@api_router.put("/distributions/{dist_id}", response_model=Distribution)
async def update_distribution(dist_id: str, dist_data: DistributionCreate, current_user: dict = Depends(get_current_user)):
    dist = await db.distributions.find_one(team_query(current_user, {"id": dist_id}))
    if not dist:
        raise HTTPException(status_code=404, detail="Distribution not found")
    
    update_dict = dist_data.dict()
    update_dict["updated_at"] = datetime.utcnow()
    
    await db.distributions.update_one({"id": dist_id}, {"$set": update_dict})
    updated = await db.distributions.find_one({"id": dist_id})
    return Distribution(**updated)

# ============== AI Analysis Routes ==============

@api_router.post("/ai/analyze", response_model=AIAnalysisResponse)
async def ai_analyze(request: AIAnalysisRequest, current_user: dict = Depends(get_current_user)):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="AI service not configured")
    
    # Build context from artist if provided
    artist_context = ""
    if request.artist_id:
        artist = await db.artists.find_one(team_query(current_user, {"id": request.artist_id}))
        if artist:
            artist_context = f"""
Artist Profile:
- Name: {artist.get('name', '')}
- Unique Sound: {artist.get('unique_sound', '')}
- Genres: {', '.join(artist.get('genres', []))}
- Themes: {', '.join(artist.get('themes', []))}
- Tone: {artist.get('tone', '')}
- Patterns: {', '.join(artist.get('patterns', []))}
- Visual Style: {artist.get('branding', {}).get('visual_style', '')}
- Aesthetic: {artist.get('branding', {}).get('aesthetic', '')}
- Mood Keywords: {', '.join(artist.get('branding', {}).get('mood_keywords', []))}
"""

    # Build system message based on analysis type
    system_messages = {
        "lyrics": """You are an expert music lyricist and analyst. Analyze the provided lyrics for:
- Themes and emotional content
- Rhyme schemes and flow patterns
- Storytelling elements
- Areas for improvement
Provide constructive feedback without using copyrighted material references.""",
        
        "style": """You are a music style expert. Analyze the provided content to identify:
- Genre characteristics
- Production style elements
- Tempo and energy markers
- Mood and atmosphere
Create descriptions suitable for AI music generators like Suno, without referencing specific artists or songs.""",
        
        "artist_match": f"""You are an AI music executive analyzing content for artist consistency.
{artist_context}
Analyze how well the provided content matches this artist's established identity.
Provide feedback on alignment with their tone, themes, and patterns.""",
        
        "suno_prompt": """You are an expert at creating prompts for AI music generators like Suno.
Create a detailed style prompt that captures the musical essence without using:
- Specific artist names
- Specific song titles
- Copyrighted material references
Include: genre, mood, tempo, instrumentation, vocal style, production elements.""",
        
        "enhance_lyrics": f"""You are a professional lyricist helping enhance song lyrics.
{artist_context}
Suggest improvements while maintaining the original message and matching the artist's voice.
Provide specific line-by-line suggestions and alternative phrasings."""
    }
    
    system_message = system_messages.get(request.analysis_type, system_messages["lyrics"])
    
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"analysis-{current_user['id']}-{uuid.uuid4()}",
            system_message=system_message
        ).with_model("openai", "gpt-5.2")
        
        user_message = UserMessage(text=f"Please analyze the following:\n\n{request.content}")
        response = await chat.send_message(user_message)
        
        # Extract suggestions (simplified parsing)
        suggestions = []
        if "suggest" in response.lower() or "recommend" in response.lower():
            lines = response.split('\n')
            for line in lines:
                if line.strip().startswith('-') or line.strip().startswith('•'):
                    suggestions.append(line.strip().lstrip('-•').strip())
        
        # Generate Suno prompt if requested
        suno_prompt = None
        if request.analysis_type == "suno_prompt":
            suno_prompt = response
        
        return AIAnalysisResponse(
            analysis=response,
            suggestions=suggestions[:10],  # Limit to 10 suggestions
            suno_prompt=suno_prompt
        )
        
    except Exception as e:
        logger.error(f"AI analysis error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"AI analysis failed: {str(e)}")

# Quick Suno prompt generation
@api_router.post("/ai/suno-prompt")
async def generate_suno_prompt(
    genre: str,
    mood: str,
    tempo: str = "medium",
    vocals: str = "melodic",
    instruments: str = "",
    current_user: dict = Depends(get_current_user)
):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="AI service not configured")
    
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"suno-{current_user['id']}-{uuid.uuid4()}",
            system_message="""Create a Suno-compatible music style prompt. 
Rules:
- NO artist names or song references
- Include: genre, mood, tempo, instrumentation, vocal style
- Be specific about production elements
- Keep it concise (under 200 words)"""
        ).with_model("openai", "gpt-5.2")
        
        prompt = f"""Create a Suno prompt for:
- Genre: {genre}
- Mood: {mood}
- Tempo: {tempo}
- Vocals: {vocals}
- Instruments: {instruments if instruments else 'appropriate for genre'}"""
        
        user_message = UserMessage(text=prompt)
        response = await chat.send_message(user_message)
        
        return {"suno_prompt": response}
        
    except Exception as e:
        logger.error(f"Suno prompt generation error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Prompt generation failed: {str(e)}")

# ============== Dashboard Stats ==============

@api_router.get("/dashboard/stats")
async def get_dashboard_stats(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    
    artist_count = await db.artists.count_documents(team_query(current_user))
    song_count = await db.songs.count_documents(team_query(current_user))
    idea_count = await db.ideas.count_documents(team_query(current_user))
    
    # Song status breakdown
    draft_count = await db.songs.count_documents(team_query(current_user, {"status": "draft"}))
    in_progress_count = await db.songs.count_documents(team_query(current_user, {"status": "in_progress"}))
    final_count = await db.songs.count_documents(team_query(current_user, {"status": "final"}))
    released_count = await db.songs.count_documents(team_query(current_user, {"status": "released"}))
    
    # Recent activity
    recent_songs = await db.songs.find({"user_id": user_id}).sort("updated_at", -1).limit(5).to_list(5)
    recent_ideas = await db.ideas.find({"user_id": user_id}).sort("created_at", -1).limit(5).to_list(5)
    
    return {
        "artist_count": artist_count,
        "song_count": song_count,
        "idea_count": idea_count,
        "song_status": {
            "draft": draft_count,
            "in_progress": in_progress_count,
            "final": final_count,
            "released": released_count
        },
        "recent_songs": [{"id": s["id"], "title": s["title"], "status": s["status"]} for s in recent_songs],
        "recent_ideas": [{"id": i["id"], "title": i["title"], "type": i["type"]} for i in recent_ideas]
    }

# ============== Diagnostic: validation health =================
# Protected, owner/admin-only, returns sanitized validation summary so we
# can identify which prod documents need cleanup WITHOUT exposing private
# content, tokens, or images. Safe to leave deployed; easy to delete.

_DIAG_ALLOWED_COLLECTIONS = {
    "artists":     (Artist,     normalize_artist_doc),
    "collections": (Collection, normalize_collection_doc),
}

def _diag_allowed(current_user: dict) -> bool:
    """Allow team owners / admins to call the diagnostic endpoint, plus
    anyone in dev (`ENVIRONMENT=development`)."""
    if os.environ.get("ENVIRONMENT", "").lower() in ("dev", "development", "local"):
        return True
    role = (current_user.get("role") or "").lower()
    if role in ("owner", "admin"):
        return True
    # A user that owns their own team (team_id == own id) is implicitly the owner
    if current_user.get("team_id") in (None, "", current_user.get("id")):
        return True
    return False

@api_router.get("/_diag/validate")
async def diag_validate(
    collection: str = "artists",
    current_user: dict = Depends(get_current_user),
):
    """Report validation/normalization health for the current team's records.

    Auth required. Owner/admin (or dev mode) only. Returns ONLY:
      - per-collection totals (total / clean / normalized / unrecoverable)
      - per-document id, display_name, status, sanitized error string
      - dashboard-count vs visible-list comparison so any discrepancy is
        explicit, not silently forced to match.

    Never returns full document bodies, image payloads, tokens, lyrics,
    private notes, or any other user data.
    """
    if collection not in _DIAG_ALLOWED_COLLECTIONS:
        raise HTTPException(
            status_code=400,
            detail=f"unknown collection; allowed: {sorted(_DIAG_ALLOWED_COLLECTIONS.keys())}",
        )
    if not _diag_allowed(current_user):
        raise HTTPException(status_code=403, detail="diagnostic endpoint requires owner/admin")

    model_cls, normalizer = _DIAG_ALLOWED_COLLECTIONS[collection]

    query = team_query(current_user)
    dashboard_count = await db[collection].count_documents(query)
    docs = await db[collection].find(query, {"_id": 0}).to_list(2000)

    counts = {"total": len(docs), "clean": 0, "normalized": 0, "skipped": 0}
    per_doc: List[Dict[str, Any]] = []
    for d in docs:
        _obj, status, err = safe_validate(model_cls, d, normalizer)
        counts[status] += 1
        per_doc.append({
            "id": d.get("id"),
            "display_name": d.get("name") or d.get("title"),
            "status": status,
            "error": err,  # sanitized "field_path:error_type; ..." string from safe_validate
        })

    visible_count = counts["clean"] + counts["normalized"]
    discrepancy = dashboard_count - visible_count

    return {
        "collection": collection,
        "dashboard_count": dashboard_count,
        "visible_count": visible_count,
        "discrepancy": discrepancy,
        "counts": counts,
        "records": per_doc,
        "diag_allowed_reason": "owner_or_admin_or_dev_mode",
    }

# ============== Quick Add Song with AI Analysis ==============

class QuickAddSong(BaseModel):
    title: str
    lyrics: str = ""
    style_prompt: str = ""
    artist_id: Optional[str] = None
    authorship: str = "original"  # original, ai_generated, collab
    collection_id: Optional[str] = None  # primary release/album
    playlist_ids: List[str] = []         # additional playlists this song belongs to

@api_router.post("/songs/quick-add")
async def quick_add_song(data: QuickAddSong, current_user: dict = Depends(get_current_user)):
    """Creates a song and returns AI-analyzed suggestions for missing fields"""
    
    # Create the song first as draft
    song_dict = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "team_id": current_user.get("team_id", current_user["id"]),
        "title": data.title,
        "artist_id": data.artist_id,
        "featured_artist_ids": [],
        "collection_id": data.collection_id,
        "playlist_ids": data.playlist_ids or [],
        "lyrics": data.lyrics,
        "authorship": data.authorship,
        "style_prompt": data.style_prompt,
        "style_secondary": "",
        "style_alternate": "",
        "additional_styles": [],
        "exclusions": "",
        "genre": "",
        "mood": "",
        "tempo": "",
        "themes": [],
        "status": "draft",
        "notes": "",
        "todo": [],
        "versions": [],
        "suno_generations": [],
        "track_number": 0,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    
    await db.songs.insert_one(song_dict)
    if data.artist_id:
        await db.artists.update_one({"id": data.artist_id}, {"$inc": {"song_count": 1}})

    # Recount tracks for any collections this song was added to (consistent with PUT /collections handler)
    affected_collection_ids: List[str] = []
    if data.collection_id:
        affected_collection_ids.append(data.collection_id)
    for pid in (data.playlist_ids or []):
        if pid and pid not in affected_collection_ids:
            affected_collection_ids.append(pid)
    for cid in affected_collection_ids:
        track_count = await db.songs.count_documents(team_query(current_user, {
            "$or": [{"collection_id": cid}, {"playlist_ids": cid}]
        }))
        await db.collections.update_one({"id": cid}, {"$set": {"track_count": track_count, "updated_at": datetime.utcnow()}})
    
    # AI Analysis if we have content to analyze
    ai_suggestions = None
    if EMERGENT_LLM_KEY and (data.lyrics or data.style_prompt):
        try:
            # Build artist context — full roster so AI can suggest fits
            roster = await db.artists.find(team_query(current_user)).to_list(100)
            roster_summary = "\n".join([
                f"- {a.get('name','')}: {a.get('unique_sound','')[:80]} | genres: {', '.join(a.get('genres',[]))} | tone: {a.get('tone','')[:50]}"
                for a in roster
            ]) if roster else "(no artists in roster yet)"

            artist_context = ""
            if data.artist_id:
                artist = next((a for a in roster if a.get("id") == data.artist_id), None)
                if artist:
                    artist_songs = await db.songs.find(team_query(current_user, {"artist_id": data.artist_id})).to_list(50)
                    existing_genres = list(set(s.get("genre", "") for s in artist_songs if s.get("genre")))
                    existing_moods = list(set(s.get("mood", "") for s in artist_songs if s.get("mood")))
                    artist_context = f"""
Currently Assigned Artist: {artist.get('name', '')}
Sound: {artist.get('unique_sound', '')}
Genres: {', '.join(artist.get('genres', []))}
Tone: {artist.get('tone', '')}
Existing catalog genres: {', '.join(existing_genres)}
Existing catalog moods: {', '.join(existing_moods)}"""

            chat = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=f"quickadd-{uuid.uuid4()}",
                system_message=f"""You are an A&R assistant for an indie label. Analyze song lyrics to suggest metadata, real-life artist references, and how the song could fit existing roster artists. Return ONLY valid JSON.

ROSTER (current artists):
{roster_summary}
{artist_context}"""
            ).with_model("openai", "gpt-5.2")
            
            content = f"Title: {data.title}\n"
            if data.lyrics:
                content += f"Lyrics:\n{data.lyrics[:1500]}\n"
            if data.style_prompt:
                content += f"Style: {data.style_prompt}\n"
            
            prompt = f"""Analyze this song:
{content}

Return ONLY this JSON (no other text):
{{
  "genre": "suggested genre",
  "mood": "suggested mood",
  "tempo": "suggested tempo (slow/medium/fast + approx BPM)",
  "themes": ["theme1", "theme2", "theme3"],
  "style_suggestions": [
    "Suno style prompt option 1 (no real artist names)",
    "Suno style prompt option 2",
    "Suno style prompt option 3"
  ],
  "real_life_artist_fit": [
    {{"artist": "real-life artist name", "why": "why this song fits their sound", "reference_track": "an actual track of theirs that matches the vibe"}}
  ],
  "roster_fit_analysis": [
    {{"roster_artist": "artist name from roster", "fit_score": "low|medium|high|perfect", "why_it_fits": "explanation", "how_to_alter": "concrete tweaks to push this song toward that artist's sound — even if it's an out-of-left-field connection, suggest creative bridges"}}
  ],
  "suggested_artists": ["roster artist names that fit best, in order"],
  "next_steps": ["actionable suggestion 1", "actionable suggestion 2"],
  "left_field_inspiration": "If this song could spark a brand-new direction (or a new artist), describe the vibe, genre fusion, and aesthetic in 2-3 sentences."
}}

CRITICAL: Always include `real_life_artist_fit` (1-3 entries). For `roster_fit_analysis`, evaluate EVERY roster artist (even if score is low) so the user can see creative connections they wouldn't have thought of."""
            
            user_message = UserMessage(text=prompt)
            response = await chat.send_message(user_message)
            
            # Parse JSON from response
            import json
            # Try to extract JSON from the response
            try:
                # Find JSON in the response
                json_start = response.find('{')
                json_end = response.rfind('}') + 1
                if json_start >= 0 and json_end > json_start:
                    ai_suggestions = json.loads(response[json_start:json_end])
            except:
                ai_suggestions = {"raw": response}
                
        except Exception as e:
            logger.error(f"Quick add AI analysis error: {str(e)}")
    
    # Auto-save the full AI analysis as a saved_prompt on the song's profile
    # so the user can always refer back to it later, even if they don't apply suggestions.
    if ai_suggestions and not ai_suggestions.get("raw"):
        # Build a human-readable summary
        lines = ["=== Quick Add AI Analysis ==="]
        if ai_suggestions.get("genre"):
            lines.append(f"Genre: {ai_suggestions['genre']}")
        if ai_suggestions.get("mood"):
            lines.append(f"Mood: {ai_suggestions['mood']}")
        if ai_suggestions.get("tempo"):
            lines.append(f"Tempo: {ai_suggestions['tempo']}")
        if ai_suggestions.get("themes"):
            lines.append(f"Themes: {', '.join(ai_suggestions['themes'])}")
        if ai_suggestions.get("style_suggestions"):
            lines.append("\n--- Style Suggestions ---")
            for i, s in enumerate(ai_suggestions["style_suggestions"]):
                lines.append(f"{chr(65+i)}: {s}")
        if ai_suggestions.get("real_life_artist_fit"):
            lines.append("\n--- Real-Life Artists This Song Fits ---")
            for r in ai_suggestions["real_life_artist_fit"]:
                if isinstance(r, dict):
                    lines.append(f"\u2022 {r.get('artist', '')}: {r.get('why', '')}")
                    if r.get("reference_track"):
                        lines.append(f"  Reference track: {r['reference_track']}")
                else:
                    lines.append(f"\u2022 {r}")
        if ai_suggestions.get("roster_fit_analysis"):
            lines.append("\n--- How It Fits Your Roster ---")
            for r in ai_suggestions["roster_fit_analysis"]:
                if isinstance(r, dict):
                    lines.append(f"\n{r.get('roster_artist', '')} ({r.get('fit_score', '')} fit)")
                    lines.append(f"  Why: {r.get('why_it_fits', '')}")
                    if r.get("how_to_alter"):
                        lines.append(f"  Alter to fit: {r['how_to_alter']}")
        if ai_suggestions.get("suggested_artists"):
            lines.append(f"\nBest Roster Picks: {', '.join(ai_suggestions['suggested_artists'])}")
        if ai_suggestions.get("left_field_inspiration"):
            lines.append(f"\n--- Left-Field Inspiration ---\n{ai_suggestions['left_field_inspiration']}")
        if ai_suggestions.get("next_steps"):
            lines.append("\n--- Next Steps ---")
            for s in ai_suggestions["next_steps"]:
                lines.append(f"- {s}")
        summary_content = "\n".join(lines)
    elif ai_suggestions and ai_suggestions.get("raw"):
        summary_content = ai_suggestions["raw"]
    else:
        summary_content = ""
    
    if summary_content:
        prompt_record = {
            "id": str(uuid.uuid4()),
            "prompt_type": "quick_add_analysis",
            "label": f"Quick Add Analysis · {datetime.utcnow().strftime('%b %d, %Y')}",
            "content": summary_content,
            "saved_by_id": current_user["id"],
            "saved_by_name": current_user.get("name", ""),
            "created_at": datetime.utcnow().isoformat(),
        }
        await db.songs.update_one(
            {"id": song_dict["id"]},
            {"$push": {"saved_prompts": prompt_record}}
        )
    
    return {
        "song": {k: v for k, v in song_dict.items() if k != "_id"},
        "ai_suggestions": ai_suggestions,
    }

@api_router.post("/songs/{song_id}/apply-suggestions")
async def apply_ai_suggestions(song_id: str, suggestions: dict, current_user: dict = Depends(get_current_user)):
    """Apply AI-suggested fields to a song"""
    song = await db.songs.find_one(team_query(current_user, {"id": song_id}))
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")
    
    update = {}
    if suggestions.get("genre"):
        update["genre"] = suggestions["genre"]
    if suggestions.get("mood"):
        update["mood"] = suggestions["mood"]
    if suggestions.get("tempo"):
        update["tempo"] = suggestions["tempo"]
    if suggestions.get("themes"):
        update["themes"] = suggestions["themes"]
    if suggestions.get("style_suggestions"):
        # Add to additional_styles list
        existing = song.get("additional_styles", [])
        update["additional_styles"] = existing + suggestions["style_suggestions"]
    
    if update:
        update["updated_at"] = datetime.utcnow()
        await db.songs.update_one({"id": song_id}, {"$set": update})
    
    updated = await db.songs.find_one({"id": song_id})
    return {k: v for k, v in updated.items() if k != "_id"}

# ============== AI Creative Assistant (Multi-turn Chat) ==============

class AssistantMessage(BaseModel):
    message: str
    artist_id: Optional[str] = None
    song_id: Optional[str] = None
    session_id: Optional[str] = None

@api_router.post("/ai/assistant")
async def ai_assistant(data: AssistantMessage, current_user: dict = Depends(get_current_user)):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="AI service not configured")
    
    # Build deep context from artist catalog
    artist_context = ""
    if data.artist_id:
        artist = await db.artists.find_one(team_query(current_user, {"id": data.artist_id}))
        if artist:
            # Get ALL songs for this artist to build voice profile
            # Lean projection: only fields needed for voice-profile context
            artist_songs = await db.songs.find(
                team_query(current_user, {"artist_id": data.artist_id}),
                {"_id": 0, "saved_prompts": 0, "versions": 0, "suno_generations": 0}
            ).to_list(100)
            
            song_summaries = []
            for s in artist_songs[:20]:  # Top 20 songs for context
                summary = f"- \"{s.get('title', '')}\""
                if s.get('genre'):
                    summary += f" [{s['genre']}]"
                if s.get('mood'):
                    summary += f" ({s['mood']})"
                if s.get('themes'):
                    summary += f" themes: {', '.join(s['themes'][:3])}"
                if s.get('lyrics'):
                    # Include first 2 lines of lyrics for voice learning
                    first_lines = [l for l in s['lyrics'].split('\n') if l.strip()][:2]
                    if first_lines:
                        summary += f"\n  Lyrics: {' / '.join(first_lines)}"
                if s.get('authorship') == 'original':
                    summary += " [HUMAN WRITTEN]"
                song_summaries.append(summary)
            
            collections = await db.collections.find({"artist_id": data.artist_id}).to_list(50)
            
            artist_context = f"""
=== ARTIST PROFILE: {artist.get('name', '')} ===
Bio: {artist.get('bio', '')}
Sound: {artist.get('unique_sound', '')}
Genres: {', '.join(artist.get('genres', []))}
Themes: {', '.join(artist.get('themes', []))}
Tone: {artist.get('tone', '')}
Patterns: {', '.join(artist.get('patterns', []))}
Visual Style: {artist.get('branding', {}).get('visual_style', '')}
Aesthetic: {artist.get('branding', {}).get('aesthetic', '')}
Visual Brief: {artist.get('visual_brief', '')}
Suno Voice: {artist.get('suno_voice', '')}
Default Exclusions: {artist.get('suno_exclusions', '')}

=== CATALOG ({len(artist_songs)} songs) ===
{chr(10).join(song_summaries)}

=== RELEASES ===
{chr(10).join(f'- {c.get("title", "")} ({c.get("collection_type", "EP")}) - {c.get("status", "")}' for c in collections)}
"""
    
    # Song context if specific song referenced
    song_context = ""
    if data.song_id:
        song = await db.songs.find_one(team_query(current_user, {"id": data.song_id}))
        if song:
            song_context = f"""
=== CURRENT SONG: {song.get('title', '')} ===
Lyrics: {song.get('lyrics', '')[:800]}
Primary Style: {song.get('style_prompt', '')}
Secondary: {song.get('style_secondary', '')}
Alternative: {song.get('style_alternate', '')}
Genre: {song.get('genre', '')} | Mood: {song.get('mood', '')} | Tempo: {song.get('tempo', '')}
Themes: {', '.join(song.get('themes', []))}
Authorship: {song.get('authorship', 'unknown')}
"""
    
    # Get all artists for suggestions
    all_artists = await db.artists.find(team_query(current_user)).to_list(100)
    roster_summary = "\n".join(f"- {a.get('name', '')}: {', '.join(a.get('genres', []))} | {a.get('tone', '')}" for a in all_artists)
    
    session_id = data.session_id or f"assistant-{current_user['id']}-{uuid.uuid4()}"
    
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=session_id,
            system_message=f"""You are a 360-degree AI Music Executive — the user's creative partner and right-hand.
You wear many hats: A&R, songwriter, creative director, visual director, social media strategist, brand consultant.

{artist_context}
{song_context}

=== ARTIST ROSTER ===
{roster_summary}

YOUR ROLE:
- When analyzing lyrics marked [HUMAN WRITTEN], learn the writing patterns, vocabulary, emotional style
- Generate new lyrics that match the human's voice and the artist's established patterns
- For songs without an artist, suggest which roster artists fit based on the catalog
- When suggesting styles, format them for Suno (no copyrighted artist/song references)
- When suggesting visuals, produce a video concept SUMMARY first, then offer to expand into scene-by-scene Sora prompts
- Always suggest the next step: "Want me to expand this into full lyrics?", "Should I suggest artists for this?", "Ready for scene-by-scene video prompts?"
- Help refine artist images, lock down branding, plan releases
- Format social media content for viral potential
- Think like you're running a label — every suggestion should serve the bigger picture

NEVER reference copyrighted artists or songs in style prompts.
When the user has a spark of an idea, help expand it into a full concept.
When they have a complete project, help polish and prepare for release."""
        ).with_model("openai", "gpt-5.2")
        
        user_message = UserMessage(text=data.message)
        response = await chat.send_message(user_message)
        
        return {
            "response": response,
            "session_id": session_id,
        }
        
    except Exception as e:
        logger.error(f"AI Assistant error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"AI Assistant failed: {str(e)}")

# ============== Artist Voice Profile ==============

@api_router.get("/artists/{artist_id}/voice-profile")
async def get_artist_voice_profile(artist_id: str, current_user: dict = Depends(get_current_user)):
    """Build a voice/style profile from an artist's catalog"""
    artist = await db.artists.find_one(team_query(current_user, {"id": artist_id}))
    if not artist:
        raise HTTPException(status_code=404, detail="Artist not found")
    
    songs = await db.songs.find(team_query(current_user, {"artist_id": artist_id})).to_list(100)
    
    # Aggregate data
    all_genres = [s.get("genre", "") for s in songs if s.get("genre")]
    all_moods = [s.get("mood", "") for s in songs if s.get("mood")]
    all_themes = []
    for s in songs:
        all_themes.extend(s.get("themes", []))
    all_styles = [s.get("style_prompt", "") for s in songs if s.get("style_prompt")]
    human_lyrics = [s.get("lyrics", "") for s in songs if s.get("authorship") == "original" and s.get("lyrics")]
    
    return {
        "artist_name": artist.get("name", ""),
        "total_songs": len(songs),
        "genres": list(set(all_genres)),
        "moods": list(set(all_moods)),
        "themes": list(set(all_themes)),
        "style_samples": all_styles[:5],
        "human_written_count": len(human_lyrics),
        "ai_generated_count": len([s for s in songs if s.get("authorship") == "ai_generated"]),
        "collab_count": len([s for s in songs if s.get("authorship") == "collab"]),
        "unique_sound": artist.get("unique_sound", ""),
        "tone": artist.get("tone", ""),
        "suno_voice": artist.get("suno_voice", ""),
        "exclusions": artist.get("suno_exclusions", ""),
    }

# Health check
@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}

# ============== Collection (EP/LP) Routes ==============

@api_router.post("/collections", response_model=Collection)
async def create_collection(data: CollectionCreate, current_user: dict = Depends(get_current_user)):
    d = data.dict()
    d["id"] = str(uuid.uuid4())
    d["user_id"] = current_user["id"]
    d["team_id"] = current_user.get("team_id", current_user["id"])
    d["track_count"] = 0
    d["created_at"] = datetime.utcnow()
    d["updated_at"] = datetime.utcnow()
    await db.collections.insert_one(d)
    return Collection(**d)

@api_router.get("/collections", response_model=None)
async def get_collections(artist_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """List collections (releases + playlists) for the current team workspace.

    Uses read-time normalization (see doc_normalizer.py) so legacy docs
    with malformed shapes (e.g. release_date as a datetime, title null,
    cover_image null) still render instead of 500-ing the whole list.
    """
    query = team_query(current_user)
    if artist_id:
        query["artist_id"] = artist_id
    items = await db.collections.find(query).sort("updated_at", -1).to_list(1000)
    items = [{k: v for k, v in c.items() if k != "_id"} for c in items]
    objects, _counts, _skipped = safe_validate_many(
        Collection, items, normalize_collection_doc,
        log_label="GET /api/collections",
    )
    return objects

@api_router.get("/collections/{coll_id}", response_model=None)
async def get_collection(coll_id: str, current_user: dict = Depends(get_current_user)):
    c = await db.collections.find_one(team_query(current_user, {"id": coll_id}))
    if not c:
        raise HTTPException(status_code=404, detail="Collection not found")
    c = {k: v for k, v in c.items() if k != "_id"}
    obj, status, err = safe_validate(Collection, c, normalize_collection_doc)
    if obj is None:
        logger.warning("[GET /api/collections/%s] unrecoverable: %s", coll_id, err)
        raise HTTPException(
            status_code=422,
            detail=f"Collection record is malformed and could not be normalized: {err}",
        )
    return obj

@api_router.put("/collections/{coll_id}", response_model=Collection)
async def update_collection(coll_id: str, data: CollectionCreate, current_user: dict = Depends(get_current_user)):
    c = await db.collections.find_one(team_query(current_user, {"id": coll_id}))
    if not c:
        raise HTTPException(status_code=404, detail="Collection not found")
    update_dict = data.dict()
    update_dict["updated_at"] = datetime.utcnow()
    # Recount tracks: includes songs whose primary collection_id matches OR are curated via playlist_ids
    track_count = await db.songs.count_documents(team_query(current_user, {
        "$or": [{"collection_id": coll_id}, {"playlist_ids": coll_id}]
    }))
    update_dict["track_count"] = track_count
    await db.collections.update_one({"id": coll_id}, {"$set": update_dict})
    updated = await db.collections.find_one({"id": coll_id})
    return Collection(**updated)

@api_router.delete("/collections/{coll_id}")
async def delete_collection(coll_id: str, current_user: dict = Depends(get_current_user)):
    c = await db.collections.find_one(team_query(current_user, {"id": coll_id}))
    if not c:
        raise HTTPException(status_code=404, detail="Collection not found")
    await db.collections.update_one(
        {"id": coll_id},
        {"$set": {"deleted_at": datetime.utcnow(), "deleted_by_id": current_user["id"]}}
    )
    return {"message": "Release moved to trash"}

# ============== Trash / Restore ==============

@api_router.get("/trash")
async def get_trash(current_user: dict = Depends(get_current_user)):
    """Return all soft-deleted records belonging to the current team, grouped by type."""
    team_id = current_user.get("team_id", current_user["id"])
    cutoff = datetime.utcnow() - timedelta(days=30)
    out = {"artists": [], "songs": [], "collections": [], "ideas": []}
    for coll_name, type_key in [("artists", "artists"), ("songs", "songs"), ("collections", "collections"), ("ideas", "ideas")]:
        records = await db[coll_name].find({
            "team_id": team_id,
            "deleted_at": {"$gte": cutoff, "$ne": None},
        }).sort("deleted_at", -1).to_list(200)
        for r in records:
            r.pop("_id", None)
            # Don't show others' private items
            if r.get("is_private") and r.get("user_id") != current_user["id"]:
                continue
            # ISO format the datetime for serialization
            if isinstance(r.get("deleted_at"), datetime):
                r["deleted_at"] = r["deleted_at"].isoformat()
            if isinstance(r.get("created_at"), datetime):
                r["created_at"] = r["created_at"].isoformat()
            if isinstance(r.get("updated_at"), datetime):
                r["updated_at"] = r["updated_at"].isoformat()
            out[type_key].append(r)
    return out

@api_router.post("/trash/{type_name}/{item_id}/restore")
async def restore_trash_item(type_name: str, item_id: str, current_user: dict = Depends(get_current_user)):
    valid = {"artists", "songs", "collections", "ideas"}
    if type_name not in valid:
        raise HTTPException(status_code=400, detail=f"Invalid type. Must be one of: {valid}")
    coll = db[type_name]
    item = await coll.find_one({
        "id": item_id,
        "team_id": current_user.get("team_id", current_user["id"]),
        "deleted_at": {"$ne": None},
    })
    if not item:
        raise HTTPException(status_code=404, detail="Item not found in trash")
    await coll.update_one(
        {"id": item_id},
        {"$unset": {"deleted_at": "", "deleted_by_id": ""}, "$set": {"updated_at": datetime.utcnow()}}
    )
    # If restoring a song, re-increment artist count
    if type_name == "songs" and item.get("artist_id"):
        await db.artists.update_one({"id": item["artist_id"]}, {"$inc": {"song_count": 1}})
    return {"message": f"{type_name[:-1].title()} restored"}

@api_router.delete("/trash/{type_name}/{item_id}/permanent")
async def permanent_delete_trash_item(type_name: str, item_id: str, current_user: dict = Depends(get_current_user)):
    valid = {"artists", "songs", "collections", "ideas"}
    if type_name not in valid:
        raise HTTPException(status_code=400, detail="Invalid type")
    coll = db[type_name]
    result = await coll.delete_one({
        "id": item_id,
        "team_id": current_user.get("team_id", current_user["id"]),
        "deleted_at": {"$ne": None},
    })
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found in trash")
    return {"message": f"Permanently deleted"}

# ============== Activity Timeline ==============

async def log_activity(current_user: dict, action: str, target_type: str, target_id: str, details: dict = None):
    """Log an activity to the timeline. Fire-and-forget pattern.
    Also dispatches push notifications to teammates for notable actions."""
    try:
        await db.activities.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": current_user["id"],
            "user_name": current_user.get("name", ""),
            "team_id": current_user.get("team_id", current_user["id"]),
            "action": action,  # created, updated, deleted, played, commented, generated, prompted, version_added, etc.
            "target_type": target_type,  # song, artist, collection, idea
            "target_id": target_id,
            "details": details or {},
            "created_at": datetime.utcnow(),
        })
    except Exception as e:
        logger.error(f"Activity log failed: {e}")

    # Dispatch push notifications to teammates (fire and forget) for notable actions
    try:
        team_id = current_user.get("team_id", current_user["id"])
        # Solo workspace? skip notifications. Use limit(2) instead of count_documents (much cheaper)
        team_members_sample = await db.users.find(
            {"team_id": team_id}, {"id": 1}
        ).limit(2).to_list(2)
        if len(team_members_sample) <= 1:
            return

        notifiable = {"created", "updated", "commented", "generated", "version_added", "prompted", "reanalyzed"}
        if action not in notifiable:
            return
        # Skip noisy events (plays, simple updates without meaningful change indicators).
        if action == "updated" and not (details and (details.get("status_changed") or details.get("title"))):
            # We still allow generic update notifications but prefer status changes.
            pass

        actor = current_user.get("name") or "A teammate"
        title_text = (details or {}).get("title") or ""
        type_label = {"song": "song", "artist": "artist", "collection": "collection", "idea": "idea"}.get(target_type, "item")

        verb_map = {
            "created": "added a new",
            "updated": "updated",
            "commented": "commented on",
            "generated": "generated content for",
            "version_added": "added a version to",
            "prompted": "saved a new AI prompt for",
            "reanalyzed": "re-analyzed",
        }
        verb = verb_map.get(action, action)

        # Special-case status changes for songs
        if action == "updated" and (details or {}).get("status_changed"):
            new_status = (details or {}).get("new_status") or ""
            body = f'{actor} moved "{title_text or "a song"}" to {new_status}'
        else:
            body = f'{actor} {verb} {type_label}'
            if title_text:
                body += f': "{title_text}"'

        await push_service.notify_team(
            db,
            team_id,
            title="AI Music Exec",
            body=body,
            exclude_user_id=current_user["id"],
            data={
                "target_type": target_type,
                "target_id": target_id,
                "action": action,
            },
        )
    except Exception as e:
        logger.warning(f"Push notify on activity failed: {e}")

@api_router.get("/songs/{song_id}/activity")
async def get_song_activity(song_id: str, current_user: dict = Depends(get_current_user)):
    song = await db.songs.find_one(team_query(current_user, {"id": song_id}))
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")
    activities = await db.activities.find({
        "team_id": current_user.get("team_id", current_user["id"]),
        "target_type": "song",
        "target_id": song_id,
    }).sort("created_at", -1).limit(100).to_list(100)
    for a in activities:
        a.pop("_id", None)
        if isinstance(a.get("created_at"), datetime):
            a["created_at"] = a["created_at"].isoformat()
    return activities

@api_router.get("/activity/recent")
async def get_recent_activity(limit: int = 50, current_user: dict = Depends(get_current_user)):
    """Recent team-wide activity feed."""
    activities = await db.activities.find({
        "team_id": current_user.get("team_id", current_user["id"]),
    }).sort("created_at", -1).limit(min(limit, 200)).to_list(200)
    for a in activities:
        a.pop("_id", None)
        if isinstance(a.get("created_at"), datetime):
            a["created_at"] = a["created_at"].isoformat()
    return activities

class PlayLogRequest(BaseModel):
    song_id: str

@api_router.post("/activity/log-play")
async def log_play(data: PlayLogRequest, current_user: dict = Depends(get_current_user)):
    song = await db.songs.find_one(team_query(current_user, {"id": data.song_id}))
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")
    await log_activity(current_user, "played", "song", data.song_id, {"title": song.get("title", "")})
    return {"ok": True}

@api_router.get("/collections/{coll_id}/songs", response_model=List[Song])
async def get_collection_songs(coll_id: str, current_user: dict = Depends(get_current_user)):
    # Songs are in the playlist if EITHER their primary collection_id matches
    # OR they've been curated into this playlist via playlist_ids
    songs = await db.songs.find(team_query(current_user, {
        "$or": [
            {"collection_id": coll_id},
            {"playlist_ids": coll_id},
        ]
    })).sort("track_number", 1).to_list(1000)
    return [Song(**s) for s in songs]

class AddSongsRequest(BaseModel):
    song_ids: List[str]

@api_router.post("/collections/{coll_id}/add-songs")
async def add_songs_to_collection(coll_id: str, data: AddSongsRequest, current_user: dict = Depends(get_current_user)):
    """Curate existing catalog songs into this playlist (many-to-many). Doesn't move the song from its home collection."""
    coll = await db.collections.find_one(team_query(current_user, {"id": coll_id}))
    if not coll:
        raise HTTPException(status_code=404, detail="Collection not found")
    if not data.song_ids:
        return {"ok": True, "added": 0}
    res = await db.songs.update_many(
        team_query(current_user, {"id": {"$in": data.song_ids}}),
        {"$addToSet": {"playlist_ids": coll_id}, "$set": {"updated_at": datetime.utcnow()}}
    )
    await log_activity(current_user, "updated", "collection", coll_id, {"title": coll.get("title", ""), "songs_added": len(data.song_ids)})
    return {"ok": True, "added": res.modified_count}

@api_router.delete("/collections/{coll_id}/songs/{song_id}")
async def remove_song_from_collection(coll_id: str, song_id: str, current_user: dict = Depends(get_current_user)):
    """Remove a song from this playlist (does NOT delete the song from the catalog).
    - If song's primary collection_id == this collection, clear it (becomes a "homeless" song)
    - Always pull this coll_id from the song's playlist_ids array
    """
    song = await db.songs.find_one(team_query(current_user, {"id": song_id}))
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")
    update_ops: dict = {"$pull": {"playlist_ids": coll_id}, "$set": {"updated_at": datetime.utcnow()}}
    if song.get("collection_id") == coll_id:
        update_ops["$set"]["collection_id"] = None
    await db.songs.update_one({"id": song_id}, update_ops)
    return {"ok": True}

# ============== Playlist Brainstorm Workspace ==============

class BrainstormMessage(BaseModel):
    message: str
    mode: str = "freeform"  # freeform, song_starters, match_roster, youtube_visual, expand_song

@api_router.get("/collections/{coll_id}/brainstorm")
async def get_brainstorm(coll_id: str, current_user: dict = Depends(get_current_user)):
    """Return the persistent brainstorm chat history for a collection."""
    coll = await db.collections.find_one(team_query(current_user, {"id": coll_id}))
    if not coll:
        raise HTTPException(status_code=404, detail="Collection not found")
    return {
        "chat": coll.get("brainstorm_chat", []),
        "song_starters": coll.get("brainstorm_song_starters", []),
    }

@api_router.post("/collections/{coll_id}/brainstorm")
async def send_brainstorm_message(coll_id: str, data: BrainstormMessage, current_user: dict = Depends(get_current_user)):
    """Append a message and get an AI response. Whole conversation persists on the collection doc."""
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=503, detail="AI service not configured")
    coll = await db.collections.find_one(team_query(current_user, {"id": coll_id}))
    if not coll:
        raise HTTPException(status_code=404, detail="Collection not found")

    history = coll.get("brainstorm_chat", [])

    # Fetch roster + existing tracks in this playlist for context
    roster = await db.artists.find(team_query(current_user), {"_id": 0, "saved_prompts": 0}).to_list(200)
    roster_summary = "\n".join([
        f"- {a.get('name','')}: {(a.get('unique_sound') or '')[:90]} | genres: {', '.join(a.get('genres', []))[:80]} | tone: {(a.get('tone') or '')[:60]}"
        for a in roster
    ]) or "(no artists in roster yet)"

    existing_songs = await db.songs.find(
        team_query(current_user, {"collection_id": coll_id}),
        {"_id": 0, "id": 1, "title": 1, "genre": 1, "mood": 1, "themes": 1, "artist_id": 1}
    ).to_list(200)

    coll_title = coll.get("title", "Untitled Playlist")
    coll_desc = coll.get("description", "")
    coll_type = coll.get("collection_type", "Playlist")

    mode_directives = {
        "song_starters": """The user is building a thematic playlist — using a movie / TV show / vibe / era as INSPIRATION ONLY. They want 15-25 standalone "single" song concepts that match different MOMENTS, EMOTIONS, or PERSPECTIVES from the source material — NOT a scene-by-scene retelling.

CRITICAL RULES:
1. NEVER include character names, plot recaps, location names, or any copyrighted phrases from the source.
2. Songs must hold up as STANDALONE SINGLES — someone hearing one on the radio with no context should still vibe with it.
3. Cover DIFFERENT moments / different emotions / different perspectives (the protagonist's struggle, a side character's love, a bystander's observation, the city's heartbeat, etc.).
4. Make every song feel DISTINCT from the others — no two should feel like the same song split apart. Vary tempo, key, mood, perspective, narrator voice.
5. Songs are the TEAM'S PICK for moments in the playlist's vibe — like a soundtrack supervisor curating, not a screenwriter narrating.
6. NO real artist names in suno_style — only sonic descriptors (e.g., "warm Rhodes piano, 90 BPM neo-soul groove, dusty drums").

Return your prose intro (3-5 sentences max explaining the angle you took) THEN this JSON block:

[SONG_STARTERS]
- {"title": "...", "concept": "What moment/feeling/perspective this captures (1-2 sentences, NO source references)", "vibe": "mood + energy descriptor", "suggested_artist": "name from roster or 'open'", "suno_style": "Suno-ready style prompt with sonic descriptors only"}
- ...
[/SONG_STARTERS]

DO NOT write full lyrics here. These are starter concepts. Save lyric writing for a separate `expand_song` request.""",
        "match_roster": """The user wants you to identify which of their roster artists could contribute songs in their own voice. For each fitting artist, suggest 2-3 song concepts shaped to THEIR existing tone/genre/themes/perspective. Songs should still feel like standalone singles, not retellings.

Return:

[ROSTER_MATCHES]
- {"artist": "name from roster", "fit_score": "high|medium|low", "why": "one sentence on why their voice fits this playlist's energy", "song_ideas": [{"title":"...","concept":"moment/perspective captured","suno_style":"sonic descriptors only, no real artist names"}]}
- ...
[/ROSTER_MATCHES]""",
        "youtube_visual": """The user makes hour-long YouTube playlist videos with looping background visuals (e.g., birds flying, smoke curling from a cigarette, cars driving by, neon flicker, raindrops). Generate a Canva-ready brief for a looping visual that matches THIS playlist's vibe — not a movie still or copyrighted imagery, but an evocative scene that captures the energy. Return:

[YOUTUBE_VISUAL]
{
  "scene_description": "2-3 sentence vivid scene (original, not from source material)",
  "color_palette": ["#hex","#hex","#hex"],
  "motion_elements": ["element with motion description", "...", "..."],
  "atmosphere": "mood / lighting / weather",
  "loop_duration_seconds": "ideal loop length",
  "canva_search_terms": ["term 1", "term 2", "term 3"],
  "title_treatment": "font style + placement suggestion"
}
[/YOUTUBE_VISUAL]""",
        "expand_song": """The user wants full lyrics + a refined Suno style for ONE song (max two). IMPORTANT RULES:
1. Write COMPLETE lyrics — verses, hook, bridge, outro. Do NOT summarize or shorten.
2. If the user asks for more than 2 songs, only do the first 2 fully and tell them to ask again for the rest.
3. NO copyrighted phrases, no real character names, no direct quotes from the source material that inspired the playlist.
4. The song must hold up as a standalone single.
5. NO real artist names in the Suno style — sonic descriptors only.

Format:

[SONG_FULL]
Title: ...
Suno style: ...
Lyrics:
[Verse 1]
...
[Hook]
...
[Verse 2]
...
[Bridge]
...
[Outro]
...
[/SONG_FULL]""",
        "freeform": """Respond naturally as a creative A&R partner. Help refine the playlist concept, identify themes/moments, suggest directions, mix-and-match across the catalog. Keep replies focused and actionable. Songs in this playlist should always be standalone singles inspired by moments from the source, not scene-by-scene retellings. Never include copyrighted phrases or real character names in song content.""",
    }
    mode_directive = mode_directives.get(data.mode, mode_directives["freeform"])

    system_message = f"""You are an A&R / creative director helping build a thematic playlist. EVERY message is part of an ongoing brainstorm — reference prior turns, build on them, and keep the playlist's identity consistent.

PLAYLIST WORKSPACE: "{coll_title}" ({coll_type})
{f'Description: {coll_desc}' if coll_desc else ''}
Existing tracks in this playlist ({len(existing_songs)}): {', '.join([s.get('title','') for s in existing_songs[:10]]) or '(none yet)'}

USER'S ARTIST ROSTER:
{roster_summary}

CRITICAL COPYRIGHT RULE: Suno style prompts MUST NEVER include real artist names. Use sonic descriptors only. Real artist names ARE allowed in prose/reasoning, just not in style prompts.

WORKFLOW HINT: If the user wants full lyrics, only generate 1-2 songs per response so quality stays high (AI tends to summarize when stretched across many at once).

MODE for this message: {data.mode}
{mode_directive}"""

    try:
        # Build chat with full history
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"brainstorm-{coll_id}",
            system_message=system_message,
        ).with_model("openai", "gpt-5.2")

        # Replay history as context
        replay_block = ""
        for h in history[-20:]:  # last 20 turns to keep context bounded
            who = "USER" if h.get("role") == "user" else "ASSISTANT"
            replay_block += f"\n\n{who}: {h.get('content','')}"
        full_message = (f"PRIOR CONVERSATION:{replay_block}\n\n" if replay_block else "") + f"NEW USER MESSAGE: {data.message}"

        user_message = UserMessage(text=full_message)
        response = await chat.send_message(user_message)

        # Parse structured blocks
        parsed_song_starters: list = []
        parsed_roster_matches: list = []
        parsed_youtube_visual: dict = {}
        parsed_song_full: dict = {}

        import re, json as _json
        try:
            m = re.search(r"\[SONG_STARTERS\](.+?)\[/SONG_STARTERS\]", response, re.DOTALL)
            if m:
                block = m.group(1).strip()
                for line in block.split("\n"):
                    line = line.strip()
                    if line.startswith("- "):
                        try:
                            parsed_song_starters.append(_json.loads(line[2:]))
                        except Exception:
                            pass
        except Exception:
            pass
        try:
            m = re.search(r"\[ROSTER_MATCHES\](.+?)\[/ROSTER_MATCHES\]", response, re.DOTALL)
            if m:
                block = m.group(1).strip()
                for line in block.split("\n"):
                    line = line.strip()
                    if line.startswith("- "):
                        try:
                            parsed_roster_matches.append(_json.loads(line[2:]))
                        except Exception:
                            pass
        except Exception:
            pass
        try:
            m = re.search(r"\[YOUTUBE_VISUAL\](.+?)\[/YOUTUBE_VISUAL\]", response, re.DOTALL)
            if m:
                parsed_youtube_visual = _json.loads(m.group(1).strip())
        except Exception:
            pass
        try:
            m = re.search(r"\[SONG_FULL\](.+?)\[/SONG_FULL\]", response, re.DOTALL)
            if m:
                txt = m.group(1).strip()
                title_match = re.search(r"Title:\s*(.+)", txt)
                style_match = re.search(r"Suno style:\s*(.+)", txt)
                lyrics_match = re.search(r"Lyrics:\s*(.+)", txt, re.DOTALL)
                parsed_song_full = {
                    "title": title_match.group(1).strip() if title_match else "",
                    "suno_style": style_match.group(1).strip() if style_match else "",
                    "lyrics": lyrics_match.group(1).strip() if lyrics_match else "",
                }
        except Exception:
            pass

        now = datetime.utcnow().isoformat()
        new_history_entries = [
            {"role": "user", "content": data.message, "mode": data.mode, "timestamp": now, "user_name": current_user.get("name", "")},
            {
                "role": "assistant",
                "content": response,
                "mode": data.mode,
                "timestamp": now,
                "parsed_song_starters": parsed_song_starters,
                "parsed_roster_matches": parsed_roster_matches,
                "parsed_youtube_visual": parsed_youtube_visual,
                "parsed_song_full": parsed_song_full,
            },
        ]

        update_ops: dict = {
            "$push": {"brainstorm_chat": {"$each": new_history_entries}},
            "$set": {"updated_at": datetime.utcnow()},
        }
        # Accumulate parsed song starters separately so the UI can show a clean side panel
        if parsed_song_starters:
            update_ops["$push"]["brainstorm_song_starters"] = {"$each": parsed_song_starters}

        await db.collections.update_one({"id": coll_id}, update_ops)
        await log_activity(current_user, "brainstormed", "collection", coll_id, {"title": coll_title, "mode": data.mode})

        return {
            "response": response,
            "parsed_song_starters": parsed_song_starters,
            "parsed_roster_matches": parsed_roster_matches,
            "parsed_youtube_visual": parsed_youtube_visual,
            "parsed_song_full": parsed_song_full,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Brainstorm error: {e}")
        raise HTTPException(status_code=500, detail=f"Brainstorm failed: {str(e)}")

@api_router.delete("/collections/{coll_id}/brainstorm")
async def clear_brainstorm(coll_id: str, current_user: dict = Depends(get_current_user)):
    """Clear the brainstorm chat history (but keep the playlist and its songs)."""
    coll = await db.collections.find_one(team_query(current_user, {"id": coll_id}))
    if not coll:
        raise HTTPException(status_code=404, detail="Collection not found")
    await db.collections.update_one(
        {"id": coll_id},
        {"$set": {"brainstorm_chat": [], "brainstorm_song_starters": [], "updated_at": datetime.utcnow()}}
    )
    return {"ok": True}

class SaveStarterRequest(BaseModel):
    title: str
    concept: str = ""
    suno_style: str = ""
    lyrics: str = ""
    suggested_artist: str = ""

@api_router.post("/collections/{coll_id}/brainstorm/save-song")
async def save_brainstorm_song(coll_id: str, data: SaveStarterRequest, current_user: dict = Depends(get_current_user)):
    """Promote a song starter from the brainstorm into a real draft song attached to this playlist."""
    coll = await db.collections.find_one(team_query(current_user, {"id": coll_id}))
    if not coll:
        raise HTTPException(status_code=404, detail="Collection not found")
    # Try to match suggested_artist to an existing artist
    artist_id: Optional[str] = None
    if data.suggested_artist and data.suggested_artist.lower() != "open":
        artist = await db.artists.find_one(team_query(current_user, {"name": {"$regex": f"^{re.escape(data.suggested_artist)}$", "$options": "i"}}))
        if artist:
            artist_id = artist["id"]

    song_dict = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "team_id": current_user.get("team_id", current_user["id"]),
        "title": data.title or "Untitled Idea",
        "artist_id": artist_id,
        "featured_artist_ids": [],
        "collection_id": coll_id,
        "lyrics": data.lyrics,
        "authorship": "ai_generated",
        "style_prompt": data.suno_style,
        "style_secondary": "",
        "style_alternate": "",
        "additional_styles": [],
        "exclusions": "",
        "genre": "",
        "mood": "",
        "tempo": "",
        "themes": [],
        "status": "draft",
        "notes": data.concept,
        "todo": [],
        "versions": [],
        "suno_generations": [],
        "saved_prompts": [{
            "id": str(uuid.uuid4()),
            "prompt_type": "brainstorm_origin",
            "label": f"From Brainstorm \u00b7 {datetime.utcnow().strftime('%b %d, %Y')}",
            "content": f"Concept: {data.concept}\nSuno Style: {data.suno_style}\nSuggested artist: {data.suggested_artist}",
            "saved_by_id": current_user["id"],
            "saved_by_name": current_user.get("name", ""),
            "created_at": datetime.utcnow().isoformat(),
        }],
        "track_number": 0,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    await db.songs.insert_one(song_dict)
    if artist_id:
        await db.artists.update_one({"id": artist_id}, {"$inc": {"song_count": 1}})
    await log_activity(current_user, "created", "song", song_dict["id"], {"title": song_dict["title"]})

    # Remove this starter from the persisted starters list (by title match)
    await db.collections.update_one(
        {"id": coll_id},
        {"$pull": {"brainstorm_song_starters": {"title": data.title}}}
    )
    return {"ok": True, "song_id": song_dict["id"], "artist_id": artist_id}

# ============== Revenue Routes ==============

@api_router.post("/revenue", response_model=RevenueEntry)
async def create_revenue_entry(data: RevenueEntryCreate, current_user: dict = Depends(get_current_user)):
    d = data.dict()
    d["id"] = str(uuid.uuid4())
    d["user_id"] = current_user["id"]
    d["team_id"] = current_user.get("team_id", current_user["id"])
    d["created_at"] = datetime.utcnow()
    await db.revenue.insert_one(d)
    return RevenueEntry(**d)

@api_router.get("/revenue")
async def get_revenue(
    artist_id: Optional[str] = None,
    song_id: Optional[str] = None,
    platform: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = team_query(current_user)
    if artist_id:
        query["artist_id"] = artist_id
    if song_id:
        query["song_id"] = song_id
    if platform:
        query["platform"] = platform
    
    entries = await db.revenue.find(query).sort("created_at", -1).to_list(1000)
    
    # Calculate summary
    total = sum(e.get("amount", 0) for e in entries)
    by_platform = {}
    by_type = {}
    for e in entries:
        p = e.get("platform", "other")
        by_platform[p] = by_platform.get(p, 0) + e.get("amount", 0)
        t = e.get("revenue_type", "other")
        by_type[t] = by_type.get(t, 0) + e.get("amount", 0)
    
    return {
        "total": total,
        "by_platform": by_platform,
        "by_type": by_type,
        "entries": [{k: v for k, v in e.items() if k != "_id"} for e in entries],
        "count": len(entries)
    }

@api_router.delete("/revenue/{entry_id}")
async def delete_revenue_entry(entry_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.revenue.delete_one(team_query(current_user, {"id": entry_id}))
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Entry not found")
    return {"message": "Revenue entry deleted"}

# ============== Bulk Import ==============

@api_router.post("/songs/bulk-import")
async def bulk_import_songs(data: BulkSongImport, current_user: dict = Depends(get_current_user)):
    imported = []
    errors = []
    for i, song_data in enumerate(data.songs):
        try:
            song_dict = {
                "id": str(uuid.uuid4()),
                "user_id": current_user["id"],
        "team_id": current_user.get("team_id", current_user["id"]),
                "title": song_data.get("title", f"Untitled {i+1}"),
                "artist_id": song_data.get("artist_id"),
                "collection_id": song_data.get("collection_id"),
                "lyrics": song_data.get("lyrics", ""),
                "style_prompt": song_data.get("style_prompt", ""),
                "genre": song_data.get("genre", ""),
                "mood": song_data.get("mood", ""),
                "tempo": song_data.get("tempo", ""),
                "themes": song_data.get("themes", []),
                "status": song_data.get("status", "draft"),
                "notes": song_data.get("notes", ""),
                "todo": song_data.get("todo", []),
                "versions": song_data.get("versions", []),
                "suno_generations": song_data.get("suno_generations", []),
                "track_number": song_data.get("track_number", 0),
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
            }
            await db.songs.insert_one(song_dict)
            imported.append({"title": song_dict["title"], "id": song_dict["id"]})
            
            # Update artist song count
            if song_dict.get("artist_id"):
                await db.artists.update_one(
                    {"id": song_dict["artist_id"]},
                    {"$inc": {"song_count": 1}}
                )
        except Exception as e:
            errors.append({"index": i, "error": str(e), "title": song_data.get("title", "unknown")})
    
    return {"imported": len(imported), "errors": len(errors), "songs": imported, "error_details": errors}

# ============== AI Video Prompts ==============

@api_router.post("/ai/video-prompts")
async def generate_video_prompts(request: VideoPromptRequest, current_user: dict = Depends(get_current_user)):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="AI service not configured")
    
    # Get song and artist context
    lyrics = request.lyrics
    artist_context = ""
    
    if request.song_id:
        song = await db.songs.find_one(team_query(current_user, {"id": request.song_id}))
        if song:
            lyrics = song.get("lyrics", lyrics)
            if song.get("artist_id"):
                request.artist_id = song["artist_id"]
    
    if request.artist_id:
        artist = await db.artists.find_one(team_query(current_user, {"id": request.artist_id}))
        if artist:
            artist_context = f"""
Artist: {artist.get('name', '')}
Visual Style: {artist.get('branding', {}).get('visual_style', '')}
Aesthetic: {artist.get('branding', {}).get('aesthetic', '')}
Mood: {', '.join(artist.get('branding', {}).get('mood_keywords', []))}
Tone: {artist.get('tone', '')}
Visual Brief: {artist.get('visual_brief', '')}
"""
    
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"video-{current_user['id']}-{uuid.uuid4()}",
            system_message=f"""You are an expert music video director who outputs PRODUCTION-READY prompts for AI video generators (Sora, Runway, Kling, Pika).
{artist_context}

CRITICAL RULES:
- Every scene MUST include a copy-paste ready prompt enclosed in triple backticks
- Include Sora/Runway specific parameters: shot duration, motion strength (1-10), camera motion type, seed consistency notes
- Do NOT offer to do more work later — deliver EVERYTHING in this response
- Do NOT reference real artists, directors, or copyrighted works
- All prompts must be self-contained and immediately usable"""
        ).with_model("openai", "gpt-5.2")
        
        platform_instructions = ""
        for p in request.platforms:
            if p == "youtube":
                platform_instructions += "\n- YouTube (16:9 landscape, 3-5 min, cinematic quality)"
            elif p == "tiktok":
                platform_instructions += "\n- TikTok (9:16 vertical, 15-60sec hooks, fast cuts)"
            elif p == "instagram":
                platform_instructions += "\n- Instagram Reels (9:16 vertical, 15-90sec, aesthetic focus)"
        
        prompt = f"""Create a complete music video with COPY-PASTE READY prompts for the following lyrics:

{lyrics[:2000]}

{f'Visual style direction: {request.style}' if request.style else ''}

YOU MUST DELIVER ALL OF THE FOLLOWING — DO NOT SKIP ANY SECTION:

## 1. OVERALL VISION
2-3 sentence concept overview.

## 2. SCENE-BY-SCENE STORYBOARD (6-10 scenes)
For EACH scene provide:
- **Timestamp**: e.g., 0:00-0:15
- **Lyric line**: Which lyrics play during this scene
- **Visual description**: What we see
- **Camera**: Camera angle, movement, framing
- **Lighting/Color**: Color grading, lighting setup
- **SORA PROMPT** (in code block, ready to copy-paste):
```
[Full prompt text for Sora/Runway. Include: subject, action, environment, camera motion, lighting, style, aspect ratio]
Duration: Xs | Motion: X/10 | Camera: [type] | Aspect: 16:9 or 9:16
Seed note: [consistency guidance for maintaining character/scene continuity]
```

## 3. 60-SECOND TIKTOK CUT SCRIPT
- Pick the most hook-worthy 60 seconds of the song
- List exact timestamps and which scenes to use
- Include text overlay suggestions for maximum retention
- Provide the TikTok-specific Sora prompts (9:16 vertical) in code blocks

## 4. PLATFORM ADAPTATIONS
For each platform:{platform_instructions}
- Aspect ratio and duration recommendations
- Which scenes work best for each format
- Re-formatted prompts where aspect ratio changes

DELIVER ALL PROMPTS IN CODE BLOCKS READY TO COPY-PASTE. Do not offer to do additional work — include everything now."""
        
        user_message = UserMessage(text=prompt)
        response = await chat.send_message(user_message)
        
        return {"video_prompts": response, "platforms": request.platforms}
        
    except Exception as e:
        logger.error(f"Video prompt generation error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Video prompt generation failed: {str(e)}")

# ============== Artist Identity Package ==============

@api_router.get("/artists/{artist_id}/identity-package")
async def get_artist_identity_package(artist_id: str, current_user: dict = Depends(get_current_user)):
    artist = await db.artists.find_one(team_query(current_user, {"id": artist_id}))
    if not artist:
        raise HTTPException(status_code=404, detail="Artist not found")
    
    # Get artist's songs for context
    songs = await db.songs.find(team_query(current_user, {"artist_id": artist_id})).to_list(100)
    collections = await db.collections.find(team_query(current_user, {"artist_id": artist_id})).to_list(100)
    
    return {
        "artist": {k: v for k, v in artist.items() if k != "_id"},
        "identity": {
            "name": artist.get("name", ""),
            "profile_image": artist.get("profile_image", ""),
            "visual_style": artist.get("branding", {}).get("visual_style", ""),
            "aesthetic": artist.get("branding", {}).get("aesthetic", ""),
            "color_palette": artist.get("branding", {}).get("color_palette", []),
            "mood_keywords": artist.get("branding", {}).get("mood_keywords", []),
            "visual_brief": artist.get("visual_brief", ""),
            "visual_references": artist.get("visual_references", []),
            "tone": artist.get("tone", ""),
            "unique_sound": artist.get("unique_sound", ""),
            "genres": artist.get("genres", []),
            "themes": artist.get("themes", []),
        },
        "catalog_summary": {
            "total_songs": len(songs),
            "collections": [{"id": c["id"], "title": c["title"], "type": c.get("collection_type", "EP"), "cover": c.get("cover_image", "") or c.get("cover_image_url", "")} for c in collections],
            "genres": list(set(s.get("genre", "") for s in songs if s.get("genre"))),
            "moods": list(set(s.get("mood", "") for s in songs if s.get("mood"))),
        }
    }

# ============== Image Upload ==============

@api_router.post("/upload/image")
async def upload_image(current_user: dict = Depends(get_current_user)):
    """Placeholder for image upload - accepts base64 in request body"""
    return {"message": "Use profile_image field on artist or cover_image on collection with base64 data"}

# ============== Version Management ==============

@api_router.delete("/songs/{song_id}/versions/{version_id}")
async def delete_song_version(song_id: str, version_id: str, current_user: dict = Depends(get_current_user)):
    song = await db.songs.find_one(team_query(current_user, {"id": song_id}))
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")
    
    await db.songs.update_one(
        {"id": song_id},
        {
            "$pull": {"versions": {"id": version_id}},
            "$set": {"updated_at": datetime.utcnow()}
        }
    )
    return {"message": "Version deleted"}

# ============== Suno Generation Management ==============

@api_router.post("/songs/{song_id}/suno-generations")
async def add_suno_generation(song_id: str, gen: SunoGeneration, current_user: dict = Depends(get_current_user)):
    song = await db.songs.find_one(team_query(current_user, {"id": song_id}))
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")
    
    gen_dict = gen.dict()
    gen_dict["id"] = str(uuid.uuid4())
    gen_dict["created_at"] = datetime.utcnow()
    
    await db.songs.update_one(
        {"id": song_id},
        {
            "$push": {"suno_generations": gen_dict},
            "$set": {"updated_at": datetime.utcnow()}
        }
    )
    
    updated = await db.songs.find_one({"id": song_id})
    return Song(**updated)

@api_router.delete("/songs/{song_id}/suno-generations/{gen_id}")
async def delete_suno_generation(song_id: str, gen_id: str, current_user: dict = Depends(get_current_user)):
    song = await db.songs.find_one(team_query(current_user, {"id": song_id}))
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")
    
    await db.songs.update_one(
        {"id": song_id},
        {
            "$pull": {"suno_generations": {"id": gen_id}},
            "$set": {"updated_at": datetime.utcnow()}
        }
    )
    return {"message": "Suno generation deleted"}

# ============== Saved Prompts on Song Profile ==============

@api_router.post("/songs/{song_id}/saved-prompts")
async def add_saved_prompt(song_id: str, data: SavedPromptCreate, current_user: dict = Depends(get_current_user)):
    song = await db.songs.find_one(team_query(current_user, {"id": song_id}))
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")
    prompt = {
        "id": str(uuid.uuid4()),
        "prompt_type": data.prompt_type,
        "label": data.label,
        "content": data.content,
        "saved_by_id": current_user["id"],
        "saved_by_name": current_user.get("name", ""),
        "created_at": datetime.utcnow().isoformat(),
    }
    await db.songs.update_one(
        {"id": song_id},
        {"$push": {"saved_prompts": prompt}, "$set": {"updated_at": datetime.utcnow()}}
    )
    return prompt

@api_router.delete("/songs/{song_id}/saved-prompts/{prompt_id}")
async def delete_saved_prompt(song_id: str, prompt_id: str, current_user: dict = Depends(get_current_user)):
    song = await db.songs.find_one(team_query(current_user, {"id": song_id}))
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")
    await db.songs.update_one(
        {"id": song_id},
        {"$pull": {"saved_prompts": {"id": prompt_id}}, "$set": {"updated_at": datetime.utcnow()}}
    )
    return {"message": "Saved prompt deleted"}

# ============== Audio File Upload + Re-Analyze ==============

@api_router.post("/upload/audio")
async def upload_audio(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    """Upload an audio file (mp3/wav/m4a/etc.) and get a playable URL back."""
    allowed = {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac", ".webm"}
    ext = pathlib.Path(file.filename or "").suffix.lower()
    if ext not in allowed:
        raise HTTPException(status_code=400, detail=f"Unsupported file type {ext}. Allowed: {', '.join(allowed)}")
    
    # Generate unique filename
    safe_id = str(uuid.uuid4())
    filename = f"{current_user['id'][:8]}_{safe_id}{ext}"
    path = UPLOAD_DIR / "audio" / filename
    
    # Stream-write the file
    contents = await file.read()
    if len(contents) > 50 * 1024 * 1024:  # 50MB limit
        raise HTTPException(status_code=413, detail="File too large (max 50MB)")
    with open(path, "wb") as f:
        f.write(contents)
    
    # Return URL the player can use
    audio_url = f"/api/audio/{filename}"
    return {
        "filename": filename,
        "audio_url": audio_url,
        "size_bytes": len(contents),
        "original_name": file.filename,
    }

class ReAnalyzeRequest(BaseModel):
    custom_prompt: str = ""  # optional user-supplied direction
    focus: str = "all"  # all | enhancements | styles | themes

@api_router.post("/songs/{song_id}/re-analyze")
async def re_analyze_song(song_id: str, data: ReAnalyzeRequest, current_user: dict = Depends(get_current_user)):
    """Re-analyze an existing song, with optional custom direction. Saves the result to saved_prompts gallery."""
    song = await db.songs.find_one(team_query(current_user, {"id": song_id}))
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=503, detail="AI not configured")
    
    # Build context
    artist_context = ""
    if song.get("artist_id"):
        artist = await db.artists.find_one({"id": song["artist_id"]})
        if artist:
            artist_context = f"\nArtist: {artist.get('name','')}\nSound: {artist.get('unique_sound','')}\nGenres: {', '.join(artist.get('genres', []))}"
    
    roster = await db.artists.find(team_query(current_user)).to_list(100)
    roster_summary = "\n".join([
        f"- {a.get('name','')}: {a.get('unique_sound','')[:60]} | genres: {', '.join(a.get('genres',[]))}"
        for a in roster
    ]) if roster else "(no other artists)"
    
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"reanalyze-{uuid.uuid4()}",
            system_message=f"""You are an A&R / production consultant. Help the user enhance an existing song with concrete suggestions. Return ONLY valid JSON.
ROSTER:
{roster_summary}
{artist_context}

CRITICAL: Any field that ends in 'suno' or is meant to be pasted into Suno (style fields, voice keywords) MUST contain ONLY sonic descriptors — NEVER real artist names. Real artist names ARE allowed in 'enhancements', 'narrative_directions', and 'reference_artists' fields because those are for human reference."""
        ).with_model("openai", "gpt-5.2")
        
        directive = "Provide a comprehensive enhancement analysis."
        if data.focus == "enhancements":
            directive = "Focus exclusively on production/arrangement enhancements."
        elif data.focus == "styles":
            directive = "Focus exclusively on Suno style prompt variations."
        elif data.focus == "themes":
            directive = "Focus exclusively on lyrical theme enrichment."
        
        prompt = f"""Re-analyze this song with the goal of suggesting enhancements:

Title: {song.get('title','')}
Current style: {song.get('style_prompt','')}
Current genre: {song.get('genre','')}, mood: {song.get('mood','')}, tempo: {song.get('tempo','')}
Authorship: {song.get('authorship','original')}
Status: {song.get('status','')}
Themes: {', '.join(song.get('themes', []))}
Lyrics:
{(song.get('lyrics','') or '')[:2000]}

User's specific direction: {data.custom_prompt or "(no specific direction - give your best general enhancement suggestions)"}

{directive}

Return ONLY this JSON:
{{
  "enhancements": [
    {{"area": "Production / Arrangement / Hook / Bridge / Vocal performance / Mix", "suggestion": "concrete enhancement", "reason": "why it would work for this song"}}
  ],
  "alternate_styles": [
    {{"label": "what to call this variation", "suno_style": "Suno-pasteable style prompt (NO artist names)", "vibe": "1 sentence description"}}
  ],
  "narrative_directions": [
    "specific direction the song could go lyrically/thematically"
  ],
  "reference_artists": [
    {{"artist": "real-life artist name", "what_to_borrow": "specific element from their work that would elevate this song"}}
  ],
  "roster_repositioning": [
    {{"roster_artist": "name from roster", "fit_score": "low|medium|high|perfect", "how_to_alter": "concrete tweaks to push this song toward that artist's catalog"}}
  ],
  "next_session_plan": ["actionable next steps for the studio session", "..."],
  "summary": "2-3 sentence executive summary of the most important enhancements."
}}"""
        
        user_message = UserMessage(text=prompt)
        response = await chat.send_message(user_message)
        
        import json
        result = None
        try:
            json_start = response.find('{')
            json_end = response.rfind('}') + 1
            if json_start >= 0 and json_end > json_start:
                result = json.loads(response[json_start:json_end])
        except Exception as e:
            logger.error(f"Re-analyze parse failed: {e}")
            result = {"raw": response}
        
        # Build saved-prompt summary
        lines = ["=== Re-Analysis ===", f"Date: {datetime.utcnow().strftime('%b %d, %Y at %H:%M UTC')}"]
        if data.custom_prompt:
            lines.append(f"Direction: {data.custom_prompt}")
        lines.append("")
        if result.get("summary"):
            lines.append(f"Summary: {result['summary']}\n")
        if result.get("enhancements"):
            lines.append("--- Enhancements ---")
            for e in result["enhancements"]:
                if isinstance(e, dict):
                    lines.append(f"\n{e.get('area','')}: {e.get('suggestion','')}")
                    if e.get('reason'): lines.append(f"  Why: {e['reason']}")
        if result.get("alternate_styles"):
            lines.append("\n--- Alternate Suno Styles ---")
            for s in result["alternate_styles"]:
                if isinstance(s, dict):
                    lines.append(f"\n{s.get('label','')}: {s.get('vibe','')}")
                    if s.get('suno_style'): lines.append(f"  {s['suno_style']}")
        if result.get("narrative_directions"):
            lines.append("\n--- Narrative Directions ---")
            for d in result["narrative_directions"]:
                lines.append(f"- {d}")
        if result.get("reference_artists"):
            lines.append("\n--- Reference Artists (inspiration only) ---")
            for r in result["reference_artists"]:
                if isinstance(r, dict):
                    lines.append(f"- {r.get('artist','')}: {r.get('what_to_borrow','')}")
        if result.get("roster_repositioning"):
            lines.append("\n--- Roster Repositioning ---")
            for r in result["roster_repositioning"]:
                if isinstance(r, dict):
                    lines.append(f"- {r.get('roster_artist','')} ({r.get('fit_score','')}): {r.get('how_to_alter','')}")
        if result.get("next_session_plan"):
            lines.append("\n--- Next Session Plan ---")
            for p in result["next_session_plan"]:
                lines.append(f"\u2022 {p}")
        summary_text = "\n".join(lines)
        
        # Save to saved_prompts
        prompt_record = {
            "id": str(uuid.uuid4()),
            "prompt_type": "re_analysis",
            "label": (data.custom_prompt[:40] + "...") if data.custom_prompt and len(data.custom_prompt) > 40 else (data.custom_prompt or f"Re-analysis \u00b7 {datetime.utcnow().strftime('%b %d')}"),
            "content": summary_text,
            "saved_by_id": current_user["id"],
            "saved_by_name": current_user.get("name", ""),
            "created_at": datetime.utcnow().isoformat(),
        }
        await db.songs.update_one(
            {"id": song_id},
            {"$push": {"saved_prompts": prompt_record}, "$set": {"updated_at": datetime.utcnow()}}
        )
        await log_activity(current_user, "reanalyzed", "song", song_id, {"title": song.get("title", "")})
        
        return {"analysis": result, "saved_prompt": prompt_record}
    except Exception as e:
        logger.error(f"Re-analyze error: {e}")
        raise HTTPException(status_code=500, detail=f"Re-analysis failed: {str(e)}")

# ============== Platform Formatting ==============

class PlatformFormatRequest(BaseModel):
    song_id: str
    platforms: List[str] = ["instagram", "tiktok", "youtube", "twitter", "spotify", "apple_music"]

@api_router.post("/songs/{song_id}/format-for-sharing")
async def format_for_sharing(song_id: str, request: PlatformFormatRequest, current_user: dict = Depends(get_current_user)):
    song = await db.songs.find_one(team_query(current_user, {"id": song_id}))
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")
    
    artist_name = "Unknown Artist"
    if song.get("artist_id"):
        artist = await db.artists.find_one({"id": song["artist_id"]})
        if artist:
            artist_name = artist["name"]
    
    title = song.get("title", "")
    genre = song.get("genre", "")
    mood = song.get("mood", "")
    themes = song.get("themes", [])
    lyrics_snippet = song.get("lyrics", "")[:200]
    
    # Build hashtags from genre, mood, themes
    hashtags = []
    if genre:
        hashtags.append(f"#{genre.replace(' ', '').lower()}")
    if mood:
        hashtags.append(f"#{mood.replace(' ', '').lower()}")
    for theme in themes[:3]:
        hashtags.append(f"#{theme.replace(' ', '').lower()}")
    hashtags.extend(["#newmusic", "#aimusic", "#musicproduction"])
    hashtag_str = " ".join(hashtags)
    
    formats = {}
    
    if "instagram" in request.platforms:
        formats["instagram"] = {
            "caption": f"{title} by {artist_name}\n\n{lyrics_snippet}{'...' if len(song.get('lyrics', '')) > 200 else ''}\n\n{hashtag_str}\n\n#linkinbio",
            "notes": "Best with square (1:1) or portrait (4:5) image. Use Reels for 15-90sec clips.",
            "char_limit": 2200,
        }
    
    if "tiktok" in request.platforms:
        hook = lyrics_snippet[:100] if lyrics_snippet else f"New track: {title}"
        formats["tiktok"] = {
            "caption": f"{hook}... {hashtag_str} #fyp #foryoupage",
            "notes": "Keep captions punchy. Use trending sounds or duet features. 9:16 vertical video.",
            "char_limit": 2200,
        }
    
    if "youtube" in request.platforms:
        desc = f"""{title} by {artist_name}

Genre: {genre}
Mood: {mood}

{lyrics_snippet}{'...' if len(song.get('lyrics', '')) > 200 else ''}

---
Follow {artist_name}:
[Spotify Link]
[Apple Music Link]
[Instagram Link]

{hashtag_str}"""
        formats["youtube"] = {
            "title": f"{artist_name} - {title} (Official Audio)",
            "description": desc,
            "tags": [genre, mood] + themes + ["new music", "ai music"],
            "notes": "Use 16:9 landscape. Add end screen with subscribe button. Chapters if >3min.",
        }
    
    if "twitter" in request.platforms:
        formats["twitter"] = {
            "tweet": f"New drop: \"{title}\" by {artist_name}\n\n{lyrics_snippet[:80]}...\n\n{' '.join(hashtags[:4])}\n\n[Link]",
            "notes": "280 char limit. Thread for longer content. Quote tweet with audio snippet.",
            "char_limit": 280,
        }
    
    if "spotify" in request.platforms:
        formats["spotify"] = {
            "metadata": {
                "track_title": title,
                "artist": artist_name,
                "genre": genre,
                "mood": mood,
                "tempo": song.get("tempo", ""),
                "themes": themes,
            },
            "pitch_description": f"{title} is a {mood.lower()} {genre.lower()} track that explores themes of {', '.join(themes[:3]) if themes else 'life and emotion'}.",
            "notes": "Submit via Spotify for Artists at least 2 weeks before release for playlist consideration.",
        }
    
    if "apple_music" in request.platforms:
        formats["apple_music"] = {
            "metadata": {
                "track_title": title,
                "artist": artist_name,
                "genre": genre,
                "mood_tags": [mood] if mood else [],
                "themes": themes,
            },
            "notes": "Submit via Apple Music for Artists. Include high-res artwork (3000x3000 min).",
        }
    
    if "soundcloud" in request.platforms:
        formats["soundcloud"] = {
            "title": f"{artist_name} - {title}",
            "description": f"{lyrics_snippet}\n\n{hashtag_str}",
            "tags": [genre, mood] + themes,
            "notes": "Enable downloads for engagement. Use waveform comments for timestamps.",
        }
    
    return {
        "song_title": title,
        "artist_name": artist_name,
        "formats": formats
    }

# ============== Collaborative Comments ==============

@api_router.post("/comments", response_model=Comment)
async def create_comment(data: CommentCreate, current_user: dict = Depends(get_current_user)):
    d = data.dict()
    d["id"] = str(uuid.uuid4())
    d["author_id"] = current_user["id"]
    d["author_name"] = current_user.get("name", "Unknown")
    d["created_at"] = datetime.utcnow()
    await db.comments.insert_one(d)
    # Log + notify teammates (e.g. "Music Exec commented on song: 'Title'")
    try:
        target_title = ""
        if d.get("target_type") in {"song", "artist", "collection", "idea"}:
            coll = {"song": "songs", "artist": "artists", "collection": "collections", "idea": "ideas"}[d["target_type"]]
            doc = await db[coll].find_one({"id": d["target_id"]})
            if doc:
                target_title = doc.get("title") or doc.get("name") or ""
        await log_activity(
            current_user, "commented", d.get("target_type", "song"), d.get("target_id", ""),
            {"title": target_title, "preview": (d.get("text") or "")[:80]}
        )
    except Exception:
        pass
    return Comment(**d)

@api_router.get("/comments")
async def get_comments(target_type: str, target_id: str, current_user: dict = Depends(get_current_user)):
    comments = await db.comments.find({"target_type": target_type, "target_id": target_id}).sort("created_at", -1).to_list(500)
    result = []
    for c in comments:
        entry = {k: v for k, v in c.items() if k != "_id"}
        entry["is_own"] = c.get("author_id") == current_user["id"]
        result.append(entry)
    return result

@api_router.delete("/comments/{comment_id}")
async def delete_comment(comment_id: str, current_user: dict = Depends(get_current_user)):
    comment = await db.comments.find_one({"id": comment_id})
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    if comment["author_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Can only delete your own comments")
    await db.comments.delete_one({"id": comment_id})
    return {"message": "Comment deleted"}

# ============== CSV Import Parser ==============

class CSVImportRequest(BaseModel):
    csv_text: str
    artist_id: Optional[str] = None
    delimiter: str = ","

@api_router.post("/songs/csv-import")
async def csv_import_songs(data: CSVImportRequest, current_user: dict = Depends(get_current_user)):
    import csv
    import io
    
    # Clean the input: strip BOM, normalize line endings
    csv_text = data.csv_text.strip().replace('\r\n', '\n').replace('\r', '\n')
    if csv_text.startswith('\ufeff'):
        csv_text = csv_text[1:]
    
    # Auto-detect delimiter: if tabs found in first line, use tab
    first_line = csv_text.split('\n')[0] if '\n' in csv_text else csv_text
    delimiter = '\t' if '\t' in first_line else data.delimiter
    
    reader = csv.DictReader(io.StringIO(csv_text), delimiter=delimiter)
    
    # Normalize headers aggressively: lowercase, strip all whitespace, replace spaces with _
    raw_headers = reader.fieldnames or []
    clean_headers = [h.strip().lower().replace(' ', '_').rstrip('_') for h in raw_headers]
    
    # Column name aliases mapping
    col_aliases = {
        'primary_style': 'style_prompt',
        'secondary_style': 'style_secondary', 
        'alternative_style': 'style_alternate',
        'alt_style': 'style_alternate',
        'song_title': 'title',
        'song': 'title',
        'name': 'title',
        'vibe': 'mood',
        'bpm': 'tempo',
        'tags': 'themes',
        'suno_url': 'suno_link',
        'suno': 'suno_link',
        'feat': 'featured',
        'features': 'featured',
        'featured_artists': 'featured',
        'project': 'album',
        'collection': 'album',
        'ep': 'album',
        'playlist': 'album',
        'exclusions_prompt': 'exclusions',
        'song_exclusions': 'exclusions',
        'track_number': 'track',
        'track_#': 'track',
    }
    
    # Check for title column
    title_found = any(h in {'title', 'song_title', 'song', 'name'} for h in clean_headers)
    
    if not title_found:
        return {
            "imported": 0,
            "errors": 1,
            "skipped": 0,
            "songs": [],
            "error_details": [{"row": 0, "error": f"No title column found. Found columns: {', '.join(clean_headers[:15])}. Expected one of: title, song_title, song, name", "title": "HEADER ERROR"}],
            "collections_created": [],
        }
    
    # Pre-load artists and collections for name matching
    all_artists = await db.artists.find(team_query(current_user)).to_list(1000)
    artist_map = {a["name"].lower(): a["id"] for a in all_artists}
    
    all_collections = await db.collections.find(team_query(current_user)).to_list(1000)
    collection_map = {c["title"].lower(): c["id"] for c in all_collections}
    
    # Track new collections created during import
    created_collections = []
    
    imported = []
    skipped = 0
    errors = []
    for i, row in enumerate(reader):
        try:
            # Normalize column names and apply aliases
            normalized = {}
            for k, v in row.items():
                if not k:
                    continue
                clean_key = k.strip().lower().replace(' ', '_').rstrip('_')
                clean_key = col_aliases.get(clean_key, clean_key)  # apply alias
                normalized[clean_key] = (v or '').strip()
            row = normalized
            
            # Get title - skip rows with no usable title
            title = row.get("title", "").strip()
            if not title or len(title) < 2:
                skipped += 1
                continue
            
            # Resolve artist by name or ID
            artist_id = data.artist_id  # default from modal picker
            artist_name_raw = row.get("artist", row.get("artist_name", ""))
            if artist_name_raw:
                matched = artist_map.get(artist_name_raw.lower())
                if matched:
                    artist_id = matched
                # If no match, keep the modal-selected artist_id
            if row.get("artist_id"):
                artist_id = row["artist_id"]
            
            # Resolve collection/album by name or ID
            collection_id = row.get("collection_id")
            album_name_raw = row.get("album", row.get("collection", row.get("project", row.get("ep", row.get("playlist", "")))))
            if album_name_raw and not collection_id:
                matched = collection_map.get(album_name_raw.lower())
                if matched:
                    collection_id = matched
                else:
                    # Auto-create draft collection
                    new_coll = {
                        "id": str(uuid.uuid4()),
                        "user_id": current_user["id"],
        "team_id": current_user.get("team_id", current_user["id"]),
                        "title": album_name_raw,
                        "artist_id": artist_id or "",
                        "collection_type": "EP",
                        "cover_image": "",
                        "cover_image_url": "",
                        "description": "",
                        "release_date": None,
                        "status": "in_progress",
                        "notes": "Auto-created from CSV import",
                        "track_count": 0,
                        "created_at": datetime.utcnow(),
                        "updated_at": datetime.utcnow(),
                    }
                    await db.collections.insert_one(new_coll)
                    collection_id = new_coll["id"]
                    collection_map[album_name_raw.lower()] = collection_id
                    created_collections.append({"title": album_name_raw, "id": collection_id})
            
            # Resolve featured artists by name
            featured_ids = []
            featured_raw = row.get("featured", row.get("featured_artists", row.get("feat", row.get("features", ""))))
            if featured_raw:
                for feat_name in featured_raw.split(";"):
                    feat_name = feat_name.strip()
                    if not feat_name:
                        continue
                    matched = artist_map.get(feat_name.lower())
                    if matched:
                        featured_ids.append(matched)
                    # If no match, skip silently (artist may not exist yet)
            
            # Build suno_generations from suno_link column
            suno_gens = []
            suno_link_raw = row.get("suno_link", row.get("suno_url", row.get("suno", "")))
            if suno_link_raw:
                suno_gens.append({
                    "id": str(uuid.uuid4()),
                    "suno_url": suno_link_raw,
                    "prompt_used": row.get("style_prompt", row.get("style", "")),
                    "style_tags": "",
                    "rating": 0,
                    "is_favorite": False,
                    "notes": "",
                    "created_at": datetime.utcnow(),
                })
            
            # Default to draft if status not recognized
            status = row.get("status", "draft").lower().strip()
            if status not in ("draft", "in_progress", "final", "released"):
                status = "draft"
            
            song_dict = {
                "id": str(uuid.uuid4()),
                "user_id": current_user["id"],
        "team_id": current_user.get("team_id", current_user["id"]),
                "title": title,
                "artist_id": artist_id,
                "featured_artist_ids": featured_ids,
                "lyrics": row.get("lyrics", ""),
                "style_prompt": row.get("style_prompt", row.get("style", row.get("suno_style", row.get("primary_style", "")))),
                "style_secondary": row.get("style_secondary", row.get("secondary_style", "")),
                "style_alternate": row.get("style_alternate", row.get("alternative_style", row.get("alt_style", ""))),
                "genre": row.get("genre", ""),
                "mood": row.get("mood", row.get("vibe", "")),
                "tempo": row.get("tempo", row.get("bpm", "")),
                "themes": [t.strip() for t in row.get("themes", row.get("tags", "")).split(",") if t.strip()] if row.get("themes", row.get("tags", "")) else [],
                "status": status,
                "notes": row.get("notes", ""),
                "exclusions": row.get("exclusions", row.get("exclusions_prompt", row.get("song_exclusions", ""))),
                "todo": [],
                "versions": [],
                "suno_generations": suno_gens,
                "collection_id": collection_id,
                "track_number": int(row.get("track_number", row.get("track", row.get("track_#", "0"))) or 0),
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
            }
            await db.songs.insert_one(song_dict)
            imported.append({"title": song_dict["title"], "id": song_dict["id"], "row": i+1, "artist": artist_name_raw or "from picker", "album": album_name_raw or ""})
            
            # Update artist song count
            if song_dict.get("artist_id"):
                await db.artists.update_one({"id": song_dict["artist_id"]}, {"$inc": {"song_count": 1}})
            
            # Update collection track count
            if collection_id:
                await db.collections.update_one({"id": collection_id}, {"$inc": {"track_count": 1}})
                
        except Exception as e:
            errors.append({"row": i+1, "error": str(e), "title": row.get("title", "unknown")})
    
    return {
        "imported": len(imported),
        "errors": len(errors),
        "skipped": skipped,
        "songs": imported,
        "error_details": errors,
        "collections_created": created_collections,
    }

# ============== Revenue Chart Data ==============

@api_router.get("/revenue/chart")
async def get_revenue_chart(current_user: dict = Depends(get_current_user)):
    entries = await db.revenue.find(team_query(current_user)).to_list(1000)
    
    # Group by period
    by_period = {}
    for e in entries:
        period = e.get("period", "Unknown")
        if period not in by_period:
            by_period[period] = 0
        by_period[period] += e.get("amount", 0)
    
    # Group by platform
    by_platform = {}
    for e in entries:
        platform = e.get("platform", "other")
        if platform not in by_platform:
            by_platform[platform] = 0
        by_platform[platform] += e.get("amount", 0)
    
    # Top songs by revenue
    by_song = {}
    for e in entries:
        sid = e.get("song_id", "unknown")
        if sid and sid != "unknown":
            if sid not in by_song:
                by_song[sid] = 0
            by_song[sid] += e.get("amount", 0)
    
    # Get song titles
    top_songs = []
    for sid, amount in sorted(by_song.items(), key=lambda x: x[1], reverse=True)[:10]:
        song = await db.songs.find_one({"id": sid})
        top_songs.append({"song_id": sid, "title": song.get("title", "Unknown") if song else "Unknown", "amount": amount})
    
    total = sum(e.get("amount", 0) for e in entries)
    
    return {
        "total": total,
        "by_period": [{"period": k, "amount": v} for k, v in sorted(by_period.items())],
        "by_platform": [{"platform": k, "amount": v} for k, v in sorted(by_platform.items(), key=lambda x: x[1], reverse=True)],
        "top_songs": top_songs,
        "entry_count": len(entries),
    }

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
