export interface User {
  id: string;
  email: string;
  name: string;
  created_at?: string;
}

export interface ArtistBranding {
  color_palette: string[];
  visual_style: string;
  aesthetic: string;
  mood_keywords: string[];
}

export interface Artist {
  id: string;
  user_id: string;
  name: string;
  bio: string;
  unique_sound: string;
  genres: string[];
  themes: string[];
  tone: string;
  patterns: string[];
  branding: ArtistBranding;
  image_url: string;
  notes: string;
  song_count: number;
  created_at: string;
  updated_at: string;
}

export interface SongVersion {
  id: string;
  version_type: 'primary' | 'secondary' | 'alternate';
  audio_url: string;
  suno_link: string;
  notes: string;
  created_at: string;
}

export interface Song {
  id: string;
  user_id: string;
  artist_id: string | null;
  title: string;
  lyrics: string;
  style_prompt: string;
  genre: string;
  mood: string;
  tempo: string;
  themes: string[];
  status: 'draft' | 'in_progress' | 'final' | 'released';
  notes: string;
  todo: string[];
  versions: SongVersion[];
  created_at: string;
  updated_at: string;
}

export interface Idea {
  id: string;
  user_id: string;
  title: string;
  content: string;
  type: 'spark' | 'concept' | 'lyrics' | 'melody' | 'style' | 'visual';
  tags: string[];
  linked_artist_id: string | null;
  linked_song_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DistributionEntry {
  platform: string;
  url: string;
  status: 'pending' | 'submitted' | 'live' | 'rejected';
  format_notes: string;
  submitted_at: string | null;
}

export interface Distribution {
  id: string;
  user_id: string;
  song_id: string;
  entries: DistributionEntry[];
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface DashboardStats {
  artist_count: number;
  song_count: number;
  idea_count: number;
  song_status: {
    draft: number;
    in_progress: number;
    final: number;
    released: number;
  };
  recent_songs: { id: string; title: string; status: string }[];
  recent_ideas: { id: string; title: string; type: string }[];
}
