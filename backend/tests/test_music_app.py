"""
Backend API tests for AI Music Artist Management app
Tests: Auth, Artists, Songs, Ideas, Distributions, Suno Generations, Sharing
"""
import pytest
import requests
import os

# Read from frontend .env or use default
def get_base_url():
    try:
        with open('/app/frontend/.env', 'r') as f:
            for line in f:
                if line.startswith('EXPO_PUBLIC_BACKEND_URL='):
                    return line.split('=', 1)[1].strip().rstrip('/')
    except:
        pass
    return 'https://artist-catalog-pro.preview.emergentagent.com'

BASE_URL = get_base_url()

# Test data
TEST_USER = {
    "email": "TEST_pytest_user@example.com",
    "password": "testpass123",
    "name": "Test User"
}

@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session

@pytest.fixture(scope="module")
def auth_token(api_client):
    """Register test user and get auth token"""
    # Try to register
    response = api_client.post(f"{BASE_URL}/api/auth/register", json=TEST_USER)
    if response.status_code == 400:
        # User exists, login instead
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER["email"],
            "password": TEST_USER["password"]
        })
    
    assert response.status_code in [200, 201], f"Auth failed: {response.text}"
    data = response.json()
    assert "access_token" in data
    return data["access_token"]

@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Headers with auth token"""
    return {"Authorization": f"Bearer {auth_token}"}

# ============== Health Check ==============

def test_health_check(api_client):
    """Test health endpoint"""
    response = api_client.get(f"{BASE_URL}/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    print("✓ Health check passed")

# ============== Auth Tests ==============

def test_register_new_user(api_client):
    """Test user registration"""
    new_user = {
        "email": f"TEST_new_{os.urandom(4).hex()}@example.com",
        "password": "newpass123",
        "name": "New Test User"
    }
    response = api_client.post(f"{BASE_URL}/api/auth/register", json=new_user)
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "user" in data
    assert data["user"]["email"] == new_user["email"]
    print("✓ User registration passed")

def test_login_success(api_client, auth_token):
    """Test login with correct credentials"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_USER["email"],
        "password": TEST_USER["password"]
    })
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "user" in data
    print("✓ Login success passed")

