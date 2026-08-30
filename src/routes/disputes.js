import { Router } from 'express';
import { pool } from '../config/database.js';
import { authRequired, dobRequired } from '../middleware/auth.js';
import { createNotification } from '../utils/notifications.js';
import { canAccessOrder } from '../utils/helpers.js';

const router = Router();

router.post('/api/disputes', authRequired, dobRequired, async (req, res) => {
  const { orderId, reason, description } = req.body;
  if (!orderId || !reason) return res.status(400).json({ error: 'orderId and reason required' });
  try {
    const order = await canAccessOrder(req.user.id, orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'completed' && order.status !== 'paid' && order.status !== 'processing') {
      return res.status(400).json({ error: 'Can only dispute active or completed orders' });
    }
    const existingDispute = await pool.query("SELECT 1 FROM disputes WHERE order_id = $1 AND status IN ('open', 'under_review') LIMIT 1", [orderId]);
    if (existingDispute.rows.length > 0) return res.status(400).json({ error: 'An open dispute already exists for this order' });
    const result = await pool.query(`INSERT INTO disputes (order_id, raised_by, reason, description) VALUES ($1, $2, $3, $4) RETURNING *`, [orderId, req.user.id, reason, description || null]);
    const otherPartyId = order.buyer_id === req.user.id
      ? (await pool.query('SELECT seller_id FROM order_items WHERE order_id = $1 LIMIT 1', [orderId])).rows[0]?.seller_id
      : order.buyer_id;
    if (otherPartyId) {
      const raiserName = (await pool.query('SELECT full_name FROM users WHERE id = $1', [req.user.id])).rows[0]?.full_name || 'Someone';
      createNotification(otherPartyId, 'dispute_opened', 'Dispute Opened', `${raiserName} opened a dispute on this order: ${reason}`, { disputeId: result.rows[0].id, orderId, reason });
    }
    res.status(201).json({ dispute: result.rows[0] });
  } catch (err) {
    console.error('Dispute create error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/api/disputes', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT d.*, o.status AS order_status FROM disputes d JOIN orders o ON d.order_id = o.id
       WHERE d.raised_by = $1 OR o.buyer_id = $1 OR EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = d.order_id AND oi.seller_id = $1)
       ORDER BY d.created_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json({ disputes: result.rows });
  } catch (err) {
    console.error('Disputes fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
