import { Platform } from 'react-native';
import * as Localization from 'expo-localization';
import type { Language } from './types';

const STORAGE_KEY = 'mm_lang';

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

let currentLang: Language = 'en';
const listeners: Array<() => void> = [];

export const languageManager = {
  get language(): Language {
    return currentLang;
  },

  async init(): Promise<void> {
    try {
      const stored = await storage.getItem(STORAGE_KEY);
      if (stored === 'en' || stored === 'ht' || stored === 'fr') {
        currentLang = stored;
        return;
      }
    } catch {
      // Stored preference unreadable — fall through to the device-language default.
    }
    // APP-Q010: with no saved choice, use the supported device language;
    // anything else falls back to Haitian Creole. English stays the module
    // default only when the locale lookup itself fails.
    try {
      const deviceLang = Localization.getLocales?.()[0]?.languageCode;
      if (deviceLang === 'en' || deviceLang === 'ht' || deviceLang === 'fr') {
        currentLang = deviceLang;
      } else {
        currentLang = 'ht';
      }
    } catch {
      // Keep the English module default if locale lookup fails.
    }
  },

  async setLanguage(lang: Language): Promise<void> {
    currentLang = lang;
    try {
      await storage.setItem(STORAGE_KEY, lang);
    } catch {
      // Storage write failed — language still changed in memory
    }
    listeners.forEach((fn) => fn());
  },

  onChange(fn: () => void): () => void {
    listeners.push(fn);
    return () => {
      const idx = listeners.indexOf(fn);
      if (idx >= 0) listeners.splice(idx, 1);
    };
  },
};
