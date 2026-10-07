import express from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { pool } from '../config/database.js';
import { getAuth } from '../config/auth.js';
import { authRequired } from '../middleware/auth.js';
import { getFreezeState, freezeAccount, unfreezeAccount } from '../utils/accountFreeze.js';
import { userHasPassword, verifyUserPassword } from '../utils/passwordVerify.js';
import { createNotification } from '../utils/notifications.js';
import { recordSecurityEvent } from '../utils/securityEvents.js';

const router = express.Router();

// ═══════════════════════════════════════════════════════════════════════════════
// ACCOUNT FREEZE (Batch 73/74/75, APP-Q371)
//
// A fast, reversible safety switch for a suspected account compromise. Its whole
// value is that it stops the two actions an attacker most wants — publishing new
// listings and pulling money out — while leaving the owner every path back in.
// ═══════════════════════════════════════════════════════════════════════════════

const MAX_REASON_LENGTH = 200;

router.get('/api/account/freeze', authRequired, async (req, res) => {
  try {
    const state = await getFreezeState(req.user.id);
    if (!state) return res.status(404).json({ error: 'User not found' });
    // Tells the client whether restoring will need a password, so the UI can
    // ask for the right thing instead of failing after the fact.
    const hasPassword = await userHasPassword(req.user.id);
    res.json({ ...state, has_password: hasPassword });
  } catch (err) {
    console.error('Freeze status error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/api/account/freeze', authRequired, async (req, res) => {
  try {
    let reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (reason.length > MAX_REASON_LENGTH) {
      return res.status(400).json({ error: `Reason must be ${MAX_REASON_LENGTH} characters or fewer` });
    }
    const state = await freezeAccount(req.user.id, { reason: reason || null, by: 'self' });
    if (!state) return res.status(404).json({ error: 'User not found' });
    if (state.frozen) {
      createNotification(
        req.user.id,
        'account_frozen',
        'Account frozen',
        'New listings and payout requests are paused. Sign-in, messages, orders, and support still work. Restore your account any time from Settings.',
        { screen: 'SecuritySettings' }
      ).catch(() => {});
    }
    res.json(state);
  } catch (err) {
    console.error('Freeze error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Restoring is deliberately a credential-bearing action: the threat model is a
// live session in someone else's hands, so an existing session alone must not be
// able to undo the freeze (APP-Q371 "deliberately restore activity").
router.post('/api/account/unfreeze', authRequired, async (req, res) => {
  try {
    const state = await getFreezeState(req.user.id);
    if (!state) return res.status(404).json({ error: 'User not found' });
    if (!state.frozen) return res.json({ ...state, listings_restored: 0 });

    const hasPassword = await userHasPassword(req.user.id);
    if (hasPassword) {
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      if (!password) {
        return res.status(400).json({
          error: 'Enter your password to restore your account.',
          code: 'PASSWORD_REQUIRED',
        });
      }
      const ok = await verifyUserPassword(req.user.id, password);
      if (!ok) {
        return res.status(401).json({
          error: 'That password is not correct.',
          code: 'INVALID_PASSWORD',
        });
      }
    }
    // Accounts with no password (Google-only sign-up) have no second factor to
    // demand here; the action is still explicit, confirmed, and recorded below.

    const restored = await unfreezeAccount(req.user.id, { by: 'self' });
    if (!restored) return res.status(404).json({ error: 'User not found' });
    createNotification(
      req.user.id,
      'account_unfrozen',
      'Account restored',
      'Your account is active again. Listings that the freeze paused are live. Review your sign-in activity and change your password if you have not already.',
      { screen: 'SecuritySettings' }
    ).catch(() => {});
    res.json(restored);
  } catch (err) {
    console.error('Unfreeze error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECOND-FACTOR REMOVAL (APP-Q390)
//
// Removing a sign-in factor is how an attacker with a stolen session locks the
// owner out or strips the protection they added. So this is deliberately not a
// one-tap action. Every removal path enforces three things:
//   1. Fresh authentication — the account password is re-confirmed. The session
//      alone is never enough.
//   2. A verified recovery path survives — the account must still have a
//      password, another passkey, or a linked social sign-in afterwards, so a
//      mistaken or hostile removal cannot strand the owner.
//   3. The change is recorded in the private security history and the owner is
//      alerted through the always-immediate security notification path.
// ═══════════════════════════════════════════════════════════════════════════════

const SECOND_FACTOR_REMOVED_ROUTE = 'SecuritySettings';

/**
 * Does the account still have a verified way back in after this removal?
 *
 * A password, another passkey, or a linked social sign-in each count. Email is
 * deliberately excluded: it is a recovery channel, not a sign-in factor, and
 * an attacker holding the mailbox would otherwise satisfy the check.
 */
async function hasVerifiedRecoveryPath(userId, excludePasskeyId = null) {
  if (await userHasPassword(userId)) return true;
  const { rows } = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM passkey
         WHERE user_id = $1 AND ($2::text IS NULL OR id <> $2::text)) AS other_passkeys,
       (SELECT COUNT(*)::int FROM accounts
         WHERE user_id = $1 AND provider_id <> 'credential') AS social_accounts`,
    [userId, excludePasskeyId]
  );
  const row = rows[0] || {};
  return Number(row.other_passkeys) > 0 || Number(row.social_accounts) > 0;
}

/**
 * Re-confirm the account password for a second-factor change.
 *
 * Writes the 400/401 responses itself and returns false when the caller must
 * stop. Passwordless (Google-only) accounts have no password to re-confirm;
 * they are allowed through here because the recovery-path guard still refuses
 * any removal that would leave them with no verified way back in.
 */
async function confirmSecondFactorPassword(req, res) {
  const hasPassword = await userHasPassword(req.user.id);
  if (!hasPassword) return { ok: true, password: undefined, passwordless: true };
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!password) {
    res.status(400).json({
      error: 'Enter your password to change your second sign-in factor.',
      code: 'PASSWORD_REQUIRED',
    });
    return { ok: false };
  }
  const valid = await verifyUserPassword(req.user.id, password);
  if (!valid) {
    res.status(401).json({ error: 'That password is not correct.', code: 'INVALID_PASSWORD' });
    return { ok: false };
  }
  return { ok: true, password, passwordless: false };
}

function alertSecondFactorRemoved(userId, title, body) {
  createNotification(userId, 'second_factor_removed', title, body, {
    screen: SECOND_FACTOR_REMOVED_ROUTE,
  }).catch(() => {});
}

// Turn off the authenticator app. Better Auth already requires the password,
// but routing through here adds the recovery-path guard, the private audit
// event, the owner alert, and the session rotation hand-off (Better Auth
// creates a new session and deletes the old one when 2FA is turned off, so the
// new bearer token must reach the client).
router.post('/api/account/second-factor/authenticator/disable', authRequired, async (req, res) => {
  try {
    const fresh = await confirmSecondFactorPassword(req, res);
    if (!fresh.ok) return;
    if (fresh.passwordless) {
      // An authenticator cannot be enabled without a password, so this state
      // should be unreachable; refuse rather than silently skip re-auth.
      return res.status(400).json({
        error: 'Set a password before changing your two-step verification settings.',
        code: 'PASSWORD_REQUIRED',
      });
    }

    // The password itself is the surviving recovery path; guard anyway so the
    // invariant is enforced in one place rather than assumed.
    if (!(await hasVerifiedRecoveryPath(req.user.id))) {
      return res.status(400).json({
        error: 'Keep at least one verified way back into your account before removing a sign-in factor.',
        code: 'LAST_RECOVERY_PATH',
      });
    }

    let rotatedToken = null;
    try {
      const result = await getAuth().api.disableTwoFactor({
        headers: fromNodeHeaders(req.headers),
        body: { password: fresh.password },
        returnHeaders: true,
      });
      rotatedToken = result?.headers?.get?.('set-auth-token') || null;
    } catch (error) {
      const message = error?.body?.message || error?.message || 'Could not turn off two-step verification.';
      return res.status(400).json({ error: message });
    }

    if (rotatedToken) res.setHeader('set-auth-token', rotatedToken);

    await recordSecurityEvent(req.user.id, 'two_factor_disabled', {
      userAgent: req.headers['user-agent'],
    });
    alertSecondFactorRemoved(
      req.user.id,
      'Two-step verification turned off',
      'The authenticator app can no longer approve sign-ins on your account. If this was not you, turn it back on and change your password now.'
    );

    res.json({ status: true });
  } catch (err) {
    console.error('Disable authenticator error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Remove a passkey. Better Auth's own endpoint accepts only the passkey id and
// trusts the session, so the password re-confirmation and recovery-path guard
// live here instead.
router.post('/api/account/second-factor/passkey/:id/remove', authRequired, async (req, res) => {
  try {
    const passkeyId = String(req.params.id || '').trim();
    if (!passkeyId) return res.status(400).json({ error: 'A passkey id is required.' });

    const { rows } = await pool.query(
      'SELECT id, name FROM passkey WHERE id = $1 AND user_id = $2',
      [passkeyId, req.user.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'That passkey was not found on your account.' });
    }

    const fresh = await confirmSecondFactorPassword(req, res);
    if (!fresh.ok) return;

    if (!(await hasVerifiedRecoveryPath(req.user.id, passkeyId))) {
      return res.status(400).json({
        error: 'This is your only verified way to sign in. Add another sign-in method before removing it.',
        code: 'LAST_RECOVERY_PATH',
      });
    }

    try {
      await getAuth().api.deletePasskey({
        headers: fromNodeHeaders(req.headers),
        body: { id: passkeyId },
      });
    } catch (error) {
      const message = error?.body?.message || error?.message || 'Could not remove that passkey.';
      return res.status(400).json({ error: message });
    }

    await recordSecurityEvent(req.user.id, 'passkey_removed', {
      userAgent: req.headers['user-agent'],
    });
    alertSecondFactorRemoved(
      req.user.id,
      'Passkey removed',
      'A passkey can no longer sign in to your account. If this was not you, review your sign-in activity and change your password now.'
    );

    res.json({ status: true });
  } catch (err) {
    console.error('Remove passkey error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
