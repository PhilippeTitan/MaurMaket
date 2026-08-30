import { Router } from 'express';
import { pool } from '../config/database.js';
import { authRequired } from '../middleware/auth.js';

const router = Router();

function sellerRequired(req, res, next) {
  if (req.user.role !== 'seller') return res.status(403).json({ error: 'Seller access required' });
  next();
}

router.post('/api/promos/validate', authRequired, async (req, res) => {
  const { code, orderTotal } = req.body;
  if (!code) return res.status(400).json({ error: 'Code required' });
  try {
    const result = await pool.query(
      `SELECT * FROM promo_codes WHERE code = $1 AND is_active = true AND (valid_until IS NULL OR valid_until > CURRENT_TIMESTAMP)`,
      [code.toUpperCase()]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Invalid or expired promo code' });
    const promo = result.rows[0];
    if (promo.max_uses && promo.uses_count >= promo.max_uses) return res.status(400).json({ error: 'Promo code has reached max uses' });
    if (orderTotal && parseFloat(orderTotal) < parseFloat(promo.min_order_amount)) {
      return res.status(400).json({ error: `Minimum order amount is G ${parseFloat(promo.min_order_amount).toFixed(0)}` });
    }
    const used = await pool.query('SELECT id FROM promo_uses WHERE promo_id = $1 AND user_id = $2', [promo.id, req.user.id]);
    if (used.rows.length > 0) return res.status(400).json({ error: 'You have already used this promo code' });
    let discount = promo.discount_type === 'percentage'
      ? Math.min(parseFloat(orderTotal || 0) * parseFloat(promo.discount_value) / 100, parseFloat(promo.discount_value) * 10)
      : parseFloat(promo.discount_value);
    if (orderTotal && discount > parseFloat(orderTotal)) discount = parseFloat(orderTotal);
    res.json({ valid: true, discount: parseFloat(discount.toFixed(2)), promoId: promo.id, code: promo.code });
  } catch (err) {
    console.error('Promo validate error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/api/promos', authRequired, sellerRequired, async (req, res) => {
  const tierCheck = await pool.query('SELECT seller_tier FROM users WHERE id = $1', [req.user.id]);
  if (tierCheck.rows[0]?.seller_tier !== 'business') {
    return res.status(403).json({ error: 'Promo codes are a Business seller feature.' });
  }
  const { code, discountType, discountValue, minOrderAmount, maxUses, validUntil } = req.body;
  if (!code || !discountType || !discountValue) return res.status(400).json({ error: 'code, discountType, discountValue required' });
  if (!['percentage', 'fixed'].includes(discountType)) return res.status(400).json({ error: 'discountType must be percentage or fixed' });
  if (discountValue <= 0) return res.status(400).json({ error: 'discountValue must be positive' });
  if (discountType === 'percentage' && discountValue > 100) return res.status(400).json({ error: 'Percentage discount cannot exceed 100%' });
  try {
    const result = await pool.query(
      `INSERT INTO promo_codes (code, seller_id, discount_type, discount_value, min_order_amount, max_uses, valid_until) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [code.toUpperCase(), req.user.id, discountType, discountValue, minOrderAmount || 0, maxUses || null, validUntil || null]
    );
    res.status(201).json({ promo: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Promo code already exists' });
    console.error('Promo create error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/api/promos/mine', authRequired, sellerRequired, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM promo_codes WHERE seller_id = $1 ORDER BY created_at DESC', [req.user.id]);
    res.json({ promos: result.rows });
  } catch (err) {
    console.error('Promos fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/api/promos/:id/toggle', authRequired, sellerRequired, async (req, res) => {
  try {
    const check = await pool.query('SELECT seller_id, is_active FROM promo_codes WHERE id = $1', [req.params.id]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Promo not found' });
    if (check.rows[0].seller_id !== req.user.id) return res.status(403).json({ error: 'Not your promo' });
    const result = await pool.query('UPDATE promo_codes SET is_active = NOT is_active WHERE id = $1 RETURNING *', [req.params.id]);
    res.json({ promo: result.rows[0] });
  } catch (err) {
    console.error('Promo toggle error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
