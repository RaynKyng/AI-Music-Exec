import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios, { AxiosError } from 'axios';
import { User } from '../types';

// Hardcoded production URL for now. React Native fetch() POST hangs against
// Render from Android APK builds (confirmed: GET works, POST never reaches
// backend, times out after 30s, zero entries in Render logs). Axios uses a
// different underlying HTTP path that works reliably on Android.
const API_URL = "https://ai-music-exec-backend.onrender.com";

// eslint-disable-next-line no-console
console.log('[authStore] API_URL =', API_URL);

// Build a clear, debuggable error string from an axios failure. Surfaces
// the backend's `detail` field when present, otherwise the network message
// and status code, so the user knows exactly what went wrong on the device.
function formatAxiosError(err: any, url: string): string {
  if (axios.isAxiosError(err)) {
    const ax = err as AxiosError<any>;
    const status = ax.response?.status;
    const detail =
      (ax.response?.data as any)?.detail ||
      (ax.response?.data as any)?.message ||
      null;
    if (status && detail) return `${detail} (HTTP ${status})`;
    if (status) {
      const bodyText = typeof ax.response?.data === 'string'
        ? ax.response.data.slice(0, 120)
        : JSON.stringify(ax.response?.data || {}).slice(0, 120);
      return `Server returned HTTP ${status} from ${url}: ${bodyText}`;
    }
    if (ax.code === 'ECONNABORTED') {
      return `Request timed out contacting ${url}. Backend may be cold-starting — try again in 30s.`;
    }
    return `Network error contacting ${url}: ${ax.message}`;
  }
  return err?.message || String(err);
}

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
    const url = `${API_URL}/api/auth/login`;
    // eslint-disable-next-line no-console
    console.log('[authStore] axios POST ->', url);
    try {
      const res = await axios.post(
        url,
        { email, password },
        { timeout: 90000, headers: { 'Content-Type': 'application/json' } }
      );
      // eslint-disable-next-line no-console
      console.log('[authStore] axios <-', res.status);
      const data = res.data;
      await AsyncStorage.setItem('token', data.access_token);
      await AsyncStorage.setItem('user', JSON.stringify(data.user));
      set({ user: data.user, token: data.access_token, isAuthenticated: true, didLogout: false });
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.log('[authStore] axios FAIL', err?.code, err?.message, err?.response?.status, err?.response?.data);
      throw new Error(formatAxiosError(err, url));
    }
  },

  register: async (email: string, password: string, name: string) => {
    const url = `${API_URL}/api/auth/register`;
    // eslint-disable-next-line no-console
    console.log('[authStore] axios POST ->', url);
    try {
      const res = await axios.post(
        url,
        { email, password, name },
        { timeout: 90000, headers: { 'Content-Type': 'application/json' } }
      );
      // eslint-disable-next-line no-console
      console.log('[authStore] axios <-', res.status);
      const data = res.data;
      await AsyncStorage.setItem('token', data.access_token);
      await AsyncStorage.setItem('user', JSON.stringify(data.user));
      set({ user: data.user, token: data.access_token, isAuthenticated: true, didLogout: false });
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.log('[authStore] axios FAIL', err?.code, err?.message, err?.response?.status, err?.response?.data);
      throw new Error(formatAxiosError(err, url));
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
      if (!token) return;
      const res = await axios.get(`${API_URL}/api/auth/me`, {
        timeout: 30000,
        headers: { Authorization: `Bearer ${token}` },
      });
      const user = res.data;
      await AsyncStorage.setItem('user', JSON.stringify(user));
      set({ user });
    } catch {}
  },
}));

