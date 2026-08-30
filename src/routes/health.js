import { Router } from 'express';
import { pool, isTestMode, neonBackupDatabaseUrl } from '../config/database.js';
import { authRequired } from '../middleware/auth.js';

const router = Router();

// Health check
router.get('/api/health', async (_req, res) => {
  const result = {
    status: 'ok',
    primary: 'unknown',
    active: isTestMode ? 'test-local' : 'supabase',
    backupConfigured: Boolean(neonBackupDatabaseUrl),
  };
  try {
    await Promise.race([pool.query('SELECT 1'), new Promise((_, re) => setTimeout(() => re(new Error('timeout')), 5000))]);
    result.primary = 'connected';
  } catch { result.primary = 'down'; }
  result.status = result.primary === 'connected' ? 'ok' : 'error';
  res.status(result.status === 'ok' ? 200 : 503).json(result);
});

// Root health check (Render)
router.get('/', (_req, res) => res.status(200).json({ status: 'ok' }));

// Debug endpoint (admin only)
function adminRequired(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

router.get('/api/debug', authRequired, adminRequired, async (_req, res) => {
  try {
    const mccRes = await fetch(
      (process.env.MONCASH_PAY_CREATE_URL || 'https://api.moncashconnect.com/v1/pay-create').replace('pay-create', 'pay-balance'),
      { headers: { 'Authorization': `Bearer ${process.env.MCC_KEY || ''}` } }
    );
    const data = await mccRes.json();
    res.json({ mccStatus: mccRes.status, mccOk: mccRes.ok, data, hasKey: !!process.env.MCC_KEY });
  } catch (err) {
    res.status(500).json({ error: err.message, hasKey: !!process.env.MCC_KEY });
  }
});

export default router;
export { adminRequired };
