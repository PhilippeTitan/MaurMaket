import { Router } from 'express';
import crypto from 'crypto';
import { pool } from '../config/database.js';
import { authRequired, dobRequired } from '../middleware/auth.js';
import { createNotification } from '../utils/notifications.js';
import { logOrderEvent, canAccessOrder, processRefundPayout, parseNatCashSms, getCommissionRate, populateSellerOrderSnapshot } from '../utils/helpers.js';
import { getNatCashAccess } from '../utils/natcashAccess.js';
import { applyStockSideEffects } from '../utils/listingPolicy.js';
import { releaseCancelledOrderStock } from '../utils/orderStock.js';
import { calculatePendingCheckoutTotals } from '../utils/pendingCheckoutTotals.js';

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════════
// MEETUP CONSTANTS + HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

const MEETUP_CODE_TTL_MS = 30 * 60 * 1000;
const MAX_MEETUP_CODE_ATTEMPTS = 5;
const MEETUP_SESSION_MS = 90 * 60 * 1000;
const MEETUP_EXTENSION_MS = 30 * 60 * 1000;

function generateMeetupCode() {
  return String(crypto.randomInt(1000, 10000));
}

async function createPendingMonCashPayment(checkout) {
  const referenceId = checkout.id;
  const moncashRes = await fetch(
    process.env.MONCASH_PAY_CREATE_URL || 'https://api.moncashconnect.com/v1/pay-create',
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.MCC_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: Math.round(Number(checkout.total_amount)), referenceId,
        returnUrl: `${process.env.PRODUCTION_URL || 'https://maurmaket.onrender.com'}/payment/return?pending=${checkout.id}`,
      }),
      signal: AbortSignal.timeout(15000),
    }
  );
  if (!moncashRes.ok) throw new Error('Payment provider error');
  const data = await moncashRes.json();
  if (!data.paymentUrl) throw new Error('Payment provider error');
  await pool.query('UPDATE pending_checkouts SET moncash_reference = $1 WHERE id = $2', [referenceId, checkout.id]);
  return data.paymentUrl;
}

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function createNatCashHandoffOrder(client, checkoutId) {
  const lockedCheckout = await client.query('SELECT * FROM pending_checkouts WHERE id = $1 FOR UPDATE', [checkoutId]);
  const checkout = lockedCheckout.rows[0];
  if (!checkout) throw new Error('Pending checkout not found');
  if (checkout.order_id) return checkout.order_id;
  const agreements = await client.query(
    `SELECT * FROM pending_fulfillment_agreements WHERE checkout_id = $1 FOR UPDATE`, [checkoutId]
  );
  if (!agreements.rows.length || agreements.rows.some(row => row.status !== 'accepted' || !row.terms_locked_at)) return null;
  if (agreements.rows.some(row => row.terms?.method !== 'meetup')) throw new Error('NatCash handoff orders require every seller to agree to an in-person meetup');
  const created = await client.query(
    `INSERT INTO orders (buyer_id, total_amount, status, payment_method, delivery_method, delivery_name, delivery_phone, delivery_address, delivery_city, delivery_note, meetup_lat, meetup_lng, meetup_address, meetup_name, meetup_scheduled_at)
     VALUES ($1,$2,'pending','natcash','meetup',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
    [checkout.user_id, checkout.total_amount, checkout.delivery_name, checkout.delivery_phone, checkout.delivery_address, checkout.delivery_city, checkout.delivery_note, checkout.meetup_lat, checkout.meetup_lng, checkout.meetup_address, checkout.meetup_name, checkout.meetup_at]
  );
  const orderId = created.rows[0].id;
  for (const item of checkout.cart_data) {
    const productId = item.id || item.productId;
    const product = await client.query('SELECT seller_id, name FROM products WHERE id = $1', [productId]);
    if (!product.rows[0]) throw new Error(`Product ${productId} is no longer available`);
    await client.query(
      `INSERT INTO order_items (order_id, product_id, seller_id, quantity, price, variant_id, variant_label, product_name, product_image)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [orderId, productId, product.rows[0].seller_id, item.quantity || 1, item.price || 0,
       item.variantId || null, item.variantLabel || null,
       item.product_name || product.rows[0].name, item.product_image || null]
    );
  }
  await populateSellerOrderSnapshot(client, orderId);
  for (const agreement of agreements.rows) {
    const term = agreement.terms || {};
    await client.query(
      `INSERT INTO seller_fulfillments (order_id, seller_id, payment_status, fulfillment_status, payment_method, fulfillment_method, delivery_fee, fulfillment_lat, fulfillment_lng, fulfillment_address, fulfillment_note, agreement_status, buyer_accepted_at, seller_accepted_at, terms_locked_at, meetup_at)
       VALUES ($1,$2,'pending','pending','natcash','meetup',$3,$4,$5,$6,$7,'locked',$8,$9,$10,$11) ON CONFLICT (order_id,seller_id) DO NOTHING`,
      [orderId, agreement.seller_id, Number(term.deliveryFee || 0), term.location?.lat || null, term.location?.lng || null, term.location?.address || null, term.location?.note || null, agreement.buyer_accepted_at, agreement.seller_accepted_at, agreement.terms_locked_at, term.meetupAt || null]
    );
  }
  await client.query(
    `UPDATE stock_reservations SET order_id = $1, checkout_id = NULL, expires_at = TIMESTAMP 'infinity'
     WHERE checkout_id = $2 AND status = 'active'`, [orderId, checkoutId]
  );
  await client.query("UPDATE pending_checkouts SET status = 'completed', order_id = $1 WHERE id = $2", [orderId, checkoutId]);
  await client.query(
    `INSERT INTO order_events (order_id, event_type, actor_id, note) VALUES ($1,'status_change',$2,'NatCash order created. Payment is due in person at the agreed meetup; no transfer has been verified.')`,
    [orderId, checkout.user_id]
  );
  return orderId;
}

async function activateNatCashSellerPayment(client, legacySession, transcode) {
  const checkoutResult = await client.query('SELECT * FROM pending_checkouts WHERE id = $1 FOR UPDATE', [legacySession.checkout_id]);
  const checkout = checkoutResult.rows[0];
  if (!checkout) throw new Error('Checkout not found');
  const agreementResult = await client.query(
    `SELECT * FROM pending_fulfillment_agreements WHERE checkout_id = $1 AND seller_id = $2
     AND status = 'accepted' AND terms_locked_at IS NOT NULL FOR UPDATE`, [checkout.id, legacySession.seller_id]
  );
  const agreement = agreementResult.rows[0];
  if (!agreement) throw new Error('This seller’s fulfillment agreement is not locked');
  const term = agreement.terms;
  let paymentSession = await client.query("SELECT * FROM fulfillment_payment_sessions WHERE checkout_id = $1 AND seller_id = $2 AND provider = 'natcash' FOR UPDATE", [checkout.id, legacySession.seller_id]);
  let session = paymentSession.rows[0];
  if (!session) {
    const created = await client.query(
      `INSERT INTO fulfillment_payment_sessions (checkout_id, seller_id, provider, provider_reference, amount, sms_transcode)
       VALUES ($1, $2, 'natcash', $3, $4, $5) RETURNING *`,
      [checkout.id, legacySession.seller_id, `natcash_${legacySession.id}`, legacySession.amount, transcode]
    );
    session = created.rows[0];
  }
  if (session.status === 'completed') return session.order_id;
  let orderId = session.order_id;
  if (!orderId) {
    const prior = await client.query('SELECT order_id FROM fulfillment_payment_sessions WHERE checkout_id = $1 AND order_id IS NOT NULL LIMIT 1', [checkout.id]);
    orderId = prior.rows[0]?.order_id;
  }
  if (!orderId) {
    const createdOrder = await client.query(
      `INSERT INTO orders (buyer_id, total_amount, status, payment_method, delivery_method, delivery_name, delivery_phone, delivery_address, delivery_city, delivery_note, meetup_lat, meetup_lng, meetup_address, meetup_name, meetup_scheduled_at)
       VALUES ($1,$2,'partially_paid','natcash',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [checkout.user_id, checkout.total_amount, checkout.delivery_method, checkout.delivery_name, checkout.delivery_phone, checkout.delivery_address, checkout.delivery_city, checkout.delivery_note, checkout.meetup_lat, checkout.meetup_lng, checkout.meetup_address, checkout.meetup_name, checkout.meetup_at]
    );
    orderId = createdOrder.rows[0].id;
    for (const item of checkout.cart_data) {
      const product = await client.query('SELECT seller_id, name FROM products WHERE id = $1', [item.id || item.productId]);
      if (product.rows[0]) await client.query(
        `INSERT INTO order_items (order_id, product_id, seller_id, quantity, price, variant_id, variant_label, product_name, product_image)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [orderId, item.id || item.productId, product.rows[0].seller_id, item.quantity || 1, item.price || 0,
         item.variantId || null, item.variantLabel || null,
         item.product_name || product.rows[0].name, item.product_image || null]
      );
    }
    await populateSellerOrderSnapshot(client, orderId);
    const locked = await client.query("SELECT * FROM pending_fulfillment_agreements WHERE checkout_id = $1 AND status = 'accepted' AND terms_locked_at IS NOT NULL", [checkout.id]);
    for (const row of locked.rows) {
      const lockedTerm = row.terms;
      await client.query(
        `INSERT INTO seller_fulfillments (order_id,seller_id,payment_status,fulfillment_status,payment_method,fulfillment_method,delivery_fee,fulfillment_lat,fulfillment_lng,fulfillment_address,fulfillment_note,agreement_status,buyer_accepted_at,seller_accepted_at,terms_locked_at,meetup_at)
         VALUES ($1,$2,'pending','pending','natcash',$3,$4,$5,$6,$7,$8,'locked',$9,$10,$11,$12) ON CONFLICT (order_id,seller_id) DO NOTHING`,
        [orderId,row.seller_id,lockedTerm.method,Number(lockedTerm.deliveryFee || 0),lockedTerm.location?.lat || null,lockedTerm.location?.lng || null,lockedTerm.location?.address || null,lockedTerm.location?.note || null,row.buyer_accepted_at,row.seller_accepted_at,row.terms_locked_at,lockedTerm.meetupAt || null]
      );
    }
    await client.query('UPDATE fulfillment_payment_sessions SET order_id = $1 WHERE checkout_id = $2', [orderId, checkout.id]);
  }
  await client.query("UPDATE fulfillment_payment_sessions SET order_id = $1, status = 'completed', sms_transcode = $2, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $3", [orderId, transcode, session.id]);
  await client.query("UPDATE seller_fulfillments SET payment_status = 'verified', fulfillment_status = 'processing', payment_method = 'natcash', payment_reference = $1, updated_at = CURRENT_TIMESTAMP WHERE order_id = $2 AND seller_id = $3", [transcode, orderId, legacySession.seller_id]);
  for (const item of checkout.cart_data || []) {
    if (!item.acceptedOfferMessageId || item.seller_id !== legacySession.seller_id) continue;
    await client.query(
      `UPDATE message_offers SET status = 'redeemed', accepted_checkout_id = NULL
       WHERE message_id = $1 AND buyer_id = $2 AND seller_id = $3
         AND status = 'accepted' AND accepted_checkout_id = $4`,
      [item.acceptedOfferMessageId, checkout.user_id, legacySession.seller_id, checkout.id]
    );
  }
  await client.query("UPDATE stock_reservations SET status = 'confirmed' WHERE checkout_id = $1 AND seller_id = $2 AND status = 'active'", [checkout.id, legacySession.seller_id]);
  const items = await client.query('SELECT SUM(price * quantity) AS gross FROM order_items WHERE order_id = $1 AND seller_id = $2', [orderId, legacySession.seller_id]);
  const gross = Number(items.rows[0]?.gross || 0) + Number(term.deliveryFee || 0);
  const sellerTier = await client.query('SELECT seller_tier FROM users WHERE id = $1', [legacySession.seller_id]);
  const commission = Math.round(gross * getCommissionRate(sellerTier.rows[0]?.seller_tier || 'none') * 100) / 100;
  await client.query("INSERT INTO order_escrow (order_id,seller_id,gross_amount,commission_amount,net_amount,status) VALUES ($1,$2,$3,$4,$5,'held') ON CONFLICT (order_id,seller_id) DO NOTHING", [orderId,legacySession.seller_id,gross,commission,gross - commission]);
  const outstanding = await client.query(`SELECT COUNT(*)::int AS count FROM pending_fulfillment_agreements a LEFT JOIN seller_fulfillments sf ON sf.order_id = $2 AND sf.seller_id = a.seller_id WHERE a.checkout_id = $1 AND (a.status = 'proposed' OR (a.status = 'accepted' AND COALESCE(sf.payment_status,'pending') <> 'verified'))`, [checkout.id,orderId]);
  await client.query("UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2", [outstanding.rows[0].count === 0 ? 'paid' : 'partially_paid',orderId]);
  await logOrderEvent(orderId, 'payment_received', null, null, 'verified', `NatCash payment verified for seller ${legacySession.seller_id}`, client);
  return orderId;
}

function deliveryFeeFor(profile, distanceMeters) {
  if (profile.delivery_fee_type === 'free') return 0;
  if (profile.delivery_fee_type === 'flat') return Number(profile.flat_delivery_fee || 0);
  if (profile.delivery_fee_type === 'per_distance') {
    const stepMeters = Number(profile.distance_step_meters);
    const stepFee = Number(profile.distance_step_fee);
    if (!Number.isFinite(stepMeters) || stepMeters <= 0 || !Number.isFinite(stepFee) || stepFee < 0) return null;
    return Math.ceil(distanceMeters / stepMeters) * stepFee;
  }
  const rules = Array.isArray(profile.distance_fee_rules) ? profile.distance_fee_rules : [];
  const matchingRule = rules
    .map(rule => ({ maxDistanceMeters: Number(rule.maxDistanceMeters), fee: Number(rule.fee) }))
    .sort((a, b) => a.maxDistanceMeters - b.maxDistanceMeters)
    .find(rule => Number.isFinite(rule.maxDistanceMeters) && distanceMeters <= rule.maxDistanceMeters);
  return matchingRule ? matchingRule.fee : null;
}

