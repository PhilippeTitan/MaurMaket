import { Router } from 'express';
import crypto from 'crypto';
import { pool } from '../config/database.js';
import { authRequired } from '../middleware/auth.js';
import { logOrderEvent, getCommissionRate, getSellerPaymentAllocations, reserveOrderStock, recordProductCooccurrences } from '../utils/helpers.js';
import { createNotification } from '../utils/notifications.js';

const router = Router();

// Create MonCash payment
router.post('/api/payments/create', authRequired, async (req, res) => {
  const { orderId, returnUrl } = req.body;
  if (!orderId) return res.status(400).json({ error: 'orderId required' });
  try {
    const orderResult = await pool.query('SELECT * FROM orders WHERE id = $1 AND buyer_id = $2', [orderId, req.user.id]);
    if (orderResult.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    const order = orderResult.rows[0];
    if (order.status !== 'pending') return res.status(400).json({ error: 'Order is not pending' });
    const referenceId = `${orderId}_${Date.now()}`;
    let moncashRes = await fetch(
      process.env.MONCASH_PAY_CREATE_URL || 'https://hvlmeoqyxaguzcujpmit.supabase.co/functions/v1/pay-create',
      { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.MCC_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: Math.round(parseFloat(order.total_amount)), referenceId,
          returnUrl: returnUrl?.startsWith('https://') ? returnUrl : `${process.env.PRODUCTION_URL || 'https://maurmaket.onrender.com'}/payment/return?order=${orderId}` }),
        signal: AbortSignal.timeout(15000) }
    );
    if (moncashRes.status === 409) {
      const retryRef = `${orderId}_retry_${Date.now()}`;
      moncashRes = await fetch(process.env.MONCASH_PAY_CREATE_URL || 'https://hvlmeoqyxaguzcujpmit.supabase.co/functions/v1/pay-create',
        { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.MCC_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: Math.round(parseFloat(order.total_amount)), referenceId: retryRef,
            returnUrl: returnUrl?.startsWith('https://') ? returnUrl : `${process.env.PRODUCTION_URL || 'https://maurmaket.onrender.com'}/payment/return` }),
          signal: AbortSignal.timeout(15000) });
      if (moncashRes.ok) { const retryData = await moncashRes.json(); if (retryData.paymentUrl) { await pool.query('UPDATE orders SET moncash_reference = $1 WHERE id = $2', [retryRef, orderId]); return res.json({ paymentUrl: retryData.paymentUrl }); } }
    }
    if (!moncashRes.ok) { const errorText = await moncashRes.text(); console.error(`MonCashConnect HTTP ${moncashRes.status}:`, errorText); return res.status(502).json({ error: 'Payment provider error' }); }
    const data = await moncashRes.json();
    if (!data.paymentUrl) return res.status(502).json({ error: 'Payment provider error' });
    await pool.query('UPDATE orders SET moncash_reference = $1 WHERE id = $2', [referenceId, orderId]);
    res.json({ paymentUrl: data.paymentUrl });
  } catch (err) { console.error('Payment create error:', err); res.status(500).json({ error: 'Server error' }); }
});

