import { Router } from 'express';
import { pool } from '../config/database.js';
import { authRequired } from '../middleware/auth.js';
import { logOrderEvent } from '../utils/helpers.js';
import { createNotification } from '../utils/notifications.js';

const router = Router();

function sellerRequired(req, res, next) {
  if (req.user.role !== 'seller') return res.status(403).json({ error: 'Seller access required' });
  next();
}

router.post('/api/orders/:id/note', authRequired, sellerRequired, async (req, res) => {
  const { note } = req.body;
  if (!note || !note.trim()) return res.status(400).json({ error: 'Note text required' });
  try {
    const check = await pool.query(
      `SELECT o.id, o.buyer_id FROM orders o JOIN order_items oi ON o.id = oi.order_id WHERE o.id = $1 AND oi.seller_id = $2`,
      [req.params.id, req.user.id]
    );
    if (check.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    logOrderEvent(req.params.id, 'note_added', req.user.id, null, null, note.trim());
    createNotification(check.rows[0].buyer_id, 'note_from_seller', 'Note from seller', note.trim(), { orderId: req.params.id });
    res.json({ updated: true });
  } catch (err) {
    console.error('Order note error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