async function buildFulfillmentTerms(client, cart, fulfillmentSelections) {
  const productIds = [...new Set(cart.map(item => item.id || item.productId).filter(Boolean))];
  const productRows = await client.query(
    'SELECT id, seller_id, meetup_enabled, delivery_enabled FROM products WHERE id = ANY($1)',
    [productIds]
  );
  const sellerByProduct = new Map(productRows.rows.map(row => [row.id, row.seller_id]));
  if (sellerByProduct.size !== productIds.length) throw new Error('One or more products are unavailable');

  // Listing-level fulfillment flags intersect with the seller profile:
  // NULL = follow seller setting, false = method disabled for this listing.
  const listingSupport = new Map();
  for (const row of productRows.rows) {
    const support = listingSupport.get(row.seller_id) || { delivery: true, meetup: true };
    if (row.delivery_enabled === false) support.delivery = false;
    if (row.meetup_enabled === false) support.meetup = false;
    listingSupport.set(row.seller_id, support);
  }

  const sellerIds = [...new Set(productRows.rows.map(row => row.seller_id))];
  const profiles = await client.query(
    `SELECT u.id AS seller_id, sl.lat, sl.lng,
            COALESCE(fp.delivery_enabled, false) AS delivery_enabled,
            COALESCE(fp.meetup_enabled, false) AS meetup_enabled,
            COALESCE(fp.delivery_radius_meters, 5000) AS delivery_radius_meters,
            COALESCE(fp.meetup_radius_meters, 12000) AS meetup_radius_meters,
            COALESCE(fp.delivery_fee_type, 'flat') AS delivery_fee_type,
            COALESCE(fp.flat_delivery_fee, 0) AS flat_delivery_fee,
            COALESCE(fp.distance_fee_rules, '[]'::jsonb) AS distance_fee_rules,
            COALESCE(fp.distance_step_meters, 2000) AS distance_step_meters,
            COALESCE(fp.distance_step_fee, 0) AS distance_step_fee
       FROM users u
       LEFT JOIN seller_locations sl ON sl.seller_id = u.id
       LEFT JOIN seller_fulfillment_profiles fp ON fp.seller_id = u.id
       WHERE u.id = ANY($1)`,
    [sellerIds]
  );
  const profileBySeller = new Map(profiles.rows.map(row => [row.seller_id, row]));
  const terms = [];
  for (const sellerId of sellerIds) {
    const profile = profileBySeller.get(sellerId);
    const selection = fulfillmentSelections.find(item => item?.sellerId === sellerId);
    if (!selection || !['delivery', 'meetup'].includes(selection.method)) throw new Error('Choose delivery or meetup for every seller');
    const { method, location } = selection;
    const profileEnabled = method === 'delivery' ? profile.delivery_enabled : profile.meetup_enabled;
    const listingOk = (listingSupport.get(sellerId) || { delivery: true, meetup: true })[method];
    if (!profileEnabled || !listingOk) throw new Error(`This seller does not offer ${method} for every item in your cart`);
    if (profile.lat == null || profile.lng == null) throw new Error('This seller has not configured a fulfillment location yet');
    if (!location || !Number.isFinite(Number(location.lat)) || !Number.isFinite(Number(location.lng))) {
      throw new Error('A precise buyer location is required to calculate fulfillment eligibility');
    }
    let distanceMeters = null;
    distanceMeters = Math.round(haversineDistance(Number(profile.lat), Number(profile.lng), Number(location.lat), Number(location.lng)));
    const radius = method === 'delivery' ? Number(profile.delivery_radius_meters) : Number(profile.meetup_radius_meters);
    if (distanceMeters > radius) throw new Error(`Your selected ${method} location is outside this seller's service area`);
    const fee = method === 'delivery'
      ? deliveryFeeFor(profile, distanceMeters ?? 0)
      : 0;
    if (fee === null) throw new Error('This delivery address is outside the seller’s delivery pricing area');
    const meetupAt = method === 'meetup' ? new Date(selection.meetupAt || location.meetupAt || NaN) : null;
    if (method === 'meetup' && (!Number.isFinite(meetupAt?.getTime()) || meetupAt.getTime() <= Date.now())) {
      throw new Error('Choose a future meetup date and time');
    }
    terms.push({ sellerId, method, deliveryFee: fee, distanceMeters, meetupAt: meetupAt?.toISOString() || null, location: { lat: Number(location.lat), lng: Number(location.lng), address: location.address || null, note: location.note || null } });
  }
  return terms;
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
      // APP-Q550: order items carry their own item/terms snapshot, so a receipt
      // survives even if the listing is later removed from public discovery.
      `SELECT oi.*, COALESCE(oi.product_name, p.name) AS product_name, COALESCE(oi.price, p.price) AS product_price,
              COALESCE(oi.product_image, pi.image_url) AS product_image
       FROM order_items oi
       LEFT JOIN products p ON oi.product_id = p.id
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
    const meetupCheckinResult = order.delivery_method === 'meetup'
      ? await pool.query('SELECT 1 FROM meetup_checkins WHERE order_id = $1 LIMIT 1', [req.params.id])
      : { rowCount: 0 };

    // The buyer's own review for this order, so Order Detail can offer edit or
    // delete (the review is soft-deleted, not removed from the audit record).
    const myReview = await pool.query(
      `SELECT id, rating, comment, is_edited, seller_response, created_at, deleted_at
         FROM reviews WHERE order_id = $1 AND reviewer_id = $2`,
      [req.params.id, req.user.id]
    );

    const cancellationRequests = await pool.query(
      `SELECT d.id, d.seller_id, d.raised_by, d.description, d.status, d.resolution,
              d.response_deadline, d.created_at, seller.full_name AS seller_name,
              requester.full_name AS requester_name
       FROM disputes d
       LEFT JOIN users seller ON seller.id = d.seller_id
       LEFT JOIN users requester ON requester.id = d.raised_by
       WHERE d.order_id = $1 AND d.reason = 'cancellation_request'
         AND ($2 = 'buyer' OR d.seller_id = $3)
       ORDER BY d.created_at DESC`,
      [req.params.id, myRole, req.user.id]
    );

    // APP-Q364: expose the terms version in effect when this order began, for
    // historical context. Accepted order terms are never rewritten by a later
    // policy change; this is a read-time reference only.
    let termsPolicyVersion = null;
    try {
      const versionAtOrder = await pool.query(
        `SELECT version FROM policy_versions
          WHERE kind = 'terms' AND effective_at <= $1
          ORDER BY effective_at DESC, id DESC
          LIMIT 1`,
        [order.created_at]
      );
      termsPolicyVersion = versionAtOrder.rows[0]?.version || null;
    } catch {
      // Policy tables may not exist yet on an older database; the order is unaffected.
      termsPolicyVersion = null;
    }

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
        meetup_started: meetupCheckinResult.rowCount > 0,
        cancellation_requests: cancellationRequests.rows,
        my_review: myReview.rows[0] || null,
        terms_policy_version: termsPolicyVersion,
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
                COALESCE(o.seller_snapshot_name, u.full_name) AS seller_name, o.seller_snapshot_logo_url, u.phone AS seller_phone, u.natcash_phone,
                'buyer' AS my_role,
                (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) AS item_count,
                (SELECT COALESCE(oi2.product_name, p.name) FROM order_items oi2 LEFT JOIN products p ON oi2.product_id = p.id WHERE oi2.order_id = o.id ORDER BY oi2.id LIMIT 1) AS first_product_name,
                (SELECT COALESCE(oi3.product_image, pi.thumbnail_url, pi.image_url) FROM order_items oi3 LEFT JOIN product_images pi ON oi3.product_id = pi.product_id AND pi.is_primary = true WHERE oi3.order_id = o.id ORDER BY oi3.id, pi.display_order ASC LIMIT 1) AS product_image
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
                (SELECT COALESCE(oi2.product_name, p.name) FROM order_items oi2 LEFT JOIN products p ON oi2.product_id = p.id WHERE oi2.order_id = o.id ORDER BY oi2.id LIMIT 1) AS first_product_name,
                (SELECT COALESCE(oi3.product_image, pi.thumbnail_url, pi.image_url) FROM order_items oi3 LEFT JOIN product_images pi ON oi3.product_id = pi.product_id AND pi.is_primary = true WHERE oi3.order_id = o.id ORDER BY oi3.id, pi.display_order ASC LIMIT 1) AS product_image
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
  const { cart, fulfillmentSelections, deliveryMethod, deliveryName, deliveryPhone, deliveryAddress, deliveryCity, deliveryNote, meetupLat, meetupLng, meetupAddress, meetupName, paymentMethod, promoCode } = req.body;
  if (!cart || !Array.isArray(cart) || cart.length === 0) return res.status(400).json({ error: 'Cart is empty' });

  try {
    // Never trust client prices or seller ids in checkout snapshots. Accepted
    // offers are checked against the exact product, buyer, quantity and expiry.
    const normalizedCart = [];
    const seenKeys = new Set();
    for (const item of cart) {
      const productId = item.id || item.productId;
      const quantity = Number(item.quantity || 1);
      if (!productId || !/^[0-9a-f-]{36}$/i.test(productId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
        return res.status(400).json({ error: 'Each cart item needs a valid product and quantity' });
      }
      if (item.variantId != null && !/^[0-9a-f-]{36}$/i.test(item.variantId)) {
        return res.status(400).json({ error: 'Invalid product option' });
      }
      const itemKey = `${productId}::${item.variantId || ''}`;
      if (seenKeys.has(itemKey)) return res.status(400).json({ error: 'Each listing option can only appear once in the cart' });
      seenKeys.add(itemKey);
      const productResult = await pool.query(
        `SELECT id, seller_id, name, price, sale_price, sale_starts_at, sale_ends_at, stock, is_available
         FROM products WHERE id = $1`, [productId]
      );
      const product = productResult.rows[0];
      if (!product || !product.is_available) return res.status(409).json({ error: 'A listing in your cart is no longer available' });
      if (product.seller_id === req.user.id) return res.status(400).json({ error: 'You cannot purchase your own product' });

      let variantRow = null;
      if (item.variantId) {
        const vr = await pool.query(
          'SELECT id, product_id, option_label, price, stock FROM product_variants WHERE id = $1',
          [item.variantId]
        );
        variantRow = vr.rows[0];
        if (!variantRow || variantRow.product_id !== product.id) {
          return res.status(400).json({ error: 'Invalid product option' });
        }
      }

      const availableStock = variantRow ? Number(variantRow.stock) : Number(product.stock);
      const stockLabel = variantRow ? ` (${variantRow.option_label})` : '';
      if (availableStock < quantity) return res.status(409).json({ error: `Insufficient stock for "${product.name}"${stockLabel}` });
      let price;
      if (item.acceptedOfferMessageId) {
        if (typeof item.acceptedOfferMessageId !== 'string' || !/^[0-9a-f-]{36}$/i.test(item.acceptedOfferMessageId)) {
          return res.status(400).json({ error: 'Invalid accepted offer reference' });
        }
        const acceptedOffer = await pool.query(
          `SELECT mo.offered_price FROM message_offers mo
           WHERE mo.message_id = $1 AND mo.product_id = $2 AND mo.buyer_id = $3
             AND mo.seller_id = $4 AND mo.quantity = $5 AND mo.status = 'accepted'
             AND mo.accepted_checkout_id IS NULL
             AND mo.accepted_expires_at > CURRENT_TIMESTAMP`,
          [item.acceptedOfferMessageId, product.id, req.user.id, product.seller_id, quantity]
        );
        if (!acceptedOffer.rows.length) return res.status(409).json({ error: 'This accepted offer is no longer valid for the selected quantity' });
        price = Number(acceptedOffer.rows[0].offered_price);
      } else if (variantRow) {
        // Variant listings never carry a sale price, so the variant price is final.
        price = Number(variantRow.price);
        const clientPrice = Number(item.effective_price ?? item.price);
        if (!Number.isFinite(clientPrice) || Math.round(clientPrice * 100) !== Math.round(price * 100)) {
          return res.status(409).json({ error: `The price for "${product.name}"${stockLabel} changed. Refresh your cart and review the new total.` });
        }
      } else {
        const saleActive = product.sale_price && (!product.sale_starts_at || new Date(product.sale_starts_at) <= new Date()) && (!product.sale_ends_at || new Date(product.sale_ends_at) >= new Date());
        price = Number(saleActive ? product.sale_price : product.price);
        const clientPrice = Number(item.effective_price ?? item.price);
        if (!Number.isFinite(clientPrice) || Math.round(clientPrice * 100) !== Math.round(price * 100)) {
          return res.status(409).json({ error: `The price for "${product.name}" changed. Refresh your cart and review the new total.` });
        }
      }
      const imageRes = await pool.query(
        'SELECT image_url FROM product_images WHERE product_id = $1 ORDER BY is_primary DESC, display_order ASC LIMIT 1',
        [product.id]
      );
      normalizedCart.push({
        ...item,
        id: product.id,
        productId: product.id,
        name: product.name,
        seller_id: product.seller_id,
        quantity,
        price,
        variantId: variantRow ? variantRow.id : null,
        variantLabel: variantRow ? variantRow.option_label : null,
        product_name: product.name,
        product_image: item.product_image || imageRes.rows[0]?.image_url || null,
      });
    }
    // `fulfillmentSelections` is authoritative.  The legacy order-wide fields
    // below are retained only to render historic orders during the migration.
    const legacyLocation = deliveryMethod === 'meetup'
      ? { lat: meetupLat, lng: meetupLng, address: meetupAddress || null, note: deliveryNote || null }
      : { lat: req.user.location_lat, lng: req.user.location_lng, address: deliveryAddress || null, note: deliveryNote || null };
    const selections = Array.isArray(fulfillmentSelections) && fulfillmentSelections.length > 0
      ? fulfillmentSelections
      : [...new Set(normalizedCart.map(item => item.seller_id))].filter(Boolean).map(sellerId => ({ sellerId, method: deliveryMethod, location: legacyLocation }));
    if ((paymentMethod || 'moncash') === 'natcash') {
      const sellerIds = [...new Set(normalizedCart.map(item => item.seller_id).filter(Boolean))];
      const unavailable = [];
      for (const sellerId of sellerIds) {
        const access = await getNatCashAccess(sellerId);
        if (!access.entitled || !access.paymentMethodEnabled) unavailable.push(sellerId);
      }
      if (unavailable.length) return res.status(403).json({ error: 'One or more sellers do not currently accept NatCash', code: 'NATCASH_ACCESS_REQUIRED', sellerIds: unavailable });
    }
    // Validate seller capability and calculate seller-owned fees server-side.
    // The resulting snapshot is immutable input to the later agreement.
    const fulfillmentTerms = await buildFulfillmentTerms(pool, normalizedCart, selections);
    if ((paymentMethod || 'moncash') === 'natcash' && fulfillmentTerms.some(term => term.method !== 'meetup')) {
      return res.status(400).json({ error: 'NatCash payments require every seller to agree to an in-person meetup', code: 'NATCASH_MEETUP_REQUIRED' });
    }
    const fulfillmentFee = fulfillmentTerms.reduce((sum, term) => sum + Number(term.deliveryFee || 0), 0);
    const merchandiseTotal = normalizedCart.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);
    let checkoutDiscount = 0;
    if (promoCode) {
      const promoResult = await pool.query(
        `SELECT * FROM promo_codes WHERE code = $1 AND is_active = true
         AND (valid_until IS NULL OR valid_until > CURRENT_TIMESTAMP)`, [String(promoCode).toUpperCase()]
      );
      const promo = promoResult.rows[0];
      const eligibleTotal = promo?.seller_id
        ? normalizedCart.filter(item => item.seller_id === promo.seller_id).reduce((sum, item) => sum + Number(item.price) * item.quantity, 0)
        : merchandiseTotal;
      if (!promo || (promo.max_uses && promo.uses_count >= promo.max_uses) || eligibleTotal < Number(promo.min_order_amount || 0)) {
        return res.status(400).json({ error: 'Promo code is no longer valid for this cart' });
      }
      const alreadyUsed = await pool.query('SELECT 1 FROM promo_uses WHERE promo_id = $1 AND user_id = $2', [promo.id, req.user.id]);
      if (alreadyUsed.rows.length) return res.status(400).json({ error: 'You have already used this promo code' });
      checkoutDiscount = promo.discount_type === 'percentage'
        ? Math.min(eligibleTotal * Number(promo.discount_value) / 100, Number(promo.discount_value) * 10)
        : Math.min(eligibleTotal, Number(promo.discount_value));
    }
    const meetupAt = fulfillmentTerms.find(term => term.method === 'meetup')?.meetupAt || null;
    const result = await pool.query(
      `INSERT INTO pending_checkouts (user_id, cart_data, delivery_method, delivery_name, delivery_phone, delivery_address, delivery_city, delivery_note, meetup_lat, meetup_lng, meetup_address, meetup_name, payment_method, promo_code, total_amount, fulfillment_terms, expires_at, meetup_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, CURRENT_TIMESTAMP + INTERVAL '24 hours', $17) RETURNING id`,
      [req.user.id, JSON.stringify(normalizedCart), deliveryMethod, deliveryName || null, deliveryPhone || null, deliveryAddress || null, deliveryCity || null, deliveryNote || null, meetupLat || null, meetupLng || null, meetupAddress || null, meetupName || null, paymentMethod || 'moncash', promoCode || null, Math.max(0, merchandiseTotal - checkoutDiscount) + fulfillmentFee, JSON.stringify(fulfillmentTerms), meetupAt]
    );
    const pendingId = result.rows[0].id;

    // Reserve stock for each item — ALL-OR-NOTHING in a single transaction
    const reservationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // negotiated proposal window
    const stockClient = await pool.connect();
    try {
      await stockClient.query('BEGIN');

      // Lock ALL products first (consistent ordering to prevent deadlocks)
      const productIds = normalizedCart.map(i => i.id || i.productId).filter(Boolean).sort();
      for (const pid of productIds) {
        await stockClient.query('SELECT stock FROM products WHERE id = $1 FOR UPDATE', [pid]);
      }

      // Claim each accepted offer for this checkout so a second checkout
      // cannot reuse the negotiated price before payment settles.
      let offerReservationFailed = false;
      for (const item of normalizedCart.filter(i => i.acceptedOfferMessageId)) {
        const claimed = await stockClient.query(
          `UPDATE message_offers SET accepted_checkout_id = $1
           WHERE message_id = $2 AND product_id = $3 AND buyer_id = $4 AND seller_id = $5
             AND quantity = $6 AND status = 'accepted' AND accepted_checkout_id IS NULL
             AND accepted_expires_at > CURRENT_TIMESTAMP RETURNING message_id`,
          [pendingId, item.acceptedOfferMessageId, item.id, req.user.id, item.seller_id, item.quantity]
        );
        if (!claimed.rowCount) { offerReservationFailed = true; break; }
      }
      if (offerReservationFailed) {
        await stockClient.query('ROLLBACK');
        await pool.query("UPDATE pending_checkouts SET status = 'expired' WHERE id = $1", [pendingId]);
        return res.status(409).json({ error: 'This accepted offer is already in checkout or has expired. Refresh the offer and try again.' });
      }

      // Validate all stock in one pass
      for (const item of normalizedCart) {
        const productId = item.id || item.productId;
        if (!productId) continue;
        const stockCheck = await stockClient.query('SELECT stock, is_available FROM products WHERE id = $1', [productId]);
        if (stockCheck.rows.length === 0 || !stockCheck.rows[0].is_available || stockCheck.rows[0].stock < (item.quantity || 1)) {
          await stockClient.query('ROLLBACK');
          // Mark checkout as failed (stock unavailable)
          await pool.query("UPDATE pending_checkouts SET status = 'expired' WHERE id = $1", [pendingId]);
          return res.status(400).json({ error: `Insufficient stock for "${item.name || productId}"` });
        }
        if (item.variantId) {
          const variantCheck = await stockClient.query('SELECT stock FROM product_variants WHERE id = $1 AND product_id = $2 FOR UPDATE', [item.variantId, productId]);
          if (variantCheck.rows.length === 0 || variantCheck.rows[0].stock < (item.quantity || 1)) {
            await stockClient.query('ROLLBACK');
            await pool.query("UPDATE pending_checkouts SET status = 'expired' WHERE id = $1", [pendingId]);
            return res.status(400).json({ error: `Insufficient stock for "${item.name || productId}"${item.variantLabel ? ` (${item.variantLabel})` : ''}` });
          }
        }
      }

      // All stock valid — decrement and create reservations (with seller_id for per-seller expiry)
      for (const item of normalizedCart) {
        const productId = item.id || item.productId;
        if (!productId) continue;
        await stockClient.query('UPDATE products SET stock = stock - $1 WHERE id = $2', [item.quantity || 1, productId]);
        if (item.variantId) {
          await stockClient.query('UPDATE product_variants SET stock = stock - $1 WHERE id = $2', [item.quantity || 1, item.variantId]);
        }
        // Fetch seller_id for per-seller NatCash stock release
        const sellerRes = await stockClient.query('SELECT seller_id FROM products WHERE id = $1', [productId]);
        const sellerId = sellerRes.rows[0]?.seller_id || null;
        await stockClient.query(
          `INSERT INTO stock_reservations (checkout_id, product_id, quantity, expires_at, status, seller_id, variant_id)
           VALUES ($1, $2, $3, $4, 'active', $5, $6)`,
          [pendingId, productId, item.quantity || 1, reservationExpiry, sellerId, item.variantId || null]
        );
      }

      await stockClient.query('COMMIT');
    } catch (e) {
      await stockClient.query('ROLLBACK');
      console.error('Stock reservation transaction failed:', e.message);
      await pool.query("UPDATE pending_checkouts SET status = 'expired' WHERE id = $1", [pendingId]);
      return res.status(500).json({ error: 'Stock reservation failed' });
    } finally {
      stockClient.release();
    }

    // Payment is intentionally unavailable until every seller accepts exactly
    // the terms the buyer just accepted. This is the agreement gate.
    for (const term of fulfillmentTerms) {
      await pool.query(
        `INSERT INTO pending_fulfillment_agreements (checkout_id, seller_id, terms, last_proposed_by, response_expires_at)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP + INTERVAL '24 hours') ON CONFLICT (checkout_id, seller_id) DO NOTHING`,
        [pendingId, term.sellerId, JSON.stringify(term), req.user.id]
      );
      await pool.query(
        `INSERT INTO pending_fulfillment_history (checkout_id, seller_id, actor_id, action, version, terms)
         VALUES ($1,$2,$3,'buyer_proposed',1,$4)`, [pendingId, term.sellerId, req.user.id, JSON.stringify(term)]
      );
      createNotification(term.sellerId, 'fulfillment_proposed', 'Fulfillment proposal', 'Review and accept the buyer’s delivery or meetup terms before payment.', { pendingId, sellerId: term.sellerId });
    }
    res.status(201).json({ pendingId, paymentMethod, fulfillmentTerms, fulfillmentFee, agreementStatus: 'awaiting_seller_acceptance' });
  } catch (err) {
    console.error('Pending checkout error:', err);
    const message = err.message || 'Server error';
    res.status(message.includes('seller') || message.includes('location') || message.includes('delivery') ? 400 : 500).json({ error: message });
  }
});

router.get('/checkout/natcash-availability', authRequired, async (req, res) => {
  try {
    const sellerIds = String(req.query.sellerIds || '').split(',').filter(Boolean);
    if (!sellerIds.length || sellerIds.length > 30 || sellerIds.some(id => !/^[0-9a-f-]{36}$/i.test(id))) {
      return res.status(400).json({ error: 'Valid sellerIds are required' });
    }
    const sellers = [];
    for (const sellerId of [...new Set(sellerIds)]) {
      const access = await getNatCashAccess(sellerId);
      sellers.push({ sellerId, available: access.entitled && access.paymentMethodEnabled });
    }
    res.json({ sellers, available: sellers.length > 0 && sellers.every(seller => seller.available) });
  } catch (err) {
    console.error('NatCash availability error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/checkout/popular-meetup-spots', authRequired, async (req, res) => {
  try {
    const sellerIds = String(req.query.sellerIds || '').split(',').filter(Boolean);
    if (!sellerIds.length || sellerIds.length > 20 || sellerIds.some(id => !/^[0-9a-f-]{36}$/i.test(id))) return res.status(400).json({ error: 'Valid sellerIds are required' });
    const [buyerResult, sellersResult, spotsResult] = await Promise.all([
      pool.query('SELECT location_lat, location_lng FROM users WHERE id = $1', [req.user.id]),
      pool.query(
        `SELECT u.id, sl.lat, sl.lng, COALESCE(fp.meetup_radius_meters, 12000) AS radius
         FROM users u LEFT JOIN seller_locations sl ON sl.seller_id = u.id
         LEFT JOIN seller_fulfillment_profiles fp ON fp.seller_id = u.id WHERE u.id = ANY($1)`, [sellerIds]
      ),
      pool.query(`
        WITH mutual AS (
          SELECT c.order_id, c.seller_id, c.place_key, c.place_label,
                 AVG(c.lat)::float AS lat, AVG(c.lng)::float AS lng
          FROM meetup_place_confirmations c
          JOIN seller_fulfillments sf ON sf.order_id = c.order_id AND sf.seller_id = c.seller_id
          WHERE c.created_at >= CURRENT_TIMESTAMP - INTERVAL '90 days'
            AND sf.fulfillment_method = 'meetup' AND sf.fulfillment_status = 'completed'
          GROUP BY c.order_id, c.seller_id, c.place_key, c.place_label
          HAVING COUNT(DISTINCT c.user_id) = 2
        ), flagged AS (
          SELECT place_key FROM meetup_place_reports
          WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '90 days'
          GROUP BY place_key HAVING COUNT(DISTINCT order_id) >= 2
        )
        SELECT m.place_key, MIN(m.place_label) AS name, AVG(m.lat)::float AS lat, AVG(m.lng)::float AS lng,
               COUNT(DISTINCT m.order_id)::int AS completed_orders
        FROM mutual m LEFT JOIN flagged f ON f.place_key = m.place_key
        WHERE f.place_key IS NULL
        GROUP BY m.place_key
        HAVING COUNT(DISTINCT m.order_id) >= 7
        ORDER BY COUNT(DISTINCT m.order_id) DESC LIMIT 100
      `),
    ]);
    const buyer = buyerResult.rows[0];
    const sellers = sellersResult.rows;
    const spots = spotsResult.rows.filter(spot => {
      if (buyer?.location_lat != null && buyer?.location_lng != null && haversineDistance(Number(buyer.location_lat), Number(buyer.location_lng), spot.lat, spot.lng) > 50000) return false;
      return sellers.every(seller => seller.lat != null && seller.lng != null && haversineDistance(Number(seller.lat), Number(seller.lng), spot.lat, spot.lng) <= Number(seller.radius));
    }).map(spot => ({ id: spot.place_key, name: spot.name, lat: spot.lat, lng: spot.lng, communitySignal: '7+ completed meetups in the past 90 days', label: 'Popular meetup spot' }));
    res.json({ spots });
  } catch (err) {
    console.error('Popular meetup spots error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/seller/fulfillment-proposals', authRequired, async (req, res) => {
  try {
    const proposals = await pool.query(
      `SELECT a.*, pc.payment_method, pc.created_at AS checkout_created_at,
              u.full_name AS buyer_name, u.phone AS buyer_phone
       FROM pending_fulfillment_agreements a
       JOIN pending_checkouts pc ON pc.id = a.checkout_id
       JOIN users u ON u.id = pc.user_id
       WHERE a.seller_id = $1 AND a.status = 'proposed' AND a.last_proposed_by IS DISTINCT FROM $1 AND pc.status = 'pending'
       ORDER BY a.created_at DESC`, [req.user.id]
    );
    res.json({ proposals: proposals.rows });
  } catch (err) {
    console.error('Fulfillment proposals error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/checkout/pending/:id/agreements', authRequired, async (req, res) => {
  try {
    const checkout = await pool.query('SELECT id, status, payment_method, total_amount, expires_at, meetup_at, meetup_lat, meetup_lng, meetup_address, meetup_name FROM pending_checkouts WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!checkout.rows[0]) return res.status(404).json({ error: 'Pending checkout not found' });
    const agreements = await pool.query(
      `SELECT a.*, u.full_name AS seller_name
       FROM pending_fulfillment_agreements a JOIN users u ON u.id = a.seller_id
       WHERE a.checkout_id = $1 ORDER BY a.created_at`, [req.params.id]
    );
    const history = await pool.query(
      `SELECT seller_id, actor_id, action, version, terms, created_at FROM pending_fulfillment_history
       WHERE checkout_id = $1 ORDER BY created_at ASC`, [req.params.id]
    );
    const paymentActivity = await pool.query(
      "SELECT 1 FROM fulfillment_payment_sessions WHERE checkout_id = $1 AND status IN ('pending','processing','completed') LIMIT 1",
      [req.params.id]
    );
    res.json({ checkout: checkout.rows[0], agreements: agreements.rows, history: history.rows, canRemoveSeller: checkout.rows[0].status === 'pending' && paymentActivity.rowCount === 0 });
  } catch (err) {
    console.error('Checkout agreement fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/checkout/pending/:id/sellers/:sellerId', authRequired, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const checkoutResult = await client.query(
      "SELECT * FROM pending_checkouts WHERE id = $1 AND user_id = $2 AND status = 'pending' AND expires_at > CURRENT_TIMESTAMP FOR UPDATE",
      [req.params.id, req.user.id]
    );
    const checkout = checkoutResult.rows[0];
    if (!checkout) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Pending checkout not found or no longer editable' }); }
    const paymentActivity = await client.query(
      "SELECT id FROM fulfillment_payment_sessions WHERE checkout_id = $1 AND status IN ('pending','processing','completed') LIMIT 1 FOR UPDATE",
      [checkout.id]
    );
    if (paymentActivity.rowCount) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'A seller payment has started. Checkout can no longer be changed.' }); }

    const sellerId = String(req.params.sellerId);
    const cart = Array.isArray(checkout.cart_data) ? checkout.cart_data : [];
    const removed = cart.filter(item => String(item.seller_id || item.sellerId || '') === sellerId);
    if (!removed.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Seller portion not found in this checkout' }); }
    const remainingCart = cart.filter(item => String(item.seller_id || item.sellerId || '') !== sellerId);
    const terms = Array.isArray(checkout.fulfillment_terms) ? checkout.fulfillment_terms : [];
    const remainingTerms = terms.filter(term => String(term.sellerId || term.seller_id || '') !== sellerId);
    const remainingSellerIds = new Set(remainingCart.map(item => String(item.seller_id || item.sellerId || '')).filter(Boolean));
    if (remainingSellerIds.size !== remainingTerms.length || remainingTerms.some(term => !remainingSellerIds.has(String(term.sellerId || term.seller_id || '')))) {
      await client.query('ROLLBACK'); return res.status(409).json({ error: 'Seller fulfillment allocations are inconsistent; checkout was not changed.' });
    }

    const agreements = await client.query('SELECT id FROM pending_fulfillment_agreements WHERE checkout_id = $1 AND seller_id = $2 FOR UPDATE', [checkout.id, sellerId]);
    let promoCode = checkout.promo_code;
    let promo = null;
    let promoRemoved = false;
    if (promoCode && remainingCart.length) {
      const promoResult = await client.query(
        `SELECT id, seller_id, discount_type, discount_value, min_order_amount
         FROM promo_codes WHERE code = $1 AND is_active = true AND (valid_until IS NULL OR valid_until > CURRENT_TIMESTAMP) FOR UPDATE`,
        [promoCode]
      );
      promo = promoResult.rows[0] || null;
      if (!promo || (promo.seller_id && !remainingSellerIds.has(String(promo.seller_id)))) {
        promoCode = null; promo = null; promoRemoved = true;
      }
    } else if (promoCode) { promoCode = null; promoRemoved = true; }

    let totals = { totalAmount: 0, sellers: [] };
    if (remainingCart.length) {
      if (promo) {
        const eligibleAmount = promo.seller_id
          ? remainingCart.filter(item => String(item.seller_id || item.sellerId || '') === String(promo.seller_id)).reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1), 0)
          : remainingCart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1), 0);
        if (eligibleAmount < Number(promo.min_order_amount || 0)) { promo = null; promoCode = null; promoRemoved = true; }
      }
      try { totals = calculatePendingCheckoutTotals(remainingCart, remainingTerms, promo); }
      catch (error) { await client.query('ROLLBACK'); return res.status(409).json({ error: error.message || 'Checkout totals could not be safely recalculated.' }); }
    }

    const reservedRows = await client.query(
      "SELECT product_id, variant_id, quantity FROM stock_reservations WHERE checkout_id = $1 AND seller_id = $2 AND status = 'active' FOR UPDATE",
      [checkout.id, sellerId]
    );
    const aggregate = (items, getKey) => {
      const result = new Map();
      for (const item of items) {
        const key = getKey(item);
        result.set(key, (result.get(key) || 0) + Number(item.quantity || 1));
      }
      return result;
    };
    const expectedReservations = aggregate(removed, item => `${item.id || item.productId}:${item.variantId || ''}`);
    const actualReservations = aggregate(reservedRows.rows, item => `${item.product_id}:${item.variant_id || ''}`);
    if (expectedReservations.size !== actualReservations.size || [...expectedReservations].some(([key, quantity]) => actualReservations.get(key) !== quantity)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Reserved stock no longer matches this seller portion. Checkout was not changed; refresh and try again.' });
    }

    const released = await client.query(
      "UPDATE stock_reservations SET status = 'released', released_at = CURRENT_TIMESTAMP WHERE checkout_id = $1 AND seller_id = $2 AND status = 'active' RETURNING product_id, quantity, variant_id",
      [checkout.id, sellerId]
    );
    for (const reservation of released.rows) {
      await client.query('UPDATE products SET stock = stock + $1 WHERE id = $2', [reservation.quantity, reservation.product_id]);
      if (reservation.variant_id) await client.query('UPDATE product_variants SET stock = stock + $1 WHERE id = $2', [reservation.quantity, reservation.variant_id]);
    }
    await client.query(
      "UPDATE message_offers SET accepted_checkout_id = NULL WHERE accepted_checkout_id = $1 AND seller_id = $2 AND status = 'accepted'",
      [checkout.id, sellerId]
    );
    await client.query(
      `INSERT INTO pending_fulfillment_history (checkout_id, seller_id, actor_id, action, version, terms)
       SELECT $1, $2, $3, 'buyer_removed_seller', COALESCE(MAX(version), 0) + 1,
              COALESCE((SELECT terms FROM pending_fulfillment_agreements WHERE id = $4), '{}'::jsonb)
       FROM pending_fulfillment_history WHERE checkout_id = $1 AND seller_id = $2`,
      [checkout.id, sellerId, req.user.id, agreements.rows[0]?.id || null]
    );
    await client.query('DELETE FROM pending_fulfillment_agreements WHERE checkout_id = $1 AND seller_id = $2', [checkout.id, sellerId]);

    if (!remainingCart.length) {
      const releasedAll = await client.query(
        "UPDATE stock_reservations SET status = 'released', released_at = CURRENT_TIMESTAMP WHERE checkout_id = $1 AND status = 'active' RETURNING product_id, quantity, variant_id",
        [checkout.id]
      );
      for (const reservation of releasedAll.rows) {
        await client.query('UPDATE products SET stock = stock + $1 WHERE id = $2', [reservation.quantity, reservation.product_id]);
        if (reservation.variant_id) await client.query('UPDATE product_variants SET stock = stock + $1 WHERE id = $2', [reservation.quantity, reservation.variant_id]);
      }
      await client.query("UPDATE message_offers SET accepted_checkout_id = NULL WHERE accepted_checkout_id = $1 AND status = 'accepted'", [checkout.id]);
      await client.query("UPDATE pending_checkouts SET status = 'cancelled', cart_data = '[]'::jsonb, fulfillment_terms = '[]'::jsonb, promo_code = NULL, total_amount = 0 WHERE id = $1", [checkout.id]);
    } else {
      const meetup = remainingTerms.find(term => term.method === 'meetup');
      await client.query(
        `UPDATE pending_checkouts SET cart_data = $1, fulfillment_terms = $2, promo_code = $3, total_amount = $4,
         meetup_lat = $5, meetup_lng = $6, meetup_address = $7, meetup_name = $8, meetup_at = $9 WHERE id = $10`,
        [JSON.stringify(remainingCart), JSON.stringify(remainingTerms), promoCode, totals.totalAmount,
          meetup?.location?.lat ?? null, meetup?.location?.lng ?? null, meetup?.location?.address ?? null,
          meetup?.location?.name ?? null, meetup?.meetupAt ?? null, checkout.id]
      );
    }
    await client.query('COMMIT');
    createNotification(sellerId, 'fulfillment_cancelled', 'Checkout updated', 'The buyer removed your seller portion before payment started.', { pendingId: checkout.id, sellerId });
    return res.json({ removed: true, checkoutCancelled: !remainingCart.length, sellerId, totalAmount: totals.totalAmount, sellers: totals.sellers, promoRemoved });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('Pending checkout seller removal error:', err);
    return res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
});

async function normalizeMeetupCounter(db, checkoutId, location, meetupAt) {
  const checkout = await db.query("SELECT cart_data FROM pending_checkouts WHERE id = $1 AND status = 'pending'", [checkoutId]);
  if (!checkout.rows[0]) return { error: 'Pending checkout not found or expired' };
  const current = await db.query('SELECT * FROM pending_fulfillment_agreements WHERE checkout_id = $1 FOR UPDATE', [checkoutId]);
  const meetupAgreements = current.rows.filter(row => row.terms?.method === 'meetup');
  if (!meetupAgreements.length) return { error: 'This checkout has no meetup sellers' };
  const selections = meetupAgreements.map(row => ({
    sellerId: row.seller_id,
    method: 'meetup',
    meetupAt,
    location: { ...location, note: row.terms?.location?.note || location?.note || null },
  }));
  const cart = checkout.rows[0].cart_data;
  const terms = await buildFulfillmentTerms(db, cart, selections);
  return { terms, agreements: meetupAgreements };
}

router.post('/checkout/pending/:id/agreements/:sellerId/counter', authRequired, async (req, res) => {
  const sellerId = req.params.sellerId;
  if (sellerId !== req.user.id) return res.status(403).json({ error: 'Only this checkout seller can counter' });
  const { location, meetupAt } = req.body || {};
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const checkout = await client.query(
      "SELECT user_id, status, expires_at FROM pending_checkouts WHERE id = $1 FOR UPDATE", [req.params.id]
    );
    if (!checkout.rows[0] || checkout.rows[0].status !== 'pending' || !checkout.rows[0].expires_at || new Date(checkout.rows[0].expires_at).getTime() <= Date.now()) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'This checkout is no longer editable' });
    }
    const row = await client.query(
      'SELECT * FROM pending_fulfillment_agreements WHERE checkout_id = $1 AND seller_id = $2 FOR UPDATE',
      [req.params.id, sellerId]
    );
    const agreement = row.rows[0];
    if (!agreement || !['proposed','rejected'].includes(agreement.status) || agreement.last_proposed_by === sellerId) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'This proposal can no longer be countered' });
    }
    if (agreement.terms?.method !== 'meetup') { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Only meetup locations can be countered here' }); }
    const inProgress = await client.query("SELECT 1 FROM fulfillment_payment_sessions WHERE checkout_id = $1 AND status IN ('pending','processing','completed') LIMIT 1", [req.params.id]);
    if (inProgress.rowCount) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'The meetup plan is locked while payment is in progress or complete' }); }
    const normalized = await normalizeMeetupCounter(client, req.params.id, location, meetupAt);
    if (normalized.error) { await client.query('ROLLBACK'); return res.status(400).json({ error: normalized.error }); }
    await client.query(
      `UPDATE pending_checkouts SET meetup_lat = $1, meetup_lng = $2, meetup_address = $3, meetup_name = $4, meetup_at = $5,
       expires_at = CURRENT_TIMESTAMP + INTERVAL '24 hours' WHERE id = $6`,
      [location.lat, location.lng, location.address || null, location.name || null, new Date(meetupAt).toISOString(), req.params.id]
    );
    for (const term of normalized.terms) {
      const currentAgreement = normalized.agreements.find(item => item.seller_id === term.sellerId);
      const version = Number(currentAgreement.proposal_version || 1) + 1;
      await client.query(
        `UPDATE pending_fulfillment_agreements SET terms = $1, status = 'proposed', buyer_accepted_at = NULL,
         seller_accepted_at = CASE WHEN seller_id = $2 THEN CURRENT_TIMESTAMP ELSE NULL END, terms_locked_at = NULL,
         last_proposed_by = $2, proposal_version = $3, response_expires_at = CURRENT_TIMESTAMP + INTERVAL '24 hours'
         WHERE id = $4`, [JSON.stringify(term), sellerId, version, currentAgreement.id]
      );
      await client.query(
        `INSERT INTO pending_fulfillment_history (checkout_id, seller_id, actor_id, action, version, terms)
         VALUES ($1,$2,$3,'seller_countered',$4,$5)`, [req.params.id, term.sellerId, sellerId, version, JSON.stringify(term)]
      );
      if (term.sellerId !== sellerId) createNotification(term.sellerId, 'fulfillment_proposed', 'Meetup plan changed', 'The buyer and another seller are discussing a shared meetup change. Review and confirm the proposed location and time.', { pendingId: req.params.id, sellerId: term.sellerId });
    }
    await client.query("UPDATE stock_reservations SET expires_at = CURRENT_TIMESTAMP + INTERVAL '24 hours' WHERE checkout_id = $1 AND status = 'active'", [req.params.id]);
    await client.query('COMMIT');
    createNotification(checkout.rows[0].user_id, 'fulfillment_countered', 'Meetup proposal updated', 'The seller suggested a different meetup plan. Review the new location and time.', { pendingId: req.params.id, sellerId });
    res.json({ status: 'proposed', version, responseExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('Fulfillment counter error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  } finally { client.release(); }
});

router.put('/checkout/pending/:id/agreements/:sellerId/buyer-decision', authRequired, async (req, res) => {
  const { decision } = req.body || {};
  if (!['accept','counter','cancel'].includes(decision)) return res.status(400).json({ error: 'decision must be accept, counter, or cancel' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const checkout = await client.query(
      'SELECT user_id, status, expires_at FROM pending_checkouts WHERE id = $1 FOR UPDATE', [req.params.id]
    );
    if (!checkout.rows[0] || checkout.rows[0].user_id !== req.user.id || checkout.rows[0].status !== 'pending' || !checkout.rows[0].expires_at || new Date(checkout.rows[0].expires_at).getTime() <= Date.now()) {
      await client.query('ROLLBACK'); return res.status(404).json({ error: 'Pending proposal not found or expired' });
    }
    const row = await client.query(
      'SELECT * FROM pending_fulfillment_agreements WHERE checkout_id = $1 AND seller_id = $2 FOR UPDATE',
      [req.params.id, req.params.sellerId]
    );
    const agreement = row.rows[0];
    if (!agreement) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Pending proposal not found or expired' }); }
    if (decision === 'cancel') {
      const paymentStarted = await client.query(
        "SELECT 1 FROM fulfillment_payment_sessions WHERE checkout_id = $1 AND status IN ('pending','processing','completed') LIMIT 1 FOR UPDATE",
        [req.params.id]
      );
      if (paymentStarted.rowCount) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'A seller payment has started. The checkout cannot be cancelled here.' }); }
      await client.query("UPDATE pending_checkouts SET status = 'cancelled' WHERE id = $1", [req.params.id]);
      const released = await client.query("UPDATE stock_reservations SET status = 'released', released_at = CURRENT_TIMESTAMP WHERE checkout_id = $1 AND status = 'active' RETURNING product_id, quantity, variant_id", [req.params.id]);
      for (const item of released.rows) {
        await client.query('UPDATE products SET stock = stock + $1 WHERE id = $2', [item.quantity, item.product_id]);
        if (item.variant_id) await client.query('UPDATE product_variants SET stock = stock + $1 WHERE id = $2', [item.quantity, item.variant_id]);
      }
      await client.query("UPDATE message_offers SET accepted_checkout_id = NULL WHERE accepted_checkout_id = $1 AND status = 'accepted'", [req.params.id]);
      await client.query("UPDATE pending_fulfillment_agreements SET status = 'cancelled' WHERE checkout_id = $1", [req.params.id]);
      await client.query('COMMIT');
      return res.json({ status: 'cancelled' });
    }
    if (decision === 'accept') {
      if (agreement.last_proposed_by !== agreement.seller_id || agreement.terms?.method !== 'meetup') {
        await client.query('ROLLBACK'); return res.status(409).json({ error: 'There is no seller meetup counter waiting for your confirmation' });
      }
      await client.query(
        `UPDATE pending_fulfillment_agreements SET buyer_accepted_at = CURRENT_TIMESTAMP,
         status = CASE WHEN seller_accepted_at IS NOT NULL THEN 'accepted' ELSE 'proposed' END,
         terms_locked_at = CASE WHEN seller_accepted_at IS NOT NULL THEN CURRENT_TIMESTAMP ELSE NULL END,
         last_proposed_by = $3, response_expires_at = CURRENT_TIMESTAMP + INTERVAL '24 hours'
         WHERE checkout_id = $1 AND terms->>'method' = 'meetup'`, [req.params.id, agreement.seller_id, req.user.id]
      );
      const meetupAgreements = await client.query("SELECT seller_id, proposal_version, terms FROM pending_fulfillment_agreements WHERE checkout_id = $1 AND terms->>'method' = 'meetup'", [req.params.id]);
      for (const item of meetupAgreements.rows) {
        await client.query(
          `INSERT INTO pending_fulfillment_history (checkout_id, seller_id, actor_id, action, version, terms)
           VALUES ($1,$2,$3,'buyer_accepted_counter',$4,$5)`, [req.params.id, item.seller_id, req.user.id, item.proposal_version, JSON.stringify(item.terms)]
        );
      }
    }
    if (decision === 'counter') {
      if (agreement.terms?.method !== 'meetup' || (!['accepted','rejected'].includes(agreement.status) && agreement.last_proposed_by !== agreement.seller_id)) {
        await client.query('ROLLBACK'); return res.status(409).json({ error: 'There is no meetup proposal waiting for a buyer counter' });
      }
      const paymentAttempt = await client.query(
        "SELECT 1 FROM fulfillment_payment_sessions WHERE checkout_id = $1 AND status IN ('pending','processing','completed') LIMIT 1",
        [req.params.id]
      );
      if (paymentAttempt.rowCount) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'This meetup plan is locked while payment is in progress or complete' }); }
      const normalized = await normalizeMeetupCounter(client, req.params.id, req.body.location, req.body.meetupAt);
      if (normalized.error) { await client.query('ROLLBACK'); return res.status(400).json({ error: normalized.error }); }
      await client.query(
        `UPDATE pending_checkouts SET meetup_lat = $1, meetup_lng = $2, meetup_address = $3, meetup_name = $4, meetup_at = $5,
         expires_at = CURRENT_TIMESTAMP + INTERVAL '24 hours' WHERE id = $6`,
        [req.body.location.lat, req.body.location.lng, req.body.location.address || null, req.body.location.name || null, new Date(req.body.meetupAt).toISOString(), req.params.id]
      );
      for (const term of normalized.terms) {
        const currentAgreement = normalized.agreements.find(item => item.seller_id === term.sellerId);
        const version = Number(currentAgreement.proposal_version || 1) + 1;
        await client.query(
          `UPDATE pending_fulfillment_agreements SET terms = $1, status = 'proposed', buyer_accepted_at = CURRENT_TIMESTAMP,
           seller_accepted_at = NULL, terms_locked_at = NULL, last_proposed_by = $2, proposal_version = $3,
           response_expires_at = CURRENT_TIMESTAMP + INTERVAL '24 hours' WHERE id = $4`,
          [JSON.stringify(term), req.user.id, version, currentAgreement.id]
        );
        await client.query(
          `INSERT INTO pending_fulfillment_history (checkout_id, seller_id, actor_id, action, version, terms)
           VALUES ($1,$2,$3,'buyer_countered',$4,$5)`, [req.params.id, term.sellerId, req.user.id, version, JSON.stringify(term)]
        );
        createNotification(term.sellerId, 'fulfillment_proposed', 'Buyer suggested a meetup change', 'Review the updated shared meetup location and time.', { pendingId: req.params.id, sellerId: term.sellerId });
      }
      await client.query("UPDATE pending_checkouts SET expires_at = CURRENT_TIMESTAMP + INTERVAL '24 hours' WHERE id = $1", [req.params.id]);
      await client.query("UPDATE stock_reservations SET expires_at = CURRENT_TIMESTAMP + INTERVAL '24 hours' WHERE checkout_id = $1 AND status = 'active'", [req.params.id]);
      await client.query(
        `INSERT INTO pending_fulfillment_history (checkout_id, seller_id, actor_id, action, version, terms)
         VALUES ($1,$2,$3,'buyer_countered',$4,$5)`, [req.params.id, agreement.seller_id, req.user.id, version, JSON.stringify(normalized.term)]
      );
    }
    const remaining = await client.query("SELECT COUNT(*)::int AS count FROM pending_fulfillment_agreements WHERE checkout_id = $1 AND status <> 'accepted'", [req.params.id]);
    if (remaining.rows[0].count === 0) {
      await client.query("UPDATE pending_checkouts SET expires_at = CURRENT_TIMESTAMP + INTERVAL '15 minutes' WHERE id = $1", [req.params.id]);
      await client.query("UPDATE stock_reservations SET expires_at = CURRENT_TIMESTAMP + INTERVAL '15 minutes' WHERE checkout_id = $1 AND status = 'active'", [req.params.id]);
    }
    await client.query('COMMIT');
    if (decision === 'counter') createNotification(agreement.seller_id, 'fulfillment_proposed', 'Buyer suggested a meetup change', 'Review the buyer’s updated meetup location and time.', { pendingId: req.params.id, sellerId: agreement.seller_id });
    res.json({ status: decision === 'accept' ? 'accepted' : 'proposed', allAgreed: remaining.rows[0].count === 0 });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('Buyer fulfillment decision error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
});

router.put('/checkout/pending/:id/agreements/:sellerId', authRequired, async (req, res) => {
  const { decision } = req.body || {};
  if (!['accept', 'reject'].includes(decision)) return res.status(400).json({ error: 'decision must be accept or reject' });
  if (req.params.sellerId !== req.user.id) return res.status(403).json({ error: 'You can only decide your own fulfillment proposal' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const checkout = await client.query(
      'SELECT user_id, payment_method, status, expires_at FROM pending_checkouts WHERE id = $1 FOR UPDATE', [req.params.id]
    );
    if (!checkout.rows[0] || checkout.rows[0].status !== 'pending' || !checkout.rows[0].expires_at || new Date(checkout.rows[0].expires_at).getTime() <= Date.now()) {
      await client.query('ROLLBACK'); return res.status(404).json({ error: 'Fulfillment proposal not found or expired' });
    }
    const proposal = await client.query(
      'SELECT * FROM pending_fulfillment_agreements WHERE checkout_id = $1 AND seller_id = $2 FOR UPDATE', [req.params.id, req.user.id]
    );
    const agreement = proposal.rows[0];
    if (!agreement) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Fulfillment proposal not found' }); }
    agreement.payment_method = checkout.rows[0].payment_method;
    if (agreement.status !== 'proposed') { await client.query('ROLLBACK'); return res.status(409).json({ error: 'This proposal is no longer available' }); }
    if (agreement.last_proposed_by === req.user.id) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'This is your counterproposal; wait for the buyer to respond' }); }
    if (decision === 'accept' && agreement.payment_method === 'natcash') {
      const access = await getNatCashAccess(req.user.id, client);
      if (!access.entitled || !access.paymentMethodEnabled) { await client.query('ROLLBACK'); return res.status(403).json({ error: 'NatCash access is no longer active or is turned off for new orders', code: 'NATCASH_ACCESS_REQUIRED' }); }
    }
    const status = decision === 'accept' ? 'accepted' : 'rejected';
    await client.query(
      `UPDATE pending_fulfillment_agreements SET status = $1, seller_accepted_at = CASE WHEN $1 = 'accepted' THEN CURRENT_TIMESTAMP ELSE NULL END
       WHERE id = $2`, [status, agreement.id]
    );
    const paymentReady = decision === 'accept';
    let natCashOrderId = null;
    if (paymentReady) {
      // Lock only this seller's accepted terms. Other sellers remain entirely
      // independent: a delayed or rejected response cannot block this one.
      await client.query("UPDATE pending_fulfillment_agreements SET terms_locked_at = CURRENT_TIMESTAMP WHERE id = $1", [agreement.id]);
      const existingOrder = await client.query('SELECT order_id FROM fulfillment_payment_sessions WHERE checkout_id = $1 AND order_id IS NOT NULL LIMIT 1', [req.params.id]);
      if (existingOrder.rows[0]?.order_id) {
        const locked = await client.query('SELECT * FROM pending_fulfillment_agreements WHERE id = $1', [agreement.id]);
        const term = locked.rows[0].terms;
        await client.query(
          `INSERT INTO seller_fulfillments (order_id, seller_id, payment_status, fulfillment_status, payment_method, fulfillment_method, delivery_fee, fulfillment_lat, fulfillment_lng, fulfillment_address, fulfillment_note, agreement_status, buyer_accepted_at, seller_accepted_at, terms_locked_at, meetup_at)
           VALUES ($1,$2,'pending','pending',$3,$4,$5,$6,$7,$8,$9,'locked',$10,$11,CURRENT_TIMESTAMP,$12) ON CONFLICT (order_id,seller_id) DO NOTHING`,
          [existingOrder.rows[0].order_id, req.user.id, agreement.payment_method || 'moncash', term.method, Number(term.deliveryFee || 0), term.location?.lat || null, term.location?.lng || null, term.location?.address || null, term.location?.note || null, locked.rows[0].buyer_accepted_at, locked.rows[0].seller_accepted_at, term.meetupAt || null]
        );
        const remaining = await client.query(
          `SELECT COUNT(*)::int AS count FROM pending_fulfillment_agreements a
           LEFT JOIN seller_fulfillments sf ON sf.order_id = $2 AND sf.seller_id = a.seller_id
           WHERE a.checkout_id = $1 AND (a.status = 'proposed' OR (a.status = 'accepted' AND COALESCE(sf.payment_status, 'pending') <> 'verified'))`,
          [req.params.id, existingOrder.rows[0].order_id]
        );
        await client.query("UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2", [remaining.rows[0].count === 0 ? 'paid' : 'partially_paid', existingOrder.rows[0].order_id]);
      }
      if (agreement.payment_method === 'natcash') {
        const remainingProposals = await client.query(
          "SELECT COUNT(*)::int AS count FROM pending_fulfillment_agreements WHERE checkout_id = $1 AND status <> 'accepted'", [req.params.id]
        );
        if (remainingProposals.rows[0].count === 0) natCashOrderId = await createNatCashHandoffOrder(client, req.params.id);
      }
    }
    const openAgreements = await client.query(
      "SELECT COUNT(*)::int AS count FROM pending_fulfillment_agreements WHERE checkout_id = $1 AND status <> 'accepted'",
      [req.params.id]
    );
    if (openAgreements.rows[0].count === 0) {
      await client.query("UPDATE pending_checkouts SET expires_at = CURRENT_TIMESTAMP + INTERVAL '15 minutes' WHERE id = $1", [req.params.id]);
      await client.query("UPDATE stock_reservations SET expires_at = CURRENT_TIMESTAMP + INTERVAL '15 minutes' WHERE checkout_id = $1 AND status = 'active'", [req.params.id]);
    }
    await client.query('COMMIT');
    createNotification(checkout.rows[0].user_id, decision === 'accept' ? 'fulfillment_accepted' : 'fulfillment_rejected', decision === 'accept' ? 'Fulfillment accepted' : 'Fulfillment declined', natCashOrderId ? 'Every seller accepted. Your NatCash order is ready for its in-person meetup; payment is due when you meet.' : paymentReady ? 'This seller’s payment is ready.' : 'A seller responded to your fulfillment proposal.', { pendingId: req.params.id, sellerId: req.user.id, ...(natCashOrderId ? { orderId: natCashOrderId } : {}) });
    res.json({ status, paymentReady, ...(natCashOrderId ? { orderId: natCashOrderId } : {}) });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('Fulfillment proposal decision error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
});

router.post('/checkout/pending/:id/begin-payment', authRequired, async (req, res) => {
  let pc; let provider; let session;
  try {
    const { sellerId } = req.body || {};
    if (!sellerId) return res.status(400).json({ error: 'sellerId is required' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const checkout = await client.query("SELECT * FROM pending_checkouts WHERE id = $1 AND user_id = $2 AND status = 'pending' FOR UPDATE", [req.params.id, req.user.id]);
      pc = checkout.rows[0];
      if (!pc) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Pending checkout not found or expired' }); }
      if (!pc.expires_at || new Date(pc.expires_at).getTime() <= Date.now()) { await client.query('ROLLBACK'); return res.status(410).json({ error: 'The checkout window has expired. Start checkout again to reserve these items.' }); }
      const agreementReadiness = await client.query(
        "SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'accepted' AND terms_locked_at IS NOT NULL)::int AS locked FROM pending_fulfillment_agreements WHERE checkout_id = $1",
        [pc.id]
      );
      if (!agreementReadiness.rows[0]?.total || agreementReadiness.rows[0].total !== agreementReadiness.rows[0].locked) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'All sellers must agree to the shared fulfillment plan before payment can start', code: 'FULFILLMENT_NOT_LOCKED' });
      }
      if (pc.payment_method === 'natcash') {
        const access = await getNatCashAccess(sellerId);
        if (!access.entitled || !access.paymentMethodEnabled) {
          await client.query('ROLLBACK');
          return res.status(403).json({ error: 'This seller has NatCash access disabled or inactive', code: 'NATCASH_ACCESS_REQUIRED', sellerId });
        }
      }
      const agreementResult = await client.query(
        `SELECT terms FROM pending_fulfillment_agreements
         WHERE checkout_id = $1 AND seller_id = $2 AND status = 'accepted' AND terms_locked_at IS NOT NULL`, [pc.id, sellerId]
      );
      const agreement = agreementResult.rows[0];
      if (!agreement) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'This seller’s fulfillment terms are not locked yet' }); }
      provider = pc.payment_method === 'natcash' ? 'natcash' : 'moncash';
      const promoResult = provider === 'moncash' && pc.promo_code
        ? await client.query('SELECT seller_id, min_order_amount, discount_type, discount_value FROM promo_codes WHERE UPPER(code) = UPPER($1)', [pc.promo_code])
        : { rows: [] };
      const totals = calculatePendingCheckoutTotals(pc.cart_data, pc.fulfillment_terms, promoResult.rows[0] || null);
      if (Math.round(totals.totalAmount * 100) !== Math.round(Number(pc.total_amount || 0) * 100)) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Checkout total changed. Review the updated checkout before paying.', code: 'CHECKOUT_TOTAL_CHANGED', totalAmount: totals.totalAmount });
      }
      const sellerAmount = totals.sellers.find(item => item.sellerId === String(sellerId))?.total;
      if (!Number.isFinite(sellerAmount)) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Seller portion not found in this checkout' }); }
      const existing = await client.query("SELECT * FROM fulfillment_payment_sessions WHERE checkout_id = $1 AND seller_id = $2 AND provider = $3 AND status IN ('pending','processing') FOR UPDATE", [pc.id, sellerId, provider]);
      session = existing.rows[0];
      if (!session) {
        const reference = `fps_${crypto.randomUUID().replaceAll('-', '')}`;
        const created = await client.query(
          `INSERT INTO fulfillment_payment_sessions (checkout_id, seller_id, provider, provider_reference, amount)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`, [pc.id, sellerId, provider, reference, sellerAmount]
        );
        session = created.rows[0];
      }
      await client.query('COMMIT');
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch {}
      throw err;
    } finally { client.release(); }
    if (provider === 'natcash') return res.json({ pendingId: pc.id, sellerId, paymentMethod: 'natcash', session });
    const moncashRes = await fetch(process.env.MONCASH_PAY_CREATE_URL || 'https://api.moncashconnect.com/v1/pay-create', {
      method: 'POST', headers: { 'Authorization': `Bearer ${process.env.MCC_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: Math.round(Number(session.amount)), referenceId: session.provider_reference, returnUrl: `${process.env.PRODUCTION_URL || 'https://maurmaket.onrender.com'}/payment/return?session=${session.id}` }), signal: AbortSignal.timeout(15000),
    });
    if (!moncashRes.ok) throw new Error('Payment provider error');
    const data = await moncashRes.json();
    if (!data.paymentUrl) throw new Error('Payment provider error');
    res.json({ pendingId: pc.id, sellerId, paymentUrl: data.paymentUrl, paymentMethod: 'moncash', session });
  } catch (err) {
    console.error('Begin payment error:', err);
    res.status(502).json({ error: err.message || 'Payment provider error' });
  }
});

