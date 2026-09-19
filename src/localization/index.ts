/**
 * MaurMaket Localization — Public API
 *
 * Component → this module → adapter → provider → messages
 *
 * Usage:
 *   import { useTranslation } from '@/localization';
 *   const { t, language } = useTranslation();
 *   t('settings.title')
 *
 * Direct (non-component):
 *   import { i18n } from '@/localization';
 *   i18n.setLanguage('fr');
 */

import { useState, useEffect, useCallback } from 'react';
import type { Language, TranslationParams } from './types';
import {
  AVAILABLE_LANGUAGES,
  LANGUAGE_LABELS,
} from './types';
import { languageManager } from './languageManager';
import { t as translate } from './adapter';

// Re-export everything screens need
export type { Language, TranslationParams };
export { AVAILABLE_LANGUAGES, LANGUAGE_LABELS };

/**
 * Core i18n object — same interface as old i18n.ts.
 * For use outside React components (e.g. navigation, services).
 */
export const i18n = {
  get language(): Language {
    return languageManager.language;
  },

  init: () => languageManager.init(),

  setLanguage: (lang: Language) => languageManager.setLanguage(lang),

  t: (key: string, params?: TranslationParams): string =>
    translate(key, params),

  onChange: (fn: () => void) => languageManager.onChange(fn),

  availableLanguages: () => AVAILABLE_LANGUAGES,
};

/**
 * React hook — drops-in replacement for the old useTranslation().
 * Returns { t, language } with automatic re-renders on language change.
 */
export function useTranslation() {
  const [, setTick] = useState(0);

  useEffect(() => {
    return i18n.onChange(() => setTick((t) => t + 1));
  }, []);

  const t = useCallback(
    (key: string, params?: TranslationParams) => i18n.t(key, params),
    []
  );

  return { t, language: i18n.language };
}
