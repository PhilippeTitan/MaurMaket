import express from 'express';
import { authRequired } from '../middleware/auth.js';
import { getFreezeState, freezeAccount, unfreezeAccount } from '../utils/accountFreeze.js';
import { userHasPassword, verifyUserPassword } from '../utils/passwordVerify.js';
import { createNotification } from '../utils/notifications.js';

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

export default router;
