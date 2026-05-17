/**
 * Resilient fetch wrapper.
 * Handles the common Emergent workspace pattern where the backend goes idle
 * and the proxy briefly returns HTML ("preview environment is starting") instead
 * of JSON — which causes `JSON Parse error: Unexpected character: T/p`.
 *
 * Strategy:
 *  - Retry up to 3x on 5xx, network failure, or non-JSON responses with HTML content-type
 *  - Exponential backoff: 1s, 2s, 4s (the preview usually wakes in <10s)
 *  - All other status codes (4xx) pass through immediately
 */

type FetchOpts = RequestInit & { retries?: number; retryDelayMs?: number };

export async function resilientFetch(
  input: RequestInfo | URL,
  init: FetchOpts = {}
): Promise<Response> {
  const { retries = 3, retryDelayMs = 1000, ...rest } = init;
  let lastErr: any = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(input, rest);

      // Detect "backend waking up" HTML responses
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

      // 5xx, OR an HTML body on an API call — backend probably waking up. Retry.
      if (res.status >= 500 && res.status < 600) {
        if (attempt < retries) {
          await sleep(retryDelayMs * Math.pow(2, attempt));
          continue;
        }
        return res;
      }

      if (isHtml && looksLikeJsonEndpoint && attempt < retries) {
        // Don't consume the body — we just retry
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

/**
 * Safe JSON parse. Returns null if the body isn't valid JSON
 * (e.g., backend returned an HTML error page).
 */
export async function safeJson<T = any>(res: Response): Promise<T | null> {
  try {
    const text = await res.text();
    if (!text || !text.trim()) return null;
    if (text.trim().startsWith('<') || text.trim().toLowerCase().startsWith('the preview')) {
      // HTML or plaintext error page — not JSON
      return null;
    }
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
