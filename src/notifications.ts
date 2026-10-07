import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { savePushToken, clearPushToken } from './api';
import { routeNotification } from './notificationRouting';
import { PUSH_TOKEN_KEY } from './utils/signOutPolicy';
import { decidePushDelivery, releaseHeldPush as releaseHeldPushDecision, PUSH_ROUTE } from './utils/pushRoutingPolicy.js';

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

// Batch 75 follow-on: a push is only a pointer, and the destination it points at
// belongs to an account. On a signed-out device nothing is shown and a tap is
// held for the next sign-in instead of routed (see src/utils/pushRoutingPolicy.js).
let activeNavigationRef: any = null;
let heldPush: { type: string; data: any; heldAt: number } | null = null;
let hasSessionProbe: () => boolean = () => false;

function sessionIsOpen(): boolean {
  try {
    return hasSessionProbe() === true;
  } catch {
    return false;
  }
}

/** Remember where a push pointed, so a sign-in moments later can honour it. */
function handlePushDestination(type: any, data: any) {
  if (decidePushDelivery({ hasSession: sessionIsOpen() }) === PUSH_ROUTE) {
    heldPush = null;
    if (activeNavigationRef?.isReady?.()) routeNotification(activeNavigationRef, type, data);
    return;
  }
  heldPush = { type: typeof type === 'string' ? type : '', data: data ?? null, heldAt: Date.now() };
}

/**
 * Route a held push, if one is still worth routing. Called when a session opens;
 * returns whether anything was routed.
 */
export function releaseHeldPush(hasSession: boolean): boolean {
  const release = releaseHeldPushDecision(heldPush, { hasSession });
  const hadHeld = heldPush !== null;
  heldPush = null;
  if (!release) return false;
  if (!activeNavigationRef?.isReady?.()) return false;
  routeNotification(activeNavigationRef, release.type, release.data);
  return true;
}

/** Signed out: hold the destination without telling the next account about it. */
export function pendingPushHold(): { type: string; data: any; heldAt: number } | null {
  return heldPush;
}

export function setupNotificationListeners(navigationRef: any, hasSession?: () => boolean) {
  const Notifications = getNotifications();
  activeNavigationRef = navigationRef;
  if (typeof hasSession === 'function') hasSessionProbe = hasSession;
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
    // No session, no banner: the alert belongs to an account that is not signed
    // in here, and it stays in that account's in-app feed until they return.
    if (!sessionIsOpen()) return;
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
    handlePushDestination(data?.type, data);
  });

  // Check cold-start notification launch. The response can arrive before the
  // session is restored, which is exactly the case the hold exists for.
  Notifications.getLastNotificationResponseAsync().then((response: any) => {
    if (!response) return;
    const data = response.notification.request.content.data;
    handlePushDestination(data?.type, data);
  }).catch(() => {});
}
