import type { TranslationParams } from './types';
import { languageManager } from './languageManager';
import { activeProvider } from './providers';

/**
 * Interpolate {paramName} placeholders in a message string.
 */
function interpolate(
  str: string,
  params: Record<string, string | number>
): string {
  let result = str;
  for (const [k, v] of Object.entries(params)) {
    result = result.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  }
  return result;
}

/**
 * MaurMaket Translation Engine — Core
 *
 * Resolves a dotted key to a translated string:
 *   1. Ask the active provider (JSON / Paraglide / future)
 *   2. Fall back to English
 *   3. Fall back to raw key
 *
 * Screens never call this directly — they use `t()` from index.ts
 * which wraps this with the same signature.
 */
export function t(key: string, params?: TranslationParams): string {
  const lang = languageManager.language;

  // Ask the active provider
  const msg = activeProvider.lookup(key, lang);
  if (msg !== undefined) {
    return params ? interpolate(msg, params) : msg;
  }

  // Fall back to raw key (shouldn't happen if JSON files are complete)
  return key;
}
