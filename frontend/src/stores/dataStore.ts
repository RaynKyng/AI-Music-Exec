import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Artist, Song, Idea, Distribution, DashboardStats, SunoGeneration, SharingFormats } from '../types';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

const getToken = async () => {
  return await AsyncStorage.getItem('token');
};

const authFetch = async (url: string, options: RequestInit = {}) => {
  const token = await getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };
  return fetch(url, { ...options, headers });
};

interface DataState {
  artists: Artist[];
  songs: Song[];
  ideas: Idea[];
  distributions: Distribution[];
  stats: DashboardStats | null;
  isLoading: boolean;
  
  // Artists
  fetchArtists: (search?: string, genre?: string) => Promise<void>;
  createArtist: (data: Partial<Artist>) => Promise<Artist>;
  updateArtist: (id: string, data: Partial<Artist>) => Promise<Artist>;
  deleteArtist: (id: string) => Promise<void>;
  
  // Songs
  fetchSongs: (artistId?: string, status?: string, search?: string, genre?: string) => Promise<void>;
  createSong: (data: Partial<Song>) => Promise<Song>;
  updateSong: (id: string, data: Partial<Song>) => Promise<Song>;
  deleteSong: (id: string) => Promise<void>;
  addSongVersion: (songId: string, version: Partial<Song['versions'][0]>) => Promise<Song>;
  deleteSongVersion: (songId: string, versionId: string) => Promise<void>;
  
  // Suno Generations
  addSunoGeneration: (songId: string, gen: Partial<SunoGeneration>) => Promise<Song>;
  deleteSunoGeneration: (songId: string, genId: string) => Promise<void>;
  
  // Ideas
  fetchIdeas: (type?: string, search?: string) => Promise<void>;
  createIdea: (data: Partial<Idea>) => Promise<Idea>;
  updateIdea: (id: string, data: Partial<Idea>) => Promise<Idea>;
  deleteIdea: (id: string) => Promise<void>;
  
  // Distributions
  fetchDistributions: (songId?: string) => Promise<void>;
  createDistribution: (data: Partial<Distribution>) => Promise<Distribution>;
  updateDistribution: (id: string, data: Partial<Distribution>) => Promise<Distribution>;
  
  // Dashboard
  fetchStats: () => Promise<void>;
  
  // AI
  analyzeContent: (content: string, analysisType: string, artistId?: string) => Promise<any>;
  generateSunoPrompt: (genre: string, mood: string, tempo?: string, vocals?: string, instruments?: string) => Promise<string>;
  
  // Sharing
  getShareFormats: (songId: string, platforms: string[]) => Promise<SharingFormats>;
}

