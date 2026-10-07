import { Router } from 'express';
import { pool } from '../config/database.js';
import { authRequired, sellerRequired, verifiedSellerRequired, accountActive } from '../middleware/auth.js';
import { adminRequired } from './admin.js';
import { createNotification } from '../utils/notifications.js';
import {
  checkTierCap,
  tierCapFor,
  validateListingPayload,
  assessModeration,
  hasActiveCommitment,
  DEFAULT_LOW_STOCK_THRESHOLD,
  MAX_DRAFTS_PER_SELLER,
} from '../utils/listingPolicy.js';

const router = Router();

// ───── Shared helpers ─────

async function getSellerTier(sellerId, client = pool) {
  const r = await client.query('SELECT seller_tier FROM users WHERE id = $1', [sellerId]);
  return r.rows[0]?.seller_tier || 'none';
}

const DRAFT_SUMMARY_SQL = `
  SELECT d.id, d.source_product_id, d.created_at, d.updated_at,
         d.data->>'name' AS name,
         (SELECT json_build_object('image_url',
                  CASE jsonb_typeof(v) WHEN 'string' THEN v #>> '{}' ELSE v->>'url' END)
            FROM jsonb_array_elements(COALESCE(d.data->'images', '[]'::jsonb)) WITH ORDINALITY AS t(v, ord)
           WHERE jsonb_typeof(v) IN ('string', 'object')
           ORDER BY t.ord LIMIT 1) AS cover
    FROM product_drafts d`;

