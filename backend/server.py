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
    version_label: str = ""  # user-friendly label
    audio_url: str = ""
    suno_link: str = ""
    suno_generations: List[SunoGeneration] = []
    notes: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)

class SongCreate(BaseModel):
    title: str
    artist_id: Optional[str] = None
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
