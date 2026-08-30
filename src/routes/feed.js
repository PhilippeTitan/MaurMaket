import { Router } from 'express';
import { pool } from '../config/database.js';
import { authRequired } from '../middleware/auth.js';

const router = Router();

// Record a feed event (like, relevant, not_relevant, view, dwell)
router.post('/api/feed/event', authRequired, async (req, res) => {
  const { productId, eventType, durationMs } = req.body;
  if (!productId || !eventType) return res.status(400).json({ error: 'productId and eventType required' });
  const validTypes = ['view', 'like', 'unlike', 'relevant', 'not_relevant', 'save', 'dwell'];
  if (!validTypes.includes(eventType)) return res.status(400).json({ error: `eventType must be one of: ${validTypes.join(', ')}` });

  try {
    // Rate limit: max 50 events per user per hour
    const rateCheck = await pool.query(
      `SELECT COUNT(*) FROM feed_events WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
      [req.user.id]
    );
    if (parseInt(rateCheck.rows[0].count) >= 50) {
      return res.status(429).json({ error: 'Too many actions. Please wait.', rateLimited: true });
    }

    // Unlike: DELETE the like row (not insert an unlike row) so like_count decreases
    if (eventType === 'unlike') {
      await pool.query(
        `DELETE FROM feed_events WHERE user_id = $1 AND product_id = $2 AND event_type = 'like'`,
        [req.user.id, productId]
      );
      const category = await pool.query('SELECT category_id FROM products WHERE id = $1', [productId]);
      if (category.rows[0]?.category_id) {
        await pool.query(
          `INSERT INTO user_category_affinities (user_id, category_id, score)
           VALUES ($1, $2, -1)
           ON CONFLICT (user_id, category_id) DO UPDATE SET
             score = GREATEST(-3, LEAST(3, user_category_affinities.score - 1)),
             updated_at = CURRENT_TIMESTAMP`,
          [req.user.id, category.rows[0].category_id]
        );
      }
    } else {
      // Like, save, relevant, etc — INSERT or update
      await pool.query(
        `INSERT INTO feed_events (user_id, product_id, event_type, duration_ms)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, product_id, event_type) DO UPDATE SET
           duration_ms = COALESCE($4, feed_events.duration_ms),
           created_at = CURRENT_TIMESTAMP`,
        [req.user.id, productId, eventType, durationMs || null]
      );
      // Explicit feedback should improve similar listings too, not only this exact product.
      if (eventType === 'relevant' || eventType === 'not_relevant') {
        const category = await pool.query('SELECT category_id FROM products WHERE id = $1', [productId]);
        if (category.rows[0]?.category_id) {
          const delta = eventType === 'relevant' ? 1 : -1;
          await pool.query(
            `INSERT INTO user_category_affinities (user_id, category_id, score)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id, category_id) DO UPDATE SET
               score = GREATEST(-3, LEAST(3, user_category_affinities.score + EXCLUDED.score)),
               updated_at = CURRENT_TIMESTAMP`,
            [req.user.id, category.rows[0].category_id, delta]
          );
        }
      }
      // Likes and saves also boost category affinity (positive signal)
      if (eventType === 'like' || eventType === 'save') {
        const category = await pool.query('SELECT category_id FROM products WHERE id = $1', [productId]);
        if (category.rows[0]?.category_id) {
          await pool.query(
            `INSERT INTO user_category_affinities (user_id, category_id, score)
             VALUES ($1, $2, 1)
             ON CONFLICT (user_id, category_id) DO UPDATE SET
               score = GREATEST(-3, LEAST(3, user_category_affinities.score + 1)),
               updated_at = CURRENT_TIMESTAMP`,
            [req.user.id, category.rows[0].category_id]
          );
        }
      }
    }
    res.json({ recorded: true });
  } catch (err) {
    console.error('Feed event error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Batch check which products the user has liked
router.get('/api/feed/liked-status', authRequired, async (req, res) => {
  try {
    const ids = (req.query.ids || '').split(',').filter(Boolean);
    if (ids.length === 0) return res.json({ liked: {} });
    const result = await pool.query(
      `SELECT product_id FROM feed_events WHERE user_id = $1 AND product_id = ANY($2) AND event_type = 'like'`,
      [req.user.id, ids]
    );
    const set = {};
    for (const row of result.rows) set[row.product_id] = true;
    res.json({ liked: set });
  } catch (err) {
    console.error('Feed liked batch check error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Seed a new account's feed with a few intentional category choices.
router.post('/api/feed/taste', authRequired, async (req, res) => {
  const { categoryIds } = req.body;
  if (!Array.isArray(categoryIds) || categoryIds.length < 3 || categoryIds.length > 12 || categoryIds.some(id => typeof id !== 'string')) {
    return res.status(400).json({ error: 'Choose between 3 and 12 categories' });
  }
  const uniqueIds = [...new Set(categoryIds)];
  try {
    const categories = await pool.query('SELECT id FROM categories WHERE id = ANY($1::uuid[])', [uniqueIds]);
    if (categories.rows.length !== uniqueIds.length) return res.status(400).json({ error: 'One or more categories are invalid' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const { id } of categories.rows) {
        await client.query(
          `INSERT INTO user_category_affinities (user_id, category_id, score)
           VALUES ($1, $2, 2)
           ON CONFLICT (user_id, category_id) DO UPDATE SET score = GREATEST(user_category_affinities.score, 2), updated_at = CURRENT_TIMESTAMP`,
          [req.user.id, id]
        );
      }
      await client.query('UPDATE users SET taste_onboarding_completed = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [req.user.id]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    res.json({ saved: true });
  } catch (err) {
    console.error('Feed taste error:', err);
    res.status(500).json({ error: 'Could not save your preferences' });
  }
});

router.post('/api/feed/taste/skip', authRequired, async (req, res) => {
  try {
    await pool.query('UPDATE users SET taste_onboarding_completed = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [req.user.id]);
    res.json({ saved: true });
  } catch (err) {
    console.error('Feed taste skip error:', err);
    res.status(500).json({ error: 'Could not update preferences' });
  }
});

export default router;
