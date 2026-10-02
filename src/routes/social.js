import { Router } from 'express';
import { pool } from '../config/database.js';
import { authRequired, dobRequired } from '../middleware/auth.js';
import { createNotification } from '../utils/notifications.js';

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════════
// SAVED ADDRESSES
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/addresses', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM saved_addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC`,
      [req.user.id]
    );
    res.json({ addresses: result.rows });
  } catch (err) {
    console.error('Addresses fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/addresses', authRequired, dobRequired, async (req, res) => {
  const { label, name, phone, address, city, isDefault } = req.body;
  if (!name || !phone || !address || !city) {
    return res.status(400).json({ error: 'Name, phone, address, and city required' });
  }
  try {
    const cleanPhone = phone.replace(/^\+/, '');
    if (isDefault) {
      await pool.query('UPDATE saved_addresses SET is_default = false WHERE user_id = $1', [req.user.id]);
    }
    const result = await pool.query(
      `INSERT INTO saved_addresses (user_id, label, name, phone, address, city, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.user.id, label || null, name, cleanPhone, address, city, isDefault || false]
    );
    res.status(201).json({ address: result.rows[0] });
  } catch (err) {
    console.error('Address create error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/addresses/:id', authRequired, async (req, res) => {
  const { label, name, phone, address, city, isDefault } = req.body;
  try {
    const check = await pool.query('SELECT id FROM saved_addresses WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Address not found' });
    const cleanPhone = phone ? phone.replace(/^\+/, '') : undefined;
    if (isDefault) {
      await pool.query('UPDATE saved_addresses SET is_default = false WHERE user_id = $1', [req.user.id]);
    }
    const result = await pool.query(
      `UPDATE saved_addresses SET label = COALESCE($1, label), name = COALESCE($2, name), phone = COALESCE($3, phone), address = COALESCE($4, address), city = COALESCE($5, city), is_default = COALESCE($6, is_default) WHERE id = $7 RETURNING *`,
      [label, name, cleanPhone, address, city, isDefault, req.params.id]
    );
    res.json({ address: result.rows[0] });
  } catch (err) {
    console.error('Address update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/addresses/:id', authRequired, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM saved_addresses WHERE id = $1 AND user_id = $2 RETURNING id', [req.params.id, req.user.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Address not found' });
    res.json({ deleted: true });
  } catch (err) {
    console.error('Address delete error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// REVIEWS & RATINGS
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// REVIEWS LIFECYCLE (verified purchase, 90 days, 1 review/order, reply & edit)
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/reviews', authRequired, dobRequired, async (req, res) => {
  const { orderId, rating, comment } = req.body;
  const numRating = Number(rating);
  if (!orderId || !Number.isInteger(numRating) || numRating < 1 || numRating > 5) {
    return res.status(400).json({ error: 'orderId and integer rating (1-5) required' });
  }
  if (comment !== undefined && comment !== null && String(comment).length > 2000) {
    return res.status(400).json({ error: 'Comment must be 2000 characters or less' });
  }

  try {
    // 1. Order must be completed by this buyer
    const orderRes = await pool.query(
      `SELECT o.*,
              (SELECT COUNT(*) FROM disputes d WHERE d.order_id = o.id AND d.status = 'open') AS open_disputes_count,
              (SELECT COALESCE(SUM(rp.amount), 0) FROM refund_payouts rp WHERE rp.order_id = o.id AND rp.status = 'completed') AS total_refunded_completed
       FROM orders o
       WHERE o.id = $1 AND o.buyer_id = $2 AND o.status = 'completed'`,
      [orderId, req.user.id]
    );

    if (orderRes.rows.length === 0) {
      return res.status(400).json({ error: 'Only completed orders can be reviewed' });
    }

    const order = orderRes.rows[0];

    // Defer review eligibility while a dispute is open
    if (parseInt(order.open_disputes_count, 10) > 0) {
      return res.status(400).json({ error: 'Cannot review while a dispute is open' });
    }

    // Exclude fully refunded orders
    const totalRefunded = parseFloat(order.total_refunded_completed || 0);
    const totalAmount = parseFloat(order.total_amount || 0);
    if (totalAmount > 0 && totalRefunded >= totalAmount) {
      return res.status(400).json({ error: 'Fully refunded orders are not eligible for review' });
    }

    // Check 90-day review window
    const orderDate = new Date(order.updated_at || order.created_at);
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    if (orderDate < ninetyDaysAgo) {
      return res.status(400).json({ error: 'Reviews must be submitted within 90 days of order completion' });
    }

    const sellerResult = await pool.query(
      'SELECT DISTINCT seller_id FROM order_items WHERE order_id = $1 LIMIT 1',
      [orderId]
    );
    const sellerId = sellerResult.rows[0]?.seller_id;
    if (!sellerId) return res.status(400).json({ error: 'No seller found for this order' });

    const result = await pool.query(
      `INSERT INTO reviews (order_id, reviewer_id, seller_id, rating, comment, is_edited)
       VALUES ($1, $2, $3, $4, $5, false) RETURNING *`,
      [orderId, req.user.id, sellerId, numRating, comment || null]
    );

    const reviewer = await pool.query('SELECT full_name, username, show_real_name FROM users WHERE id = $1', [req.user.id]);
    const reviewerRow = reviewer.rows[0];
    const reviewerName = (reviewerRow?.show_real_name && reviewerRow?.full_name) ? reviewerRow.full_name : (reviewerRow?.username || 'A buyer');
    createNotification(sellerId, 'review_received', 'New Review', `${reviewerName} left a ${numRating}-star review`, { orderId, reviewId: result.rows[0].id });

    res.status(201).json({ review: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'You already reviewed this order' });
    console.error('Review create error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/reviews/:id', authRequired, async (req, res) => {
  const { rating, comment } = req.body;
  if (rating !== undefined && (!Number.isInteger(Number(rating)) || Number(rating) < 1 || Number(rating) > 5)) {
    return res.status(400).json({ error: 'Rating must be an integer from 1 to 5' });
  }
  if (comment !== undefined && comment !== null && String(comment).length > 2000) {
    return res.status(400).json({ error: 'Comment is too long (max 2000 characters)' });
  }
  try {
    const existing = await pool.query(
      'SELECT * FROM reviews WHERE id = $1 AND reviewer_id = $2',
      [req.params.id, req.user.id]
    );
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Review not found' });
    const prevReview = existing.rows[0];

    const result = await pool.query(
      `UPDATE reviews
       SET rating = COALESCE($1, rating),
           comment = COALESCE($2, comment),
           is_edited = true,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 AND reviewer_id = $4
       RETURNING *`,
      [rating !== undefined ? Number(rating) : null, comment !== undefined ? comment : null, req.params.id, req.user.id]
    );

    // If seller already replied, notify seller that the buyer edited the review
    if (prevReview.seller_response) {
      const buyerRes = await pool.query('SELECT full_name, username, show_real_name FROM users WHERE id = $1', [req.user.id]);
      const buyer = buyerRes.rows[0];
      const buyerName = (buyer?.show_real_name && buyer?.full_name) ? buyer.full_name : (buyer?.username || 'A buyer');
      createNotification(prevReview.seller_id, 'review_edited', 'Review Updated', `${buyerName} updated their review`, {
        orderId: prevReview.order_id,
        reviewId: prevReview.id
      });
    }

    res.json({ review: result.rows[0] });
  } catch (err) {
    console.error('Review update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Post single public reply to a review
router.post('/reviews/:id/reply', authRequired, async (req, res) => {
  const { reply } = req.body;
  if (!reply || !String(reply).trim()) return res.status(400).json({ error: 'Reply text is required' });
  if (String(reply).length > 1000) return res.status(400).json({ error: 'Reply is too long (max 1000 characters)' });

  try {
    const check = await pool.query('SELECT * FROM reviews WHERE id = $1 AND seller_id = $2', [req.params.id, req.user.id]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Review not found' });

    const review = check.rows[0];
    if (review.seller_response) {
      return res.status(409).json({ error: 'You already replied to this review. Use edit reply instead.' });
    }

    const result = await pool.query(
      `UPDATE reviews
       SET seller_response = $1,
           seller_responded_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [String(reply).trim(), req.params.id]
    );

    // Notify reviewer in-app
    const sellerRes = await pool.query('SELECT full_name, store_name, use_store_identity FROM users WHERE id = $1', [req.user.id]);
    const sellerRow = sellerRes.rows[0];
    const sellerDisplayName = (sellerRow?.use_store_identity && sellerRow?.store_name) ? sellerRow.store_name : (sellerRow?.full_name || 'Seller');

    createNotification(review.reviewer_id, 'seller_replied', 'Seller Replied', `${sellerDisplayName} replied to your review`, {
      orderId: review.order_id,
      reviewId: review.id
    });

    res.json({ review: result.rows[0] });
  } catch (err) {
    console.error('Review reply error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Edit single public reply
router.put('/reviews/:id/reply', authRequired, async (req, res) => {
  const { reply } = req.body;
  if (!reply || !String(reply).trim()) return res.status(400).json({ error: 'Reply text is required' });
  if (String(reply).length > 1000) return res.status(400).json({ error: 'Reply is too long (max 1000 characters)' });

  try {
    const result = await pool.query(
      `UPDATE reviews
       SET seller_response = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND seller_id = $3
       RETURNING *`,
      [String(reply).trim(), req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Review reply not found' });
    res.json({ review: result.rows[0] });
  } catch (err) {
    console.error('Review reply update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/reviews/seller/:sellerId', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 50);
    const offset = (page - 1) * limit;

    const result = await pool.query(
      `SELECT r.*,
              u.full_name AS reviewer_name,
              u.avatar_url AS reviewer_avatar,
              u.username AS reviewer_username,
              u.show_real_name AS reviewer_show_real_name
       FROM reviews r
       JOIN users u ON r.reviewer_id = u.id
       JOIN orders o ON r.order_id = o.id
       WHERE r.seller_id = $1
         AND r.is_moderated = false
         AND COALESCE((SELECT SUM(rp.amount) FROM refund_payouts rp WHERE rp.order_id = o.id AND rp.status = 'completed'), 0) < o.total_amount
       ORDER BY r.created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.params.sellerId, limit, offset]
    );

    const statsResult = await pool.query(
      `SELECT
         COALESCE(AVG(r.rating)::numeric(3,2), 0) AS avg_rating,
         COUNT(*) AS review_count,
         COUNT(*) FILTER (WHERE r.rating = 5) AS count_5,
         COUNT(*) FILTER (WHERE r.rating = 4) AS count_4,
         COUNT(*) FILTER (WHERE r.rating = 3) AS count_3,
         COUNT(*) FILTER (WHERE r.rating = 2) AS count_2,
         COUNT(*) FILTER (WHERE r.rating = 1) AS count_1
       FROM reviews r
       JOIN orders o ON r.order_id = o.id
       WHERE r.seller_id = $1
         AND r.is_moderated = false
         AND COALESCE((SELECT SUM(rp.amount) FROM refund_payouts rp WHERE rp.order_id = o.id AND rp.status = 'completed'), 0) < o.total_amount`,
      [req.params.sellerId]
    );

    const stats = statsResult.rows[0] || {};
    const formattedReviews = result.rows.map(r => {
      const publicName = (r.reviewer_show_real_name && r.reviewer_name) ? r.reviewer_name : (r.reviewer_username || 'Buyer');
      return {
        ...r,
        reviewer_name: publicName,
      };
    });

    res.json({
      reviews: formattedReviews,
      stats: {
        avg_rating: parseFloat(stats.avg_rating || 0),
        review_count: parseInt(stats.review_count || 0, 10),
        breakdown: {
          5: parseInt(stats.count_5 || 0, 10),
          4: parseInt(stats.count_4 || 0, 10),
          3: parseInt(stats.count_3 || 0, 10),
          2: parseInt(stats.count_2 || 0, 10),
          1: parseInt(stats.count_1 || 0, 10),
        }
      }
    });
  } catch (err) {
    console.error('Seller reviews error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/reviews/product/:productId', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*,
              u.full_name AS reviewer_name,
              u.username AS reviewer_username,
              u.avatar_url AS reviewer_avatar,
              u.show_real_name AS reviewer_show_real_name,
              true AS is_verified_purchase,
              true AS is_transaction_level
       FROM reviews r
       JOIN order_items oi ON r.order_id = oi.order_id
       JOIN orders o ON r.order_id = o.id
       JOIN users u ON r.reviewer_id = u.id
       WHERE oi.product_id = $1
         AND r.is_moderated = false
         AND COALESCE((SELECT SUM(rp.amount) FROM refund_payouts rp WHERE rp.order_id = o.id AND rp.status = 'completed'), 0) < o.total_amount
       ORDER BY r.created_at DESC`,
      [req.params.productId]
    );

    const formatted = result.rows.map(r => ({
      ...r,
      reviewer_name: (r.reviewer_show_real_name && r.reviewer_name) ? r.reviewer_name : (r.reviewer_username || 'Buyer')
    }));

    res.json({ reviews: formatted });
  } catch (err) {
    console.error('Product reviews error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// WISHLIST
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/wishlist/:productId', authRequired, async (req, res) => {
  try {
    const existing = await pool.query('SELECT id FROM wishlists WHERE user_id = $1 AND product_id = $2', [req.user.id, req.params.productId]);
    if (existing.rows.length > 0) {
      await pool.query('DELETE FROM wishlists WHERE id = $1', [existing.rows[0].id]);
      return res.json({ wishlisted: false });
    }
    await pool.query(
      `INSERT INTO wishlists (user_id, product_id, saved_price)
       SELECT $1, id,
              (CASE WHEN sale_price IS NOT NULL
                         AND (sale_starts_at IS NULL OR sale_starts_at <= NOW())
                         AND (sale_ends_at IS NULL OR sale_ends_at >= NOW())
                    THEN sale_price ELSE price END)
         FROM products WHERE id = $2
       ON CONFLICT (user_id, product_id) DO NOTHING`,
      [req.user.id, req.params.productId]
    );
    res.json({ wishlisted: true });
  } catch (err) {
    console.error('Wishlist toggle error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/wishlist', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.id, p.seller_id, p.name, p.price, p.stock,
              p.sale_price, p.sale_starts_at, p.sale_ends_at,
              w.saved_price,
              (CASE WHEN p.sale_price IS NOT NULL AND (p.sale_starts_at IS NULL OR p.sale_starts_at <= NOW()) AND (p.sale_ends_at IS NULL OR p.sale_ends_at >= NOW()) THEN p.sale_price ELSE p.price END)::DECIMAL(10,2) AS effective_price,
              (CASE WHEN p.sale_price IS NOT NULL AND (p.sale_starts_at IS NULL OR p.sale_starts_at <= NOW()) AND (p.sale_ends_at IS NULL OR p.sale_ends_at >= NOW()) THEN true ELSE false END) AS is_on_sale,
              (CASE WHEN p.sale_price IS NOT NULL AND (p.sale_starts_at IS NULL OR p.sale_starts_at <= NOW()) AND (p.sale_ends_at IS NULL OR p.sale_ends_at >= NOW()) THEN ROUND((1 - p.sale_price / p.price) * 100) ELSE 0 END)::INTEGER AS discount_pct,
              (SELECT pi.image_url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.is_primary DESC, pi.display_order ASC LIMIT 1) AS image_url
       FROM wishlists w JOIN products p ON w.product_id = p.id
       WHERE w.user_id = $1
       ORDER BY w.created_at DESC`,
      [req.user.id]
    );
    res.json({ wishlist: result.rows });
  } catch (err) {
    console.error('Wishlist fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/wishlist/check/:productId', authRequired, async (req, res) => {
  try {
    const result = await pool.query('SELECT id FROM wishlists WHERE user_id = $1 AND product_id = $2', [req.user.id, req.params.productId]);
    res.json({ wishlisted: result.rows.length > 0 });
  } catch (err) {
    console.error('Wishlist check error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/wishlist/status', authRequired, async (req, res) => {
  try {
    const ids = (req.query.ids || '').split(',').filter(Boolean);
    if (ids.length === 0) return res.json({ wishlisted: {} });
    const result = await pool.query(
      'SELECT product_id FROM wishlists WHERE user_id = $1 AND product_id = ANY($2)',
      [req.user.id, ids]
    );
    const set = {};
    for (const row of result.rows) set[row.product_id] = true;
    res.json({ wishlisted: set });
  } catch (err) {
    console.error('Wishlist batch check error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// FOLLOW SELLERS
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/follow/:sellerId', authRequired, async (req, res) => {
  if (req.user.id === req.params.sellerId) return res.status(400).json({ error: 'Cannot follow yourself' });
  try {
    const existing = await pool.query('SELECT id FROM follows WHERE follower_id = $1 AND seller_id = $2', [req.user.id, req.params.sellerId]);
    if (existing.rows.length > 0) {
      await pool.query('DELETE FROM follows WHERE id = $1', [existing.rows[0].id]);
      return res.json({ following: false });
    }
    await pool.query('INSERT INTO follows (follower_id, seller_id) VALUES ($1, $2)', [req.user.id, req.params.sellerId]);
    const follower = await pool.query('SELECT full_name FROM users WHERE id = $1', [req.user.id]);
    const followerName = follower.rows[0]?.full_name || 'Someone';
    createNotification(req.params.sellerId, 'new_follower', 'New Follower', `${followerName} started following you`, { followerId: req.user.id, sellerId: req.params.sellerId });
    res.json({ following: true });
  } catch (err) {
    console.error('Follow toggle error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/following', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT f.*, u.full_name, u.username, u.avatar_url, u.seller_tier,
        u.store_name, u.store_logo_url, u.use_store_identity,
        EXISTS(
          SELECT 1 FROM notifications n
          WHERE n.user_id = f.follower_id
          AND n.type = 'new_product_from_followed'
          AND n.is_read = false
          AND (n.data->>'sellerId')::uuid = f.seller_id
        ) AS has_unread_activity
       FROM follows f JOIN users u ON f.seller_id = u.id
       WHERE f.follower_id = $1
       ORDER BY f.created_at DESC`,
      [req.user.id]
    );
    res.json({ following: result.rows });
  } catch (err) {
    console.error('Following fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/followers/count/:sellerId', async (req, res) => {
  try {
    const result = await pool.query('SELECT COUNT(*) AS count FROM follows WHERE seller_id = $1', [req.params.sellerId]);
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (err) {
    console.error('Followers count error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════════

// Message and offer activity belongs in Inbox. Filter legacy rows too, since
// older server versions persisted some of these events in notifications.
const INBOX_ACTIVITY_SQL = `
  COALESCE(type, '') NOT IN (
    'new_message', 'new_offer', 'counter_offer', 'offer_accepted', 'offer_declined', 'offer_expired',
    'message', 'message_received', 'direct_message'
  )
  AND COALESCE(data->>'type', '') NOT IN ('new_message', 'new_offer', 'counter_offer', 'offer_accepted', 'offer_declined', 'offer_expired')
  AND LOWER(COALESCE(title, '')) NOT IN ('new message', 'listing shared')
`;

router.get('/notifications', authRequired, async (req, res) => {
  try {
    const filter = req.query.filter || 'all'; // all, action_needed, social, marketplace
    let query = '';
    const params = [req.user.id];

    if (filter === 'action_needed') {
      // In Action needed: show all unresolved action items even if dismissed from the main feed!
      // Sort nearest deadline first, then newest
      query = `
        SELECT * FROM notifications
        WHERE user_id = $1
          AND action_required = true
          AND action_resolved = false
          AND ${INBOX_ACTIVITY_SQL}
        ORDER BY (action_deadline IS NULL), action_deadline ASC, created_at DESC
        LIMIT 100
      `;
    } else if (filter === 'social') {
      query = `
        SELECT * FROM notifications
        WHERE user_id = $1
          AND (dismissed_from_feed = false OR dismissed_from_feed IS NULL)
          AND type IN ('new_follower', 'new_product_from_followed', 'product_saved')
        ORDER BY created_at DESC
        LIMIT 100
      `;
    } else if (filter === 'marketplace') {
      query = `
        SELECT * FROM notifications
        WHERE user_id = $1
          AND (dismissed_from_feed = false OR dismissed_from_feed IS NULL)
          AND ${INBOX_ACTIVITY_SQL}
          AND type NOT IN ('new_follower', 'new_product_from_followed', 'product_saved')
        ORDER BY created_at DESC
        LIMIT 100
      `;
    } else {
      // 'all'
      query = `
        SELECT * FROM notifications
        WHERE user_id = $1
          AND (dismissed_from_feed = false OR dismissed_from_feed IS NULL)
          AND ${INBOX_ACTIVITY_SQL}
        ORDER BY created_at DESC
        LIMIT 150
      `;
    }

    const result = await pool.query(query, params);
    const rows = result.rows;

    // Perform 24-hour grouping for social/product items
    const grouped = [];
    const groupMap = new Map();

    for (const row of rows) {
      if (filter === 'action_needed' || !row.group_key) {
        grouped.push(row);
      } else {
        if (!groupMap.has(row.group_key)) {
          const groupItem = {
            ...row,
            id: 'group:' + row.group_key,
            is_group: true,
            group_count: 1,
            group_items: [row],
          };
          groupMap.set(row.group_key, grouped.length);
          grouped.push(groupItem);
        } else {
          const idx = groupMap.get(row.group_key);
          const parent = grouped[idx];
          parent.group_count += 1;
          parent.group_items.push(row);
          if (!row.is_read) parent.is_read = false;
          if (parent.type === 'new_follower') {
            const firstFollower = parent.data?.followerName || 'Someone';
            parent.title = `${firstFollower} and ${parent.group_count - 1} others followed you`;
          }
        }
      }
    }

    res.json({ notifications: grouped });
  } catch (err) {
    console.error('Notifications fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/notifications/unread-count', authRequired, async (req, res) => {
  try {
    // 1. Unread count (grouped items count as 1)
    const unreadRes = await pool.query(`
      SELECT id, group_key FROM notifications
      WHERE user_id = $1
        AND is_read = false
        AND (dismissed_from_feed = false OR dismissed_from_feed IS NULL)
        AND ${INBOX_ACTIVITY_SQL}
    `, [req.user.id]);

    const seenGroups = new Set();
    let unreadCount = 0;
    for (const row of unreadRes.rows) {
      if (row.group_key) {
        if (!seenGroups.has(row.group_key)) {
          seenGroups.add(row.group_key);
          unreadCount++;
        }
      } else {
        unreadCount++;
      }
    }

    // 2. Unresolved action items count (even if dismissed from main feed)
    const actionRes = await pool.query(`
      SELECT COUNT(*) AS count FROM notifications
      WHERE user_id = $1
        AND action_required = true
        AND action_resolved = false
        AND ${INBOX_ACTIVITY_SQL}
    `, [req.user.id]);

    res.json({
      count: unreadCount,
      actionNeededCount: parseInt(actionRes.rows[0]?.count || 0),
    });
  } catch (err) {
    console.error('Notifications unread count error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/notifications/:id/read', authRequired, async (req, res) => {
  try {
    const id = req.params.id;
    if (id.startsWith('group:')) {
      const groupKey = id.slice(6);
      await pool.query(
        `UPDATE notifications SET is_read = true WHERE user_id = $1 AND group_key = $2`,
        [req.user.id, groupKey]
      );
    } else {
      await pool.query(
        `UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2`,
        [id, req.user.id]
      );
    }
    res.json({ updated: true });
  } catch (err) {
    console.error('Notification read error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/notifications/:id/dismiss', authRequired, async (req, res) => {
  try {
    const id = req.params.id;
    if (id.startsWith('group:')) {
      const groupKey = id.slice(6);
      await pool.query(
        `UPDATE notifications SET dismissed_from_feed = true WHERE user_id = $1 AND group_key = $2`,
        [req.user.id, groupKey]
      );
    } else {
      await pool.query(
        `UPDATE notifications SET dismissed_from_feed = true WHERE id = $1 AND user_id = $2`,
        [id, req.user.id]
      );
    }
    res.json({ dismissed: true });
  } catch (err) {
    console.error('Notification dismiss error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/notifications/dismiss-undo', authRequired, async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'id required' });
    if (id.startsWith('group:')) {
      const groupKey = id.slice(6);
      await pool.query(
        `UPDATE notifications SET dismissed_from_feed = false WHERE user_id = $1 AND group_key = $2`,
        [req.user.id, groupKey]
      );
    } else {
      await pool.query(
        `UPDATE notifications SET dismissed_from_feed = false WHERE id = $1 AND user_id = $2`,
        [id, req.user.id]
      );
    }
    res.json({ restored: true });
  } catch (err) {
    console.error('Notification dismiss-undo error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/notifications/read-all', authRequired, async (req, res) => {
  try {
    await pool.query(
      `UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false`,
      [req.user.id]
    );
    res.json({ updated: true });
  } catch (err) {
    console.error('Notification read-all error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/notifications/read', authRequired, async (req, res) => {
  try {
    // Clear all read notifications that are not unresolved actions
    await pool.query(
      `DELETE FROM notifications
       WHERE user_id = $1 AND is_read = true AND (action_required = false OR action_resolved = true)`,
      [req.user.id]
    );
    res.json({ cleared: true });
  } catch (err) {
    console.error('Notifications clear error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/notifications/preferences', authRequired, async (req, res) => {
  try {
    const userRes = await pool.query(
      `SELECT notification_preferences FROM users WHERE id = $1`,
      [req.user.id]
    );
    const prefs = userRes.rows[0]?.notification_preferences || {};
    res.json({ preferences: prefs });
  } catch (err) {
    console.error('Fetch notification preferences error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/notifications/preferences', authRequired, async (req, res) => {
  try {
    const updates = req.body || {};
    const userRes = await pool.query(
      `SELECT notification_preferences FROM users WHERE id = $1`,
      [req.user.id]
    );
    const current = userRes.rows[0]?.notification_preferences || {};
    const merged = {
      ...current,
      ...updates,
      categories: { ...(current.categories || {}), ...(updates.categories || {}) },
      quiet_hours: { ...(current.quiet_hours || {}), ...(updates.quiet_hours || {}) },
    };
    await pool.query(
      `UPDATE users SET notification_preferences = $1 WHERE id = $2`,
      [JSON.stringify(merged), req.user.id]
    );
    res.json({ preferences: merged });
  } catch (err) {
    console.error('Update notification preferences error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/notifications/mute-seller', authRequired, async (req, res) => {
  try {
    const { sellerId, muted } = req.body;
    if (!sellerId) return res.status(400).json({ error: 'sellerId required' });
    const userRes = await pool.query(
      `SELECT notification_preferences FROM users WHERE id = $1`,
      [req.user.id]
    );
    const current = userRes.rows[0]?.notification_preferences || {};
    let mutedList = Array.isArray(current.muted_seller_ids) ? [...current.muted_seller_ids] : [];
    if (muted) {
      if (!mutedList.includes(String(sellerId))) mutedList.push(String(sellerId));
    } else {
      mutedList = mutedList.filter(id => id !== String(sellerId));
    }
    const updated = { ...current, muted_seller_ids: mutedList };
    await pool.query(
      `UPDATE users SET notification_preferences = $1 WHERE id = $2`,
      [JSON.stringify(updated), req.user.id]
    );
    res.json({ muted: !!muted, muted_seller_ids: mutedList });
  } catch (err) {
    console.error('Mute seller error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// NEARBY SELLERS (map discovery)
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/sellers/nearby', async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng query params required' });
  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);
  if (isNaN(latNum) || isNaN(lngNum)) {
    return res.status(400).json({ error: 'Invalid lat, lng' });
  }
  try {
    const result = await pool.query(
      `SELECT u.id, u.full_name, u.avatar_url, u.store_name, u.store_logo_url,
              u.seller_tier, u.id_verified, u.use_store_identity, u.username,
              sl.lat, sl.lng,
              (6371 * acos(LEAST(1, GREATEST(-1,
                cos(radians($1)) * cos(radians(sl.lat)) *
                cos(radians(sl.lng) - radians($2)) +
                sin(radians($1)) * sin(radians(sl.lat))
              )))) AS distance_km
       FROM seller_locations sl
       JOIN users u ON u.id = sl.seller_id
       WHERE u.role = 'seller' AND sl.is_visible = true
       ORDER BY distance_km ASC`,
      [latNum, lngNum]
    );
    const filtered = result.rows;

    const sellerIds = filtered.map(r => r.id);
    if (sellerIds.length > 0) {
      const [productCounts, primaryImages, reviewStats] = await Promise.all([
        pool.query(
          `SELECT seller_id, COUNT(*) AS product_count
           FROM products WHERE seller_id = ANY($1::uuid[]) AND is_available = true
           GROUP BY seller_id`, [sellerIds]),
        pool.query(
          `SELECT DISTINCT ON (p.seller_id) p.seller_id, pi.image_url
           FROM products p JOIN product_images pi ON pi.product_id = p.id
           WHERE p.seller_id = ANY($1::uuid[]) AND p.is_available = true
           ORDER BY p.seller_id, pi.is_primary DESC, pi.display_order ASC`, [sellerIds]),
        pool.query(
          `SELECT seller_id, COALESCE(AVG(rating)::numeric(3,2), 0) AS avg_rating, COUNT(*) AS review_count
           FROM reviews WHERE seller_id = ANY($1::uuid[])
           GROUP BY seller_id`, [sellerIds])
      ]);
      const pcMap = Object.fromEntries(productCounts.rows.map(r => [r.seller_id, parseInt(r.product_count)]));
      const piMap = Object.fromEntries(primaryImages.rows.map(r => [r.seller_id, r.image_url]));
      const rsMap = Object.fromEntries(reviewStats.rows.map(r => [r.seller_id, r]));
      for (const r of filtered) {
        r.product_count = pcMap[r.id] || 0;
        r.primary_image = piMap[r.id] || null;
        r.avg_rating = parseFloat(rsMap[r.id]?.avg_rating) || 0;
        r.review_count = parseInt(rsMap[r.id]?.review_count) || 0;
      }
    }

    res.json({ sellers: filtered.map(r => ({
      ...r,
      lat: parseFloat(r.lat), lng: parseFloat(r.lng),
      distance_km: parseFloat(parseFloat(r.distance_km).toFixed(2)),
      product_count: r.product_count || 0,
      avg_rating: r.avg_rating || 0,
      review_count: r.review_count || 0,
    }))});
  } catch (err) {
    console.error('Nearby sellers error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SELLER PROFILE / STATS (used by storefront)
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/sellers/search', authRequired, async (req, res) => {
  const query = String(req.query.q || '').trim().slice(0, 80);
  if (query.length < 2) return res.json({ sellers: [] });
  try {
    const result = await pool.query(
      `SELECT id, full_name, username, avatar_url, store_name, store_logo_url, seller_tier, use_store_identity
       FROM users WHERE id <> $1 AND role = 'seller'
         AND (full_name ILIKE $2 OR username ILIKE $2 OR store_name ILIKE $2)
       ORDER BY CASE WHEN username ILIKE $3 OR store_name ILIKE $3 THEN 0 ELSE 1 END, full_name
       LIMIT 30`, [req.user.id, `%${query}%`, `${query}%`]
    );
    res.json({ sellers: result.rows });
  } catch (err) { console.error('Seller search error:', err); res.status(500).json({ error: 'Server error' }); }
});

router.get('/sellers/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.full_name, u.avatar_url, u.bio, u.created_at, u.role,
              u.store_name, u.store_logo_url, u.store_description, u.store_service_area, u.store_category,
              u.seller_tier, u.id_verified, u.id_verification_result, u.use_store_identity, u.username,
              u.show_real_name, u.show_public_city, u.hide_follower_lists, u.hide_follower_counts,
              u.pinned_product_id,
              CASE WHEN u.show_public_city = true THEN u.location_city ELSE NULL END AS location_city,
              u.natcash_phone,
              CASE WHEN u.natcash_phone IS NOT NULL
                     AND 'natcash' = ANY(COALESCE(u.accepted_payment_methods, ARRAY[]::text[]))
                     AND ((u.seller_tier = 'business' AND EXISTS (SELECT 1 FROM seller_subscriptions bs WHERE bs.seller_id = u.id AND bs.status IN ('active','past_due') AND bs.expires_at + make_interval(days => COALESCE(bs.grace_period_days,7)) > CURRENT_TIMESTAMP))
                       OR EXISTS (SELECT 1 FROM natcash_access_subscriptions ns WHERE ns.seller_id = u.id AND ns.status = 'active' AND ns.expires_at + INTERVAL '3 days' > CURRENT_TIMESTAMP))
                   THEN u.accepted_payment_methods ELSE array_remove(COALESCE(u.accepted_payment_methods, ARRAY['moncash']::text[]), 'natcash') END AS accepted_payment_methods,
              (SELECT COUNT(*) FROM products p WHERE p.seller_id = u.id AND p.is_available = true) AS product_count,
              (SELECT COALESCE(AVG(r.rating)::numeric(3,2), 0) FROM reviews r WHERE r.seller_id = u.id AND r.is_moderated = false) AS avg_rating,
              (SELECT COUNT(*) FROM reviews r2 WHERE r2.seller_id = u.id AND r2.is_moderated = false) AS review_count,
              (SELECT COUNT(*) FROM order_items oi JOIN orders o ON oi.order_id = o.id WHERE oi.seller_id = u.id AND o.status = 'completed') AS sales_count,
              (SELECT COUNT(*) FROM follows f WHERE f.seller_id = u.id) AS followers_count,
              (SELECT COUNT(*) FROM follows f WHERE f.follower_id = u.id) AS following_count
       FROM users u
       WHERE u.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const row = result.rows[0];

    // Privacy adjustments
    const publicFullName = row.show_real_name ? row.full_name : (row.username || 'User');
    const followers = row.hide_follower_counts ? null : parseInt(row.followers_count, 10);
    const following = row.hide_follower_counts ? null : parseInt(row.following_count, 10);

    // If pinned product is set, fetch its summary
    let pinnedProduct = null;
    if (row.pinned_product_id) {
      const pinRes = await pool.query(
        `SELECT p.id, p.name, p.price, p.is_available, p.condition,
                (SELECT image_url FROM product_images WHERE product_id = p.id AND is_primary = true LIMIT 1) AS image_url
         FROM products p
         WHERE p.id = $1 AND p.seller_id = $2`,
        [row.pinned_product_id, row.id]
      );
      pinnedProduct = pinRes.rows[0] || null;
    }

    res.json({
      seller: {
        ...row,
        full_name: publicFullName,
        followers_count: followers,
        following_count: following,
        product_count: parseInt(row.product_count, 10),
        avg_rating: parseFloat(row.avg_rating),
        review_count: parseInt(row.review_count, 10),
        sales_count: parseInt(row.sales_count, 10),
        pinned_product: pinnedProduct,
      }
    });
  } catch (err) {
    console.error('Seller profile error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// FOLLOWERS/FOLLOWING LIST (respects hide_follower_lists privacy)
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/users/:userId/follows/:kind', authRequired, async (req, res) => {
  const { userId, kind } = req.params;
  if (!['followers', 'following'].includes(kind)) return res.status(400).json({ error: 'Invalid follow list' });
  try {
    const userCheck = await pool.query('SELECT hide_follower_lists FROM users WHERE id = $1', [userId]);
    if (userCheck.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    if (userCheck.rows[0].hide_follower_lists && req.user.id !== userId) {
      return res.json({ users: [], hidden: true });
    }

    const result = await pool.query(
      kind === 'followers'
        ? `SELECT u.id,
                  CASE WHEN u.show_real_name THEN u.full_name ELSE COALESCE(u.username, u.full_name) END AS full_name,
                  u.username, u.avatar_url, u.store_name, u.store_logo_url, u.seller_tier, u.use_store_identity
           FROM follows f JOIN users u ON u.id = f.follower_id WHERE f.seller_id = $1 ORDER BY f.created_at DESC`
        : `SELECT u.id,
                  CASE WHEN u.show_real_name THEN u.full_name ELSE COALESCE(u.username, u.full_name) END AS full_name,
                  u.username, u.avatar_url, u.store_name, u.store_logo_url, u.seller_tier, u.use_store_identity
           FROM follows f JOIN users u ON u.id = f.seller_id WHERE f.follower_id = $1 ORDER BY f.created_at DESC`,
      [userId]
    );
    res.json({ users: result.rows, hidden: false });
  } catch (err) {
    console.error('Follow list fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PINNED LISTING
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/seller/pin-listing', authRequired, async (req, res) => {
  try {
    const { productId } = req.body;
    if (!productId || productId === 'clear') {
      await pool.query('UPDATE users SET pinned_product_id = NULL WHERE id = $1', [req.user.id]);
      await pool.query('UPDATE products SET is_pinned = false WHERE seller_id = $1', [req.user.id]);
      return res.json({ pinnedProductId: null });
    }

    // Verify product belongs to seller and is available
    const prodRes = await pool.query('SELECT id, is_available FROM products WHERE id = $1 AND seller_id = $2', [productId, req.user.id]);
    if (prodRes.rows.length === 0) {
      return res.status(404).json({ error: 'Listing not found or not owned by you' });
    }

    await pool.query('UPDATE users SET pinned_product_id = $1 WHERE id = $2', [productId, req.user.id]);
    await pool.query('UPDATE products SET is_pinned = (id = $1) WHERE seller_id = $2', [productId, req.user.id]);
    res.json({ pinnedProductId: productId });
  } catch (err) {
    console.error('Pin listing error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// REPORTS (profile, review, reply, order)
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/reports', authRequired, async (req, res) => {
  try {
    const { targetType, targetId, reportedUserId, reason, details, orderContext } = req.body;
    if (!targetType || !targetId || !reason) {
      return res.status(400).json({ error: 'targetType, targetId, and reason are required' });
    }
    const result = await pool.query(
      `INSERT INTO user_reports (reporter_id, reported_user_id, target_type, target_id, reason, details, order_context)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [req.user.id, reportedUserId || null, targetType, targetId, reason, details || null, orderContext ? JSON.stringify(orderContext) : null]
    );
    res.status(201).json({ report: result.rows[0], success: true });
  } catch (err) {
    console.error('Report submission error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/users/:id/report', authRequired, async (req, res) => {
  try {
    const { reason, details } = req.body;
    if (!reason) return res.status(400).json({ error: 'Reason required' });
    const result = await pool.query(
      `INSERT INTO user_reports (reporter_id, reported_user_id, target_type, target_id, reason, details)
       VALUES ($1, $2, 'profile', $2, $3, $4)
       RETURNING *`,
      [req.user.id, req.params.id, reason, details || null]
    );
    res.status(201).json({ report: result.rows[0], success: true });
  } catch (err) {
    console.error('User report error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/reviews/:id/report', authRequired, async (req, res) => {
  try {
    const { reason, details, targetType } = req.body;
    if (!reason) return res.status(400).json({ error: 'Reason required' });
    const type = targetType === 'reply' ? 'reply' : 'review';

    const revRes = await pool.query('SELECT reviewer_id, seller_id, order_id FROM reviews WHERE id = $1', [req.params.id]);
    const rev = revRes.rows[0];
    const reportedUser = type === 'reply' ? rev?.seller_id : rev?.reviewer_id;

    const result = await pool.query(
      `INSERT INTO user_reports (reporter_id, reported_user_id, target_type, target_id, reason, details, order_context)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [req.user.id, reportedUser || null, type, req.params.id, reason, details || null, rev?.order_id ? JSON.stringify({ orderId: rev.order_id }) : null]
    );
    res.status(201).json({ report: result.rows[0], success: true });
  } catch (err) {
    console.error('Review report error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCKED USERS
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/users/blocked', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id,
              CASE WHEN u.show_real_name THEN u.full_name ELSE COALESCE(u.username, u.full_name) END AS full_name,
              u.username, u.avatar_url, u.store_name, u.store_logo_url, u.seller_tier, u.use_store_identity,
              b.created_at AS blocked_at
       FROM blocked_users b
       JOIN users u ON b.blocked_id = u.id
       WHERE b.blocker_id = $1
       ORDER BY b.created_at DESC`,
      [req.user.id]
    );
    res.json({ blockedUsers: result.rows });
  } catch (err) {
    console.error('Blocked users fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
