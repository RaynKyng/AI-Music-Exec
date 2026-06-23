import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios, { AxiosError } from 'axios';
import { User } from '../types';

// Hardcoded production URL. React Native's `fetch()` POST hangs against
// Render from Android APK builds (confirmed empirically: GET works, POST
// never reaches the backend, times out at 30s, zero entries in Render
// logs). Axios uses Android's XMLHttpRequest path under the hood, which
// works reliably on Android. Until that fetch bug is solved upstream we
// keep all auth traffic on axios.
const API_URL = 'https://ai-music-exec-backend.onrender.com';

// eslint-disable-next-line no-console
console.log('[authStore] API_URL =', API_URL);

// Per-call axios timeout for auth requests. Render's free tier scales pods
// to zero on idle with a documented 30–60s cold start on the first request,
// so 90s safely covers a sleepy backend. Subsequent warm requests are <1s.
const AUTH_TIMEOUT_MS = 90000;

// Convert any axios failure into a single readable string we can show the
// user. Surfaces, in order: backend `detail` / `message`, HTTP status,
// timeout (ECONNABORTED), or the raw network message — all tagged with the
// URL so it's obvious which call failed when debugging on-device.
function formatAxiosError(err: unknown, url: string): string {
  if (axios.isAxiosError(err)) {
    const ax = err as AxiosError<any>;
    const status = ax.response?.status;
    const data = ax.response?.data;
    const detail =
      (data && typeof data === 'object' && (data as any).detail) ||
      (data && typeof data === 'object' && (data as any).message) ||
      null;

    if (status && detail) return `${detail} (HTTP ${status})`;
    if (status) {
      const bodyText =
        typeof data === 'string'
          ? data.slice(0, 160)
          : JSON.stringify(data ?? {}).slice(0, 160);
      return `Server returned HTTP ${status} from ${url}: ${bodyText}`;
    }
    if (ax.code === 'ECONNABORTED') {
      return `Request timed out contacting ${url}. Backend may be cold-starting — try again in 30s.`;
    }
    return `Network error contacting ${url}: ${ax.message}`;
  }
  const anyErr = err as { message?: string } | null;
  return anyErr?.message || String(err);
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
        {
          timeout: AUTH_TIMEOUT_MS,
          headers: { 'Content-Type': 'application/json' },
        }
      );
      // eslint-disable-next-line no-console
      console.log('[authStore] axios <-', res.status);
      const data = res.data;
      await AsyncStorage.setItem('token', data.access_token);
      await AsyncStorage.setItem('user', JSON.stringify(data.user));
      set({
        user: data.user,
        token: data.access_token,
        isAuthenticated: true,
        didLogout: false,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.log(
        '[authStore] login FAIL',
        (err as AxiosError)?.code,
        (err as Error)?.message,
        (err as AxiosError)?.response?.status,
        (err as AxiosError)?.response?.data
      );
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
        {
          timeout: AUTH_TIMEOUT_MS,
          headers: { 'Content-Type': 'application/json' },
        }
      );
      // eslint-disable-next-line no-console
      console.log('[authStore] axios <-', res.status);
      const data = res.data;
      await AsyncStorage.setItem('token', data.access_token);
      await AsyncStorage.setItem('user', JSON.stringify(data.user));
      set({
        user: data.user,
        token: data.access_token,
        isAuthenticated: true,
        didLogout: false,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.log(
        '[authStore] register FAIL',
        (err as AxiosError)?.code,
        (err as Error)?.message,
        (err as AxiosError)?.response?.status,
        (err as AxiosError)?.response?.data
      );
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
    const url = `${API_URL}/api/auth/me`;
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) return;
      // eslint-disable-next-line no-console
      console.log('[authStore] axios GET ->', url);
      const res = await axios.get(url, {
        timeout: 30000,
        headers: { Authorization: `Bearer ${token}` },
      });
      // eslint-disable-next-line no-console
      console.log('[authStore] axios <-', res.status);
      const user = res.data;
      await AsyncStorage.setItem('user', JSON.stringify(user));
      set({ user });
    } catch (err) {
      // refreshUser is best-effort and silent — surface in logs only so the
      // user isn't logged out or alerted on a transient 401/network blip.
      // eslint-disable-next-line no-console
      console.log(
        '[authStore] refreshUser FAIL',
        (err as AxiosError)?.code,
        (err as Error)?.message,
        (err as AxiosError)?.response?.status
      );
    }
  },
}));
