import cron from 'node-cron';
import { pool } from '../config/database.js';
import { logOrderEvent, getCommissionRate, getSellerPaymentAllocations, reserveOrderStock, recordProductCooccurrences, processRefundPayout, cleanupOldNotifications } from '../utils/helpers.js';
import { createNotification } from '../utils/notifications.js';

export function startJobs() {
  // ───── Cron: Auto-refund expired meetup check-ins (every 5 minutes) ─────
  cron.schedule('*/5 * * * *', async () => {
    try {
      const expiredCheckins = await pool.query(`
        SELECT DISTINCT mc.order_id
        FROM meetup_checkins mc
        JOIN orders o ON mc.order_id = o.id
        WHERE o.status = 'paid'
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
            await client.query(
              "UPDATE order_escrow SET status = 'refunded', released_at = CURRENT_TIMESTAMP WHERE id = $1",
              [escrow.id]
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

          const buyerRes = await pool.query('SELECT phone FROM users WHERE id = $1', [order.buyer_id]);
          const buyerPhone = buyerRes.rows[0]?.phone;
          const totalRefund = parseFloat(order.total_amount);

          if (totalRefund > 0 && buyerPhone) {
            try {
              const payoutRes = await fetch(
                process.env.MONCASH_PAYOUT_CREATE_URL || 'https://hvlmeoqyxaguzcujpmit.supabase.co/functions/v1/payout-create',
                {
                  method: 'POST',
                  headers: { 'Authorization': `Bearer ${process.env.MCC_KEY}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ amount: Math.round(totalRefund), moncashNumber: buyerPhone, referenceId: `refund_${orderId}` }),
                  signal: AbortSignal.timeout(15000),
                }
              );
              if (payoutRes.ok) console.log(`[CRON] Refund G ${totalRefund} sent to buyer ${buyerPhone}`);
              else console.error(`[CRON] Refund payout failed: ${await payoutRes.text()}`);
            } catch (e) { console.error('[CRON] Refund payout error:', e.message); }
          }

          createNotification(order.buyer_id, 'order_status', 'Order Refunded',
            `Your meetup order has expired. G ${totalRefund.toFixed(0)} refunded.`, { orderId });

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
        `SELECT order_id FROM refund_payouts
         WHERE status IN ('pending', 'failed') AND next_attempt_at <= CURRENT_TIMESTAMP
         ORDER BY created_at ASC LIMIT 20`
      );
      for (const refund of pendingRefunds.rows) {
        await processRefundPayout(refund.order_id);
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
         WHERE status = 'pending' AND created_at < NOW() - INTERVAL '10 minutes'
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
                  const tierRes = await client.query('SELECT seller_tier FROM users WHERE id = $1', [item.seller_id]);
                  const sellerTier = tierRes.rows[0]?.seller_tier || 'none';
                  const rate = getCommissionRate(sellerTier);
                  const commission = Math.round(grossAmount * rate * 100) / 100;
                  const net = Math.round((grossAmount - commission) * 100) / 100;
                  await client.query(
                    `INSERT INTO order_escrow (order_id, seller_id, gross_amount, commission_amount, net_amount, status)
                     VALUES ($1, $2, $3, $4, $5, 'held') ON CONFLICT (order_id, seller_id) DO UPDATE SET gross_amount = $3, commission_amount = $4, net_amount = $5, status = 'held'`,
                    [order.id, item.seller_id, grossAmount, commission, net]
                  );
                  await client.query(
                    `INSERT INTO platform_revenue (order_id, seller_id, seller_tier, gross_amount, commission_rate, commission_amount, platform_fee, net_to_seller)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                    [order.id, item.seller_id, sellerTier, grossAmount, rate, commission, commission, net]
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
          RETURNING product_id, quantity
        `);
        for (const r of expired.rows) {
          await client.query('UPDATE products SET stock = stock + $1 WHERE id = $2', [r.quantity, r.product_id]);
        }
        await client.query('COMMIT');
        if (expired.rows.length > 0) console.log(`[CRON] Released ${expired.rows.length} expired stock reservations`);
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

  console.log('[JOBS] All cron jobs started: meetup timeout, refund retry, stale orders, offer expiry, notification cleanup, stock release');
}
