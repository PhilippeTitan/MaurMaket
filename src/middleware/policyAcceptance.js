import { pool } from '../config/database.js';
import {
  policyDecisions,
  policyGateReason,
  policyGateMessage,
  policyAccessState,
} from '../utils/policyAcceptancePolicy.js';

/**
 * Batch 72 (APP-Q359) — a material policy change the user has not accepted, or
 * has explicitly declined, pauses **new commitments only**: creating a listing,
 * placing an order, making an offer.
 *
 * Apply this to exactly those routes. It must never become a global gate: the
 * ledger requires that help, existing obligations, and closure/export paths keep
 * working, and the sign-in, message, order, Support, and export routes are
 * deliberately left without it. `POLICY_PRESERVED_ACTIONS` in
 * `src/utils/policyAcceptancePolicy.js` lists what that promise covers, and the
 * guardrail checks this file cannot reach any of them.
 *
 * @param {'create_listing'|'place_order'|'make_offer'} action
 */
export function policyCurrentRequired(action) {
  return async function policyGate(req, res, next) {
    try {
      const [versions, acceptances, declines] = await Promise.all([
        pool.query(
          `SELECT id, kind, version, is_material FROM policy_versions
           ORDER BY kind ASC, effective_at ASC, id ASC`
        ),
        pool.query('SELECT kind, version FROM user_policy_acceptances WHERE user_id = $1', [req.user.id]),
        pool.query('SELECT kind, version FROM user_policy_declines WHERE user_id = $1', [req.user.id]),
      ]);

      const decisions = policyDecisions({
        versions: versions.rows,
        acceptances: acceptances.rows,
        declines: declines.rows,
      });
      const reason = policyGateReason(decisions);
      if (reason) {
        const access = policyAccessState(decisions);
        return res.status(409).json({
          error: policyGateMessage(reason),
          code: 'POLICY_ACCEPTANCE_REQUIRED',
          action,
          reason,
          needs_decision: access.needs_decision,
          declined: access.declined,
          preserved_actions: access.preserved_actions,
        });
      }
      next();
    } catch (err) {
      console.error('policyCurrentRequired error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  };
}
