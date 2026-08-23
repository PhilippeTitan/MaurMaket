/**
 * Backfill thumbnails for existing product images.
 * Run once: node backfill-thumbnails.cjs
 * Generates 400px webp thumbnails for all product_images without a thumbnail_url.
 */
import sharp from 'sharp';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL });

const s3 = new S3Client({
  region: 'us-east-1',
  endpoint: process.env.SUPABASE_S3_ENDPOINT || 'https://bnnluaqrktnrnnfvmqbt.storage.supabase.co/storage/v1/s3',
  credentials: {
    accessKeyId: process.env.SUPABASE_S3_ACCESS_KEY,
    secretAccessKey: process.env.SUPABASE_S3_SECRET_KEY,
  },
});

const BUCKET = 'product-images';
const PUBLIC_BASE = process.env.SUPABASE_PUBLIC_BASE || 'https://bnnluaqrktnrnnfvmqbt.supabase.co/storage/v1/object/public/product-images';

async function backfill() {
  const { rows } = await pool.query(
    `SELECT id, image_url, thumbnail_url FROM product_images WHERE thumbnail_url IS NULL LIMIT 50`
  );

  if (rows.length === 0) {
    console.log('No images to backfill!');
    await pool.end();
    return;
  }

  console.log(`Found ${rows.length} images to backfill...`);

  for (const row of rows) {
    try {
      // Extract the S3 key from the public URL
      const key = row.image_url.replace(PUBLIC_BASE + '/', '');
      const thumbKey = key.replace(/\.(\w+)$/, '_thumb.$1');

      // Download the original image
      const getCmd = new GetObjectCommand({ Bucket: BUCKET, Key: key });
      const response = await s3.send(getCmd);
      const chunks = [];
      for await (const chunk of response.Body) chunks.push(chunk);
      const buffer = Buffer.concat(chunks);

      // Generate thumbnail
      const thumbBuffer = await sharp(buffer)
        .resize({ width: 400, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();

      // Upload thumbnail
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: thumbKey,
        Body: thumbBuffer,
        ContentType: 'image/webp',
      }));

      const thumbUrl = `${PUBLIC_BASE}/${thumbKey}`;
      await pool.query('UPDATE product_images SET thumbnail_url = $1 WHERE id = $2', [thumbUrl, row.id]);

      console.log(`✅ ${key} → thumbnail generated`);
    } catch (err) {
      console.error(`❌ ${row.image_url}: ${err.message}`);
    }
  }

  // Check if more remain
  const { rows: remaining } = await pool.query(
    `SELECT COUNT(*) as count FROM product_images WHERE thumbnail_url IS NULL`
  );
  console.log(`\nDone. ${remaining[0].count} images still need backfilling.`);

  await pool.end();
}

backfill().catch(console.error);