// Payment status polling
router.get('/api/payments/:orderId/status', authRequired, async (req, res) => {
  try {
    const orderResult = await pool.query("SELECT id, status, moncash_reference FROM orders WHERE id = $1 AND buyer_id = $2", [req.params.orderId, req.user.id]);
    if (orderResult.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    const order = orderResult.rows[0];
    if (order.status !== 'pending') return res.json({ status: order.status });
    const referenceId = order.moncash_reference || order.id;
    try {
      const payStatusUrl = (process.env.MONCASH_PAY_CREATE_URL || 'https://api.moncashconnect.com/v1/pay-create').replace('pay-create', 'pay-status') + `?referenceId=${encodeURIComponent(referenceId)}`;
      const moncashRes = await fetch(payStatusUrl, { method: 'GET', headers: { 'Authorization': `Bearer ${process.env.MCC_KEY}` }, signal: AbortSignal.timeout(15000) });
      if (moncashRes.ok) {
        const data = await moncashRes.json();
        if (data.status === 'completed' || data.paid === true) {
          let fallbackProcessed = false;
          if (order.status === 'pending') {
            try {
              const client = await pool.connect();
              try {
                await client.query('BEGIN');
                const updateResult = await client.query(`UPDATE orders SET status = 'paid', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'pending'`, [order.id]);
                if (updateResult.rowCount === 0) { await client.query('ROLLBACK'); }
                else {
                  await logOrderEvent(order.id, 'payment_received', null, 'pending', 'paid', 'Payment confirmed via pay-status poll', client);
                  await reserveOrderStock(client, order.id);
                  await recordProductCooccurrences(order.id, client);
                  const items = { rows: await getSellerPaymentAllocations(client, order.id) };
                  for (const item of items.rows) {
                    if (item.seller_id) {
                      const grossAmount = parseFloat(item.paid_total);
                      const tierRes = await client.query('SELECT seller_tier FROM users WHERE id = $1', [item.seller_id]);
                      const sellerTier = tierRes.rows[0]?.seller_tier || 'none';
                      const rate = getCommissionRate(sellerTier);
                      const commission = Math.round(grossAmount * rate * 100) / 100;
                      const net = Math.round((grossAmount - commission) * 100) / 100;
                      await client.query(`INSERT INTO order_escrow (order_id, seller_id, gross_amount, commission_amount, net_amount, status) VALUES ($1, $2, $3, $4, $5, 'held') ON CONFLICT (order_id, seller_id) DO UPDATE SET gross_amount = $3, commission_amount = $4, net_amount = $5, status = 'held'`, [order.id, item.seller_id, grossAmount, commission, net]);
                      await client.query(`INSERT INTO platform_revenue (order_id, seller_id, seller_tier, gross_amount, commission_rate, commission_amount, platform_fee, net_to_seller) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [order.id, item.seller_id, sellerTier, grossAmount, rate, commission, commission, net]);
                    }
                  }
                  await client.query('COMMIT'); client.release(); fallbackProcessed = true;
                  const sellerIds = items.rows.map(r => r.seller_id).filter(Boolean);
                  for (const sid of sellerIds) createNotification(sid, 'escrow_held', 'Payment held in escrow', 'Released to you once the buyer confirms.', { orderId: order.id });
                  createNotification(order.buyer_id || req.user.id, 'payment_confirmed', 'Payment Confirmed', 'Your payment was successful.', { orderId: order.id });
                }
              } catch (e) { try { await client.query('ROLLBACK'); } catch {} client.release(); }
            } catch (e) { console.error('[PAY-STATUS] Fallback processing failed:', e.message); }
          }
          if (!fallbackProcessed && order.status === 'pending') return res.status(503).json({ status: 'pending', error: 'Payment is confirmed but still being reconciled' });
          return res.json({ status: 'paid' });
        } else if (data.status === 'failed' || data.status === 'expired') {
          await pool.query(`UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'pending'`, [order.id]);
          return res.json({ status: 'cancelled' });
        }
      }
    } catch (pollErr) { console.error('MonCash pay-status poll error:', pollErr.message); }
    res.json({ status: 'pending' });
  } catch (err) { console.error('Payment status check error:', err); res.status(500).json({ error: 'Server error' }); }
});

// MonCash webhook (HMAC-SHA256 verified)
router.post('/api/payments/webhook', async (req, res) => {
  const rawBody = req.rawBody;
  const signature = req.headers['x-mcc-signature'];
  const timestamp = req.headers['x-mcc-timestamp'];
  const webhookSecret = process.env.MCC_WEBHOOK_SECRET;
  if (!webhookSecret) return res.status(500).json({ error: 'Webhook not configured' });
  if (!signature || !timestamp) return res.status(401).json({ error: 'Missing signature headers' });
  const ts = parseInt(timestamp) * 1000;
  if (Math.abs((Date.now() - ts) / 1000) > 300) return res.status(401).json({ error: 'Webhook timestamp expired' });
  const expected = 'sha256=' + crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
  const sigBuf = Buffer.from(signature); const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return res.status(401).json({ error: 'Invalid signature' });

  let { event, reference, id: eventId } = req.body;
  if (!reference) return res.status(400).json({ error: 'reference required' });
  const isPaymentEvent = event === 'payment.completed' || event === 'payment.failed';
  if (isPaymentEvent && reference.length > 36) reference = reference.substring(0, 36);
  if (eventId) { const already = await pool.query('SELECT 1 FROM processed_events WHERE id = $1', [eventId]); if (already.rows.length > 0) return res.json({ received: true, idempotent: true }); }

  try {
    if (event === 'payment.completed') {
      if (reference && reference.startsWith('sub_')) return res.json({ received: true, skipped: 'subscription' });
      // New fulfillment-level MonCash session. A reference resolves to exactly
      // one seller, while the first paid session materializes the shared order.
      const sessionResult = await pool.query('SELECT * FROM fulfillment_payment_sessions WHERE provider_reference = $1 AND provider = \'moncash\'', [reference]);
      if (sessionResult.rows.length > 0) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const sessionLock = await client.query('SELECT * FROM fulfillment_payment_sessions WHERE id = $1 FOR UPDATE', [sessionResult.rows[0].id]);
          const session = sessionLock.rows[0];
          if (session.status === 'completed') { await client.query('ROLLBACK'); return res.json({ received: true, idempotent: true, orderId: session.order_id }); }
          const checkoutRes = await client.query('SELECT * FROM pending_checkouts WHERE id = $1 FOR UPDATE', [session.checkout_id]);
          const pc = checkoutRes.rows[0];
          if (!pc) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Checkout not found' }); }
          let orderId = session.order_id;
          if (!orderId) {
            const prior = await client.query('SELECT order_id FROM fulfillment_payment_sessions WHERE checkout_id = $1 AND order_id IS NOT NULL LIMIT 1', [pc.id]);
            orderId = prior.rows[0]?.order_id;
          }
          if (!orderId) {
            const createdOrder = await client.query(
              `INSERT INTO orders (buyer_id, total_amount, status, payment_method, delivery_method, delivery_name, delivery_phone, delivery_address, delivery_city, delivery_note, meetup_lat, meetup_lng, meetup_address, meetup_name)
               VALUES ($1, $2, 'partially_paid', 'moncash', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
              [pc.user_id, pc.total_amount, pc.delivery_method, pc.delivery_name, pc.delivery_phone, pc.delivery_address, pc.delivery_city, pc.delivery_note, pc.meetup_lat, pc.meetup_lng, pc.meetup_address, pc.meetup_name]
            );
            orderId = createdOrder.rows[0].id;
            for (const item of pc.cart_data) {
              const product = await client.query('SELECT seller_id FROM products WHERE id = $1', [item.id || item.productId]);
              if (product.rows[0]) await client.query('INSERT INTO order_items (order_id, product_id, seller_id, quantity, price) VALUES ($1, $2, $3, $4, $5)', [orderId, item.id || item.productId, product.rows[0].seller_id, item.quantity || 1, item.price || 0]);
            }
            const agreements = await client.query("SELECT * FROM pending_fulfillment_agreements WHERE checkout_id = $1 AND status = 'accepted' AND terms_locked_at IS NOT NULL", [pc.id]);
            for (const agreement of agreements.rows) {
              const term = agreement.terms;
              await client.query(
                `INSERT INTO seller_fulfillments (order_id, seller_id, payment_status, fulfillment_status, payment_method, fulfillment_method, delivery_fee, fulfillment_lat, fulfillment_lng, fulfillment_address, fulfillment_note, agreement_status, buyer_accepted_at, seller_accepted_at, terms_locked_at)
                 VALUES ($1, $2, 'pending', 'pending', 'moncash', $3, $4, $5, $6, $7, $8, 'locked', $9, $10, $11) ON CONFLICT (order_id, seller_id) DO NOTHING`,
                [orderId, agreement.seller_id, term.method, Number(term.deliveryFee || 0), term.location?.lat || null, term.location?.lng || null, term.location?.address || null, term.location?.note || null, agreement.buyer_accepted_at, agreement.seller_accepted_at, agreement.terms_locked_at]
              );
            }
            await client.query('UPDATE fulfillment_payment_sessions SET order_id = $1 WHERE checkout_id = $2', [orderId, pc.id]);
          }
          // A later session can discover the order created by an earlier
          // session; persist that linkage in the same transaction.
          await client.query("UPDATE fulfillment_payment_sessions SET order_id = $1, status = 'completed', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $2", [orderId, session.id]);
          await client.query("UPDATE seller_fulfillments SET payment_status = 'verified', fulfillment_status = 'processing', payment_reference = $1, payment_method = 'moncash', updated_at = CURRENT_TIMESTAMP WHERE order_id = $2 AND seller_id = $3", [reference, orderId, session.seller_id]);
          await client.query("UPDATE stock_reservations SET status = 'confirmed' WHERE checkout_id = $1 AND seller_id = $2 AND status = 'active'", [pc.id, session.seller_id]);
          const balance = await client.query('SELECT SUM(price * quantity) AS gross FROM order_items WHERE order_id = $1 AND seller_id = $2', [orderId, session.seller_id]);
          const gross = Number(balance.rows[0]?.gross || 0) + Number((await client.query('SELECT delivery_fee FROM seller_fulfillments WHERE order_id = $1 AND seller_id = $2', [orderId, session.seller_id])).rows[0]?.delivery_fee || 0);
          const tier = await client.query('SELECT seller_tier FROM users WHERE id = $1', [session.seller_id]);
          const commission = Math.round(gross * getCommissionRate(tier.rows[0]?.seller_tier || 'none') * 100) / 100;
          await client.query("INSERT INTO order_escrow (order_id, seller_id, gross_amount, commission_amount, net_amount, status) VALUES ($1,$2,$3,$4,$5,'held') ON CONFLICT (order_id,seller_id) DO NOTHING", [orderId, session.seller_id, gross, commission, gross - commission]);
          // Aggregate status is derived from the agreement ledger: rejected
          // sellers do not invalidate paid siblings, but a proposed/accepted
          // unpaid agreement keeps the parent order partially paid.
          const outstanding = await client.query(
            `SELECT COUNT(*)::int AS count
             FROM pending_fulfillment_agreements a
             LEFT JOIN seller_fulfillments sf ON sf.order_id = $2 AND sf.seller_id = a.seller_id
             WHERE a.checkout_id = $1
               AND (a.status = 'proposed' OR (a.status = 'accepted' AND COALESCE(sf.payment_status, 'pending') <> 'verified'))`,
            [pc.id, orderId]
          );
          await client.query("UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2", [outstanding.rows[0].count === 0 ? 'paid' : 'partially_paid', orderId]);
          await logOrderEvent(orderId, 'payment_received', null, null, 'verified', `MonCash payment completed for seller ${session.seller_id}`, client);
          await client.query('COMMIT');
          createNotification(session.seller_id, 'payment_received', 'Payment confirmed', 'Your fulfillment is now active.', { orderId, sellerId: session.seller_id });
          createNotification(pc.user_id, 'payment_confirmed', 'Payment confirmed', 'One seller fulfillment is now active.', { orderId, sellerId: session.seller_id });
          return res.json({ received: true, orderId, fulfillmentSellerId: session.seller_id });
        } catch (err) {
          try { await client.query('ROLLBACK'); } catch {}
          console.error('Fulfillment payment webhook error:', err);
          return res.status(500).json({ error: 'Server error' });
        } finally { client.release(); }
      }
      const pendingCheck = await pool.query("SELECT * FROM pending_checkouts WHERE id = $1 AND status = 'pending'", [reference]);
      if (pendingCheck.rows.length > 0) {
        const pc = pendingCheck.rows[0]; const client2 = await pool.connect();
        try {
          await client2.query('BEGIN');
          if (eventId) await client2.query('INSERT INTO processed_events (id) VALUES ($1) ON CONFLICT DO NOTHING', [eventId]);
          const cartData = pc.cart_data;

          // Use cart_data prices (locked at checkout) — NOT DB prices
          let totalAmount = 0;
          for (const item of cartData) {
            const price = item.price || 0;
            totalAmount += price * (item.quantity || 1);
          }

          // Apply promo if present (also from cart snapshot)
          if (pc.promo_code) {
            try {
              const promoRes = await client2.query('SELECT discount_type, discount_value FROM promo_codes WHERE code = $1 AND is_active = true FOR UPDATE', [pc.promo_code]);
              if (promoRes.rows.length > 0) {
                const promo = promoRes.rows[0];
                const discount = promo.discount_type === 'percentage' ? totalAmount * (promo.discount_value / 100) : Math.min(promo.discount_value, totalAmount);
                totalAmount = Math.max(0, totalAmount - discount);
              }
            } catch { /* ignore */ }
          }

          const orderRes = await client2.query(
            `INSERT INTO orders (buyer_id, total_amount, status, payment_method, delivery_method, delivery_name, delivery_phone, delivery_address, delivery_city, delivery_note, meetup_lat, meetup_lng, meetup_address, meetup_name)
             VALUES ($1, $2, 'paid', 'moncash', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
            [pc.user_id, totalAmount, pc.delivery_method, pc.delivery_name, pc.delivery_phone, pc.delivery_address, pc.delivery_city, pc.delivery_note, pc.meetup_lat, pc.meetup_lng, pc.meetup_address, pc.meetup_name]
          );
          const orderId = orderRes.rows[0].id;

          // Create order_items with LOCKED prices from cart_data
          // Stock was already decremented at checkout creation — just confirm reservations
          const sellerIds = new Set();
          for (const item of cartData) {
            const productId = item.id || item.productId;
            const prodRes = await client2.query('SELECT seller_id FROM products WHERE id = $1 FOR UPDATE', [productId]);
            if (prodRes.rows.length > 0) {
              const sellerId = prodRes.rows[0].seller_id;
              sellerIds.add(sellerId);
              const lockedPrice = item.price || 0;
              const qty = item.quantity || 1;
              await client2.query(
                'INSERT INTO order_items (order_id, product_id, seller_id, quantity, price) VALUES ($1, $2, $3, $4, $5)',
                [orderId, productId, sellerId, qty, lockedPrice]
              );
              // Confirm the stock reservation (stock already decremented at checkout creation)
              await client2.query(
                "UPDATE stock_reservations SET status = 'confirmed' WHERE checkout_id = $1 AND product_id = $2 AND status = 'active'",
                [reference, productId]
              );
            }
          }

          // Escrow + platform revenue for each seller
          for (const sid of sellerIds) {
            const term = (pc.fulfillment_terms || []).find(item => item.sellerId === sid);
            const sellerItems = await client2.query(
              `SELECT SUM(quantity) AS total_qty, SUM(price * quantity) AS paid_total
               FROM order_items WHERE order_id = $1 AND seller_id = $2`,
              [orderId, sid]
            );
            if (sellerItems.rows.length > 0 && sellerItems.rows[0].paid_total) {
              const grossAmount = parseFloat(sellerItems.rows[0].paid_total);
              const tierRes = await client2.query('SELECT seller_tier FROM users WHERE id = $1', [sid]);
              const sellerTier = tierRes.rows[0]?.seller_tier || 'none';
              const rate = getCommissionRate(sellerTier);
              const commission = Math.round(grossAmount * rate * 100) / 100;
              const net = Math.round((grossAmount - commission) * 100) / 100;
              await client2.query(
                `INSERT INTO order_escrow (order_id, seller_id, gross_amount, commission_amount, net_amount, status) VALUES ($1, $2, $3, $4, $5, 'held') ON CONFLICT (order_id, seller_id) DO UPDATE SET gross_amount = $3, commission_amount = $4, net_amount = $5, status = 'held'`,
                [orderId, sid, grossAmount, commission, net]
              );
              await client2.query(
                `INSERT INTO platform_revenue (order_id, seller_id, seller_tier, gross_amount, commission_rate, commission_amount, platform_fee, net_to_seller) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [orderId, sid, sellerTier, grossAmount, rate, commission, commission, net]
              );
            }

            // Create seller_fulfillment per seller
            await client2.query(
              `INSERT INTO seller_fulfillments (order_id, seller_id, payment_status, fulfillment_status, payment_method, payment_reference, fulfillment_method, delivery_fee, fulfillment_lat, fulfillment_lng, fulfillment_address, fulfillment_note, agreement_status, buyer_accepted_at)
               VALUES ($1, $2, 'verified', 'pending', 'moncash', $3, $4, $5, $6, $7, $8, $9, 'proposed', CURRENT_TIMESTAMP)
               ON CONFLICT (order_id, seller_id) DO NOTHING`,
              [orderId, sid, reference, term?.method || pc.delivery_method, Number(term?.deliveryFee || 0), term?.location?.lat || null, term?.location?.lng || null, term?.location?.address || null, term?.location?.note || null]
            );
          }

          await client2.query("INSERT INTO order_events (order_id, event_type, note) VALUES ($1, 'payment_received', 'Payment completed via MonCash')", [orderId]);
          await client2.query("UPDATE pending_checkouts SET status = 'completed' WHERE id = $1", [reference]);
          await recordProductCooccurrences(orderId, client2);
          await client2.query('COMMIT');

          // Notify sellers (outside transaction)
          for (const sid of sellerIds) {
            createNotification(sid, 'escrow_held', 'Payment held in escrow', 'Released to you once the buyer confirms receipt.', { orderId });
          }
          createNotification(pc.user_id, 'payment_confirmed', 'Payment Confirmed', `Your payment of G ${totalAmount.toFixed(0)} was successful.`, { orderId });
          return res.json({ received: true, orderId });
        } catch (err) { await client2.query('ROLLBACK'); return res.status(500).json({ error: 'Server error' }); } finally { client2.release(); }
      }
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        if (eventId) await client.query('INSERT INTO processed_events (id) VALUES ($1) ON CONFLICT DO NOTHING', [eventId]);
        const updateResult = await client.query(`UPDATE orders SET status = 'paid', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'pending'`, [reference]);
        if (updateResult.rowCount === 0) { await client.query('ROLLBACK'); return res.json({ received: true, already_processed: true }); }
        await logOrderEvent(reference, 'payment_received', null, 'pending', 'paid', 'Payment completed via MonCash', client);
        await recordProductCooccurrences(reference, client);
        const orderItems = await client.query('SELECT product_id, quantity FROM order_items WHERE order_id = $1', [reference]);
        for (const oi of orderItems.rows) {
          const stockCheck = await client.query('SELECT stock FROM products WHERE id = $1 FOR UPDATE', [oi.product_id]);
          if (stockCheck.rows.length === 0 || stockCheck.rows[0].stock < oi.quantity) {
            await client.query('ROLLBACK');
            if (eventId) await pool.query('INSERT INTO processed_events (id) VALUES ($1) ON CONFLICT DO NOTHING', [eventId]);
            await pool.query("UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'pending'", [reference]);
            const orderFull = await pool.query('SELECT buyer_id FROM orders WHERE id = $1', [reference]);
            const buyerId = orderFull.rows[0]?.buyer_id;
            if (buyerId) { const buyerPhoneRes = await pool.query('SELECT phone FROM users WHERE id = $1', [buyerId]); const buyerPhone = buyerPhoneRes.rows[0]?.phone; const totalRes = await pool.query('SELECT total_amount FROM orders WHERE id = $1', [reference]); const refundAmount = parseFloat(totalRes.rows[0]?.total_amount || 0);
              if (refundAmount > 0 && buyerPhone) { try { const payoutRes = await fetch(process.env.MONCASH_PAYOUT_CREATE_URL || 'https://hvlmeoqyxaguzcujpmit.supabase.co/functions/v1/payout-create', { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.MCC_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: Math.round(refundAmount), moncashNumber: buyerPhone, referenceId: `stock_refund_${reference}` }), signal: AbortSignal.timeout(15000) }); if (payoutRes.ok) console.log(`[WEBHOOK] Stock refund G ${refundAmount} sent`); } catch {} }
              createNotification(buyerId, 'order_status', 'Payment Refunded', `Your order could not be fulfilled. G ${refundAmount.toFixed(0)} refunded.`, { orderId: reference }); }
            return res.status(200).json({ received: true, stock_issue: true, refunded: true });
          }
          await client.query('UPDATE products SET stock = stock - $1 WHERE id = $2', [oi.quantity, oi.product_id]);
          const stockRes = await client.query('SELECT stock, seller_id, name FROM products WHERE id = $1', [oi.product_id]);
          if (stockRes.rows.length > 0 && stockRes.rows[0].stock <= 0) createNotification(stockRes.rows[0].seller_id, 'product_sold_out', 'Product Sold Out', `"${stockRes.rows[0].name}" is now out of stock.`, { productId: oi.product_id });
        }
        const items = { rows: await getSellerPaymentAllocations(client, reference) };
        for (const item of items.rows) { if (item.seller_id) { const grossAmount = parseFloat(item.paid_total); const tierRes = await client.query('SELECT seller_tier FROM users WHERE id = $1', [item.seller_id]); const sellerTier = tierRes.rows[0]?.seller_tier || 'none'; const rate = getCommissionRate(sellerTier); const commission = Math.round(grossAmount * rate * 100) / 100; const net = Math.round((grossAmount - commission) * 100) / 100;
          await client.query(`INSERT INTO order_escrow (order_id, seller_id, gross_amount, commission_amount, net_amount, status) VALUES ($1, $2, $3, $4, $5, 'held') ON CONFLICT (order_id, seller_id) DO UPDATE SET gross_amount = $3, commission_amount = $4, net_amount = $5, status = 'held'`, [reference, item.seller_id, grossAmount, commission, net]);
          await client.query(`INSERT INTO platform_revenue (order_id, seller_id, seller_tier, gross_amount, commission_rate, commission_amount, platform_fee, net_to_seller) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [reference, item.seller_id, sellerTier, grossAmount, rate, commission, commission, net]);
          // Create seller_fulfillment per seller
          await client.query(
            `INSERT INTO seller_fulfillments (order_id, seller_id, payment_status, fulfillment_status, payment_method, payment_reference)
             VALUES ($1, $2, 'verified', 'pending', 'moncash', $3)
             ON CONFLICT (order_id, seller_id) DO NOTHING`,
            [reference, item.seller_id, reference]
          );
        } }
        await client.query('COMMIT'); client.release();
        const sellerIds = items.rows.map(r => r.seller_id).filter(Boolean);
        for (const sid of sellerIds) createNotification(sid, 'escrow_held', 'Payment held in escrow', 'Released to you once the buyer confirms.', { orderId: reference });
        const buyerOrder = await pool.query('SELECT buyer_id FROM orders WHERE id = $1', [reference]);
        if (buyerOrder.rows.length > 0) { const totalPaid = items.rows.reduce((sum, r) => sum + parseFloat(r.paid_total), 0); createNotification(buyerOrder.rows[0].buyer_id, 'payment_confirmed', 'Payment Confirmed', `Your payment of G ${totalPaid.toFixed(0)} was successful.`, { orderId: reference }); }
      } catch (e) { try { await client.query('ROLLBACK'); } catch {} client.release(); throw e; }
    } else if (event === 'payment.failed') {
      // Check if this is a pending checkout (not yet an order)
      const pendingFail = await pool.query("SELECT id, user_id FROM pending_checkouts WHERE id = $1 AND status = 'pending'", [reference]);
      if (pendingFail.rows.length > 0) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          if (eventId) await client.query('INSERT INTO processed_events (id) VALUES ($1) ON CONFLICT DO NOTHING', [eventId]);
          await client.query("UPDATE pending_checkouts SET status = 'failed' WHERE id = $1", [reference]);
          // Idempotent release: mark released first, then increment stock
          const released = await client.query(
            "UPDATE stock_reservations SET status = 'released', released_at = CURRENT_TIMESTAMP WHERE checkout_id = $1 AND status = 'active' RETURNING product_id, quantity",
            [reference]
          );
          for (const r of released.rows) {
            await client.query('UPDATE products SET stock = stock + $1 WHERE id = $2', [r.quantity, r.product_id]);
          }
          await client.query('COMMIT');
          createNotification(pendingFail.rows[0].user_id, 'payment_failed', 'Payment Failed', 'Your payment could not be processed. Please try again.', { orderId: reference });
        } catch (e) { try { await client.query('ROLLBACK'); } catch {} } finally { client.release(); }
      } else {
        // Existing order
        const client = await pool.connect();
        try { await client.query('BEGIN'); await client.query("UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'pending'", [reference]); await logOrderEvent(reference, 'status_change', null, 'pending', 'cancelled', 'Payment failed', client); await client.query('COMMIT'); } catch (e) { try { await client.query('ROLLBACK'); } catch {} } finally { client.release(); }
        const failedOrder = await pool.query('SELECT buyer_id FROM orders WHERE id = $1', [reference]);
        if (failedOrder.rows.length > 0) createNotification(failedOrder.rows[0].buyer_id, 'payment_failed', 'Payment Failed', 'Your payment could not be processed. Please try again.', { orderId: reference });
      }
    } else if (event === 'payout.completed') {
      const client = await pool.connect();
      try { await client.query('BEGIN'); if (eventId) { await client.query('INSERT INTO processed_events (id) VALUES ($1) ON CONFLICT DO NOTHING', [eventId]); } await client.query(`UPDATE payouts SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE moncash_reference = $1`, [reference]); await client.query('COMMIT'); } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    } else if (event === 'payout.failed') {
      const client = await pool.connect();
      try {
        await client.query('BEGIN'); if (eventId) await client.query('INSERT INTO processed_events (id) VALUES ($1) ON CONFLICT DO NOTHING', [eventId]);
        const payout = await client.query('SELECT seller_id, amount, status FROM payouts WHERE moncash_reference = $1 FOR UPDATE', [reference]);
        if (payout.rows.length > 0 && payout.rows[0].status !== 'failed') { const { seller_id, amount } = payout.rows[0]; await client.query('UPDATE seller_balances SET balance = balance + $1, total_paid_out = total_paid_out - $1, updated_at = CURRENT_TIMESTAMP WHERE seller_id = $2', [amount, seller_id]); }
        await client.query(`UPDATE payouts SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE moncash_reference = $1`, [reference]);
        await client.query('COMMIT');
        if (payout.rows.length > 0) createNotification(payout.rows[0].seller_id, 'payout_failed', 'Payout Failed', `Your payout of G ${parseFloat(payout.rows[0].amount).toFixed(0)} could not be processed.`, { payoutId: reference });
      } catch (e) { try { await client.query('ROLLBACK'); } catch {} } finally { client.release(); }
    }
    res.json({ received: true });
  } catch (err) { console.error('Webhook error:', err); res.status(500).json({ error: 'Server error' }); }
});

export default router;
