import { Router } from 'express';
import { pool } from '../config/database.js';
import { optionalAuth, authRequired, sellerRequired, verifiedSellerRequired, dobRequired } from '../middleware/auth.js';
import { createNotification } from '../utils/notifications.js';
import { checkSubscriptionStatus } from '../utils/helpers.js';
import {
  checkTierCap,
  validateListingPayload,
  assessModeration,
  isMaterialChange,
  hasActiveCommitment,
  applyStockSideEffects,
  DEFAULT_LOW_STOCK_THRESHOLD,
} from '../utils/listingPolicy.js';

const router = Router();

// Replace-all variant insert (option labels are recomputed server-side).
async function insertVariants(client, productId, variants) {
  await client.query('DELETE FROM product_variants WHERE product_id = $1', [productId]);
  for (let i = 0; i < variants.length; i++) {
    const v = variants[i];
    const options = v.options && typeof v.options === 'object' ? v.options : {};
    const optionLabel = Object.entries(options).map(([k, val]) => `${k}: ${val}`).join(' / ');
    await client.query(
      `INSERT INTO product_variants (product_id, options, option_label, price, stock, sku, display_order)
       VALUES ($1, $2::jsonb, $3, $4, $5, $6, $7)`,
      [
        productId,
        JSON.stringify(options),
        optionLabel,
        parseFloat(v.price),
        Math.max(0, parseInt(v.stock, 10) || 0),
        v.sku || null,
        i,
      ]
    );
  }
}

