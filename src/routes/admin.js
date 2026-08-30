import { Router } from 'express';
import { pool } from '../config/database.js';
import { authRequired } from '../middleware/auth.js';
import { createNotification } from '../utils/notifications.js';

const router = Router();

function adminRequired(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

router.get('/api/admin/users', authRequired, adminRequired, async (_req, res) => {
  try {
    const result = await pool.query('SELECT id, full_name, email, phone, role, created_at FROM users ORDER BY created_at DESC LIMIT 100');
    res.json({ users: result.rows });
  } catch (err) {
    console.error('Admin users error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/api/admin/disputes', authRequired, adminRequired, async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT d.*, u.full_name AS raised_by_name, o.buyer_id
       FROM disputes d
       JOIN users u ON d.raised_by = u.id
       JOIN orders o ON d.order_id = o.id
       ORDER BY d.created_at DESC`
    );
    res.json({ disputes: result.rows });
  } catch (err) {
    console.error('Admin disputes error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/api/admin/disputes/:id', authRequired, adminRequired, async (req, res) => {
  const { status, resolution } = req.body;
  if (!status || !['open', 'under_review', 'resolved', 'closed'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  try {
    await pool.query(
      `UPDATE disputes SET status = $1, resolution = COALESCE($2, resolution), updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
      [status, resolution || null, req.params.id]
    );
    const disputeInfo = await pool.query(
      `SELECT d.order_id, d.raised_by, o.buyer_id FROM disputes d JOIN orders o ON d.order_id = o.id WHERE d.id = $1`,
      [req.params.id]
    );
    if (disputeInfo.rows.length > 0) {
      const { order_id, raised_by, buyer_id } = disputeInfo.rows[0];
      const sellerRes = await pool.query('SELECT seller_id FROM order_items WHERE order_id = $1 LIMIT 1', [order_id]);
      const sellerId = sellerRes.rows[0]?.seller_id;
      const msg = resolution ? `Your dispute has been ${status}. ${resolution}` : `Your dispute has been ${status}.`;
      const parties = [buyer_id, sellerId].filter(Boolean);
      for (const pid of parties) {
        createNotification(pid, 'dispute_resolved', 'Dispute Updated', msg, { disputeId: req.params.id, orderId: order_id });
      }
    }
    res.json({ updated: true });
  } catch (err) {
    console.error('Admin dispute update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
export { adminRequired };
