import express from 'express';
import { authRequired } from '../middleware/auth.js';
import { pool } from '../config/database.js';
import { SECURITY_EVENT_TYPES, SECURITY_EVENT_RETENTION_DAYS, recordSecurityEvent } from '../utils/securityEvents.js';
import { createNotification } from '../utils/notifications.js';
import {
  TRUSTED_DEVICE_DAYS,
  TRUST_DEVICE_IDENTIFIER_PREFIX,
  isTrustedDeviceIdentifier,
  trustedDeviceDaysRemaining,
} from '../utils/trustedDevices.js';

const router = express.Router();

// ═══════════════════════════════════════════════════════════════════════════════
// PRIVATE SECURITY ACTIVITY HISTORY (Batch 73, APP-Q369)
//
// Read-only view of the caller's own security events. Events are stored as
// structured type codes so the app renders them in the user's current
// language. Never expose another account's activity, and never include
// credentials, tokens, or IP addresses.
// ═══════════════════════════════════════════════════════════════════════════════

const MAX_EVENTS = 50;

router.get('/api/security/events', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, event_type, metadata, created_at
         FROM security_events
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2`,
      [req.user.id, MAX_EVENTS]
    );

    const events = result.rows
      .filter((row) => SECURITY_EVENT_TYPES.has(row.event_type))
      .map((row) => ({
        id: row.id,
        event_type: row.event_type,
        // User-agent only; it is the same device information already returned
        // for the caller's own session list. No IP address is stored or sent.
        user_agent: row.metadata?.userAgent || null,
        // Only ever the account owner's own freeze note.
        reason: row.metadata?.reason || null,
        created_at: row.created_at,
      }));

    res.json({
      events,
      retention_days: SECURITY_EVENT_RETENTION_DAYS,
      max_events: MAX_EVENTS,
    });
  } catch (err) {
    console.error('Security events error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// TRUSTED DEVICES (Batch 74, APP-Q379)
//
// "Remember this device" skips the second-factor code for a bounded, stated
// period. These endpoints exist so that duration is visible and so revocation is
// immediate and server-side: deleting the trust record makes the stored device
// cookie fail validation at the very next sign-in, with no sign-out needed.
//
// Revocation deliberately does NOT demand a password, unlike the other
// consequential security changes in this area. Removing a trusted device only
// makes the account stricter — it forces a code again — so requiring a credential
// would slow down exactly the user reacting to a device they do not recognise.
//
// A trusted device is never identity verification, KYC evidence, or payment /
// payout authorization. The only decision it is ever consulted for is whether to
// ask for a second factor at sign-in (see src/config/auth.js). Nothing in the
// verification or payout routes reads it.
//
// The record identifier is returned to its owner so they can revoke a single
// device. That is safe: the cookie is `HMAC(secret, userId!identifier)!identifier`,
// so knowing the identifier without the server secret forges nothing.
// ═══════════════════════════════════════════════════════════════════════════════

const MAX_TRUSTED_DEVICES = 20;

function alertTrustedDeviceRevoked(userId, count) {
  const body = count > 1
    ? `Trusted devices removed (${count}). Each of them must verify a second factor the next time it signs in. If you did not do this, review your trusted devices and change your password.`
    : 'This device must verify a second factor the next time it signs in. If you did not do this, review your trusted devices and change your password.';
  createNotification(userId, 'trusted_device_revoked', count > 1 ? 'Trusted devices removed' : 'Trusted device removed', body, {
    screen: 'SecuritySettings',
  }).catch(() => {});
}

router.get('/api/security/trusted-devices', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT identifier, created_at, expires_at
         FROM verifications
        WHERE value = $1
          AND identifier LIKE $2
          AND expires_at > NOW()
        ORDER BY created_at DESC
        LIMIT $3`,
      [req.user.id, `${TRUST_DEVICE_IDENTIFIER_PREFIX}%`, MAX_TRUSTED_DEVICES]
    );

    const devices = result.rows
      // Re-checked in JS as well as in SQL: a row that is not a trust record is
      // never shown, so nothing else in `verifications` can leak into this view.
      .filter((row) => isTrustedDeviceIdentifier(row.identifier))
      .map((row) => ({
        id: row.identifier,
        trusted_at: row.created_at,
        expires_at: row.expires_at,
        days_remaining: trustedDeviceDaysRemaining(row.expires_at),
      }));

    res.json({ devices, duration_days: TRUSTED_DEVICE_DAYS });
  } catch (err) {
    console.error('Trusted devices list error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/api/security/trusted-devices/:identifier', authRequired, async (req, res) => {
  try {
    const identifier = String(req.params.identifier || '');
    if (!isTrustedDeviceIdentifier(identifier)) {
      return res.status(400).json({ error: 'Not a trusted-device record.' });
    }

    // Ownership is enforced in SQL, and the prefix guard above guarantees this
    // can only ever delete a trust record — never a password reset, OTP, or
    // pending sign-in row that shares the table.
    const result = await pool.query(
      `DELETE FROM verifications
        WHERE identifier = $1 AND value = $2
        RETURNING identifier`,
      [identifier, req.user.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'That trusted device was not found.' });
    }

    await recordSecurityEvent(req.user.id, 'trusted_device_revoked', {
      userAgent: req.headers['user-agent'],
    });
    alertTrustedDeviceRevoked(req.user.id, 1);

    res.json({ revoked: 1 });
  } catch (err) {
    console.error('Trusted device revoke error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/api/security/trusted-devices', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM verifications
        WHERE value = $1 AND identifier LIKE $2
        RETURNING identifier`,
      [req.user.id, `${TRUST_DEVICE_IDENTIFIER_PREFIX}%`]
    );
    const revoked = result.rows
      .map((row) => row.identifier)
      .filter((identifier) => isTrustedDeviceIdentifier(identifier));

    // One history entry per removed device keeps the audit accurate without
    // widening the security-event schema with a count field.
    for (const _identifier of revoked) {
      await recordSecurityEvent(req.user.id, 'trusted_device_revoked', {
        userAgent: req.headers['user-agent'],
      });
    }
    if (revoked.length > 0) alertTrustedDeviceRevoked(req.user.id, revoked.length);

    res.json({ revoked: revoked.length });
  } catch (err) {
    console.error('Trusted devices revoke-all error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PRIVATE DEVICE LABELS (Batch 75, APP-Q395)
//
// Let the owner name their own signed-in devices so an unfamiliar row is easier
// to recognise. Three rules from the settled decision shape everything here:
//   1. Private — a label is only ever returned to the account that wrote it.
//   2. Distinct from system facts — the device string, dates, and session state
//      come from the session itself and are always shown alongside the label, so
//      a label can never stand in for them.
//   3. Never trust — no authentication, verification, KYC, payout, or
//      trusted-device decision reads a label. It is display-only. That is also
//      why saving one records no security event and sends no alert: it changes
//      nothing about the account's security.
//
// Labels are keyed to the session with ON DELETE CASCADE, so revoking a device
// takes its label with it and a later session can never inherit an old name.
// ═══════════════════════════════════════════════════════════════════════════════

const DEVICE_LABEL_MAX = 40;

/**
 * Reduce arbitrary input to a plain label: strip control characters, collapse
 * whitespace runs, trim, and cap the length. Returns null for a non-string so
 * the caller can distinguish "no label supplied" from "clear the label".
 */
export function normalizeDeviceLabel(raw) {
  if (typeof raw !== 'string') return null;
  const collapsed = raw
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!collapsed) return '';
  return collapsed.slice(0, DEVICE_LABEL_MAX);
}

router.get('/api/security/device-labels', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT session_id, label FROM device_labels WHERE user_id = $1',
      [req.user.id]
    );
    res.json({
      labels: result.rows.map((row) => ({ session_id: row.session_id, label: row.label })),
      max_length: DEVICE_LABEL_MAX,
    });
  } catch (err) {
    console.error('Device labels list error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/api/security/device-labels/:sessionId', authRequired, async (req, res) => {
  try {
    const sessionId = String(req.params.sessionId || '').trim();
    if (!sessionId) return res.status(400).json({ error: 'A session id is required.' });

    // Ownership first: a label may only ever be attached to the caller's own
    // session, so one account can never name or probe another's device.
    const { rows } = await pool.query(
      'SELECT id FROM sessions WHERE id = $1 AND user_id = $2',
      [sessionId, req.user.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'That signed-in device was not found on your account.' });
    }

    const label = normalizeDeviceLabel(req.body?.label);
    if (label === null) return res.status(400).json({ error: 'A label is required.' });

    if (label === '') {
      await pool.query(
        'DELETE FROM device_labels WHERE user_id = $1 AND session_id = $2',
        [req.user.id, sessionId]
      );
      return res.json({ session_id: sessionId, label: null, cleared: true });
    }

    const saved = await pool.query(
      `INSERT INTO device_labels (user_id, session_id, label)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, session_id)
       DO UPDATE SET label = EXCLUDED.label, updated_at = CURRENT_TIMESTAMP
       RETURNING session_id, label`,
      [req.user.id, sessionId, label]
    );
    res.json({ session_id: saved.rows[0].session_id, label: saved.rows[0].label, cleared: false });
  } catch (err) {
    console.error('Device label save error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
