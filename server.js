import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import sharp from 'sharp';
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

    // 44. Messaging maturity — message states, reactions, reply, edit/delete, pin, mute, block
    await step('Messaging maturity schema', () => c.query(`
      -- Message type, reply, edit/delete support
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_type VARCHAR(20) DEFAULT 'text';
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES messages(id);
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT false;
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP;

      -- Conversation pin and mute
      ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false;
      ALTER TABLE conversations ADD COLUMN IF NOT EXISTS muted_until TIMESTAMP;

      -- Message reactions
      CREATE TABLE IF NOT EXISTS message_reactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        message_id UUID REFERENCES messages(id) ON DELETE CASCADE NOT NULL,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
        emoji VARCHAR(10) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(message_id, user_id, emoji)
      );
      CREATE INDEX IF NOT EXISTS idx_message_reactions_message ON message_reactions(message_id);

      -- Message delivery/read states per recipient
      CREATE TABLE IF NOT EXISTS message_deliveries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        message_id UUID REFERENCES messages(id) ON DELETE CASCADE NOT NULL,
        recipient_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
        status VARCHAR(20) DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'read')),
        delivered_at TIMESTAMP,
        read_at TIMESTAMP,
        UNIQUE(message_id, recipient_id)
      );
      CREATE INDEX IF NOT EXISTS idx_message_deliveries_msg ON message_deliveries(message_id);
      CREATE INDEX IF NOT EXISTS idx_message_deliveries_recipient ON message_deliveries(recipient_id, status);

      -- Block users
      CREATE TABLE IF NOT EXISTS blocked_users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        blocker_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
        blocked_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(blocker_id, blocked_id)
      );
      CREATE INDEX IF NOT EXISTS idx_blocked_users_blocker ON blocked_users(blocker_id);
    `));

    // 45. Backfill delivery states for existing messages
    await step('Backfill message deliveries', () => c.query(`
      INSERT INTO message_deliveries (message_id, recipient_id, status, delivered_at, read_at)
      SELECT m.id,
        CASE WHEN m.sender_id = c.buyer_id THEN c.seller_id ELSE c.buyer_id END,
        CASE WHEN m.is_read THEN 'read' ELSE 'delivered' END,
        m.created_at,
        CASE WHEN m.is_read THEN m.created_at ELSE NULL END
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      ON CONFLICT (message_id, recipient_id) DO NOTHING;
    `));

    // ────── Checkout v2: Multi-seller entity model ──────
    // seller_fulfillments: per-seller payment + fulfillment tracking
    await step('seller_fulfillments table', () => c.query(`
      CREATE TABLE IF NOT EXISTS seller_fulfillments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
        seller_id UUID REFERENCES users(id) NOT NULL,
        payment_status VARCHAR(20) DEFAULT 'pending'
          CHECK (payment_status IN ('pending','buyer_claimed','verified','failed','expired','disputed')),
        fulfillment_status VARCHAR(20) DEFAULT 'pending'
          CHECK (fulfillment_status IN ('pending','processing','shipped','delivered','completed','cancelled')),
        payment_method VARCHAR(20),
        payment_reference TEXT,
        net_amount DECIMAL(10,2),
        claimed_at TIMESTAMP,
        verified_at TIMESTAMP,
        verification_method VARCHAR(50),
        idempotency_key TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(order_id, seller_id)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_seller_fulfillments_idempotency
        ON seller_fulfillments(idempotency_key) WHERE idempotency_key IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_seller_fulfillments_order ON seller_fulfillments(order_id);
      CREATE INDEX IF NOT EXISTS idx_seller_fulfillments_seller ON seller_fulfillments(seller_id);
      CREATE INDEX IF NOT EXISTS idx_seller_fulfillments_payment ON seller_fulfillments(payment_status);
    `));

    // stock_reservations: temporary holds during checkout
    await step('stock_reservations table', () => c.query(`
      CREATE TABLE IF NOT EXISTS stock_reservations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        checkout_id UUID REFERENCES pending_checkouts(id) ON DELETE CASCADE,
        order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
        product_id UUID REFERENCES products(id) ON DELETE CASCADE NOT NULL,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        reserved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        released_at TIMESTAMP,
        status VARCHAR(20) DEFAULT 'active'
          CHECK (status IN ('active','confirmed','released')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_reservations_checkout_product
        ON stock_reservations(product_id, checkout_id) WHERE checkout_id IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_reservations_order_product
        ON stock_reservations(product_id, order_id) WHERE order_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_stock_reservations_product ON stock_reservations(product_id, status);
      CREATE INDEX IF NOT EXISTS idx_stock_reservations_expires ON stock_reservations(expires_at) WHERE status = 'active';
      -- seller_id for per-seller stock release on NatCash expiry
      ALTER TABLE stock_reservations ADD COLUMN IF NOT EXISTS seller_id UUID REFERENCES users(id);
      CREATE INDEX IF NOT EXISTS idx_stock_reservations_seller ON stock_reservations(seller_id) WHERE status = 'active';
    `));

    // NatCash payment sessions: paste-verification flow (no SMS permissions)
    await step('natcash_payment_sessions table', () => c.query(`
      CREATE TABLE IF NOT EXISTS natcash_payment_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        checkout_id UUID REFERENCES pending_checkouts(id) ON DELETE CASCADE NOT NULL,
        seller_id UUID REFERENCES users(id) NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        recipient_phone VARCHAR(20) NOT NULL,
        status VARCHAR(20) DEFAULT 'pending'
          CHECK (status IN ('pending','verified','expired')),
        sms_transcode TEXT,
        sms_raw TEXT,
        verified_at TIMESTAMP,
        expires_at TIMESTAMP NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '15 minutes'),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_ncps_checkout_seller
        ON natcash_payment_sessions(checkout_id, seller_id);
      CREATE INDEX IF NOT EXISTS idx_ncps_expires ON natcash_payment_sessions(expires_at) WHERE status = 'pending';
    `));

    // Migrate existing orders: create seller_fulfillments rows for each unique seller
    await step('Migrate existing orders to seller_fulfillments', async () => {
      const { rows: existingOrders } = await c.query(`
        SELECT DISTINCT o.id AS order_id, oi.seller_id, o.payment_method, o.status
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        LEFT JOIN seller_fulfillments sf ON sf.order_id = o.id AND sf.seller_id = oi.seller_id
        WHERE sf.id IS NULL
      `);
      for (const row of existingOrders) {
        const paymentStatus = row.status === 'paid' || row.status === 'completed' ? 'verified'
          : row.status === 'cancelled' ? 'expired'
          : 'pending';
        const fulfillmentStatus = row.status === 'completed' ? 'completed'
          : row.status === 'cancelled' ? 'cancelled'
          : row.status === 'delivered' ? 'delivered'
          : row.status === 'shipped' ? 'shipped'
          : row.status === 'processing' ? 'processing'
          : 'pending';
        await c.query(`
          INSERT INTO seller_fulfillments (order_id, seller_id, payment_status, fulfillment_status, payment_method)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (order_id, seller_id) DO NOTHING
        `, [row.order_id, row.seller_id, paymentStatus, fulfillmentStatus, row.payment_method]);
      }
      if (existingOrders.length > 0) console.log(`[MIGRATION] Created ${existingOrders.length} seller_fulfillments rows from existing orders`);
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

// ───── All routes registered via src/routes/index.js ─────
registerRoutes(app);

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
