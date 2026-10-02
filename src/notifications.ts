import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { savePushToken } from './api';
import { routeNotification } from './notificationRouting';

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
      await savePushToken(token.data);
    }
    return token?.data || null;
  } catch (err) {
    console.warn('Push registration skipped:', err instanceof Error ? err.message : err);
    return null;
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
