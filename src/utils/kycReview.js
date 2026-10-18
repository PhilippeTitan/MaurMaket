import { pool } from '../config/database.js';
import { SUPABASE_KYC_BUCKET } from '../config/storage.js';
import {
  registerTemporaryStorageUpload,
  deleteTemporaryStorageUpload,
  readTemporaryKycImage,
} from './temporaryStorage.js';
import { recordKycEvidenceAccess } from './kycEvidenceAccess.js';
import {
  REVIEW_DUPLICATE_FACE_THRESHOLD,
  normalizeEmbedding,
  cosineSimilarity,
  normalizeDeviceResults,
} from './kycSignals.js';

// KYC v2 — human review queue (docs/rfc/kyc-on-device.md, DECIDED 2026-10-17).
// Philippe is the temporary final authority until the $25 Play Console upgrade
// flips attestation authority on. The admin *website UI* does not exist yet:
// these functions back the API endpoints; a review surface can be built on top
// without touching storage or the audit trail.
//
// Pure signal helpers live in kycSignals.js (zero-import, unit-testable);
// re-exported here so callers keep a single import site.

export { REVIEW_DUPLICATE_FACE_THRESHOLD, normalizeEmbedding, cosineSimilarity, normalizeDeviceResults };

export const KYC_IMAGE_RETENTION_DAYS = 90;
const REVIEW_QUEUE_MAX_LIMIT = 100;
const REVIEW_NOTE_MAX = 1000;

/**
 * Advisory duplicate-face check against recent attempts by other users.
 * Advisory, never automatic: the reviewer sees the max similarity and decides.
 */
export async function findDuplicateFaceExposure(userId, embedding, { poolLike = pool } = {}) {
  if (!embedding || !userId) return null;
  const recent = await poolLike.query(
    `SELECT id, user_id, selfie_embedding
       FROM verification_attempts
      WHERE user_id <> $1
        AND selfie_embedding IS NOT NULL
        AND created_at > NOW() - INTERVAL '365 days'
      ORDER BY created_at DESC
      LIMIT 400`,
    [userId]
  );
  let best = null;
  for (const row of recent.rows) {
    const other = normalizeEmbedding(row.selfie_embedding);
    if (!other) continue;
    const similarity = cosineSimilarity(embedding, other);
    if (similarity === null) continue;
    if (!best || similarity > best.similarity) {
      best = { similarity, matchedAttemptId: row.id, matchedUserId: row.user_id };
    }
  }
  if (best && best.similarity >= REVIEW_DUPLICATE_FACE_THRESHOLD) {
    return { maxSimilarity: Number(best.similarity.toFixed(4)), matchedAttemptId: best.matchedAttemptId, threshold: REVIEW_DUPLICATE_FACE_THRESHOLD };
  }
  return null;
}

/**
 * Re-register a short-lived KYC upload under a long TTL so a reviewer can open
 * it during the retention window. The 90-day purge (and the 5-minute expiry
 * job, which now finds an unexpired row) keeps the disclosure bounded.
 */
async function extendKycObjectLifetime(userId, deleteRef, { poolLike = pool } = {}) {
  const match = /^supabase:(.+)$/.exec(deleteRef || '');
  if (!match) return;
  const objectKey = match[1];
  if (!objectKey.startsWith(`${userId}/kyc/`)) return;
  const queued = await poolLike.query(
    `SELECT bucket_name FROM temporary_storage_uploads
      WHERE user_id = $1 AND provider = 'supabase' AND object_key = $2 LIMIT 1`,
    [userId, objectKey]
  );
  await registerTemporaryStorageUpload({
    userId,
    provider: 'supabase',
    bucketName: queued.rows[0]?.bucket_name || SUPABASE_KYC_BUCKET,
    objectKey,
    expirationSeconds: KYC_IMAGE_RETENTION_DAYS * 86400,
  });
}

/**
 * Enqueue a submission for human review. Never auto-decides: every attempt
 * lands with review_status 'pending' regardless of advisory signals.
 */
