// Batch 75 (sign-out) follow-on — what a push may do on a signed-out device.
//
// Session 409 unregistered this device's push token at sign-out, but a push that
// was already on its way is delivered anyway: the OS shows it, and tapping it
// would route straight into an order or a conversation that belongs to an
// account nobody is signed into. Two rules follow, and they are not the same
// rule:
//
//   1. Nothing about the account is SHOWN on a signed-out device — no foreground
//      banner announcing someone else's order. The event is still in the
//      account's in-app feed, so signing back in loses nothing.
//   2. A tap is HELD, not routed. The destination is remembered for a short
//      window and released if the account signs in on this device before it
//      expires; after that it is dropped. Held in memory only, so it cannot
//      survive a restart and cannot outlive the moment it was for — and a
//      different account signing in gets nothing, because the push was never
//      checked against whoever signs in next.
//
// No imports: pure decision logic, shared by the app and a Node guardrail.

/** How long a held destination stays worth honouring. */
export const PUSH_HOLD_WINDOW_MS = 15 * 60 * 1000;

export const PUSH_ROUTE = 'route';
export const PUSH_HOLD = 'hold';

/**
 * Route now, or hold for the next sign-in?
 *
 * @param {{ hasSession?: boolean }} input
 * @returns {string}
 */
export function decidePushDelivery({ hasSession } = {}) {
  return hasSession === true ? PUSH_ROUTE : PUSH_HOLD;
}

/**
 * Is a held destination still worth releasing? A clock that moved backwards is
 * treated as stale rather than trusted.
 *
 * @param {number} heldAt
 * @param {number} [now]
 * @returns {boolean}
 */
export function heldPushIsFresh(heldAt, now = Date.now()) {
  const at = Number(heldAt);
  if (!Number.isFinite(at)) return false;
  const age = now - at;
  return age >= 0 && age <= PUSH_HOLD_WINDOW_MS;
}

/**
 * The push to route after a sign-in, or null. Null covers three cases that the
 * caller must treat the same way — no session yet, nothing held, and a hold that
 * is too old to mean anything.
 *
 * @param {{ type?: string, data?: any, heldAt?: number } | null} held
 * @param {{ hasSession?: boolean, now?: number }} [options]
 * @returns {{ type: string, data: any } | null}
 */
export function releaseHeldPush(held, { hasSession, now = Date.now() } = {}) {
  if (hasSession !== true) return null;
  if (!held || typeof held !== 'object') return null;
  if (!heldPushIsFresh(held.heldAt, now)) return null;
  return { type: typeof held.type === 'string' ? held.type : '', data: held.data ?? null };
}
