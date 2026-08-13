import { Platform } from 'react-native';

type CacheRecord<T> = {
  value: T;
  updatedAt: number;
};

let databasePromise: Promise<any> | null = null;

async function getDatabase() {
  if (Platform.OS === 'web') return null;
  if (!databasePromise) {
    databasePromise = (async () => {
      const SQLite = require('expo-sqlite');
      const database = await SQLite.openDatabaseAsync('maurmaket-cache.db');
      await database.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS cache_entries (
          cache_key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);
      return database;
    })();
  }
  return databasePromise;
}

/** Small, versioned screen snapshots. Never store authentication tokens here. */
export async function readSnapshot<T>(key: string): Promise<CacheRecord<T> | null> {
  try {
    const database = await getDatabase();
    if (!database) return null;
    const row = await database.getFirstAsync(
      'SELECT value, updated_at FROM cache_entries WHERE cache_key = ?',
      [key],
    ) as { value: string; updated_at: number } | null;
    if (!row) return null;
    return { value: JSON.parse(row.value) as T, updatedAt: row.updated_at };
  } catch {
    return null;
  }
}

export async function writeSnapshot<T>(key: string, value: T): Promise<void> {
  try {
    const database = await getDatabase();
    if (!database) return;
    await database.runAsync(
      `INSERT INTO cache_entries (cache_key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, JSON.stringify(value), Date.now()],
    );
  } catch {
    // Caching is an enhancement. A full disk or malformed legacy cache must not block the app.
  }
}

export async function clearUserSnapshots(userId: string | null | undefined): Promise<void> {
  if (!userId) return;
  try {
    const database = await getDatabase();
    if (!database) return;
    await database.runAsync('DELETE FROM cache_entries WHERE cache_key LIKE ?', [`user:${userId}:%`]);
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
