import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet } from 'react-native';
import { useAuthStore } from '../src/stores/authStore';
import { MiniPlayer } from '../src/components/MiniPlayer';
import { colors } from '../src/utils/theme';
import { usePushNotifications } from '../src/utils/pushNotifications';

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
