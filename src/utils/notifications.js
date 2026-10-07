import { Expo } from 'expo-server-sdk';
import { pool } from '../config/database.js';
import { publishUserEvent } from './realtime.js';

const expo = new Expo();

// In-memory follow burst tracker for debouncing follower pushes
// userId -> { count: number, firstTime: number, timer: NodeJS.Timeout, firstFollowerName: string }
const followBurstTracker = new Map();

// Types that require user action to resolve
const ACTION_REQUIRED_TYPES = new Set([
  'fulfillment_proposed',
  'fulfillment_countered',
  'meetup_proposed',
  'payment_failed',
  'dispute_opened',
  'cancellation_requested',
  'low_stock',
  'product_sold_out',
  'verification_rejected',
  'subscription_expired',
  'natcash_access_expiry',
]);

// Urgent types that always send immediate push alerts
const URGENT_TYPES = new Set([
  // Security / Account
  'account_security',
  'password_changed',
  'new_sign_in',
  'account_frozen',
  'account_unfrozen',
  'second_factor_removed',
  'trusted_device_revoked',
  'verification_rejected',
  // Orders / Payments / Escrow / Payouts
  'order_status',
  'payment_confirmed',
  'payment_failed',
  'payment_received',
  'escrow_held',
  'escrow_released',
  'escrow_refunded',
  'payout_failed',
  'seller_debt_payment',
  'seller_debt_paid',
  'order_cancelled',
  'order_placed',
  'new_order',
  // Meetup / Fulfillment
  'fulfillment_proposed',
  'fulfillment_countered',
  'fulfillment_accepted',
  'fulfillment_rejected',
  'fulfillment_expired',
  'fulfillment_proposal_expired',
  'meetup_proposed',
  'meetup_confirmed',
  'meetup_expired',
  // Disputes
  'dispute_opened',
  'cancellation_requested',
  'cancellation_response',
  'dispute_resolved',
  // Inventory
  'low_stock',
  'product_sold_out',
  // Expirations
  'subscription_expired',
  'natcash_access_expiry',
  // Offers
  'new_offer',
  'counter_offer',
  'offer_accepted',
  'offer_declined',
  'offer_expired',
  // Follows (immediate push per Philippe, with burst bundling)
  'new_follower',
]);

// Types that can be grouped within a rolling 24-hour window
const GROUPABLE_TYPES = new Set([
  'new_follower',
  'new_product_from_followed',
  'product_saved',
]);

function isUrgentNotification(type) {
  return URGENT_TYPES.has(type);
}

// Only these non-urgent event families can be routed to the daily summary.
// Unknown notification types remain in-app until a delivery policy is defined.
function getNotificationCategory(type) {
  if (type === 'review_received') return 'reviews';
  // Review reminders follow the reviews preference (no immediate push by default).
  if (type === 'review_reminder') return 'reviews';
  if (type === 'new_product_from_followed') return 'seller_updates';
  if (type === 'price_drop') return 'price_drops';
  if (type === 'promotional' || type === 'marketing') return 'marketing_promos';
  if (type === 'low_stock' || type === 'product_sold_out') return 'inventory_alerts';
  if (['new_follower'].includes(type)) return 'follows';
  if (['new_offer', 'counter_offer', 'offer_accepted', 'offer_declined', 'offer_expired'].includes(type)) return 'offers';
  return null;
}

function isDailySummaryEligible(type, preferences = {}) {
  if (isUrgentNotification(type)) return false;
  const category = getNotificationCategory(type);
  return !!category && preferences.categories?.[category] === 'daily_summary';
}

function isValidTime(value) {
  return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function getLocalClock(date, timeZone) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone || 'America/Port-au-Prince',
      weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(date);
    const get = type => parts.find(part => part.type === type)?.value;
    const dayIndex = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[get('weekday')];
    return { day: dayIndex, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
  } catch {
    const local = new Date(date);
    return { day: local.getDay(), minutes: local.getHours() * 60 + local.getMinutes() };
  }
}

function matchesQuietHoursDay(day, days) {
  const isWeekend = day === 0 || day === 6;
  return days === 'all' || (days === 'weekdays' && !isWeekend) || (days === 'weekends' && isWeekend);
}

