import { Router } from 'express';
import crypto from 'crypto';
import { pool } from '../config/database.js';
import { authRequired } from '../middleware/auth.js';
import { logOrderEvent, getCommissionRate, getSellerPaymentAllocations, reserveOrderStock, recordProductCooccurrences, settleSellerDebtPayment, populateSellerOrderSnapshot } from '../utils/helpers.js';
import { createNotification } from '../utils/notifications.js';
import { applyStockSideEffects } from '../utils/listingPolicy.js';

const router = Router();

async function recordUnmatchedPayment({ reference, eventId, event, note }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO unmatched_payments (reference, event_id, event_type, note)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (event_id) WHERE event_id IS NOT NULL DO NOTHING`,
      [reference, eventId || null, event || null, note || null]
    );
    if (eventId) {
      await client.query('INSERT INTO processed_events (id) VALUES ($1) ON CONFLICT DO NOTHING', [eventId]);
    }
    await client.query('COMMIT');
    console.error(`[WEBHOOK][UNMATCHED PAYMENT] ref=${reference} event=${eventId || 'n/a'} ${note || ''}`);
    return true;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('[WEBHOOK] Could not record unmatched payment:', error.message);
    return false;
  } finally {
    client.release();
  }
}

// Create MonCash payment
router.post('/api/payments/create', authRequired, async (req, res) => {
  const { orderId, returnUrl } = req.body;
  if (!orderId) return res.status(400).json({ error: 'orderId required' });
  let order;
  let referenceId;
  let attemptId;
  let expectedAmount;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const orderResult = await client.query('SELECT * FROM orders WHERE id = $1 AND buyer_id = $2 FOR UPDATE', [orderId, req.user.id]);
    if (orderResult.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Order not found' }); }
    order = orderResult.rows[0];
    if (order.status !== 'pending') { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Order is not pending' }); }
    const activeAttempt = await client.query(
      "SELECT reference_id, status FROM moncash_payment_attempts WHERE order_id = $1 AND status IN ('created', 'processing', 'unknown') ORDER BY created_at DESC LIMIT 1",
      [orderId]
    );
    if (activeAttempt.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'payment_attempt_unresolved', status: activeAttempt.rows[0].status, reference: activeAttempt.rows[0].reference_id });
    }
    referenceId = `${orderId}_${Date.now()}`;
    expectedAmount = Math.round(Number(order.total_amount));
    const attempt = await client.query(
      `INSERT INTO moncash_payment_attempts (order_id, reference_id, expected_amount, status)
       VALUES ($1, $2, $3, 'created') RETURNING id`,
      [orderId, referenceId, expectedAmount]
    );
    attemptId = attempt.rows[0].id;
    await client.query('UPDATE orders SET moncash_reference = $1 WHERE id = $2', [referenceId, orderId]);
    await client.query('COMMIT');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    if (err.code === '23505') return res.status(409).json({ error: 'payment_attempt_unresolved', message: 'An existing MonCash attempt must be reconciled before retrying.' });
    console.error('MonCash payment attempt setup error:', err);
    return res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }

  try {
    const moncashRes = await fetch(
      process.env.MONCASH_PAY_CREATE_URL || 'https://api.moncashconnect.com/v1/pay-create',
      { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.MCC_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: expectedAmount, referenceId,
          returnUrl: returnUrl?.startsWith('https://') ? returnUrl : `${process.env.PRODUCTION_URL || 'https://maurmaket.onrender.com'}/payment/return?order=${orderId}` }),
        signal: AbortSignal.timeout(15000) }
    );
    if (!moncashRes.ok) {
      const errorText = await moncashRes.text();
      const definitiveReject = moncashRes.status >= 400 && moncashRes.status < 500 && moncashRes.status !== 409;
      await pool.query(
        `UPDATE moncash_payment_attempts SET status = $1, error_message = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
        [definitiveReject ? 'failed' : 'unknown', `MonCashConnect returned ${moncashRes.status}: ${errorText}`.slice(0, 1000), attemptId]
      );
      if (moncashRes.status === 409) return res.status(409).json({ error: 'payment_attempt_unresolved', reference: referenceId });
      console.error(`MonCashConnect HTTP ${moncashRes.status}:`, errorText);
      return res.status(502).json({ error: definitiveReject ? 'Payment provider rejected the request' : 'Payment status is being checked; do not retry yet' });
    }
    const data = await moncashRes.json();
    if (!data.paymentUrl) {
      await pool.query("UPDATE moncash_payment_attempts SET status = 'unknown', error_message = 'Provider accepted request without payment URL', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [attemptId]);
      return res.status(202).json({ error: 'Payment request is unresolved; check its status before trying again' });
    }
    await pool.query(
      `UPDATE moncash_payment_attempts SET status = 'processing', provider_reference = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [data.reference || data.transactionId || null, attemptId]
    );
    return res.json({ paymentUrl: data.paymentUrl });
  } catch (err) {
    await pool.query(
      `UPDATE moncash_payment_attempts SET status = 'unknown', error_message = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [`Request outcome is unknown: ${err.message}`.slice(0, 1000), attemptId]
    );
    return res.status(202).json({ error: 'Payment request is unresolved; check its status before trying again' });
  }
});

