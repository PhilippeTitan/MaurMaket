import { Router } from 'express';
import { pool, isTestMode, neonBackupDatabaseUrl } from '../config/database.js';
import { authRequired } from '../middleware/auth.js';

const router = Router();
const startedAt = Date.now();

// Health check
router.get('/api/health', async (_req, res) => {
  const uptimeMs = Date.now() - startedAt;
  const uptimeSec = Math.floor(uptimeMs / 1000);
  const result = {
    status: 'ok',
    primary: 'unknown',
    active: isTestMode ? 'test-local' : 'supabase',
    backupConfigured: Boolean(neonBackupDatabaseUrl),
    uptime: uptimeSec,
    uptimeHuman: uptimeSec < 60 ? `${uptimeSec}s`
      : uptimeSec < 3600 ? `${Math.floor(uptimeSec / 60)}m ${uptimeSec % 60}s`
      : `${Math.floor(uptimeSec / 3600)}h ${Math.floor((uptimeSec % 3600) / 60)}m`,
    startedAt: new Date(startedAt).toISOString(),
    node: process.version,
    memMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
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
