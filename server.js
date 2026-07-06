import express from 'express';
import cors from 'cors';
import pg from 'pg';
import dotenv from 'dotenv';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import cron from 'node-cron';
import nodemailer from 'nodemailer';
import { Expo } from 'expo-server-sdk';
import { fileURLToPath } from 'url';
import path from 'path';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 15,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});
pool.on('error', (err) => {
  console.error('Unexpected pool error:', err);
});
const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is required');
  process.exit(1);
}
const BCRYPT_ROUNDS = 10;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ───── Rate Limiters ─────
const generalLimiter = rateLimit({ windowMs: 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests, try again later' } });
const authLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many login attempts, try again later' } });
const paymentLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many payment requests, try again later' } });
const uploadLimiter = rateLimit({ windowMs: 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many uploads, try again later' } });

// ───── Email Transporter (nodemailer) ─────
const emailTransporter = process.env.SMTP_HOST ? nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: parseInt(process.env.SMTP_PORT || '587', 10) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
}) : null;

const PRODUCTION_URL = process.env.PRODUCTION_URL || 'https://maurmaket.onrender.com';

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
    // Escrow table — holds funds until meetup confirmation (Phase 1)
    await c.query(`
      CREATE TABLE IF NOT EXISTS order_escrow (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
        seller_id UUID REFERENCES users(id) NOT NULL,
        gross_amount DECIMAL(10,2) NOT NULL,
        commission_amount DECIMAL(10,2) NOT NULL,
        net_amount DECIMAL(10,2) NOT NULL,
        status VARCHAR(20) DEFAULT 'held' CHECK (status IN ('held', 'released', 'refunded')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        released_at TIMESTAMP,
        UNIQUE(order_id, seller_id)
      );
    `);
    // Meetup check-in tracking (Phase 1)
    await c.query(`
      CREATE TABLE IF NOT EXISTS meetup_checkins (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
        user_id UUID REFERENCES users(id) NOT NULL,
        role VARCHAR(10) NOT NULL CHECK (role IN ('buyer', 'seller')),
        lat DECIMAL(10,7),
        lng DECIMAL(10,7),
        checked_in_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        qr_token VARCHAR(255),
        qr_scanned BOOLEAN DEFAULT false,
        UNIQUE(order_id, user_id)
      );
      -- Feed events — tracks engagement for personalized feed
      CREATE TABLE IF NOT EXISTS feed_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
        product_id UUID REFERENCES products(id) ON DELETE CASCADE NOT NULL,
        event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('view', 'like', 'unlike', 'relevant', 'not_relevant', 'save', 'dwell')),
        duration_ms INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, product_id, event_type)
      );
      CREATE TABLE IF NOT EXISTS seller_locations (
        seller_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        lat DECIMAL(10,7) NOT NULL,
        lng DECIMAL(10,7) NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    // Sale price columns on products
    await c.query(`
      ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_price DECIMAL(10,2);
      ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_starts_at TIMESTAMP;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_ends_at TIMESTAMP;
    `);
    // Email verification + Google Sign-In
    await c.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT UNIQUE;
      CREATE TABLE IF NOT EXISTS otp_codes (
        email TEXT PRIMARY KEY,
        code TEXT NOT NULL,
        purpose TEXT NOT NULL DEFAULT 'verify',
        expires_at TIMESTAMPTZ NOT NULL
      );
    `);
    // User location fields
    await c.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS location_address TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS location_city TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS location_lat DECIMAL(10,7);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS location_lng DECIMAL(10,7);
    `);
    // Push token
    await c.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS push_token TEXT;`);
    // Message media columns
    await c.query(`
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_type VARCHAR(20) DEFAULT 'text';
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS image_url TEXT;
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS image_width INTEGER;
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS image_height INTEGER;
    `);
    // Allow NULL content for image messages
    await c.query(`ALTER TABLE messages ALTER COLUMN content DROP NOT NULL;`);

    // Performance indexes
    await c.query(`
      CREATE INDEX IF NOT EXISTS idx_products_seller_id ON products(seller_id);
      CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
      CREATE INDEX IF NOT EXISTS idx_products_is_available ON products(is_available);
      CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_product_images_product_id ON product_images(product_id);
      CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
      CREATE INDEX IF NOT EXISTS idx_order_items_seller_id ON order_items(seller_id);
      CREATE INDEX IF NOT EXISTS idx_orders_buyer_id ON orders(buyer_id);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
      CREATE INDEX IF NOT EXISTS idx_notifications_user_id_is_read ON notifications(user_id, is_read);
      CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_conversations_buyer_id ON conversations(buyer_id);
      CREATE INDEX IF NOT EXISTS idx_conversations_seller_id ON conversations(seller_id);
      CREATE INDEX IF NOT EXISTS idx_wishlists_user_id ON wishlists(user_id);
      CREATE INDEX IF NOT EXISTS idx_follows_follower_id ON follows(follower_id);
      CREATE INDEX IF NOT EXISTS idx_follows_seller_id ON follows(seller_id);
      CREATE INDEX IF NOT EXISTS idx_feed_events_user_rate ON feed_events(user_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_order_escrow_order_id_status ON order_escrow(order_id, status);
      CREATE INDEX IF NOT EXISTS idx_meetup_checkins_order_id ON meetup_checkins(order_id);
      CREATE INDEX IF NOT EXISTS idx_order_events_order_id ON order_events(order_id);
      CREATE INDEX IF NOT EXISTS idx_reviews_seller_id ON reviews(seller_id);
      CREATE INDEX IF NOT EXISTS idx_reviews_order_id ON reviews(order_id);
      CREATE INDEX IF NOT EXISTS idx_seller_balances_seller_id ON seller_balances(seller_id);
      CREATE INDEX IF NOT EXISTS idx_promo_codes_seller_id ON promo_codes(seller_id);
      CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON promo_codes(code);
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
    const result = await pool.query("DELETE FROM notifications WHERE type = 'new_message' AND is_read = true AND created_at < NOW() - INTERVAL '7 days'");
    if (result.rowCount > 0) console.log(`Cleaned up ${result.rowCount} old read message notifications`);
  } catch (err) {
    console.error('Notification cleanup error:', err);
  }
}

// ───── CORS (production + dev origins) ─────
const ALLOWED_ORIGINS = [
  'https://maurmaket.onrender.com',
  'http://localhost:3001',
  'http://localhost:8081',
  'http://localhost:19006',
];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) callback(null, true);
    else callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(morgan('combined'));
app.use('/api/auth', authLimiter);
app.use('/api/payments', paymentLimiter);
app.use('/api/upload', uploadLimiter);
app.use('/api', generalLimiter);
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
  // Fire-and-forget push notification
  sendPushNotification(userId, title, body, data);
}

// Push notification helper (fire-and-forget)
const expo = new Expo();
async function sendPushNotification(userId, title, body, data) {
  try {
    const result = await pool.query('SELECT push_token FROM users WHERE id = $1', [userId]);
    const token = result.rows[0]?.push_token;
    if (!token || !Expo.isExpoPushToken(token)) return;
    await expo.sendPushNotificationsAsync([{
      to: token,
      title,
      body: body || '',
      data: data || {},
      sound: 'default',
      badge: 1,
    }]);
  } catch (err) {
    console.error('Push notification failed:', err.message);
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
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
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
      `SELECT id, full_name, email, phone, role, avatar_url, bio, created_at, store_name, store_logo_url, seller_tier, id_submitted_at, id_verified, id_verified_at, id_verification_result, use_store_identity, email_verified, location_address, location_city, location_lat, location_lng FROM users WHERE id = $1`,
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
  let { fullName, email, phone, bio, avatarUrl, locationAddress, locationCity, locationLat, locationLng } = req.body;
  if (phone) phone = phone.replace(/^\+/, '');
  try {
    const result = await pool.query(
      `UPDATE users SET
        full_name = COALESCE($1, full_name),
        email = COALESCE($2, email),
        phone = COALESCE($3, phone),
        bio = COALESCE($4, bio),
        avatar_url = COALESCE($5, avatar_url),
        location_address = COALESCE($7, location_address),
        location_city = COALESCE($8, location_city),
        location_lat = COALESCE($9, location_lat),
        location_lng = COALESCE($10, location_lng),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING id, full_name, email, phone, role, avatar_url, bio, store_name, store_logo_url, seller_tier, id_verified, use_store_identity, email_verified,
                 location_address, location_city, location_lat, location_lng`,
      [fullName, email || null, phone, bio, avatarUrl, req.user.id, locationAddress || null, locationCity || null, locationLat || null, locationLng || null]
    );
    res.json({ user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already in use' });
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/users/push-token', authRequired, async (req, res) => {
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

// ───── Email Verification ─────

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
  if (!emailTransporter) {
    console.error('SMTP not configured — cannot send email');
    return false;
  }
  const { html, plainText, subject } = buildVerificationEmail(code, purpose, lang);
  try {
    await emailTransporter.sendMail({
      from: `"MaurMaket" <${process.env.SMTP_USER}>`,
      to: email,
      subject,
      text: plainText,
      html,
    });
    return true;
  } catch (err) {
    console.error('Email send error:', err);
    return false;
  }
}

app.post('/api/auth/verify/send', authRequired, async (req, res) => {
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

    const sent = await sendOtpEmail(user.email, code, 'verify', language || 'en');
    if (!sent) return res.status(500).json({ error: 'Failed to send email. Please try again.' });

    res.json({ success: true, email: user.email });
  } catch (err) {
    console.error('Verify send error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/verify/check', authRequired, async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Code required' });
  try {
    const userResult = await pool.query('SELECT email, email_verified FROM users WHERE id = $1', [req.user.id]);
    if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const user = userResult.rows[0];
    if (user.email_verified) return res.status(400).json({ error: 'Email already verified' });

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
    await pool.query('DELETE FROM otp_codes WHERE email = $1 AND purpose = $2', [user.email]);

    const updated = await pool.query(
      `SELECT id, full_name, email, phone, role, avatar_url, bio, created_at, store_name, store_logo_url, seller_tier, id_submitted_at, id_verified, id_verified_at, id_verification_result, use_store_identity, email_verified, location_address, location_city, location_lat, location_lng FROM users WHERE id = $1`,
      [req.user.id]
    );
    res.json({ success: true, user: updated.rows[0] });
  } catch (err) {
    console.error('Verify check error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ───── Forgot / Reset Password ─────

app.post('/api/auth/forgot-password', async (req, res) => {
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

app.post('/api/auth/reset-password', async (req, res) => {
  const { email, code, newPassword } = req.body;
  if (!email || !code || !newPassword) return res.status(400).json({ error: 'Email, code, and new password required' });
  if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
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

// ───── Google Sign-In ─────

app.post('/api/auth/google', async (req, res) => {
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

    const byGoogleId = await pool.query('SELECT id FROM users WHERE google_id = $1', [googleId]);
    if (byGoogleId.rows.length > 0) {
      const updated = await pool.query(
        `UPDATE users SET email = $1, full_name = $2, avatar_url = $3, updated_at = CURRENT_TIMESTAMP
         WHERE google_id = $4
         RETURNING id, full_name, email, phone, role, avatar_url, bio, created_at, store_name, store_logo_url, seller_tier, id_verified, use_store_identity, email_verified, location_address, location_city, location_lat, location_lng`,
        [email, name, picture, googleId]
      );
      userRow = updated.rows[0];
    } else {
      const byEmail = await pool.query('SELECT id FROM users WHERE lower(email) = lower($1)', [email]);
      if (byEmail.rows.length > 0) {
        const updated = await pool.query(
          `UPDATE users SET google_id = $1, avatar_url = COALESCE($2, avatar_url), updated_at = CURRENT_TIMESTAMP
           WHERE lower(email) = lower($3)
           RETURNING id, full_name, email, phone, role, avatar_url, bio, created_at, store_name, store_logo_url, seller_tier, id_verified, use_store_identity, email_verified, location_address, location_city, location_lat, location_lng`,
          [googleId, picture, email]
        );
        userRow = updated.rows[0];
      } else {
        const inserted = await pool.query(
          `INSERT INTO users (email, google_id, full_name, avatar_url, role, email_verified)
           VALUES ($1, $2, $3, $4, 'buyer', true)
           RETURNING id, full_name, email, phone, role, avatar_url, bio, created_at, store_name, store_logo_url, seller_tier, id_verified, use_store_identity, email_verified, location_address, location_city, location_lat, location_lng`,
          [email, googleId, name, picture]
        );
        userRow = inserted.rows[0];
      }
    }

    const token = jwt.sign({ id: userRow.id, email: userRow.email, role: userRow.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ user: userRow, token });
  } catch (err) {
    console.error('Google auth error:', err);
    res.status(500).json({ error: 'Google authentication failed' });
  }
});

// ───── Become a Seller ─────

app.put('/api/auth/become-seller', authRequired, async (req, res) => {
  try {
    if (req.user.role === 'seller') {
      return res.status(400).json({ error: 'You are already a seller' });
    }
    const { storeName, storeLogoUrl, idDocumentUrl } = req.body;
    const sellerTier = 'casual';
    const useStoreIdentity = false;
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
       RETURNING id, full_name, email, phone, role, avatar_url, bio, store_name, store_logo_url, seller_tier, id_submitted_at, id_verified, id_verified_at, use_store_identity, created_at, location_address, location_city, location_lat, location_lng`,
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
       RETURNING id, full_name, email, phone, role, avatar_url, bio, store_name, store_logo_url, seller_tier, id_submitted_at, id_verified, id_verified_at, use_store_identity, created_at, location_address, location_city, location_lat, location_lng`,
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
       RETURNING id, full_name, email, phone, role, avatar_url, bio, store_name, store_logo_url, seller_tier, id_submitted_at, id_verified, id_verified_at, use_store_identity, created_at, location_address, location_city, location_lat, location_lng`,
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
              p.sale_price, p.sale_starts_at, p.sale_ends_at,
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
    createNotification(req.params.sellerId, 'new_follower', 'New Follower', `${followerName} started following you`, { followerId: req.user.id });
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

// ───── Nearby sellers (map discovery) ─────

app.get('/api/sellers/nearby', async (req, res) => {
  const { lat, lng, radius = 10 } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng query params required' });
  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);
  const radiusKm = parseFloat(radius);
  if (isNaN(latNum) || isNaN(lngNum) || isNaN(radiusKm)) {
    return res.status(400).json({ error: 'Invalid lat, lng, or radius' });
  }
  try {
    const result = await pool.query(
      `SELECT u.id, u.full_name, u.avatar_url, u.store_name, u.store_logo_url,
              u.seller_tier, u.id_verified, u.use_store_identity,
              sl.lat, sl.lng,
              (6371 * acos(LEAST(1, GREATEST(-1,
                cos(radians($1)) * cos(radians(sl.lat)) *
                cos(radians(sl.lng) - radians($2)) +
                sin(radians($1)) * sin(radians(sl.lat))
              )))) AS distance_km,
              (SELECT COUNT(*) FROM products p WHERE p.seller_id = u.id AND p.is_available = true) AS product_count,
              (SELECT pi.image_url FROM product_images pi
               JOIN products p ON pi.product_id = p.id
               WHERE p.seller_id = u.id AND p.is_available = true
               ORDER BY pi.is_primary DESC, pi.display_order ASC LIMIT 1) AS primary_image,
              COALESCE((SELECT AVG(r.rating)::numeric(3,2) FROM reviews r WHERE r.seller_id = u.id), 0) AS avg_rating,
              (SELECT COUNT(*) FROM reviews r2 WHERE r2.seller_id = u.id) AS review_count
       FROM seller_locations sl
       JOIN users u ON u.id = sl.seller_id
       WHERE u.role = 'seller'
       ORDER BY distance_km ASC`,
      [latNum, lngNum]
    );
    const filtered = result.rows.filter(r => parseFloat(r.distance_km) <= radiusKm);
    res.json({ sellers: filtered.map(r => ({
      ...r,
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lng),
      distance_km: parseFloat(parseFloat(r.distance_km).toFixed(2)),
      product_count: parseInt(r.product_count),
      avg_rating: parseFloat(r.avg_rating) || 0,
      review_count: parseInt(r.review_count),
    }))});
  } catch (err) {
    console.error('Nearby sellers error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ───── Seller Profile / Stats (used by storefront) ─────

app.get('/api/sellers/:id', async (req, res) => {
  try {
    const userResult = await pool.query(
      `SELECT id, full_name, avatar_url, bio, created_at, store_name, store_logo_url, seller_tier, id_verified, id_verification_result, use_store_identity FROM users WHERE id = $1 AND role = 'seller'`,
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
  const { category, search, seller, minPrice, maxPrice, sort, page = 1, limit = 20, personalized } = req.query;
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

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  // Check if personalized feed is requested and user is authenticated
  let usePersonalized = false;
  let userId = null;
  if (personalized === 'true') {
    try {
      // Extract token from Authorization header
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        userId = decoded.id;
        usePersonalized = true;
      }
    } catch { /* Not authenticated or invalid token — fall through to default order */ }
  }

  let orderBy = 'p.created_at DESC';
  let selectExtra = '';
  let joinExtra = '';

  if (usePersonalized && userId) {
    // Personalized scoring using CTE for efficiency
    selectExtra = `, COALESCE(score.total_score, 0) AS feed_score`;
    joinExtra = `LEFT JOIN (
      WITH user_follows AS (
        SELECT seller_id FROM follows WHERE follower_id = $${paramIndex}
      ),
      user_wishlists AS (
        SELECT product_id FROM wishlists WHERE user_id = $${paramIndex}
      ),
      user_likes AS (
        SELECT product_id FROM feed_events WHERE user_id = $${paramIndex} AND event_type = 'like'
      ),
      user_relevant AS (
        SELECT product_id FROM feed_events WHERE user_id = $${paramIndex} AND event_type = 'relevant'
      ),
      user_not_relevant AS (
        SELECT product_id FROM feed_events WHERE user_id = $${paramIndex} AND event_type = 'not_relevant'
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
      )
      SELECT
        p2.id AS product_id,
        (
          COALESCE((SELECT 3.0 FROM user_follows WHERE seller_id = p2.seller_id LIMIT 1), 0)
          + COALESCE((SELECT 2.0 FROM user_wishlists WHERE product_id = p2.id LIMIT 1), 0)
          + COALESCE((SELECT 2.0 FROM user_likes WHERE product_id = p2.id LIMIT 1), 0)
          + COALESCE((SELECT 1.5 FROM user_purchases WHERE seller_id = p2.seller_id LIMIT 1), 0)
          + COALESCE((SELECT 1.5 FROM user_relevant WHERE product_id = p2.id LIMIT 1), 0)
          + COALESCE((SELECT 1.0 FROM user_purchases WHERE category_id = p2.category_id LIMIT 1), 0)
          + CASE WHEN p2.created_at > NOW() - INTERVAL '24 hours' THEN 1.0 ELSE 0 END
          + COALESCE((SELECT CASE WHEN avg_rating > 4 THEN 0.5 ELSE 0 END FROM seller_ratings WHERE seller_id = p2.seller_id), 0)
          - COALESCE((SELECT 3.0 FROM user_not_relevant WHERE product_id = p2.id LIMIT 1), 0)
        ) AS total_score
      FROM products p2
      WHERE p2.is_available = TRUE
        AND (
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
          SELECT 1 FROM user_purchases WHERE seller_id = p2.seller_id OR category_id = p2.category_id
          LIMIT 1
        )
      ORDER BY total_score DESC, p2.created_at DESC
    ) score ON score.product_id = p.id`;
    params.push(userId);
    orderBy = 'COALESCE(score.total_score, 0) DESC, p.created_at DESC';
  } else if (!sort) {
    orderBy = 'p.created_at DESC';
  } else if (sort === 'price_asc') {
    orderBy = '(CASE WHEN p.sale_price IS NOT NULL AND (p.sale_starts_at IS NULL OR p.sale_starts_at <= NOW()) AND (p.sale_ends_at IS NULL OR p.sale_ends_at >= NOW()) THEN p.sale_price ELSE p.price END) ASC';
  } else if (sort === 'price_desc') {
    orderBy = '(CASE WHEN p.sale_price IS NOT NULL AND (p.sale_starts_at IS NULL OR p.sale_starts_at <= NOW()) AND (p.sale_ends_at IS NULL OR p.sale_ends_at >= NOW()) THEN p.sale_price ELSE p.price END) DESC';
  } else if (sort === 'oldest') {
    orderBy = 'p.created_at ASC';
  }

  try {
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM products p LEFT JOIN categories c ON p.category_id = c.id ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    const result = await pool.query(
      `SELECT p.id, p.name, p.description, p.price, p.stock, p.created_at, p.category_id,
              p.sale_price, p.sale_starts_at, p.sale_ends_at,
              (CASE WHEN p.sale_price IS NOT NULL AND (p.sale_starts_at IS NULL OR p.sale_starts_at <= NOW()) AND (p.sale_ends_at IS NULL OR p.sale_ends_at >= NOW()) THEN p.sale_price ELSE p.price END)::DECIMAL(10,2) AS effective_price,
              (CASE WHEN p.sale_price IS NOT NULL AND (p.sale_starts_at IS NULL OR p.sale_starts_at <= NOW()) AND (p.sale_ends_at IS NULL OR p.sale_ends_at >= NOW()) THEN true ELSE false END) AS is_on_sale,
              (CASE WHEN p.sale_price IS NOT NULL AND (p.sale_starts_at IS NULL OR p.sale_starts_at <= NOW()) AND (p.sale_ends_at IS NULL OR p.sale_ends_at >= NOW()) THEN ROUND((1 - p.sale_price / p.price) * 100) ELSE 0 END)::INTEGER AS discount_pct,
              u.full_name AS seller_name, u.id AS seller_id, u.store_name, u.store_logo_url, u.seller_tier, u.avatar_url AS seller_avatar, u.use_store_identity,
              c.name AS category
              ${selectExtra},
              (SELECT json_agg(json_build_object('image_url', pi.image_url, 'is_primary', pi.is_primary) ORDER BY pi.is_primary DESC, pi.display_order ASC) FROM product_images pi WHERE pi.product_id = p.id) AS images
       FROM products p
       JOIN users u ON p.seller_id = u.id
       LEFT JOIN categories c ON p.category_id = c.id
       ${joinExtra}
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
              (CASE WHEN p.sale_price IS NOT NULL AND (p.sale_starts_at IS NULL OR p.sale_starts_at <= NOW()) AND (p.sale_ends_at IS NULL OR p.sale_ends_at >= NOW()) THEN p.sale_price ELSE p.price END)::DECIMAL(10,2) AS effective_price,
              (CASE WHEN p.sale_price IS NOT NULL AND (p.sale_starts_at IS NULL OR p.sale_starts_at <= NOW()) AND (p.sale_ends_at IS NULL OR p.sale_ends_at >= NOW()) THEN true ELSE false END) AS is_on_sale,
              (CASE WHEN p.sale_price IS NOT NULL AND (p.sale_starts_at IS NULL OR p.sale_starts_at <= NOW()) AND (p.sale_ends_at IS NULL OR p.sale_ends_at >= NOW()) THEN ROUND((1 - p.sale_price / p.price) * 100) ELSE 0 END)::INTEGER AS discount_pct,
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
  // Email verification gate
  const evCheck = await pool.query('SELECT email_verified FROM users WHERE id = $1', [req.user.id]);
  if (!evCheck.rows[0]?.email_verified) {
    return res.status(403).json({ error: 'email_not_verified', message: 'Please verify your email to start selling.' });
  }
  const { name, description, price, stock, categoryId, images, sale_price, sale_starts_at, sale_ends_at } = req.body;
  if (!name || !price) {
    return res.status(400).json({ error: 'Name and price required' });
  }
  if (stock !== undefined && stock !== null && stock !== '' && parseInt(stock) < 1) {
    return res.status(400).json({ error: 'Stock must be at least 1' });
  }
  if (!images || !Array.isArray(images) || images.length === 0) {
    return res.status(400).json({ error: 'At least one image is required' });
  }
  if (images.length > 8) {
    return res.status(400).json({ error: 'Maximum 8 images allowed' });
  }

  // Sale price validation
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
      const imageValues = images.map((url, i) => `($1, $${i + 2}, ${i === 0}, ${i})`).join(', ');
      const imageParams = images.map(url => url);
      await client.query(
        `INSERT INTO product_images (product_id, image_url, is_primary, display_order) VALUES ${imageValues}`,
        [product.id, ...imageParams]
      );
    }

    await client.query('COMMIT');
    // Notify followers of new product
    try {
      const followers = await pool.query('SELECT follower_id FROM follows WHERE seller_id = $1', [req.user.id]);
      if (followers.rows.length > 0) {
        const sellerName = (await pool.query('SELECT full_name FROM users WHERE id = $1', [req.user.id])).rows[0]?.full_name || 'A seller';
        for (const f of followers.rows) {
          createNotification(f.follower_id, 'new_product_from_followed', `New Listing from ${sellerName}`,
            `${sellerName} just listed "${name}" for Rs ${price}`, { productId: product.id, sellerId: req.user.id });
        }
      }
    } catch (e) { console.error('Follower notification error:', e.message); }
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
    const check = await client.query('SELECT seller_id, price FROM products WHERE id = $1', [req.params.id]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    if (check.rows[0].seller_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not your product' });
    }
    const { name, description, price, stock, isAvailable, categoryId, images, sale_price, sale_starts_at, sale_ends_at, clearSale } = req.body;

    if (stock !== undefined && stock !== null && stock !== '' && parseInt(stock) < 1) {
      return res.status(400).json({ error: 'Stock must be at least 1' });
    }

    // Sale price validation
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
  // Email verification gate
  const evCheck = await pool.query('SELECT email_verified FROM users WHERE id = $1', [req.user.id]);
  if (!evCheck.rows[0]?.email_verified) {
    return res.status(403).json({ error: 'email_not_verified', message: 'Please verify your email to place orders.' });
  }
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
      const prod = await client.query('SELECT id, price, sale_price, sale_starts_at, sale_ends_at, seller_id, stock FROM products WHERE id = $1 AND is_available = TRUE FOR UPDATE', [item.productId]);
      if (prod.rows.length === 0) {
        throw new Error(`Product ${item.productId} not found or unavailable`);
      }
      if (prod.rows[0].seller_id === req.user.id) {
        throw new Error(`You cannot purchase your own product`);
      }
      if (prod.rows[0].stock < (item.quantity || 1)) {
        throw new Error(`Insufficient stock for product ${item.productId}`);
      }
      const p = prod.rows[0];
      const onSale = p.sale_price && (p.sale_starts_at === null || new Date(p.sale_starts_at) <= new Date()) && (p.sale_ends_at === null || new Date(p.sale_ends_at) >= new Date());
      const price = onSale ? parseFloat(p.sale_price) : parseFloat(p.price);
      total += price * (item.quantity || 1);
      orderItems.push({ productId: item.productId, quantity: item.quantity || 1, price, sellerId: prod.rows[0].seller_id });
    }

    let discountAmount = 0;
    let promoId = null;
    if (promoCode) {
      const promoResult = await client.query(
        `SELECT * FROM promo_codes WHERE code = $1 AND is_active = true AND (valid_until IS NULL OR valid_until > CURRENT_TIMESTAMP) FOR UPDATE`,
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
    await client.query(
      "UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
      [req.params.id]
    );
    await client.query('COMMIT');
    logOrderEvent(req.params.id, 'status_change', req.user.id, 'pending', 'cancelled', 'Cancelled by buyer');
    // Notify sellers of cancelled order
    const cancelledSellers = await pool.query('SELECT DISTINCT seller_id FROM order_items WHERE order_id = $1', [req.params.id]);
    for (const row of cancelledSellers.rows) {
      createNotification(row.seller_id, 'order_cancelled', 'Order Cancelled',
        `A buyer cancelled their order.`, { orderId: req.params.id });
    }
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
      `SELECT oi.product_id, oi.quantity, p.name, p.price, p.stock, p.is_available, p.seller_id,
              p.sale_price, p.sale_starts_at, p.sale_ends_at,
              (SELECT json_agg(json_build_object('id', pi.id, 'url', pi.image_url, 'is_primary', pi.is_primary, 'display_order', pi.display_order) ORDER BY pi.is_primary DESC, pi.display_order)
               FROM product_images pi WHERE pi.product_id = p.id) AS images
       FROM order_items oi JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = $1`,
      [req.params.id]
    );
    const availableItems = items.rows
      .filter(item => item.is_available && item.stock > 0)
      .map(item => {
        const isOnSale = item.sale_price && (item.sale_starts_at === null || new Date(item.sale_starts_at) <= new Date()) && (item.sale_ends_at === null || new Date(item.sale_ends_at) >= new Date());
        const effectivePrice = isOnSale ? parseFloat(item.sale_price) : parseFloat(item.price);
        return { productId: item.product_id, sellerId: item.seller_id, name: item.name, price: effectivePrice, stock: item.stock, images: item.images || [] };
      });
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

// ───── Meetup Check-in + QR ─────

const QR_SECRET = process.env.QR_SECRET || process.env.JWT_SECRET + '_qr';

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Buyer/Seller checks in at meetup location
app.post('/api/orders/:id/meetup/checkin', authRequired, async (req, res) => {
  const { lat, lng } = req.body;
  if (!lat || !lng) return res.status(400).json({ error: 'Latitude and longitude required' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const orderResult = await client.query(
      'SELECT * FROM orders WHERE id = $1 FOR UPDATE',
      [req.params.id]
    );
    if (orderResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }
    const order = orderResult.rows[0];
    if (!order.meetup_confirmed) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Meetup location must be confirmed before checking in' });
    }
    if (order.status !== 'paid') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Order must be paid to check in' });
    }

    const role = order.buyer_id === req.user.id ? 'buyer' : 'seller';
    const isSeller = role === 'seller';
    const isBuyer = role === 'buyer';

    // Only buyer or seller of this order can check in
    if (!isBuyer && !isSeller) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Not a party to this order' });
    }

    // Upsert check-in
    await client.query(
      `INSERT INTO meetup_checkins (order_id, user_id, role, lat, lng)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (order_id, user_id) DO UPDATE SET lat = $4, lng = $5, checked_in_at = CURRENT_TIMESTAMP`,
      [req.params.id, req.user.id, role, lat, lng]
    );

    // Check if the OTHER party has also checked in
    const otherCheckin = await client.query(
      'SELECT * FROM meetup_checkins WHERE order_id = $1 AND user_id != $2',
      [req.params.id, req.user.id]
    );

    let proximityConfirmed = false;
    let distance = null;

    if (otherCheckin.rows.length > 0) {
      const other = otherCheckin.rows[0];
      distance = haversineDistance(lat, lng, parseFloat(other.lat), parseFloat(other.lng));
      proximityConfirmed = distance <= 150;

      if (proximityConfirmed && isBuyer) {
        // Both are within 150m — generate QR code for the buyer
        const nonce = crypto.randomBytes(16).toString('hex');
        const qrToken = jwt.sign(
          {
            orderId: req.params.id,
            buyerId: order.buyer_id,
            sellerId: other.user_id,
            gpsHash: crypto.createHmac('sha256', QR_SECRET).update(`${lat},${lng}`).digest('hex'),
            nonce,
          },
          QR_SECRET,
          { expiresIn: '30m' }
        );
        await client.query(
          'UPDATE meetup_checkins SET qr_token = $1 WHERE order_id = $2 AND user_id = $3',
          [qrToken, req.params.id, req.user.id]
        );
        // Log the event
        await logOrderEvent(req.params.id, 'meetup_arrived', req.user.id, null, null, `Buyer and seller within ${Math.round(distance)}m`, client);
      }
    }

    await client.query('COMMIT');

    // Return check-in result
    const response = {
      checkedIn: true,
      role,
      otherPartyCheckedIn: otherCheckin.rows.length > 0,
      proximityConfirmed,
      distance: distance ? Math.round(distance) : null,
    };

    if (proximityConfirmed && isBuyer) {
      const qrRow = await pool.query(
        'SELECT qr_token FROM meetup_checkins WHERE order_id = $1 AND user_id = $2',
        [req.params.id, req.user.id]
      );
      response.qrToken = qrRow.rows[0]?.qr_token || null;
    }

    res.json(response);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Meetup check-in error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// Seller scans buyer's QR code
app.post('/api/orders/:id/meetup/scan', authRequired, async (req, res) => {
  const { qrToken } = req.body;
  if (!qrToken) return res.status(400).json({ error: 'QR token required' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const orderResult = await client.query(
      'SELECT * FROM orders WHERE id = $1 FOR UPDATE',
      [req.params.id]
    );
    if (orderResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }
    const order = orderResult.rows[0];

    // Verify this is the seller
    const isSeller = order.delivery_method === 'meetup';
    const sellerItem = await pool.query(
      'SELECT seller_id FROM order_items WHERE order_id = $1 AND seller_id = $2',
      [req.params.id, req.user.id]
    );
    if (sellerItem.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Only the seller can scan the QR code' });
    }

    // Verify QR token
    let decoded;
    try {
      decoded = jwt.verify(qrToken, QR_SECRET);
    } catch (err) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'QR code is invalid or expired' });
    }

    if (decoded.orderId !== req.params.id || decoded.sellerId !== req.user.id) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'QR code does not match this order or seller' });
    }

    // Check if QR was already used
    const existingScan = await pool.query(
      'SELECT * FROM meetup_checkins WHERE qr_token = $1 AND qr_scanned = true',
      [qrToken]
    );
    if (existingScan.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'QR code has already been used' });
    }

    // Verify GPS proximity at scan time
    const buyerCheckin = await pool.query(
      'SELECT * FROM meetup_checkins WHERE order_id = $1 AND user_id = $2',
      [req.params.id, order.buyer_id]
    );
    const sellerCheckin = await pool.query(
      'SELECT * FROM meetup_checkins WHERE order_id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );

    if (buyerCheckin.rows.length > 0 && sellerCheckin.rows.length > 0) {
      const dist = haversineDistance(
        parseFloat(buyerCheckin.rows[0].lat), parseFloat(buyerCheckin.rows[0].lng),
        parseFloat(sellerCheckin.rows[0].lat), parseFloat(sellerCheckin.rows[0].lng)
      );
      if (dist > 150) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Parties are ${Math.round(dist)}m apart — must be within 150m to complete exchange` });
      }
    }

    // Mark QR as scanned
    await client.query(
      'UPDATE meetup_checkins SET qr_scanned = true WHERE order_id = $1 AND user_id = $2',
      [req.params.id, order.buyer_id]
    );

    // Log the event
    await logOrderEvent(req.params.id, 'exchange_confirmed', req.user.id, null, null, 'QR code scanned — exchange confirmed', client);

    await client.query('COMMIT');

    res.json({
      scanned: true,
      message: 'Exchange confirmed! The buyer will be asked to confirm receipt.',
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('QR scan error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// Extend meetup timer by 30 minutes
app.put('/api/orders/:id/meetup/extend', authRequired, async (req, res) => {
  try {
    const order = await canAccessOrder(req.user.id, req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'paid') return res.status(400).json({ error: 'Order must be active' });

    // Push the check-in time forward by 30 minutes so the 90-min cron window resets
    await pool.query(
      `UPDATE meetup_checkins SET checked_in_at = checked_in_at + INTERVAL '30 minutes'
       WHERE order_id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );

    await logOrderEvent(req.params.id, 'meetup_extended', req.user.id, null, null, 'Timer extended by 30 minutes');
    res.json({ extended: true });
  } catch (err) {
    console.error('Meetup extend error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get check-in status for an order
app.get('/api/orders/:id/meetup/status', authRequired, async (req, res) => {
  try {
    const order = await canAccessOrder(req.user.id, req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const checkins = await pool.query(
      `SELECT mc.*, u.full_name, u.avatar_url
       FROM meetup_checkins mc
       JOIN users u ON mc.user_id = u.id
       WHERE mc.order_id = $1`,
      [req.params.id]
    );

    res.json({ checkins: checkins.rows });
  } catch (err) {
    console.error('Meetup status error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/orders/:id/complete', authRequired, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const orderResult = await client.query(
      'SELECT * FROM orders WHERE id = $1 FOR UPDATE',
      [req.params.id]
    );
    if (orderResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }
    const order = orderResult.rows[0];
    if (order.buyer_id !== req.user.id && req.user.role !== 'admin') {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Only the buyer can complete this order' });
    }
    if (order.status === 'completed') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Order already completed' });
    }
    if (order.status === 'cancelled') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Order was cancelled' });
    }
    // Allow completion from 'delivered' (shipping flow) OR 'paid' (meetup flow where delivery is skipped)
    if (order.status !== 'delivered' && order.status !== 'paid') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Order must be delivered or paid (meetup) before completing' });
    }
    await client.query(
      `UPDATE orders SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [req.params.id]
    );
    await logOrderEvent(req.params.id, 'status_change', req.user.id, order.status, 'completed', 'Order completed', client);
    await client.query('COMMIT');
    const sellersOfOrder = await pool.query(
      'SELECT DISTINCT seller_id FROM order_items WHERE order_id = $1',
      [req.params.id]
    );
    for (const row of sellersOfOrder.rows) {
      createNotification(row.seller_id, 'order_status', 'Order Completed', 'An order has been marked as completed', { orderId: req.params.id });
    }
    res.json({ updated: true, status: 'completed' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Order complete error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// ───── Escrow routes ─────

// Release escrow — called when meetup exchange is confirmed (QR scanned + buyer confirms)
// Credits seller_balances and pays out platform commission
app.post('/api/orders/:id/escrow/release', authRequired, async (req, res) => {
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
    const o = order.rows[0];

    // Only buyer can release escrow (they confirm "I received the item")
    if (o.buyer_id !== req.user.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Only the buyer can release escrow' });
    }
    if (o.status !== 'paid' && o.status !== 'completed') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Order must be paid or completed to release escrow (current: ${o.status})` });
    }

    // Get all held escrow entries for this order
    const escrows = await client.query(
      "SELECT * FROM order_escrow WHERE order_id = $1 AND status = 'held' FOR UPDATE",
      [req.params.id]
    );
    if (escrows.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No held escrow found for this order' });
    }

    for (const escrow of escrows.rows) {
      const net = parseFloat(escrow.net_amount);

      // Credit seller_balances with net amount
      await client.query(
        `INSERT INTO seller_balances (seller_id, balance, total_earned)
         VALUES ($1, $2, $2)
         ON CONFLICT (seller_id)
         DO UPDATE SET balance = seller_balances.balance + $2,
                       total_earned = seller_balances.total_earned + $2,
                       updated_at = CURRENT_TIMESTAMP`,
        [escrow.seller_id, net]
      );

      // Mark escrow as released
      await client.query(
        "UPDATE order_escrow SET status = 'released', released_at = CURRENT_TIMESTAMP WHERE id = $1",
        [escrow.id]
      );

      console.log(`Escrow released: seller ${escrow.seller_id} credited Rs ${net}`);
    }

    // Mark order as completed if not already
    if (o.status !== 'completed') {
      await client.query(
        "UPDATE orders SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
        [req.params.id]
      );
    }

    await client.query('COMMIT');

    // Pay out platform commission (outside transaction — best effort)
    try {
      const totalCommission = (await pool.query(
        'SELECT COALESCE(SUM(commission_amount), 0) AS total FROM order_escrow WHERE order_id = $1',
        [req.params.id]
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
              referenceId: `platform_${req.params.id}`,
            }),
          }
        );

        if (payoutRes.ok) {
          const payoutData = await payoutRes.json();
          await pool.query(
            `INSERT INTO platform_payouts (order_id, amount, status, moncash_reference)
             VALUES ($1, $2, 'completed', $3)`,
            [req.params.id, commissionAmount, payoutData.reference || payoutData.transactionId || null]
          );
          console.log(`Platform commission Rs ${commissionAmount} sent to ${process.env.PLATFORM_PHONE}`);
        } else {
          const errText = await payoutRes.text();
          await pool.query(
            `INSERT INTO platform_payouts (order_id, amount, status, error_message)
             VALUES ($1, $2, 'failed', $3)`,
            [req.params.id, commissionAmount, errText]
          );
          console.error(`Platform payout failed: ${errText}`);
        }
      }
    } catch (payoutErr) {
      console.error('Platform payout error:', payoutErr.message);
    }

    // Notify sellers
    for (const escrow of escrows.rows) {
      createNotification(escrow.seller_id, 'order_status', 'Payment Released',
        `Rs ${parseFloat(escrow.net_amount).toFixed(0)} has been credited to your balance`, { orderId: req.params.id });
    }

    res.json({ released: true, escrowCount: escrows.rows.length });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Escrow release error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// Refund escrow — called on dispute resolution (buyer wins) or timeout
// Sends payout back to buyer via MonCash
app.post('/api/orders/:id/escrow/refund', authRequired, async (req, res) => {
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
    const o = order.rows[0];

    // Only buyer or admin can request refund
    if (o.buyer_id !== req.user.id && req.user.role !== 'admin') {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Only the buyer or admin can refund escrow' });
    }

    // Get buyer's phone for payout
    const buyerRes = await client.query('SELECT phone FROM users WHERE id = $1', [o.buyer_id]);
    const buyerPhone = buyerRes.rows[0]?.phone;
    if (!buyerPhone) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Buyer phone number not found' });
    }

    // Get all held escrow entries
    const escrows = await client.query(
      "SELECT * FROM order_escrow WHERE order_id = $1 AND status = 'held' FOR UPDATE",
      [req.params.id]
    );
    if (escrows.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No held escrow found for this order (may already be released or refunded)' });
    }

    const totalRefund = escrows.rows.reduce((sum, e) => sum + parseFloat(e.gross_amount), 0);

    // Mark escrow as refunded
    for (const escrow of escrows.rows) {
      await client.query(
        "UPDATE order_escrow SET status = 'refunded', released_at = CURRENT_TIMESTAMP WHERE id = $1",
        [escrow.id]
      );
    }

    // Update order status
    await client.query(
      "UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
      [req.params.id]
    );
    await logOrderEvent(req.params.id, 'status_change', req.user.id, o.status, 'cancelled', 'Escrow refunded', client);

    // Restore stock
    const items = await client.query('SELECT product_id, quantity FROM order_items WHERE order_id = $1', [req.params.id]);
    for (const item of items.rows) {
      await client.query('UPDATE products SET stock = stock + $1 WHERE id = $2', [item.quantity, item.product_id]);
    }

    await client.query('COMMIT');

    // Send payout to buyer via MonCash (outside transaction — best effort)
    try {
      if (totalRefund > 0 && buyerPhone) {
        const payoutRes = await fetch(
          process.env.MONCASH_PAYOUT_CREATE_URL || 'https://hvlmeoqyxaguzcujpmit.supabase.co/functions/v1/external-payout-create',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.MCC_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              amount: Math.round(totalRefund),
              receiver: buyerPhone,
              referenceId: `refund_${req.params.id}`,
            }),
          }
        );

        if (payoutRes.ok) {
          console.log(`Refund Rs ${totalRefund} sent to buyer ${buyerPhone}`);
        } else {
          const errText = await payoutRes.text();
          console.error(`Refund payout failed: ${errText}`);
        }
      }
    } catch (payoutErr) {
      console.error('Refund payout error:', payoutErr.message);
    }

    createNotification(o.buyer_id, 'order_status', 'Order Refunded',
      `Rs ${totalRefund.toFixed(0)} refunded for order`, { orderId: req.params.id });

    // Notify sellers that escrow was refunded
    for (const escrow of escrows.rows) {
      createNotification(escrow.seller_id, 'escrow_refunded', 'Order Refunded',
        `An order has been refunded. Rs ${parseFloat(escrow.gross_amount).toFixed(0)} has been returned to the buyer.`, { orderId: req.params.id });
    }

    res.json({ refunded: true, amount: totalRefund });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Escrow refund error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// Get escrow status for an order
app.get('/api/orders/:id/escrow', authRequired, async (req, res) => {
  try {
    const order = await canAccessOrder(req.user.id, req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const escrows = await pool.query(
      `SELECT e.*, u.full_name AS seller_name
       FROM order_escrow e
       JOIN users u ON e.seller_id = u.id
       WHERE e.order_id = $1`,
      [req.params.id]
    );

    res.json({ escrows: escrows.rows });
  } catch (err) {
    console.error('Escrow status error:', err);
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

    // Use unique referenceId for each retry attempt (MonCash rejects duplicates)
    const retryReference = `${orderId}_retry_${Date.now()}`;

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
          referenceId: retryReference,
          returnUrl: `${process.env.PRODUCTION_URL || 'https://maurmaket.onrender.com'}/payment/return?order=${orderId}`,
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

app.put('/api/seller/location', authRequired, sellerRequired, async (req, res) => {
  const { lat, lng } = req.body;
  if (lat == null || lng == null) return res.status(400).json({ error: 'lat and lng required' });
  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);
  if (isNaN(latNum) || isNaN(lngNum)) return res.status(400).json({ error: 'Invalid coordinates' });
  if (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
    return res.status(400).json({ error: 'Coordinates out of range' });
  }
  try {
    await pool.query(
      `INSERT INTO seller_locations (seller_id, lat, lng, updated_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (seller_id) DO UPDATE SET lat = $2, lng = $3, updated_at = CURRENT_TIMESTAMP`,
      [req.user.id, latNum, lngNum]
    );
    res.json({ ok: true, lat: latNum, lng: lngNum });
  } catch (err) {
    console.error('Seller location update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

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
      `SELECT o.id, o.status, o.delivery_method FROM orders o
       JOIN order_items oi ON o.id = oi.order_id
       WHERE o.id = $1 AND oi.seller_id = $2`,
      [req.params.id, req.user.id]
    );
    if (check.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    const current = check.rows[0].status;
    const deliveryMethod = check.rows[0].delivery_method;

    // Block seller from advancing meetup orders via status endpoint
    // Meetup orders are completed via QR scan + escrow release flow
    if (deliveryMethod === 'meetup' && (status === 'shipped' || status === 'delivered')) {
      return res.status(400).json({ error: 'Meetup orders are completed via the QR exchange flow, not status updates' });
    }

    const transitions = { pending: 'processing', paid: 'processing', processing: 'shipped', shipped: 'delivered' };
    if (transitions[current] !== status) {
      return res.status(400).json({ error: `Cannot transition from ${current} to ${status}` });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'SELECT * FROM orders WHERE id = $1 FOR UPDATE',
        [req.params.id]
      );
      await client.query(
        `UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [status, req.params.id]
      );
      await logOrderEvent(req.params.id, 'status_change', req.user.id, current, status, 'Seller updated status', client);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

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
      `SELECT * FROM promo_codes WHERE code = $1 AND is_active = true AND (valid_until IS NULL OR valid_until > CURRENT_TIMESTAMP) FOR UPDATE`,
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

// Toggle promo active/inactive
app.patch('/api/promos/:id/toggle', authRequired, sellerRequired, async (req, res) => {
  try {
    const check = await pool.query('SELECT seller_id, is_active FROM promo_codes WHERE id = $1', [req.params.id]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Promo not found' });
    if (check.rows[0].seller_id !== req.user.id) return res.status(403).json({ error: 'Not your promo' });
    const result = await pool.query(
      `UPDATE promo_codes SET is_active = NOT is_active WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    res.json({ promo: result.rows[0] });
  } catch (err) {
    console.error('Promo toggle error:', err);
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
    // Notify the other party of the dispute
    const otherPartyId = order.buyer_id === req.user.id
      ? (await pool.query('SELECT seller_id FROM order_items WHERE order_id = $1 LIMIT 1', [orderId])).rows[0]?.seller_id
      : order.buyer_id;
    if (otherPartyId) {
      const raiserName = (await pool.query('SELECT full_name FROM users WHERE id = $1', [req.user.id])).rows[0]?.full_name || 'Someone';
      createNotification(otherPartyId, 'dispute_opened', 'Dispute Opened',
        `${raiserName} opened a dispute on this order: ${reason}`, { disputeId: result.rows[0].id, orderId, reason });
    }
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
    // Notify both parties of dispute update
    const disputeInfo = await pool.query(
      `SELECT d.order_id, d.raised_by, o.buyer_id FROM disputes d JOIN orders o ON d.order_id = o.id WHERE d.id = $1`,
      [req.params.id]
    );
    if (disputeInfo.rows.length > 0) {
      const { order_id, raised_by, buyer_id } = disputeInfo.rows[0];
      const sellerRes = await pool.query('SELECT seller_id FROM order_items WHERE order_id = $1 LIMIT 1', [order_id]);
      const sellerId = sellerRes.rows[0]?.seller_id;
      const msg = resolution ? `Your dispute has been ${status}. ${resolution}` : `Your dispute has been ${status}.`;
      const parties = [buyer_id, sellerId].filter(Boolean);
      for (const pid of parties) {
        createNotification(pid, 'dispute_resolved', 'Dispute Updated', msg, { disputeId: req.params.id, orderId: order_id });
      }
    }
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
    createNotification(check.rows[0].buyer_id, 'order_note', 'Seller Note', note.trim(), { orderId: req.params.id });
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
              (SELECT CASE WHEN message_type = 'image' THEN '📷 Photo' ELSE content END FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message,
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
      `SELECT id FROM conversations WHERE ((buyer_id = $1 AND seller_id = $2) OR (buyer_id = $2 AND seller_id = $1)) AND ($3::uuid IS NULL OR order_id = $3)`,
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
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    const result = await pool.query(
      `SELECT m.*, u.full_name AS sender_name
       FROM messages m JOIN users u ON m.sender_id = u.id
       WHERE m.conversation_id = $1
       ORDER BY m.created_at ASC
       LIMIT $2 OFFSET $3`,
      [req.params.id, limit, offset]
    );
    res.json({ messages: result.rows });
  } catch (err) {
    console.error('Messages fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/conversations/:id/messages', authRequired, async (req, res) => {
  const { content, imageUrl, messageType } = req.body;
  const msgType = messageType || 'text';
  if (msgType === 'image' && !imageUrl) return res.status(400).json({ error: 'Image URL required for image messages' });
  if (msgType === 'text' && (!content || !content.trim())) return res.status(400).json({ error: 'Message content required' });
  if (content && content.length > 5000) return res.status(400).json({ error: 'Message too long (max 5000 characters)' });
  try {
    const conv = await pool.query(
      'SELECT * FROM conversations WHERE id = $1 AND (buyer_id = $2 OR seller_id = $2)',
      [req.params.id, req.user.id]
    );
    if (conv.rows.length === 0) return res.status(404).json({ error: 'Conversation not found' });
    const storedContent = msgType === 'image' ? (content?.trim() || '\ud83d\udcf7 Photo') : content?.trim() || null;
    const result = await pool.query(
      `INSERT INTO messages (conversation_id, sender_id, content, message_type, image_url) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.params.id, req.user.id, storedContent, msgType, imageUrl || null]
    );
    await pool.query(
      'UPDATE conversations SET last_message_at = CURRENT_TIMESTAMP WHERE id = $1',
      [req.params.id]
    );
    // Notify the other party of new message
    const recipientId = conv.rows[0].buyer_id === req.user.id ? conv.rows[0].seller_id : conv.rows[0].buyer_id;
    const senderName = (await pool.query('SELECT full_name FROM users WHERE id = $1', [req.user.id])).rows[0]?.full_name || 'Someone';
    const preview = content?.trim() ? (content.trim().length > 80 ? content.trim().substring(0, 80) + '...' : content.trim()) : '\ud83d\udcf7 Photo';
    createNotification(recipientId, 'new_message', 'New Message', `${senderName}: ${preview}`, { conversationId: req.params.id, senderId: req.user.id });
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
          returnUrl: returnUrl || `${process.env.PRODUCTION_URL || 'https://maurmaket.onrender.com'}/payment/return`,
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

app.get('/api/payments/:orderId/status', authRequired, async (req, res) => {
  try {
    const orderResult = await pool.query(
      "SELECT id, status, moncash_reference FROM orders WHERE id = $1 AND buyer_id = $2",
      [req.params.orderId, req.user.id]
    );
    if (orderResult.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    const order = orderResult.rows[0];

    if (order.status !== 'pending') {
      return res.json({ status: order.status });
    }

    const referenceId = order.moncash_reference || order.id;
    try {
      const payStatusUrl = (process.env.MONCASH_PAY_CREATE_URL || 'https://hvlmeoqyxaguzcujpmit.supabase.co/functions/v1/pay-create').replace('pay-create', 'pay-status');
      const moncashRes = await fetch(payStatusUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.MCC_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ referenceId }),
      });

      if (moncashRes.ok) {
        const data = await moncashRes.json();
        if (data.status === 'completed' || data.paid === true) {
          await pool.query("UPDATE orders SET status = 'paid', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'pending'", [order.id]);
          return res.json({ status: 'paid' });
        } else if (data.status === 'failed' || data.status === 'expired') {
          await pool.query("UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'pending'", [order.id]);
          return res.json({ status: 'cancelled' });
        }
      }
    } catch (pollErr) {
      console.error('MonCash pay-status poll error:', pollErr.message);
    }

    res.json({ status: 'pending' });
  } catch (err) {
    console.error('Payment status check error:', err);
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
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
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

        // Decrement stock at payment time (not order creation) to prevent ghost inventory
        const orderItems = await client.query(
          'SELECT product_id, quantity FROM order_items WHERE order_id = $1',
          [reference]
        );
        for (const oi of orderItems.rows) {
          const stockCheck = await client.query(
            'SELECT stock FROM products WHERE id = $1 FOR UPDATE',
            [oi.product_id]
          );
          if (stockCheck.rows.length === 0 || stockCheck.rows[0].stock < oi.quantity) {
            // Insufficient stock — rollback payment, this order will be stuck in pending
            await client.query('ROLLBACK');
            console.error(`Order ${reference}: insufficient stock for product ${oi.product_id}, payment rolled back`);
            return res.status(200).json({ received: true, stock_issue: true });
          }
          await client.query('UPDATE products SET stock = stock - $1 WHERE id = $2', [oi.quantity, oi.product_id]);
          // Check if product sold out
          const stockRes = await client.query('SELECT stock, seller_id, name FROM products WHERE id = $1', [oi.product_id]);
          if (stockRes.rows.length > 0 && stockRes.rows[0].stock <= 0) {
            createNotification(stockRes.rows[0].seller_id, 'product_sold_out', 'Product Sold Out',
              `"${stockRes.rows[0].name}" is now out of stock.`, { productId: oi.product_id });
          }
        }

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

            // ESCROW: Hold funds — insert into order_escrow instead of crediting seller_balances
            await client.query(
              `INSERT INTO order_escrow (order_id, seller_id, gross_amount, commission_amount, net_amount, status)
               VALUES ($1, $2, $3, $4, $5, 'held')
               ON CONFLICT (order_id, seller_id) DO UPDATE SET
                 gross_amount = $3, commission_amount = $4, net_amount = $5, status = 'held'`,
              [reference, item.seller_id, grossAmount, commission, net]
            );

            // Log to platform_revenue for accounting (funds held, not yet distributed)
            await client.query(
              `INSERT INTO platform_revenue (order_id, seller_id, seller_tier, gross_amount, commission_rate, commission_amount, platform_fee, net_to_seller)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
              [reference, item.seller_id, sellerTier, grossAmount, rate, commission, commission, net]
            );

            console.log(`  Escrow: seller ${item.seller_id} (${sellerTier}): gross Rs ${grossAmount}, commission ${rate * 100}% = Rs ${commission}, net Rs ${net} — HELD`);
          }
        }
        await client.query('COMMIT');
        const sellerIds = items.rows.map(r => r.seller_id).filter(Boolean);
        for (const sid of sellerIds) {
          createNotification(sid, 'order_status', 'Payment Received', `Payment for order is held in escrow until exchange is confirmed`, { orderId: reference });
        }
        // Notify buyer that payment was successful
        const buyerOrder = await pool.query('SELECT buyer_id FROM orders WHERE id = $1', [reference]);
        if (buyerOrder.rows.length > 0) {
          const totalPaid = items.rows.reduce((sum, r) => sum + parseFloat(r.total), 0);
          createNotification(buyerOrder.rows[0].buyer_id, 'payment_confirmed', 'Payment Confirmed',
            `Your payment of Rs ${totalPaid.toFixed(0)} was successful.`, { orderId: reference });
        }
        console.log(`Order ${reference} paid, funds held in escrow`);
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }

      // Auto-payout platform commission to PLATFORM_PHONE
      // ESCROW: Commission payout DELAYED — will fire when escrow is released (meetup confirmed)
      // Previously this auto-payout fired immediately on payment, which meant platform
      // collected commission before the buyer even received their item.
      console.log(`Order ${reference}: commission payout deferred to escrow release`);
    } else if (event === 'payment.failed') {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // Stock was never decremented (decrement happens on payment.completed), so no restore needed
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
      // Notify buyer of payment failure
      const failedOrder = await pool.query('SELECT buyer_id FROM orders WHERE id = $1', [reference]);
      if (failedOrder.rows.length > 0) {
        createNotification(failedOrder.rows[0].buyer_id, 'payment_failed', 'Payment Failed',
          'Your payment could not be processed. The order has been cancelled. Please try again.', { orderId: reference });
      }
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
        // Notify seller of payout failure
        if (payout.rows.length > 0) {
          createNotification(payout.rows[0].seller_id, 'payout_failed', 'Payout Failed',
            `Your payout of Rs ${parseFloat(payout.rows[0].amount).toFixed(0)} could not be processed. The amount has been returned to your balance.`, { payoutId: reference });
        }
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
  // Email verification gate
  const evCheck = await pool.query('SELECT email_verified FROM users WHERE id = $1', [req.user.id]);
  if (!evCheck.rows[0]?.email_verified) {
    return res.status(403).json({ error: 'email_not_verified', message: 'Please verify your email to request payouts.' });
  }
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

// Dedicated sale lifecycle endpoint
app.post('/api/products/:id/sale', authRequired, sellerRequired, async (req, res) => {
  try {
    const check = await pool.query('SELECT seller_id, price FROM products WHERE id = $1', [req.params.id]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    if (check.rows[0].seller_id !== req.user.id) return res.status(403).json({ error: 'Not your product' });

    const { sale_price, sale_ends_at, clearSale } = req.body;

    if (clearSale) {
      const result = await pool.query(
        `UPDATE products SET sale_price = NULL, sale_starts_at = NULL, sale_ends_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`,
        [req.params.id]
      );
      return res.json({ product: result.rows[0] });
    }

    if (!sale_price || !sale_ends_at) {
      return res.status(400).json({ error: 'sale_price and sale_ends_at are required' });
    }

    const saleP = parseFloat(sale_price);
    const origP = parseFloat(check.rows[0].price);
    if (saleP >= origP) {
      return res.status(400).json({ error: 'Sale price must be lower than the original price' });
    }
    const discountPct = Math.round((1 - saleP / origP) * 100);
    if (discountPct > 25) {
      return res.status(400).json({ error: 'Maximum discount is 25%' });
    }
    if (new Date(sale_ends_at) <= new Date()) {
      return res.status(400).json({ error: 'Sale end date must be in the future' });
    }

    const result = await pool.query(
      `UPDATE products SET sale_price = $1, sale_starts_at = COALESCE($2, NOW()), sale_ends_at = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING *`,
      [saleP, req.body.sale_starts_at || null, sale_ends_at, req.params.id]
    );
    res.json({ product: result.rows[0] });
  } catch (err) {
    console.error('Sale update error:', err);
    res.status(500).json({ error: 'Server error' });
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
  const { idFrontUrl, idBackUrl, selfieUrl, deleteUrls, ocrResult, faceMatchScore } = req.body;
  if (!idFrontUrl || !idBackUrl || !selfieUrl) {
    return res.status(400).json({ error: 'CIN front, back, and selfie are required' });
  }

  async function deleteImgbbImage(deleteUrl) {
    if (!deleteUrl || !process.env.IMGBB_KEY) return;
    try {
      await fetch(deleteUrl, { method: 'DELETE', signal: AbortSignal.timeout(5000) });
    } catch { /* best effort — imgbb 24h expiry is fallback */ }
  }
  try {
    const existing = await pool.query(
      `SELECT id, status FROM verification_attempts WHERE user_id = $1 AND status = 'verified' ORDER BY created_at DESC LIMIT 1`,
      [req.user.id]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Already verified' });
    }

    let autoStatus = 'rejected';
    let rejectionReason = null;

    if (ocrResult && faceMatchScore) {
      const userRes = await pool.query('SELECT full_name FROM users WHERE id = $1', [req.user.id]);
      const userName = userRes.rows[0]?.full_name?.toLowerCase().trim();
      const nameMatch = ocrResult.fullName && ocrResult.fullName.trim().length >= 3 && !/^\d+$/.test(ocrResult.fullName.trim()) && ocrResult.fullName.toLowerCase().trim() === userName;
      const hasCinNumber = ocrResult.cinNumber && /^\d{8,12}$/.test(ocrResult.cinNumber);
      const hasDob = ocrResult.dateOfBirth && /^\d{2}[\/\-]\d{2}[\/\-]\d{4}$/.test(ocrResult.dateOfBirth);
      const hasPlaceOfBirth = ocrResult.placeOfBirth && ocrResult.placeOfBirth.trim().length >= 3 && !/^\d+$/.test(ocrResult.placeOfBirth.trim());
      const hasSex = ocrResult.sex && /^(M|F|MASCULIN|FÉMININ|MALE|FEMALE)$/i.test(ocrResult.sex);
      const faceOk = parseFloat(faceMatchScore) >= 0.5;

      if (nameMatch && hasCinNumber && hasDob && hasPlaceOfBirth && hasSex && faceOk) {
        autoStatus = 'verified';
      } else {
        const issues = [];
        if (!nameMatch) issues.push('Name on CIN does not match your profile name');
        if (!hasCinNumber) issues.push('CIN number not recognized');
        if (!hasDob) issues.push('Date of birth not found on card');
        if (!hasPlaceOfBirth) issues.push('Place of birth not found on card');
        if (!hasSex) issues.push('Sex not found on CIN back');
        if (!faceOk) issues.push('No face detected or face does not match');
        rejectionReason = issues.join('. ');
      }
    } else {
      rejectionReason = 'OCR data or face detection missing — please ensure all photos are clear';
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

      // Auto-cleanup: Delete images from imgbb + NULL out DB URLs
      await Promise.all([
        deleteImgbbImage(deleteUrls?.idFront),
        deleteImgbbImage(deleteUrls?.idBack),
        deleteImgbbImage(deleteUrls?.selfie),
      ]);
      await pool.query(
        `UPDATE verification_attempts SET id_front_url = NULL, id_back_url = NULL, selfie_url = NULL WHERE id = $1`,
        [result.rows[0].id]
      );
    } else {
      await pool.query(
        `UPDATE users SET id_submitted_at = CURRENT_TIMESTAMP, id_verification_result = 'rejected' WHERE id = $1`,
        [req.user.id]
      );
      createNotification(req.user.id, 'verification_rejected', 'Verification Not Approved',
        rejectionReason || 'Your identity verification was not approved. Please try again.', { attemptId: result.rows[0].id });
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
    if (!secret) {
      return res.status(500).json({ error: 'Webhook not configured' });
    }
    const hmac = crypto.createHmac('sha256', secret).update(req.rawBody || '').digest('hex');
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(hmac);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Idempotency check
    const eventId = req.body?.id || req.body?.data?.id;
    if (eventId) {
      const already = await pool.query('SELECT 1 FROM processed_events WHERE id = $1', [eventId]);
      if (already.rows.length > 0) {
        return res.json({ received: true, idempotent: true });
      }
    }

    const { event, data } = req.body;
    if (event === 'payment.completed' && data?.referenceId) {
      const orderId = data.referenceId;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const orderRes = await client.query('SELECT buyer_id FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
        if (orderRes.rows.length === 0) { await client.query('ROLLBACK'); return res.json({ received: true }); }
        const sellerId = orderRes.rows[0].buyer_id;

        const isSubscriptionOrder = orderId.startsWith('sub_');
        if (isSubscriptionOrder) {
          const now = new Date();
          const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

          const existing = await client.query(
            `SELECT id FROM seller_subscriptions WHERE seller_id = $1 AND status IN ('active', 'past_due') ORDER BY expires_at DESC LIMIT 1 FOR UPDATE`,
            [sellerId]
          );

          if (existing.rows.length > 0) {
            await client.query(
              `UPDATE seller_subscriptions SET status = 'active', expires_at = $2, last_payment_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
              [existing.rows[0].id, expiresAt]
            );
          } else {
            await client.query(
              `INSERT INTO seller_subscriptions (seller_id, status, started_at, expires_at, last_payment_at) VALUES ($1, 'active', CURRENT_TIMESTAMP, $2, CURRENT_TIMESTAMP)`,
              [sellerId, expiresAt]
            );
          }

          await client.query('UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', ['completed', orderId]);
          await client.query(
            `UPDATE users SET seller_tier = 'business', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND seller_tier != 'business'`,
            [sellerId]
          );
          createNotification(sellerId, 'subscription_activated', 'Business Subscription Active', `Your Business subscription is active until ${expiresAt.toLocaleDateString()}.`, {});
        }

        // Record event for idempotency — inside transaction
        if (eventId) {
          await client.query('INSERT INTO processed_events (id) VALUES ($1) ON CONFLICT DO NOTHING', [eventId]);
        }
        await client.query('COMMIT');
      } catch (txErr) {
        await client.query('ROLLBACK');
        console.error('Subscription webhook tx error:', txErr);
        throw txErr;
      } finally {
        client.release();
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

// ───── Feed Algorithm ─────

// Record a feed event (like, relevant, not_relevant, view, dwell)
app.post('/api/feed/event', authRequired, async (req, res) => {
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
      return res.status(429).json({ error: 'Too many actions. Please wait.' });
    }

    await pool.query(
      `INSERT INTO feed_events (user_id, product_id, event_type, duration_ms)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, product_id, event_type) DO UPDATE SET
         duration_ms = COALESCE($4, feed_events.duration_ms),
         created_at = CURRENT_TIMESTAMP`,
      [req.user.id, productId, eventType, durationMs || null]
    );
    res.json({ recorded: true });
  } catch (err) {
    console.error('Feed event error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

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

// ───── Cron: Auto-refund expired meetup check-ins (every 5 minutes) ─────
// If a meetup check-in happened but no QR scan within 90 minutes, auto-refund
cron.schedule('*/5 * * * *', async () => {
  try {
    const expiredCheckins = await pool.query(`
      SELECT DISTINCT mc.order_id
      FROM meetup_checkins mc
      JOIN orders o ON mc.order_id = o.id
      WHERE o.status = 'paid'
        AND o.delivery_method = 'meetup'
        AND mc.checked_in_at < NOW() - INTERVAL '90 minutes'
        AND NOT EXISTS (
          SELECT 1 FROM meetup_checkins mc2
          WHERE mc2.order_id = mc.order_id AND mc2.qr_scanned = true
        )
    `);

    for (const row of expiredCheckins.rows) {
      const orderId = row.order_id;
      console.log(`[CRON] Meetup expired for order ${orderId} — auto-refunding`);

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const orderResult = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
        if (orderResult.rows.length === 0 || orderResult.rows[0].status !== 'paid') {
          await client.query('ROLLBACK');
          continue;
        }
        const order = orderResult.rows[0];

        // Mark escrow as refunded
        const escrows = await client.query(
          "SELECT * FROM order_escrow WHERE order_id = $1 AND status = 'held' FOR UPDATE",
          [orderId]
        );
        for (const escrow of escrows.rows) {
          await client.query(
            "UPDATE order_escrow SET status = 'refunded', released_at = CURRENT_TIMESTAMP WHERE id = $1",
            [escrow.id]
          );
        }

        // Restore stock
        const items = await client.query('SELECT product_id, quantity FROM order_items WHERE order_id = $1', [orderId]);
        for (const item of items.rows) {
          await client.query('UPDATE products SET stock = stock + $1 WHERE id = $2', [item.quantity, item.product_id]);
        }

        // Cancel order
        await client.query("UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [orderId]);
        await logOrderEvent(orderId, 'status_change', null, 'paid', 'cancelled', 'Meetup expired — auto-refund', client);
        await client.query('COMMIT');

        // Send refund payout to buyer
        const buyerRes = await pool.query('SELECT phone FROM users WHERE id = $1', [order.buyer_id]);
        const buyerPhone = buyerRes.rows[0]?.phone;
        const totalRefund = escrows.rows.reduce((sum, e) => sum + parseFloat(e.gross_amount), 0);

        if (totalRefund > 0 && buyerPhone) {
          try {
            const payoutRes = await fetch(
              process.env.MONCASH_PAYOUT_CREATE_URL || 'https://hvlmeoqyxaguzcujpmit.supabase.co/functions/v1/external-payout-create',
              {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${process.env.MCC_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount: Math.round(totalRefund), receiver: buyerPhone, referenceId: `refund_${orderId}` }),
              }
            );
            if (payoutRes.ok) console.log(`[CRON] Refund Rs ${totalRefund} sent to buyer ${buyerPhone}`);
            else console.error(`[CRON] Refund payout failed: ${await payoutRes.text()}`);
          } catch (e) { console.error('[CRON] Refund payout error:', e.message); }
        }

        createNotification(order.buyer_id, 'order_status', 'Order Refunded',
          `Your meetup order has expired. Rs ${totalRefund.toFixed(0)} refunded.`, { orderId });

        // Notify sellers of the cancelled order
        const sellerNotify = await pool.query('SELECT DISTINCT seller_id FROM order_items WHERE order_id = $1', [orderId]);
        for (const row of sellerNotify.rows) {
          createNotification(row.seller_id, 'meetup_expired', 'Meetup Expired',
            `Your meetup for this order expired without exchange. The order has been cancelled.`, { orderId });
        }

      } catch (e) {
        await client.query('ROLLBACK');
        console.error(`[CRON] Error refunding order ${orderId}:`, e.message);
      } finally {
        client.release();
      }
    }
  } catch (err) {
    console.error('[CRON] Meetup timeout check error:', err.message);
  }
});

// ───── Global Error Handler ─────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message || err);
  res.status(500).json({ error: 'Internal server error' });
});

// ───── Graceful Shutdown ─────
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  try { await pool.end(); } catch {}
  process.exit(0);
});
process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  try { await pool.end(); } catch {}
  process.exit(0);
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
      console.log('Cron jobs active: meetup timeout auto-refund (every 5 min)');
    });
  });
}

export default app;
