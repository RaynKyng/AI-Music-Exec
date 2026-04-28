import { create } from 'zustand';
import { Platform } from 'react-native';

export interface Track {
  id: string;
  url: string;
  title: string;
  artist?: string;
  artwork?: string;
  source?: 'suno' | 'song' | 'version';
  source_id?: string; // song_id or generation_id
}

interface PlayerState {
  current: Track | null;
  queue: Track[];
  queueIndex: number;
  isPlaying: boolean;
  isLoading: boolean;
  position: number; // ms
  duration: number; // ms
  volume: number;
  error: string | null;

  // actions
  play: (track: Track, queue?: Track[]) => Promise<void>;
  togglePlayPause: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  seek: (positionMs: number) => Promise<void>;
  next: () => Promise<void>;
  prev: () => Promise<void>;
  stop: () => Promise<void>;
  setVolume: (v: number) => Promise<void>;
  _setPosition: (p: number) => void;
  _setDuration: (d: number) => void;
  _setLoading: (l: boolean) => void;
  _setIsPlaying: (p: boolean) => void;
  _setError: (e: string | null) => void;
}

// Web audio implementation
let webAudio: HTMLAudioElement | null = null;
// Native audio implementation
let nativePlayer: any = null;
let audioModeConfigured = false;

const isWeb = Platform.OS === 'web';

// Configure native audio for background playback (lock screen + bluetooth car controls)
const ensureNativeAudioMode = async () => {
  if (isWeb || audioModeConfigured) return;
  try {
    const { setAudioModeAsync } = await import('expo-audio');
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      shouldRouteThroughEarpiece: false,
      interruptionMode: 'duckOthers',
    });
    audioModeConfigured = true;
  } catch (e) {
    console.warn('Could not set background audio mode:', e);
  }
};

const ensureWebAudio = () => {
  if (typeof window === 'undefined') return null;
  if (!webAudio) {
    webAudio = new Audio();
    webAudio.preload = 'metadata';
    // MediaSession API for browser/PWA media controls (some browsers expose to bluetooth)
    if ('mediaSession' in navigator) {
      // handlers set when track loads
    }
  }
  return webAudio;
};

const updateMediaSession = (track: Track | null, isPlaying: boolean) => {
  if (typeof window === 'undefined' || !('mediaSession' in navigator)) return;
  if (!track) {
    (navigator as any).mediaSession.metadata = null;
    return;
  }
  try {
    (navigator as any).mediaSession.metadata = new (window as any).MediaMetadata({
      title: track.title || 'Untitled',
      artist: track.artist || '',
      album: 'AI Music Manager',
      artwork: track.artwork ? [{ src: track.artwork, sizes: '512x512', type: 'image/jpeg' }] : [],
    });
    (navigator as any).mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  } catch {}
};

