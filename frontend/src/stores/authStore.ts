import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User } from '../types';
import { api, formatApiError } from '../utils/api';

// Single source of truth for backend URL with hardcoded production fallback.
// EAS Update doesn't always pick up env vars from eas.json's build profile,
// so we ship the prod URL as a fallback to guarantee the app always knows
// where to talk to the backend, no matter how the bundle was produced.
const API_URL = "https://ai-music-exec-backend.onrender.com";

// Helpful info log so we can see the actual URL in adb logcat / Metro logs.
// eslint-disable-next-line no-console
console.log('[authStore] API_URL =', API_URL);

// Default timeout for auth requests. The Emergent Starter-tier deployment scales
// pods to zero on idle and has a documented cold-start of 30-60s on the next
// request. 75 seconds covers that worst case so a sleepy backend doesn't
// surface as a hung login. Subsequent requests after warmup are <1s.
const AUTH_TIMEOUT_MS = 75000;

// Browser-like User-Agent. Cloudflare's bot management silently drops
// requests from OkHttp's default `okhttp/4.x` UA, which is what RN's fetch
// uses under the hood on Android. Sending a Chrome-like UA makes our
// requests look like a normal mobile browser and gets us through.
const BROWSER_UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

// fetch + AbortController + timeout. Uses Promise.race as a belt-and-suspenders
// guard because React Native's fetch has had historical bugs where it ignores
// the AbortController.signal — Promise.race guarantees the user-facing promise
// resolves (with rejection) after timeoutMs no matter what the underlying
// fetch decides to do.
async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = AUTH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  let timeoutId: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      try { controller.abort(); } catch {}
      reject(new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s contacting ${url}. Check your internet connection, VPN, or whether the backend is reachable.`));
    }, timeoutMs);
  });
  try {
    // eslint-disable-next-line no-console
    console.log('[authStore] fetch ->', url);
    const mergedHeaders = {
      'User-Agent': BROWSER_UA,
      ...(init.headers || {}),
    };
    const res = await Promise.race([
      fetch(url, { ...init, headers: mergedHeaders, signal: controller.signal }),
      timeoutPromise,
    ]) as Response;
    // eslint-disable-next-line no-console
    console.log('[authStore] fetch <-', url, res.status);
    return res;
  } catch (err: any) {
    if (err?.message?.includes('timed out')) throw err;
    if (err?.name === 'AbortError') {
      throw new Error(
        `Request timed out after ${Math.round(timeoutMs / 1000)}s contacting ${url}. Check your internet connection, VPN, or whether the backend is reachable.`
      );
    }
    const msg = err?.message || String(err);
    throw new Error(`Network error contacting ${url}: ${msg}`);
  } finally {
    clearTimeout(timeoutId);
  }
}

// Parses an API response body safely. If the response is JSON, returns the
// parsed object. If it's HTML/text (e.g. an upstream proxy 404 page) returns
// a clear, debuggable error string that includes the URL and status so the
// user knows exactly what failed.
async function safeReadError(response: Response, url: string): Promise<string> {
  const ct = (response.headers.get('content-type') || '').toLowerCase();
  try {
    if (ct.includes('application/json')) {
      const body = await response.json();
      return body?.detail || body?.message || `Request failed (${response.status})`;
    }
    const text = await response.text();
    const snippet = (text || '').slice(0, 120).replace(/\s+/g, ' ').trim();
    return `Server returned ${response.status} (${ct || 'no content-type'}) from ${url}: ${snippet || '<empty body>'}`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  didLogout: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  loadAuth: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isLoading: true,
  isAuthenticated: false,
  didLogout: false,

  login: async (email: string, password: string) => {
  try {
    const response = await api.post('/api/auth/login', {
      email,
      password,
    });

    const data = response.data;

    await AsyncStorage.setItem('token', data.access_token);
    await AsyncStorage.setItem('user', JSON.stringify(data.user));

    set({
      user: data.user,
      token: data.access_token,
      isAuthenticated: true,
      didLogout: false,
    });
  } catch (error) {
    throw new Error(formatApiError(error, '/api/auth/login'));
  }
},

  register: async (email: string, password: string, name: string) => {
  try {
    const response = await api.post('/api/auth/register', {
      email,
      password,
      name,
    });

    const data = response.data;

    await AsyncStorage.setItem('token', data.access_token);
    await AsyncStorage.setItem('user', JSON.stringify(data.user));

    set({
      user: data.user,
      token: data.access_token,
      isAuthenticated: true,
      didLogout: false,
    });
  } catch (error) {
    throw new Error(formatApiError(error, '/api/auth/register'));
  }
},

  logout: async () => {
    try {
      const { clearPushTokenOnLogout } = await import('../utils/pushNotifications');
      await clearPushTokenOnLogout();
    } catch {}
    await AsyncStorage.multiRemove(['token', 'user']);
    set({ user: null, token: null, isAuthenticated: false, didLogout: true });
  },

  loadAuth: async () => {
    // Don't reload if user just logged out
    if (get().didLogout) {
      set({ isLoading: false });
      return;
    }
    try {
      const token = await AsyncStorage.getItem('token');
      const userStr = await AsyncStorage.getItem('user');
      
      if (token && userStr) {
        const user = JSON.parse(userStr);
        set({ user, token, isAuthenticated: true, isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },

  refreshUser: async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token || !API_URL) return;
      const res = await fetchWithTimeout(`${API_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const user = await res.json();
        await AsyncStorage.setItem('user', JSON.stringify(user));
        set({ user });
      }
    } catch {}
  },
}));

