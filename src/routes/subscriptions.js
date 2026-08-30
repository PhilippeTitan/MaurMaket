import { Router } from 'express';
import crypto from 'crypto';
import { pool } from '../config/database.js';
import { authRequired } from '../middleware/auth.js';
import { createNotification } from '../utils/notifications.js';

const router = Router();

function sellerRequired(req, res, next) {
  if (req.user.role !== 'seller') return res.status(403).json({ error: 'Seller access required' });
  next();
}

// Create subscription
router.post('/api/subscriptions/create', authRequired, sellerRequired, async (req, res) => {
  try {
    const existing = await pool.query(
      `SELECT id, status, expires_at FROM seller_subscriptions WHERE seller_id = $1 AND status IN ('active', 'past_due') ORDER BY expires_at DESC LIMIT 1`,
      [req.user.id]
    );
    if (existing.rows.length > 0) {
      const sub = existing.rows[0];
      if (sub.status === 'active' && new Date(sub.expires_at) > new Date()) {
        return res.status(400).json({ error: 'Active subscription already exists', expiresAt: sub.expires_at });
      }
    }
    const orderId = `sub_${req.user.id}_${Date.now()}`;
    await pool.query(`INSERT INTO orders (id, buyer_id, total_amount, status) VALUES ($1, $2, 2500, 'pending') ON CONFLICT (id) DO NOTHING`, [orderId, req.user.id]);
    const payUrl = process.env.MONCASH_PAY_CREATE_URL || 'https://hvlmeoqyxaguzcujpmit.supabase.co/functions/v1/pay-create';
    const mccRes = await fetch(payUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.MCC_KEY || ''}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 2500, referenceId: orderId, returnUrl: `${process.env.PRODUCTION_URL || 'https://maurmaket.onrender.com'}/payment/return` }),
      signal: AbortSignal.timeout(15000),
    });
    const payData = await mccRes.json();
    if (!mccRes.ok || !payData.paymentUrl) return res.status(500).json({ error: 'Payment creation failed' });
    res.json({ paymentUrl: payData.paymentUrl, orderId });
  } catch (err) { console.error('Subscription create error:', err); res.status(500).json({ error: 'Server error' }); }
});

