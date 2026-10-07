import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import path from 'path';
const { join } = path;
import morgan from 'morgan';

// ───── Modularized infrastructure ─────
import { pool, isTestMode, neonBackupDatabaseUrl, setDbController } from './src/config/database.js';
import { supabaseStorage, SUPABASE_STORAGE_BUCKET, SUPABASE_KYC_BUCKET, SUPABASE_PUBLIC_BASE, r2Storage, R2_BUCKET, R2_PUBLIC_BASE, PutObjectCommand, DeleteObjectCommand } from './src/config/storage.js';
import { JWT_SECRET, BCRYPT_ROUNDS, PRODUCTION_URL } from './src/config/security.js';
import { generalLimiter, signinLimiter, paymentLimiter, uploadLimiter, msgLimiter, convLimiter, verifyLimiter } from './src/middleware/rateLimit.js';
import { initRealtime, closeRealtime } from './src/realtime.js';
import { optionalAuth, authRequired, sellerRequired, verifiedSellerRequired, dobRequired } from './src/middleware/auth.js';
import { createNotification, sendPushNotification } from './src/utils/notifications.js';
import { logOrderEvent, generateUsername, isAtLeast18, getCommissionRate, getSellerPaymentAllocations, reserveOrderStock, processRefundPayout, checkSubscriptionStatus, cleanupOldNotifications, recordProductCooccurrences } from './src/utils/helpers.js';
import { startJobs } from './src/jobs/index.js';
import { registerRoutes } from './src/routes/index.js';
import { createAuth, getAuth } from './src/config/auth.js';
import { registerTemporaryStorageUpload } from './src/utils/temporaryStorage.js';
import { BASELINE_POLICY_VERSIONS, POLICY_KINDS } from './src/utils/policyBaseline.js';
import { toNodeHandler } from 'better-auth/node';

