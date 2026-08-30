import { Router } from 'express';
import { pool } from '../config/database.js';
import { authRequired } from '../middleware/auth.js';

const router = Router();

function sellerRequired(req, res, next) {
  if (req.user.role !== 'seller') return res.status(403).json({ error: 'Seller access required' });
  next();
}

router.get('/api/seller/analytics', authRequired, sellerRequired, async (req, res) => {
  try {
    const tierCheck = await pool.query('SELECT seller_tier FROM users WHERE id = $1', [req.user.id]);
    const sellerTier = tierCheck.rows[0]?.seller_tier || 'none';
    if (sellerTier === 'casual') {
      return res.status(403).json({ error: 'Analytics are not available for Casual sellers. Upgrade to Verified for basic stats.' });
    }
    const overview = await pool.query(
      `SELECT
        COUNT(DISTINCT CASE WHEN o.status != 'cancelled' THEN o.id END) AS total_orders,
        COALESCE((SELECT SUM(e.net_amount) FROM order_escrow e JOIN orders o2 ON e.order_id = o2.id WHERE e.seller_id = $1 AND o2.status = 'completed'), 0) AS total_revenue,
        (SELECT COALESCE(AVG(r.rating)::numeric(3,2), 0) FROM reviews r WHERE r.seller_id = $1) AS avg_rating,
        (SELECT COUNT(*) FROM reviews WHERE seller_id = $1) AS review_count,
        (SELECT COUNT(*) FROM follows WHERE seller_id = $1) AS follower_count,
        (SELECT COUNT(*) FROM products WHERE seller_id = $1) AS product_count
       FROM order_items oi JOIN orders o ON oi.order_id = o.id WHERE oi.seller_id = $1`,
      [req.user.id]
    );
    let topProducts = { rows: [] };
    if (sellerTier === 'business') {
      topProducts = await pool.query(
        `SELECT p.id, p.name, p.price, p.stock,
                COALESCE(SUM(oi.quantity), 0) AS units_sold,
                COALESCE(SUM(oi.price * oi.quantity), 0) AS revenue,
                (SELECT pi.image_url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.is_primary DESC, pi.display_order ASC LIMIT 1) AS image_url
         FROM products p
         LEFT JOIN order_items oi ON oi.product_id = p.id
         LEFT JOIN orders o ON oi.order_id = o.id AND o.status != 'cancelled'
         WHERE p.seller_id = $1 GROUP BY p.id ORDER BY revenue DESC LIMIT 10`,
        [req.user.id]
      );
    }
    res.json({ overview: overview.rows[0], topProducts: topProducts.rows, sellerTier });
  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
