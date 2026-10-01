import { pool } from '../config/database.js';

export async function getNatCashAccess(sellerId, db = pool) {
  const result = await db.query(
    `SELECT u.seller_tier, u.accepted_payment_methods, u.natcash_phone,
            EXISTS (
              SELECT 1 FROM seller_subscriptions bs
              WHERE bs.seller_id = u.id AND bs.status IN ('active','past_due')
                AND bs.expires_at + make_interval(days => COALESCE(bs.grace_period_days, 7)) > CURRENT_TIMESTAMP
            ) AS business_active,
            ns.status AS standalone_status, ns.expires_at AS standalone_expires_at
     FROM users u
     LEFT JOIN LATERAL (
       SELECT status, expires_at FROM natcash_access_subscriptions
       WHERE seller_id = u.id ORDER BY created_at DESC LIMIT 1
     ) ns ON true
     WHERE u.id = $1`, [sellerId]
  );
  const row = result.rows[0];
  if (!row) return { entitled: false, source: null, status: 'unavailable', expiresAt: null };
  const phoneConfigured = Boolean(row.natcash_phone);
  const paymentMethodEnabled = phoneConfigured && Array.isArray(row.accepted_payment_methods) && row.accepted_payment_methods.includes('natcash');
  if (row.seller_tier === 'business' && row.business_active) {
    return { entitled: true, paymentMethodEnabled, phoneConfigured, source: 'business', status: 'active', expiresAt: null };
  }
  if (!row.standalone_status) return { entitled: false, paymentMethodEnabled, phoneConfigured, source: null, status: 'not_subscribed', expiresAt: null };
  const expiresAt = row.standalone_expires_at;
  const expiredAfterGrace = new Date(expiresAt).getTime() + 3 * 86400000 <= Date.now();
  const active = row.standalone_status === 'active' && !expiredAfterGrace;
  return {
    entitled: active,
    paymentMethodEnabled,
    phoneConfigured,
    source: 'monthly',
    status: row.standalone_status === 'paused' ? 'paused' : expiredAfterGrace ? 'expired' : 'active',
    expiresAt,
    inGracePeriod: active && new Date(expiresAt).getTime() < Date.now(),
  };
}
