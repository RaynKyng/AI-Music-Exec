import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User } from '../types';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

// Helpful guard for native builds where the env var sometimes isn't baked into the
// JS bundle if it wasn't defined in eas.json's `env` block at build time. If it's
// missing/empty, every API call would silently go to "undefined/api/..." which
// produces confusing "404 page not found" errors from upstream proxies. Surface
// it loudly instead so the user knows to rebuild with the env var set.
if (!API_URL) {
  // eslint-disable-next-line no-console
  console.warn(
    '[authStore] EXPO_PUBLIC_BACKEND_URL is undefined. Rebuild the APK with the env var defined in eas.json under the matching profile (preview/production).'
  );
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
    if (!API_URL) {
      throw new Error('App is missing EXPO_PUBLIC_BACKEND_URL. Please rebuild the APK with the env var set in eas.json.');
    }
    const url = `${API_URL}/api/auth/login`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const msg = await safeReadError(response, url);
      throw new Error(msg);
    }

    const data = await response.json();
    await AsyncStorage.setItem('token', data.access_token);
    await AsyncStorage.setItem('user', JSON.stringify(data.user));
    
    set({ user: data.user, token: data.access_token, isAuthenticated: true, didLogout: false });
  },

  register: async (email: string, password: string, name: string) => {
    if (!API_URL) {
      throw new Error('App is missing EXPO_PUBLIC_BACKEND_URL. Please rebuild the APK with the env var set in eas.json.');
    }
    const url = `${API_URL}/api/auth/register`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });

    if (!response.ok) {
      const msg = await safeReadError(response, url);
      throw new Error(msg);
    }

    const data = await response.json();
    await AsyncStorage.setItem('token', data.access_token);
    await AsyncStorage.setItem('user', JSON.stringify(data.user));
    
    set({ user: data.user, token: data.access_token, isAuthenticated: true, didLogout: false });
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
      const res = await fetch(`${API_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const user = await res.json();
        await AsyncStorage.setItem('user', JSON.stringify(user));
        set({ user });
      }
    } catch {}
  },
}));

