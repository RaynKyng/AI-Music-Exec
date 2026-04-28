import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useAuthStore } from '../stores/authStore';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

// Set up the notification handler globally (foreground behavior)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'AI Music Exec',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#7c3aed',
      sound: 'default',
    });
  } catch (e) {
    console.warn('Failed to create notification channel:', e);
  }
}

async function getProjectId(): Promise<string | undefined> {
  // Try multiple sources to maximize compatibility
  const fromExpoConfig =
    (Constants.expoConfig as any)?.extra?.eas?.projectId ||
    (Constants.easConfig as any)?.projectId;
  const fromManifest =
    (Constants.manifest2 as any)?.extra?.eas?.projectId ||
    (Constants as any).manifest?.extra?.eas?.projectId;
  return fromExpoConfig || fromManifest;
}

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  // Push notifications only work on physical devices in dev/preview/production
  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return null;
  }

  // Skip on web entirely
  if (Platform.OS === 'web') {
    return null;
  }

  await ensureAndroidChannel();

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    console.log('Push notification permission not granted');
    return null;
  }

  try {
    const projectId = await getProjectId();
    if (!projectId || projectId === 'REPLACE_WITH_YOUR_EAS_PROJECT_ID') {
      console.warn(
        'Missing EAS projectId in app.json -> extra.eas.projectId. Run "eas init" to populate.'
      );
      return null;
    }
    const tokenResp = await Notifications.getExpoPushTokenAsync({ projectId });
    return tokenResp.data;
  } catch (e) {
    console.warn('Failed to get Expo push token:', e);
    return null;
  }
}

export async function syncPushTokenWithBackend(): Promise<void> {
  try {
    const token = await AsyncStorage.getItem('token');
    if (!token) return;

    const expoPushToken = await registerForPushNotificationsAsync();
    if (!expoPushToken) return;

    // Avoid re-sending the same token repeatedly
    const stored = await AsyncStorage.getItem('expoPushToken');
    if (stored === expoPushToken) return;

    const res = await fetch(`${API_URL}/api/users/push-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        push_token: expoPushToken,
        platform: Platform.OS,
      }),
    });

    if (res.ok) {
      await AsyncStorage.setItem('expoPushToken', expoPushToken);
    }
  } catch (e) {
    console.warn('syncPushTokenWithBackend failed:', e);
  }
}

export async function clearPushTokenOnLogout(): Promise<void> {
  try {
    const token = await AsyncStorage.getItem('token');
    const stored = await AsyncStorage.getItem('expoPushToken');
    if (token && stored) {
      await fetch(`${API_URL}/api/users/push-token`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ push_token: stored }),
      }).catch(() => {});
    }
    await AsyncStorage.removeItem('expoPushToken');
  } catch {}
}

/**
 * Hook used in the root layout. Registers push token after the user logs in,
 * and wires up tap handlers to deep-link into the app.
 */
export function usePushNotifications() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const receivedSub = useRef<Notifications.EventSubscription | null>(null);
  const responseSub = useRef<Notifications.EventSubscription | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    syncPushTokenWithBackend();
  }, [isAuthenticated]);

  useEffect(() => {
    // Foreground notification received
    receivedSub.current = Notifications.addNotificationReceivedListener(
      (notification) => {
        // Reserved for future in-app banner toast
        console.log('Notification received:', notification.request.content.title);
      }
    );

    // User tapped a notification → deep link to the right screen
    responseSub.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        try {
          const data: any = response.notification.request.content.data || {};
          if (data.url) {
            router.push(data.url);
          } else if (data.target_type === 'song' && data.target_id) {
            router.push(`/song/${data.target_id}`);
          } else if (data.target_type === 'artist' && data.target_id) {
            router.push(`/artist/${data.target_id}`);
          } else if (data.target_type === 'collection' && data.target_id) {
            router.push(`/collection/${data.target_id}`);
          }
        } catch (e) {
          console.warn('Failed to handle notification tap:', e);
        }
      }
    );

    return () => {
      receivedSub.current?.remove();
      responseSub.current?.remove();
    };
  }, []);
}
