#!/usr/bin/env node
/**
 * Sign-out policy check — APP-Q403 device-data sweep.
 *
 * "Clear authenticated caches and credentials; protect unsent drafts and offer a
 * clear choice about local retention."
 *
 * The policy in src/utils/signOutPolicy.js lists which device keys an account
 * owns. Nothing type-checks that list, and a wrong entry is silent: the extra key
 * is simply deleted (drafts lost), or a missing entry is simply left behind (a
 * shared device keeps the previous account's data). This check pins both.
 *
 * Run: node scripts/signout-policy-check.js
 * Exit code 0 = clean, 1 = policy violation
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  selectAccountDeviceKeys,
  notificationCacheKey,
  UNSENT_DRAFTS_KEY,
  PENDING_PAYMENT_KEY,
  OFFLINE_QUEUE_KEY,
  MAP_SELLERS_CACHE_KEY,
  LEGACY_MAP_SELLERS_CACHE_KEY,
  NOTIFICATION_CACHE_PREFIX,
  USER_SNAPSHOT_PREFIX,
  DEVICE_LOCAL_KEYS,
  ACCOUNT_EXACT_KEYS,
  ACCOUNT_KEY_PREFIXES,
} from '../src/utils/signOutPolicy.js';

const read = (rel) => readFileSync(join(process.cwd(), rel), 'utf8');

let failures = 0;
const check = (label, ok, detail = '') => {
  if (ok) return;
  failures++;
  console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
};

// A realistic device: this account, a second account that signed in earlier on
// the same device, public caches, drafts, cart, preferences, unrelated keys.
const ALL_KEYS = [
  PENDING_PAYMENT_KEY,
  OFFLINE_QUEUE_KEY,
  MAP_SELLERS_CACHE_KEY,
  notificationCacheKey('user-a'),
  `${USER_SNAPSHOT_PREFIX}user-a:profile:v1`,
  `${USER_SNAPSHOT_PREFIX}user-a:inbox:v1`,
  `${USER_SNAPSHOT_PREFIX}user-a:messages:conv-1:v1`,
  notificationCacheKey('user-b'),
  `${USER_SNAPSHOT_PREFIX}user-b:profile:v1`,
  LEGACY_MAP_SELLERS_CACHE_KEY,
  UNSENT_DRAFTS_KEY,
  'mm_cart',
  'mm_appearance_mode',
  'mm_low_data_mode',
  'mm_lang',
  'mm_explore_filters',
  'mm_snapshot:public:feed:forYou:v1',
  'mm_snapshot:public:seller:seller-1:v1',
  'cached_notifs_',
  'expo-push-token',
];

console.log('Checking sign-out device-data policy...\n');

// ── 1. What the sweep removes ──
const swept = selectAccountDeviceKeys(ALL_KEYS);
for (const key of ACCOUNT_EXACT_KEYS) {
  check(`account key is swept: ${key}`, swept.includes(key));
}
check('this account\'s notification cache is swept', swept.includes(notificationCacheKey('user-a')));
check('an earlier account\'s notification cache is swept', swept.includes(notificationCacheKey('user-b')));
check('account-scoped snapshots are swept', ALL_KEYS.filter(k => k.startsWith(USER_SNAPSHOT_PREFIX)).every(k => swept.includes(k)));
check('the policy owns the account snapshot prefix', ACCOUNT_KEY_PREFIXES.includes(USER_SNAPSHOT_PREFIX));
check('the policy owns the notification cache prefix', ACCOUNT_KEY_PREFIXES.includes(NOTIFICATION_CACHE_PREFIX));

// ── 2. What it must never touch ──
check('unsent drafts are protected by default', !swept.includes(UNSENT_DRAFTS_KEY));
check('the local cart is kept', !swept.includes('mm_cart'));
check('device preferences are kept', !['mm_appearance_mode', 'mm_low_data_mode', 'mm_lang', 'mm_explore_filters'].some(k => swept.includes(k)));
check('public snapshots are kept', !swept.some(k => k.startsWith('mm_snapshot:public:')));
check('unrelated keys are kept', !swept.includes('expo-push-token'));
check('the default sweep never returns a device-local key', !swept.some(k => DEVICE_LOCAL_KEYS.includes(k)));
check('no duplicate keys are returned', new Set(swept).size === swept.length);

// ── 3. What actually survives on the device ──
const survivors = ALL_KEYS.filter(k => !swept.includes(k));
check(
  'survivors are exactly drafts, local state, preferences and public caches',
  JSON.stringify(survivors) === JSON.stringify([
    UNSENT_DRAFTS_KEY, 'mm_cart', 'mm_appearance_mode', 'mm_low_data_mode', 'mm_lang', 'mm_explore_filters',
    'mm_snapshot:public:feed:forYou:v1', 'mm_snapshot:public:seller:seller-1:v1', 'expo-push-token',
  ]),
  survivors.join(', ')
);

// ── 4. The retention choice (opt-in, strict) ──
const withDrafts = selectAccountDeviceKeys(ALL_KEYS, { removeDrafts: true });
check('the drafts opt-in removes drafts', withDrafts.includes(UNSENT_DRAFTS_KEY));
check('the drafts opt-in removes drafts only once', withDrafts.filter(k => k === UNSENT_DRAFTS_KEY).length === 1);
check('the drafts opt-in still keeps the cart and preferences', !withDrafts.includes('mm_cart') && !withDrafts.includes('mm_lang'));
check('the drafts opt-in is a superset of the default sweep', swept.every(k => withDrafts.includes(k)));
check('only true opts in', !selectAccountDeviceKeys(ALL_KEYS, { removeDrafts: 'yes' }).includes(UNSENT_DRAFTS_KEY));
check('absent option opts out', !selectAccountDeviceKeys(ALL_KEYS, {}).includes(UNSENT_DRAFTS_KEY));

// ── 5. Defensive input handling ──
check('non-array input yields nothing', selectAccountDeviceKeys(null).length === 0 && selectAccountDeviceKeys(undefined).length === 0);
check('junk entries are ignored', selectAccountDeviceKeys([null, undefined, 7, '', {}]).length === 0);
check('a prefix match keeps the legacy "anon" fallback', notificationCacheKey(null) === 'cached_notifs_anon' && notificationCacheKey(undefined) === 'cached_notifs_anon');

// ── 6. Wiring: the sweep must stay connected ──
const store = read('src/store.ts');
const executor = read('src/signOutCleanup.ts');
const offlineCache = read('src/offlineCache.ts');
const offlineQueue = read('src/offlineQueue.ts');
check('store.logout runs the sweep with the user\'s choice', store.includes('clearAccountDeviceData({ removeDrafts: options?.removeDrafts })'));
check('sign-out no longer clears a single account\'s snapshots only', !store.includes('clearUserSnapshots'));
check('the executor selects keys through the policy', executor.includes('selectAccountDeviceKeys(allKeys'));
check('the executor deletes what it selected', executor.includes('await AsyncStorage.multiRemove(removedKeys)'));
check('the executor empties the in-memory queue', executor.includes('await offlineQueue.reset()'));
check('snapshot writes share the swept prefix', offlineCache.includes('const CACHE_PREFIX = SNAPSHOT_CACHE_PREFIX;'));
check('the queue key comes from the policy', offlineQueue.includes('const STORAGE_KEY = OFFLINE_QUEUE_KEY;'));
check('the drafts key comes from the policy', read('src/screens/ChatScreen.tsx').includes('const OUTBOX_KEY = UNSENT_DRAFTS_KEY;'));
check('the notification cache key comes from the policy', read('src/screens/NotificationScreen.tsx').includes('const cacheKey = notificationCacheKey(store.user?.id);'));

if (failures > 0) {
  console.log(`\nFAIL: ${failures} sign-out policy violation(s).`);
  process.exit(1);
}
console.log(`OK: sign-out device-data policy holds (${ALL_KEYS.length} device keys, ${swept.length} swept, drafts protected).`);