export const usePlayerStore = create<PlayerState>((set, get) => ({
  current: null,
  queue: [],
  queueIndex: -1,
  isPlaying: false,
  isLoading: false,
  position: 0,
  duration: 0,
  volume: 1.0,
  error: null,

  _setPosition: (p) => set({ position: p }),
  _setDuration: (d) => set({ duration: d }),
  _setLoading: (l) => set({ isLoading: l }),
  _setIsPlaying: (p) => set({ isPlaying: p }),
  _setError: (e) => set({ error: e }),

  play: async (track, queue) => {
    if (!track.url) {
      set({ error: 'No audio URL available' });
      return;
    }
    
    // Check if this looks like a direct audio file. Suno page URLs (suno.com/song/...) won't play directly;
    // open them in a new tab/external app instead. Suno CDN URLs (cdn1.suno.ai/*.mp3) DO play.
    const url = track.url.toLowerCase();
    const isDirectAudio = /\.(mp3|wav|m4a|aac|ogg|flac|webm)(\?|$)/.test(url) || url.includes('cdn1.suno.ai') || url.includes('audiopipe.suno.ai') || url.includes('suno-audio');
    const isPageUrl = (url.includes('suno.com/song/') || url.includes('suno.ai/song/') || url.startsWith('https://www.youtube.com') || url.startsWith('https://youtu.be') || url.startsWith('https://soundcloud.com'));
    
    if (isPageUrl && !isDirectAudio) {
      // Open externally instead
      try {
        if (typeof window !== 'undefined') {
          window.open(track.url, '_blank');
        } else {
          const Linking = await import('react-native');
          await Linking.Linking.openURL(track.url);
        }
      } catch {}
      set({ error: 'Opened in external player (link is a page, not a direct audio file)' });
      setTimeout(() => set({ error: null }), 4000);
      return;
    }
    
    set({ isLoading: true, error: null, current: track });
    if (queue && queue.length > 0) {
      const idx = queue.findIndex(t => t.id === track.id);
      set({ queue, queueIndex: idx >= 0 ? idx : 0 });
    } else {
      set({ queue: [track], queueIndex: 0 });
    }

    // Configure media session (lock screen / bluetooth controls on web/PWA + iOS Safari)
    updateMediaSession(track, true);
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      try {
        (navigator as any).mediaSession.setActionHandler('play', () => get().resume());
        (navigator as any).mediaSession.setActionHandler('pause', () => get().pause());
        (navigator as any).mediaSession.setActionHandler('previoustrack', () => get().prev());
        (navigator as any).mediaSession.setActionHandler('nexttrack', () => get().next());
        (navigator as any).mediaSession.setActionHandler('seekto', (e: any) => { if (e.seekTime != null) get().seek(e.seekTime * 1000); });
      } catch {}
    }

    // Ensure native audio is configured for background playback
    if (!isWeb) await ensureNativeAudioMode();

    try {
      if (isWeb) {
        const audio = ensureWebAudio();
        if (!audio) throw new Error('Audio API unavailable');
        audio.src = track.url;
        audio.volume = get().volume;
        audio.onloadedmetadata = () => {
          set({ duration: (audio.duration || 0) * 1000 });
        };
        audio.ontimeupdate = () => {
          set({ position: (audio.currentTime || 0) * 1000 });
        };
        audio.onended = () => {
          set({ isPlaying: false, position: 0 });
          // auto-advance
          const { queue: q, queueIndex: i } = get();
          if (i + 1 < q.length) {
            get().next();
          }
        };
        audio.onerror = () => {
          set({ error: 'Could not load audio. The link may not allow playback.', isPlaying: false, isLoading: false });
        };
        audio.onplaying = () => set({ isPlaying: true, isLoading: false });
        audio.onpause = () => set({ isPlaying: false });
        audio.onwaiting = () => set({ isLoading: true });
        audio.oncanplay = () => set({ isLoading: false });
        await audio.play();
        set({ isPlaying: true, isLoading: false });
      } else {
        // Native (expo-audio)
        try {
          const { createAudioPlayer } = await import('expo-audio');
          if (nativePlayer) {
            try { nativePlayer.remove(); } catch {}
            nativePlayer = null;
          }
          nativePlayer = createAudioPlayer({ uri: track.url });
          nativePlayer.volume = get().volume;
          nativePlayer.addListener('playbackStatusUpdate', (status: any) => {
            if (status.isLoaded) {
              set({
                position: status.currentTime ? status.currentTime * 1000 : 0,
                duration: status.duration ? status.duration * 1000 : 0,
                isPlaying: !!status.playing,
                isLoading: status.isBuffering || false,
              });
              if (status.didJustFinish) {
                set({ isPlaying: false, position: 0 });
                const { queue: q, queueIndex: i } = get();
                if (i + 1 < q.length) get().next();
              }
            }
          });
          await nativePlayer.play();
          set({ isPlaying: true, isLoading: false });
        } catch (e: any) {
          set({ error: e?.message || 'Playback failed', isPlaying: false, isLoading: false });
        }
      }
    } catch (e: any) {
      set({ error: e?.message || 'Playback failed', isPlaying: false, isLoading: false });
    }
  },

  togglePlayPause: async () => {
    const { isPlaying } = get();
    if (isPlaying) await get().pause();
    else await get().resume();
  },

  pause: async () => {
    if (isWeb) {
      ensureWebAudio()?.pause();
    } else if (nativePlayer) {
      try { await nativePlayer.pause(); } catch {}
    }
    set({ isPlaying: false });
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      try { (navigator as any).mediaSession.playbackState = 'paused'; } catch {}
    }
  },

  resume: async () => {
    if (isWeb) {
      try { await ensureWebAudio()?.play(); set({ isPlaying: true }); } catch {}
    } else if (nativePlayer) {
      try { await nativePlayer.play(); set({ isPlaying: true }); } catch {}
    }
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      try { (navigator as any).mediaSession.playbackState = 'playing'; } catch {}
    }
  },

  seek: async (positionMs) => {
    if (isWeb) {
      const a = ensureWebAudio();
      if (a) a.currentTime = positionMs / 1000;
    } else if (nativePlayer) {
      try { await nativePlayer.seekTo(positionMs / 1000); } catch {}
    }
    set({ position: positionMs });
  },

  next: async () => {
    const { queue, queueIndex } = get();
    if (queueIndex + 1 < queue.length) {
      await get().play(queue[queueIndex + 1], queue);
      set({ queueIndex: queueIndex + 1 });
    }
  },

  prev: async () => {
    const { queue, queueIndex, position } = get();
    if (position > 3000 || queueIndex - 1 < 0) {
      await get().seek(0);
    } else {
      await get().play(queue[queueIndex - 1], queue);
      set({ queueIndex: queueIndex - 1 });
    }
  },

  stop: async () => {
    if (isWeb) {
      const a = ensureWebAudio();
      if (a) { a.pause(); a.src = ''; }
    } else if (nativePlayer) {
      try { nativePlayer.remove(); } catch {}
      nativePlayer = null;
    }
    set({ current: null, isPlaying: false, position: 0, duration: 0, queue: [], queueIndex: -1 });
  },

  setVolume: async (v) => {
    set({ volume: v });
    if (isWeb) {
      const a = ensureWebAudio();
      if (a) a.volume = v;
    } else if (nativePlayer) {
      try { nativePlayer.volume = v; } catch {}
    }
  },
}));
