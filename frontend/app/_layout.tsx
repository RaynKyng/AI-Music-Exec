import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet } from 'react-native';
import { useAuthStore } from '../src/stores/authStore';
import { MiniPlayer } from '../src/components/MiniPlayer';
import { colors } from '../src/utils/theme';
import { usePushNotifications } from '../src/utils/pushNotifications';
import { resilientFetch } from '../src/utils/api';

// Global fetch monkey-patch for /api/ calls only — handles backend cold-starts
// (Emergent preview workspaces sleep and the proxy briefly returns HTML, breaking JSON.parse)
if (typeof global !== 'undefined' && !(global as any).__fetchPatchedForApi) {
  const _origFetch = global.fetch.bind(global);
  (global as any).fetch = (input: any, init?: any) => {
    try {
      const urlStr = typeof input === 'string' ? input : (input?.url || String(input));
      if (urlStr.includes('/api/')) {
        return resilientFetch(input, init);
      }
    } catch {}
    return _origFetch(input, init);
  };
  (global as any).__fetchPatchedForApi = true;
}

export default function RootLayout() {
  const loadAuth = useAuthStore((state) => state.loadAuth);
  usePushNotifications();

  useEffect(() => {
    loadAuth();
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'slide_from_right',
        }}
      />
      <MiniPlayer />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
