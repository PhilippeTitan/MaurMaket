export type Language = 'en' | 'ht' | 'fr';

export type TranslationParams = Record<string, string | number>;

export const AVAILABLE_LANGUAGES: Language[] = ['en', 'ht', 'fr'];

export const LANGUAGE_LABELS: Record<Language, string> = {
  en: 'English',
  ht: 'Kreyòl',
  fr: 'Français',
};

/**
 * Translation Provider — the swappable engine.
 *
 * Implement this interface to plug in Paraglide, i18next,
 * a database-backed system, or anything else.
 */
export interface TranslationProvider {
  /** Look up a key in the given language. Return undefined if missing. */
  lookup(key: string, lang: Language): string | undefined;
}