// Price-drop fanout: wishlisting users are notified once per drop (saved_price
// advances with each drop so the same cut never re-notifies). Push delivery is
// opt-in via the price_drops notification category; the in-app record always exists.
async function notifyPriceDrop(productId, oldPrice, newPrice) {
  try {
    if (isNaN(Number(newPrice)) || isNaN(Number(oldPrice))) return;
    if (!(Number(newPrice) < Number(oldPrice))) return;
    await pool.query(
      `UPDATE wishlists SET saved_price = $2
        WHERE product_id = $1 AND saved_price IS NULL`,
      [productId, oldPrice]
    );
    const r = await pool.query(
      `UPDATE wishlists SET saved_price = $2
        WHERE product_id = $1 AND saved_price > $2
        RETURNING user_id`,
      [productId, Number(newPrice)]
    );
    for (const row of r.rows) {
      createNotification(
        row.user_id,
        'price_drop',
        'Price drop on a saved item',
        `An item you saved dropped from G ${Number(oldPrice)} to G ${Number(newPrice)}.`,
        { productId }
      ).catch(() => {});
    }
  } catch (e) {
    console.error('Price-drop notification error:', e.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DIVERSITY RERANKER
// ═══════════════════════════════════════════════════════════════════════════════

// Preserve relevance while avoiding adjacent repeats when alternatives are nearby.
function diversifyFeed(products, { lookahead = 6 } = {}) {
  if (!products || products.length <= 1) return products;
  const remaining = [...products];
  const result = [];
  while (remaining.length) {
    const windowSize = Math.min(lookahead, remaining.length);
    const candidates = remaining.slice(0, windowSize);
    const previous = result[result.length - 1];
    let selectedIndex = candidates.findIndex((product) =>
      product.seller_id !== previous?.seller_id && product.category_id !== previous?.category_id
    );
    if (selectedIndex < 0) {
      selectedIndex = candidates.findIndex((product) => product.seller_id !== previous?.seller_id);
    }
    if (selectedIndex < 0) selectedIndex = 0;
    result.push(remaining.splice(selectedIndex, 1)[0]);
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRODUCT LIST (with personalization)
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/products', optionalAuth, async (req, res) => {
  const { category, search, seller, minPrice, maxPrice, condition, excludeOwnListings, excludeProductIds, sort, page = 1, limit = 20, personalized, following } = req.query;
  const offset = excludeProductIds
    ? 0
    : (Math.max(1, page) - 1) * Math.min(limit, 50);

  const params = [];
  const conditions = ['p.is_available = TRUE'];
  let paramIndex = 1;

  if (category) {
    conditions.push(`c.name = $${paramIndex++}`);
    params.push(category);
  }
  if (search) {
    conditions.push(`(
      p.name ILIKE $${paramIndex} OR p.description ILIKE $${paramIndex} OR c.name ILIKE $${paramIndex}
      OR u.username ILIKE $${paramIndex}
      OR (u.use_store_identity = TRUE AND u.store_name ILIKE $${paramIndex})
      OR (u.show_real_name = TRUE AND u.full_name ILIKE $${paramIndex})
    )`);
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
  if (condition) {
    const validConditions = new Set(['new', 'like_new', 'good', 'fair', 'for_parts']);
    if (!validConditions.has(condition)) return res.status(400).json({ error: 'Invalid condition filter' });
    conditions.push(`p.condition = $${paramIndex++}`);
    params.push(condition);
  }

  const userId = req.user?.id || null;
  const usePersonalized = !!userId && (personalized === 'true' || following === 'true');
  if (excludeOwnListings === 'true' && userId) {
    conditions.push(`p.seller_id <> $${paramIndex++}`);
    params.push(userId);
  }
  if (excludeProductIds) {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const excludedIds = String(excludeProductIds).split(',').filter((id) => uuidPattern.test(id));
    if (excludedIds.length) {
      conditions.push(`NOT (p.id = ANY($${paramIndex++}::uuid[]))`);
      params.push(excludedIds);
    }
  }

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
            THEN 'Similar to what you''ve browsed'
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
              p.condition, p.has_variants, p.offers_enabled, p.paused_reason, p.listing_status,
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
    if (usePersonalizedRanking && products.length > 1) {
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

router.get('/products/:id', optionalAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) return res.status(404).json({ error: 'Product not found' });
    const userId = req.user?.id || null;
    const result = await pool.query(
      `SELECT p.*, u.full_name AS seller_name, u.avatar_url AS seller_avatar,
              u.store_name, u.store_logo_url, u.seller_tier, u.id_verified, u.use_store_identity, u.username AS seller_username,
              u.natcash_phone,
              CASE WHEN u.natcash_phone IS NOT NULL
                     AND 'natcash' = ANY(COALESCE(u.accepted_payment_methods, ARRAY[]::text[]))
                     AND ((u.seller_tier = 'business' AND EXISTS (SELECT 1 FROM seller_subscriptions bs WHERE bs.seller_id = u.id AND bs.status IN ('active','past_due') AND bs.expires_at + make_interval(days => COALESCE(bs.grace_period_days,7)) > CURRENT_TIMESTAMP))
                       OR EXISTS (SELECT 1 FROM natcash_access_subscriptions ns WHERE ns.seller_id = u.id AND ns.status = 'active' AND ns.expires_at + INTERVAL '3 days' > CURRENT_TIMESTAMP))
                   THEN u.accepted_payment_methods ELSE array_remove(COALESCE(u.accepted_payment_methods, ARRAY['moncash']::text[]), 'natcash') END AS accepted_payment_methods,
              u.phone AS seller_phone,
              c.name AS category,
              (CASE WHEN p.sale_price IS NOT NULL AND (p.sale_starts_at IS NULL OR p.sale_starts_at <= NOW()) AND (p.sale_ends_at IS NULL OR p.sale_ends_at >= NOW()) THEN p.sale_price ELSE p.price END)::DECIMAL(10,2) AS effective_price,
              (CASE WHEN p.sale_price IS NOT NULL AND (p.sale_starts_at IS NULL OR p.sale_starts_at <= NOW()) AND (p.sale_ends_at IS NULL OR p.sale_ends_at >= NOW()) THEN true ELSE false END) AS is_on_sale,
              (CASE WHEN p.sale_price IS NOT NULL AND (p.sale_starts_at IS NULL OR p.sale_starts_at <= NOW()) AND (p.sale_ends_at IS NULL OR p.sale_ends_at >= NOW()) THEN ROUND((1 - p.sale_price / p.price) * 100) ELSE 0 END)::INTEGER AS discount_pct,
              COALESCE(like_counts.like_count, 0) AS like_count,
              COALESCE(wishlist_counts.wishlist_count, 0) AS wishlist_count,
              CASE WHEN $2::uuid IS NOT NULL AND EXISTS (SELECT 1 FROM feed_events fe WHERE fe.product_id = p.id AND fe.user_id = $2 AND fe.event_type = 'like') THEN true ELSE false END AS is_liked,
              CASE WHEN $2::uuid IS NOT NULL AND EXISTS (SELECT 1 FROM wishlists w WHERE w.product_id = p.id AND w.user_id = $2) THEN true ELSE false END AS is_wishlisted,
              (SELECT json_agg(json_build_object('id', pi.id, 'image_url', pi.image_url, 'thumbnail_url', pi.thumbnail_url, 'is_primary', pi.is_primary, 'image_width', pi.image_width, 'image_height', pi.image_height) ORDER BY pi.is_primary DESC, pi.display_order ASC) FROM product_images pi WHERE pi.product_id = p.id) AS images,
              (SELECT json_agg(json_build_object('id', pv.id, 'options', pv.options, 'option_label', pv.option_label, 'price', pv.price, 'stock', pv.stock, 'sku', pv.sku, 'display_order', pv.display_order, 'is_active', pv.is_active) ORDER BY pv.display_order ASC) FROM product_variants pv WHERE pv.product_id = p.id AND pv.is_active = TRUE) AS variants
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
      WHERE p.id = $1
        AND (p.is_available = TRUE
             OR ($2::uuid IS NOT NULL
                 AND ($2::uuid = p.seller_id
                      OR EXISTS (SELECT 1 FROM users ua WHERE ua.id = $2 AND ua.role = 'admin'))))`,
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
  if (!req.user?.email_verified) {
    return res.status(403).json({ error: 'email_not_verified', message: 'Please verify your email to start selling.' });
  }
  const {
    name, description, price, stock, categoryId, images, sale_price, sale_starts_at, sale_ends_at,
    condition, flawNotes, sku, offersEnabled, languageLabel, attrs,
    meetupEnabled, deliveryEnabled, lowStockThreshold, variants, draftId,
  } = req.body;

  const tierCheck = await pool.query('SELECT seller_tier FROM users WHERE id = $1', [req.user.id]);
  const sellerTier = tierCheck.rows[0]?.seller_tier || 'none';
  if (sellerTier === 'business') {
    const subStatus = await checkSubscriptionStatus(req.user.id);
    if (subStatus === 'expired') {
      await pool.query(`UPDATE users SET seller_tier = 'verified', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [req.user.id]);
      createNotification(req.user.id, 'subscription_expired', 'Business Subscription Expired', 'Your Business subscription has expired. You have been demoted to Verified Seller.', {}, pool);
      return res.status(403).json({ error: 'Business subscription expired. You have been demoted to Verified Seller.' });
    }
  }

  const hasVariants = Array.isArray(variants) && variants.length > 0;
  let finalPrice = price;
  let finalStock = stock;
  if (hasVariants) {
    const vPrices = variants.map((v) => parseFloat(v.price)).filter((p) => !isNaN(p));
    if (vPrices.length !== variants.length) {
      return res.status(400).json({ error: 'Every variant needs a price', code: 'LISTING_INVALID' });
    }
    finalPrice = Math.min(...vPrices);
    finalStock = variants.reduce((s, v) => s + (parseInt(v.stock, 10) || 0), 0);
  }

  const errors = validateListingPayload(
    {
      name, description, price: finalPrice, stock: finalStock, categoryId, images,
      condition, flawNotes, sku, languageLabel, attrs, lowStockThreshold,
      variants: hasVariants ? variants : undefined,
      salePrice: sale_price, saleEndDate: sale_ends_at,
    },
    { publish: true }
  );
  if (errors.length) {
    return res.status(400).json({ error: errors[0], errors, code: 'LISTING_INVALID' });
  }

  // v1 moderation: conservative keyword policy; flagged listings go to review
  // instead of going live, and the seller sees a Pending review state.
  const mod = assessModeration({ name, description, flawNotes });

  if (draftId) {
    const draftOwn = await pool.query(
      'SELECT id FROM product_drafts WHERE id = $1 AND seller_id = $2',
      [draftId, req.user.id]
    );
    if (draftOwn.rows.length === 0) {
      return res.status(404).json({ error: 'Draft not found', code: 'DRAFT_NOT_FOUND' });
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const currentTier = await client.query('SELECT seller_tier FROM users WHERE id = $1 FOR UPDATE', [req.user.id]);
    const tier = currentTier.rows[0]?.seller_tier || 'none';
    if (!mod.flagged) {
      const cap = await checkTierCap(req.user.id, tier, 1, client);
      if (!cap.ok) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(403).json({
          error: `Your ${tier === 'verified' ? 'Verified' : tier} plan allows ${cap.cap} active listings (${cap.count} active). Pause a listing or upgrade to add another.`,
          code: tier === 'verified' ? 'VERIFIED_LISTING_LIMIT' : 'TIER_CAP',
          limit: cap.cap,
          active: cap.count,
        });
      }
    }

    const productResult = await client.query(
      `INSERT INTO products (seller_id, category_id, name, description, price, stock,
                              sale_price, sale_starts_at, sale_ends_at,
                              condition, flaw_notes, sku, offers_enabled, language_label, attrs,
                              meetup_enabled, delivery_enabled, low_stock_threshold,
                              has_variants, listing_status, is_available)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
               $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
       RETURNING *`,
      [
        req.user.id, categoryId || null, name.trim(), description || '', finalPrice, finalStock || 0,
        sale_price || null, sale_starts_at || null, sale_ends_at || null,
        condition || null, (flawNotes || '').trim() || null, sku || null,
        offersEnabled === undefined ? true : !!offersEnabled,
        languageLabel || null,
        attrs && Object.keys(attrs).length ? JSON.stringify(attrs) : null,
        meetupEnabled === undefined ? null : !!meetupEnabled,
        deliveryEnabled === undefined ? null : !!deliveryEnabled,
        lowStockThreshold ? parseInt(lowStockThreshold, 10) : DEFAULT_LOW_STOCK_THRESHOLD,
        hasVariants,
        mod.flagged ? 'pending_review' : 'active',
        mod.flagged ? false : true,
      ]
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

    if (hasVariants) {
      await insertVariants(client, product.id, variants);
    }

    if (draftId) {
      await client.query('DELETE FROM product_drafts WHERE id = $1 AND seller_id = $2', [draftId, req.user.id]);
    }

    await client.query('COMMIT');
    client.release();

    if (mod.flagged) {
      return res.status(201).json({ product, moderated: 'pending_review' });
    }

    try {
      const followers = await pool.query('SELECT follower_id FROM follows WHERE seller_id = $1', [req.user.id]);
      if (followers.rows.length > 0) {
        const sellerName = (await pool.query('SELECT full_name FROM users WHERE id = $1', [req.user.id])).rows[0]?.full_name || 'A seller';
        const productImage = (await pool.query('SELECT image_url FROM product_images WHERE product_id = $1 AND is_primary = true LIMIT 1', [product.id])).rows[0]?.image_url;
        for (const f of followers.rows) {
          const notifData = { productId: product.id, sellerId: req.user.id };
          if (productImage) notifData.image = productImage;
          createNotification(f.follower_id, 'new_product_from_followed', `New Listing from ${sellerName}`,
            `${sellerName} just listed "${name}" for G ${finalPrice}`, notifData);
        }
      }
    } catch (e) { console.error('Follower notification error:', e.message); }
    res.status(201).json({ product, moderated: 'approved' });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
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
    const check = await client.query(
      `SELECT seller_id, price, stock, is_available, listing_status, paused_reason,
              name, description, category_id, condition, flaw_notes, attrs, has_variants
         FROM products WHERE id = $1 FOR UPDATE`,
      [req.params.id]
    );
    if (check.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    const before = check.rows[0];
    if (before.seller_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not your product' });
    }
    const {
      name, description, price, stock, isAvailable, categoryId, images,
      sale_price, sale_starts_at, sale_ends_at, clearSale,
      condition, flawNotes, sku, offersEnabled, languageLabel, attrs,
      meetupEnabled, deliveryEnabled, lowStockThreshold, variants,
    } = req.body;

    // ── structural validation of whatever was sent ──
    const structural = validateListingPayload({
      name, description, condition, flawNotes, sku, languageLabel, attrs,
      lowStockThreshold, variants: variants !== undefined ? variants : undefined,
    }, { publish: false });
    if (structural.length) return res.status(400).json({ error: structural[0], errors: structural });

    // ── variant handling (replace-all) ──
    let incomingVariants = null;
    let variantsChanged = false;
    let effHasVariants = !!before.has_variants;
    if (variants !== undefined) {
      incomingVariants = Array.isArray(variants) ? variants : [];
      const oldV = await client.query(
        'SELECT options, price, stock, sku FROM product_variants WHERE product_id = $1 ORDER BY display_order ASC',
        [req.params.id]
      );
      const norm = (list) => JSON.stringify(
        list
          .map((v) => ({ o: v.options || {}, p: Number(v.price), s: parseInt(v.stock, 10) || 0, k: v.sku || null }))
          .sort((a, b) => JSON.stringify(a.o).localeCompare(JSON.stringify(b.o)))
      );
      variantsChanged = norm(oldV.rows) !== norm(incomingVariants);
      effHasVariants = incomingVariants.length > 0;
    }

    // ── price/stock computation ──
    let newPrice = price !== undefined && price !== null && price !== '' ? parseFloat(price) : null;
    let newStock = stock !== undefined && stock !== null && stock !== '' ? parseInt(stock, 10) : null;
    if (effHasVariants && incomingVariants) {
      const vp = incomingVariants.map((v) => parseFloat(v.price)).filter((n) => !isNaN(n));
      if (vp.length !== incomingVariants.length) {
        return res.status(400).json({ error: 'Every variant needs a price', code: 'LISTING_INVALID' });
      }
      newPrice = Math.min(...vp);
      newStock = incomingVariants.reduce((s, v) => s + (parseInt(v.stock, 10) || 0), 0);
    }

    if (newStock !== null && newStock < 0) {
      return res.status(400).json({ error: 'Stock cannot be negative' });
    }
    if (newPrice !== null && newPrice > 99999) {
      return res.status(400).json({ error: 'Maximum price is 99,999 G (MonCash limit)' });
    }
    if (newPrice !== null && newPrice < 100) {
      return res.status(400).json({ error: 'Minimum price is 100 G' });
    }

    const effectivePrice = newPrice !== null ? newPrice : parseFloat(before.price);
    if ((sale_price !== undefined && sale_price !== null && sale_price !== '') || clearSale) {
      if (effHasVariants && !clearSale) {
        return res.status(400).json({ error: 'Sale prices are not available for listings with variants' });
      }
      if (!clearSale) {
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
    }

    // ── commitment locks: active orders/reservations freeze price/stock/variants ──
    const priceChanged = newPrice !== null && newPrice !== Number(before.price);
    const stockChanged = newStock !== null && newStock !== Number(before.stock);
    const locked = await hasActiveCommitment(req.params.id, client);
    if (locked && (priceChanged || stockChanged || variantsChanged)) {
      return res.status(409).json({
        error: 'This listing has an active order or reservation. Price, stock, and options stay locked until it completes.',
        code: 'PRICE_STOCK_LOCKED',
      });
    }

    // ── material vs routine change (only live listings go through moderation) ──
    let imagesChanged = false;
    if (images !== undefined && Array.isArray(images)) {
      const oldImgs = await client.query(
        'SELECT image_url FROM product_images WHERE product_id = $1 ORDER BY display_order ASC',
        [req.params.id]
      );
      const urlOf = (img) => (typeof img === 'string' ? img : img && img.url);
      imagesChanged =
        JSON.stringify(oldImgs.rows.map((r) => r.image_url)) !== JSON.stringify(images.map(urlOf));
    }
    const material = isMaterialChange(
      {
        name: before.name,
        description: before.description,
        categoryId: before.category_id,
        condition: before.condition,
        flawNotes: before.flaw_notes,
        attrs: before.attrs,
      },
      { name, description, categoryId, condition, flawNotes, attrs, imagesChanged, variantsChanged }
    );

    // ── reactivation requires an active moderation state + tier cap ──
    const reactivating = isAvailable === true && before.is_available === false;
    if (reactivating && req.user.role !== 'admin') {
      if (before.listing_status !== 'active') {
        return res.status(409).json({
          error: before.listing_status === 'pending_review'
            ? 'This listing is waiting for review and will go live automatically if approved.'
            : 'Edit and resubmit this listing before making it live.',
          code: before.listing_status === 'rejected' ? 'LISTING_REJECTED' : 'LISTING_PENDING',
        });
      }
      if (before.paused_reason === 'tier_cap') {
        return res.status(403).json({ error: 'Upgrade your plan or pause another listing to free up space.', code: 'TIER_CAP' });
      }
      const tierR = await client.query('SELECT seller_tier FROM users WHERE id = $1 FOR UPDATE', [req.user.id]);
      const tier = tierR.rows[0]?.seller_tier || 'none';
      const cap = await checkTierCap(req.user.id, tier, 1, client);
      if (!cap.ok) {
        return res.status(403).json({
          error: `Your ${tier} plan allows ${cap.cap} active listings (${cap.count} active). Pause another listing first.`,
          code: tier === 'verified' ? 'VERIFIED_LISTING_LIMIT' : 'TIER_CAP',
          limit: cap.cap,
          active: cap.count,
        });
      }
    }

    // ── build SET clause ──
    const updates = [];
    const values = [];
    const add = (col, val, cast) => {
      values.push(val);
      updates.push(`${col} = $${values.length}${cast || ''}`);
    };
    if (name !== undefined) add('name', String(name).trim());
    if (description !== undefined) add('description', description || '');
    if (newPrice !== null) add('price', newPrice);
    if (newStock !== null) add('stock', newStock);
    if (isAvailable !== undefined) add('is_available', !!isAvailable);
    if (categoryId !== undefined) add('category_id', categoryId || null);
    if (condition !== undefined) add('condition', condition || null);
    if (flawNotes !== undefined) add('flaw_notes', String(flawNotes || '').trim() || null);
    if (sku !== undefined) add('sku', sku || null);
    if (offersEnabled !== undefined) add('offers_enabled', !!offersEnabled);
    if (languageLabel !== undefined) add('language_label', languageLabel || null);
    if (attrs !== undefined) add('attrs', attrs && Object.keys(attrs).length ? JSON.stringify(attrs) : null, '::jsonb');
    if (meetupEnabled !== undefined) add('meetup_enabled', meetupEnabled === null ? null : !!meetupEnabled);
    if (deliveryEnabled !== undefined) add('delivery_enabled', deliveryEnabled === null ? null : !!deliveryEnabled);
    if (lowStockThreshold !== undefined && lowStockThreshold !== null && lowStockThreshold !== '') {
      add('low_stock_threshold', parseInt(lowStockThreshold, 10) || 3);
    }
    if (variants !== undefined) add('has_variants', effHasVariants);
    if (isAvailable === false && before.is_available === true && before.listing_status === 'active') {
      add('paused_reason', 'seller_manual');
    } else if (reactivating) {
      add('paused_reason', null);
    }
    if (clearSale) {
      add('sale_price', null);
      add('sale_starts_at', null);
      add('sale_ends_at', null);
    } else {
      if (sale_price !== undefined) add('sale_price', sale_price || null);
      if (sale_starts_at !== undefined) add('sale_starts_at', sale_starts_at || null);
      if (sale_ends_at !== undefined) add('sale_ends_at', sale_ends_at || null);
    }

    // ── moderation on material changes to a live listing ──
    let flaggedChange = false;
    if (material && before.listing_status === 'active') {
      const mod = assessModeration({
        name: name !== undefined ? name : before.name,
        description: description !== undefined ? description : before.description,
        flawNotes: flawNotes !== undefined ? flawNotes : before.flaw_notes,
      });
      if (mod.flagged) {
        flaggedChange = true;
        add('listing_status', 'pending_review');
        add('is_available', false);
        add('moderation_reason', mod.reason);
        updates.push('reviewed_at = CURRENT_TIMESTAMP');
      }
    }

    if (updates.length === 0) {
      return res.json({ product: before });
    }
    values.push(req.params.id);
    const result = await client.query(
      `UPDATE products SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $${values.length} RETURNING *`,
      values
    );

    if (images !== undefined && Array.isArray(images)) {
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

    if (incomingVariants && incomingVariants.length > 0 && variantsChanged) {
      await insertVariants(client, req.params.id, incomingVariants);
    }

    await client.query('COMMIT');
    const product = result.rows[0];

    if (flaggedChange) {
      createNotification(
        req.user.id,
        'listing_in_review',
        'Listing sent for review',
        `Your changes to "${product.name}" need a quick review before the listing goes live again.`,
        { screen: 'MyListings', productId: product.id }
      ).catch(() => {});
    }
    if (priceChanged || variantsChanged) {
      notifyPriceDrop(product.id, before.price, product.price).catch(() => {});
    }
    try {
      await applyStockSideEffects(product.id);
    } catch (e) {
      console.error('Stock side effects error:', e.message);
    }

    res.json({ product });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    console.error('Product update error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

export default router;
