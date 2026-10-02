import cron from 'node-cron';
import { pool } from '../config/database.js';
import { logOrderEvent, getCommissionRate, getSellerPaymentAllocations, reserveOrderStock, recordProductCooccurrences, processRefundPayout, cleanupOldNotifications } from '../utils/helpers.js';
import { createNotification, sendPushNotification } from '../utils/notifications.js';
import { expireTemporaryStorageUploads } from '../utils/temporaryStorage.js';
import { checkAndProcessExpiredSubscriptions } from '../utils/tierCap.js';

export function startJobs() {
  // NatCash access reminders are informational; entitlement is still checked
  // synchronously by checkout and reminders never extend access.
  cron.schedule('0 9 * * *', async () => {
    try {
      const reminders = await pool.query(
        `WITH due AS (
           SELECT s.id, s.seller_id, s.expires_at,
                  (s.expires_at AT TIME ZONE 'America/Port-au-Prince')::date -
                  (CURRENT_TIMESTAMP AT TIME ZONE 'America/Port-au-Prince')::date AS days_remaining,
                  (CURRENT_TIMESTAMP AT TIME ZONE 'America/Port-au-Prince')::date AS local_date
           FROM natcash_access_subscriptions s
           WHERE s.status = 'active'
             AND s.expires_at - INTERVAL '7 days' <= CURRENT_TIMESTAMP
             AND s.expires_at + INTERVAL '3 days' > CURRENT_TIMESTAMP
             AND NOT EXISTS (
               SELECT 1 FROM seller_subscriptions b
               JOIN users u ON u.id = b.seller_id AND u.seller_tier = 'business'
               WHERE b.seller_id = s.seller_id AND b.status IN ('active','past_due')
                 AND b.expires_at + make_interval(days => COALESCE(b.grace_period_days,7)) > CURRENT_TIMESTAMP
             )
         )
         INSERT INTO natcash_access_reminders (subscription_id, seller_id, local_date)
         SELECT id, seller_id, local_date FROM due
         ON CONFLICT (subscription_id, local_date) DO NOTHING
         RETURNING subscription_id, seller_id, local_date`
      );
      for (const reminder of reminders.rows) {
        const subscription = await pool.query('SELECT expires_at FROM natcash_access_subscriptions WHERE id = $1', [reminder.subscription_id]);
        if (!subscription.rows[0]) continue;
        const expiresAt = new Date(subscription.rows[0].expires_at);
        const remaining = Math.max(-3, Math.ceil((expiresAt.getTime() - Date.now()) / 86400000));
        const title = remaining <= 0 ? 'NatCash access grace period' : 'NatCash access reminder';
        const body = remaining <= 0
          ? `Your NatCash access expires in ${Math.abs(remaining)} day${Math.abs(remaining) === 1 ? '' : 's'}. Renew to keep accepting new NatCash orders.`
          : `Your NatCash access expires in ${remaining} day${remaining === 1 ? '' : 's'}. Renew to keep accepting new NatCash orders.`;
        createNotification(reminder.seller_id, 'natcash_access_expiry', title, body, { screen: 'NatCashAccess' });
      }
    } catch (err) {
      console.error('[NATCASH ACCESS] Reminder job error:', err.message);
    }
  }, { timezone: 'America/Port-au-Prince' });

  // ───── Expire temporary KYC photos even when a user abandons the flow ─────
  cron.schedule('*/5 * * * *', async () => {
    try {
      await expireTemporaryStorageUploads();
    } catch (err) {
      console.error('[UPLOAD EXPIRY] Cleanup job error:', err.message);
    }
  });

  // ───── Cron: Auto-refund expired meetup check-ins (every 5 minutes) ─────
  cron.schedule('*/5 * * * *', async () => {
    try {
      const expiredCheckins = await pool.query(`
        SELECT DISTINCT mc.order_id
        FROM meetup_checkins mc
        JOIN orders o ON mc.order_id = o.id
        WHERE o.status = 'paid'
          AND o.payment_method = 'moncash'
          AND o.delivery_method = 'meetup'
          AND mc.checked_in_at < NOW() - INTERVAL '90 minutes'
          AND NOT EXISTS (
            SELECT 1 FROM meetup_checkins mc2
            WHERE mc2.order_id = mc.order_id AND mc2.qr_scanned = true
          )
      `);

      for (const row of expiredCheckins.rows) {
        const orderId = row.order_id;
        console.log(`[CRON] Meetup expired for order ${orderId} — auto-refunding`);

        const client = await pool.connect();
        let commissionReversed = 0;
        try {
          await client.query('BEGIN');
          const orderResult = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
          if (orderResult.rows.length === 0 || orderResult.rows[0].status !== 'paid') {
            await client.query('ROLLBACK');
            continue;
          }
          const order = orderResult.rows[0];

          const escrows = await client.query(
            "SELECT * FROM order_escrow WHERE order_id = $1 AND status = 'held' FOR UPDATE",
            [orderId]
          );
          for (const escrow of escrows.rows) {
            commissionReversed += Number(escrow.commission_amount || 0);
            await client.query(
              `UPDATE order_escrow SET status = 'refunded', gross_amount = 0, commission_base = 0,
                 collection_fee_amount = 0, commission_amount = 0, net_amount = 0, released_at = CURRENT_TIMESTAMP WHERE id = $1`,
              [escrow.id]
            );
            await client.query(
              `UPDATE platform_revenue SET gross_amount = 0, commission_base = 0, collection_fee_amount = 0,
                 commission_amount = 0, platform_fee = 0, net_to_seller = 0 WHERE order_id = $1 AND seller_id = $2`,
              [orderId, escrow.seller_id]
            );
          }

          const items = await client.query('SELECT product_id, quantity FROM order_items WHERE order_id = $1', [orderId]);
          for (const item of items.rows) {
            await client.query('SELECT id FROM products WHERE id = $1 FOR UPDATE', [item.product_id]);
            await client.query('UPDATE products SET stock = stock + $1 WHERE id = $2', [item.quantity, item.product_id]);
          }

          await client.query("UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [orderId]);
          await logOrderEvent(orderId, 'status_change', null, 'paid', 'cancelled', 'Meetup expired — auto-refund', client);
          await client.query('COMMIT');
          client.release();

          const totalRefund = parseFloat(order.total_amount);
          if (totalRefund > 0) {
            const feeAmount = Math.round(totalRefund * 0.05 * 100) / 100;
            await pool.query(
              `INSERT INTO refund_payouts (order_id, buyer_id, amount, fee_amount, receiver_phone,
                 moncash_reference, reason, cause, commission_reversed, destination_verified)
               VALUES ($1, $2, $3, $4, '', $5, $6, 'maurmaket', $7, false)
               ON CONFLICT (moncash_reference) DO NOTHING`,
              [orderId, order.buyer_id, totalRefund, feeAmount, `meetup_refund_${orderId}`, 'Automatic meetup expiry refund awaiting support destination verification', commissionReversed]
            );
          }

          createNotification(order.buyer_id, 'order_status', 'Refund under review',
            `Your meetup expired. Support is confirming the MonCash refund destination for G ${totalRefund.toFixed(2)}.`, { orderId });

          const sellerNotify = await pool.query('SELECT DISTINCT seller_id FROM order_items WHERE order_id = $1', [orderId]);
          for (const row of sellerNotify.rows) {
            createNotification(row.seller_id, 'meetup_expired', 'Meetup Expired',
              `Your meetup for this order expired without exchange. The order has been cancelled.`, { orderId });
          }

        } catch (e) {
          try { await client.query('ROLLBACK'); } catch {}
          client.release();
          console.error(`[CRON] Error refunding order ${orderId}:`, e.message);
        }
      }
    } catch (err) {
      console.error('[CRON] Meetup timeout check error:', err.message);
    }
  });

  // ───── Cron: Refund payout retry (every 5 minutes) ─────
  cron.schedule('*/5 * * * *', async () => {
    try {
      const pendingRefunds = await pool.query(
        `SELECT id FROM refund_payouts
         WHERE status = 'pending' AND next_attempt_at <= CURRENT_TIMESTAMP
         ORDER BY created_at ASC LIMIT 20`
      );
      for (const refund of pendingRefunds.rows) {
        await processRefundPayout(refund.id);
      }
    } catch (err) {
      console.error('[CRON] Refund payout retry error:', err.message);
    }
  });

  // ───── Cron: Process stale pending orders via pay-status poll (every 5 minutes) ─────
  cron.schedule('*/5 * * * *', async () => {
    try {
      const staleOrders = await pool.query(
        `SELECT id, buyer_id, moncash_reference FROM orders
         WHERE status = 'pending' AND payment_method = 'moncash' AND created_at < NOW() - INTERVAL '10 minutes'
         ORDER BY created_at ASC LIMIT 10`
      );
      if (staleOrders.rows.length === 0) return;

      console.log(`[CRON] Processing ${staleOrders.rows.length} stale pending orders`);

      for (const order of staleOrders.rows) {
        const referenceId = order.moncash_reference || order.id;
        try {
          const payStatusUrl = (process.env.MONCASH_PAY_CREATE_URL || 'https://api.moncashconnect.com/v1/pay-create')
            .replace('pay-create', 'pay-status') + `?referenceId=${encodeURIComponent(referenceId)}`;
          const moncashRes = await fetch(payStatusUrl, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${process.env.MCC_KEY}` },
            signal: AbortSignal.timeout(15000),
          });

          if (!moncashRes.ok) continue;
          const data = await moncashRes.json();

          if (data.status === 'completed' || data.paid === true) {
            const client = await pool.connect();
            try {
              await client.query('BEGIN');
              const updateResult = await client.query(
                `UPDATE orders SET status = 'paid', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'pending'`,
                [order.id]
              );
              if (updateResult.rowCount === 0) {
                await client.query('ROLLBACK');
                continue;
              }
              await logOrderEvent(order.id, 'payment_received', null, 'pending', 'paid', 'Payment confirmed via stale-order cron', client);
              await reserveOrderStock(client, order.id);
              await recordProductCooccurrences(order.id, client);
              const items = { rows: await getSellerPaymentAllocations(client, order.id) };
              for (const item of items.rows) {
                if (item.seller_id) {
                  const grossAmount = parseFloat(item.paid_total);
                  const commissionBase = parseFloat(item.commission_base ?? grossAmount);
                  const collectionFee = parseFloat(item.collection_fee_amount || 0);
                  const tierRes = await client.query('SELECT seller_tier FROM users WHERE id = $1', [item.seller_id]);
                  const sellerTier = tierRes.rows[0]?.seller_tier || 'none';
                  const rate = getCommissionRate(sellerTier);
                  const commission = Math.round(commissionBase * rate * 100) / 100;
                  const net = Math.round((grossAmount - commission - collectionFee) * 100) / 100;
                  await client.query(
                    `INSERT INTO order_escrow (order_id, seller_id, gross_amount, commission_base, collection_fee_amount, commission_amount, net_amount, status)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, 'held') ON CONFLICT (order_id, seller_id) DO UPDATE SET gross_amount = $3, commission_base = $4, collection_fee_amount = $5, commission_amount = $6, net_amount = $7, status = 'held'`,
                    [order.id, item.seller_id, grossAmount, commissionBase, collectionFee, commission, net]
                  );
                  await client.query(
                    `INSERT INTO platform_revenue (order_id, seller_id, seller_tier, gross_amount, commission_base, collection_fee_amount, commission_rate, commission_amount, platform_fee, net_to_seller)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                    [order.id, item.seller_id, sellerTier, grossAmount, commissionBase, collectionFee, rate, commission, commission, net]
                  );
                }
              }
              await client.query('COMMIT');
              client.release();
              console.log(`[CRON] Stale order ${order.id} processed (payment confirmed)`);
              const sellerIds = items.rows.map(r => r.seller_id).filter(Boolean);
              for (const sid of sellerIds) {
                createNotification(sid, 'order_status', 'Payment Received', 'Payment held in escrow until exchange confirmed', { orderId: order.id });
              }
              createNotification(order.buyer_id, 'payment_confirmed', 'Payment Confirmed', 'Your payment was successful.', { orderId: order.id });
            } catch (e) {
              try { await client.query('ROLLBACK'); } catch {}
              client.release();
              console.error(`[CRON] Error processing stale order ${order.id}:`, e.message);
            }
          } else if (data.status === 'failed' || data.status === 'expired') {
            const cancelResult = await pool.query("UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'pending'", [order.id]);
            if (cancelResult.rowCount > 0) {
              console.log(`[CRON] Stale order ${order.id} cancelled (payment ${data.status})`);
              createNotification(order.buyer_id, 'order_status', 'Payment Failed', 'Your payment could not be processed. The order has been cancelled.', { orderId: order.id });
            }
          }
        } catch (e) {
          console.error(`[CRON] Pay-status poll error for ${order.id}:`, e.message);
        }
      }
    } catch (err) {
      console.error('[CRON] Stale order check error:', err.message);
    }
  });

  // ───── Cron: Expire stale offers (every 15 minutes) ─────
  cron.schedule('*/15 * * * *', async () => {
    try {
      const expired = await pool.query(
        "UPDATE message_offers SET status = 'expired' WHERE status IN ('pending', 'countered') AND expires_at < CURRENT_TIMESTAMP RETURNING buyer_id, product_id"
      );
      if (expired.rows.length > 0) {
        console.log(`[CRON] Expired ${expired.rows.length} stale offers`);
        for (const row of expired.rows) {
          const productInfo = await pool.query('SELECT name FROM products WHERE id = $1', [row.product_id]);
          createNotification(row.buyer_id, 'new_message', 'Offer Expired',
            `Your offer for "${productInfo.rows[0]?.name || 'a product'}" has expired.`,
            {});
        }
      }
    } catch (err) {
      console.error('[CRON] Offer expiry error:', err.message);
    }
  });

  // ───── Cron: Clean up old read notifications (daily at 3 AM) ─────
  cron.schedule('0 3 * * *', async () => {
    await cleanupOldNotifications();
  });

  // ───── Auto-expire expired offers (every 5 minutes) ─────
  cron.schedule('*/5 * * * *', async () => {
    try {
      const result = await pool.query(
        `UPDATE message_offers SET status = 'expired'
         WHERE status = 'pending' AND expires_at < NOW()
         RETURNING id`
      );
      const countered = await pool.query(
        `UPDATE message_offers SET status = 'expired'
         WHERE status = 'countered' AND expires_at < NOW()
         RETURNING id`
      );
      const total = result.rowCount + countered.rowCount;
      if (total > 0) console.log(`[OFFER EXPIRY] Auto-expired ${total} offers`);
    } catch (err) {
      console.error('[OFFER EXPIRY] Error:', err.message);
    }
  });

  // ───── Cron: Release expired stock reservations (every 5 minutes) ─────
  cron.schedule('*/5 * * * *', async () => {
    try {
      // Idempotent: mark as released first (atomic), then increment stock only if row was returned
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const expired = await client.query(`
          UPDATE stock_reservations SET status = 'released', released_at = CURRENT_TIMESTAMP
          WHERE id IN (
            SELECT sr.id FROM stock_reservations sr
            LEFT JOIN pending_checkouts pc ON sr.checkout_id = pc.id
            WHERE sr.status = 'active'
              AND (pc.status IN ('expired', 'failed') OR sr.expires_at < NOW())
            LIMIT 50
          )
          RETURNING product_id, quantity, order_id, seller_id
        `);
        const handledNatCashPortions = new Set();
        for (const r of expired.rows) {
          await client.query('UPDATE products SET stock = stock + $1 WHERE id = $2', [r.quantity, r.product_id]);
          if (!r.order_id || !r.seller_id) continue;
          const portionKey = `${r.order_id}:${r.seller_id}`;
          if (handledNatCashPortions.has(portionKey)) continue;
          handledNatCashPortions.add(portionKey);
          const cancelled = await client.query(
            `UPDATE seller_fulfillments SET payment_status = 'expired', fulfillment_status = 'cancelled', updated_at = CURRENT_TIMESTAMP
             WHERE order_id = $1 AND seller_id = $2 AND payment_method = 'natcash'
               AND payment_status IN ('pending','buyer_claimed','disputed') RETURNING seller_id`, [r.order_id, r.seller_id]
          );
          if (!cancelled.rowCount) continue;
          await client.query(
            `INSERT INTO order_events (order_id, event_type, note)
             VALUES ($1, 'status_change', 'Unresolved NatCash handoff exceeded 24 hours. This seller portion was cancelled and its stock released.')`, [r.order_id]
          );
          const remaining = await client.query(
            `SELECT COUNT(*) FILTER (WHERE fulfillment_status NOT IN ('cancelled','completed'))::int AS open,
                    COUNT(*) FILTER (WHERE fulfillment_status = 'completed')::int AS completed
             FROM seller_fulfillments WHERE order_id = $1`, [r.order_id]
          );
          if (remaining.rows[0].open === 0) {
            await client.query("UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2", [remaining.rows[0].completed > 0 ? 'completed' : 'cancelled', r.order_id]);
          }
          const parties = await client.query(
            `SELECT o.buyer_id, u.id AS seller_id FROM orders o JOIN users u ON u.id = $2 WHERE o.id = $1`, [r.order_id, r.seller_id]
          );
          if (parties.rows[0]) {
            createNotification(parties.rows[0].buyer_id, 'order_cancelled', 'NatCash handoff expired', 'The unresolved transfer window ended. This seller portion was cancelled and the reserved item is available again.', { orderId: r.order_id, sellerId: r.seller_id });
            createNotification(parties.rows[0].seller_id, 'order_cancelled', 'NatCash handoff expired', 'The unresolved transfer window ended. This seller portion was cancelled and the reserved item is available again.', { orderId: r.order_id, sellerId: r.seller_id });
          }
        }
        const expiredCheckouts = await client.query(
          `UPDATE pending_checkouts pc SET status = 'expired'
           WHERE pc.status IN ('pending', 'agreement_locked')
             AND pc.expires_at <= NOW()
             AND NOT EXISTS (SELECT 1 FROM stock_reservations sr WHERE sr.checkout_id = pc.id AND sr.status = 'active')
           RETURNING pc.id, pc.user_id`
        );
        await client.query(
          `UPDATE message_offers mo SET accepted_checkout_id = NULL
           FROM pending_checkouts pc
           WHERE mo.accepted_checkout_id = pc.id
             AND (pc.status IN ('expired', 'failed', 'rejected') OR NOT EXISTS (
               SELECT 1 FROM stock_reservations sr
               WHERE sr.product_id = mo.product_id AND sr.status = 'active'
                 AND (sr.checkout_id = pc.id OR sr.order_id = pc.order_id)
             ))
             AND mo.status = 'accepted' AND mo.accepted_expires_at > CURRENT_TIMESTAMP`
        );
        await client.query('COMMIT');
        if (expired.rows.length > 0) console.log(`[CRON] Released ${expired.rows.length} expired stock reservations`);
        for (const checkout of expiredCheckouts.rows) {
          createNotification(checkout.user_id, 'fulfillment_expired', 'Meetup proposal expired', 'No final meetup agreement was reached in 24 hours, so the reserved items were released.', { pendingId: checkout.id });
          const sellers = await pool.query('SELECT seller_id FROM pending_fulfillment_agreements WHERE checkout_id = $1', [checkout.id]);
          for (const seller of sellers.rows) createNotification(seller.seller_id, 'fulfillment_proposal_expired', 'Meetup proposal expired', 'The buyer’s checkout expired and its reserved items were released.', { pendingId: checkout.id });
        }
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    } catch (err) {
      console.error('[STOCK RELEASE] Error:', err.message);
    }
  });

  // ───── Cron: Expire NatCash payment sessions (every 1 minute) ─────
  // Releases stock ONLY for the specific seller whose session expired
  cron.schedule('* * * * *', async () => {
    try {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Find expired pending sessions
        const expired = await client.query(`
          UPDATE natcash_payment_sessions
          SET status = 'expired'
          WHERE status = 'pending' AND expires_at < NOW()
          RETURNING id, checkout_id, seller_id
        `);

        for (const sess of expired.rows) {
          // Release stock for THIS seller's products only
          const released = await client.query(`
            UPDATE stock_reservations sr SET status = 'released', released_at = CURRENT_TIMESTAMP
            FROM products p
            WHERE sr.product_id = p.id
              AND sr.checkout_id = $1
              AND p.seller_id = $2
              AND sr.status = 'active'
            RETURNING sr.product_id, sr.quantity
          `, [sess.checkout_id, sess.seller_id]);

          for (const r of released.rows) {
            await client.query('UPDATE products SET stock = stock + $1 WHERE id = $2', [r.quantity, r.product_id]);
          }

          // Notify buyer that this seller's session expired
          const pcRes = await client.query('SELECT user_id FROM pending_checkouts WHERE id = $1', [sess.checkout_id]);
          if (pcRes.rows.length > 0) {
            const { createNotification } = await import('../utils/notifications.js');
            createNotification(
              pcRes.rows[0].user_id, 'payment_failed', 'NatCash Payment Expired',
              'A seller payment window expired. Retry payment for that seller.',
              { pendingId: sess.checkout_id }
            );
          }
        }

        await client.query('COMMIT');
        if (expired.rows.length > 0) {
          console.log(`[NATCASH CRON] Expired ${expired.rows.length} NatCash sessions, released per-seller stock`);
        }
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    } catch (err) {
      console.error('[NATCASH CRON] Error:', err.message);
    }
  });

  // ───── Cron: Daily Summary notifications (hourly check) ─────
  cron.schedule('0 * * * *', async () => {
    try {
      const now = new Date();
      const currentH = String(now.getHours()).padStart(2, '0');
      const currentSlot = `${currentH}:00`;

      // Find users whose daily summary time or quiet hours end matches current hour
      const usersRes = await pool.query(`
        SELECT id, push_token, notification_preferences
        FROM users
        WHERE push_token IS NOT NULL
          AND notification_preferences IS NOT NULL
      `);

      for (const u of usersRes.rows) {
        const prefs = u.notification_preferences || {};
        const qh = prefs.quiet_hours || {};
        let summaryTime = prefs.daily_summary_time || '09:00';
        if (qh.enabled && qh.end) {
          summaryTime = qh.end;
        }

        const [sumH] = summaryTime.split(':');
        if (String(sumH).padStart(2, '0') === currentH) {
          // Check for unread, non-urgent notifications in past 24 hours that haven't been summarized
          const notifsRes = await pool.query(`
            SELECT id, title, type
            FROM notifications
            WHERE user_id = $1
              AND is_read = false
              AND action_required = false
              AND created_at >= NOW() - INTERVAL '24 hours'
              AND (data->>'summarized') IS NULL
              AND type NOT IN ('new_message', 'new_offer', 'counter_offer', 'offer_accepted', 'offer_declined', 'offer_expired')
          `, [u.id]);

          const count = notifsRes.rows.length;
          if (count > 0) {
            // Push summary preview: short headline and count only (details stay in app)
            const title = 'MaurMaket Summary';
            const body = count === 1 ? 'You have 1 update to check.' : `You have ${count} updates to check.`;
            await sendPushNotification(u.id, title, body, { type: 'daily_summary' }, 'daily_summary');

            // Mark as summarized
            const ids = notifsRes.rows.map(r => r.id);
            await pool.query(`
              UPDATE notifications
              SET data = jsonb_set(COALESCE(data, '{}'::jsonb), '{summarized}', 'true')
              WHERE id = ANY($1::uuid[])
            `, [ids]);
          }
        }
      }
    } catch (err) {
      console.error('[DAILY SUMMARY CRON] Error:', err.message);
    }
  });

  // ───── Cron: Single reminder before time-limited action expires (every 15 min) ─────
  cron.schedule('*/15 * * * *', async () => {
    try {
      // Find unresolved actions expiring within 2 hours that haven't had a reminder sent
      const expiringRes = await pool.query(`
        SELECT id, user_id, type, title, data, action_deadline
        FROM notifications
        WHERE action_required = true
          AND action_resolved = false
          AND is_read = false
          AND action_deadline IS NOT NULL
          AND action_deadline > NOW()
          AND action_deadline <= NOW() + INTERVAL '2 hours'
          AND (data->>'reminder_sent') IS NULL
      `);

      for (const row of expiringRes.rows) {
        const title = 'Expiring Soon: Action Needed';
        const body = `Your response is needed soon: ${row.title}`;
        await sendPushNotification(row.user_id, title, body, { ...(row.data || {}), type: row.type }, row.type);

        await pool.query(`
          UPDATE notifications
          SET data = jsonb_set(COALESCE(data, '{}'::jsonb), '{reminder_sent}', 'true')
          WHERE id = $1
        `, [row.id]);
      }
    } catch (err) {
      console.error('[ACTION REMINDER CRON] Error:', err.message);
    }
  });

  // ───── Cron: Expired business subscriptions & tier-cap enforcement (hourly) ─────
  cron.schedule('0 * * * *', async () => {
    await checkAndProcessExpiredSubscriptions();
  });

  console.log('[JOBS] All cron jobs started: meetup timeout, refund retry, stale orders, offer expiry, notification cleanup, stock release, natcash session expiry, daily summary, action reminders, tier cap check');
}
