import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

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

export { supabaseStorage, SUPABASE_STORAGE_BUCKET, SUPABASE_PUBLIC_BASE, r2Storage, R2_BUCKET, R2_PUBLIC_BASE, PutObjectCommand, DeleteObjectCommand };
