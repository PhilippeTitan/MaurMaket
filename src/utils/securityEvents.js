import { pool } from '../config/database.js';

// Batch 73 / APP-Q369 — private security activity history.
//
// Only structured event types and non-secret metadata are stored. Every
// user-facing string is rendered from the app's current locale, so the same
// record reads correctly in EN/FR/HT (this follows the settled decision to
// store structured notification/activity data rather than frozen prose).
//
// Records new sign-ins, account freeze/unfreeze, second-factor removals
// (APP-Q390), and trusted-device revocations (APP-Q379). Password change is
// still owned by Better Auth and remains a follow-up.
export const SECURITY_EVENT_TYPES = new Set([
  'sign_in',
  'account_frozen',
  'account_unfrozen',
  'two_factor_disabled',
  'passkey_removed',
  'trusted_device_revoked',
]);

// Disclosed to the user on the security screen and enforced by the daily
// cleanup job, so the stated retention is truthful rather than aspirational.
export const SECURITY_EVENT_RETENTION_DAYS = 365;

// Longest user-agent string worth keeping; anything longer is truncated so a
// hostile or broken client cannot bloat the row.
const MAX_USER_AGENT_LENGTH = 300;

// User-supplied freeze note cap. This is the owner's own private note, so it is
// stored (bounded) rather than discarded.
const MAX_REASON_LENGTH = 200;

/**
 * Record a security event for an account.
 *
 * Best-effort by design: the security history is not worth breaking sign-in
 * over, so any failure is logged and swallowed. Callers must not depend on a
 * non-null return.
 */
export async function recordSecurityEvent(userId, eventType, metadata = {}, db) {
  if (!userId || !SECURITY_EVENT_TYPES.has(eventType)) return null;
  try {
    const exec = db || pool;
    // Allow-list only known, non-secret metadata keys; anything else in the
    // caller's object is dropped so callers cannot accidentally persist
    // tokens, addresses, or other sensitive payloads here.
    const safeMetadata = {};
    if (typeof metadata?.userAgent === 'string' && metadata.userAgent) {
      safeMetadata.userAgent = metadata.userAgent.slice(0, MAX_USER_AGENT_LENGTH);
    }
    if (typeof metadata?.reason === 'string' && metadata.reason.trim()) {
      safeMetadata.reason = metadata.reason.trim().slice(0, MAX_REASON_LENGTH);
    }
    const { rows } = await exec.query(
      `INSERT INTO security_events (user_id, event_type, metadata)
       VALUES ($1, $2, $3::jsonb)
       RETURNING id, created_at`,
      [userId, eventType, JSON.stringify(safeMetadata)]
    );
    return rows[0] || null;
  } catch (err) {
    console.error('[securityEvents] Failed to record event:', err.message);
    return null;
  }
}

/**
 * Delete security activity older than the disclosed retention window.
 * Returns the number of rows removed.
 */
export async function cleanupOldSecurityEvents() {
  try {
    const result = await pool.query(
      `DELETE FROM security_events WHERE created_at < NOW() - ($1 || ' days')::interval`,
      [SECURITY_EVENT_RETENTION_DAYS]
    );
    return result.rowCount || 0;
  } catch (err) {
    console.error('[securityEvents] Cleanup error:', err.message);
    return 0;
  }
}
