import { Router } from 'express';
import { pool } from '../config/database.js';
import { authRequired, verifiedSellerRequired } from '../middleware/auth.js';
import { checkSubscriptionStatus } from '../utils/helpers.js';
import { createNotification } from '../utils/notifications.js';

const router = Router();

function sellerRequired(req, res, next) {
  if (req.user.role !== 'seller') return res.status(403).json({ error: 'Seller access required' });
  next();
}

async function refundPayout(client, sellerId, amount, payoutId, errorMessage) {
  try {
    await client.query('BEGIN');
    await client.query(
      'UPDATE seller_balances SET balance = balance + $1, total_paid_out = total_paid_out - $1, updated_at = CURRENT_TIMESTAMP WHERE seller_id = $2',
      [amount, sellerId]
    );
    await client.query(
      `UPDATE payouts SET status = 'failed', error_message = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [errorMessage, payoutId]
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Refund payout error:', e);
  }
}

// Seller balance
router.get('/api/seller/balance', authRequired, sellerRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT balance, total_earned, total_paid_out FROM seller_balances WHERE seller_id = $1`,
      [req.user.id]
    );
    if (result.rows.length === 0) return res.json({ balance: 0, total_earned: 0, total_paid_out: 0 });
    const row = result.rows[0];
    res.json({ balance: parseFloat(row.balance) || 0, total_earned: parseFloat(row.total_earned) || 0, total_paid_out: parseFloat(row.total_paid_out) || 0 });
  } catch (err) {
    console.error('Balance fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Payout history
router.get('/api/seller/payouts', authRequired, sellerRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM payouts WHERE seller_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json({ payouts: result.rows });
  } catch (err) {
    console.error('Payouts fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Request payout
router.post('/api/seller/payouts/request', authRequired, sellerRequired, async (req, res) => {
  const evCheck = await pool.query('SELECT email_verified FROM users WHERE id = $1', [req.user.id]);
  if (!evCheck.rows[0]?.email_verified) return res.status(403).json({ error: 'email_not_verified', message: 'Please verify your email to request payouts.' });
  const tierCheck = await pool.query('SELECT seller_tier FROM users WHERE id = $1', [req.user.id]);
  const sellerTier = tierCheck.rows[0]?.seller_tier || 'none';
  if (sellerTier === 'casual') return res.status(403).json({ error: 'Payouts are available for Verified sellers and above.' });
  if (sellerTier === 'business') {
    const subStatus = await checkSubscriptionStatus(req.user.id);
    if (subStatus === 'expired') {
      await pool.query(`UPDATE users SET seller_tier = 'verified', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [req.user.id]);
      createNotification(req.user.id, 'subscription_expired', 'Business Subscription Expired', 'Your Business subscription has expired. You have been demoted to Verified Seller.', {}, pool);
      return res.status(403).json({ error: 'Business subscription expired. You have been demoted to Verified Seller.' });
    }
  }
  const { amount } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Valid amount required' });
  const MIN_PAYOUT = parseFloat(process.env.MIN_PAYOUT_AMOUNT || '100');
  if (amount < MIN_PAYOUT) return res.status(400).json({ error: `Minimum payout is G ${MIN_PAYOUT}` });

  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const balanceResult = await c.query('SELECT balance FROM seller_balances WHERE seller_id = $1 FOR UPDATE', [req.user.id]);
    const inflightCheck = await c.query("SELECT id FROM payouts WHERE seller_id = $1 AND status = 'processing'", [req.user.id]);
    if (inflightCheck.rows.length > 0) {
      await c.query('ROLLBACK');
      return res.status(409).json({ error: 'payout_in_progress', message: 'You already have a payout being processed.' });
    }
    const currentBalance = balanceResult.rows.length > 0 ? parseFloat(balanceResult.rows[0].balance) : 0;
    if (currentBalance < amount) { await c.query('ROLLBACK'); return res.status(400).json({ error: 'Insufficient balance' }); }
    const userResult = await c.query('SELECT phone FROM users WHERE id = $1', [req.user.id]);
    const phone = userResult.rows[0]?.phone;
    if (!phone) { await c.query('ROLLBACK'); return res.status(400).json({ error: 'Set your phone number in Profile before requesting a payout' }); }
    const payoutResult = await c.query(
      `INSERT INTO payouts (seller_id, amount, status, receiver_phone) VALUES ($1, $2, 'processing', $3) RETURNING *`,
      [req.user.id, amount, phone]
    );
    const payout = payoutResult.rows[0];
    await c.query('UPDATE seller_balances SET balance = balance - $1, total_paid_out = total_paid_out + $1, updated_at = CURRENT_TIMESTAMP WHERE seller_id = $2', [amount, req.user.id]);
    await c.query('COMMIT');
    c.release();

    try {
      const mccRes = await fetch(
        process.env.MONCASH_PAYOUT_CREATE_URL || 'https://hvlmeoqyxaguzcujpmit.supabase.co/functions/v1/payout-create',
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${process.env.MCC_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: Math.round(amount), moncashNumber: phone, referenceId: payout.id }),
          signal: AbortSignal.timeout(15000),
        }
      );
      if (mccRes.ok) {
        const data = await mccRes.json();
        await pool.query(`UPDATE payouts SET status = 'completed', moncash_reference = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [data.reference || data.transactionId || null, payout.id]);
        return res.json({ payout: { ...payout, status: 'completed' } });
      }
      const errorText = await mccRes.text();
      console.error(`[MCC-ALERT] Payout API failure: HTTP ${mccRes.status}`, errorText);
      let reason = 'Payout failed. Please try again later.';
      try { const parsed = JSON.parse(errorText); if (parsed.reason) reason = parsed.reason; else if (parsed.message) reason = parsed.message; } catch {}
      const refundC = await pool.connect();
      try { await refundPayout(refundC, req.user.id, amount, payout.id, `MonCashConnect returned ${mccRes.status}: ${errorText}`); } finally { refundC.release(); }
      return res.status(502).json({ error: 'payout_failed', message: reason });
    } catch (fetchErr) {
      console.error('[MCC-ALERT] Payout network timeout/error:', fetchErr.message);
      const refundC = await pool.connect();
      try { await refundPayout(refundC, req.user.id, amount, payout.id, fetchErr.message); } finally { refundC.release(); }
      return res.status(502).json({ error: 'payout_network_error', message: 'Could not reach MonCash. Your balance has been restored.' });
    }
  } catch (err) {
    try { await c.query('ROLLBACK'); } catch {} c.release();
    console.error('Payout request error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Sale lifecycle
router.post('/api/products/:id/sale', authRequired, verifiedSellerRequired, async (req, res) => {
  try {
    const check = await pool.query('SELECT seller_id, price FROM products WHERE id = $1', [req.params.id]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    if (check.rows[0].seller_id !== req.user.id) return res.status(403).json({ error: 'Not your product' });
    const { sale_price, sale_ends_at, clearSale } = req.body;
    if (clearSale) {
      const result = await pool.query(`UPDATE products SET sale_price = NULL, sale_starts_at = NULL, sale_ends_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`, [req.params.id]);
      return res.json({ product: result.rows[0] });
    }
    if (!sale_price || !sale_ends_at) return res.status(400).json({ error: 'sale_price and sale_ends_at are required' });
    const saleP = parseFloat(sale_price);
    const origP = parseFloat(check.rows[0].price);
    if (saleP >= origP) return res.status(400).json({ error: 'Sale price must be lower than the original price' });
    const discountPct = Math.round((1 - saleP / origP) * 100);
    if (discountPct > 25) return res.status(400).json({ error: 'Maximum discount is 25%' });
    if (new Date(sale_ends_at) <= new Date()) return res.status(400).json({ error: 'Sale end date must be in the future' });
    const result = await pool.query(
      `UPDATE products SET sale_price = $1, sale_starts_at = COALESCE($2, NOW()), sale_ends_at = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING *`,
      [saleP, req.body.sale_starts_at || null, sale_ends_at, req.params.id]
    );
    res.json({ product: result.rows[0] });
  } catch (err) {
    console.error('Sale update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