// Current subscription
router.get('/api/subscriptions/current', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM seller_subscriptions WHERE seller_id = $1 AND status IN ('active', 'past_due') ORDER BY expires_at DESC LIMIT 1`,
      [req.user.id]
    );
    res.json({ subscription: result.rows[0] || null });
  } catch (err) { console.error('Subscription fetch error:', err); res.status(500).json({ error: 'Server error' }); }
});

// Renew subscription
router.post('/api/subscriptions/renew', authRequired, sellerRequired, async (req, res) => {
  try {
    const orderId = `sub_renew_${req.user.id}_${Date.now()}`;
    await pool.query(`INSERT INTO orders (id, buyer_id, total_amount, status) VALUES ($1, $2, 2500, 'pending') ON CONFLICT (id) DO NOTHING`, [orderId, req.user.id]);
    const payUrl = process.env.MONCASH_PAY_CREATE_URL || 'https://hvlmeoqyxaguzcujpmit.supabase.co/functions/v1/pay-create';
    const mccRes = await fetch(payUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.MCC_KEY || ''}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 2500, referenceId: orderId, returnUrl: `${process.env.PRODUCTION_URL || 'https://maurmaket.onrender.com'}/payment/return` }),
      signal: AbortSignal.timeout(15000),
    });
    const payData = await mccRes.json();
    if (!mccRes.ok || !payData.paymentUrl) return res.status(500).json({ error: 'Payment creation failed' });
    res.json({ paymentUrl: payData.paymentUrl, orderId });
  } catch (err) { console.error('Subscription renew error:', err); res.status(500).json({ error: 'Server error' }); }
});

// Subscription webhook
router.post('/api/subscriptions/webhook', async (req, res) => {
  try {
    const signature = req.headers['x-mcc-signature'] || '';
    const secret = process.env.MCC_WEBHOOK_SECRET || '';
    if (!secret) return res.status(500).json({ error: 'Webhook not configured' });
    const hmac = 'sha256=' + crypto.createHmac('sha256', secret).update(req.rawBody || '').digest('hex');
    const sigBuf = Buffer.from(signature); const expBuf = Buffer.from(hmac);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return res.status(401).json({ error: 'Invalid signature' });
    const eventId = req.body?.id || req.body?.data?.id;
    if (eventId) { const already = await pool.query('SELECT 1 FROM processed_events WHERE id = $1', [eventId]); if (already.rows.length > 0) return res.json({ received: true, idempotent: true }); }
    const { event, data } = req.body;
    if (event === 'payment.completed' && data?.referenceId) {
      const orderId = data.referenceId; const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const orderRes = await client.query('SELECT buyer_id FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
        if (orderRes.rows.length === 0) { await client.query('ROLLBACK'); return res.json({ received: true }); }
        const sellerId = orderRes.rows[0].buyer_id;
        if (orderId.startsWith('sub_')) {
          const now = new Date(); const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
          const existing = await client.query(`SELECT id FROM seller_subscriptions WHERE seller_id = $1 AND status IN ('active', 'past_due') ORDER BY expires_at DESC LIMIT 1 FOR UPDATE`, [sellerId]);
          if (existing.rows.length > 0) {
            await client.query(`UPDATE seller_subscriptions SET status = 'active', expires_at = $2, last_payment_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [existing.rows[0].id, expiresAt]);
          } else {
            await client.query(`INSERT INTO seller_subscriptions (seller_id, status, started_at, expires_at, last_payment_at) VALUES ($1, 'active', CURRENT_TIMESTAMP, $2, CURRENT_TIMESTAMP)`, [sellerId, expiresAt]);
          }
          await client.query('UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', ['completed', orderId]);
          await client.query(`UPDATE users SET seller_tier = 'business', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND seller_tier != 'business'`, [sellerId]);
          createNotification(sellerId, 'subscription_activated', 'Business Subscription Active', `Your Business subscription is active until ${expiresAt.toLocaleDateString()}.`, {});
        }
        if (eventId) await client.query('INSERT INTO processed_events (id) VALUES ($1) ON CONFLICT DO NOTHING', [eventId]);
        await client.query('COMMIT');
      } catch (txErr) { await client.query('ROLLBACK'); throw txErr; } finally { client.release(); }
    }
    res.json({ received: true });
  } catch (err) { console.error('Subscription webhook error:', err); res.status(500).json({ error: 'Server error' }); }
});

// ───── Didit (0Didit) verification webhook ─────

router.get('/api/webhooks/didit', async (req, res) => {
  const { verificationSessionId, status } = req.query;
  if (status === 'Approved' && verificationSessionId && process.env.DIDIT_API_KEY) {
    try {
      const attempt = await pool.query(
        `SELECT vendor_data FROM didit_webhook_events WHERE session_id = $1 AND status = 'Approved' AND webhook_type = 'status.updated' ORDER BY received_at DESC LIMIT 1`,
        [verificationSessionId]
      );
      const userId = attempt.rows[0]?.vendor_data;
      if (userId && /^[0-9a-f-]{36}$/i.test(userId)) {
        await pool.query(`UPDATE users SET id_verified = true, id_verified_at = CURRENT_TIMESTAMP, id_verification_result = 'verified', seller_tier = 'verified' WHERE id = $1`, [userId]);
        await pool.query(`UPDATE verification_attempts SET status = 'verified', verified_at = CURRENT_TIMESTAMP WHERE id = (SELECT id FROM verification_attempts WHERE user_id = $1 AND status != 'verified' ORDER BY created_at DESC LIMIT 1)`, [userId]);
        createNotification(userId, 'verification_approved', 'Identity Verified', 'Your identity has been verified via Didit!', {});
      }
    } catch (err) { console.error('[DIDIT CALLBACK] Error:', err.message); }
  }
  res.status(200).send('<html><body style="font-family:sans-serif;text-align:center;padding:60px 20px"><h2>Verification complete</h2><p>You can close this page.</p></body></html>');
});

