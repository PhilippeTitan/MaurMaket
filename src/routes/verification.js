import { Router } from 'express';
import { pool } from '../config/database.js';
import { authRequired } from '../middleware/auth.js';
import { verifyLimiter } from '../middleware/rateLimit.js';

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

    // Download images from imgbb and convert to base64
    const downloadImage = async (url) => {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Failed to download image: ${resp.status}`);
      const buf = await resp.arrayBuffer();
      return Buffer.from(buf).toString('base64');
    };

    const [cinFrontB64, selfieB64] = await Promise.all([
      downloadImage(idFrontUrl),
      downloadImage(selfieUrl),
    ]);

    // Call Lightning /verify
    let lightningResult;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45000);

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
      clearTimeout(timeout);

      if (!lr.ok) {
        const errBody = await lr.text();
        throw new Error(`Lightning returned ${lr.status}: ${errBody}`);
      }
      lightningResult = await lr.json();
    } catch (fetchErr) {
      if (fetchErr.name === 'AbortError') {
        return res.status(504).json({
          error: 'Verification service timed out. Please try again.',
          attempt: { status: 'error', failed_stage: null, rejection_reason: 'timeout', reasons: ['Verification service timed out'] },
        });
      }
      throw fetchErr;
    }

    // ─── POLICY ENGINE (backend decides) ─────────────────────────────
    const issues = [];
    let failedStage = null;

    const ocr = lightningResult.ocr?.fields || {};
    const faceMatch = lightningResult.face_match || {};
    const liveness = lightningResult.liveness || {};

    // Stage 1: Card detection (CIN front face present)
    if (!faceMatch.faces_found || faceMatch.faces_found.cin === 0) {
      issues.push('No face detected on your CIN card');
      failedStage = failedStage || 'card';
    }

    // Stage 2: Details (OCR extraction quality)
    const hasName = ocr.last_name || ocr.first_names;
    const hasDob = ocr.date_of_birth;
    const hasCin = ocr.cin_number;
    const hasSex = ocr.sex;

    if (!hasName && !hasDob && !hasCin) {
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
        }
      }

      // Date of birth match check
      if (ocr.date_of_birth && req.user.date_of_birth) {
        const normalizedDob = ocr.date_of_birth.replace(/\//g, '-');
        const userDob = new Date(req.user.date_of_birth).toISOString().split('T')[0];
        if (normalizedDob !== userDob) {
          issues.push(`Date of birth on CIN (${ocr.date_of_birth}) doesn't match your profile (${userDob})`);
        }
      }
    }

    // Stage 3: Face match (selfie vs CIN)
    if (!faceMatch.match) {
      if (faceMatch.error) {
        issues.push(faceMatch.error);
      } else {
        issues.push(`Selfie doesn't match your CIN photo (score: ${faceMatch.score || 0})`);
      }
      failedStage = failedStage || 'face';
    }

    // Stage 4: Liveness (anti-spoofing)
    if (!liveness.live) {
      if (liveness.error) {
        issues.push(liveness.error);
      } else {
        issues.push('Please take a live selfie (not a photo of a photo)');
      }
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
        idFrontUrl,
        idBackUrl,
        selfieUrl,
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

    // If verified, update user + promote to casual seller
    let updatedUser = null;
    if (finalStatus === 'verified') {
      await pool.query(
        `UPDATE users SET
           id_verified = true,
           id_verified_at = NOW(),
           id_verification_result = 'verified',
           role = CASE WHEN role = 'buyer' THEN 'seller' ELSE role END,
           seller_tier = CASE WHEN seller_tier = 'none' THEN 'casual' ELSE seller_tier END
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

    // Delete images from imgbb if requested
    if (deleteUrls) {
      const deleteUrlList = [deleteUrls.idFront, deleteUrls.idFace, deleteUrls.idBack, deleteUrls.selfie].filter(Boolean);
      for (const url of deleteUrlList) {
        try { await fetch(url, { method: 'DELETE' }); } catch {}
      }
    }

    res.json({
      attempt: {
        id: attempt.id,
        status: attempt.status,
        rejection_reason: attempt.rejection_reason,
        failed_stage: attempt.failed_stage,
        reasons: issues,
      },
      user: updatedUser,
    });
  } catch (err) {
    console.error('[VERIFY] submit error:', err);
    res.status(500).json({
      error: 'Verification failed. Please try again.',
      attempt: { status: 'error', failed_stage: null, rejection_reason: 'server_error', reasons: ['Server error during verification'] },
    });
  }
});

export default router;