export const useDataStore = create<DataState>((set, get) => ({
  artists: [],
  songs: [],
  ideas: [],
  distributions: [],
  stats: null,
  isLoading: false,

  // Artists
  fetchArtists: async (search, genre) => {
    set({ isLoading: true });
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (genre) params.append('genre', genre);
      const qs = params.toString();
      const res = await authFetch(`${API_URL}/api/artists${qs ? '?' + qs : ''}`);
      const data = await res.json();
      set({ artists: Array.isArray(data) ? data : [], isLoading: false });
    } catch {
      set({ artists: [], isLoading: false });
    }
  },

  createArtist: async (data) => {
    const res = await authFetch(`${API_URL}/api/artists`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to create artist');
    const artist = await res.json();
    set({ artists: [...get().artists, artist] });
    return artist;
  },

  updateArtist: async (id, data) => {
    const res = await authFetch(`${API_URL}/api/artists/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to update artist');
    const artist = await res.json();
    set({ artists: get().artists.map(a => a.id === id ? artist : a) });
    return artist;
  },

  deleteArtist: async (id) => {
    const res = await authFetch(`${API_URL}/api/artists/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete artist');
    set({ artists: get().artists.filter(a => a.id !== id) });
  },

  // Songs
  fetchSongs: async (artistId, status, search, genre) => {
    set({ isLoading: true });
    try {
      const params = new URLSearchParams();
      if (artistId) params.append('artist_id', artistId);
      if (status) params.append('status', status);
      if (search) params.append('search', search);
      if (genre) params.append('genre', genre);
      const qs = params.toString();
      
      const res = await authFetch(`${API_URL}/api/songs${qs ? '?' + qs : ''}`);
      const data = await res.json();
      set({ songs: Array.isArray(data) ? data : [], isLoading: false });
    } catch {
      set({ songs: [], isLoading: false });
    }
  },

  createSong: async (data) => {
    const res = await authFetch(`${API_URL}/api/songs`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to create song');
    const song = await res.json();
    set({ songs: [song, ...get().songs] });
    return song;
  },

  updateSong: async (id, data) => {
    const res = await authFetch(`${API_URL}/api/songs/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to update song');
    const song = await res.json();
    set({ songs: get().songs.map(s => s.id === id ? song : s) });
    return song;
  },

  deleteSong: async (id) => {
    const res = await authFetch(`${API_URL}/api/songs/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete song');
    set({ songs: get().songs.filter(s => s.id !== id) });
  },

  addSongVersion: async (songId, version) => {
    const res = await authFetch(`${API_URL}/api/songs/${songId}/versions`, {
      method: 'POST',
      body: JSON.stringify(version),
    });
    if (!res.ok) throw new Error('Failed to add version');
    const song = await res.json();
    set({ songs: get().songs.map(s => s.id === songId ? song : s) });
    return song;
  },

  deleteSongVersion: async (songId, versionId) => {
    const res = await authFetch(`${API_URL}/api/songs/${songId}/versions/${versionId}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete version');
    // Refetch the song
    const songRes = await authFetch(`${API_URL}/api/songs/${songId}`);
    if (songRes.ok) {
      const song = await songRes.json();
      set({ songs: get().songs.map(s => s.id === songId ? song : s) });
    }
  },

  // Suno Generations
  addSunoGeneration: async (songId, gen) => {
    const res = await authFetch(`${API_URL}/api/songs/${songId}/suno-generations`, {
      method: 'POST',
      body: JSON.stringify(gen),
    });
    if (!res.ok) throw new Error('Failed to add Suno generation');
    const song = await res.json();
    set({ songs: get().songs.map(s => s.id === songId ? song : s) });
    return song;
  },

  deleteSunoGeneration: async (songId, genId) => {
    const res = await authFetch(`${API_URL}/api/songs/${songId}/suno-generations/${genId}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete generation');
    const songRes = await authFetch(`${API_URL}/api/songs/${songId}`);
    if (songRes.ok) {
      const song = await songRes.json();
      set({ songs: get().songs.map(s => s.id === songId ? song : s) });
    }
  },

  // Ideas
  fetchIdeas: async (type, search) => {
    set({ isLoading: true });
    try {
      const params = new URLSearchParams();
      if (type) params.append('type', type);
      if (search) params.append('search', search);
      const qs = params.toString();
      const res = await authFetch(`${API_URL}/api/ideas${qs ? '?' + qs : ''}`);
      const data = await res.json();
      set({ ideas: data, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  createIdea: async (data) => {
    const res = await authFetch(`${API_URL}/api/ideas`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to create idea');
    const idea = await res.json();
    set({ ideas: [idea, ...get().ideas] });
    return idea;
  },

  updateIdea: async (id, data) => {
    const res = await authFetch(`${API_URL}/api/ideas/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to update idea');
    const idea = await res.json();
    set({ ideas: get().ideas.map(i => i.id === id ? idea : i) });
    return idea;
  },

  deleteIdea: async (id) => {
    const res = await authFetch(`${API_URL}/api/ideas/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete idea');
    set({ ideas: get().ideas.filter(i => i.id !== id) });
  },

  // Distributions
  fetchDistributions: async (songId) => {
    set({ isLoading: true });
    try {
      let url = `${API_URL}/api/distributions`;
      if (songId) url += `?song_id=${songId}`;
      const res = await authFetch(url);
      const data = await res.json();
      set({ distributions: data, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  createDistribution: async (data) => {
    const res = await authFetch(`${API_URL}/api/distributions`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to create distribution');
    const dist = await res.json();
    set({ distributions: [...get().distributions, dist] });
    return dist;
  },

  updateDistribution: async (id, data) => {
    const res = await authFetch(`${API_URL}/api/distributions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to update distribution');
    const dist = await res.json();
    set({ distributions: get().distributions.map(d => d.id === id ? dist : d) });
    return dist;
  },

  // Dashboard
  fetchStats: async () => {
    try {
      const res = await authFetch(`${API_URL}/api/dashboard/stats`);
      const data = await res.json();
      set({ stats: data });
    } catch {
      // ignore
    }
  },

  // AI
  analyzeContent: async (content, analysisType, artistId) => {
    const res = await authFetch(`${API_URL}/api/ai/analyze`, {
      method: 'POST',
      body: JSON.stringify({ content, analysis_type: analysisType, artist_id: artistId }),
    });
    if (!res.ok) throw new Error('AI analysis failed');
    return res.json();
  },

  generateSunoPrompt: async (genre, mood, tempo = 'medium', vocals = 'melodic', instruments = '') => {
    const params = new URLSearchParams({ genre, mood, tempo, vocals, instruments });
    const res = await authFetch(`${API_URL}/api/ai/suno-prompt?${params.toString()}`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error('Prompt generation failed');
    const data = await res.json();
    return data.suno_prompt;
  },

  // Sharing
  getShareFormats: async (songId, platforms) => {
    const res = await authFetch(`${API_URL}/api/songs/${songId}/format-for-sharing`, {
      method: 'POST',
      body: JSON.stringify({ song_id: songId, platforms }),
    });
    if (!res.ok) throw new Error('Failed to get sharing formats');
    return res.json();
  },
}));
