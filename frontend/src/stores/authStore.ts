import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User } from '../types';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

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
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Login failed');
    }

    const data = await response.json();
    await AsyncStorage.setItem('token', data.access_token);
    await AsyncStorage.setItem('user', JSON.stringify(data.user));
    
    set({ user: data.user, token: data.access_token, isAuthenticated: true, didLogout: false });
  },

  register: async (email: string, password: string, name: string) => {
    const response = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Registration failed');
    }

    const data = await response.json();
    await AsyncStorage.setItem('token', data.access_token);
    await AsyncStorage.setItem('user', JSON.stringify(data.user));
    
    set({ user: data.user, token: data.access_token, isAuthenticated: true, didLogout: false });
  },

  logout: async () => {
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

