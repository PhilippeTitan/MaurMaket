import { Router } from 'express';
import { pool } from '../config/database.js';
import { supabaseAdmin } from '../config/supabase.js';
import { authRequired, sellerRequired, dobRequired, verifiedSellerRequired } from '../middleware/auth.js';
import { generateUsername, isAtLeast18 } from '../utils/helpers.js';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID || '273654218158-k61mtuaq2kcvohj05roqdpe6nqmfscu0.apps.googleusercontent.com';

const router = Router();

router.post('/user/profile/bootstrap', authRequired, async (req, res) => {
  if (!req.supabaseUser) return res.status(401).json({ error: 'Supabase authentication required' });
  const metadata = req.supabaseUser.user_metadata || {};
  const fullName = String(req.body.fullName || metadata.full_name || metadata.name || '').trim();
  const phone = String(req.body.phone || metadata.phone || '').trim();
  const dateOfBirth = req.body.dateOfBirth || metadata.date_of_birth || null;
  const email = String(req.supabaseUser.email || '').trim().toLowerCase();
  const requestedUsername = req.body.username ? String(req.body.username).trim().toLowerCase().replace(/[^a-z0-9._]/g, '') : null;
  if (!fullName || !email) return res.status(400).json({ error: 'Authenticated profile is missing name or email' });
  if (fullName.length > 100) return res.status(400).json({ error: 'Name too long (max 100 characters)' });
  try {
    const existing = await pool.query('SELECT id, full_name, email, phone, role, avatar_url, username, show_real_name, created_at, seller_tier, email_verified, taste_onboarding_completed FROM users WHERE id = $1', [req.supabaseUser.id]);
    if (existing.rows.length > 0) return res.json({ user: existing.rows[0], isNewProfile: false });

    const cleanPhone = phone ? phone.replace(/^\+?509/, '').replace(/^\+/, '') : null;

    let username;
    if (requestedUsername && requestedUsername.length >= 5 && requestedUsername.length <= 30 && /^[a-z0-9][a-z0-9._]{3,28}[a-z0-9]$/.test(requestedUsername)) {
      const exists = await pool.query('SELECT 1 FROM users WHERE username = $1', [requestedUsername]);
      username = exists.rows.length === 0 ? requestedUsername : await generateUsername(fullName);
    } else {
      username = await generateUsername(fullName);
    }
    const result = await pool.query(
      `INSERT INTO users (id, full_name, email, phone, role, username, date_of_birth, pending_dob, taste_onboarding_completed, email_verified)
       VALUES ($1, $2, $3, $4, 'buyer', $5, $6, $7, false, $8)
       RETURNING id, full_name, email, phone, role, avatar_url, username, show_real_name, created_at, seller_tier, email_verified, pending_dob, taste_onboarding_completed`,
      [req.supabaseUser.id, fullName, email, cleanPhone, username, dateOfBirth, !dateOfBirth, !!req.supabaseUser.email_confirmed_at]
    );
    res.status(201).json({ user: result.rows[0], isNewProfile: true });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already registered' });
    console.error('Profile bootstrap error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Check email availability ───────────────────────────────────────────────
router.get('/user/check-email', async (req, res) => {
  const { email } = req.query;
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email query parameter required' });
  }
  try {
    const result = await pool.query('SELECT 1 FROM users WHERE email = $1', [email.trim().toLowerCase()]);
    return res.json({ available: result.rows.length === 0 });
  } catch (err) {
    console.error('check-email error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ─── Check username availability ────────────────────────────────────────────
router.get('/user/check-username', async (req, res) => {
  const { username } = req.query;
  if (!username || typeof username !== 'string') {
    return res.status(400).json({ error: 'Username query parameter required' });
  }
  const clean = username.trim().toLowerCase();
  if (clean.length < 5 || clean.length > 30) {
    return res.json({ available: false, reason: 'Username must be 5-30 characters' });
  }
  if (!/^[a-z0-9][a-z0-9._]{0,28}[a-z0-9]$/.test(clean) && clean.length > 1) {
    return res.json({ available: false, reason: 'Lowercase letters, numbers, dots, and underscores only' });
  }
  try {
    const result = await pool.query('SELECT 1 FROM users WHERE username = $1', [clean]);
    return res.json({ available: result.rows.length === 0 });
  } catch (err) {
    console.error('check-username error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ─── Link Google identity to existing account ──────────────────────────────
// Called after password-based signup when user signed up via Google button.
router.post('/user/google-link', authRequired, async (req, res) => {
  const { googleIdToken } = req.body;
  if (!googleIdToken || typeof googleIdToken !== 'string') {
    return res.status(400).json({ error: 'googleIdToken is required' });
  }
  try {
    // Verify the Google ID token via Google's tokeninfo endpoint
    const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(googleIdToken)}`);
    if (!verifyRes.ok) {
      return res.status(400).json({ error: 'Invalid or expired Google token' });
    }
    const payload = await verifyRes.json();
    if (payload.aud !== GOOGLE_CLIENT_ID) {
      return res.status(400).json({ error: 'Token audience mismatch' });
    }
    const googleSub = payload.sub;
    const avatarUrl = payload.picture || null;

    // Store the Google identity on the user
    await pool.query(
      'UPDATE users SET google_id = $1, avatar_url = COALESCE(avatar_url, $2) WHERE id = $3',
      [googleSub, avatarUrl, req.user.id]
    );

    console.log(`[auth] Linked Google identity ${googleSub} to user ${req.user.id}`);
    res.json({ linked: true, googleSub });
  } catch (err) {
    console.error('Google link error:', err);
    res.status(500).json({ error: 'Failed to link Google identity' });
  }
});

// ─── Set password for Google-created account ────────────────────────────────
router.post('/user/set-password', authRequired, async (req, res) => {
  const { password } = req.body;
  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  try {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(req.user.id, { password });
    if (error) {
      console.error('Set password error:', error);
      return res.status(400).json({ error: error.message || 'Failed to set password' });
    }
    console.log(`[auth] Set password for user ${req.user.id}`);
    res.json({ success: true });
  } catch (err) {
    console.error('Set password error:', err);
    res.status(500).json({ error: 'Failed to set password' });
  }
});

router.get('/user/me', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, full_name, email, phone, natcash_phone, accepted_payment_methods, role, avatar_url, bio, created_at, store_name, store_logo_url, seller_tier, id_submitted_at, id_verified, id_verified_at, id_verification_result, use_store_identity, email_verified, location_address, location_city, location_lat, location_lng, username, show_real_name, date_of_birth, pending_dob, taste_onboarding_completed FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/user/profile', authRequired, async (req, res) => {
  let { fullName, email, phone, natcashPhone, bio, avatarUrl, locationAddress, locationCity, locationLat, locationLng, showRealName, useStoreIdentity, acceptedPaymentMethods } = req.body;
  email = undefined;
  if (phone) phone = phone.replace(/^\+?509/, '').replace(/^\+/, '');
  if (natcashPhone) natcashPhone = natcashPhone.replace(/^\+?509/, '').replace(/^\+/, '');
  if (fullName && fullName.length > 100) return res.status(400).json({ error: 'Name too long (max 100 characters)' });
  if (bio && bio.length > 500) return res.status(400).json({ error: 'Bio too long (max 500 characters)' });
  if (locationAddress && locationAddress.length > 200) return res.status(400).json({ error: 'Address too long (max 200 characters)' });
  if (locationCity && locationCity.length > 100) return res.status(400).json({ error: 'City too long (max 100 characters)' });
  try {
    const result = await pool.query(
      `UPDATE users SET
        full_name = COALESCE($1, full_name),
        email = email,
        phone = COALESCE($3, phone),
        bio = COALESCE($4, bio),
        avatar_url = COALESCE($5, avatar_url),
        natcash_phone = COALESCE($13, natcash_phone),
        accepted_payment_methods = COALESCE($14, accepted_payment_methods),
        location_address = COALESCE($7, location_address),
        location_city = COALESCE($8, location_city),
        location_lat = COALESCE($9, location_lat),
        location_lng = COALESCE($10, location_lng),
        show_real_name = COALESCE($11, show_real_name),
        use_store_identity = COALESCE($12, use_store_identity),
        email_verified = email_verified,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING id, full_name, email, phone, natcash_phone, accepted_payment_methods, role, avatar_url, bio, store_name, store_logo_url, seller_tier, id_verified, use_store_identity, email_verified,
                 location_address, location_city, location_lat, location_lng, username, show_real_name`,
      [fullName, email || null, phone, bio, avatarUrl, req.user.id, locationAddress || null, locationCity || null, locationLat || null, locationLng || null,
       showRealName !== undefined ? showRealName : null, useStoreIdentity !== undefined ? useStoreIdentity : null,
       natcashPhone || null, acceptedPaymentMethods || null]
    );
    res.json({ user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already in use' });
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SIM PREFERENCE (carrier-aware payment routing)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /auth/sim-preferences — Get user's preferred SIM subscription IDs
 * Returns: { natcashSubId, moncashSubId }
 * These are mutable preferences — validated against active SIMs before each use.
 */
router.get('/user/sim-preferences', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT preferred_natcash_sub_id, preferred_moncash_sub_id FROM users WHERE id = $1',
      [req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const row = result.rows[0];
    res.json({
      natcashSubId: row.preferred_natcash_sub_id || null,
      moncashSubId: row.preferred_moncash_sub_id || null,
    });
  } catch (err) {
    console.error('Get SIM preferences error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * PUT /auth/sim-preferences — Save user's preferred SIM subscription ID
 * Body: { provider: 'natcash' | 'moncash', subscriptionId: number | null }
 * Pass subscriptionId=null to clear preference.
 * The subscriptionId is a runtime routing preference, NOT a permanent identity.
 */
router.put('/user/sim-preferences', authRequired, async (req, res) => {
  try {
    const { provider, subscriptionId } = req.body || {};
    if (provider !== 'natcash' && provider !== 'moncash') {
      return res.status(400).json({ error: 'provider must be "natcash" or "moncash"' });
    }
    const col = provider === 'natcash' ? 'preferred_natcash_sub_id' : 'preferred_moncash_sub_id';
    // Validate subscriptionId is a non-negative integer or null
    const subId = subscriptionId === null || subscriptionId === undefined
      ? null
      : parseInt(subscriptionId);
    if (subId !== null && (isNaN(subId) || subId < 0)) {
      return res.status(400).json({ error: 'Invalid subscriptionId' });
    }
    await pool.query(
      `UPDATE users SET ${col} = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [subId, req.user.id]
    );
    res.json({ ok: true, provider, subscriptionId: subId });
  } catch (err) {
    console.error('Save SIM preference error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/user/username', authRequired, async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Username required' });
  const clean = username.toLowerCase().replace(/[^a-z0-9._]/g, '');
  if (clean.length < 1 || clean.length > 30) return res.status(400).json({ error: 'Username must be 1-30 characters' });
  if (clean.startsWith('.') || clean.endsWith('.')) return res.status(400).json({ error: 'Username cannot start or end with a period' });
  if (clean.includes('..')) return res.status(400).json({ error: 'Username cannot have consecutive periods' });
  if (!/^[a-z0-9]/.test(clean)) return res.status(400).json({ error: 'Username must start with a letter or number' });
  try {
    const existing = await pool.query('SELECT 1 FROM users WHERE username = $1 AND id != $2', [clean, req.user.id]);
    if (existing.rows.length > 0) return res.status(409).json({ error: 'Username already taken' });
    const result = await pool.query(
      `UPDATE users SET username = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, username`,
      [clean, req.user.id]
    );
    res.json({ user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Username already taken' });
    console.error('Username update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/users/push-token', authRequired, async (req, res) => {
  const { pushToken } = req.body;
  if (!pushToken) return res.status(400).json({ error: 'Push token required' });
  try {
    await pool.query('UPDATE users SET push_token = $1 WHERE id = $2', [pushToken, req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Push token save error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ACCOUNT DELETION (GDPR / App Store Compliance)
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/user/export-data', authRequired, async (req, res) => {
  try {
    const userId = req.user.id;
    const [profile, orders, messages, notifications, reviews] = await Promise.all([
      pool.query('SELECT id, full_name, email, phone, bio, role, seller_tier, created_at FROM users WHERE id = $1', [userId]),
      pool.query('SELECT * FROM orders WHERE buyer_id = $1 ORDER BY created_at DESC', [userId]),
      pool.query('SELECT m.* FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.buyer_id = $1 OR c.seller_id = $1 ORDER BY m.created_at DESC', [userId]),
      pool.query('SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC', [userId]),
      pool.query('SELECT * FROM reviews WHERE reviewer_id = $1 OR seller_id = $1 ORDER BY created_at DESC', [userId]),
    ]);
    res.json({ exportedAt: new Date().toISOString(), profile: profile.rows[0] || null, orders: orders.rows, messages: messages.rows, notifications: notifications.rows, reviews: reviews.rows });
  } catch (err) {
    console.error('Account export error:', err);
    res.status(500).json({ error: 'Failed to export account data' });
  }
});

router.delete('/user/delete-account', authRequired, async (req, res) => {
  const userId = req.user.id;
  const client = await pool.connect();
  try {
    const activeBuyerOrders = await client.query(
      `SELECT id, status FROM orders
       WHERE buyer_id = $1 AND status NOT IN ('completed', 'cancelled', 'refunded')`,
      [userId]
    );
    if (activeBuyerOrders.rows.length > 0) {
      return res.status(400).json({
        error: 'Cannot delete account with active orders. Please wait until your pending orders are completed or cancelled.'
      });
    }

    const activeSellerOrders = await client.query(
      `SELECT o.id, o.status FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       WHERE oi.seller_id = $1 AND o.status NOT IN ('completed', 'cancelled', 'refunded')`,
      [userId]
    );
    if (activeSellerOrders.rows.length > 0) {
      return res.status(400).json({
        error: 'Cannot delete account with active sales. Please complete all pending fulfillments or cancellations first.'
      });
    }

    const openDisputes = await client.query(
      `SELECT DISTINCT d.id FROM disputes d
       JOIN orders o ON o.id = d.order_id
       WHERE d.status = 'open' AND (
         d.raised_by = $1
         OR o.buyer_id = $1
         OR EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND oi.seller_id = $1)
       )`,
      [userId]
    );
    if (openDisputes.rows.length > 0) {
      return res.status(400).json({
        error: 'Cannot delete account while a dispute involving you is open. Please wait until it is resolved.'
      });
    }

    const sellerBalance = await client.query(
      `SELECT balance FROM seller_balances WHERE seller_id = $1`,
      [userId]
    );
    if (sellerBalance.rows.length > 0 && parseFloat(sellerBalance.rows[0].balance || 0) > 0) {
      return res.status(400).json({
        error: 'Please withdraw your remaining seller balance before deleting your account.'
      });
    }

    const pendingPayouts = await client.query(
      `SELECT id FROM payouts WHERE seller_id = $1 AND status IN ('pending', 'processing')`,
      [userId]
    );
    if (pendingPayouts.rows.length > 0) {
      return res.status(400).json({
        error: 'You have a payout in progress. Please wait until your payout completes before deleting your account.'
      });
    }

    await client.query('BEGIN');

    const lockedBalance = await client.query(
      `SELECT balance FROM seller_balances WHERE seller_id = $1 FOR UPDATE`,
      [userId]
    );
    if (lockedBalance.rows.length > 0 && parseFloat(lockedBalance.rows[0].balance || 0) > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Please withdraw your remaining seller balance before deleting your account.'
      });
    }
    const recheckPendingPayouts = await client.query(
      `SELECT id FROM payouts WHERE seller_id = $1 AND status IN ('pending', 'processing')`,
      [userId]
    );
    if (recheckPendingPayouts.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'You have a payout in progress. Please wait until your payout completes before deleting your account.'
      });
    }

    await client.query('UPDATE products SET is_available = FALSE WHERE seller_id = $1', [userId]);

    await client.query('DELETE FROM wishlists WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM follows WHERE follower_id = $1 OR seller_id = $1', [userId]);
    await client.query('DELETE FROM feed_events WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM saved_addresses WHERE user_id = $1', [userId]);

    await client.query(
      `UPDATE verification_attempts SET
        id_front_url = NULL, id_back_url = NULL, selfie_url = NULL,
        ocr_result = NULL, face_match_score = NULL, rejection_reason = NULL
       WHERE user_id = $1`,
      [userId]
    );

    await client.query(
      `UPDATE didit_webhook_events SET vendor_data = 'deleted' WHERE vendor_data = $1`,
      [userId]
    );

    const anonymizedEmail = `deleted_${userId.slice(0, 8)}_${Date.now()}@deleted.maurmaket.com`;
    const anonymizedUsername = `deleted_${userId.slice(0, 8)}`;
    await client.query(
      `UPDATE users SET
        full_name = 'Deleted User', username = $1, email = $2,
        phone = NULL, avatar_url = NULL, bio = NULL,
        store_name = NULL, store_logo_url = NULL, id_document_url = NULL,
        id_verified = FALSE, role = 'deleted', seller_tier = 'none', push_token = NULL,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [anonymizedUsername, anonymizedEmail, userId]
    );

    await client.query('COMMIT');
    if (supabaseAdmin) {
      const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (authDeleteError) console.error('Supabase Auth deletion error:', authDeleteError.message);
    }
    res.json({ success: true, message: 'Account deleted successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Account deletion error:', err);
    res.status(500).json({ error: 'Failed to delete account. Please try again later.' });
  } finally {
    client.release();
  }
});

// Legacy 410 stubs removed — auth now handled by Better Auth

// ═══════════════════════════════════════════════════════════════════════════════
// COMPLETE DOB (Google OAuth users)
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/user/complete-dob', authRequired, async (req, res) => {
  const { dateOfBirth } = req.body;
  if (!dateOfBirth) return res.status(400).json({ error: 'Date of birth is required' });
  if (!isAtLeast18(dateOfBirth)) return res.status(400).json({ error: 'You must be at least 18 years old' });
  try {
    const result = await pool.query(
      `UPDATE users SET date_of_birth = $1, pending_dob = false, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND pending_dob = true
       RETURNING id, full_name, email, phone, role, avatar_url, bio, created_at, store_name, store_logo_url, seller_tier, id_verified, use_store_identity, email_verified, location_address, location_city, location_lat, location_lng, username, show_real_name, date_of_birth, pending_dob`,
      [dateOfBirth, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'DOB already set or user not found' });
    }
    const user = result.rows[0];
    res.json({ user });
  } catch (err) {
    console.error('complete-dob error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/user/skip-dob', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE users SET pending_dob = false, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND pending_dob = true
       RETURNING id, full_name, email, phone, role, avatar_url, bio, created_at, store_name, store_logo_url, seller_tier, id_verified, use_store_identity, email_verified, location_address, location_city, location_lat, location_lng, username, show_real_name, date_of_birth, pending_dob, taste_onboarding_completed`,
      [req.user.id]
    );
    if (result.rows.length === 0) return res.status(400).json({ error: 'DOB onboarding already completed' });
    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('skip-dob error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// BECOME A SELLER
// ═══════════════════════════════════════════════════════════════════════════════

router.put('/user/become-seller', authRequired, dobRequired, async (req, res) => {
  try {
    if (req.user.role === 'seller') {
      const existing = await pool.query(
        `SELECT id, full_name, email, phone, role, avatar_url, bio, store_name, store_logo_url, seller_tier, id_submitted_at, id_verified, id_verified_at, id_verification_result, use_store_identity, email_verified, created_at, location_address, location_city, location_lat, location_lng, username, show_real_name FROM users WHERE id = $1`,
        [req.user.id]
      );
      return res.json({ success: true, alreadySeller: true, user: existing.rows[0] });
    }
    const { storeName, storeLogoUrl, idDocumentUrl, natcashPhone, tier } = req.body;
    const allowedTiers = ['casual', 'verified', 'business'];
    const sellerTier = allowedTiers.includes(tier) ? tier : 'casual';

    // If choosing verified, require id_verified
    if (sellerTier === 'verified' && !req.user.id_verified) {
      return res.status(400).json({ error: 'ID verification required for verified seller tier. Complete verification first.' });
    }

    // If choosing business, require id_verified
    if (sellerTier === 'business' && !req.user.id_verified) {
      return res.status(400).json({ error: 'ID verification required for business seller tier. Complete verification first.' });
    }

    const useStoreIdentity = false;
    const result = await pool.query(
      `UPDATE users SET
        role = 'seller', seller_tier = $2,
        store_name = COALESCE($3, store_name), store_logo_url = COALESCE($4, store_logo_url),
        id_document_url = COALESCE($5, id_document_url), use_store_identity = $6,
        natcash_phone = $7, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, full_name, email, phone, role, avatar_url, bio, store_name, store_logo_url, seller_tier, id_submitted_at, id_verified, id_verified_at, id_verification_result, use_store_identity, email_verified, created_at, location_address, location_city, location_lat, location_lng, username, show_real_name`,
      [req.user.id, sellerTier, storeName || null, storeLogoUrl || null, idDocumentUrl || null, useStoreIdentity, natcashPhone || null]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Become seller error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SELLER PROFILE & VERIFICATION
// ═══════════════════════════════════════════════════════════════════════════════

router.put('/user/upgrade-tier', authRequired, sellerRequired, async (req, res) => {
  try {
    const { tier, storeName, storeLogoUrl, idDocumentUrl, natcashPhone } = req.body;
    if (!['verified', 'business'].includes(tier)) {
      return res.status(400).json({ error: 'Invalid tier. Must be verified or business.' });
    }

    const current = await pool.query('SELECT seller_tier, id_verified FROM users WHERE id = $1', [req.user.id]);
    const currentTier = current.rows[0]?.seller_tier || 'none';

    const tierOrder = { none: 0, casual: 1, verified: 2, business: 3 };
    if ((tierOrder[currentTier] || 0) >= (tierOrder[tier] || 0)) {
      return res.status(400).json({ error: `You are already at ${currentTier} tier or higher.` });
    }

    if (tier === 'verified' && !current.rows[0]?.id_verified) {
      return res.status(400).json({ error: 'You must complete ID verification before upgrading to Verified.' });
    }

    const updates = ['seller_tier = $2', 'updated_at = CURRENT_TIMESTAMP'];
    const values = [req.user.id, tier];
    let idx = 3;

    if (tier === 'business') {
      if (storeName !== undefined) { updates.push(`store_name = $${idx++}`); values.push(storeName || null); }
      if (storeLogoUrl !== undefined) { updates.push(`store_logo_url = $${idx++}`); values.push(storeLogoUrl || null); }
      if (storeName) { updates.push('use_store_identity = true'); }
    }

    if (natcashPhone !== undefined) { updates.push(`natcash_phone = $${idx++}`); values.push(natcashPhone || null); }

    if (idDocumentUrl) {
      updates.push(`id_document_url = $${idx++}`);
      values.push(idDocumentUrl);
      updates.push('id_submitted_at = CURRENT_TIMESTAMP');
    }

    const result = await pool.query(
      `UPDATE users SET ${updates.join(', ')}
       WHERE id = $1
       RETURNING id, full_name, email, phone, role, avatar_url, bio, store_name, store_logo_url, seller_tier, id_submitted_at, id_verified, id_verified_at, id_verification_result, use_store_identity, email_verified, created_at, location_address, location_city, location_lat, location_lng, username, show_real_name`,
      values
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Upgrade tier error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/user/seller-profile', authRequired, sellerRequired, async (req, res) => {
  const { storeName, storeLogoUrl, idDocumentUrl, useStoreIdentity, natcashPhone, acceptedPaymentMethods } = req.body;

  const tierCheck = await pool.query('SELECT seller_tier FROM users WHERE id = $1', [req.user.id]);
  const sellerTier = tierCheck.rows[0]?.seller_tier || 'none';
  if ((storeName !== undefined || storeLogoUrl !== undefined) && sellerTier !== 'business') {
    return res.status(403).json({ error: 'Store branding is a Business seller feature. Upgrade your plan to set a store name and logo.' });
  }

  try {
    const fields = [];
    const values = [];
    let idx = 1;
    if (storeName !== undefined) { fields.push(`store_name = $${idx++}`); values.push(storeName || null); }
    if (storeLogoUrl !== undefined) { fields.push(`store_logo_url = $${idx++}`); values.push(storeLogoUrl || null); }
    if (useStoreIdentity !== undefined) { fields.push(`use_store_identity = $${idx++}`); values.push(!!useStoreIdentity); }
    if (natcashPhone !== undefined) {
      const clean = natcashPhone ? natcashPhone.replace(/^\+?509/, '').replace(/^\+/, '') : null;
      fields.push(`natcash_phone = $${idx++}`); values.push(clean);
    }
    if (acceptedPaymentMethods !== undefined) { fields.push(`accepted_payment_methods = $${idx++}`); values.push(acceptedPaymentMethods); }
    if (idDocumentUrl !== undefined) {
      fields.push(`id_document_url = $${idx++}`);
      values.push(idDocumentUrl || null);
      fields.push(`id_submitted_at = CURRENT_TIMESTAMP`);
    }
    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });
    values.push(req.user.id);
    const result = await pool.query(
      `UPDATE users SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${idx}
       RETURNING id, full_name, email, phone, natcash_phone, accepted_payment_methods, role, avatar_url, bio, store_name, store_logo_url, seller_tier, id_submitted_at, id_verified, id_verified_at, id_verification_result, use_store_identity, email_verified, created_at, location_address, location_city, location_lat, location_lng, username, show_real_name`,
      values
    );
    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Seller profile update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/seller/verification-status', authRequired, sellerRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT seller_tier, id_document_url, id_submitted_at, id_verified, id_verified_at FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Verification status error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
