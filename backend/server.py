from fastapi import FastAPI, APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, timedelta
import jwt
from passlib.context import CryptContext
from emergentintegrations.llm.chat import LlmChat, UserMessage

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
    created_at: datetime = Field(default_factory=datetime.utcnow)

class Token(BaseModel):
    access_token: str
    token_type: str
    user: User

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
    visual_brief: str = ""  # shareable visual identity description
    visual_references: List[str] = []  # reference image URLs
    suno_voice: str = ""  # saved Suno voice ID/name for this artist
    suno_exclusions: str = ""  # default exclusions prompt for this artist
    notes: str = ""

class Artist(ArtistCreate):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    song_count: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

# Suno Generation Models
class SunoGeneration(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    suno_url: str = ""
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
    artist_id: Optional[str] = None
    collection_id: Optional[str] = None  # EP/LP it belongs to
    lyrics: str = ""
    style_prompt: str = ""  # Suno-formatted
    genre: str = ""
    mood: str = ""
    tempo: str = ""
    themes: List[str] = []
    status: str = "draft"  # draft, in_progress, final, released
    notes: str = ""
    todo: List[str] = []
    versions: List[SongVersion] = []
    suno_generations: List[SunoGeneration] = []  # song-level Suno links
    track_number: int = 0  # position in collection

class Song(SongCreate):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

# Idea/Brainstorm Models
class IdeaCreate(BaseModel):
    title: str
    content: str
    type: str = "spark"  # spark, concept, lyrics, melody, style, visual
    tags: List[str] = []
    linked_artist_id: Optional[str] = None
    linked_song_id: Optional[str] = None

class Idea(IdeaCreate):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
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
    artist_id: str
    collection_type: str = "EP"  # EP, LP, Single, Album
    cover_image: str = ""  # base64 or URL
    cover_image_url: str = ""
    description: str = ""
    release_date: Optional[str] = None
    status: str = "in_progress"  # in_progress, completed, released
    notes: str = ""

class Collection(CollectionCreate):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
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
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

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
        "created_at": datetime.utcnow()
    }
    await db.users.insert_one(user_dict)
    
    # Create token
    access_token = create_access_token(data={"sub": user_dict["id"]})
    
    return Token(
        access_token=access_token,
        token_type="bearer",
        user=User(id=user_dict["id"], email=user_dict["email"], name=user_dict["name"])
    )

