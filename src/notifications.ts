import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { savePushToken, clearPushToken } from './api';
import { routeNotification } from './notificationRouting';
import { PUSH_TOKEN_KEY } from './utils/signOutPolicy';

// The token this device registered, kept locally so sign-out can unregister
// exactly this device (Batch 75). It is a device identifier rather than account
// data, so it is listed as device-local in src/utils/signOutPolicy.js and stays
// on the device across sign-out.
const isWeb = Platform.OS === 'web';

async function readStoredPushToken(): Promise<string | null> {
  try {
    if (isWeb) return localStorage.getItem(PUSH_TOKEN_KEY);
    const SecureStore = require('expo-secure-store');
    return await SecureStore.getItemAsync(PUSH_TOKEN_KEY);
  } catch {
    return null;
  }
}

async function writeStoredPushToken(token: string | null): Promise<void> {
  try {
    if (isWeb) {
      if (token) localStorage.setItem(PUSH_TOKEN_KEY, token);
      else localStorage.removeItem(PUSH_TOKEN_KEY);
      return;
    }
    const SecureStore = require('expo-secure-store');
    if (token) await SecureStore.setItemAsync(PUSH_TOKEN_KEY, token);
    else await SecureStore.deleteItemAsync(PUSH_TOKEN_KEY);
  } catch {
    // Storage unavailable: registration still works, sign-out simply cannot be
    // precise about which device it is unregistering.
  }
}

export type ForegroundNotification = {
  title: string;
  body: string;
  type: string;
  data: any;
};

let foregroundListener: ((notif: ForegroundNotification) => void) | null = null;

export function onForegroundNotification(cb: ((notif: ForegroundNotification) => void) | null) {
  foregroundListener = cb;
}

function isExpoGo(): boolean {
  return Constants.executionEnvironment === 'storeClient';
}

function getNotifications() {
  if (isExpoGo()) return null;
  try {
    return require('expo-notifications');
  } catch {
    return null;
  }
}

export async function registerForPushNotificationsAsync() {
  if (isExpoGo()) return null;
  const Notifications = getNotifications();
  if (!Notifications) return null;
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return null;

    const token = await Notifications.getExpoPushTokenAsync();
    if (token?.data) {
      await writeStoredPushToken(token.data);
      await savePushToken(token.data);
    }
    return token?.data || null;
  } catch (err) {
    console.warn('Push registration skipped:', err instanceof Error ? err.message : err);
    return null;
  }
}

// Batch 75 — the other half of registration, called while the session that owns
// the registration is still valid. Returns whether the server confirmed the clear;
// the local copy is kept either way so a later sign-out can retry, and a failure
// never blocks the sign-out the user asked for.
export async function unregisterPushToken(): Promise<boolean> {
  const token = await readStoredPushToken();
  if (!token) return false;
  try {
    const result = await clearPushToken(token);
    return result?.ok === true;
  } catch {
    return false;
  }
}

export function setupNotificationListeners(navigationRef: any) {
  const Notifications = getNotifications();
  if (!Notifications) return;

  // Suppress native OS alert when app is foregrounded; app displays in-app banner instead
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: false,
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: false,
      shouldSetBadge: true,
    }),
  });

  // Handle incoming notification while app is foregrounded
  Notifications.addNotificationReceivedListener((notification: any) => {
    const content = notification.request.content;
    const data = content.data || {};
    if (foregroundListener) {
      foregroundListener({
        title: content.title || 'MaurMaket',
        body: content.body || '',
        type: data.type || 'general',
        data,
      });
    }
  });

  // Handle tapping a notification in notification shade
  Notifications.addNotificationResponseReceivedListener((response: any) => {
    const data = response.notification.request.content.data;
    if (!navigationRef?.isReady?.()) return;
    routeNotification(navigationRef, data?.type, data);
  });

  // Check cold-start notification launch
  Notifications.getLastNotificationResponseAsync().then((response: any) => {
    if (response) {
      const data = response.notification.request.content.data;
      if (navigationRef?.isReady?.() && data?.type) {
        routeNotification(navigationRef, data.type, data);
      }
    }
  }).catch(() => {});
}
