import { Router } from 'express';
import { pool } from '../config/database.js';
import { authRequired } from '../middleware/auth.js';
import { POLICY_KINDS, SUPPORTED_POLICY_LOCALES, DEFAULT_POLICY_LOCALE, resolvePolicyLocale } from '../utils/policyBaseline.js';
import { policyDecisions, policyAccessState } from '../utils/policyAcceptancePolicy.js';

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════════
// POLICY TRANSPARENCY & CONSENT (app-wide ledger Batch 72, APP-Q356–APP-Q365)
// ═══════════════════════════════════════════════════════════════════════════════
//
// The app surfaces the current Terms and Privacy versions with a plain-language
// "what changed" summary and a link to the full text. Acceptance is recorded
// against the exact version the user reviewed, and only after the server
// confirms it — the client must never mark acceptance optimistically.
//
// Accounts created before acceptance tracking existed are treated as covered by
// the baseline version, so nobody is asked to re-accept the terms they already
// agreed to at signup; the notice appears only for a genuinely newer version.

async function loadPolicyState(userId, locale) {
  const [versions, acceptances, dismissals] = await Promise.all([
    pool.query(
      `SELECT id, kind, version, is_material, effective_at, summaries
       FROM policy_versions
       ORDER BY kind ASC, effective_at ASC, id ASC`
    ),
    pool.query(
      `SELECT kind, version, accepted_at FROM user_policy_acceptances
       WHERE user_id = $1
       ORDER BY accepted_at DESC, id DESC`,
      [userId]
    ),
    pool.query(
      `SELECT pv.kind, pv.version FROM user_policy_notices upn
       JOIN policy_versions pv ON pv.id = upn.policy_version_id
       WHERE upn.user_id = $1 AND upn.dismissed_at IS NOT NULL`,
      [userId]
    ),
  ]);

  const declines = await pool.query(
    'SELECT kind, version FROM user_policy_declines WHERE user_id = $1 ORDER BY declined_at DESC, id DESC',
    [userId]
  );
  // One shared decision model, so the enforcement gate and this screen can never
  // disagree about who still owes an answer (Batch 72, APP-Q359).
  const decisions = policyDecisions({
    versions: versions.rows,
    acceptances: acceptances.rows,
    declines: declines.rows,
  });
  const decisionByKind = new Map(decisions.map((decision) => [decision.kind, decision]));

  const byKind = new Map();
  for (const row of versions.rows) {
    const list = byKind.get(row.kind) || [];
    list.push(row);
    byKind.set(row.kind, list);
  }
  const acceptedLatest = new Map();
  for (const row of acceptances.rows) {
    if (!acceptedLatest.has(row.kind)) acceptedLatest.set(row.kind, row);
  }
  const dismissed = new Set(dismissals.rows.map(r => `${r.kind}:${r.version}`));

  const documents = [];
  for (const [kind, list] of byKind) {
    const current = list[list.length - 1];
    const decision = decisionByKind.get(kind) || null;
    const baseline = decision ? decision.baseline : (list.length > 0 && list[0].id === current.id);
    const accepted = acceptedLatest.get(kind) || null;
    const summaries = current.summaries || {};
    const text = summaries[locale] || summaries[DEFAULT_POLICY_LOCALE] || {};
    const acceptanceCurrent = decision
      ? decision.accepted_current
      : (Boolean(accepted && accepted.version === current.version) || (baseline && !accepted));
    documents.push({
      kind,
      version: current.version,
      is_material: current.is_material,
      effective_at: current.effective_at,
      title: text.title || null,
      summary: text.summary || null,
      url: text.url || null,
      available_locales: Object.keys(summaries),
      locale_available: Boolean(summaries[locale]),
      accepted: accepted ? { version: accepted.version, accepted_at: accepted.accepted_at } : null,
      acceptance_current: acceptanceCurrent,
      baseline,
      declined: decision ? decision.declined : false,
      notice_dismissed: dismissed.has(`${kind}:${current.version}`),
    });
  }
  documents.sort((a, b) => POLICY_KINDS.indexOf(a.kind) - POLICY_KINDS.indexOf(b.kind));

  return {
    locale,
    supported_locales: SUPPORTED_POLICY_LOCALES,
    documents,
    needs_acceptance: documents.filter(d => d.is_material && !d.acceptance_current).map(d => d.kind),
    // The same access limits the enforcement gate applies, stated once so the
    // screen can explain exactly what a decision would pause (APP-Q359).
    access: policyAccessState(decisions),
    history: acceptances.rows.map(r => ({ kind: r.kind, version: r.version, accepted_at: r.accepted_at })),
    declined_history: declines.rows.map(r => ({ kind: r.kind, version: r.version })),
  };
}

