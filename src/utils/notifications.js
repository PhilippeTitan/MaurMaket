import { Expo } from 'expo-server-sdk';
import { pool } from '../config/database.js';

const expo = new Expo();

// Notification helper
async function createNotification(userId, type, title, body, data, db) {
  const exec = db || pool;
  try {
    await exec.query(
      `INSERT INTO notifications (user_id, type, title, body, data) VALUES ($1, $2, $3, $4, $5)`,
      [userId, type, title, body || null, data ? JSON.stringify(data) : null]
    );
  } catch (err) {
    console.error('Failed to create notification:', err);
  }
  // Fire-and-forget push notification
  sendPushNotification(userId, title, body, data);
}

// Push notification helper (fire-and-forget)
async function sendPushNotification(userId, title, body, data) {
  try {
    const result = await pool.query('SELECT push_token FROM users WHERE id = $1', [userId]);
    const token = result.rows[0]?.push_token;
    if (!token || !Expo.isExpoPushToken(token)) return;
    const payload = {
      to: token,
      title,
      body: body || '',
      data: data || {},
      sound: 'default',
      badge: 1,
    };
    // Look up rich image for push notification based on type
    try {
      if (data?.type === 'new_message' && data.senderId) {
        const avatarRes = await pool.query('SELECT avatar_url FROM users WHERE id = $1', [data.senderId]);
        if (avatarRes.rows[0]?.avatar_url) {
          payload.icon = avatarRes.rows[0].avatar_url;
        }
      } else if (data?.type === 'new_product_from_followed' && data.productId) {
        const imgRes = await pool.query('SELECT image_url FROM product_images WHERE product_id = $1 AND is_primary = true LIMIT 1', [data.productId]);
        if (imgRes.rows[0]?.image_url) {
          payload.icon = imgRes.rows[0].image_url;
        }
      } else if (data?.orderId && ['order_status', 'payment_confirmed', 'payment_failed', 'order_cancelled', 'review_received', 'meetup_proposed', 'meetup_confirmed', 'meetup_expired'].includes(data.type)) {
        const imgRes = await pool.query(
          `SELECT pi.image_url FROM product_images pi
           JOIN order_items oi ON oi.product_id = pi.product_id
           WHERE oi.order_id = $1 AND pi.is_primary = true
           LIMIT 1`, [data.orderId]
        );
        if (imgRes.rows[0]?.image_url) {
          payload.icon = imgRes.rows[0].image_url;
        }
      }
    } catch (imgErr) {
      // Image lookup is best-effort — don't block the notification
    }
    await expo.sendPushNotificationsAsync([payload]);
  } catch (err) {
    console.error('Push notification failed:', err.message);
  }
}

export { createNotification, sendPushNotification };