function isQuietHoursScheduleEndingToday(quietHoursConfig, timeZone, date = new Date()) {
  if (!quietHoursConfig?.enabled) return false;
  const start = quietHoursConfig.start || '22:00';
  const end = quietHoursConfig.end || '08:00';
  if (!isValidTime(start) || !isValidTime(end) || start === end) return false;
  const { day } = getLocalClock(date, timeZone);
  const [startH, startM] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);
  const scheduleDay = startH * 60 + startM > endH * 60 + endM ? (day + 6) % 7 : day;
  return matchesQuietHoursDay(scheduleDay, quietHoursConfig.days || 'all');
}

function isQuietHoursEndNow(quietHoursConfig, timeZone, date = new Date()) {
  if (!quietHoursConfig?.enabled) return false;
  const start = quietHoursConfig.start || '22:00';
  const end = quietHoursConfig.end || '08:00';
  if (!isValidTime(start) || !isValidTime(end)) return false;
  const local = getLocalClock(date, timeZone);
  const [startH, startM] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);
  const startMins = startH * 60 + startM;
  const endMins = endH * 60 + endM;
  if (startMins === endMins || local.minutes !== endMins) return false;
  const scheduleDay = startMins > endMins ? (local.day + 6) % 7 : local.day;
  return matchesQuietHoursDay(scheduleDay, quietHoursConfig.days || 'all');
}

function isQuietHoursActive(quietHoursConfig, timeZone = 'America/Port-au-Prince', date = new Date()) {
  if (!quietHoursConfig?.enabled) return false;
  try {
    const { start = '22:00', end = '08:00', days = 'all' } = quietHoursConfig;
    if (!isValidTime(start) || !isValidTime(end)) return false;
    const { day, minutes: currentMins } = getLocalClock(date, timeZone);
    const [startH, startM] = start.split(':').map(Number);
    const [endH, endM] = end.split(':').map(Number);
    const startMins = startH * 60 + startM;
    const endMins = endH * 60 + endM;
    if (startMins === endMins) return false;

    if (startMins <= endMins) {
      if (!matchesQuietHoursDay(day, days)) return false;
      return currentMins >= startMins && currentMins < endMins;
    } else {
      // For the after-midnight tail, the selected day is the day quiet hours began.
      if (currentMins >= startMins) return matchesQuietHoursDay(day, days);
      if (currentMins < endMins) return matchesQuietHoursDay((day + 6) % 7, days);
      return false;
    }
  } catch {
    return false;
  }
}

function sanitizeForLockScreen(type, title, body) {
  // Hide sensitive details (payment amounts, dispute reasons, message text) by default
  switch (type) {
    case 'new_sign_in':
      // A security alert is useful on the lock screen, but never carries the
      // device detail, tokens, or addresses — the safe next step is enough.
      return { title: 'New sign-in', body: 'A new device signed in. If this was not you, open MaurMaket to secure your account.' };
    case 'account_frozen':
      // Freeze state is safety-relevant, so it shows on the lock screen — but
      // without any of the owner's free-text reason.
      return { title: 'Account frozen', body: 'New listings and payouts are paused. Open MaurMaket to review your account.' };
    case 'account_unfrozen':
      return { title: 'Account restored', body: 'Your account is active again. Open MaurMaket to review your security activity.' };
    case 'second_factor_removed':
      // Never names which factor or the device detail on the lock screen; the
      // safe next step (open the app and review) is enough.
      return { title: 'Sign-in method removed', body: 'A sign-in method was removed from your account. If this was not you, open MaurMaket to secure it.' };
    case 'trusted_device_revoked':
      // Revocation tightens the account, so the reset is useful on the lock
      // screen — without naming the device or how many were removed.
      return { title: 'Trusted device removed', body: 'A device must verify a code again. If this was not you, open MaurMaket to review.' };
    case 'payment_confirmed':
      return { title: 'Payment Confirmed', body: 'Payment received. Open MaurMaket to view order details.' };
    case 'payment_failed':
      return { title: 'Payment Issue', body: 'A payment requires your attention. Open MaurMaket to review.' };
    case 'escrow_held':
    case 'escrow_released':
    case 'escrow_refunded':
      return { title: 'Escrow Update', body: 'An escrow update is available for your order.' };
    case 'payout_failed':
      return { title: 'Payout Alert', body: 'A payout requires your attention. Open MaurMaket to review.' };
    case 'dispute_opened':
      return { title: 'Dispute Opened', body: 'A dispute was opened on your order. Please review and respond.' };
    case 'cancellation_requested':
      return { title: 'Cancellation request', body: 'A cancellation request needs your response. Open MaurMaket to review.' };
    case 'cancellation_response':
      return { title: 'Cancellation request update', body: 'There is an update about your order cancellation request.' };
    case 'dispute_resolved':
      return { title: 'Dispute Update', body: 'A dispute update has been recorded.' };
    case 'new_message':
      return { title: title || 'New Message', body: 'You have a new message.' };
    case 'price_drop':
      // A saved item's price is not payment information; keep it useful on the lock screen
      return { title, body };
    default:
      // Strip any exact Gourde amounts from the push body for privacy
      const scrubbed = body ? body.replace(/G\s?[\d,]+(\.\d{2})?/gi, 'a payment') : body;
      return { title, body: scrubbed };
  }
}

