import { Router } from 'express';
import { pool } from '../config/database.js';
import { authRequired, dobRequired } from '../middleware/auth.js';
import { createNotification } from '../utils/notifications.js';

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════════
// SAVED ADDRESSES
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/addresses', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM saved_addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC`,
      [req.user.id]
    );
    res.json({ addresses: result.rows });
  } catch (err) {
    console.error('Addresses fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/addresses', authRequired, dobRequired, async (req, res) => {
  const { label, name, phone, address, city, isDefault } = req.body;
  if (!name || !phone || !address || !city) {
    return res.status(400).json({ error: 'Name, phone, address, and city required' });
  }
  try {
    const cleanPhone = phone.replace(/^\+/, '');
    if (isDefault) {
      await pool.query('UPDATE saved_addresses SET is_default = false WHERE user_id = $1', [req.user.id]);
    }
    const result = await pool.query(
      `INSERT INTO saved_addresses (user_id, label, name, phone, address, city, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.user.id, label || null, name, cleanPhone, address, city, isDefault || false]
    );
    res.status(201).json({ address: result.rows[0] });
  } catch (err) {
    console.error('Address create error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/addresses/:id', authRequired, async (req, res) => {
  const { label, name, phone, address, city, isDefault } = req.body;
  try {
    const check = await pool.query('SELECT id FROM saved_addresses WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Address not found' });
    const cleanPhone = phone ? phone.replace(/^\+/, '') : undefined;
    if (isDefault) {
      await pool.query('UPDATE saved_addresses SET is_default = false WHERE user_id = $1', [req.user.id]);
    }
    const result = await pool.query(
      `UPDATE saved_addresses SET label = COALESCE($1, label), name = COALESCE($2, name), phone = COALESCE($3, phone), address = COALESCE($4, address), city = COALESCE($5, city), is_default = COALESCE($6, is_default) WHERE id = $7 RETURNING *`,
      [label, name, cleanPhone, address, city, isDefault, req.params.id]
    );
    res.json({ address: result.rows[0] });
  } catch (err) {
    console.error('Address update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/addresses/:id', authRequired, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM saved_addresses WHERE id = $1 AND user_id = $2 RETURNING id', [req.params.id, req.user.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Address not found' });
    res.json({ deleted: true });
  } catch (err) {
    console.error('Address delete error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// REVIEWS & RATINGS
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/reviews', authRequired, dobRequired, async (req, res) => {
  const { orderId, rating, comment } = req.body;
  if (!orderId || !rating || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'orderId and rating (1-5) required' });
  }
  try {
    const order = await pool.query(
      "SELECT * FROM orders WHERE id = $1 AND buyer_id = $2 AND status = 'completed'",
      [orderId, req.user.id]
    );
    if (order.rows.length === 0) {
      return res.status(400).json({ error: 'Only completed orders can be reviewed' });
    }
    const sellerResult = await pool.query(
      'SELECT DISTINCT seller_id FROM order_items WHERE order_id = $1 LIMIT 1',
      [orderId]
    );
    const sellerId = sellerResult.rows[0]?.seller_id;
    if (!sellerId) return res.status(400).json({ error: 'No seller found for this order' });
    const result = await pool.query(
      `INSERT INTO reviews (order_id, reviewer_id, seller_id, rating, comment)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [orderId, req.user.id, sellerId, rating, comment || null]
    );
    const reviewer = await pool.query('SELECT full_name FROM users WHERE id = $1', [req.user.id]);
    const reviewerName = reviewer.rows[0]?.full_name || 'Someone';
    createNotification(sellerId, 'review_received', 'New Review', `${reviewerName} left a ${rating}-star review`, { orderId });
    res.status(201).json({ review: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'You already reviewed this order' });
    console.error('Review create error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/reviews/:id', authRequired, async (req, res) => {
  const { rating, comment } = req.body;
  if (rating !== undefined && (!Number.isInteger(Number(rating)) || Number(rating) < 1 || Number(rating) > 5)) {
    return res.status(400).json({ error: 'Rating must be an integer from 1 to 5' });
  }
  if (comment !== undefined && comment !== null && String(comment).length > 2000) {
    return res.status(400).json({ error: 'Comment is too long' });
  }
  try {
    const result = await pool.query(
      `UPDATE reviews SET rating = COALESCE($1, rating), comment = COALESCE($2, comment), is_edited = true, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND reviewer_id = $4 RETURNING *`,
      [rating, comment, req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Review not found' });
    res.json({ review: result.rows[0] });
  } catch (err) {
    console.error('Review update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/reviews/seller/:sellerId', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 50);
    const offset = (page - 1) * limit;
    const result = await pool.query(
      `SELECT r.*, u.full_name AS reviewer_name, u.avatar_url AS reviewer_avatar, u.username AS reviewer_username
       FROM reviews r JOIN users u ON r.reviewer_id = u.id
       WHERE r.seller_id = $1
       ORDER BY r.created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.params.sellerId, limit, offset]
    );
    const statsResult = await pool.query(
      `SELECT COALESCE(AVG(rating)::numeric(3,2), 0) AS avg_rating, COUNT(*) AS review_count FROM reviews WHERE seller_id = $1`,
      [req.params.sellerId]
    );
    res.json({ reviews: result.rows, stats: statsResult.rows[0] });
  } catch (err) {
    console.error('Seller reviews error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/reviews/product/:productId', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*, u.full_name AS reviewer_name, u.username AS reviewer_username
       FROM reviews r
       JOIN order_items oi ON r.order_id = oi.order_id
       JOIN users u ON r.reviewer_id = u.id
       WHERE oi.product_id = $1
       ORDER BY r.created_at DESC`,
      [req.params.productId]
    );
    res.json({ reviews: result.rows });
  } catch (err) {
    console.error('Product reviews error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// WISHLIST
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/wishlist/:productId', authRequired, async (req, res) => {
  try {
    const existing = await pool.query('SELECT id FROM wishlists WHERE user_id = $1 AND product_id = $2', [req.user.id, req.params.productId]);
    if (existing.rows.length > 0) {
      await pool.query('DELETE FROM wishlists WHERE id = $1', [existing.rows[0].id]);
      return res.json({ wishlisted: false });
    }
    await pool.query('INSERT INTO wishlists (user_id, product_id) VALUES ($1, $2)', [req.user.id, req.params.productId]);
    res.json({ wishlisted: true });
  } catch (err) {
    console.error('Wishlist toggle error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/wishlist', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.id, p.seller_id, p.name, p.price, p.stock,
              p.sale_price, p.sale_starts_at, p.sale_ends_at,
              (CASE WHEN p.sale_price IS NOT NULL AND (p.sale_starts_at IS NULL OR p.sale_starts_at <= NOW()) AND (p.sale_ends_at IS NULL OR p.sale_ends_at >= NOW()) THEN p.sale_price ELSE p.price END)::DECIMAL(10,2) AS effective_price,
              (CASE WHEN p.sale_price IS NOT NULL AND (p.sale_starts_at IS NULL OR p.sale_starts_at <= NOW()) AND (p.sale_ends_at IS NULL OR p.sale_ends_at >= NOW()) THEN true ELSE false END) AS is_on_sale,
              (CASE WHEN p.sale_price IS NOT NULL AND (p.sale_starts_at IS NULL OR p.sale_starts_at <= NOW()) AND (p.sale_ends_at IS NULL OR p.sale_ends_at >= NOW()) THEN ROUND((1 - p.sale_price / p.price) * 100) ELSE 0 END)::INTEGER AS discount_pct,
              (SELECT pi.image_url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.is_primary DESC, pi.display_order ASC LIMIT 1) AS image_url
       FROM wishlists w JOIN products p ON w.product_id = p.id
       WHERE w.user_id = $1
       ORDER BY w.created_at DESC`,
      [req.user.id]
    );
    res.json({ wishlist: result.rows });
  } catch (err) {
    console.error('Wishlist fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/wishlist/check/:productId', authRequired, async (req, res) => {
  try {
    const result = await pool.query('SELECT id FROM wishlists WHERE user_id = $1 AND product_id = $2', [req.user.id, req.params.productId]);
    res.json({ wishlisted: result.rows.length > 0 });
  } catch (err) {
    console.error('Wishlist check error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/wishlist/status', authRequired, async (req, res) => {
  try {
    const ids = (req.query.ids || '').split(',').filter(Boolean);
    if (ids.length === 0) return res.json({ wishlisted: {} });
    const result = await pool.query(
      'SELECT product_id FROM wishlists WHERE user_id = $1 AND product_id = ANY($2)',
      [req.user.id, ids]
    );
    const set = {};
    for (const row of result.rows) set[row.product_id] = true;
    res.json({ wishlisted: set });
  } catch (err) {
    console.error('Wishlist batch check error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// FOLLOW SELLERS
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/follow/:sellerId', authRequired, async (req, res) => {
  if (req.user.id === req.params.sellerId) return res.status(400).json({ error: 'Cannot follow yourself' });
  try {
    const existing = await pool.query('SELECT id FROM follows WHERE follower_id = $1 AND seller_id = $2', [req.user.id, req.params.sellerId]);
    if (existing.rows.length > 0) {
      await pool.query('DELETE FROM follows WHERE id = $1', [existing.rows[0].id]);
      return res.json({ following: false });
    }
    await pool.query('INSERT INTO follows (follower_id, seller_id) VALUES ($1, $2)', [req.user.id, req.params.sellerId]);
    const follower = await pool.query('SELECT full_name FROM users WHERE id = $1', [req.user.id]);
    const followerName = follower.rows[0]?.full_name || 'Someone';
    createNotification(req.params.sellerId, 'new_follower', 'New Follower', `${followerName} started following you`, { followerId: req.user.id, sellerId: req.params.sellerId });
    res.json({ following: true });
  } catch (err) {
    console.error('Follow toggle error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/following', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT f.*, u.full_name, u.avatar_url, u.seller_tier,
        EXISTS(
          SELECT 1 FROM notifications n
          WHERE n.user_id = f.follower_id
          AND n.type = 'new_product_from_followed'
          AND n.is_read = false
          AND (n.data->>'sellerId')::uuid = f.seller_id
        ) AS has_unread_activity
       FROM follows f JOIN users u ON f.seller_id = u.id
       WHERE f.follower_id = $1
       ORDER BY f.created_at DESC`,
      [req.user.id]
    );
    res.json({ following: result.rows });
  } catch (err) {
    console.error('Following fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/followers/count/:sellerId', async (req, res) => {
  try {
    const result = await pool.query('SELECT COUNT(*) AS count FROM follows WHERE seller_id = $1', [req.params.sellerId]);
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (err) {
    console.error('Followers count error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/notifications', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json({ notifications: result.rows });
  } catch (err) {
    console.error('Notifications fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/notifications/unread-count', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT COUNT(*) AS count FROM notifications WHERE user_id = $1 AND is_read = false`,
      [req.user.id]
    );
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (err) {
    console.error('Notifications unread count error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/notifications/:id/read', authRequired, async (req, res) => {
  try {
    await pool.query(
      `UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    res.json({ updated: true });
  } catch (err) {
    console.error('Notification read error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/notifications/read-all', authRequired, async (req, res) => {
  try {
    await pool.query(
      `UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false`,
      [req.user.id]
    );
    res.json({ updated: true });
  } catch (err) {
    console.error('Notification read-all error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// NEARBY SELLERS (map discovery)
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/sellers/nearby', async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng query params required' });
  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);
  if (isNaN(latNum) || isNaN(lngNum)) {
    return res.status(400).json({ error: 'Invalid lat, lng' });
  }
  try {
    const result = await pool.query(
      `SELECT u.id, u.full_name, u.avatar_url, u.store_name, u.store_logo_url,
              u.seller_tier, u.id_verified, u.use_store_identity, u.username,
              sl.lat, sl.lng,
              (6371 * acos(LEAST(1, GREATEST(-1,
                cos(radians($1)) * cos(radians(sl.lat)) *
                cos(radians(sl.lng) - radians($2)) +
                sin(radians($1)) * sin(radians(sl.lat))
              )))) AS distance_km
       FROM seller_locations sl
       JOIN users u ON u.id = sl.seller_id
       WHERE u.role = 'seller' AND sl.is_visible = true
       ORDER BY distance_km ASC`,
      [latNum, lngNum]
    );
    const filtered = result.rows;

    const sellerIds = filtered.map(r => r.id);
    if (sellerIds.length > 0) {
      const [productCounts, primaryImages, reviewStats] = await Promise.all([
        pool.query(
          `SELECT seller_id, COUNT(*) AS product_count
           FROM products WHERE seller_id = ANY($1::uuid[]) AND is_available = true
           GROUP BY seller_id`, [sellerIds]),
        pool.query(
          `SELECT DISTINCT ON (p.seller_id) p.seller_id, pi.image_url
           FROM products p JOIN product_images pi ON pi.product_id = p.id
           WHERE p.seller_id = ANY($1::uuid[]) AND p.is_available = true
           ORDER BY p.seller_id, pi.is_primary DESC, pi.display_order ASC`, [sellerIds]),
        pool.query(
          `SELECT seller_id, COALESCE(AVG(rating)::numeric(3,2), 0) AS avg_rating, COUNT(*) AS review_count
           FROM reviews WHERE seller_id = ANY($1::uuid[])
           GROUP BY seller_id`, [sellerIds])
      ]);
      const pcMap = Object.fromEntries(productCounts.rows.map(r => [r.seller_id, parseInt(r.product_count)]));
      const piMap = Object.fromEntries(primaryImages.rows.map(r => [r.seller_id, r.image_url]));
      const rsMap = Object.fromEntries(reviewStats.rows.map(r => [r.seller_id, r]));
      for (const r of filtered) {
        r.product_count = pcMap[r.id] || 0;
        r.primary_image = piMap[r.id] || null;
        r.avg_rating = parseFloat(rsMap[r.id]?.avg_rating) || 0;
        r.review_count = parseInt(rsMap[r.id]?.review_count) || 0;
      }
    }

    res.json({ sellers: filtered.map(r => ({
      ...r,
      lat: parseFloat(r.lat), lng: parseFloat(r.lng),
      distance_km: parseFloat(parseFloat(r.distance_km).toFixed(2)),
      product_count: r.product_count || 0,
      avg_rating: r.avg_rating || 0,
      review_count: r.review_count || 0,
    }))});
  } catch (err) {
    console.error('Nearby sellers error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SELLER PROFILE / STATS (used by storefront)
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/sellers/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.full_name, u.avatar_url, u.bio, u.created_at, u.store_name, u.store_logo_url,
              u.seller_tier, u.id_verified, u.id_verification_result, u.use_store_identity, u.username, u.show_real_name,
              u.location_city, u.natcash_phone, u.accepted_payment_methods,
              (SELECT COUNT(*) FROM products p WHERE p.seller_id = u.id AND p.is_available = true) AS product_count,
              (SELECT COALESCE(AVG(r.rating)::numeric(3,2), 0) FROM reviews r WHERE r.seller_id = u.id) AS avg_rating,
              (SELECT COUNT(*) FROM reviews r2 WHERE r2.seller_id = u.id) AS review_count,
              (SELECT COUNT(*) FROM order_items oi JOIN orders o ON oi.order_id = o.id WHERE oi.seller_id = u.id AND o.status = 'completed') AS sales_count
       FROM users u
       WHERE u.id = $1 AND u.role = 'seller'`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Seller not found' });
    const row = result.rows[0];
    res.json({
      seller: {
        ...row,
        product_count: parseInt(row.product_count),
        avg_rating: parseFloat(row.avg_rating),
        review_count: parseInt(row.review_count),
        sales_count: parseInt(row.sales_count),
      }
    });
  } catch (err) {
    console.error('Seller profile error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// FOLLOWERS/FOLLOWING LIST
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/users/:userId/follows/:kind', authRequired, async (req, res) => {
  const { userId, kind } = req.params;
  if (!['followers', 'following'].includes(kind)) return res.status(400).json({ error: 'Invalid follow list' });
  try {
    const result = await pool.query(
      kind === 'followers'
        ? `SELECT u.id, u.full_name, u.username, u.avatar_url, u.store_name, u.store_logo_url, u.seller_tier, u.use_store_identity
           FROM follows f JOIN users u ON u.id = f.follower_id WHERE f.seller_id = $1 ORDER BY f.created_at DESC`
        : `SELECT u.id, u.full_name, u.username, u.avatar_url, u.store_name, u.store_logo_url, u.seller_tier, u.use_store_identity
           FROM follows f JOIN users u ON u.id = f.seller_id WHERE f.follower_id = $1 ORDER BY f.created_at DESC`,
      [userId]
    );
    res.json({ users: result.rows });
  } catch (err) {
    console.error('Follow list fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
