import { pool } from '../config/database.js';
import { SECURITY_EVENT_RETENTION_DAYS, SECURITY_EVENT_TYPES } from './securityEvents.js';

// Batch 74/75 — data export lifecycle (APP-Q379–APP-Q391).
//
// Exports are modeled as jobs instead of a single synchronous download:
//   pending → ready | failed | cancelled | superseded
//   ready   → expired (payload deleted, row kept briefly so the user sees why)
//
// Two rules keep the archive honest:
//   1. A payload is written only by the atomic pending→ready UPDATE, so a job
//      that was cancelled or superseded mid-generation can never leave a
//      partial file behind.
//   2. A new export supersedes any existing pending/ready job for the same
//      account, so there is never more than one downloadable archive.

/** How long a completed export stays downloadable. Disclosed in the app. */
export const EXPORT_TTL_DAYS = 7;

/** How long finished/cancelled job records are kept before being purged. */
export const EXPORT_JOB_RETENTION_DAYS = 30;

export const EXPORT_STATUSES = new Set(['pending', 'ready', 'failed', 'cancelled', 'expired', 'superseded']);

/** Statuses that may be retried into a fresh job. */
export const RETRYABLE_STATUSES = new Set(['failed', 'cancelled', 'expired', 'superseded']);

const OPEN_STATUSES = ['pending', 'ready'];

/**
 * Build the full export payload for an account.
 *
 * Includes the account's own security activity history for the disclosed
 * retention window (Batch 75: "include retained security history in exports").
 * Security events are stored as structured codes; keep them structured here too
 * so the file stays machine-readable in any language.
 */
export async function buildExportPayload(userId) {
  const [profile, orders, messages, notifications, reviews, securityEvents] = await Promise.all([
    pool.query(
      `SELECT id, full_name, username, email, phone, bio, role, seller_tier, language, created_at
         FROM users WHERE id = $1`,
      [userId]
    ),
    pool.query('SELECT * FROM orders WHERE buyer_id = $1 ORDER BY created_at DESC', [userId]),
    pool.query(
      `SELECT m.* FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
        WHERE c.buyer_id = $1 OR c.seller_id = $1
        ORDER BY m.created_at DESC`,
      [userId]
    ),
    pool.query('SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC', [userId]),
    pool.query('SELECT * FROM reviews WHERE reviewer_id = $1 OR seller_id = $1 ORDER BY created_at DESC', [userId]),
    pool.query(
      `SELECT id, event_type, metadata, created_at
         FROM security_events
        WHERE user_id = $1
          AND created_at >= NOW() - ($2 || ' days')::interval
        ORDER BY created_at DESC`,
      [userId, SECURITY_EVENT_RETENTION_DAYS]
    ),
  ]);

  return {
    format_version: 1,
    generated_at: new Date().toISOString(),
    profile: profile.rows[0] || null,
    orders: orders.rows,
    messages: messages.rows,
    notifications: notifications.rows,
    reviews: reviews.rows,
    security_events: securityEvents.rows
      .filter((row) => SECURITY_EVENT_TYPES.has(row.event_type))
      .map((row) => ({
        id: row.id,
        event_type: row.event_type,
        user_agent: row.metadata?.userAgent || null,
        reason: row.metadata?.reason || null,
        created_at: row.created_at,
      })),
    security_events_retention_days: SECURITY_EVENT_RETENTION_DAYS,
  };
}

/**
 * Count-only summary so the app can show the shape of the held data without
 * producing a full copy (and therefore without the re-authentication that a
 * real export requires).
 */
export async function getExportSummary(userId) {
  const [orders, messages, reviews, notifications, securityEvents] = await Promise.all([
    pool.query('SELECT COUNT(*)::int AS count FROM orders WHERE buyer_id = $1', [userId]),
    pool.query(
      `SELECT COUNT(*)::int AS count FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
        WHERE c.buyer_id = $1 OR c.seller_id = $1`,
      [userId]
    ),
    pool.query('SELECT COUNT(*)::int AS count FROM reviews WHERE reviewer_id = $1 OR seller_id = $1', [userId]),
    pool.query('SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1', [userId]),
    pool.query(
      `SELECT COUNT(*)::int AS count FROM security_events
        WHERE user_id = $1 AND created_at >= NOW() - ($2 || ' days')::interval`,
      [userId, SECURITY_EVENT_RETENTION_DAYS]
    ),
  ]);
  return {
    orders: orders.rows[0]?.count || 0,
    messages: messages.rows[0]?.count || 0,
    reviews: reviews.rows[0]?.count || 0,
    notifications: notifications.rows[0]?.count || 0,
    security_events: securityEvents.rows[0]?.count || 0,
    retention_days: SECURITY_EVENT_RETENTION_DAYS,
  };
}

/**
 * Create a pending export job, superseding any open job for this account so
 * there is only ever one archive in flight or available.
 */
