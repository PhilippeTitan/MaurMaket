import express from 'express';
import { authRequired } from '../middleware/auth.js';
import { pool } from '../config/database.js';
import { SECURITY_EVENT_TYPES, SECURITY_EVENT_RETENTION_DAYS } from '../utils/securityEvents.js';

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

export default router;
