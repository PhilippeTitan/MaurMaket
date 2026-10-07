import bcrypt from 'bcrypt';
import { verifyPassword as verifyBetterAuthPassword } from 'better-auth/crypto';
import { pool } from '../config/database.js';

// Batch 74/75 — several consequential security actions must be re-confirmed
// with the account password rather than trusting an existing session alone
// (APP-Q385 requires authentication before removing the last second factor,
// APP-Q391 requires re-authentication for data exports, and APP-Q371 requires
// a deliberate restore after a compromise freeze).
//
// MaurMaket has two password stores: legacy bcrypt hashes on users.password_hash
// and Better Auth scrypt hashes on accounts.password. This mirrors the verifier
// configured in src/config/auth.js so both account generations work.

export async function getUserPasswordState(userId) {
  const { rows } = await pool.query(
    `SELECT u.password_hash,
            (SELECT a.password FROM accounts a
              WHERE a.user_id = u.id AND a.provider_id = 'credential'
              LIMIT 1) AS auth_password
       FROM users u WHERE u.id = $1`,
    [userId]
  );
  const row = rows[0];
  if (!row) return { hasPassword: false, hash: null };
  if (row.password_hash) return { hasPassword: true, hash: row.password_hash };
  if (row.auth_password) return { hasPassword: true, hash: row.auth_password };
  return { hasPassword: false, hash: null };
}

export async function userHasPassword(userId) {
  const state = await getUserPasswordState(userId);
  return state.hasPassword;
}

/**
 * Verify a password for the given account. Returns false for any failure
 * (missing password, no stored hash, or mismatch) so callers cannot leak
 * which of those occurred.
 */
export async function verifyUserPassword(userId, password) {
  if (!userId || typeof password !== 'string' || password.length === 0) return false;
  try {
    const state = await getUserPasswordState(userId);
    if (!state.hasPassword || !state.hash) return false;
    if (/^\$2[aby]\$/.test(state.hash)) return await bcrypt.compare(password, state.hash);
    return await verifyBetterAuthPassword({ hash: state.hash, password });
  } catch (err) {
    console.error('[passwordVerify] Verification error:', err.message);
    return false;
  }
}
