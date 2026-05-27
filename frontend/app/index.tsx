import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useAuthStore } from '../src/stores/authStore';
import { Input } from '../src/components/Input';
import { Button } from '../src/components/Button';
import { LoadingSpinner } from '../src/components/LoadingSpinner';
import { colors, spacing } from '../src/utils/theme';

// Hardcoded to the new Render backend. Confirmed working with laptop curl;
// pure fetch() POST never reaches Render from RN Android (times out at 30s).
// Axios uses Android's XMLHttpRequest under the hood which works.
const API_URL_DEBUG = "https://ai-music-exec-backend.onrender.com";

export default function Index() {
  const router = useRouter();
  const { isAuthenticated, isLoading, login, register } = useAuthStore();
  
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  // === TEMPORARY DIAGNOSTIC STATE =====================================
  // Used by the yellow dashed diagnostic block to show inline results
  // after the user taps "Direct Fetch" or "Direct Axios" buttons.
  const [debugResult, setDebugResult] = useState<string | null>(null);
  const [debugBusy, setDebugBusy] = useState<string | null>(null); // tag of which test is running

  // Direct fetch POST — bare `fetch` per user spec, no headers, no signal.
  // Confirms whether RN Android fetch POST is broken against Render.
  const handleDirectFetch = async () => {
    setDebugBusy('fetch');
    setDebugResult('FETCH: Sending POST /api/auth/register ...');
    const url = `${API_URL_DEBUG}/api/auth/register`;
    const debugEmail = `fetchdebug${Date.now()}@example.com`;
    const t0 = Date.now();
    try {
      // eslint-disable-next-line no-console
      console.log('[direct-fetch] POST ->', url);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: debugEmail, password: 'password123', name: 'Fetch Debug' }),
      });
      const dt = Date.now() - t0;
      // eslint-disable-next-line no-console
      console.log('[direct-fetch] <-', res.status, 'in', dt, 'ms');
      let bodyText = '';
      try { bodyText = await res.text(); } catch {}
      const result = `FETCH STATUS: ${res.status}\nLATENCY: ${dt}ms\nEMAIL: ${debugEmail}\nBODY:\n${bodyText.slice(0, 300)}`;
      setDebugResult(result);
      Alert.alert(`Fetch: ${res.status}`, result);
    } catch (err: any) {
      const dt = Date.now() - t0;
      const result = `FETCH FAIL after ${dt}ms\nname: ${err?.name}\nmessage: ${err?.message || String(err)}`;
      // eslint-disable-next-line no-console
      console.log('[direct-fetch] FAIL', result);
      setDebugResult(result);
      Alert.alert('Fetch: FAILED', result);
    } finally {
      setDebugBusy(null);
    }
  };

  // Direct axios POST — same payload, but uses axios. If this succeeds
  // where fetch fails, the bug is RN's fetch on Android and we use axios
  // everywhere (already done in authStore.ts).
  const handleDirectAxios = async () => {
    setDebugBusy('axios');
    setDebugResult('AXIOS: Sending POST /api/auth/register ...');
    const url = `${API_URL_DEBUG}/api/auth/register`;
    const debugEmail = `axiosdebug${Date.now()}@example.com`;
    const t0 = Date.now();
    try {
      // eslint-disable-next-line no-console
      console.log('[direct-axios] POST ->', url);
      const res = await axios.post(
        url,
        { email: debugEmail, password: 'password123', name: 'Axios Debug' },
        { timeout: 90000, headers: { 'Content-Type': 'application/json' } }
      );
      const dt = Date.now() - t0;
      // eslint-disable-next-line no-console
      console.log('[direct-axios] <-', res.status, 'in', dt, 'ms');
      const bodyText = JSON.stringify(res.data).slice(0, 300);
      const result = `AXIOS STATUS: ${res.status}\nLATENCY: ${dt}ms\nEMAIL: ${debugEmail}\nBODY:\n${bodyText}`;
      setDebugResult(result);
      Alert.alert(`Axios: ${res.status}`, result);
    } catch (err: any) {
      const dt = Date.now() - t0;
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail || err?.response?.data?.message;
      const result =
        `AXIOS FAIL after ${dt}ms\n` +
        `code: ${err?.code || 'unknown'}\n` +
        `status: ${status ?? 'no response'}\n` +
        `detail: ${detail || '—'}\n` +
        `message: ${err?.message || String(err)}`;
      // eslint-disable-next-line no-console
      console.log('[direct-axios] FAIL', result);
      setDebugResult(result);
      Alert.alert('Axios: FAILED', result);
    } finally {
      setDebugBusy(null);
    }
  };
  // === END TEMPORARY DIAGNOSTIC =======================================

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace('/(tabs)');
    }
  }, [isLoading, isAuthenticated]);

  const handleSubmit = async () => {
    if (!email || !password || (!isLogin && !name)) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      if (isLogin) {
        await login(email, password);
      } else {
        await register(email, password, name);
      }
      router.replace('/(tabs)');
    } catch (error: any) {
      Alert.alert('Sign-in failed', error.message || 'Authentication failed');
    } finally {
      // Guarantee the spinner stops even if router.replace() throws or
      // the auth promise rejects in some unexpected way.
      setLoading(false);
    }
  };

  // Browser-like UA to bypass Cloudflare bot management which silently drops
  // requests from RN's default OkHttp `okhttp/4.x` UA.
  const BROWSER_UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

  // Helper for the diagnostic — fires a fetch with Promise.race timeout
  // against a single URL and returns a short summary string.
  const probeOne = async (url: string, timeoutMs = 30000): Promise<string> => {
    const controller = new AbortController();
    let timer: any;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        try { controller.abort(); } catch {}
        reject(new Error(`timeout ${timeoutMs / 1000}s`));
      }, timeoutMs);
    });
    const t0 = Date.now();
    try {
      const r = await Promise.race([
        fetch(url, {
          method: 'GET',
          headers: { 'User-Agent': BROWSER_UA },
          signal: controller.signal,
        }),
        timeoutPromise,
      ]) as Response;
      return `✅ ${r.status} in ${Date.now() - t0}ms`;
    } catch (e: any) {
      return `❌ ${(e?.message || String(e)).slice(0, 60)} after ${Date.now() - t0}ms`;
    } finally {
      clearTimeout(timer);
    }
  };

  // One-tap connectivity test. Probes BOTH the production backend AND a
  // known-working public endpoint (httpbin.org) at the same time. If httpbin
  // works but the backend doesn't, the APK's fetch is fine — something in
  // Cloudflare/emergent.host is blocking it. If neither works, the APK
  // itself can't make outbound HTTPS requests (Android network policy bug).
  const handleTestConnection = async () => {
    if (!API_URL_DEBUG) {
      Alert.alert('No API URL', 'EXPO_PUBLIC_BACKEND_URL is not baked into this build.');
      return;
    }
    const [backendResult, controlResult] = await Promise.all([
      probeOne(`${API_URL_DEBUG}/api/`, 30000),
      probeOne('https://httpbin.org/get', 30000),
    ]);
    Alert.alert(
      'Connectivity Test',
      `BACKEND:\n${API_URL_DEBUG}\n${backendResult}\n\n` +
      `CONTROL (httpbin):\n${controlResult}\n\n` +
      `If backend ❌ but control ✅ → backend/Cloudflare problem.\n` +
      `If both ❌ → APK network config problem.`
    );
  };

  if (isLoading) {
    return <LoadingSpinner message="Loading..." />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Ionicons name="musical-notes" size={48} color={colors.primary} />
            </View>
            <Text style={styles.title}>AI Music Manager</Text>
            <Text style={styles.subtitle}>
              Build your artist roster with AI-powered tools
            </Text>
          </View>

          <View style={styles.form}>
            {!isLogin && (
              <Input
                label="Name"
                placeholder="Your name"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
            )}
            <Input
              label="Email"
              placeholder="your@email.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Input
              label="Password"
              placeholder="Enter password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />

            <Button
              title={isLogin ? 'Sign In' : 'Create Account'}
              onPress={handleSubmit}
              loading={loading}
              style={styles.submitButton}
            />

            <TouchableOpacity
              onPress={() => setIsLogin(!isLogin)}
              style={styles.switchButton}
            >
              <Text style={styles.switchText}>
                {isLogin ? "Don't have an account? " : 'Already have an account? '}
                <Text style={styles.switchTextBold}>
                  {isLogin ? 'Sign Up' : 'Sign In'}
                </Text>
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.features}>
            <View style={styles.featureItem}>
              <Ionicons name="people" size={24} color={colors.primary} />
              <Text style={styles.featureText}>Artist Roster</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="disc" size={24} color={colors.secondary} />
              <Text style={styles.featureText}>Song Catalog</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="bulb" size={24} color={colors.warning} />
              <Text style={styles.featureText}>AI Analysis</Text>
            </View>
          </View>

          {/* === TEMPORARY DIAGNOSTIC BLOCK =====================================
              Two buttons side by side: Direct Fetch vs Direct Axios. Both POST
              /api/auth/register with random emails. A/B comparison tells us
              definitively whether RN's fetch is broken on Android — if Axios
              works but Fetch doesn't, we use axios everywhere (already done in
              authStore.ts). Remove this block once verified.
          */}
          <View style={styles.diagBlock}>
            <Text style={styles.diagTitle}>🐛 Diagnostic — POST /api/auth/register</Text>
            <View style={styles.diagButtonRow}>
              <TouchableOpacity
                style={[styles.diagButton, styles.diagButtonFetch, debugBusy && styles.diagButtonBusy]}
                onPress={handleDirectFetch}
                disabled={!!debugBusy}
                activeOpacity={0.7}
              >
                <Text style={styles.diagButtonText}>
                  {debugBusy === 'fetch' ? 'Testing…' : 'Direct Fetch'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.diagButton, styles.diagButtonAxios, debugBusy && styles.diagButtonBusy]}
                onPress={handleDirectAxios}
                disabled={!!debugBusy}
                activeOpacity={0.7}
              >
                <Text style={styles.diagButtonText}>
                  {debugBusy === 'axios' ? 'Testing…' : 'Direct Axios'}
                </Text>
              </TouchableOpacity>
            </View>
            {debugResult ? (
              <ScrollView style={styles.diagResultScroll}>
                <Text selectable style={styles.diagResultText}>{debugResult}</Text>
              </ScrollView>
            ) : (
              <Text style={styles.diagHint}>
                Bypasses authStore. Both hit Render directly. Run both and compare.
              </Text>
            )}
          </View>
          {/* === END TEMPORARY DIAGNOSTIC BLOCK ================================ */}

          {/* Debug footer — shows the API URL the APK has baked in.
              Tap to run a quick connectivity test against the backend. */}
          <TouchableOpacity
            onPress={() => { console.log('[login] test connection tapped'); handleTestConnection(); }}
            activeOpacity={0.6}
            hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
            style={styles.debugFooterTouch}
          >
            <Text style={styles.debugFooter} numberOfLines={2}>
              API: {API_URL_DEBUG || '⚠️ NOT SET — rebuild APK with eas.json env var'}
            </Text>
            <Text style={styles.debugFooterHint}>👉 Tap here to test connection</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: spacing.lg,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  form: {
    marginBottom: spacing.xl,
  },
  submitButton: {
    marginTop: spacing.md,
  },
  switchButton: {
    marginTop: spacing.lg,
    alignItems: 'center',
  },
  switchText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  switchTextBold: {
    color: colors.primary,
    fontWeight: '600',
  },
  features: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  featureItem: {
    alignItems: 'center',
    gap: 8,
  },
  featureText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  debugFooter: {
    marginTop: 0,
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
    opacity: 0.7,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  debugFooterHint: {
    marginTop: 6,
    fontSize: 13,
    color: colors.primary,
    textAlign: 'center',
    textDecorationLine: 'underline',
    fontWeight: '600',
  },
  debugFooterTouch: {
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
  },
  // === TEMPORARY DIAGNOSTIC STYLES ===
  diagBlock: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.warning,
    backgroundColor: 'rgba(255, 200, 0, 0.06)',
  },
  diagTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.warning,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  diagButtonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  diagButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: spacing.sm,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  diagButtonFetch: {
    backgroundColor: '#666',
  },
  diagButtonAxios: {
    backgroundColor: colors.warning,
  },
  diagButtonBusy: {
    opacity: 0.5,
  },
  diagButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000',
  },
  diagHint: {
    marginTop: spacing.sm,
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  diagResultScroll: {
    marginTop: spacing.sm,
    maxHeight: 220,
  },
  diagResultText: {
    fontSize: 11,
    color: colors.text,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 16,
  },
  // === END TEMPORARY DIAGNOSTIC STYLES ===
});
