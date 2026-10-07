// Batch 75 / APP-Q403 — what leaves this device when a user signs out.
//
// "Clear authenticated caches and credentials; protect unsent drafts and offer a
// clear choice about local retention."
//
// The rule this file encodes, so it applies the same way to every caller:
//
//   REMOVED  — data the device only holds because the user was authenticated:
//              server-derived caches and account-scoped pending syncs. A shared
//              device must not hand them to the next person who signs in.
//   KEPT     — user-authored local content (unsent message drafts, the local
//              cart) and device-level preferences (appearance, language, low
//              data, explore filters). These belong to whoever is holding the
//              phone, not to the account, and silently destroying them is the
//              failure mode APP-Q351 and APP-Q403 are written to prevent.
//
// `UNSENT_DRAFTS_KEY` is the one key that sits on both sides: it is protected by
// default and removed only when the user explicitly chooses to remove it at
// sign-out. It is listed in DEVICE_LOCAL_KEYS too so the protection is asserted.
//
// Apart from the app-lock keys (which this file imports from appLockPolicy so the
// literal exists once), this module has no imports: Node scripts and
// Metro/TypeScript (`allowJs`) can both load the identical key list — the device
// has exactly one definition of what "authenticated cache" means.
// The extension is explicit: Node's ESM resolver (used by the guardrail scripts)
// will not guess it, while Metro and TypeScript both accept it.
import { APP_LOCK_ENABLED_KEY, APP_LOCK_DELAY_KEY, APP_LOCK_LAST_ACTIVE_KEY } from './appLockPolicy.js';
import { CART_ACCOUNT_KEY, CART_GUEST_KEY } from './cartSync.js';

/** Unsent chat drafts. Protected unless the user opts in to removing them. */
export const UNSENT_DRAFTS_KEY = 'mm_outbox';

/**
 * This device's own push registration, so sign-out can unregister precisely
 * (Batch 75): the server compare-and-clears against this value, so a device that
 * signs out cannot unregister another device that registered later. It is the
 * device's identifier, not the account's data, so it is kept across sign-out.
 */
export const PUSH_TOKEN_KEY = 'mm_push_token';

/** Reference to an in-flight MonCash/NatCash payment (financial, account-scoped). */
export const PENDING_PAYMENT_KEY = 'mm_pending_payment';

/** Queued authenticated mutations: wishlist, follow, feed events, notification reads. */
export const OFFLINE_QUEUE_KEY = 'mm_offline_queue';

/** Cached "sellers near me" results. */
export const MAP_SELLERS_CACHE_KEY = 'mm_map_last_sellers_v2';

/** Pre-v2 map cache held exact seller coordinates; never leave that behind either. */
export const LEGACY_MAP_SELLERS_CACHE_KEY = 'mm_map_last_sellers';

/** Notification feed snapshots are written one-per-account with this prefix. */
export const NOTIFICATION_CACHE_PREFIX = 'cached_notifs_';

/**
 * Prefix of the versioned offline snapshot cache. src/offlineCache.ts imports
 * this constant to build its keys, so the writer and the sweep can never drift.
 */
export const SNAPSHOT_CACHE_PREFIX = 'mm_snapshot:';

/** Account-scoped snapshots: profile, inbox, and per-conversation message copies. */
export const USER_SNAPSHOT_PREFIX = `${SNAPSHOT_CACHE_PREFIX}user:`;

/** Snapshot cache key for an account's notification feed. */
export const notificationCacheKey = (userId) => `${NOTIFICATION_CACHE_PREFIX}${userId || 'anon'}`;

/** Removed by exact key at sign-out. */
export const ACCOUNT_EXACT_KEYS = [
  PENDING_PAYMENT_KEY,
  OFFLINE_QUEUE_KEY,
  MAP_SELLERS_CACHE_KEY,
  LEGACY_MAP_SELLERS_CACHE_KEY,
  // APP-Q097: the signed-in cart is the account's cart, cached here. It is
  // server-derived account data, so it leaves with the session — while the guest
  // cart (mm_cart) stays, because it belongs to whoever holds the phone.
  CART_ACCOUNT_KEY,
];

/** Removed by prefix at sign-out: per-account caches that may predate this sign-in. */
export const ACCOUNT_KEY_PREFIXES = [NOTIFICATION_CACHE_PREFIX, USER_SNAPSHOT_PREFIX];

/**
 * Deliberately kept on the device across sign-out. Exported so callers and
 * checks can assert that none of these is ever swept as an authenticated cache.
 */
export const DEVICE_LOCAL_KEYS = [
  UNSENT_DRAFTS_KEY,
  CART_GUEST_KEY,
  PUSH_TOKEN_KEY,
  // Batch 75 / APP-Q116 — an app lock belongs to whoever holds the phone, not to
  // the account that happened to sign in last, so signing out keeps it. The
  // 'last active' stamp is kept for the same reason and is cleared by the lock's
  // own sign-out path, which starts the clock over for the next sign-in.
  APP_LOCK_ENABLED_KEY,
  APP_LOCK_DELAY_KEY,
  APP_LOCK_LAST_ACTIVE_KEY,
  'mm_appearance_mode',
  'mm_low_data_mode',
  'mm_lang',
  'mm_explore_filters',
];

/**
 * Pick the account keys to remove from a device's stored key list.
 *
 * @param {readonly string[]} allKeys every key currently in device storage
 * @param {{ removeDrafts?: boolean }} [options] `removeDrafts` is the user's
 *        explicit sign-out choice about local retention; it defaults to false,
 *        which is what protects unsent drafts.
 * @returns {string[]} the keys to remove (never a device preference)
 */
export function selectAccountDeviceKeys(allKeys, options = {}) {
  const removeDrafts = options.removeDrafts === true;
  const keys = Array.isArray(allKeys) ? allKeys : [];
  const exact = new Set(ACCOUNT_EXACT_KEYS);

  const selected = keys.filter((key) => {
    if (typeof key !== 'string' || !key) return false;
    if (exact.has(key)) return true;
    return ACCOUNT_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));
  });

  if (removeDrafts && keys.includes(UNSENT_DRAFTS_KEY) && !selected.includes(UNSENT_DRAFTS_KEY)) {
    selected.push(UNSENT_DRAFTS_KEY);
  }
  return selected;
}