@api_router.post("/auth/login", response_model=Token)
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email})
    if not user or not verify_password(credentials.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    access_token = create_access_token(data={"sub": user["id"]})
    
    return Token(
        access_token=access_token,
        token_type="bearer",
        user=User(id=user["id"], email=user["email"], name=user["name"])
    )

@api_router.get("/auth/me", response_model=User)
async def get_me(current_user: dict = Depends(get_current_user)):
    return User(id=current_user["id"], email=current_user["email"], name=current_user["name"])

# ============== Artist Routes ==============

@api_router.post("/artists", response_model=Artist)
async def create_artist(artist_data: ArtistCreate, current_user: dict = Depends(get_current_user)):
    artist_dict = artist_data.dict()
    artist_dict["id"] = str(uuid.uuid4())
    artist_dict["user_id"] = current_user["id"]
    artist_dict["song_count"] = 0
    artist_dict["created_at"] = datetime.utcnow()
    artist_dict["updated_at"] = datetime.utcnow()
    
    await db.artists.insert_one(artist_dict)
    return Artist(**artist_dict)

@api_router.get("/artists", response_model=List[Artist])
async def get_artists(
    search: Optional[str] = None,
    genre: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {"user_id": current_user["id"]}
    
    artists = await db.artists.find(query).to_list(1000)
    
    # Apply filters
    if search:
        search_lower = search.lower()
        artists = [a for a in artists if 
                   search_lower in a.get("name", "").lower() or 
                   search_lower in a.get("bio", "").lower() or
                   search_lower in a.get("unique_sound", "").lower()]
    
    if genre:
        genre_lower = genre.lower()
        artists = [a for a in artists if 
                   any(genre_lower in g.lower() for g in a.get("genres", []))]
    
    return [Artist(**a) for a in artists]

@api_router.get("/artists/{artist_id}", response_model=Artist)
async def get_artist(artist_id: str, current_user: dict = Depends(get_current_user)):
    artist = await db.artists.find_one({"id": artist_id, "user_id": current_user["id"]})
    if not artist:
        raise HTTPException(status_code=404, detail="Artist not found")
    return Artist(**artist)

@api_router.put("/artists/{artist_id}", response_model=Artist)
async def update_artist(artist_id: str, artist_data: ArtistCreate, current_user: dict = Depends(get_current_user)):
    artist = await db.artists.find_one({"id": artist_id, "user_id": current_user["id"]})
    if not artist:
        raise HTTPException(status_code=404, detail="Artist not found")
    
    update_dict = artist_data.dict()
    update_dict["updated_at"] = datetime.utcnow()
    
    await db.artists.update_one({"id": artist_id}, {"$set": update_dict})
    updated = await db.artists.find_one({"id": artist_id})
    return Artist(**updated)

@api_router.delete("/artists/{artist_id}")
async def delete_artist(artist_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.artists.delete_one({"id": artist_id, "user_id": current_user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Artist not found")
    return {"message": "Artist deleted"}

# ============== Song Routes ==============

@api_router.post("/songs", response_model=Song)
async def create_song(song_data: SongCreate, current_user: dict = Depends(get_current_user)):
    song_dict = song_data.dict()
    song_dict["id"] = str(uuid.uuid4())
    song_dict["user_id"] = current_user["id"]
    song_dict["created_at"] = datetime.utcnow()
    song_dict["updated_at"] = datetime.utcnow()
    
    # Update artist song count
    if song_data.artist_id:
        await db.artists.update_one(
            {"id": song_data.artist_id, "user_id": current_user["id"]},
            {"$inc": {"song_count": 1}}
        )
    
    await db.songs.insert_one(song_dict)
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
    query = {"user_id": current_user["id"]}
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
    
    songs = await db.songs.find(query).sort("updated_at", -1).to_list(1000)
    
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
    song = await db.songs.find_one({"id": song_id, "user_id": current_user["id"]})
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")
    return Song(**song)

@api_router.put("/songs/{song_id}", response_model=Song)
async def update_song(song_id: str, song_data: SongCreate, current_user: dict = Depends(get_current_user)):
    song = await db.songs.find_one({"id": song_id, "user_id": current_user["id"]})
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")
    
    update_dict = song_data.dict()
    update_dict["updated_at"] = datetime.utcnow()
    
    await db.songs.update_one({"id": song_id}, {"$set": update_dict})
    updated = await db.songs.find_one({"id": song_id})
    return Song(**updated)

@api_router.delete("/songs/{song_id}")
async def delete_song(song_id: str, current_user: dict = Depends(get_current_user)):
    song = await db.songs.find_one({"id": song_id, "user_id": current_user["id"]})
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")
    
    # Update artist song count
    if song.get("artist_id"):
        await db.artists.update_one(
            {"id": song["artist_id"]},
            {"$inc": {"song_count": -1}}
        )
    
    await db.songs.delete_one({"id": song_id})
    return {"message": "Song deleted"}

# Add version to song
@api_router.post("/songs/{song_id}/versions", response_model=Song)
async def add_song_version(song_id: str, version: SongVersion, current_user: dict = Depends(get_current_user)):
    song = await db.songs.find_one({"id": song_id, "user_id": current_user["id"]})
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
    idea_dict["created_at"] = datetime.utcnow()
    idea_dict["updated_at"] = datetime.utcnow()
    
    await db.ideas.insert_one(idea_dict)
    return Idea(**idea_dict)

@api_router.get("/ideas", response_model=List[Idea])
async def get_ideas(
    type: Optional[str] = None,
    search: Optional[str] = None,
    linked_artist_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {"user_id": current_user["id"]}
    if type:
        query["type"] = type
    if linked_artist_id:
        query["linked_artist_id"] = linked_artist_id
    
    ideas = await db.ideas.find(query).sort("created_at", -1).to_list(1000)
    
    if search:
        search_lower = search.lower()
        ideas = [i for i in ideas if 
                 search_lower in i.get("title", "").lower() or 
                 search_lower in i.get("content", "").lower() or
                 any(search_lower in t.lower() for t in i.get("tags", []))]
    
    return [Idea(**i) for i in ideas]

@api_router.get("/ideas/{idea_id}", response_model=Idea)
async def get_idea(idea_id: str, current_user: dict = Depends(get_current_user)):
    idea = await db.ideas.find_one({"id": idea_id, "user_id": current_user["id"]})
    if not idea:
        raise HTTPException(status_code=404, detail="Idea not found")
    return Idea(**idea)

@api_router.put("/ideas/{idea_id}", response_model=Idea)
async def update_idea(idea_id: str, idea_data: IdeaCreate, current_user: dict = Depends(get_current_user)):
    idea = await db.ideas.find_one({"id": idea_id, "user_id": current_user["id"]})
    if not idea:
        raise HTTPException(status_code=404, detail="Idea not found")
    
    update_dict = idea_data.dict()
    update_dict["updated_at"] = datetime.utcnow()
    
    await db.ideas.update_one({"id": idea_id}, {"$set": update_dict})
    updated = await db.ideas.find_one({"id": idea_id})
    return Idea(**updated)

@api_router.delete("/ideas/{idea_id}")
async def delete_idea(idea_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.ideas.delete_one({"id": idea_id, "user_id": current_user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Idea not found")
    return {"message": "Idea deleted"}

# ============== Distribution Routes ==============

@api_router.post("/distributions", response_model=Distribution)
async def create_distribution(dist_data: DistributionCreate, current_user: dict = Depends(get_current_user)):
    dist_dict = dist_data.dict()
    dist_dict["id"] = str(uuid.uuid4())
    dist_dict["user_id"] = current_user["id"]
    dist_dict["created_at"] = datetime.utcnow()
    dist_dict["updated_at"] = datetime.utcnow()
    
    await db.distributions.insert_one(dist_dict)
    return Distribution(**dist_dict)

@api_router.get("/distributions", response_model=List[Distribution])
async def get_distributions(
    song_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {"user_id": current_user["id"]}
    if song_id:
        query["song_id"] = song_id
    
    dists = await db.distributions.find(query).to_list(1000)
    return [Distribution(**d) for d in dists]

@api_router.put("/distributions/{dist_id}", response_model=Distribution)
async def update_distribution(dist_id: str, dist_data: DistributionCreate, current_user: dict = Depends(get_current_user)):
    dist = await db.distributions.find_one({"id": dist_id, "user_id": current_user["id"]})
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
        artist = await db.artists.find_one({"id": request.artist_id, "user_id": current_user["id"]})
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
    
    artist_count = await db.artists.count_documents({"user_id": user_id})
    song_count = await db.songs.count_documents({"user_id": user_id})
    idea_count = await db.ideas.count_documents({"user_id": user_id})
    
    # Song status breakdown
    draft_count = await db.songs.count_documents({"user_id": user_id, "status": "draft"})
    in_progress_count = await db.songs.count_documents({"user_id": user_id, "status": "in_progress"})
    final_count = await db.songs.count_documents({"user_id": user_id, "status": "final"})
    released_count = await db.songs.count_documents({"user_id": user_id, "status": "released"})
    
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
    d["track_count"] = 0
    d["created_at"] = datetime.utcnow()
    d["updated_at"] = datetime.utcnow()
    await db.collections.insert_one(d)
    return Collection(**d)

@api_router.get("/collections", response_model=List[Collection])
async def get_collections(artist_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    query = {"user_id": current_user["id"]}
    if artist_id:
        query["artist_id"] = artist_id
    items = await db.collections.find(query).sort("updated_at", -1).to_list(1000)
    return [Collection(**c) for c in items]

@api_router.get("/collections/{coll_id}", response_model=Collection)
async def get_collection(coll_id: str, current_user: dict = Depends(get_current_user)):
    c = await db.collections.find_one({"id": coll_id, "user_id": current_user["id"]})
    if not c:
        raise HTTPException(status_code=404, detail="Collection not found")
    return Collection(**c)

@api_router.put("/collections/{coll_id}", response_model=Collection)
async def update_collection(coll_id: str, data: CollectionCreate, current_user: dict = Depends(get_current_user)):
    c = await db.collections.find_one({"id": coll_id, "user_id": current_user["id"]})
    if not c:
        raise HTTPException(status_code=404, detail="Collection not found")
    update_dict = data.dict()
    update_dict["updated_at"] = datetime.utcnow()
    # Recount tracks
    track_count = await db.songs.count_documents({"collection_id": coll_id, "user_id": current_user["id"]})
    update_dict["track_count"] = track_count
    await db.collections.update_one({"id": coll_id}, {"$set": update_dict})
    updated = await db.collections.find_one({"id": coll_id})
    return Collection(**updated)

@api_router.delete("/collections/{coll_id}")
async def delete_collection(coll_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.collections.delete_one({"id": coll_id, "user_id": current_user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Collection not found")
    # Unlink songs
    await db.songs.update_many({"collection_id": coll_id}, {"$set": {"collection_id": None}})
    return {"message": "Collection deleted"}

@api_router.get("/collections/{coll_id}/songs", response_model=List[Song])
async def get_collection_songs(coll_id: str, current_user: dict = Depends(get_current_user)):
    songs = await db.songs.find({"collection_id": coll_id, "user_id": current_user["id"]}).sort("track_number", 1).to_list(1000)
    return [Song(**s) for s in songs]

# ============== Revenue Routes ==============

@api_router.post("/revenue", response_model=RevenueEntry)
async def create_revenue_entry(data: RevenueEntryCreate, current_user: dict = Depends(get_current_user)):
    d = data.dict()
    d["id"] = str(uuid.uuid4())
    d["user_id"] = current_user["id"]
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
    query = {"user_id": current_user["id"]}
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
    result = await db.revenue.delete_one({"id": entry_id, "user_id": current_user["id"]})
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
        song = await db.songs.find_one({"id": request.song_id, "user_id": current_user["id"]})
        if song:
            lyrics = song.get("lyrics", lyrics)
            if song.get("artist_id"):
                request.artist_id = song["artist_id"]
    
    if request.artist_id:
        artist = await db.artists.find_one({"id": request.artist_id, "user_id": current_user["id"]})
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
            system_message=f"""You are an expert music video director and visual storyteller. 
{artist_context}

Create detailed scene-by-scene video prompts that:
1. Follow the emotional arc of the lyrics
2. Match the artist's visual identity and aesthetic
3. Include specific visual directions (camera angles, lighting, color grading)
4. Are formatted for AI video generation tools like Sora or Runway
5. Adapt to different platform formats when requested

Do NOT reference real artists, directors, or copyrighted works.
Include timestamps based on typical song structure."""
        ).with_model("openai", "gpt-5.2")
        
        platform_instructions = ""
        for p in request.platforms:
            if p == "youtube":
                platform_instructions += "\n- YouTube (16:9 landscape, 3-5 min, cinematic quality)"
            elif p == "tiktok":
                platform_instructions += "\n- TikTok (9:16 vertical, 15-60sec hooks, fast cuts)"
            elif p == "instagram":
                platform_instructions += "\n- Instagram Reels (9:16 vertical, 15-90sec, aesthetic focus)"
        
        prompt = f"""Create a complete music video concept with scene-by-scene prompts for the following lyrics:

{lyrics[:2000]}

{f'Visual style direction: {request.style}' if request.style else ''}

Generate:
1. **Overall Vision**: 2-3 sentence concept overview
2. **Scene-by-Scene Storyboard**: 6-10 scenes with:
   - Timestamp (e.g., 0:00-0:15)
   - Visual description (what we see)
   - Camera/movement direction
   - Mood/lighting
   - AI generation prompt for that scene
3. **Platform Adaptations**: Format-specific directions for:{platform_instructions}
"""
        
        user_message = UserMessage(text=prompt)
        response = await chat.send_message(user_message)
        
        return {"video_prompts": response, "platforms": request.platforms}
        
    except Exception as e:
        logger.error(f"Video prompt generation error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Video prompt generation failed: {str(e)}")

# ============== Artist Identity Package ==============

@api_router.get("/artists/{artist_id}/identity-package")
async def get_artist_identity_package(artist_id: str, current_user: dict = Depends(get_current_user)):
    artist = await db.artists.find_one({"id": artist_id, "user_id": current_user["id"]})
    if not artist:
        raise HTTPException(status_code=404, detail="Artist not found")
    
    # Get artist's songs for context
    songs = await db.songs.find({"artist_id": artist_id, "user_id": current_user["id"]}).to_list(100)
    collections = await db.collections.find({"artist_id": artist_id, "user_id": current_user["id"]}).to_list(100)
    
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
    song = await db.songs.find_one({"id": song_id, "user_id": current_user["id"]})
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
    song = await db.songs.find_one({"id": song_id, "user_id": current_user["id"]})
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
    song = await db.songs.find_one({"id": song_id, "user_id": current_user["id"]})
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

# ============== Platform Formatting ==============

class PlatformFormatRequest(BaseModel):
    song_id: str
    platforms: List[str] = ["instagram", "tiktok", "youtube", "twitter", "spotify", "apple_music"]

@api_router.post("/songs/{song_id}/format-for-sharing")
async def format_for_sharing(song_id: str, request: PlatformFormatRequest, current_user: dict = Depends(get_current_user)):
    song = await db.songs.find_one({"id": song_id, "user_id": current_user["id"]})
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
    
    reader = csv.DictReader(io.StringIO(data.csv_text), delimiter=data.delimiter)
    
    # Pre-load artists and collections for name matching
    all_artists = await db.artists.find({"user_id": current_user["id"]}).to_list(1000)
    artist_map = {a["name"].lower(): a["id"] for a in all_artists}
    
    all_collections = await db.collections.find({"user_id": current_user["id"]}).to_list(1000)
    collection_map = {c["title"].lower(): c["id"] for c in all_collections}
    
    # Track new collections created during import
    created_collections = []
    
    imported = []
    errors = []
    for i, row in enumerate(reader):
        try:
            # Normalize column names (lowercase, strip, underscores)
            row = {k.strip().lower().replace(' ', '_'): v.strip() for k, v in row.items() if k}
            
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
                "title": row.get("title", row.get("song_title", row.get("song", row.get("name", f"Untitled {i+1}")))),
                "artist_id": artist_id,
                "lyrics": row.get("lyrics", ""),
                "style_prompt": row.get("style_prompt", row.get("style", row.get("suno_style", ""))),
                "genre": row.get("genre", ""),
                "mood": row.get("mood", row.get("vibe", "")),
                "tempo": row.get("tempo", row.get("bpm", "")),
                "themes": [t.strip() for t in row.get("themes", row.get("tags", "")).split(",") if t.strip()] if row.get("themes", row.get("tags", "")) else [],
                "status": status,
                "notes": row.get("notes", ""),
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
        "songs": imported,
        "error_details": errors,
        "collections_created": created_collections,
    }

# ============== Revenue Chart Data ==============

@api_router.get("/revenue/chart")
async def get_revenue_chart(current_user: dict = Depends(get_current_user)):
    entries = await db.revenue.find({"user_id": current_user["id"]}).to_list(1000)
    
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