router.get('/checkout/pending/:id/status', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, order_id, status, created_at, expires_at FROM pending_checkouts WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const pc = result.rows[0];
    const agreements = await pool.query(
      `SELECT seller_id, status, buyer_accepted_at, seller_accepted_at, terms_locked_at
       FROM pending_fulfillment_agreements WHERE checkout_id = $1 ORDER BY created_at`, [pc.id]
    );
    const isExpired = pc.expires_at && new Date(pc.expires_at).getTime() <= Date.now();
    if ((pc.status === 'pending' || pc.status === 'agreement_locked') && isExpired) {
      const relClient = await pool.connect();
      try {
        await relClient.query('BEGIN');
        const expired = await relClient.query(
          "UPDATE pending_checkouts SET status = 'expired' WHERE id = $1 AND status IN ('pending','agreement_locked') AND expires_at <= CURRENT_TIMESTAMP RETURNING id",
          [req.params.id]
        );
        if (!expired.rowCount) {
          const latest = await relClient.query('SELECT status, expires_at FROM pending_checkouts WHERE id = $1', [req.params.id]);
          const latestAgreements = await relClient.query(
            `SELECT seller_id, status, buyer_accepted_at, seller_accepted_at, terms_locked_at
             FROM pending_fulfillment_agreements WHERE checkout_id = $1 ORDER BY created_at`, [req.params.id]
          );
          await relClient.query('COMMIT');
          return res.json({ status: latest.rows[0]?.status || pc.status, agreements: latestAgreements.rows, expiresAt: latest.rows[0]?.expires_at || pc.expires_at });
        }
        // Idempotent release: mark released first, then increment stock
        const released = await relClient.query(
          "UPDATE stock_reservations SET status = 'released', released_at = CURRENT_TIMESTAMP WHERE checkout_id = $1 AND status = 'active' RETURNING product_id, quantity, variant_id",
          [req.params.id]
        );
        for (const r of released.rows) {
          await relClient.query('UPDATE products SET stock = stock + $1 WHERE id = $2', [r.quantity, r.product_id]);
          if (r.variant_id) await relClient.query('UPDATE product_variants SET stock = stock + $1 WHERE id = $2', [r.quantity, r.variant_id]);
        }
        await relClient.query("UPDATE message_offers SET accepted_checkout_id = NULL WHERE accepted_checkout_id = $1 AND status = 'accepted'", [req.params.id]);
        await relClient.query('COMMIT');
      } catch (e) {
        await relClient.query('ROLLBACK');
      } finally {
        relClient.release();
      }
      return res.json({ status: 'expired', agreements: agreements.rows, expiresAt: pc.expires_at });
    }
    if (pc.status === 'completed') {
      if (pc.order_id) return res.json({ status: 'completed', orderId: pc.order_id, agreements: agreements.rows });
      const orderRes = await pool.query(
        'SELECT id FROM orders WHERE buyer_id = $1 AND created_at >= $2 ORDER BY created_at DESC LIMIT 1',
        [req.user.id, pc.created_at]
      );
      return res.json({ status: 'completed', orderId: orderRes.rows[0]?.id, agreements: agreements.rows });
    }
    res.json({ status: pc.status, agreements: agreements.rows, expiresAt: pc.expires_at });
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
  return res.status(410).json({ error: 'NatCash is completed with the seller at the in-person handoff. Checkout SMS verification is no longer supported.', code: 'NATCASH_HANDOFF_REQUIRED' });
  try {
    const result = await pool.query(
      "SELECT * FROM pending_checkouts WHERE id = $1 AND user_id = $2 AND status = 'agreement_locked'",
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
            discountAmount = promo.discount_type === 'percentage' ? Math.min(totalAmount * (promo.discount_value / 100), promo.discount_value * 10) : Math.min(promo.discount_value, totalAmount);
            totalAmount = Math.max(0, totalAmount - discountAmount);
          }
        } catch { /* ignore */ }
      }

      const orderRes = await client.query(
        `INSERT INTO orders (buyer_id, total_amount, status, payment_method, delivery_method, delivery_name, delivery_phone, delivery_address, delivery_city, delivery_note, meetup_lat, meetup_lng, meetup_address, meetup_name, meetup_scheduled_at)
         VALUES ($1, $2, 'paid', 'natcash', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
        [pc.user_id, totalAmount, pc.delivery_method, pc.delivery_name, pc.delivery_phone, pc.delivery_address, pc.delivery_city, pc.delivery_note, pc.meetup_lat, pc.meetup_lng, pc.meetup_address, pc.meetup_name, pc.meetup_at]
      );
      const orderId = orderRes.rows[0].id;

      // Create order_items with LOCKED prices from cart_data
      const sellerIds = new Set();
      for (const item of cartData) {
        const prodRes = await client.query('SELECT seller_id, name FROM products WHERE id = $1', [item.productId || item.id]);
        if (prodRes.rows.length > 0) {
          const sellerId = prodRes.rows[0].seller_id;
          sellerIds.add(sellerId);
          const lockedPrice = item.price || 0;
          await client.query(
            `INSERT INTO order_items (order_id, product_id, seller_id, quantity, price, variant_id, variant_label, product_name, product_image)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [orderId, item.productId || item.id, sellerId, item.quantity || 1, lockedPrice,
             item.variantId || null, item.variantLabel || null,
             item.product_name || prodRes.rows[0].name, item.product_image || null]
          );
          // Stock was already decremented at checkout creation — confirm the reservation
          await client.query(
            "UPDATE stock_reservations SET status = 'confirmed' WHERE checkout_id = $1 AND product_id = $2 AND status = 'active'",
            [pc.id, item.productId || item.id]
          );
        }
      }
      await populateSellerOrderSnapshot(client, orderId);

      // Create seller_fulfillments for each seller
      for (const sellerId of sellerIds) {
        const term = (pc.fulfillment_terms || []).find(item => item.sellerId === sellerId);
        await client.query(
          `INSERT INTO seller_fulfillments (order_id, seller_id, payment_status, fulfillment_status, payment_method, payment_reference, idempotency_key, fulfillment_method, delivery_fee, fulfillment_lat, fulfillment_lng, fulfillment_address, fulfillment_note, agreement_status, buyer_accepted_at, meetup_at)
           VALUES ($1, $2, 'verified', 'pending', 'natcash', $3, $4, $5, $6, $7, $8, $9, $10, 'proposed', CURRENT_TIMESTAMP, $11)
           ON CONFLICT (order_id, seller_id) DO NOTHING`,
          [orderId, sellerId, smsData?.transcode || null, idempotencyKey, term?.method || pc.delivery_method, Number(term?.deliveryFee || 0), term?.location?.lat || null, term?.location?.lng || null, term?.location?.address || null, term?.location?.note || null, term?.meetupAt || null]
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
    const { sellerId } = req.body || {};
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
      // A buyer claim is a statement only. Pasted SMS and transcodes are not
      // provider verification and must never move this row to `verified`.
      const claimNote = 'Buyer reported sending NatCash directly to seller; awaiting seller confirmation.';

      await client.query(
        `UPDATE seller_fulfillments
         SET payment_status = 'buyer_claimed',
             payment_reference = NULL,
             claimed_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE order_id = $1 AND seller_id = $2 AND payment_status = 'pending'`,
        [req.params.id, sellerId]
      );
      await client.query(
        `UPDATE stock_reservations SET expires_at = CURRENT_TIMESTAMP + INTERVAL '24 hours'
         WHERE order_id = $1 AND seller_id = $2 AND status = 'active'`, [req.params.id, sellerId]
      );

      await client.query(
        "INSERT INTO order_events (order_id, event_type, actor_id, note) VALUES ($1, 'payment_received', $2, $3)",
        [req.params.id, req.user.id, claimNote]
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

router.post('/orders/:id/confirm-natcash-received', authRequired, async (req, res) => {
  const client = await pool.connect();
  try {
    const order = await canAccessOrder(req.user.id, req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const sellerId = req.user.id;
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT * FROM seller_fulfillments WHERE order_id = $1 AND seller_id = $2 FOR UPDATE`, [req.params.id, sellerId]
    );
    const fulfillment = result.rows[0];
    if (!fulfillment || fulfillment.payment_method !== 'natcash') {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'NatCash seller fulfillment not found' });
    }
    if (fulfillment.payment_status === 'verified') {
      await client.query('ROLLBACK');
      return res.json({ success: true, alreadyConfirmed: true });
    }
    if (fulfillment.payment_status !== 'buyer_claimed') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'There is no buyer payment claim to confirm yet' });
    }
    const elapsedReservation = await client.query(
      `SELECT 1 FROM stock_reservations WHERE order_id = $1 AND seller_id = $2
       AND status = 'active' AND expires_at < CURRENT_TIMESTAMP LIMIT 1`, [req.params.id, sellerId]
    );
    if (elapsedReservation.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'The 24-hour handoff window has expired. Resolve the transfer directly with the buyer before arranging another exchange.' });
    }
    await client.query(
      `UPDATE seller_fulfillments SET payment_status = 'verified', fulfillment_status = 'processing',
       payment_reference = NULL, updated_at = CURRENT_TIMESTAMP WHERE order_id = $1 AND seller_id = $2`,
      [req.params.id, sellerId]
    );
    await client.query(
      `UPDATE stock_reservations SET status = 'confirmed' WHERE order_id = $1 AND seller_id = $2 AND status = 'active'`,
      [req.params.id, sellerId]
    );
    const checkoutForOrder = await client.query(
      'SELECT id, user_id, cart_data FROM pending_checkouts WHERE order_id = $1 FOR UPDATE', [req.params.id]
    );
    for (const item of checkoutForOrder.rows[0]?.cart_data || []) {
      if (!item.acceptedOfferMessageId || item.seller_id !== sellerId) continue;
      await client.query(
        `UPDATE message_offers SET status = 'redeemed', accepted_checkout_id = NULL
         WHERE message_id = $1 AND buyer_id = $2 AND seller_id = $3
           AND status = 'accepted' AND accepted_checkout_id = $4`,
        [item.acceptedOfferMessageId, checkoutForOrder.rows[0].user_id, sellerId, checkoutForOrder.rows[0].id]
      );
    }
    await client.query(
      `INSERT INTO order_events (order_id, event_type, actor_id, note)
       VALUES ($1, 'payment_received', $2, 'Seller confirmed receiving the direct NatCash transfer in person.')`,
      [req.params.id, sellerId]
    );
    await client.query('COMMIT');
    createNotification(order.buyer_id, 'payment_confirmed', 'Seller confirmed receipt', 'The seller confirmed receiving your NatCash transfer. Complete the handoff together.', { orderId: req.params.id });
    res.json({ success: true, paymentStatus: 'verified' });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('NatCash seller receipt confirmation error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
});

router.post('/orders/:id/report-natcash-not-received', authRequired, async (req, res) => {
  const client = await pool.connect();
  try {
    const order = await canAccessOrder(req.user.id, req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT * FROM seller_fulfillments WHERE order_id = $1 AND seller_id = $2 FOR UPDATE`, [req.params.id, req.user.id]
    );
    const fulfillment = result.rows[0];
    if (!fulfillment || fulfillment.payment_method !== 'natcash') {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'NatCash seller fulfillment not found' });
    }
    if (fulfillment.payment_status !== 'buyer_claimed') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'There is no unverified NatCash claim to report' });
    }
    const claimedAtMs = fulfillment.claimed_at ? new Date(fulfillment.claimed_at).getTime() : Date.now();
    const waitingMs = Date.now() - claimedAtMs;
    if (waitingMs < 15 * 60 * 1000) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Wait 15 minutes from the buyer’s claim before reporting that the transfer has not arrived', availableAt: new Date(claimedAtMs + 15 * 60 * 1000).toISOString() });
    }
    await client.query(
      `UPDATE seller_fulfillments SET payment_status = 'disputed', updated_at = CURRENT_TIMESTAMP
       WHERE order_id = $1 AND seller_id = $2`, [req.params.id, req.user.id]
    );
    await client.query(
      `INSERT INTO order_events (order_id, event_type, actor_id, note)
       VALUES ($1, 'payment_received', $2, 'Seller reported that the NatCash transfer has not arrived; handoff is paused for both parties to resolve.')`,
      [req.params.id, req.user.id]
    );
    await client.query('COMMIT');
    createNotification(order.buyer_id, 'payment_disputed', 'Transfer not received yet', 'The seller has not received the NatCash transfer yet. Do not hand over the item or send another transfer; contact the seller to resolve it.', { orderId: req.params.id });
    res.json({ success: true, paymentStatus: 'disputed' });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('NatCash not-received report error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// NatCash PASTE-VERIFICATION SESSIONS (no SMS permissions)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /natcash/sessions — Create payment sessions for each seller in a NatCash checkout
 * Body: { pendingId, sellers: [{ sellerId, phone, total }] }
 * Returns: { sessions: [{ id, sellerId, amount, recipientPhone, expiresAt }] }
 */
router.post('/natcash/sessions', authRequired, async (req, res) => {
  return res.status(410).json({ error: 'Checkout-time SMS verification is retired. NatCash transfers are reported at the in-person handoff.', code: 'NATCASH_HANDOFF_REQUIRED' });
  try {
    const { pendingId, sellers } = req.body || {};
    if (!pendingId || !sellers?.length) {
      return res.status(400).json({ error: 'pendingId and sellers required' });
    }

    // Verify checkout exists and belongs to this user
    const pcRes = await pool.query(
      "SELECT id, user_id, status FROM pending_checkouts WHERE id = $1 AND user_id = $2",
      [pendingId, req.user.id]
    );
    if (pcRes.rows.length === 0 || pcRes.rows[0].status !== 'pending') {
      return res.status(404).json({ error: 'Pending checkout not found or expired' });
    }

    // Idempotent: return existing sessions if any
    const existing = await pool.query(
      'SELECT id, seller_id, amount, recipient_phone, status, expires_at FROM natcash_payment_sessions WHERE checkout_id = $1 ORDER BY created_at',
      [pendingId]
    );
    if (existing.rows.length > 0) {
      return res.json({ sessions: existing.rows });
    }

    // Create one session per seller
    const sessions = [];
    for (const s of sellers) {
      const sessRes = await pool.query(
        `INSERT INTO natcash_payment_sessions (checkout_id, seller_id, amount, recipient_phone, expires_at)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP + INTERVAL '15 minutes')
         ON CONFLICT (checkout_id, seller_id) DO NOTHING
         RETURNING id, seller_id, amount, recipient_phone, status, expires_at`,
        [pendingId, s.sellerId, s.total, s.phone]
      );
      if (sessRes.rows.length > 0) {
        sessions.push(sessRes.rows[0]);
      }
    }

    // If all were ON CONFLICT DO NOTHING, fetch them
    if (sessions.length === 0) {
      const fetched = await pool.query(
        'SELECT id, seller_id, amount, recipient_phone, status, expires_at FROM natcash_payment_sessions WHERE checkout_id = $1 ORDER BY created_at',
        [pendingId]
      );
      return res.json({ sessions: fetched.rows });
    }

    res.json({ sessions });
  } catch (err) {
    console.error('Create NatCash sessions error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /natcash/sessions/:sessionId/verify — Verify pasted SMS against a session
 * Body: { smsText }
 * Validates: amount, recipient phone, transcode uniqueness, timestamp ±5min
 * Returns: { verified: true, status: 'verified' } or error
 */
router.post('/natcash/sessions/:sessionId/verify', authRequired, async (req, res) => {
  return res.status(410).json({ error: 'Pasted SMS cannot verify a NatCash transfer. Use the in-person order handoff flow.', code: 'NATCASH_HANDOFF_REQUIRED' });
  try {
    const { smsText } = req.body || {};
    if (!smsText?.trim()) {
      return res.status(400).json({ error: 'Paste the NatCash confirmation SMS' });
    }

    // Fetch session
    const sessRes = await pool.query(
      'SELECT * FROM natcash_payment_sessions WHERE id = $1',
      [req.params.sessionId]
    );
    if (sessRes.rows.length === 0) {
      return res.status(404).json({ error: 'Payment session not found' });
    }
    const session = sessRes.rows[0];

    // Verify ownership via checkout
    const pcRes = await pool.query(
      'SELECT user_id, status FROM pending_checkouts WHERE id = $1',
      [session.checkout_id]
    );
    if (pcRes.rows.length === 0 || pcRes.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    if (pcRes.rows[0].status !== 'pending') {
      return res.status(400).json({ error: 'Checkout is no longer pending' });
    }

    // Check expiry (also catches cron lag — session expired but cron hasn't marked it yet)
    if (session.status === 'expired' || new Date(session.expires_at) < new Date()) {
      // Best-effort: mark as expired if still pending (cron may be delayed)
      if (session.status === 'pending') {
        pool.query("UPDATE natcash_payment_sessions SET status = 'expired' WHERE id = $1 AND status = 'pending'", [req.params.sessionId]).catch(() => {});
      }
      return res.status(400).json({ error: 'Session expired. Go back and retry payment.' });
    }
    if (session.status === 'verified') {
      return res.json({ verified: true, status: 'already_verified' });
    }

    // Parse SMS using canonical NatCash parser
    const parsed = parseNatCashSms(smsText);
    if (!parsed) {
      return res.status(400).json({
        error: 'Could not parse NatCash SMS. Make sure you paste the full confirmation message.',
        hint: 'Expected format: "Ou transfere {amount} HTG a {name} {phone} nan ... Transcode: {code}."'
      });
    }

    const smsAmount = parsed.amount;
    const recipientPhone = parsed.recipientNumber;
    const transcode = parsed.transcode;

    // Validate amount (within 1 HTG tolerance for rounding)
    const expectedAmount = parseFloat(session.amount);
    if (Math.abs(smsAmount - expectedAmount) > 1) {
      return res.status(400).json({
        error: `Amount mismatch: SMS shows G ${smsAmount}, expected G ${expectedAmount}.`,
      });
    }

    // Validate recipient phone (last 8 digits of session recipient_phone)
    const sessionPhone = session.recipient_phone.replace(/\D/g, '');
    const last8Session = sessionPhone.slice(-8);
    const last8Sms = recipientPhone.slice(-8);
    if (last8Session !== last8Sms) {
      // Get seller name for error message
      const sellerRes = await pool.query('SELECT full_name FROM users WHERE id = $1', [session.seller_id]);
      const sellerName = sellerRes.rows[0]?.full_name || 'the seller';
      return res.status(400).json({
        error: `This SMS is for a different recipient (${recipientPhone}). Send to ${sellerName} (${session.recipient_phone}).`,
      });
    }

    // Validate transcode uniqueness (provider-scoped: natcash only)
    const existingTranscode = await pool.query(
      `SELECT id FROM seller_fulfillments
       WHERE payment_reference = $1 AND payment_method = 'natcash'`,
      [transcode]
    );
    if (existingTranscode.rows.length > 0) {
      return res.status(400).json({
        error: 'This transcode has already been used. Each confirmation can only be used once.',
      });
    }

    // Also check natcash_payment_sessions for duplicate transcode
    const sessTranscode = await pool.query(
      "SELECT id FROM natcash_payment_sessions WHERE sms_transcode = $1 AND id != $2",
      [transcode, req.params.sessionId]
    );
    if (sessTranscode.rows.length > 0) {
      return res.status(400).json({
        error: 'This transcode has already been used for another payment.',
      });
    }

    // All checks passed — mark verified AND bridge into fulfillment_payment_sessions
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Mark legacy natcash_payment_sessions as verified
      await client.query(
        `UPDATE natcash_payment_sessions
         SET status = 'verified', sms_transcode = $2, verified_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'pending'`,
        [req.params.sessionId, transcode]
      );

      // 2. Bridge into fulfillment_payment_sessions (creates order + escrow if first seller)
      const orderId = await activateNatCashSellerPayment(client, session, transcode);

      await client.query('COMMIT');
      console.log(`NatCash session ${req.params.sessionId} verified (transcode: ${transcode}, order: ${orderId})`);
      res.json({ verified: true, status: 'verified', transcode, orderId });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Verify NatCash session error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /natcash/sessions?pendingId=... — Get all session statuses for a checkout
 * Returns: { sessions: [...], allVerified: bool }
 */
router.get('/natcash/sessions', authRequired, async (req, res) => {
  try {
    const { pendingId } = req.query;
    if (!pendingId) return res.status(400).json({ error: 'pendingId required' });

    const pcRes = await pool.query(
      'SELECT user_id FROM pending_checkouts WHERE id = $1',
      [pendingId]
    );
    if (pcRes.rows.length === 0 || pcRes.rows[0].user_id !== req.user.id) {
      return res.status(404).json({ error: 'Checkout not found' });
    }

    const sessRes = await pool.query(
      `SELECT n.id, n.seller_id, n.amount, n.recipient_phone, n.status, n.sms_transcode, n.verified_at, n.expires_at,
              u.full_name AS seller_name
       FROM natcash_payment_sessions n
       JOIN users u ON u.id = n.seller_id
       WHERE n.checkout_id = $1 ORDER BY n.created_at`,
      [pendingId]
    );

    const sessions = sessRes.rows;
    const allVerified = sessions.length > 0 && sessions.every(s => s.status === 'verified');

    res.json({ sessions, allVerified });
  } catch (err) {
    console.error('Get NatCash sessions error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /natcash/sessions/confirm-all — Create order after all sessions verified
 * Body: { pendingId }
 * Creates order + order_items + seller_fulfillments in a single transaction.
 */
router.post('/natcash/sessions/confirm-all', authRequired, async (req, res) => {
  return res.status(410).json({ error: 'Checkout-time NatCash verification is retired. Use the in-person order handoff flow.', code: 'NATCASH_HANDOFF_REQUIRED' });
  try {
    const { pendingId } = req.body || {};
    if (!pendingId) return res.status(400).json({ error: 'pendingId required' });

    // Fetch checkout
    const pcRes = await pool.query(
      "SELECT * FROM pending_checkouts WHERE id = $1 AND user_id = $2 AND status = 'pending'",
      [pendingId, req.user.id]
    );
    if (pcRes.rows.length === 0) {
      return res.status(404).json({ error: 'Pending checkout not found or expired' });
    }
    const pc = pcRes.rows[0];

    // Check all sellers have completed fulfillment_payment_sessions
    // (order was already created during the first seller's verify via activateNatCashSellerPayment)
    const fpsRes = await pool.query(
      `SELECT fps.id, fps.seller_id, fps.status, fps.order_id
       FROM fulfillment_payment_sessions fps
       WHERE fps.checkout_id = $1 AND fps.provider = 'natcash'`,
      [pendingId]
    );

    if (fpsRes.rows.length === 0) {
      return res.status(400).json({ error: 'No NatCash payment sessions found.' });
    }

    const allCompleted = fpsRes.rows.every(r => r.status === 'completed');
    if (!allCompleted) {
      return res.status(400).json({ error: 'Not all seller payments have been verified yet.' });
    }

    // Get order ID from any completed session
    const orderId = fpsRes.rows[0].order_id;
    if (!orderId) {
      return res.status(500).json({ error: 'Order not yet created. Please retry.' });
    }

    // Check for stale sessions (verified but expired between verify and confirm-all)
    const staleRes = await pool.query(
      `SELECT fps.id FROM fulfillment_payment_sessions fps
       JOIN natcash_payment_sessions nps ON nps.checkout_id = fps.checkout_id AND nps.seller_id = fps.seller_id
       WHERE fps.checkout_id = $1 AND fps.provider = 'natcash' AND fps.status != 'completed' AND nps.expires_at < CURRENT_TIMESTAMP`,
      [pendingId]
    );
    if (staleRes.rows.length > 0) {
      return res.status(400).json({
        error: 'One or more seller payment windows have expired since verification. Please re-verify all sellers.',
      });
    }

    // Mark checkout completed
    await pool.query("UPDATE pending_checkouts SET status = 'completed' WHERE id = $1", [pc.id]);

    console.log(`NatCash confirm-all: checkout ${pendingId} confirmed, order ${orderId} (${fpsRes.rows.length} sellers)`);
    res.json({ orderId });
  } catch (err) {
    console.error('NatCash confirm-all error:', err);
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
  if (!req.user?.email_verified) {
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
      const prod = await client.query('SELECT id, price, sale_price, sale_starts_at, sale_ends_at, seller_id, stock, name FROM products WHERE id = $1 AND is_available = TRUE FOR UPDATE', [item.productId]);
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
      let variant = null;
      if (item.variantId) {
        if (!/^[0-9a-f-]{36}$/i.test(item.variantId)) throw new Error('Invalid product option');
        const vr = await client.query('SELECT id, product_id, option_label, price, stock FROM product_variants WHERE id = $1 FOR UPDATE', [item.variantId]);
        variant = vr.rows[0];
        if (!variant || variant.product_id !== p.id) throw new Error('Invalid product option');
        if (variant.stock < (item.quantity || 1)) throw new Error(`Insufficient stock for "${p.name}" (${variant.option_label})`);
      }
      let price;
      const offerCheck = await client.query(
        `SELECT mo.id, mo.offered_price FROM message_offers mo
         WHERE mo.product_id = $1 AND mo.buyer_id = $2 AND mo.status = 'accepted'
         AND mo.accepted_checkout_id IS NULL
         AND mo.accepted_expires_at > CURRENT_TIMESTAMP AND mo.quantity = $3
         ORDER BY mo.responded_at DESC LIMIT 1
         FOR UPDATE`,
        [item.productId, req.user.id, item.quantity || 1]
      );
      if (offerCheck.rows.length > 0) {
        price = parseFloat(offerCheck.rows[0].offered_price);
        // Claim against the order and redeem only after payment succeeds.
        orderItems.push({ productId: item.productId, quantity: item.quantity || 1, price, sellerId: prod.rows[0].seller_id, acceptedOfferId: offerCheck.rows[0].id, variantId: variant?.id || null, variantLabel: variant?.option_label || null, productName: p.name });
      } else {
        const onSale = !variant && p.sale_price && (p.sale_starts_at === null || new Date(p.sale_starts_at) <= new Date()) && (p.sale_ends_at === null || new Date(p.sale_ends_at) >= new Date());
        price = variant ? parseFloat(variant.price) : (onSale ? parseFloat(p.sale_price) : parseFloat(p.price));
        orderItems.push({ productId: item.productId, quantity: item.quantity || 1, price, sellerId: prod.rows[0].seller_id, variantId: variant?.id || null, variantLabel: variant?.option_label || null, productName: p.name });
      }
      total += price * (item.quantity || 1);
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

    for (const item of orderItems) {
      if (!item.acceptedOfferId) continue;
      const claim = await client.query(
        `UPDATE message_offers SET accepted_checkout_id = $1
         WHERE id = $2 AND status = 'accepted' AND accepted_checkout_id IS NULL
         AND accepted_expires_at > CURRENT_TIMESTAMP RETURNING id`, [order.id, item.acceptedOfferId]
      );
      if (!claim.rowCount) throw new Error('Accepted offer is already in another checkout or has expired');
    }

    for (const oi of orderItems) {
      const imgRes = await client.query(
        'SELECT image_url FROM product_images WHERE product_id = $1 ORDER BY is_primary DESC, display_order ASC LIMIT 1',
        [oi.productId]
      );
      await client.query(
        `INSERT INTO order_items (order_id, product_id, seller_id, quantity, price, variant_id, variant_label, product_name, product_image)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [order.id, oi.productId, oi.sellerId, oi.quantity, oi.price,
         oi.variantId || null, oi.variantLabel || null, oi.productName || null,
         imgRes.rows[0]?.image_url || null]
      );
    }
    await populateSellerOrderSnapshot(client, order.id);

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
      createNotification(sid, 'new_order', 'New order', `${buyerName} bought ${orderItems[0]?.productName || 'an item'}`, notifData);
    }
    // Per-listing stock side effects (low-stock alert / out-of-stock auto-pause)
    const touchedProducts = [...new Set(orderItems.map(i => i.productId).filter(Boolean))];
    for (const pid of touchedProducts) {
      try { await applyStockSideEffects(pid); } catch (e) { console.error('Stock side effects error:', e.message); }
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

router.post('/orders/:id/cancellation-requests', authRequired, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const orderRes = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [req.params.id]);
    const order = orderRes.rows[0];
    if (!order) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Order not found' }); }
    if (order.buyer_id !== req.user.id) { await client.query('ROLLBACK'); return res.status(403).json({ error: 'Only the buyer can request cancellation' }); }
    if (order.delivery_method === 'meetup') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Meetup exchanges must be paused and resolved through the meetup flow; cancellation requests are not available after the proximity exchange begins.' });
    }

    const sellerId = String(req.body?.sellerId || '');
    const reason = String(req.body?.reason || '').trim();
    const details = String(req.body?.details || '').trim().slice(0, 300);
    const allowedReasons = new Set(['changed_mind', 'timing', 'seller_unavailable', 'item_issue', 'other']);
    if (!sellerId || !allowedReasons.has(reason)) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Choose the seller and a cancellation reason' }); }

    const fulfillmentRes = await client.query(
      `SELECT sf.fulfillment_status FROM seller_fulfillments sf
       WHERE sf.order_id = $1 AND sf.seller_id = $2
         AND EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = sf.order_id AND oi.seller_id = sf.seller_id)
       FOR UPDATE`,
      [req.params.id, sellerId]
    );
    if (!fulfillmentRes.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Seller portion not found' }); }
    // A multi-seller order is supported here (APP-Q340: cancel only the affected
    // seller sub-order unless the buyer cancels the whole checkout). Everything
    // this request can reach is already per-seller: it blocks only this seller's
    // status advancement, and if a reviewer later cancels the portion, that
    // seller's fulfillment, escrow, stock reservations and accepted-offer claims
    // are released on their own while the other portions stay active. The order
    // itself is cancelled only when no other portion remains active.
    if (!['processing', 'shipped', 'delivered'].includes(fulfillmentRes.rows[0].fulfillment_status)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'This seller has not started fulfillment. Use the order cancellation option while it is still available.' });
    }

    const existing = await client.query(
      `SELECT id FROM disputes WHERE order_id = $1 AND seller_id = $2 AND raised_by = $3
       AND reason = 'cancellation_request' AND status IN ('open','under_review') LIMIT 1`,
      [req.params.id, sellerId, req.user.id]
    );
    if (existing.rows.length) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'A cancellation request is already active for this seller portion' }); }

    const description = JSON.stringify({ reason, details });
    const inserted = await client.query(
      `INSERT INTO disputes (order_id, seller_id, raised_by, reason, description, status, response_deadline)
       VALUES ($1, $2, $3, 'cancellation_request', $4, 'open', NOW() + INTERVAL '24 hours') RETURNING id, response_deadline, created_at`,
      [req.params.id, sellerId, req.user.id, description]
    );
    await client.query(
      `INSERT INTO order_events (order_id, event_type, actor_id, note)
       VALUES ($1, 'cancellation_requested', $2, 'Buyer requested cancellation for one seller portion. Order and payment remain unchanged while the seller responds.')`,
      [req.params.id, req.user.id]
    );
    await client.query('COMMIT');
    const request = inserted.rows[0];
    createNotification(sellerId, 'cancellation_requested', 'Cancellation request', 'A buyer requested cancellation for their seller portion. Open the order to respond.', { orderId: req.params.id, cancellationRequestId: request.id, cancellationOutcome: 'requested', expiresAt: request.response_deadline });
    return res.status(202).json({ request: { ...request, seller_id: sellerId, status: 'open', description } });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('Cancellation request error:', err);
    return res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
});

router.put('/orders/:id/cancellation-requests/:requestId/respond', authRequired, async (req, res) => {
  const decision = String(req.body?.decision || '');
  if (!['accept', 'decline'].includes(decision)) return res.status(400).json({ error: 'Choose accept or decline' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT d.*, o.buyer_id FROM disputes d JOIN orders o ON o.id = d.order_id
       WHERE d.id = $1 AND d.order_id = $2 AND d.reason = 'cancellation_request' FOR UPDATE`,
      [req.params.requestId, req.params.id]
    );
    const request = result.rows[0];
    if (!request) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Cancellation request not found' }); }
    if (request.seller_id !== req.user.id) { await client.query('ROLLBACK'); return res.status(403).json({ error: 'Only the affected seller can respond' }); }
    if (request.status !== 'open') { await client.query('ROLLBACK'); return res.status(409).json({ error: 'This cancellation request is no longer awaiting a response' }); }
    if (request.response_deadline && new Date(request.response_deadline).getTime() <= Date.now()) {
      await client.query(`UPDATE disputes SET status = 'under_review', resolution = 'seller_response_overdue', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [request.id]);
      await client.query(`INSERT INTO order_events (order_id, event_type, actor_id, note) VALUES ($1, 'cancellation_response', NULL, 'Seller response window elapsed. The order and payment remain unchanged; no fault or refund was assigned.')`, [req.params.id]);
      await client.query('COMMIT');
      await client.query(`UPDATE notifications SET action_resolved = true, is_read = true WHERE user_id = $1 AND (data->>'cancellationRequestId') = $2 AND type = 'cancellation_requested'`, [request.seller_id, String(request.id)]);
      const overdueBody = 'No response arrived before the response window ended. The order and payment remain unchanged. Contact the other person while MaurMaket support is unavailable in-app.';
      createNotification(request.buyer_id, 'cancellation_response', 'Cancellation request unresolved', overdueBody, { orderId: req.params.id, cancellationRequestId: request.id, cancellationOutcome: 'overdue' });
      createNotification(request.seller_id, 'cancellation_response', 'Cancellation request unresolved', overdueBody, { orderId: req.params.id, cancellationRequestId: request.id, cancellationOutcome: 'overdue' });
      return res.status(409).json({ error: 'The response window ended. This request is now unresolved.' });
    }

    const resolution = decision === 'accept' ? 'seller_accepted_pending_settlement' : 'seller_declined';
    await client.query(
      `UPDATE disputes SET status = 'under_review', resolution = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [resolution, request.id]
    );
    await client.query(
      `INSERT INTO order_events (order_id, event_type, actor_id, note)
       VALUES ($1, 'cancellation_response', $2, $3)`,
      [req.params.id, req.user.id, decision === 'accept'
        ? 'Seller accepted the cancellation request. Order/payment settlement remains unchanged pending review.'
        : 'Seller declined the cancellation request. The order/payment state remains unchanged; the request is unresolved.']
    );
    await client.query('COMMIT');
    await client.query(`UPDATE notifications SET action_resolved = true, is_read = true WHERE user_id = $1 AND (data->>'cancellationRequestId') = $2 AND type = 'cancellation_requested'`, [request.seller_id, String(request.id)]);
    createNotification(request.buyer_id, 'cancellation_response', 'Cancellation request updated', decision === 'accept'
      ? 'The seller agreed to your request. The order and payment are not yet cancelled or refunded; settlement needs review.'
      : 'The seller declined your request. Your order and payment remain unchanged while the request stays unresolved.',
    { orderId: req.params.id, cancellationRequestId: request.id, cancellationOutcome: decision === 'accept' ? 'accepted' : 'declined' });
    return res.json({ status: 'under_review', decision, orderChanged: false, paymentChanged: false });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('Cancellation response error:', err);
    return res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
});

router.put('/orders/:id/cancellation-requests/:requestId/withdraw', authRequired, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT d.* FROM disputes d JOIN orders o ON o.id = d.order_id
       WHERE d.id = $1 AND d.order_id = $2 AND d.reason = 'cancellation_request'
         AND o.buyer_id = $3 FOR UPDATE`,
      [req.params.requestId, req.params.id, req.user.id]
    );
    const request = result.rows[0];
    if (!request) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Cancellation request not found' }); }
    if (request.status !== 'open') { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Only a request awaiting seller response can be withdrawn' }); }
    if (request.response_deadline && new Date(request.response_deadline).getTime() <= Date.now()) {
      await client.query(`UPDATE disputes SET status = 'under_review', resolution = 'seller_response_overdue', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [request.id]);
      await client.query(`INSERT INTO order_events (order_id, event_type, actor_id, note) VALUES ($1, 'cancellation_response', NULL, 'Seller response window elapsed. The order and payment remain unchanged; no fault or refund was assigned.')`, [req.params.id]);
      await client.query('COMMIT');
      const overdueBody = 'No response arrived before the response window ended. The order and payment remain unchanged. Contact the other person while MaurMaket support is unavailable in-app.';
      createNotification(request.raised_by, 'cancellation_response', 'Cancellation request unresolved', overdueBody, { orderId: req.params.id, cancellationRequestId: request.id, cancellationOutcome: 'overdue' });
      createNotification(request.seller_id, 'cancellation_response', 'Cancellation request unresolved', overdueBody, { orderId: req.params.id, cancellationRequestId: request.id, cancellationOutcome: 'overdue' });
      return res.status(409).json({ error: 'The response window ended. This request is now unresolved.' });
    }
    await client.query(`UPDATE disputes SET status = 'resolved', resolution = 'buyer_withdrew', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [request.id]);
    await client.query(
      `INSERT INTO order_events (order_id, event_type, actor_id, note)
       VALUES ($1, 'cancellation_response', $2, 'Buyer withdrew the pending cancellation request. Order and payment remain unchanged.')`,
      [req.params.id, req.user.id]
    );
    await client.query('COMMIT');
    createNotification(request.seller_id, 'cancellation_response', 'Request withdrawn', 'The buyer withdrew the cancellation request. The order remains active.', { orderId: req.params.id, cancellationRequestId: request.id, cancellationOutcome: 'withdrawn' });
    return res.json({ status: 'resolved', withdrawn: true });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('Cancellation withdrawal error:', err);
    return res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
});

router.put('/orders/:id/cancel', authRequired, async (req, res) => {
  const cancelScope = req.body?.scope === 'seller' ? 'seller' : 'order';
  const requestedSellerId = String(req.body?.sellerId || '');
  if (cancelScope === 'seller' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestedSellerId)) {
    return res.status(400).json({ error: 'Choose a seller portion to cancel' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const order = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (order.rows.length === 0) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(404).json({ error: 'Order not found' });
    }
    if (order.rows[0].buyer_id !== req.user.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Only the buyer can cancel this order' });
    }
    const currentOrder = order.rows[0];
    if (!['pending', 'paid', 'active', 'processing', 'shipped', 'delivered'].includes(currentOrder.status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'This order can no longer be cancelled from this step' });
    }

    const fulfillments = await client.query(
      `SELECT seller_id, payment_status, fulfillment_status, fulfillment_method
       FROM seller_fulfillments WHERE order_id = $1 FOR UPDATE`, [req.params.id]
    );
    const sellers = await client.query(
      'SELECT COUNT(DISTINCT seller_id)::int AS count FROM order_items WHERE order_id = $1', [req.params.id]
    );
    const hasMeetupStarted = currentOrder.delivery_method === 'meetup'
      ? await client.query('SELECT 1 FROM meetup_checkins WHERE order_id = $1 LIMIT 1', [req.params.id])
      : { rowCount: 0 };
    const stillPreFulfillment = fulfillments.rows.length === Number(sellers.rows[0]?.count || 0) && fulfillments.rows.length > 0 && fulfillments.rows.every(row =>
      row.fulfillment_status === 'pending' && row.payment_status === 'pending'
    );

    const sellerIds = fulfillments.rows.map(row => row.seller_id);
    const targetSellerIds = cancelScope === 'seller' ? [requestedSellerId] : sellerIds;
    const targetFulfillments = fulfillments.rows.filter(row => targetSellerIds.includes(row.seller_id));
    if (!targetFulfillments.length || targetFulfillments.length !== targetSellerIds.length ||
        (cancelScope === 'order' && targetSellerIds.length !== Number(sellers.rows[0]?.count || 0))) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Seller portion not found' });
    }
    let refundRequested = false;
    let affectedSellerIds = [];
    if (currentOrder.status === 'pending') {
      if (cancelScope === 'seller' && Number(sellers.rows[0]?.count || 0) > 1) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'A multi-seller unpaid checkout cannot be partially repriced safely yet. No order state changed.' });
      }
      const unresolvedPayment = await client.query(
        `SELECT id FROM moncash_payment_attempts WHERE order_id = $1
         AND status IN ('created','processing','unknown') ORDER BY created_at DESC LIMIT 1 FOR UPDATE`, [req.params.id]
      );
      if (unresolvedPayment.rows.length) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'A MonCash payment is still being processed. Check its status before cancelling so a late payment is not lost.' });
      }
      if (!stillPreFulfillment || hasMeetupStarted.rowCount > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'This order has entered payment or fulfillment. Open Order Details to use the appropriate cancellation flow.' });
      }
    } else {
      if (currentOrder.payment_method !== 'moncash' ||
          targetFulfillments.some(row => row.fulfillment_method !== 'delivery' || row.fulfillment_status !== 'pending' || row.payment_status !== 'verified') ||
          hasMeetupStarted.rowCount > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Paid cancellation is available only for verified, unstarted MonCash delivery portions. Use the order-specific flow for other payment or meetup states.' });
      }
      const escrow = await client.query(
        "SELECT seller_id FROM order_escrow WHERE order_id = $1 AND seller_id = ANY($2::uuid[]) AND status = 'held' FOR UPDATE",
        [req.params.id, targetSellerIds]
      );
      if (escrow.rows.length !== targetSellerIds.length) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Held MonCash funds could not be confirmed. The order was not changed; request a refund review instead.' });
      }
      const existingRequest = await client.query(
        "SELECT id FROM disputes WHERE order_id = $1 AND seller_id = ANY($2::uuid[]) AND status IN ('open', 'under_review') AND reason = 'refund_request' LIMIT 1",
        [req.params.id, targetSellerIds]
      );
      if (existingRequest.rows.length) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'A refund review is already open for this order' });
      }
      for (const sellerId of targetSellerIds) {
        await client.query(
          `INSERT INTO disputes (order_id, seller_id, raised_by, reason, description, status)
           VALUES ($1, $2, $3, 'refund_request', $4, 'open')`,
          [req.params.id, sellerId, req.user.id, 'Buyer cancelled this seller portion before fulfillment. MonCash refund requires separate review and provider-confirmed settlement.']
        );
      }
      refundRequested = true;
      affectedSellerIds = targetSellerIds;
    }

    const oldStatus = currentOrder.status;
    const otherActive = await client.query(
      `SELECT 1 FROM order_items oi LEFT JOIN seller_fulfillments sf
         ON sf.order_id = oi.order_id AND sf.seller_id = oi.seller_id
       WHERE oi.order_id = $1 AND NOT (oi.seller_id = ANY($2::uuid[]))
         AND COALESCE(sf.fulfillment_status, 'pending') <> 'cancelled' LIMIT 1`, [req.params.id, targetSellerIds]
    );
    const cancelWholeOrder = cancelScope === 'order' || otherActive.rowCount === 0;
    if (cancelWholeOrder) await client.query("UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [req.params.id]);
    await client.query(
      `UPDATE seller_fulfillments SET fulfillment_status = 'cancelled', agreement_status = 'cancelled', updated_at = CURRENT_TIMESTAMP
       WHERE order_id = $1 AND seller_id = ANY($2::uuid[]) AND fulfillment_status = 'pending'`, [req.params.id, targetSellerIds]
    );
    for (const sellerId of targetSellerIds) {
      await releaseCancelledOrderStock(client, req.params.id, fulfillments.rows, sellerId);
      await client.query("UPDATE message_offers SET accepted_checkout_id = NULL WHERE accepted_checkout_id = $1 AND seller_id = $2 AND status = 'accepted'", [req.params.id, sellerId]);
    }
    await client.query(
      `INSERT INTO order_events (order_id, event_type, actor_id, old_value, new_value, note)
       VALUES ($1, 'status_change', $2, $3, $4, $5)`,
      [req.params.id, req.user.id, oldStatus, cancelWholeOrder ? 'cancelled' : oldStatus, refundRequested
        ? `Buyer cancelled ${cancelScope === 'seller' ? 'one seller portion' : 'the checkout'} before fulfillment. MonCash refund review is pending; no refund has been sent or confirmed.`
        : 'Cancelled by buyer before payment or seller fulfillment began. Reserved stock was released.']
    );
    await client.query('COMMIT');
    client.release();
    const cancelledSellers = affectedSellerIds.length
      ? affectedSellerIds.map(seller_id => ({ seller_id }))
      : (await pool.query('SELECT DISTINCT seller_id FROM order_items WHERE order_id = $1', [req.params.id])).rows;
    for (const row of cancelledSellers) {
      createNotification(row.seller_id, 'order_cancelled', 'Order Cancelled',
        refundRequested ? 'The buyer cancelled before fulfillment. MonCash refund review is still pending.' : 'A buyer cancelled before payment or fulfillment began.',
        { orderId: req.params.id, refundReviewPending: refundRequested });
    }
    res.json({ cancelled: true, partial: !cancelWholeOrder, refundRequested, refundStatus: refundRequested ? 'open' : null });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    client.release();
    console.error('Order cancel error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/orders/:id/seller-cancel', authRequired, async (req, res) => {
  const reason = String(req.body?.reason || '').trim();
  const details = String(req.body?.details || '').trim().slice(0, 300);
  const allowedReasons = new Set(['out_of_stock', 'seller_unavailable', 'delivery_issue', 'other']);
  if (!allowedReasons.has(reason)) return res.status(400).json({ error: 'Choose a cancellation reason' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const orderResult = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [req.params.id]);
    const order = orderResult.rows[0];
    if (!order) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Order not found' }); }
    const belongs = await client.query('SELECT 1 FROM order_items WHERE order_id = $1 AND seller_id = $2 LIMIT 1', [req.params.id, req.user.id]);
    if (!belongs.rows.length) { await client.query('ROLLBACK'); return res.status(403).json({ error: 'Only a seller on this order can cancel it' }); }
    if (!['pending', 'paid', 'active', 'processing', 'shipped', 'delivered'].includes(order.status)) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'This order has already moved beyond the seller cancellation step' }); }

    const sellerCount = await client.query('SELECT COUNT(DISTINCT seller_id)::int AS count FROM order_items WHERE order_id = $1', [req.params.id]);
    const multiSellerOrder = Number(sellerCount.rows[0]?.count || 0) > 1;
    const fulfillments = await client.query(
      'SELECT seller_id, payment_status, fulfillment_status, fulfillment_method, payment_reference FROM seller_fulfillments WHERE order_id = $1 FOR UPDATE',
      [req.params.id]
    );
    const fulfillment = fulfillments.rows.find(row => row.seller_id === req.user.id);
    if (!fulfillment || fulfillment.fulfillment_status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Seller cancellation is available only before fulfillment begins.' });
    }
    if (fulfillment.fulfillment_method === 'meetup' || order.delivery_method === 'meetup') {
      const meetupStarted = await client.query('SELECT 1 FROM meetup_checkins WHERE order_id = $1 LIMIT 1', [req.params.id]);
      if (meetupStarted.rowCount > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'The meetup exchange has started. Resolve this through the meetup flow instead of cancelling here.' });
      }
    }

    let refundRequested = false;
    if (order.status === 'pending') {
      if (multiSellerOrder) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'A multi-seller order cannot be partially changed after checkout until the unpaid total can be safely recalculated. No order state changed.' });
      }
      if (fulfillment.payment_status !== 'pending') {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Payment has already been claimed or confirmed; use the payment-specific cancellation review.' });
      }
      const unresolvedPayment = await client.query(
        `SELECT id FROM moncash_payment_attempts WHERE order_id = $1
         AND status IN ('created','processing','unknown') ORDER BY created_at DESC LIMIT 1 FOR UPDATE`, [req.params.id]
      );
      if (unresolvedPayment.rows.length) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'A MonCash payment is still being processed. Check its status before cancelling.' });
      }
    } else {
      if (order.payment_method !== 'moncash' || fulfillment.fulfillment_method !== 'delivery' || fulfillment.payment_status !== 'verified') {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Paid seller cancellation is available only for a verified MonCash delivery portion before fulfillment.' });
      }
      const escrow = await client.query(
        "SELECT id FROM order_escrow WHERE order_id = $1 AND seller_id = $2 AND status = 'held' FOR UPDATE",
        [req.params.id, req.user.id]
      );
      if (!escrow.rows.length) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Held MonCash funds could not be confirmed. The order was not changed.' });
      }
      const existingRefund = await client.query(
        "SELECT id FROM disputes WHERE order_id = $1 AND seller_id = $2 AND status IN ('open','under_review') AND reason = 'refund_request' LIMIT 1",
        [req.params.id, req.user.id]
      );
      if (existingRefund.rows.length) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'A refund review is already open for this order.' });
      }
      const refundDescription = JSON.stringify({ type: 'seller_cancellation', reason, details, notice: 'Seller cancelled before fulfillment. MonCash refund review and provider-confirmed settlement remain separate.' });
      await client.query(
        `INSERT INTO disputes (order_id, seller_id, raised_by, reason, description, status)
         VALUES ($1, $2, $3, 'refund_request', $4, 'open')`,
        [req.params.id, req.user.id, req.user.id, refundDescription]
      );
      refundRequested = true;
    }

    const remainingPortion = await client.query(
      `SELECT 1 FROM order_items oi LEFT JOIN seller_fulfillments sf
         ON sf.order_id = oi.order_id AND sf.seller_id = oi.seller_id
       WHERE oi.order_id = $1 AND oi.seller_id <> $2
         AND COALESCE(sf.fulfillment_status, 'pending') <> 'cancelled' LIMIT 1`, [req.params.id, req.user.id]
    );
    const cancelWholeOrder = !multiSellerOrder || remainingPortion.rowCount === 0;
    if (cancelWholeOrder) await client.query("UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [req.params.id]);
    await client.query(
      `UPDATE seller_fulfillments SET fulfillment_status = 'cancelled', agreement_status = 'cancelled', updated_at = CURRENT_TIMESTAMP
       WHERE order_id = $1 AND seller_id = $2 AND fulfillment_status = 'pending'`, [req.params.id, req.user.id]
    );
    await releaseCancelledOrderStock(client, req.params.id, fulfillments.rows, req.user.id);
    await client.query("UPDATE message_offers SET accepted_checkout_id = NULL WHERE accepted_checkout_id = $1 AND seller_id = $2 AND status = 'accepted'", [req.params.id, req.user.id]);
    const eventNote = `Seller cancelled before fulfillment (reason: ${reason})${details ? ` — ${details}` : ''}.${refundRequested ? ' MonCash refund review remains pending; no refund is confirmed.' : ''}`;
    await client.query(
      `INSERT INTO order_events (order_id, event_type, actor_id, old_value, new_value, note)
       VALUES ($1, 'status_change', $2, $3, $4, $5)`,
      [req.params.id, req.user.id, order.status, cancelWholeOrder ? 'cancelled' : order.status, eventNote]
    );
    await client.query('COMMIT');
    createNotification(order.buyer_id, 'order_cancelled', 'Order cancelled',
      refundRequested ? 'This seller cannot fulfill their part of the order. MonCash refund review remains pending; other sellers’ portions stay active.' : 'This seller cannot fulfill their part. Other sellers’ portions stay active.',
      { orderId: req.params.id, sellerId: req.user.id, refundReviewPending: refundRequested, cancellationOutcome: 'seller_cancelled' });
    return res.json({ cancelled: true, partial: !cancelWholeOrder, refundRequested, refundStatus: refundRequested ? 'open' : null });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('Seller order cancellation error:', err);
    return res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
});

// ── Reorder ───────────────────────────────────────────────────────────────

router.post('/orders/:id/reorder', authRequired, async (req, res) => {
  try {
    const order = await canAccessOrder(req.user.id, req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const items = await pool.query(
      `SELECT oi.product_id, oi.quantity, oi.variant_id, oi.variant_label, p.name, p.price, p.stock, p.is_available, p.seller_id,
              p.sale_price, p.sale_starts_at, p.sale_ends_at, p.has_variants,
              v.id AS v_id, v.price AS v_price, v.stock AS v_stock, v.option_label AS v_label,
              (SELECT json_agg(json_build_object('id', pi.id, 'url', pi.image_url, 'is_primary', pi.is_primary, 'display_order', pi.display_order) ORDER BY pi.is_primary DESC, pi.display_order)
               FROM product_images pi WHERE pi.product_id = p.id) AS images
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       LEFT JOIN product_variants v ON v.id = oi.variant_id
       WHERE oi.order_id = $1`,
      [req.params.id]
    );
    const availableItems = items.rows
      .filter(item => item.is_available && item.seller_id !== req.user.id)
      .map(item => {
        if (item.variant_id) {
          // Variant orders reorder only when the exact option still exists and is in stock
          if (!item.v_id || item.v_stock < 1) return null;
          return { productId: item.product_id, sellerId: item.seller_id, name: item.name, price: parseFloat(item.v_price), stock: item.v_stock, images: item.images || [], variantId: item.v_id, variantLabel: item.v_label || item.variant_label };
        }
        // The listing has since gained variants — the original option no longer exists
        if (item.has_variants) return null;
        if (item.stock < 1) return null;
        const isOnSale = item.sale_price && (item.sale_starts_at === null || new Date(item.sale_starts_at) <= new Date()) && (item.sale_ends_at === null || new Date(item.sale_ends_at) >= new Date());
        const effectivePrice = isOnSale ? parseFloat(item.sale_price) : parseFloat(item.price);
        return { productId: item.product_id, sellerId: item.seller_id, name: item.name, price: effectivePrice, stock: item.stock, images: item.images || [] };
      })
      .filter(Boolean);
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

router.post('/orders/:id/meetup/place-confirm', authRequired, async (req, res) => {
  const { sellerId } = req.body || {};
  if (!sellerId || !/^[0-9a-f-]{36}$/i.test(sellerId)) return res.status(400).json({ error: 'sellerId is required' });
  try {
    const order = await canAccessOrder(req.user.id, req.params.id);
    if (!order || order.status !== 'completed') return res.status(409).json({ error: 'Meetup place confirmation is available after the order is completed' });
    const fulfillment = await pool.query(
      `SELECT fulfillment_lat, fulfillment_lng, fulfillment_address FROM seller_fulfillments
       WHERE order_id = $1 AND seller_id = $2 AND fulfillment_method = 'meetup' AND fulfillment_status = 'completed'`,
      [req.params.id, sellerId]
    );
    const place = fulfillment.rows[0];
    if (!place?.fulfillment_lat || !place?.fulfillment_lng || !place.fulfillment_address) return res.status(409).json({ error: 'This completed seller order has no recorded meetup location' });
    const eligible = req.user.id === order.buyer_id || req.user.id === sellerId;
    if (!eligible) return res.status(403).json({ error: 'Only the buyer and seller can confirm this meetup place' });
    const lat = Number(place.fulfillment_lat), lng = Number(place.fulfillment_lng);
    const label = String(place.fulfillment_address).split(',').slice(0, 2).join(',').trim().slice(0, 160);
    const placeKey = `${lat.toFixed(3)}|${lng.toFixed(3)}|${label.toLocaleLowerCase()}`;
    await pool.query(
      `INSERT INTO meetup_place_confirmations (order_id, seller_id, user_id, place_key, place_label, lat, lng)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (order_id,seller_id,user_id) DO NOTHING`,
      [req.params.id, sellerId, req.user.id, placeKey, label, lat, lng]
    );
    const confirmations = await pool.query('SELECT COUNT(DISTINCT user_id)::int AS count FROM meetup_place_confirmations WHERE order_id = $1 AND seller_id = $2 AND place_key = $3', [req.params.id, sellerId, placeKey]);
    res.json({ confirmed: true, bothConfirmed: confirmations.rows[0].count === 2, label });
  } catch (err) {
    console.error('Meetup place confirmation error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/orders/:id/meetup/place-report', authRequired, async (req, res) => {
  const { sellerId, reason, details } = req.body || {};
  if (!sellerId || !['wrong_details','not_a_meetup_place','other'].includes(reason)) return res.status(400).json({ error: 'Choose a valid map issue' });
  if (details != null && (typeof details !== 'string' || details.length > 500)) return res.status(400).json({ error: 'Details must be 500 characters or fewer' });
  try {
    const order = await canAccessOrder(req.user.id, req.params.id);
    if (!order || order.status !== 'completed' || (req.user.id !== order.buyer_id && req.user.id !== sellerId)) return res.status(403).json({ error: 'Only order participants can report a completed meetup place' });
    const fulfillment = await pool.query(
      `SELECT fulfillment_lat, fulfillment_lng, fulfillment_address FROM seller_fulfillments
       WHERE order_id = $1 AND seller_id = $2 AND fulfillment_method = 'meetup' AND fulfillment_status = 'completed'`, [req.params.id, sellerId]
    );
    const place = fulfillment.rows[0];
    if (!place?.fulfillment_lat || !place?.fulfillment_lng || !place.fulfillment_address) return res.status(409).json({ error: 'No meetup location is recorded for this order' });
    const label = String(place.fulfillment_address).split(',').slice(0, 2).join(',').trim().slice(0, 160);
    const placeKey = `${Number(place.fulfillment_lat).toFixed(3)}|${Number(place.fulfillment_lng).toFixed(3)}|${label.toLocaleLowerCase()}`;
    await pool.query(
      `INSERT INTO meetup_place_reports (order_id, seller_id, reporter_id, place_key, reason, details)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (order_id,seller_id,reporter_id) DO NOTHING`,
      [req.params.id, sellerId, req.user.id, placeKey, reason, details?.trim() || null]
    );
    const reports = await pool.query('SELECT COUNT(DISTINCT order_id)::int AS count FROM meetup_place_reports WHERE place_key = $1 AND created_at >= CURRENT_TIMESTAMP - INTERVAL \'90 days\'', [placeKey]);
    res.json({ reported: true, suggestionPaused: reports.rows[0].count >= 2 });
  } catch (err) {
    console.error('Meetup place report error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

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
    const natcashMeetupOrder = order.payment_method === 'natcash' && ['pending', 'active', 'partially_paid'].includes(order.status);
    if (order.status !== 'paid' && !natcashMeetupOrder) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Order must be paid or awaiting an in-person NatCash handoff to check in' });
    }
    if (order.meetup_expires_at && new Date(order.meetup_expires_at).getTime() <= Date.now()) {
      await client.query('ROLLBACK');
      return res.status(410).json({ error: 'This meetup session has expired. Open a dispute if the exchange was not completed.' });
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
        if (!order.meetup_started_at || !order.meetup_expires_at) {
          await client.query(
            `UPDATE orders
             SET meetup_started_at = COALESCE(meetup_started_at, CURRENT_TIMESTAMP),
                 meetup_expires_at = COALESCE(meetup_expires_at, CURRENT_TIMESTAMP + INTERVAL '90 minutes'),
                 updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [req.params.id]
          );
        }
        // Re-checking in must not invalidate a valid buyer code.  A new code
        // is issued only on the first proximity match or after expiry.
        const buyerCode = await client.query(
          'SELECT meetup_code, meetup_code_expires_at FROM meetup_checkins WHERE order_id = $1 AND user_id = $2 FOR UPDATE',
          [req.params.id, order.buyer_id]
        );
        if (!buyerCode.rows[0]?.meetup_code || new Date(buyerCode.rows[0].meetup_code_expires_at || 0).getTime() <= Date.now()) {
          const meetupCode = generateMeetupCode();
          await client.query(
            `UPDATE meetup_checkins SET meetup_code = $1, meetup_code_expires_at = CURRENT_TIMESTAMP + INTERVAL '30 minutes',
                    meetup_code_attempts = 0, qr_scanned = false
             WHERE order_id = $2 AND user_id = $3`,
            [meetupCode, req.params.id, order.buyer_id]
          );
        }
        await logOrderEvent(req.params.id, 'meetup_arrived', req.user.id, null, null, `Buyer and seller within ${Math.round(distance)}m`, client);
      }
    }

    await client.query('COMMIT');

    const response = {
      checkedIn: true, role,
      otherPartyCheckedIn: otherCheckin.rows.length > 0,
      proximityConfirmed,
      distance: distance ? Math.round(distance) : null,
      meetupStartedAt: order.meetup_started_at || (proximityConfirmed ? new Date().toISOString() : null),
      meetupExpiresAt: order.meetup_expires_at || (proximityConfirmed ? new Date(Date.now() + MEETUP_SESSION_MS).toISOString() : null),
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
    if (order.meetup_expires_at && new Date(order.meetup_expires_at).getTime() <= Date.now()) {
      await client.query('ROLLBACK');
      return res.status(410).json({ error: 'This meetup session has expired. Open a dispute if the exchange was not completed.' });
    }

    const sellerItem = await pool.query(
      'SELECT seller_id FROM order_items WHERE order_id = $1 AND seller_id = $2',
      [req.params.id, req.user.id]
    );
    if (sellerItem.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Only a seller on this order can enter the delivery code' });
    }
    if (order.payment_method === 'natcash') {
      const received = await client.query(
        "SELECT payment_status FROM seller_fulfillments WHERE order_id = $1 AND seller_id = $2 AND payment_method = 'natcash' FOR UPDATE",
        [req.params.id, req.user.id]
      );
      if (received.rows[0]?.payment_status !== 'verified') {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'The seller must confirm receiving NatCash before the handoff code can complete the exchange', code: 'NATCASH_RECEIPT_REQUIRED' });
      }
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
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [req.params.id]);
    const order = result.rows[0];
    if (!order) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Order not found' }); }
    const membership = order.buyer_id === req.user.id || (await client.query('SELECT 1 FROM order_items WHERE order_id = $1 AND seller_id = $2', [req.params.id, req.user.id])).rows.length > 0;
    if (!membership) { await client.query('ROLLBACK'); return res.status(403).json({ error: 'Not a party to this order' }); }
    if (order.status !== 'paid' || !order.meetup_expires_at) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'An active meetup is required before extending it' }); }
    if (new Date(order.meetup_expires_at).getTime() <= Date.now()) { await client.query('ROLLBACK'); return res.status(410).json({ error: 'This meetup has already expired' }); }
    const updated = await client.query(
      `UPDATE orders SET meetup_expires_at = meetup_expires_at + INTERVAL '30 minutes', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 RETURNING meetup_expires_at`, [req.params.id]
    );
    await logOrderEvent(req.params.id, 'meetup_extended', req.user.id, null, null, 'Meetup deadline extended by 30 minutes', client);
    await client.query('COMMIT');
    res.json({ extended: true, meetupExpiresAt: updated.rows[0].meetup_expires_at });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('Meetup extend error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
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
    res.json({ checkins: checkins.rows, meetupStartedAt: order.meetup_started_at, meetupExpiresAt: order.meetup_expires_at });
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
    const activeCancellation = await client.query(
      `SELECT id FROM disputes WHERE order_id = $1 AND reason = 'cancellation_request'
       AND status IN ('open', 'under_review') LIMIT 1`,
      [req.params.id]
    );
    if (activeCancellation.rows.length) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(409).json({ error: 'An unresolved cancellation request must be reviewed before the buyer can complete this order or release its settlement.' });
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

    const openDispute = await client.query(
      `SELECT id FROM disputes WHERE order_id = $1
       AND (status = 'open' OR (reason = 'cancellation_request' AND status = 'under_review'))`,
      [req.params.id]
    );
    if (openDispute.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Escrow is frozen — an open dispute must be resolved first.' });
    }

    // A cancelled seller portion is settled only through its own MonCash refund
    // review — never through this order-level release. Without this exclusion a
    // portion that was cancelled (and whose refund review later closed without
    // draining its whole gross) would still be paid out here, crediting a seller
    // for goods the buyer is not receiving. The other portions are unaffected.
    const escrows = await client.query(
      `SELECT oe.* FROM order_escrow oe
       LEFT JOIN seller_fulfillments sf
         ON sf.order_id = oe.order_id AND sf.seller_id = oe.seller_id
       WHERE oe.order_id = $1 AND oe.status = 'held'
         AND COALESCE(sf.fulfillment_status, '') <> 'cancelled'
       FOR UPDATE OF oe`,
      [req.params.id]
    );
    if (escrows.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No held escrow is releasable for this order. Cancelled seller portions wait on their own MonCash refund review.' });
    }

    const debtOffsets = [];
    for (const escrow of escrows.rows) {
      const net = parseFloat(escrow.net_amount);
      let creditAfterDebt = net;
      let debts = { rows: [] };
      if (o.payment_method === 'moncash') {
        const activeDebtPayment = await client.query(
          "SELECT id FROM seller_debt_payments WHERE seller_id = $1 AND status IN ('created','processing','unknown') LIMIT 1 FOR UPDATE",
          [escrow.seller_id]
        );
        if (!activeDebtPayment.rows.length) {
          debts = await client.query(
            "SELECT id, outstanding_amount FROM seller_debts WHERE seller_id = $1 AND status = 'open' ORDER BY created_at, id FOR UPDATE",
            [escrow.seller_id]
          );
        }
      }
      for (const debt of debts.rows) {
        if (creditAfterDebt <= 0) break;
        const outstanding = Number(debt.outstanding_amount);
        const offset = Math.min(creditAfterDebt, outstanding);
        const remaining = Math.round((outstanding - offset) * 100) / 100;
        creditAfterDebt = Math.round((creditAfterDebt - offset) * 100) / 100;
        await client.query(
          `UPDATE seller_debts SET outstanding_amount = $1, status = CASE WHEN $1 <= 0 THEN 'paid' ELSE 'open' END,
             updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
          [remaining, debt.id]
        );
        debtOffsets.push({ sellerId: escrow.seller_id, amount: offset });
      }
      await client.query(
        `INSERT INTO seller_balances (seller_id, balance, total_earned)
         VALUES ($1, $2, $3)
         ON CONFLICT (seller_id)
         DO UPDATE SET balance = seller_balances.balance + $2,
                       total_earned = seller_balances.total_earned + $3,
                       updated_at = CURRENT_TIMESTAMP`,
        [escrow.seller_id, creditAfterDebt, net]
      );
      await client.query("UPDATE order_escrow SET status = 'released', released_at = CURRENT_TIMESTAMP WHERE id = $1", [escrow.id]);
      console.log(`Escrow released: seller ${escrow.seller_id} credited G ${creditAfterDebt}; debt offset G ${net - creditAfterDebt}`);
    }

    if (o.status !== 'completed') {
      await client.query("UPDATE orders SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [req.params.id]);
    }

    await client.query('COMMIT');
    client.release();
    for (const offset of debtOffsets) {
      createNotification(offset.sellerId, 'seller_debt_offset', 'Outstanding refund fee applied',
        `G ${offset.amount.toFixed(2)} from this earning was applied to your outstanding refund fee.`, { orderId: req.params.id, amount: offset.amount });
    }

    // Only MonCash commission is transferred through the MonCash payout rail.
    if (o.payment_method === 'moncash') try {
      // Commission is transferred only for the portions actually released just
      // now, never for a portion held back for refund review.
      const totalCommission = (await pool.query(
        'SELECT COALESCE(SUM(commission_amount), 0) AS total FROM order_escrow WHERE order_id = $1 AND id = ANY($2::uuid[])',
        [req.params.id, escrows.rows.map((row) => row.id)]
      )).rows[0].total;
      const commissionAmount = parseFloat(totalCommission);
      const platformTransferAmount = Math.round(commissionAmount);

      if (platformTransferAmount > 0 && process.env.PLATFORM_PHONE) {
        const existingPlatformPayout = await pool.query(
          "SELECT id FROM platform_payouts WHERE order_id = $1 AND status IN ('pending', 'processing', 'completed') LIMIT 1",
          [req.params.id]
        );
        if (existingPlatformPayout.rows.length) {
          console.log(`Platform commission transfer already recorded for order ${req.params.id}`);
        } else {
          const platformFee = Math.round(platformTransferAmount * 0.05 * 100) / 100;
          const platformTotalDebit = Math.round((platformTransferAmount + platformFee) * 100) / 100;
          const platformPayout = await pool.query(
            `INSERT INTO platform_payouts (order_id, amount, fee_amount, total_debit, status, moncash_reference)
             VALUES ($1, $2, $3, $4, 'processing', $5) RETURNING id`,
            [req.params.id, platformTransferAmount, platformFee, platformTotalDebit, `platform_${req.params.id}`]
          );
          const platformPayoutId = platformPayout.rows[0].id;
          const payoutRes = await fetch(
            process.env.MONCASH_PAYOUT_CREATE_URL || 'https://api.moncashconnect.com/v1/payout-create',
            {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${process.env.MCC_KEY}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                amount: platformTransferAmount,
                moncashNumber: process.env.PLATFORM_PHONE,
                referenceId: platformPayoutId,
              }),
              signal: AbortSignal.timeout(15000),
            }
          );
          if (payoutRes.ok) {
            const payoutData = await payoutRes.json();
            await pool.query(
              `UPDATE platform_payouts SET provider_reference = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND status = 'processing'`,
              [payoutData.reference || payoutData.transactionId || null, platformPayoutId]
            );
            console.log(`Platform commission transfer G ${platformTransferAmount} accepted; awaiting MonCash settlement confirmation (5% fee G ${platformFee})`);
          } else {
            const errText = await payoutRes.text();
            const definitiveReject = payoutRes.status >= 400 && payoutRes.status < 500 && payoutRes.status !== 409;
            await pool.query(
              `UPDATE platform_payouts SET status = $1, error_message = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND status = 'processing'`,
              [definitiveReject ? 'failed' : 'processing', `MonCashConnect returned ${payoutRes.status}: ${errText}`.slice(0, 1000), platformPayoutId]
            );
            console.error(`Platform payout ${definitiveReject ? 'rejected' : 'awaiting reconciliation'}: ${errText}`);
          }
        }
      }
    } catch (payoutErr) {
      await pool.query(
        `UPDATE platform_payouts SET error_message = $1, updated_at = CURRENT_TIMESTAMP
         WHERE order_id = $2 AND status = 'processing' AND provider_reference IS NULL`,
        [`MonCash response was not confirmed; transfer remains reserved for reconciliation: ${payoutErr.message}`.slice(0, 1000), req.params.id]
      ).catch(() => {});
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
      client.release();
      return res.status(404).json({ error: 'Order not found' });
    }
    const o = order.rows[0];

    const isAdmin = req.user.role === 'admin';
    const isBuyer = o.buyer_id === req.user.id;
    if (!isBuyer && !isAdmin) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(403).json({ error: 'Only the buyer can request a refund' });
    }

    if (isBuyer) {
      const reason = String(req.body?.reason || '').trim();
      if (reason.length < 5) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(400).json({ error: 'Please provide a reason for the refund request' });
      }
      const existing = await client.query(
        "SELECT id FROM disputes WHERE order_id = $1 AND raised_by = $2 AND status IN ('open', 'under_review') AND reason = 'refund_request' LIMIT 1",
        [req.params.id, req.user.id]
      );
      if (existing.rows.length > 0) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(409).json({ error: 'A refund request is already open for this order' });
      }
      await client.query(
        `INSERT INTO disputes (order_id, raised_by, reason, description, status)
         VALUES ($1, $2, 'refund_request', $3, 'open')`,
        [req.params.id, req.user.id, reason]
      );
      await client.query('COMMIT');
      client.release();
      return res.status(202).json({ requested: true, status: 'open' });
    }

    if (!isAdmin) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(403).json({ error: 'Support authorization is required to issue a refund' });
    }

    if (o.payment_method !== 'moncash') {
      await client.query('ROLLBACK');
      client.release();
      return res.status(409).json({ error: 'This refund route only settles MonCash payments' });
    }

    const reason = String(req.body?.reason || '').trim();
    const cause = String(req.body?.cause || 'maurmaket');
    const receiverPhone = String(req.body?.receiverPhone || '').trim();
    const responsibleSellerId = req.body?.responsibleSellerId || null;
    const refundedSellerId = req.body?.sellerId || null;
    const isUuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
    if (reason.length < 5 || !['seller', 'maurmaket', 'shared'].includes(cause) || !receiverPhone ||
        (responsibleSellerId && !isUuid(responsibleSellerId)) || (refundedSellerId && !isUuid(refundedSellerId)) ||
        ((cause === 'seller' || cause === 'shared') && !responsibleSellerId)) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(400).json({ error: 'Support must provide a reason, fee responsibility, and verified MonCash destination' });
    }

    const escrowResult = await client.query(
      `SELECT * FROM order_escrow WHERE order_id = $1 AND status = 'held'
       AND ($2::uuid IS NULL OR seller_id = $2) FOR UPDATE`, [req.params.id, refundedSellerId]
    );
    if (escrowResult.rows.length === 0) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(400).json({ error: 'No held MonCash escrow is available to refund' });
    }
    if (responsibleSellerId && !escrowResult.rows.some(row => row.seller_id === responsibleSellerId)) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(400).json({ error: 'Fee-responsible seller must belong to this order' });
    }
    if (refundedSellerId) {
      const canceledPortion = await client.query(
        `SELECT 1 FROM seller_fulfillments WHERE order_id = $1 AND seller_id = $2 AND fulfillment_status = 'cancelled'`,
        [req.params.id, refundedSellerId]
      );
      if (!canceledPortion.rowCount || escrowResult.rows.length !== 1) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(409).json({ error: 'A seller-specific refund requires that seller’s cancelled order portion and held escrow.' });
      }
      const otherRefunds = await client.query(
        `SELECT id FROM refund_payouts WHERE order_id = $1 AND status <> 'failed'
         AND refunded_seller_id IS NULL LIMIT 1`, [req.params.id]
      );
      if (otherRefunds.rowCount) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(409).json({ error: 'This order has an existing order-wide refund; seller-specific refund allocation requires reconciliation first.' });
      }
    }

    const inFlightRefund = await client.query(
      `SELECT id FROM refund_payouts WHERE order_id = $1 AND status IN ('pending', 'processing')
       AND ($2::uuid IS NULL OR refunded_seller_id = $2) LIMIT 1 FOR UPDATE`,
      [req.params.id, refundedSellerId]
    );
    if (inFlightRefund.rowCount) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(409).json({ error: 'A MonCash refund transfer is still pending. Wait for its confirmed result before issuing another refund for this portion.' });
    }

    const priorRefunds = await client.query(
      `SELECT COALESCE(SUM(amount), 0) AS refunded FROM refund_payouts
       WHERE order_id = $1 AND status <> 'failed' AND ($2::uuid IS NULL OR refunded_seller_id = $2)`,
      [req.params.id, refundedSellerId]
    );
    const refundBasis = refundedSellerId ? Number(escrowResult.rows[0].gross_amount) : Number(o.total_amount);
    const amountRemaining = Math.max(0, refundBasis - (refundedSellerId ? 0 : Number(priorRefunds.rows[0]?.refunded || 0)));
    const totalRefund = Math.round(Number(req.body?.amount ?? amountRemaining) * 100) / 100;
    if (!Number.isFinite(totalRefund) || totalRefund <= 0 || totalRefund > amountRemaining) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(400).json({ error: 'Refund amount must be positive and no greater than the amount still refundable' });
    }

    const feeAmount = Math.round(totalRefund * 0.05 * 100) / 100;
    const sellerFeeShare = cause === 'seller' ? feeAmount : cause === 'shared' ? Math.round(feeAmount * 0.5 * 100) / 100 : 0;
    const reductionRatio = Math.min(1, totalRefund / amountRemaining);
    let commissionReversed = 0;
    let collectionFeeKept = 0;
    const createdDebtIds = [];
    const sellerFeeImpacts = new Map();
    for (const escrow of escrowResult.rows) {
      const gross = Math.round(Number(escrow.gross_amount) * (1 - reductionRatio) * 100) / 100;
      const commissionBase = Math.round(Number(escrow.commission_base || 0) * (1 - reductionRatio) * 100) / 100;
      const commission = Math.round(Number(escrow.commission_amount) * (1 - reductionRatio) * 100) / 100;
      commissionReversed += Number(escrow.commission_amount) - commission;
      const oldCollectionFee = Number(escrow.collection_fee_amount || 0);
      const refundedCollectionFee = oldCollectionFee * reductionRatio;
      const sellerResponsibility = escrow.seller_id !== responsibleSellerId ? 0 : cause === 'seller' ? 1 : cause === 'shared' ? 0.5 : 0;
      const retainedCollectionFee = Math.round(refundedCollectionFee * sellerResponsibility * 100) / 100;
      collectionFeeKept += retainedCollectionFee;
      if (sellerResponsibility > 0) {
        const impact = sellerFeeImpacts.get(escrow.seller_id) || { total: 0, outstanding: 0 };
        impact.total += sellerFeeShare + retainedCollectionFee;
        sellerFeeImpacts.set(escrow.seller_id, impact);
      }
      const collectionFee = Math.round((oldCollectionFee - refundedCollectionFee + retainedCollectionFee) * 100) / 100;
      const baseNet = Math.round((gross - commission - collectionFee) * 100) / 100;
      let net = Math.max(0, baseNet);
      let debtDue = Math.max(0, -baseNet);
      if (escrow.seller_id === responsibleSellerId && sellerFeeShare > 0) {
        const fromEscrow = Math.min(net, sellerFeeShare);
        net = Math.round((net - fromEscrow) * 100) / 100;
        debtDue = Math.round((debtDue + sellerFeeShare - fromEscrow) * 100) / 100;
      }
      if (escrow.seller_id === responsibleSellerId && debtDue > 0) {
        const balance = await client.query('SELECT balance FROM seller_balances WHERE seller_id = $1 FOR UPDATE', [responsibleSellerId]);
        const available = Number(balance.rows[0]?.balance || 0);
        const fromBalance = Math.min(available, debtDue);
        if (fromBalance > 0) {
          await client.query('UPDATE seller_balances SET balance = balance - $1, updated_at = CURRENT_TIMESTAMP WHERE seller_id = $2', [fromBalance, responsibleSellerId]);
          debtDue = Math.round((debtDue - fromBalance) * 100) / 100;
        }
        if (debtDue > 0) {
          const debt = await client.query(
            `INSERT INTO seller_debts (seller_id, order_id, original_amount, outstanding_amount, reason)
             VALUES ($1, $2, $3, $3, $4) RETURNING id`,
            [responsibleSellerId, req.params.id, debtDue, `MonCash refund fee share: ${reason}`]
          );
          createdDebtIds.push(debt.rows[0].id);
        }
        const impact = sellerFeeImpacts.get(responsibleSellerId);
        if (impact) impact.outstanding += debtDue;
      }
      await client.query(
        `UPDATE order_escrow SET gross_amount = $1, commission_base = $2, collection_fee_amount = $3,
           commission_amount = $4, net_amount = $5, status = CASE WHEN $1 <= 0 THEN 'refunded' ELSE 'held' END,
           released_at = CASE WHEN $1 <= 0 THEN CURRENT_TIMESTAMP ELSE released_at END WHERE id = $6`,
        [gross, commissionBase, collectionFee, commission, net, escrow.id]
      );
      await client.query(
        `UPDATE platform_revenue SET gross_amount = $1, commission_base = $2, collection_fee_amount = $3,
           commission_amount = $4, platform_fee = $4, net_to_seller = $5 WHERE order_id = $6 AND seller_id = $7`,
        [gross, commissionBase, collectionFee, commission, net, req.params.id, escrow.seller_id]
      );
    }

    const fullyRefunded = !refundedSellerId && totalRefund >= amountRemaining;
    if (fullyRefunded) {
      await client.query("UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [req.params.id]);
      const reservations = await client.query(
        `UPDATE stock_reservations SET status = 'released', released_at = CURRENT_TIMESTAMP
         WHERE order_id = $1 AND status IN ('active','confirmed') RETURNING product_id, quantity, variant_id`, [req.params.id]
      );
      for (const item of reservations.rows) {
        await client.query('SELECT id FROM products WHERE id = $1 FOR UPDATE', [item.product_id]);
        await client.query('UPDATE products SET stock = stock + $1 WHERE id = $2', [item.quantity, item.product_id]);
        if (item.variant_id) await client.query('UPDATE product_variants SET stock = stock + $1 WHERE id = $2', [item.quantity, item.variant_id]);
      }
    }

    const refundInsert = await client.query(
      `INSERT INTO refund_payouts
         (order_id, buyer_id, amount, fee_amount, receiver_phone, reason, cause, responsible_seller_id,
          refunded_seller_id, commission_reversed, collection_fee_kept, seller_fee_share,
          requested_by, approved_by, destination_verified)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13, true) RETURNING id`,
      [req.params.id, o.buyer_id, totalRefund, feeAmount, receiverPhone, reason, cause, responsibleSellerId, refundedSellerId, commissionReversed, collectionFeeKept, sellerFeeShare, req.user.id]
    );
    const refundId = refundInsert.rows[0].id;
    await client.query('UPDATE refund_payouts SET moncash_reference = $1 WHERE id = $2', [`refund_${refundId}`, refundId]);
    if (createdDebtIds.length) await client.query('UPDATE seller_debts SET refund_id = $1 WHERE id = ANY($2::uuid[])', [refundId, createdDebtIds]);
    await logOrderEvent(req.params.id, 'status_change', req.user.id, o.status, fullyRefunded ? 'cancelled' : o.status,
      `Support authorized MonCash refund G ${totalRefund.toFixed(2)} (${cause} fee responsibility)`, client);

    await client.query('COMMIT');
    client.release();

    await processRefundPayout(refundId);

    for (const escrow of escrowResult.rows) {
      const impact = sellerFeeImpacts.get(escrow.seller_id);
      const feeNotice = impact
        ? ` Your assigned MonCash fees are G ${impact.total.toFixed(2)}; G ${impact.outstanding.toFixed(2)} remains due and will be offset from future MonCash seller earnings.`
        : '';
      createNotification(escrow.seller_id, 'escrow_refunded', 'Refund processing',
        `Support approved a MonCash refund of G ${totalRefund.toFixed(2)} for this order. The transfer is awaiting MonCash confirmation.${feeNotice}`, { orderId: req.params.id });
    }

    res.status(202).json({ status: 'processing', refundId, amount: totalRefund, feeAmount, sellerFeeShare });
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

    const lastAttempt = await pool.query(
      'SELECT status FROM moncash_payment_attempts WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1',
      [orderId]
    );
    if (lastAttempt.rows.length && !['failed', 'expired'].includes(lastAttempt.rows[0].status)) {
      return res.status(409).json({ error: 'payment_attempt_unresolved', status: lastAttempt.rows[0].status, message: 'Wait for MonCash to confirm the previous attempt before retrying.' });
    }

    const retryReference = `${orderId}_retry_${Date.now()}`;
    const expectedAmount = Math.round(Number(order.total_amount));
    const attempt = await pool.query(
      `INSERT INTO moncash_payment_attempts (order_id, reference_id, expected_amount, status)
       VALUES ($1, $2, $3, 'created') RETURNING id`,
      [orderId, retryReference, expectedAmount]
    );
    await pool.query('UPDATE orders SET moncash_reference = $1 WHERE id = $2', [retryReference, orderId]);
    try {
      const moncashRes = await fetch(
        process.env.MONCASH_PAY_CREATE_URL || 'https://api.moncashconnect.com/v1/pay-create',
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${process.env.MCC_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: expectedAmount,
            referenceId: retryReference,
            returnUrl: returnUrl?.startsWith('https://') ? returnUrl : `${process.env.PRODUCTION_URL || 'https://maurmaket.onrender.com'}/payment/return?order=${orderId}`,
          }),
          signal: AbortSignal.timeout(15000),
        }
      );
      if (!moncashRes.ok) {
        const errorText = await moncashRes.text();
        const definitiveReject = moncashRes.status >= 400 && moncashRes.status < 500 && moncashRes.status !== 409;
        await pool.query(
          'UPDATE moncash_payment_attempts SET status = $1, error_message = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
          [definitiveReject ? 'failed' : 'unknown', `MonCashConnect returned ${moncashRes.status}: ${errorText}`.slice(0, 1000), attempt.rows[0].id]
        );
        if (moncashRes.status === 409) return res.status(409).json({ error: 'payment_attempt_unresolved', reference: retryReference });
        return res.status(definitiveReject ? 502 : 202).json({ error: definitiveReject ? 'Payment provider rejected the request' : 'Payment outcome is unknown; do not retry yet' });
      }
      const data = await moncashRes.json();
      if (!data.paymentUrl) {
        await pool.query("UPDATE moncash_payment_attempts SET status = 'unknown', error_message = 'Provider accepted request without payment URL', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [attempt.rows[0].id]);
        return res.status(202).json({ error: 'Payment request is unresolved; check its status before trying again' });
      }
      await pool.query(
        `UPDATE moncash_payment_attempts SET status = 'processing', provider_reference = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [data.reference || data.transactionId || null, attempt.rows[0].id]
      );
      return res.json({ paymentUrl: data.paymentUrl });
    } catch (providerError) {
      await pool.query(
        `UPDATE moncash_payment_attempts SET status = 'unknown', error_message = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [`Request outcome is unknown: ${providerError.message}`.slice(0, 1000), attempt.rows[0].id]
      );
      return res.status(202).json({ error: 'Payment request is unresolved; check its status before trying again' });
    }
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'payment_attempt_unresolved', message: 'An existing MonCash attempt must be reconciled before retrying.' });
    console.error('Payment retry error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