// Notification helper
async function createNotification(userId, type, title, body, data, db) {
  // Decision: Do not notify users about their own actions
  if (data?.actorId && data.actorId === userId) return;

  const exec = db || pool;
  let saved = false;

  const isActionRequired = ACTION_REQUIRED_TYPES.has(type);
  let actionDeadline = null;
  if (isActionRequired) {
    if (data?.expiresAt) actionDeadline = new Date(data.expiresAt);
    else if (data?.scheduledAt) actionDeadline = new Date(data.scheduledAt);
    else if (['fulfillment_proposed', 'fulfillment_countered', 'meetup_proposed'].includes(type)) {
      // Default 24-hour response window
      actionDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000);
    }
  }

  // Generate 24-hour grouping key for repeated social/product activity
  let groupKey = null;
  if (GROUPABLE_TYPES.has(type)) {
    const todayStr = new Date().toISOString().slice(0, 10);
    const targetEntity = data?.sellerId || data?.productId || 'global';
    groupKey = `${type}:${targetEntity}:${todayStr}`;
  }

  try {
    // 1. Resolve / supersede previous action notifications if applicable
    if (type === 'meetup_proposed' && data?.orderId) {
      // A newer location proposal replaces the prior pending response for this order.
      // Keep the old activity in history while removing it from Action needed.
      await exec.query(
        `UPDATE notifications SET action_resolved = true
         WHERE user_id = $1 AND (data->>'orderId') = $2 AND type = 'meetup_proposed' AND action_resolved = false`,
        [userId, String(data.orderId)]
      );
    } else if (type === 'meetup_confirmed' && data?.orderId) {
      await exec.query(
        `UPDATE notifications SET action_resolved = true, is_read = true
         WHERE user_id = $1 AND (data->>'orderId') = $2 AND type = 'meetup_proposed' AND action_resolved = false`,
        [userId, String(data.orderId)]
      );
    } else if (['fulfillment_accepted', 'fulfillment_rejected'].includes(type) && data?.pendingId) {
      await exec.query(
        `UPDATE notifications SET action_resolved = true, is_read = true
         WHERE user_id = $1 AND (data->>'pendingId') = $2 AND type IN ('fulfillment_proposed', 'fulfillment_countered') AND action_resolved = false`,
        [userId, String(data.pendingId)]
      );
    } else if (type === 'cancellation_response' && data?.cancellationRequestId) {
      await exec.query(
        `UPDATE notifications SET action_resolved = true, is_read = true
         WHERE user_id = $1 AND (data->>'cancellationRequestId') = $2
           AND type = 'cancellation_requested' AND action_resolved = false`,
        [userId, String(data.cancellationRequestId)]
      );
    } else if (type === 'fulfillment_countered' && data?.pendingId) {
      // Counter supersedes prior proposal
      await exec.query(
        `UPDATE notifications SET action_resolved = true
         WHERE user_id = $1 AND (data->>'pendingId') = $2 AND type = 'fulfillment_proposed' AND action_resolved = false`,
        [userId, String(data.pendingId)]
      );
    } else if (type === 'payment_confirmed' && data?.orderId) {
      await exec.query(
        `UPDATE notifications SET action_resolved = true, is_read = true
         WHERE user_id = $1 AND (data->>'orderId') = $2 AND type = 'payment_failed' AND action_resolved = false`,
        [userId, String(data.orderId)]
      );
    } else if (type === 'dispute_resolved') {
      const orderId = data?.orderId ? String(data.orderId) : null;
      const disputeId = data?.disputeId ? String(data.disputeId) : null;
      await exec.query(
        `UPDATE notifications SET action_resolved = true, is_read = true
         WHERE user_id = $1 AND (data->>'orderId' = $2 OR data->>'disputeId' = $3) AND type = 'dispute_opened' AND action_resolved = false`,
        [userId, orderId, disputeId]
      );
    } else if (type === 'verification_approved') {
      await exec.query(
        `UPDATE notifications SET action_resolved = true, is_read = true
         WHERE user_id = $1 AND type = 'verification_rejected' AND action_resolved = false`,
        [userId]
      );
    } else if (type === 'subscription_activated') {
      await exec.query(
        `UPDATE notifications SET action_resolved = true, is_read = true
         WHERE user_id = $1 AND type = 'subscription_expired' AND action_resolved = false`,
        [userId]
      );
    } else if (['fulfillment_expired', 'fulfillment_proposal_expired', 'meetup_expired'].includes(type)) {
      const pendingId = data?.pendingId ? String(data.pendingId) : null;
      const orderId = data?.orderId ? String(data.orderId) : null;
      await exec.query(
        `UPDATE notifications SET action_resolved = true
         WHERE user_id = $1 AND (data->>'pendingId' = $2 OR data->>'orderId' = $3) AND action_resolved = false`,
        [userId, pendingId, orderId]
      );
    }

    // 2. Insert new notification
    await exec.query(
      `INSERT INTO notifications (user_id, type, title, body, data, action_required, action_deadline, group_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        userId,
        type,
        title,
        body || null,
        data ? JSON.stringify(data) : null,
        isActionRequired,
        actionDeadline,
        groupKey,
      ]
    );
    saved = true;
  } catch (err) {
    console.error('Failed to create notification:', err);
  }

  if (saved) {
    // Notify via realtime near real time
    if (db) setTimeout(() => publishUserEvent(userId, 'notification'), 400);
    else publishUserEvent(userId, 'notification');
  }

  // Handle follow bursts: send first immediately, bundle nearby follows into a 2-minute summary push
  if (type === 'new_follower') {
    handleFollowerPush(userId, title, body, data);
  } else {
    // Fire-and-forget push notification with preferences and urgency checks
    sendPushNotification(userId, title, body, data, type);
  }
}

function handleFollowerPush(userId, title, body, data) {
  const existing = followBurstTracker.get(userId);
  const now = Date.now();

  if (!existing || now - existing.firstTime > 120000) {
    // First follow in this window: send prompt push
    sendPushNotification(userId, title, body, data, 'new_follower');

    const tracker = {
      count: 0,
      firstTime: now,
      firstFollowerName: data?.followerName || 'Someone',
      timer: setTimeout(() => {
        const entry = followBurstTracker.get(userId);
        if (entry && entry.count > 0) {
          const summaryTitle = 'New Followers';
          const summaryBody = `${entry.firstFollowerName} and ${entry.count} others started following you`;
          sendPushNotification(userId, summaryTitle, summaryBody, { type: 'new_follower' }, 'new_follower');
        }
        followBurstTracker.delete(userId);
      }, 120000),
    };
    followBurstTracker.set(userId, tracker);
  } else {
    // Additional follow within 2 minutes: accumulate for summary push
    existing.count++;
  }
}

// Push notification helper (respects user preferences, quiet hours, pause, lockscreen privacy)
async function sendPushNotification(userId, title, body, data, notificationType) {
  try {
    const userRes = await pool.query(
      'SELECT push_token, notification_preferences FROM users WHERE id = $1',
      [userId]
    );
    const user = userRes.rows[0];
    const token = user?.push_token;
    if (!token || !Expo.isExpoPushToken(token)) return { status: 'skipped', reason: 'no_valid_token' };

    const prefs = user.notification_preferences || {};
    const categories = prefs.categories || {};
    const type = notificationType || data?.type || 'general';
    const isUrgent = isUrgentNotification(type);

    // 1. Check seller mute preference for new listing updates
    if (type === 'new_product_from_followed' && data?.sellerId) {
      const mutedSellers = Array.isArray(prefs.muted_seller_ids) ? prefs.muted_seller_ids : [];
      if (mutedSellers.includes(String(data.sellerId))) {
        return { status: 'skipped', reason: 'seller_muted' };
      }
    }

    // 2. Check user snooze / pause (urgent alerts continue through the pause!)
    if (!isUrgent && prefs.snooze_until) {
      const snoozeEnd = new Date(prefs.snooze_until).getTime();
      if (Date.now() < snoozeEnd) {
        return { status: 'skipped', reason: 'snoozed' };
      }
    }

    // 3. Check quiet hours (urgent alerts remain immediate!)
    if (!isUrgent && isQuietHoursActive(prefs.quiet_hours, prefs.time_zone)) {
      return { status: 'skipped', reason: 'quiet_hours' };
    }

    // 4. Check category preferences for non-urgent notifications
    if (!isUrgent && type !== 'daily_summary') {
      const category = getNotificationCategory(type);
      if (!category) {
        if (['listing_approved', 'listing_in_review', 'verification_approved', 'subscription_activated', 'natcash_access_renewed'].includes(type)) {
          return { status: 'skipped', reason: 'in_app_milestone' };
        }
        // Preserve the established immediate behavior for event types without a
        // configurable category; add a category only after its policy is defined.
      } else {
        const mode = categories[category] || (category === 'reviews' || category === 'seller_updates' ? 'daily_summary' : 'in_app');
        if (mode !== 'push_now') return { status: 'skipped', reason: `category_${mode}` };
      }
    }

    // 5. Lock-screen privacy: hide sensitive amounts and private texts if enabled (default true)
    let finalTitle = title;
    let finalBody = body || '';
    const hideSensitive = prefs.hide_sensitive_previews !== false;
    if (hideSensitive) {
      const sanitized = sanitizeForLockScreen(type, title, body);
      finalTitle = sanitized.title;
      finalBody = sanitized.body;
    }

    const payload = {
      to: token,
      title: finalTitle,
      body: finalBody,
      data: { ...(data || {}), type },
      sound: 'default',
      badge: 1,
    };

    // Look up rich image / icon for push notification
    try {
      if (type === 'new_message' && data?.senderId) {
        const avatarRes = await pool.query('SELECT avatar_url FROM users WHERE id = $1', [data.senderId]);
        if (avatarRes.rows[0]?.avatar_url) payload.icon = avatarRes.rows[0].avatar_url;
      } else if (type === 'new_follower' && data?.followerId) {
        const avatarRes = await pool.query('SELECT avatar_url FROM users WHERE id = $1', [data.followerId]);
        if (avatarRes.rows[0]?.avatar_url) payload.icon = avatarRes.rows[0].avatar_url;
      } else if (type === 'new_product_from_followed' && data?.productId) {
        const imgRes = await pool.query(
          'SELECT image_url FROM product_images WHERE product_id = $1 AND is_primary = true LIMIT 1',
          [data.productId]
        );
        if (imgRes.rows[0]?.image_url) payload.icon = imgRes.rows[0].image_url;
      } else if (data?.orderId && ['order_status', 'payment_confirmed', 'payment_failed', 'order_cancelled', 'review_received', 'meetup_proposed', 'meetup_confirmed', 'meetup_expired'].includes(type)) {
        const imgRes = await pool.query(
          `SELECT pi.image_url FROM product_images pi
           JOIN order_items oi ON oi.product_id = pi.product_id
           WHERE oi.order_id = $1 AND pi.is_primary = true
           LIMIT 1`,
          [data.orderId]
        );
        if (imgRes.rows[0]?.image_url) payload.icon = imgRes.rows[0].image_url;
      }
    } catch {
      // Best-effort image lookup
    }

    const tickets = await expo.sendPushNotificationsAsync([payload]);
    const ticket = tickets?.[0];
    if (ticket?.status === 'error') return { status: 'failed', reason: ticket.message || 'expo_rejected' };
    return { status: 'sent' };
  } catch (err) {
    console.error('Push notification failed:', err.message);
    return { status: 'failed', reason: err.message };
  }
}

export {
  createNotification,
  sendPushNotification,
  isUrgentNotification,
  isQuietHoursActive,
  getNotificationCategory,
  isDailySummaryEligible,
  isValidTime,
  getLocalClock,
  isQuietHoursEndNow,
  isQuietHoursScheduleEndingToday,
};
