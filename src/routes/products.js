import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../config/database.js';
import { JWT_SECRET } from '../config/security.js';
import { authRequired, sellerRequired, verifiedSellerRequired, dobRequired } from '../middleware/auth.js';
import { createNotification } from '../utils/notifications.js';
import { checkSubscriptionStatus } from '../utils/helpers.js';

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════════
// DIVERSITY RERANKER
// ═══════════════════════════════════════════════════════════════════════════════

// Hard cap on seller/category representation in the personalized feed.
// Items that exceed caps are dropped — no re-appending. The feed may be slightly shorter
// but never repetitive. FlatList's onEndReached loads more naturally.
function diversifyFeed(products, { maxPerSeller = 3, maxPerCategory = 5 } = {}) {
  if (!products || products.length <= 1) return products;
  const sellerCounts = {};
  const categoryCounts = {};
  const result = [];
  for (const p of products) {
    const sid = p.seller_id;
    const cid = p.category_id;
    if (sid && (sellerCounts[sid] || 0) >= maxPerSeller) continue;
    if (cid && (categoryCounts[cid] || 0) >= maxPerCategory) continue;
    result.push(p);
    if (sid) sellerCounts[sid] = (sellerCounts[sid] || 0) + 1;
    if (cid) categoryCounts[cid] = (categoryCounts[cid] || 0) + 1;
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRODUCT LIST (with personalization)
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/products', async (req, res) => {
  const { category, search, seller, minPrice, maxPrice, sort, page = 1, limit = 20, personalized, following } = req.query;
  const offset = (Math.max(1, page) - 1) * Math.min(limit, 50);

  const params = [];
  const conditions = ['p.is_available = TRUE'];
  let paramIndex = 1;

  if (category) {
    conditions.push(`c.name = $${paramIndex++}`);
    params.push(category);
  }
  if (search) {
    conditions.push(`(p.name ILIKE $${paramIndex} OR p.description ILIKE $${paramIndex})`);
    params.push(`%${search}%`);
    paramIndex++;
  }
  if (seller) {
    conditions.push(`p.seller_id = $${paramIndex++}`);
    params.push(seller);
  }
  if (minPrice) {
    conditions.push(`(CASE WHEN p.sale_price IS NOT NULL AND (p.sale_starts_at IS NULL OR p.sale_starts_at <= NOW()) AND (p.sale_ends_at IS NULL OR p.sale_ends_at >= NOW()) THEN p.sale_price ELSE p.price END) >= $${paramIndex++}`);
    params.push(minPrice);
  }
  if (maxPrice) {
    conditions.push(`(CASE WHEN p.sale_price IS NOT NULL AND (p.sale_starts_at IS NULL OR p.sale_starts_at <= NOW()) AND (p.sale_ends_at IS NULL OR p.sale_ends_at >= NOW()) THEN p.sale_price ELSE p.price END) <= $${paramIndex++}`);
    params.push(maxPrice);
  }

  let usePersonalized = false;
  let userId = null;
  try {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      userId = decoded.id;
      if (personalized === 'true' || following === 'true') usePersonalized = true;
    }
  } catch { /* Not authenticated or invalid token */ }

  const engagementUserId = userId || null;
  params.push(engagementUserId);
  const engIdx = paramIndex;
  paramIndex++;

  let orderBy = 'p.created_at DESC';
  let selectExtra = '';
  let joinExtra = '';

  // Explicit sort overrides personalization — user's choice wins.
  // 'foryou' (or no sort + logged in) = personalized scoring.
  // Anything else = deterministic sort, skip the recommendation CTE.
  const usePersonalizedRanking = usePersonalized && userId && (!sort || sort === 'foryou');

  if (usePersonalizedRanking) {
    selectExtra = `, COALESCE(score.total_score, 0) AS feed_score, score.recommendation_reason`;
    joinExtra = `LEFT JOIN (
      WITH user_follows AS (
        SELECT seller_id FROM follows WHERE follower_id = $${paramIndex}
      ),
      user_wishlists AS (
        SELECT product_id, created_at FROM wishlists WHERE user_id = $${paramIndex}
      ),
      user_likes AS (
        SELECT product_id, created_at FROM feed_events WHERE user_id = $${paramIndex} AND event_type = 'like'
      ),
      user_relevant AS (
        SELECT product_id, created_at FROM feed_events WHERE user_id = $${paramIndex} AND event_type = 'relevant'
      ),
      user_not_relevant AS (
        SELECT product_id, created_at FROM feed_events WHERE user_id = $${paramIndex} AND event_type = 'not_relevant'
      ),
      user_category_affinities AS (
        SELECT category_id, score FROM user_category_affinities WHERE user_id = $${paramIndex}
      ),
      user_purchases AS (
        SELECT DISTINCT oi.seller_id, p3.category_id
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        JOIN products p3 ON oi.product_id = p3.id
        WHERE o.buyer_id = $${paramIndex}
      ),
      seller_ratings AS (
        SELECT seller_id, AVG(rating) AS avg_rating
        FROM reviews GROUP BY seller_id
      ),
      user_session_intent AS (
        SELECT p4.category_id, COUNT(*) AS recent_views,
               COALESCE(AVG(fe.duration_ms), 0) AS avg_dwell_ms
        FROM feed_events fe
        JOIN products p4 ON p4.id = fe.product_id
        WHERE fe.user_id = $${paramIndex}
          AND fe.event_type IN ('view', 'dwell')
          AND fe.created_at > NOW() - INTERVAL '30 minutes'
        GROUP BY p4.category_id
      ),
      user_dwell AS (
        SELECT product_id, MAX(duration_ms) AS max_dwell_ms
        FROM feed_events
        WHERE user_id = $${paramIndex} AND event_type = 'dwell'
        GROUP BY product_id
      ),
      trending_products AS (
        SELECT product_id, SUM(weight) AS trend_score, COUNT(DISTINCT user_id) AS unique_users
        FROM (
          SELECT user_id, product_id,
            CASE
              WHEN event_type = 'save' THEN 5.0
              WHEN event_type = 'like' THEN 3.0
              WHEN event_type = 'dwell' AND duration_ms >= 5000 THEN 2.0
              WHEN event_type = 'view' THEN 1.0
              ELSE 0
            END AS weight
          FROM feed_events
          WHERE event_type IN ('view', 'dwell', 'like', 'save')
            AND created_at > NOW() - INTERVAL '24 hours'
        ) weighted
        GROUP BY product_id
        HAVING COUNT(DISTINCT user_id) >= 3 OR SUM(weight) >= 10
        ORDER BY trend_score DESC
        LIMIT 100
      ),
      user_product_views AS (
        SELECT DISTINCT product_id FROM feed_events WHERE user_id = $${paramIndex}
        UNION
        SELECT product_id FROM wishlists WHERE user_id = $${paramIndex}
      ),
      product_similar AS (
        SELECT CASE WHEN pc.product_a_id = upv.product_id THEN pc.product_b_id ELSE pc.product_a_id END AS product_id,
               SUM(pc.purchase_count) AS similarity_score
        FROM product_cooccurrences pc
        JOIN user_product_views upv ON pc.product_a_id = upv.product_id OR pc.product_b_id = upv.product_id
        GROUP BY 1
        HAVING SUM(pc.purchase_count) >= 1
        ORDER BY similarity_score DESC
        LIMIT 100
      ),
      similar_users AS (
        SELECT fe.user_id, COUNT(*) AS overlap_count
        FROM feed_events fe
        WHERE fe.product_id IN (SELECT product_id FROM user_product_views)
          AND fe.user_id != $${paramIndex}
          AND fe.event_type IN ('like', 'save')
        GROUP BY fe.user_id
        HAVING COUNT(*) >= 2
        ORDER BY COUNT(*) DESC
        LIMIT 50
      ),
      collaborative_products AS (
        SELECT fe.product_id, COUNT(DISTINCT fe.user_id) AS recommender_count
        FROM feed_events fe
        WHERE fe.user_id IN (SELECT user_id FROM similar_users)
          AND fe.event_type IN ('like', 'save')
          AND fe.product_id NOT IN (SELECT product_id FROM user_product_views)
        GROUP BY fe.product_id
        ORDER BY COUNT(DISTINCT fe.user_id) DESC
        LIMIT 100
      )
      SELECT
        p2.id AS product_id,
        CASE
          WHEN EXISTS (SELECT 1 FROM collaborative_products cp WHERE cp.product_id = p2.id AND cp.recommender_count >= 3)
            THEN 'People like you also liked this'
          WHEN EXISTS (SELECT 1 FROM product_similar ps WHERE ps.product_id = p2.id)
            THEN 'Similar to what you\\'ve browsed'
          WHEN EXISTS (SELECT 1 FROM user_session_intent si WHERE si.category_id = p2.category_id AND si.recent_views >= 2)
            AND EXISTS (SELECT 1 FROM user_category_affinities a WHERE a.category_id = p2.category_id AND a.score > 0)
            THEN 'Browsing ' || COALESCE(c2.name, 'this category') || ' — more like this'
          WHEN EXISTS (SELECT 1 FROM trending_products tp WHERE tp.product_id = p2.id)
            THEN 'Trending right now'
          WHEN EXISTS (SELECT 1 FROM user_category_affinities a WHERE a.category_id = p2.category_id AND a.score > 0)
            THEN 'Because you like ' || COALESCE(c2.name, 'this category')
          WHEN EXISTS (SELECT 1 FROM user_follows WHERE seller_id = p2.seller_id)
            THEN 'From a seller you follow'
          WHEN EXISTS (SELECT 1 FROM user_purchases WHERE category_id = p2.category_id)
            THEN 'Based on your purchases'
          ELSE 'Picked for you'
        END AS recommendation_reason,
        (
          COALESCE((SELECT 3.0 FROM user_follows WHERE seller_id = p2.seller_id LIMIT 1), 0)
          + COALESCE((SELECT 2.0 * exp(-0.05 * EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400) FROM user_wishlists WHERE product_id = p2.id LIMIT 1), 0)
          + COALESCE((SELECT 2.0 * exp(-0.05 * EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400) FROM user_likes WHERE product_id = p2.id LIMIT 1), 0)
          + COALESCE((SELECT 1.5 FROM user_purchases WHERE seller_id = p2.seller_id LIMIT 1), 0)
          + COALESCE((SELECT 1.5 * exp(-0.05 * EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400) FROM user_relevant WHERE product_id = p2.id LIMIT 1), 0)
          + COALESCE((SELECT score * 1.5 FROM user_category_affinities WHERE category_id = p2.category_id LIMIT 1), 0)
          + COALESCE((SELECT 1.0 FROM user_purchases WHERE category_id = p2.category_id LIMIT 1), 0)
          + 1.5 * exp(-0.1 * EXTRACT(EPOCH FROM (NOW() - p2.created_at)) / 86400)
          + COALESCE((SELECT CASE WHEN avg_rating > 4 THEN 0.5 ELSE 0 END FROM seller_ratings WHERE seller_id = p2.seller_id), 0)
          - COALESCE((SELECT 3.0 * exp(-0.05 * EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400) FROM user_not_relevant WHERE product_id = p2.id LIMIT 1), 0)
          + COALESCE((SELECT 2.0 * LEAST(si.recent_views::numeric / 5.0, 1.0)
            FROM user_session_intent si WHERE si.category_id = p2.category_id LIMIT 1), 0)
          + COALESCE((SELECT 1.5 * LEAST(ud.max_dwell_ms::numeric / 30000.0, 1.0)
            FROM user_dwell ud WHERE ud.product_id = p2.id LIMIT 1), 0)
          + COALESCE((SELECT 1.0 * LEAST(tp.trend_score::numeric / 20.0, 1.5)
            FROM trending_products tp WHERE tp.product_id = p2.id LIMIT 1), 0)
          + COALESCE((SELECT 2.0 * LEAST(ps.similarity_score::numeric / 5.0, 1.5)
            FROM product_similar ps WHERE ps.product_id = p2.id LIMIT 1), 0)
          + COALESCE((SELECT 2.5 * LEAST(cp.recommender_count::numeric / 5.0, 1.0)
            FROM collaborative_products cp WHERE cp.product_id = p2.id LIMIT 1), 0)
        ) AS total_score
      FROM products p2
      LEFT JOIN categories c2 ON c2.id = p2.category_id
      WHERE p2.is_available = TRUE
        AND EXISTS (
          SELECT 1 FROM user_follows WHERE seller_id = p2.seller_id
          UNION ALL
          SELECT 1 FROM user_wishlists WHERE product_id = p2.id
          UNION ALL
          SELECT 1 FROM user_likes WHERE product_id = p2.id
          UNION ALL
          SELECT 1 FROM user_relevant WHERE product_id = p2.id
          UNION ALL
          SELECT 1 FROM user_not_relevant WHERE product_id = p2.id
          UNION ALL
          SELECT 1 FROM user_category_affinities WHERE category_id = p2.category_id
          UNION ALL
          SELECT 1 FROM user_purchases WHERE seller_id = p2.seller_id OR category_id = p2.category_id
          UNION ALL
          SELECT 1 FROM trending_products WHERE product_id = p2.id
          UNION ALL
          SELECT 1 FROM product_similar WHERE product_id = p2.id
          UNION ALL
          SELECT 1 FROM collaborative_products WHERE product_id = p2.id
        )
      ORDER BY total_score DESC, p2.created_at DESC
    ) score ON score.product_id = p.id`;
    params.push(userId);
    paramIndex++;
    orderBy = 'COALESCE(score.total_score, 0) DESC, p.created_at DESC';
  } else if (sort === 'price_asc') {
    orderBy = '(CASE WHEN p.sale_price IS NOT NULL AND (p.sale_starts_at IS NULL OR p.sale_starts_at <= NOW()) AND (p.sale_ends_at IS NULL OR p.sale_ends_at >= NOW()) THEN p.sale_price ELSE p.price END) ASC';
  } else if (sort === 'price_desc') {
    orderBy = '(CASE WHEN p.sale_price IS NOT NULL AND (p.sale_starts_at IS NULL OR p.sale_starts_at <= NOW()) AND (p.sale_ends_at IS NULL OR p.sale_ends_at >= NOW()) THEN p.sale_price ELSE p.price END) DESC';
  } else if (sort === 'oldest') {
    orderBy = 'p.created_at ASC';
  } else {
    orderBy = 'p.created_at DESC';
  }

  if (following === 'true' && userId) {
    conditions.push(`p.seller_id IN (SELECT seller_id FROM follows WHERE follower_id = $${paramIndex++})`);
    params.push(userId);
  } else if (following === 'true' && !userId) {
    selectExtra = `, COALESCE(score.total_score, 0) AS feed_score, score.recommendation_reason`;
    joinExtra = `LEFT JOIN (
      WITH user_follows AS (SELECT 1 AS seller_id WHERE false),
      user_wishlists AS (SELECT 1 AS product_id WHERE false), user_likes AS (SELECT 1 AS product_id WHERE false),
      user_relevant AS (SELECT 1 AS product_id WHERE false), user_not_relevant AS (SELECT 1 AS product_id WHERE false),
      user_category_affinities AS (SELECT 1 AS category_id WHERE false),
      user_purchases AS (SELECT 1 AS seller_id, 1 AS category_id WHERE false)
      SELECT p2.id AS product_id, 0 AS total_score, 'New' AS recommendation_reason
      FROM products p2 WHERE false
    ) score ON score.product_id = p.id`;
    orderBy = 'p.created_at DESC';
  }
  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  try {
    const result = await pool.query(
      `SELECT COUNT(*) OVER() AS total_count,
              p.id, p.name, p.description, p.price, p.stock, p.created_at, p.category_id,
              p.sale_price, p.sale_starts_at, p.sale_ends_at,
              (CASE WHEN p.sale_price IS NOT NULL AND (p.sale_starts_at IS NULL OR p.sale_starts_at <= NOW()) AND (p.sale_ends_at IS NULL OR p.sale_ends_at >= NOW()) THEN p.sale_price ELSE p.price END)::DECIMAL(10,2) AS effective_price,
              (CASE WHEN p.sale_price IS NOT NULL AND (p.sale_starts_at IS NULL OR p.sale_starts_at <= NOW()) AND (p.sale_ends_at IS NULL OR p.sale_ends_at >= NOW()) THEN true ELSE false END) AS is_on_sale,
              (CASE WHEN p.sale_price IS NOT NULL AND (p.sale_starts_at IS NULL OR p.sale_starts_at <= NOW()) AND (p.sale_ends_at IS NULL OR p.sale_ends_at >= NOW()) THEN ROUND((1 - p.sale_price / p.price) * 100) ELSE 0 END)::INTEGER AS discount_pct,
              u.full_name AS seller_name, u.id AS seller_id, u.store_name, u.store_logo_url, u.seller_tier, u.avatar_url AS seller_avatar, u.use_store_identity, u.username AS seller_username,
              c.name AS category, images.images
              ${selectExtra}
              , COALESCE(like_counts.like_count, 0) AS like_count
              , COALESCE(wishlist_counts.wishlist_count, 0) AS wishlist_count
              , CASE WHEN $${engIdx}::uuid IS NOT NULL AND EXISTS (SELECT 1 FROM feed_events fe WHERE fe.product_id = p.id AND fe.user_id = $${engIdx} AND fe.event_type = 'like') THEN true ELSE false END AS is_liked
              , CASE WHEN $${engIdx}::uuid IS NOT NULL AND EXISTS (SELECT 1 FROM wishlists w WHERE w.product_id = p.id AND w.user_id = $${engIdx}) THEN true ELSE false END AS is_wishlisted
       FROM products p
       JOIN users u ON p.seller_id = u.id
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN LATERAL (
         SELECT COALESCE(
           json_agg(json_build_object('image_url', pi.image_url, 'thumbnail_url', pi.thumbnail_url, 'is_primary', pi.is_primary, 'image_width', pi.image_width, 'image_height', pi.image_height) ORDER BY pi.is_primary DESC, pi.display_order ASC),
           '[]'::json
         ) AS images
         FROM product_images pi
         WHERE pi.product_id = p.id
       ) images ON TRUE
       LEFT JOIN (
         SELECT product_id, COUNT(*) AS like_count
         FROM feed_events
         WHERE event_type = 'like'
         GROUP BY product_id
       ) like_counts ON like_counts.product_id = p.id
       LEFT JOIN (
         SELECT product_id, COUNT(*) AS wishlist_count
         FROM wishlists
         GROUP BY product_id
       ) wishlist_counts ON wishlist_counts.product_id = p.id
       ${joinExtra}
       ${where}
       ORDER BY ${orderBy}
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, Math.min(limit, 50), offset]
    );

    const total = result.rows.length > 0 ? Number(result.rows[0].total_count) : 0;
    let products = result.rows.map(({ total_count, ...product }) => product);
    if (usePersonalized && products.length > 1) {
      products = diversifyFeed(products);
    }
    res.json({ products, total, page: +page, pages: Math.ceil(total / Math.min(limit, 50)) });
  } catch (err) {
    console.error('Products fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CO-PURCHASE RECOMMENDATIONS
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/products/:id/co-purchases', async (req, res) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(req.params.id)) return res.status(404).json({ error: 'Product not found' });
  try {
    const result = await pool.query(
      `SELECT p.id, p.seller_id, p.category_id, p.name, p.description, p.price, p.stock, p.is_available, p.created_at,
              p.sale_price, p.sale_starts_at, p.sale_ends_at,
              (CASE WHEN p.sale_price IS NOT NULL AND (p.sale_starts_at IS NULL OR p.sale_starts_at <= NOW()) AND (p.sale_ends_at IS NULL OR p.sale_ends_at >= NOW()) THEN p.sale_price ELSE p.price END)::DECIMAL(10,2) AS effective_price,
              (CASE WHEN p.sale_price IS NOT NULL AND (p.sale_starts_at IS NULL OR p.sale_starts_at <= NOW()) AND (p.sale_ends_at IS NULL OR p.sale_ends_at >= NOW()) THEN true ELSE false END) AS is_on_sale,
              u.full_name AS seller_name, u.id AS seller_id, u.store_name, u.store_logo_url, u.seller_tier, u.avatar_url AS seller_avatar, u.use_store_identity, u.username AS seller_username,
              c.name AS category, rel.purchase_count, images.images,
              COALESCE(like_counts.like_count, 0) AS like_count,
              COALESCE(wishlist_counts.wishlist_count, 0) AS wishlist_count
       FROM (
         SELECT CASE WHEN product_a_id = $1 THEN product_b_id ELSE product_a_id END AS product_id, purchase_count
         FROM product_cooccurrences
         WHERE product_a_id = $1 OR product_b_id = $1
         ORDER BY purchase_count DESC, last_purchased_at DESC LIMIT 12
       ) rel
       JOIN products p ON p.id = rel.product_id AND p.is_available = TRUE
       JOIN users u ON u.id = p.seller_id
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN LATERAL (
         SELECT COALESCE(json_agg(json_build_object('image_url', pi.image_url, 'thumbnail_url', pi.thumbnail_url, 'is_primary', pi.is_primary) ORDER BY pi.is_primary DESC, pi.display_order ASC), '[]'::json) AS images
         FROM product_images pi WHERE pi.product_id = p.id
       ) images ON TRUE
       LEFT JOIN (
         SELECT product_id, COUNT(*) AS like_count
         FROM feed_events
         WHERE event_type = 'like'
         GROUP BY product_id
       ) like_counts ON like_counts.product_id = p.id
       LEFT JOIN (
         SELECT product_id, COUNT(*) AS wishlist_count
         FROM wishlists
         GROUP BY product_id
       ) wishlist_counts ON wishlist_counts.product_id = p.id
       ORDER BY rel.purchase_count DESC, p.created_at DESC`,
      [req.params.id]
    );
    res.json({ products: result.rows });
  } catch (err) {
    console.error('Co-purchase recommendations error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PRODUCT DETAIL
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/products/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) return res.status(404).json({ error: 'Product not found' });
    let userId = null;
    try {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        const decoded = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET);
        userId = decoded.id;
      }
    } catch { /* not authenticated */ }
    const result = await pool.query(
      `SELECT p.*, u.full_name AS seller_name, u.avatar_url AS seller_avatar,
              u.store_name, u.store_logo_url, u.seller_tier, u.id_verified, u.use_store_identity, u.username AS seller_username,
              u.natcash_phone, u.accepted_payment_methods, u.phone AS seller_phone,
              c.name AS category,
              (CASE WHEN p.sale_price IS NOT NULL AND (p.sale_starts_at IS NULL OR p.sale_starts_at <= NOW()) AND (p.sale_ends_at IS NULL OR p.sale_ends_at >= NOW()) THEN p.sale_price ELSE p.price END)::DECIMAL(10,2) AS effective_price,
              (CASE WHEN p.sale_price IS NOT NULL AND (p.sale_starts_at IS NULL OR p.sale_starts_at <= NOW()) AND (p.sale_ends_at IS NULL OR p.sale_ends_at >= NOW()) THEN true ELSE false END) AS is_on_sale,
              (CASE WHEN p.sale_price IS NOT NULL AND (p.sale_starts_at IS NULL OR p.sale_starts_at <= NOW()) AND (p.sale_ends_at IS NULL OR p.sale_ends_at >= NOW()) THEN ROUND((1 - p.sale_price / p.price) * 100) ELSE 0 END)::INTEGER AS discount_pct,
              COALESCE(like_counts.like_count, 0) AS like_count,
              COALESCE(wishlist_counts.wishlist_count, 0) AS wishlist_count,
              CASE WHEN $2::uuid IS NOT NULL AND EXISTS (SELECT 1 FROM feed_events fe WHERE fe.product_id = p.id AND fe.user_id = $2 AND fe.event_type = 'like') THEN true ELSE false END AS is_liked,
              CASE WHEN $2::uuid IS NOT NULL AND EXISTS (SELECT 1 FROM wishlists w WHERE w.product_id = p.id AND w.user_id = $2) THEN true ELSE false END AS is_wishlisted,
              (SELECT json_agg(json_build_object('image_url', pi.image_url, 'thumbnail_url', pi.thumbnail_url, 'is_primary', pi.is_primary, 'image_width', pi.image_width, 'image_height', pi.image_height) ORDER BY pi.is_primary DESC, pi.display_order ASC) FROM product_images pi WHERE pi.product_id = p.id) AS images
       FROM products p
       JOIN users u ON p.seller_id = u.id
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN (
         SELECT product_id, COUNT(*) AS like_count
         FROM feed_events
         WHERE event_type = 'like'
         GROUP BY product_id
       ) like_counts ON like_counts.product_id = p.id
       LEFT JOIN (
         SELECT product_id, COUNT(*) AS wishlist_count
         FROM wishlists
         GROUP BY product_id
       ) wishlist_counts ON wishlist_counts.product_id = p.id
      WHERE p.id = $1 AND p.is_available = TRUE`,
      [req.params.id, userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    res.json({ product: result.rows[0] });
  } catch (err) {
    console.error('Product detail error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PRODUCT CREATE
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/products', authRequired, verifiedSellerRequired, dobRequired, async (req, res) => {
  const evCheck = await pool.query('SELECT email_verified FROM users WHERE id = $1', [req.user.id]);
  if (!evCheck.rows[0]?.email_verified) {
    return res.status(403).json({ error: 'email_not_verified', message: 'Please verify your email to start selling.' });
  }
  const { name, description, price, stock, categoryId, images, sale_price, sale_starts_at, sale_ends_at } = req.body;
  if (!name || !price) {
    return res.status(400).json({ error: 'Name and price required' });
  }
  if (Number(price) > 99999) {
    return res.status(400).json({ error: 'Maximum price is 99,999 G (MonCash limit)' });
  }
  if (Number(price) < 100) {
    return res.status(400).json({ error: 'Minimum price is 100 G' });
  }
  if (name.length > 200) return res.status(400).json({ error: 'Product name too long (max 200 characters)' });
  if (description && description.length > 5000) return res.status(400).json({ error: 'Description too long (max 5000 characters)' });
  if (stock !== undefined && stock !== null && stock !== '' && parseInt(stock) < 1) {
    return res.status(400).json({ error: 'Stock must be at least 1' });
  }
  if (!images || !Array.isArray(images) || images.length === 0) {
    return res.status(400).json({ error: 'At least one image is required' });
  }
  if (images.length > 8) {
    return res.status(400).json({ error: 'Maximum 8 images allowed' });
  }

  if (sale_price !== undefined && sale_price !== null && sale_price !== '') {
    const saleP = parseFloat(sale_price);
    const origP = parseFloat(price);
    if (isNaN(saleP) || saleP <= 0) {
      return res.status(400).json({ error: 'Sale price must be a positive number' });
    }
    if (saleP >= origP) {
      return res.status(400).json({ error: 'Sale price must be lower than the original price' });
    }
    const discountPct = Math.round((1 - saleP / origP) * 100);
    if (discountPct > 25) {
      return res.status(400).json({ error: 'Maximum discount is 25%' });
    }
    if (!sale_ends_at) {
      return res.status(400).json({ error: 'Sale end date is required when setting a sale price' });
    }
    if (new Date(sale_ends_at) <= new Date()) {
      return res.status(400).json({ error: 'Sale end date must be in the future' });
    }
  }

  const tierCheck = await pool.query('SELECT seller_tier FROM users WHERE id = $1', [req.user.id]);
  const sellerTier = tierCheck.rows[0]?.seller_tier || 'none';
  if (sellerTier === 'casual') {
    const countResult = await pool.query(
      'SELECT COUNT(*) FROM products WHERE seller_id = $1 AND is_available = true',
      [req.user.id]
    );
    if (parseInt(countResult.rows[0].count) >= 10) {
      return res.status(403).json({ error: 'Casual sellers can list up to 10 products. Upgrade to Verified for unlimited listings.' });
    }
  }
  if (sellerTier === 'business') {
    const subStatus = await checkSubscriptionStatus(req.user.id);
    if (subStatus === 'expired') {
      await pool.query(`UPDATE users SET seller_tier = 'verified', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [req.user.id]);
      createNotification(req.user.id, 'subscription_expired', 'Business Subscription Expired', 'Your Business subscription has expired. You have been demoted to Verified Seller.', {}, pool);
      return res.status(403).json({ error: 'Business subscription expired. You have been demoted to Verified Seller.' });
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const productResult = await client.query(
      `INSERT INTO products (seller_id, category_id, name, description, price, stock, sale_price, sale_starts_at, sale_ends_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [req.user.id, categoryId || null, name, description || '', price, stock || 0,
       sale_price || null, sale_starts_at || null, sale_ends_at || null]
    );
    const product = productResult.rows[0];

    if (images && images.length > 0) {
      const imageValues = images.map((img, i) => {
        const url = typeof img === 'string' ? img : img.url;
        const w = typeof img === 'object' ? (img.width || 0) : 0;
        const h = typeof img === 'object' ? (img.height || 0) : 0;
        return `($1, $${i + 2}, ${i === 0}, ${i}, ${w}, ${h})`;
      }).join(', ');
      const imageParams = images.map(img => typeof img === 'string' ? img : img.url);
      await client.query(
        `INSERT INTO product_images (product_id, image_url, is_primary, display_order, image_width, image_height) VALUES ${imageValues}`,
        [product.id, ...imageParams]
      );
    }

    await client.query('COMMIT');
    client.release();
    try {
      const followers = await pool.query('SELECT follower_id FROM follows WHERE seller_id = $1', [req.user.id]);
      if (followers.rows.length > 0) {
        const sellerName = (await pool.query('SELECT full_name FROM users WHERE id = $1', [req.user.id])).rows[0]?.full_name || 'A seller';
        const productImage = (await pool.query('SELECT image_url FROM product_images WHERE product_id = $1 AND is_primary = true LIMIT 1', [product.id])).rows[0]?.image_url;
        for (const f of followers.rows) {
          const notifData = { productId: product.id, sellerId: req.user.id };
          if (productImage) notifData.image = productImage;
          createNotification(f.follower_id, 'new_product_from_followed', `New Listing from ${sellerName}`,
            `${sellerName} just listed "${name}" for G ${price}`, notifData);
        }
      }
    } catch (e) { console.error('Follower notification error:', e.message); }
    res.status(201).json({ product });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    client.release();
    console.error('Product create error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PRODUCT DELETE
// ═══════════════════════════════════════════════════════════════════════════════

router.delete('/products/:id', authRequired, sellerRequired, async (req, res) => {
  try {
    const check = await pool.query('SELECT seller_id FROM products WHERE id = $1', [req.params.id]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    if (check.rows[0].seller_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not your product' });
    }
    const orderCheck = await pool.query('SELECT 1 FROM order_items WHERE product_id = $1 LIMIT 1', [req.params.id]);
    if (orderCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Cannot delete product with existing orders' });
    }
    await pool.query('DELETE FROM product_images WHERE product_id = $1', [req.params.id]);
    await pool.query('DELETE FROM products WHERE id = $1', [req.params.id]);
    res.json({ deleted: true });
  } catch (err) {
    console.error('Product delete error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PRODUCT UPDATE
// ═══════════════════════════════════════════════════════════════════════════════

router.put('/products/:id', authRequired, verifiedSellerRequired, async (req, res) => {
  const client = await pool.connect();
  try {
    const check = await client.query('SELECT seller_id, price FROM products WHERE id = $1', [req.params.id]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    if (check.rows[0].seller_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not your product' });
    }
    const { name, description, price, stock, isAvailable, categoryId, images, sale_price, sale_starts_at, sale_ends_at, clearSale } = req.body;

    if (stock !== undefined && stock !== null && stock !== '' && parseInt(stock) < 1) {
      return res.status(400).json({ error: 'Stock must be at least 1' });
    }
    if (price !== undefined && price !== null && Number(price) > 99999) {
      return res.status(400).json({ error: 'Maximum price is 99,999 G (MonCash limit)' });
    }
    if (price !== undefined && price !== null && Number(price) < 100) {
      return res.status(400).json({ error: 'Minimum price is 100 G' });
    }

    const effectivePrice = parseFloat(price || check.rows[0].price);
    if (sale_price !== undefined && sale_price !== null && sale_price !== '') {
      const saleP = parseFloat(sale_price);
      if (isNaN(saleP) || saleP <= 0) {
        return res.status(400).json({ error: 'Sale price must be a positive number' });
      }
      if (saleP >= effectivePrice) {
        return res.status(400).json({ error: 'Sale price must be lower than the original price' });
      }
      const discountPct = Math.round((1 - saleP / effectivePrice) * 100);
      if (discountPct > 25) {
        return res.status(400).json({ error: 'Maximum discount is 25%' });
      }
      if (!sale_ends_at) {
        return res.status(400).json({ error: 'Sale end date is required when setting a sale price' });
      }
      if (new Date(sale_ends_at) <= new Date()) {
        return res.status(400).json({ error: 'Sale end date must be in the future' });
      }
    }

    let salePriceVal, saleStartsVal, saleEndsVal;
    if (clearSale) {
      salePriceVal = null;
      saleStartsVal = null;
      saleEndsVal = null;
    } else {
      salePriceVal = sale_price !== undefined ? (sale_price || null) : undefined;
      saleStartsVal = sale_starts_at !== undefined ? (sale_starts_at || null) : undefined;
      saleEndsVal = sale_ends_at !== undefined ? (sale_ends_at || null) : undefined;
    }

    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE products SET name = COALESCE($1, name), description = COALESCE($2, description),
       price = COALESCE($3, price), stock = COALESCE($4, stock),
       is_available = COALESCE($5, is_available), category_id = COALESCE($6, category_id),
       sale_price = COALESCE($7, sale_price), sale_starts_at = COALESCE($8, sale_starts_at),
       sale_ends_at = COALESCE($9, sale_ends_at),
       updated_at = CURRENT_TIMESTAMP WHERE id = $10 RETURNING *`,
      [name, description, price, stock, isAvailable, categoryId,
       salePriceVal, saleStartsVal, saleEndsVal, req.params.id]
    );
    if (images && Array.isArray(images)) {
      await client.query('DELETE FROM product_images WHERE product_id = $1', [req.params.id]);
      if (images.length > 0) {
        const imageValues = images.map((img, i) => {
          const url = typeof img === 'string' ? img : img.url;
          const w = typeof img === 'object' ? (img.width || 0) : 0;
          const h = typeof img === 'object' ? (img.height || 0) : 0;
          return `($1, $${i + 2}, ${i === 0}, ${i}, ${w}, ${h})`;
        }).join(', ');
        const imageParams = images.map(img => typeof img === 'string' ? img : img.url);
        await client.query(
          `INSERT INTO product_images (product_id, image_url, is_primary, display_order, image_width, image_height) VALUES ${imageValues}`,
          [req.params.id, ...imageParams]
        );
      }
    }
    await client.query('COMMIT');
    res.json({ product: result.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Product update error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

export default router;
