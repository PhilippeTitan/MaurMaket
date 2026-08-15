import AsyncStorage from '@react-native-async-storage/async-storage';
import { network } from './network';

type CacheRecord<T> = {
  value: T;
  updatedAt: number;
};

export type SnapshotResult<T> = {
  value: T;
  isStale: boolean;
};

const CACHE_PREFIX = 'mm_snapshot:';

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

export async function clearUserSnapshots(userId: string | null | undefined): Promise<void> {
  if (!userId) return;
  try {
    const keys = await AsyncStorage.getAllKeys();
    const userPrefix = `${CACHE_PREFIX}user:${userId}:`;
    const scopedKeys = keys.filter(key => key.startsWith(userPrefix));
    if (scopedKeys.length) await AsyncStorage.multiRemove(scopedKeys);
  } catch {
    // Best effort only; the next signed-in user receives a distinct cache namespace regardless.
  }
}

export const cacheKeys = {
  feed: (tab: 'forYou' | 'new', userId?: string | null) =>
    tab === 'forYou' && userId ? `user:${userId}:feed:${tab}:v1` : `public:feed:${tab}:v1`,
  explore: (params: Record<string, string>, userId?: string | null) =>
    `${params.personalized && userId ? `user:${userId}` : 'public'}:explore:${JSON.stringify(params)}:v1`,
  profile: (userId: string) => `user:${userId}:profile:v1`,
  inbox: (userId: string) => `user:${userId}:inbox:v1`,
};
