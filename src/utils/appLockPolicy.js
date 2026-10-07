// Batch 75 / APP-Q116 — optional device-authenticated app lock.
//
// "Should device biometrics be allowed to unlock an existing MaurMaket session?"
// Answered: "allow local convenience on trusted device; not server auth or KYC
// proof."
//
// That answer sets the shape of this file. The lock is a convenience the user
// turns on for their own device: it decides whether a *signed-in* app asks for
// the device's own unlock (face, fingerprint, or device passcode) before showing
// the account again. It is never authentication — the server never sees it, it
// grants no access, and it is not identity verification or KYC evidence. The
// session that gets unlocked is the same session that was already there.
//
// Which is why every rule below errs towards NOT locking:
//   - no session      → never lock. There is nothing to protect and a lock with
//                       no way out is a lockout.
//   - no clock        → never lock. Without a recorded moment of last use there
//                       is nothing to measure, and guessing would lock a user
//                       who just signed in.
//   - clock went back → never lock. A lock the user cannot predict is worse than
//                       no lock at all.
// On top of that the app only locks when the device actually offers a device
// authentication method, so the user can always get back in.
//
// This module has no imports, so Node scripts and Metro/TypeScript (`allowJs`)
// can both load the identical rules — one definition of when the app locks.
// The three storage keys it owns are listed in src/utils/signOutPolicy.js as
// device-local preferences: an app lock belongs to whoever holds the phone, not
// to the account that signed in last.

/** Whether the app lock is on for this device. */
export const APP_LOCK_ENABLED_KEY = 'mm_app_lock';

/** How long the app may stay in the background before locking, in ms. */
export const APP_LOCK_DELAY_KEY = 'mm_app_lock_delay';

/** When the app was last in the foreground, so a cold start can decide too. */
export const APP_LOCK_LAST_ACTIVE_KEY = 'mm_app_lock_last_active';

export const APP_LOCK_IMMEDIATE = 0;
export const APP_LOCK_ONE_MINUTE = 60 * 1000;
export const APP_LOCK_FIVE_MINUTES = 5 * 60 * 1000;

/** Offered delay choices, shortest first. */
export const APP_LOCK_DELAYS = [APP_LOCK_IMMEDIATE, APP_LOCK_ONE_MINUTE, APP_LOCK_FIVE_MINUTES];

/**
 * One minute: long enough that switching to the camera or copying a reference
 * number does not re-prompt, short enough to matter if the phone changes hands.
 */
export const DEFAULT_APP_LOCK_DELAY = APP_LOCK_ONE_MINUTE;

/**
 * A stored delay that is not one of the offered choices becomes the default.
 *
 * Only a number or a numeric string counts as a choice: `Number(null)`, `Number([])`
 * and `Number(false)` are all 0, which would quietly mean "lock immediately" for a
 * missing or malformed setting — the most aggressive option, chosen by accident.
 */
export function normalizeAppLockDelay(value) {
  const ms = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim() !== ''
      ? Number(value)
      : NaN;
  return APP_LOCK_DELAYS.includes(ms) ? ms : DEFAULT_APP_LOCK_DELAY;
}

/** Stored settings come back as strings on some platforms, so be explicit. */
export function parseAppLockEnabled(value) {
  return value === true || value === 'true';
}

/** Stored activity timestamps come back as strings; anything else is "unknown". */
export function parseAppLockTimestamp(value) {
  const ms = Number(value);
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

/**
 * The single decision the whole feature hangs on.
 *
 * @param {object} input
 * @param {boolean} input.hasSession   an existing, signed-in session to protect
 * @param {boolean} input.enabled      the user's own on/off choice for this device
 * @param {number}  input.delayMs      the user's chosen grace period
 * @param {number|null} input.lastActiveAt when the app was last in the foreground
 * @param {number}  input.now          current clock reading
 * @returns {boolean} true only when locking is both wanted and decidable
 */
export function shouldLockNow({ hasSession, enabled, delayMs, lastActiveAt, now } = {}) {
  if (hasSession !== true) return false;
  if (enabled !== true) return false;
  if (!Number.isFinite(now)) return false;
  const lastActive = parseAppLockTimestamp(lastActiveAt);
  if (lastActive === null) return false;
  const elapsed = now - lastActive;
  if (elapsed < 0) return false;
  return elapsed >= normalizeAppLockDelay(delayMs);
}
