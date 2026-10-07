import { pool } from '../config/database.js';
import { recordSecurityEvent } from './securityEvents.js';

// Batch 73/74/75 — fast account freeze for suspected compromise (APP-Q371).
//
// Settled boundaries (do NOT widen without re-reading the ledger):
//   • A freeze stops NEW listings and PAYOUT requests only.
//   • Sign-in, recovery, messages, existing orders, and Support keep working —
//     APP-Q375/Q393 require safe order communication to survive a freeze.
//   • Unfreezing is a deliberate act (see the password re-confirmation in
//     src/routes/account.js), not a passive expiry.
//   • Restoring reactivates exactly the listings the freeze paused; listings the
//     seller had already paused keep their own reason and stay paused.
export const FROZEN_PAUSE_REASON = 'account_freeze';

export async function getFreezeState(userId, db) {
  const exec = db || pool;
  const { rows } = await exec.query(
    'SELECT frozen_at, freeze_reason, frozen_by FROM users WHERE id = $1',
    [userId]
  );
  const row = rows[0];
  if (!row) return null;
  const paused = await exec.query(
    'SELECT COUNT(*)::int AS count FROM products WHERE seller_id = $1 AND paused_reason = $2',
    [userId, FROZEN_PAUSE_REASON]
  );
  return {
    frozen: Boolean(row.frozen_at),
    frozen_at: row.frozen_at || null,
    reason: row.freeze_reason || null,
    frozen_by: row.frozen_by || null,
    listings_paused: paused.rows[0]?.count || 0,
  };
}

/** Cheap guard used by middleware. */
export async function isAccountFrozen(userId, db) {
  const exec = db || pool;
  const { rows } = await exec.query(
    'SELECT 1 FROM users WHERE id = $1 AND frozen_at IS NOT NULL',
    [userId]
  );
  return rows.length > 0;
}

export async function freezeAccount(userId, { reason = null, by = 'self' } = {}) {
  const client = await pool.connect();
  let newlyFrozen = false;
  try {
    await client.query('BEGIN');
    // Lock the row so two concurrent freezes cannot disagree about which
    // listings they paused.
    const { rows } = await client.query('SELECT frozen_at FROM users WHERE id = $1 FOR UPDATE', [userId]);
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }
    if (!rows[0].frozen_at) {
      newlyFrozen = true;
      await client.query(
        `UPDATE users
            SET frozen_at = CURRENT_TIMESTAMP, freeze_reason = $2, frozen_by = $3,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = $1`,
        [userId, reason, by]
      );
      // Only listings that are live and available right now. A frozen listing
      // cannot be purchased, so its availability cannot change while frozen —
      // which is why unfreeze can restore by reason alone.
      await client.query(
        `UPDATE products
            SET is_available = false, paused_reason = $2, updated_at = CURRENT_TIMESTAMP
          WHERE seller_id = $1 AND listing_status = 'active' AND is_available = true`,
        [userId, FROZEN_PAUSE_REASON]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* connection already gone */ }
    throw err;
  } finally {
    client.release();
  }
  // Security history is recorded outside the transaction so a failure there can
  // never undo a freeze that already committed.
  if (newlyFrozen) {
    await recordSecurityEvent(userId, 'account_frozen', { reason });
  }
  return getFreezeState(userId);
}

export async function unfreezeAccount(userId, { by = 'self' } = {}) {
  const client = await pool.connect();
  let restored = 0;
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT frozen_at FROM users WHERE id = $1 FOR UPDATE', [userId]);
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }
    if (rows[0].frozen_at) {
      await client.query(
        `UPDATE users
            SET frozen_at = NULL, freeze_reason = NULL, frozen_by = NULL,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = $1`,
        [userId]
      );
      const result = await client.query(
        `UPDATE products
            SET is_available = true, paused_reason = NULL, updated_at = CURRENT_TIMESTAMP
          WHERE seller_id = $1 AND paused_reason = $2 AND listing_status = 'active'`,
        [userId, FROZEN_PAUSE_REASON]
      );
      restored = result.rowCount || 0;
    }
    await client.query('COMMIT');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* connection already gone */ }
    throw err;
  } finally {
    client.release();
  }
  await recordSecurityEvent(userId, 'account_unfrozen', { by });
  return { ...(await getFreezeState(userId)), listings_restored: restored };
}