export async function startExportJob(userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE export_jobs
          SET status = 'superseded', payload = NULL
        WHERE user_id = $1 AND status = ANY($2::varchar[])`,
      [userId, OPEN_STATUSES]
    );
    const { rows } = await client.query(
      `INSERT INTO export_jobs (user_id, status)
       VALUES ($1, 'pending')
       RETURNING id, status, error, requested_at, completed_at, expires_at, cancelled_at`,
      [userId]
    );
    await client.query('COMMIT');
    return rows[0];
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Generate a job's payload. Called detached after the start endpoint responds
 * so the client can observe (or cancel) the pending state.
 *
 * The pending→ready UPDATE is the only statement that writes a payload; if the
 * job was cancelled or superseded first, zero rows match and nothing is stored.
 */
export async function generateExportJob(jobId, userId) {
  try {
    const payload = await buildExportPayload(userId);
    const { rows } = await pool.query(
      `UPDATE export_jobs
          SET status = 'ready',
              payload = $3::jsonb,
              completed_at = CURRENT_TIMESTAMP,
              expires_at = CURRENT_TIMESTAMP + ($4 || ' days')::interval
        WHERE id = $1 AND user_id = $2 AND status = 'pending'
        RETURNING id, status, requested_at, completed_at, expires_at`,
      [jobId, userId, JSON.stringify(payload), String(EXPORT_TTL_DAYS)]
    );
    return rows[0] || null;
  } catch (err) {
    console.error('[dataExport] Generation failed:', err.message);
    // Short, non-sensitive code only — never persist a raw DB error.
    await pool
      .query(
        `UPDATE export_jobs SET status = 'failed', error = 'generation_failed'
          WHERE id = $1 AND user_id = $2 AND status = 'pending'`,
        [jobId, userId]
      )
      .catch(() => {});
    return null;
  }
}

/** Lazily flip ready-but-stale jobs to expired and drop their payloads. */
async function expireStaleJobs(userId) {
  try {
    await pool.query(
      `UPDATE export_jobs
          SET status = 'expired', payload = NULL
        WHERE user_id = $1
          AND status = 'ready'
          AND expires_at IS NOT NULL
          AND expires_at < CURRENT_TIMESTAMP`,
      [userId]
    );
  } catch (err) {
    console.error('[dataExport] Expiry sweep error:', err.message);
  }
}

const JOB_COLUMNS = `id, status, error, requested_at, completed_at, expires_at, cancelled_at,
    (status = 'ready' AND payload IS NOT NULL) AS has_payload`;

function serializeJob(row) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    error: row.error || null,
    requested_at: row.requested_at,
    completed_at: row.completed_at,
    expires_at: row.expires_at,
    cancelled_at: row.cancelled_at,
    has_payload: row.has_payload === true,
  };
}

/** Recent jobs for the caller, newest first. Never includes payloads. */
export async function getExportJobs(userId, limit = 10) {
  await expireStaleJobs(userId);
  const { rows } = await pool.query(
    `SELECT ${JOB_COLUMNS}
       FROM export_jobs
      WHERE user_id = $1
      ORDER BY requested_at DESC
      LIMIT $2`,
    [userId, limit]
  );
  return rows.map(serializeJob);
}

/** One job, scoped to its owner. Applies lazy expiry first. */
export async function getExportJob(userId, jobId) {
  await expireStaleJobs(userId);
  const { rows } = await pool.query(
    `SELECT ${JOB_COLUMNS} FROM export_jobs WHERE id = $1 AND user_id = $2`,
    [jobId, userId]
  );
  return serializeJob(rows[0]);
}

/**
 * Read a completed job's payload. Returns a reason instead of data for any
 * non-ready state so callers can respond precisely.
 */
export async function getExportPayload(userId, jobId) {
  const job = await getExportJob(userId, jobId);
  if (!job) return { job: null, reason: 'not_found', payload: null };
  if (job.status !== 'ready' || !job.has_payload) return { job, reason: job.status, payload: null };
  const { rows } = await pool.query(
    'SELECT payload FROM export_jobs WHERE id = $1 AND user_id = $2',
    [jobId, userId]
  );
  return { job, reason: null, payload: rows[0]?.payload || null };
}

/**
 * Cancel a pending job. Returns the updated job, or null when the job is no
 * longer pending (or not the caller's).
 */
export async function cancelExportJob(userId, jobId) {
  const { rows } = await pool.query(
    `UPDATE export_jobs
        SET status = 'cancelled', payload = NULL, cancelled_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND user_id = $2 AND status = 'pending'
      RETURNING ${JOB_COLUMNS}`,
    [jobId, userId]
  );
  return serializeJob(rows[0]);
}

/**
 * Daily maintenance: expire stale payloads and purge old job records. Payloads
 * are cleared as soon as they expire so a disclosure of "available for seven
 * days" stays true.
 */
export async function cleanupOldExportJobs() {
  try {
    const expired = await pool.query(
      `UPDATE export_jobs
          SET status = 'expired', payload = NULL
        WHERE status = 'ready'
          AND expires_at IS NOT NULL
          AND expires_at < CURRENT_TIMESTAMP`
    );
    const removed = await pool.query(
      `DELETE FROM export_jobs WHERE requested_at < NOW() - ($1 || ' days')::interval`,
      [String(EXPORT_JOB_RETENTION_DAYS)]
    );
    return { expired: expired.rowCount || 0, removed: removed.rowCount || 0 };
  } catch (err) {
    console.error('[dataExport] Cleanup error:', err.message);
    return { expired: 0, removed: 0 };
  }
}
