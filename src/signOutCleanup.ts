import AsyncStorage from '@react-native-async-storage/async-storage';
import { offlineQueue } from './offlineQueue';
import { selectAccountDeviceKeys, UNSENT_DRAFTS_KEY } from './utils/signOutPolicy';

/**
 * Batch 75 / APP-Q403 — remove this account's device data at sign-out.
 *
 * The key list and the rules live in src/utils/signOutPolicy.js so the device
 * has one definition of "authenticated cache". This module only performs the
 * removal, and it is deliberately best-effort: a storage failure must never
 * block or undo a sign-out, and the credentials (`ba_session_token`,
 * `mm_user`) are already gone by the time it runs.
 *
 * Deliberately NOT touched here: unsent drafts unless `removeDrafts` is set,
 * the local cart, and device-level preferences.
 */
export type SignOutCleanupResult = {
  /** Every account key removed from storage (snapshots, caches, pending syncs). */
  removedKeys: string[];
  /** True when the user chose to delete unsent drafts as well. */
  draftsRemoved: boolean;
  /** Queued authenticated actions dropped with the sign-out. */
  queuedActionsDropped: number;
};

export async function clearAccountDeviceData(
  options: { removeDrafts?: boolean } = {}
): Promise<SignOutCleanupResult> {
  const removeDrafts = options.removeDrafts === true;

  // The queue lives in memory as well as storage; clearing only storage would
  // let the next flush post the signed-out account's actions and write them back.
  const queuedActionsDropped = offlineQueue.count;
  await offlineQueue.reset();

  let removedKeys: string[] = [];
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    removedKeys = selectAccountDeviceKeys(allKeys, { removeDrafts });
    if (removedKeys.length) await AsyncStorage.multiRemove(removedKeys);
  } catch {
    removedKeys = [];
  }

  return {
    removedKeys,
    draftsRemoved: removeDrafts && removedKeys.includes(UNSENT_DRAFTS_KEY),
    queuedActionsDropped,
  };
}
