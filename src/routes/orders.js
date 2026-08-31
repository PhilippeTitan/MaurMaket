import { Router } from 'express';
import crypto from 'crypto';
import { pool } from '../config/database.js';
import { authRequired, dobRequired } from '../middleware/auth.js';
import { createNotification } from '../utils/notifications.js';
import { logOrderEvent, canAccessOrder, processRefundPayout } from '../utils/helpers.js';

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════════
// MEETUP CONSTANTS + HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

const MEETUP_CODE_TTL_MS = 30 * 60 * 1000;
const MAX_MEETUP_CODE_ATTEMPTS = 5;

function generateMeetupCode() {
  return String(crypto.randomInt(1000, 10000));
}

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ═══════════════════════════════════════════════════════════════════════════════
// ORDER ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// Literal routes must be registered before /:id, otherwise Express treats
// "active-count" as an order UUID and the database rejects it.
router.get('/orders/active-count', authRequired, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT COUNT(DISTINCT o.id)::int AS count FROM orders o
       JOIN order_items oi ON o.id = oi.order_id
       WHERE (o.buyer_id = $1 OR oi.seller_id = $1)
         AND o.status IN ('pending','paid','processing','shipped')`,
      [req.user.id]
    );
    res.json({ count: r.rows[0]?.count || 0 });
  } catch (err) {
    console.error('Active orders count error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/orders/:id', authRequired, async (req, res) => {
  try {
    const order = await canAccessOrder(req.user.id, req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const items = await pool.query(
      `SELECT oi.*, p.name AS product_name, p.price AS product_price,
              pi.image_url AS product_image
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.is_primary = true
       WHERE oi.order_id = $1`,
      [req.params.id]
    );
    const myRole = order.buyer_id === req.user.id ? 'buyer' : 'seller';

    // Get ALL sellers in this order (not just the first one)
    const sellersResult = await pool.query(
      `SELECT DISTINCT seller_id FROM order_items WHERE order_id = $1`,
      [req.params.id]
    );
    const sellerIds = sellersResult.rows.map(r => r.seller_id);

    // Get other party info — for buyer show all sellers, for seller show buyer
    let otherParty = null;
    let otherSellers = [];
    if (myRole === 'buyer') {
      const sellerUsers = await pool.query(
        `SELECT id, full_name, phone, natcash_phone FROM users WHERE id = ANY($1)`,
        [sellerIds]
      );
      otherSellers = sellerUsers.rows;
      otherParty = otherSellers[0] || null; // backward compat: first seller
    } else {
      const buyerRes = await pool.query(
        `SELECT id, full_name, phone FROM users WHERE id = $1`,
        [order.buyer_id]
      );
      otherParty = buyerRes.rows[0] || null;
    }

    // Get escrow for ALL sellers (not just the first one)
    const escrowResult = await pool.query(
      `SELECT seller_id, gross_amount, commission_amount, net_amount, status AS escrow_status
       FROM order_escrow WHERE order_id = $1`,
      [req.params.id]
    );

    // Get seller fulfillments (payment + fulfillment status per seller)
    const fulfillmentsResult = await pool.query(
      `SELECT * FROM seller_fulfillments WHERE order_id = $1`,
      [req.params.id]
    );

    res.json({
      order: {
        ...order,
        items: items.rows,
        my_role: myRole,
        other_party: otherParty,
        other_sellers: otherSellers.length > 0 ? otherSellers : undefined,
        seller_count: sellerIds.length,
        escrow: escrowResult.rows,
        seller_fulfillments: fulfillmentsResult.rows,
      }
    });
  } catch (err) {
    console.error('Order fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/orders/:id/timeline', authRequired, async (req, res) => {
  try {
    const order = await canAccessOrder(req.user.id, req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const result = await pool.query(
      `SELECT e.*, u.full_name AS actor_name
       FROM order_events e
       LEFT JOIN users u ON e.actor_id = u.id
       WHERE e.order_id = $1
       ORDER BY e.created_at ASC`,
      [req.params.id]
    );
    res.json({ events: result.rows });
  } catch (err) {
    console.error('Timeline fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/orders', authRequired, async (req, res) => {
  try {
    const buyerOrders = await pool.query(
      `SELECT * FROM (
        SELECT DISTINCT ON (o.id) o.*,
                u.full_name AS seller_name, u.phone AS seller_phone, u.natcash_phone,
                'buyer' AS my_role,
                (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) AS item_count,
                (SELECT p.name FROM order_items oi2 JOIN products p ON oi2.product_id = p.id WHERE oi2.order_id = o.id ORDER BY oi2.id LIMIT 1) AS first_product_name,
                (SELECT COALESCE(pi.thumbnail_url, pi.image_url) FROM order_items oi3 JOIN product_images pi ON oi3.product_id = pi.product_id WHERE oi3.order_id = o.id AND pi.is_primary = true ORDER BY oi3.id, pi.display_order ASC LIMIT 1) AS product_image
         FROM orders o
         JOIN order_items oi ON o.id = oi.order_id
         JOIN users u ON oi.seller_id = u.id
         WHERE o.buyer_id = $1
         ORDER BY o.id, o.created_at DESC
       ) sub ORDER BY sub.created_at DESC`,
      [req.user.id]
    );
    const sellerOrders = await pool.query(
      `SELECT * FROM (
        SELECT DISTINCT ON (o.id) o.*, u.full_name AS buyer_name, u.phone AS buyer_phone,
                'seller' AS my_role,
                (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) AS item_count,
                (SELECT p.name FROM order_items oi2 JOIN products p ON oi2.product_id = p.id WHERE oi2.order_id = o.id ORDER BY oi2.id LIMIT 1) AS first_product_name,
                (SELECT COALESCE(pi.thumbnail_url, pi.image_url) FROM order_items oi3 JOIN product_images pi ON oi3.product_id = pi.product_id WHERE oi3.order_id = o.id AND pi.is_primary = true ORDER BY oi3.id, pi.display_order ASC LIMIT 1) AS product_image
         FROM orders o
         JOIN order_items oi ON o.id = oi.order_id
         JOIN users u ON o.buyer_id = u.id
         WHERE oi.seller_id = $1
         ORDER BY o.id, o.created_at DESC
       ) sub ORDER BY sub.created_at DESC`,
      [req.user.id]
    );
    res.json({ buyerOrders: buyerOrders.rows, sellerOrders: sellerOrders.rows });
  } catch (err) {
    console.error('Orders error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Deferred checkout ──────────────────────────────────────────────────────

router.post('/checkout/pending', authRequired, async (req, res) => {
  const { cart, deliveryMethod, deliveryName, deliveryPhone, deliveryAddress, deliveryCity, deliveryNote, meetupLat, meetupLng, meetupAddress, meetupName, paymentMethod, promoCode, totalAmount } = req.body;
  if (!cart || !Array.isArray(cart) || cart.length === 0) return res.status(400).json({ error: 'Cart is empty' });

  try {
    const result = await pool.query(
      `INSERT INTO pending_checkouts (user_id, cart_data, delivery_method, delivery_name, delivery_phone, delivery_address, delivery_city, delivery_note, meetup_lat, meetup_lng, meetup_address, meetup_name, payment_method, promo_code, total_amount)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING id`,
      [req.user.id, JSON.stringify(cart), deliveryMethod, deliveryName || null, deliveryPhone || null, deliveryAddress || null, deliveryCity || null, deliveryNote || null, meetupLat || null, meetupLng || null, meetupAddress || null, meetupName || null, paymentMethod || 'moncash', promoCode || null, totalAmount || 0]
    );
    const pendingId = result.rows[0].id;

    // Reserve stock for each item (expires in 15 minutes)
    const reservationExpiry = new Date(Date.now() + 15 * 60 * 1000);
    for (const item of cart) {
      const productId = item.id || item.productId;
      if (!productId) continue;
      try {
        const stockCheck = await pool.query('SELECT stock FROM products WHERE id = $1 FOR UPDATE', [productId]);
        if (stockCheck.rows.length > 0 && stockCheck.rows[0].stock < (item.quantity || 1)) {
          // Insufficient stock — roll back the checkout
          await pool.query("UPDATE pending_checkouts SET status = 'expired' WHERE id = $1", [pendingId]);
          return res.status(400).json({ error: `Insufficient stock for "${item.name || productId}"` });
        }
        await pool.query('UPDATE products SET stock = stock - $1 WHERE id = $2', [item.quantity || 1, productId]);
        await pool.query(
          `INSERT INTO stock_reservations (checkout_id, product_id, quantity, expires_at, status)
           VALUES ($1, $2, $3, $4, 'active')`,
          [pendingId, productId, item.quantity || 1, reservationExpiry]
        );
      } catch (e) {
        console.error(`Stock reservation failed for ${productId}:`, e.message);
      }
    }

    if (paymentMethod === 'natcash') {
      return res.json({ pendingId, paymentMethod: 'natcash' });
    }

    const referenceId = pendingId;
    const moncashRes = await fetch(
      process.env.MONCASH_PAY_CREATE_URL || 'https://hvlmeoqyxaguzcujpmit.supabase.co/functions/v1/pay-create',
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.MCC_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Math.round(parseFloat(totalAmount)),
          referenceId,
          returnUrl: `${process.env.PRODUCTION_URL || 'https://maurmaket.onrender.com'}/payment/return?pending=${pendingId}`,
        }),
        signal: AbortSignal.timeout(15000),
      }
    );
    if (!moncashRes.ok) {
      const errText = await moncashRes.text();
      console.error(`MonCashConnect HTTP ${moncashRes.status}:`, errText);
      return res.status(502).json({ error: 'Payment provider error' });
    }
    const data = await moncashRes.json();
    if (!data.paymentUrl) return res.status(502).json({ error: 'Payment provider error' });

    await pool.query('UPDATE pending_checkouts SET moncash_reference = $1 WHERE id = $2', [referenceId, pendingId]);
    res.json({ paymentUrl: data.paymentUrl, pendingId });
  } catch (err) {
    console.error('Pending checkout error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/checkout/pending/:id/status', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, status, created_at FROM pending_checkouts WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const pc = result.rows[0];
    const age = Date.now() - new Date(pc.created_at).getTime();
    if (pc.status === 'pending' && age > 30 * 60 * 1000) {
      await pool.query("UPDATE pending_checkouts SET status = 'expired' WHERE id = $1", [req.params.id]);
      // Release reserved stock
      const reservations = await pool.query('SELECT product_id, quantity FROM stock_reservations WHERE checkout_id = $1 AND status = $2', [req.params.id, 'active']);
      for (const r of reservations.rows) {
        await pool.query('UPDATE products SET stock = stock + $1 WHERE id = $2', [r.quantity, r.product_id]);
      }
      await pool.query("UPDATE stock_reservations SET status = 'released', released_at = CURRENT_TIMESTAMP WHERE checkout_id = $1 AND status = 'active'", [req.params.id]);
      return res.json({ status: 'expired' });
    }
    if (pc.status === 'completed') {
      const orderRes = await pool.query(
        'SELECT id FROM orders WHERE buyer_id = $1 AND created_at >= $2 ORDER BY created_at DESC LIMIT 1',
        [req.user.id, pc.created_at]
      );
      return res.json({ status: 'completed', orderId: orderRes.rows[0]?.id });
    }
    res.json({ status: pc.status });
  } catch (err) {
    console.error('Pending checkout status error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/checkout/pending/:id/seller-info', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT cart_data FROM pending_checkouts WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const cartData = result.rows[0].cart_data;

    // Group cart items by seller
    const sellerMap = new Map();
    for (const item of cartData) {
      const sid = item.seller_id;
      if (!sid) continue;
      if (!sellerMap.has(sid)) {
        sellerMap.set(sid, { sellerId: sid, items: [], total: 0, name: item.store_name || item.seller_name || 'Seller' });
      }
      const entry = sellerMap.get(sid);
      entry.items.push({ name: item.name, price: item.price, quantity: item.quantity });
      entry.total += (item.price || 0) * (item.quantity || 1);
    }
    const sellerIds = [...sellerMap.keys()];
    if (sellerIds.length === 0) return res.json({ sellers: [], sellerCount: 0 });

    const sellerRes = await pool.query(
      'SELECT id, full_name, phone, natcash_phone FROM users WHERE id = ANY($1)',
      [sellerIds]
    );
    for (const s of sellerRes.rows) {
      const entry = sellerMap.get(s.id);
      if (entry) {
        entry.name = s.full_name;
        entry.phone = s.natcash_phone || s.phone || '';
      }
    }

    res.json({
      sellers: [...sellerMap.values()],
      sellerCount: sellerMap.size,
      totalAmount: cartData.reduce((sum, i) => sum + (i.price || 0) * (i.quantity || 1), 0),
    });
  } catch (err) {
    console.error('Pending checkout seller-info error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── NatCash confirm ────────────────────────────────────────────────────────

router.post('/checkout/pending/:id/confirm-natcash', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM pending_checkouts WHERE id = $1 AND user_id = $2 AND status = 'pending'",
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      const done = await pool.query(
        "SELECT status FROM pending_checkouts WHERE id = $1 AND user_id = $2",
        [req.params.id, req.user.id]
      );
      if (done.rows.length > 0 && done.rows[0].status === 'completed') {
        const orderRes = await pool.query(
          'SELECT id FROM orders WHERE buyer_id = $1 AND created_at >= $2 ORDER BY created_at DESC LIMIT 1',
          [req.user.id, done.rows[0].created_at || new Date()]
        );
        return res.json({ orderId: orderRes.rows[0]?.id, alreadyConfirmed: true });
      }
      return res.status(404).json({ error: 'Pending checkout not found or expired' });
    }
    const pc = result.rows[0];
    const { smsData } = req.body || {};

    // Idempotency: if already confirmed by this exact SMS transcode, skip
    const idempotencyKey = smsData?.transcode ? `natcash_${pc.id}_${smsData.transcode}` : null;
    if (idempotencyKey) {
      const existing = await pool.query(
        "SELECT order_id FROM seller_fulfillments WHERE idempotency_key = $1",
        [idempotencyKey]
      );
      if (existing.rows.length > 0) {
        return res.json({ orderId: existing.rows[0].order_id, alreadyConfirmed: true });
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const cartData = pc.cart_data;

      // Use cart_data prices (locked at checkout time) — do NOT re-fetch from DB
      let totalAmount = 0;
      for (const item of cartData) {
        const price = item.price || 0;
        totalAmount += price * (item.quantity || 1);
      }

      // Apply promo if present
      let discountAmount = 0;
      if (pc.promo_code) {
        try {
          const promoRes = await client.query('SELECT discount_type, discount_value FROM promo_codes WHERE code = $1 AND is_active = true FOR UPDATE', [pc.promo_code]);
          if (promoRes.rows.length > 0) {
            const promo = promoRes.rows[0];
            discountAmount = promo.discount_type === 'percentage' ? totalAmount * (promo.discount_value / 100) : Math.min(promo.discount_value, totalAmount);
            totalAmount = Math.max(0, totalAmount - discountAmount);
          }
        } catch { /* ignore */ }
      }

      const orderRes = await client.query(
        `INSERT INTO orders (buyer_id, total_amount, status, payment_method, delivery_method, delivery_name, delivery_phone, delivery_address, delivery_city, delivery_note, meetup_lat, meetup_lng, meetup_address, meetup_name)
         VALUES ($1, $2, 'paid', 'natcash', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
        [pc.user_id, totalAmount, pc.delivery_method, pc.delivery_name, pc.delivery_phone, pc.delivery_address, pc.delivery_city, pc.delivery_note, pc.meetup_lat, pc.meetup_lng, pc.meetup_address, pc.meetup_name]
      );
      const orderId = orderRes.rows[0].id;

      // Create order_items with LOCKED prices from cart_data
      const sellerIds = new Set();
      for (const item of cartData) {
        const prodRes = await client.query('SELECT seller_id FROM products WHERE id = $1', [item.productId || item.id]);
        if (prodRes.rows.length > 0) {
          const sellerId = prodRes.rows[0].seller_id;
          sellerIds.add(sellerId);
          const lockedPrice = item.price || 0;
          await client.query(
            'INSERT INTO order_items (order_id, product_id, seller_id, quantity, price) VALUES ($1, $2, $3, $4, $5)',
            [orderId, item.productId || item.id, sellerId, item.quantity || 1, lockedPrice]
          );
          // Stock was already decremented at checkout creation — confirm the reservation
          await client.query(
            "UPDATE stock_reservations SET status = 'confirmed' WHERE checkout_id = $1 AND product_id = $2 AND status = 'active'",
            [pc.id, item.productId || item.id]
          );
        }
      }

      // Create seller_fulfillments for each seller
      for (const sellerId of sellerIds) {
        await client.query(
          `INSERT INTO seller_fulfillments (order_id, seller_id, payment_status, fulfillment_status, payment_method, payment_reference, idempotency_key)
           VALUES ($1, $2, 'verified', 'pending', 'natcash', $3, $4)
           ON CONFLICT (order_id, seller_id) DO NOTHING`,
          [orderId, sellerId, smsData?.transcode || null, idempotencyKey]
        );
      }

      // Record payment event
      const smsNote = smsData ? `NatCash transfer confirmed (transcode: ${smsData.transcode})` : 'NatCash transfer confirmed (SMS detected)';
      await client.query(
        "INSERT INTO order_events (order_id, event_type, actor_id, note) VALUES ($1, 'payment_received', $2, $3)",
        [orderId, pc.user_id, smsNote]
      );
      await client.query("UPDATE pending_checkouts SET status = 'completed' WHERE id = $1", [pc.id]);
      await client.query('COMMIT');
      console.log(`NatCash: created order ${orderId} from pending checkout ${pc.id} (${sellerIds.size} sellers)`);
      res.json({ orderId });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('NatCash confirm error:', err);
      res.status(500).json({ error: 'Server error' });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('NatCash confirm-natcash error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── NatCash per-seller confirm ─────────────────────────────────────────────
// For multi-seller orders: buyer pays each seller individually via USSD
router.post('/orders/:id/confirm-natcash-seller', authRequired, async (req, res) => {
  try {
    const { sellerId, smsData } = req.body || {};
    if (!sellerId) return res.status(400).json({ error: 'sellerId required' });

    const order = await canAccessOrder(req.user.id, req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.buyer_id !== req.user.id) return res.status(403).json({ error: 'Only buyer can confirm' });
    if (order.payment_method !== 'natcash') return res.status(400).json({ error: 'Not a NatCash order' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Lock the seller_fulfillment row
      const sfRes = await client.query(
        "SELECT * FROM seller_fulfillments WHERE order_id = $1 AND seller_id = $2 FOR UPDATE",
        [req.params.id, sellerId]
      );
      if (sfRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Seller fulfillment not found' });
      }
      const sf = sfRes.rows[0];
      if (sf.payment_status !== 'pending') {
        await client.query('ROLLBACK');
        return res.json({ success: true, alreadyClaimed: true, paymentStatus: sf.payment_status });
      }

      // Idempotency check
      const idempotencyKey = smsData?.transcode ? `natcash_${req.params.id}_${sellerId}_${smsData.transcode}` : null;
      if (idempotencyKey && sf.idempotency_key === idempotencyKey) {
        await client.query('ROLLBACK');
        return res.json({ success: true, alreadyClaimed: true });
      }

      const smsNote = smsData
        ? `NatCash payment claimed (transcode: ${smsData.transcode}, seller: ${sellerId})`
        : `NatCash payment claimed by buyer (seller: ${sellerId})`;

      await client.query(
        `UPDATE seller_fulfillments
         SET payment_status = 'buyer_claimed',
             payment_reference = $3,
             claimed_at = CURRENT_TIMESTAMP,
             idempotency_key = COALESCE($4, idempotency_key),
             updated_at = CURRENT_TIMESTAMP
         WHERE order_id = $1 AND seller_id = $2 AND payment_status = 'pending'`,
        [req.params.id, sellerId, smsData?.transcode || null, idempotencyKey]
      );

      await client.query(
        "INSERT INTO order_events (order_id, event_type, actor_id, note) VALUES ($1, 'payment_received', $2, $3)",
        [req.params.id, req.user.id, smsNote]
      );

      // Check if all sellers have claimed payment
      const allClaimed = await client.query(
        `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE payment_status = 'buyer_claimed' OR payment_status = 'verified') AS claimed
         FROM seller_fulfillments WHERE order_id = $1`,
        [req.params.id]
      );
      const { total, claimed } = allClaimed.rows[0];
      if (parseInt(total) === parseInt(claimed) && parseInt(total) > 0) {
        // All sellers claimed → move order to active
        await client.query("UPDATE orders SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'pending'", [req.params.id]);
      } else if (parseInt(claimed) > 0) {
        // At least one seller claimed → order is active
        await client.query("UPDATE orders SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'pending'", [req.params.id]);
      }

      await client.query('COMMIT');

      // Notify the seller
      createNotification(sellerId, 'payment_received', 'Payment Claimed', 'A buyer has confirmed they sent payment. Verify and process the order.', { orderId: req.params.id });

      // Get updated fulfillment status
      const updated = await pool.query('SELECT * FROM seller_fulfillments WHERE order_id = $1 AND seller_id = $2', [req.params.id, sellerId]);
      res.json({ success: true, fulfillment: updated.rows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('NatCash per-seller confirm error:', err);
      res.status(500).json({ error: 'Server error' });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('NatCash per-seller confirm error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/payments/abandoned', authRequired, async (req, res) => {
  try {
    const { pendingId, orderId } = req.body;
    await createNotification(
      req.user.id, 'payment_failed', 'Payment not completed',
      'Your payment was not processed. Your items are still in your cart.',
      { orderId: orderId || pendingId }
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Abandoned payment notification error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Create Order ──────────────────────────────────────────────────────────

router.post('/orders', authRequired, dobRequired, async (req, res) => {
  const evCheck = await pool.query('SELECT email_verified FROM users WHERE id = $1', [req.user.id]);
  if (!evCheck.rows[0]?.email_verified) {
    return res.status(403).json({ error: 'email_not_verified', message: 'Please verify your email to place orders.' });
  }
  const { items, deliveryMethod, deliveryName, deliveryPhone, deliveryAddress, deliveryCity, deliveryNote, promoCode, meetupLat, meetupLng, meetupAddress, meetupName } = req.body;
  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'Cart is empty' });
  }
  for (const item of items) {
    if (!item.productId) return res.status(400).json({ error: 'Each item must have a productId' });
    const qty = parseInt(item.quantity);
    if (!qty || qty < 1) return res.status(400).json({ error: 'Quantity must be at least 1' });
    if (qty > 999) return res.status(400).json({ error: 'Quantity too high (max 999)' });
  }
  const method = deliveryMethod === 'delivery' ? 'delivery' : 'meetup';
  if (method === 'delivery') {
    if (!deliveryName || !deliveryName.trim()) return res.status(400).json({ error: 'Delivery name is required' });
    if (!deliveryPhone || !deliveryPhone.trim()) return res.status(400).json({ error: 'Delivery phone is required' });
    if (!deliveryAddress || !deliveryAddress.trim()) return res.status(400).json({ error: 'Delivery address is required' });
    if (!deliveryCity || !deliveryCity.trim()) return res.status(400).json({ error: 'Delivery city is required' });
    if (deliveryName.length > 100) return res.status(400).json({ error: 'Name too long' });
    if (deliveryPhone.length > 20) return res.status(400).json({ error: 'Phone too long' });
    if (deliveryAddress.length > 200) return res.status(400).json({ error: 'Address too long' });
    if (deliveryCity.length > 100) return res.status(400).json({ error: 'City too long' });
  } else {
    const latitude = Number(meetupLat);
    const longitude = Number(meetupLng);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180 || !meetupAddress?.trim()) {
      return res.status(400).json({ error: 'Meetup coordinates and address are required' });
    }
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let total = 0;
    const orderItems = [];

    for (const item of items) {
      const prod = await client.query('SELECT id, price, sale_price, sale_starts_at, sale_ends_at, seller_id, stock FROM products WHERE id = $1 AND is_available = TRUE FOR UPDATE', [item.productId]);
      if (prod.rows.length === 0) {
        throw new Error(`Product ${item.productId} not found or unavailable`);
      }
      if (prod.rows[0].seller_id === req.user.id) {
        throw new Error(`You cannot purchase your own product`);
      }
      if (prod.rows[0].stock < (item.quantity || 1)) {
        throw new Error(`Insufficient stock for product ${item.productId}`);
      }
      const p = prod.rows[0];
      let price;
      const offerCheck = await client.query(
        `SELECT mo.offered_price FROM message_offers mo
         WHERE mo.product_id = $1 AND mo.buyer_id = $2 AND mo.status = 'accepted'
         AND mo.responded_at IS NOT NULL
         ORDER BY mo.responded_at DESC LIMIT 1
         FOR UPDATE`,
        [item.productId, req.user.id]
      );
      if (offerCheck.rows.length > 0) {
        price = parseFloat(offerCheck.rows[0].offered_price);
        await client.query(
          "UPDATE message_offers SET status = 'redeemed' WHERE product_id = $1 AND buyer_id = $2 AND status = 'accepted' AND responded_at = (SELECT MAX(responded_at) FROM message_offers WHERE product_id = $1 AND buyer_id = $2 AND status = 'accepted')",
          [item.productId, req.user.id]
        );
      } else {
        const onSale = p.sale_price && (p.sale_starts_at === null || new Date(p.sale_starts_at) <= new Date()) && (p.sale_ends_at === null || new Date(p.sale_ends_at) >= new Date());
        price = onSale ? parseFloat(p.sale_price) : parseFloat(p.price);
      }
      total += price * (item.quantity || 1);
      orderItems.push({ productId: item.productId, quantity: item.quantity || 1, price, sellerId: prod.rows[0].seller_id });
    }

    let discountAmount = 0;
    let promoId = null;
    if (promoCode) {
      const promoResult = await client.query(
        `SELECT * FROM promo_codes WHERE code = $1 AND is_active = true AND (valid_until IS NULL OR valid_until > CURRENT_TIMESTAMP) FOR UPDATE`,
        [promoCode.toUpperCase()]
      );
      if (promoResult.rows.length > 0) {
        const promo = promoResult.rows[0];
        if (!promo.max_uses || promo.uses_count < promo.max_uses) {
          const used = await client.query('SELECT id FROM promo_uses WHERE promo_id = $1 AND user_id = $2', [promo.id, req.user.id]);
          const eligibleTotal = promo.seller_id
            ? orderItems.filter(item => item.sellerId === promo.seller_id).reduce((sum, item) => sum + item.price * item.quantity, 0)
            : total;
          if (used.rows.length === 0 && eligibleTotal >= parseFloat(promo.min_order_amount)) {
            discountAmount = promo.discount_type === 'percentage'
              ? Math.min(eligibleTotal * parseFloat(promo.discount_value) / 100, parseFloat(promo.discount_value) * 10)
              : Math.min(parseFloat(promo.discount_value), eligibleTotal);
            promoId = promo.id;
          }
        }
      }
    }

    const finalTotal = discountAmount > 0 ? Math.round((total - discountAmount) * 100) / 100 : total;
    const paymentMethod = req.body.paymentMethod || 'moncash';
    const orderResult = await client.query(
      `INSERT INTO orders (buyer_id, total_amount, status, delivery_method, payment_method, delivery_name, delivery_phone, delivery_address, delivery_city, delivery_note, meetup_lat, meetup_lng, meetup_address, meetup_name, meetup_proposed_by)
       VALUES ($1, $2, 'pending', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
      [req.user.id, finalTotal, method, paymentMethod, deliveryName || null, deliveryPhone || null, deliveryAddress || null, deliveryCity || null, deliveryNote || null,
       meetupLat ? parseFloat(meetupLat) : null, meetupLng ? parseFloat(meetupLng) : null, meetupAddress || null, meetupName || null,
       meetupLat && meetupLng ? req.user.id : null]
    );
    const order = orderResult.rows[0];

    for (const oi of orderItems) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, seller_id, quantity, price) VALUES ($1, $2, $3, $4, $5)`,
        [order.id, oi.productId, oi.sellerId, oi.quantity, oi.price]
      );
    }

    if (promoId && discountAmount > 0) {
      await client.query(
        `INSERT INTO promo_uses (promo_id, user_id, order_id, discount_amount) VALUES ($1, $2, $3, $4)`,
        [promoId, req.user.id, order.id, discountAmount]
      );
      await client.query('UPDATE promo_codes SET uses_count = uses_count + 1 WHERE id = $1', [promoId]);
    }

    await client.query('COMMIT');
    client.release();
    logOrderEvent(order.id, 'order_placed', req.user.id, null, 'pending', `Order placed${discountAmount > 0 ? ` (promo: -G ${discountAmount.toFixed(0)})` : ''}`);
    const buyerInfo = await pool.query('SELECT full_name FROM users WHERE id = $1', [req.user.id]);
    const buyerName = buyerInfo.rows[0]?.full_name || 'Someone';
    const sellerIds = [...new Set(orderItems.map(i => i.sellerId))];

    let sellerInfo = null;
    if (req.body.paymentMethod === 'natcash' && sellerIds.length > 0) {
      const sellerRes = await pool.query(
        'SELECT full_name, phone, natcash_phone FROM users WHERE id = $1',
        [sellerIds[0]]
      );
      if (sellerRes.rows[0]) {
        sellerInfo = { name: sellerRes.rows[0].full_name, phone: sellerRes.rows[0].phone, natcashPhone: sellerRes.rows[0].natcash_phone };
      }
    }
    const orderImages = await pool.query(
      `SELECT DISTINCT ON (oi.seller_id) oi.seller_id, pi.image_url
       FROM order_items oi JOIN product_images pi ON pi.product_id = oi.product_id
       WHERE oi.order_id = $1 AND pi.is_primary = true`, [order.id]
    );
    const imageBySeller = {};
    for (const row of orderImages.rows) imageBySeller[row.seller_id] = row.image_url;
    for (const sid of sellerIds) {
      const notifData = { orderId: order.id };
      if (imageBySeller[sid]) notifData.image = imageBySeller[sid];
      createNotification(sid, 'new_order', 'New order', `${buyerName} bought ${orderItems[0]?.name || 'an item'}`, notifData);
      const lowStock = await pool.query('SELECT id, name, stock FROM products WHERE seller_id = $1 AND stock <= 3 AND is_available = true', [sid]);
      for (const p of lowStock.rows) {
        createNotification(sid, 'low_stock', 'Low Stock Alert', `"${p.name}" has only ${p.stock} left`, { productId: p.id });
      }
    }
    res.status(201).json({ order, sellerInfo });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (rbErr) { console.error('ROLLBACK failed:', rbErr.message); }
    client.release();
    console.error('Order create error:', err);
    const safeMessage = err.message?.startsWith('Product') || err.message?.startsWith('You cannot') || err.message?.startsWith('Insufficient') || err.message?.startsWith('Cart') ? err.message : 'Invalid order data';
    res.status(400).json({ error: safeMessage });
  }
});

// ── Cancel Order ──────────────────────────────────────────────────────────

router.put('/orders/:id/cancel', authRequired, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const order = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (order.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }
    if (order.rows[0].buyer_id !== req.user.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Only the buyer can cancel this order' });
    }
    if (order.rows[0].status !== 'pending' && order.rows[0].status !== 'paid') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Only pending or paid orders can be cancelled' });
    }
    if (order.rows[0].status === 'paid') {
      const hasCheckin = await client.query('SELECT 1 FROM meetup_checkins WHERE order_id = $1', [req.params.id]);
      if (hasCheckin.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Cannot cancel after check-in — use the meetup flow' });
      }
    }
    const oldStatus = order.rows[0].status;

    let totalRefund = 0;
    if (oldStatus === 'paid') {
      const escrows = await client.query("SELECT * FROM order_escrow WHERE order_id = $1 AND status = 'held' FOR UPDATE", [req.params.id]);
      for (const escrow of escrows.rows) {
        await client.query("UPDATE order_escrow SET status = 'refunded', released_at = CURRENT_TIMESTAMP WHERE id = $1", [escrow.id]);
      }
      const items = await client.query('SELECT product_id, quantity FROM order_items WHERE order_id = $1', [req.params.id]);
      totalRefund = parseFloat(order.rows[0].total_amount);
      for (const item of items.rows) {
        await client.query('SELECT id FROM products WHERE id = $1 FOR UPDATE', [item.product_id]);
        await client.query('UPDATE products SET stock = stock + $1 WHERE id = $2', [item.quantity, item.product_id]);
      }
    }

    await client.query("UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [req.params.id]);
    await client.query('COMMIT');
    client.release();
    logOrderEvent(req.params.id, 'status_change', req.user.id, oldStatus, 'cancelled', 'Cancelled by buyer');

    if (oldStatus === 'paid' && totalRefund > 0) {
      const buyerRes = await pool.query('SELECT phone FROM users WHERE id = $1', [order.rows[0].buyer_id]);
      const buyerPhone = buyerRes.rows[0]?.phone;
      if (buyerPhone) {
        try {
          const payoutRes = await fetch(
            process.env.MONCASH_PAYOUT_CREATE_URL || 'https://hvlmeoqyxaguzcujpmit.supabase.co/functions/v1/payout-create',
            {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${process.env.MCC_KEY}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ amount: Math.round(totalRefund), moncashNumber: buyerPhone, referenceId: `cancel_refund_${req.params.id}` }),
              signal: AbortSignal.timeout(15000),
            }
          );
          if (payoutRes.ok) console.log(`[CANCEL] Refund G ${totalRefund} sent to buyer ${buyerPhone}`);
          else console.error(`[CANCEL] Refund payout failed: ${await payoutRes.text()}`);
        } catch (e) { console.error('[CANCEL] Refund payout error:', e.message); }
      }
      createNotification(order.rows[0].buyer_id, 'order_status', 'Order Refunded',
        `Your cancelled order has been refunded G ${totalRefund.toFixed(0)}.`, { orderId: req.params.id });
    }

    const cancelledSellers = await pool.query('SELECT DISTINCT seller_id FROM order_items WHERE order_id = $1', [req.params.id]);
    for (const row of cancelledSellers.rows) {
      createNotification(row.seller_id, 'order_cancelled', 'Order Cancelled', `A buyer cancelled their order.`, { orderId: req.params.id });
    }
    res.json({ cancelled: true });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    client.release();
    console.error('Order cancel error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Reorder ───────────────────────────────────────────────────────────────

router.post('/orders/:id/reorder', authRequired, async (req, res) => {
  try {
    const order = await canAccessOrder(req.user.id, req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const items = await pool.query(
      `SELECT oi.product_id, oi.quantity, p.name, p.price, p.stock, p.is_available, p.seller_id,
              p.sale_price, p.sale_starts_at, p.sale_ends_at,
              (SELECT json_agg(json_build_object('id', pi.id, 'url', pi.image_url, 'is_primary', pi.is_primary, 'display_order', pi.display_order) ORDER BY pi.is_primary DESC, pi.display_order)
               FROM product_images pi WHERE pi.product_id = p.id) AS images
       FROM order_items oi JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = $1`,
      [req.params.id]
    );
    const availableItems = items.rows
      .filter(item => item.is_available && item.stock > 0 && item.seller_id !== req.user.id)
      .map(item => {
        const isOnSale = item.sale_price && (item.sale_starts_at === null || new Date(item.sale_starts_at) <= new Date()) && (item.sale_ends_at === null || new Date(item.sale_ends_at) >= new Date());
        const effectivePrice = isOnSale ? parseFloat(item.sale_price) : parseFloat(item.price);
        return { productId: item.product_id, sellerId: item.seller_id, name: item.name, price: effectivePrice, stock: item.stock, images: item.images || [] };
      });
    res.json({ items: availableItems });
  } catch (err) {
    console.error('Reorder error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// MEETUP ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

router.put('/orders/:id/meetup', authRequired, async (req, res) => {
  const { lat, lng, address, note } = req.body;
  if (!lat || !lng) return res.status(400).json({ error: 'Latitude and longitude required' });
  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);
  if (!Number.isFinite(latNum) || latNum < -90 || latNum > 90) return res.status(400).json({ error: 'Invalid latitude' });
  if (!Number.isFinite(lngNum) || lngNum < -180 || lngNum > 180) return res.status(400).json({ error: 'Invalid longitude' });
  try {
    const order = await canAccessOrder(req.user.id, req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'paid' && order.status !== 'pending') return res.status(400).json({ error: 'Order must be paid or pending' });
    await pool.query(
      `UPDATE orders SET meetup_lat = $1, meetup_lng = $2, meetup_address = $3, meetup_note = $4, meetup_confirmed = false, meetup_proposed_by = $5, updated_at = CURRENT_TIMESTAMP WHERE id = $6`,
      [latNum, lngNum, address || null, note || null, req.user.id, req.params.id]
    );
    logOrderEvent(req.params.id, 'meetup_proposed', req.user.id, null, null, `Meetup proposed at ${address || `${lat}, ${lng}`}`);
    const oData = await pool.query('SELECT buyer_id FROM orders WHERE id = $1', [req.params.id]);
    const sellerData = await pool.query('SELECT seller_id FROM order_items WHERE order_id = $1 LIMIT 1', [req.params.id]);
    if (oData.rows.length > 0) {
      const buyerId = oData.rows[0].buyer_id;
      const sellerId = sellerData.rows[0]?.seller_id;
      const otherPartyId = buyerId === req.user.id ? sellerId : buyerId;
      if (otherPartyId) {
        createNotification(otherPartyId, 'meetup_proposed', 'Meetup Proposed', 'A meetup location has been proposed for your order', { orderId: req.params.id });
      }
    }
    res.json({ updated: true });
  } catch (err) {
    console.error('Meetup error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/orders/:id/meetup/confirm', authRequired, async (req, res) => {
  try {
    const order = await canAccessOrder(req.user.id, req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'paid' && order.status !== 'pending') return res.status(400).json({ error: 'Order must be paid or pending' });
    if (!order.meetup_lat || !order.meetup_lng) return res.status(400).json({ error: 'No meetup location proposed yet' });
    if (order.meetup_proposed_by === req.user.id) return res.status(400).json({ error: 'You proposed this location, wait for the other party to confirm' });
    await pool.query(`UPDATE orders SET meetup_confirmed = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [req.params.id]);
    logOrderEvent(req.params.id, 'meetup_confirmed', req.user.id, null, null, 'Meetup location confirmed');
    if (order.meetup_proposed_by) {
      createNotification(order.meetup_proposed_by, 'meetup_confirmed', 'Meetup Confirmed', 'Your proposed meetup location has been confirmed', { orderId: req.params.id });
    }
    res.json({ updated: true });
  } catch (err) {
    console.error('Meetup confirm error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Meetup Check-in ───────────────────────────────────────────────────────

router.post('/orders/:id/meetup/checkin', authRequired, async (req, res) => {
  const { lat, lng } = req.body;
  if (!lat || !lng) return res.status(400).json({ error: 'Latitude and longitude required' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const orderResult = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (orderResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }
    const order = orderResult.rows[0];
    if (!order.meetup_confirmed) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Meetup location must be confirmed before checking in' });
    }
    if (order.status !== 'paid') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Order must be paid to check in' });
    }

    const sellerMembership = await client.query(
      'SELECT 1 FROM order_items WHERE order_id = $1 AND seller_id = $2 LIMIT 1',
      [req.params.id, req.user.id]
    );
    const role = order.buyer_id === req.user.id ? 'buyer' : sellerMembership.rows.length > 0 ? 'seller' : null;
    if (!role) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Not a party to this order' });
    }
    const isBuyer = role === 'buyer';

    await client.query(
      `INSERT INTO meetup_checkins (order_id, user_id, role, lat, lng)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (order_id, user_id) DO UPDATE SET lat = $4, lng = $5, checked_in_at = CURRENT_TIMESTAMP`,
      [req.params.id, req.user.id, role, lat, lng]
    );

    const otherCheckin = await client.query(
      'SELECT * FROM meetup_checkins WHERE order_id = $1 AND user_id != $2',
      [req.params.id, req.user.id]
    );

    let proximityConfirmed = false;
    let distance = null;

    if (otherCheckin.rows.length > 0) {
      const other = otherCheckin.rows[0];
      distance = haversineDistance(lat, lng, parseFloat(other.lat), parseFloat(other.lng));
      proximityConfirmed = distance <= 150;

      if (proximityConfirmed) {
        if (!order.meetup_started_at) {
          await client.query(
            'UPDATE orders SET meetup_started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
            [req.params.id]
          );
        }
        const meetupCode = generateMeetupCode();
        await client.query(
          `UPDATE meetup_checkins
           SET meetup_code = $1, meetup_code_expires_at = CURRENT_TIMESTAMP + INTERVAL '30 minutes',
               meetup_code_attempts = 0, qr_scanned = false
           WHERE order_id = $2 AND user_id = $3`,
          [meetupCode, req.params.id, order.buyer_id]
        );
        await logOrderEvent(req.params.id, 'meetup_arrived', req.user.id, null, null, `Buyer and seller within ${Math.round(distance)}m`, client);
      }
    }

    await client.query('COMMIT');
    client.release();

    const response = {
      checkedIn: true, role,
      otherPartyCheckedIn: otherCheckin.rows.length > 0,
      proximityConfirmed,
      distance: distance ? Math.round(distance) : null,
      meetupStartedAt: order.meetup_started_at || (proximityConfirmed ? new Date().toISOString() : null),
    };

    if (isBuyer) {
      const qrRow = await pool.query(
        'SELECT meetup_code FROM meetup_checkins WHERE order_id = $1 AND user_id = $2',
        [req.params.id, req.user.id]
      );
      if (qrRow.rows[0]?.meetup_code) response.meetupCode = qrRow.rows[0].meetup_code;
    }

    res.json(response);
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('Meetup check-in error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// ── Meetup Scan Code ──────────────────────────────────────────────────────

router.post('/orders/:id/meetup/scan', authRequired, async (req, res) => {
  const { code } = req.body;
  if (!/^\d{4}$/.test(String(code || ''))) return res.status(400).json({ error: 'Enter the 4-digit delivery code' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const orderResult = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (orderResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }
    const order = orderResult.rows[0];

    const sellerItem = await pool.query(
      'SELECT seller_id FROM order_items WHERE order_id = $1 AND seller_id = $2',
      [req.params.id, req.user.id]
    );
    if (sellerItem.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Only a seller on this order can enter the delivery code' });
    }

    const buyerCheckin = await pool.query(
      'SELECT * FROM meetup_checkins WHERE order_id = $1 AND user_id = $2',
      [req.params.id, order.buyer_id]
    );
    const sellerCheckin = await pool.query(
      'SELECT * FROM meetup_checkins WHERE order_id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );

    if (buyerCheckin.rows.length > 0 && sellerCheckin.rows.length > 0) {
      const dist = haversineDistance(
        parseFloat(buyerCheckin.rows[0].lat), parseFloat(buyerCheckin.rows[0].lng),
        parseFloat(sellerCheckin.rows[0].lat), parseFloat(sellerCheckin.rows[0].lng)
      );
      if (dist > 150) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Parties are ${Math.round(dist)}m apart — must be within 150m to complete exchange` });
      }
    }

    const buyerMeetup = buyerCheckin.rows[0];
    if (!buyerMeetup?.meetup_code || !buyerMeetup.meetup_code_expires_at || new Date(buyerMeetup.meetup_code_expires_at).getTime() <= Date.now()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Delivery code is expired. Ask the buyer to refresh it.' });
    }
    if (buyerMeetup.meetup_code_attempts >= MAX_MEETUP_CODE_ATTEMPTS) {
      await client.query('ROLLBACK');
      return res.status(429).json({ error: 'Too many incorrect attempts. Ask the buyer to refresh the delivery code.' });
    }

    const expectedCode = Buffer.from(String(buyerMeetup.meetup_code), 'utf8');
    const enteredCode = Buffer.from(String(code), 'utf8');
    if (expectedCode.length !== enteredCode.length || !crypto.timingSafeEqual(expectedCode, enteredCode)) {
      const attempts = buyerMeetup.meetup_code_attempts + 1;
      await client.query(
        'UPDATE meetup_checkins SET meetup_code_attempts = $1 WHERE order_id = $2 AND user_id = $3',
        [attempts, req.params.id, order.buyer_id]
      );
      await client.query('COMMIT');
      return res.status(400).json({ error: attempts >= MAX_MEETUP_CODE_ATTEMPTS ? 'Too many incorrect attempts. Ask the buyer to refresh the delivery code.' : 'Incorrect delivery code' });
    }

    await client.query(
      'UPDATE meetup_checkins SET qr_scanned = true WHERE order_id = $1 AND user_id = $2',
      [req.params.id, order.buyer_id]
    );
    await logOrderEvent(req.params.id, 'exchange_confirmed', req.user.id, null, null, 'Delivery code entered — exchange confirmed', client);

    await client.query('COMMIT');

    res.json({ scanned: true, message: 'Exchange confirmed! The buyer will be asked to confirm receipt.' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Meetup code verification error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// ── Meetup Extend ─────────────────────────────────────────────────────────

router.put('/orders/:id/meetup/extend', authRequired, async (req, res) => {
  try {
    const order = await canAccessOrder(req.user.id, req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'paid') return res.status(400).json({ error: 'Order must be active' });

    await pool.query(
      `UPDATE meetup_checkins SET checked_in_at = checked_in_at + INTERVAL '30 minutes'
       WHERE order_id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    await logOrderEvent(req.params.id, 'meetup_extended', req.user.id, null, null, 'Timer extended by 30 minutes');
    res.json({ extended: true });
  } catch (err) {
    console.error('Meetup extend error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Meetup Status ─────────────────────────────────────────────────────────

router.get('/orders/:id/meetup/status', authRequired, async (req, res) => {
  try {
    const order = await canAccessOrder(req.user.id, req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const checkins = await pool.query(
      `SELECT mc.id, mc.order_id, mc.user_id, mc.role, mc.lat, mc.lng, mc.checked_in_at,
              mc.qr_scanned, mc.meetup_code_expires_at, mc.meetup_code_attempts,
              CASE WHEN mc.user_id = $2 THEN mc.meetup_code ELSE NULL END AS meetup_code,
              u.full_name, u.avatar_url
       FROM meetup_checkins mc
       JOIN users u ON mc.user_id = u.id
       WHERE mc.order_id = $1`,
      [req.params.id, req.user.id]
    );
    res.json({ checkins: checkins.rows, meetupStartedAt: order.meetup_started_at });
  } catch (err) {
    console.error('Meetup status error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Complete Order ────────────────────────────────────────────────────────

router.put('/orders/:id/complete', authRequired, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const orderResult = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (orderResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }
    const order = orderResult.rows[0];
    if (order.buyer_id !== req.user.id && req.user.role !== 'admin') {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Only the buyer can complete this order' });
    }
    if (order.status === 'completed') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Order already completed' });
    }
    if (order.status === 'cancelled') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Order was cancelled' });
    }
    if (order.status !== 'delivered' && order.status !== 'paid') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Order must be delivered or paid (meetup) before completing' });
    }
    await client.query(`UPDATE orders SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [req.params.id]);
    await logOrderEvent(req.params.id, 'status_change', req.user.id, order.status, 'completed', 'Order completed', client);
    await client.query('COMMIT');
    client.release();
    const sellersOfOrder = await pool.query('SELECT DISTINCT seller_id FROM order_items WHERE order_id = $1', [req.params.id]);
    for (const row of sellersOfOrder.rows) {
      createNotification(row.seller_id, 'order_status', 'Order Completed', 'An order has been marked as completed', { orderId: req.params.id });
    }
    res.json({ updated: true, status: 'completed' });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    client.release();
    console.error('Order complete error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ESCROW ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/orders/:id/escrow/release', authRequired, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const order = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (order.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }
    const o = order.rows[0];

    if (o.buyer_id !== req.user.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Only the buyer can release escrow' });
    }
    if (o.status !== 'paid' && o.status !== 'completed') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Order must be paid or completed to release escrow (current: ${o.status})` });
    }

    const verifiedExchange = await client.query(
      `SELECT
         COUNT(*) FILTER (WHERE role = 'buyer' AND qr_scanned = true) AS buyer_verified,
         COUNT(*) FILTER (WHERE role = 'seller') AS seller_checked_in
       FROM meetup_checkins
       WHERE order_id = $1`,
      [req.params.id]
    );
    const exchange = verifiedExchange.rows[0];
    if (Number(exchange.buyer_verified) < 1 || Number(exchange.seller_checked_in) < 1) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'The seller must verify the delivery code before escrow can be released' });
    }

    const openDispute = await client.query("SELECT id FROM disputes WHERE order_id = $1 AND status = 'open'", [req.params.id]);
    if (openDispute.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Escrow is frozen — an open dispute must be resolved first.' });
    }

    const escrows = await client.query("SELECT * FROM order_escrow WHERE order_id = $1 AND status = 'held' FOR UPDATE", [req.params.id]);
    if (escrows.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No held escrow found for this order' });
    }

    for (const escrow of escrows.rows) {
      const net = parseFloat(escrow.net_amount);
      await client.query(
        `INSERT INTO seller_balances (seller_id, balance, total_earned)
         VALUES ($1, $2, $2)
         ON CONFLICT (seller_id)
         DO UPDATE SET balance = seller_balances.balance + $2,
                       total_earned = seller_balances.total_earned + $2,
                       updated_at = CURRENT_TIMESTAMP`,
        [escrow.seller_id, net]
      );
      await client.query("UPDATE order_escrow SET status = 'released', released_at = CURRENT_TIMESTAMP WHERE id = $1", [escrow.id]);
      console.log(`Escrow released: seller ${escrow.seller_id} credited G ${net}`);
    }

    if (o.status !== 'completed') {
      await client.query("UPDATE orders SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [req.params.id]);
    }

    await client.query('COMMIT');
    client.release();

    // Pay out platform commission (outside transaction — best effort)
    try {
      const totalCommission = (await pool.query(
        'SELECT COALESCE(SUM(commission_amount), 0) AS total FROM order_escrow WHERE order_id = $1',
        [req.params.id]
      )).rows[0].total;
      const commissionAmount = parseFloat(totalCommission);

      if (commissionAmount > 0 && process.env.PLATFORM_PHONE) {
        const payoutRes = await fetch(
          process.env.MONCASH_PAYOUT_CREATE_URL || 'https://hvlmeoqyxaguzcujpmit.supabase.co/functions/v1/payout-create',
          {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${process.env.MCC_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              amount: Math.round(commissionAmount),
              moncashNumber: process.env.PLATFORM_PHONE,
              referenceId: `platform_${req.params.id}`,
            }),
            signal: AbortSignal.timeout(15000),
          }
        );
        if (payoutRes.ok) {
          const payoutData = await payoutRes.json();
          await pool.query(
            `INSERT INTO platform_payouts (order_id, amount, status, moncash_reference) VALUES ($1, $2, 'completed', $3)`,
            [req.params.id, commissionAmount, payoutData.reference || payoutData.transactionId || null]
          );
          console.log(`Platform commission G ${commissionAmount} sent to ${process.env.PLATFORM_PHONE}`);
        } else {
          const errText = await payoutRes.text();
          await pool.query(
            `INSERT INTO platform_payouts (order_id, amount, status, error_message) VALUES ($1, $2, 'failed', $3)`,
            [req.params.id, commissionAmount, errText]
          );
          console.error(`Platform payout failed: ${errText}`);
        }
      }
    } catch (payoutErr) {
      console.error('Platform payout error:', payoutErr.message);
    }

    for (const escrow of escrows.rows) {
      createNotification(escrow.seller_id, 'payout_released', 'Payout released',
        `Order #${req.params.id.slice(0, 8)} is complete`, { orderId: req.params.id, amount: parseFloat(escrow.net_amount) });
    }

    res.json({ released: true, escrowCount: escrows.rows.length });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    client.release();
    console.error('Escrow release error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/orders/:id/escrow/refund', authRequired, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const order = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (order.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }
    const o = order.rows[0];

    if (o.buyer_id !== req.user.id && req.user.role !== 'admin') {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Only the buyer or admin can refund escrow' });
    }

    const isAdmin = req.user.role === 'admin';
    const isBuyer = o.buyer_id === req.user.id;
    const refundableStatuses = ['pending', 'paid', 'cancelled'];
    if (!isAdmin && !refundableStatuses.includes(o.status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Cannot self-refund order in '${o.status}' status. Open a dispute instead.` });
    }

    if (!isAdmin && isBuyer) {
      const checkins = await client.query('SELECT id FROM meetup_checkins WHERE order_id = $1', [req.params.id]);
      if (checkins.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Meetup check-in already occurred. Open a dispute to resolve this order.' });
      }
    }

    if (!isAdmin && isBuyer && !refundableStatuses.includes(o.status)) {
      const disputes = await client.query("SELECT id FROM disputes WHERE order_id = $1 AND status = 'open'", [req.params.id]);
      if (disputes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Order is past payment stage. Open a dispute to request a refund.' });
      }
    }

    const buyerRes = await client.query('SELECT phone FROM users WHERE id = $1', [o.buyer_id]);
    const buyerPhone = buyerRes.rows[0]?.phone;
    if (!buyerPhone) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Buyer phone number not found' });
    }

    const escrows = await client.query("SELECT * FROM order_escrow WHERE order_id = $1 AND status = 'held' FOR UPDATE", [req.params.id]);
    if (escrows.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No held escrow found for this order (may already be released or refunded)' });
    }

    const totalRefund = parseFloat(o.total_amount);
    for (const escrow of escrows.rows) {
      await client.query("UPDATE order_escrow SET status = 'refunded', released_at = CURRENT_TIMESTAMP WHERE id = $1", [escrow.id]);
    }

    await client.query("UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [req.params.id]);
    await logOrderEvent(req.params.id, 'status_change', req.user.id, o.status, 'cancelled', 'Escrow refunded', client);

    const items = await client.query('SELECT product_id, quantity FROM order_items WHERE order_id = $1', [req.params.id]);
    for (const item of items.rows) {
      await client.query('SELECT id FROM products WHERE id = $1 FOR UPDATE', [item.product_id]);
      await client.query('UPDATE products SET stock = stock + $1 WHERE id = $2', [item.quantity, item.product_id]);
    }

    await client.query(
      `INSERT INTO refund_payouts (order_id, buyer_id, amount, receiver_phone, moncash_reference)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (order_id) DO NOTHING`,
      [req.params.id, o.buyer_id, totalRefund, buyerPhone, `refund_${req.params.id}`]
    );

    await client.query('COMMIT');
    client.release();

    await processRefundPayout(req.params.id);

    for (const escrow of escrows.rows) {
      createNotification(escrow.seller_id, 'escrow_refunded', 'Order Refunded',
        `An order has been refunded. G ${parseFloat(escrow.gross_amount).toFixed(0)} has been returned to the buyer.`, { orderId: req.params.id });
    }

    res.json({ refunded: true, amount: totalRefund });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    client.release();
    console.error('Escrow refund error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/orders/:id/escrow', authRequired, async (req, res) => {
  try {
    const order = await canAccessOrder(req.user.id, req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const escrows = await pool.query(
      `SELECT e.*, u.full_name AS seller_name
       FROM order_escrow e
       JOIN users u ON e.seller_id = u.id
       WHERE e.order_id = $1`,
      [req.params.id]
    );
    res.json({ escrows: escrows.rows });
  } catch (err) {
    console.error('Escrow status error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Payment Retry ─────────────────────────────────────────────────────────

router.post('/payments/retry/:orderId', authRequired, async (req, res) => {
  const { orderId } = req.params;
  const { returnUrl } = req.body;
  try {
    const orderResult = await pool.query(
      "SELECT * FROM orders WHERE id = $1 AND buyer_id = $2 AND status = 'pending'",
      [orderId, req.user.id]
    );
    if (orderResult.rows.length === 0) return res.status(404).json({ error: 'Pending order not found' });
    const order = orderResult.rows[0];

    if (order.payment_method === 'natcash') {
      return res.json({ retryMethod: 'natcash', orderId: order.id });
    }

    const retryReference = `${orderId}_retry_${Date.now()}`;

    let moncashRes = await fetch(
      process.env.MONCASH_PAY_CREATE_URL || 'https://hvlmeoqyxaguzcujpmit.supabase.co/functions/v1/pay-create',
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.MCC_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Math.round(parseFloat(order.total_amount)),
          referenceId: retryReference,
          returnUrl: returnUrl?.startsWith('https://') ? returnUrl : `${process.env.PRODUCTION_URL || 'https://maurmaket.onrender.com'}/payment/return?order=${orderId}`,
        }),
        signal: AbortSignal.timeout(15000),
      }
    );

    if (moncashRes.status === 409) {
      const retryRef2 = `${orderId}_retry2_${Date.now()}`;
      moncashRes = await fetch(
        process.env.MONCASH_PAY_CREATE_URL || 'https://hvlmeoqyxaguzcujpmit.supabase.co/functions/v1/pay-create',
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${process.env.MCC_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: Math.round(parseFloat(order.total_amount)),
            referenceId: retryRef2,
            returnUrl: returnUrl?.startsWith('https://') ? returnUrl : `${process.env.PRODUCTION_URL || 'https://maurmaket.onrender.com'}/payment/return?order=${orderId}`,
          }),
          signal: AbortSignal.timeout(15000),
        }
      );
      if (moncashRes.ok) {
        const retryData = await moncashRes.json();
        if (retryData.paymentUrl) {
          await pool.query('UPDATE orders SET moncash_reference = $1 WHERE id = $2', [retryRef2, orderId]);
          return res.json({ paymentUrl: retryData.paymentUrl });
        }
      }
    }

    if (!moncashRes.ok) {
      const errorText = await moncashRes.text();
      console.error(`MonCashConnect retry HTTP ${moncashRes.status}:`, errorText);
      if (moncashRes.status === 401) return res.status(502).json({ error: 'Payment provider auth error' });
      if (moncashRes.status === 400) return res.status(502).json({ error: 'Invalid payment request' });
      return res.status(502).json({ error: 'Payment provider error' });
    }
    const data = await moncashRes.json();
    if (!data.paymentUrl) return res.status(502).json({ error: 'Payment provider error' });

    await pool.query('UPDATE orders SET moncash_reference = $1 WHERE id = $2', [retryReference, orderId]);

    res.json({ paymentUrl: data.paymentUrl });
  } catch (err) {
    console.error('Payment retry error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
