import { pool } from '../config/database.js';

// Batch 75 (account security) — "Log staff access to sensitive KYC evidence and
// show a safe case-linked history."
//
// Two halves, and the split between them is the point:
//
//   1. Writing the log — append-only, one row per access, written by whichever
//      staff tool opens a subject's identity evidence. Nothing in the app reads
//      evidence today, so nothing calls this yet: this module is the cable the
//      future Support website connects to, not a claim that a case was opened.
//   2. Showing the log — the subject sees that their documents were opened,
//      when, for what purpose, and a neutral staff label. Never a staff name,
//      email, or user id: the account holder needs to know *that* it happened
//      and *why*, not who to blame or hunt down.
//
// An access without a recognised purpose is refused rather than stored under a
// vague default; an unexplained access record would be worse than none.

/** Trim, collapse whitespace, strip control characters, and cap the length. */
const trimTo = (value, max) => {
  if (typeof value !== 'string') return null;
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f]/g, ' ') // control characters can never ride along
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned ? cleaned.slice(0, max) : null;
};

// Keep in sync with the CHECK constraints on kyc_evidence_access (server.js
// migration step 90) — the writer and the table enforce the same rule so a
// future staff tool cannot store an unexplained access either.
export const KYC_ACCESS_PURPOSES = [
  'case_review',
  'dispute_review',
  'fraud_review',
  'compliance_audit',
  'rights_claim',
];

export const KYC_EVIDENCE_SCOPES = ['attempt', 'document', 'selfie', 'metadata'];

/** Shown to the subject in place of any staff identity. */
export const DEFAULT_ACTOR_LABEL = 'MaurMaket Support';
export const KYC_ACCESS_MAX_LABEL = 60;
export const KYC_ACCESS_MAX_CASE_REFERENCE = 60;

/**
 * Stated retention for the access log, enforced by the daily cleanup job in
 * src/jobs/index.js so the disclosure is backed by behaviour.
 */
export const KYC_ACCESS_RETENTION_DAYS = 365;

/** Null for anything unrecognised, so callers must decide what to do about it. */
export function normalizeAccessPurpose(value) {
  return KYC_ACCESS_PURPOSES.includes(value) ? value : null;
}

/** Null for anything unrecognised; the route applies its own default. */
export function normalizeEvidenceScope(value) {
  return KYC_EVIDENCE_SCOPES.includes(value) ? value : null;
}

/** Falls back to the neutral label rather than storing an empty actor. */
export function normalizeActorLabel(value) {
  return trimTo(value, KYC_ACCESS_MAX_LABEL) || DEFAULT_ACTOR_LABEL;
}

/** Optional; a case reference is a plain handle (e.g. a support case id), never a note. */
export function normalizeCaseReference(value) {
  return trimTo(value, KYC_ACCESS_MAX_CASE_REFERENCE);
}

/**
 * Record one staff (or service) access to a subject's identity evidence.
 * Best-effort like the security-event log: a logging failure must never be the
 * reason a review cannot proceed, but it is logged loudly instead of swallowed.
 *
 * @returns {Promise<{id: string, accessed_at: string} | null>}
 */
export async function recordKycEvidenceAccess({
  subjectUserId,
  attemptId = null,
  actorUserId = null,
  actorLabel,
  purpose,
  scope = 'attempt',
  caseReference = null,
} = {}) {
  if (!subjectUserId) return null;
  const purposeValue = normalizeAccessPurpose(purpose);
  if (!purposeValue) {
    console.warn('[KYC ACCESS] refused to record an access with no recognised purpose:', purpose);
    return null;
  }
  const scopeValue = normalizeEvidenceScope(scope) || 'attempt';

  try {
    const result = await pool.query(
      `INSERT INTO kyc_evidence_access
         (subject_user_id, attempt_id, actor_user_id, actor_label, purpose, scope, case_reference)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, accessed_at`,
      [
        subjectUserId,
        attemptId,
        actorUserId,
        normalizeActorLabel(actorLabel),
        purposeValue,
        scopeValue,
        normalizeCaseReference(caseReference),
      ]
    );
    return result.rows[0] || null;
  } catch (err) {
    console.error('[KYC ACCESS] failed to record access:', err.message);
    return null;
  }
}

/** Postgres "undefined_table" — the audit table exists only once step 90 has run. */
const MISSING_TABLE = '42P01';

/**
 * Display-safe rows, newest first. The actor's id is deliberately not selected,
 * so it cannot leak through a route that forgets to strip it.
 *
 * `tolerateMissingTable` exists for the data export: a user's copy of everything
 * else must never fail because an optional audit log is absent on a database
 * that has not run the migration yet. A read that fails for any other reason
 * still throws — an export should fail loudly rather than quietly omit rows.
 */
async function selectAccessRows(subjectUserId, limit, { tolerateMissingTable = false } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 500);
  try {
    const result = await pool.query(
      `SELECT id, attempt_id, actor_label, purpose, scope, case_reference, accessed_at
         FROM kyc_evidence_access
        WHERE subject_user_id = $1
        ORDER BY accessed_at DESC
        LIMIT $2`,
      [subjectUserId, safeLimit]
    );
    return result.rows;
  } catch (err) {
    if (tolerateMissingTable && err?.code === MISSING_TABLE) return [];
    throw err;
  }
}

/** The subject's own case-linked history, as shown in the app. */
export async function listKycEvidenceAccess(subjectUserId, limit = 50) {
  return selectAccessRows(subjectUserId, limit);
}

/** The same rows, shaped for a data export (no internal attempt id). */
export async function exportKycEvidenceAccess(subjectUserId) {
  const rows = await selectAccessRows(subjectUserId, 500, { tolerateMissingTable: true });
  return rows.map((row) => ({
    id: row.id,
    purpose: row.purpose,
    scope: row.scope,
    actor_label: row.actor_label,
    case_reference: row.case_reference,
    accessed_at: row.accessed_at,
  }));
}

/** Count-only, for the data summary. Tolerates the pre-migration database too. */
export async function countKycEvidenceAccess(subjectUserId) {
  try {
    const result = await pool.query(
      'SELECT COUNT(*)::int AS count FROM kyc_evidence_access WHERE subject_user_id = $1',
      [subjectUserId]
    );
    return result.rows[0]?.count || 0;
  } catch (err) {
    if (err?.code === MISSING_TABLE) return 0;
    throw err;
  }
}

/** Daily cleanup; returns the number of rows removed. */
export async function cleanupOldKycEvidenceAccess() {
  const result = await pool.query(
    `DELETE FROM kyc_evidence_access
      WHERE accessed_at < NOW() - INTERVAL '${KYC_ACCESS_RETENTION_DAYS} days'`
  );
  return result.rowCount || 0;
}
