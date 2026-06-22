/**
 * Shared HTTP client.
 *
 * Why this file exists:
 *   - React Native's `fetch()` POST is broken on Android against our Render
 *     backend (confirmed empirically: GET works, POST never reaches the
 *     server, times out at 30s, zero entries in Render logs). Axios uses
 *     Android's XMLHttpRequest path under the hood, which works reliably.
 *   - We need a single axios instance with:
 *       - hardcoded production URL (env injection via `eas update` is
 *         unreliable on this user's local CLI)
 *       - automatic Bearer token from AsyncStorage on every request
 *       - generous timeout to absorb Render free-tier cold starts (≈30–60s)
 *       - a normalized error formatter so screens can display a single
 *         readable string with HTTP status + backend `detail`.
 *
 * What this file ALSO still exports (for backward compat):
 *   - `resilientFetch` and `safeJson` are kept as-is so the global fetch
 *     monkey-patch in `app/_layout.tsx` and any not-yet-migrated screens
 *     keep compiling. New code should use the `api` axios instance.
 */

import axios, { AxiosError, AxiosInstance } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ---------------------------------------------------------------------------
// Hardcoded production URL. Confirmed reachable from Android APK via axios.
// ---------------------------------------------------------------------------
export const API_URL = 'https://ai-music-exec-backend.onrender.com';

// 60s default timeout: covers a Render free-tier cold start (≈30–60s) on the
// first call after idle. Subsequent warm calls are <1s so the timeout is
// effectively invisible in normal use.
const DEFAULT_TIMEOUT_MS = 60000;

/**
 * Shared axios instance used by stores and components.
 *  - baseURL is the Render backend
 *  - request interceptor injects `Authorization: Bearer <token>` automatically
 *  - response errors are passed through; callers should use `formatApiError`
 *    to convert them into a user-readable string.
 */
export const api: AxiosInstance = axios.create({
  baseURL: API_URL,
  timeout: DEFAULT_TIMEOUT_MS,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(async (config) => {
  try {
    const token = await AsyncStorage.getItem('token');
    if (token) {
      config.headers = config.headers || ({} as any);
      (config.headers as any).Authorization = `Bearer ${token}`;
    }
  } catch {
    // AsyncStorage failure shouldn't block the request
  }
  // eslint-disable-next-line no-console
  console.log('[api]', (config.method || 'get').toUpperCase(), '->', config.url);
  return config;
});

api.interceptors.response.use(
  (res) => {
    // eslint-disable-next-line no-console
    console.log('[api] <-', res.status, res.config.url);
    return res;
  },
  (err) => {
    const ax = err as AxiosError;
    // eslint-disable-next-line no-console
    console.log(
      '[api] FAIL',
      ax.code,
      ax.message,
      ax.response?.status,
      ax.config?.url
    );
    return Promise.reject(err);
  }
);

/**
 * Convert any axios failure into a single readable string we can show the
 * user. Surfaces, in order: backend `detail` / `message`, HTTP status, a
 * timeout note (ECONNABORTED), or the raw network message — all tagged
 * with the URL so it's obvious which call failed when debugging.
 */
export function formatApiError(err: unknown, fallbackUrl?: string): string {
  if (axios.isAxiosError(err)) {
    const ax = err as AxiosError<any>;
    const url = ax.config?.url || fallbackUrl || '(unknown url)';
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

// ===========================================================================
// LEGACY EXPORTS (kept for backward compatibility) ===========================
// ===========================================================================
//
// `_layout.tsx` monkey-patches global.fetch with resilientFetch, and a
// handful of screens (assistant, brainstorm, team, trash, song quick-add,
// songs CSV import, artist brief, etc.) still call raw fetch(). Until those
// are migrated to `api`, we keep these helpers working unchanged.

type FetchOpts = RequestInit & { retries?: number; retryDelayMs?: number };

// Browser-like UA to bypass Cloudflare bot management which silently drops
// requests from RN's default OkHttp `okhttp/4.x` UA on Android.
const BROWSER_UA =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

export async function resilientFetch(
  input: RequestInfo | URL,
  init: FetchOpts = {}
): Promise<Response> {
  const { retries = 3, retryDelayMs = 1000, headers: userHeaders, ...rest } = init;
  let lastErr: any = null;

  const mergedHeaders = {
    'User-Agent': BROWSER_UA,
    ...(userHeaders || {}),
  };

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(input, { ...rest, headers: mergedHeaders });

      const ctype = res.headers.get('content-type') || '';
      const isHtml = ctype.includes('text/html') || ctype.includes('text/plain');
      const looksLikeJsonEndpoint = (() => {
        try {
          const url = typeof input === 'string' ? input : (input as any).toString();
          return url.includes('/api/');
        } catch {
          return true;
        }
      })();

      if (res.status >= 500 && res.status < 600) {
        if (attempt < retries) {
          await sleep(retryDelayMs * Math.pow(2, attempt));
          continue;
        }
        return res;
      }

      if (isHtml && looksLikeJsonEndpoint && attempt < retries) {
        await sleep(retryDelayMs * Math.pow(2, attempt));
        continue;
      }

      return res;
    } catch (e) {
      lastErr = e;
      if (attempt < retries) {
        await sleep(retryDelayMs * Math.pow(2, attempt));
        continue;
      }
      throw e;
    }
  }
  throw lastErr || new Error('resilientFetch: max retries exceeded');
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

export async function safeJson<T = any>(res: Response): Promise<T | null> {
  try {
    const text = await res.text();
    if (!text || !text.trim()) return null;
    if (
      text.trim().startsWith('<') ||
      text.trim().toLowerCase().startsWith('the preview')
    ) {
      return null;
    }
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
