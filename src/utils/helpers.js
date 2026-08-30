import { pool } from '../config/database.js';
import { createNotification } from './notifications.js';

async function logOrderEvent(orderId, eventType, actorId, oldValue, newValue, note, db) {
  const exec = db || pool;
  try {
    await exec.query(
      `INSERT INTO order_events (order_id, event_type, actor_id, old_value, new_value, note) VALUES ($1, $2, $3, $4, $5, $6)`,
      [orderId, eventType, actorId || null, oldValue || null, newValue || null, note || null]
    );
  } catch (err) {
    console.error('Failed to log order event:', err);
  }
}

// Username generation helper (Instagram-style: 1-30 chars, lowercase, letters/digits/underscores/periods)
async function generateUsername(fullName, db) {
  const exec = db || pool;
  const base = (fullName || 'user').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^(\d)/, '_$1').slice(0, 20) || 'user';
  let username = base + '_' + Math.floor(1000 + Math.random() * 9000);
  let attempts = 0;
  while (attempts < 20) {
    // Enforce Instagram rules: lowercase, 1-30 chars, no period at start/end, no double periods
    if (username.length <= 30 && !username.startsWith('.') && !username.endsWith('.') && !username.includes('..')) {
      const existing = await exec.query(`SELECT 1 FROM users WHERE username = $1`, [username]);
      if (existing.rows.length === 0) return username;
    }
    username = base + '_' + Math.floor(1000 + Math.random() * 9000);
    attempts++;
  }
  return username.slice(0, 30);
}

// Age verification helper — returns true if date of birth implies age >= 18
function isAtLeast18(dateOfBirth) {
  const dob = new Date(dateOfBirth);
  if (isNaN(dob.getTime())) return false;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age >= 18;
}

// Commission rate by seller tier
function getCommissionRate(tier) {
  switch (tier) {
    case 'business': return 0.03;
    case 'verified': return 0.05;
    case 'casual': return 0.08;
    default: return 0.08;
  }
}

// Allocate the amount actually paid across sellers. Promo discounts are applied
// proportionally so escrow and commission never exceed the order total.
async function getSellerPaymentAllocations(client, orderId) {
  const result = await client.query(
    `SELECT o.total_amount,
            oi.seller_id,
            SUM(oi.price * oi.quantity) AS line_total
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     WHERE o.id = $1
     GROUP BY o.total_amount, oi.seller_id
     ORDER BY oi.seller_id`,
    [orderId]
  );
  const subtotal = result.rows.reduce((sum, row) => sum + parseFloat(row.line_total), 0);
  const paidTotal = parseFloat(result.rows[0]?.total_amount || 0);
  if (subtotal <= 0 || paidTotal < 0) return [];

  let allocated = 0;
  return result.rows.map((row, index) => {
    const lineTotal = parseFloat(row.line_total);
    const paidTotalForSeller = index === result.rows.length - 1
      ? Math.max(0, Math.round((paidTotal - allocated) * 100) / 100)
      : Math.round((paidTotal * lineTotal / subtotal) * 100) / 100;
    allocated += paidTotalForSeller;
    return { seller_id: row.seller_id, total: lineTotal, paid_total: paidTotalForSeller };
  });
}

async function reserveOrderStock(client, orderId) {
  const orderItems = await client.query(
    'SELECT product_id, quantity FROM order_items WHERE order_id = $1',
    [orderId]
  );
  for (const item of orderItems.rows) {
    const product = await client.query(
      'SELECT stock FROM products WHERE id = $1 FOR UPDATE',
      [item.product_id]
    );
    if (product.rows.length === 0 || product.rows[0].stock < item.quantity) {
      const error = new Error(`Insufficient stock for product ${item.product_id}`);
      error.code = 'INSUFFICIENT_STOCK';
      throw error;
    }
  }
  for (const item of orderItems.rows) {
    await client.query(
      'UPDATE products SET stock = stock - $1 WHERE id = $2',
      [item.quantity, item.product_id]
    );
  }
  return orderItems.rows;
}

