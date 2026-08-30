import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import sharp from 'sharp';
import https from 'https';
import { fileURLToPath } from 'url';
import path from 'path';
import morgan from 'morgan';

// ───── Modularized infrastructure ─────
import { pool, isTestMode, neonBackupDatabaseUrl } from './src/config/database.js';
import { supabaseStorage, SUPABASE_STORAGE_BUCKET, SUPABASE_PUBLIC_BASE, r2Storage, R2_BUCKET, R2_PUBLIC_BASE, PutObjectCommand, DeleteObjectCommand } from './src/config/storage.js';
import { gmailConfigured, emailTransporter, sendViaGmailApi, gmailSenderEmail } from './src/config/email.js';
import { JWT_SECRET, BCRYPT_ROUNDS, PRODUCTION_URL } from './src/config/security.js';
import { generalLimiter, authLimiter, paymentLimiter, uploadLimiter, msgLimiter, convLimiter, verifyLimiter } from './src/middleware/rateLimit.js';
import { optionalAuth, authRequired, sellerRequired, verifiedSellerRequired, dobRequired } from './src/middleware/auth.js';
import { createNotification, sendPushNotification } from './src/utils/notifications.js';
import { logOrderEvent, generateUsername, isAtLeast18, getCommissionRate, getSellerPaymentAllocations, reserveOrderStock, processRefundPayout, checkSubscriptionStatus, cleanupOldNotifications, recordProductCooccurrences } from './src/utils/helpers.js';
import { startJobs } from './src/jobs/index.js';
import { registerRoutes } from './src/routes/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3001;
let server;

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
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) DEFAULT 'moncash';
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS meetup_name TEXT;
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
      CREATE INDEX IF NOT EXISTS idx_feed_events_user_type_time ON feed_events(user_id, event_type, created_at);
      CREATE INDEX IF NOT EXISTS idx_feed_events_type_time ON feed_events(event_type, created_at);
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
    
    await step('Pending checkouts for deferred order creation', () => c.query(`
      CREATE TABLE IF NOT EXISTS pending_checkouts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        cart_data JSONB NOT NULL,
        delivery_method VARCHAR(20),
        delivery_name TEXT,
        delivery_phone TEXT,
        delivery_address TEXT,
        delivery_city TEXT,
        delivery_note TEXT,
        meetup_lat DECIMAL(10,7),
        meetup_lng DECIMAL(10,7),
        meetup_address TEXT,
        meetup_name TEXT,
        payment_method VARCHAR(20) DEFAULT 'moncash',
        promo_code TEXT,
        total_amount DECIMAL(10,2),
        status VARCHAR(20) DEFAULT 'pending',
        moncash_reference TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 minutes')
      );
    `));