router.post('/api/webhooks/didit', async (req, res) => {
  try {
    const rawBody = req.rawBody;
    if (!rawBody) return res.status(400).json({ error: 'Raw webhook body required' });
    const timestamp = parseInt(req.headers['x-timestamp'] || '0');
    const now = Math.floor(Date.now() / 1000);
    if (!timestamp || Math.abs(now - timestamp) > 300) return res.status(401).json({ error: 'Invalid webhook timestamp' });
    const webhookSecret = process.env.DIDIT_WEBHOOK_SECRET;
    if (!webhookSecret) return res.status(503).json({ error: 'Webhook verification unavailable' });
    const signatureV2 = req.headers['x-signature-v2'];
    const signatureSimple = req.headers['x-signature-simple'];
    const signature = req.headers['x-signature'];
    const providedSignature = signatureV2 || signatureSimple || signature;
    if (!providedSignature) return res.status(401).json({ error: 'Missing webhook signature' });
    let expectedSig;
    if (signatureSimple) { const body = JSON.parse(rawBody); const simpleStr = `${timestamp}:${body.session_id || ''}:${body.status || ''}:${body.webhook_type || ''}`; expectedSig = crypto.createHmac('sha256', webhookSecret).update(simpleStr).digest('hex'); }
    else { expectedSig = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex'); }
    const sigBuf = Buffer.from(providedSignature, 'hex'); const expBuf = Buffer.from(expectedSig, 'hex');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return res.status(401).json({ error: 'Invalid webhook signature' });
    const event = JSON.parse(rawBody);
    const { event_id, webhook_type, status, vendor_data, session_id, decision } = event;
    if (!event_id || !session_id || !webhook_type || !status) return res.status(400).json({ error: 'Incomplete webhook event' });
    const existing = await pool.query('SELECT id FROM didit_webhook_events WHERE event_id = $1', [event_id]);
    if (existing.rows.length > 0) return res.status(200).json({ received: true });
    await pool.query('INSERT INTO didit_webhook_events (event_id, session_id, webhook_type, status, vendor_data) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (event_id) DO NOTHING', [event_id, session_id, webhook_type, status, vendor_data]);
    if (webhook_type === 'status.updated' && vendor_data) {
      const userId = vendor_data;
      if (status === 'Approved') {
        const faceMatch = decision?.face_matches?.[0]; const faceScore = faceMatch?.score || 0;
        await pool.query(`UPDATE users SET id_verified = true, id_verified_at = CURRENT_TIMESTAMP, id_verification_result = 'verified', seller_tier = CASE WHEN seller_tier = 'casual' THEN 'verified' ELSE seller_tier END WHERE id = $1`, [userId]);
        await pool.query(`UPDATE verification_attempts SET status = 'verified', face_match_score = $1, verified_at = CURRENT_TIMESTAMP WHERE id = (SELECT id FROM verification_attempts WHERE user_id = $2 AND status != 'verified' ORDER BY created_at DESC LIMIT 1)`, [faceScore, userId]);
        createNotification(userId, 'verification_approved', 'Identity Verified', 'Your identity has been verified via Didit!', {});
      } else if (status === 'Declined') {
        const idVerifs = decision?.id_verifications || []; const warnings = idVerifs.flatMap(v => v.warnings || []); const reason = warnings.join('. ') || 'Verification declined';
        await pool.query(`UPDATE users SET id_verification_result = 'rejected' WHERE id = $1`, [userId]);
        await pool.query(`UPDATE verification_attempts SET status = 'rejected', rejection_reason = $1 WHERE id = (SELECT id FROM verification_attempts WHERE user_id = $2 AND status != 'verified' ORDER BY created_at DESC LIMIT 1)`, [reason, userId]);
        createNotification(userId, 'verification_rejected', 'Verification Not Approved', reason, {});
      } else if (status === 'In Review') {
        await pool.query(`UPDATE users SET id_verification_result = 'pending' WHERE id = $1`, [userId]);
      }
    }
    return res.status(200).json({ received: true });
  } catch (err) { console.error('[DIDIT WEBHOOK] Error:', err); return res.status(500).json({ error: 'Webhook processing failed' }); }
});

export default router;
