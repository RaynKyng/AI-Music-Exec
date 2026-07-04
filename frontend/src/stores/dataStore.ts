import { create } from 'zustand';
import axios from 'axios';
import { Artist, Song, Idea, Distribution, DashboardStats, SunoGeneration, SharingFormats } from '../types';
import { api, formatApiError } from '../utils/api';

// Note: API_URL and Bearer-token injection are owned by the shared axios
// instance in `../utils/api`. This store only declares paths starting with
// `/api/...` and lets the interceptor attach auth.

/**
 * A list-fetch failure surface.
 *
 * Critical to the artist/release visibility regression: when a list
 * endpoint fails, we MUST NOT silently replace `artists: []` because
 * that's indistinguishable from "no records yet" and looks like data
 * loss. Instead we preserve the last successful list, raise this
 * structured error, and let the screen render a retry banner.
 */
export interface ListFetchError {
  status: number | null;   // HTTP status if we got a response; null for network/timeout
  message: string;         // sanitized user-facing message
  at: number;              // Date.now() — for stale-error filtering on screen
}

interface DataState {
  artists: Artist[];
  songs: Song[];
  ideas: Idea[];
  distributions: Distribution[];
  stats: DashboardStats | null;
  isLoading: boolean;

  // List-specific failure surfaces. `null` means "loaded cleanly" (which
  // includes the empty-list case). A non-null value means the LAST
  // refresh attempt failed — the screen should keep showing the
  // previous list (preserved in `artists` / `collections`) and offer
  // a retry. These are cleared on a successful refresh.
  artistsError: ListFetchError | null;
  collectionsError: ListFetchError | null;
  // True after we've completed at least one successful fetch (so the
  // empty list can be safely interpreted as "no records yet" rather
  // than "haven't tried loading yet").
  artistsLoadedOnce: boolean;
  collectionsLoadedOnce: boolean;

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

// Build a ListFetchError from an axios/JS error. Logs the actual HTTP
// status so it shows up in console / dev tools — a future 500 should
// never look like silent data deletion.
function _toListError(err: unknown, url: string): ListFetchError {
  let status: number | null = null;
  if (axios.isAxiosError(err)) {
    status = err.response?.status ?? null;
  }
  const message = formatApiError(err, url);
  // eslint-disable-next-line no-console
  console.warn(`[dataStore] list fetch failed ${url}: status=${status} message=${message}`);
  return { status, message, at: Date.now() };
}

export const useDataStore = create<DataState>((set, get) => ({
  artists: [],
  songs: [],
  ideas: [],
  distributions: [],
  stats: null,
  isLoading: false,

  artistsError: null,
  collectionsError: null,
  artistsLoadedOnce: false,
  collectionsLoadedOnce: false,

  // Artists --------------------------------------------------------------
  fetchArtists: async (search, genre) => {
    set({ isLoading: true });
    try {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (genre) params.genre = genre;
      const res = await api.get('/api/artists', { params });
      const list = Array.isArray(res.data) ? res.data : [];
      
	set({
        artists: list,
        artistsError: null,
        artistsLoadedOnce: true,
        isLoading: false,
      });
    } catch (err) {
      // CRITICAL: do NOT clobber the previously-loaded list. A 500 or
      // network blip must not look like "all your artists vanished".
      // Preserve get().artists and set an error surface that the screen
      // can render as a retry banner.
      set({
        artistsError: _toListError(err, '/api/artists'),
        isLoading: false,
      });
    }
  },

  createArtist: async (data) => {
    try {
      const res = await api.post('/api/artists', data);
      const artist = res.data as Artist;
      set({ artists: [...get().artists, artist] });
      return artist;
    } catch (err) {
      throw new Error(formatApiError(err));
    }
  },

  updateArtist: async (id, data) => {
    try {
      const res = await api.put(`/api/artists/${id}`, data);
      const artist = res.data as Artist;
      set({ artists: get().artists.map((a) => (a.id === id ? artist : a)) });
      return artist;
    } catch (err) {
      throw new Error(formatApiError(err));
    }
  },

  deleteArtist: async (id) => {
    try {
      await api.delete(`/api/artists/${id}`);
      set({ artists: get().artists.filter((a) => a.id !== id) });
    } catch (err) {
      throw new Error(formatApiError(err));
    }
  },

  // Songs ----------------------------------------------------------------
  fetchSongs: async (artistId, status, search, genre) => {
    set({ isLoading: true });
    try {
      const params: Record<string, string> = {};
      if (artistId) params.artist_id = artistId;
      if (status) params.status = status;
      if (search) params.search = search;
      if (genre) params.genre = genre;
      const res = await api.get('/api/songs', { params });
      set({ songs: Array.isArray(res.data) ? res.data : [], isLoading: false });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.log('[dataStore] fetchSongs failed:', formatApiError(err));
      set({ songs: [], isLoading: false });
    }
  },

  createSong: async (data) => {
    try {
      const res = await api.post('/api/songs', data);
      const song = res.data as Song;
      set({ songs: [song, ...get().songs] });
      return song;
    } catch (err) {
      throw new Error(formatApiError(err));
    }
  },

  updateSong: async (id, data) => {
    try {
      const res = await api.put(`/api/songs/${id}`, data);
      const song = res.data as Song;
      set({ songs: get().songs.map((s) => (s.id === id ? song : s)) });
      return song;
    } catch (err) {
      throw new Error(formatApiError(err));
    }
  },

  deleteSong: async (id) => {
    try {
      await api.delete(`/api/songs/${id}`);
      set({ songs: get().songs.filter((s) => s.id !== id) });
    } catch (err) {
      throw new Error(formatApiError(err));
    }
  },

  addSongVersion: async (songId, version) => {
    try {
      const res = await api.post(`/api/songs/${songId}/versions`, version);
      const song = res.data as Song;
      set({ songs: get().songs.map((s) => (s.id === songId ? song : s)) });
      return song;
    } catch (err) {
      throw new Error(formatApiError(err));
    }
  },

  deleteSongVersion: async (songId, versionId) => {
    try {
      await api.delete(`/api/songs/${songId}/versions/${versionId}`);
      // Refetch the song to refresh the local copy
      try {
        const songRes = await api.get(`/api/songs/${songId}`);
        const song = songRes.data as Song;
        set({ songs: get().songs.map((s) => (s.id === songId ? song : s)) });
      } catch {
        // best-effort refetch; the delete itself succeeded
      }
    } catch (err) {
      throw new Error(formatApiError(err));
    }
  },

  // Suno Generations ----------------------------------------------------
  addSunoGeneration: async (songId, gen) => {
    try {
      const res = await api.post(`/api/songs/${songId}/suno-generations`, gen);
      const song = res.data as Song;
      set({ songs: get().songs.map((s) => (s.id === songId ? song : s)) });
      return song;
    } catch (err) {
      throw new Error(formatApiError(err));
    }
  },

  deleteSunoGeneration: async (songId, genId) => {
    try {
      await api.delete(`/api/songs/${songId}/suno-generations/${genId}`);
      try {
        const songRes = await api.get(`/api/songs/${songId}`);
        const song = songRes.data as Song;
        set({ songs: get().songs.map((s) => (s.id === songId ? song : s)) });
      } catch {
        // best-effort refetch
      }
    } catch (err) {
      throw new Error(formatApiError(err));
    }
  },

  // Ideas ---------------------------------------------------------------
  fetchIdeas: async (type, search) => {
    set({ isLoading: true });
    try {
      const params: Record<string, string> = {};
      if (type) params.type = type;
      if (search) params.search = search;
      const res = await api.get('/api/ideas', { params });
      set({ ideas: Array.isArray(res.data) ? res.data : [], isLoading: false });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.log('[dataStore] fetchIdeas failed:', formatApiError(err));
      set({ isLoading: false });
    }
  },

  createIdea: async (data) => {
    try {
      const res = await api.post('/api/ideas', data);
      const idea = res.data as Idea;
      set({ ideas: [idea, ...get().ideas] });
      return idea;
    } catch (err) {
      throw new Error(formatApiError(err));
    }
  },

  updateIdea: async (id, data) => {
    try {
      const res = await api.put(`/api/ideas/${id}`, data);
      const idea = res.data as Idea;
      set({ ideas: get().ideas.map((i) => (i.id === id ? idea : i)) });
      return idea;
    } catch (err) {
      throw new Error(formatApiError(err));
    }
  },

  deleteIdea: async (id) => {
    try {
      await api.delete(`/api/ideas/${id}`);
      set({ ideas: get().ideas.filter((i) => i.id !== id) });
    } catch (err) {
      throw new Error(formatApiError(err));
    }
  },

  // Distributions ------------------------------------------------------
  fetchDistributions: async (songId) => {
    set({ isLoading: true });
    try {
      const params: Record<string, string> = {};
      if (songId) params.song_id = songId;
      const res = await api.get('/api/distributions', { params });
      set({ distributions: Array.isArray(res.data) ? res.data : [], isLoading: false });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.log('[dataStore] fetchDistributions failed:', formatApiError(err));
      set({ isLoading: false });
    }
  },

  createDistribution: async (data) => {
    try {
      const res = await api.post('/api/distributions', data);
      const dist = res.data as Distribution;
      set({ distributions: [...get().distributions, dist] });
      return dist;
    } catch (err) {
      throw new Error(formatApiError(err));
    }
  },

  updateDistribution: async (id, data) => {
    try {
      const res = await api.put(`/api/distributions/${id}`, data);
      const dist = res.data as Distribution;
      set({ distributions: get().distributions.map((d) => (d.id === id ? dist : d)) });
      return dist;
    } catch (err) {
      throw new Error(formatApiError(err));
    }
  },

  // Dashboard ----------------------------------------------------------
  fetchStats: async () => {
    try {
      const res = await api.get('/api/dashboard/stats');
      set({ stats: res.data as DashboardStats });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.log('[dataStore] fetchStats failed:', formatApiError(err));
      // keep previous stats; don't blow away the dashboard
    }
  },

  // AI ----------------------------------------------------------------
  analyzeContent: async (content, analysisType, artistId) => {
    try {
      const res = await api.post('/api/ai/analyze', {
        content,
        analysis_type: analysisType,
        artist_id: artistId,
      });
      return res.data;
    } catch (err) {
      throw new Error(formatApiError(err));
    }
  },

  generateSunoPrompt: async (genre, mood, tempo = 'medium', vocals = 'melodic', instruments = '') => {
    try {
      const res = await api.post(
        '/api/ai/suno-prompt',
        null,
        { params: { genre, mood, tempo, vocals, instruments } }
      );
      return (res.data as any)?.suno_prompt;
    } catch (err) {
      throw new Error(formatApiError(err));
    }
  },

  // Sharing -----------------------------------------------------------
  getShareFormats: async (songId, platforms) => {
    try {
      const res = await api.post(`/api/songs/${songId}/format-for-sharing`, {
        song_id: songId,
        platforms,
      });
      return res.data as SharingFormats;
    } catch (err) {
      throw new Error(formatApiError(err));
    }
  },
}));
