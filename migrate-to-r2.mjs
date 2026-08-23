/**
 * Migrate product images from Supabase Storage to Cloudflare R2.
 * Run once: node migrate-to-r2.cjs
 * 
 * What it does:
 * 1. Downloads each image from Supabase Storage (S3 API)
 * 2. Uploads to Cloudflare R2 (S3 API)
 * 3. Updates image_url and thumbnail_url in the database
 * 4. Reports progress and failures
 */
import { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL });

// Supabase Storage (source)
const supabaseS3 = new S3Client({
  region: 'ca-central-1',
  endpoint: process.env.SUPABASE_S3_ENDPOINT || 'https://bnnluaqrktnrnnfvmqbt.storage.supabase.co/storage/v1/s3',
  credentials: {
    accessKeyId: process.env.SUPABASE_S3_ACCESS_KEY,
    secretAccessKey: process.env.SUPABASE_S3_SECRET_KEY,
  },
  forcePathStyle: true,
});
const SUPABASE_BUCKET = 'product-images';
const SUPABASE_PUBLIC_BASE = process.env.SUPABASE_PUBLIC_BASE || 'https://bnnluaqrktnrnnfvmqbt.supabase.co/storage/v1/object/public/product-images';

// Cloudflare R2 (destination)
const r2S3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT || 'https://cd681939aa37a65e42e73054b572746b.r2.cloudflarestorage.com',
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'maurmaket-images';
const R2_PUBLIC_BASE = process.env.R2_PUBLIC_BASE || `https://pub-${process.env.R2_ACCOUNT_ID}.r2.dev`;

// Content type mapping
const CONTENT_TYPES = {
  'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
  'webp': 'image/webp', 'gif': 'image/gif', 'svg': 'image/svg+xml',
};

function getContentType(key) {
  const ext = key.split('.').pop()?.toLowerCase() || 'jpg';
  return CONTENT_TYPES[ext] || 'image/jpeg';
}

async function migrateImage(key, isThumbnail = false) {
  // Extract the DB-relative key (user_id/uuid.ext)
  const dbKey = key.replace(SUPABASE_PUBLIC_BASE + '/', '');
  
  // Check if already on R2
  try {
    await r2S3.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: dbKey }));
    const newUrl = `${R2_PUBLIC_BASE}/${dbKey}`;
    return { status: 'exists', url: newUrl };
  } catch {
    // Not on R2 yet, continue
  }

  // Download from Supabase
  const getCmd = new GetObjectCommand({ Bucket: SUPABASE_BUCKET, Key: dbKey });
  const response = await supabaseS3.send(getCmd);
  
  // Stream to buffer
  const chunks = [];
  for await (const chunk of response.Body) chunks.push(chunk);
  const buffer = Buffer.concat(chunks);

  // Upload to R2
  await r2S3.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: dbKey,
    Body: buffer,
    ContentType: getContentType(dbKey),
  }));

  const newUrl = `${R2_PUBLIC_BASE}/${dbKey}`;
  return { status: 'migrated', url: newUrl, size: buffer.length };
}

async function run() {
  console.log('🚀 Migrating product images from Supabase Storage to Cloudflare R2\n');
  console.log(`Source: Supabase (${SUPABASE_BUCKET})`);
  console.log(`Dest:   R2 (${R2_BUCKET})\n`);

  // Get all product images
  const { rows } = await pool.query(
    `SELECT id, image_url, thumbnail_url FROM product_images 
     WHERE image_url LIKE '%supabase.co%'
     ORDER BY id ASC`
  );

  console.log(`Found ${rows.length} images to migrate\n`);

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      // Migrate main image
      if (row.image_url?.includes('supabase.co')) {
        const result = await migrateImage(row.image_url);
        const newImageUrl = result.url;

        // Migrate thumbnail if it exists
        let newThumbUrl = row.thumbnail_url;
        if (row.thumbnail_url?.includes('supabase.co')) {
          const thumbResult = await migrateImage(row.thumbnail_url, true);
          newThumbUrl = thumbResult.url;
        }

        // Update DB
        await pool.query(
          'UPDATE product_images SET image_url = $1, thumbnail_url = $2 WHERE id = $3',
          [newImageUrl, newThumbUrl, row.id]
        );

        if (result.status === 'exists') {
          skipped++;
          console.log(`⏭  ${row.id.slice(0, 8)} — already on R2`);
        } else {
          migrated++;
          console.log(`✅ ${row.id.slice(0, 8)} — migrated (${(result.size / 1024).toFixed(1)}KB)`);
        }
      }
    } catch (err) {
      failed++;
      console.error(`❌ ${row.id.slice(0, 8)} — ${err.message}`);
    }
  }

  console.log(`\n📊 Migration complete:`);
  console.log(`   ✅ Migrated: ${migrated}`);
  console.log(`   ⏭  Skipped (already on R2): ${skipped}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📦 Total: ${rows.length}`);

  await pool.end();
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