// Current documents, the user's acceptance state, and retained notices.
router.get('/api/policies', authRequired, async (req, res) => {
  try {
    const locale = resolvePolicyLocale(req.query.locale);
    res.json(await loadPolicyState(req.user.id, locale));
  } catch (err) {
    console.error('Policies fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Record acceptance of a specific, still-current version. The version is
// re-checked here so a stale client can never accept a superseded document.
router.post('/api/policies/:kind/accept', authRequired, async (req, res) => {
  const kind = String(req.params.kind || '').toLowerCase();
  const version = typeof req.body?.version === 'string' ? req.body.version.trim() : '';
  if (!POLICY_KINDS.includes(kind)) {
    return res.status(400).json({ error: 'Unknown policy', code: 'POLICY_UNKNOWN' });
  }
  if (!version) {
    return res.status(400).json({ error: 'version is required', code: 'POLICY_VERSION_REQUIRED' });
  }

  try {
    const current = await pool.query(
      `SELECT version FROM policy_versions
       WHERE kind = $1
       ORDER BY effective_at DESC, id DESC
       LIMIT 1`,
      [kind]
    );
    if (!current.rows[0]) {
      return res.status(404).json({ error: 'Policy not found', code: 'POLICY_NOT_FOUND' });
    }
    if (current.rows[0].version !== version) {
      return res.status(409).json({
        error: 'This policy has been updated',
        code: 'POLICY_VERSION_STALE',
        current_version: current.rows[0].version,
      });
    }

    const inserted = await pool.query(
      `INSERT INTO user_policy_acceptances (user_id, kind, version)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, kind, version) DO NOTHING
       RETURNING accepted_at`,
      [req.user.id, kind, version]
    );
    let acceptedAt = inserted.rows[0]?.accepted_at;
    if (!acceptedAt) {
      const existing = await pool.query(
        `SELECT accepted_at FROM user_policy_acceptances
         WHERE user_id = $1 AND kind = $2 AND version = $3`,
        [req.user.id, kind, version]
      );
      acceptedAt = existing.rows[0]?.accepted_at || null;
    }

    res.json({ kind, version, accepted_at: acceptedAt });
  } catch (err) {
    console.error('Policy accept error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Dismiss a change notice. The record is kept (never deleted) so the notice and
// its summary stay available in Legal & privacy afterwards (APP-Q363).
router.post('/api/policies/:kind/dismiss', authRequired, async (req, res) => {
  const kind = String(req.params.kind || '').toLowerCase();
  const version = typeof req.body?.version === 'string' ? req.body.version.trim() : '';
  if (!POLICY_KINDS.includes(kind)) {
    return res.status(400).json({ error: 'Unknown policy', code: 'POLICY_UNKNOWN' });
  }
  if (!version) {
    return res.status(400).json({ error: 'version is required', code: 'POLICY_VERSION_REQUIRED' });
  }

  try {
    const target = await pool.query(
      `SELECT id FROM policy_versions WHERE kind = $1 AND version = $2 LIMIT 1`,
      [kind, version]
    );
    if (!target.rows[0]) {
      return res.status(404).json({ error: 'Policy not found', code: 'POLICY_NOT_FOUND' });
    }
    const result = await pool.query(
      `INSERT INTO user_policy_notices (user_id, policy_version_id, dismissed_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id, policy_version_id)
       DO UPDATE SET dismissed_at = COALESCE(user_policy_notices.dismissed_at, EXCLUDED.dismissed_at)
       RETURNING dismissed_at`,
      [req.user.id, target.rows[0].id]
    );
    res.json({ kind, version, dismissed_at: result.rows[0]?.dismissed_at || null });
  } catch (err) {
    console.error('Policy dismiss error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Decline a material update (Batch 72 / APP-Q359). Declining is a decision, not a
// dismissal, so it is recorded against the exact version the user read — the
// version is re-checked here for the same reason acceptance re-checks it, so a
// stale client can never decline a document it did not actually see.
//
// The response states the resulting limits and what is preserved, because the
// ledger requires the limits to be explained rather than merely applied. Nothing
// here closes, freezes, or restricts the account itself: only new commitments
// pause, and accepting the new version clears it immediately.
router.post('/api/policies/:kind/decline', authRequired, async (req, res) => {
  const kind = String(req.params.kind || '').toLowerCase();
  const version = typeof req.body?.version === 'string' ? req.body.version.trim() : '';
  if (!POLICY_KINDS.includes(kind)) {
    return res.status(400).json({ error: 'Unknown policy', code: 'POLICY_UNKNOWN' });
  }
  if (!version) {
    return res.status(400).json({ error: 'version is required', code: 'POLICY_VERSION_REQUIRED' });
  }

  try {
    const current = await pool.query(
      `SELECT version, is_material FROM policy_versions
       WHERE kind = $1
       ORDER BY effective_at DESC, id DESC
       LIMIT 1`,
      [kind]
    );
    if (!current.rows[0]) {
      return res.status(404).json({ error: 'Policy not found', code: 'POLICY_NOT_FOUND' });
    }
    if (current.rows[0].version !== version) {
      return res.status(409).json({
        error: 'This policy has been updated',
        code: 'POLICY_VERSION_STALE',
        current_version: current.rows[0].version,
      });
    }

    await pool.query(
      `INSERT INTO user_policy_declines (user_id, kind, version)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, kind, version) DO NOTHING`,
      [req.user.id, kind, version]
    );

    const state = await loadPolicyState(req.user.id, resolvePolicyLocale(req.query.locale));
    res.json({
      kind,
      version,
      declined: true,
      access: state.access,
      needs_acceptance: state.needs_acceptance,
      preserved_actions: state.access.preserved_actions,
    });
  } catch (err) {
    console.error('Policy decline error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
