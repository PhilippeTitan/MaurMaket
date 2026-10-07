import express from 'express';
import { authRequired } from '../middleware/auth.js';
import { userHasPassword, verifyUserPassword } from '../utils/passwordVerify.js';
import {
  EXPORT_TTL_DAYS,
  RETRYABLE_STATUSES,
  cancelExportJob,
  generateExportJob,
  getExportJob,
  getExportJobs,
  getExportPayload,
  getExportSummary,
  startExportJob,
} from '../utils/dataExport.js';

const router = express.Router();

// ═══════════════════════════════════════════════════════════════════════════════
// DATA EXPORT LIFECYCLE (Batch 74/75, APP-Q379–APP-Q391)
//
// A real export is a deliberate, identity-confirmed action, not a background
// read: the user re-confirms their password, watches the job status, may cancel
// while it is being prepared, and can retry after a failure without ever
// receiving a duplicate or half-written archive. Everything here is scoped to
// the caller — status, expiry, and errors are private to the account.
// ═══════════════════════════════════════════════════════════════════════════════

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Re-confirm the caller's identity before preparing an export.
 * Accounts with a password must supply it; Google-only accounts confirm
 * through their signed-in session (nothing else is available to check).
 * Returns { ok, hasPassword, code } — never leaks which factor failed.
 */
async function confirmIdentity(req) {
  const hasPassword = await userHasPassword(req.user.id);
  if (!hasPassword) return { ok: true, hasPassword: false, code: null };
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!password) return { ok: false, hasPassword: true, code: 'PASSWORD_REQUIRED' };
  const valid = await verifyUserPassword(req.user.id, password);
  if (!valid) return { ok: false, hasPassword: true, code: 'INVALID_PASSWORD' };
  return { ok: true, hasPassword: true, code: null };
}

function sendIdentityFailure(res, code, hasPassword) {
  if (code === 'PASSWORD_REQUIRED') {
    return res.status(400).json({
      error: 'Confirm your password before preparing an export',
      code,
      has_password: hasPassword,
    });
  }
  return res.status(401).json({ error: 'Incorrect password', code, has_password: hasPassword });
}

/** Count-only summary — read-only, no full copy, so no re-auth needed. */
router.get('/api/user/export/summary', authRequired, async (req, res) => {
  try {
    const summary = await getExportSummary(req.user.id);
    res.json(summary);
  } catch (err) {
    console.error('Export summary error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/** Recent export jobs (newest first). Payloads are never included here. */
router.get('/api/user/export/jobs', authRequired, async (req, res) => {
  try {
    const [jobs, hasPassword] = await Promise.all([
      getExportJobs(req.user.id),
      userHasPassword(req.user.id),
    ]);
    res.json({ jobs, has_password: hasPassword, ttl_days: EXPORT_TTL_DAYS });
  } catch (err) {
    console.error('Export jobs error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * Prepare a new export. Supersedes any open job, then generates in the
 * background so the client can show status and offer cancellation.
 */
router.post('/api/user/export', authRequired, async (req, res) => {
  try {
    const identity = await confirmIdentity(req);
    if (!identity.ok) return sendIdentityFailure(res, identity.code, identity.hasPassword);

    const job = await startExportJob(req.user.id);
    void generateExportJob(job.id, req.user.id);
    res.status(201).json({ job, has_password: identity.hasPassword, ttl_days: EXPORT_TTL_DAYS });
  } catch (err) {
    console.error('Export start error:', err);
    res.status(500).json({ error: 'Could not prepare your export' });
  }
});

/** One job's status. Private to the owner. */
router.get('/api/user/export/:id', authRequired, async (req, res) => {
  try {
    const { id } = req.params;
    if (!UUID_RE.test(id)) return res.status(404).json({ error: 'Export not found', code: 'EXPORT_NOT_FOUND' });
    const job = await getExportJob(req.user.id, id);
    if (!job) return res.status(404).json({ error: 'Export not found', code: 'EXPORT_NOT_FOUND' });
    res.json({ job });
  } catch (err) {
    console.error('Export status error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/** Fetch the prepared archive. Only a completed, unexpired job has one. */
router.get('/api/user/export/:id/download', authRequired, async (req, res) => {
  try {
    const { id } = req.params;
    if (!UUID_RE.test(id)) return res.status(404).json({ error: 'Export not found', code: 'EXPORT_NOT_FOUND' });
    const { job, reason, payload } = await getExportPayload(req.user.id, id);
    if (!job) return res.status(404).json({ error: 'Export not found', code: 'EXPORT_NOT_FOUND' });
    if (reason === 'pending') {
      return res.status(409).json({ error: 'Your export is still being prepared', code: 'EXPORT_NOT_READY', job });
    }
    if (reason === 'failed') {
      return res.status(409).json({ error: 'Preparing your export failed', code: 'EXPORT_FAILED', job });
    }
    if (!payload) {
      return res.status(410).json({
        error: 'This export is no longer available',
        code: 'EXPORT_UNAVAILABLE',
        job,
      });
    }
    res.json({ job, data: payload });
  } catch (err) {
    console.error('Export download error:', err);
    res.status(500).json({ error: 'Could not open your export' });
  }
});

/** Cancel while generating. Only a pending job can be cancelled. */
router.post('/api/user/export/:id/cancel', authRequired, async (req, res) => {
  try {
    const { id } = req.params;
    if (!UUID_RE.test(id)) return res.status(404).json({ error: 'Export not found', code: 'EXPORT_NOT_FOUND' });
    const cancelled = await cancelExportJob(req.user.id, id);
    if (cancelled) return res.json({ job: cancelled });
    const job = await getExportJob(req.user.id, id);
    if (!job) return res.status(404).json({ error: 'Export not found', code: 'EXPORT_NOT_FOUND' });
    res.status(409).json({ error: 'This export can no longer be cancelled', code: 'EXPORT_NOT_CANCELLABLE', job });
  } catch (err) {
    console.error('Export cancel error:', err);
    res.status(500).json({ error: 'Could not cancel the export' });
  }
});

/**
 * Retry a failed/finished export by starting a fresh job. The previous job is
 * left untouched for history; the new job supersedes nothing download-worthy,
 * and its payload is only written on a successful generation.
 */
router.post('/api/user/export/:id/retry', authRequired, async (req, res) => {
  try {
    const { id } = req.params;
    if (!UUID_RE.test(id)) return res.status(404).json({ error: 'Export not found', code: 'EXPORT_NOT_FOUND' });
    const previous = await getExportJob(req.user.id, id);
    if (!previous) return res.status(404).json({ error: 'Export not found', code: 'EXPORT_NOT_FOUND' });
    if (!RETRYABLE_STATUSES.has(previous.status)) {
      return res.status(409).json({
        error: 'This export is still in progress',
        code: 'EXPORT_NOT_RETRYABLE',
        job: previous,
      });
    }

    const identity = await confirmIdentity(req);
    if (!identity.ok) return sendIdentityFailure(res, identity.code, identity.hasPassword);

    const job = await startExportJob(req.user.id);
    void generateExportJob(job.id, req.user.id);
    res.status(201).json({
      job,
      has_password: identity.hasPassword,
      ttl_days: EXPORT_TTL_DAYS,
      retried_from: previous.id,
    });
  } catch (err) {
    console.error('Export retry error:', err);
    res.status(500).json({ error: 'Could not prepare your export' });
  }
});

export default router;
