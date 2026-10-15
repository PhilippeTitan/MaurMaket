import { Platform } from 'react-native';

/**
 * APP-Q003 — restore the last main tab across launches. Like the other device
 * preferences (language, low data, appearance) this key belongs to the phone,
 * not the account, so the sign-out sweep keeps it (signOutPolicy DEVICE_LOCAL_KEYS).
 */
export const LAST_TAB_KEY = 'mm_last_tab';

export const MAIN_TAB_NAMES = ['FeedTab', 'ExploreTab', 'InboxTab', 'MapTab', 'MeTab'] as const;

export type MainTabName = (typeof MAIN_TAB_NAMES)[number];

export function isMainTabName(value: unknown): value is MainTabName {
  return typeof value === 'string' && (MAIN_TAB_NAMES as readonly string[]).includes(value);
}

const storage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') return localStorage.getItem(key);
    const SecureStore = require('expo-secure-store');
    return SecureStore.getItemAsync(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      localStorage.setItem(key, value);
      return;
    }
    const SecureStore = require('expo-secure-store');
    return SecureStore.setItemAsync(key, value);
  },
};

export async function loadLastTab(): Promise<MainTabName | null> {
  try {
    const saved = await storage.getItem(LAST_TAB_KEY);
    return isMainTabName(saved) ? saved : null;
  } catch {
    return null;
  }
}

export async function saveLastTab(tab: MainTabName): Promise<void> {
  try {
    await storage.setItem(LAST_TAB_KEY, tab);
  } catch {
    // Best effort — a failed write only costs the restore on next launch.
  }
}
