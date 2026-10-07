import AsyncStorage from '@react-native-async-storage/async-storage';
import { network } from './network';
// The prefix is shared with the sign-out sweep (APP-Q403) so the writer and the
// sweep use one literal: a snapshot written here can always be found there.
import { SNAPSHOT_CACHE_PREFIX } from './utils/signOutPolicy';

type CacheRecord<T> = {
  value: T;
  updatedAt: number;
};

export type SnapshotResult<T> = {
  value: T;
  isStale: boolean;
};

const CACHE_PREFIX = SNAPSHOT_CACHE_PREFIX;

const DEFAULT_TTL: Record<string, number> = {
  feed: 60 * 60 * 1000,       // 1 hour
  explore: 30 * 60 * 1000,    // 30 minutes
  profile: 24 * 60 * 60 * 1000, // 24 hours
  inbox: 5 * 60 * 1000,       // 5 minutes
  categories: 24 * 60 * 60 * 1000, // 24 hours
};

function getTtlForKey(key: string): number {
  for (const [prefix, ttl] of Object.entries(DEFAULT_TTL)) {
    if (key.includes(prefix)) return ttl;
  }
  return 60 * 60 * 1000; // default 1 hour
}

/** Small, versioned screen snapshots. Never store authentication tokens here. */
export async function readSnapshot<T>(key: string): Promise<SnapshotResult<T> | null> {
  try {
    const raw = await AsyncStorage.getItem(`${CACHE_PREFIX}${key}`);
    if (!raw) return null;
    const record = JSON.parse(raw) as CacheRecord<T>;
    const age = Date.now() - record.updatedAt;
    const ttl = getTtlForKey(key);
    const isStale = age > ttl;

    if (isStale && network.isOnline) {
      return null; // Online + stale → fetch fresh data
    }

    return { value: record.value, isStale };
  } catch {
    return null;
  }
}

export async function writeSnapshot<T>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify({ value, updatedAt: Date.now() }));
  } catch {
    // Caching is an enhancement. A full disk or malformed legacy cache must not block the app.
  }
}

export const cacheKeys = {
  feed: (tab: 'forYou' | 'new', userId?: string | null) =>
    tab === 'forYou' && userId ? `user:${userId}:feed:${tab}:v1` : `public:feed:${tab}:v1`,
  explore: (params: Record<string, string>, userId?: string | null) =>
    `${params.personalized && userId ? `user:${userId}` : 'public'}:explore:${JSON.stringify(params)}:v1`,
  profile: (userId: string) => `user:${userId}:profile:v1`,
  /** Public seller profile, cached on the visitor's device for offline viewing. */
  seller: (sellerId: string) => `public:seller:${sellerId}:v1`,
  inbox: (userId: string) => `user:${userId}:inbox:v1`,
  messages: (userId: string, conversationId: string) => `user:${userId}:messages:${conversationId}:v1`,
};

/** Keep at most `limit` per-conversation message snapshots, evicting the oldest. */
export async function pruneMessageSnapshots(userId: string, limit = 15): Promise<void> {
  if (!userId) return;
  try {
    const prefix = `${CACHE_PREFIX}user:${userId}:messages:`;
    const keys = await AsyncStorage.getAllKeys();
    const mine = keys.filter(k => k.startsWith(prefix));
    if (mine.length <= limit) return;
    const pairs = await AsyncStorage.multiGet(mine);
    const ranked = pairs
      .map(([key, raw]) => {
        let updatedAt = 0;
        try { updatedAt = raw ? (JSON.parse(raw) as CacheRecord<unknown>).updatedAt || 0 : 0; } catch { /* unparseable → evict first */ }
        return { key, updatedAt };
      })
      .sort((a, b) => a.updatedAt - b.updatedAt);
    const excess = ranked.slice(0, ranked.length - limit).map(r => r.key);
    if (excess.length) await AsyncStorage.multiRemove(excess);
  } catch {
    // Best effort only; bounded storage is an optimization, not a correctness requirement.
  }
}
