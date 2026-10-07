import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { pool } from '../config/database.js';
import { authRequired, verifiedSellerRequired, accountActive } from '../middleware/auth.js';
import { checkSubscriptionStatus, settleSellerDebtPayment } from '../utils/helpers.js';
import { createNotification } from '../utils/notifications.js';

const router = Router();

function sellerRequired(req, res, next) {
  if (req.user.role !== 'seller') return res.status(403).json({ error: 'Seller access required' });
  next();
}

async function refundPayout(client, sellerId, amount, totalDebit, payoutId, errorMessage) {
  try {
    await client.query('BEGIN');
    await client.query(
      'UPDATE seller_balances SET balance = balance + $1, updated_at = CURRENT_TIMESTAMP WHERE seller_id = $2',
      [totalDebit, sellerId]
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

router.get('/api/seller/debts', authRequired, sellerRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, order_id, original_amount, outstanding_amount, reason, created_at
       FROM seller_debts WHERE seller_id = $1 AND status = 'open'
       ORDER BY created_at ASC`,
      [req.user.id]
    );
    const total = result.rows.reduce((sum, row) => sum + Number(row.outstanding_amount || 0), 0);
    const activePayment = await pool.query(
      `SELECT id, debt_amount, charge_amount, collection_fee_amount, status, error_message, created_at
       FROM seller_debt_payments WHERE seller_id = $1 AND status IN ('created','processing','unknown')
       ORDER BY created_at DESC LIMIT 1`,
      [req.user.id]
    );
    res.json({ debts: result.rows, total, activePayment: activePayment.rows[0] || null });
  } catch (err) {
    console.error('Seller debt fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/api/seller/debts/pay', authRequired, sellerRequired, async (req, res) => {
  if (!req.user?.email_verified) return res.status(403).json({ error: 'email_not_verified', message: 'Verify your email before paying account debts.' });
  const client = await pool.connect();
  let clientReleased = false;
  const release = () => { if (!clientReleased) { clientReleased = true; client.release(); } };
  try {
    await client.query('BEGIN');
    const debts = await client.query(
      "SELECT id, outstanding_amount FROM seller_debts WHERE seller_id = $1 AND status = 'open' ORDER BY created_at, id FOR UPDATE",
      [req.user.id]
    );
    const debtAmount = Math.round(debts.rows.reduce((sum, row) => sum + Number(row.outstanding_amount || 0), 0) * 100) / 100;
    if (debtAmount <= 0) {
      await client.query('ROLLBACK');
      release();
      return res.status(409).json({ error: 'no_open_debt' });
    }
    const active = await client.query(
      "SELECT id, status FROM seller_debt_payments WHERE seller_id = $1 AND status IN ('created','processing','unknown') LIMIT 1 FOR UPDATE",
      [req.user.id]
    );
    if (active.rows.length) {
      await client.query('ROLLBACK');
      release();
      return res.status(409).json({ error: 'debt_payment_unresolved', paymentId: active.rows[0].id, status: active.rows[0].status });
    }
    // Gross up so the 2.9% MonCash inbound fee leaves the full debt amount.
    const chargeAmount = Math.ceil(debtAmount / 0.971);
    const collectionFee = Math.round((chargeAmount - debtAmount) * 100) / 100;
    const referenceId = `seller_debt_${randomUUID()}`;
    const payment = await client.query(
      `INSERT INTO seller_debt_payments (seller_id, debt_amount, charge_amount, collection_fee_amount, reference_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [req.user.id, debtAmount, chargeAmount, collectionFee, referenceId]
    );
    await client.query('COMMIT');
    release();

    const paymentId = payment.rows[0].id;
    try {
      const providerResponse = await fetch(
        process.env.MONCASH_PAY_CREATE_URL || 'https://api.moncashconnect.com/v1/pay-create',
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${process.env.MCC_KEY || ''}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: chargeAmount,
            referenceId,
            returnUrl: `${process.env.PRODUCTION_URL || 'https://maurmaket.onrender.com'}/payment/return?debtPaymentId=${paymentId}`,
          }),
          signal: AbortSignal.timeout(15000),
        }
      );
      const body = await providerResponse.json().catch(() => ({}));
      if (providerResponse.ok && body.paymentUrl) {
        await pool.query(
          `UPDATE seller_debt_payments SET status = 'processing', provider_reference = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
          [body.reference || body.transactionId || referenceId, paymentId]
        );
        return res.json({ paymentId, paymentUrl: body.paymentUrl, status: 'processing', debtAmount, chargeAmount, collectionFee });
      }
      const definitiveReject = providerResponse.status >= 400 && providerResponse.status < 500 && providerResponse.status !== 409;
      await pool.query(
        `UPDATE seller_debt_payments SET status = $1, error_message = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
        [definitiveReject ? 'failed' : 'unknown', `MonCashConnect returned ${providerResponse.status}: ${JSON.stringify(body)}`.slice(0, 1000), paymentId]
      );
      return res.status(definitiveReject ? 502 : 202).json({ paymentId, status: definitiveReject ? 'failed' : 'unknown', error: 'Payment status could not be confirmed. Check its status before retrying.' });
    } catch (providerError) {
      await pool.query(
        `UPDATE seller_debt_payments SET status = 'unknown', error_message = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [`MonCash response was not confirmed: ${providerError.message}`.slice(0, 1000), paymentId]
      );
      return res.status(202).json({ paymentId, status: 'unknown', error: 'Payment status could not be confirmed. Check its status before retrying.' });
    }
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    release();
    if (err.code === '23505') return res.status(409).json({ error: 'debt_payment_unresolved' });
    console.error('Seller debt payment error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/api/seller/debts/payments/:id', authRequired, sellerRequired, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM seller_debt_payments WHERE id = $1 AND seller_id = $2', [req.params.id, req.user.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Debt payment not found' });
    let payment = result.rows[0];
    const lastProviderCheck = new Date(payment.updated_at || payment.created_at).getTime();
    const providerCheckDue = !Number.isFinite(lastProviderCheck) || Date.now() - lastProviderCheck >= 30_000;
    if (['created', 'processing', 'unknown'].includes(payment.status) && providerCheckDue) {
      const statusUrl = (process.env.MONCASH_PAY_CREATE_URL || 'https://api.moncashconnect.com/v1/pay-create')
        .replace('pay-create', 'pay-status') + `?referenceId=${encodeURIComponent(payment.reference_id)}`;
      try {
        const providerResponse = await fetch(statusUrl, { headers: { 'Authorization': `Bearer ${process.env.MCC_KEY || ''}` }, signal: AbortSignal.timeout(10000) });
        if (providerResponse.ok) {
          const providerStatus = await providerResponse.json();
          if (providerStatus.status === 'completed' || providerStatus.paid === true) {
            const client = await pool.connect();
            try {
              await client.query('BEGIN');
              const settled = await settleSellerDebtPayment(client, payment.id, Number(providerStatus.amount ?? providerStatus.totalAmount));
              if (settled.status === 'amount_mismatch') {
                await client.query("UPDATE seller_debt_payments SET status = 'unknown', error_message = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2", [`Provider amount ${settled.received} did not match expected ${settled.expected}`, payment.id]);
              }
              await client.query('COMMIT');
              if (settled.status === 'amount_mismatch') return res.status(202).json({ ...payment, status: 'unknown', reconciliationRequired: true });
              if (settled.status === 'completed' && !settled.alreadyCompleted) createNotification(req.user.id, 'seller_debt_paid', 'Debt payment confirmed', `MonCash confirmed G ${settled.amount.toFixed(2)} toward your outstanding seller fees.`, { paymentId: payment.id });
            } catch (txError) { try { await client.query('ROLLBACK'); } catch {} throw txError; }
            finally { client.release(); }
          } else if (providerStatus.status === 'failed' || providerStatus.status === 'expired') {
            await pool.query("UPDATE seller_debt_payments SET status = 'failed', error_message = 'MonCash confirmed the debt payment failed', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND status <> 'completed'", [payment.id]);
          }
        }
      } catch (pollError) { console.error('Debt payment status poll error:', pollError.message); }
      payment = (await pool.query('SELECT * FROM seller_debt_payments WHERE id = $1', [payment.id])).rows[0];
    }
    res.json(payment);
  } catch (err) {
    console.error('Seller debt payment status error:', err);
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
router.post('/api/seller/payouts/request', authRequired, sellerRequired, accountActive, async (req, res) => {
  if (!req.user?.email_verified) return res.status(403).json({ error: 'email_not_verified', message: 'Please verify your email to request payouts.' });
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
  const requestedAmount = Number(amount);
  if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) return res.status(400).json({ error: 'Valid amount required' });
  if (!Number.isInteger(requestedAmount)) return res.status(400).json({ error: 'MonCash payouts must be requested in whole gourdes' });
  const MIN_PAYOUT = parseFloat(process.env.MIN_PAYOUT_AMOUNT || '100');
  if (requestedAmount < MIN_PAYOUT) return res.status(400).json({ error: `Minimum payout is G ${MIN_PAYOUT}` });
  const payoutAmount = Math.round(requestedAmount * 100) / 100;
  const feeAmount = Math.round(payoutAmount * 0.05 * 100) / 100;
  const totalDebit = Math.round((payoutAmount + feeAmount) * 100) / 100;

  const c = await pool.connect();
  let clientReleased = false;
  const releaseClient = () => {
    if (!clientReleased) {
      clientReleased = true;
      c.release();
    }
  };
  try {
    await c.query('BEGIN');
    const balanceResult = await c.query('SELECT balance FROM seller_balances WHERE seller_id = $1 FOR UPDATE', [req.user.id]);
    const inflightCheck = await c.query("SELECT id FROM payouts WHERE seller_id = $1 AND status = 'processing'", [req.user.id]);
    if (inflightCheck.rows.length > 0) {
      await c.query('ROLLBACK');
      releaseClient();
      return res.status(409).json({ error: 'payout_in_progress', message: 'You already have a payout being processed.' });
    }
    const currentBalance = balanceResult.rows.length > 0 ? parseFloat(balanceResult.rows[0].balance) : 0;
    if (currentBalance < totalDebit) { await c.query('ROLLBACK'); releaseClient(); return res.status(400).json({ error: 'Insufficient balance including the 5% MonCash withdrawal fee' }); }
    const userResult = await c.query('SELECT phone FROM users WHERE id = $1', [req.user.id]);
    const phone = userResult.rows[0]?.phone;
    if (!phone) { await c.query('ROLLBACK'); releaseClient(); return res.status(400).json({ error: 'Set your phone number in Profile before requesting a payout' }); }
    const payoutResult = await c.query(
      `INSERT INTO payouts (seller_id, amount, fee_amount, total_debit, status, receiver_phone) VALUES ($1, $2, $3, $4, 'processing', $5) RETURNING *`,
      [req.user.id, payoutAmount, feeAmount, totalDebit, phone]
    );
    const payout = payoutResult.rows[0];
    await c.query('UPDATE seller_balances SET balance = balance - $1, updated_at = CURRENT_TIMESTAMP WHERE seller_id = $2', [totalDebit, req.user.id]);
    await c.query('COMMIT');
    releaseClient();

    try {
      const mccRes = await fetch(
        process.env.MONCASH_PAYOUT_CREATE_URL || 'https://api.moncashconnect.com/v1/payout-create',
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${process.env.MCC_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: Math.round(payoutAmount), moncashNumber: phone, referenceId: payout.id }),
          signal: AbortSignal.timeout(15000),
        }
      );
      if (mccRes.ok) {
        const data = await mccRes.json();
        const providerReference = data.reference || data.transactionId || null;
        await pool.query(`UPDATE payouts SET provider_reference = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND status = 'processing'`, [providerReference, payout.id]);
        return res.json({ payout: { ...payout, provider_reference: providerReference, status: 'processing' }, settlement: 'awaiting_confirmation' });
      }
      const errorText = await mccRes.text();
      console.error(`[MCC-ALERT] Payout API failure: HTTP ${mccRes.status}`, errorText);
      let reason = 'Payout was rejected. Please try again later.';
      try { const parsed = JSON.parse(errorText); if (parsed.reason) reason = parsed.reason; else if (parsed.message) reason = parsed.message; } catch {}
      // A conflict can mean this stable reference was already accepted. Keep
      // the funds reserved until a webhook or operator reconciliation resolves it.
      if (mccRes.status >= 400 && mccRes.status < 500 && mccRes.status !== 409) {
        const refundC = await pool.connect();
        try { await refundPayout(refundC, req.user.id, payoutAmount, totalDebit, payout.id, `MonCashConnect rejected payout (${mccRes.status}): ${errorText}`); } finally { refundC.release(); }
        return res.status(502).json({ error: 'payout_failed', message: reason });
      }
      await pool.query(`UPDATE payouts SET error_message = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND status = 'processing'`, [`MonCashConnect response ${mccRes.status}; settlement is being checked.`, payout.id]);
      return res.status(202).json({ payout: { ...payout, status: 'processing' }, settlement: 'awaiting_confirmation' });
    } catch (fetchErr) {
      console.error('[MCC-ALERT] Payout network timeout/error:', fetchErr.message);
      await pool.query(`UPDATE payouts SET error_message = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND status = 'processing'`, [`MonCashConnect response was not confirmed: ${fetchErr.message}`, payout.id]);
      return res.status(202).json({ payout: { ...payout, status: 'processing' }, settlement: 'unknown_checking', message: 'MonCash did not confirm the request response yet. The payout remains reserved while its status is checked.' });
    }
  } catch (err) {
    try { if (!clientReleased) await c.query('ROLLBACK'); } catch {} releaseClient();
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