export async function queueKycAttempt({
  userId,
  idFrontRef = null,
  idBackRef = null,
  selfieRef = null,
  deviceResults = {},
  integrity = null,
  pinResult = null,
  embedding = null,
} = {}) {
  if (!userId) throw new Error('queueKycAttempt requires a userId');
  const normalizedEmbedding = normalizeEmbedding(embedding);
  const duplicate = await findDuplicateFaceExposure(userId, normalizedEmbedding);

  for (const ref of [idFrontRef, idBackRef, selfieRef]) {
    try {
      await extendKycObjectLifetime(userId, ref);
    } catch (err) {
      console.warn('[KYC REVIEW] could not extend image lifetime:', err.message);
    }
  }

  const result = await pool.query(
    `INSERT INTO verification_attempts
       (user_id, status, review_status, id_front_url, id_back_url, selfie_url,
        ocr_fields, face_match_score, liveness_score, device_verdict,
        client_device_results, app_pin_sha256, selfie_embedding)
     VALUES ($1, 'pending_review', 'pending', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id, status, review_status, created_at`,
    [
      userId,
      idFrontRef,
      idBackRef,
      selfieRef,
      deviceResults.cinFields || null,
      Number.isFinite(deviceResults.faceMatchScore) ? deviceResults.faceMatchScore : 0,
      Number.isFinite(deviceResults.livenessScore) ? deviceResults.livenessScore : 0,
      integrity,
      { deviceResults, pin: pinResult, duplicate },
      pinResult?.claimed || null,
      normalizedEmbedding,
    ]
  );
  return result.rows[0];
}

/** Pending queue, oldest first (FIFO), with the subject's display identity. */
export async function getReviewQueue({ limit = 50, offset = 0 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), REVIEW_QUEUE_MAX_LIMIT);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const [rows, count] = await Promise.all([
    pool.query(
      `SELECT a.id, a.user_id, a.status, a.review_status, a.created_at,
              a.face_match_score, a.device_verdict, a.client_device_results,
              u.full_name, u.email
         FROM verification_attempts a
         JOIN users u ON u.id = a.user_id
        WHERE a.review_status = 'pending'
        ORDER BY a.created_at ASC
        LIMIT $1 OFFSET $2`,
      [safeLimit, safeOffset]
    ),
    pool.query(`SELECT COUNT(*)::int AS count FROM verification_attempts WHERE review_status = 'pending'`),
  ]);
  return { cases: rows.rows, total: count.rows[0]?.count || 0, limit: safeLimit, offset: safeOffset };
}

/** Full case metadata for the review surface (images are fetched separately). */
export async function getReviewCase(attemptId) {
  const result = await pool.query(
    `SELECT a.*, u.full_name, u.email, u.phone_number
       FROM verification_attempts a
       JOIN users u ON u.id = a.user_id
      WHERE a.id = $1`,
    [attemptId]
  );
  return result.rows[0] || null;
}

/**
 * The reviewer's decision — the temporary final authority. Approved unlocks
 * the Verified tier exactly like the retired v1 auto-approve did; rejected
 * stamps the user's result. Every decision writes a case_review access row so
 * the subject's own history shows the file was opened.
 */
export async function decideReview({ attemptId, decision, note = null, actorUserId } = {}) {
  if (!['approved', 'rejected'].includes(decision)) return { error: 'invalid_decision' };
  if (!attemptId || !actorUserId) return { error: 'missing_arguments' };
  const trimmedNote = typeof note === 'string' ? note.trim().slice(0, REVIEW_NOTE_MAX) : null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query(
      `SELECT id, user_id, review_status FROM verification_attempts WHERE id = $1 FOR UPDATE`,
      [attemptId]
    );
    if (locked.rows.length === 0) {
      await client.query('ROLLBACK');
      return { error: 'not_found' };
    }
    const attempt = locked.rows[0];
    if (attempt.review_status !== 'pending') {
      await client.query('ROLLBACK');
      return { error: 'not_pending', current: attempt.review_status };
    }

    const updated = await client.query(
      `UPDATE verification_attempts
          SET review_status = $2,
              review_note = $3,
              reviewed_by = $4,
              reviewed_at = NOW(),
              status = CASE WHEN $2 = 'approved' THEN 'verified' ELSE 'rejected' END,
              verified_at = CASE WHEN $2 = 'approved' THEN NOW() ELSE verified_at END
        WHERE id = $1
        RETURNING id, status, review_status, reviewed_at, review_note`,
      [attemptId, decision, trimmedNote, actorUserId]
    );

    if (decision === 'approved') {
      await client.query(
        `UPDATE users SET
           id_verified = true,
           id_verified_at = NOW(),
           id_verification_result = 'verified',
           seller_tier = CASE WHEN seller_tier = 'casual' THEN 'verified' ELSE seller_tier END,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [attempt.user_id]
      );
    } else {
      await client.query(
        `UPDATE users SET id_verification_result = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [attempt.user_id]
      );
    }
    await client.query('COMMIT');

    // Audit after the decision is durable; a logging failure never rolls it back.
    await recordKycEvidenceAccess({
      subjectUserId: attempt.user_id,
      attemptId,
      actorUserId,
      purpose: 'case_review',
      scope: 'attempt',
      caseReference: `kyc-review-${String(attemptId).slice(0, 8)}`,
    });

    return { attempt: updated.rows[0] };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* connection already gone */ }
    throw err;
  } finally {
    client.release();
  }
}