def test_login_invalid_credentials(api_client):
    """Test login with wrong password"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_USER["email"],
        "password": "wrongpassword"
    })
    assert response.status_code == 401
    print("✓ Login invalid credentials passed")

def test_get_current_user(api_client, auth_headers):
    """Test /auth/me endpoint"""
    response = api_client.get(f"{BASE_URL}/api/auth/me", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == TEST_USER["email"]
    print("✓ Get current user passed")

# ============== Artist Tests ==============

@pytest.fixture(scope="module")
def test_artist(api_client, auth_headers):
    """Create a test artist"""
    artist_data = {
        "name": "TEST_Artist_Pytest",
        "bio": "Test artist for pytest",
        "unique_sound": "Electronic indie vibes",
        "genres": ["Electronic", "Indie"],
        "themes": ["Love", "Technology"],
        "tone": "Upbeat",
        "patterns": ["Synth-heavy", "Catchy hooks"],
        "branding": {
            "color_palette": ["#FF5733", "#33FF57"],
            "visual_style": "Minimalist",
            "aesthetic": "Futuristic",
            "mood_keywords": ["Energetic", "Dreamy"]
        },
        "notes": "Test notes"
    }
    response = api_client.post(f"{BASE_URL}/api/artists", json=artist_data, headers=auth_headers)
    assert response.status_code == 200
    artist = response.json()
    assert artist["name"] == artist_data["name"]
    print(f"✓ Created test artist: {artist['id']}")
    return artist

def test_create_artist(api_client, auth_headers):
    """Test creating an artist"""
    artist_data = {
        "name": "TEST_New_Artist",
        "bio": "New artist bio",
        "genres": ["Pop", "Rock"],
        "themes": ["Freedom"],
        "tone": "Energetic"
    }
    response = api_client.post(f"{BASE_URL}/api/artists", json=artist_data, headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == artist_data["name"]
    assert "id" in data
    print("✓ Create artist passed")

def test_get_artists(api_client, auth_headers, test_artist):
    """Test fetching all artists"""
    response = api_client.get(f"{BASE_URL}/api/artists", headers=auth_headers)
    assert response.status_code == 200
    artists = response.json()
    assert isinstance(artists, list)
    assert len(artists) > 0
    print(f"✓ Get artists passed ({len(artists)} artists)")

def test_search_artists(api_client, auth_headers, test_artist):
    """Test artist search functionality"""
    response = api_client.get(f"{BASE_URL}/api/artists?search=Pytest", headers=auth_headers)
    assert response.status_code == 200
    artists = response.json()
    assert isinstance(artists, list)
    # Should find our test artist
    found = any(a["name"] == test_artist["name"] for a in artists)
    assert found, "Test artist not found in search results"
    print("✓ Search artists passed")

def test_get_artist_by_id(api_client, auth_headers, test_artist):
    """Test fetching single artist"""
    response = api_client.get(f"{BASE_URL}/api/artists/{test_artist['id']}", headers=auth_headers)
    assert response.status_code == 200
    artist = response.json()
    assert artist["id"] == test_artist["id"]
    assert artist["name"] == test_artist["name"]
    print("✓ Get artist by ID passed")

def test_update_artist(api_client, auth_headers, test_artist):
    """Test updating an artist"""
    update_data = {
        "name": test_artist["name"],
        "bio": "Updated bio for testing",
        "genres": test_artist["genres"],
        "themes": ["Updated Theme"],
        "tone": test_artist["tone"]
    }
    response = api_client.put(f"{BASE_URL}/api/artists/{test_artist['id']}", json=update_data, headers=auth_headers)
    assert response.status_code == 200
    artist = response.json()
    assert artist["bio"] == update_data["bio"]
    assert "Updated Theme" in artist["themes"]
    print("✓ Update artist passed")

# ============== Song Tests ==============

@pytest.fixture(scope="module")
def test_song(api_client, auth_headers, test_artist):
    """Create a test song"""
    song_data = {
        "title": "TEST_Song_Pytest",
        "artist_id": test_artist["id"],
        "lyrics": "Test lyrics for pytest song",
        "style_prompt": "Electronic indie with synth",
        "genre": "Electronic",
        "mood": "Upbeat",
        "tempo": "120 BPM",
        "themes": ["Technology", "Future"],
        "status": "draft",
        "notes": "Test song notes",
        "todo": ["Record vocals", "Mix track"]
    }
    response = api_client.post(f"{BASE_URL}/api/songs", json=song_data, headers=auth_headers)
    assert response.status_code == 200
    song = response.json()
    assert song["title"] == song_data["title"]
    print(f"✓ Created test song: {song['id']}")
    return song

def test_create_song(api_client, auth_headers, test_artist):
    """Test creating a song"""
    song_data = {
        "title": "TEST_New_Song",
        "artist_id": test_artist["id"],
        "lyrics": "New song lyrics",
        "genre": "Pop",
        "status": "draft"
    }
    response = api_client.post(f"{BASE_URL}/api/songs", json=song_data, headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["title"] == song_data["title"]
    assert "id" in data
    
    # Verify persistence with GET
    get_response = api_client.get(f"{BASE_URL}/api/songs/{data['id']}", headers=auth_headers)
    assert get_response.status_code == 200
    print("✓ Create song passed")

def test_get_songs(api_client, auth_headers, test_song):
    """Test fetching all songs"""
    response = api_client.get(f"{BASE_URL}/api/songs", headers=auth_headers)
    assert response.status_code == 200
    songs = response.json()
    assert isinstance(songs, list)
    assert len(songs) > 0
    print(f"✓ Get songs passed ({len(songs)} songs)")

def test_search_songs(api_client, auth_headers, test_song):
    """Test song search functionality"""
    response = api_client.get(f"{BASE_URL}/api/songs?search=Pytest", headers=auth_headers)
    assert response.status_code == 200
    songs = response.json()
    assert isinstance(songs, list)
    found = any(s["title"] == test_song["title"] for s in songs)
    assert found, "Test song not found in search results"
    print("✓ Search songs passed")

def test_filter_songs_by_status(api_client, auth_headers, test_song):
    """Test filtering songs by status"""
    response = api_client.get(f"{BASE_URL}/api/songs?status=draft", headers=auth_headers)
    assert response.status_code == 200
    songs = response.json()
    assert isinstance(songs, list)
    # All returned songs should have draft status
    for song in songs:
        assert song["status"] == "draft"
    print("✓ Filter songs by status passed")

def test_filter_songs_by_artist(api_client, auth_headers, test_artist, test_song):
    """Test filtering songs by artist"""
    response = api_client.get(f"{BASE_URL}/api/songs?artist_id={test_artist['id']}", headers=auth_headers)
    assert response.status_code == 200
    songs = response.json()
    assert isinstance(songs, list)
    # All returned songs should belong to test artist
    for song in songs:
        assert song["artist_id"] == test_artist["id"]
    print("✓ Filter songs by artist passed")

def test_get_song_by_id(api_client, auth_headers, test_song):
    """Test fetching single song"""
    response = api_client.get(f"{BASE_URL}/api/songs/{test_song['id']}", headers=auth_headers)
    assert response.status_code == 200
    song = response.json()
    assert song["id"] == test_song["id"]
    assert song["title"] == test_song["title"]
    print("✓ Get song by ID passed")

def test_update_song(api_client, auth_headers, test_song):
    """Test updating a song"""
    update_data = {
        "title": test_song["title"],
        "artist_id": test_song["artist_id"],
        "lyrics": "Updated lyrics",
        "status": "in_progress",
        "genre": test_song["genre"]
    }
    response = api_client.put(f"{BASE_URL}/api/songs/{test_song['id']}", json=update_data, headers=auth_headers)
    assert response.status_code == 200
    song = response.json()
    assert song["lyrics"] == update_data["lyrics"]
    assert song["status"] == "in_progress"
    
    # Verify persistence
    get_response = api_client.get(f"{BASE_URL}/api/songs/{test_song['id']}", headers=auth_headers)
    assert get_response.status_code == 200
    verified = get_response.json()
    assert verified["status"] == "in_progress"
    print("✓ Update song passed")

# ============== Suno Generation Tests ==============

def test_add_suno_generation(api_client, auth_headers, test_song):
    """Test adding Suno generation to song"""
    gen_data = {
        "suno_url": "https://suno.com/song/test123",
        "prompt_used": "Electronic indie with synth",
        "style_tags": "electronic, indie",
        "rating": 4,
        "is_favorite": True,
        "notes": "Great generation"
    }
    response = api_client.post(f"{BASE_URL}/api/songs/{test_song['id']}/suno-generations", 
                               json=gen_data, headers=auth_headers)
    assert response.status_code == 200
    song = response.json()
    assert "suno_generations" in song
    assert len(song["suno_generations"]) > 0
    
    # Verify the generation was added
    latest_gen = song["suno_generations"][-1]
    assert latest_gen["suno_url"] == gen_data["suno_url"]
    assert latest_gen["rating"] == gen_data["rating"]
    print("✓ Add Suno generation passed")
    return latest_gen["id"]

def test_delete_suno_generation(api_client, auth_headers, test_song):
    """Test deleting Suno generation"""
    # First add a generation
    gen_data = {
        "suno_url": "https://suno.com/song/delete_test",
        "prompt_used": "Test prompt",
        "rating": 3
    }
    add_response = api_client.post(f"{BASE_URL}/api/songs/{test_song['id']}/suno-generations", 
                                   json=gen_data, headers=auth_headers)
    assert add_response.status_code == 200
    song = add_response.json()
    gen_id = song["suno_generations"][-1]["id"]
    
    # Now delete it
    delete_response = api_client.delete(
        f"{BASE_URL}/api/songs/{test_song['id']}/suno-generations/{gen_id}",
        headers=auth_headers
    )
    assert delete_response.status_code == 200
    
    # Verify deletion
    get_response = api_client.get(f"{BASE_URL}/api/songs/{test_song['id']}", headers=auth_headers)
    updated_song = get_response.json()
    gen_ids = [g["id"] for g in updated_song.get("suno_generations", [])]
    assert gen_id not in gen_ids
    print("✓ Delete Suno generation passed")

# ============== Ideas Tests ==============

@pytest.fixture(scope="module")
def test_idea(api_client, auth_headers):
    """Create a test idea"""
    idea_data = {
        "title": "TEST_Idea_Pytest",
        "content": "Test idea content for pytest",
        "type": "spark",
        "tags": ["test", "pytest"]
    }
    response = api_client.post(f"{BASE_URL}/api/ideas", json=idea_data, headers=auth_headers)
    assert response.status_code == 200
    idea = response.json()
    assert idea["title"] == idea_data["title"]
    print(f"✓ Created test idea: {idea['id']}")
    return idea

def test_create_idea(api_client, auth_headers):
    """Test creating an idea"""
    idea_data = {
        "title": "TEST_New_Idea",
        "content": "New idea content",
        "type": "concept",
        "tags": ["new", "test"]
    }
    response = api_client.post(f"{BASE_URL}/api/ideas", json=idea_data, headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["title"] == idea_data["title"]
    assert "id" in data
    
    # Verify persistence
    get_response = api_client.get(f"{BASE_URL}/api/ideas/{data['id']}", headers=auth_headers)
    assert get_response.status_code == 200
    print("✓ Create idea passed")

def test_get_ideas(api_client, auth_headers, test_idea):
    """Test fetching all ideas"""
    response = api_client.get(f"{BASE_URL}/api/ideas", headers=auth_headers)
    assert response.status_code == 200
    ideas = response.json()
    assert isinstance(ideas, list)
    assert len(ideas) > 0
    print(f"✓ Get ideas passed ({len(ideas)} ideas)")

def test_search_ideas(api_client, auth_headers, test_idea):
    """Test idea search functionality"""
    response = api_client.get(f"{BASE_URL}/api/ideas?search=Pytest", headers=auth_headers)
    assert response.status_code == 200
    ideas = response.json()
    assert isinstance(ideas, list)
    found = any(i["title"] == test_idea["title"] for i in ideas)
    assert found, "Test idea not found in search results"
    print("✓ Search ideas passed")

def test_filter_ideas_by_type(api_client, auth_headers, test_idea):
    """Test filtering ideas by type"""
    response = api_client.get(f"{BASE_URL}/api/ideas?type=spark", headers=auth_headers)
    assert response.status_code == 200
    ideas = response.json()
    assert isinstance(ideas, list)
    for idea in ideas:
        assert idea["type"] == "spark"
    print("✓ Filter ideas by type passed")

def test_get_idea_by_id(api_client, auth_headers, test_idea):
    """Test fetching single idea"""
    response = api_client.get(f"{BASE_URL}/api/ideas/{test_idea['id']}", headers=auth_headers)
    assert response.status_code == 200
    idea = response.json()
    assert idea["id"] == test_idea["id"]
    assert idea["title"] == test_idea["title"]
    print("✓ Get idea by ID passed")

def test_update_idea(api_client, auth_headers, test_idea):
    """Test updating an idea"""
    update_data = {
        "title": test_idea["title"],
        "content": "Updated content",
        "type": "concept",
        "tags": ["updated"]
    }
    response = api_client.put(f"{BASE_URL}/api/ideas/{test_idea['id']}", json=update_data, headers=auth_headers)
    assert response.status_code == 200
    idea = response.json()
    assert idea["content"] == update_data["content"]
    assert idea["type"] == "concept"
    print("✓ Update idea passed")

# ============== Distribution Tests ==============

def test_create_distribution(api_client, auth_headers, test_song):
    """Test creating distribution tracking"""
    dist_data = {
        "song_id": test_song["id"],
        "entries": [
            {
                "platform": "spotify",
                "url": "https://spotify.com/track/test123",
                "status": "live",
                "format_notes": "Submitted via DistroKid"
            },
            {
                "platform": "apple_music",
                "url": "",
                "status": "pending",
                "format_notes": ""
            }
        ],
        "notes": "Test distribution"
    }
    response = api_client.post(f"{BASE_URL}/api/distributions", json=dist_data, headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["song_id"] == test_song["id"]
    assert len(data["entries"]) == 2
    assert "id" in data
    
    # Verify persistence
    get_response = api_client.get(f"{BASE_URL}/api/distributions?song_id={test_song['id']}", headers=auth_headers)
    assert get_response.status_code == 200
    dists = get_response.json()
    assert len(dists) > 0
    print("✓ Create distribution passed")
    return data["id"]

def test_get_distributions(api_client, auth_headers, test_song):
    """Test fetching distributions"""
    response = api_client.get(f"{BASE_URL}/api/distributions", headers=auth_headers)
    assert response.status_code == 200
    dists = response.json()
    assert isinstance(dists, list)
    print(f"✓ Get distributions passed ({len(dists)} distributions)")

def test_get_distributions_by_song(api_client, auth_headers, test_song):
    """Test filtering distributions by song"""
    response = api_client.get(f"{BASE_URL}/api/distributions?song_id={test_song['id']}", headers=auth_headers)
    assert response.status_code == 200
    dists = response.json()
    assert isinstance(dists, list)
    for dist in dists:
        assert dist["song_id"] == test_song["id"]
    print("✓ Get distributions by song passed")

def test_update_distribution(api_client, auth_headers, test_song):
    """Test updating distribution"""
    # First create one
    dist_data = {
        "song_id": test_song["id"],
        "entries": [{"platform": "youtube", "url": "", "status": "pending"}],
        "notes": "Initial"
    }
    create_response = api_client.post(f"{BASE_URL}/api/distributions", json=dist_data, headers=auth_headers)
    assert create_response.status_code == 200
    dist_id = create_response.json()["id"]
    
    # Update it
    update_data = {
        "song_id": test_song["id"],
        "entries": [{"platform": "youtube", "url": "https://youtube.com/watch?v=test", "status": "live"}],
        "notes": "Updated"
    }
    update_response = api_client.put(f"{BASE_URL}/api/distributions/{dist_id}", json=update_data, headers=auth_headers)
    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated["entries"][0]["status"] == "live"
    assert updated["notes"] == "Updated"
    print("✓ Update distribution passed")

# ============== Platform Sharing Tests ==============

def test_format_for_sharing(api_client, auth_headers, test_song):
    """Test platform-specific sharing format generation"""
    request_data = {
        "song_id": test_song["id"],
        "platforms": ["instagram", "tiktok", "youtube", "spotify"]
    }
    response = api_client.post(f"{BASE_URL}/api/songs/{test_song['id']}/format-for-sharing", 
                               json=request_data, headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    
    # Verify response structure
    assert "song_title" in data
    assert "artist_name" in data
    assert "formats" in data
    
    # Check platform-specific formats
    formats = data["formats"]
    assert "instagram" in formats
    assert "tiktok" in formats
    assert "youtube" in formats
    assert "spotify" in formats
    
    # Verify Instagram format
    ig = formats["instagram"]
    assert "caption" in ig
    assert "notes" in ig
    assert "char_limit" in ig
    
    # Verify YouTube format
    yt = formats["youtube"]
    assert "title" in yt
    assert "description" in yt
    assert "tags" in yt
    
    # Verify Spotify format
    spotify = formats["spotify"]
    assert "metadata" in spotify
    assert "pitch_description" in spotify
    
    print("✓ Format for sharing passed")

# ============== Dashboard Tests ==============

def test_dashboard_stats(api_client, auth_headers):
    """Test dashboard stats endpoint"""
    response = api_client.get(f"{BASE_URL}/api/dashboard/stats", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    
    # Verify stats structure
    assert "artist_count" in data
    assert "song_count" in data
    assert "idea_count" in data
    assert "song_status" in data
    assert "recent_songs" in data
    assert "recent_ideas" in data
    
    # Verify song status breakdown
    status = data["song_status"]
    assert "draft" in status
    assert "in_progress" in status
    assert "final" in status
    assert "released" in status
    
    print(f"✓ Dashboard stats passed (Artists: {data['artist_count']}, Songs: {data['song_count']}, Ideas: {data['idea_count']})")

# ============== Cleanup ==============

def test_cleanup_test_data(api_client, auth_headers, test_idea, test_song, test_artist):
    """Clean up test data"""
    # Delete test idea
    api_client.delete(f"{BASE_URL}/api/ideas/{test_idea['id']}", headers=auth_headers)
    
    # Delete test song
    api_client.delete(f"{BASE_URL}/api/songs/{test_song['id']}", headers=auth_headers)
    
    # Delete test artist
    api_client.delete(f"{BASE_URL}/api/artists/{test_artist['id']}", headers=auth_headers)
    
    print("✓ Cleanup completed")
