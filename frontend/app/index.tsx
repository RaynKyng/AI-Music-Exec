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
import { useAuthStore } from '../src/stores/authStore';
import { Input } from '../src/components/Input';
import { Button } from '../src/components/Button';
import { LoadingSpinner } from '../src/components/LoadingSpinner';
import { colors, spacing } from '../src/utils/theme';

const API_URL_DEBUG = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function Index() {
  const router = useRouter();
  const { isAuthenticated, isLoading, login, register } = useAuthStore();
  
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

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

  // One-tap connectivity test. Lets the user quickly verify the APK can
  // reach the backend without typing credentials. The Emergent Starter-tier
  // deployment may need 30-60s to wake up from idle on the first request,
  // so allow up to 75s before declaring failure.
  const handleTestConnection = async () => {
    if (!API_URL_DEBUG) {
      Alert.alert('No API URL', 'EXPO_PUBLIC_BACKEND_URL is not baked into this build. Rebuild the APK after setting it in eas.json.');
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 75000);
    try {
      const t0 = Date.now();
      const r = await fetch(`${API_URL_DEBUG}/api/`, {
        method: 'GET',
        signal: controller.signal,
      });
      const dt = Date.now() - t0;
      Alert.alert(
        'Connection OK',
        `Reached ${API_URL_DEBUG}\nStatus: ${r.status}\nLatency: ${dt}ms${dt > 5000 ? '\n(backend warmed up from cold-start)' : ''}`
      );
    } catch (e: any) {
      const msg = e?.name === 'AbortError' ? 'Request timed out after 75s — backend may be down' : (e?.message || String(e));
      Alert.alert('Connection failed', `${API_URL_DEBUG}\n${msg}`);
    } finally {
      clearTimeout(timer);
    }
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

          {/* Debug footer — shows the API URL the APK has baked in.
              Tap to run a quick connectivity test against the backend.
              Helps diagnose hung logins or "404 page not found" errors. */}
          <TouchableOpacity onPress={handleTestConnection} activeOpacity={0.7}>
            <Text style={styles.debugFooter} numberOfLines={2}>
              API: {API_URL_DEBUG || '⚠️ NOT SET — rebuild APK with eas.json env var'}
            </Text>
            <Text style={styles.debugFooterHint}>Tap to test connection</Text>
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
    marginTop: spacing.lg,
    fontSize: 10,
    color: colors.textMuted,
    textAlign: 'center',
    opacity: 0.5,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  debugFooterHint: {
    marginTop: 2,
    fontSize: 9,
    color: colors.primary,
    textAlign: 'center',
    opacity: 0.6,
    textDecorationLine: 'underline',
  },
});