// Payment status polling
router.get('/api/payments/:orderId/status', authRequired, async (req, res) => {
  try {
    const orderResult = await pool.query("SELECT id, status, moncash_reference FROM orders WHERE id = $1 AND buyer_id = $2", [req.params.orderId, req.user.id]);
    if (orderResult.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    const order = orderResult.rows[0];
    if (order.status !== 'pending') return res.json({ status: order.status });
    const referenceId = order.moncash_reference || order.id;
    const attemptResult = await pool.query(
      'SELECT id, expected_amount FROM moncash_payment_attempts WHERE reference_id = $1 OR provider_reference = $1 ORDER BY created_at DESC LIMIT 1',
      [referenceId]
    );
    try {
      const payStatusUrl = (process.env.MONCASH_PAY_CREATE_URL || 'https://api.moncashconnect.com/v1/pay-create').replace('pay-create', 'pay-status') + `?referenceId=${encodeURIComponent(referenceId)}`;
      const moncashRes = await fetch(payStatusUrl, { method: 'GET', headers: { 'Authorization': `Bearer ${process.env.MCC_KEY}` }, signal: AbortSignal.timeout(15000) });
      if (moncashRes.ok) {
        const data = await moncashRes.json();
        if (data.status === 'completed' || data.paid === true) {
          const paidAmount = Number(data.amount ?? data.totalAmount ?? data.paidAmount);
          const expectedAmount = Number(attemptResult.rows[0]?.expected_amount ?? 0);
          if (expectedAmount > 0 && Number.isFinite(paidAmount) && Math.round(paidAmount * 100) !== Math.round(expectedAmount * 100)) {
            await pool.query(
              `UPDATE moncash_payment_attempts SET status = 'unknown', error_message = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
              [`Provider amount ${paidAmount} did not match expected ${expectedAmount}; manual reconciliation required`, attemptResult.rows[0].id]
            );
            return res.status(409).json({ status: 'pending', error: 'Payment amount needs reconciliation' });
          }
          if (attemptResult.rows[0]) {
            await pool.query("UPDATE moncash_payment_attempts SET status = 'completed', error_message = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1", [attemptResult.rows[0].id]);
          }
          let fallbackProcessed = false;
          if (order.status === 'pending') {
            try {
              const client = await pool.connect();
              try {
                await client.query('BEGIN');
                const updateResult = await client.query(`UPDATE orders SET status = 'paid', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'pending'`, [order.id]);
                if (updateResult.rowCount === 0) { await client.query('ROLLBACK'); }
                else {
                  await client.query(`UPDATE message_offers SET status = 'redeemed', accepted_checkout_id = NULL WHERE accepted_checkout_id = $1 AND status = 'accepted'`, [order.id]);
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
                      const commissionBase = parseFloat(item.commission_base ?? grossAmount);
                      const commission = Math.round(commissionBase * rate * 100) / 100;
                      const collectionFee = parseFloat(item.collection_fee_amount || 0);
                      const net = Math.round((grossAmount - commission - collectionFee) * 100) / 100;
                      await client.query(`INSERT INTO order_escrow (order_id, seller_id, gross_amount, commission_base, collection_fee_amount, commission_amount, net_amount, status) VALUES ($1, $2, $3, $4, $5, $6, $7, 'held') ON CONFLICT (order_id, seller_id) DO UPDATE SET gross_amount = $3, commission_base = $4, collection_fee_amount = $5, commission_amount = $6, net_amount = $7, status = 'held'`, [order.id, item.seller_id, grossAmount, commissionBase, collectionFee, commission, net]);
                      await client.query(`INSERT INTO platform_revenue (order_id, seller_id, seller_tier, gross_amount, commission_base, collection_fee_amount, commission_rate, commission_amount, platform_fee, net_to_seller) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`, [order.id, item.seller_id, sellerTier, grossAmount, commissionBase, collectionFee, rate, commission, commission, net]);
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
          if (attemptResult.rows[0]) {
            await pool.query('UPDATE moncash_payment_attempts SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [data.status, attemptResult.rows[0].id]);
          }
          if (attemptResult.rows.length === 0) {
            await pool.query(`UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'pending'`, [order.id]);
            return res.json({ status: 'cancelled' });
          }
          return res.json({ status: 'failed' });
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
  const eventReference = reference;
  if (eventId) { const already = await pool.query('SELECT 1 FROM processed_events WHERE id = $1', [eventId]); if (already.rows.length > 0) return res.json({ received: true, idempotent: true }); }

  try {
    if (event === 'payment.completed') {
      if (reference && reference.startsWith('sub_')) return res.json({ received: true, skipped: 'subscription' });
      const debtPaymentResult = await pool.query(
        'SELECT * FROM seller_debt_payments WHERE reference_id = $1 OR provider_reference = $1 ORDER BY created_at DESC LIMIT 1',
        [eventReference]
      );
      if (debtPaymentResult.rows.length) {
        const payment = debtPaymentResult.rows[0];
        const paidAmount = Number(req.body.amount ?? req.body.totalAmount ?? req.body.paidAmount);
        if (!Number.isFinite(paidAmount) || Math.round(paidAmount) !== Math.round(Number(payment.charge_amount))) {
          await pool.query(
            `UPDATE seller_debt_payments SET status = 'unknown', error_message = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND status <> 'completed'`,
            [`Webhook amount ${Number.isFinite(paidAmount) ? paidAmount : 'missing'} did not match expected ${payment.charge_amount}`, payment.id]
          );
          await recordUnmatchedPayment({ reference: eventReference, eventId, event, note: `seller debt payment amount mismatch: expected ${payment.charge_amount}, received ${Number.isFinite(paidAmount) ? paidAmount : 'missing'}` });
          return res.status(202).json({ received: true, reconciliationRequired: true });
        }
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const settled = await settleSellerDebtPayment(client, payment.id, paidAmount);
          if (settled.status !== 'completed') {
            await client.query('ROLLBACK');
            return res.status(202).json({ received: true, reconciliationRequired: true });
          }
          if (eventId) await client.query('INSERT INTO processed_events (id) VALUES ($1) ON CONFLICT DO NOTHING', [eventId]);
          await client.query('COMMIT');
          if (!settled.alreadyCompleted) createNotification(settled.sellerId, 'seller_debt_paid', 'Debt payment confirmed', `MonCash confirmed G ${settled.amount.toFixed(2)} toward your outstanding seller fees.`, { paymentId: payment.id });
          return res.json({ received: true, debtPayment: 'completed' });
        } catch (debtError) {
          try { await client.query('ROLLBACK'); } catch {}
          throw debtError;
        } finally { client.release(); }
      }
      const natcashAccessPayment = await pool.query(
        'SELECT * FROM natcash_access_payments WHERE reference_id = $1 LIMIT 1', [eventReference]
      );
      if (natcashAccessPayment.rows.length) {
        const payment = natcashAccessPayment.rows[0];
        const paidAmount = Number(req.body.amount ?? req.body.totalAmount ?? req.body.paidAmount);
        if (!Number.isFinite(paidAmount) || Math.round(paidAmount * 100) !== Math.round(Number(payment.amount_htg) * 100)) {
          await pool.query(
            `UPDATE natcash_access_payments SET status = 'reconciliation_required', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'pending'`, [payment.id]
          );
          await recordUnmatchedPayment({ reference: eventReference, eventId, event, note: `NatCash access payment amount mismatch: expected ${payment.amount_htg}, received ${Number.isFinite(paidAmount) ? paidAmount : 'missing'}` });
          return res.status(202).json({ received: true, reconciliationRequired: true });
        }
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const lockedPayment = await client.query('SELECT * FROM natcash_access_payments WHERE id = $1 FOR UPDATE', [payment.id]);
          if (lockedPayment.rows[0]?.status === 'completed') {
            await client.query('ROLLBACK');
            return res.json({ received: true, idempotent: true });
          }
          const existing = await client.query(
            `SELECT id FROM natcash_access_subscriptions WHERE seller_id = $1 ORDER BY created_at DESC LIMIT 1 FOR UPDATE`, [payment.seller_id]
          );
          if (existing.rows[0]) {
            await client.query(
              `UPDATE natcash_access_subscriptions
               SET status = 'active', expires_at = GREATEST(expires_at, CURRENT_TIMESTAMP) + INTERVAL '30 days',
                   paused_at = NULL, last_payment_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [existing.rows[0].id]
            );
          } else {
            await client.query(
              `INSERT INTO natcash_access_subscriptions (seller_id, status, expires_at, last_payment_at)
               VALUES ($1, 'active', CURRENT_TIMESTAMP + INTERVAL '30 days', CURRENT_TIMESTAMP)`, [payment.seller_id]
            );
          }
          await client.query(
            `UPDATE natcash_access_payments SET status = 'completed', provider_payment_id = $2, paid_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [payment.id, eventId || null]
          );
          if (eventId) await client.query('INSERT INTO processed_events (id) VALUES ($1) ON CONFLICT DO NOTHING', [eventId]);
          await client.query('COMMIT');
          createNotification(payment.seller_id, 'natcash_access_renewed', 'NatCash access active', 'Your NatCash access is active for 30 days. New orders can now use NatCash.', {});
          return res.json({ received: true, natcashAccess: 'completed' });
        } catch (accessError) {
          try { await client.query('ROLLBACK'); } catch {}
          throw accessError;
        } finally { client.release(); }
      }
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
          const webhookAmount = Number(req.body.amount ?? req.body.totalAmount ?? req.body.paidAmount);
          if (Number.isFinite(webhookAmount) && Math.round(webhookAmount * 100) !== Math.round(Number(session.amount) * 100)) {
            await client.query('ROLLBACK');
            await recordUnmatchedPayment({ reference: eventReference, eventId, event, note: `payment amount ${webhookAmount} did not match expected session amount ${session.amount}` });
            return res.status(202).json({ received: true, reconciliationRequired: true });
          }
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
              `INSERT INTO orders (buyer_id, total_amount, status, payment_method, delivery_method, delivery_name, delivery_phone, delivery_address, delivery_city, delivery_note, meetup_lat, meetup_lng, meetup_address, meetup_name, meetup_scheduled_at)
               VALUES ($1, $2, 'partially_paid', 'moncash', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
              [pc.user_id, pc.total_amount, pc.delivery_method, pc.delivery_name, pc.delivery_phone, pc.delivery_address, pc.delivery_city, pc.delivery_note, pc.meetup_lat, pc.meetup_lng, pc.meetup_address, pc.meetup_name, pc.meetup_at]
            );
            orderId = createdOrder.rows[0].id;
            for (const item of pc.cart_data) {
              const product = await client.query('SELECT seller_id, name FROM products WHERE id = $1', [item.id || item.productId]);
              if (product.rows[0]) await client.query(
                `INSERT INTO order_items (order_id, product_id, seller_id, quantity, price, variant_id, variant_label, product_name, product_image)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [orderId, item.id || item.productId, product.rows[0].seller_id, item.quantity || 1, item.price || 0,
                 item.variantId || null, item.variantLabel || null,
                 item.product_name || product.rows[0].name, item.product_image || null]
              );
            }
            await populateSellerOrderSnapshot(client, orderId);
            const agreements = await client.query("SELECT * FROM pending_fulfillment_agreements WHERE checkout_id = $1 AND status = 'accepted' AND terms_locked_at IS NOT NULL", [pc.id]);
            for (const agreement of agreements.rows) {
              const term = agreement.terms;
              await client.query(
                `INSERT INTO seller_fulfillments (order_id, seller_id, payment_status, fulfillment_status, payment_method, fulfillment_method, delivery_fee, fulfillment_lat, fulfillment_lng, fulfillment_address, fulfillment_note, agreement_status, buyer_accepted_at, seller_accepted_at, terms_locked_at, meetup_at)
                 VALUES ($1, $2, 'pending', 'pending', 'moncash', $3, $4, $5, $6, $7, $8, 'locked', $9, $10, $11, $12) ON CONFLICT (order_id, seller_id) DO NOTHING`,
                [orderId, agreement.seller_id, term.method, Number(term.deliveryFee || 0), term.location?.lat || null, term.location?.lng || null, term.location?.address || null, term.location?.note || null, agreement.buyer_accepted_at, agreement.seller_accepted_at, agreement.terms_locked_at, term.meetupAt || null]
              );
            }
            await client.query('UPDATE fulfillment_payment_sessions SET order_id = $1 WHERE checkout_id = $2', [orderId, pc.id]);
          }
          // A later session can discover the order created by an earlier
          // session; persist that linkage in the same transaction.
          await client.query("UPDATE fulfillment_payment_sessions SET order_id = $1, status = 'completed', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $2", [orderId, session.id]);
          await client.query('UPDATE pending_checkouts SET order_id = $1 WHERE id = $2 AND order_id IS NULL', [orderId, pc.id]);
          await client.query("UPDATE seller_fulfillments SET payment_status = 'verified', fulfillment_status = 'processing', payment_reference = $1, payment_method = 'moncash', updated_at = CURRENT_TIMESTAMP WHERE order_id = $2 AND seller_id = $3", [reference, orderId, session.seller_id]);
          for (const item of pc.cart_data || []) {
            if (!item.acceptedOfferMessageId || item.seller_id !== session.seller_id) continue;
            await client.query(
              `UPDATE message_offers SET status = 'redeemed', accepted_checkout_id = NULL
               WHERE message_id = $1 AND buyer_id = $2 AND seller_id = $3
                 AND status = 'accepted' AND accepted_checkout_id = $4`,
              [item.acceptedOfferMessageId, pc.user_id, session.seller_id, pc.id]
            );
          }
          await client.query("UPDATE stock_reservations SET status = 'confirmed' WHERE checkout_id = $1 AND seller_id = $2 AND status = 'active'", [pc.id, session.seller_id]);
          const deliveryFee = Number((await client.query('SELECT delivery_fee FROM seller_fulfillments WHERE order_id = $1 AND seller_id = $2', [orderId, session.seller_id])).rows[0]?.delivery_fee || 0);
          const commissionBase = Math.max(0, Number(session.amount) - deliveryFee);
          const gross = commissionBase + deliveryFee;
          const collectionFee = Math.round(Number(session.amount) * 0.029 * 100) / 100;
          const tier = await client.query('SELECT seller_tier FROM users WHERE id = $1', [session.seller_id]);
          const sellerTier = tier.rows[0]?.seller_tier || 'none';
          const rate = getCommissionRate(sellerTier);
          const commission = Math.round(commissionBase * rate * 100) / 100;
          const net = Math.round((gross - commission - collectionFee) * 100) / 100;
          await client.query("INSERT INTO order_escrow (order_id, seller_id, gross_amount, commission_base, collection_fee_amount, commission_amount, net_amount, status) VALUES ($1,$2,$3,$4,$5,$6,$7,'held') ON CONFLICT (order_id,seller_id) DO NOTHING", [orderId, session.seller_id, gross, commissionBase, collectionFee, commission, net]);
          await client.query(
            `INSERT INTO platform_revenue (order_id, seller_id, seller_tier, gross_amount, commission_base, collection_fee_amount, commission_rate, commission_amount, platform_fee, net_to_seller)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,$9)`,
            [orderId, session.seller_id, sellerTier, gross, commissionBase, collectionFee, rate, commission, net]
          );
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
        const client2 = await pool.connect();
        try {
          await client2.query('BEGIN');
          // A repeated delivery may have passed the optimistic lookup above;
          // serialize by checkout and verify the state again inside the txn.
          const lockedCheckout = await client2.query(
            'SELECT * FROM pending_checkouts WHERE id = $1 FOR UPDATE',
            [reference]
          );
          if (!lockedCheckout.rows.length || lockedCheckout.rows[0].status !== 'pending') {
            await client2.query('ROLLBACK');
            return res.json({ received: true, already_processed: true });
          }
          const pc = lockedCheckout.rows[0];
          if (eventId) await client2.query('INSERT INTO processed_events (id) VALUES ($1) ON CONFLICT DO NOTHING', [eventId]);
          const cartData = pc.cart_data;

          // Use cart_data prices (locked at checkout) — NOT DB prices
          let merchandiseSubtotal = 0;
          for (const item of cartData) {
            const price = item.price || 0;
            merchandiseSubtotal += price * (item.quantity || 1);
          }
          let merchandisePaid = merchandiseSubtotal;

          // Apply promo if present (also from cart snapshot)
          if (pc.promo_code) {
            try {
              const promoRes = await client2.query('SELECT discount_type, discount_value FROM promo_codes WHERE code = $1 AND is_active = true FOR UPDATE', [pc.promo_code]);
              if (promoRes.rows.length > 0) {
                const promo = promoRes.rows[0];
                const discount = promo.discount_type === 'percentage' ? Math.min(merchandiseSubtotal * (promo.discount_value / 100), promo.discount_value * 10) : Math.min(promo.discount_value, merchandiseSubtotal);
                merchandisePaid = Math.max(0, merchandiseSubtotal - discount);
              }
            } catch { /* ignore */ }
          }
          const deliveryTotal = (pc.fulfillment_terms || []).reduce((sum, term) => sum + Number(term.deliveryFee || 0), 0);
          const totalAmount = Number(pc.total_amount || (merchandisePaid + deliveryTotal));
          const collectionFeeTotal = Math.round(totalAmount * 0.029 * 100) / 100;
          let collectionFeeAllocated = 0;

          const orderRes = await client2.query(
            `INSERT INTO orders (buyer_id, total_amount, status, payment_method, delivery_method, delivery_name, delivery_phone, delivery_address, delivery_city, delivery_note, meetup_lat, meetup_lng, meetup_address, meetup_name, meetup_scheduled_at)
             VALUES ($1, $2, 'paid', 'moncash', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
            [pc.user_id, totalAmount, pc.delivery_method, pc.delivery_name, pc.delivery_phone, pc.delivery_address, pc.delivery_city, pc.delivery_note, pc.meetup_lat, pc.meetup_lng, pc.meetup_address, pc.meetup_name, pc.meetup_at]
          );
          const orderId = orderRes.rows[0].id;

          // Create order_items with LOCKED prices from cart_data
          // Stock was already decremented at checkout creation — just confirm reservations
          const sellerIds = new Set();
          for (const item of cartData) {
            const productId = item.id || item.productId;
            const prodRes = await client2.query('SELECT seller_id, name FROM products WHERE id = $1 FOR UPDATE', [productId]);
            if (prodRes.rows.length > 0) {
              const sellerId = prodRes.rows[0].seller_id;
              sellerIds.add(sellerId);
              const lockedPrice = item.price || 0;
              const qty = item.quantity || 1;
              await client2.query(
                `INSERT INTO order_items (order_id, product_id, seller_id, quantity, price, variant_id, variant_label, product_name, product_image)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [orderId, productId, sellerId, qty, lockedPrice,
                 item.variantId || null, item.variantLabel || null,
                 item.product_name || prodRes.rows[0].name, item.product_image || null]
              );
              // Confirm the stock reservation (stock already decremented at checkout creation)
              await client2.query(
                `UPDATE stock_reservations SET status = 'confirmed', order_id = $3, checkout_id = NULL
                 WHERE checkout_id = $1 AND product_id = $2 AND status = 'active'`,
                [reference, productId, orderId]
              );
            }
          }
          await populateSellerOrderSnapshot(client2, orderId);

          // Escrow + platform revenue for each seller
          for (const sid of [...sellerIds].sort()) {
            const term = (pc.fulfillment_terms || []).find(item => item.sellerId === sid);
            const sellerItems = await client2.query(
              `SELECT SUM(quantity) AS total_qty, SUM(price * quantity) AS paid_total
               FROM order_items WHERE order_id = $1 AND seller_id = $2`,
              [orderId, sid]
            );
            if (sellerItems.rows.length > 0 && sellerItems.rows[0].paid_total) {
              const sellerSubtotal = parseFloat(sellerItems.rows[0].paid_total);
              const sellerIndex = [...sellerIds].sort().indexOf(sid);
              const sortedSellers = [...sellerIds].sort();
              const allocatedBefore = await client2.query(
                `SELECT COALESCE(SUM(commission_base), 0) AS allocated
                 FROM order_escrow WHERE order_id = $1`, [orderId]
              );
              const commissionBase = sellerIndex === sortedSellers.length - 1
                ? Math.max(0, Math.round((merchandisePaid - Number(allocatedBefore.rows[0]?.allocated || 0)) * 100) / 100)
                : Math.round((merchandisePaid * sellerSubtotal / Math.max(merchandiseSubtotal, 1)) * 100) / 100;
              const grossAmount = commissionBase + Number(term?.deliveryFee || 0);
              const collectionFeeAmount = sellerIndex === sortedSellers.length - 1
                ? Math.max(0, Math.round((collectionFeeTotal - collectionFeeAllocated) * 100) / 100)
                : Math.round((collectionFeeTotal * grossAmount / Math.max(totalAmount, 1)) * 100) / 100;
              collectionFeeAllocated += collectionFeeAmount;
              const tierRes = await client2.query('SELECT seller_tier FROM users WHERE id = $1', [sid]);
              const sellerTier = tierRes.rows[0]?.seller_tier || 'none';
              const rate = getCommissionRate(sellerTier);
              const commission = Math.round(commissionBase * rate * 100) / 100;
              const net = Math.round((grossAmount - commission - collectionFeeAmount) * 100) / 100;
              await client2.query(
                `INSERT INTO order_escrow (order_id, seller_id, gross_amount, commission_base, collection_fee_amount, commission_amount, net_amount, status) VALUES ($1, $2, $3, $4, $5, $6, $7, 'held') ON CONFLICT (order_id, seller_id) DO UPDATE SET gross_amount = $3, commission_base = $4, collection_fee_amount = $5, commission_amount = $6, net_amount = $7, status = 'held'`,
                [orderId, sid, grossAmount, commissionBase, collectionFeeAmount, commission, net]
              );
              await client2.query(
                `INSERT INTO platform_revenue (order_id, seller_id, seller_tier, gross_amount, commission_base, collection_fee_amount, commission_rate, commission_amount, platform_fee, net_to_seller) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                [orderId, sid, sellerTier, grossAmount, commissionBase, collectionFeeAmount, rate, commission, commission, net]
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
          await client2.query("UPDATE pending_checkouts SET status = 'completed', order_id = $2 WHERE id = $1", [reference, orderId]);
          await client2.query(
            `UPDATE message_offers SET status = 'redeemed', accepted_checkout_id = NULL
             WHERE accepted_checkout_id = $1 AND status = 'accepted'`, [pc.id]
          );
          await recordProductCooccurrences(orderId, client2);
          await client2.query('COMMIT');

          // Notify sellers (outside transaction)
          for (const sid of sellerIds) {
            createNotification(sid, 'escrow_held', 'Payment held in escrow', 'Released to you once the buyer confirms receipt.', { orderId });
          }
          createNotification(pc.user_id, 'payment_confirmed', 'Payment Confirmed', `Your payment of G ${totalAmount.toFixed(0)} was successful.`, { orderId });
          return res.json({ received: true, orderId });
        } catch (err) {
          try { await client2.query('ROLLBACK'); } catch {}
          console.error('Pending checkout payment webhook error:', err);
          return res.status(500).json({ error: 'Server error' });
        } finally { client2.release(); }
      }
      const paymentAttemptResult = await pool.query(
        'SELECT * FROM moncash_payment_attempts WHERE reference_id = $1 OR provider_reference = $1 ORDER BY created_at DESC LIMIT 1',
        [eventReference]
      );
      const paymentAttempt = paymentAttemptResult.rows[0] || null;
      if (paymentAttempt) {
        const paidAmount = Number(req.body.amount ?? req.body.totalAmount ?? req.body.paidAmount);
        if (Number.isFinite(paidAmount) && Math.round(paidAmount * 100) !== Math.round(Number(paymentAttempt.expected_amount) * 100)) {
          await pool.query(
            `UPDATE moncash_payment_attempts SET status = 'unknown', error_message = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
            [`Webhook amount ${paidAmount} did not match expected ${paymentAttempt.expected_amount}`, paymentAttempt.id]
          );
          await recordUnmatchedPayment({ reference: eventReference, eventId, event, note: 'provider payment amount did not match the saved order attempt' });
          return res.status(202).json({ received: true, reconciliationRequired: true });
        }
        reference = paymentAttempt.order_id;
      }
      const client = await pool.connect();
      let clientReleased = false;
      const releaseClient = () => {
        if (!clientReleased) {
          clientReleased = true;
          client.release();
        }
      };
      try {
        await client.query('BEGIN');
        if (eventId) await client.query('INSERT INTO processed_events (id) VALUES ($1) ON CONFLICT DO NOTHING', [eventId]);
        const updateResult = await client.query(`UPDATE orders SET status = 'paid', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'pending'`, [reference]);
        if (updateResult.rowCount === 0) {
          let knownOrder = null;
          try { knownOrder = (await client.query('SELECT status FROM orders WHERE id = $1', [reference])).rows[0] || null; } catch {}
          await client.query('ROLLBACK');
          releaseClient();
          if (!knownOrder || ['cancelled', 'refunded'].includes(knownOrder.status)) {
            let checkoutStatus = null;
            try {
              checkoutStatus = (await pool.query('SELECT status FROM pending_checkouts WHERE id = $1', [reference])).rows[0]?.status || null;
            } catch {}
            // A completed checkout already materialized its order under a
            // different id. Treat later provider deliveries as idempotent.
            if (!knownOrder && checkoutStatus === 'completed') {
              if (eventId) await pool.query('INSERT INTO processed_events (id) VALUES ($1) ON CONFLICT DO NOTHING', [eventId]);
              return res.json({ received: true, already_processed: true });
            }
            const note = knownOrder
              ? `payment arrived for order with status '${knownOrder.status}'`
              : checkoutStatus
                ? `checkout status was '${checkoutStatus}'`
                : 'no matching checkout, fulfillment session, or order';
            const recorded = await recordUnmatchedPayment({ reference, eventId, event, note });
            if (!recorded) return res.status(500).json({ error: 'Payment reconciliation record failed' });
            return res.json({ received: true, already_processed: true, unmatchedPayment: true });
          }
          return res.json({ received: true, already_processed: true });
        }
        await client.query(`UPDATE message_offers SET status = 'redeemed', accepted_checkout_id = NULL WHERE accepted_checkout_id = $1 AND status = 'accepted'`, [reference]);
        if (paymentAttempt) {
          await client.query("UPDATE moncash_payment_attempts SET status = 'completed', error_message = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1", [paymentAttempt.id]);
        }
        await logOrderEvent(reference, 'payment_received', null, 'pending', 'paid', 'Payment completed via MonCash', client);
        await recordProductCooccurrences(reference, client);
        const orderItems = await client.query('SELECT product_id, quantity, variant_id FROM order_items WHERE order_id = $1', [reference]);
        const stockTouched = new Set();
        for (const oi of orderItems.rows) {
          const stockCheck = await client.query('SELECT stock FROM products WHERE id = $1 FOR UPDATE', [oi.product_id]);
          let shortStock = stockCheck.rows.length === 0 || stockCheck.rows[0].stock < oi.quantity;
          if (!shortStock && oi.variant_id) {
            const variantCheck = await client.query('SELECT stock FROM product_variants WHERE id = $1 FOR UPDATE', [oi.variant_id]);
            shortStock = variantCheck.rows.length === 0 || variantCheck.rows[0].stock < oi.quantity;
          }
          if (shortStock) {
            await client.query('ROLLBACK');
            releaseClient();
            await pool.query("UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'pending'", [reference]);
            const orderFull = await pool.query('SELECT buyer_id FROM orders WHERE id = $1', [reference]);
            const buyerId = orderFull.rows[0]?.buyer_id;
            let refundQueued = false;
            let manualRefundRequired = false;
            if (buyerId) {
              const totalRes = await pool.query('SELECT total_amount FROM orders WHERE id = $1', [reference]);
              const refundAmount = parseFloat(totalRes.rows[0]?.total_amount || 0);
              if (refundAmount > 0) {
                const refundFee = Math.round(refundAmount * 0.05 * 100) / 100;
                const queued = await pool.query(
                  `INSERT INTO refund_payouts (order_id, buyer_id, amount, fee_amount, receiver_phone, moncash_reference, reason, cause, destination_verified)
                   VALUES ($1, $2, $3, $4, '', $5, $6, 'maurmaket', false) ON CONFLICT (moncash_reference) DO NOTHING
                   RETURNING id`,
                  [reference, buyerId, refundAmount, refundFee, `stock_refund_${reference}`, 'Automatic refund because the paid order could not be fulfilled']
                );
                refundQueued = queued.rows.length > 0;
                if (!refundQueued) {
                  const existingRefund = await pool.query("SELECT status FROM refund_payouts WHERE order_id = $1 AND status IN ('pending', 'processing') ORDER BY created_at DESC LIMIT 1", [reference]);
                  refundQueued = existingRefund.rows.length > 0;
                }
                manualRefundRequired = true;
                console.error(`[WEBHOOK][REFUND DESTINATION REVIEW] order=${reference} buyer=${buyerId} amount=${refundAmount}`);
                createNotification(buyerId, 'order_status', 'Refund request under review', `Your order could not be fulfilled. Support is confirming the MonCash refund destination for G ${refundAmount.toFixed(2)}.`, { orderId: reference });
              }
            }
            if (eventId) await pool.query('INSERT INTO processed_events (id) VALUES ($1) ON CONFLICT DO NOTHING', [eventId]);
            return res.status(200).json({ received: true, stock_issue: true, refundQueued, manualRefundRequired });
          }
          await client.query('UPDATE products SET stock = stock - $1 WHERE id = $2', [oi.quantity, oi.product_id]);
          if (oi.variant_id) await client.query('UPDATE product_variants SET stock = stock - $1 WHERE id = $2', [oi.quantity, oi.variant_id]);
          stockTouched.add(oi.product_id);
        }
        for (const pid of stockTouched) {
          try { await applyStockSideEffects(pid, client); } catch (e) { console.error('Stock side effects error:', e.message); }
        }
        const items = { rows: await getSellerPaymentAllocations(client, reference) };
        for (const item of items.rows) { if (item.seller_id) { const grossAmount = parseFloat(item.paid_total); const commissionBase = parseFloat(item.commission_base ?? grossAmount); const collectionFee = parseFloat(item.collection_fee_amount || 0); const tierRes = await client.query('SELECT seller_tier FROM users WHERE id = $1', [item.seller_id]); const sellerTier = tierRes.rows[0]?.seller_tier || 'none'; const rate = getCommissionRate(sellerTier); const commission = Math.round(commissionBase * rate * 100) / 100; const net = Math.round((grossAmount - commission - collectionFee) * 100) / 100;
          await client.query(`INSERT INTO order_escrow (order_id, seller_id, gross_amount, commission_base, collection_fee_amount, commission_amount, net_amount, status) VALUES ($1, $2, $3, $4, $5, $6, $7, 'held') ON CONFLICT (order_id, seller_id) DO UPDATE SET gross_amount = $3, commission_base = $4, collection_fee_amount = $5, commission_amount = $6, net_amount = $7, status = 'held'`, [reference, item.seller_id, grossAmount, commissionBase, collectionFee, commission, net]);
          await client.query(`INSERT INTO platform_revenue (order_id, seller_id, seller_tier, gross_amount, commission_base, collection_fee_amount, commission_rate, commission_amount, platform_fee, net_to_seller) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`, [reference, item.seller_id, sellerTier, grossAmount, commissionBase, collectionFee, rate, commission, commission, net]);
          // Create seller_fulfillment per seller
          await client.query(
            `INSERT INTO seller_fulfillments (order_id, seller_id, payment_status, fulfillment_status, payment_method, payment_reference)
             VALUES ($1, $2, 'verified', 'pending', 'moncash', $3)
             ON CONFLICT (order_id, seller_id) DO NOTHING`,
            [reference, item.seller_id, reference]
          );
        } }
        await client.query('COMMIT');
        releaseClient();
        const sellerIds = items.rows.map(r => r.seller_id).filter(Boolean);
        for (const sid of sellerIds) createNotification(sid, 'escrow_held', 'Payment held in escrow', 'Released to you once the buyer confirms.', { orderId: reference });
        const buyerOrder = await pool.query('SELECT buyer_id FROM orders WHERE id = $1', [reference]);
        if (buyerOrder.rows.length > 0) { const totalPaid = items.rows.reduce((sum, r) => sum + parseFloat(r.paid_total), 0); createNotification(buyerOrder.rows[0].buyer_id, 'payment_confirmed', 'Payment Confirmed', `Your payment of G ${totalPaid.toFixed(0)} was successful.`, { orderId: reference }); }
      } catch (e) {
        if (!clientReleased) {
          try { await client.query('ROLLBACK'); } catch {}
        }
        releaseClient();
        throw e;
      }
    } else if (event === 'payment.failed') {
      const failedAttemptResult = await pool.query(
        'SELECT * FROM moncash_payment_attempts WHERE reference_id = $1 OR provider_reference = $1 ORDER BY created_at DESC LIMIT 1',
        [eventReference]
      );
      const failedAttempt = failedAttemptResult.rows[0] || null;
      if (failedAttempt) reference = failedAttempt.order_id;
      // Check if this is a pending checkout (not yet an order)
      const pendingFail = await pool.query("SELECT id, user_id FROM pending_checkouts WHERE id = $1 AND status = 'pending'", [reference]);
      if (pendingFail.rows.length > 0) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          if (eventId) await client.query('INSERT INTO processed_events (id) VALUES ($1) ON CONFLICT DO NOTHING', [eventId]);
          await client.query("UPDATE pending_checkouts SET status = 'failed' WHERE id = $1", [reference]);
          await client.query("UPDATE message_offers SET accepted_checkout_id = NULL WHERE accepted_checkout_id = $1 AND status = 'accepted'", [reference]);
          // Idempotent release: mark released first, then increment stock
          const released = await client.query(
            "UPDATE stock_reservations SET status = 'released', released_at = CURRENT_TIMESTAMP WHERE checkout_id = $1 AND status = 'active' RETURNING product_id, quantity, variant_id",
            [reference]
          );
          for (const r of released.rows) {
            await client.query('UPDATE products SET stock = stock + $1 WHERE id = $2', [r.quantity, r.product_id]);
            if (r.variant_id) await client.query('UPDATE product_variants SET stock = stock + $1 WHERE id = $2', [r.quantity, r.variant_id]);
          }
          await client.query('COMMIT');
          createNotification(pendingFail.rows[0].user_id, 'payment_failed', 'Payment Failed', 'Your payment could not be processed. Please try again.', { orderId: reference });
        } catch (e) { try { await client.query('ROLLBACK'); } catch {} } finally { client.release(); }
      } else {
        // Existing order
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          if (failedAttempt) {
            await client.query("UPDATE moncash_payment_attempts SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND status <> 'completed'", [failedAttempt.id]);
          } else {
            await client.query("UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'pending'", [reference]);
            await client.query("UPDATE message_offers SET accepted_checkout_id = NULL WHERE accepted_checkout_id = $1 AND status = 'accepted'", [reference]);
            await logOrderEvent(reference, 'status_change', null, 'pending', 'cancelled', 'Payment failed', client);
          }
          await client.query('COMMIT');
        } catch (e) { try { await client.query('ROLLBACK'); } catch {} } finally { client.release(); }
        const failedOrder = await pool.query('SELECT buyer_id FROM orders WHERE id = $1', [reference]);
        if (failedOrder.rows.length > 0) createNotification(failedOrder.rows[0].buyer_id, 'payment_failed', 'Payment Failed', 'Your payment could not be processed. Please try again.', { orderId: reference });
      }
    } else if (event === 'payout.completed') {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const webhookAmount = Number(req.body.amount ?? req.body.totalAmount ?? req.body.paidAmount);
        if (Number.isFinite(webhookAmount)) {
          const sellerPayout = await client.query(`SELECT amount FROM payouts WHERE status = 'processing' AND (provider_reference = $1 OR moncash_reference = $1 OR id::text = $1) FOR UPDATE`, [reference]);
          const platformPayout = await client.query(`SELECT amount FROM platform_payouts WHERE status = 'processing' AND (provider_reference = $1 OR moncash_reference = $1 OR id::text = $1) FOR UPDATE`, [reference]);
          const refundPayout = await client.query(`SELECT amount FROM refund_payouts WHERE status = 'processing' AND (provider_reference = $1 OR moncash_reference = $1 OR id::text = $1) FOR UPDATE`, [reference]);
          const expected = [...sellerPayout.rows, ...platformPayout.rows, ...refundPayout.rows].map(row => Number(row.amount));
          // MCC payout amounts are whole gourdes; compare against the exact
          // amount sent to its API, while preserving cents in the audit ledger.
          if (expected.some(amount => Math.round(amount) !== Math.round(webhookAmount))) {
            await client.query('ROLLBACK');
            await recordUnmatchedPayment({ reference, eventId, event, note: `payout amount ${webhookAmount} did not match saved amount(s) ${expected.join(', ')}` });
            return res.status(202).json({ received: true, reconciliationRequired: true });
          }
        }
        if (eventId) await client.query('INSERT INTO processed_events (id) VALUES ($1) ON CONFLICT DO NOTHING', [eventId]);
        const paidPayouts = await client.query(
          `UPDATE payouts SET status = 'completed', settlement_confirmed = true, error_message = NULL, updated_at = CURRENT_TIMESTAMP
           WHERE status = 'processing' AND (provider_reference = $1 OR moncash_reference = $1 OR id::text = $1)
           RETURNING seller_id, amount`,
          [reference]
        );
        for (const row of paidPayouts.rows) {
          await client.query('UPDATE seller_balances SET total_paid_out = total_paid_out + $1, updated_at = CURRENT_TIMESTAMP WHERE seller_id = $2', [row.amount, row.seller_id]);
        }
        await client.query(
          `UPDATE platform_payouts SET status = 'completed', settlement_confirmed = true, error_message = NULL, updated_at = CURRENT_TIMESTAMP
           WHERE status = 'processing' AND (provider_reference = $1 OR moncash_reference = $1 OR id::text = $1)`,
          [reference]
        );
        const refund = await client.query(
          `UPDATE refund_payouts SET status = 'completed', settlement_confirmed = true, error_message = NULL, updated_at = CURRENT_TIMESTAMP
           WHERE status = 'processing' AND (provider_reference = $1 OR moncash_reference = $1 OR id::text = $1)
           RETURNING buyer_id, amount, order_id, refunded_seller_id`,
          [reference]
        );
        for (const row of refund.rows) {
          await client.query(
            `UPDATE disputes SET status = 'resolved', resolution = 'MonCash confirmed the refund transfer', updated_at = CURRENT_TIMESTAMP
             WHERE order_id = $1 AND reason = 'refund_request' AND status IN ('open', 'under_review')
               AND ($2::uuid IS NULL OR seller_id = $2)`,
            [row.order_id, row.refunded_seller_id]
          );
        }
        await client.query('COMMIT');
        for (const row of refund.rows) createNotification(row.buyer_id, 'order_status', 'Refund sent',
          `MonCash confirmed your refund of G ${Number(row.amount).toFixed(2)}.`, { orderId: row.order_id });
      } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    } else if (event === 'payout.failed') {
      const client = await pool.connect();
      try {
        await client.query('BEGIN'); if (eventId) await client.query('INSERT INTO processed_events (id) VALUES ($1) ON CONFLICT DO NOTHING', [eventId]);
        const payout = await client.query('SELECT id, seller_id, amount, fee_amount, total_debit, status FROM payouts WHERE provider_reference = $1 OR moncash_reference = $1 OR id::text = $1 FOR UPDATE', [reference]);
        if (payout.rows.length > 0 && payout.rows[0].status === 'processing') {
          const row = payout.rows[0];
          await client.query(
            'UPDATE seller_balances SET balance = balance + $1, updated_at = CURRENT_TIMESTAMP WHERE seller_id = $2',
            [Number(row.total_debit || Number(row.amount) + Number(row.fee_amount || 0)), row.seller_id]
          );
          await client.query(`UPDATE payouts SET status = 'failed', error_message = 'MonCash confirmed the payout failed', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [row.id]);
        }
        await client.query(
          `UPDATE platform_payouts SET status = 'failed', error_message = 'MonCash confirmed the platform transfer failed', updated_at = CURRENT_TIMESTAMP
           WHERE status = 'processing' AND (provider_reference = $1 OR moncash_reference = $1 OR id::text = $1)`,
          [reference]
        );
        const failedRefunds = await client.query(
          `UPDATE refund_payouts SET status = 'failed', error_message = 'MonCash confirmed the refund failed',
             next_attempt_at = CURRENT_TIMESTAMP + INTERVAL '5 minutes', updated_at = CURRENT_TIMESTAMP
           WHERE status = 'processing' AND (provider_reference = $1 OR moncash_reference = $1 OR id::text = $1)
           RETURNING buyer_id, amount, order_id`,
          [reference]
        );
        const failedDebtPayments = await client.query(
          `UPDATE seller_debt_payments SET status = 'failed', settlement_confirmed = true,
             error_message = 'MonCash confirmed the debt payment failed', updated_at = CURRENT_TIMESTAMP
           WHERE status IN ('created','processing','unknown')
             AND (provider_reference = $1 OR reference_id = $1)
           RETURNING seller_id, id` ,
          [reference]
        );
        await client.query('COMMIT');
        if (payout.rows.length > 0) createNotification(payout.rows[0].seller_id, 'payout_failed', 'Payout Failed', `MonCash confirmed that your payout of G ${parseFloat(payout.rows[0].amount).toFixed(2)} failed. The reserved amount has been returned to your balance.`, { payoutId: payout.rows[0].id });
        for (const row of failedRefunds.rows) createNotification(row.buyer_id, 'order_status', 'Refund needs support', `MonCash could not complete your G ${Number(row.amount).toFixed(2)} refund. Support will review the transfer.`, { orderId: row.order_id });
        for (const row of failedDebtPayments.rows) createNotification(row.seller_id, 'seller_debt_payment', 'Debt payment failed', 'MonCash confirmed that your payment did not complete. Your outstanding balance is unchanged.', { paymentId: row.id });
      } catch (e) { try { await client.query('ROLLBACK'); } catch {} } finally { client.release(); }
    }
    res.json({ received: true });
  } catch (err) { console.error('Webhook error:', err); res.status(500).json({ error: 'Server error' }); }
});

export default router;
