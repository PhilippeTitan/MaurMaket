import { Router } from 'express';
import { pool } from '../config/database.js';
import { authRequired } from '../middleware/auth.js';

const router = Router();

function sellerRequired(req, res, next) {
  if (req.user.role !== 'seller') {
    return res.status(403).json({ error: 'Seller access required' });
  }
  next();
}

// Low stock alerts
router.get('/api/seller/products/low-stock', authRequired, sellerRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM products WHERE seller_id = $1 AND stock <= 3 AND is_available = true ORDER BY stock ASC`,
      [req.user.id]
    );
    res.json({ products: result.rows });
  } catch (err) {
    console.error('Low stock error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
