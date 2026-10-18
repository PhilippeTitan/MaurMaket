import { Router } from 'express';
import { pool } from '../config/database.js';
import { authRequired } from '../middleware/auth.js';
import { verifyLimiter } from '../middleware/rateLimit.js';
import { deleteTemporaryStorageUpload, readTemporaryKycImage } from '../utils/temporaryStorage.js';
import { KYC_ACCESS_RETENTION_DAYS, listKycEvidenceAccess } from '../utils/kycEvidenceAccess.js';
import { kycV2Enabled, verifyAppPinClaim, decodeIntegrityToken, evaluateDeviceSignals } from '../utils/appIntegrity.js';
import { queueKycAttempt, normalizeEmbedding, normalizeDeviceResults } from '../utils/kycReview.js';

const router = Router();

const LIGHTNING_URL = process.env.LIGHTNING_VERIFICATION_URL;
const LIGHTNING_KEY = process.env.LIGHTNING_VERIFICATION_KEY;

// ─── GET /verification/status ───────────────────────────────────────────
router.get('/verification/status', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id_verified, id_verified_at, id_verification_result, id_submitted_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[VERIFY] status error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /verification/submit ──────────────────────────────────────────
// Body: { idFrontUrl, idFaceUrl?, idBackUrl, selfieUrl, deleteUrls? }
// The backend:
//   1. Downloads images from imgbb URLs
//   2. Sends to Lightning /verify for OCR + face match + liveness
//   3. Applies verification policy (backend decides)
//   4. Stores verification_attempts record
//   5. Updates user status if verified
router.post('/verification/submit', verifyLimiter, authRequired, async (req, res) => {
  try {
    const { idFrontUrl, idBackUrl, selfieUrl, deleteUrls } = req.body;
    if (!idFrontUrl || !idBackUrl || !selfieUrl) {
      return res.status(400).json({ error: 'Missing required images (idFront, idBack, selfie)' });
    }

    // Check if already verified
    const existing = await pool.query(
      `SELECT id_verified, id_verification_result FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (existing.rows[0]?.id_verified) {
      return res.status(409).json({ error: 'Already verified', verified: true });
    }

    // Check if user has a pending attempt in the last 24 hours
    const recentAttempt = await pool.query(
      `SELECT id, status, created_at FROM verification_attempts
       WHERE user_id = $1 AND created_at > NOW() - INTERVAL '24 hours'
       ORDER BY created_at DESC LIMIT 1`,
      [req.user.id]
    );

    // ─── KYC v2 (docs/rfc/kyc-on-device.md, DECIDED 2026-10-17) ─────────
    // Free stack, explicitly temporary: no Lightning call, no auto-decision.
    // Client-supplied signals (Play Integrity token, pin claim, TFLite scores)
    // are stored as advisory columns and the attempt joins the human review
    // queue. The Lightning path below stays intact behind the flag for
    // rollback until Phase 5 retires it.
    if (kycV2Enabled()) {
      return submitV2(req, res, { idFrontUrl, idBackUrl, selfieUrl, deleteUrls });
    }

    // New KYC uploads are private Supabase objects; old in-flight clients may
    // still submit a temporary provider URL, which remains supported.
    const downloadImage = async (url, deleteRef) => {
      if (deleteRef?.startsWith('supabase:')) {
        return readTemporaryKycImage(req.user.id, deleteRef);
      }
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Failed to download image: ${resp.status}`);
      const buf = await resp.arrayBuffer();
      return Buffer.from(buf);
    };

    const [cinFrontImage, selfieImage] = await Promise.all([
      downloadImage(idFrontUrl, deleteUrls?.idFront),
      downloadImage(selfieUrl, deleteUrls?.selfie),
    ]);
    const cinFrontB64 = cinFrontImage.toString('base64');
    const selfieB64 = selfieImage.toString('base64');

    // Call Lightning /verify. The KYC cloudspace can be mid-restart or
    // cold-booting after auto-sleep (Lightning restarts/parks VMs), so
    // transient failures get one retry after a grace period.
    let lightningResult;
    const attemptLightning = async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45000);
      try {
        const lr = await fetch(`${LIGHTNING_URL}/verify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${LIGHTNING_KEY}`,
          },
          body: JSON.stringify({
            cin_front_base64: cinFrontB64,
            selfie_base64: selfieB64,
          }),
          signal: controller.signal,
        });
        if (lr.status >= 500) {
          const errBody = await lr.text();
          const err = new Error(`Lightning returned ${lr.status}: ${errBody}`);
          err.transient = true;
          throw err;
        }
        if (!lr.ok) {
          const errBody = await lr.text();
          throw new Error(`Lightning returned ${lr.status}: ${errBody}`);
        }
        return await lr.json();
      } catch (e) {
        if (e.name === 'AbortError' || e instanceof TypeError) e.transient = true;
        throw e;
      } finally {
        clearTimeout(timeout);
      }
    };

    try {
      try {
        lightningResult = await attemptLightning();
      } catch (firstErr) {
        if (!firstErr.transient) throw firstErr;
        console.warn('[VERIFY] transient Lightning failure, retrying after cold-boot grace:', firstErr.message);
        await new Promise(r => setTimeout(r, 15000));
        lightningResult = await attemptLightning();
      }
    } catch (fetchErr) {
      if (fetchErr.name === 'AbortError') {
        return res.status(504).json({
          error: 'Verification service timed out. Please try again.',
          attempt: { status: 'error', failed_stage: null, rejection_reason: 'timeout', reasons: ['Verification service timed out'], reason_codes: ['timeout'] },
        });
      }
      throw fetchErr;
    }

    // ─── POLICY ENGINE (backend decides) ─────────────────────────────
    const issues = [];
    const reasonCodes = [];
    let failedStage = null;

    const ocr = lightningResult.ocr?.fields || {};
    const faceMatch = lightningResult.face_match || {};
    const liveness = lightningResult.liveness || {};

    // Stage 1: Card detection (CIN front face present). The card is judged
    // from its own signal — when only the selfie fails, the verifier's early
    // return omits faces_found, and treating that absence as "card has no
    // usable face" told users to re-shoot a perfectly good card photo while
    // the real problem was the selfie (card det 0.91 was blamed as "too
    // blurry"). With no usable detection signal at all, fall back to best_det.
    const cinDet = faceMatch.best_det?.cin ?? faceMatch.det_scores?.cin ?? 0;
    const cardFaces = faceMatch.faces_found?.cin;
    const cardFaceUsable = cardFaces != null ? cardFaces > 0 : cinDet >= 0.6;
    if (!cardFaceUsable) {
      if (cinDet >= 0.3) {
        reasonCodes.push('face_not_found');
        issues.push('We found a face on the card, but it is too small or blurry to use. Move closer and retake the card photo in even light.');
      } else {
        reasonCodes.push('card_not_detected');
        issues.push('No face found on the CIN photo. Make sure the whole card — including the photo — is fully in frame.');
      }
      failedStage = failedStage || 'card';
    }

    // Stage 2: Details (OCR extraction quality)
    const hasName = ocr.last_name || ocr.first_names;
    const hasDob = ocr.date_of_birth;
    const hasCin = ocr.cin_number;
    const hasSex = ocr.sex;

    if (!hasName && !hasDob && !hasCin) {
      reasonCodes.push('ocr_low');
      issues.push('Could not read your CIN. Ensure the photo is clear, well-lit, and not blurry.');
      failedStage = failedStage || 'details';
    } else {
      if (!hasName) issues.push('Name not found on CIN');
      if (!hasDob) issues.push('Date of birth not found on CIN');
      if (!hasCin) issues.push('CIN number not found');
      if (!hasSex) issues.push('Sex/gender not found on CIN');

      // Name match check (soft — just warn if mismatch)
      if (ocr.last_name && req.user.full_name) {
        const cinName = ocr.last_name.toLowerCase().trim();
        const userName = req.user.full_name.toLowerCase().trim().split(' ').pop(); // last word
        if (cinName && userName && cinName !== userName && !cinName.includes(userName) && !userName.includes(cinName)) {
          // Don't block, just note it — could be middle name vs last name
          issues.push(`CIN name "${ocr.last_name}" may not match your profile name`);
          reasonCodes.push('details_mismatch');
        }
      }

      // Date of birth match check
      if (ocr.date_of_birth && req.user.date_of_birth) {
        const normalizedDob = ocr.date_of_birth.replace(/\//g, '-');
        const userDob = new Date(req.user.date_of_birth).toISOString().split('T')[0];
        if (normalizedDob !== userDob) {
          issues.push(`Date of birth on CIN (${ocr.date_of_birth}) doesn't match your profile (${userDob})`);
          reasonCodes.push('details_mismatch');
        }
      }
    }

    // Stage 3: Face match (selfie vs CIN). Only pass through verifier errors
    // we recognize — anything else is an internal failure and must not reach
    // applicants raw (a remote unpack bug once leaked "too many values to
    // unpack (expected 4)" into a rejection message). A no-face result on the
    // selfie gets its own code so QC reopens the SELFIE step with the right
    // copy, instead of pointing users back at the card.
    if (!faceMatch.match) {
      const faceErr = typeof faceMatch.error === 'string' ? faceMatch.error : '';
      const cinNoFace = faceErr === 'No face detected in CIN image';
      const selfieNoFace = faceErr === 'No face detected in selfie';
      if (cinNoFace || selfieNoFace) {
        issues.push(faceErr);
        reasonCodes.push(cinNoFace ? 'face_not_found' : 'selfie_not_found');
      } else if (faceMatch.error) {
        issues.push("We couldn't compare your selfie with your CIN photo. Please retake both photos in good light.");
        reasonCodes.push('face_mismatch');
      } else {
        issues.push(`Selfie doesn't match your CIN photo (score: ${faceMatch.score || 0})`);
        reasonCodes.push('face_mismatch');
      }
      failedStage = failedStage || 'face';
    }

    // Stage 4: Liveness (anti-spoofing). Same scrub rule as stage 3 — only
    // the known no-face string passes through untouched.
    if (!liveness.live) {
      const liveErr = typeof liveness.error === 'string' ? liveness.error : '';
      issues.push(liveErr === 'No face detected' ? liveErr : 'Please take a live selfie (not a photo of a photo)');
      reasonCodes.push('not_live');
      failedStage = failedStage || 'face';
    }

    // Borderline cases → manual review (not auto-approve)
    const isBorderline = faceMatch.match && faceMatch.score > 0.35 && faceMatch.score < 0.45;

    let finalStatus;
    if (issues.length === 0 && !isBorderline) {
      finalStatus = 'verified';
    } else if (isBorderline) {
      finalStatus = 'manual_review';
      issues.push('Your verification is being reviewed. This usually takes 24 hours.');
    } else {
      finalStatus = 'rejected';
    }

    // Store attempt
    const attemptResult = await pool.query(
      `INSERT INTO verification_attempts
       (user_id, status, id_front_url, id_back_url, selfie_url, ocr_result, ocr_fields,
        face_match_score, face_match_detail, liveness_score, rejection_reason, failed_stage,
        lightning_raw, verified_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING id, status, rejection_reason, failed_stage`,
      [
        req.user.id,
        finalStatus,
        null, // ID images are transient and are never retained in the verification record.
        null,
        null,
        lightningResult.ocr,           // ocr_result (full)
        lightningResult.ocr?.fields,   // ocr_fields (parsed)
        faceMatch.score || 0,          // face_match_score
        faceMatch,                     // face_match_detail
        liveness.confidence || 0,      // liveness_score
        issues.length > 0 ? issues.join('; ') : null,  // rejection_reason
        failedStage,                   // failed_stage
        lightningResult,               // lightning_raw (full response)
        finalStatus === 'verified' ? new Date() : null, // verified_at
      ]
    );

    const attempt = attemptResult.rows[0];

    // Identity verification unlocks the Verified tier for existing Casual
    // sellers immediately (the success screen promises "You're now a Verified
    // Seller"). Never touches role or tiers above casual (verified/business
    // and non-sellers pass through unchanged).
    let updatedUser = null;
    if (finalStatus === 'verified') {
      await pool.query(
        `UPDATE users SET
           id_verified = true,
           id_verified_at = NOW(),
           id_verification_result = 'verified',
           seller_tier = CASE WHEN seller_tier = 'casual' THEN 'verified' ELSE seller_tier END,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [req.user.id]
      );

      const userResult = await pool.query(
        `SELECT * FROM users WHERE id = $1`,
        [req.user.id]
      );
      updatedUser = userResult.rows[0];
    } else if (finalStatus === 'rejected') {
      await pool.query(
        `UPDATE users SET id_verification_result = 'rejected' WHERE id = $1`,
        [req.user.id]
      );
    }

    // Remove temporary storage objects immediately; the expiry job remains a
    // safety net for abandoned sessions or a failed verification request.
    if (deleteUrls) {
      const deleteUrlList = [deleteUrls.idFront, deleteUrls.idFace, deleteUrls.idBack, deleteUrls.selfie].filter(Boolean);
      for (const url of deleteUrlList) {
        try {
          if (/^(supabase|r2):/.test(url)) {
            await deleteTemporaryStorageUpload(req.user.id, url);
          } else if (url.startsWith('https://')) {
            await fetch(url, { method: 'DELETE' });
          }
        } catch (deleteErr) {
          console.warn('[VERIFY] Temporary image cleanup deferred to expiry job:', deleteErr.message);
        }
      }
    }

    res.json({
      attempt: {
        id: attempt.id,
        status: attempt.status,
        rejection_reason: attempt.rejection_reason,
        failed_stage: attempt.failed_stage,
        reasons: issues,
        reason_codes: [...new Set(reasonCodes)],
      },
      user: updatedUser,
    });
  } catch (err) {
    console.error('[VERIFY] submit error:', err);
    res.status(500).json({
      error: 'Verification failed. Please try again.',
      attempt: { status: 'error', failed_stage: null, rejection_reason: 'server_error', reasons: ['Server error during verification'], reason_codes: ['server_error'] },
    });
  }
});

// ─── KYC v2 submit path ─────────────────────────────────────────────────
// Reached only when KYC_V2_ENABLED=true. Images stay in private temporary
// storage (refs are re-registered under the 90-day retention TTL by
// queueKycAttempt); nothing is downloaded here — the reviewer streams them
// through the audited evidence endpoint when the case is opened.
async function submitV2(req, res, { idFrontUrl, idBackUrl, selfieUrl, deleteUrls }) {
  const pinResult = verifyAppPinClaim(req.body.pinClaim);

  // Integrity decode is best-effort: a missing SA, a timeout, or a rejected
  // token stores { error } and never blocks the submission — a network blip
  // must not lock a real person out of the review queue.
  let integrity = null;
  if (req.body.integrityToken) {
    try {
      const payload = await decodeIntegrityToken({ integrityToken: req.body.integrityToken });
      const signals = evaluateDeviceSignals(payload?.deviceRecognitionVerdict);
      integrity = { ...payload, attestation: signals };
    } catch (err) {
      console.warn('[VERIFY v2] integrity decode failed (stored as signal):', err.message);
      integrity = { error: err.message };
    }
  }

  const attempt = await queueKycAttempt({
    userId: req.user.id,
    idFrontRef: deleteUrls?.idFront || (String(idFrontUrl).startsWith('https://') ? idFrontUrl : null),
    idBackRef: deleteUrls?.idBack || (String(idBackUrl).startsWith('https://') ? idBackUrl : null),
    selfieRef: deleteUrls?.selfie || (String(selfieUrl).startsWith('https://') ? selfieUrl : null),
    deviceResults: normalizeDeviceResults(req.body.deviceResults),
    integrity,
    pinResult,
    embedding: normalizeEmbedding(req.body.embedding),
  });

  // Legacy clients that never heard of pending_review render it as
  // "processing"; the copy matches the manual_review message they already
  // understand.
  return res.json({
    attempt: {
      id: attempt.id,
      status: attempt.status,
      rejection_reason: null,
      failed_stage: null,
      reasons: ['Your verification is being reviewed. This usually takes 24 hours.'],
      reason_codes: ['pending_review'],
    },
    user: null,
  });
}

// ─── GET /verification/evidence-access ──────────────────────────────────
// Batch 75 — the subject's own case-linked history of staff reads of their
// identity evidence. Display-safe by construction: the query in
// listKycEvidenceAccess never selects the actor's user id, so no route-level
// slip can turn this into a staff directory. An empty list is a real answer
// here (nobody has opened the file), not an error state.
router.get('/verification/evidence-access', authRequired, async (req, res) => {
  try {
    const entries = await listKycEvidenceAccess(req.user.id);
    res.json({ entries, retention_days: KYC_ACCESS_RETENTION_DAYS });
  } catch (err) {
    console.error('[VERIFY] evidence access history error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
