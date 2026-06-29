import express from 'express';
import cors from 'cors';
import pg from 'pg';
import dotenv from 'dotenv';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { fileURLToPath } from 'url';
import path from 'path';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is required');
  process.exit(1);
}
const BCRYPT_ROUNDS = 10;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runMigrations() {
  const c = await pool.connect();
  try {
    // Base tables if they don't exist yet
    await c.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        full_name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        phone TEXT,
        role TEXT DEFAULT 'buyer',
        avatar_url TEXT,
        bio TEXT,
        store_name TEXT,
        store_logo_url TEXT,
        seller_tier VARCHAR(20) DEFAULT 'none',
        id_document_url TEXT,
        id_verified BOOLEAN DEFAULT false,
        id_submitted_at TIMESTAMP,
        id_verified_at TIMESTAMP,
        use_store_identity BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS categories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        display_order INTEGER DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS products (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        seller_id UUID REFERENCES users(id) NOT NULL,
        category_id UUID REFERENCES categories(id),
        name TEXT NOT NULL,
        description TEXT,
        price DECIMAL(10,2) NOT NULL,
        stock INTEGER DEFAULT 0,
        is_available BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS product_images (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID REFERENCES products(id) NOT NULL,
        image_url TEXT NOT NULL,
        is_primary BOOLEAN DEFAULT false,
        display_order INTEGER DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        buyer_id UUID REFERENCES users(id) NOT NULL,
        total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
        status TEXT DEFAULT 'pending',
        moncash_reference TEXT,
        delivery_method VARCHAR(20) DEFAULT 'meetup',
        delivery_name TEXT, delivery_phone TEXT, delivery_address TEXT, delivery_city TEXT, delivery_note TEXT,
        meetup_lat DECIMAL(10,7), meetup_lng DECIMAL(10,7), meetup_address TEXT, meetup_note TEXT,
        meetup_confirmed BOOLEAN DEFAULT false, meetup_proposed_by UUID REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS order_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID REFERENCES orders(id) NOT NULL,
        product_id UUID REFERENCES products(id) NOT NULL,
        seller_id UUID REFERENCES users(id) NOT NULL,
        quantity INTEGER NOT NULL,
        price DECIMAL(10,2) NOT NULL
      );
      CREATE TABLE IF NOT EXISTS processed_events (
        id TEXT PRIMARY KEY,
        processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS seller_balances (
        seller_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        balance DECIMAL(10,2) NOT NULL DEFAULT 0,
        total_earned DECIMAL(10,2) NOT NULL DEFAULT 0,
        total_paid_out DECIMAL(10,2) NOT NULL DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS payouts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
        status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed')),
        receiver_phone VARCHAR(20) NOT NULL,
        moncash_reference VARCHAR(150),
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await c.query(`
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS meetup_lat DECIMAL(10,7);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS meetup_lng DECIMAL(10,7);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS meetup_address TEXT;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS meetup_note TEXT;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS meetup_confirmed BOOLEAN DEFAULT false;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS meetup_proposed_by UUID REFERENCES users(id);
    `);
    await c.query(`
      ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
    `).catch(() => {});
    await c.query(`
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_method VARCHAR(20) DEFAULT 'meetup';
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_name TEXT;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_phone TEXT;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_address TEXT;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_city TEXT;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_note TEXT;
    `);
    await c.query(`
      CREATE TABLE IF NOT EXISTS order_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID REFERENCES orders(id) NOT NULL,
        event_type VARCHAR(50) NOT NULL,
        actor_id UUID REFERENCES users(id),
        old_value TEXT,
        new_value TEXT,
        note TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await c.query(`
      CREATE TABLE IF NOT EXISTS saved_addresses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
        label VARCHAR(50),
        name TEXT NOT NULL,
        phone VARCHAR(20) NOT NULL,
        address TEXT NOT NULL,
        city TEXT NOT NULL,
        is_default BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await c.query(`
      CREATE TABLE IF NOT EXISTS reviews (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID REFERENCES orders(id) NOT NULL,
        reviewer_id UUID REFERENCES users(id) NOT NULL,
        seller_id UUID REFERENCES users(id) NOT NULL,
        rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
        comment TEXT,
        seller_response TEXT,
        seller_responded_at TIMESTAMP,
        is_edited BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(order_id, reviewer_id)
      );
    `);
    await c.query(`
      ALTER TABLE reviews ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES orders(id);
      ALTER TABLE reviews ADD COLUMN IF NOT EXISTS reviewer_id UUID REFERENCES users(id);
      ALTER TABLE reviews ADD COLUMN IF NOT EXISTS seller_id UUID REFERENCES users(id);
      ALTER TABLE reviews ADD COLUMN IF NOT EXISTS seller_response TEXT;
      ALTER TABLE reviews ADD COLUMN IF NOT EXISTS seller_responded_at TIMESTAMP;
      ALTER TABLE reviews ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT false;
      ALTER TABLE reviews ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'reviews' AND column_name = 'buyer_id'
        ) THEN
          UPDATE reviews SET reviewer_id = buyer_id WHERE reviewer_id IS NULL AND buyer_id IS NOT NULL;
        END IF;
      END $$;
    `);
    await c.query(`
      CREATE TABLE IF NOT EXISTS wishlists (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
        product_id UUID REFERENCES products(id) ON DELETE CASCADE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, product_id)
      );
    `);
    await c.query(`
      CREATE TABLE IF NOT EXISTS follows (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        follower_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
        seller_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(follower_id, seller_id)
      );
    `);
    await c.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
        type VARCHAR(50) NOT NULL,
        title TEXT NOT NULL,
        body TEXT,
        data JSONB,
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await c.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID REFERENCES orders(id),
        product_id UUID REFERENCES products(id),
        buyer_id UUID REFERENCES users(id) NOT NULL,
        seller_id UUID REFERENCES users(id) NOT NULL,
        last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await c.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID REFERENCES conversations(id) NOT NULL,
        sender_id UUID REFERENCES users(id) NOT NULL,
        content TEXT NOT NULL,
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await c.query(`
      CREATE TABLE IF NOT EXISTS promo_codes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR(50) NOT NULL UNIQUE,
        seller_id UUID REFERENCES users(id),
        discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
        discount_value DECIMAL(10,2) NOT NULL CHECK (discount_value > 0),
        min_order_amount DECIMAL(10,2) DEFAULT 0,
        max_uses INTEGER,
        uses_count INTEGER DEFAULT 0,
        valid_until TIMESTAMP,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await c.query(`
      CREATE TABLE IF NOT EXISTS promo_uses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        promo_id UUID REFERENCES promo_codes(id) NOT NULL,
        user_id UUID REFERENCES users(id) NOT NULL,
        order_id UUID REFERENCES orders(id) NOT NULL,
        discount_amount DECIMAL(10,2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(promo_id, user_id)
      );
    `);
    await c.query(`
      CREATE TABLE IF NOT EXISTS disputes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID REFERENCES orders(id) NOT NULL,
        raised_by UUID REFERENCES users(id) NOT NULL,
        reason VARCHAR(50) NOT NULL,
        description TEXT,
        status VARCHAR(20) DEFAULT 'open',
        resolution TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    // Platform revenue tracking
    await c.query(`
      CREATE TABLE IF NOT EXISTS platform_revenue (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID REFERENCES orders(id),
        seller_id UUID REFERENCES users(id),
        seller_tier VARCHAR(20),
        gross_amount DECIMAL(10,2) NOT NULL,
        commission_rate DECIMAL(5,4) NOT NULL,
        commission_amount DECIMAL(10,2) NOT NULL,
        platform_fee DECIMAL(10,2) NOT NULL,
        net_to_seller DECIMAL(10,2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    // Platform payout tracking
    await c.query(`
      CREATE TABLE IF NOT EXISTS platform_payouts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID REFERENCES orders(id),
        amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
        status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','failed')),
        moncash_reference VARCHAR(150),
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    // Seller onboarding & verification columns
    await c.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS store_name TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS store_logo_url TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS seller_tier VARCHAR(20) DEFAULT 'none';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS id_document_url TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS id_verified BOOLEAN DEFAULT false;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS id_submitted_at TIMESTAMP;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS id_verified_at TIMESTAMP;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS use_store_identity BOOLEAN DEFAULT false;
    `);
    // Verification & subscription tables
    await c.query(`
      CREATE TABLE IF NOT EXISTS verification_attempts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        id_front_url TEXT,
        id_back_url TEXT,
        selfie_url TEXT,
        ocr_result JSONB,
        face_match_score DECIMAL(5,4),
        rejection_reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        verified_at TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS seller_subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        seller_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
        status VARCHAR(20) DEFAULT 'active',
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        last_payment_at TIMESTAMP,
        grace_period_days INTEGER DEFAULT 7,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      ALTER TABLE users ADD COLUMN IF NOT EXISTS id_verification_result VARCHAR(20);
    `);
    // Backfill id_verification_result from legacy boolean
    await c.query(`
      UPDATE users SET id_verification_result = 'verified' WHERE id_verified = true AND id_verification_result IS NULL;
      UPDATE users SET id_verification_result = 'pending' WHERE id_submitted_at IS NOT NULL AND id_verified = false AND id_verification_result IS NULL;
    `);
    console.log('Migrations complete');
  } catch (err) {
    console.error('Migration error:', err);
  } finally {
    c.release();
  }
}

async function cleanupOldNotifications() {
  try {
    const result = await pool.query("DELETE FROM notifications WHERE type = 'new_message'");
    if (result.rowCount > 0) console.log(`Cleaned up ${result.rowCount} old message notifications`);
  } catch (err) {
    console.error('Notification cleanup error:', err);
  }
}

async function cleanupLegacyData() {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query('DELETE FROM product_images');
    await c.query('UPDATE conversations SET product_id = NULL WHERE product_id IS NOT NULL');
    await c.query('DELETE FROM order_events');
    await c.query('DELETE FROM reviews');
    await c.query('DELETE FROM platform_revenue');
    await c.query('DELETE FROM promo_uses');
    await c.query('DELETE FROM disputes');
    await c.query('DELETE FROM order_items');
    await c.query('DELETE FROM orders');
    const r2 = await c.query('DELETE FROM products');
    const r3 = await c.query('DELETE FROM verification_attempts');
    const r4 = await c.query("UPDATE users SET avatar_url = NULL WHERE avatar_url LIKE '/uploads/%'");
    const r5 = await c.query("UPDATE users SET store_logo_url = NULL WHERE store_logo_url LIKE '/uploads/%'");
    const r6 = await c.query("UPDATE users SET id_document_url = NULL WHERE id_document_url LIKE '/uploads/%'");
    await c.query('COMMIT');
    const total = r2.rowCount + r3.rowCount;
    const usersFixed = r4.rowCount + r5.rowCount + r6.rowCount;
    if (total > 0 || usersFixed > 0) console.log(`Legacy data cleanup: ${r2.rowCount} products, ${r3.rowCount} verifications, ${usersFixed} user URLs cleared`);
  } catch (err) {
    await c.query('ROLLBACK');
    console.error('Legacy data cleanup error:', err);
  } finally {
    c.release();
  }
}

app.use(cors());
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8'); },
}));

// Event logging helper
async function logOrderEvent(orderId, eventType, actorId, oldValue, newValue, note, db) {
  const exec = db || pool;
  try {
    await exec.query(
      `INSERT INTO order_events (order_id, event_type, actor_id, old_value, new_value, note) VALUES ($1, $2, $3, $4, $5, $6)`,
      [orderId, eventType, actorId || null, oldValue || null, newValue || null, note || null]
    );
  } catch (err) {
    console.error('Failed to log order event:', err);
  }
}

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
}

// Commission rate by seller tier
function getCommissionRate(tier) {
  switch (tier) {
    case 'business': return 0.05;
    case 'verified': return 0.08;
    case 'casual': return 0.10;
    default: return 0.10;
  }
}

// Optional auth middleware
function optionalAuth(req, _res, next) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    try {
      req.user = jwt.verify(auth.slice(7), JWT_SECRET);
    } catch {}
  }
  next();
}

// Auth middleware
function authRequired(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function sellerRequired(req, res, next) {
  if (req.user.role !== 'seller') {
    return res.status(403).json({ error: 'Seller access required' });
  }
  next();
}

// ───── Auth routes ─────

app.post('/api/auth/signup', async (req, res) => {
  const { fullName, email, password, phone } = req.body;
  if (!fullName || !email || !password) {
    return res.status(400).json({ error: 'Full name, email, and password required' });
  }
  try {
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const cleanPhone = phone ? phone.replace(/^\+/, '') : null;
    const result = await pool.query(
      `INSERT INTO users (full_name, email, password_hash, phone, role)
       VALUES ($1, $2, $3, $4, 'buyer')
       RETURNING id, full_name, email, phone, role, avatar_url, created_at`,
      [fullName, email, passwordHash, cleanPhone]
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

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }
  try {
    const result = await pool.query(
      `SELECT id, full_name, email, phone, role, avatar_url, bio, password_hash FROM users WHERE email = $1`,
      [email]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const user = result.rows[0];
    let passwordValid = false;
    try {
      passwordValid = await bcrypt.compare(password, user.password_hash);
    } catch {}
    if (!passwordValid) {
      const shaHash = crypto.createHash('sha256').update(password).digest('hex');
      if (shaHash === user.password_hash) {
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

app.get('/api/auth/me', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, full_name, email, phone, role, avatar_url, bio, created_at, store_name, store_logo_url, seller_tier, id_submitted_at, id_verified, id_verified_at, id_verification_result, use_store_identity FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/auth/profile', authRequired, async (req, res) => {
  let { fullName, email, phone, bio, avatarUrl } = req.body;
  if (phone) phone = phone.replace(/^\+/, '');
  try {
    const result = await pool.query(
      `UPDATE users SET full_name = COALESCE($1, full_name), email = COALESCE($2, email), phone = COALESCE($3, phone), bio = COALESCE($4, bio), avatar_url = COALESCE($5, avatar_url), updated_at = CURRENT_TIMESTAMP WHERE id = $6 RETURNING id, full_name, email, phone, role, avatar_url, bio`,
      [fullName, email || null, phone, bio, avatarUrl, req.user.id]
    );
    res.json({ user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already in use' });
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/auth/password', authRequired, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password required' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }
  try {
    const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    let valid = false;
    try { valid = await bcrypt.compare(currentPassword, result.rows[0].password_hash); } catch {}
    if (!valid) {
      const shaHash = crypto.createHash('sha256').update(currentPassword).digest('hex');
      if (shaHash === result.rows[0].password_hash) valid = true;
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

// ───── Become a Seller ─────

app.put('/api/auth/become-seller', authRequired, async (req, res) => {
  try {
    if (req.user.role === 'seller') {
      return res.status(400).json({ error: 'You are already a seller' });
    }
    const { storeName, storeLogoUrl, idDocumentUrl, tier } = req.body;
    let sellerTier;
    if (tier === 'verified') sellerTier = 'verified';
    else if (tier === 'business') sellerTier = 'business';
    else sellerTier = 'casual';
    const idSubmittedAt = ((sellerTier === 'verified' || sellerTier === 'business') && idDocumentUrl) ? 'CURRENT_TIMESTAMP' : null;
    const useStoreIdentity = (sellerTier === 'business' && storeName) ? true : false;
    const result = await pool.query(
      `UPDATE users SET
        role = 'seller',
        seller_tier = $2,
        store_name = COALESCE($3, store_name),
        store_logo_url = COALESCE($4, store_logo_url),
        id_document_url = COALESCE($5, id_document_url),
        id_submitted_at = ${idSubmittedAt || 'id_submitted_at'},
        use_store_identity = $6,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, full_name, email, phone, role, avatar_url, bio, store_name, store_logo_url, seller_tier, id_submitted_at, id_verified, id_verified_at, use_store_identity, created_at`,
      [req.user.id, sellerTier, storeName || null, storeLogoUrl || null, idDocumentUrl || null, useStoreIdentity]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const token = jwt.sign({ id: result.rows[0].id, email: result.rows[0].email, role: 'seller' }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ user: result.rows[0], token });
  } catch (err) {
    console.error('Become seller error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ───── Seller Profile & Verification ─────

app.put('/api/auth/upgrade-tier', authRequired, sellerRequired, async (req, res) => {
  try {
    const { tier, storeName, storeLogoUrl, idDocumentUrl } = req.body;
    if (!['verified', 'business'].includes(tier)) {
      return res.status(400).json({ error: 'Invalid tier. Must be verified or business.' });
    }

    const current = await pool.query('SELECT seller_tier FROM users WHERE id = $1', [req.user.id]);
    const currentTier = current.rows[0]?.seller_tier || 'none';

    const tierOrder = { none: 0, casual: 1, verified: 2, business: 3 };
    if ((tierOrder[currentTier] || 0) >= (tierOrder[tier] || 0)) {
      return res.status(400).json({ error: `You are already at ${currentTier} tier or higher.` });
    }

    const updates = ['seller_tier = $2', 'updated_at = CURRENT_TIMESTAMP'];
    const values = [req.user.id, tier];
    let idx = 3;

    if (tier === 'business') {
      if (storeName !== undefined) { updates.push(`store_name = $${idx++}`); values.push(storeName || null); }
      if (storeLogoUrl !== undefined) { updates.push(`store_logo_url = $${idx++}`); values.push(storeLogoUrl || null); }
      if (storeName) { updates.push('use_store_identity = true'); }
    }

    if (idDocumentUrl) {
      updates.push(`id_document_url = $${idx++}`);
      values.push(idDocumentUrl);
      updates.push('id_submitted_at = CURRENT_TIMESTAMP');
    }

    const result = await pool.query(
      `UPDATE users SET ${updates.join(', ')}
       WHERE id = $1
       RETURNING id, full_name, email, phone, role, avatar_url, bio, store_name, store_logo_url, seller_tier, id_submitted_at, id_verified, id_verified_at, use_store_identity, created_at`,
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

app.put('/api/auth/seller-profile', authRequired, sellerRequired, async (req, res) => {
  const { storeName, storeLogoUrl, idDocumentUrl, useStoreIdentity } = req.body;

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
    if (idDocumentUrl !== undefined) {
      fields.push(`id_document_url = $${idx++}`);
      values.push(idDocumentUrl || null);
      if (idDocumentUrl) {
        fields.push(`id_submitted_at = CURRENT_TIMESTAMP`);
      }
    }
    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });
    values.push(req.user.id);
    const result = await pool.query(
      `UPDATE users SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${idx}
       RETURNING id, full_name, email, phone, role, avatar_url, bio, store_name, store_logo_url, seller_tier, id_submitted_at, id_verified, id_verified_at, use_store_identity, created_at`,
      values
    );
    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Seller profile update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/seller/verification-status', authRequired, sellerRequired, async (req, res) => {
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

// ───── Saved Addresses ─────

app.get('/api/addresses', authRequired, async (req, res) => {
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

app.post('/api/addresses', authRequired, async (req, res) => {
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

app.put('/api/addresses/:id', authRequired, async (req, res) => {
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

app.delete('/api/addresses/:id', authRequired, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM saved_addresses WHERE id = $1 AND user_id = $2 RETURNING id', [req.params.id, req.user.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Address not found' });
    res.json({ deleted: true });
  } catch (err) {
    console.error('Address delete error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ───── Reviews & Ratings ─────

app.post('/api/reviews', authRequired, async (req, res) => {
  const { orderId, rating, comment } = req.body;
  if (!orderId || !rating || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'orderId and rating (1-5) required' });
  }
  try {
    const order = await pool.query(
      "SELECT * FROM orders WHERE id = $1 AND buyer_id = $2 AND status = 'completed'",
      [orderId, req.user.id]
    );
    if (order.rows.length === 0) {
      return res.status(400).json({ error: 'Only completed orders can be reviewed' });
    }
    const sellerResult = await pool.query(
      'SELECT DISTINCT seller_id FROM order_items WHERE order_id = $1 LIMIT 1',
      [orderId]
    );
    const sellerId = sellerResult.rows[0]?.seller_id;
    if (!sellerId) return res.status(400).json({ error: 'No seller found for this order' });
    const result = await pool.query(
      `INSERT INTO reviews (order_id, reviewer_id, seller_id, rating, comment)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [orderId, req.user.id, sellerId, rating, comment || null]
    );
    const reviewer = await pool.query('SELECT full_name FROM users WHERE id = $1', [req.user.id]);
    const reviewerName = reviewer.rows[0]?.full_name || 'Someone';
    createNotification(sellerId, 'review_received', 'New Review', `${reviewerName} left a ${rating}-star review`, { orderId });
    res.status(201).json({ review: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'You already reviewed this order' });
    console.error('Review create error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/reviews/:id', authRequired, async (req, res) => {
  const { rating, comment } = req.body;
  try {
    const result = await pool.query(
      `UPDATE reviews SET rating = COALESCE($1, rating), comment = COALESCE($2, comment), is_edited = true, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND reviewer_id = $4 RETURNING *`,
      [rating, comment, req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Review not found' });
    res.json({ review: result.rows[0] });
  } catch (err) {
    console.error('Review update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/reviews/seller/:sellerId', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*, u.full_name AS reviewer_name, u.avatar_url AS reviewer_avatar
       FROM reviews r JOIN users u ON r.reviewer_id = u.id
       WHERE r.seller_id = $1
       ORDER BY r.created_at DESC`,
      [req.params.sellerId]
    );
    const statsResult = await pool.query(
      `SELECT COALESCE(AVG(rating)::numeric(3,2), 0) AS avg_rating, COUNT(*) AS review_count FROM reviews WHERE seller_id = $1`,
      [req.params.sellerId]
    );
    res.json({ reviews: result.rows, stats: statsResult.rows[0] });
  } catch (err) {
    console.error('Seller reviews error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/reviews/product/:productId', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*, u.full_name AS reviewer_name
       FROM reviews r
       JOIN order_items oi ON r.order_id = oi.order_id
       JOIN users u ON r.reviewer_id = u.id
       WHERE oi.product_id = $1
       ORDER BY r.created_at DESC`,
      [req.params.productId]
    );
    res.json({ reviews: result.rows });
  } catch (err) {
    console.error('Product reviews error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ───── Wishlist ─────

app.post('/api/wishlist/:productId', authRequired, async (req, res) => {
  try {
    const existing = await pool.query('SELECT id FROM wishlists WHERE user_id = $1 AND product_id = $2', [req.user.id, req.params.productId]);
    if (existing.rows.length > 0) {
      await pool.query('DELETE FROM wishlists WHERE id = $1', [existing.rows[0].id]);
      return res.json({ wishlisted: false });
    }
    await pool.query('INSERT INTO wishlists (user_id, product_id) VALUES ($1, $2)', [req.user.id, req.params.productId]);
    res.json({ wishlisted: true });
  } catch (err) {
    console.error('Wishlist toggle error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/wishlist', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT w.*, p.name, p.price, p.stock,
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

app.get('/api/wishlist/check/:productId', authRequired, async (req, res) => {
  try {
    const result = await pool.query('SELECT id FROM wishlists WHERE user_id = $1 AND product_id = $2', [req.user.id, req.params.productId]);
    res.json({ wishlisted: result.rows.length > 0 });
  } catch (err) {
    console.error('Wishlist check error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ───── Follow Sellers ─────

app.post('/api/follow/:sellerId', authRequired, async (req, res) => {
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
    createNotification(req.params.sellerId, 'new_follower', 'New Follower', `${followerName} started following you`, {});
    res.json({ following: true });
  } catch (err) {
    console.error('Follow toggle error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/following', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT f.*, u.full_name, u.avatar_url
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

app.get('/api/followers/count/:sellerId', async (req, res) => {
  try {
    const result = await pool.query('SELECT COUNT(*) AS count FROM follows WHERE seller_id = $1', [req.params.sellerId]);
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (err) {
    console.error('Followers count error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ───── Notifications ─────

app.get('/api/notifications', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json({ notifications: result.rows });
  } catch (err) {
    console.error('Notifications fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/notifications/unread-count', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT COUNT(*) AS count FROM notifications WHERE user_id = $1 AND is_read = false`,
      [req.user.id]
    );
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (err) {
    console.error('Notifications unread count error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/notifications/:id/read', authRequired, async (req, res) => {
  try {
    await pool.query(
      `UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    res.json({ updated: true });
  } catch (err) {
    console.error('Notification read error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/notifications/read-all', authRequired, async (req, res) => {
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

// ───── Seller Profile / Stats (used by storefront) ─────

app.get('/api/sellers/:id', async (req, res) => {
  try {
    const userResult = await pool.query(
      `SELECT id, full_name, email, phone, avatar_url, bio, created_at, store_name, store_logo_url, seller_tier, id_verified, id_verification_result, use_store_identity FROM users WHERE id = $1 AND role = 'seller'`,
      [req.params.id]
    );
    if (userResult.rows.length === 0) return res.status(404).json({ error: 'Seller not found' });
    const seller = userResult.rows[0];
    const productResult = await pool.query('SELECT COUNT(*) AS count FROM products WHERE seller_id = $1 AND is_available = true', [req.params.id]);
    const reviewResult = await pool.query(
      `SELECT COALESCE(AVG(rating)::numeric(3,2), 0) AS avg_rating, COUNT(*) AS review_count FROM reviews WHERE seller_id = $1`,
      [req.params.id]
    );
    const orderResult = await pool.query(
      `SELECT COUNT(*) AS count FROM order_items oi JOIN orders o ON oi.order_id = o.id WHERE oi.seller_id = $1 AND o.status = 'completed'`,
      [req.params.id]
    );
    res.json({
      seller: {
        ...seller,
        product_count: parseInt(productResult.rows[0].count),
        avg_rating: parseFloat(reviewResult.rows[0].avg_rating),
        review_count: parseInt(reviewResult.rows[0].review_count),
        sales_count: parseInt(orderResult.rows[0].count),
      }
    });
  } catch (err) {
    console.error('Seller profile error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ───── Product routes ─────

app.get('/api/products', async (req, res) => {
  const { category, search, seller, minPrice, maxPrice, sort, page = 1, limit = 20 } = req.query;
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
    conditions.push(`p.price >= $${paramIndex++}`);
    params.push(minPrice);
  }
  if (maxPrice) {
    conditions.push(`p.price <= $${paramIndex++}`);
    params.push(maxPrice);
  }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  let orderBy = 'p.created_at DESC';
  if (sort === 'price_asc') orderBy = 'p.price ASC';
  else if (sort === 'price_desc') orderBy = 'p.price DESC';
  else if (sort === 'oldest') orderBy = 'p.created_at ASC';

  try {
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM products p LEFT JOIN categories c ON p.category_id = c.id ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    const result = await pool.query(
      `SELECT p.id, p.name, p.description, p.price, p.stock, p.created_at, p.category_id,
              u.full_name AS seller_name, u.id AS seller_id, u.store_name, u.store_logo_url, u.seller_tier, u.avatar_url AS seller_avatar, u.use_store_identity,
              c.name AS category,
              (SELECT json_agg(json_build_object('image_url', pi.image_url, 'is_primary', pi.is_primary) ORDER BY pi.is_primary DESC, pi.display_order ASC) FROM product_images pi WHERE pi.product_id = p.id) AS images
       FROM products p
       JOIN users u ON p.seller_id = u.id
       LEFT JOIN categories c ON p.category_id = c.id
       ${where}
       ORDER BY ${orderBy}
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, Math.min(limit, 50), offset]
    );

    res.json({ products: result.rows, total, page: +page, pages: Math.ceil(total / Math.min(limit, 50)) });
  } catch (err) {
    console.error('Products fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, u.full_name AS seller_name, u.avatar_url AS seller_avatar, u.phone AS seller_phone,
              u.store_name, u.store_logo_url, u.seller_tier, u.id_verified, u.use_store_identity,
              c.name AS category,
              (SELECT json_agg(json_build_object('image_url', pi.image_url, 'is_primary', pi.is_primary) ORDER BY pi.is_primary DESC, pi.display_order ASC) FROM product_images pi WHERE pi.product_id = p.id) AS images
       FROM products p
       JOIN users u ON p.seller_id = u.id
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    res.json({ product: result.rows[0] });
  } catch (err) {
    console.error('Product detail error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/products', authRequired, sellerRequired, async (req, res) => {
  const { name, description, price, stock, categoryId, images } = req.body;
  if (!name || !price) {
    return res.status(400).json({ error: 'Name and price required' });
  }
  if (!images || !Array.isArray(images) || images.length === 0) {
    return res.status(400).json({ error: 'At least one image is required' });
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
      `INSERT INTO products (seller_id, category_id, name, description, price, stock)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.user.id, categoryId || null, name, description || '', price, stock || 0]
    );
    const product = productResult.rows[0];

    if (images && images.length > 0) {
      const imageValues = images.map((url, i) => `($1, $${i + 2}, ${i === 0}, ${i})`).join(', ');
      const imageParams = images.map(url => url);
      await client.query(
        `INSERT INTO product_images (product_id, image_url, is_primary, display_order) VALUES ${imageValues}`,
        [product.id, ...imageParams]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ product });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Product create error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

app.delete('/api/products/:id', authRequired, sellerRequired, async (req, res) => {
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

app.put('/api/products/:id', authRequired, sellerRequired, async (req, res) => {
  const client = await pool.connect();
  try {
    const check = await client.query('SELECT seller_id FROM products WHERE id = $1', [req.params.id]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    if (check.rows[0].seller_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not your product' });
    }
    const { name, description, price, stock, isAvailable, categoryId, images } = req.body;
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE products SET name = COALESCE($1, name), description = COALESCE($2, description), price = COALESCE($3, price), stock = COALESCE($4, stock), is_available = COALESCE($5, is_available), category_id = COALESCE($6, category_id), updated_at = CURRENT_TIMESTAMP WHERE id = $7 RETURNING *`,
      [name, description, price, stock, isAvailable, categoryId, req.params.id]
    );
    if (images && Array.isArray(images)) {
      await client.query('DELETE FROM product_images WHERE product_id = $1', [req.params.id]);
      if (images.length > 0) {
        const imageValues = images.map((url, i) => `($1, $${i + 2}, ${i === 0}, ${i})`).join(', ');
        const imageParams = images.map(url => url);
        await client.query(
          `INSERT INTO product_images (product_id, image_url, is_primary, display_order) VALUES ${imageValues}`,
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

// ───── Category routes ─────

app.get('/api/categories', async (_req, res) => {
  try {
    const result = await pool.query('SELECT * FROM categories ORDER BY display_order ASC');
    res.json({ categories: result.rows });
  } catch (err) {
    console.error('Categories error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ───── Order routes ─────

app.get('/api/orders/:id', authRequired, async (req, res) => {
  try {
    const order = await canAccessOrder(req.user.id, req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const items = await pool.query(
      `SELECT oi.*, p.name AS product_name, p.price AS product_price
       FROM order_items oi JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = $1`,
      [req.params.id]
    );
    const myRole = order.buyer_id === req.user.id ? 'buyer' : 'seller';
    const sellerResult = await pool.query(
      `SELECT DISTINCT seller_id FROM order_items WHERE order_id = $1 LIMIT 1`,
      [req.params.id]
    );
    const otherUserId = myRole === 'buyer' ? (sellerResult.rows[0]?.seller_id) : order.buyer_id;
    const otherParty = await pool.query(
      `SELECT id, full_name, phone FROM users WHERE id = $1`,
      [otherUserId]
    );
    res.json({ order: { ...order, items: items.rows, my_role: myRole, other_party: otherParty.rows[0] || null } });
  } catch (err) {
    console.error('Order fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/orders/:id/timeline', authRequired, async (req, res) => {
  try {
    const order = await canAccessOrder(req.user.id, req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const result = await pool.query(
      `SELECT e.*, u.full_name AS actor_name
       FROM order_events e
       LEFT JOIN users u ON e.actor_id = u.id
       WHERE e.order_id = $1
       ORDER BY e.created_at ASC`,
      [req.params.id]
    );
    res.json({ events: result.rows });
  } catch (err) {
    console.error('Timeline fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/orders', authRequired, async (req, res) => {
  try {
    const buyerOrders = await pool.query(
      `SELECT DISTINCT ON (o.id) o.*, 
              (SELECT u.full_name FROM order_items oi2 JOIN users u ON oi2.seller_id = u.id WHERE oi2.order_id = o.id LIMIT 1) AS seller_name,
              (SELECT u.phone FROM order_items oi2 JOIN users u ON oi2.seller_id = u.id WHERE oi2.order_id = o.id LIMIT 1) AS seller_phone,
              'buyer' AS my_role
       FROM orders o
       JOIN order_items oi ON o.id = oi.order_id
       WHERE o.buyer_id = $1
       ORDER BY o.id, o.created_at DESC`,
      [req.user.id]
    );
    const sellerOrders = await pool.query(
      `SELECT DISTINCT ON (o.id) o.*, u.full_name AS buyer_name, u.phone AS buyer_phone,
              'seller' AS my_role
       FROM orders o
       JOIN order_items oi ON o.id = oi.order_id
       JOIN users u ON o.buyer_id = u.id
       WHERE oi.seller_id = $1
       ORDER BY o.id, o.created_at DESC`,
      [req.user.id]
    );
    res.json({ buyerOrders: buyerOrders.rows, sellerOrders: sellerOrders.rows });
  } catch (err) {
    console.error('Orders error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/orders', authRequired, async (req, res) => {
  const { items, deliveryMethod, deliveryName, deliveryPhone, deliveryAddress, deliveryCity, deliveryNote, promoCode } = req.body;
  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'Cart is empty' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let total = 0;
    const orderItems = [];

    for (const item of items) {
      const prod = await client.query('SELECT id, price, seller_id, stock FROM products WHERE id = $1 AND is_available = TRUE FOR UPDATE', [item.productId]);
      if (prod.rows.length === 0) {
        throw new Error(`Product ${item.productId} not found or unavailable`);
      }
      if (prod.rows[0].seller_id === req.user.id) {
        throw new Error(`You cannot purchase your own product`);
      }
      if (prod.rows[0].stock < (item.quantity || 1)) {
        throw new Error(`Insufficient stock for product ${item.productId}`);
      }
      const price = parseFloat(prod.rows[0].price);
      total += price * (item.quantity || 1);
      orderItems.push({ productId: item.productId, quantity: item.quantity || 1, price, sellerId: prod.rows[0].seller_id });
    }

    let discountAmount = 0;
    let promoId = null;
    if (promoCode) {
      const promoResult = await client.query(
        `SELECT * FROM promo_codes WHERE code = $1 AND is_active = true AND (valid_until IS NULL OR valid_until > CURRENT_TIMESTAMP)`,
        [promoCode.toUpperCase()]
      );
      if (promoResult.rows.length > 0) {
        const promo = promoResult.rows[0];
        if (!promo.max_uses || promo.uses_count < promo.max_uses) {
          const used = await client.query('SELECT id FROM promo_uses WHERE promo_id = $1 AND user_id = $2', [promo.id, req.user.id]);
          if (used.rows.length === 0 && total >= parseFloat(promo.min_order_amount)) {
            discountAmount = promo.discount_type === 'percentage'
              ? Math.min(total * parseFloat(promo.discount_value) / 100, parseFloat(promo.discount_value) * 10)
              : Math.min(parseFloat(promo.discount_value), total);
            promoId = promo.id;
          }
        }
      }
    }

    const method = deliveryMethod === 'delivery' ? 'delivery' : 'meetup';
    // Apply promo discount to the order total so buyer is charged the discounted amount
    const finalTotal = discountAmount > 0 ? Math.round((total - discountAmount) * 100) / 100 : total;
    const orderResult = await client.query(
      `INSERT INTO orders (buyer_id, total_amount, status, delivery_method, delivery_name, delivery_phone, delivery_address, delivery_city, delivery_note)
       VALUES ($1, $2, 'pending', $3, $4, $5, $6, $7, $8) RETURNING *`,
      [req.user.id, finalTotal, method, deliveryName || null, deliveryPhone || null, deliveryAddress || null, deliveryCity || null, deliveryNote || null]
    );
    const order = orderResult.rows[0];

    for (const oi of orderItems) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, seller_id, quantity, price) VALUES ($1, $2, $3, $4, $5)`,
        [order.id, oi.productId, oi.sellerId, oi.quantity, oi.price]
      );
      await client.query('UPDATE products SET stock = stock - $1 WHERE id = $2', [oi.quantity, oi.productId]);
    }

    if (promoId && discountAmount > 0) {
      await client.query(
        `INSERT INTO promo_uses (promo_id, user_id, order_id, discount_amount) VALUES ($1, $2, $3, $4)`,
        [promoId, req.user.id, order.id, discountAmount]
      );
      await client.query('UPDATE promo_codes SET uses_count = uses_count + 1 WHERE id = $1', [promoId]);
    }

    await client.query('COMMIT');
    logOrderEvent(order.id, 'order_placed', req.user.id, null, 'pending', `Order placed${discountAmount > 0 ? ` (promo: -Rs ${discountAmount.toFixed(0)})` : ''}`);
    const buyerInfo = await pool.query('SELECT full_name FROM users WHERE id = $1', [req.user.id]);
    const buyerName = buyerInfo.rows[0]?.full_name || 'Someone';
    const sellerIds = [...new Set(orderItems.map(i => i.sellerId))];
    for (const sid of sellerIds) {
      createNotification(sid, 'order_status', 'New Order', `New order from ${buyerName} — Rs ${finalTotal.toFixed(0)}`, { orderId: order.id });
      const lowStock = await pool.query('SELECT id, name, stock FROM products WHERE seller_id = $1 AND stock <= 3 AND is_available = true', [sid]);
      for (const p of lowStock.rows) {
        createNotification(sid, 'low_stock', 'Low Stock Alert', `"${p.name}" has only ${p.stock} left`, { productId: p.id });
      }
    }
    res.status(201).json({ order });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Order create error:', err);
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.put('/api/orders/:id/cancel', authRequired, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const order = await client.query(
      'SELECT * FROM orders WHERE id = $1 FOR UPDATE',
      [req.params.id]
    );
    if (order.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }
    if (order.rows[0].buyer_id !== req.user.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Only the buyer can cancel this order' });
    }
    if (order.rows[0].status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Only pending orders can be cancelled' });
    }
    const items = await client.query('SELECT product_id, quantity FROM order_items WHERE order_id = $1', [req.params.id]);
    for (const item of items.rows) {
      await client.query('UPDATE products SET stock = stock + $1 WHERE id = $2', [item.quantity, item.product_id]);
    }
    await client.query(
      "UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
      [req.params.id]
    );
    await client.query('COMMIT');
    logOrderEvent(req.params.id, 'status_change', req.user.id, 'pending', 'cancelled', 'Cancelled by buyer');
    res.json({ cancelled: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Order cancel error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

app.post('/api/orders/:id/reorder', authRequired, async (req, res) => {
  try {
    const order = await canAccessOrder(req.user.id, req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const items = await pool.query(
      `SELECT oi.product_id, oi.quantity, p.name, p.price, p.stock, p.is_available
       FROM order_items oi JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = $1`,
      [req.params.id]
    );
    const availableItems = items.rows
      .filter(item => item.is_available && item.stock > 0)
      .map(item => ({ productId: item.product_id, name: item.name, price: item.price, stock: item.stock }));
    res.json({ items: availableItems });
  } catch (err) {
    console.error('Reorder error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

async function canAccessOrder(userId, orderId) {
  const result = await pool.query(
    `SELECT DISTINCT o.* FROM orders o
     LEFT JOIN order_items oi ON o.id = oi.order_id
     WHERE o.id = $1 AND (o.buyer_id = $2 OR oi.seller_id = $2)`,
    [orderId, userId]
  );
  return result.rows[0] || null;
}

app.put('/api/orders/:id/meetup', authRequired, async (req, res) => {
  const { lat, lng, address, note } = req.body;
  if (!lat || !lng) return res.status(400).json({ error: 'Latitude and longitude required' });
  try {
    const order = await canAccessOrder(req.user.id, req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'paid' && order.status !== 'pending') return res.status(400).json({ error: 'Order must be paid or pending' });
    await pool.query(
      `UPDATE orders SET meetup_lat = $1, meetup_lng = $2, meetup_address = $3, meetup_note = $4, meetup_confirmed = false, meetup_proposed_by = $5, updated_at = CURRENT_TIMESTAMP WHERE id = $6`,
      [lat, lng, address || null, note || null, req.user.id, req.params.id]
    );
    logOrderEvent(req.params.id, 'meetup_proposed', req.user.id, null, null, `Meetup proposed at ${address || `${lat}, ${lng}`}`);
    const oData = await pool.query('SELECT buyer_id FROM orders WHERE id = $1', [req.params.id]);
    const sellerData = await pool.query('SELECT seller_id FROM order_items WHERE order_id = $1 LIMIT 1', [req.params.id]);
    if (oData.rows.length > 0) {
      // Notify the OTHER party — whoever didn't propose the meetup
      const buyerId = oData.rows[0].buyer_id;
      const sellerId = sellerData.rows[0]?.seller_id;
      const otherPartyId = buyerId === req.user.id ? sellerId : buyerId;
      if (otherPartyId) {
        createNotification(otherPartyId, 'meetup_proposed', 'Meetup Proposed', 'A meetup location has been proposed for your order', { orderId: req.params.id });
      }
    }
    res.json({ updated: true });
  } catch (err) {
    console.error('Meetup error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/orders/:id/meetup/confirm', authRequired, async (req, res) => {
  try {
    const order = await canAccessOrder(req.user.id, req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'paid' && order.status !== 'pending') return res.status(400).json({ error: 'Order must be paid or pending' });
    if (!order.meetup_lat || !order.meetup_lng) return res.status(400).json({ error: 'No meetup location proposed yet' });
    if (order.meetup_proposed_by === req.user.id) return res.status(400).json({ error: 'You proposed this location, wait for the other party to confirm' });
    await pool.query(
      `UPDATE orders SET meetup_confirmed = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [req.params.id]
    );
    logOrderEvent(req.params.id, 'meetup_confirmed', req.user.id, null, null, 'Meetup location confirmed');
    if (order.meetup_proposed_by) {
      createNotification(order.meetup_proposed_by, 'meetup_confirmed', 'Meetup Confirmed', 'Your proposed meetup location has been confirmed', { orderId: req.params.id });
    }
    res.json({ updated: true });
  } catch (err) {
    console.error('Meetup confirm error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/orders/:id/complete', authRequired, async (req, res) => {
  try {
    const order = await canAccessOrder(req.user.id, req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status === 'completed') return res.status(400).json({ error: 'Order already completed' });
    if (order.status === 'cancelled') return res.status(400).json({ error: 'Order was cancelled' });
    // Allow completion from 'delivered' (shipping flow) OR 'paid' (meetup flow where delivery is skipped)
    if (order.status !== 'delivered' && order.status !== 'paid') {
      return res.status(400).json({ error: 'Order must be delivered or paid (meetup) before completing' });
    }
    await pool.query(
      `UPDATE orders SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [req.params.id]
    );
    logOrderEvent(req.params.id, 'status_change', req.user.id, order.status, 'completed', 'Order completed');
    const sellerOfOrder = await pool.query(
      'SELECT seller_id FROM order_items WHERE order_id = $1 LIMIT 1',
      [req.params.id]
    );
    if (sellerOfOrder.rows.length > 0) {
      createNotification(sellerOfOrder.rows[0].seller_id, 'order_status', 'Order Completed', 'An order has been marked as completed', { orderId: req.params.id });
    }
    res.json({ updated: true, status: 'completed' });
  } catch (err) {
    console.error('Order complete error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/payments/retry/:orderId', authRequired, async (req, res) => {
  const { orderId } = req.params;
  try {
    const orderResult = await pool.query(
      "SELECT * FROM orders WHERE id = $1 AND buyer_id = $2 AND status = 'pending'",
      [orderId, req.user.id]
    );
    if (orderResult.rows.length === 0) return res.status(404).json({ error: 'Pending order not found' });
    const order = orderResult.rows[0];

    const moncashRes = await fetch(
      process.env.MONCASH_PAY_CREATE_URL || 'https://hvlmeoqyxaguzcujpmit.supabase.co/functions/v1/pay-create',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.MCC_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: parseFloat(order.total_amount),
          referenceId: orderId,
          returnUrl: `https://${req.get('host')}/payment/return?order=${orderId}`,
        }),
      }
    );

    if (!moncashRes.ok) {
      const errorText = await moncashRes.text();
      return res.status(502).json({ error: `MonCashConnect returned ${moncashRes.status}`, details: errorText });
    }
    const data = await moncashRes.json();
    if (!data.paymentUrl) return res.status(502).json({ error: 'Payment provider error' });

    res.json({ paymentUrl: data.paymentUrl });
  } catch (err) {
    console.error('Payment retry error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ───── Seller dashboard ─────

app.get('/api/seller/products', authRequired, sellerRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, c.name AS category,
              (SELECT pi.image_url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.is_primary DESC, pi.display_order ASC LIMIT 1) AS image_url
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.seller_id = $1
       ORDER BY p.created_at DESC`,
      [req.user.id]
    );
    res.json({ products: result.rows });
  } catch (err) {
    console.error('Seller products error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/seller/orders', authRequired, sellerRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT o.*, u.full_name AS buyer_name, u.phone AS buyer_phone
       FROM orders o
       JOIN order_items oi ON o.id = oi.order_id
       JOIN users u ON o.buyer_id = u.id
       WHERE oi.seller_id = $1
       GROUP BY o.id, u.full_name, u.phone
       ORDER BY o.created_at DESC`,
      [req.user.id]
    );
    res.json({ orders: result.rows });
  } catch (err) {
    console.error('Seller orders error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/seller/orders/:id/status', authRequired, sellerRequired, async (req, res) => {
  const { status } = req.body;
  const allowed = ['paid', 'processing', 'shipped', 'delivered'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `Status must be one of: ${allowed.join(', ')}` });
  }
  try {
    const check = await pool.query(
      `SELECT o.id, o.status FROM orders o
       JOIN order_items oi ON o.id = oi.order_id
       WHERE o.id = $1 AND oi.seller_id = $2`,
      [req.params.id, req.user.id]
    );
    if (check.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    const current = check.rows[0].status;
    const transitions = { pending: 'processing', paid: 'processing', processing: 'shipped', shipped: 'delivered' };
    if (transitions[current] !== status) {
      return res.status(400).json({ error: `Cannot transition from ${current} to ${status}` });
    }
    await pool.query(
      `UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [status, req.params.id]
    );
    logOrderEvent(req.params.id, 'status_change', req.user.id, current, status, `Seller updated status`);
    const orderInfo = await pool.query('SELECT buyer_id FROM orders WHERE id = $1', [req.params.id]);
    if (orderInfo.rows.length > 0) {
      createNotification(orderInfo.rows[0].buyer_id, 'order_status', 'Order Updated', `Your order is now: ${status}`, { orderId: req.params.id });
    }
    res.json({ updated: true, status });
  } catch (err) {
    console.error('Order status update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ───── Promo Codes ─────

app.post('/api/promos/validate', authRequired, async (req, res) => {
  const { code, orderTotal } = req.body;
  if (!code) return res.status(400).json({ error: 'Code required' });
  try {
    const result = await pool.query(
      `SELECT * FROM promo_codes WHERE code = $1 AND is_active = true AND (valid_until IS NULL OR valid_until > CURRENT_TIMESTAMP)`,
      [code.toUpperCase()]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Invalid or expired promo code' });
    const promo = result.rows[0];
    if (promo.max_uses && promo.uses_count >= promo.max_uses) {
      return res.status(400).json({ error: 'Promo code has reached max uses' });
    }
    if (orderTotal && parseFloat(orderTotal) < parseFloat(promo.min_order_amount)) {
      return res.status(400).json({ error: `Minimum order amount is Rs ${parseFloat(promo.min_order_amount).toFixed(0)}` });
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

app.post('/api/promos', authRequired, sellerRequired, async (req, res) => {
  const tierCheck = await pool.query('SELECT seller_tier FROM users WHERE id = $1', [req.user.id]);
  const sellerTier = tierCheck.rows[0]?.seller_tier || 'none';
  if (sellerTier !== 'business') {
    return res.status(403).json({ error: 'Promo codes are a Business seller feature. Upgrade your plan to create promo codes.' });
  }

  const { code, discountType, discountValue, minOrderAmount, maxUses, validUntil } = req.body;
  if (!code || !discountType || !discountValue) return res.status(400).json({ error: 'code, discountType, discountValue required' });
  if (!['percentage', 'fixed'].includes(discountType)) return res.status(400).json({ error: 'discountType must be percentage or fixed' });
  if (discountValue <= 0) return res.status(400).json({ error: 'discountValue must be positive' });
  try {
    const result = await pool.query(
      `INSERT INTO promo_codes (code, seller_id, discount_type, discount_value, min_order_amount, max_uses, valid_until)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [code.toUpperCase(), req.user.id, discountType, discountValue, minOrderAmount || 0, maxUses || null, validUntil || null]
    );
    res.status(201).json({ promo: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Promo code already exists' });
    console.error('Promo create error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/promos/mine', authRequired, sellerRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM promo_codes WHERE seller_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json({ promos: result.rows });
  } catch (err) {
    console.error('Promos fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ───── Seller Analytics ─────

app.get('/api/seller/analytics', authRequired, sellerRequired, async (req, res) => {
  try {
    const tierCheck = await pool.query('SELECT seller_tier FROM users WHERE id = $1', [req.user.id]);
    const sellerTier = tierCheck.rows[0]?.seller_tier || 'none';
    if (sellerTier === 'casual') {
      return res.status(403).json({ error: 'Analytics are not available for Casual sellers. Upgrade to Verified for basic stats.' });
    }

    const overview = await pool.query(
      `SELECT
        (SELECT COUNT(*) FROM order_items oi JOIN orders o ON oi.order_id = o.id WHERE oi.seller_id = $1 AND o.status != 'cancelled') AS total_orders,
        (SELECT COALESCE(SUM(oi.price * oi.quantity), 0) FROM order_items oi JOIN orders o ON oi.order_id = o.id WHERE oi.seller_id = $1 AND o.status != 'cancelled') AS total_revenue,
        (SELECT COALESCE(AVG(r.rating)::numeric(3,2), 0) FROM reviews r WHERE r.seller_id = $1) AS avg_rating,
        (SELECT COUNT(*) FROM reviews WHERE seller_id = $1) AS review_count,
        (SELECT COUNT(*) FROM follows WHERE seller_id = $1) AS follower_count,
        (SELECT COUNT(*) FROM products WHERE seller_id = $1) AS product_count`,
      [req.user.id]
    );
    let topProducts = { rows: [] };
    if (sellerTier === 'business') {
      topProducts = await pool.query(
        `SELECT p.id, p.name, p.price, p.stock,
                COALESCE(SUM(oi.quantity), 0) AS units_sold,
                COALESCE(SUM(oi.price * oi.quantity), 0) AS revenue,
                (SELECT pi.image_url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.is_primary DESC, pi.display_order ASC LIMIT 1) AS image_url
         FROM products p
         LEFT JOIN order_items oi ON oi.product_id = p.id
         LEFT JOIN orders o ON oi.order_id = o.id AND o.status != 'cancelled'
         WHERE p.seller_id = $1
         GROUP BY p.id
         ORDER BY revenue DESC
         LIMIT 10`,
        [req.user.id]
      );
    }
    res.json({ overview: overview.rows[0], topProducts: topProducts.rows, sellerTier });
  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ───── Disputes ─────

app.post('/api/disputes', authRequired, async (req, res) => {
  const { orderId, reason, description } = req.body;
  if (!orderId || !reason) return res.status(400).json({ error: 'orderId and reason required' });
  try {
    const order = await canAccessOrder(req.user.id, orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'completed' && order.status !== 'paid' && order.status !== 'processing') {
      return res.status(400).json({ error: 'Can only dispute active or completed orders' });
    }
    const result = await pool.query(
      `INSERT INTO disputes (order_id, raised_by, reason, description) VALUES ($1, $2, $3, $4) RETURNING *`,
      [orderId, req.user.id, reason, description || null]
    );
    res.status(201).json({ dispute: result.rows[0] });
  } catch (err) {
    console.error('Dispute create error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/disputes', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT d.*, o.status AS order_status FROM disputes d
       JOIN orders o ON d.order_id = o.id
       WHERE d.raised_by = $1 OR o.buyer_id = $1 OR EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = d.order_id AND oi.seller_id = $1)
       ORDER BY d.created_at DESC`,
      [req.user.id]
    );
    res.json({ disputes: result.rows });
  } catch (err) {
    console.error('Disputes fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ───── Inventory Alerts ─────

app.get('/api/seller/products/low-stock', authRequired, sellerRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM products WHERE seller_id = $1 AND stock <= 3 AND is_available = true ORDER BY stock ASC`,
      [req.user.id]
    );
    res.json({ products: result.rows });
  } catch (err) {
    console.error('Low stock error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ───── Admin ─────

function adminRequired(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

app.get('/api/admin/users', authRequired, adminRequired, async (_req, res) => {
  try {
    const result = await pool.query('SELECT id, full_name, email, phone, role, created_at FROM users ORDER BY created_at DESC');
    res.json({ users: result.rows });
  } catch (err) {
    console.error('Admin users error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/admin/disputes', authRequired, adminRequired, async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT d.*, u.full_name AS raised_by_name, o.buyer_id
       FROM disputes d
       JOIN users u ON d.raised_by = u.id
       JOIN orders o ON d.order_id = o.id
       ORDER BY d.created_at DESC`
    );
    res.json({ disputes: result.rows });
  } catch (err) {
    console.error('Admin disputes error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/admin/disputes/:id', authRequired, adminRequired, async (req, res) => {
  const { status, resolution } = req.body;
  if (!status || !['open', 'under_review', 'resolved', 'closed'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  try {
    await pool.query(
      `UPDATE disputes SET status = $1, resolution = COALESCE($2, resolution), updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
      [status, resolution || null, req.params.id]
    );
    res.json({ updated: true });
  } catch (err) {
    console.error('Admin dispute update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ───── Order Notes (Seller Updates) ─────

app.post('/api/orders/:id/note', authRequired, sellerRequired, async (req, res) => {
  const { note } = req.body;
  if (!note || !note.trim()) return res.status(400).json({ error: 'Note text required' });
  try {
    const check = await pool.query(
      `SELECT o.id, o.buyer_id FROM orders o
       JOIN order_items oi ON o.id = oi.order_id
       WHERE o.id = $1 AND oi.seller_id = $2`,
      [req.params.id, req.user.id]
    );
    if (check.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    logOrderEvent(req.params.id, 'note_added', req.user.id, null, null, note.trim());
    createNotification(check.rows[0].buyer_id, 'order_status', 'Seller Note', note.trim(), { orderId: req.params.id });
    res.json({ updated: true });
  } catch (err) {
    console.error('Order note error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ───── Messaging ─────

app.get('/api/conversations', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*, 
              CASE WHEN c.buyer_id = $1 THEN c.seller_id ELSE c.buyer_id END AS other_party_id,
              u.full_name AS other_party_name, u.avatar_url AS other_party_avatar,
              (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message,
              (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND sender_id != $1 AND is_read = false) AS unread_count
       FROM conversations c
       JOIN users u ON u.id = CASE WHEN c.buyer_id = $1 THEN c.seller_id ELSE c.buyer_id END
       WHERE c.buyer_id = $1 OR c.seller_id = $1
       ORDER BY c.last_message_at DESC`,
      [req.user.id]
    );
    res.json({ conversations: result.rows });
  } catch (err) {
    console.error('Conversations fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/conversations', authRequired, async (req, res) => {
  const { productId, orderId, sellerId: directSellerId } = req.body;
  if (!productId && !orderId && !directSellerId) return res.status(400).json({ error: 'productId, orderId, or sellerId required' });
  try {
    let sellerId;
    if (directSellerId) {
      sellerId = directSellerId;
    } else if (orderId) {
      const o = await pool.query('SELECT buyer_id FROM orders WHERE id = $1', [orderId]);
      if (o.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
      const items = await pool.query('SELECT seller_id FROM order_items WHERE order_id = $1 LIMIT 1', [orderId]);
      sellerId = items.rows[0]?.seller_id;
      if (req.user.id === sellerId) sellerId = o.rows[0].buyer_id;
    } else {
      const p = await pool.query('SELECT seller_id FROM products WHERE id = $1', [productId]);
      if (p.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
      sellerId = p.rows[0].seller_id;
    }
    if (req.user.id === sellerId) return res.status(400).json({ error: 'Cannot message yourself' });
    const existing = await pool.query(
      `SELECT id FROM conversations WHERE buyer_id = $1 AND seller_id = $2 AND ($3::uuid IS NULL OR order_id = $3)`,
      [req.user.id, sellerId, orderId || null]
    );
    if (existing.rows.length > 0) return res.json({ conversationId: existing.rows[0].id });
    const buyerId = req.user.id;
    const result = await pool.query(
      `INSERT INTO conversations (order_id, product_id, buyer_id, seller_id) VALUES ($1, $2, $3, $4) RETURNING id`,
      [orderId || null, productId || null, buyerId, sellerId]
    );
    res.status(201).json({ conversationId: result.rows[0].id });
  } catch (err) {
    console.error('Conversation create error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/conversations/:id/messages', authRequired, async (req, res) => {
  try {
    const conv = await pool.query(
      'SELECT * FROM conversations WHERE id = $1 AND (buyer_id = $2 OR seller_id = $2)',
      [req.params.id, req.user.id]
    );
    if (conv.rows.length === 0) return res.status(404).json({ error: 'Conversation not found' });
    await pool.query(
      'UPDATE messages SET is_read = true WHERE conversation_id = $1 AND sender_id != $2',
      [req.params.id, req.user.id]
    );
    const result = await pool.query(
      `SELECT m.*, u.full_name AS sender_name
       FROM messages m JOIN users u ON m.sender_id = u.id
       WHERE m.conversation_id = $1
       ORDER BY m.created_at ASC`,
      [req.params.id]
    );
    res.json({ messages: result.rows });
  } catch (err) {
    console.error('Messages fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/conversations/:id/messages', authRequired, async (req, res) => {
  const { content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'Message content required' });
  try {
    const conv = await pool.query(
      'SELECT * FROM conversations WHERE id = $1 AND (buyer_id = $2 OR seller_id = $2)',
      [req.params.id, req.user.id]
    );
    if (conv.rows.length === 0) return res.status(404).json({ error: 'Conversation not found' });
    const result = await pool.query(
      `INSERT INTO messages (conversation_id, sender_id, content) VALUES ($1, $2, $3) RETURNING *`,
      [req.params.id, req.user.id, content.trim()]
    );
    await pool.query(
      'UPDATE conversations SET last_message_at = CURRENT_TIMESTAMP WHERE id = $1',
      [req.params.id]
    );
    res.status(201).json({ message: result.rows[0] });
  } catch (err) {
    console.error('Message send error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/conversations/unread-count', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT COALESCE(SUM(
        (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND sender_id != $1 AND is_read = false)
      ), 0) AS count FROM conversations c WHERE c.buyer_id = $1 OR c.seller_id = $1`,
      [req.user.id]
    );
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (err) {
    console.error('Unread count error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ───── Payment routes ─────

app.post('/api/payments/create', authRequired, async (req, res) => {
  const { orderId, returnUrl } = req.body;
  if (!orderId) return res.status(400).json({ error: 'orderId required' });

  try {
    const orderResult = await pool.query(
      'SELECT * FROM orders WHERE id = $1 AND buyer_id = $2',
      [orderId, req.user.id]
    );
    if (orderResult.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    const order = orderResult.rows[0];
    if (order.status !== 'pending') return res.status(400).json({ error: 'Order is not pending' });

    const moncashRes = await fetch(
      process.env.MONCASH_PAY_CREATE_URL || 'https://hvlmeoqyxaguzcujpmit.supabase.co/functions/v1/pay-create',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.MCC_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: parseFloat(order.total_amount),
          referenceId: orderId,
          returnUrl: returnUrl || `https://${req.get('host')}/payment/return`,
        }),
      }
    );

    if (!moncashRes.ok) {
      const errorText = await moncashRes.text();
      console.error(`MonCashConnect HTTP ${moncashRes.status}:`, errorText);
      return res.status(502).json({ error: `MonCashConnect returned ${moncashRes.status}`, details: errorText });
    }
    const data = await moncashRes.json();
    if (!data.paymentUrl) {
      console.error('MonCashConnect missing paymentUrl:', data);
      return res.status(502).json({ error: 'Payment provider error', details: data });
    }

    await pool.query('UPDATE orders SET moncash_reference = $1 WHERE id = $2', [orderId, orderId]);
    res.json({ paymentUrl: data.paymentUrl });
  } catch (err) {
    console.error('Payment create error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/payments/webhook', async (req, res) => {
  const rawBody = req.rawBody;
  const signature = req.headers['x-mcc-signature'];
  const timestamp = req.headers['x-mcc-timestamp'];
  const webhookSecret = process.env.MCC_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return res.status(500).json({ error: 'Webhook not configured' });
  }
  if (!signature || !timestamp) {
    return res.status(401).json({ error: 'Missing signature headers' });
  }
  const ts = parseInt(timestamp) * 1000;
  const age = (Date.now() - ts) / 1000;
  if (age > 300) {
    return res.status(401).json({ error: 'Webhook timestamp expired' });
  }
  const expected = 'sha256=' + crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
  if (expected !== signature) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const { event, reference, id: eventId } = req.body;
  console.log('MonCash webhook:', JSON.stringify(req.body));

  if (!reference) return res.status(400).json({ error: 'reference required' });

  // Idempotency — skip if this event was already processed
  if (eventId) {
    const already = await pool.query('SELECT 1 FROM processed_events WHERE id = $1', [eventId]);
    if (already.rows.length > 0) {
      return res.json({ received: true, idempotent: true });
    }
  }

  try {
    if (event === 'payment.completed') {

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // Register event as processed INSIDE the transaction (prevent double-credit on replay)
        // Also prevents data loss if the transaction rolls back
        if (eventId) {
          await client.query('INSERT INTO processed_events (id) VALUES ($1) ON CONFLICT DO NOTHING', [eventId]);
        }
        await client.query(
          `UPDATE orders SET status = 'paid', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'pending'`,
          [reference]
        );
        await logOrderEvent(reference, 'payment_received', null, 'pending', 'paid', 'Payment completed via MonCash', client);
        const items = await client.query(
          'SELECT seller_id, SUM(price * quantity) AS total FROM order_items WHERE order_id = $1 GROUP BY seller_id',
          [reference]
        );
        for (const item of items.rows) {
          if (item.seller_id) {
            const grossAmount = parseFloat(item.total);
            const tierRes = await client.query('SELECT seller_tier FROM users WHERE id = $1', [item.seller_id]);
            const sellerTier = tierRes.rows[0]?.seller_tier || 'none';
            const rate = getCommissionRate(sellerTier);
            const commission = Math.round(grossAmount * rate * 100) / 100;
            const net = Math.round((grossAmount - commission) * 100) / 100;

            await client.query(
              `INSERT INTO seller_balances (seller_id, balance, total_earned)
               VALUES ($1, $2, $2)
               ON CONFLICT (seller_id)
               DO UPDATE SET balance = seller_balances.balance + $2,
                             total_earned = seller_balances.total_earned + $2,
                             updated_at = CURRENT_TIMESTAMP`,
              [item.seller_id, net]
            );

            await client.query(
              `INSERT INTO platform_revenue (order_id, seller_id, seller_tier, gross_amount, commission_rate, commission_amount, platform_fee, net_to_seller)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
              [reference, item.seller_id, sellerTier, grossAmount, rate, commission, commission, net]
            );

            console.log(`  Seller ${item.seller_id} (${sellerTier}): gross Rs ${grossAmount}, commission ${rate * 100}% = Rs ${commission}, net Rs ${net}`);
          }
        }
        await client.query('COMMIT');
        const sellerIds = items.rows.map(r => r.seller_id).filter(Boolean);
        for (const sid of sellerIds) {
          const revRow = (await client.query(
            'SELECT net_to_seller, commission_amount FROM platform_revenue WHERE order_id = $1 AND seller_id = $2',
            [reference, sid]
          )).rows[0];
          const net = revRow ? parseFloat(revRow.net_to_seller) : 0;
          createNotification(sid, 'order_status', 'Payment Received', `Rs ${net.toFixed(0)} credited to your balance for order`, { orderId: reference });
        }
        console.log(`Order ${reference} paid, sellers credited`);
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }

      // Auto-payout platform commission to PLATFORM_PHONE
      try {
        const totalCommission = (await pool.query(
          'SELECT COALESCE(SUM(commission_amount), 0) AS total FROM platform_revenue WHERE order_id = $1',
          [reference]
        )).rows[0].total;

        const commissionAmount = parseFloat(totalCommission);
        if (commissionAmount > 0 && process.env.PLATFORM_PHONE) {
          const payoutRes = await fetch(
            process.env.MONCASH_PAYOUT_CREATE_URL || 'https://hvlmeoqyxaguzcujpmit.supabase.co/functions/v1/external-payout-create',
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${process.env.MCC_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                amount: commissionAmount,
                receiver: process.env.PLATFORM_PHONE,
                referenceId: `platform_${reference}`,
              }),
            }
          );

          if (payoutRes.ok) {
            const payoutData = await payoutRes.json();
            await pool.query(
              `INSERT INTO platform_payouts (order_id, amount, status, moncash_reference)
               VALUES ($1, $2, 'completed', $3)`,
              [reference, commissionAmount, payoutData.reference || payoutData.transactionId || null]
            );
            console.log(`Platform commission Rs ${commissionAmount} sent to ${process.env.PLATFORM_PHONE}`);
          } else {
            const errText = await payoutRes.text();
            await pool.query(
              `INSERT INTO platform_payouts (order_id, amount, status, error_message)
               VALUES ($1, $2, 'failed', $3)`,
              [reference, commissionAmount, errText]
            );
            console.error(`Platform payout failed for order ${reference}: ${errText}`);
          }
        }
      } catch (payoutErr) {
        console.error(`Platform payout error for order ${reference}:`, payoutErr.message);
      }
    } else if (event === 'payment.failed') {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const items = await client.query('SELECT product_id, quantity FROM order_items WHERE order_id = $1', [reference]);
        for (const item of items.rows) {
          await client.query('UPDATE products SET stock = stock + $1 WHERE id = $2', [item.quantity, item.product_id]);
        }
        await client.query("UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [reference]);
        await logOrderEvent(reference, 'status_change', null, 'pending', 'cancelled', 'Payment failed', client);
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
      console.log(`Order ${reference} cancelled via webhook`);
    } else if (event === 'payout.completed') {
      await pool.query(
        `UPDATE payouts SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [reference]
      );
      console.log(`Payout ${reference} completed via webhook`);
    } else if (event === 'payout.failed') {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const payout = await client.query('SELECT seller_id, amount FROM payouts WHERE id = $1', [reference]);
        if (payout.rows.length > 0) {
          const { seller_id, amount } = payout.rows[0];
          await client.query(
            'UPDATE seller_balances SET balance = balance + $1, total_paid_out = total_paid_out - $1, updated_at = CURRENT_TIMESTAMP WHERE seller_id = $2',
            [amount, seller_id]
          );
        }
        await client.query(
          `UPDATE payouts SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [reference]
        );
        await client.query('COMMIT');
        console.log(`Payout ${reference} failed, balance refunded`);
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ───── Seller Balance / Payout routes ─────

app.get('/api/seller/balance', authRequired, sellerRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT balance, total_earned, total_paid_out FROM seller_balances WHERE seller_id = $1`,
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.json({ balance: 0, total_earned: 0, total_paid_out: 0 });
    }
    const row = result.rows[0];
    res.json({ balance: parseFloat(row.balance) || 0, total_earned: parseFloat(row.total_earned) || 0, total_paid_out: parseFloat(row.total_paid_out) || 0 });
  } catch (err) {
    console.error('Balance fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/seller/payouts', authRequired, sellerRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM payouts WHERE seller_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json({ payouts: result.rows });
  } catch (err) {
    console.error('Payouts fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

async function refundPayout(client, sellerId, amount, payoutId, errorMessage) {
  try {
    await client.query('BEGIN');
    await client.query(
      'UPDATE seller_balances SET balance = balance + $1, total_paid_out = total_paid_out - $1, updated_at = CURRENT_TIMESTAMP WHERE seller_id = $2',
      [amount, sellerId]
    );
    await client.query(
      `UPDATE payouts SET status = 'failed', error_message = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [errorMessage, payoutId]
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Refund payout error:', e);
  }
}

app.post('/api/seller/payouts/request', authRequired, sellerRequired, async (req, res) => {
  const tierCheck = await pool.query('SELECT seller_tier FROM users WHERE id = $1', [req.user.id]);
  const sellerTier = tierCheck.rows[0]?.seller_tier || 'none';
  if (sellerTier === 'casual') {
    return res.status(403).json({ error: 'Payouts are available for Verified sellers and above. Upgrade your account to request payouts.' });
  }
  if (sellerTier === 'business') {
    const subStatus = await checkSubscriptionStatus(req.user.id);
    if (subStatus === 'expired') {
      await pool.query(`UPDATE users SET seller_tier = 'verified', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [req.user.id]);
      createNotification(req.user.id, 'subscription_expired', 'Business Subscription Expired', 'Your Business subscription has expired. You have been demoted to Verified Seller.', {}, pool);
      return res.status(403).json({ error: 'Business subscription expired. You have been demoted to Verified Seller.' });
    }
  }

  const { amount } = req.body;
  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Valid amount required' });
  }

  const MIN_PAYOUT = parseFloat(process.env.MIN_PAYOUT_AMOUNT || '50');
  if (amount < MIN_PAYOUT) {
    return res.status(400).json({ error: `Minimum payout is Rs ${MIN_PAYOUT}` });
  }

  const c = await pool.connect();
  try {
    await c.query('BEGIN');

    const balanceResult = await c.query(
      'SELECT balance FROM seller_balances WHERE seller_id = $1 FOR UPDATE',
      [req.user.id]
    );
    const currentBalance = balanceResult.rows.length > 0 ? parseFloat(balanceResult.rows[0].balance) : 0;
    if (currentBalance < amount) {
      await c.query('ROLLBACK');
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    const userResult = await c.query('SELECT phone FROM users WHERE id = $1', [req.user.id]);
    const phone = userResult.rows[0]?.phone;
    if (!phone) {
      await c.query('ROLLBACK');
      return res.status(400).json({ error: 'Set your phone number in Profile before requesting a payout' });
    }

    const payoutResult = await c.query(
      `INSERT INTO payouts (seller_id, amount, status, receiver_phone)
       VALUES ($1, $2, 'processing', $3) RETURNING *`,
      [req.user.id, amount, phone]
    );
    const payout = payoutResult.rows[0];

    await c.query(
      'UPDATE seller_balances SET balance = balance - $1, total_paid_out = total_paid_out + $1, updated_at = CURRENT_TIMESTAMP WHERE seller_id = $2',
      [amount, req.user.id]
    );

    await c.query('COMMIT');

    // Call MonCashConnect payout API
    try {
      const mccRes = await fetch(
        process.env.MONCASH_PAYOUT_CREATE_URL || 'https://hvlmeoqyxaguzcujpmit.supabase.co/functions/v1/external-payout-create',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.MCC_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ amount, receiver: phone, referenceId: payout.id }),
        }
      );

      if (mccRes.ok) {
        const data = await mccRes.json();
        await pool.query(
          `UPDATE payouts SET status = 'completed', moncash_reference = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
          [data.reference || data.transactionId || null, payout.id]
        );
        return res.json({ payout: { ...payout, status: 'completed' } });
      }

      const errorText = await mccRes.text();
      console.error(`MonCashConnect payout error: ${mccRes.status}`, errorText);
      const refundC = await pool.connect();
      try {
        await refundPayout(refundC, req.user.id, amount, payout.id, `MonCashConnect returned ${mccRes.status}: ${errorText}`);
      } finally {
        refundC.release();
      }
      return res.status(502).json({ error: 'Payout failed', details: errorText });
    } catch (fetchErr) {
      console.error('Payout network error:', fetchErr);
      const refundC = await pool.connect();
      try {
        await refundPayout(refundC, req.user.id, amount, payout.id, fetchErr.message);
      } finally {
        refundC.release();
      }
      return res.status(502).json({ error: 'Payout network error', details: fetchErr.message });
    }
  } catch (err) {
    await c.query('ROLLBACK');
    console.error('Payout request error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    c.release();
  }
});

// ───── Upload config (imgbb key for client-side direct upload) ─────

app.get('/api/upload/config', authRequired, (_req, res) => {
  const key = process.env.IMGBB_KEY;
  if (!key) return res.status(500).json({ error: 'Upload service not configured' });
  res.json({ imgbbKey: key });
});

// ───── Health check ─────

// ───── ID Verification ─────

app.post('/api/verification/submit', authRequired, sellerRequired, async (req, res) => {
  const { idFrontUrl, idBackUrl, selfieUrl, ocrResult, faceMatchScore } = req.body;
  if (!idFrontUrl || !idBackUrl || !selfieUrl) {
    return res.status(400).json({ error: 'CIN front, back, and selfie are required' });
  }
  try {
    const existing = await pool.query(
      `SELECT id, status FROM verification_attempts WHERE user_id = $1 AND status IN ('pending', 'verified') ORDER BY created_at DESC LIMIT 1`,
      [req.user.id]
    );
    if (existing.rows.length > 0 && existing.rows[0].status === 'verified') {
      return res.status(400).json({ error: 'Already verified' });
    }

    let autoStatus = 'pending';
    let rejectionReason = null;

    if (ocrResult && faceMatchScore) {
      const nameMatch = ocrResult.fullName &&
        ocrResult.fullName.toLowerCase().trim() === (await pool.query('SELECT full_name FROM users WHERE id = $1', [req.user.id])).rows[0]?.full_name?.toLowerCase().trim();
      const hasCinNumber = ocrResult.cinNumber && /^\d{8,12}$/.test(ocrResult.cinNumber);
      const hasDob = ocrResult.dateOfBirth;
      const faceOk = parseFloat(faceMatchScore) > 0.65;

      if (nameMatch && hasCinNumber && hasDob && faceOk) {
        autoStatus = 'verified';
      } else {
        const issues = [];
        if (!nameMatch) issues.push('name_mismatch');
        if (!hasCinNumber) issues.push('invalid_cin_number');
        if (!hasDob) issues.push('missing_dob');
        if (!faceOk) issues.push('face_match_failed');
        rejectionReason = issues.join(',');
      }
    }

    const result = await pool.query(
      `INSERT INTO verification_attempts (user_id, status, id_front_url, id_back_url, selfie_url, ocr_result, face_match_score, rejection_reason, verified_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, ${autoStatus === 'verified' ? 'CURRENT_TIMESTAMP' : 'NULL'})
       RETURNING *`,
      [req.user.id, autoStatus, idFrontUrl, idBackUrl, selfieUrl, ocrResult ? JSON.stringify(ocrResult) : null, faceMatchScore || null, rejectionReason]
    );

    if (autoStatus === 'verified') {
      await pool.query(
        `UPDATE users SET id_verified = true, id_verified_at = CURRENT_TIMESTAMP, id_verification_result = 'verified' WHERE id = $1`,
        [req.user.id]
      );
      createNotification(req.user.id, 'verification_approved', 'Identity Verified', 'Your identity has been verified! You are now a Verified Seller.', {});
    } else {
      await pool.query(
        `UPDATE users SET id_submitted_at = CURRENT_TIMESTAMP, id_verification_result = 'pending' WHERE id = $1`,
        [req.user.id]
      );
      createNotification(req.user.id, 'verification_submitted', 'Verification Submitted', 'Your ID verification has been submitted and is being reviewed.', {});
    }

    res.json({ attempt: result.rows[0] });
  } catch (err) {
    console.error('Verification submit error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/verification/status', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, status, rejection_reason, created_at, verified_at FROM verification_attempts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [req.user.id]
    );
    const userRes = await pool.query('SELECT id_verification_result FROM users WHERE id = $1', [req.user.id]);
    res.json({
      status: userRes.rows[0]?.id_verification_result || 'none',
      attempt: result.rows[0] || null,
    });
  } catch (err) {
    console.error('Verification status error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/verification/images/:id', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE verification_attempts SET id_front_url = NULL, id_back_url = NULL, selfie_url = NULL WHERE id = $1 AND user_id = $2 RETURNING id`,
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true });
  } catch (err) {
    console.error('Verification image delete error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ───── Subscriptions ─────

app.post('/api/subscriptions/create', authRequired, sellerRequired, async (req, res) => {
  try {
    const existing = await pool.query(
      `SELECT id, status, expires_at FROM seller_subscriptions WHERE seller_id = $1 AND status IN ('active', 'past_due') ORDER BY expires_at DESC LIMIT 1`,
      [req.user.id]
    );
    if (existing.rows.length > 0) {
      const sub = existing.rows[0];
      const now = new Date();
      const expiresAt = new Date(sub.expires_at);
      if (sub.status === 'active' && expiresAt > now) {
        return res.status(400).json({ error: 'Active subscription already exists', expiresAt: sub.expires_at });
      }
    }

    const orderId = `sub_${req.user.id}_${Date.now()}`;
    await pool.query(
      `INSERT INTO orders (id, buyer_id, total_amount, status) VALUES ($1, $2, 2500, 'pending') ON CONFLICT (id) DO NOTHING`,
      [orderId, req.user.id]
    );

    const payUrl = process.env.MONCASH_PAY_CREATE_URL || 'https://hvlmeoqyxaguzcujpmit.supabase.co/functions/v1/pay-create';
    const mccRes = await fetch(payUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.MCC_KEY || ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ amount: 2500, referenceId: orderId, returnUrl: req.body.returnUrl || '' }),
    });
    const payData = await mccRes.json();
    if (!mccRes.ok || !payData.paymentUrl) {
      return res.status(500).json({ error: 'Payment creation failed', details: payData });
    }
    res.json({ paymentUrl: payData.paymentUrl, orderId });
  } catch (err) {
    console.error('Subscription create error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/subscriptions/current', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM seller_subscriptions WHERE seller_id = $1 AND status IN ('active', 'past_due') ORDER BY expires_at DESC LIMIT 1`,
      [req.user.id]
    );
    res.json({ subscription: result.rows[0] || null });
  } catch (err) {
    console.error('Subscription fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/subscriptions/renew', authRequired, sellerRequired, async (req, res) => {
  try {
    const existing = await pool.query(
      `SELECT id, expires_at FROM seller_subscriptions WHERE seller_id = $1 AND status IN ('active', 'past_due') ORDER BY expires_at DESC LIMIT 1`,
      [req.user.id]
    );

    const orderId = `sub_renew_${req.user.id}_${Date.now()}`;
    await pool.query(
      `INSERT INTO orders (id, buyer_id, total_amount, status) VALUES ($1, $2, 2500, 'pending') ON CONFLICT (id) DO NOTHING`,
      [orderId, req.user.id]
    );

    const payUrl = process.env.MONCASH_PAY_CREATE_URL || 'https://hvlmeoqyxaguzcujpmit.supabase.co/functions/v1/pay-create';
    const mccRes = await fetch(payUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.MCC_KEY || ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ amount: 2500, referenceId: orderId, returnUrl: req.body.returnUrl || '' }),
    });
    const payData = await mccRes.json();
    if (!mccRes.ok || !payData.paymentUrl) {
      return res.status(500).json({ error: 'Payment creation failed', details: payData });
    }
    res.json({ paymentUrl: payData.paymentUrl, orderId });
  } catch (err) {
    console.error('Subscription renew error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/subscriptions/webhook', express.json(), async (req, res) => {
  try {
    const signature = req.headers['x-mcc-signature'] || '';
    const secret = process.env.MCC_WEBHOOK_SECRET || '';
    const hmac = crypto.createHmac('sha256', secret).update(req.rawBody || '').digest('hex');
    if (secret && signature !== hmac) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { event, data } = req.body;
    if (event === 'payment.completed' && data?.referenceId) {
      const orderId = data.referenceId;
      const orderRes = await pool.query('SELECT buyer_id FROM orders WHERE id = $1', [orderId]);
      if (orderRes.rows.length === 0) return res.json({ received: true });
      const sellerId = orderRes.rows[0].buyer_id;

      const isSubscriptionOrder = orderId.startsWith('sub_');
      if (isSubscriptionOrder) {
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

        const existing = await pool.query(
          `SELECT id FROM seller_subscriptions WHERE seller_id = $1 AND status IN ('active', 'past_due') ORDER BY expires_at DESC LIMIT 1`,
          [sellerId]
        );

        if (existing.rows.length > 0) {
          await pool.query(
            `UPDATE seller_subscriptions SET status = 'active', expires_at = $2, last_payment_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [existing.rows[0].id, expiresAt]
          );
        } else {
          await pool.query(
            `INSERT INTO seller_subscriptions (seller_id, status, started_at, expires_at, last_payment_at) VALUES ($1, 'active', CURRENT_TIMESTAMP, $2, CURRENT_TIMESTAMP)`,
            [sellerId, expiresAt]
          );
        }

        await pool.query('UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', ['completed', orderId]);
        await pool.query(
          `UPDATE users SET seller_tier = 'business', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND seller_tier != 'business'`,
          [sellerId]
        );
        createNotification(sellerId, 'subscription_activated', 'Business Subscription Active', `Your Business subscription is active until ${expiresAt.toLocaleDateString()}.`, {});
      }
    }
    res.json({ received: true });
  } catch (err) {
    console.error('Subscription webhook error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ───── Subscription status check helper ─────

async function checkSubscriptionStatus(sellerId) {
  try {
    const result = await pool.query(
      `SELECT * FROM seller_subscriptions WHERE seller_id = $1 AND status IN ('active', 'past_due') ORDER BY expires_at DESC LIMIT 1`,
      [sellerId]
    );
    if (result.rows.length === 0) return 'no_subscription';
    const sub = result.rows[0];
    const now = new Date();
    const expiresAt = new Date(sub.expires_at);
    const graceEnd = new Date(expiresAt.getTime() + (sub.grace_period_days || 7) * 86400000);
    if (now < expiresAt) return 'active';
    if (now < graceEnd) return 'past_due';
    return 'expired';
  } catch {
    return 'unknown';
  }
}

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    const revRes = await pool.query('SELECT COALESCE(SUM(commission_amount), 0) AS total_commission FROM platform_revenue');
    res.json({
      status: 'ok',
      database: 'connected',
      hasMccKey: !!process.env.MCC_KEY,
      totalCommission: parseFloat(revRes.rows[0].total_commission),
    });
  } catch {
    res.status(503).json({ status: 'error', database: 'disconnected' });
  }
});

app.get('/api/debug', authRequired, adminRequired, async (_req, res) => {
  try {
    const mccRes = await fetch(
      process.env.MONCASH_PAY_CREATE_URL || 'https://hvlmeoqyxaguzcujpmit.supabase.co/functions/v1/pay-balance',
      { headers: { 'Authorization': `Bearer ${process.env.MCC_KEY || ''}` } }
    );
    const data = await mccRes.json();
    res.json({ mccStatus: mccRes.status, mccOk: mccRes.ok, data, hasKey: !!process.env.MCC_KEY, keyPrefix: (process.env.MCC_KEY || '').slice(0, 10) });
  } catch (err) {
    res.status(500).json({ error: err.message, hasKey: !!process.env.MCC_KEY });
  }
});

app.get('*', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

const __execPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
const __thisFile = fileURLToPath(import.meta.url);
const isMain = __execPath === __thisFile || __execPath === path.resolve(__thisFile);
if (isMain) {
  runMigrations().then(async () => {
    await cleanupOldNotifications();
    // cleanupLegacyData() REMOVED — was wiping ALL products/orders/reviews on every restart
    // Legacy /uploads/ URL cleanup is now handled by the imgbb migration (images are hosted on imgbb)
    app.listen(PORT, () => {
      console.log(`MaurMaket API running on http://localhost:${PORT}`);
    });
  });
}

export default app;
