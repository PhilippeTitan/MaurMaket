/**
 * Paraglide Translation Provider (stub)
 *
 * Future: plug in @inlang/paraglide-js compiled messages.
 * Only activated if Paraglide works cleanly in Metro/Expo.
 *
 * To enable:
 * 1. Install @inlang/paraglide-js
 * 2. Run `npx @inlang/paraglide-js compile`
 * 3. Import generated messages here
 * 4. Set `active = true` in providers/index.ts
 */
import type { Language, TranslationProvider } from '../types';

export const paraglideProvider: TranslationProvider = {
  lookup(_key: string, _lang: Language): string | undefined {
    // Not yet wired — falls through to JSON provider
    return undefined;
  },
};