await step('NatCash phone separation', () => c.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS natcash_phone VARCHAR(20);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS accepted_payment_methods TEXT[] DEFAULT ARRAY['moncash'];
    `));

    await step('Image dimensions on product_images', () => c.query(`
      ALTER TABLE product_images ADD COLUMN IF NOT EXISTS image_width INTEGER;
      ALTER TABLE product_images ADD COLUMN IF NOT EXISTS image_height INTEGER;
    `));

    // ── Backfill image dimensions for existing images ──
    await step('Backfill image dimensions', async () => {
      const { rows } = await c.query(`
        SELECT id, image_url FROM product_images
        WHERE (image_width IS NULL OR image_width = 0) AND image_url IS NOT NULL
        LIMIT 200
      `);
      if (rows.length === 0) return;
      let backfilled = 0;
      for (const row of rows) {
        try {
          const resp = await fetch(row.image_url);
          if (!resp.ok) continue;
          const buf = Buffer.from(await resp.arrayBuffer());
          const meta = await sharp(buf).metadata();
          if (meta.width && meta.height) {
            await c.query('UPDATE product_images SET image_width = $1, image_height = $2 WHERE id = $3', [meta.width, meta.height, row.id]);
            backfilled++;
          }
        } catch { /* skip unparseable images */ }
      }
      if (backfilled > 0) console.log(`[MIGRATION] Backfilled dimensions for ${backfilled}/${rows.length} images`);
    });

    if (failed.length > 0) {
      console.log(`[MIGRATION] Complete with ${failed.length} failure(s): ${failed.join(', ')}`);
    } else {
      console.log(`[MIGRATION] Complete — all ${stepNum} steps passed`);
    }
  } finally {
    c.release();
  }
}

// cleanupOldNotifications imported from src/utils/helpers.js

// WebP migration extracted to src/routes/migration.js

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

    // Decode base64 to buffer and capture original dimensions
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    // Capture original image dimensions before resizing
    let imgWidth = 0, imgHeight = 0;
    try {
      const metadata = await sharp(buffer).metadata();
      imgWidth = metadata.width || 0;
      imgHeight = metadata.height || 0;
    } catch (metaErr) {
      console.warn('[UPLOAD] Metadata capture failed:', metaErr.message);
    }

    // Always convert to webp for smallest size (max ~300KB)
    let webpBuffer;
    try {
      webpBuffer = await sharp(buffer)
        .resize({ width: 1200, withoutEnlargement: true })
        .webp({ quality: 82, effort: 6 })
        .toBuffer();
      // If still over 300KB, lower quality iteratively
      if (webpBuffer.length > 300 * 1024) {
        webpBuffer = await sharp(buffer).resize({ width: 1200, withoutEnlargement: true }).webp({ quality: 65, effort: 6 }).toBuffer();
      }
    } catch (convErr) {
      console.warn('[UPLOAD] WebP conversion failed, storing original:', convErr.message);
      webpBuffer = buffer;
    }
    const key = `${req.user.id}/${crypto.randomUUID()}.webp`;

    // 1. Try Cloudflare R2 first (faster CDN), then Supabase Storage
    const activeStorage = r2Storage || supabaseStorage;
    const activeBucket = r2Storage ? R2_BUCKET : SUPABASE_STORAGE_BUCKET;
    const activePublicBase = r2Storage ? R2_PUBLIC_BASE : SUPABASE_PUBLIC_BASE;
    const storageName = r2Storage ? 'R2' : 'Supabase';

    if (activeStorage) {
      try {
        // Upload full-size webp image — immutable cache (UUID key never changes)
        await activeStorage.send(new PutObjectCommand({
          Bucket: activeBucket,
          Key: key,
          Body: webpBuffer,
          ContentType: 'image/webp',
          CacheControl: 'public, max-age=31536000, immutable',
        }));
        const url = `${activePublicBase}/${key}`;

        // Generate thumbnail (400px wide) for grid views
        let thumbnailUrl = null;
        try {
          const thumbKey = key.replace(/\.webp$/, '_thumb.webp');
          const thumbBuffer = await sharp(buffer)
            .resize({ width: 400, withoutEnlargement: true })
            .webp({ quality: 75, effort: 6 })
            .toBuffer();
          await activeStorage.send(new PutObjectCommand({
            Bucket: activeBucket,
            Key: thumbKey,
            Body: thumbBuffer,
            ContentType: 'image/webp',
            CacheControl: 'public, max-age=31536000, immutable',
          }));
          thumbnailUrl = `${activePublicBase}/${thumbKey}`;
        } catch (thumbErr) {
          console.warn('[UPLOAD] Thumbnail generation failed:', thumbErr.message);
        }

        return res.json({ url, thumbnailUrl, width: imgWidth, height: imgHeight, deleteUrl: `${storageName.toLowerCase()}:${key}`, provider: storageName.toLowerCase() });
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
    return res.json({ url: imgbbData.data.url, width: imgWidth, height: imgHeight, deleteUrl: imgbbData.data.delete_url, provider: 'imgbb' });
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

// ───── Modularized routes (Batch 1: health, categories, admin, seller, misc) ─────
registerRoutes(app);

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

// Diversity reranker: hard cap on seller/category representation in the personalized feed.
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

  // Extract user ID for engagement state (is_liked/is_wishlisted) and personalized feed
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

  // Engagement param: always push userId (or null) for is_liked/is_wishlisted subqueries
  const engagementUserId = userId || null;
  params.push(engagementUserId);
  const engIdx = paramIndex; // param slot for engagement userId
  paramIndex++;

  let orderBy = 'p.created_at DESC';
  let selectExtra = '';
  let joinExtra = '';

  if (usePersonalized && userId) {
    // Personalized scoring: Phase 1 — session intent, trending pool, dwell signal, diversity
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
      -- Session intent: what categories has this user been browsing in the last 30 minutes?
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
      -- Dwell signal: how long has the user spent looking at each product?
      user_dwell AS (
        SELECT product_id, MAX(duration_ms) AS max_dwell_ms
        FROM feed_events
        WHERE user_id = $${paramIndex} AND event_type = 'dwell'
        GROUP BY product_id
      ),
      -- Trending: weighted engagement in the last 24h, deduped per user to prevent gaming.
      -- save=5, like=3, dwell(viewed 5s+)=2, view=1. Min threshold: 3 unique users or 10 weighted points.
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
      -- What the user has already seen/engaged with (dedup source for collaborative + similarity)
      user_product_views AS (
        SELECT DISTINCT product_id FROM feed_events WHERE user_id = $${paramIndex}
        UNION
        SELECT product_id FROM wishlists WHERE user_id = $${paramIndex}
      ),
      -- Product similarity: products co-purchased with products this user engaged with.
      -- Uses the existing product_cooccurrences table (actual purchase data = strongest signal).
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
      -- Collaborative filtering: users who behave like you also engage with...
      -- Step 1: find users with overlapping likes/saves (min 2 overlap)
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
      -- Step 2: products those users engaged with that this user hasn't seen
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
            THEN 'Similar to what you\'ve browsed'
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
          -- Existing signals (unchanged weights)
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
          -- Session intent: categories browsed in last 30 min
          + COALESCE((SELECT 2.0 * LEAST(si.recent_views::numeric / 5.0, 1.0)
            FROM user_session_intent si WHERE si.category_id = p2.category_id LIMIT 1), 0)
          -- Dwell: time spent viewing (max at 30s)
          + COALESCE((SELECT 1.5 * LEAST(ud.max_dwell_ms::numeric / 30000.0, 1.0)
            FROM user_dwell ud WHERE ud.product_id = p2.id LIMIT 1), 0)
          -- Trending: weighted engagement from unique users (max at 20 points)
          + COALESCE((SELECT 1.0 * LEAST(tp.trend_score::numeric / 20.0, 1.5)
            FROM trending_products tp WHERE tp.product_id = p2.id LIMIT 1), 0)
          -- Phase 2: Product similarity (co-purchased with user's engaged products)
          + COALESCE((SELECT 2.0 * LEAST(ps.similarity_score::numeric / 5.0, 1.5)
            FROM product_similar ps WHERE ps.product_id = p2.id LIMIT 1), 0)
          -- Phase 2: Collaborative filtering (users like you also engage with this)
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
    // Phase 1: diversity reranker — prevent same seller/category from dominating the feed
    if (usePersonalized && products.length > 1) {
      products = diversifyFeed(products);
    }
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
      // Support both plain URL strings and { url, width, height } objects
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

// ───── Category routes (extracted to src/routes/categories.js) ─────

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
      `SELECT id, full_name, phone, natcash_phone FROM users WHERE id = $1`,
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

// ── Deferred checkout: save cart + create MonCash payment without creating order ──
app.post('/api/checkout/pending', authRequired, async (req, res) => {
  const { cart, deliveryMethod, deliveryName, deliveryPhone, deliveryAddress, deliveryCity, deliveryNote, meetupLat, meetupLng, meetupAddress, meetupName, paymentMethod, promoCode, totalAmount } = req.body;
  if (!cart || !Array.isArray(cart) || cart.length === 0) return res.status(400).json({ error: 'Cart is empty' });

  try {
    // Save pending checkout
    const result = await pool.query(
      `INSERT INTO pending_checkouts (user_id, cart_data, delivery_method, delivery_name, delivery_phone, delivery_address, delivery_city, delivery_note, meetup_lat, meetup_lng, meetup_address, meetup_name, payment_method, promo_code, total_amount)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING id`,
      [req.user.id, JSON.stringify(cart), deliveryMethod, deliveryName || null, deliveryPhone || null, deliveryAddress || null, deliveryCity || null, deliveryNote || null, meetupLat || null, meetupLng || null, meetupAddress || null, meetupName || null, paymentMethod || 'moncash', promoCode || null, totalAmount || 0]
    );
    const pendingId = result.rows[0].id;

    if (paymentMethod === 'natcash') {
      // NatCash: return pending ID so frontend can create order on confirm
      return res.json({ pendingId, paymentMethod: 'natcash' });
    }

    // MonCash: create payment with pending checkout ID as reference
    const referenceId = pendingId;
    const moncashRes = await fetch(
      process.env.MONCASH_PAY_CREATE_URL || 'https://hvlmeoqyxaguzcujpmit.supabase.co/functions/v1/pay-create',
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.MCC_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Math.round(parseFloat(totalAmount)),
          referenceId,
          returnUrl: `${process.env.PRODUCTION_URL || 'https://maurmaket.onrender.com'}/payment/return?pending=${pendingId}`,
        }),
        signal: AbortSignal.timeout(15000),
      }
    );
    if (!moncashRes.ok) {
      const errText = await moncashRes.text();
      console.error(`MonCashConnect HTTP ${moncashRes.status}:`, errText);
      return res.status(502).json({ error: 'Payment provider error' });
    }
    const data = await moncashRes.json();
    if (!data.paymentUrl) return res.status(502).json({ error: 'Payment provider error' });

    await pool.query('UPDATE pending_checkouts SET moncash_reference = $1 WHERE id = $2', [referenceId, pendingId]);
    res.json({ paymentUrl: data.paymentUrl, pendingId });
  } catch (err) {
    console.error('Pending checkout error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});


// Check pending checkout status (for PaymentReturnScreen polling)
app.get('/api/checkout/pending/:id/status', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, status, created_at FROM pending_checkouts WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const pc = result.rows[0];
    // Check if expired (30 min)
    const age = Date.now() - new Date(pc.created_at).getTime();
    if (pc.status === 'pending' && age > 30 * 60 * 1000) {
      await pool.query("UPDATE pending_checkouts SET status = 'expired' WHERE id = $1", [req.params.id]);
      return res.json({ status: 'expired' });
    }
    if (pc.status === 'completed') {
      // Find the order created from this pending checkout
      const orderRes = await pool.query(
        'SELECT id FROM orders WHERE buyer_id = $1 AND created_at >= $2 ORDER BY created_at DESC LIMIT 1',
        [req.user.id, pc.created_at]
      );
      return res.json({ status: 'completed', orderId: orderRes.rows[0]?.id });
    }
    res.json({ status: pc.status });
  } catch (err) {
    console.error('Pending checkout status error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── NatCash: get seller info from pending checkout (for NatCashPaymentScreen display) ──
app.get('/api/checkout/pending/:id/seller-info', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT cart_data FROM pending_checkouts WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const cartData = result.rows[0].cart_data;
    // Get unique seller IDs from cart items
    const sellerIds = [...new Set(cartData.map(i => i.seller_id).filter(Boolean))];
    if (sellerIds.length === 0) return res.json({ sellerName: 'Seller', sellerPhone: '' });
    // Fetch first seller's info (NatCash is single-seller in practice)
    const sellerRes = await pool.query(
      'SELECT full_name, phone, natcash_phone FROM users WHERE id = $1', [sellerIds[0]]
    );
    if (sellerRes.rows.length === 0) return res.json({ sellerName: 'Seller', sellerPhone: '' });
    const s = sellerRes.rows[0];
    res.json({
      sellerName: s.full_name,
      sellerPhone: s.natcash_phone || s.phone || '',
    });
  } catch (err) {
    console.error('Pending checkout seller-info error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── NatCash: confirm payment → create order from pending checkout ──
app.post('/api/checkout/pending/:id/confirm-natcash', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM pending_checkouts WHERE id = $1 AND user_id = $2 AND status = 'pending'",
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      // Check if already completed
      const done = await pool.query(
        "SELECT status FROM pending_checkouts WHERE id = $1 AND user_id = $2",
        [req.params.id, req.user.id]
      );
      if (done.rows.length > 0 && done.rows[0].status === 'completed') {
        // Already confirmed — find the order
        const orderRes = await pool.query(
          'SELECT id FROM orders WHERE buyer_id = $1 AND created_at >= $2 ORDER BY created_at DESC LIMIT 1',
          [req.user.id, done.rows[0].created_at || new Date()]
        );
        return res.json({ orderId: orderRes.rows[0]?.id, alreadyConfirmed: true });
      }
      return res.status(404).json({ error: 'Pending checkout not found or expired' });
    }
    const pc = result.rows[0];
    const { smsData } = req.body || {};
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const cartData = pc.cart_data;
      const items = cartData.map(i => ({ productId: i.id || i.productId, quantity: i.quantity }));
      // Calculate total from cart
      let totalAmount = 0;
      for (const item of items) {
        const prodRes = await client.query('SELECT price, effective_price FROM products WHERE id = $1 FOR UPDATE', [item.productId]);
        if (prodRes.rows.length > 0) {
          const price = prodRes.rows[0].effective_price || prodRes.rows[0].price;
          totalAmount += price * item.quantity;
        }
      }
      // Apply promo discount if present
      if (pc.promo_code) {
        try {
          const promoRes = await client.query('SELECT discount_type, discount_value FROM promo_codes WHERE code = $1 AND is_active = true', [pc.promo_code]);
          if (promoRes.rows.length > 0) {
            const promo = promoRes.rows[0];
            const discount = promo.discount_type === 'percentage' ? totalAmount * (promo.discount_value / 100) : promo.discount_value;
            totalAmount = Math.max(0, totalAmount - discount);
          }
        } catch { /* ignore */ }
      }
      // Create the order
      const orderRes = await client.query(
        `INSERT INTO orders (buyer_id, total_amount, status, payment_method, delivery_method, delivery_name, delivery_phone, delivery_address, delivery_city, delivery_note, meetup_lat, meetup_lng, meetup_address, meetup_name)
         VALUES ($1, $2, 'paid', 'natcash', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
        [pc.user_id, totalAmount, pc.delivery_method, pc.delivery_name, pc.delivery_phone, pc.delivery_address, pc.delivery_city, pc.delivery_note, pc.meetup_lat, pc.meetup_lng, pc.meetup_address, pc.meetup_name]
      );
      const orderId = orderRes.rows[0].id;
      // Create order items + decrement stock
      for (const item of items) {
        const prodRes = await client.query('SELECT seller_id, price, effective_price FROM products WHERE id = $1', [item.productId]);
        if (prodRes.rows.length > 0) {
          const sellerId = prodRes.rows[0].seller_id;
          const price = prodRes.rows[0].effective_price || prodRes.rows[0].price;
          await client.query(
            'INSERT INTO order_items (order_id, product_id, seller_id, quantity, price) VALUES ($1, $2, $3, $4, $5)',
            [orderId, item.productId, sellerId, item.quantity, price]
          );
          await client.query('UPDATE products SET stock = stock - $1 WHERE id = $2 AND stock >= $1', [item.quantity, item.productId]);
        }
      }
      // Log order event
      const smsNote = smsData ? `NatCash transfer confirmed (transcode: ${smsData.transcode})` : 'NatCash transfer confirmed (SMS detected)';
      await client.query(
        "INSERT INTO order_events (order_id, event_type, actor_id, note) VALUES ($1, 'payment_received', $2, $3)",
        [orderId, pc.user_id, smsNote]
      );
      // Mark pending checkout as completed
      await client.query("UPDATE pending_checkouts SET status = 'completed' WHERE id = $1", [pc.id]);
      await client.query('COMMIT');
      console.log(`NatCash: created order ${orderId} from pending checkout ${pc.id}`);
      res.json({ orderId });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('NatCash confirm error:', err);
      res.status(500).json({ error: 'Server error' });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('NatCash confirm-natcash error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Client-reported abandoned payment — creates a persistent notification
app.post('/api/payments/abandoned', authRequired, async (req, res) => {
  try {
    const { pendingId, orderId } = req.body;
    await createNotification(
      req.user.id, 'payment_failed', 'Payment not completed',
      'Your payment was not processed. Your items are still in your cart.',
      { orderId: orderId || pendingId }
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Abandoned payment notification error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/orders', authRequired, dobRequired, async (req, res) => {
  // Email verification gate
  const evCheck = await pool.query('SELECT email_verified FROM users WHERE id = $1', [req.user.id]);
  if (!evCheck.rows[0]?.email_verified) {
    return res.status(403).json({ error: 'email_not_verified', message: 'Please verify your email to place orders.' });
  }
  const { items, deliveryMethod, deliveryName, deliveryPhone, deliveryAddress, deliveryCity, deliveryNote, promoCode, meetupLat, meetupLng, meetupAddress, meetupName } = req.body;
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
    const paymentMethod = req.body.paymentMethod || 'moncash';
    const orderResult = await client.query(
      `INSERT INTO orders (buyer_id, total_amount, status, delivery_method, payment_method, delivery_name, delivery_phone, delivery_address, delivery_city, delivery_note, meetup_lat, meetup_lng, meetup_address, meetup_name, meetup_proposed_by)
       VALUES ($1, $2, 'pending', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
      [req.user.id, finalTotal, method, paymentMethod, deliveryName || null, deliveryPhone || null, deliveryAddress || null, deliveryCity || null, deliveryNote || null,
       meetupLat ? parseFloat(meetupLat) : null, meetupLng ? parseFloat(meetupLng) : null, meetupAddress || null, meetupName || null,
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
      createNotification(sid, 'new_order', 'New order', `${buyerName} bought ${orderItems[0]?.name || 'an item'}`, notifData);
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

// canAccessOrder imported from src/utils/helpers.js

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
      createNotification(escrow.seller_id, 'payout_released', 'Payout released',
        `Order #${req.params.id.slice(0, 8)} is complete`, { orderId: req.params.id, amount: parseFloat(escrow.net_amount) });
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

    // If order was NatCash, redirect back to NatCash payment screen instead of calling MonCash
    if (order.payment_method === 'natcash') {
      return res.json({ retryMethod: 'natcash', orderId: order.id });
    }

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

// Batch 6 routes extracted to src/routes/ (seller-dashboard, promos, analytics, messaging, offers, disputes, order-notes)
// Batch 7 routes extracted to src/routes/ (payments, payouts, subscriptions, feed)

// ───── Background Jobs (extracted to src/jobs/index.js) ─────
startJobs();

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
