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
import sharp from 'sharp';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { fileURLToPath } from 'url';
import path from 'path';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';

dotenv.config();

const { Pool } = pg;

// ───── Database: Supabase primary; Neon offline recovery backup ─────
// Production traffic never falls back to Neon. A stale backup must not accept
// orders, payments, or inventory writes after a primary connection failure.
const isTestMode = process.env.NODE_ENV === 'test';
const primaryDatabaseUrl = isTestMode ? process.env.DATABASE_URL : process.env.SUPABASE_DATABASE_URL;
const neonBackupDatabaseUrl = !isTestMode
  ? (process.env.NEON_BACKUP_DATABASE_URL || process.env.DATABASE_URL || null)
  : null;

if (!primaryDatabaseUrl) {
  throw new Error(isTestMode ? 'DATABASE_URL is required in test mode' : 'SUPABASE_DATABASE_URL is required in production');
}

const pool = new Pool({
  connectionString: primaryDatabaseUrl,
  max: isTestMode ? 5 : 15,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: isTestMode ? 5000 : 15000,
  ssl: primaryDatabaseUrl.includes('localhost') ? false : { rejectUnauthorized: false },
});

// ───── Supabase Storage (S3 protocol) ─────
const supabaseStorage = process.env.SUPABASE_S3_ACCESS_KEY ? new S3Client({
  region: 'ca-central-1',
  endpoint: process.env.SUPABASE_S3_ENDPOINT || 'https://bnnluaqrktnrnnfvmqbt.storage.supabase.co/storage/v1/s3',
  credentials: {
    accessKeyId: process.env.SUPABASE_S3_ACCESS_KEY,
    secretAccessKey: process.env.SUPABASE_S3_SECRET_KEY,
  },
  forcePathStyle: true,
}) : null;
const SUPABASE_STORAGE_BUCKET = 'product-images';
const SUPABASE_PUBLIC_BASE = process.env.SUPABASE_PUBLIC_BASE || 'https://bnnluaqrktnrnnfvmqbt.supabase.co/storage/v1/object/public/product-images';

// ───── Cloudflare R2 Storage (S3 protocol) ─────
const r2Storage = process.env.R2_ACCESS_KEY_ID ? new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT || 'https://cd681939aa37a65e42e73054b572746b.r2.cloudflarestorage.com',
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
}) : null;
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'maurmaket-images';
const R2_PUBLIC_BASE = process.env.R2_PUBLIC_BASE || 'https://pub-' + process.env.R2_ACCOUNT_ID + '.r2.dev';

pool.on('error', (err) => {
  console.error('Unexpected pool error:', err);
});
const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3001;
let server;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is required');
  process.exit(1);
}
const BCRYPT_ROUNDS = 10;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ───── Rate Limiters ─────
// In test mode: skip ALL rate limiting entirely to avoid CI flakiness
const testSkip = isTestMode ? (() => true) : undefined;
const generalLimiter = rateLimit({ windowMs: 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests, try again later' }, skip: testSkip || ((req) => req.path === '/health') });
const authLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many login attempts, try again later' }, skip: testSkip });
const paymentLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many payment requests, try again later' }, skip: testSkip });
const uploadLimiter = rateLimit({ windowMs: 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many uploads, try again later' }, skip: testSkip });
const msgLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many messages, try again later' }, skip: testSkip });
const convLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many conversations, try again later' }, skip: testSkip });
const verifyLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many verification attempts — try again in 15 minutes' }, skip: testSkip });

// ───── Email Transporter (Gmail API over HTTPS — native https, no extra packages) ─────
import https from 'https';

const gmailClientId = process.env.GMAIL_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID;
const gmailClientSecret = process.env.GMAIL_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
const gmailRefreshToken = process.env.GMAIL_REFRESH_TOKEN;
const gmailSenderEmail = process.env.SMTP_USER || 'maurinexus.contact@gmail.com';

let gmailConfigured = false;
if (gmailClientId && gmailClientSecret && gmailRefreshToken) {
  gmailConfigured = true;
  console.log('[Email] Gmail API (HTTPS) configured — native https module');
} else {
  console.warn('[Email] Gmail API not configured — set GMAIL_CLIENT_ID + GMAIL_CLIENT_SECRET + GMAIL_REFRESH_TOKEN');
}

// Fallback: nodemailer SMTP (for local dev only — blocked on Render free tier)
const emailTransporter = process.env.SMTP_HOST && !gmailConfigured ? nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: parseInt(process.env.SMTP_PORT || '587', 10) === 465,
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS?.replace(/\s/g, ''),
  },
}) : null;

// Native HTTPS helper: get a fresh OAuth2 access token from Google
async function getGmailAccessToken() {
  const postData = new URLSearchParams({
    client_id: gmailClientId,
    client_secret: gmailClientSecret,
    refresh_token: gmailRefreshToken,
    grant_type: 'refresh_token',
  }).toString();

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'oauth2.googleapis.com',
      path: '/token',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(postData) },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.access_token) resolve(parsed.access_token);
          else reject(new Error('No access_token: ' + data));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// Native HTTPS helper: send email via Gmail API