async function processRefundPayout(orderId) {
  const claim = await pool.query(
    `UPDATE refund_payouts
     SET status = 'processing', attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP
     WHERE order_id = $1 AND status IN ('pending', 'failed')
       AND next_attempt_at <= CURRENT_TIMESTAMP
     RETURNING *`,
    [orderId]
  );
  if (claim.rows.length === 0) return;
  const refund = claim.rows[0];
  const referenceId = refund.moncash_reference || `refund_${orderId}`;
  try {
    const payoutRes = await fetch(
      process.env.MONCASH_PAYOUT_CREATE_URL || 'https://hvlmeoqyxaguzcujpmit.supabase.co/functions/v1/payout-create',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.MCC_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: Math.round(parseFloat(refund.amount)),
          moncashNumber: refund.receiver_phone,
          referenceId,
        }),
        signal: AbortSignal.timeout(15000),
      }
    );
    if (!payoutRes.ok) throw new Error(await payoutRes.text());
    const payoutData = await payoutRes.json().catch(() => ({}));
    await pool.query(
      `UPDATE refund_payouts
       SET status = 'completed', moncash_reference = COALESCE(moncash_reference, $2),
           error_message = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [refund.id, payoutData.reference || payoutData.transactionId || referenceId]
    );
    createNotification(refund.buyer_id, 'order_status', 'Order Refunded',
      `G ${parseFloat(refund.amount).toFixed(0)} refunded for order`, { orderId });
  } catch (error) {
    const retryMinutes = Math.min(60, 5 * (2 ** Math.min(refund.attempts, 4)));
    await pool.query(
      `UPDATE refund_payouts SET status = 'failed', error_message = $2,
         next_attempt_at = CURRENT_TIMESTAMP + ($3 * INTERVAL '1 minute'),
         updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [refund.id, error.message, retryMinutes]
    );
    console.error(`[REFUND] Payout pending for order ${orderId}:`, error.message);
  }
}

async function checkSubscriptionStatus(sellerId) {
  try {
    const result = await pool.query(
      `SELECT * FROM seller_subscriptions WHERE seller_id = $1 AND status IN ('active', 'past_due') ORDER BY expires_at DESC LIMIT 1`,
      [sellerId]
    );
    if (result.rows.length === 0) return 'no_subscription';
    const sub = result.rows[0];
    const now = new Date();
    const expiresAt = new Date(sub.expires_at);
    const graceEnd = new Date(expiresAt.getTime() + (sub.grace_period_days || 7) * 86400000);
    if (now < expiresAt) return 'active';
    if (now < graceEnd) return 'past_due';
    return 'expired';
  } catch {
    return 'unknown';
  }
}

async function cleanupOldNotifications() {
  try {
    const result = await Promise.race([
      pool.query("DELETE FROM notifications WHERE is_read = true AND created_at < NOW() - INTERVAL '7 days'"),
      new Promise((_, re) => setTimeout(() => re(new Error('Notification cleanup timeout')), 15000))
    ]);
    if (result.rowCount > 0) console.log(`[CRON] Cleaned up ${result.rowCount} old read notifications`);
  } catch (err) {
    console.error('[CRON] Notification cleanup error:', err.message);
  }
}

async function recordProductCooccurrences(orderId, client) {
  const { rows } = await client.query(
    'SELECT DISTINCT product_id FROM order_items WHERE order_id = $1 ORDER BY product_id',
    [orderId]
  );
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      await client.query(
        `INSERT INTO product_cooccurrences (product_a_id, product_b_id, purchase_count, last_purchased_at)
         VALUES ($1, $2, 1, CURRENT_TIMESTAMP)
         ON CONFLICT (product_a_id, product_b_id) DO UPDATE SET
           purchase_count = product_cooccurrences.purchase_count + 1,
           last_purchased_at = CURRENT_TIMESTAMP`,
        [rows[i].product_id, rows[j].product_id]
      );
    }
  }
}

async function canAccessOrder(userId, orderId) {
  const result = await pool.query(
    `SELECT DISTINCT o.* FROM orders o
     LEFT JOIN order_items oi ON o.id = oi.order_id
     WHERE o.id = $1 AND (o.buyer_id = $2 OR oi.seller_id = $2)`,
    [orderId, userId]
  );
  return result.rows[0] || null;
}

export { logOrderEvent, generateUsername, isAtLeast18, getCommissionRate, getSellerPaymentAllocations, reserveOrderStock, processRefundPayout, checkSubscriptionStatus, cleanupOldNotifications, recordProductCooccurrences, canAccessOrder };
