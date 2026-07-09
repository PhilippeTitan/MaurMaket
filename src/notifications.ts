import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { savePushToken } from './api';
import { routeNotification } from './notificationRouting';

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

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });

  Notifications.addNotificationResponseReceivedListener((response: any) => {
    const data = response.notification.request.content.data;
    if (!navigationRef?.isReady?.()) return;
    routeNotification(navigationRef, data?.type, data);
  });
}
