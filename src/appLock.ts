// Batch 75 / APP-Q116 — the device half of the optional app lock.
//
// src/utils/appLockPolicy.js holds the rules; this file holds the storage and the
// device-authentication call. Two jobs, kept apart so the rules stay testable and
// the platform calls stay in one place:
//
//   settings      on/off and grace period, stored with the same web/native
//                 storage split the rest of the app uses (SecureStore on device,
//                 localStorage on web).
//   device auth   face / fingerprint / device passcode, via
//                 expo-local-authentication. `disableDeviceFallback: false` on
//                 purpose: a device passcode is still the device's own unlock,
//                 and refusing it would lock out anyone with no biometrics
//                 enrolled.
//
// Everything here is best-effort and never throws into a caller: a storage or
// hardware failure must degrade to "no lock", not to a broken app or a lock the
// user cannot open.
import { Platform } from 'react-native';
import {
  APP_LOCK_ENABLED_KEY,
  APP_LOCK_DELAY_KEY,
  APP_LOCK_LAST_ACTIVE_KEY,
  normalizeAppLockDelay,
  parseAppLockEnabled,
  parseAppLockTimestamp,
  DEFAULT_APP_LOCK_DELAY,
} from './utils/appLockPolicy';

export type AppLockSettings = {
  enabled: boolean;
  delayMs: number;
};

export type DeviceAuthAvailability = {
  /** True only when a device authentication method actually exists and is set up. */
  available: boolean;
  hasHardware: boolean;
  enrolled: boolean;
};

const isWeb = Platform.OS === 'web';

const storage = {
  async getItem(key: string): Promise<string | null> {
    try {
      if (isWeb) return localStorage.getItem(key);
      const SecureStore = require('expo-secure-store');
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    try {
      if (isWeb) { localStorage.setItem(key, value); return; }
      const SecureStore = require('expo-secure-store');
      await SecureStore.setItemAsync(key, value);
    } catch {
      // Storage is unavailable; the setting simply will not survive a restart.
    }
  },
  async deleteItem(key: string): Promise<void> {
    try {
      if (isWeb) { localStorage.removeItem(key); return; }
      const SecureStore = require('expo-secure-store');
      await SecureStore.deleteItemAsync(key);
    } catch {}
  },
};

export async function loadAppLockSettings(): Promise<AppLockSettings> {
  const [enabledRaw, delayRaw] = await Promise.all([
    storage.getItem(APP_LOCK_ENABLED_KEY),
    storage.getItem(APP_LOCK_DELAY_KEY),
  ]);
  return {
    enabled: parseAppLockEnabled(enabledRaw),
    delayMs: delayRaw === null ? DEFAULT_APP_LOCK_DELAY : normalizeAppLockDelay(delayRaw),
  };
}

export async function saveAppLockEnabled(enabled: boolean): Promise<void> {
  await storage.setItem(APP_LOCK_ENABLED_KEY, enabled ? 'true' : 'false');
}

export async function saveAppLockDelay(delayMs: number): Promise<void> {
  await storage.setItem(APP_LOCK_DELAY_KEY, String(normalizeAppLockDelay(delayMs)));
}

/**
 * Stamp the moment the app left the foreground. Called on background/inactive and
 * after a successful unlock, so "time since the user was last here" is always the
 * quantity being measured.
 */
export async function recordAppLockActivity(now: number = Date.now()): Promise<void> {
  await storage.setItem(APP_LOCK_LAST_ACTIVE_KEY, String(now));
}

export async function getAppLockLastActive(): Promise<number | null> {
  return parseAppLockTimestamp(await storage.getItem(APP_LOCK_LAST_ACTIVE_KEY));
}

/** Used when the user signs out: the next sign-in is a fresh authentication. */
export async function clearAppLockActivity(): Promise<void> {
  await storage.deleteItem(APP_LOCK_LAST_ACTIVE_KEY);
}

/**
 * Whether this device can actually ask for its own unlock. Returns
 * `available: false` rather than throwing for web, missing hardware, or no
 * enrolled method — the callers treat that as "do not lock".
 */
export async function getDeviceAuthAvailability(): Promise<DeviceAuthAvailability> {
  if (isWeb) return { available: false, hasHardware: false, enrolled: false };
  try {
    const LocalAuthentication = await import('expo-local-authentication');
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const enrolled = hasHardware ? await LocalAuthentication.isEnrolledAsync() : false;
    return { available: hasHardware && enrolled, hasHardware, enrolled };
  } catch {
    return { available: false, hasHardware: false, enrolled: false };
  }
}

/**
 * Ask the device to unlock. `disableDeviceFallback` stays false so the device
 * passcode counts as device authentication — see the file header.
 *
 * @returns true only on a genuine success; false for cancellation, failure, or an
 *          unavailable device, all of which leave the app locked.
 */
export async function authenticateForAppUnlock({
  promptMessage,
  cancelLabel,
  fallbackLabel,
}: {
  promptMessage: string;
  cancelLabel?: string;
  fallbackLabel?: string;
}): Promise<boolean> {
  if (isWeb) return false;
  try {
    const LocalAuthentication = await import('expo-local-authentication');
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel,
      fallbackLabel,
      disableDeviceFallback: false,
    });
    return result?.success === true;
  } catch {
    return false;
  }
}
