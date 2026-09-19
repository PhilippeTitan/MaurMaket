/**
 * Provider Registry
 *
 * The adapter calls `providers.resolve()` to get the active provider.
 * Swap the active provider here — one line change.
 */
import type { TranslationProvider } from '../types';
import { jsonProvider } from './json';
// import { paraglideProvider } from './paraglide';

/**
 * The active translation provider.
 * Change this to swap engines without touching any screen.
 */
export const activeProvider: TranslationProvider = jsonProvider;
// export const activeProvider: TranslationProvider = paraglideProvider;
