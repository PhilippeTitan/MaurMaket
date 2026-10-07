import { pool } from '../config/database.js';
import { createNotification } from './notifications.js';

/**
 * Handle downgrade from Business tier (e.g. subscription expiry or cancellation).
 * Enforces:
 * - Switches public presentation to Personal (use_store_identity = false)
 * - Preserves business details privately
 * - Verified tier has a 100-listing active cap
 * - Pinned listing is protected/kept active first, then most recently active/updated listings
 * - Excess listings are paused (is_available = false, paused_reason = 'tier_cap') without deletion
 * - Sends one clear in-app alert
 */
export async function handleBusinessDowngrade(sellerId, client = pool) {
  const ownsClient = client === pool;
  const db = ownsClient ? await pool.connect() : client;
  let notification;
  try {
    if (ownsClient) await db.query('BEGIN');
    // 1. Switch presentation to personal and update tier to verified (or standard seller)
    await db.query(
      `UPDATE users
       SET use_store_identity = false,
           seller_tier = CASE WHEN seller_tier = 'business' THEN 'verified' ELSE seller_tier END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [sellerId]
    );

    // 2. Fetch all currently active listings for seller
    const listingsRes = await db.query(
      `SELECT id, is_pinned, updated_at, created_at
       FROM products
       WHERE seller_id = $1 AND listing_status = 'active' AND is_available = true
       ORDER BY is_pinned DESC, updated_at DESC, created_at DESC`,
      [sellerId]
    );

    const activeListings = listingsRes.rows;
    const MAX_VERIFIED_LISTINGS = 100;

    if (activeListings.length > MAX_VERIFIED_LISTINGS) {
      // Keep first 100 (pinned first, then most recently active/updated)
      const excess = activeListings.slice(MAX_VERIFIED_LISTINGS);
      const excessIds = excess.map(p => p.id);

      await db.query(
        `UPDATE products
         SET is_available = false,
             paused_reason = 'tier_cap',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ANY($1::uuid[])`,
        [excessIds]
      );

      notification = {
        type: 'tier_cap_paused',
        title: 'Listings paused due to tier limit',
        body: `Your Business subscription ended. ${excessIds.length} listings were paused to match the 100-listing limit. You can manage which listings are active.`,
        data: { screen: 'MyListings', filter: 'paused', pausedCount: excessIds.length },
      };
    } else {
      notification = {
        type: 'tier_downgraded',
        title: 'Business subscription ended',
        body: 'Your subscription has ended and your public presentation has switched to personal.',
        data: { screen: 'SellerTools' },
      };
    }
    if (ownsClient) await db.query('COMMIT');
  } catch (err) {
    if (ownsClient) {
      try { await db.query('ROLLBACK'); } catch { /* transaction may not have started */ }
    }
    console.error(`[TIER CAP] Error handling downgrade for seller ${sellerId}:`, err);
    throw err;
  } finally {
    if (ownsClient) db.release();
  }
  // Only publish after the tier/listing transaction commits so push and realtime
  // cannot announce a downgrade that later rolls back.
  if (ownsClient && notification) {
    await createNotification(sellerId, notification.type, notification.title, notification.body, notification.data);
  }
  return notification;
}

/**
 * Handle upgrade to Business tier (subscription activated or renewed).
 * Automatically reactivates listings that were paused due to tier_cap.
 */
export async function handleBusinessUpgrade(sellerId, client = pool) {
  try {
    await client.query(
      `UPDATE users
       SET seller_tier = 'business',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [sellerId]
    );

    // Automatically reactivate paused listings that were paused specifically for tier_cap
    const reactivated = await client.query(
      `UPDATE products
       SET is_available = true,
           paused_reason = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE seller_id = $1 AND paused_reason = 'tier_cap'
       RETURNING id`,
      [sellerId]
    );

    if (reactivated.rowCount > 0) {
      console.log(`[TIER CAP] Auto-reactivated ${reactivated.rowCount} tier_cap paused listings for seller ${sellerId}`);
    }
  } catch (err) {
    console.error(`[TIER CAP] Error handling upgrade for seller ${sellerId}:`, err);
    throw err;
  }
}

/**
 * Hourly cron helper: check for expired Business subscriptions and trigger downgrade.
 */
export async function checkAndProcessExpiredSubscriptions() {
  try {
    const expired = await pool.query(
      `SELECT s.id, s.seller_id
       FROM seller_subscriptions s
       JOIN users u ON u.id = s.seller_id
       WHERE u.seller_tier = 'business'
         AND s.status IN ('active', 'past_due')
         AND s.expires_at + make_interval(days => COALESCE(s.grace_period_days, 7)) < CURRENT_TIMESTAMP`
    );

    for (const sub of expired.rows) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const locked = await client.query(
          `SELECT s.id, s.seller_id
             FROM seller_subscriptions s
             JOIN users u ON u.id = s.seller_id
            WHERE s.id = $1 AND u.seller_tier = 'business'
              AND s.status IN ('active','past_due')
              AND s.expires_at + make_interval(days => COALESCE(s.grace_period_days,7)) < CURRENT_TIMESTAMP
            FOR UPDATE OF s, u`,
          [sub.id]
        );
        if (!locked.rows.length) {
          await client.query('ROLLBACK');
          continue;
        }
        console.log(`[TIER CAP] Subscription expired for seller ${locked.rows[0].seller_id}. Downgrading.`);
        await client.query(
          `UPDATE seller_subscriptions SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [sub.id]
        );
        const notification = await handleBusinessDowngrade(locked.rows[0].seller_id, client);
        await client.query('COMMIT');
        if (notification) {
          await createNotification(locked.rows[0].seller_id, notification.type, notification.title, notification.body, notification.data);
        }
      } catch (err) {
        try { await client.query('ROLLBACK'); } catch { /* transaction may have failed */ }
        throw err;
      } finally {
        client.release();
      }
    }
  } catch (err) {
    console.error('[TIER CAP] Error checking expired subscriptions:', err);
  }
}