/** Stream one evidence image for the reviewer; logs a document-scope access. */
export async function readAttemptEvidenceImage(subjectUserId, attemptId, which, actorUserId) {
  const columns = { front: 'id_front_url', back: 'id_back_url', selfie: 'selfie_url' };
  const column = columns[which];
  if (!column) throw new Error('Unknown evidence image');
  const row = await pool.query(
    `SELECT ${column} AS ref FROM verification_attempts WHERE id = $1 AND user_id = $2`,
    [attemptId, subjectUserId]
  );
  const ref = row.rows[0]?.ref;
  if (!ref) throw new Error('Evidence image is no longer retained');
  const buffer = await readTemporaryKycImage(subjectUserId, ref);
  await recordKycEvidenceAccess({
    subjectUserId,
    attemptId,
    actorUserId,
    purpose: 'case_review',
    scope: which === 'selfie' ? 'selfie' : 'document',
    caseReference: `kyc-review-${String(attemptId).slice(0, 8)}`,
  });
  return buffer;
}

/**
 * 90-day purge: raw KYC images (and any leftover imgbb URLs) are removed from
 * old attempts and the columns are nulled. Self-catching: a purge failure logs
 * loudly and returns 0 so the nightly cron never dies on it. Storage deletes
 * that throw are retried next night (columns stay populated for the retry).
 */
export async function purgeExpiredKycImages({ poolLike = pool } = {}) {
  try {
    const stale = await poolLike.query(
      `SELECT id, user_id, id_front_url, id_back_url, selfie_url
         FROM verification_attempts
        WHERE created_at < NOW() - INTERVAL '${KYC_IMAGE_RETENTION_DAYS} days'
          AND (id_front_url IS NOT NULL OR id_back_url IS NOT NULL OR selfie_url IS NOT NULL)
        ORDER BY created_at ASC
        LIMIT 25`
    );
    let purged = 0;
    for (const row of stale.rows) {
      let allDeleted = true;
      for (const ref of [row.id_front_url, row.id_back_url, row.selfie_url]) {
        if (!ref) continue;
        try {
          if (/^(supabase|r2):/.test(ref)) {
            await deleteTemporaryStorageUpload(row.user_id, ref);
          } else if (ref.startsWith('https://')) {
            await fetch(ref, { method: 'DELETE' }).catch(() => {});
          }
        } catch (err) {
          allDeleted = false;
          console.warn('[KYC PURGE] object delete deferred:', err.message);
        }
      }
      if (allDeleted) {
        await poolLike.query(
          `UPDATE verification_attempts
              SET id_front_url = NULL, id_back_url = NULL, selfie_url = NULL
            WHERE id = $1`,
          [row.id]
        );
        purged++;
      }
    }
    if (purged > 0) {
      console.log(`[KYC PURGE] Purged raw images from ${purged} attempt(s) older than ${KYC_IMAGE_RETENTION_DAYS} days`);
    }
    return purged;
  } catch (err) {
    console.error('[KYC PURGE] job error:', err.message);
    return 0;
  }
}