async function sendViaGmailApi(toEmail, subject, htmlBody) {
  const accessToken = await getGmailAccessToken();
  const rawMessage = [
    `To: ${toEmail}`,
    `From: "MaurMaket" <${gmailSenderEmail}>`,
    `Subject: ${subject}`,
    'Content-Type: text/html; charset=utf-8',
    '',
    htmlBody,
  ].join('\r\n');

  const encodedMessage = Buffer.from(rawMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const postData = JSON.stringify({ raw: encodedMessage });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'gmail.googleapis.com',
      path: '/gmail/v1/users/me/messages/send',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(JSON.parse(data));
        else reject(new Error(`Gmail API ${res.statusCode}: ${data}`));
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

const PRODUCTION_URL = process.env.PRODUCTION_URL || 'https://maurmaket.onrender.com';

async function runMigrations() {
  const c = await pool.connect();
  let stepNum = 0;
  const failed = [];
  // Each migration step is isolated: failure in one does NOT prevent the rest from running.
  const step = async (name, fn) => {
    stepNum++;
    try {
      await fn();
    } catch (e) {
      // Skip benign "already exists" errors (42710=duplicate_object, 42P07=duplicate_table, 42P16=duplicate_constraint)
      if (['42710', '42P07', '42P16'].includes(e.code)) return;
      console.error(`[MIGRATION] Step ${stepNum} (${name}) failed:`, e.message);
      failed.push(name);
    }
  };
  try {
    // 1. Base tables
    await step('Base tables', () => c.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        full_name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT,
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
        username VARCHAR(30) UNIQUE,
        show_real_name BOOLEAN DEFAULT false,
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
        meetup_started_at TIMESTAMP,
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
    `));

    // 2. Orders meetup columns
    await step('Orders meetup columns', () => c.query(`
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS meetup_lat DECIMAL(10,7);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS meetup_lng DECIMAL(10,7);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS meetup_address TEXT;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS meetup_note TEXT;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS meetup_confirmed BOOLEAN DEFAULT false;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS meetup_proposed_by UUID REFERENCES users(id);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS meetup_started_at TIMESTAMP;
    `));

    // 3. Drop legacy orders status check
    await step('Drop orders status check', () => c.query(`ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;`));

    // 4. Orders delivery columns
    await step('Orders delivery columns', () => c.query(`
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_method VARCHAR(20) DEFAULT 'meetup';
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_name TEXT;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_phone TEXT;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_address TEXT;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_city TEXT;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_note TEXT;
    `));

    // 5. Order events table
    await step('order_events table', () => c.query(`
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
    `));

    // 6. Saved addresses table
    await step('saved_addresses table', () => c.query(`
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
    `));

    // 7. Reviews table
    await step('reviews table', () => c.query(`
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
    `));

    // 8. Reviews ALTER TABLE + buyer_id backfill
    await step('Reviews ALTER TABLE', () => c.query(`
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
    `));

    // 9. Wishlists table
    await step('wishlists table', () => c.query(`
      CREATE TABLE IF NOT EXISTS wishlists (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
        product_id UUID REFERENCES products(id) ON DELETE CASCADE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, product_id)
      );
    `));

    // 10. Follows table
    await step('follows table', () => c.query(`
      CREATE TABLE IF NOT EXISTS follows (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        follower_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
        seller_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(follower_id, seller_id)
      );
    `));

    // 11. Notifications table
    await step('notifications table', () => c.query(`
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
    `));

    // 12. Conversations table
    await step('conversations table', () => c.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID REFERENCES orders(id),
        product_id UUID REFERENCES products(id),
        buyer_id UUID REFERENCES users(id) NOT NULL,
        seller_id UUID REFERENCES users(id) NOT NULL,
        last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `));

    // 13. Messages table
    await step('messages table', () => c.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID REFERENCES conversations(id) NOT NULL,
        sender_id UUID REFERENCES users(id) NOT NULL,
        content TEXT NOT NULL,
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `));

    // 14. Promo codes table
    await step('promo_codes table', () => c.query(`
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
    `));

    // 15. Promo uses table
    await step('promo_uses table', () => c.query(`
      CREATE TABLE IF NOT EXISTS promo_uses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        promo_id UUID REFERENCES promo_codes(id) NOT NULL,
        user_id UUID REFERENCES users(id) NOT NULL,
        order_id UUID REFERENCES orders(id) NOT NULL,
        discount_amount DECIMAL(10,2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(promo_id, user_id)
      );
    `));

    // 16. Disputes table
    await step('disputes table', () => c.query(`
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
    `));

    // 17. Platform revenue table
    await step('platform_revenue table', () => c.query(`
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
    `));

    // 18. Platform payouts table
    await step('platform_payouts table', () => c.query(`
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
    `));

    await step('refund_payouts table', () => c.query(`
      CREATE TABLE IF NOT EXISTS refund_payouts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
        buyer_id UUID NOT NULL REFERENCES users(id),
        amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
        receiver_phone VARCHAR(20) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed')),
        moncash_reference VARCHAR(150) UNIQUE,
        error_message TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `));

    // 19. Users onboarding columns
    await step('Users onboarding columns', () => c.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS store_name TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS store_logo_url TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS seller_tier VARCHAR(20) DEFAULT 'none';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS id_document_url TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS id_verified BOOLEAN DEFAULT false;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS id_submitted_at TIMESTAMP;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS id_verified_at TIMESTAMP;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS use_store_identity BOOLEAN DEFAULT false;
    `));

    // 20. Verification & subscription tables
    await step('Verification & subscription tables', () => c.query(`
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
    `));

    // 21. Backfill id_verification_result from legacy boolean
    await step('Backfill id_verification_result', () => c.query(`
      UPDATE users SET id_verification_result = 'verified' WHERE id_verified = true AND id_verification_result IS NULL;
      UPDATE users SET id_verification_result = 'pending' WHERE id_submitted_at IS NOT NULL AND id_verified = false AND id_verification_result IS NULL;
    `));

    // 22. Escrow table
    await step('order_escrow table', () => c.query(`
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
    `));

    // 23. Meetup checkins + feed events + seller locations
    await step('Meetup/feed/location tables', () => c.query(`
      CREATE TABLE IF NOT EXISTS meetup_checkins (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
        user_id UUID REFERENCES users(id) NOT NULL,
        role VARCHAR(10) NOT NULL CHECK (role IN ('buyer', 'seller')),
        lat DECIMAL(10,7),
        lng DECIMAL(10,7),
        checked_in_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        qr_token TEXT,
        qr_scanned BOOLEAN DEFAULT false,
        UNIQUE(order_id, user_id)
      );
      ALTER TABLE meetup_checkins ADD COLUMN IF NOT EXISTS meetup_code TEXT;
      ALTER TABLE meetup_checkins ADD COLUMN IF NOT EXISTS meetup_code_expires_at TIMESTAMPTZ;
      ALTER TABLE meetup_checkins ADD COLUMN IF NOT EXISTS meetup_code_attempts INTEGER NOT NULL DEFAULT 0;
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
        is_visible BOOLEAN DEFAULT true,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `));

    // 24. seller_locations is_visible (already in CREATE above, kept for idempotency)
    await step('seller_locations is_visible', () => c.query(`ALTER TABLE seller_locations ADD COLUMN IF NOT EXISTS is_visible BOOLEAN DEFAULT true;`));

    // 25. Sale price columns
    await step('Sale price columns', () => c.query(`
      ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_price DECIMAL(10,2);
      ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_starts_at TIMESTAMP;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_ends_at TIMESTAMP;
    `));

    // 26. Email verification + Google Sign-In + OTP
    await step('Email verification + Google', () => c.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT UNIQUE;
      CREATE TABLE IF NOT EXISTS otp_codes (
        email TEXT PRIMARY KEY,
        code TEXT NOT NULL,
        purpose TEXT NOT NULL DEFAULT 'verify',
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
      ALTER TABLE otp_codes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
    `));

    // 27. User location fields
    await step('User location fields', () => c.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS location_address TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS location_city TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS location_lat DECIMAL(10,7);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS location_lng DECIMAL(10,7);
    `));

    // 28. Push token column
    await step('Push token column', () => c.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS push_token TEXT;`));

    // 29. Username column
    await step('Username column', () => c.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(30);`));
    await step('Username constraints', () => c.query(`
      ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_check;
      ALTER TABLE users ADD CONSTRAINT users_username_check CHECK (username ~ '^[a-z0-9][a-z0-9._]{0,28}[a-z0-9]$' OR username ~ '^[a-z0-9]$');
      ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_key;
      ALTER TABLE users ADD CONSTRAINT users_username_key UNIQUE (username);
    `));

    // 30. show_real_name column
    await step('show_real_name column', () => c.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS show_real_name BOOLEAN DEFAULT false;`));

    // 31. Backfill usernames for existing users
    await step('Username backfill', async () => {
      const unamed = await c.query(`SELECT id, full_name FROM users WHERE username IS NULL`);
      if (unamed.rows.length > 0) {
        console.log(`[MIGRATION] Backfilling usernames for ${unamed.rows.length} users...`);
        let filled = 0;
        for (const row of unamed.rows) {
          try {
            const username = await generateUsername(row.full_name, c);
            await c.query(`UPDATE users SET username = $1 WHERE id = $2`, [username, row.id]);
            filled++;
          } catch (e) {
            console.error(`[MIGRATION] Failed to assign username to user ${row.id}:`, e.message);
          }
        }
        console.log(`[MIGRATION] Backfilled ${filled}/${unamed.rows.length} usernames`);
      }
    });

    // 32. Username unique constraint
    await step('Username unique constraint', async () => {
      try {
        await c.query(`ALTER TABLE users ADD CONSTRAINT users_username_unique UNIQUE (username);`);
      } catch (e) {
        if (e.code !== '42710') throw e; // 42710 = duplicate object, already handled by step()
      }
    });

    // 33. Message media columns
    await step('Message media columns', () => c.query(`
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_type VARCHAR(20) DEFAULT 'text';
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS image_url TEXT;
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS image_width INTEGER;
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS image_height INTEGER;
    `));

    // 34. Allow NULL content for image messages
    await step('Messages content nullable', () => c.query(`ALTER TABLE messages ALTER COLUMN content DROP NOT NULL;`));

    // 35. message_offers table
    await step('message_offers table', () => c.query(`
      CREATE TABLE IF NOT EXISTS message_offers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        message_id UUID REFERENCES messages(id) ON DELETE CASCADE NOT NULL,
        conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
        product_id UUID REFERENCES products(id) NOT NULL,
        buyer_id UUID REFERENCES users(id) NOT NULL,
        seller_id UUID REFERENCES users(id) NOT NULL,
        offered_price DECIMAL(10,2) NOT NULL CHECK (offered_price > 0),
        list_price DECIMAL(10,2) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'redeemed')),
        expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '48 hours'),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        responded_at TIMESTAMP
      );
    `));

    // 36. negotiation_round column
    await step('negotiation_round column', () => c.query(`ALTER TABLE message_offers ADD COLUMN IF NOT EXISTS negotiation_round INTEGER DEFAULT 1;`));

    // 37. message_offers CHECK constraint update (drop old, add with 'countered')
    await step('message_offers CHECK constraint', () => c.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'message_offers_status_check' AND conrelid = 'message_offers'::regclass) THEN
          ALTER TABLE message_offers DROP CONSTRAINT message_offers_status_check;
        END IF;
      END$$;
    `));
    await step('message_offers CHECK constraint (re-add)', () => c.query(`
      ALTER TABLE message_offers ADD CONSTRAINT message_offers_status_check
        CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'redeemed', 'countered'));
    `));

    // 38. Performance indexes
    await step('Performance indexes', () => c.query(`
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
      CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at ASC);
      CREATE INDEX IF NOT EXISTS idx_messages_conversation_unread ON messages(conversation_id, is_read, sender_id);
      CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);
      CREATE INDEX IF NOT EXISTS idx_conversations_buyer_id ON conversations(buyer_id);
      CREATE INDEX IF NOT EXISTS idx_conversations_seller_id ON conversations(seller_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_order_pair
        ON conversations (order_id, LEAST(buyer_id, seller_id), GREATEST(buyer_id, seller_id))
        WHERE order_id IS NOT NULL;
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
      CREATE INDEX IF NOT EXISTS idx_message_offers_conversation ON message_offers(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_message_offers_buyer_product ON message_offers(buyer_id, product_id, status);
      CREATE INDEX IF NOT EXISTS idx_message_offers_status_expires ON message_offers(status, expires_at);
    `));

    await step('Didit usage + webhook tables', () => c.query(`
      CREATE TABLE IF NOT EXISTS didit_usage (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        month_year VARCHAR(7) NOT NULL,
        count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(month_year)
      );
      CREATE TABLE IF NOT EXISTS didit_webhook_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id VARCHAR(100) UNIQUE NOT NULL,
        session_id VARCHAR(100),
        webhook_type VARCHAR(50),
        status VARCHAR(30),
        vendor_data TEXT,
        received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `));

    // 39. Make password_hash nullable for Google OAuth users
    await step('password_hash nullable', () => c.query(`ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;`));

    // 40. Date of birth column for age gate (18+)
    await step('date_of_birth column', () => c.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth DATE;`));

    // 41. Pending DOB flag for Google OAuth users
    await step('pending_dob column', () => c.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_dob BOOLEAN DEFAULT false;`));

    // 42. Partial unique index: only one 'processing' payout per seller at a time (MCC constraint)
    await step('payouts processing unique index', () => c.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_payouts_one_processing_per_seller
      ON payouts (seller_id) WHERE status = 'processing';
    `));

    // 43. Feed taste onboarding and category-level recommendation signals.
    // Existing accounts are opted out by default; newly-created accounts opt in below.
    await step('Feed preferences', () => c.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS taste_onboarding_completed BOOLEAN DEFAULT true;
      CREATE TABLE IF NOT EXISTS user_category_affinities (
        user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
        category_id UUID REFERENCES categories(id) ON DELETE CASCADE NOT NULL,
        score REAL NOT NULL DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, category_id)
      );
      CREATE INDEX IF NOT EXISTS idx_user_category_affinities_user ON user_category_affinities(user_id, score DESC);
      CREATE TABLE IF NOT EXISTS product_cooccurrences (
        product_a_id UUID REFERENCES products(id) ON DELETE CASCADE NOT NULL,
        product_b_id UUID REFERENCES products(id) ON DELETE CASCADE NOT NULL,
        purchase_count INTEGER NOT NULL DEFAULT 1,
        last_purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (product_a_id, product_b_id),
        CHECK (product_a_id < product_b_id)
      );
      CREATE INDEX IF NOT EXISTS idx_product_cooccurrences_a ON product_cooccurrences(product_a_id, purchase_count DESC);
      CREATE INDEX IF NOT EXISTS idx_product_cooccurrences_b ON product_cooccurrences(product_b_id, purchase_count DESC);
    `));

    // ── Thumbnail URL column ──
    await step('Thumbnail URL column', () => c.query(`ALTER TABLE product_images ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;`));

    // ── NatCash phone number separation ──
    await step('NatCash phone separation', () => c.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS natcash_phone VARCHAR(20);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS accepted_payment_methods TEXT[] DEFAULT ARRAY['moncash'];
    `));

    if (failed.length > 0) {
      console.log(`[MIGRATION] Complete with ${failed.length} failure(s): ${failed.join(', ')}`);
    } else {
      console.log(`[MIGRATION] Complete — all ${stepNum} steps passed`);
    }
  } finally {
    c.release();
  }
}

async function cleanupOldNotifications() {
  try {
    const result = await Promise.race([
      pool.query("DELETE FROM notifications WHERE is_read = true AND created_at < NOW() - INTERVAL '7 days'"),
      new Promise((_, re) => setTimeout(() => re(new Error('Notification cleanup timeout')), 15000))
    ]);
    if (result.rowCount > 0) console.log(`[CRON] Cleaned up ${result.rowCount} old read notifications`);
  } catch (err) {
    console.error('[CRON] Notification cleanup error:', err.message);
  }
}


// ───── One-time migration: Supabase Storage → R2 ─────
app.post('/api/admin/migrate-to-r2', express.json({ limit: '1mb' }), async (req, res) => {
  const { GetObjectCommand } = await import('@aws-sdk/client-s3');
  const MIGRATE_SECRET = 'migrate-r2-2026';
  if (req.body.secret !== MIGRATE_SECRET) {
    return res.status(403).json({ error: 'Invalid secret' });
  }
  if (!r2Storage) {
    return res.status(503).json({ error: 'R2 not configured' });
  }

  try {
    const { rows } = await pool.query(
      "SELECT id, image_url, thumbnail_url FROM product_images WHERE image_url LIKE '%supabase.co%' ORDER BY id LIMIT 50"
    );

    if (rows.length === 0) {
      return res.json({ message: 'No images to migrate', migrated: 0, skipped: 0, failed: 0 });
    }

    let migrated = 0, skipped = 0, failed = 0;
    const results = [];

    for (const row of rows) {
      try {
        // Extract S3 key from Supabase URL
        const key = row.image_url.split('/object/public/' + SUPABASE_STORAGE_BUCKET + '/')[1];
        if (!key) { failed++; continue; }

        // Check if already on R2
        try {
          const { HeadObjectCommand } = await import('@aws-sdk/client-s3');
          await r2Storage.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
          const newUrl = R2_PUBLIC_BASE + '/' + key;
          const newThumbUrl = row.thumbnail_url?.includes('supabase.co')
            ? R2_PUBLIC_BASE + '/' + row.thumbnail_url.split('/object/public/' + SUPABASE_STORAGE_BUCKET + '/')[1]
            : row.thumbnail_url;
          await pool.query('UPDATE product_images SET image_url = , thumbnail_url =  WHERE id = ', [newUrl, newThumbUrl, row.id]);
          skipped++;
          continue;
        } catch { /* not on R2 yet */ }

        // Download from Supabase
        const getCmd = new GetObjectCommand({ Bucket: SUPABASE_STORAGE_BUCKET, Key: key });
        const response = await supabaseStorage.send(getCmd);
        const chunks = [];
        for await (const chunk of response.Body) chunks.push(chunk);
        const buffer = Buffer.concat(chunks);

        // Upload to R2
        const { PutObjectCommand } = await import('@aws-sdk/client-s3');
        await r2Storage.send(new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: key,
          Body: buffer,
          ContentType: 'image/' + (key.split('.').pop() === 'jpg' ? 'jpeg' : key.split('.').pop()),
        }));

        const newUrl = R2_PUBLIC_BASE + '/' + key;
        let newThumbUrl = row.thumbnail_url;
        if (row.thumbnail_url?.includes('supabase.co')) {
          const thumbKey = row.thumbnail_url.split('/object/public/' + SUPABASE_STORAGE_BUCKET + '/')[1];
          if (thumbKey) {
            const thumbGet = new GetObjectCommand({ Bucket: SUPABASE_STORAGE_BUCKET, Key: thumbKey });
            const thumbResp = await supabaseStorage.send(thumbGet);
            const thumbChunks = [];
            for await (const chunk of thumbResp.Body) thumbChunks.push(chunk);
            const thumbBuffer = Buffer.concat(thumbChunks);
            await r2Storage.send(new PutObjectCommand({
              Bucket: R2_BUCKET,
              Key: thumbKey,
              Body: thumbBuffer,
              ContentType: 'image/webp',
            }));
            newThumbUrl = R2_PUBLIC_BASE + '/' + thumbKey;
          }
        }

        await pool.query('UPDATE product_images SET image_url = , thumbnail_url =  WHERE id = ', [newUrl, newThumbUrl, row.id]);
        migrated++;
        results.push({ id: row.id.slice(0, 8), size: (buffer.length / 1024).toFixed(1) + 'KB' });
      } catch (err) {
        failed++;
        results.push({ id: row.id.slice(0, 8), error: err.message });
      }
    }

    res.json({ migrated, skipped, failed, total: rows.length, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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

// Upload config — no secrets exposed
app.get('/api/upload/config', (req, res) => {
  res.json({ hasR2: !!r2Storage, hasSupabaseStorage: !!supabaseStorage, hasImgbb: !!process.env.IMGBB_KEY });
});

// Upload image — Supabase Storage primary, imgBB fallback
app.post('/api/upload', authRequired, express.json({ limit: '10mb' }), async (req, res) => {
  try {
    const { image, expiration } = req.body;
    if (!image) return res.status(400).json({ error: 'No image data' });

    // Decode base64 to buffer
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const ext = (image.match(/^data:image\/(\w+);/)?.[1] || 'jpg').replace('jpeg', 'jpg');
    const contentType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
    const key = `${req.user.id}/${crypto.randomUUID()}.${ext}`;

    // 1. Try Cloudflare R2 first (faster CDN), then Supabase Storage
    const activeStorage = r2Storage || supabaseStorage;
    const activeBucket = r2Storage ? R2_BUCKET : SUPABASE_STORAGE_BUCKET;
    const activePublicBase = r2Storage ? R2_PUBLIC_BASE : SUPABASE_PUBLIC_BASE;
    const storageName = r2Storage ? 'R2' : 'Supabase';

    if (activeStorage) {
      try {
        // Upload full-size image
        await activeStorage.send(new PutObjectCommand({
          Bucket: activeBucket,
          Key: key,
          Body: buffer,
          ContentType: contentType,
        }));
        const url = `${activePublicBase}/${key}`;

        // Generate thumbnail (400px wide) for faster grid loading
        let thumbnailUrl = null;
        try {
          const thumbKey = key.replace(/\.(\w+)$/, '_thumb.$1');
          const thumbBuffer = await sharp(buffer)
            .resize({ width: 400, withoutEnlargement: true })
            .webp({ quality: 80 })
            .toBuffer();
          await activeStorage.send(new PutObjectCommand({
            Bucket: activeBucket,
            Key: thumbKey,
            Body: thumbBuffer,
            ContentType: 'image/webp',
          }));
          thumbnailUrl = `${activePublicBase}/${thumbKey}`;
        } catch (thumbErr) {
          console.warn('[UPLOAD] Thumbnail generation failed:', thumbErr.message);
        }

        return res.json({ url, thumbnailUrl, deleteUrl: `${storageName.toLowerCase()}:${key}`, provider: storageName.toLowerCase() });
      } catch (s3Err) {
        console.warn(`[UPLOAD] ${storageName} failed, falling back to imgBB:`, s3Err.message);
      }
    }

    // 2. Fallback to imgBB
    if (!process.env.IMGBB_KEY) {
      return res.status(503).json({ error: 'No upload provider available' });
    }
    const form = new URLSearchParams();
    form.append('key', process.env.IMGBB_KEY);
    form.append('image', base64Data);
    if (expiration && expiration > 0) form.append('expiration', String(expiration));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    const imgbbRes = await fetch('https://api.imgbb.com/1/upload', {
      method: 'POST',
      body: form,
      signal: controller.signal,
    });
    clearTimeout(timer);
    const imgbbData = await imgbbRes.json();
    if (!imgbbData.success) {
      return res.status(502).json({ error: imgbbData.error?.message || 'imgBB upload failed' });
    }
    return res.json({ url: imgbbData.data.url, deleteUrl: imgbbData.data.delete_url, provider: 'imgbb' });
  } catch (err) {
    console.error('[UPLOAD] Error:', err.message);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Delete image — handles both Supabase and imgBB
app.delete('/api/upload', authRequired, async (req, res) => {
  try {
    const { url, deleteUrl } = req.body;
    const target = deleteUrl || url;
    if (!target) return res.status(400).json({ error: 'No URL provided' });

    // Supabase/R2 Storage delete
    if (target.startsWith('supabase:') || target.startsWith('r2:')) {
      const storage = r2Storage || supabaseStorage;
      const bucket = r2Storage ? R2_BUCKET : SUPABASE_STORAGE_BUCKET;
      if (!storage) return res.status(503).json({ error: 'No storage configured' });
      const key = target.replace(/^(supabase|r2):/, '');
      await storage.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      return res.json({ deleted: true, provider: r2Storage ? 'r2' : 'supabase' });
    }

    // imgBB delete
    if (target.includes('imgbb.com') || target.includes('i.ibb.co')) {
      if (!process.env.IMGBB_KEY) return res.status(503).json({ error: 'imgBB not configured' });
      const deleteUrlFull = target.includes('delete') ? target : null;
      if (deleteUrlFull) {
        await fetch(`${deleteUrlFull}?key=${process.env.IMGBB_KEY}`);
      }
      return res.json({ deleted: true, provider: 'imgbb' });
    }

    res.status(400).json({ error: 'Unknown URL provider' });
  } catch (err) {
    console.error('[DELETE UPLOAD] Error:', err.message);
    res.status(500).json({ error: 'Delete failed' });
  }
});
app.use('/api', generalLimiter);
app.use(express.json({
  limit: '1mb',
  verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8'); },
}));

// Force UTF-8 charset on all JSON responses so accented characters render correctly
app.use((_req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = function (data) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return originalJson(data);
  };
  next();
});

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

// Username generation helper (Instagram-style: 1-30 chars, lowercase, letters/digits/underscores/periods)
async function generateUsername(fullName, db) {
  const exec = db || pool;
  const base = (fullName || 'user').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^(\d)/, '_$1').slice(0, 20) || 'user';
  let username = base + '_' + Math.floor(1000 + Math.random() * 9000);
  let attempts = 0;
  while (attempts < 20) {
    // Enforce Instagram rules: lowercase, 1-30 chars, no period at start/end, no double periods
    if (username.length <= 30 && !username.startsWith('.') && !username.endsWith('.') && !username.includes('..')) {
      const existing = await exec.query(`SELECT 1 FROM users WHERE username = $1`, [username]);
      if (existing.rows.length === 0) return username;
    }
    username = base + '_' + Math.floor(1000 + Math.random() * 9000);
    attempts++;
  }
  return username.slice(0, 30);
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
    const payload = {
      to: token,
      title,
      body: body || '',
      data: data || {},
      sound: 'default',
      badge: 1,
    };
    // Look up rich image for push notification based on type
    try {
      if (data?.type === 'new_message' && data.senderId) {
        const avatarRes = await pool.query('SELECT avatar_url FROM users WHERE id = $1', [data.senderId]);
        if (avatarRes.rows[0]?.avatar_url) {
          payload.icon = avatarRes.rows[0].avatar_url;
        }
      } else if (data?.type === 'new_product_from_followed' && data.productId) {
        const imgRes = await pool.query('SELECT image_url FROM product_images WHERE product_id = $1 AND is_primary = true LIMIT 1', [data.productId]);
        if (imgRes.rows[0]?.image_url) {
          payload.icon = imgRes.rows[0].image_url;
        }
      } else if (data?.orderId && ['order_status', 'payment_confirmed', 'payment_failed', 'order_cancelled', 'review_received', 'meetup_proposed', 'meetup_confirmed', 'meetup_expired'].includes(data.type)) {
        const imgRes = await pool.query(
          `SELECT pi.image_url FROM product_images pi
           JOIN order_items oi ON oi.product_id = pi.product_id
           WHERE oi.order_id = $1 AND pi.is_primary = true
           LIMIT 1`, [data.orderId]
        );
        if (imgRes.rows[0]?.image_url) {
          payload.icon = imgRes.rows[0].image_url;
        }
      }
    } catch (imgErr) {
      // Image lookup is best-effort — don't block the notification
    }
    await expo.sendPushNotificationsAsync([payload]);
  } catch (err) {
    console.error('Push notification failed:', err.message);
  }
}

// Age verification helper — returns true if date of birth implies age >= 18
function isAtLeast18(dateOfBirth) {
  const dob = new Date(dateOfBirth);
  if (isNaN(dob.getTime())) return false;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age >= 18;
}

// Commission rate by seller tier
function getCommissionRate(tier) {
  switch (tier) {
    case 'business': return 0.03;
    case 'verified': return 0.05;
    case 'casual': return 0.08;
    default: return 0.08;
  }
}

// Allocate the amount actually paid across sellers. Promo discounts are applied
// proportionally so escrow and commission never exceed the order total.
async function getSellerPaymentAllocations(client, orderId) {
  const result = await client.query(
    `SELECT o.total_amount,
            oi.seller_id,
            SUM(oi.price * oi.quantity) AS line_total
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     WHERE o.id = $1
     GROUP BY o.total_amount, oi.seller_id
     ORDER BY oi.seller_id`,
    [orderId]
  );
  const subtotal = result.rows.reduce((sum, row) => sum + parseFloat(row.line_total), 0);
  const paidTotal = parseFloat(result.rows[0]?.total_amount || 0);
  if (subtotal <= 0 || paidTotal < 0) return [];

  let allocated = 0;
  return result.rows.map((row, index) => {
    const lineTotal = parseFloat(row.line_total);
    const paidTotalForSeller = index === result.rows.length - 1
      ? Math.max(0, Math.round((paidTotal - allocated) * 100) / 100)
      : Math.round((paidTotal * lineTotal / subtotal) * 100) / 100;
    allocated += paidTotalForSeller;
    return { seller_id: row.seller_id, total: lineTotal, paid_total: paidTotalForSeller };
  });
}

async function reserveOrderStock(client, orderId) {
  const orderItems = await client.query(
    'SELECT product_id, quantity FROM order_items WHERE order_id = $1',
    [orderId]
  );
  for (const item of orderItems.rows) {
    const product = await client.query(
      'SELECT stock FROM products WHERE id = $1 FOR UPDATE',
      [item.product_id]
    );
    if (product.rows.length === 0 || product.rows[0].stock < item.quantity) {
      const error = new Error(`Insufficient stock for product ${item.product_id}`);
      error.code = 'INSUFFICIENT_STOCK';
      throw error;
    }
  }
  for (const item of orderItems.rows) {
    await client.query(
      'UPDATE products SET stock = stock - $1 WHERE id = $2',
      [item.quantity, item.product_id]
    );
  }
  return orderItems.rows;
}

async function processRefundPayout(orderId) {
  const claim = await pool.query(
    `UPDATE refund_payouts
     SET status = 'processing', attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP
     WHERE order_id = $1 AND status IN ('pending', 'failed')
       AND next_attempt_at <= CURRENT_TIMESTAMP
     RETURNING *`,
    [orderId]
  );
  if (claim.rows.length === 0) return;
  const refund = claim.rows[0];
  const referenceId = refund.moncash_reference || `refund_${orderId}`;
  try {
    const payoutRes = await fetch(
      process.env.MONCASH_PAYOUT_CREATE_URL || 'https://hvlmeoqyxaguzcujpmit.supabase.co/functions/v1/payout-create',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.MCC_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: Math.round(parseFloat(refund.amount)),
          moncashNumber: refund.receiver_phone,
          referenceId,
        }),
        signal: AbortSignal.timeout(15000),
      }
    );
    if (!payoutRes.ok) throw new Error(await payoutRes.text());
    const payoutData = await payoutRes.json().catch(() => ({}));
    await pool.query(
      `UPDATE refund_payouts
       SET status = 'completed', moncash_reference = COALESCE(moncash_reference, $2),
           error_message = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [refund.id, payoutData.reference || payoutData.transactionId || referenceId]
    );
    createNotification(refund.buyer_id, 'order_status', 'Order Refunded',
      `G ${parseFloat(refund.amount).toFixed(0)} refunded for order`, { orderId });
  } catch (error) {
    const retryMinutes = Math.min(60, 5 * (2 ** Math.min(refund.attempts, 4)));
    await pool.query(
      `UPDATE refund_payouts SET status = 'failed', error_message = $2,
         next_attempt_at = CURRENT_TIMESTAMP + ($3 * INTERVAL '1 minute'),
         updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [refund.id, error.message, retryMinutes]
    );
    console.error(`[REFUND] Payout pending for order ${orderId}:`, error.message);
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
async function authRequired(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET);
    // Re-check identity against the DB on every request rather than trusting
    // the JWT's embedded role/email. This closes the gap where a deleted or
    // role-changed account could keep acting on a still-valid 7-day token.
    const result = await pool.query('SELECT id, email, role FROM users WHERE id = $1', [payload.id]);
    if (result.rows.length === 0 || result.rows[0].role === 'deleted') {
      return res.status(401).json({ error: 'Account no longer active' });
    }
    req.user = { id: result.rows[0].id, email: result.rows[0].email, role: result.rows[0].role };
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

// Verified seller required — casual sellers can buy but not list products
async function verifiedSellerRequired(req, res, next) {
  if (req.user.role !== 'seller') {
    return res.status(403).json({ error: 'Seller access required' });
  }
  try {
    const result = await pool.query('SELECT seller_tier FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'User not found' });
    const tier = result.rows[0].seller_tier;
    if (tier === 'casual' || tier === 'none') {
      return res.status(403).json({
        error: 'Verification required',
        code: 'VERIFICATION_REQUIRED',
        message: 'You need to verify your identity before listing products. Go to Settings > Verification to get started.',
      });
    }
    next();
  } catch (err) {
    console.error('verifiedSellerRequired error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// DOB required middleware — blocks write actions for Google OAuth users who haven't confirmed age
async function dobRequired(req, res, next) {
  try {
    const result = await pool.query('SELECT date_of_birth FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'User not found' });
    if (!result.rows[0].date_of_birth) {
      return res.status(403).json({ error: 'Date of birth required to continue', code: 'PENDING_DOB' });
    }
    next();
  } catch (err) {
    console.error('dobRequired error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// ───── Auth routes ─────

app.post('/api/auth/signup', async (req, res) => {
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
app.get('/api/auth/check-email', async (req, res) => {
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
app.get('/api/auth/check-username', async (req, res) => {
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

app.post('/api/auth/login', async (req, res) => {
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

app.get('/api/auth/me', authRequired, async (req, res) => {
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

app.put('/api/auth/profile', authRequired, async (req, res) => {
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

app.put('/api/auth/username', authRequired, async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Username required' });
  // Instagram rules: lowercase, 1-30 chars, letters/digits/underscores/periods
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
      // Legacy SHA-256 fallback — upgrade to bcrypt on next password change
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

// ───── Account Deletion (GDPR / App Store Compliance) ─────
app.delete('/api/auth/delete-account', authRequired, async (req, res) => {
  const userId = req.user.id;
  const client = await pool.connect();
  try {
    // Pre-checks (fast fail before opening a transaction) — these are
    // re-verified again inside the transaction below with row locks, so a
    // late-arriving order/payout/dispute between here and BEGIN can't slip through.
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

    // Open disputes — checked independently of order status, since a dispute's
    // own status ('open'/'resolved') is tracked separately from orders.status
    // and an order can already read 'completed' while its dispute is still open.
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

    // Re-verify the money-related checks inside the transaction, with a row
    // lock on the balance, to close the gap between the pre-checks above and
    // this point (e.g. a payout or sale completing in between).
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

    // Scrub KYC document data. We keep the verification_attempts row itself
    // (status + timestamps) for accounting/audit continuity — same pattern as
    // order/transaction retention — but null out the actual document images,
    // OCR-extracted personal data, and face-match score.
    await client.query(
      `UPDATE verification_attempts SET
        id_front_url = NULL,
        id_back_url = NULL,
        selfie_url = NULL,
        ocr_result = NULL,
        face_match_score = NULL,
        rejection_reason = NULL
       WHERE user_id = $1`,
      [userId]
    );

    // didit_webhook_events has no user_id column, but vendor_data is set to
    // the user's id at session-creation time (see /api/verification/session),
    // so it's effectively a personal identifier and needs scrubbing too.
    await client.query(
      `UPDATE didit_webhook_events SET vendor_data = 'deleted' WHERE vendor_data = $1`,
      [userId]
    );

    const anonymizedEmail = `deleted_${userId.slice(0, 8)}_${Date.now()}@deleted.maurmaket.com`;
    const anonymizedUsername = `deleted_${userId.slice(0, 8)}`;
    await client.query(
      `UPDATE users SET 
        full_name = 'Deleted User',
        username = $1,
        email = $2,
        password_hash = 'DELETED',
        phone = NULL,
        avatar_url = NULL,
        bio = NULL,
        store_name = NULL,
        store_logo_url = NULL,
        id_document_url = NULL,
        id_verified = FALSE,
        role = 'deleted',
        seller_tier = 'none',
        push_token = NULL,
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
  const { html, plainText, subject } = buildVerificationEmail(code, purpose, lang);

  // Primary: Gmail API over HTTPS (native https — works on Render free tier)
  if (gmailConfigured) {
    try {
      await Promise.race([
        sendViaGmailApi(email, subject, html),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Gmail API timeout')), 20000)),
      ]);
      return true;
    } catch (err) {
      console.error('Gmail API send error:', err.message);
      // Fall through to nodemailer if available
    }
  }

  // Fallback: nodemailer SMTP (local dev only)
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
    if (!sent) {
      if (isTestMode) {
        // In test mode: OTP is stored in DB (test can read it directly), email delivery not required
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

app.post('/api/auth/verify/check', authRequired, async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Code required' });
  try {
    const userResult = await pool.query('SELECT email, email_verified FROM users WHERE id = $1', [req.user.id]);
    if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const user = userResult.rows[0];
    if (user.email_verified) {
      // Already verified — still return user so frontend can sync store
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

// ───── Google Sign-In ─────

// Authorization code flow (primary — Google deprecated implicit flow)
app.post('/api/auth/google-code', async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Authorization code required' });

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return res.status(500).json({ error: 'Google auth not configured' });

  try {
    // Exchange code for tokens
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

    // Verify the ID token
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

// ───── Complete DOB (Google OAuth users) ─────

app.post('/api/auth/complete-dob', authRequired, async (req, res) => {
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

// ───── Become a Seller ─────

app.put('/api/auth/become-seller', authRequired, dobRequired, async (req, res) => {
  try {
    if (req.user.role === 'seller') {
      // Already a seller — still return user so frontend can sync store
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
        role = 'seller',
        seller_tier = $2,
        store_name = COALESCE($3, store_name),
        store_logo_url = COALESCE($4, store_logo_url),
        id_document_url = COALESCE($5, id_document_url),
        use_store_identity = $6,
        natcash_phone = $7,
        updated_at = CURRENT_TIMESTAMP
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

// ───── Seller Profile & Verification ─────

app.put('/api/auth/upgrade-tier', authRequired, sellerRequired, async (req, res) => {
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

app.put('/api/auth/seller-profile', authRequired, sellerRequired, async (req, res) => {
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
    if (natcashPhone !== undefined) { updates.push(`natcash_phone = $${idx++}`); values.push(natcashPhone || null); }


    if (idDocumentUrl) {
        fields.push(`id_submitted_at = CURRENT_TIMESTAMP`);
      }
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

app.post('/api/addresses', authRequired, dobRequired, async (req, res) => {
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

app.post('/api/reviews', authRequired, dobRequired, async (req, res) => {
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
  if (rating !== undefined && (!Number.isInteger(Number(rating)) || Number(rating) < 1 || Number(rating) > 5)) {
    return res.status(400).json({ error: 'Rating must be an integer from 1 to 5' });
  }
  if (comment !== undefined && comment !== null && String(comment).length > 2000) {
    return res.status(400).json({ error: 'Comment is too long' });
  }
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
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 50);
    const offset = (page - 1) * limit;
    const result = await pool.query(
      `SELECT r.*, u.full_name AS reviewer_name, u.avatar_url AS reviewer_avatar, u.username AS reviewer_username
       FROM reviews r JOIN users u ON r.reviewer_id = u.id
       WHERE r.seller_id = $1
       ORDER BY r.created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.params.sellerId, limit, offset]
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
      `SELECT r.*, u.full_name AS reviewer_name, u.username AS reviewer_username
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
      `SELECT p.id, p.seller_id, p.name, p.price, p.stock,
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

app.get('/api/wishlist/status', authRequired, async (req, res) => {
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
    createNotification(req.params.sellerId, 'new_follower', 'New Follower', `${followerName} started following you`, { followerId: req.user.id, sellerId: req.params.sellerId });
    res.json({ following: true });
  } catch (err) {
    console.error('Follow toggle error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/following', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT f.*, u.full_name, u.avatar_url, u.seller_tier,
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

    // Batch-load stats for all nearby sellers in 3 queries instead of 4N
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
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lng),
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

// ───── Seller Profile / Stats (used by storefront) ─────

app.get('/api/sellers/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.full_name, u.avatar_url, u.bio, u.created_at, u.store_name, u.store_logo_url,
              u.seller_tier, u.id_verified, u.id_verification_result, u.use_store_identity, u.username, u.show_real_name,
              u.location_city, u.natcash_phone, u.accepted_payment_methods,
              (SELECT COUNT(*) FROM products p WHERE p.seller_id = u.id AND p.is_available = true) AS product_count,
              (SELECT COALESCE(AVG(r.rating)::numeric(3,2), 0) FROM reviews r WHERE r.seller_id = u.id) AS avg_rating,
              (SELECT COUNT(*) FROM reviews r2 WHERE r2.seller_id = u.id) AS review_count,
              (SELECT COUNT(*) FROM order_items oi JOIN orders o ON oi.order_id = o.id WHERE oi.seller_id = u.id AND o.status = 'completed') AS sales_count
       FROM users u
       WHERE u.id = $1 AND u.role = 'seller'`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Seller not found' });
    const row = result.rows[0];
    res.json({
      seller: {
        ...row,
        product_count: parseInt(row.product_count),
        avg_rating: parseFloat(row.avg_rating),
        review_count: parseInt(row.review_count),
        sales_count: parseInt(row.sales_count),
      }
    });
  } catch (err) {
    console.error('Seller profile error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ───── Product routes ─────

app.get('/api/products', async (req, res) => {
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

  // Check if personalized feed is requested and user is authenticated
  let usePersonalized = false;
  let userId = null;
  if (personalized === 'true' || following === 'true') {
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
      )
      SELECT
        p2.id AS product_id,
        CASE
          WHEN EXISTS (SELECT 1 FROM user_category_affinities a WHERE a.category_id = p2.category_id AND a.score > 0) THEN 'Because you like ' || COALESCE(c2.name, 'this category')
          WHEN EXISTS (SELECT 1 FROM user_follows WHERE seller_id = p2.seller_id) THEN 'From a seller you follow'
          WHEN EXISTS (SELECT 1 FROM user_purchases WHERE category_id = p2.category_id) THEN 'Based on your purchases'
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
        )
      ORDER BY total_score DESC, p2.created_at DESC
    ) score ON score.product_id = p.id`;
    params.push(userId);
    paramIndex++;
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

  if (following === 'true' && userId) {
    conditions.push(`p.seller_id IN (SELECT seller_id FROM follows WHERE follower_id = $${paramIndex++})`);
    params.push(userId);
  } else if (following === 'true' && !userId) {
    // Fallback: if following requested but no auth, use personalized scoring
    selectExtra = `, COALESCE(score.total_score, 0) AS feed_score, score.recommendation_reason`;
    joinExtra = `LEFT JOIN (
      WITH user_follows AS (
        SELECT 1 AS seller_id WHERE false
      ),
      user_wishlists AS (SELECT 1 AS product_id WHERE false),
      user_likes AS (SELECT 1 AS product_id WHERE false),
      user_relevant AS (SELECT 1 AS product_id WHERE false),
      user_not_relevant AS (SELECT 1 AS product_id WHERE false),
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
       FROM products p
       JOIN users u ON p.seller_id = u.id
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN LATERAL (
         SELECT COALESCE(
           json_agg(json_build_object('image_url', pi.image_url, 'thumbnail_url', pi.thumbnail_url, 'is_primary', pi.is_primary) ORDER BY pi.is_primary DESC, pi.display_order ASC),
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
    const products = result.rows.map(({ total_count, ...product }) => product);
    res.json({ products, total, page: +page, pages: Math.ceil(total / Math.min(limit, 50)) });
  } catch (err) {
    console.error('Products fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/products/:id/co-purchases', async (req, res) => {
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

app.get('/api/users/:userId/follows/:kind', authRequired, async (req, res) => {
  const { userId, kind } = req.params;
  if (!['followers', 'following'].includes(kind)) return res.status(400).json({ error: 'Invalid follow list' });
  try {
    const result = await pool.query(
      kind === 'followers'
        ? `SELECT u.id, u.full_name, u.username, u.avatar_url, u.store_name, u.store_logo_url, u.seller_tier, u.use_store_identity
           FROM follows f JOIN users u ON u.id = f.follower_id WHERE f.seller_id = $1 ORDER BY f.created_at DESC`
        : `SELECT u.id, u.full_name, u.username, u.avatar_url, u.store_name, u.store_logo_url, u.seller_tier, u.use_store_identity
           FROM follows f JOIN users u ON u.id = f.seller_id WHERE f.follower_id = $1 ORDER BY f.created_at DESC`,
      [userId]
    );
    res.json({ users: result.rows });
  } catch (err) {
    console.error('Follow list fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) return res.status(404).json({ error: 'Product not found' });
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
              (SELECT json_agg(json_build_object('image_url', pi.image_url, 'thumbnail_url', pi.thumbnail_url, 'is_primary', pi.is_primary) ORDER BY pi.is_primary DESC, pi.display_order ASC) FROM product_images pi WHERE pi.product_id = p.id) AS images
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
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    res.json({ product: result.rows[0] });
  } catch (err) {
    console.error('Product detail error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/products', authRequired, verifiedSellerRequired, dobRequired, async (req, res) => {
  // Email verification gate
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
    client.release();
    // Notify followers of new product
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

app.put('/api/products/:id', authRequired, verifiedSellerRequired, async (req, res) => {
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

// Literal routes must be registered before /:id, otherwise Express treats
// "active-count" as an order UUID and the database rejects it.
app.get('/api/orders/active-count', authRequired, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT COUNT(DISTINCT o.id)::int AS count FROM orders o
       JOIN order_items oi ON o.id = oi.order_id
       WHERE (o.buyer_id = $1 OR oi.seller_id = $1)
         AND o.status IN ('pending','paid','processing','shipped')`,
      [req.user.id]
    );
    res.json({ count: r.rows[0]?.count || 0 });
  } catch (err) {
    console.error('Active orders count error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/orders/:id', authRequired, async (req, res) => {
  try {
    const order = await canAccessOrder(req.user.id, req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const items = await pool.query(
      `SELECT oi.*, p.name AS product_name, p.price AS product_price,
              pi.image_url AS product_image
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.is_primary = true
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
    const escrowResult = await pool.query(
      `SELECT gross_amount, commission_amount, net_amount
       FROM order_escrow WHERE order_id = $1 LIMIT 1`,
      [req.params.id]
    );
    res.json({ order: { ...order, items: items.rows, my_role: myRole, other_party: otherParty.rows[0] || null, escrow: escrowResult.rows[0] || null } });
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
      `SELECT * FROM (
        SELECT DISTINCT ON (o.id) o.*,
                u.full_name AS seller_name, u.phone AS seller_phone, u.natcash_phone,
                'buyer' AS my_role,
                (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) AS item_count,
                (SELECT p.name FROM order_items oi2 JOIN products p ON oi2.product_id = p.id WHERE oi2.order_id = o.id ORDER BY oi2.id LIMIT 1) AS first_product_name,
                (SELECT COALESCE(pi.thumbnail_url, pi.image_url) FROM order_items oi3 JOIN product_images pi ON oi3.product_id = pi.product_id WHERE oi3.order_id = o.id AND pi.is_primary = true ORDER BY oi3.id, pi.display_order ASC LIMIT 1) AS product_image
         FROM orders o
         JOIN order_items oi ON o.id = oi.order_id
         JOIN users u ON oi.seller_id = u.id
         WHERE o.buyer_id = $1
         ORDER BY o.id, o.created_at DESC
       ) sub ORDER BY sub.created_at DESC`,
      [req.user.id]
    );
    const sellerOrders = await pool.query(
      `SELECT * FROM (
        SELECT DISTINCT ON (o.id) o.*, u.full_name AS buyer_name, u.phone AS buyer_phone,
                'seller' AS my_role,
                (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) AS item_count,
                (SELECT p.name FROM order_items oi2 JOIN products p ON oi2.product_id = p.id WHERE oi2.order_id = o.id ORDER BY oi2.id LIMIT 1) AS first_product_name,
                (SELECT COALESCE(pi.thumbnail_url, pi.image_url) FROM order_items oi3 JOIN product_images pi ON oi3.product_id = pi.product_id WHERE oi3.order_id = o.id AND pi.is_primary = true ORDER BY oi3.id, pi.display_order ASC LIMIT 1) AS product_image
         FROM orders o
         JOIN order_items oi ON o.id = oi.order_id
         JOIN users u ON o.buyer_id = u.id
         WHERE oi.seller_id = $1
         ORDER BY o.id, o.created_at DESC
       ) sub ORDER BY sub.created_at DESC`,
      [req.user.id]
    );
    res.json({ buyerOrders: buyerOrders.rows, sellerOrders: sellerOrders.rows });
  } catch (err) {
    console.error('Orders error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/orders', authRequired, dobRequired, async (req, res) => {
  // Email verification gate
  const evCheck = await pool.query('SELECT email_verified FROM users WHERE id = $1', [req.user.id]);
  if (!evCheck.rows[0]?.email_verified) {
    return res.status(403).json({ error: 'email_not_verified', message: 'Please verify your email to place orders.' });
  }
  const { items, deliveryMethod, deliveryName, deliveryPhone, deliveryAddress, deliveryCity, deliveryNote, promoCode, meetupLat, meetupLng, meetupAddress } = req.body;
  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'Cart is empty' });
  }
  for (const item of items) {
    if (!item.productId) return res.status(400).json({ error: 'Each item must have a productId' });
    const qty = parseInt(item.quantity);
    if (!qty || qty < 1) return res.status(400).json({ error: 'Quantity must be at least 1' });
    if (qty > 999) return res.status(400).json({ error: 'Quantity too high (max 999)' });
  }
  const method = deliveryMethod === 'delivery' ? 'delivery' : 'meetup';
  if (method === 'delivery') {
    if (!deliveryName || !deliveryName.trim()) return res.status(400).json({ error: 'Delivery name is required' });
    if (!deliveryPhone || !deliveryPhone.trim()) return res.status(400).json({ error: 'Delivery phone is required' });
    if (!deliveryAddress || !deliveryAddress.trim()) return res.status(400).json({ error: 'Delivery address is required' });
    if (!deliveryCity || !deliveryCity.trim()) return res.status(400).json({ error: 'Delivery city is required' });
    if (deliveryName.length > 100) return res.status(400).json({ error: 'Name too long' });
    if (deliveryPhone.length > 20) return res.status(400).json({ error: 'Phone too long' });
    if (deliveryAddress.length > 200) return res.status(400).json({ error: 'Address too long' });
    if (deliveryCity.length > 100) return res.status(400).json({ error: 'City too long' });
  } else {
    const latitude = Number(meetupLat);
    const longitude = Number(meetupLng);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180 || !meetupAddress?.trim()) {
      return res.status(400).json({ error: 'Meetup coordinates and address are required' });
    }
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
      // Price resolution: accepted offer > sale price > list price
      let price;
      const offerCheck = await client.query(
        `SELECT mo.offered_price FROM message_offers mo
         WHERE mo.product_id = $1 AND mo.buyer_id = $2 AND mo.status = 'accepted'
         AND mo.responded_at IS NOT NULL
         ORDER BY mo.responded_at DESC LIMIT 1
         FOR UPDATE`,
        [item.productId, req.user.id]
      );
      if (offerCheck.rows.length > 0) {
        price = parseFloat(offerCheck.rows[0].offered_price);
        await client.query(
          "UPDATE message_offers SET status = 'redeemed' WHERE product_id = $1 AND buyer_id = $2 AND status = 'accepted' AND responded_at = (SELECT MAX(responded_at) FROM message_offers WHERE product_id = $1 AND buyer_id = $2 AND status = 'accepted')",
          [item.productId, req.user.id]
        );
      } else {
        const onSale = p.sale_price && (p.sale_starts_at === null || new Date(p.sale_starts_at) <= new Date()) && (p.sale_ends_at === null || new Date(p.sale_ends_at) >= new Date());
        price = onSale ? parseFloat(p.sale_price) : parseFloat(p.price);
      }
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
          const eligibleTotal = promo.seller_id
            ? orderItems.filter(item => item.sellerId === promo.seller_id).reduce((sum, item) => sum + item.price * item.quantity, 0)
            : total;
          if (used.rows.length === 0 && eligibleTotal >= parseFloat(promo.min_order_amount)) {
            discountAmount = promo.discount_type === 'percentage'
              ? Math.min(eligibleTotal * parseFloat(promo.discount_value) / 100, parseFloat(promo.discount_value) * 10)
              : Math.min(parseFloat(promo.discount_value), eligibleTotal);
            promoId = promo.id;
          }
        }
      }
    }

    // Apply promo discount to the order total so buyer is charged the discounted amount
    const finalTotal = discountAmount > 0 ? Math.round((total - discountAmount) * 100) / 100 : total;
    const orderResult = await client.query(
      `INSERT INTO orders (buyer_id, total_amount, status, delivery_method, delivery_name, delivery_phone, delivery_address, delivery_city, delivery_note, meetup_lat, meetup_lng, meetup_address, meetup_proposed_by)
       VALUES ($1, $2, 'pending', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [req.user.id, finalTotal, method, deliveryName || null, deliveryPhone || null, deliveryAddress || null, deliveryCity || null, deliveryNote || null,
       meetupLat ? parseFloat(meetupLat) : null, meetupLng ? parseFloat(meetupLng) : null, meetupAddress || null,
       meetupLat && meetupLng ? req.user.id : null]
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
    client.release();
    logOrderEvent(order.id, 'order_placed', req.user.id, null, 'pending', `Order placed${discountAmount > 0 ? ` (promo: -G ${discountAmount.toFixed(0)})` : ''}`);
    const buyerInfo = await pool.query('SELECT full_name FROM users WHERE id = $1', [req.user.id]);
    const buyerName = buyerInfo.rows[0]?.full_name || 'Someone';
    const sellerIds = [...new Set(orderItems.map(i => i.sellerId))];

    // Include seller info in response for NatCash payment flow
    let sellerInfo = null;
    if (req.body.paymentMethod === 'natcash' && sellerIds.length > 0) {
      const sellerRes = await pool.query(
        'SELECT full_name, phone, natcash_phone FROM users WHERE id = $1', [sellerIds[0]]
      );
      if (sellerRes.rows[0]) {
        sellerInfo = {
          name: sellerRes.rows[0].full_name,
          phone: sellerRes.rows[0].phone,
          natcashPhone: sellerRes.rows[0].natcash_phone,
        };
      }
    }
    // Get first product image per seller for notification thumbnails
    const orderImages = await pool.query(
      `SELECT DISTINCT ON (oi.seller_id) oi.seller_id, pi.image_url
       FROM order_items oi JOIN product_images pi ON pi.product_id = oi.product_id
       WHERE oi.order_id = $1 AND pi.is_primary = true`, [order.id]
    );
    const imageBySeller = {};
    for (const row of orderImages.rows) imageBySeller[row.seller_id] = row.image_url;
    for (const sid of sellerIds) {
      const notifData = { orderId: order.id };
      if (imageBySeller[sid]) notifData.image = imageBySeller[sid];
      createNotification(sid, 'order_status', 'New Order', `New order from ${buyerName} — G ${finalTotal.toFixed(0)}`, notifData);
      const lowStock = await pool.query('SELECT id, name, stock FROM products WHERE seller_id = $1 AND stock <= 3 AND is_available = true', [sid]);
      for (const p of lowStock.rows) {
        createNotification(sid, 'low_stock', 'Low Stock Alert', `"${p.name}" has only ${p.stock} left`, { productId: p.id });
      }
    }
    res.status(201).json({ order, sellerInfo });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (rbErr) { console.error('ROLLBACK failed:', rbErr.message); }
    client.release();
    console.error('Order create error:', err);
    const safeMessage = err.message?.startsWith('Product') || err.message?.startsWith('You cannot') || err.message?.startsWith('Insufficient') || err.message?.startsWith('Cart') ? err.message : 'Invalid order data';
    res.status(400).json({ error: safeMessage });
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
    if (order.rows[0].status !== 'pending' && order.rows[0].status !== 'paid') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Only pending or paid orders can be cancelled' });
    }
    if (order.rows[0].status === 'paid') {
      const hasCheckin = await client.query('SELECT 1 FROM meetup_checkins WHERE order_id = $1', [req.params.id]);
      if (hasCheckin.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Cannot cancel after check-in — use the meetup flow' });
      }
    }
    const oldStatus = order.rows[0].status;

    // If order was paid: refund escrow + restore stock
    let totalRefund = 0;
    if (oldStatus === 'paid') {
      const escrows = await client.query(
        "SELECT * FROM order_escrow WHERE order_id = $1 AND status = 'held' FOR UPDATE",
        [req.params.id]
      );
      for (const escrow of escrows.rows) {
        await client.query(
          "UPDATE order_escrow SET status = 'refunded', released_at = CURRENT_TIMESTAMP WHERE id = $1",
          [escrow.id]
        );
      }
      const items = await client.query('SELECT product_id, quantity FROM order_items WHERE order_id = $1', [req.params.id]);
      totalRefund = parseFloat(order.rows[0].total_amount);
      for (const item of items.rows) {
        await client.query('SELECT id FROM products WHERE id = $1 FOR UPDATE', [item.product_id]);
        await client.query('UPDATE products SET stock = stock + $1 WHERE id = $2', [item.quantity, item.product_id]);
      }
    }

    await client.query(
      "UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
      [req.params.id]
    );
    await client.query('COMMIT');
    client.release();
    logOrderEvent(req.params.id, 'status_change', req.user.id, oldStatus, 'cancelled', 'Cancelled by buyer');

    // Send refund payout to buyer if paid order
    if (oldStatus === 'paid' && totalRefund > 0) {
      const buyerRes = await pool.query('SELECT phone FROM users WHERE id = $1', [order.rows[0].buyer_id]);
      const buyerPhone = buyerRes.rows[0]?.phone;
      if (buyerPhone) {
        try {
          const payoutRes = await fetch(
            process.env.MONCASH_PAYOUT_CREATE_URL || 'https://hvlmeoqyxaguzcujpmit.supabase.co/functions/v1/payout-create',
            {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${process.env.MCC_KEY}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ amount: Math.round(totalRefund), moncashNumber: buyerPhone, referenceId: `cancel_refund_${req.params.id}` }),
              signal: AbortSignal.timeout(15000),
            }
          );
          if (payoutRes.ok) console.log(`[CANCEL] Refund G ${totalRefund} sent to buyer ${buyerPhone}`);
          else console.error(`[CANCEL] Refund payout failed: ${await payoutRes.text()}`);
        } catch (e) { console.error('[CANCEL] Refund payout error:', e.message); }
      }
      createNotification(order.rows[0].buyer_id, 'order_status', 'Order Refunded',
        `Your cancelled order has been refunded G ${totalRefund.toFixed(0)}.`, { orderId: req.params.id });
    }

    // Notify sellers of cancelled order
    const cancelledSellers = await pool.query('SELECT DISTINCT seller_id FROM order_items WHERE order_id = $1', [req.params.id]);
    for (const row of cancelledSellers.rows) {
      createNotification(row.seller_id, 'order_cancelled', 'Order Cancelled',
        `A buyer cancelled their order.`, { orderId: req.params.id });
    }
    res.json({ cancelled: true });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    client.release();
    console.error('Order cancel error:', err);
    res.status(500).json({ error: 'Server error' });
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
      .filter(item => item.is_available && item.stock > 0 && item.seller_id !== req.user.id)
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
  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);
  if (!Number.isFinite(latNum) || latNum < -90 || latNum > 90) return res.status(400).json({ error: 'Invalid latitude' });
  if (!Number.isFinite(lngNum) || lngNum < -180 || lngNum > 180) return res.status(400).json({ error: 'Invalid longitude' });
  try {
    const order = await canAccessOrder(req.user.id, req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'paid' && order.status !== 'pending') return res.status(400).json({ error: 'Order must be paid or pending' });
    await pool.query(
      `UPDATE orders SET meetup_lat = $1, meetup_lng = $2, meetup_address = $3, meetup_note = $4, meetup_confirmed = false, meetup_proposed_by = $5, updated_at = CURRENT_TIMESTAMP WHERE id = $6`,
      [latNum, lngNum, address || null, note || null, req.user.id, req.params.id]
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

// ───── Meetup Check-in + delivery code ─────

const MEETUP_CODE_TTL_MS = 30 * 60 * 1000;
const MAX_MEETUP_CODE_ATTEMPTS = 5;

function generateMeetupCode() {
  return String(crypto.randomInt(1000, 10000));
}

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

    const sellerMembership = await client.query(
      'SELECT 1 FROM order_items WHERE order_id = $1 AND seller_id = $2 LIMIT 1',
      [req.params.id, req.user.id]
    );
    const role = order.buyer_id === req.user.id ? 'buyer' : sellerMembership.rows.length > 0 ? 'seller' : null;
    if (!role) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Not a party to this order' });
    }
    const isSeller = role === 'seller';
    const isBuyer = role === 'buyer';

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

      if (proximityConfirmed) {
        // Both are within 150m — start the meetup timer if not already started
        if (!order.meetup_started_at) {
          await client.query(
            'UPDATE orders SET meetup_started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
            [req.params.id]
          );
        }
        // Generate a short delivery code for the buyer once both parties are nearby.
        const meetupCode = generateMeetupCode();
        await client.query(
          `UPDATE meetup_checkins
           SET meetup_code = $1, meetup_code_expires_at = CURRENT_TIMESTAMP + INTERVAL '30 minutes',
               meetup_code_attempts = 0, qr_scanned = false
           WHERE order_id = $2 AND user_id = $3`,
          [meetupCode, req.params.id, order.buyer_id]
        );
        // Log the event
        await logOrderEvent(req.params.id, 'meetup_arrived', req.user.id, null, null, `Buyer and seller within ${Math.round(distance)}m`, client);
      }
    }

    await client.query('COMMIT');
    client.release();

    // Return check-in result
    const response = {
      checkedIn: true,
      role,
      otherPartyCheckedIn: otherCheckin.rows.length > 0,
      proximityConfirmed,
      distance: distance ? Math.round(distance) : null,
      meetupStartedAt: order.meetup_started_at || (proximityConfirmed ? new Date().toISOString() : null),
    };

    if (isBuyer) {
      const qrRow = await pool.query(
        'SELECT meetup_code FROM meetup_checkins WHERE order_id = $1 AND user_id = $2',
        [req.params.id, req.user.id]
      );
      if (qrRow.rows[0]?.meetup_code) {
        response.meetupCode = qrRow.rows[0].meetup_code;
      }
    }

    res.json(response);
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('Meetup check-in error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// Seller enters the buyer's short delivery code
app.post('/api/orders/:id/meetup/scan', authRequired, async (req, res) => {
  const { code } = req.body;
  if (!/^\d{4}$/.test(String(code || ''))) return res.status(400).json({ error: 'Enter the 4-digit delivery code' });
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

    const sellerItem = await pool.query(
      'SELECT seller_id FROM order_items WHERE order_id = $1 AND seller_id = $2',
      [req.params.id, req.user.id]
    );
    if (sellerItem.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Only a seller on this order can enter the delivery code' });
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

    const buyerMeetup = buyerCheckin.rows[0];
    if (!buyerMeetup?.meetup_code || !buyerMeetup.meetup_code_expires_at || new Date(buyerMeetup.meetup_code_expires_at).getTime() <= Date.now()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Delivery code is expired. Ask the buyer to refresh it.' });
    }
    if (buyerMeetup.meetup_code_attempts >= MAX_MEETUP_CODE_ATTEMPTS) {
      await client.query('ROLLBACK');
      return res.status(429).json({ error: 'Too many incorrect attempts. Ask the buyer to refresh the delivery code.' });
    }

    const expectedCode = Buffer.from(String(buyerMeetup.meetup_code), 'utf8');
    const enteredCode = Buffer.from(String(code), 'utf8');
    if (expectedCode.length !== enteredCode.length || !crypto.timingSafeEqual(expectedCode, enteredCode)) {
      const attempts = buyerMeetup.meetup_code_attempts + 1;
      await client.query(
        'UPDATE meetup_checkins SET meetup_code_attempts = $1 WHERE order_id = $2 AND user_id = $3',
        [attempts, req.params.id, order.buyer_id]
      );
      await client.query('COMMIT');
      return res.status(400).json({ error: attempts >= MAX_MEETUP_CODE_ATTEMPTS ? 'Too many incorrect attempts. Ask the buyer to refresh the delivery code.' : 'Incorrect delivery code' });
    }

    // Mark delivery code as used
    await client.query(
      'UPDATE meetup_checkins SET qr_scanned = true WHERE order_id = $1 AND user_id = $2',
      [req.params.id, order.buyer_id]
    );

    // Log the event
    await logOrderEvent(req.params.id, 'exchange_confirmed', req.user.id, null, null, 'Delivery code entered — exchange confirmed', client);

    await client.query('COMMIT');

    res.json({
      scanned: true,
      message: 'Exchange confirmed! The buyer will be asked to confirm receipt.',
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Meetup code verification error:', err);
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
                  `SELECT mc.id, mc.order_id, mc.user_id, mc.role, mc.lat, mc.lng, mc.checked_in_at,
                    mc.qr_scanned, mc.meetup_code_expires_at, mc.meetup_code_attempts,
                    CASE WHEN mc.user_id = $2 THEN mc.meetup_code ELSE NULL END AS meetup_code,
                    u.full_name, u.avatar_url
       FROM meetup_checkins mc
       JOIN users u ON mc.user_id = u.id
             WHERE mc.order_id = $1`,
            [req.params.id, req.user.id]
    );

    res.json({ checkins: checkins.rows, meetupStartedAt: order.meetup_started_at });
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
    client.release();
    const sellersOfOrder = await pool.query(
      'SELECT DISTINCT seller_id FROM order_items WHERE order_id = $1',
      [req.params.id]
    );
    for (const row of sellersOfOrder.rows) {
      createNotification(row.seller_id, 'order_status', 'Order Completed', 'An order has been marked as completed', { orderId: req.params.id });
    }
    res.json({ updated: true, status: 'completed' });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    client.release();
    console.error('Order complete error:', err);
    res.status(500).json({ error: 'Server error' });
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

    const verifiedExchange = await client.query(
      `SELECT
         COUNT(*) FILTER (WHERE role = 'buyer' AND qr_scanned = true) AS buyer_verified,
         COUNT(*) FILTER (WHERE role = 'seller') AS seller_checked_in
       FROM meetup_checkins
       WHERE order_id = $1`,
      [req.params.id]
    );
    const exchange = verifiedExchange.rows[0];
    if (Number(exchange.buyer_verified) < 1 || Number(exchange.seller_checked_in) < 1) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'The seller must verify the delivery code before escrow can be released' });
    }

    // ── SECURITY: Freeze escrow if dispute is open ──
    const openDispute = await client.query(
      "SELECT id FROM disputes WHERE order_id = $1 AND status = 'open'",
      [req.params.id]
    );
    if (openDispute.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Escrow is frozen — an open dispute must be resolved first.' });
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

      console.log(`Escrow released: seller ${escrow.seller_id} credited G ${net}`);
    }

    // Mark order as completed if not already
    if (o.status !== 'completed') {
      await client.query(
        "UPDATE orders SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
        [req.params.id]
      );
    }

    await client.query('COMMIT');
    client.release();

    // Pay out platform commission (outside transaction — best effort)
    try {
      const totalCommission = (await pool.query(
        'SELECT COALESCE(SUM(commission_amount), 0) AS total FROM order_escrow WHERE order_id = $1',
        [req.params.id]
      )).rows[0].total;
      const commissionAmount = parseFloat(totalCommission);

      if (commissionAmount > 0 && process.env.PLATFORM_PHONE) {
        const payoutRes = await fetch(
          process.env.MONCASH_PAYOUT_CREATE_URL || 'https://hvlmeoqyxaguzcujpmit.supabase.co/functions/v1/payout-create',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.MCC_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              amount: Math.round(commissionAmount),
              moncashNumber: process.env.PLATFORM_PHONE,
              referenceId: `platform_${req.params.id}`,
            }),
            signal: AbortSignal.timeout(15000),
          }
        );

        if (payoutRes.ok) {
          const payoutData = await payoutRes.json();
          await pool.query(
            `INSERT INTO platform_payouts (order_id, amount, status, moncash_reference)
             VALUES ($1, $2, 'completed', $3)`,
            [req.params.id, commissionAmount, payoutData.reference || payoutData.transactionId || null]
          );
          console.log(`Platform commission G ${commissionAmount} sent to ${process.env.PLATFORM_PHONE}`);
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
        `G ${parseFloat(escrow.net_amount).toFixed(0)} has been credited to your balance`, { orderId: req.params.id });
    }

    res.json({ released: true, escrowCount: escrows.rows.length });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    client.release();
    console.error('Escrow release error:', err);
    res.status(500).json({ error: 'Server error' });
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

    // ── SECURITY: Status gate — prevent buyer self-refund after goods exchanged ──
    const isAdmin = req.user.role === 'admin';
    const isBuyer = o.buyer_id === req.user.id;
    const refundableStatuses = ['pending', 'paid', 'cancelled'];
    if (!isAdmin && !refundableStatuses.includes(o.status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Cannot self-refund order in '${o.status}' status. Open a dispute instead.` });
    }

    // ── SECURITY: Block buyer self-refund if meetup checkin already happened ──
    if (!isAdmin && isBuyer) {
      const checkins = await client.query(
        'SELECT id FROM meetup_checkins WHERE order_id = $1',
        [req.params.id]
      );
      if (checkins.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Meetup check-in already occurred. Open a dispute to resolve this order.' });
      }
    }

    // ── SECURITY: For orders past 'paid', require an open dispute (buyer only) ──
    if (!isAdmin && isBuyer && !refundableStatuses.includes(o.status)) {
      const disputes = await client.query(
        "SELECT id FROM disputes WHERE order_id = $1 AND status = 'open'",
        [req.params.id]
      );
      if (disputes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Order is past payment stage. Open a dispute to request a refund.' });
      }
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

    const totalRefund = parseFloat(o.total_amount);
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
      await client.query('SELECT id FROM products WHERE id = $1 FOR UPDATE', [item.product_id]);
      await client.query('UPDATE products SET stock = stock + $1 WHERE id = $2', [item.quantity, item.product_id]);
    }

    await client.query(
      `INSERT INTO refund_payouts (order_id, buyer_id, amount, receiver_phone, moncash_reference)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (order_id) DO NOTHING`,
      [req.params.id, o.buyer_id, totalRefund, buyerPhone, `refund_${req.params.id}`]
    );

    await client.query('COMMIT');
    client.release();

    await processRefundPayout(req.params.id);

    // Notify sellers that escrow was refunded
    for (const escrow of escrows.rows) {
      createNotification(escrow.seller_id, 'escrow_refunded', 'Order Refunded',
        `An order has been refunded. G ${parseFloat(escrow.gross_amount).toFixed(0)} has been returned to the buyer.`, { orderId: req.params.id });
    }

    res.json({ refunded: true, amount: totalRefund });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    client.release();
    console.error('Escrow refund error:', err);
    res.status(500).json({ error: 'Server error' });
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
  const { returnUrl } = req.body;
  try {
    const orderResult = await pool.query(
      "SELECT * FROM orders WHERE id = $1 AND buyer_id = $2 AND status = 'pending'",
      [orderId, req.user.id]
    );
    if (orderResult.rows.length === 0) return res.status(404).json({ error: 'Pending order not found' });
    const order = orderResult.rows[0];

    // Use unique referenceId for each retry attempt (MonCash rejects duplicates)
    const retryReference = `${orderId}_retry_${Date.now()}`;

    let moncashRes = await fetch(
      process.env.MONCASH_PAY_CREATE_URL || 'https://hvlmeoqyxaguzcujpmit.supabase.co/functions/v1/pay-create',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.MCC_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: Math.round(parseFloat(order.total_amount)),
          referenceId: retryReference,
          returnUrl: returnUrl?.startsWith('https://') ? returnUrl : `${process.env.PRODUCTION_URL || 'https://maurmaket.onrender.com'}/payment/return?order=${orderId}`,
        }),
        signal: AbortSignal.timeout(15000),
      }
    );

    // Auto-retry once on 409 (referenceId conflict)
    if (moncashRes.status === 409) {
      const retryRef2 = `${orderId}_retry2_${Date.now()}`;
      moncashRes = await fetch(
        process.env.MONCASH_PAY_CREATE_URL || 'https://hvlmeoqyxaguzcujpmit.supabase.co/functions/v1/pay-create',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.MCC_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            amount: Math.round(parseFloat(order.total_amount)),
            referenceId: retryRef2,
          returnUrl: returnUrl?.startsWith('https://') ? returnUrl : `${process.env.PRODUCTION_URL || 'https://maurmaket.onrender.com'}/payment/return?order=${orderId}`,
          }),
          signal: AbortSignal.timeout(15000),
        }
      );
      if (moncashRes.ok) {
        const retryData = await moncashRes.json();
        if (retryData.paymentUrl) {
          await pool.query('UPDATE orders SET moncash_reference = $1 WHERE id = $2', [retryRef2, orderId]);
          return res.json({ paymentUrl: retryData.paymentUrl });
        }
      }
    }

    if (!moncashRes.ok) {
      const errorText = await moncashRes.text();
      console.error(`MonCashConnect retry HTTP ${moncashRes.status}:`, errorText);
      if (moncashRes.status === 401) return res.status(502).json({ error: 'Payment provider auth error' });
      if (moncashRes.status === 400) return res.status(502).json({ error: 'Invalid payment request' });
      return res.status(502).json({ error: 'Payment provider error' });
    }
    const data = await moncashRes.json();
    if (!data.paymentUrl) return res.status(502).json({ error: 'Payment provider error' });

    // Store the retry reference so pay-status endpoint can poll MonCash with it
    await pool.query('UPDATE orders SET moncash_reference = $1 WHERE id = $2', [retryReference, orderId]);

    res.json({ paymentUrl: data.paymentUrl });
  } catch (err) {
    console.error('Payment retry error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ───── Seller dashboard ─────

app.get('/api/seller/location', authRequired, sellerRequired, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT lat, lng, is_visible FROM seller_locations WHERE seller_id = $1',
      [req.user.id]
    );
    if (result.rows.length === 0) return res.json({ lat: null, lng: null, isVisible: false });
    const row = result.rows[0];
    res.json({ lat: row.lat, lng: row.lng, isVisible: row.is_visible });
  } catch (err) {
    console.error('Seller location fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/seller/location', authRequired, sellerRequired, async (req, res) => {
  const { lat, lng, isVisible } = req.body;

  // Toggle visibility only (no coords needed)
  if (isVisible !== undefined && lat == null && lng == null) {
    try {
      const existing = await pool.query('SELECT seller_id FROM seller_locations WHERE seller_id = $1', [req.user.id]);
      if (existing.rows.length === 0) {
        return res.status(400).json({ error: 'No location set. Enable location first.' });
      }
      await pool.query(
        'UPDATE seller_locations SET is_visible = $1, updated_at = CURRENT_TIMESTAMP WHERE seller_id = $2',
        [Boolean(isVisible), req.user.id]
      );
      return res.json({ ok: true, isVisible: Boolean(isVisible) });
    } catch (err) {
      console.error('Seller visibility toggle error:', err);
      return res.status(500).json({ error: 'Server error' });
    }
  }

  // Full location update (coords required)
  if (lat == null || lng == null) return res.status(400).json({ error: 'lat and lng required' });
  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);
  if (isNaN(latNum) || isNaN(lngNum)) return res.status(400).json({ error: 'Invalid coordinates' });
  if (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
    return res.status(400).json({ error: 'Coordinates out of range' });
  }
  try {
    const visible = isVisible !== undefined ? Boolean(isVisible) : true;
    await pool.query(
      `INSERT INTO seller_locations (seller_id, lat, lng, is_visible, updated_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
       ON CONFLICT (seller_id) DO UPDATE SET lat = $2, lng = $3, is_visible = $4, updated_at = CURRENT_TIMESTAMP`,
      [req.user.id, latNum, lngNum, visible]
    );
    res.json({ ok: true, lat: latNum, lng: lngNum, isVisible: visible });
  } catch (err) {
    console.error('Seller location update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/seller/products', authRequired, sellerRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, c.name AS category,
              COALESCE((
                SELECT json_agg(json_build_object(
                  'id', pi.id,
                  'image_url', pi.image_url,
                  'is_primary', pi.is_primary,
                  'display_order', pi.display_order
                ) ORDER BY pi.is_primary DESC, pi.display_order ASC)
                FROM product_images pi
                WHERE pi.product_id = p.id
              ), '[]'::json) AS images
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.seller_id = $1
       ORDER BY p.created_at DESC
       LIMIT 100`,
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
      `SELECT o.*, u.full_name AS buyer_name, u.phone AS buyer_phone,
              'seller' AS my_role,
              (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) AS item_count,
              (SELECT p.name FROM order_items oi2 JOIN products p ON oi2.product_id = p.id WHERE oi2.order_id = o.id ORDER BY oi2.id LIMIT 1) AS first_product_name,
              (SELECT COALESCE(pi.thumbnail_url, pi.image_url) FROM order_items oi3 JOIN product_images pi ON oi3.product_id = pi.product_id WHERE oi3.order_id = o.id AND pi.is_primary = true ORDER BY oi3.id, pi.display_order ASC LIMIT 1) AS product_image
       FROM orders o
       JOIN order_items oi ON o.id = oi.order_id
       JOIN users u ON o.buyer_id = u.id
       WHERE oi.seller_id = $1
       GROUP BY o.id, u.full_name, u.phone
       ORDER BY o.created_at DESC
       LIMIT 100`,
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
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const check = await client.query(
        `SELECT o.id, o.status, o.delivery_method FROM orders o
         JOIN order_items oi ON o.id = oi.order_id
         WHERE o.id = $1 AND oi.seller_id = $2 FOR UPDATE`,
        [req.params.id, req.user.id]
      );
      if (check.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Order not found' }); }
      const current = check.rows[0].status;
      const deliveryMethod = check.rows[0].delivery_method;

      if (deliveryMethod === 'meetup' && (status === 'shipped' || status === 'delivered')) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Meetup orders are completed via the QR exchange flow, not status updates' });
      }

      const transitions = { paid: 'processing', processing: 'shipped', shipped: 'delivered' };
      if (transitions[current] !== status) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Cannot transition from ${current} to ${status}` });
      }

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
      `SELECT * FROM promo_codes WHERE code = $1 AND is_active = true AND (valid_until IS NULL OR valid_until > CURRENT_TIMESTAMP)`,
      [code.toUpperCase()]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Invalid or expired promo code' });
    const promo = result.rows[0];
    if (promo.max_uses && promo.uses_count >= promo.max_uses) {
      return res.status(400).json({ error: 'Promo code has reached max uses' });
    }
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
  if (discountType === 'percentage' && discountValue > 100) return res.status(400).json({ error: 'Percentage discount cannot exceed 100%' });
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
        COUNT(DISTINCT CASE WHEN o.status != 'cancelled' THEN o.id END) AS total_orders,
        COALESCE((SELECT SUM(e.net_amount) FROM order_escrow e JOIN orders o2 ON e.order_id = o2.id WHERE e.seller_id = $1 AND o2.status = 'completed'), 0) AS total_revenue,
        (SELECT COALESCE(AVG(r.rating)::numeric(3,2), 0) FROM reviews r WHERE r.seller_id = $1) AS avg_rating,
        (SELECT COUNT(*) FROM reviews WHERE seller_id = $1) AS review_count,
        (SELECT COUNT(*) FROM follows WHERE seller_id = $1) AS follower_count,
        (SELECT COUNT(*) FROM products WHERE seller_id = $1) AS product_count
       FROM order_items oi
       JOIN orders o ON oi.order_id = o.id
       WHERE oi.seller_id = $1`,
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

app.post('/api/disputes', authRequired, dobRequired, async (req, res) => {
  const { orderId, reason, description } = req.body;
  if (!orderId || !reason) return res.status(400).json({ error: 'orderId and reason required' });
  try {
    const order = await canAccessOrder(req.user.id, orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'completed' && order.status !== 'paid' && order.status !== 'processing') {
      return res.status(400).json({ error: 'Can only dispute active or completed orders' });
    }
    const existingDispute = await pool.query(
      "SELECT 1 FROM disputes WHERE order_id = $1 AND status IN ('open', 'under_review') LIMIT 1",
      [orderId]
    );
    if (existingDispute.rows.length > 0) {
      return res.status(400).json({ error: 'An open dispute already exists for this order' });
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
       ORDER BY d.created_at DESC
       LIMIT 50`,
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

// External sync trigger (GitHub Actions calls this — uses shared secret, not JWT)
app.post('/api/admin/sync', async (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  const configuredKey = process.env.SYNC_KEY;
  const providedKey = Buffer.from(String(adminKey || ''), 'utf8');
  const expectedKey = Buffer.from(String(configuredKey || ''), 'utf8');
  if (!configuredKey || providedKey.length !== expectedKey.length || !crypto.timingSafeEqual(providedKey, expectedKey)) {
    return res.status(403).json({ error: 'Invalid admin key' });
  }
  if (!neonBackupDatabaseUrl) return res.status(503).json({ error: 'Neon backup is not configured' });
  try {
    await migrateSupabaseToNeon();
    res.json({ ok: true, message: 'Sync completed: Supabase → Neon' });
  } catch (err) {
    console.error('[ADMIN SYNC] Error:', err.message);
    res.status(500).json({ error: 'Sync failed' });
  }
});

function adminRequired(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

app.get('/api/admin/users', authRequired, adminRequired, async (_req, res) => {
  try {
    const result = await pool.query('SELECT id, full_name, email, phone, role, created_at FROM users ORDER BY created_at DESC LIMIT 100');
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
              u.full_name AS other_party_name, u.username AS other_party_username, u.avatar_url AS other_party_avatar, u.use_store_identity AS other_party_use_store_identity, u.store_logo_url AS other_party_store_logo_url, u.seller_tier AS other_party_seller_tier,
              latest.last_message,
              COUNT(unread.id)::INTEGER AS unread_count
       FROM conversations c
       JOIN users u ON u.id = CASE WHEN c.buyer_id = $1 THEN c.seller_id ELSE c.buyer_id END
       LEFT JOIN LATERAL (
         SELECT CASE WHEN message_type = 'image' THEN 'Photo' WHEN message_type = 'offer' THEN 'Offer' ELSE content END AS last_message,
              (SELECT message_type FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC, id DESC LIMIT 1) AS last_message_type
         FROM messages WHERE conversation_id = c.id
         ORDER BY created_at DESC, id DESC LIMIT 1
       ) latest ON true
       LEFT JOIN messages unread ON unread.conversation_id = c.id
         AND unread.sender_id != $1 AND unread.is_read = false
       WHERE c.buyer_id = $1 OR c.seller_id = $1
       GROUP BY c.id, u.id, latest.last_message
       ORDER BY c.last_message_at DESC`,
      [req.user.id]
    );
    res.json({ conversations: result.rows });
  } catch (err) {
    console.error('Conversations fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/conversations', authRequired, convLimiter, dobRequired, async (req, res) => {
  const { productId, orderId, sellerId: directSellerId } = req.body;
  if (!productId && !orderId && !directSellerId) return res.status(400).json({ error: 'productId, orderId, or sellerId required' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let sellerId;
    if (directSellerId) {
      sellerId = directSellerId;
    } else if (orderId) {
      const o = await client.query('SELECT buyer_id FROM orders WHERE id = $1', [orderId]);
      if (o.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Order not found' }); }
      const items = await client.query('SELECT DISTINCT seller_id FROM order_items WHERE order_id = $1', [orderId]);
      if (req.user.id !== o.rows[0].buyer_id && !items.rows.some(item => item.seller_id === req.user.id)) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Not a participant in this order' });
      }
      sellerId = items.rows[0]?.seller_id;
      if (req.user.id === sellerId) sellerId = o.rows[0].buyer_id;
    } else {
      const p = await client.query('SELECT seller_id FROM products WHERE id = $1', [productId]);
      if (p.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Product not found' }); }
      sellerId = p.rows[0].seller_id;
    }
    if (req.user.id === sellerId) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Cannot message yourself' }); }
    const existing = await client.query(
      `SELECT id FROM conversations WHERE ((buyer_id = $1 AND seller_id = $2) OR (buyer_id = $2 AND seller_id = $1)) AND ($3::uuid IS NULL OR order_id = $3) FOR SHARE`,
      [req.user.id, sellerId, orderId || null]
    );
    if (existing.rows.length > 0) { await client.query('COMMIT'); return res.json({ conversationId: existing.rows[0].id }); }
    const buyerId = req.user.id;
    const result = await client.query(
      `INSERT INTO conversations (order_id, product_id, buyer_id, seller_id) VALUES ($1, $2, $3, $4) RETURNING id`,
      [orderId || null, productId || null, buyerId, sellerId]
    );
    await client.query('COMMIT');
    res.status(201).json({ conversationId: result.rows[0].id });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    if (err.code === '23505' && orderId) {
      const existing = await pool.query(
        `SELECT id FROM conversations
         WHERE order_id = $1 AND LEAST(buyer_id, seller_id) = LEAST($2::uuid, $3::uuid)
           AND GREATEST(buyer_id, seller_id) = GREATEST($2::uuid, $3::uuid)
         LIMIT 1`,
        [orderId, req.user.id, sellerId]
      );
      if (existing.rows.length > 0) return res.json({ conversationId: existing.rows[0].id });
    }
    console.error('Conversation create error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

app.get('/api/conversations/:id/messages', authRequired, async (req, res) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id)) {
    return res.status(404).json({ error: 'Conversation not found' });
  }
  try {
    const conv = await pool.query(
      'SELECT * FROM conversations WHERE id = $1 AND (buyer_id = $2 OR seller_id = $2)',
      [req.params.id, req.user.id]
    );
    if (conv.rows.length === 0) return res.status(404).json({ error: 'Conversation not found' });
    // Only mark as read if there are actually unread messages from the other party
    const unreadCheck = await pool.query(
      'SELECT 1 FROM messages WHERE conversation_id = $1 AND sender_id != $2 AND is_read = false LIMIT 1',
      [req.params.id, req.user.id]
    );
    if (unreadCheck.rows.length > 0) {
      await pool.query(
        'UPDATE messages SET is_read = true WHERE conversation_id = $1 AND sender_id != $2 AND is_read = false',
        [req.params.id, req.user.id]
      );
    }
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    const since = req.query.since;
    const sinceId = req.query.sinceId;
    let query = `SELECT m.*, u.full_name AS sender_name,
       mo.product_id AS offer_product_id,
       mo.offered_price AS offer_offered_price,
       mo.list_price AS offer_list_price,
       mo.status AS offer_status,
       mo.negotiation_round AS offer_negotiation_round,
       mo.buyer_id AS offer_buyer_id,
       mo.seller_id AS offer_seller_id,
       mo.expires_at AS offer_expires_at,
       p.name AS offer_product_name
       FROM messages m JOIN users u ON m.sender_id = u.id
       LEFT JOIN message_offers mo ON mo.message_id = m.id
       LEFT JOIN products p ON p.id = mo.product_id
       WHERE m.conversation_id = $1`;
    const params = [req.params.id];
    if (since) {
      params.push(since);
      if (sinceId) {
        params.push(sinceId);
        query += ` AND (m.created_at > $${params.length - 1} OR (m.created_at = $${params.length - 1} AND m.id > $${params.length}))`;
      } else {
        query += ` AND m.created_at > $${params.length}`;
      }
      query += ` ORDER BY m.created_at ASC, m.id ASC LIMIT $${params.length + 1}`;
      params.push(limit);
    } else {
      // Start a conversation at its newest messages; older pages are requested with offset.
      // The outer query restores chronological display order for the mobile list.
      query = `SELECT * FROM (${query} ORDER BY m.created_at DESC, m.id DESC LIMIT $2 OFFSET $3) recent ORDER BY created_at ASC, id ASC`;
      params.push(limit, offset);
    }
    const result = await pool.query(query, params);
    const messages = result.rows.map(row => {
      const msg = { ...row };
      if (msg.offer_product_id) {
        msg.offer_data = {
          productId: msg.offer_product_id,
          productName: msg.offer_product_name,
          offeredPrice: parseFloat(msg.offer_offered_price),
          listPrice: parseFloat(msg.offer_list_price),
          status: msg.offer_status,
          negotiationRound: msg.offer_negotiation_round || 1,
          buyerId: msg.offer_buyer_id,
          sellerId: msg.offer_seller_id,
          expiresAt: msg.offer_expires_at,
        };
      }
      delete msg.offer_product_id;
      delete msg.offer_product_name;
      delete msg.offer_offered_price;
      delete msg.offer_list_price;
      delete msg.offer_status;
      delete msg.offer_negotiation_round;
      delete msg.offer_buyer_id;
      delete msg.offer_seller_id;
      delete msg.offer_expires_at;
      return msg;
    });
    let product = null;
    if (conv.rows[0].product_id) {
      const productResult = await pool.query(
        `SELECT p.id, p.name, p.price, p.stock,
                (SELECT image_url FROM product_images WHERE product_id = p.id ORDER BY is_primary DESC, display_order ASC LIMIT 1) AS image_url
         FROM products p WHERE p.id = $1`,
        [conv.rows[0].product_id]
      );
      product = productResult.rows[0] || null;
    }
    res.json({ messages, context: { product } });
  } catch (err) {
    console.error('Messages fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/conversations/:id/messages', authRequired, msgLimiter, dobRequired, async (req, res) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id)) {
    return res.status(404).json({ error: 'Conversation not found' });
  }
  const { content, imageUrl, messageType } = req.body;
  const msgType = messageType || 'text';
  if (!['text', 'image', 'offer'].includes(msgType)) return res.status(400).json({ error: 'Invalid message type' });
  if (msgType === 'image' && !imageUrl) return res.status(400).json({ error: 'Image URL required for image messages' });
  if (msgType === 'text' && (!content || !content.trim())) return res.status(400).json({ error: 'Message content required' });
  if (content && content.length > 5000) return res.status(400).json({ error: 'Message too long (max 5000 characters)' });
  try {
    const conv = await pool.query(
      'SELECT * FROM conversations WHERE id = $1 AND (buyer_id = $2 OR seller_id = $2)',
      [req.params.id, req.user.id]
    );
    if (conv.rows.length === 0) return res.status(404).json({ error: 'Conversation not found' });
    const storedContent = msgType === 'image' ? null : content?.trim() || null;
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
    const senderInfo = (await pool.query('SELECT full_name, avatar_url FROM users WHERE id = $1', [req.user.id])).rows[0];
    const senderName = senderInfo?.full_name || 'Someone';
    const preview = content?.trim() ? (content.trim().length > 80 ? content.trim().substring(0, 80) + '...' : content.trim()) : '\ud83d\udcf7 Photo';
    const notifData = { type: 'new_message', conversationId: req.params.id, senderId: req.user.id, senderName };
    if (senderInfo?.avatar_url) notifData.image = senderInfo.avatar_url;
    createNotification(recipientId, 'new_message', 'New Message', `${senderName}: ${preview}`, notifData);
    res.status(201).json({ message: result.rows[0] });
  } catch (err) {
    console.error('Message send error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/conversations/unread-count', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT COUNT(*) AS count FROM messages m
       JOIN conversations c ON m.conversation_id = c.id
       WHERE (c.buyer_id = $1 OR c.seller_id = $1)
         AND m.sender_id != $1 AND m.is_read = false`,
      [req.user.id]
    );
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (err) {
    console.error('Unread count error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get conversations with active offers (for Inbox Offers tab)
app.get('/api/conversations/with-offers', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT c.*,
              u.full_name AS other_party_name, u.username AS other_party_username, u.avatar_url AS other_party_avatar,
              u.use_store_identity AS other_party_use_store_identity, u.store_logo_url AS other_party_store_logo_url,
              u.store_name AS other_party_store_name,
              u.seller_tier AS other_party_seller_tier,
              CASE WHEN c.buyer_id = $1 THEN c.seller_id ELSE c.buyer_id END AS other_party_id,
              mo.message_id AS offer_message_id, mo.offered_price, mo.status AS offer_status,
              mo.negotiation_round, mo.product_id,
              p.name AS product_name, mo.expires_at AS offer_expires_at
       FROM conversations c
       JOIN users u ON u.id = CASE WHEN c.buyer_id = $1 THEN c.seller_id ELSE c.buyer_id END
       JOIN message_offers mo ON mo.conversation_id = c.id AND mo.status IN ('pending', 'countered')
       JOIN products p ON p.id = mo.product_id
       WHERE (c.buyer_id = $1 OR c.seller_id = $1)
       ORDER BY mo.expires_at ASC`,
      [req.user.id]
    );
    res.json({ conversations: result.rows });
  } catch (err) {
    console.error('Offer conversations fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ───── Typing Indicator (in-memory, 5s TTL) ─────
const typingUsers = new Map();
function getTypingKey(convId, userId) { return `${convId}:${userId}`; }

app.post('/api/conversations/:id/typing', authRequired, async (req, res) => {
  const key = getTypingKey(req.params.id, req.user.id);
  typingUsers.set(key, Date.now());
  setTimeout(() => { typingUsers.delete(key); }, 5000);
  res.json({ ok: true });
});

app.get('/api/conversations/:id/typing', authRequired, async (req, res) => {
  try {
    const convResult = await pool.query(
      'SELECT buyer_id, seller_id FROM conversations WHERE id = $1', [req.params.id]
    );
    if (!convResult.rows.length) return res.json({ typing: false });
    const { buyer_id, seller_id } = convResult.rows[0];
    if (req.user.id !== buyer_id && req.user.id !== seller_id) return res.json({ typing: false });
    const otherUserId = req.user.id === buyer_id ? seller_id : buyer_id;
    const key = getTypingKey(req.params.id, otherUserId);
    const lastTyped = typingUsers.get(key);
    const typing = lastTyped && (Date.now() - lastTyped < 5000);
    res.json({ typing: !!typing });
  } catch (err) {
    console.error('Typing status error:', err);
    res.json({ typing: false });
  }
});

// ───── Structured Offer Routes ─────

// Send an offer in a conversation
app.post('/api/conversations/:id/offer', authRequired, msgLimiter, async (req, res) => {
  const client = await pool.connect();
  try {
    const { productId, productName, offeredPrice, listPrice } = req.body;
    if (!productId || !offeredPrice || offeredPrice <= 0) {
      return res.status(400).json({ error: 'Valid productId and offeredPrice required' });
    }

    await client.query('BEGIN');
    const conv = await client.query(
      'SELECT * FROM conversations WHERE id = $1 AND (buyer_id = $2 OR seller_id = $2) FOR UPDATE',
      [req.params.id, req.user.id]
    );
    if (conv.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Conversation not found' }); }

    const conversation = conv.rows[0];
    const buyerId = conversation.buyer_id;
    const sellerId = conversation.seller_id;

    // Only the buyer can send offers
    if (req.user.id !== buyerId) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Only the buyer can send offers' });
    }

    // Validate product belongs to this conversation's seller
    const product = await client.query(
      'SELECT id, price, stock, seller_id, name FROM products WHERE id = $1 AND is_available = true',
      [productId]
    );
    if (product.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Product not found or unavailable' }); }
    if (product.rows[0].seller_id !== sellerId) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Product does not belong to this seller' });
    }
    if (product.rows[0].stock <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Product is out of stock' });
    }

    // Check for existing pending offer on this product from this buyer in this conversation
    const existingOffer = await client.query(
      "SELECT id FROM message_offers WHERE product_id = $1 AND buyer_id = $2 AND conversation_id = $3 AND status = 'pending'",
      [productId, buyerId, req.params.id]
    );
    if (existingOffer.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'You already have a pending offer for this product' });
    }

    // Create the message
    const msgResult = await client.query(
      `INSERT INTO messages (conversation_id, sender_id, content, message_type) VALUES ($1, $2, NULL, 'offer') RETURNING *`,
      [req.params.id, req.user.id]
    );
    const message = msgResult.rows[0];

    // Create the offer record
    const offerResult = await client.query(
      `INSERT INTO message_offers (message_id, conversation_id, product_id, buyer_id, seller_id, offered_price, list_price)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [message.id, req.params.id, productId, buyerId, sellerId, offeredPrice, listPrice]
    );
    const offer = offerResult.rows[0];

    // Update conversation last_message_at
    await client.query('UPDATE conversations SET last_message_at = CURRENT_TIMESTAMP WHERE id = $1', [req.params.id]);
    await client.query('COMMIT');
    client.release();

    // Notify seller
    const buyerInfo = await pool.query('SELECT full_name FROM users WHERE id = $1', [buyerId]);
    const buyerName = buyerInfo.rows[0]?.full_name || 'A buyer';
    createNotification(sellerId, 'new_message', 'New Offer',
      `${buyerName} offered G ${offeredPrice} for ${productName || product.rows[0].name}`,
      { conversationId: req.params.id, senderId: buyerId, senderName: buyerName });

    res.status(201).json({
      message: { ...message, offer_data: {
        productId: offer.product_id,
        productName: productName || product.rows[0].name,
        offeredPrice: parseFloat(offer.offered_price),
        listPrice: parseFloat(offer.list_price),
        status: offer.status,
        negotiationRound: 1,
      }}
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    client.release();
    console.error('Send offer error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Respond to an offer (accept/decline)
app.post('/api/offers/:messageId/respond', authRequired, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { action } = req.body;
    if (!action || !['accepted', 'declined'].includes(action)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Action must be "accepted" or "declined"' });
    }

    const offerRes = await client.query(
      'SELECT mo.*, m.conversation_id FROM message_offers mo JOIN messages m ON mo.message_id = m.id WHERE mo.message_id = $1 FOR UPDATE',
      [req.params.messageId]
    );
    if (offerRes.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Offer not found' }); }

    const offer = offerRes.rows[0];

    // Verify conversation membership
    const convCheck = await client.query(
      'SELECT 1 FROM conversations WHERE id = $1 AND (buyer_id = $2 OR seller_id = $2)',
      [offer.conversation_id, req.user.id]
    );
    if (convCheck.rows.length === 0) { await client.query('ROLLBACK'); return res.status(403).json({ error: 'Not a member of this conversation' }); }

    const sellerResponding = req.user.id === offer.seller_id && offer.status === 'pending';
    const buyerRespondingToCounter = req.user.id === offer.buyer_id && offer.status === 'countered';
    if (!sellerResponding && !buyerRespondingToCounter) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Only the recipient can respond to this offer' });
    }

    if (offer.expires_at && new Date(offer.expires_at) < new Date()) {
      await client.query("UPDATE message_offers SET status = 'expired' WHERE message_id = $1", [req.params.messageId]);
      await client.query('COMMIT');
      return res.status(400).json({ error: 'Offer has expired' });
    }

    // Update offer status
    await client.query(
      'UPDATE message_offers SET status = $1, responded_at = CURRENT_TIMESTAMP WHERE message_id = $2',
      [action, req.params.messageId]
    );

    // Send a system message in the conversation
    const responderInfo = await client.query('SELECT full_name FROM users WHERE id = $1', [req.user.id]);
    const responderName = responderInfo.rows[0]?.full_name || 'Seller';
    const productInfo = await client.query('SELECT name FROM products WHERE id = $1', [offer.product_id]);
    const productName = productInfo.rows[0]?.name || 'the item';
    const systemContent = action === 'accepted'
      ? `Offer accepted — you can now check out "${productName}" at G ${offer.offered_price}`
      : `Offer declined for "${productName}"`;

    await client.query(
      `INSERT INTO messages (conversation_id, sender_id, content, message_type) VALUES ($1, $2, $3, 'text')`,
      [offer.conversation_id, req.user.id, systemContent]
    );
    await client.query('UPDATE conversations SET last_message_at = CURRENT_TIMESTAMP WHERE id = $1', [offer.conversation_id]);
    await client.query('COMMIT');
    client.release();

    // Notify the other participant.
    const recipientId = req.user.id === offer.buyer_id ? offer.seller_id : offer.buyer_id;
    const buyerNotifMsg = action === 'accepted'
      ? `Your offer of G ${offer.offered_price} for "${productName}" was accepted! You can now check out at the agreed price.`
      : `Your offer of G ${offer.offered_price} for "${productName}" was declined.`;
    createNotification(recipientId, 'new_message',
      action === 'accepted' ? 'Offer Accepted' : 'Offer Declined',
      buyerNotifMsg,
      { conversationId: offer.conversation_id, senderId: req.user.id, senderName: responderName });

    res.json({ success: true, status: action });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    client.release();
    console.error('Respond to offer error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// A seller can counter directly on the structured offer card. The buyer can then
// accept or decline the revised price with the existing response endpoint.
// Max 3 negotiation rounds per offer.
app.post('/api/offers/:messageId/counter', authRequired, msgLimiter, async (req, res) => {
  const client = await pool.connect();
  try {
    const offeredPrice = Number(req.body.offeredPrice);
    if (!Number.isFinite(offeredPrice) || offeredPrice <= 0) return res.status(400).json({ error: 'A valid counter price is required' });
    await client.query('BEGIN');
    const result = await client.query(
      'SELECT mo.*, m.conversation_id FROM message_offers mo JOIN messages m ON m.id = mo.message_id WHERE mo.message_id = $1 FOR UPDATE',
      [req.params.messageId]
    );
    const offer = result.rows[0];
    if (!offer) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Offer not found' }); }
    if (offer.seller_id !== req.user.id || !['pending', 'countered'].includes(offer.status)) {
      await client.query('ROLLBACK'); return res.status(403).json({ error: 'This offer cannot be countered' });
    }
    if (offer.expires_at && new Date(offer.expires_at) < new Date()) {
      await client.query('ROLLBACK'); return res.status(400).json({ error: 'Offer has expired' });
    }
    const currentRound = offer.negotiation_round || 1;
    if (currentRound >= 3) {
      await client.query('ROLLBACK'); return res.status(400).json({ error: 'Maximum 3 negotiation rounds reached. Accept, decline, or let the buyer send a new offer.' });
    }
    await client.query(
      "UPDATE message_offers SET offered_price = $1, status = 'countered', negotiation_round = $2, responded_at = CURRENT_TIMESTAMP, expires_at = CURRENT_TIMESTAMP + INTERVAL '48 hours' WHERE message_id = $3",
      [offeredPrice, currentRound + 1, req.params.messageId]
    );
    await client.query("INSERT INTO messages (conversation_id, sender_id, content, message_type) VALUES ($1, $2, $3, 'text')", [offer.conversation_id, req.user.id, `Seller countered with G ${offeredPrice} (round ${currentRound + 1}/3)`]);
    await client.query('UPDATE conversations SET last_message_at = CURRENT_TIMESTAMP WHERE id = $1', [offer.conversation_id]);
    await client.query('COMMIT');
    client.release();
    createNotification(offer.buyer_id, 'new_message', 'Counter offer', `The seller countered your offer with G ${offeredPrice}.`, { conversationId: offer.conversation_id, senderId: req.user.id });
    res.json({ success: true, status: 'countered', offeredPrice, negotiationRound: currentRound + 1 });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    client.release();
    console.error('Counter offer error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ───── Offer system: seller items, offer details, expire cron ─────

// Get seller's active items for the offer carousel
app.get('/api/sellers/:id/items', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.id, p.name, p.price, p.stock,
              (SELECT image_url FROM product_images WHERE product_id = p.id ORDER BY is_primary DESC, display_order ASC LIMIT 1) AS image_url
       FROM products p
       WHERE p.seller_id = $1 AND p.is_available = true AND p.stock > 0
       ORDER BY p.created_at DESC
       LIMIT 20`,
      [req.params.id]
    );
    res.json({ items: result.rows });
  } catch (err) {
    console.error('Seller items fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get offer details by message ID
app.get('/api/offers/:messageId', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT mo.*, p.name AS product_name,
              (SELECT image_url FROM product_images WHERE product_id = mo.product_id ORDER BY is_primary DESC, display_order ASC LIMIT 1) AS product_image,
              bu.full_name AS buyer_name, bu.avatar_url AS buyer_avatar, bu.seller_tier AS buyer_tier,
              su.full_name AS seller_name, su.avatar_url AS seller_avatar, su.seller_tier AS seller_tier,
              su.use_store_identity AS seller_use_store_identity, su.store_logo_url AS seller_store_logo_url
       FROM message_offers mo
       JOIN products p ON p.id = mo.product_id
       JOIN messages m ON m.id = mo.message_id
       JOIN conversations c ON c.id = mo.conversation_id
       JOIN users bu ON bu.id = mo.buyer_id
       JOIN users su ON su.id = mo.seller_id
       WHERE mo.message_id = $1 AND (c.buyer_id = $2 OR c.seller_id = $2)`,
      [req.params.messageId, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Offer not found' });
    const o = result.rows[0];
    res.json({
      offer: {
        messageId: o.message_id,
        productId: o.product_id,
        productName: o.product_name,
        productImage: o.product_image,
        offeredPrice: parseFloat(o.offered_price),
        listPrice: parseFloat(o.list_price),
        status: o.status,
        negotiationRound: o.negotiation_round || 1,
        buyerId: o.buyer_id,
        sellerId: o.seller_id,
        buyerName: o.buyer_name,
        buyerAvatar: o.buyer_avatar,
        sellerName: o.seller_name,
        sellerAvatar: o.seller_avatar,
        sellerTier: o.seller_tier,
        sellerUseStoreIdentity: o.seller_use_store_identity,
        sellerStoreLogoUrl: o.seller_store_logo_url,
        expiresAt: o.expires_at,
        createdAt: o.created_at,
        respondedAt: o.responded_at,
      }
    });
  } catch (err) {
    console.error('Offer details error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ───── Payment routes ─────

// Persist each paid basket as unordered product pairs.  This is deliberately
// transaction-bound and idempotent with the paid-status transition above.
async function recordProductCooccurrences(orderId, client) {
  const { rows } = await client.query(
    'SELECT DISTINCT product_id FROM order_items WHERE order_id = $1 ORDER BY product_id',
    [orderId]
  );
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      await client.query(
        `INSERT INTO product_cooccurrences (product_a_id, product_b_id, purchase_count, last_purchased_at)
         VALUES ($1, $2, 1, CURRENT_TIMESTAMP)
         ON CONFLICT (product_a_id, product_b_id) DO UPDATE SET
           purchase_count = product_cooccurrences.purchase_count + 1,
           last_purchased_at = CURRENT_TIMESTAMP`,
        [rows[i].product_id, rows[j].product_id]
      );
    }
  }
}

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

    // Use unique referenceId to avoid 409 conflicts on retry
    const referenceId = `${orderId}_${Date.now()}`;

    let moncashRes = await fetch(
      process.env.MONCASH_PAY_CREATE_URL || 'https://hvlmeoqyxaguzcujpmit.supabase.co/functions/v1/pay-create',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.MCC_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: Math.round(parseFloat(order.total_amount)),
          referenceId,
          returnUrl: returnUrl?.startsWith('https://') ? returnUrl : `${process.env.PRODUCTION_URL || 'https://maurmaket.onrender.com'}/payment/return?order=${orderId}`,
        }),
        signal: AbortSignal.timeout(15000),
      }
    );

    // Auto-retry once on 409 (referenceId conflict)
    if (moncashRes.status === 409) {
      const retryRef = `${orderId}_retry_${Date.now()}`;
      moncashRes = await fetch(
        process.env.MONCASH_PAY_CREATE_URL || 'https://hvlmeoqyxaguzcujpmit.supabase.co/functions/v1/pay-create',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.MCC_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            amount: Math.round(parseFloat(order.total_amount)),
            referenceId: retryRef,
            returnUrl: returnUrl?.startsWith('https://') ? returnUrl : `${process.env.PRODUCTION_URL || 'https://maurmaket.onrender.com'}/payment/return`,
          }),
          signal: AbortSignal.timeout(15000),
        }
      );
      if (moncashRes.ok) {
        const retryData = await moncashRes.json();
        if (retryData.paymentUrl) {
          await pool.query('UPDATE orders SET moncash_reference = $1 WHERE id = $2', [retryRef, orderId]);
          return res.json({ paymentUrl: retryData.paymentUrl });
        }
      }
    }

    if (!moncashRes.ok) {
      const errorText = await moncashRes.text();
      console.error(`MonCashConnect HTTP ${moncashRes.status}:`, errorText);
      if (moncashRes.status === 401) return res.status(502).json({ error: 'Payment provider auth error' });
      if (moncashRes.status === 400) return res.status(502).json({ error: 'Invalid payment request' });
      return res.status(502).json({ error: 'Payment provider error' });
    }
    const data = await moncashRes.json();
    if (!data.paymentUrl) {
      console.error('MonCashConnect missing paymentUrl:', data);
      return res.status(502).json({ error: 'Payment provider error' });
    }

    await pool.query('UPDATE orders SET moncash_reference = $1 WHERE id = $2', [referenceId, orderId]);
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
      const payStatusUrl = (process.env.MONCASH_PAY_CREATE_URL || 'https://api.moncashconnect.com/v1/pay-create').replace('pay-create', 'pay-status') + `?referenceId=${encodeURIComponent(referenceId)}`;
      const moncashRes = await fetch(payStatusUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${process.env.MCC_KEY}`,
        },
        signal: AbortSignal.timeout(15000),
      });

      if (moncashRes.ok) {
        const data = await moncashRes.json();
        if (data.status === 'completed' || data.paid === true) {
          // Webhook fallback: if webhook didn't fire, process payment here
          let fallbackProcessed = false;
          if (order.status === 'pending') {
            try {
              const client = await pool.connect();
              try {
                await client.query('BEGIN');
                const updateResult = await client.query(
                  `UPDATE orders SET status = 'paid', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'pending'`,
                  [order.id]
                );
                if (updateResult.rowCount === 0) {
                  await client.query('ROLLBACK');
                } else {
                  await logOrderEvent(order.id, 'payment_received', null, 'pending', 'paid', 'Payment confirmed via pay-status poll', client);
                  await reserveOrderStock(client, order.id);
                  await recordProductCooccurrences(order.id, client);
                  const items = { rows: await getSellerPaymentAllocations(client, order.id) };
                  for (const item of items.rows) {
                    if (item.seller_id) {
                      const grossAmount = parseFloat(item.paid_total);
                      const tierRes = await client.query('SELECT seller_tier FROM users WHERE id = $1', [item.seller_id]);
                      const sellerTier = tierRes.rows[0]?.seller_tier || 'none';
                      const rate = getCommissionRate(sellerTier);
                      const commission = Math.round(grossAmount * rate * 100) / 100;
                      const net = Math.round((grossAmount - commission) * 100) / 100;
                      await client.query(
                        `INSERT INTO order_escrow (order_id, seller_id, gross_amount, commission_amount, net_amount, status)
                         VALUES ($1, $2, $3, $4, $5, 'held') ON CONFLICT (order_id, seller_id) DO UPDATE SET gross_amount = $3, commission_amount = $4, net_amount = $5, status = 'held'`,
                        [order.id, item.seller_id, grossAmount, commission, net]
                      );
                      await client.query(
                        `INSERT INTO platform_revenue (order_id, seller_id, seller_tier, gross_amount, commission_rate, commission_amount, platform_fee, net_to_seller)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                        [order.id, item.seller_id, sellerTier, grossAmount, rate, commission, commission, net]
                      );
                    }
                  }
                  await client.query('COMMIT');
                  client.release();
                  fallbackProcessed = true;
                  console.log(`[PAY-STATUS] Order ${order.id} processed (webhook fallback)`);
                  const sellerIds = items.rows.map(r => r.seller_id).filter(Boolean);
                  for (const sid of sellerIds) {
                    createNotification(sid, 'order_status', 'Payment Received', 'Payment held in escrow until exchange confirmed', { orderId: order.id });
                  }
                  createNotification(order.buyer_id || req.user.id, 'payment_confirmed', 'Payment Confirmed', 'Your payment was successful.', { orderId: order.id });
                }
              } catch (e) {
                try { await client.query('ROLLBACK'); } catch {}
                client.release();
                console.error('[PAY-STATUS] Processing error:', e.message);
              }
            } catch (e) {
              console.error('[PAY-STATUS] Fallback processing failed:', e.message);
            }
          }
          if (!fallbackProcessed && order.status === 'pending') {
            return res.status(503).json({ status: 'pending', error: 'Payment is confirmed but still being reconciled' });
          }
          return res.json({ status: 'paid' });
        } else if (data.status === 'failed' || data.status === 'expired') {
          await pool.query(
            `UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
             WHERE id = $1 AND status = 'pending'`,
            [order.id]
          );
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
  if (Math.abs(age) > 300) {
    return res.status(401).json({ error: 'Webhook timestamp expired' });
  }
  const expected = 'sha256=' + crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let { event, reference, id: eventId } = req.body;
  console.log('MonCash webhook:', JSON.stringify(req.body));

  if (!reference) return res.status(400).json({ error: 'reference required' });

  // Strip suffix from referenceId — our references are "${orderId}_${timestamp}" or "${orderId}_retry_${timestamp}"
  // MonCash echoes it back in the webhook, but our order IDs are pure UUIDs (36 chars)
  // For payment events: extract the UUID prefix (first 36 chars) regardless of suffix format
  // For payout events: keep the full reference (e.g. "refund_uuid", "cancel_refund_uuid")
  const isPaymentEvent = event === 'payment.completed' || event === 'payment.failed';
  if (isPaymentEvent && reference.length > 36) {
    const baseReference = reference.substring(0, 36);
    console.log(`Webhook: stripped "${reference}" → "${baseReference}"`);
    reference = baseReference;
  }

  // Idempotency — skip if this event was already processed
  if (eventId) {
    const already = await pool.query('SELECT 1 FROM processed_events WHERE id = $1', [eventId]);
    if (already.rows.length > 0) {
      return res.json({ received: true, idempotent: true });
    }
  }

  try {
    if (event === 'payment.completed') {
      // Subscription payments (sub_*) are handled by /api/subscriptions/webhook
      if (reference && reference.startsWith('sub_')) {
        return res.json({ received: true, skipped: 'subscription' });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // Register event as processed INSIDE the transaction (prevent double-credit on replay)
        // Also prevents data loss if the transaction rolls back
        if (eventId) {
          await client.query('INSERT INTO processed_events (id) VALUES ($1) ON CONFLICT DO NOTHING', [eventId]);
        }
        const updateResult = await client.query(
          `UPDATE orders SET status = 'paid', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'pending'`,
          [reference]
        );
        if (updateResult.rowCount === 0) {
          await client.query('ROLLBACK');
          return res.json({ received: true, already_processed: true });
        }
        await logOrderEvent(reference, 'payment_received', null, 'pending', 'paid', 'Payment completed via MonCash', client);

        await recordProductCooccurrences(reference, client);

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
            // Insufficient stock — rollback payment and refund buyer
            await client.query('ROLLBACK');
            if (eventId) {
              await pool.query('INSERT INTO processed_events (id) VALUES ($1) ON CONFLICT DO NOTHING', [eventId]);
            }
            console.error(`Order ${reference}: insufficient stock for product ${oi.product_id}, processing refund`);
            await pool.query("UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'pending'", [reference]);
            const orderFull = await pool.query('SELECT buyer_id FROM orders WHERE id = $1', [reference]);
            const buyerId = orderFull.rows[0]?.buyer_id;
            if (buyerId) {
              const buyerPhoneRes = await pool.query('SELECT phone FROM users WHERE id = $1', [buyerId]);
              const buyerPhone = buyerPhoneRes.rows[0]?.phone;
              const totalRes = await pool.query('SELECT total_amount FROM orders WHERE id = $1', [reference]);
              const refundAmount = parseFloat(totalRes.rows[0]?.total_amount || 0);
              if (refundAmount > 0 && buyerPhone) {
                try {
                  const payoutRes = await fetch(
                    process.env.MONCASH_PAYOUT_CREATE_URL || 'https://hvlmeoqyxaguzcujpmit.supabase.co/functions/v1/payout-create',
                    {
                      method: 'POST',
                      headers: { 'Authorization': `Bearer ${process.env.MCC_KEY}`, 'Content-Type': 'application/json' },
                      body: JSON.stringify({ amount: Math.round(refundAmount), moncashNumber: buyerPhone, referenceId: `stock_refund_${reference}` }),
                      signal: AbortSignal.timeout(15000),
                    }
                  );
                  if (payoutRes.ok) console.log(`[WEBHOOK] Stock refund G ${refundAmount} sent to buyer ${buyerPhone}`);
                  else console.error(`[WEBHOOK] Stock refund payout failed: ${await payoutRes.text()}`);
                } catch (e) { console.error('[WEBHOOK] Stock refund payout error:', e.message); }
              }
              createNotification(buyerId, 'order_status', 'Payment Refunded',
                `Your order could not be fulfilled due to stock issues. G ${refundAmount.toFixed(0)} refunded.`, { orderId: reference });
            }
            return res.status(200).json({ received: true, stock_issue: true, refunded: true });
          }
          await client.query('UPDATE products SET stock = stock - $1 WHERE id = $2', [oi.quantity, oi.product_id]);
          // Check if product sold out
          const stockRes = await client.query('SELECT stock, seller_id, name FROM products WHERE id = $1', [oi.product_id]);
          if (stockRes.rows.length > 0 && stockRes.rows[0].stock <= 0) {
            createNotification(stockRes.rows[0].seller_id, 'product_sold_out', 'Product Sold Out',
              `"${stockRes.rows[0].name}" is now out of stock.`, { productId: oi.product_id });
          }
        }

        const items = { rows: await getSellerPaymentAllocations(client, reference) };
        for (const item of items.rows) {
          if (item.seller_id) {
            const grossAmount = parseFloat(item.paid_total);
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

            console.log(`  Escrow: seller ${item.seller_id} (${sellerTier}): gross G ${grossAmount}, commission ${rate * 100}% = G ${commission}, net G ${net} — HELD`);
          }
        }
        await client.query('COMMIT');
        client.release();
        const sellerIds = items.rows.map(r => r.seller_id).filter(Boolean);
        for (const sid of sellerIds) {
          createNotification(sid, 'order_status', 'Payment Received', `Payment for order is held in escrow until exchange is confirmed`, { orderId: reference });
        }
        // Notify buyer that payment was successful
        const buyerOrder = await pool.query('SELECT buyer_id FROM orders WHERE id = $1', [reference]);
        if (buyerOrder.rows.length > 0) {
          const totalPaid = items.rows.reduce((sum, r) => sum + parseFloat(r.paid_total), 0);
          createNotification(buyerOrder.rows[0].buyer_id, 'payment_confirmed', 'Payment Confirmed',
            `Your payment of G ${totalPaid.toFixed(0)} was successful.`, { orderId: reference });
        }
        console.log(`Order ${reference} paid, funds held in escrow`);
      } catch (e) {
        try { await client.query('ROLLBACK'); } catch {}
        client.release();
        throw e;
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
        // Only cancel if still pending — avoid overwriting a 'paid' status from a concurrent completed webhook
        await client.query("UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'pending'", [reference]);
        await logOrderEvent(reference, 'status_change', null, 'pending', 'cancelled', 'Payment failed', client);
        await client.query('COMMIT');
        client.release();
      } catch (e) {
        try { await client.query('ROLLBACK'); } catch {}
        client.release();
        throw e;
      }
      console.log(`Order ${reference} cancelled via webhook`);
      // Notify buyer of payment failure
      const failedOrder = await pool.query('SELECT buyer_id FROM orders WHERE id = $1', [reference]);
      if (failedOrder.rows.length > 0) {
        createNotification(failedOrder.rows[0].buyer_id, 'payment_failed', 'Payment Failed',
          'Your payment could not be processed. The order has been cancelled. Please try again.', { orderId: reference });
      }
    } else if (event === 'payout.completed') {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        if (eventId) {
          const already = await client.query('SELECT 1 FROM processed_events WHERE id = $1', [eventId]);
          if (already.rows.length > 0) { await client.query('ROLLBACK'); return res.json({ received: true, idempotent: true }); }
          await client.query('INSERT INTO processed_events (id) VALUES ($1) ON CONFLICT DO NOTHING', [eventId]);
        }
        const payout = await client.query('SELECT status FROM payouts WHERE moncash_reference = $1 FOR UPDATE', [reference]);
        if (payout.rows.length > 0 && payout.rows[0].status !== 'completed') {
          await client.query(
            `UPDATE payouts SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE moncash_reference = $1`,
            [reference]
          );
        }
        await client.query('COMMIT');
        console.log(`Payout ${reference} completed via webhook`);
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    } else if (event === 'payout.failed') {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        if (eventId) {
          const already = await client.query('SELECT 1 FROM processed_events WHERE id = $1', [eventId]);
          if (already.rows.length > 0) { await client.query('ROLLBACK'); return res.json({ received: true, idempotent: true }); }
          await client.query('INSERT INTO processed_events (id) VALUES ($1) ON CONFLICT DO NOTHING', [eventId]);
        }
        const payout = await client.query('SELECT seller_id, amount, status FROM payouts WHERE moncash_reference = $1 FOR UPDATE', [reference]);
        if (payout.rows.length > 0 && payout.rows[0].status !== 'failed') {
          const { seller_id, amount } = payout.rows[0];
          await client.query(
            'UPDATE seller_balances SET balance = balance + $1, total_paid_out = total_paid_out - $1, updated_at = CURRENT_TIMESTAMP WHERE seller_id = $2',
            [amount, seller_id]
          );
        }
        await client.query(
          `UPDATE payouts SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE moncash_reference = $1`,
          [reference]
        );
        await client.query('COMMIT');
        client.release();
        console.log(`Payout ${reference} failed, balance refunded`);
        // Notify seller of payout failure
        if (payout.rows.length > 0) {
          createNotification(payout.rows[0].seller_id, 'payout_failed', 'Payout Failed',
            `Your payout of G ${parseFloat(payout.rows[0].amount).toFixed(0)} could not be processed. The amount has been returned to your balance.`, { payoutId: reference });
        }
      } catch (e) {
        try { await client.query('ROLLBACK'); } catch {}
        client.release();
        throw e;
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
      `SELECT * FROM payouts WHERE seller_id = $1 ORDER BY created_at DESC LIMIT 50`,
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

  const MIN_PAYOUT = parseFloat(process.env.MIN_PAYOUT_AMOUNT || '100');
  if (amount < MIN_PAYOUT) {
    return res.status(400).json({ error: `Minimum payout is G ${MIN_PAYOUT}` });
  }

  const c = await pool.connect();
  try {
    await c.query('BEGIN');

    const balanceResult = await c.query(
      'SELECT balance FROM seller_balances WHERE seller_id = $1 FOR UPDATE',
      [req.user.id]
    );

    // ── MCC Serialization: reject if a payout is already in-flight ──
    const inflightCheck = await c.query(
      "SELECT id FROM payouts WHERE seller_id = $1 AND status = 'processing'",
      [req.user.id]
    );
    if (inflightCheck.rows.length > 0) {
      await c.query('ROLLBACK');
      return res.status(409).json({
        error: 'payout_in_progress',
        message: 'You already have a payout being processed. Please wait for it to complete before requesting another.'
      });
    }

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
    c.release();

    // Call MonCashConnect payout API
    try {
      const mccRes = await fetch(
        process.env.MONCASH_PAYOUT_CREATE_URL || 'https://hvlmeoqyxaguzcujpmit.supabase.co/functions/v1/payout-create',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.MCC_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ amount: Math.round(amount), moncashNumber: phone, referenceId: payout.id }),
          signal: AbortSignal.timeout(15000),
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
      console.error(`[MCC-ALERT] Payout API failure: HTTP ${mccRes.status}`, errorText);
      // Extract MCC-specific reason if available
      let reason = 'Payout failed. Please try again later.';
      try {
        const parsed = JSON.parse(errorText);
        if (parsed.reason) reason = parsed.reason;
        else if (parsed.message) reason = parsed.message;
      } catch {}
      const refundC = await pool.connect();
      try {
        await refundPayout(refundC, req.user.id, amount, payout.id, `MonCashConnect returned ${mccRes.status}: ${errorText}`);
      } finally {
        refundC.release();
      }
      return res.status(502).json({ error: 'payout_failed', message: reason });
    } catch (fetchErr) {
      console.error('[MCC-ALERT] Payout network timeout/error:', fetchErr.message);
      const refundC = await pool.connect();
      try {
        await refundPayout(refundC, req.user.id, amount, payout.id, fetchErr.message);
      } finally {
        refundC.release();
      }
      return res.status(502).json({ error: 'payout_network_error', message: 'Could not reach MonCash. Your balance has been restored.' });
    }
  } catch (err) {
    try { await c.query('ROLLBACK'); } catch {}
    c.release();
    console.error('Payout request error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Dedicated sale lifecycle endpoint
app.post('/api/products/:id/sale', authRequired, verifiedSellerRequired, async (req, res) => {
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

// ───── Health check ─────

// ───── ID Verification ─────

// OCR.space API helper
async function ocrSpaceParse(imageUrl) {
  const apiKey = process.env.OCR_SPACE_KEY;
  if (!apiKey) throw new Error('OCR_SPACE_KEY not configured');
  if (!isAllowedImageUrl(imageUrl)) throw new Error('Image URL not from allowed host');
  const resp = await fetch(
    `https://api.ocr.space/parse/imageurl?apikey=${encodeURIComponent(apiKey)}&url=${encodeURIComponent(imageUrl)}&language=eng&OCREngine=2`,
    { signal: AbortSignal.timeout(30000) }
  );
  if (!resp.ok) throw new Error(`OCR.space HTTP ${resp.status}`);
  const data = await resp.json();
  if (data.IsErroredOnProcessing) throw new Error(data.ErrorMessage?.[0] || 'OCR processing failed');
  return data.ParsedResults?.[0]?.ParsedText || '';
}

function extractCinFields(text) {
  const fields = {};
  // Split by newlines AND pipe separators to get individual tokens
  const rawTokens = text.split(/\r?\n|(?=\|)/).map(l => l.replace(/^\|\s*/, '').trim()).filter(Boolean);
  const fullText = rawTokens.join(' ');

  // CIN number: look for 8-12 digit number
  const cinMatch = fullText.match(/\b(\d{8,12})\b/);
  fields.cinNumber = cinMatch ? cinMatch[1] : null;

  // Date of Birth — grab the first date on the card
  const dobMatch = fullText.match(/(\d{2}[\/\-]\d{2}[\/\-]\d{4})/);
  fields.dateOfBirth = dobMatch ? dobMatch[1] : null;

  // Name extraction — look for label variations
  // Haitian CIN uses labels like: "Nom / Siyal", "Nom / Siyati", "Nom / Sies", "Prénoms / Mon", "Prénom / Non"
  const nameIdx = rawTokens.findIndex(t => /^Nom\s*[\/|]/i.test(t));
  const prenomIdx = rawTokens.findIndex(t => /^Pr[eé]n[oa]ms?\s*[\/|]/i.test(t));

  if (nameIdx >= 0) {
    const lastName = rawTokens[nameIdx + 1] || '';
    const skipWords = /R[ÉE]PUBLIQUE|HAITI|REPIBLIK|DAVITI|DAYITI|CARTE|IDENTIFICATION|NATIONALE|KAT|IDANTIFIKASYON|NAS.*AL|Nom|Pr[eé]n|Pana[mn]\s*\/|S[yi]n[tq]|Synt/i;
    const isLabelArtifact = (t) => / \/\ /.test(t) || /^[A-Z]{2,}\s*\/\s*[A-Z]{2,}$/i.test(t);
    let firstNames = '';
    if (prenomIdx >= 0 && prenomIdx < nameIdx) {
      firstNames = rawTokens.slice(prenomIdx + 1, nameIdx).filter(t => !skipWords.test(t) && !isLabelArtifact(t) && t.length >= 2).join(' ');
    } else {
      const beforeName = rawTokens.slice(0, nameIdx);
      firstNames = beforeName.filter(t => t.length >= 2 && !skipWords.test(t) && !isLabelArtifact(t) && !/^[\/|]/.test(t) && !/^\d/.test(t)).join(' ');
    }
    fields.fullName = [lastName, firstNames].filter(Boolean).join(' ').trim();
  } else {
    const skipWords = /R[ÉE]PUBLIQUE|HAITI|REPIBLIK|DAVITI|DAYITI|CARTE|IDENTIFICATION|NATIONALE|KAT|IDANTIFIKASYON|NAS/i;
    const nameTokens = rawTokens.filter(t => t.length >= 2 && !skipWords.test(t) && !/^\d+$/.test(t) && !/[\/|]/.test(t));
    fields.fullName = nameTokens.slice(0, 3).join(' ').trim() || null;
  }

  // Place of birth
  const pobIdx = rawTokens.findIndex(t => /Lieu\s+de\s+(Naissance|Namsance|Nasance)/i.test(t) || /Kote\s+ou\s+f[eé]t/i.test(t) || /Kole\s+ou\s+des/i.test(t) || /es\s+cal\s+for/i.test(t));
  if (pobIdx >= 0) {
    const pob = rawTokens[pobIdx + 1] || '';
    fields.placeOfBirth = pob.replace(/Diet\s+kat\s+la/i, '').trim() || null;
  } else {
    const pobFallback = fullText.match(/(OUEST[\s\-]+PORT[\s\-]*AU[\s\-]*PRINCE|DUEST[\s\-]+PORT[\s\-]*AU[\s\-]*PRINCE|PORT[\s\-]*AU[\s\-]*PRINCE|ARTIBONITE|NORD|SUD|GRANDE[\s\-]*ANSE|NIPPES|CENTER)/i);
    if (pobFallback) {
      fields.placeOfBirth = pobFallback[1].replace(/^DUEST/, 'OUEST').trim();
    } else {
      fields.placeOfBirth = null;
    }
  }

  console.log(`🔍 [OCR-PARSE] fullName="${fields.fullName}" dob="${fields.dateOfBirth}" pob="${fields.placeOfBirth}" cin="${fields.cinNumber}"`);
  return fields;
}

function extractSex(text) {
  const sexMatch = text.match(/Sexe\s*[/:]?\s*(M|F)\b/i)
    || text.match(/Seks\s*\n?\s*(M|F)/i)
    || text.match(/\b(MASCULIN|F[ÉE]MININ|MALE|FEMALE)\b/i)
    || text.match(/\d{5,7}(M|F)\d/);
  return sexMatch ? sexMatch[1].toUpperCase() : null;
}

const ALLOWED_IMAGE_DOMAINS = ['bnnluaqrktnrnnfvmqbt.supabase.co', 'i.ibb.co', 'ibb.co'];

function isAllowedImageUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    return ALLOWED_IMAGE_DOMAINS.some(d => parsed.hostname === d || parsed.hostname.endsWith('.' + d));
  } catch { return false; }
}

function normalizeString(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
}

// ───── Didit (0Didit) verification helpers ─────
const DIDIT_BASE = 'https://verification.didit.me';
const DIDIT_MONTHLY_LIMIT = 500;

function getDiditMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

async function checkDiditQuota() {
  if (!process.env.DIDIT_API_KEY) return false;
  try {
    const monthKey = getDiditMonthKey();
    const result = await pool.query('SELECT count FROM didit_usage WHERE month_year = $1', [monthKey]);
    const count = result.rows[0]?.count || 0;
    console.log(`📊 [DIDIT] Quota: ${count}/${DIDIT_MONTHLY_LIMIT} used this month`);
    return count < DIDIT_MONTHLY_LIMIT;
  } catch (err) {
    console.error('Didit quota check error:', err.message);
    return false;
  }
}

async function incrementDiditUsage() {
  const monthKey = getDiditMonthKey();
  await pool.query(
    `INSERT INTO didit_usage (month_year, count) VALUES ($1, 1)
     ON CONFLICT (month_year) DO UPDATE SET count = didit_usage.count + 1`,
    [monthKey]
  );
}

async function diditIdVerify(frontImageUrl, backImageUrl) {
  const form = new FormData();
  const fetchImg = async (url, label) => {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`Failed to fetch ${label}: HTTP ${r.status}`);
    const buf = await r.arrayBuffer();
    const ct = r.headers.get('content-type') || 'image/jpeg';
    return { buf: Buffer.from(buf), ct };
  };
  const [front, back] = await Promise.all([
    fetchImg(frontImageUrl, 'CIN front'),
    backImageUrl ? fetchImg(backImageUrl, 'CIN back') : null,
  ]);
  form.append('front_image', new Blob([front.buf], { type: front.ct }), 'front.jpg');
  if (back) form.append('back_image', new Blob([back.buf], { type: back.ct }), 'back.jpg');
  form.append('save_api_request', 'false');

  console.log(`📡 [DIDIT] Calling ID verification (front=${front.buf.length} bytes${back ? `, back=${back.buf.length} bytes` : ''})`);
  const resp = await fetch(`${DIDIT_BASE}/v3/id-verification/`, {
    method: 'POST',
    headers: { 'x-api-key': process.env.DIDIT_API_KEY },
    body: form,
    signal: AbortSignal.timeout(30000),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Didit ID verify HTTP ${resp.status}: ${body.substring(0, 200)}`);
  }
  return await resp.json();
}

async function diditFaceMatch(selfieUrl, refImageUrl) {
  const form = new FormData();
  const fetchImg = async (url, label) => {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`Failed to fetch ${label}: HTTP ${r.status}`);
    const buf = await r.arrayBuffer();
    const ct = r.headers.get('content-type') || 'image/jpeg';
    return { buf: Buffer.from(buf), ct };
  };
  const [selfie, ref] = await Promise.all([
    fetchImg(selfieUrl, 'selfie'),
    fetchImg(refImageUrl, 'CIN face'),
  ]);
  form.append('user_image', new Blob([selfie.buf], { type: selfie.ct }), 'selfie.jpg');
  form.append('ref_image', new Blob([ref.buf], { type: ref.ct }), 'ref.jpg');
  form.append('face_match_score_decline_threshold', '60');
  form.append('rotate_image', 'true');
  form.append('save_api_request', 'false');

  console.log(`📡 [DIDIT] Calling face match (selfie=${selfie.buf.length} bytes, ref=${ref.buf.length} bytes)`);
  const resp = await fetch(`${DIDIT_BASE}/v3/face-match/`, {
    method: 'POST',
    headers: { 'x-api-key': process.env.DIDIT_API_KEY },
    body: form,
    signal: AbortSignal.timeout(30000),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Didit face match HTTP ${resp.status}: ${body.substring(0, 200)}`);
  }
  return await resp.json();
}

async function tareefCompare(imageUrl1, imageUrl2) {
  const apiKey = process.env.TAREEF_API_KEY;
  if (!apiKey) throw new Error('TAREEF_API_KEY not configured');
  if (!isAllowedImageUrl(imageUrl1) || !isAllowedImageUrl(imageUrl2)) throw new Error('Image URL not from allowed host');
  const fetchImage = async (url, label) => {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`Failed to fetch ${label}: HTTP ${r.status} from ${url.substring(0, 80)}`);
    const contentType = r.headers.get('content-type') || '';
    const buf = await r.arrayBuffer();
    if (buf.byteLength < 100) throw new Error(`${label} image too small (${buf.byteLength} bytes) — likely a broken URL`);
    return { buf, contentType };
  };
  const [img1, img2] = await Promise.all([
    fetchImage(imageUrl1, 'CIN face'),
    fetchImage(imageUrl2, 'selfie'),
  ]);
  console.log(`🔍 [VERIFY] Tareef images fetched: CIN=${img1.buf.byteLength} bytes (${img1.contentType}), selfie=${img2.buf.byteLength} bytes (${img2.contentType})`);

  const getExt = (ct) => {
    if (ct.includes('webp')) return 'image.webp';
    if (ct.includes('png')) return 'image.png';
    return 'image.jpg';
  };

  const form = new FormData();
  form.append('file1', new Blob([img1.buf], { type: img1.contentType || 'image/jpeg' }), getExt(img1.contentType));
  form.append('file2', new Blob([img2.buf], { type: img2.contentType || 'image/jpeg' }), getExt(img2.contentType));
  const resp = await fetch('https://tareef.g4t.io/api/v1/compare', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(30000),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Tareef API HTTP ${resp.status}: ${body.substring(0, 200)}`);
  }
  const data = await resp.json();
  console.log(`🔍 [VERIFY] Tareef response:`, JSON.stringify(data).substring(0, 300));
  if (!data.success) throw new Error(data.status || 'Tareef compare failed');
  return { score: data.similarity || 0, similar: data.match || false };
}

// ── Create Didit hosted verification session (free 500/month) ──
app.post('/api/verification/didit-session', verifyLimiter, authRequired, sellerRequired, async (req, res) => {
  try {
    if (!process.env.DIDIT_API_KEY || !process.env.DIDIT_WORKFLOW_ID) {
      return res.status(503).json({ error: 'Didit not configured' });
    }

    const callbackUrl = `${process.env.PRODUCTION_URL || 'https://maurmaket.onrender.com'}/api/webhooks/didit`;

    const resp = await fetch(`${DIDIT_BASE}/v3/session/`, {
      method: 'POST',
      headers: {
        'x-api-key': process.env.DIDIT_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        workflow_id: process.env.DIDIT_WORKFLOW_ID,
        vendor_data: req.user.id,
        callback: callbackUrl,
        callback_method: 'both',
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      console.error(`❌ [DIDIT] Session create failed: HTTP ${resp.status}: ${body.substring(0, 200)}`);
      return res.status(502).json({ error: 'Failed to create verification session' });
    }

    const session = await resp.json();
    console.log(`✅ [DIDIT] Session created: ${session.session_id} → ${session.url}`);

    // Store session mapping
    await pool.query(
      `INSERT INTO verification_attempts (user_id, status, created_at)
       VALUES ($1, 'pending', NOW())
       ON CONFLICT DO NOTHING`,
      [req.user.id]
    ).catch(() => {});

    res.json({ url: session.url, sessionId: session.session_id });
  } catch (err) {
    console.error(`❌ [DIDIT] Session error:`, err.message);
    res.status(500).json({ error: 'Verification service error' });
  }
});

app.post('/api/verification/submit', verifyLimiter, authRequired, sellerRequired, async (req, res) => {
  const { idFrontUrl, idFaceUrl, idBackUrl, selfieUrl, deleteUrls } = req.body;
  console.log(`🔍 [VERIFY] Submission started for user ${req.user.id}`);
  console.log(`🔍 [VERIFY] Front: ${idFrontUrl ? '✅' : '❌'} | Face: ${idFaceUrl ? '✅' : '❌'} | Back: ${idBackUrl ? '✅' : '❌'} | Selfie: ${selfieUrl ? '✅' : '❌'}`);
  if (!idFrontUrl || !idBackUrl || !selfieUrl) {
    console.log(`❌ [VERIFY] Missing required images`);
    return res.status(400).json({ error: 'CIN front, back, and selfie are required' });
  }

  async function deleteImgbbImage(deleteUrl) {
    if (!deleteUrl || !process.env.IMGBB_KEY) return;
    try {
      await fetch(deleteUrl, { method: 'DELETE', signal: AbortSignal.timeout(5000) });
    } catch { /* best effort — uploads have 1h auto-expiration as fallback */ }
  }

  async function deleteStorageImage(url) {
    if (!url) return;
    try {
      // R2 URL: pub-xxx.r2.dev/key or bucket.r2.dev/key
      if (url.includes('r2.dev') && r2Storage) {
        const key = url.split('.r2.dev/')[1];
        if (key) await r2Storage.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
      }
      // Supabase URL
      else if (url.includes('supabase.co/storage') && supabaseStorage) {
        const key = url.split('/object/public/' + SUPABASE_STORAGE_BUCKET + '/')[1];
        if (key) await supabaseStorage.send(new DeleteObjectCommand({ Bucket: SUPABASE_STORAGE_BUCKET, Key: key }));
      }
    } catch { /* best effort */ }
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
    let ocrResult = null;
    const issues = [];

    const userRes = await pool.query('SELECT full_name FROM users WHERE id = $1', [req.user.id]);
    const userName = normalizeString(userRes.rows[0]?.full_name || '');
    const faceImageUrl = idFaceUrl || idFrontUrl;

    // ── Try Didit first (primary), fall back to OCR.space + Tareef ──
    const useDidit = await checkDiditQuota();
    let verificationProvider = useDidit ? 'didit' : 'tareef';

    if (useDidit) {
      // ═══════════════════ DIDIT PATH ═══════════════════
      console.log(`🚀 [VERIFY] Using Didit (primary)`);

      // Step 1: Didit ID Verification (OCR + fraud checks)
      try {
        const idResult = await diditIdVerify(idFrontUrl, idBackUrl);
        await incrementDiditUsage();
        console.log(`✅ [DIDIT] ID verification status: ${idResult.id_verification?.status}`);

        if (idResult.id_verification?.status === 'Approved') {
          const idv = idResult.id_verification;
          const diditFirstName = idv.first_name || '';
          const diditLastName = idv.last_name || '';
          const diditFullName = `${diditFirstName} ${diditLastName}`.trim();
          const diditDocNumber = idv.document_number || '';
          const diditDob = idv.date_of_birth || '';
          const diditNationality = idv.nationality || '';

          ocrResult = {
            fullName: diditFullName,
            cinNumber: diditDocNumber,
            dateOfBirth: diditDob,
            placeOfBirth: diditNationality,
            sex: idv.sex || null,
            provider: 'didit',
            diditWarnings: idv.warnings || [],
          };

          // Validate name match against profile
          const cinNameWords = normalizeString(diditFullName).split(/\s+/).filter(Boolean).sort().join(' ');
          const profileNameWords = userName.split(/\s+/).filter(Boolean).sort().join(' ');
          const nameMatch = diditFullName && diditFullName.trim().length >= 3
            && !/^\d+$/.test(diditFullName.trim())
            && cinNameWords === profileNameWords;
          const hasCinNumber = diditDocNumber && diditDocNumber.length >= 6;
          const hasDob = diditDob && diditDob.length >= 8;

          console.log(`👤 [VERIFY] Name: profile="${userName}" | CIN="${diditFullName}" → ${nameMatch ? '✅ MATCH' : '❌ MISMATCH'}`);
          console.log(`📋 [VERIFY] CIN#: ${hasCinNumber ? '✅' : '❌'} ${diditDocNumber || 'N/A'}`);
          console.log(`📋 [VERIFY] DOB: ${hasDob ? '✅' : '❌'} ${diditDob || 'N/A'}`);

          if (!nameMatch) issues.push({ stage: 'details', message: 'Name on CIN does not match your profile name' });
          if (!hasCinNumber) issues.push({ stage: 'details', message: 'CIN number not recognized' });
          if (!hasDob) issues.push({ stage: 'details', message: 'Date of birth not found on card' });

          // Check for fraud warnings from Didit
          const fraudWarnings = (idv.warnings || []).filter(w =>
            ['SCREEN_CAPTURE_DETECTED', 'PRINTED_COPY_DETECTED', 'PORTRAIT_MANIPULATION_DETECTED', 'DOCUMENT_EXPIRED'].includes(w)
          );
          if (fraudWarnings.length > 0) {
            console.log(`🚨 [DIDIT] Fraud warnings: ${fraudWarnings.join(', ')}`);
            issues.push({ stage: 'card', message: 'Document appears to be a copy or screen capture. Please upload an original photo.' });
          }
        } else {
          // Didit ID verification declined
          const warnings = idResult.id_verification?.warnings || [];
          console.log(`❌ [DIDIT] ID verification declined: ${warnings.join(', ')}`);
          if (warnings.includes('COULD_NOT_RECOGNIZE_DOCUMENT')) {
            issues.push({ stage: 'card', message: 'Could not read ID card — please retake with clear lighting and all four corners visible' });
          } else {
            issues.push({ stage: 'card', message: `ID verification failed: ${warnings.join('. ') || 'Document could not be verified'}` });
          }
        }

        // Step 2: Didit Face Match (only if ID verification passed)
        if (issues.length === 0) {
          try {
            const faceResult = await diditFaceMatch(selfieUrl, faceImageUrl);
            await incrementDiditUsage();
            const faceStatus = faceResult.face_match?.status;
            const faceScore = faceResult.face_match?.score;
            ocrResult.faceScore = faceScore;
            console.log(`✅ [DIDIT] Face match: status=${faceStatus} score=${faceScore}`);

            if (faceStatus !== 'Approved' && (!faceScore || faceScore <= 60)) {
              issues.push({ stage: 'face', message: 'Face in selfie does not match the CIN photo' });
            }
          } catch (e) {
            console.error(`❌ [DIDIT] Face match failed: ${e.message}`);
            issues.push({ stage: 'face', message: `Face verification failed: ${e.message}` });
          }
        }
      } catch (e) {
        console.error(`❌ [DIDIT] ID verification error: ${e.message}`);
        console.log(`🔄 [VERIFY] Didit failed, falling back to Tareef path`);
        verificationProvider = 'tareef';
        // Fall through to Tareef path below
      }
    }

    // ═══════════════════ TAREEF FALLBACK PATH ═══════════════════
    if (verificationProvider === 'tareef') {
      console.log(`🔄 [VERIFY] Using Tareef + OCR.space (fallback)`);

      if (!process.env.OCR_SPACE_KEY) {
        console.log(`❌ [VERIFY] OCR_SPACE_KEY not configured`);
        rejectionReason = 'Verification service not configured. Please try again later.';
      } else {
        let frontText = '';
        let backText = '';

        console.log(`📡 [VERIFY] Calling OCR.space for front + back...`);
        try {
          const [frontOcr, backOcr] = await Promise.all([
            ocrSpaceParse(idFrontUrl),
            ocrSpaceParse(idBackUrl),
          ]);
          frontText = frontOcr;
          backText = backOcr;
          console.log(`✅ [VERIFY] OCR front (${frontText.length} chars): ${frontText.substring(0, 200).replace(/\n/g, ' | ')}`);
          console.log(`✅ [VERIFY] OCR back (${backText.length} chars): ${backText.substring(0, 200).replace(/\n/g, ' | ')}`);
        } catch (e) {
          console.error(`❌ [VERIFY] OCR.space failed:`, e.message);
          rejectionReason = 'Could not read ID card photos. Please ensure images are clear and well-lit.';
        }

        if (frontText || backText) {
          const frontFields = extractCinFields(frontText);
          const sex = extractSex(backText);
          ocrResult = { ...frontFields, sex, rawFront: frontText, rawBack: backText, provider: 'tareef' };

          const cinNameWords = normalizeString(frontFields.fullName).split(/\s+/).filter(Boolean).sort().join(' ');
          const profileNameWords = userName.split(/\s+/).filter(Boolean).sort().join(' ');
          const nameMatch = frontFields.fullName && frontFields.fullName.trim().length >= 3
            && !/^\d+$/.test(frontFields.fullName.trim())
            && cinNameWords === profileNameWords;
          const hasCinNumber = frontFields.cinNumber && /^\d{8,12}$/.test(frontFields.cinNumber);
          const hasDob = frontFields.dateOfBirth && /^\d{2}[\/\-]\d{2}[\/\-]\d{4}$/.test(frontFields.dateOfBirth);
          const hasPlaceOfBirth = frontFields.placeOfBirth && frontFields.placeOfBirth.trim().length >= 3 && !/^\d+$/.test(frontFields.placeOfBirth.trim());
          const hasSex = sex && /^(M|F|MASCULIN|FÉMININ|MALE|FEMALE)$/i.test(sex);

          console.log(`👤 [VERIFY] Name: profile="${userName}" | CIN="${frontFields.fullName}" → ${nameMatch ? '✅ MATCH' : '❌ MISMATCH'}`);
          console.log(`📋 [VERIFY] CIN#: ${hasCinNumber ? '✅' : '❌'} ${frontFields.cinNumber || 'N/A'}`);
          console.log(`📋 [VERIFY] DOB: ${hasDob ? '✅' : '❌'} ${frontFields.dateOfBirth || 'N/A'}`);
          console.log(`📋 [VERIFY] POB: ${hasPlaceOfBirth ? '✅' : '❌'} ${frontFields.placeOfBirth || 'N/A'}`);
          console.log(`📋 [VERIFY] Sex: ${hasSex ? '✅' : '❌'} ${sex || 'N/A'}`);

          if (!nameMatch) issues.push({ stage: 'details', message: 'Name on CIN does not match your profile name' });
          if (!hasCinNumber) issues.push({ stage: 'details', message: 'CIN number not recognized' });
          if (!hasDob) issues.push({ stage: 'details', message: 'Date of birth not found on card' });
          if (!hasPlaceOfBirth) issues.push({ stage: 'details', message: 'Place of birth not found on card' });
          if (!hasSex) issues.push({ stage: 'details', message: 'Sex not found on CIN back' });
        } else {
          issues.push({ stage: 'card', message: 'Could not read any text from ID card — please retake with better lighting' });
        }

        if (issues.length === 0) {
          if (!process.env.TAREEF_API_KEY) {
            console.log(`❌ [VERIFY] TAREEF_API_KEY not configured — rejecting (fail-closed)`);
            issues.push({ stage: 'face', message: 'Face verification service unavailable' });
          } else {
            console.log(`🔍 [VERIFY] Calling Tareef face comparison (CIN face crop vs selfie)...`);
            try {
              console.log(`🔍 [VERIFY] Using ${idFaceUrl ? 'cropped CIN face' : 'full CIN front'} for face comparison`);
              const { score, similar } = await tareefCompare(faceImageUrl, selfieUrl);
              ocrResult.faceScore = score;
              console.log(`✅ [VERIFY] Tareef result: score=${score} similar=${similar} → ${similar || score >= 0.65 ? '✅ PASS' : '❌ FAIL'}`);
              if (!similar && score < 0.65) {
                issues.push({ stage: 'face', message: 'Face in selfie does not match the CIN photo' });
              }
            } catch (e) {
              console.error(`❌ [VERIFY] Tareef failed: ${e.message}`);
              console.error(`❌ [VERIFY] Stack: ${e.stack?.split('\n').slice(0, 3).join(' | ')}`);
              const msg = e.message || '';
              if (msg.includes('no_face') || msg.includes('No face')) {
                issues.push({ stage: 'face', message: 'No face detected in ID card — please retake the CIN photo with the card flat, well-lit, and the face photo clearly visible' });
              } else if (msg.includes('low_quality') || msg.includes('blurry')) {
                issues.push({ stage: 'face', message: 'Image too blurry — please retake with better lighting and focus' });
              } else {
                issues.push({ stage: 'face', message: `Face verification failed: ${msg}` });
              }
            }
          }
        } else {
          console.log(`⏭️ [VERIFY] Skipping Tareef (OCR issues found)`);
        }
      }
    }

    if (issues.length === 0 && !rejectionReason) {
      console.log(`✅ [VERIFY] All checks passed via ${verificationProvider} → auto-verifying`);
      autoStatus = 'verified';
    } else if (!rejectionReason) {
      const failedStage = issues[0].stage;
      const reasons = issues.map(i => i.message);
      console.log(`❌ [VERIFY] Rejection (${verificationProvider}): stage=${failedStage} reasons=${reasons.join(' | ')}`);
      rejectionReason = reasons.join('. ');
    }

    const result = await pool.query(
      `INSERT INTO verification_attempts (user_id, status, id_front_url, id_back_url, selfie_url, ocr_result, face_match_score, rejection_reason, verified_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, ${autoStatus === 'verified' ? 'CURRENT_TIMESTAMP' : 'NULL'})
       RETURNING *`,
      [req.user.id, autoStatus, idFrontUrl, idBackUrl, selfieUrl, ocrResult ? JSON.stringify(ocrResult) : null, null, rejectionReason]
    );

    if (autoStatus === 'verified') {
      await pool.query(
        `UPDATE users SET id_verified = true, id_verified_at = CURRENT_TIMESTAMP, id_verification_result = 'verified' WHERE id = $1`,
        [req.user.id]
      );
      createNotification(req.user.id, 'verification_approved', 'Identity Verified', 'Your identity has been verified! You are now a Verified Seller.', {});

      // Auto-upgrade seller tier from casual → verified
      const userCheck = await pool.query('SELECT seller_tier FROM users WHERE id = $1', [req.user.id]);
      const currentTier = userCheck.rows[0]?.seller_tier;
      if (currentTier === 'casual') {
        await pool.query(
          `UPDATE users SET seller_tier = 'verified', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [req.user.id]
        );
      }

      await Promise.all([
        deleteImgbbImage(deleteUrls?.idFront),
        deleteImgbbImage(deleteUrls?.idFace),
        deleteImgbbImage(deleteUrls?.idBack),
        deleteImgbbImage(deleteUrls?.selfie),
        deleteStorageImage(idFrontUrl),
        deleteStorageImage(idFaceUrl),
        deleteStorageImage(idBackUrl),
        deleteStorageImage(selfieUrl),
      ]);
      await pool.query(
        `UPDATE verification_attempts SET id_front_url = NULL, id_back_url = NULL, selfie_url = NULL WHERE id = $1`,
        [result.rows[0].id]
      );

      // Return updated user for frontend store sync
      const updatedUser = await pool.query(
        `SELECT id, full_name, email, phone, role, avatar_url, bio, store_name, store_logo_url, seller_tier, id_submitted_at, id_verified, id_verified_at, id_verification_result, use_store_identity, email_verified, created_at, location_address, location_city, location_lat, location_lng, username, show_real_name FROM users WHERE id = $1`,
        [req.user.id]
      );
      const newToken = jwt.sign({ id: updatedUser.rows[0].id, email: updatedUser.rows[0].email, role: updatedUser.rows[0].role }, JWT_SECRET, { expiresIn: '7d' });
      res.json({ attempt: result.rows[0], user: updatedUser.rows[0], token: newToken });
    } else {
      await pool.query(
        `UPDATE users SET id_submitted_at = CURRENT_TIMESTAMP, id_verification_result = 'rejected' WHERE id = $1`,
        [req.user.id]
      );
      createNotification(req.user.id, 'verification_rejected', 'Verification Not Approved',
        rejectionReason || 'Your identity verification was not approved. Please try again.', { attemptId: result.rows[0].id });

      // Clean up images on rejection too
      await Promise.all([
        deleteImgbbImage(deleteUrls?.idFront),
        deleteImgbbImage(deleteUrls?.idFace),
        deleteImgbbImage(deleteUrls?.idBack),
        deleteImgbbImage(deleteUrls?.selfie),
        deleteStorageImage(idFrontUrl),
        deleteStorageImage(idFaceUrl),
        deleteStorageImage(idBackUrl),
        deleteStorageImage(selfieUrl),
      ]);
      await pool.query(
        `UPDATE verification_attempts SET id_front_url = NULL, id_back_url = NULL, selfie_url = NULL WHERE id = $1`,
        [result.rows[0].id]
      );

      const failedStage = issues.length > 0 ? issues[0].stage : null;
      const reasons = issues.map(i => i.message);
      res.json({ attempt: { ...result.rows[0], failed_stage: failedStage, reasons } });
    }
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
      `SELECT id_front_url, id_back_url, selfie_url FROM verification_attempts WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const row = result.rows[0];

    // Delete files from storage
    const urls = [row.id_front_url, row.id_back_url, row.selfie_url].filter(Boolean);
    for (const url of urls) {
      try {
        if (url.includes('r2.dev') && r2Storage) {
          // R2 Storage
          const key = url.split('.r2.dev/')[1];
          if (key) await r2Storage.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
        } else if (url.includes(SUPABASE_PUBLIC_BASE.replace('https://', '')) || url.includes('supabase.co/storage')) {
          // Supabase Storage
          const key = url.split('/object/public/' + SUPABASE_STORAGE_BUCKET + '/')[1];
          if (key && supabaseStorage) {
            await supabaseStorage.send(new DeleteObjectCommand({ Bucket: SUPABASE_STORAGE_BUCKET, Key: key }));
          }
        } else if (url.includes('i.ibb.co') && process.env.IMGBB_KEY) {
          // imgbb — no reliable delete API, but images have 1h expiration from verification upload
        }
      } catch { /* best effort */ }
    }

    // NULL the DB columns
    await pool.query(
      `UPDATE verification_attempts SET id_front_url = NULL, id_back_url = NULL, selfie_url = NULL WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );
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
      body: JSON.stringify({ amount: 2500, referenceId: orderId, returnUrl: `${process.env.PRODUCTION_URL || 'https://maurmaket.onrender.com'}/payment/return` }),
      signal: AbortSignal.timeout(15000),
    });
    const payData = await mccRes.json();
    if (!mccRes.ok || !payData.paymentUrl) {
      return res.status(500).json({ error: 'Payment creation failed' });
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
      body: JSON.stringify({ amount: 2500, referenceId: orderId, returnUrl: `${process.env.PRODUCTION_URL || 'https://maurmaket.onrender.com'}/payment/return` }),
      signal: AbortSignal.timeout(15000),
    });
    const payData = await mccRes.json();
    if (!mccRes.ok || !payData.paymentUrl) {
      return res.status(500).json({ error: 'Payment creation failed' });
    }
    res.json({ paymentUrl: payData.paymentUrl, orderId });
  } catch (err) {
    console.error('Subscription renew error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/subscriptions/webhook', async (req, res) => {
  try {
    const signature = req.headers['x-mcc-signature'] || '';
    const secret = process.env.MCC_WEBHOOK_SECRET || '';
    if (!secret) {
      return res.status(500).json({ error: 'Webhook not configured' });
    }
    const hmac = 'sha256=' + crypto.createHmac('sha256', secret).update(req.rawBody || '').digest('hex');
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

// ───── Didit (0Didit) webhook ─────
// GET handler: Didit redirects WebView here after verification completes
app.get('/api/webhooks/didit', async (req, res) => {
  const { verificationSessionId, status } = req.query;
  console.log(`[DIDIT CALLBACK] GET redirect: session=${verificationSessionId} status=${status}`);

  if (status === 'Approved' && verificationSessionId && process.env.DIDIT_API_KEY) {
    try {
      // The redirect is only trusted when a matching verified webhook event exists.
      const attempt = await pool.query(
        `SELECT vendor_data FROM didit_webhook_events
         WHERE session_id = $1 AND status = 'Approved' AND webhook_type = 'status.updated'
         ORDER BY received_at DESC LIMIT 1`,
        [verificationSessionId]
      );
      const userId = attempt.rows[0]?.vendor_data;
      if (userId && /^[0-9a-f-]{36}$/i.test(userId)) {
        await pool.query(`UPDATE users SET id_verified = true, id_verified_at = CURRENT_TIMESTAMP, id_verification_result = 'verified', seller_tier = 'verified' WHERE id = $1`, [userId]);
        await pool.query(`UPDATE verification_attempts SET status = 'verified', verified_at = CURRENT_TIMESTAMP WHERE id = (SELECT id FROM verification_attempts WHERE user_id = $1 AND status != 'verified' ORDER BY created_at DESC LIMIT 1)`, [userId]);
        createNotification(userId, 'verification_approved', 'Identity Verified', 'Your identity has been verified via Didit!', {});
        console.log(`[DIDIT CALLBACK] User ${userId} verified via GET redirect (from webhook_events)`);
      } else {
        console.warn(`[DIDIT CALLBACK] No verified webhook mapping for session ${verificationSessionId}`);
      }
    } catch (err) {
      console.error('[DIDIT CALLBACK] Error processing redirect:', err.message);
    }
  }

  // Return simple HTML page — WebView will detect this
  res.status(200).send('<html><body style="font-family:sans-serif;text-align:center;padding:60px 20px"><h2>Verification complete</h2><p>You can close this page.</p></body></html>');
});

// POST handler: Didit sends webhook events here
app.post('/api/webhooks/didit', async (req, res) => {
  try {
    const rawBody = req.rawBody;
    if (!rawBody) {
      console.error('[DIDIT WEBHOOK] No raw body');
      return res.status(400).json({ error: 'Raw webhook body required' });
    }

    // 1. Log signature headers for debugging
    const sigHeaders = {
      'x-signature': req.headers['x-signature'] ? 'present' : 'absent',
      'x-signature-v2': req.headers['x-signature-v2'] ? 'present' : 'absent',
      'x-signature-simple': req.headers['x-signature-simple'] ? 'present' : 'absent',
      'x-timestamp': req.headers['x-timestamp'] || 'absent',
    };
    console.log(`[DIDIT WEBHOOK] Signature headers: ${JSON.stringify(sigHeaders)}`);

    // 2. Verify timestamp freshness (±300s)
    const timestamp = parseInt(req.headers['x-timestamp'] || '0');
    const now = Math.floor(Date.now() / 1000);
    if (!timestamp || Math.abs(now - timestamp) > 300) {
      console.error(`[DIDIT WEBHOOK] Invalid or expired timestamp: ${timestamp} (now: ${now})`);
      return res.status(401).json({ error: 'Invalid webhook timestamp' });
    }

    // 3. Verify HMAC-SHA256 signature before parsing or processing the event.
    const webhookSecret = process.env.DIDIT_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('[DIDIT WEBHOOK] DIDIT_WEBHOOK_SECRET is not configured');
      return res.status(503).json({ error: 'Webhook verification unavailable' });
    }
    const signatureV2 = req.headers['x-signature-v2'];
    const signatureSimple = req.headers['x-signature-simple'];
    const signature = req.headers['x-signature'];
    const providedSignature = signatureV2 || signatureSimple || signature;
    if (!providedSignature) {
      return res.status(401).json({ error: 'Missing webhook signature' });
    }

    let expectedSig;
    if (signatureSimple) {
      const body = JSON.parse(rawBody);
      const simpleStr = `${timestamp}:${body.session_id || ''}:${body.status || ''}:${body.webhook_type || ''}`;
      expectedSig = crypto.createHmac('sha256', webhookSecret).update(simpleStr).digest('hex');
    } else {
      expectedSig = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
    }
    const sigBuf = Buffer.from(providedSignature, 'hex');
    const expBuf = Buffer.from(expectedSig, 'hex');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }

    // 4. Parse and validate event identity before applying any state changes.
    const event = JSON.parse(rawBody);
    const { event_id, webhook_type, status, vendor_data, session_id, decision } = event;
    if (!event_id || !session_id || !webhook_type || !status) {
      return res.status(400).json({ error: 'Incomplete webhook event' });
    }
    if (vendor_data && !/^[0-9a-f-]{36}$/i.test(vendor_data)) {
      return res.status(400).json({ error: 'Invalid verification subject' });
    }

    // 5. Reserve the event ID so concurrent deliveries cannot process twice.
    const existing = await pool.query(
      'SELECT id FROM didit_webhook_events WHERE event_id = $1',
      [event_id]
    );
    if (existing.rows.length > 0) {
      console.log(`[DIDIT WEBHOOK] Duplicate event ${event_id} — skipping`);
      return;
    }
    await pool.query(
      'INSERT INTO didit_webhook_events (event_id, session_id, webhook_type, status, vendor_data) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (event_id) DO NOTHING',
      [event_id, session_id, webhook_type, status, vendor_data]
    );

    console.log(`[DIDIT WEBHOOK] ${webhook_type} — status=${status} vendor=${vendor_data}`);

    // 5. Process by type
    if (webhook_type === 'status.updated' && vendor_data) {
      const userId = vendor_data;

      if (status === 'Approved') {
        const faceMatch = decision?.face_matches?.[0];
        const faceScore = faceMatch?.score || 0;

        await pool.query(
          `UPDATE users SET id_verified = true, id_verified_at = CURRENT_TIMESTAMP, id_verification_result = 'verified', seller_tier = CASE WHEN seller_tier = 'casual' THEN 'verified' ELSE seller_tier END WHERE id = $1`,
          [userId]
        );
        await pool.query(
          `UPDATE verification_attempts SET status = 'verified', face_match_score = $1, verified_at = CURRENT_TIMESTAMP WHERE id = (SELECT id FROM verification_attempts WHERE user_id = $2 AND status != 'verified' ORDER BY created_at DESC LIMIT 1)`,
          [faceScore, userId]
        );
        createNotification(userId, 'verification_approved', 'Identity Verified', 'Your identity has been verified via Didit!', {});
        console.log(`[DIDIT WEBHOOK] User ${userId} verified via webhook`);
      } else if (status === 'Declined') {
        const idVerifs = decision?.id_verifications || [];
        const warnings = idVerifs.flatMap(v => v.warnings || []);
        const reason = warnings.join('. ') || 'Verification declined';

        await pool.query(`UPDATE users SET id_verification_result = 'rejected' WHERE id = $1`, [userId]);
        await pool.query(
          `UPDATE verification_attempts SET status = 'rejected', rejection_reason = $1 WHERE id = (SELECT id FROM verification_attempts WHERE user_id = $2 AND status != 'verified' ORDER BY created_at DESC LIMIT 1)`,
          [reason, userId]
        );
        createNotification(userId, 'verification_rejected', 'Verification Not Approved', reason, {});
        console.log(`[DIDIT WEBHOOK] User ${userId} declined: ${reason}`);
      } else if (status === 'In Review') {
        await pool.query(`UPDATE users SET id_verification_result = 'pending' WHERE id = $1`, [userId]);
        console.log(`[DIDIT WEBHOOK] User ${userId} in review`);
      }
    }
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('[DIDIT WEBHOOK] Processing error:', err);
    return res.status(500).json({ error: 'Webhook processing failed' });
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
      return res.status(429).json({ error: 'Too many actions. Please wait.', rateLimited: true });
    }

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
    // Unlike removes the positive signal
    if (eventType === 'unlike') {
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
    }
    res.json({ recorded: true });
  } catch (err) {
    console.error('Feed event error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Seed a new account's feed with a few intentional category choices.
app.post('/api/feed/taste', authRequired, async (req, res) => {
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

app.post('/api/feed/taste/skip', authRequired, async (req, res) => {
  try {
    await pool.query('UPDATE users SET taste_onboarding_completed = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [req.user.id]);
    res.json({ saved: true });
  } catch (err) {
    console.error('Feed taste skip error:', err);
    res.status(500).json({ error: 'Could not update preferences' });
  }
});

// ───── Root Health Check (Render) ─────
app.get('/', (_req, res) => res.status(200).json({ status: 'ok' }));

// ───── Map Crash Reports ─────
app.post('/api/debug/map-report', authRequired, express.json({ limit: '50kb' }), (req, res) => {
  const { logs, platform, appVersion, timestamp } = req.body;
  console.error(`\n=== MAP DEBUG REPORT [${timestamp || new Date().toISOString()}] platform=${platform} appVersion=${appVersion} ===`);
  if (Array.isArray(logs)) {
    logs.forEach((l) => console.error(`  ${l}`));
  } else {
    console.error('  raw:', JSON.stringify(logs).slice(0, 2000));
  }
  console.error('=== END MAP DEBUG REPORT ===\n');
  res.json({ ok: true });
});

// ───── Map Config (MapTiler key for client, requires auth) ─────
app.get('/api/map-config', authRequired, (_req, res) => {
  res.json({ maptilerKey: process.env.MAPTILER_KEY || null });
});

app.get('/api/health', async (_req, res) => {
  const result = {
    status: 'ok',
    primary: 'unknown',
    active: isTestMode ? 'test-local' : 'supabase',
    backupConfigured: Boolean(neonBackupDatabaseUrl),
  };
  try {
    await Promise.race([pool.query('SELECT 1'), new Promise((_, re) => setTimeout(() => re(new Error('timeout')), 5000))]);
    result.primary = 'connected';
  } catch { result.primary = 'down'; }
  result.status = result.primary === 'connected' ? 'ok' : 'error';
  res.status(result.status === 'ok' ? 200 : 503).json(result);
});
app.get('/api/debug', authRequired, adminRequired, async (_req, res) => {
  try {
    const mccRes = await fetch(
      (process.env.MONCASH_PAY_CREATE_URL || 'https://api.moncashconnect.com/v1/pay-create').replace('pay-create', 'pay-balance'),
      { headers: { 'Authorization': `Bearer ${process.env.MCC_KEY || ''}` } }
    );
    const data = await mccRes.json();
    res.json({ mccStatus: mccRes.status, mccOk: mccRes.ok, data, hasKey: !!process.env.MCC_KEY });
  } catch (err) {
    res.status(500).json({ error: err.message, hasKey: !!process.env.MCC_KEY });
  }
});

// ───── Legal Pages (Google OAuth requirement) ─────
const legalPage = (title, content) => `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} - MaurMaket</title><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:800px;margin:40px auto;padding:0 20px;color:#1a1a1a;line-height:1.6}h1{font-size:1.8em;margin-bottom:.3em}h2{font-size:1.3em;margin-top:1.5em}p,li{font-size:.95em}a{color:#C0406A}ul{padding-left:1.5em}.meta{color:#666;font-size:.85em;margin-bottom:2em}</style></head><body><h1>${title}</h1><p class="meta">Effective: August 7, 2026 &middot; MaurMaket (maurmaket.onrender.com)</p>${content}<hr><p style="color:#999;font-size:.8em">Questions? Contact us at maurinexus.contact@gmail.com</p></body></html>`;

app.get('/privacy', (_req, res) => {
  res.type('html').send(legalPage('Privacy Policy', `
    <h2>Information We Collect</h2>
    <p>When you use MaurMaket, we collect information you provide directly: name, email, phone number, and profile photo. We also collect transaction data (listings, purchases, messages between buyers and sellers) and device information for app functionality.</p>
    <h2>How We Use Your Information</h2>
    <ul>
      <li>To provide, maintain, and improve MaurMaket services</li>
      <li>To process transactions and send related information</li>
      <li>To send technical notices, updates, and security alerts</li>
      <li>To respond to your comments and customer service requests</li>
      <li>To detect and prevent fraud or abuse</li>
    </ul>
    <h2>Information Sharing</h2>
    <p>We do not sell your personal information. We share data only with your consent, to comply with laws, or with service providers who assist in operating the platform (hosting, payment processing, analytics).</p>
    <h2>Data Security</h2>
    <p>We implement industry-standard security measures including encryption in transit (TLS) and at rest. However, no method of transmission over the Internet is 100% secure.</p>
    <h2>Data Retention</h2>
    <p>We retain your information as long as your account is active or as needed to provide services. You may request deletion of your account and data at any time.</p>
    <h2>Your Rights</h2>
    <p>You may access, update, or delete your personal information through your account settings or by contacting us at maurinexus.contact@gmail.com.</p>
    <h2>Changes</h2>
    <p>We may update this policy from time to time. Continued use of MaurMaket after changes constitutes acceptance of the revised policy.</p>
  `));
});

app.get('/terms', (_req, res) => {
  res.type('html').send(legalPage('Terms of Service', `
    <h2>Acceptance of Terms</h2>
    <p>By accessing or using MaurMaket, you agree to be bound by these Terms of Service. If you do not agree, do not use the service.</p>
    <h2>User Accounts</h2>
    <p>You must be at least 18 years old to use MaurMaket. You are responsible for maintaining the confidentiality of your account credentials and for all activity under your account.</p>
    <h2>Marketplace Rules</h2>
    <ul>
      <li>Listings must be accurate and not misleading</li>
      <li>You may not list prohibited items (weapons, drugs, counterfeit goods)</li>
      <li>Transactions must be completed through MaurMaket's payment system</li>
      <li>Meetups for exchanges must follow safety guidelines</li>
    </ul>
    <h2>Payments &amp; Fees</h2>
    <p>MaurMaket charges fees for completed transactions. Fees are displayed before you confirm a purchase. All payments are processed securely through MonCash.</p>
    <h2>Intellectual Property</h2>
    <p>All content on MaurMaket (logos, text, code) is owned by MaurMaket or its licensors. You may not copy, modify, or distribute any part of the service without written permission.</p>
    <h2>Limitation of Liability</h2>
    <p>MaurMaket is not liable for indirect, incidental, or consequential damages arising from your use of the service. Our total liability does not exceed the fees paid by you in the 12 months prior to the claim.</p>
    <h2>Termination</h2>
    <p>We may suspend or terminate your account at any time for violation of these terms. You may also delete your account at any time through your settings.</p>
    <h2>Governing Law</h2>
    <p>These terms are governed by the laws of Haiti. Disputes shall be resolved in the courts of Port-au-Prince, Haiti.</p>
    <h2>Changes</h2>
    <p>We reserve the right to modify these terms at any time. Material changes will be communicated via email or in-app notice.</p>
  `));
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
          await client.query('SELECT id FROM products WHERE id = $1 FOR UPDATE', [item.product_id]);
          await client.query('UPDATE products SET stock = stock + $1 WHERE id = $2', [item.quantity, item.product_id]);
        }

        // Cancel order
        await client.query("UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [orderId]);
        await logOrderEvent(orderId, 'status_change', null, 'paid', 'cancelled', 'Meetup expired — auto-refund', client);
        await client.query('COMMIT');
        client.release();

        // Send refund payout to buyer
        const buyerRes = await pool.query('SELECT phone FROM users WHERE id = $1', [order.buyer_id]);
        const buyerPhone = buyerRes.rows[0]?.phone;
        const totalRefund = parseFloat(order.total_amount);

        if (totalRefund > 0 && buyerPhone) {
          try {
            const payoutRes = await fetch(
              process.env.MONCASH_PAYOUT_CREATE_URL || 'https://hvlmeoqyxaguzcujpmit.supabase.co/functions/v1/payout-create',
              {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${process.env.MCC_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount: Math.round(totalRefund), moncashNumber: buyerPhone, referenceId: `refund_${orderId}` }),
                signal: AbortSignal.timeout(15000),
              }
            );
            if (payoutRes.ok) console.log(`[CRON] Refund G ${totalRefund} sent to buyer ${buyerPhone}`);
            else console.error(`[CRON] Refund payout failed: ${await payoutRes.text()}`);
          } catch (e) { console.error('[CRON] Refund payout error:', e.message); }
        }

        createNotification(order.buyer_id, 'order_status', 'Order Refunded',
          `Your meetup order has expired. G ${totalRefund.toFixed(0)} refunded.`, { orderId });

        // Notify sellers of the cancelled order
        const sellerNotify = await pool.query('SELECT DISTINCT seller_id FROM order_items WHERE order_id = $1', [orderId]);
        for (const row of sellerNotify.rows) {
          createNotification(row.seller_id, 'meetup_expired', 'Meetup Expired',
            `Your meetup for this order expired without exchange. The order has been cancelled.`, { orderId });
        }

      } catch (e) {
        try { await client.query('ROLLBACK'); } catch {}
        client.release();
        console.error(`[CRON] Error refunding order ${orderId}:`, e.message);
      }
    }
  } catch (err) {
    console.error('[CRON] Meetup timeout check error:', err.message);
  }
});

// ───── Cron: Process stale pending orders via pay-status poll (every 5 minutes) ─────
cron.schedule('*/5 * * * *', async () => {
  try {
    const pendingRefunds = await pool.query(
      `SELECT order_id FROM refund_payouts
       WHERE status IN ('pending', 'failed') AND next_attempt_at <= CURRENT_TIMESTAMP
       ORDER BY created_at ASC LIMIT 20`
    );
    for (const refund of pendingRefunds.rows) {
      await processRefundPayout(refund.order_id);
    }
  } catch (err) {
    console.error('[CRON] Refund payout retry error:', err.message);
  }
});

cron.schedule('*/5 * * * *', async () => {
  try {
    // Find orders stuck in 'pending' for >10 minutes (webhook likely failed)
    const staleOrders = await pool.query(
      `SELECT id, buyer_id, moncash_reference FROM orders
       WHERE status = 'pending' AND created_at < NOW() - INTERVAL '10 minutes'
       ORDER BY created_at ASC LIMIT 10`
    );
    if (staleOrders.rows.length === 0) return;

    console.log(`[CRON] Processing ${staleOrders.rows.length} stale pending orders`);

    for (const order of staleOrders.rows) {
      const referenceId = order.moncash_reference || order.id;
      try {
        const payStatusUrl = (process.env.MONCASH_PAY_CREATE_URL || 'https://api.moncashconnect.com/v1/pay-create')
          .replace('pay-create', 'pay-status') + `?referenceId=${encodeURIComponent(referenceId)}`;
        const moncashRes = await fetch(payStatusUrl, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${process.env.MCC_KEY}` },
          signal: AbortSignal.timeout(15000),
        });

        if (!moncashRes.ok) continue;
        const data = await moncashRes.json();

        if (data.status === 'completed' || data.paid === true) {
          // Process the payment (same logic as pay-status endpoint)
          const client = await pool.connect();
          try {
            await client.query('BEGIN');
            const updateResult = await client.query(
              `UPDATE orders SET status = 'paid', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'pending'`,
              [order.id]
            );
            if (updateResult.rowCount === 0) {
              await client.query('ROLLBACK');
              continue;
            }
            await logOrderEvent(order.id, 'payment_received', null, 'pending', 'paid', 'Payment confirmed via stale-order cron', client);

            await reserveOrderStock(client, order.id);

            await recordProductCooccurrences(order.id, client);
            const items = { rows: await getSellerPaymentAllocations(client, order.id) };
            for (const item of items.rows) {
              if (item.seller_id) {
                const grossAmount = parseFloat(item.paid_total);
                const tierRes = await client.query('SELECT seller_tier FROM users WHERE id = $1', [item.seller_id]);
                const sellerTier = tierRes.rows[0]?.seller_tier || 'none';
                const rate = getCommissionRate(sellerTier);
                const commission = Math.round(grossAmount * rate * 100) / 100;
                const net = Math.round((grossAmount - commission) * 100) / 100;
                await client.query(
                  `INSERT INTO order_escrow (order_id, seller_id, gross_amount, commission_amount, net_amount, status)
                   VALUES ($1, $2, $3, $4, $5, 'held') ON CONFLICT (order_id, seller_id) DO UPDATE SET gross_amount = $3, commission_amount = $4, net_amount = $5, status = 'held'`,
                  [order.id, item.seller_id, grossAmount, commission, net]
                );
                await client.query(
                  `INSERT INTO platform_revenue (order_id, seller_id, seller_tier, gross_amount, commission_rate, commission_amount, platform_fee, net_to_seller)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                  [order.id, item.seller_id, sellerTier, grossAmount, rate, commission, commission, net]
                );
              }
            }
            await client.query('COMMIT');
            client.release();
            console.log(`[CRON] Stale order ${order.id} processed (payment confirmed)`);
            const sellerIds = items.rows.map(r => r.seller_id).filter(Boolean);
            for (const sid of sellerIds) {
              createNotification(sid, 'order_status', 'Payment Received', 'Payment held in escrow until exchange confirmed', { orderId: order.id });
            }
            createNotification(order.buyer_id, 'payment_confirmed', 'Payment Confirmed', 'Your payment was successful.', { orderId: order.id });
          } catch (e) {
            try { await client.query('ROLLBACK'); } catch {}
            client.release();
            console.error(`[CRON] Error processing stale order ${order.id}:`, e.message);
          }
        } else if (data.status === 'failed' || data.status === 'expired') {
          await pool.query("UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'pending'", [order.id]);
          console.log(`[CRON] Stale order ${order.id} cancelled (payment ${data.status})`);
          createNotification(order.buyer_id, 'order_status', 'Payment Failed', 'Your payment could not be processed. The order has been cancelled.', { orderId: order.id });
        }
      } catch (e) {
        console.error(`[CRON] Pay-status poll error for ${order.id}:`, e.message);
      }
    }
  } catch (err) {
    console.error('[CRON] Stale order check error:', err.message);
  }
});

// ───── Cron: Expire stale offers (every 15 minutes) ─────
cron.schedule('*/15 * * * *', async () => {
  try {
    const expired = await pool.query(
      "UPDATE message_offers SET status = 'expired' WHERE status IN ('pending', 'countered') AND expires_at < CURRENT_TIMESTAMP RETURNING buyer_id, product_id"
    );
    if (expired.rows.length > 0) {
      console.log(`[CRON] Expired ${expired.rows.length} stale offers`);
      for (const row of expired.rows) {
        const productInfo = await pool.query('SELECT name FROM products WHERE id = $1', [row.product_id]);
        createNotification(row.buyer_id, 'new_message', 'Offer Expired',
          `Your offer for "${productInfo.rows[0]?.name || 'a product'}" has expired.`,
          {});
      }
    }
  } catch (err) {
    console.error('[CRON] Offer expiry error:', err.message);
  }
});

// ───── Cron: Clean up old read notifications (daily at 3 AM) ─────
cron.schedule('0 3 * * *', async () => {
  await cleanupOldNotifications();
});

// ───── Auto-expire expired offers ─────
cron.schedule('*/5 * * * *', async () => {
  try {
    const result = await pool.query(
      `UPDATE message_offers SET status = 'expired'
       WHERE status = 'pending' AND expires_at < NOW()
       RETURNING id`
    );
    const countered = await pool.query(
      `UPDATE message_offers SET status = 'expired'
       WHERE status = 'countered' AND expires_at < NOW()
       RETURNING id`
    );
    const total = result.rowCount + countered.rowCount;
    if (total > 0) console.log(`[OFFER EXPIRY] Auto-expired ${total} offers`);
  } catch (err) {
    console.error('[OFFER EXPIRY] Error:', err.message);
  }
});

// ───── Auto-Migration: Supabase → Neon (keeps Neon in sync with primary) ─────
// NOTE: product_images excluded — Neon uses integer auto-increment id, Supabase uses UUID.
const MIGRATION_TABLES = [
  'users', 'categories', 'products', 'orders', 'order_items',
  'processed_events', 'seller_balances', 'payouts', 'order_events', 'saved_addresses',
  'reviews', 'wishlists', 'follows', 'notifications', 'conversations', 'messages',
  'promo_codes', 'promo_uses', 'disputes', 'platform_revenue', 'platform_payouts',
  'verification_attempts', 'seller_subscriptions', 'order_escrow', 'meetup_checkins',
  'feed_events', 'seller_locations', 'otp_codes', 'message_offers', 'user_category_affinities', 'product_cooccurrences'
];

// Column whitelist for tables with schema drift between Neon and Supabase
const MIGRATION_COLUMNS = {
  categories: 'id, name, display_order',
  orders: 'id, buyer_id, total_amount, status, moncash_reference, delivery_method, delivery_name, delivery_phone, delivery_address, delivery_city, delivery_note, meetup_lat, meetup_lng, meetup_address, meetup_note, meetup_confirmed, meetup_proposed_by, meetup_started_at, created_at, updated_at',
};

function isValidUUID(val) {
  return typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
}

async function migrateSupabaseToNeon() {
  if (!neonBackupDatabaseUrl || isTestMode) return;
  // Read from the live primary only. Neon is never part of request handling.
  const readPool = pool;

  const writePool = new (await import('pg')).Pool({
    connectionString: neonBackupDatabaseUrl,
    connectionTimeoutMillis: 10000,
    ssl: neonBackupDatabaseUrl.includes('localhost') ? false : { rejectUnauthorized: false },
  });

  try {
    const test = await readPool.query('SELECT 1');
    if (!test) return;
    console.log('[MIGRATION] Supabase → Neon: Starting data sync...');
  } catch {
    await writePool.end().catch(() => {});
    return; // Supabase down (shouldn't happen)
  }

  let totalRows = 0;
  const UUID_COLS = ['id', 'order_id', 'product_id', 'seller_id', 'buyer_id', 'reviewer_id', 'user_id', 'seller_id', 'follower_id'];
  const PK_COLS = { seller_locations: 'seller_id', seller_balances: 'seller_id' };

  for (const table of MIGRATION_TABLES) {
    let successCount = 0;
    let failCount = 0;
    try {
      const colList = MIGRATION_COLUMNS[table] || '*';
      const { rows } = await readPool.query(`SELECT ${colList} FROM ${table}`);
      if (rows.length === 0) continue;

      for (const row of rows) {
        try {
          // Skip rows with invalid UUIDs in UUID columns
          for (const col of Object.keys(row)) {
            if (UUID_COLS.includes(col) && row[col] !== null && !isValidUUID(row[col])) {
              console.warn(`[MIGRATION] ${table} row skipped: invalid UUID in ${col}: "${row[col]}"`);
              failCount++;
              continue;
            }
          }

          const cols = Object.keys(row);
          const vals = Object.values(row);
          const placeholders = cols.map((_, i) => `$${i + 1}`);
          const updateCols = cols.filter(c => c !== (PK_COLS[table] || 'id'));
          const conflictCol = PK_COLS[table] || 'id';
          const conflictClause = updateCols.length > 0
            ? ` ON CONFLICT (${conflictCol}) DO UPDATE SET ${updateCols.map(c => `${c} = EXCLUDED.${c}`).join(', ')}`
            : ' ON CONFLICT DO NOTHING';

          await writePool.query(
            `INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders.join(',')})${conflictClause}`,
            vals
          );
          successCount++;
        } catch (rowErr) {
          console.warn(`[MIGRATION] ${table} row ${row.id || '?'} skipped:`, rowErr.message);
          failCount++;
        }
      }
      totalRows += successCount;
      const log = failCount > 0 ? ` (${failCount} skipped)` : '';
      console.log(`[MIGRATION] ${table}: ${successCount} rows${log}`);
    } catch (err) {
      console.error(`[MIGRATION] ${table} error:`, err.message);
    }
  }

  await writePool.end().catch(() => {});
  console.log(`[MIGRATION] Complete! ${totalRows} total rows synced from Supabase → Neon.`);
}

// Backup sync is triggered by the dedicated scheduled GitHub Actions workflow.

// ───── Global Error Handler ─────
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  console.error('Unhandled error:', err.message || err);
  res.status(500).json({ error: 'Internal server error' });
});

// ───── Graceful Shutdown ─────
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
  if (!isTestMode) process.exit(1);
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  if (server) server.close();
  try { await pool.end(); } catch {}
  process.exit(0);
});
process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  if (server) server.close();
  try { await pool.end(); } catch {}
  process.exit(0);
});

const __execPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
const __thisFile = fileURLToPath(import.meta.url);
const isMain = __execPath === __thisFile || __execPath === path.resolve(__thisFile);
if (isMain) {
  if (isTestMode) {
    console.log('[TEST MODE] NODE_ENV=test, using local test database');
    console.log(`[TEST MODE] DATABASE_URL=${process.env.DATABASE_URL?.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@') || 'NOT SET'}`);
  }
  const startServer = () => {
    server = app.listen(PORT, () => {
      console.log(`MaurMaket API running on http://localhost:${PORT}`);
      console.log('Cron jobs active: meetup timeout auto-refund (every 5 min), offer expiry (every 15 min)');
    });
  };
  // Start server IMMEDIATELY — migrations run in background (non-blocking)
  startServer();
  runMigrations().catch(err => {
    console.error('Migration error (non-blocking):', err.message);
  });

  // Non-blocking cleanup with timeout — never blocks server startup
  setTimeout(async () => {
    try {
      await Promise.race([
        cleanupOldNotifications(),
        new Promise((_, re) => setTimeout(() => re(new Error('cleanup timeout')), 10000))
      ]);
    } catch (e) {
      console.error('[STARTUP] Cleanup skipped:', e.message);
    }
  }, 5000);
}

export default app;
