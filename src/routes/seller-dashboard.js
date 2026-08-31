import { Router } from 'express';
import { pool } from '../config/database.js';
import { authRequired } from '../middleware/auth.js';
import { logOrderEvent } from '../utils/helpers.js';
import { createNotification } from '../utils/notifications.js';
import { createNotification as createNotif } from '../utils/notifications.js';

const router = Router();

function sellerRequired(req, res, next) {
  if (req.user.role !== 'seller') return res.status(403).json({ error: 'Seller access required' });
  next();
}

const MAX_RADIUS_METERS = 50000;

function normalizeFulfillmentProfile(body = {}) {
  const profile = {};
  if (body.deliveryEnabled !== undefined) profile.delivery_enabled = Boolean(body.deliveryEnabled);
  if (body.meetupEnabled !== undefined) profile.meetup_enabled = Boolean(body.meetupEnabled);
  for (const [input, column] of [['deliveryRadiusMeters', 'delivery_radius_meters'], ['meetupRadiusMeters', 'meetup_radius_meters']]) {
    if (body[input] !== undefined) {
      const value = Number(body[input]);
      if (!Number.isInteger(value) || value < 100 || value > MAX_RADIUS_METERS) throw new Error(`${input} must be between 100 and ${MAX_RADIUS_METERS}`);
      profile[column] = value;
    }
  }
  if (body.deliveryFeeType !== undefined) {
    if (!['free', 'flat', 'distance'].includes(body.deliveryFeeType)) throw new Error('deliveryFeeType must be free, flat, or distance');
    profile.delivery_fee_type = body.deliveryFeeType;
  }
  if (body.flatDeliveryFee !== undefined) {
    const value = Number(body.flatDeliveryFee);
    if (!Number.isFinite(value) || value < 0) throw new Error('flatDeliveryFee must be a non-negative number');
    profile.flat_delivery_fee = value;
  }
  if (body.distanceFeeRules !== undefined) {
    if (!Array.isArray(body.distanceFeeRules) || body.distanceFeeRules.some(rule => !Number.isFinite(Number(rule?.maxDistanceMeters)) || Number(rule.maxDistanceMeters) <= 0 || !Number.isFinite(Number(rule?.fee)) || Number(rule.fee) < 0)) {
      throw new Error('distanceFeeRules must contain positive distance limits and non-negative fees');
    }
    profile.distance_fee_rules = body.distanceFeeRules
      .map(rule => ({ maxDistanceMeters: Math.round(Number(rule.maxDistanceMeters)), fee: Number(rule.fee) }))
      .sort((a, b) => a.maxDistanceMeters - b.maxDistanceMeters);
  }
  return profile;
}