// ═══════════════════════════════════════════════════════════════════════════════
// DRAFTS — private work-in-progress; autosaved, never public, no cap against tiers
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/api/listings/drafts', authRequired, sellerRequired, async (req, res) => {
  try {
    const { data = {}, sourceProductId = null } = req.body || {};
    const errors = validateListingPayload(data, { publish: false });
    if (errors.length) return res.status(400).json({ error: errors[0], errors });

    const count = await pool.query(
      'SELECT COUNT(*)::int AS count FROM product_drafts WHERE seller_id = $1',
      [req.user.id]
    );
    if (count.rows[0].count >= MAX_DRAFTS_PER_SELLER) {
      return res.status(403).json({
        error: `You have ${MAX_DRAFTS_PER_SELLER} drafts. Delete old drafts to keep working.`,
        code: 'DRAFT_LIMIT',
      });
    }

    if (sourceProductId) {
      const own = await pool.query(
        'SELECT 1 FROM products WHERE id = $1 AND seller_id = $2',
        [sourceProductId, req.user.id]
      );
      if (own.rows.length === 0) return res.status(403).json({ error: 'Not your product' });
    }

    const result = await pool.query(
      `INSERT INTO product_drafts (seller_id, data, source_product_id)
       VALUES ($1, $2::jsonb, $3) RETURNING *`,
      [req.user.id, JSON.stringify(data), sourceProductId]
    );
    res.status(201).json({ draft: result.rows[0] });
  } catch (err) {
    console.error('Draft create error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/api/listings/drafts', authRequired, sellerRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `${DRAFT_SUMMARY_SQL} WHERE d.seller_id = $1 ORDER BY d.updated_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json({ drafts: result.rows });
  } catch (err) {
    console.error('Draft list error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/api/listings/drafts/:id', authRequired, sellerRequired, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM product_drafts WHERE id = $1 AND seller_id = $2', [
      req.params.id,
      req.user.id,
    ]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Draft not found' });
    res.json({ draft: result.rows[0] });
  } catch (err) {
    console.error('Draft get error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Autosave — replaces the draft payload (client keeps the authoritative form state).
router.put('/api/listings/drafts/:id', authRequired, sellerRequired, async (req, res) => {
  try {
    const { data } = req.body || {};
    if (data === undefined || data === null || typeof data !== 'object' || Array.isArray(data)) {
      return res.status(400).json({ error: 'Draft data is required' });
    }
    const errors = validateListingPayload(data, { publish: false });
    if (errors.length) return res.status(400).json({ error: errors[0], errors });

    const existing = await pool.query(
      'SELECT id FROM product_drafts WHERE id = $1 AND seller_id = $2',
      [req.params.id, req.user.id]
    );
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Draft not found' });

    const result = await pool.query(
      `UPDATE product_drafts SET data = $3::jsonb, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND seller_id = $2 RETURNING *`,
      [req.params.id, req.user.id, JSON.stringify(data)]
    );
    res.json({ draft: result.rows[0] });
  } catch (err) {
    console.error('Draft save error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/api/listings/drafts/:id', authRequired, sellerRequired, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM product_drafts WHERE id = $1 AND seller_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Draft not found' });
    res.json({ deleted: true });
  } catch (err) {
    console.error('Draft delete error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// MANAGEMENT — list, pause/resume, duplicate, resubmit, appeal, stats
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/api/seller/listings', authRequired, sellerRequired, async (req, res) => {
  try {
    const tier = await getSellerTier(req.user.id);
    const [listingsRes, draftsRes] = await Promise.all([
      pool.query(
        `SELECT p.id, p.name, p.price, p.sale_price, p.sale_starts_at, p.sale_ends_at, p.stock,
                p.is_available, p.listing_status, p.paused_reason, p.moderation_reason,
                p.moderation_category, p.moderation_detail, p.content_updated_during_review,
                p.appeal_note, p.appealed_at, p.reviewed_at, p.condition, p.has_variants,
                p.offers_enabled, p.low_stock_threshold, p.created_at, p.updated_at,
                p.is_pinned,
                c.name AS category,
                (SELECT COALESCE(pi.thumbnail_url, pi.image_url) FROM product_images pi
                  WHERE pi.product_id = p.id ORDER BY pi.is_primary DESC, pi.display_order ASC LIMIT 1) AS image_url,
                (SELECT COUNT(*)::int FROM product_images pi WHERE pi.product_id = p.id) AS image_count,
                COALESCE(v.variant_count, 0) AS variant_count,
                COALESCE(v.min_price, p.price) AS min_price,
                COALESCE(v.total_stock, p.stock) AS variant_stock,
                (SELECT COUNT(*)::int FROM order_items oi
                   JOIN orders o ON o.id = oi.order_id
                  WHERE oi.product_id = p.id AND o.status IN ('pending','paid','processing','shipped','delivered')) AS active_orders
           FROM products p
           LEFT JOIN categories c ON p.category_id = c.id
           LEFT JOIN (
             SELECT product_id, COUNT(*)::int AS variant_count,
                    MIN(price) AS min_price, SUM(stock)::int AS total_stock
               FROM product_variants WHERE is_active = true GROUP BY product_id
           ) v ON v.product_id = p.id
          WHERE p.seller_id = $1
          ORDER BY p.created_at DESC
          LIMIT 200`,
        [req.user.id]
      ),
      pool.query('SELECT COUNT(*)::int AS count FROM product_drafts WHERE seller_id = $1', [req.user.id]),
    ]);

    const listings = listingsRes.rows;
    const counts = {
      active: 0,
      pending_review: 0,
      under_review: 0,
      rejected: 0,
      paused: 0,
      out_of_stock: 0,
    };
    for (const l of listings) {
      if (l.listing_status === 'pending_review') counts.pending_review += 1;
      else if (l.listing_status === 'under_review') counts.under_review += 1;
      else if (l.listing_status === 'rejected') counts.rejected += 1;
      else if (!l.is_available) {
        counts.paused += 1;
        if (l.paused_reason === 'out_of_stock') counts.out_of_stock += 1;
      } else counts.active += 1;
    }

    res.json({
      listings,
      counts,
      draftsCount: draftsRes.rows[0].count,
      tier,
      cap: tier === 'business' ? null : tierCapFor(tier),
    });
  } catch (err) {
    console.error('Seller listings error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/api/products/:id/pause', authRequired, sellerRequired, async (req, res) => {
  try {
    const check = await pool.query(
      `SELECT seller_id, is_available, listing_status FROM products WHERE id = $1`,
      [req.params.id]
    );
    if (check.rows.length === 0) return res.status(404).json({ error: 'Listing not found' });
    if (check.rows[0].seller_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not your listing' });
    }
    if (!check.rows[0].is_available) return res.json({ paused: true });
    if (check.rows[0].listing_status !== 'active') {
      return res.status(409).json({ error: 'Only live listings can be paused' });
    }
    const result = await pool.query(
      `UPDATE products SET is_available = false, paused_reason = 'seller_manual', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    res.json({ product: result.rows[0], paused: true });
  } catch (err) {
    console.error('Pause listing error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/api/products/:id/resume', authRequired, sellerRequired, accountActive, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const check = await client.query(
      `SELECT seller_id, is_available, listing_status, paused_reason, stock, has_variants
         FROM products WHERE id = $1 FOR UPDATE`,
      [req.params.id]
    );
    if (check.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Listing not found' });
    }
    const p = check.rows[0];
    if (p.seller_id !== req.user.id && req.user.role !== 'admin') {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Not your listing' });
    }
    if (p.is_available) {
      await client.query('ROLLBACK');
      return res.json({ product: p, resumed: true });
    }
    if (p.listing_status !== 'active') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: p.listing_status === 'pending_review'
          ? 'This listing is waiting for review and will go live automatically if approved.'
          : 'Edit and resubmit this listing before making it live.',
        code: p.listing_status === 'rejected' ? 'LISTING_REJECTED' : 'LISTING_PENDING',
      });
    }
    if (p.paused_reason === 'tier_cap') {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Upgrade your plan or pause another listing to free up space.', code: 'TIER_CAP' });
    }

    const stockCheck = p.has_variants
      ? await client.query(
          `SELECT COALESCE(SUM(stock), 0)::int AS total FROM product_variants
            WHERE product_id = $1 AND is_active = true`,
          [req.params.id]
        )
      : null;
    const totalStock = p.has_variants ? stockCheck.rows[0].total : Number(p.stock || 0);
    if (totalStock < 1) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Add stock before making this listing live again.', code: 'OUT_OF_STOCK' });
    }

    const tier = await getSellerTier(req.user.id, client);
    const cap = await checkTierCap(req.user.id, tier, 1, client);
    if (!cap.ok) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        error: `Your ${tier} plan allows ${cap.cap} active listings (${cap.count} active). Pause another listing first.`,
        code: 'TIER_CAP',
        limit: cap.cap,
        active: cap.count,
      });
    }

    const result = await client.query(
      `UPDATE products
          SET is_available = true, paused_reason = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    await client.query('COMMIT');
    res.json({ product: result.rows[0], resumed: true });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    console.error('Resume listing error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// Rejected → seller edits → resubmit: revalidates + re-moderates + cap check.
router.post('/api/products/:id/resubmit', authRequired, verifiedSellerRequired, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const check = await client.query(
      `SELECT p.*, c.name AS category_name
         FROM products p LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.id = $1 FOR UPDATE OF p`,
      [req.params.id]
    );
    if (check.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Listing not found' });
    }
    const p = check.rows[0];
    if (p.seller_id !== req.user.id && req.user.role !== 'admin') {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Not your listing' });
    }
    // APP-Q546: a seller may fix disputed photos/text while a content-rights
    // review is open; that must not clear or restart the review.
    const isContentRightsReview = p.listing_status === 'under_review';
    if (p.listing_status !== 'rejected' && !isContentRightsReview) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Only rejected or under-review listings can be resubmitted' });
    }

    const images = await pool.query(
      'SELECT COUNT(*)::int AS count FROM product_images WHERE product_id = $1',
      [req.params.id]
    );
    const errors = validateListingPayload(
      {
        name: p.name,
        description: p.description,
        price: p.price,
        stock: p.stock,
        categoryId: p.category_id,
        condition: p.condition,
        flawNotes: p.flaw_notes,
        sku: p.sku,
        languageLabel: p.language_label,
        attrs: p.attrs,
        lowStockThreshold: p.low_stock_threshold,
        images: new Array(images.rows[0].count).fill('x'),
        variants: p.has_variants ? await fetchVariantPayload(client, p.id) : undefined,
      },
      { publish: true }
    );
    if (errors.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: errors[0], errors, code: 'LISTING_INVALID' });
    }

    const mod = assessModeration({ name: p.name, description: p.description, flawNotes: p.flaw_notes });
    let status = 'active';
    let available = true;
    if (isContentRightsReview) {
      status = 'under_review';
      available = false;
    } else if (p.moderation_category) {
      // A listing already confirmed as a content-rights violation goes back to
      // human review; it must not return to public discovery on an edit alone
      // (APP-Q547/Q549).
      status = 'pending_review';
      available = false;
    } else if (mod.flagged) {
      status = 'pending_review';
      available = false;
    } else {
      const tier = await getSellerTier(req.user.id, client);
      const cap = await checkTierCap(req.user.id, tier, 1, client);
      if (!cap.ok) {
        await client.query('ROLLBACK');
        return res.status(403).json({
          error: `Your ${tier} plan allows ${cap.cap} active listings (${cap.count} active). Pause another listing first.`,
          code: 'TIER_CAP',
          limit: cap.cap,
        });
      }
    }

    const result = await client.query(
      `UPDATE products
          SET listing_status = $2, is_available = $3, paused_reason = NULL,
              moderation_reason = CASE WHEN $5 THEN moderation_reason ELSE $4 END,
              content_updated_during_review = CASE WHEN $5 THEN true ELSE content_updated_during_review END,
              reviewed_at = CURRENT_TIMESTAMP,
              appeal_note = CASE WHEN $5 THEN appeal_note ELSE NULL END,
              appealed_at = CASE WHEN $5 THEN appealed_at ELSE NULL END,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 RETURNING *`,
      [req.params.id, status, available, mod.reason, isContentRightsReview]
    );
    await client.query('COMMIT');
    res.json({
      product: result.rows[0],
      moderated: isContentRightsReview ? 'under_review' : (status === 'pending_review' ? 'pending_review' : 'approved'),
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    console.error('Listing resubmit error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

router.post('/api/products/:id/appeal', authRequired, sellerRequired, async (req, res) => {
  try {
    const note = String((req.body || {}).note || '').trim();
    if (note.length < 10) {
      return res.status(400).json({ error: 'Tell us why you believe this was a mistake (at least 10 characters).' });
    }
    if (note.length > 1000) return res.status(400).json({ error: 'Appeal note too long (max 1000 characters)' });
    const check = await pool.query(
      'SELECT seller_id, listing_status FROM products WHERE id = $1',
      [req.params.id]
    );
    if (check.rows.length === 0) return res.status(404).json({ error: 'Listing not found' });
    if (check.rows[0].seller_id !== req.user.id) return res.status(403).json({ error: 'Not your listing' });
    // APP-Q547: an open content-rights review may also be appealed.
    if (!['rejected', 'under_review'].includes(check.rows[0].listing_status)) {
      return res.status(409).json({ error: 'Only rejected or under-review listings can be appealed' });
    }
    const result = await pool.query(
      `UPDATE products SET appeal_note = $2, appealed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 RETURNING *`,
      [req.params.id, note]
    );
    res.json({ product: result.rows[0] });
  } catch (err) {
    console.error('Listing appeal error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Duplicate a listing into a private draft: details/photos copied, stock and
// availability reset, then the seller reviews and publishes deliberately.
router.post('/api/products/:id/duplicate', authRequired, sellerRequired, async (req, res) => {
  try {
    const check = await pool.query(
      `SELECT p.*, c.name AS category_name FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.id = $1`,
      [req.params.id]
    );
    if (check.rows.length === 0) return res.status(404).json({ error: 'Listing not found' });
    const p = check.rows[0];
    if (p.seller_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not your listing' });
    }

    const [imgRes, varRes] = await Promise.all([
      pool.query(
        'SELECT image_url FROM product_images WHERE product_id = $1 ORDER BY is_primary DESC, display_order ASC',
        [req.params.id]
      ),
      pool.query(
        `SELECT options, option_label, price, sku FROM product_variants
          WHERE product_id = $1 AND is_active = true ORDER BY display_order ASC`,
        [req.params.id]
      ),
    ]);

    const data = {
      name: `${p.name} (copy)`.slice(0, 200),
      description: p.description || '',
      price: p.has_variants && varRes.rows.length ? Math.min(...varRes.rows.map((v) => Number(v.price))) : Number(p.price),
      stock: '',
      categoryId: p.category_id || '',
      category: p.category_name || null,
      images: imgRes.rows.map((r) => ({ url: r.image_url })),
      condition: p.condition || '',
      flawNotes: p.flaw_notes || '',
      sku: p.sku || '',
      offersEnabled: p.offers_enabled !== false,
      languageLabel: p.language_label || '',
      attrs: p.attrs || {},
      meetupEnabled: p.meetup_enabled,
      deliveryEnabled: p.delivery_enabled,
      lowStockThreshold: p.low_stock_threshold || DEFAULT_LOW_STOCK_THRESHOLD,
      variants: varRes.rows.map((v) => ({
        options: v.options,
        optionLabel: v.option_label,
        price: Number(v.price),
        stock: 0,
        sku: v.sku || '',
      })),
      salePrice: '',
      saleStartDate: '',
      saleEndDate: '',
    };

    const count = await pool.query(
      'SELECT COUNT(*)::int AS count FROM product_drafts WHERE seller_id = $1',
      [req.user.id]
    );
    if (count.rows[0].count >= MAX_DRAFTS_PER_SELLER) {
      return res.status(403).json({ error: 'Draft limit reached. Delete an old draft first.', code: 'DRAFT_LIMIT' });
    }

    const draft = await pool.query(
      `INSERT INTO product_drafts (seller_id, data, source_product_id)
       VALUES ($1, $2::jsonb, $3) RETURNING *`,
      [req.user.id, JSON.stringify(data), p.id]
    );
    res.status(201).json({ draft: draft.rows[0] });
  } catch (err) {
    console.error('Listing duplicate error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Approximate views/saves + commitment lock — seller tools only, never public.
router.get('/api/products/:id/seller-stats', authRequired, sellerRequired, async (req, res) => {
  try {
    const check = await pool.query('SELECT seller_id FROM products WHERE id = $1', [req.params.id]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Listing not found' });
    if (check.rows[0].seller_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not your listing' });
    }
    const [views, saves, locked] = await Promise.all([
      pool.query(
        `SELECT COUNT(DISTINCT user_id)::int AS views FROM feed_events
          WHERE product_id = $1 AND event_type IN ('view','like','relevant','save')`,
        [req.params.id]
      ),
      pool.query('SELECT COUNT(*)::int AS saves FROM wishlists WHERE product_id = $1', [req.params.id]),
      hasActiveCommitment(req.params.id),
    ]);
    res.json({
      views: views.rows[0].views,
      saves: saves.rows[0].saves,
      locked,
      approximate: true,
    });
  } catch (err) {
    console.error('Seller stats error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN — moderation queue (approve / reject / appeals)
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/api/admin/listings/pending', authRequired, adminRequired, async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.id, p.name, p.description, p.price, p.stock, p.condition, p.flaw_notes,
              p.listing_status, p.moderation_reason, p.moderation_category, p.moderation_detail,
              p.content_updated_during_review, p.appeal_note, p.appealed_at,
              p.created_at, p.updated_at, p.is_available, p.paused_reason,
              u.id AS seller_id, u.full_name AS seller_name, u.seller_tier,
              c.name AS category,
              (SELECT COALESCE(pi.thumbnail_url, pi.image_url) FROM product_images pi
                WHERE pi.product_id = p.id ORDER BY pi.is_primary DESC, pi.display_order ASC LIMIT 1) AS image_url
         FROM products p
         JOIN users u ON u.id = p.seller_id
         LEFT JOIN categories c ON c.id = p.category_id
        WHERE (p.listing_status = 'pending_review')
           OR (p.listing_status = 'rejected' AND p.appealed_at IS NOT NULL)
           OR (p.listing_status = 'under_review')
        ORDER BY COALESCE(p.appealed_at, p.updated_at) ASC
        LIMIT 100`
    );
    res.json({ listings: result.rows });
  } catch (err) {
    console.error('Admin pending listings error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/api/admin/listings/:id/approve', authRequired, adminRequired, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const check = await client.query(
      `SELECT p.*, u.seller_tier FROM products p JOIN users u ON u.id = p.seller_id
        WHERE p.id = $1 FOR UPDATE`,
      [req.params.id]
    );
    if (check.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Listing not found' });
    }
    const p = check.rows[0];

    // Approval makes it live — the tier cap still applies.
    const tier = p.seller_tier || 'none';
    const wasLive = p.is_available && p.listing_status === 'active';
    if (!wasLive) {
      const cap = await checkTierCap(p.seller_id, tier, 1, client);
      if (!cap.ok) {
        await client.query('ROLLBACK');
        return res.status(403).json({
          error: `Seller is at their ${tier} listing cap (${cap.cap}). Ask them to pause a listing, then approve.`,
          code: 'TIER_CAP',
        });
      }
    }

    const result = await client.query(
      `UPDATE products
          SET listing_status = 'active', is_available = true, paused_reason = NULL,
              moderation_reason = NULL, moderation_category = NULL, moderation_detail = NULL,
              content_updated_during_review = false, reviewed_at = CURRENT_TIMESTAMP,
              appeal_note = NULL, appealed_at = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    await client.query('COMMIT');

    createNotification(
      p.seller_id,
      'listing_approved',
      'Your listing is live',
      `"${p.name}" passed review and is now visible to buyers.`,
      { screen: 'MyListings', productId: p.id }
    ).catch(() => {});

    res.json({ product: result.rows[0] });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    console.error('Admin approve listing error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

router.post('/api/admin/listings/:id/reject', authRequired, adminRequired, async (req, res) => {
  try {
    const reason = String((req.body || {}).reason || '').trim();
    if (reason.length < 5) return res.status(400).json({ error: 'A rejection reason is required' });
    if (reason.length > 500) return res.status(400).json({ error: 'Reason too long (max 500 characters)' });

    const check = await pool.query('SELECT seller_id, name FROM products WHERE id = $1', [req.params.id]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Listing not found' });

    const result = await pool.query(
      `UPDATE products
          SET listing_status = 'rejected', is_available = false,
              paused_reason = 'seller_manual', moderation_reason = $2,
              reviewed_at = CURRENT_TIMESTAMP, appeal_note = NULL, appealed_at = NULL,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 RETURNING *`,
      [req.params.id, reason]
    );

    createNotification(
      check.rows[0].seller_id,
      'listing_rejected',
      'Listing needs changes',
      `"${check.rows[0].name}" was rejected: ${reason}. Edit it and submit again.`,
      { screen: 'MyListings', productId: req.params.id }
    ).catch(() => {});

    res.json({ product: result.rows[0] });
  } catch (err) {
    console.error('Admin reject listing error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN — content-rights / authenticity restriction (APP-Q545–APP-Q547)
// ═══════════════════════════════════════════════════════════════════════════════

const CONTENT_REVIEW_CATEGORIES = new Set([
  'counterfeit', 'stolen_content', 'brand_misuse', 'prohibited', 'other',
]);

// Restricts a listing into an open content review. The seller is told the reason
// category, the affected content, and their response path — never the reporter's
// identity or the private evidence (APP-Q545). Routine review keeps the listing
// visible; only a credible immediate serious risk is hidden (APP-Q008), which
// the reviewing person chooses with `hide`.
router.post('/api/admin/listings/:id/restrict', authRequired, adminRequired, async (req, res) => {
  try {
    const category = String((req.body || {}).category || '').trim();
    const detail = String((req.body || {}).detail || '').trim();
    const hide = (req.body || {}).hide === true;
    if (!CONTENT_REVIEW_CATEGORIES.has(category)) {
      return res.status(400).json({ error: 'A valid review category is required' });
    }
    if (detail.length > 500) return res.status(400).json({ error: 'Detail too long (max 500 characters)' });

    const check = await pool.query(
      'SELECT seller_id, name, listing_status FROM products WHERE id = $1',
      [req.params.id]
    );
    if (check.rows.length === 0) return res.status(404).json({ error: 'Listing not found' });
    if (check.rows[0].listing_status === 'under_review') {
      return res.status(409).json({ error: 'Listing is already under content review' });
    }

    const result = await pool.query(
      `UPDATE products
          SET listing_status = 'under_review',
              is_available = CASE WHEN $2 THEN false ELSE is_available END,
              paused_reason = CASE WHEN $2 THEN 'content_review' ELSE paused_reason END,
              moderation_category = $3, moderation_detail = $4,
              content_updated_during_review = false,
              reviewed_at = CURRENT_TIMESTAMP,
              appeal_note = NULL, appealed_at = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 RETURNING *`,
      [req.params.id, hide, category, detail || null]
    );

    createNotification(
      check.rows[0].seller_id,
      'listing_under_review',
      hide ? 'Listing hidden while we review a report' : 'Listing under review',
      hide
        ? `"${check.rows[0].name}" is hidden from buyers while we review a concern. You can check the affected content and respond.`
        : `"${check.rows[0].name}" stays visible while we review a concern. You can check the affected content and respond.`,
      { screen: 'MyListings', productId: req.params.id }
    ).catch(() => {});

    res.json({ product: result.rows[0] });
  } catch (err) {
    console.error('Admin restrict listing error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Confirms a content-rights / authenticity concern after human review. The
// listing leaves public discovery. Buyers whose completed orders included the
// listing are told factually, with a Support route, without blame and without
// any order/payment state change (APP-Q548). Reporter identity and private
// evidence are never revealed. Item-affecting categories (counterfeit,
// prohibited) notify buyers; content-only issues (stolen photos, brand misuse)
// do not, because nothing about a delivered item changes.
const BUYER_NOTICE_CATEGORIES = new Set(['counterfeit', 'prohibited']);

router.post('/api/admin/listings/:id/confirm', authRequired, adminRequired, async (req, res) => {
  try {
    const detail = String((req.body || {}).detail || '').trim();
    if (detail.length > 500) return res.status(400).json({ error: 'Detail too long (max 500 characters)' });

    const check = await pool.query(
      'SELECT seller_id, name, listing_status, moderation_category FROM products WHERE id = $1',
      [req.params.id]
    );
    if (check.rows.length === 0) return res.status(404).json({ error: 'Listing not found' });
    if (check.rows[0].listing_status !== 'under_review') {
      return res.status(409).json({ error: 'Only a listing under content review can be confirmed' });
    }

    const result = await pool.query(
      `UPDATE products
          SET listing_status = 'rejected', is_available = false,
              paused_reason = 'content_review',
              moderation_detail = COALESCE(NULLIF($2, ''), moderation_detail),
              moderation_reason = COALESCE(NULLIF($2, ''), moderation_reason, 'Content review confirmed'),
              reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 RETURNING *`,
      [req.params.id, detail]
    );

    createNotification(
      check.rows[0].seller_id,
      'listing_content_confirmed',
      'Listing removed after a content review',
      `A content concern about "${check.rows[0].name}" was confirmed, so the listing is no longer public. You can appeal if you believe this is a mistake.`,
      { screen: 'MyListings', productId: req.params.id }
    ).catch(() => {});

    let notifiedBuyers = 0;
    if (BUYER_NOTICE_CATEGORIES.has(check.rows[0].moderation_category)) {
      const affected = await pool.query(
        `SELECT DISTINCT o.buyer_id
           FROM orders o
           JOIN order_items oi ON oi.order_id = o.id
          WHERE oi.product_id = $1 AND o.status = 'completed'`,
        [req.params.id]
      );
      for (const row of affected.rows) {
        notifiedBuyers += 1;
        createNotification(
          row.buyer_id,
          'content_review_buyer_notice',
          'About an item from a past order',
          `A content concern about "${check.rows[0].name}" from a past order was confirmed. Your order and payment are unchanged, and no action is needed. Contact Support if you have questions.`,
          { screen: 'HelpSupport', productId: req.params.id }
        ).catch(() => {});
      }
    }

    res.json({ product: result.rows[0], notified_buyers: notifiedBuyers });
  } catch (err) {
    console.error('Admin confirm listing error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ───── internals ─────

async function fetchVariantPayload(client, productId) {
  const r = await client.query(
    `SELECT options, price, stock, sku FROM product_variants
      WHERE product_id = $1 AND is_active = true ORDER BY display_order ASC`,
    [productId]
  );
  return r.rows.map((v) => ({ options: v.options, price: Number(v.price), stock: v.stock, sku: v.sku }));
}

export default router;
export { hasActiveCommitment, getSellerTier };
