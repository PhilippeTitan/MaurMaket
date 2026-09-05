import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { pool } from '../config/database.js';
import { JWT_SECRET, BCRYPT_ROUNDS } from '../config/security.js';
import { authRequired, sellerRequired, dobRequired, verifiedSellerRequired } from '../middleware/auth.js';
import { createNotification } from '../utils/notifications.js';
import { generateUsername, checkSubscriptionStatus, isAtLeast18 } from '../utils/helpers.js';
import { gmailConfigured, sendViaGmailApi, emailTransporter, gmailSenderEmail } from '../config/email.js';

const router = Router();

router.post('/auth/profile/bootstrap', authRequired, async (req, res) => {
  const { fullName, email, phone, dateOfBirth } = req.body;
  if (!fullName || !email) return res.status(400).json({ error: 'Full name and email required' });
  if (fullName.length > 100) return res.status(400).json({ error: 'Name too long (max 100 characters)' });
  try {
    const cleanPhone = phone ? phone.replace(/^\+?509/, '').replace(/^\+/, '') : null;
    const username = await generateUsername(fullName);
    const result = await pool.query(
      `INSERT INTO users (id, full_name, email, phone, role, username, date_of_birth, taste_onboarding_completed, email_verified)
       VALUES ($1, $2, $3, $4, 'buyer', $5, $6, false, true)
       ON CONFLICT (id) DO UPDATE SET
         full_name = EXCLUDED.full_name,
         email = EXCLUDED.email,
         phone = COALESCE(EXCLUDED.phone, users.phone),
         date_of_birth = COALESCE(EXCLUDED.date_of_birth, users.date_of_birth),
         updated_at = CURRENT_TIMESTAMP
       RETURNING id, full_name, email, phone, role, avatar_url, username, show_real_name, created_at, seller_tier, email_verified, taste_onboarding_completed`,
      [req.user.id, fullName, String(email).trim().toLowerCase(), cleanPhone, username, dateOfBirth || null]
    );
    res.status(201).json({ user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already registered' });
    console.error('Profile bootstrap error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/auth/signup', async (req, res) => {
  const { fullName, email, password, phone, dateOfBirth } = req.body;
  if (!fullName || !email || !password) {
    return res.status(400).json({ error: 'Full name, email, and password required' });
  }
  if (!dateOfBirth) return res.status(400).json({ error: 'Date of birth is required' });
  if (!isAtLeast18(dateOfBirth)) return res.status(400).json({ error: 'You must be at least 18 years old to create an account' });
  if (fullName.length > 100) return res.status(400).json({ error: 'Name too long (max 100 characters)' });
  if (email.length > 254) return res.status(400).json({ error: 'Email too long' });
  if (password.length < 6 || password.length > 128) return res.status(400).json({ error: 'Password must be 6-128 characters' });
  try {
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const cleanPhone = phone ? phone.replace(/^\+?509/, '').replace(/^\+/, '') : null;
    const username = await generateUsername(fullName);
    const result = await pool.query(
      `INSERT INTO users (full_name, email, password_hash, phone, role, username, date_of_birth, taste_onboarding_completed)
       VALUES ($1, $2, $3, $4, 'buyer', $5, $6, false)
       RETURNING id, full_name, email, phone, role, avatar_url, username, show_real_name, created_at, seller_tier, email_verified, taste_onboarding_completed`,
      [fullName, email, passwordHash, cleanPhone, username, dateOfBirth]
    );
    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ user, token });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Email already registered' });
    }
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Check email availability ───────────────────────────────────────────────
router.get('/auth/check-email', async (req, res) => {
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
router.get('/auth/check-username', async (req, res) => {
  const { username } = req.query;
  if (!username || typeof username !== 'string') {
    return res.status(400).json({ error: 'Username query parameter required' });
  }
  const clean = username.trim().toLowerCase();
  if (clean.length < 1 || clean.length > 30) {
    return res.json({ available: false, reason: 'Username must be 1-30 characters' });
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

router.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }
  try {
    const result = await pool.query(
      `SELECT id, full_name, email, phone, role, avatar_url, bio, username, show_real_name, seller_tier, email_verified, store_name, taste_onboarding_completed, password_hash FROM users WHERE email = $1`,
      [email]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const user = result.rows[0];
    if (!user.password_hash) {
      return res.status(401).json({ error: 'This account uses Google sign-in. Please use Google to sign in.' });
    }
    let passwordValid = false;
    try {
      passwordValid = await bcrypt.compare(password, user.password_hash);
    } catch {}
    if (!passwordValid) {
      const shaHash = crypto.createHash('sha256').update(password).digest('hex');
      const storedBuf = Buffer.from(user.password_hash, 'hex');
      const inputBuf = Buffer.from(shaHash, 'hex');
      if (storedBuf.length === inputBuf.length && crypto.timingSafeEqual(storedBuf, inputBuf)) {
        passwordValid = true;
        const bcryptHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
        await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [bcryptHash, user.id]);
      }
    }
    if (!passwordValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    delete user.password_hash;
    if (user.role === 'seller' && user.seller_tier === 'business') {
      const subStatus = await checkSubscriptionStatus(user.id);
      if (subStatus === 'expired') {
        await pool.query(`UPDATE users SET seller_tier = 'verified', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [user.id]);
        user.seller_tier = 'verified';
        createNotification(user.id, 'subscription_expired', 'Business Subscription Expired', 'Your Business subscription has expired. You have been demoted to Verified Seller.', {}, pool);
      }
    }
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ user, token });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/auth/me', authRequired, async (req, res) => {
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

router.put('/auth/profile', authRequired, async (req, res) => {
  let { fullName, email, phone, natcashPhone, bio, avatarUrl, locationAddress, locationCity, locationLat, locationLng, showRealName, useStoreIdentity, acceptedPaymentMethods } = req.body;
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
        email = COALESCE($2, email),
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
        email_verified = CASE WHEN $2 IS NOT NULL AND $2 != email THEN false ELSE email_verified END,
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
router.get('/auth/sim-preferences', authRequired, async (req, res) => {
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
router.put('/auth/sim-preferences', authRequired, async (req, res) => {
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

router.put('/auth/username', authRequired, async (req, res) => {
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

router.put('/auth/password', authRequired, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password required' });
  }
  if (newPassword.length < 6 || newPassword.length > 128) {
    return res.status(400).json({ error: 'New password must be 6-128 characters' });
  }
  try {
    const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    if (!result.rows[0].password_hash) {
      return res.status(400).json({ error: 'This account uses Google sign-in. Please set a password via Forgot Password first.' });
    }
    let valid = false;
    try { valid = await bcrypt.compare(currentPassword, result.rows[0].password_hash); } catch {}
    if (!valid) {
      const shaHash = crypto.createHash('sha256').update(currentPassword).digest('hex');
      const storedHash = result.rows[0].password_hash;
      if (storedHash && shaHash.length === storedHash.length) {
        const a = Buffer.from(shaHash, 'hex');
        const b = Buffer.from(storedHash, 'hex');
        if (crypto.timingSafeEqual(a, b)) valid = true;
      }
    }
    if (!valid) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }
    const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await pool.query('UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [newHash, req.user.id]);
    res.json({ updated: true });
  } catch (err) {
    console.error('Password change error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ACCOUNT DELETION (GDPR / App Store Compliance)
// ═══════════════════════════════════════════════════════════════════════════════

router.delete('/auth/delete-account', authRequired, async (req, res) => {
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
        password_hash = 'DELETED', phone = NULL, avatar_url = NULL, bio = NULL,
        store_name = NULL, store_logo_url = NULL, id_document_url = NULL,
        id_verified = FALSE, role = 'deleted', seller_tier = 'none', push_token = NULL,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [anonymizedUsername, anonymizedEmail, userId]
    );

    await client.query('COMMIT');
    res.json({ success: true, message: 'Account deleted successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Account deletion error:', err);
    res.status(500).json({ error: 'Failed to delete account. Please try again later.' });
  } finally {
    client.release();
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// EMAIL VERIFICATION
// ═══════════════════════════════════════════════════════════════════════════════

const EMAIL_TEMPLATES = {
  en: {
    verify: {
      subject: (code) => `Your MaurMaket Verification Code: ${code}`,
      body: 'To verify your email address and unlock buying and selling on MaurMaket, use the secure code below.',
      cta: 'Open in MaurMaket App',
      fallback: 'Or enter the code manually in the app.',
    },
    reset: {
      subject: (code) => `Your MaurMaket Password Reset Code: ${code}`,
      body: 'To reset your password, use the secure code below.',
      cta: 'Open in MaurMaket App',
      fallback: 'Or enter the code manually in the app.',
    },
  },
  fr: {
    verify: {
      subject: (code) => `Votre code de vérification MaurMaket : ${code}`,
      body: "Pour vérifier votre adresse email et débloquer l'achat et la vente sur MaurMaket, utilisez le code sécurisé ci-dessous.",
      cta: 'Ouvrir dans l\'app MaurMaket',
      fallback: 'Ou entrez le code manuellement dans l\'app.',
    },
    reset: {
      subject: (code) => `Votre code de réinitialisation MaurMaket : ${code}`,
      body: 'Pour réinitialiser votre mot de passe, utilisez le code sécurisé ci-dessous.',
      cta: 'Ouvrir dans l\'app MaurMaket',
      fallback: 'Ou entrez le code manuellement dans l\'app.',
    },
  },
  ht: {
    verify: {
      subject: (code) => `Kòd verifikasyon MaurMaket ou: ${code}`,
      body: 'Pou verifye adrès imèl ou epi debloke achte ak vann sou MaurMaket, itilize kòd sekirite ki anba a.',
      cta: 'Ouverture nan app MaurMaket',
      fallback: 'Ou antre kòd la manyèlman nan app la.',
    },
    reset: {
      subject: (code) => `Kòd renye paswòd MaurMaket ou: ${code}`,
      body: 'Pou renye paswòd ou, itilize kòd sekirite ki anba a.',
      cta: 'Ouverture nan app MaurMaket',
      fallback: 'Ou antre kòd la manyèlman nan app la.',
    },
  },
};

function generateOtpCode() {
  return crypto.randomInt(100000, 1000000).toString();
}

function buildVerificationEmail(code, purpose, lang = 'en') {
  const lng = EMAIL_TEMPLATES[lang] ? lang : 'en';
  const t = EMAIL_TEMPLATES[lng][purpose] || EMAIL_TEMPLATES[lng].verify;
  const deepLink = purpose === 'reset'
    ? `maurmaket://reset-password?code=${code}`
    : `maurmaket://verify?code=${code}`;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#0D1117;font-family:Arial,sans-serif;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#0D1117;padding:20px 10px;">
    <tr><td align="center">
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:440px;background-color:#161B22;border:1px solid #30363D;border-radius:12px;overflow:hidden;">
        <tr><td style="padding:30px 20px;text-align:center;">
          <div style="margin-bottom:20px;">
            <div style="font-size:22px;font-weight:800;color:#FF4D6A;letter-spacing:1px;">MaurMaket</div>
            <div style="font-size:9px;letter-spacing:3px;color:#8B949E;text-transform:uppercase;">MARKETPLACE</div>
          </div>
          <div style="font-size:14px;font-weight:600;letter-spacing:2px;color:#fff;margin-bottom:12px;text-transform:uppercase;">
            Verification Code
          </div>
          <p style="font-size:13px;line-height:1.5;color:#8B949E;margin:0 0 24px;">
            ${t.body}
          </p>
          <div style="background:#0D1117;border:1px dashed #FF4D6A;border-radius:8px;padding:20px 10px;margin-bottom:20px;">
            <div style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#FF4D6A;">
              ${code.split('').join(' ')}
            </div>
          </div>
          <a href="${deepLink}" style="display:inline-block;background:#FF4D6A;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:24px;margin-bottom:16px;">
            ${t.cta}
          </a>
          <p style="font-size:11px;color:#484F58;margin-bottom:20px;">
            ${t.fallback}
          </p>
          <p style="font-size:11px;color:#484F58;margin-bottom:0;">
            Expires in 15 minutes &bull; Security ID: ${crypto.randomBytes(4).toString('hex').toUpperCase()}
          </p>
          <div style="border-top:1px solid #21262D;padding-top:15px;margin-top:20px;">
            <div style="font-size:10px;color:#484F58;letter-spacing:1px;">&copy; ${new Date().getFullYear()} MAURINEX HUB</div>
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const plainText = purpose === 'reset'
    ? `Your MaurMaket password reset code is: ${code}. It expires in 15 minutes.`
    : `Your MaurMaket verification code is: ${code}. It expires in 15 minutes.`;

  return { html, plainText, subject: t.subject(code) };
}

async function sendOtpEmail(email, code, purpose, lang) {
  const { html, plainText, subject } = buildVerificationEmail(code, purpose, lang);

  if (gmailConfigured) {
    try {
      await Promise.race([
        sendViaGmailApi(email, subject, html),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Gmail API timeout')), 20000)),
      ]);
      return true;
    } catch (err) {
      console.error('Gmail API send error:', err.message);
    }
  }

  if (emailTransporter) {
    try {
      await Promise.race([
        emailTransporter.sendMail({
          from: `"MaurMaket" <${gmailSenderEmail}>`,
          to: email,
          subject,
          text: plainText,
          html,
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('SMTP timeout')), 20000)),
      ]);
      return true;
    } catch (err) {
      console.error('SMTP send error:', err.message);
      return false;
    }
  }

  console.error('No email transport configured — cannot send email');
  return false;
}

router.post('/auth/verify/send', authRequired, async (req, res) => {
  const { language } = req.body || {};
  try {
    const userResult = await pool.query('SELECT email, email_verified FROM users WHERE id = $1', [req.user.id]);
    if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const user = userResult.rows[0];
    if (user.email_verified) return res.status(400).json({ error: 'Email already verified' });

    const code = generateOtpCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await pool.query(
      `INSERT INTO otp_codes (email, code, purpose, expires_at)
       VALUES ($1, $2, 'verify', $3)
       ON CONFLICT (email) DO UPDATE SET code = $2, purpose = 'verify', expires_at = $3`,
      [user.email, code, expiresAt]
    );

    const isTestMode = process.env.NODE_ENV === 'test';
    const sent = await sendOtpEmail(user.email, code, 'verify', language || 'en');
    if (!sent) {
      if (isTestMode) {
        return res.json({ success: true, email: user.email, testMode: true });
      }
      console.error(`verify/send: SMTP failed for ${user.email} — check SMTP_HOST/USER/PASS env vars`);
      return res.status(500).json({ error: 'Failed to send email. Please try again.' });
    }

    res.json({ success: true, email: user.email });
  } catch (err) {
    console.error('Verify send error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/auth/verify/check', authRequired, async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Code required' });
  try {
    const userResult = await pool.query('SELECT email, email_verified FROM users WHERE id = $1', [req.user.id]);
    if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const user = userResult.rows[0];
    if (user.email_verified) {
      const updated = await pool.query(
      `SELECT id, full_name, email, phone, role, avatar_url, bio, created_at, store_name, store_logo_url, seller_tier, id_submitted_at, id_verified, id_verified_at, id_verification_result, use_store_identity, email_verified, location_address, location_city, location_lat, location_lng, username, show_real_name FROM users WHERE id = $1`,
        [req.user.id]
      );
      return res.json({ success: true, alreadyVerified: true, user: updated.rows[0] });
    }

    const otpResult = await pool.query(
      `SELECT code FROM otp_codes WHERE email = $1 AND purpose = 'verify' AND expires_at > now()`,
      [user.email]
    );
    if (otpResult.rowCount === 0) {
      return res.status(400).json({ error: 'Invalid or expired code' });
    }
    const storedBuf = Buffer.from(otpResult.rows[0].code, 'utf8');
    const inputBuf = Buffer.from(String(code), 'utf8');
    if (storedBuf.length !== inputBuf.length || !crypto.timingSafeEqual(storedBuf, inputBuf)) {
      return res.status(400).json({ error: 'Invalid or expired code' });
    }

    await pool.query('UPDATE users SET email_verified = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [req.user.id]);
    await pool.query('DELETE FROM otp_codes WHERE email = $1 AND purpose = $2', [user.email, 'verify']);

    const updated = await pool.query(
      `SELECT id, full_name, email, phone, role, avatar_url, bio, created_at, store_name, store_logo_url, seller_tier, id_submitted_at, id_verified, id_verified_at, id_verification_result, use_store_identity, email_verified, location_address, location_city, location_lat, location_lng, username, show_real_name FROM users WHERE id = $1`,
      [req.user.id]
    );
    res.json({ success: true, user: updated.rows[0] });
  } catch (err) {
    console.error('Verify check error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// FORGOT / RESET PASSWORD
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/auth/forgot-password', async (req, res) => {
  const { email, language } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  try {
    const userResult = await pool.query('SELECT id, email FROM users WHERE lower(email) = lower($1)', [email]);
    if (userResult.rows.length === 0) {
      return res.json({ success: true, message: 'If that email exists, a code has been sent.' });
    }
    const user = userResult.rows[0];
    const code = generateOtpCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await pool.query(
      `INSERT INTO otp_codes (email, code, purpose, expires_at)
       VALUES ($1, $2, 'reset', $3)
       ON CONFLICT (email) DO UPDATE SET code = $2, purpose = 'reset', expires_at = $3`,
      [user.email, code, expiresAt]
    );

    await sendOtpEmail(user.email, code, 'reset', language || 'en');
    res.json({ success: true, message: 'If that email exists, a code has been sent.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/auth/reset-password', async (req, res) => {
  const { email, code, newPassword } = req.body;
  if (!email || !code || !newPassword) return res.status(400).json({ error: 'Email, code, and new password required' });
  if (newPassword.length < 6 || newPassword.length > 128) return res.status(400).json({ error: 'Password must be 6-128 characters' });
  try {
    const otpResult = await pool.query(
      `SELECT code FROM otp_codes WHERE lower(email) = lower($1) AND purpose = 'reset' AND expires_at > now()`,
      [email]
    );
    if (otpResult.rowCount === 0) {
      return res.status(400).json({ error: 'Invalid or expired code' });
    }
    const storedBuf = Buffer.from(otpResult.rows[0].code, 'utf8');
    const inputBuf = Buffer.from(String(code), 'utf8');
    if (storedBuf.length !== inputBuf.length || !crypto.timingSafeEqual(storedBuf, inputBuf)) {
      return res.status(400).json({ error: 'Invalid or expired code' });
    }

    const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await pool.query('UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE lower(email) = lower($2)', [newHash, email]);
    await pool.query('DELETE FROM otp_codes WHERE lower(email) = lower($1) AND purpose = $2', [email]);
    res.json({ success: true, message: 'Password reset successful' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GOOGLE SIGN-IN
// ═══════════════════════════════════════════════════════════════════════════════

// Authorization code flow (primary)
router.post('/auth/google-code', async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Authorization code required' });

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return res.status(500).json({ error: 'Google auth not configured' });

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: 'https://auth.expo.io/@maurinex/MaurMaketMobile',
        grant_type: 'authorization_code',
      }).toString(),
    });
    const tokens = await tokenRes.json();
    if (!tokens.id_token) return res.status(400).json({ error: 'Failed to get ID token from Google' });

    const { OAuth2Client } = await import('google-auth-library');
    const googleClient = new OAuth2Client(clientId);
    const ticket = await googleClient.verifyIdToken({ idToken: tokens.id_token, audience: clientId });
    const payload = ticket.getPayload() || {};

    const googleId = payload.sub;
    const email = payload.email;
    const name = payload.name || '';
    const picture = payload.picture || '';

    if (!googleId || !email) return res.status(400).json({ error: 'Invalid Google token' });

    let userRow = null;
    let isNewUser = false;

    const byGoogleId = await pool.query('SELECT id FROM users WHERE google_id = $1', [googleId]);
    if (byGoogleId.rows.length > 0) {
      const updated = await pool.query(
        `UPDATE users SET email = $1, full_name = $2, avatar_url = $3, updated_at = CURRENT_TIMESTAMP
         WHERE google_id = $4
         RETURNING id, full_name, email, phone, role, avatar_url, bio, created_at, store_name, store_logo_url, seller_tier, id_verified, use_store_identity, email_verified, location_address, location_city, location_lat, location_lng, username, show_real_name, pending_dob`,
        [email, name, picture, googleId]
      );
      userRow = updated.rows[0];
    } else {
      const byEmail = await pool.query('SELECT id FROM users WHERE lower(email) = lower($1)', [email]);
      if (byEmail.rows.length > 0) {
        const updated = await pool.query(
          `UPDATE users SET google_id = $1, avatar_url = COALESCE($2, avatar_url), updated_at = CURRENT_TIMESTAMP
           WHERE lower(email) = lower($3)
           RETURNING id, full_name, email, phone, role, avatar_url, bio, created_at, store_name, store_logo_url, seller_tier, id_verified, use_store_identity, email_verified, location_address, location_city, location_lat, location_lng, username, show_real_name, pending_dob`,
          [googleId, picture, email]
        );
        userRow = updated.rows[0];
      } else {
        isNewUser = true;
        const inserted = await pool.query(
          `INSERT INTO users (email, google_id, full_name, avatar_url, role, email_verified, pending_dob)
           VALUES ($1, $2, $3, $4, 'buyer', true, true)
           RETURNING id, full_name, email, phone, role, avatar_url, bio, created_at, store_name, store_logo_url, seller_tier, id_verified, use_store_identity, email_verified, location_address, location_city, location_lat, location_lng, username, show_real_name, pending_dob`,
          [email, googleId, name, picture]
        );
        userRow = inserted.rows[0];
      }
    }

    const needsDob = isNewUser || userRow.pending_dob;
    const token = jwt.sign({ id: userRow.id, email: userRow.email, role: userRow.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ user: userRow, token, needs_dob: needsDob });
  } catch (err) {
    console.error('Google code exchange error:', err);
    res.status(500).json({ error: 'Google authentication failed' });
  }
});

// Legacy implicit flow (kept as fallback)
router.post('/auth/google', async (req, res) => {
  const { idToken } = req.body;
  if (!idToken) return res.status(400).json({ error: 'Google ID token required' });

  const googleClientId = process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  if (!googleClientId) return res.status(500).json({ error: 'Google auth not configured' });

  try {
    const { OAuth2Client } = await import('google-auth-library');
    const googleClient = new OAuth2Client(googleClientId);
    const ticket = await googleClient.verifyIdToken({ idToken, audience: googleClientId });
    const payload = ticket.getPayload() || {};

    const googleId = payload.sub;
    const email = payload.email;
    const name = payload.name || '';
    const picture = payload.picture || '';

    if (!googleId || !email) return res.status(400).json({ error: 'Invalid Google token' });

    let userRow = null;
    let isNewUser = false;

    const byGoogleId = await pool.query('SELECT id FROM users WHERE google_id = $1', [googleId]);
    if (byGoogleId.rows.length > 0) {
      const updated = await pool.query(
        `UPDATE users SET email = $1, full_name = $2, avatar_url = $3, updated_at = CURRENT_TIMESTAMP
         WHERE google_id = $4
         RETURNING id, full_name, email, phone, role, avatar_url, bio, created_at, store_name, store_logo_url, seller_tier, id_verified, use_store_identity, email_verified, location_address, location_city, location_lat, location_lng, username, show_real_name, pending_dob`,
        [email, name, picture, googleId]
      );
      userRow = updated.rows[0];
    } else {
      const byEmail = await pool.query('SELECT id FROM users WHERE lower(email) = lower($1)', [email]);
      if (byEmail.rows.length > 0) {
        const updated = await pool.query(
          `UPDATE users SET google_id = $1, avatar_url = COALESCE($2, avatar_url), updated_at = CURRENT_TIMESTAMP
           WHERE lower(email) = lower($3)
           RETURNING id, full_name, email, phone, role, avatar_url, bio, created_at, store_name, store_logo_url, seller_tier, id_verified, use_store_identity, email_verified, location_address, location_city, location_lat, location_lng, username, show_real_name, pending_dob`,
          [googleId, picture, email]
        );
        userRow = updated.rows[0];
      } else {
        isNewUser = true;
        const inserted = await pool.query(
          `INSERT INTO users (email, google_id, full_name, avatar_url, role, email_verified, pending_dob)
           VALUES ($1, $2, $3, $4, 'buyer', true, true)
           RETURNING id, full_name, email, phone, role, avatar_url, bio, created_at, store_name, store_logo_url, seller_tier, id_verified, use_store_identity, email_verified, location_address, location_city, location_lat, location_lng, username, show_real_name, pending_dob`,
          [email, googleId, name, picture]
        );
        userRow = inserted.rows[0];
      }
    }

    const needsDob = isNewUser || userRow.pending_dob;
    const token = jwt.sign({ id: userRow.id, email: userRow.email, role: userRow.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ user: userRow, token, needs_dob: needsDob });
  } catch (err) {
    console.error('Google auth error:', err);
    res.status(500).json({ error: 'Google authentication failed' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// COMPLETE DOB (Google OAuth users)
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/auth/complete-dob', authRequired, async (req, res) => {
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
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ user, token });
  } catch (err) {
    console.error('complete-dob error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// BECOME A SELLER
// ═══════════════════════════════════════════════════════════════════════════════

router.put('/auth/become-seller', authRequired, dobRequired, async (req, res) => {
  try {
    if (req.user.role === 'seller') {
      const existing = await pool.query(
        `SELECT id, full_name, email, phone, role, avatar_url, bio, store_name, store_logo_url, seller_tier, id_submitted_at, id_verified, id_verified_at, id_verification_result, use_store_identity, email_verified, created_at, location_address, location_city, location_lat, location_lng, username, show_real_name FROM users WHERE id = $1`,
        [req.user.id]
      );
      const token = jwt.sign({ id: existing.rows[0].id, email: existing.rows[0].email, role: existing.rows[0].role }, JWT_SECRET, { expiresIn: '7d' });
      return res.json({ success: true, alreadySeller: true, user: existing.rows[0], token });
    }
    const { storeName, storeLogoUrl, idDocumentUrl, natcashPhone } = req.body;
    const sellerTier = 'casual';
    const useStoreIdentity = false;
    const result = await pool.query(
      `UPDATE users SET
        role = 'seller', seller_tier = $2,
        store_name = COALESCE($3, store_name), store_logo_url = COALESCE($4, store_logo_url),
        id_document_url = COALESCE($5, id_document_url), use_store_identity = $6,
        natcash_phone = $7, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, full_name, email, phone, role, avatar_url, bio, store_name, store_logo_url, seller_tier, id_submitted_at, id_verified, id_verified_at, id_verification_result, use_store_identity, email_verified, created_at, location_address, location_city, location_lat, location_lng`,
      [req.user.id, sellerTier, storeName || null, storeLogoUrl || null, idDocumentUrl || null, useStoreIdentity, natcashPhone || null]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const token = jwt.sign({ id: result.rows[0].id, email: result.rows[0].email, role: 'seller' }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ user: result.rows[0], token });
  } catch (err) {
    console.error('Become seller error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SELLER PROFILE & VERIFICATION
// ═══════════════════════════════════════════════════════════════════════════════

router.put('/auth/upgrade-tier', authRequired, sellerRequired, async (req, res) => {
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
    const token = jwt.sign({ id: result.rows[0].id, email: result.rows[0].email, role: 'seller' }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ user: result.rows[0], token });
  } catch (err) {
    console.error('Upgrade tier error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/auth/seller-profile', authRequired, sellerRequired, async (req, res) => {
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
