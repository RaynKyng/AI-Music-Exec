import { router } from 'expo-router';

/**
 * Safe back navigation. If there's no previous route on the stack
 * (e.g., the user opened a deep link, refreshed the web, or it's the
 * first screen), fall back to the provided route instead of leaving
 * the user stuck on a dead-end screen.
 */
export function safeGoBack(fallback: string = '/') {
  try {
    if ((router as any).canGoBack && (router as any).canGoBack()) {
      router.back();
      return;
    }
  } catch {}
  try {
    router.replace(fallback as any);
  } catch {
    router.push(fallback as any);
  }
}