// ───── Better Auth Studio (admin dashboard, optional) ─────
let betterAuthStudio;
try {
  const mod = await import('better-auth-studio/express');
  betterAuthStudio = mod.betterAuthStudio;
} catch (e) {
  // Studio deps not available in Docker — skip silently
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3001;
let server;

const REQUIRED_AUTH_MIGRATIONS = [
  'Better Auth: sessions table',
  'Better Auth: accounts table',
  'Better Auth: import legacy bcrypt credentials',
  'Better Auth: verifications table',
  'Better Auth: verifications updated_at column',
  'Auth plugin: two-factor table',
  'Auth plugin: two-factor updated_at column',
  'Auth plugin: passkey table',
];

async function runMigrations(targetPool) {
  const c = await (targetPool || pool).connect();
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
        meetup_scheduled_at TIMESTAMPTZ,
        meetup_confirmed BOOLEAN DEFAULT false, meetup_proposed_by UUID REFERENCES users(id),
        meetup_started_at TIMESTAMP,
        meetup_expires_at TIMESTAMP,
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
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS meetup_expires_at TIMESTAMP;
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
        seller_id UUID REFERENCES users(id),
        raised_by UUID REFERENCES users(id) NOT NULL,
        reason VARCHAR(50) NOT NULL,
        description TEXT,
        status VARCHAR(20) DEFAULT 'open',
        resolution TEXT,
        response_deadline TIMESTAMPTZ,
        reminder_sent_at TIMESTAMPTZ,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `));
    await step('disputes seller scope', () => c.query(`ALTER TABLE disputes ADD COLUMN IF NOT EXISTS seller_id UUID REFERENCES users(id)`));
    await step('disputes cancellation response fields', () => c.query(`ALTER TABLE disputes ADD COLUMN IF NOT EXISTS response_deadline TIMESTAMPTZ; ALTER TABLE disputes ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ`));
    await step('disputes cancellation lookup index', () => c.query(`CREATE INDEX IF NOT EXISTS idx_disputes_cancellation_lookup ON disputes(order_id, seller_id, status) WHERE reason = 'cancellation_request'`));

    // 17. Platform revenue table
    await step('platform_revenue table', () => c.query(`
      CREATE TABLE IF NOT EXISTS platform_revenue (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID REFERENCES orders(id),
        seller_id UUID REFERENCES users(id),
        seller_tier VARCHAR(20),
        gross_amount DECIMAL(10,2) NOT NULL,
        commission_base DECIMAL(10,2) NOT NULL DEFAULT 0,
        collection_fee_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
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

    await step('MonCash platform payout settlement fields', () => c.query(`
      ALTER TABLE platform_payouts DROP CONSTRAINT IF EXISTS platform_payouts_status_check;
      ALTER TABLE platform_payouts ADD CONSTRAINT platform_payouts_status_check
        CHECK (status IN ('pending','processing','completed','failed'));
      ALTER TABLE platform_payouts ADD COLUMN IF NOT EXISTS fee_amount DECIMAL(10,2) NOT NULL DEFAULT 0;
      ALTER TABLE platform_payouts ADD COLUMN IF NOT EXISTS total_debit DECIMAL(10,2) NOT NULL DEFAULT 0;
      ALTER TABLE platform_payouts ADD COLUMN IF NOT EXISTS provider_reference VARCHAR(150);
      ALTER TABLE platform_payouts ADD COLUMN IF NOT EXISTS reconciled_by UUID REFERENCES users(id);
      ALTER TABLE platform_payouts ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMP;
      ALTER TABLE platform_payouts ADD COLUMN IF NOT EXISTS reconciliation_note TEXT;
      ALTER TABLE platform_payouts ADD COLUMN IF NOT EXISTS settlement_confirmed BOOLEAN NOT NULL DEFAULT false;
      UPDATE platform_payouts SET total_debit = amount + fee_amount WHERE total_debit = 0;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_payouts_provider_reference
        ON platform_payouts(provider_reference) WHERE provider_reference IS NOT NULL;
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
        reason TEXT,
        cause VARCHAR(20),
        responsible_seller_id UUID REFERENCES users(id),
        commission_reversed DECIMAL(10,2) NOT NULL DEFAULT 0,
        collection_fee_kept DECIMAL(10,2) NOT NULL DEFAULT 0,
        seller_fee_share DECIMAL(10,2) NOT NULL DEFAULT 0,
        requested_by UUID REFERENCES users(id),
        approved_by UUID REFERENCES users(id),
        destination_verified BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `));

    await step('unmatched_payments table', () => c.query(`
      CREATE TABLE IF NOT EXISTS unmatched_payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        reference TEXT NOT NULL,
        event_id TEXT,
        event_type VARCHAR(40),
        note TEXT,
        resolved BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_unmatched_payments_open ON unmatched_payments(resolved, created_at);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_unmatched_payments_event_id
        ON unmatched_payments(event_id) WHERE event_id IS NOT NULL;
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

    await step('NatCash access subscriptions and payments', () => c.query(`
      CREATE TABLE IF NOT EXISTS natcash_access_subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(20) NOT NULL DEFAULT 'active'
          CHECK (status IN ('active','paused','expired')),
        started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMPTZ NOT NULL,
        paused_at TIMESTAMPTZ,
        last_payment_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_natcash_access_seller_expiry
        ON natcash_access_subscriptions(seller_id, expires_at DESC);
      CREATE TABLE IF NOT EXISTS natcash_access_payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reference_id VARCHAR(150) NOT NULL UNIQUE,
        amount_htg DECIMAL(10,2) NOT NULL CHECK (amount_htg = 500),
        status VARCHAR(20) NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending','completed','failed','reconciliation_required')),
        provider_payment_id TEXT,
        paid_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_natcash_access_payments_seller
        ON natcash_access_payments(seller_id, created_at DESC);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_natcash_access_one_unresolved_payment
        ON natcash_access_payments(seller_id) WHERE status IN ('pending','reconciliation_required');
      CREATE TABLE IF NOT EXISTS natcash_access_reminders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        subscription_id UUID NOT NULL REFERENCES natcash_access_subscriptions(id) ON DELETE CASCADE,
        seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        local_date DATE NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(subscription_id, local_date)
      );
    `));

    await step('Temporary KYC upload expiry queue', () => c.query(`
      CREATE TABLE IF NOT EXISTS temporary_storage_uploads (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        provider VARCHAR(20) NOT NULL CHECK (provider IN ('supabase', 'r2')),
        bucket_name TEXT NOT NULL,
        object_key TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(provider, bucket_name, object_key)
      );
      CREATE INDEX IF NOT EXISTS idx_temporary_storage_uploads_expiry ON temporary_storage_uploads(expires_at);
      ALTER TABLE temporary_storage_uploads ENABLE ROW LEVEL SECURITY;
    `));
    if (!isTestMode && !targetPool && supabaseStorage) {
      await step('Private Supabase KYC bucket', () => c.query(`
        INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
        VALUES ('kyc-documents', 'kyc-documents', false, 10485760, ARRAY['image/webp']::text[])
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name, public = false, file_size_limit = EXCLUDED.file_size_limit,
          allowed_mime_types = EXCLUDED.allowed_mime_types;
      `));
    }

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
        commission_base DECIMAL(10,2) NOT NULL DEFAULT 0,
        collection_fee_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
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
    // Public map points are separately consented, generalized coordinates; private coordinates
    // remain available to fulfillment calculations and are never returned by seller discovery.
    await step('seller public map area consent', () => c.query(`
      ALTER TABLE seller_locations ADD COLUMN IF NOT EXISTS public_lat DECIMAL(10,3);
      ALTER TABLE seller_locations ADD COLUMN IF NOT EXISTS public_lng DECIMAL(10,3);
      ALTER TABLE seller_locations ADD COLUMN IF NOT EXISTS public_area_confirmed BOOLEAN NOT NULL DEFAULT false;
      UPDATE seller_locations SET is_visible = false WHERE public_area_confirmed = false AND is_visible = true;
    `));

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
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS product_data JSONB;
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

    // Inbox/chat v1: durable product cards, negotiation history, and per-user controls.
    await step('Inbox and chat v1 schema', () => c.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS presence_visibility VARCHAR(30) NOT NULL DEFAULT 'chatted_with';
      ALTER TABLE users DROP CONSTRAINT IF EXISTS users_presence_visibility_check;
      ALTER TABLE users ADD CONSTRAINT users_presence_visibility_check
        CHECK (presence_visibility IN ('everyone', 'chatted_with', 'nobody'));
      ALTER TABLE messages ALTER COLUMN content DROP NOT NULL;
      ALTER TABLE message_offers ADD COLUMN IF NOT EXISTS negotiation_id UUID;
      ALTER TABLE message_offers ADD COLUMN IF NOT EXISTS counter_count INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE message_offers ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE message_offers ADD COLUMN IF NOT EXISTS accepted_expires_at TIMESTAMP;
      ALTER TABLE message_offers ADD COLUMN IF NOT EXISTS accepted_checkout_id UUID;
      UPDATE message_offers SET negotiation_id = message_id WHERE negotiation_id IS NULL;
      ALTER TABLE message_offers ALTER COLUMN negotiation_id SET NOT NULL;
      ALTER TABLE message_offers DROP CONSTRAINT IF EXISTS message_offers_quantity_check;
      ALTER TABLE message_offers ADD CONSTRAINT message_offers_quantity_check CHECK (quantity > 0);
      CREATE INDEX IF NOT EXISTS idx_message_offers_negotiation ON message_offers(negotiation_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_message_offers_user_action ON message_offers(status, buyer_id, seller_id, expires_at);

      CREATE TABLE IF NOT EXISTS conversation_user_settings (
        conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
        is_pinned BOOLEAN NOT NULL DEFAULT false,
        is_muted BOOLEAN NOT NULL DEFAULT false,
        muted_until TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (conversation_id, user_id)
      );
      ALTER TABLE conversation_user_settings ADD COLUMN IF NOT EXISTS is_muted BOOLEAN NOT NULL DEFAULT false;
      CREATE INDEX IF NOT EXISTS idx_conversation_user_settings_user ON conversation_user_settings(user_id, is_pinned DESC, updated_at DESC);

      CREATE TABLE IF NOT EXISTS message_reports (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        reporter_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
        reported_user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
        conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
        reason VARCHAR(40) NOT NULL CHECK (reason IN ('harassment', 'scam', 'inappropriate', 'spam', 'other')),
        details TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed')),
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CHECK (reporter_id <> reported_user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_message_reports_status_created ON message_reports(status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_message_reports_reported_user ON message_reports(reported_user_id, created_at DESC);

      -- Preserve existing settings as the starting point, then make them participant-specific.
      INSERT INTO conversation_user_settings (conversation_id, user_id, is_pinned, muted_until)
      SELECT c.id, participant.user_id, COALESCE(c.is_pinned, false), c.muted_until
      FROM conversations c
      CROSS JOIN LATERAL (VALUES (c.buyer_id), (c.seller_id)) AS participant(user_id)
      ON CONFLICT (conversation_id, user_id) DO NOTHING;
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

    // MonCash outbound transfers need a stable request reference and an
    // explicit fee/debit amount. A 2xx create response is only acceptance;
    // the webhook is the settlement confirmation.
    await step('MonCash payout settlement fields', () => c.query(`
      ALTER TABLE payouts ADD COLUMN IF NOT EXISTS fee_amount DECIMAL(10,2) NOT NULL DEFAULT 0;
      ALTER TABLE payouts ADD COLUMN IF NOT EXISTS total_debit DECIMAL(10,2) NOT NULL DEFAULT 0;
      ALTER TABLE payouts ADD COLUMN IF NOT EXISTS provider_reference VARCHAR(150);
      ALTER TABLE payouts ADD COLUMN IF NOT EXISTS reconciled_by UUID REFERENCES users(id);
      ALTER TABLE payouts ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMP;
      ALTER TABLE payouts ADD COLUMN IF NOT EXISTS reconciliation_note TEXT;
      ALTER TABLE payouts ADD COLUMN IF NOT EXISTS settlement_confirmed BOOLEAN NOT NULL DEFAULT false;
      UPDATE payouts SET total_debit = amount + fee_amount WHERE total_debit = 0;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_payouts_provider_reference
        ON payouts(provider_reference) WHERE provider_reference IS NOT NULL;
      ALTER TABLE refund_payouts ADD COLUMN IF NOT EXISTS fee_amount DECIMAL(10,2) NOT NULL DEFAULT 0;
      ALTER TABLE refund_payouts ADD COLUMN IF NOT EXISTS provider_reference VARCHAR(150);
      ALTER TABLE refund_payouts ADD COLUMN IF NOT EXISTS reason TEXT;
      ALTER TABLE refund_payouts ADD COLUMN IF NOT EXISTS cause VARCHAR(20);
      ALTER TABLE refund_payouts ADD COLUMN IF NOT EXISTS responsible_seller_id UUID REFERENCES users(id);
      ALTER TABLE refund_payouts ADD COLUMN IF NOT EXISTS refunded_seller_id UUID REFERENCES users(id);
      ALTER TABLE refund_payouts DROP CONSTRAINT IF EXISTS refund_payouts_order_id_key;
      CREATE INDEX IF NOT EXISTS idx_refund_payouts_order_seller_status
        ON refund_payouts(order_id, refunded_seller_id, status);
      ALTER TABLE refund_payouts ADD COLUMN IF NOT EXISTS commission_reversed DECIMAL(10,2) NOT NULL DEFAULT 0;
      ALTER TABLE refund_payouts ADD COLUMN IF NOT EXISTS collection_fee_kept DECIMAL(10,2) NOT NULL DEFAULT 0;
      ALTER TABLE refund_payouts ADD COLUMN IF NOT EXISTS seller_fee_share DECIMAL(10,2) NOT NULL DEFAULT 0;
      ALTER TABLE refund_payouts ADD COLUMN IF NOT EXISTS requested_by UUID REFERENCES users(id);
      ALTER TABLE refund_payouts ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id);
      ALTER TABLE refund_payouts ADD COLUMN IF NOT EXISTS destination_verified BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE refund_payouts ADD COLUMN IF NOT EXISTS reconciled_by UUID REFERENCES users(id);
      ALTER TABLE refund_payouts ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMP;
      ALTER TABLE refund_payouts ADD COLUMN IF NOT EXISTS reconciliation_note TEXT;
      ALTER TABLE refund_payouts ADD COLUMN IF NOT EXISTS settlement_confirmed BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE refund_payouts DROP CONSTRAINT IF EXISTS refund_payouts_order_id_key;
      CREATE INDEX IF NOT EXISTS idx_refund_payouts_order_id ON refund_payouts(order_id, created_at);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_refund_payouts_provider_reference
        ON refund_payouts(provider_reference) WHERE provider_reference IS NOT NULL;
    `));

    await step('Seller refund fee debts', () => c.query(`
      CREATE TABLE IF NOT EXISTS seller_debts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        seller_id UUID NOT NULL REFERENCES users(id),
        order_id UUID REFERENCES orders(id),
        refund_id UUID REFERENCES refund_payouts(id),
        original_amount DECIMAL(10,2) NOT NULL CHECK (original_amount > 0),
        outstanding_amount DECIMAL(10,2) NOT NULL CHECK (outstanding_amount >= 0),
        reason TEXT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open','paid')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_seller_debts_open ON seller_debts(seller_id, created_at) WHERE status = 'open';
    `));

    await step('Seller debt MonCash repayment', () => c.query(`
      CREATE TABLE IF NOT EXISTS seller_debt_payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        seller_id UUID NOT NULL REFERENCES users(id),
        debt_amount DECIMAL(10,2) NOT NULL CHECK (debt_amount > 0),
        charge_amount DECIMAL(10,2) NOT NULL CHECK (charge_amount > 0),
        collection_fee_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
        reference_id VARCHAR(150) NOT NULL UNIQUE,
        provider_reference VARCHAR(150),
        status VARCHAR(20) NOT NULL DEFAULT 'created' CHECK (status IN ('created','processing','unknown','completed','failed')),
        settlement_confirmed BOOLEAN NOT NULL DEFAULT false,
        reconciled_by UUID REFERENCES users(id),
        reconciled_at TIMESTAMP,
        reconciliation_note TEXT,
        error_message TEXT,
        settled_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_seller_debt_payments_seller ON seller_debt_payments(seller_id, created_at DESC);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_seller_debt_payment_one_open
        ON seller_debt_payments(seller_id) WHERE status IN ('created','processing','unknown');
      CREATE UNIQUE INDEX IF NOT EXISTS idx_seller_debt_payment_provider_ref
        ON seller_debt_payments(provider_reference) WHERE provider_reference IS NOT NULL;
    `));

    await step('MonCash payment attempt ledger', () => c.query(`
      CREATE TABLE IF NOT EXISTS moncash_payment_attempts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        reference_id VARCHAR(150) NOT NULL UNIQUE,
        expected_amount DECIMAL(10,2) NOT NULL CHECK (expected_amount > 0),
        status VARCHAR(20) NOT NULL DEFAULT 'created' CHECK (status IN ('created','processing','unknown','completed','failed','expired')),
        provider_reference VARCHAR(150),
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_moncash_attempt_order_status
        ON moncash_payment_attempts(order_id, status, created_at DESC);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_moncash_one_open_attempt_per_order
        ON moncash_payment_attempts(order_id) WHERE status IN ('created','processing','unknown');
      CREATE UNIQUE INDEX IF NOT EXISTS idx_moncash_attempt_provider_reference
        ON moncash_payment_attempts(provider_reference) WHERE provider_reference IS NOT NULL;
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
    await step('Scheduled meetup column', () => c.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS meetup_scheduled_at TIMESTAMPTZ;`));

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
        meetup_at TIMESTAMPTZ,
        payment_method VARCHAR(20) DEFAULT 'moncash',
        promo_code TEXT,
        total_amount DECIMAL(10,2),
        status VARCHAR(20) DEFAULT 'pending',
        moncash_reference TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 minutes')
      );
      ALTER TABLE pending_checkouts ADD COLUMN IF NOT EXISTS fulfillment_terms JSONB NOT NULL DEFAULT '[]'::jsonb;
      ALTER TABLE pending_checkouts ADD COLUMN IF NOT EXISTS meetup_at TIMESTAMPTZ;
    `));
await step('NatCash phone separation', () => c.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS natcash_phone VARCHAR(20);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS accepted_payment_methods TEXT[] DEFAULT ARRAY['moncash'];
    `));

    // SIM preference columns for carrier-aware payment routing
    // Stores the user's preferred Android subscription ID per payment provider.
    // These are mutable routing preferences — validated against active SIMs before each use.
    await step('SIM preference columns', () => c.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_natcash_sub_id INTEGER;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_moncash_sub_id INTEGER;
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
      -- Client-generated id for idempotent send retries (WhatsApp key_id pattern)
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS client_id UUID;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_client_send ON messages(conversation_id, sender_id, client_id);

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
      -- Keep the most recent legacy reaction per person/message, then enforce
      -- the WhatsApp-style one-reaction-per-person rule for future writes.
      DELETE FROM message_reactions older
      USING message_reactions newer
      WHERE older.message_id = newer.message_id
        AND older.user_id = newer.user_id
        AND (older.created_at < newer.created_at OR (older.created_at = newer.created_at AND older.id < newer.id));
      CREATE UNIQUE INDEX IF NOT EXISTS idx_message_reactions_one_per_user
        ON message_reactions(message_id, user_id);
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

    // 46. Voice message columns
    await step('Voice message columns', () => c.query(`
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS audio_url TEXT;
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS audio_duration INTEGER;
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

    // ────── Fulfillment agreements: immutable, seller-specific terms ──────
    // An order may contain multiple sellers.  Each seller gets an independent
    // commitment, rather than inheriting mutable order-wide delivery fields.
    await step('Fulfillment agreement state', () => c.query(`
      ALTER TABLE seller_fulfillments ADD COLUMN IF NOT EXISTS fulfillment_method VARCHAR(20)
        CHECK (fulfillment_method IN ('delivery', 'meetup'));
      ALTER TABLE seller_fulfillments ADD COLUMN IF NOT EXISTS agreement_status VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (agreement_status IN ('draft', 'proposed', 'accepted', 'locked', 'rejected', 'cancelled', 'disputed', 'completed'));
      ALTER TABLE seller_fulfillments ADD COLUMN IF NOT EXISTS buyer_accepted_at TIMESTAMPTZ;
      ALTER TABLE seller_fulfillments ADD COLUMN IF NOT EXISTS seller_accepted_at TIMESTAMPTZ;
      ALTER TABLE seller_fulfillments ADD COLUMN IF NOT EXISTS terms_locked_at TIMESTAMPTZ;
      ALTER TABLE seller_fulfillments ADD COLUMN IF NOT EXISTS delivery_fee DECIMAL(10,2) NOT NULL DEFAULT 0;
      ALTER TABLE seller_fulfillments ADD COLUMN IF NOT EXISTS fulfillment_lat DECIMAL(10,7);
      ALTER TABLE seller_fulfillments ADD COLUMN IF NOT EXISTS fulfillment_lng DECIMAL(10,7);
      ALTER TABLE seller_fulfillments ADD COLUMN IF NOT EXISTS fulfillment_address TEXT;
      ALTER TABLE seller_fulfillments ADD COLUMN IF NOT EXISTS fulfillment_note TEXT;
      ALTER TABLE seller_fulfillments ADD COLUMN IF NOT EXISTS meetup_started_at TIMESTAMPTZ;
      ALTER TABLE seller_fulfillments ADD COLUMN IF NOT EXISTS meetup_expires_at TIMESTAMPTZ;
      ALTER TABLE seller_fulfillments ADD COLUMN IF NOT EXISTS meetup_at TIMESTAMPTZ;
      ALTER TABLE seller_fulfillments ADD COLUMN IF NOT EXISTS dispute_id UUID REFERENCES disputes(id);
      CREATE INDEX IF NOT EXISTS idx_seller_fulfillments_agreement ON seller_fulfillments(order_id, agreement_status);

      CREATE TABLE IF NOT EXISTS seller_fulfillment_profiles (
        seller_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        delivery_enabled BOOLEAN NOT NULL DEFAULT false,
        meetup_enabled BOOLEAN NOT NULL DEFAULT false,
        delivery_radius_meters INTEGER NOT NULL DEFAULT 5000 CHECK (delivery_radius_meters BETWEEN 100 AND 50000),
        meetup_radius_meters INTEGER NOT NULL DEFAULT 12000 CHECK (meetup_radius_meters BETWEEN 100 AND 50000),
        delivery_fee_type VARCHAR(20) NOT NULL DEFAULT 'flat' CHECK (delivery_fee_type IN ('free', 'flat', 'distance', 'per_distance')),
        flat_delivery_fee DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (flat_delivery_fee >= 0),
        distance_fee_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
        distance_step_meters INTEGER NOT NULL DEFAULT 2000 CHECK (distance_step_meters BETWEEN 100 AND 50000),
        distance_step_fee DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (distance_step_fee >= 0),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      ALTER TABLE seller_fulfillment_profiles ADD COLUMN IF NOT EXISTS distance_step_meters INTEGER NOT NULL DEFAULT 2000 CHECK (distance_step_meters BETWEEN 100 AND 50000);
      ALTER TABLE seller_fulfillment_profiles ADD COLUMN IF NOT EXISTS distance_step_fee DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (distance_step_fee >= 0);
      ALTER TABLE seller_fulfillment_profiles DROP CONSTRAINT IF EXISTS seller_fulfillment_profiles_delivery_fee_type_check;
      ALTER TABLE seller_fulfillment_profiles ADD CONSTRAINT seller_fulfillment_profiles_delivery_fee_type_check CHECK (delivery_fee_type IN ('free', 'flat', 'distance', 'per_distance'));

      CREATE TABLE IF NOT EXISTS seller_fulfillment_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        fulfillment_id UUID NOT NULL REFERENCES seller_fulfillments(id) ON DELETE CASCADE,
        actor_id UUID REFERENCES users(id),
        event_type VARCHAR(50) NOT NULL,
        note TEXT,
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_fulfillment_events_fulfillment ON seller_fulfillment_events(fulfillment_id, created_at);
      ALTER TABLE seller_fulfillment_profiles ALTER COLUMN delivery_enabled SET DEFAULT false;
      ALTER TABLE seller_fulfillment_profiles ALTER COLUMN meetup_enabled SET DEFAULT false;

      CREATE TABLE IF NOT EXISTS pending_fulfillment_agreements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        checkout_id UUID NOT NULL REFERENCES pending_checkouts(id) ON DELETE CASCADE,
        seller_id UUID NOT NULL REFERENCES users(id),
        terms JSONB NOT NULL,
        buyer_accepted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        seller_accepted_at TIMESTAMPTZ,
        terms_locked_at TIMESTAMPTZ,
        status VARCHAR(20) NOT NULL DEFAULT 'proposed'
          CHECK (status IN ('proposed', 'accepted', 'rejected', 'expired', 'cancelled')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(checkout_id, seller_id)
      );
      CREATE INDEX IF NOT EXISTS idx_pending_fulfillment_agreements_seller ON pending_fulfillment_agreements(seller_id, status, created_at DESC);
      ALTER TABLE pending_checkouts ALTER COLUMN expires_at SET DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours');
      ALTER TABLE pending_fulfillment_agreements ADD COLUMN IF NOT EXISTS response_expires_at TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours');
      ALTER TABLE pending_fulfillment_agreements ADD COLUMN IF NOT EXISTS last_proposed_by UUID REFERENCES users(id);
      ALTER TABLE pending_fulfillment_agreements ADD COLUMN IF NOT EXISTS proposal_version INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE pending_fulfillment_agreements ALTER COLUMN buyer_accepted_at DROP NOT NULL;
      CREATE TABLE IF NOT EXISTS pending_fulfillment_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        checkout_id UUID NOT NULL REFERENCES pending_checkouts(id) ON DELETE CASCADE,
        seller_id UUID NOT NULL REFERENCES users(id),
        actor_id UUID REFERENCES users(id),
        action VARCHAR(30) NOT NULL,
        version INTEGER NOT NULL,
        terms JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_pending_fulfillment_history_lookup
        ON pending_fulfillment_history(checkout_id, seller_id, created_at);

      ALTER TABLE order_escrow ADD COLUMN IF NOT EXISTS commission_base DECIMAL(10,2) NOT NULL DEFAULT 0;
      ALTER TABLE platform_revenue ADD COLUMN IF NOT EXISTS commission_base DECIMAL(10,2) NOT NULL DEFAULT 0;
      ALTER TABLE order_escrow ADD COLUMN IF NOT EXISTS collection_fee_amount DECIMAL(10,2) NOT NULL DEFAULT 0;
      ALTER TABLE platform_revenue ADD COLUMN IF NOT EXISTS collection_fee_amount DECIMAL(10,2) NOT NULL DEFAULT 0;
      UPDATE order_escrow e SET commission_base = GREATEST(0, e.gross_amount - COALESCE(sf.delivery_fee, 0))
      FROM seller_fulfillments sf WHERE sf.order_id = e.order_id AND sf.seller_id = e.seller_id AND e.commission_base = 0;
      UPDATE platform_revenue p SET commission_base = GREATEST(0, p.gross_amount - COALESCE(sf.delivery_fee, 0))
      FROM seller_fulfillments sf WHERE sf.order_id = p.order_id AND sf.seller_id = p.seller_id AND p.commission_base = 0;
      UPDATE order_escrow e SET commission_base = e.gross_amount
      WHERE e.commission_base = 0 AND NOT EXISTS (SELECT 1 FROM seller_fulfillments sf WHERE sf.order_id = e.order_id AND sf.seller_id = e.seller_id);
      UPDATE platform_revenue p SET commission_base = p.gross_amount
      WHERE p.commission_base = 0 AND NOT EXISTS (SELECT 1 FROM seller_fulfillments sf WHERE sf.order_id = p.order_id AND sf.seller_id = p.seller_id);

      -- Provider-neutral payment lifecycle for one seller's locked agreement.
      -- NatCash may use SMS verification, while MonCash uses a provider webhook.
      CREATE TABLE IF NOT EXISTS fulfillment_payment_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        checkout_id UUID NOT NULL REFERENCES pending_checkouts(id) ON DELETE CASCADE,
        order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
        seller_id UUID NOT NULL REFERENCES users(id),
        provider VARCHAR(20) NOT NULL CHECK (provider IN ('moncash', 'natcash')),
        provider_reference VARCHAR(100) UNIQUE,
        amount DECIMAL(10,2) NOT NULL CHECK (amount >= 0),
        status VARCHAR(20) NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'expired', 'refunded')),
        completed_at TIMESTAMPTZ,
        expires_at TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '15 minutes'),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(checkout_id, seller_id, provider)
      );
      CREATE INDEX IF NOT EXISTS idx_fulfillment_payment_sessions_reference ON fulfillment_payment_sessions(provider_reference);
      CREATE INDEX IF NOT EXISTS idx_fulfillment_payment_sessions_checkout ON fulfillment_payment_sessions(checkout_id, status);
      ALTER TABLE fulfillment_payment_sessions ALTER COLUMN expires_at SET DEFAULT (CURRENT_TIMESTAMP + INTERVAL '15 minutes');
      CREATE TABLE IF NOT EXISTS meetup_place_confirmations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        place_key TEXT NOT NULL,
        place_label TEXT NOT NULL,
        lat DECIMAL(10,7) NOT NULL,
        lng DECIMAL(10,7) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(order_id, seller_id, user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_meetup_place_confirmations_recent
        ON meetup_place_confirmations(place_key, created_at DESC);
      CREATE TABLE IF NOT EXISTS meetup_place_reports (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        place_key TEXT NOT NULL,
        reason VARCHAR(40) NOT NULL,
        details TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(order_id, seller_id, reporter_id)
      );
      CREATE INDEX IF NOT EXISTS idx_meetup_place_reports_recent
        ON meetup_place_reports(place_key, created_at DESC);
      ALTER TABLE fulfillment_payment_sessions ADD COLUMN IF NOT EXISTS sms_transcode TEXT;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_fulfillment_payment_sessions_natcash_transcode
        ON fulfillment_payment_sessions(sms_transcode) WHERE sms_transcode IS NOT NULL;
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
    await step('Pending checkout order linkage', () => c.query(`
      ALTER TABLE pending_checkouts ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES orders(id) ON DELETE SET NULL;
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

    // ───── Better Auth tables ─────
    await step('Better Auth: drop Supabase auth FK', () => c.query(`
      ALTER TABLE users DROP CONSTRAINT IF EXISTS users_id_auth_users_id_fkey
    `));

    await step('Better Auth: email_verified column', () => c.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false
    `));

    await step('Better Auth: sessions table', () => c.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token TEXT UNIQUE NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `));

    await step('Better Auth: accounts table', () => c.query(`
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        account_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        access_token TEXT,
        refresh_token TEXT,
        id_token TEXT,
        access_token_expires_at TIMESTAMP,
        refresh_token_expires_at TIMESTAMP,
        scope TEXT,
        password TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `));
    await step('Better Auth: account lookup index', () => c.query(`
      CREATE INDEX IF NOT EXISTS idx_accounts_user_provider ON accounts(user_id, provider_id);
    `));
    await step('Better Auth: import legacy bcrypt credentials', () => c.query(`
      INSERT INTO accounts (
        id, user_id, account_id, provider_id, password, created_at, updated_at
      )
      SELECT
        gen_random_uuid()::TEXT, u.id, u.id::TEXT, 'credential', u.password_hash,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      FROM users u
      WHERE u.password_hash IS NOT NULL
        AND left(u.password_hash, 4) IN ('$2a$', '$2b$', '$2y$')
        AND NOT EXISTS (
          SELECT 1 FROM accounts a
          WHERE a.user_id = u.id
            AND a.provider_id = 'credential'
            AND a.account_id = u.id::TEXT
        );
    `));

    await step('Better Auth: verifications table', () => c.query(`
      CREATE TABLE IF NOT EXISTS verifications (
        id TEXT PRIMARY KEY,
        identifier TEXT NOT NULL,
        value TEXT NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `));
    await step('Better Auth: verifications updated_at column', () => c.query(`
      ALTER TABLE verifications
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    `));

    // ── Replication schema (dual-database failover) ──
    await step('Replication: mirror_outbox', () => c.query(`
      CREATE TABLE IF NOT EXISTS mirror_outbox (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        operation_id UUID UNIQUE NOT NULL,
        model TEXT NOT NULL,
        action TEXT NOT NULL,
        record_id TEXT NOT NULL,
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        source TEXT NOT NULL DEFAULT 'supabase',
        synced BOOLEAN NOT NULL DEFAULT FALSE,
        synced_at TIMESTAMPTZ,
        priority TEXT NOT NULL DEFAULT 'normal'
      )
    `));
    await step('Replication: mirror_outbox indexes', () => c.query(`
      CREATE INDEX IF NOT EXISTS idx_mirror_outbox_synced ON mirror_outbox(synced, created_at);
      CREATE INDEX IF NOT EXISTS idx_mirror_outbox_priority ON mirror_outbox(priority, synced);
    `));
    await step('Replication: mirror_operations', () => c.query(`
      CREATE TABLE IF NOT EXISTS mirror_operations (
        operation_id UUID PRIMARY KEY,
        source TEXT NOT NULL,
        processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `));
    await step('Replication: mirror_operations index', () => c.query(`
      CREATE INDEX IF NOT EXISTS idx_mirror_operations_source ON mirror_operations(source, processed_at);
    `));
    await step('Replication: sync_state', () => c.query(`
      CREATE TABLE IF NOT EXISTS sync_state (
        id SERIAL PRIMARY KEY,
        key TEXT UNIQUE NOT NULL,
        value TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `));
    await step('Replication: sync_state seed', () => c.query(`
      INSERT INTO sync_state (key, value) VALUES
        ('primary', 'supabase'),
        ('last_sync_supabase_to_neon', ''),
        ('last_sync_neon_to_supabase', ''),
        ('supabase_failures', '0'),
        ('neon_failures', '0')
      ON CONFLICT (key) DO NOTHING;
    `));

    // ── Better Auth plugins: schema additions ──
    await step('Auth plugin: username columns', () => c.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS display_username TEXT;
    `));
    await step('Auth plugin: phone number columns', () => c.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number TEXT UNIQUE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number_verified BOOLEAN DEFAULT FALSE;
    `));
    await step('Auth plugin: two-factor columns', () => c.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT FALSE;
    `));
    await step('Auth plugin: two-factor table', () => c.query(`
      CREATE TABLE IF NOT EXISTS two_factor (
        id TEXT PRIMARY KEY,
        secret TEXT NOT NULL,
        backup_codes TEXT NOT NULL,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        verified BOOLEAN NOT NULL DEFAULT FALSE,
        failed_verification_count INTEGER DEFAULT 0,
        locked_until TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `));
    await step('Auth plugin: two-factor updated_at column', () => c.query(`
      ALTER TABLE two_factor ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
    `));
    await step('Auth plugin: two-factor verification default', () => c.query(`
      ALTER TABLE two_factor ALTER COLUMN verified SET DEFAULT FALSE;
    `));
    await step('Auth plugin: two-factor index', () => c.query(`
      CREATE INDEX IF NOT EXISTS idx_two_factor_user_id ON two_factor(user_id);
      CREATE INDEX IF NOT EXISTS idx_two_factor_secret ON two_factor(secret);
    `));
    await step('Auth plugin: passkey table', () => c.query(`
      CREATE TABLE IF NOT EXISTS passkey (
        id TEXT PRIMARY KEY,
        name TEXT,
        public_key TEXT NOT NULL,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        credential_id TEXT NOT NULL UNIQUE,
        counter INTEGER NOT NULL DEFAULT 0,
        device_type TEXT NOT NULL,
        backed_up BOOLEAN NOT NULL DEFAULT FALSE,
        transports TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        aaguid TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_passkey_user_id ON passkey(user_id);
    `));
    await step('Better Auth: protect auth tables from Data API access', () => c.query(`
      ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
      ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
      ALTER TABLE verifications ENABLE ROW LEVEL SECURITY;
      ALTER TABLE two_factor ENABLE ROW LEVEL SECURITY;
      ALTER TABLE passkey ENABLE ROW LEVEL SECURITY;
    `));
    await step('Auth plugin: session loginMethod column', () => c.query(`
      ALTER TABLE sessions ADD COLUMN IF NOT EXISTS login_method TEXT;
    `));

    // 78. Lightning KYC verification columns
    await step('Lightning KYC verification columns', () => c.query(`
      ALTER TABLE verification_attempts ADD COLUMN IF NOT EXISTS liveness_score DECIMAL(5,4);
      ALTER TABLE verification_attempts ADD COLUMN IF NOT EXISTS face_match_detail JSONB;
      ALTER TABLE verification_attempts ADD COLUMN IF NOT EXISTS lightning_raw JSONB;
      ALTER TABLE verification_attempts ADD COLUMN IF NOT EXISTS failed_stage VARCHAR(20);
      ALTER TABLE verification_attempts ADD COLUMN IF NOT EXISTS ocr_fields JSONB;
      ALTER TABLE verification_attempts ADD COLUMN IF NOT EXISTS id_face_url TEXT;
    `));

    // 79. Notifications discovery columns and preferences
    await step('Notifications discovery columns and preferences', () => c.query(`
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS dismissed_from_feed BOOLEAN DEFAULT false;
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS action_required BOOLEAN DEFAULT false;
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS action_resolved BOOLEAN DEFAULT false;
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS action_deadline TIMESTAMPTZ;
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS group_key TEXT;

      CREATE INDEX IF NOT EXISTS idx_notifications_feed ON notifications(user_id, dismissed_from_feed, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_notifications_action ON notifications(user_id, action_required, action_resolved);
      CREATE INDEX IF NOT EXISTS idx_notifications_group_key ON notifications(user_id, group_key) WHERE group_key IS NOT NULL;

      ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{
        "categories": {
          "security_account": "push_now",
          "orders_payments": "push_now",
          "meetups": "push_now",
          "disputes": "push_now",
          "inventory_alerts": "push_now",
          "follows": "push_now",
          "offers": "push_now",
          "reviews": "daily_summary",
          "seller_updates": "daily_summary",
          "marketing_promos": "off"
        },
        "quiet_hours": {
          "enabled": false,
          "start": "22:00",
          "end": "08:00",
          "days": "all"
        },
        "snooze_until": null,
        "daily_summary_time": "09:00",
        "hide_sensitive_previews": true,
        "muted_seller_ids": []
      }'::jsonb;
    `));

    // 80. Profile & Settings discovery columns and tables
    await step('Profile & Settings discovery columns and tables', () => c.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS store_description TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS store_service_area TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS store_category TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS show_public_city BOOLEAN DEFAULT false;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS hide_follower_lists BOOLEAN DEFAULT false;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS hide_follower_counts BOOLEAN DEFAULT false;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS language VARCHAR(10) DEFAULT 'en';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS pinned_product_id UUID;

      ALTER TABLE products ADD COLUMN IF NOT EXISTS paused_reason VARCHAR(30);
      ALTER TABLE products ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false;

      ALTER TABLE orders ADD COLUMN IF NOT EXISTS seller_snapshot_name TEXT;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS seller_snapshot_logo_url TEXT;

      ALTER TABLE reviews ADD COLUMN IF NOT EXISTS is_moderated BOOLEAN DEFAULT false;
      ALTER TABLE reviews ADD COLUMN IF NOT EXISTS moderation_reason TEXT;
      ALTER TABLE reviews ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ;
      -- Author deletion keeps the one-review-per-order audit row but hides it.
      ALTER TABLE reviews ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
      -- One gentle review reminder per completed order (see the jobs cron).
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS review_reminder_sent_at TIMESTAMPTZ;

      CREATE TABLE IF NOT EXISTS user_reports (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reported_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        target_type VARCHAR(30) NOT NULL,
        target_id TEXT NOT NULL,
        reason VARCHAR(50) NOT NULL,
        details TEXT,
        order_context JSONB,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_user_reports_target ON user_reports(target_type, target_id);
      CREATE INDEX IF NOT EXISTS idx_user_reports_reporter ON user_reports(reporter_id);
      -- APP-Q544: rights holders get a dedicated identification path on a report;
      -- a report alone is still not proof.
      ALTER TABLE user_reports ADD COLUMN IF NOT EXISTS rights_holder BOOLEAN DEFAULT false;
    `));

    // 81. Add Product experience: condition/disclosure, lifecycle states, drafts,
    // variants, order snapshots, saved prices, fulfillment flags, low-stock.
    await step('Add Product: listing columns, variants, drafts, snapshots', () => c.query(`
      ALTER TABLE products ADD COLUMN IF NOT EXISTS condition VARCHAR(20);
      ALTER TABLE products ADD COLUMN IF NOT EXISTS flaw_notes TEXT;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS sku TEXT;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS offers_enabled BOOLEAN DEFAULT true;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS language_label VARCHAR(10);
      ALTER TABLE products ADD COLUMN IF NOT EXISTS listing_status VARCHAR(20) DEFAULT 'active';
      ALTER TABLE products ADD COLUMN IF NOT EXISTS moderation_reason TEXT;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS appeal_note TEXT;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS appealed_at TIMESTAMPTZ;
      -- Content-rights / authenticity review (APP-Q545–Q547). moderation_category is
      -- a stable code; moderation_detail describes the affected content for the seller.
      ALTER TABLE products ADD COLUMN IF NOT EXISTS moderation_category VARCHAR(30);
      ALTER TABLE products ADD COLUMN IF NOT EXISTS moderation_detail TEXT;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS content_updated_during_review BOOLEAN DEFAULT false;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS has_variants BOOLEAN DEFAULT false;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS attrs JSONB;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS meetup_enabled BOOLEAN;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS delivery_enabled BOOLEAN;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER DEFAULT 3;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS low_stock_notified_at TIMESTAMPTZ;

      -- Backfill: paused rows before this feature only flipped is_available.
      -- listing_status is the moderation lifecycle (active/pending_review/rejected);
      -- commercial pause stays is_available = false + paused_reason.
      UPDATE products SET paused_reason = 'seller_manual'
       WHERE is_available = false AND paused_reason IS NULL;

      CREATE TABLE IF NOT EXISTS product_variants (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        options JSONB NOT NULL DEFAULT '{}'::jsonb,
        option_label TEXT NOT NULL DEFAULT '',
        price DECIMAL(10,2) NOT NULL,
        stock INTEGER NOT NULL DEFAULT 0,
        sku TEXT,
        display_order INTEGER NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants(product_id);

      CREATE TABLE IF NOT EXISTS product_drafts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        data JSONB NOT NULL DEFAULT '{}'::jsonb,
        source_product_id UUID REFERENCES products(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_product_drafts_seller ON product_drafts(seller_id, updated_at DESC);

      ALTER TABLE wishlists ADD COLUMN IF NOT EXISTS saved_price DECIMAL(10,2);

      ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL;
      ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_label TEXT;
      ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_name TEXT;
      ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_image TEXT;

      ALTER TABLE stock_reservations ADD COLUMN IF NOT EXISTS variant_id UUID;

      -- Multi-variant carts need one reservation row per (product, variant):
      -- rebuild the safety unique indexes to include the variant (NULL for simple).
      DROP INDEX IF EXISTS idx_stock_reservations_checkout_product;
      DROP INDEX IF EXISTS idx_stock_reservations_order_product;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_reservations_checkout_product
        ON stock_reservations(product_id, checkout_id,
          COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid))
        WHERE checkout_id IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_reservations_order_product
        ON stock_reservations(product_id, order_id,
          COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid))
        WHERE order_id IS NOT NULL;

      CREATE INDEX IF NOT EXISTS idx_products_seller_status ON products(seller_id, listing_status, is_available);
      CREATE INDEX IF NOT EXISTS idx_products_condition ON products(condition) WHERE condition IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_order_items_variant ON order_items(variant_id) WHERE variant_id IS NOT NULL;
    `));

    // 82. Seed default categories (idempotent, skips names that already exist)
    await step('Seed default categories', () => c.query(`
      INSERT INTO categories (id, name, display_order)
      SELECT v.id, v.name, v.display_order
      FROM (VALUES
        ('a0000000-0000-0000-0000-000000000001'::uuid, 'Electronics', 1),
        ('a0000000-0000-0000-0000-000000000002'::uuid, 'Clothing', 2),
        ('a0000000-0000-0000-0000-000000000003'::uuid, 'Home & Garden', 3),
        ('a0000000-0000-0000-0000-000000000004'::uuid, 'Sports', 4),
        ('a0000000-0000-0000-0000-000000000005'::uuid, 'Beauty', 5),
        ('a0000000-0000-0000-0000-000000000006'::uuid, 'Vehicles', 6),
        ('a0000000-0000-0000-0000-000000000007'::uuid, 'Books', 7),
        ('a0000000-0000-0000-0000-000000000008'::uuid, 'Food & Drinks', 8),
        ('a0000000-0000-0000-0000-000000000009'::uuid, 'Other', 9)
      ) AS v(id, name, display_order)
      WHERE NOT EXISTS (SELECT 1 FROM categories c WHERE lower(c.name) = lower(v.name))
      ON CONFLICT (id) DO NOTHING;
    `));

    // 83. Policy transparency & consent (Batch 72, APP-Q356–APP-Q365)
    await step('Policy versions, acceptances, and notices', () => c.query(`
      CREATE TABLE IF NOT EXISTS policy_versions (
        id SERIAL PRIMARY KEY,
        kind VARCHAR(16) NOT NULL,
        version VARCHAR(32) NOT NULL,
        is_material BOOLEAN NOT NULL DEFAULT false,
        effective_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        summaries JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (kind, version)
      );
      CREATE INDEX IF NOT EXISTS idx_policy_versions_kind_effective ON policy_versions (kind, effective_at DESC);
      CREATE TABLE IF NOT EXISTS user_policy_acceptances (
        id SERIAL PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind VARCHAR(16) NOT NULL,
        version VARCHAR(32) NOT NULL,
        accepted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (user_id, kind, version)
      );
      CREATE INDEX IF NOT EXISTS idx_user_policy_acceptances_user ON user_policy_acceptances (user_id, accepted_at DESC);
      CREATE TABLE IF NOT EXISTS user_policy_notices (
        id SERIAL PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        policy_version_id INTEGER NOT NULL REFERENCES policy_versions(id) ON DELETE CASCADE,
        dismissed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (user_id, policy_version_id)
      );
    `));

    // 84. Seed baseline policy documents (one row per kind; skips kinds that already exist)
    await step('Seed baseline policy versions', async () => {
      for (const doc of BASELINE_POLICY_VERSIONS) {
        if (!POLICY_KINDS.includes(doc.kind)) continue;
        // Explicit casts keep all uses of $1 as the same type. Without them
        // Postgres deduces $1 as text from the SELECT list and varchar from the
        // `kind = $1` comparison, which fails with
        // "inconsistent types deduced for parameter $1".
        await c.query(
          `INSERT INTO policy_versions (kind, version, is_material, summaries)
           SELECT $1::varchar(16), $2::varchar(32), $3::boolean, $4::jsonb
           WHERE NOT EXISTS (SELECT 1 FROM policy_versions WHERE kind = $1::varchar(16))`,
          [doc.kind, doc.version, Boolean(doc.isMaterial), JSON.stringify(doc.summaries || {})]
        );
      }
    });

    // 85. Discoverability (Batch 77, APP-Q431): keep a person out of in-app
    // search/suggestions while leaving direct links, listings, orders, and
    // messages working. Defaults to true so existing accounts stay findable.
    await step('search_discoverable column', () => c.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS search_discoverable BOOLEAN NOT NULL DEFAULT true;
    `));
    await step('search_discoverable lookup index', () => c.query(`
      CREATE INDEX IF NOT EXISTS idx_users_search_discoverable ON users (search_discoverable) WHERE search_discoverable = false;
    `));

    // 86. Private security activity history (Batch 73, APP-Q369): new sign-ins
    // and other security events are recorded per account so the owner can
    // review them in-app. Only structured type codes + non-secret metadata are
    // stored; all user-facing wording is rendered from the app's locale.
    await step('Security activity events', () => c.query(`
      CREATE TABLE IF NOT EXISTS security_events (
        id SERIAL PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        event_type VARCHAR(48) NOT NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_security_events_user_created ON security_events (user_id, created_at DESC);
    `));

    // 87. Fast account freeze for suspected compromise (Batch 73/74/75,
    // APP-Q371). Deliberately minimal: the account keeps sign-in, messages,
    // orders, support, recovery, and export. Only new listings and payout
    // requests are paused while the freeze is active.
    await step('Account freeze columns', () => c.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS frozen_at TIMESTAMPTZ;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS freeze_reason TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS frozen_by VARCHAR(32);
    `));
    await step('Account freeze lookup index', () => c.query(`
      CREATE INDEX IF NOT EXISTS idx_users_frozen_at ON users (frozen_at) WHERE frozen_at IS NOT NULL;
    `));

    // 88. Data export lifecycle (Batch 74/75, APP-Q379–APP-Q391). Exports are
    // prepared as jobs rather than streamed straight out of a GET, so the user
    // can see status, cancel while generating, and retry safely. A job's
    // payload is only ever written by the atomic pending→ready transition, so a
    // cancelled or failed generation can never leave a partial archive behind.
    await step('Data export jobs', () => c.query(`
      CREATE TABLE IF NOT EXISTS export_jobs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(16) NOT NULL DEFAULT 'pending',
        payload JSONB,
        error VARCHAR(64),
        requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMPTZ,
        expires_at TIMESTAMPTZ,
        cancelled_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_export_jobs_user_requested ON export_jobs (user_id, requested_at DESC);
      CREATE INDEX IF NOT EXISTS idx_export_jobs_pending ON export_jobs (status) WHERE status = 'pending';
    `));

    // 89. Private device labels (Batch 75, APP-Q395). The user's own friendly
    // name for a signed-in device. It is keyed to the session, so revoking a
    // session removes its label automatically, and it lives in its own table
    // rather than on `sessions` so a cosmetic user string can never be mistaken
    // for a system security fact. Nothing reads a label for an authentication or
    // trust decision — it is display-only, private to its owner.
    await step('Private device labels', () => c.query(`
      CREATE TABLE IF NOT EXISTS device_labels (
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        label VARCHAR(40) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, session_id)
      );
      CREATE INDEX IF NOT EXISTS idx_device_labels_session ON device_labels (session_id);
    `));

    // 90. KYC evidence access log (Batch 75). Identity documents are the most
    // sensitive thing a seller hands over, so every staff read of them is
    // recorded and the subject can see a case-linked history of those reads.
    // `attempt_id` ties an entry to the verification case it belongs to;
    // `actor_user_id` is nullable so a future Support service acting on its own
    // credentials is still attributable, while `actor_label` is the only thing
    // ever shown to the subject (never a staff identity).
    //
    // The CHECK constraints are the database-side half of the same rule the
    // writer enforces in src/utils/kycEvidenceAccess.js: a purpose must be one of
    // the recognised review reasons and a scope must be one of the four evidence
    // widths. Without them a future staff tool writing raw SQL could store an
    // "other" access, which is indistinguishable from no log at all.
    // Keep both lists in sync with KYC_ACCESS_PURPOSES / KYC_EVIDENCE_SCOPES.
    await step('KYC evidence access log', () => c.query(`
      CREATE TABLE IF NOT EXISTS kyc_evidence_access (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        subject_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        attempt_id UUID REFERENCES verification_attempts(id) ON DELETE SET NULL,
        actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        actor_label VARCHAR(60) NOT NULL DEFAULT 'MaurMaket Support',
        purpose VARCHAR(40) NOT NULL
          CHECK (purpose IN ('case_review', 'dispute_review', 'fraud_review', 'compliance_audit', 'rights_claim')),
        scope VARCHAR(20) NOT NULL DEFAULT 'attempt'
          CHECK (scope IN ('attempt', 'document', 'selfie', 'metadata')),
        case_reference VARCHAR(60),
        accessed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_kyc_evidence_access_subject
        ON kyc_evidence_access (subject_user_id, accessed_at DESC);
    `));

    if (failed.length > 0) {
      console.log(`[MIGRATION] Complete with ${failed.length} failure(s): ${failed.join(', ')}`);
    } else {
      console.log(`[MIGRATION] Complete — all ${stepNum} steps passed`);
    }
    return failed;
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
  'http://localhost:4000',
  'http://localhost:8081',
  'http://localhost:19006',
];
app.use(cors({
  origin: (origin, callback) => {
    // No origin (native app / curl) — allow
    if (!origin) return callback(null, true);
    // Known browser origins — allow
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    // LAN dev (native app sends its own IP as Origin) — allow
    if (/^http:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.|localhost|127\.0\.0\.1)/.test(origin)) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  exposedHeaders: ['set-auth-token'],
}));
app.use(morgan('combined'));

// Body parser (needed before studio, auth handles its own body)
app.use(express.json({
  limit: '1mb',
  verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8'); },
}));

// ───── Better Auth (lazy: initialized after DB Controller) ─────
// Handler is mounted now but getAuth() is called per-request.
// createAuth(adapter) must run before the first request arrives.
//
// APP-Q380: credential-guessing surfaces are throttled BEFORE the catch-all
// auth handler below. Middleware registered after `app.all('/api/auth/*', …)`
// never runs, because that handler ends the response — which is why the old
// `app.use('/api/auth', authLimiter)` was inert. Only password and 2FA-code
// checks are limited; session reads, OAuth, and passkey are deliberately not.
app.use(
  ['/api/auth/sign-in/email', '/api/auth/two-factor/verify-totp', '/api/auth/two-factor/verify-backup-code'],
  signinLimiter
);
app.all('/api/auth/*', (req, res) => {
  try {
    const handler = toNodeHandler(getAuth());
    handler(req, res);
  } catch (e) {
    console.error('[Auth] Not initialized yet:', e.message);
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Auth system initializing' }));
  }
});

// ───── Better Auth Studio (mounted after DB Controller init) ─────

app.use('/api/payments', paymentLimiter);
app.use('/api/upload', uploadLimiter);

// Upload config — no secrets exposed
app.get('/api/upload/config', (req, res) => {
  const primary = supabaseStorage ? 'supabase' : r2Storage ? 'r2' : process.env.IMGBB_KEY ? 'imgbb' : null;
  const fallback = [supabaseStorage && r2Storage ? 'r2' : null, process.env.IMGBB_KEY ? 'imgbb' : null].filter(Boolean).join(', ') || null;
  res.json({ primary, fallback, hasR2: !!r2Storage, hasSupabaseStorage: !!supabaseStorage, hasImgbb: !!process.env.IMGBB_KEY });
});

// Upload image — Supabase Storage primary, R2 then imgBB fallback
app.post('/api/upload', authRequired, express.json({ limit: '10mb' }), async (req, res) => {
  try {
    const { image, expiration, purpose } = req.body;
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
    const temporaryKyc = purpose === 'kyc' && Number(expiration) > 0;
    const key = `${req.user.id}/${temporaryKyc ? 'kyc/' : ''}${crypto.randomUUID()}.webp`;
    const storageTargets = temporaryKyc
      ? [supabaseStorage && { provider: 'supabase', label: 'Supabase KYC', storage: supabaseStorage, bucket: SUPABASE_KYC_BUCKET, publicBase: null }].filter(Boolean)
      : [
        supabaseStorage && { provider: 'supabase', label: 'Supabase', storage: supabaseStorage, bucket: SUPABASE_STORAGE_BUCKET, publicBase: SUPABASE_PUBLIC_BASE },
        r2Storage && { provider: 'r2', label: 'R2', storage: r2Storage, bucket: R2_BUCKET, publicBase: R2_PUBLIC_BASE },
      ].filter(Boolean);

    for (const target of storageTargets) {
      let uploaded = false;
      try {
        await target.storage.send(new PutObjectCommand({
          Bucket: target.bucket,
          Key: key,
          Body: webpBuffer,
          ContentType: 'image/webp',
          CacheControl: temporaryKyc ? 'private, no-store, max-age=0' : 'public, max-age=31536000, immutable',
        }));
        uploaded = true;
        const url = temporaryKyc ? `kyc-storage://${target.provider}/${key}` : `${target.publicBase}/${key}`;
        let thumbnailUrl = null;
        if (!temporaryKyc) {
          try {
            const thumbKey = key.replace(/\.webp$/, '_thumb.webp');
            const thumbBuffer = await sharp(buffer).resize({ width: 400, withoutEnlargement: true }).webp({ quality: 75, effort: 6 }).toBuffer();
            await target.storage.send(new PutObjectCommand({
              Bucket: target.bucket, Key: thumbKey, Body: thumbBuffer, ContentType: 'image/webp',
              CacheControl: 'public, max-age=31536000, immutable',
            }));
            thumbnailUrl = `${target.publicBase}/${thumbKey}`;
          } catch (thumbErr) {
            console.warn(`[UPLOAD] ${target.label} thumbnail generation failed:`, thumbErr.message);
          }
        } else {
          await registerTemporaryStorageUpload({ userId: req.user.id, provider: target.provider, bucketName: target.bucket, objectKey: key, expirationSeconds: Number(expiration) });
        }
        return res.json({ url, thumbnailUrl, width: imgWidth, height: imgHeight, deleteUrl: `${target.provider}:${key}`, provider: target.provider });
      } catch (storageErr) {
        if (uploaded) {
          try { await target.storage.send(new DeleteObjectCommand({ Bucket: target.bucket, Key: key })); } catch {}
        }
        console.warn(`[UPLOAD] ${target.label} failed${temporaryKyc ? ' for temporary KYC image' : ''}; trying next provider:`, storageErr.message);
      }
    }

    if (temporaryKyc) {
      return res.status(503).json({ error: 'Secure KYC storage is unavailable. Please try again shortly.' });
    }

    // Last resort: imgBB supports provider-side expiration for temporary KYC images.
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

// Voice note upload — raw audio bytes to Supabase/R2 (no image processing)
app.post('/api/upload-audio', authRequired, express.json({ limit: '3mb' }), async (req, res) => {
  try {
    const { audio } = req.body;
    if (!audio || typeof audio !== 'string') return res.status(400).json({ error: 'No audio data' });
    const match = /^data:(audio\/[\w.+-]+);base64,/.exec(audio);
    if (!match) return res.status(400).json({ error: 'Invalid audio data' });
    const mime = match[1];
    const allowedMimes = ['audio/mp4', 'audio/m4a', 'audio/aac', 'audio/webm', 'audio/3gpp', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/mpeg'];
    if (!allowedMimes.includes(mime)) return res.status(400).json({ error: 'Unsupported audio format' });
    const buffer = Buffer.from(audio.slice(audio.indexOf(',') + 1), 'base64');
    if (buffer.length === 0) return res.status(400).json({ error: 'Empty audio data' });
    if (buffer.length > 2 * 1024 * 1024) return res.status(413).json({ error: 'Voice note too large (max 2MB)' });
    const extByMime = { 'audio/mp4': 'm4a', 'audio/m4a': 'm4a', 'audio/aac': 'aac', 'audio/webm': 'webm', 'audio/3gpp': '3gp', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/mpeg': 'mp3' };
    const key = `${req.user.id}/${crypto.randomUUID()}.${extByMime[mime]}`;
    const storageTargets = [
      supabaseStorage && { provider: 'supabase', label: 'Supabase', storage: supabaseStorage, bucket: SUPABASE_STORAGE_BUCKET, publicBase: SUPABASE_PUBLIC_BASE },
      r2Storage && { provider: 'r2', label: 'R2', storage: r2Storage, bucket: R2_BUCKET, publicBase: R2_PUBLIC_BASE },
    ].filter(Boolean);

    for (const target of storageTargets) {
      try {
        await target.storage.send(new PutObjectCommand({
          Bucket: target.bucket,
          Key: key,
          Body: buffer,
          ContentType: mime,
          CacheControl: 'public, max-age=31536000, immutable',
        }));
        return res.json({ url: `${target.publicBase}/${key}`, provider: target.provider });
      } catch (storageErr) {
        console.warn(`[UPLOAD-AUDIO] ${target.label} failed; trying next provider:`, storageErr.message);
      }
    }
    return res.status(503).json({ error: 'No upload provider available' });
  } catch (err) {
    console.error('[UPLOAD-AUDIO] Error:', err.message);
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
      const provider = target.startsWith('supabase:') ? 'supabase' : 'r2';
      const storage = provider === 'supabase' ? supabaseStorage : r2Storage;
      const key = target.replace(/^(supabase|r2):/, '');
      const bucket = provider === 'supabase' ? (key.includes('/kyc/') ? SUPABASE_KYC_BUCKET : SUPABASE_STORAGE_BUCKET) : R2_BUCKET;
      if (!storage) return res.status(503).json({ error: 'No storage configured' });
      if (!key.startsWith(`${req.user.id}/`)) return res.status(403).json({ error: 'You can only delete your own uploads' });
      await storage.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      return res.json({ deleted: true, provider });
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

// MonCashConnect returns through HTTPS, then hands the user back to the app.
// Only known identifiers are forwarded; no caller-supplied URL is redirected.
app.get('/payment/return', async (req, res) => {
  let key = ['order', 'pending', 'debtPaymentId'].find((candidate) => typeof req.query[candidate] === 'string');
  let value = key ? req.query[key] : null;
  if (!key && typeof req.query.session === 'string') {
    try {
      const session = await pool.query('SELECT checkout_id FROM fulfillment_payment_sessions WHERE id = $1', [req.query.session]);
      if (session.rows[0]?.checkout_id) {
        key = 'pending';
        value = session.rows[0].checkout_id;
      }
    } catch (error) {
      console.error('[PAYMENT RETURN] Could not resolve session:', error.message);
    }
  }
  if (!key) return res.status(400).send('Payment return reference is missing. You can return to MaurMaket.');
  const param = key === 'order' ? 'orderId' : key === 'pending' ? 'pendingId' : key;
  const deepLink = `maurmaket://payment-return?${param}=${encodeURIComponent(value)}`;
  res.setHeader('Cache-Control', 'no-store');
  res.type('html').send(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=${deepLink}"><title>Return to MaurMaket</title></head><body style="font:16px system-ui;background:#0d1117;color:#f0f3f6;padding:32px"><p>Returning to MaurMaket…</p><a style="color:#ff4d6a" href="${deepLink}">Tap here if the app does not open</a></body></html>`);
});

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
  'feed_events', 'seller_locations', 'message_offers', 'user_category_affinities', 'product_cooccurrences'
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
  closeRealtime();
  if (server) server.close();
  try { await pool.end(); } catch {}
  process.exit(0);
});
process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  closeRealtime();
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
      initRealtime(server);
    });
  };
  // Better Auth needs its tables before it can serve requests. Keep startup gated
  // on the primary migration run so requests cannot race table creation.
  const primaryMigrations = runMigrations().catch(err => {
    console.error('[MIGRATION] Primary database migration failed:', err.message);
    throw err;
  });

  // ───── DB Controller: dual-database failover + replication ─────
  (async () => {
    try {
      const migrationFailures = await primaryMigrations;
      const failedAuthMigrations = migrationFailures.filter(name => REQUIRED_AUTH_MIGRATIONS.includes(name));
      if (failedAuthMigrations.length > 0) {
        throw new Error(`Required Better Auth schema migrations failed: ${failedAuthMigrations.join(', ')}`);
      }

      const { getDbController, Replicator, Reconciler, createRaidAdapter } = await import('./src/db/index.js');
      const dbController = getDbController();

      // Don't spend startup attempts on an offline backup. When Neon first
      // passes its health probe, prepare its schema before marking it usable.
      if (dbController.secondaryPool) {
        dbController.prepareSecondary = async (secondaryPool) => {
          console.log(`[MIGRATION] Preparing ${dbController.secondaryName} after recovery...`);
          const failures = await runMigrations(secondaryPool);
          if (failures.length > 0) {
            throw new Error(`${dbController.secondaryName} schema migration failed: ${failures.join(', ')}`);
          }
        };
      }

      // Wire the failover proxy — all pool.query(SELECT) routes through controller
      setDbController(dbController);

      const replicator = new Replicator(dbController);
      const reconciler = new Reconciler(dbController);

      // Wire Better Auth through RAID adapter → DB Controller
      const raidAdapter = createRaidAdapter(dbController);
      createAuth(raidAdapter);
      console.log('[DB:Controller] ✅ Better Auth wired through RAID adapter');

      // Mount Better Auth Studio after auth is initialized
      if (betterAuthStudio) {
        app.use('/api/studio', betterAuthStudio({
          auth: getAuth(),
          basePath: '/api/studio',
          metadata: { title: 'MaurMaket Admin', theme: 'dark' },
          access: {
            roles: ['admin'],
            allowEmails: ['lexikonstrsut@gmail.com', 'maurinexus.contact@gmail.com'],
          },
        }));
        console.log('[Auth] Studio dashboard at /api/studio');
      }

      dbController.startHealthChecks();
      replicator.start();

      // Watch for RECOVERING state → trigger reconciliation
      const origHealthCheck = dbController.healthCheck.bind(dbController);
      dbController.healthCheck = async function() {
        const result = await origHealthCheck();
        // Neon recovered → clear quota backoff
        if (this.neonBreaker?.isHealthy) reconciler.resetQuotaBackoff();
        if (this.mode === 'RECOVERING') {
          reconciler.reconcile().catch(err => {
            console.error('[Reconciler] Error:', err.message);
          });
        }
        return result;
      };

      // Expose for health endpoint + routes
      app.locals.dbController = dbController;
      app.locals.replicator = replicator;

      console.log('[DB:Controller] ✅ Dual-database failover + replication active');
      startServer();
    } catch (err) {
      console.error('[STARTUP] Database/auth initialization failed; server not started:', err.message);
    }
  })();

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
