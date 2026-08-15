import AsyncStorage from '@react-native-async-storage/async-storage';
import { network } from './network';

export type QueuedAction =
  | { id: string; type: 'wishlist_toggle'; productId: string; timestamp: number }
  | { id: string; type: 'follow_toggle'; sellerId: string; timestamp: number }
  | { id: string; type: 'feed_event'; productId: string; eventType: string; dwellTimeMs?: number; timestamp: number }
  | { id: string; type: 'notification_read'; notificationId: string; timestamp: number };

export type QueuedActionInput =
  | { type: 'wishlist_toggle'; productId: string }
  | { type: 'follow_toggle'; sellerId: string }
  | { type: 'feed_event'; productId: string; eventType: string; dwellTimeMs?: number }
  | { type: 'notification_read'; notificationId: string };

const STORAGE_KEY = 'mm_offline_queue';
const MAX_QUEUE_SIZE = 200;

let _queue: QueuedAction[] = [];
let _isFlushing = false;
let _initialized = false;

async function loadQueue(): Promise<QueuedAction[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as QueuedAction[];
  } catch {
    return [];
  }
}

async function persistQueue(): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(_queue));
  } catch {
    // Silent fail on storage write
  }
}

export const offlineQueue = {
  async init(): Promise<void> {
    if (_initialized) return;
    _initialized = true;
    _queue = await loadQueue();

    // Auto flush whenever connectivity is restored
    network.onChange((online) => {
      if (online && _queue.length > 0) {
        offlineQueue.flush();
      }
    });

    if (network.isOnline && _queue.length > 0) {
      offlineQueue.flush();
    }
  },

  async enqueue(action: QueuedActionInput): Promise<void> {
    const item: QueuedAction = {
      ...action,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
    } as QueuedAction;

    _queue.push(item);
    if (_queue.length > MAX_QUEUE_SIZE) {
      _queue = _queue.slice(_queue.length - MAX_QUEUE_SIZE);
    }
    await persistQueue();

    if (network.isOnline) {
      offlineQueue.flush();
    }
  },

  get queue(): QueuedAction[] {
    return [..._queue];
  },

  get count(): number {
    return _queue.length;
  },

  async flush(): Promise<{ synced: number; failed: number }> {
    if (_isFlushing || _queue.length === 0 || network.isOffline) {
      return { synced: 0, failed: 0 };
    }

    _isFlushing = true;
    let synced = 0;
    let failed = 0;

    try {
      const { toggleWishlist, toggleFollowing, trackFeedEvent, markNotificationRead } = await import('./api');

      while (_queue.length > 0 && network.isOnline) {
        const item = _queue[0];
        try {
          if (item.type === 'wishlist_toggle') {
            await toggleWishlist(item.productId, true);
          } else if (item.type === 'follow_toggle') {
            await toggleFollowing(item.sellerId, true);
          } else if (item.type === 'feed_event') {
            await trackFeedEvent(item.productId, item.eventType as any, item.dwellTimeMs, true);
          } else if (item.type === 'notification_read') {
            await markNotificationRead(item.notificationId);
          }
          _queue.shift();
          synced++;
        } catch (err: any) {
          // If network went away mid-flush, break and retry later
          if (network.isOffline || err?.name === 'OfflineError') {
            break;
          }
          // If server error or invalid data, drop item to prevent stuck queue
          _queue.shift();
          failed++;
        }
      }
    } finally {
      await persistQueue();
      _isFlushing = false;
    }

    return { synced, failed };
  },
};