// Seller-controlled fulfillment availability and pricing.  These terms are
// copied into an agreement at checkout, so later profile changes cannot alter
// a buyer's accepted commitment.
router.get('/api/seller/fulfillment-profile', authRequired, sellerRequired, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM seller_fulfillment_profiles WHERE seller_id = $1', [req.user.id]);
    const row = result.rows[0] || {};
    res.json({
      deliveryEnabled: row.delivery_enabled ?? false,
      meetupEnabled: row.meetup_enabled ?? false,
      deliveryRadiusMeters: row.delivery_radius_meters ?? 5000,
      meetupRadiusMeters: row.meetup_radius_meters ?? 12000,
      deliveryFeeType: row.delivery_fee_type ?? 'flat',
      flatDeliveryFee: Number(row.flat_delivery_fee ?? 0),
      distanceFeeRules: row.distance_fee_rules ?? [],
    });
  } catch (err) {
    console.error('Fulfillment profile fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/api/seller/fulfillment-profile', authRequired, sellerRequired, async (req, res) => {
  try {
    const profile = normalizeFulfillmentProfile(req.body);
    if (Object.keys(profile).length === 0) return res.status(400).json({ error: 'No fulfillment settings supplied' });
    const columns = Object.keys(profile);
    const values = Object.values(profile).map(value => typeof value === 'object' ? JSON.stringify(value) : value);
    const insertColumns = ['seller_id', ...columns];
    const placeholders = insertColumns.map((_, index) => `$${index + 1}`);
    const updates = columns.map(column => `${column} = EXCLUDED.${column}`).concat('updated_at = CURRENT_TIMESTAMP');
    await pool.query(
      `INSERT INTO seller_fulfillment_profiles (${insertColumns.join(', ')}) VALUES (${placeholders.join(', ')})
       ON CONFLICT (seller_id) DO UPDATE SET ${updates.join(', ')}`,
      [req.user.id, ...values]
    );
    const result = await pool.query('SELECT * FROM seller_fulfillment_profiles WHERE seller_id = $1', [req.user.id]);
    const row = result.rows[0];
    res.json({ deliveryEnabled: row.delivery_enabled, meetupEnabled: row.meetup_enabled, deliveryRadiusMeters: row.delivery_radius_meters, meetupRadiusMeters: row.meetup_radius_meters, deliveryFeeType: row.delivery_fee_type, flatDeliveryFee: Number(row.flat_delivery_fee), distanceFeeRules: row.distance_fee_rules });
  } catch (err) {
    const status = err.message?.includes('must be') || err.message?.includes('settings') ? 400 : 500;
    if (status === 500) console.error('Fulfillment profile update error:', err);
    res.status(status).json({ error: err.message || 'Server error' });
  }
});

// Seller location
router.get('/api/seller/location', authRequired, sellerRequired, async (req, res) => {
  try {
    const result = await pool.query('SELECT lat, lng, is_visible FROM seller_locations WHERE seller_id = $1', [req.user.id]);
    if (result.rows.length === 0) return res.json({ lat: null, lng: null, isVisible: false });
    const row = result.rows[0];
    res.json({ lat: row.lat, lng: row.lng, isVisible: row.is_visible });
  } catch (err) {
    console.error('Seller location fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/api/seller/location', authRequired, sellerRequired, async (req, res) => {
  const { lat, lng, isVisible } = req.body;
  if (isVisible !== undefined && lat == null && lng == null) {
    try {
      const existing = await pool.query('SELECT seller_id FROM seller_locations WHERE seller_id = $1', [req.user.id]);
      if (existing.rows.length === 0) return res.status(400).json({ error: 'No location set. Enable location first.' });
      await pool.query('UPDATE seller_locations SET is_visible = $1, updated_at = CURRENT_TIMESTAMP WHERE seller_id = $2', [Boolean(isVisible), req.user.id]);
      return res.json({ ok: true, isVisible: Boolean(isVisible) });
    } catch (err) {
      console.error('Seller visibility toggle error:', err);
      return res.status(500).json({ error: 'Server error' });
    }
  }
  if (lat == null || lng == null) return res.status(400).json({ error: 'lat and lng required' });
  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);
  if (isNaN(latNum) || isNaN(lngNum)) return res.status(400).json({ error: 'Invalid coordinates' });
  if (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) return res.status(400).json({ error: 'Coordinates out of range' });
  try {
    const visible = isVisible !== undefined ? Boolean(isVisible) : true;
    await pool.query(
      `INSERT INTO seller_locations (seller_id, lat, lng, is_visible, updated_at) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
       ON CONFLICT (seller_id) DO UPDATE SET lat = $2, lng = $3, is_visible = $4, updated_at = CURRENT_TIMESTAMP`,
      [req.user.id, latNum, lngNum, visible]
    );
    res.json({ ok: true, lat: latNum, lng: lngNum, isVisible: visible });
  } catch (err) {
    console.error('Seller location update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Seller products
router.get('/api/seller/products', authRequired, sellerRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, c.name AS category,
              (CASE WHEN p.sale_price IS NOT NULL AND (p.sale_starts_at IS NULL OR p.sale_starts_at <= NOW()) AND (p.sale_ends_at IS NULL OR p.sale_ends_at >= NOW()) THEN p.sale_price ELSE p.price END)::DECIMAL(10,2) AS effective_price,
              COALESCE(like_counts.like_count, 0) AS like_count,
              COALESCE(wishlist_counts.wishlist_count, 0) AS wishlist_count,
              COALESCE((SELECT json_agg(json_build_object('id', pi.id, 'image_url', pi.image_url, 'thumbnail_url', pi.thumbnail_url, 'is_primary', pi.is_primary, 'display_order', pi.display_order, 'image_width', pi.image_width, 'image_height', pi.image_height) ORDER BY pi.is_primary DESC, pi.display_order ASC) FROM product_images pi WHERE pi.product_id = p.id), '[]'::json) AS images
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN (SELECT product_id, COUNT(*) AS like_count FROM feed_events WHERE event_type = 'like' GROUP BY product_id) like_counts ON like_counts.product_id = p.id
       LEFT JOIN (SELECT product_id, COUNT(*) AS wishlist_count FROM wishlists GROUP BY product_id) wishlist_counts ON wishlist_counts.product_id = p.id
       WHERE p.seller_id = $1 ORDER BY p.created_at DESC LIMIT 100`,
      [req.user.id]
    );
    res.json({ products: result.rows });
  } catch (err) {
    console.error('Seller products error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Seller orders
router.get('/api/seller/orders', authRequired, sellerRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT o.*, u.full_name AS buyer_name, u.phone AS buyer_phone, 'seller' AS my_role,
              (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) AS item_count,
              (SELECT p.name FROM order_items oi2 JOIN products p ON oi2.product_id = p.id WHERE oi2.order_id = o.id ORDER BY oi2.id LIMIT 1) AS first_product_name,
              (SELECT COALESCE(pi.thumbnail_url, pi.image_url) FROM order_items oi3 JOIN product_images pi ON oi3.product_id = pi.product_id WHERE oi3.order_id = o.id AND pi.is_primary = true ORDER BY oi3.id, pi.display_order ASC LIMIT 1) AS product_image
       FROM orders o JOIN order_items oi ON o.id = oi.order_id JOIN users u ON o.buyer_id = u.id
       WHERE oi.seller_id = $1 GROUP BY o.id, u.full_name, u.phone ORDER BY o.created_at DESC LIMIT 100`,
      [req.user.id]
    );
    res.json({ orders: result.rows });
  } catch (err) {
    console.error('Seller orders error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update order status
router.put('/api/seller/orders/:id/status', authRequired, sellerRequired, async (req, res) => {
  const { status } = req.body;
  const allowed = ['paid', 'processing', 'shipped', 'delivered'];
  if (!allowed.includes(status)) return res.status(400).json({ error: `Status must be one of: ${allowed.join(', ')}` });
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const check = await client.query(
        `SELECT o.id, o.status, o.delivery_method FROM orders o JOIN order_items oi ON o.id = oi.order_id WHERE o.id = $1 AND oi.seller_id = $2 FOR UPDATE`,
        [req.params.id, req.user.id]
      );
      if (check.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Order not found' }); }
      const current = check.rows[0].status;
      const deliveryMethod = check.rows[0].delivery_method;
      if (deliveryMethod === 'meetup' && (status === 'shipped' || status === 'delivered')) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Meetup orders are completed via the QR exchange flow, not status updates' });
      }
      const transitions = { paid: 'processing', processing: 'shipped', shipped: 'delivered' };
      if (transitions[current] !== status) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Cannot transition from ${current} to ${status}` });
      }
      await client.query('UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [status, req.params.id]);
      await logOrderEvent(req.params.id, 'status_change', req.user.id, current, status, 'Seller updated status', client);
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    const orderInfo = await pool.query('SELECT buyer_id FROM orders WHERE id = $1', [req.params.id]);
    if (orderInfo.rows.length > 0) {
      createNotif(orderInfo.rows[0].buyer_id, 'order_status', 'Order Updated', `Your order is now: ${status}`, { orderId: req.params.id });
    }
    res.json({ updated: true, status });
  } catch (err) {
    console.error('Order status update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
