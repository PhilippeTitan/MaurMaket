import { pool } from '../config/database.js';
import {
  supabaseStorage,
  SUPABASE_STORAGE_BUCKET,
  SUPABASE_KYC_BUCKET,
  r2Storage,
  R2_BUCKET,
  DeleteObjectCommand,
  GetObjectCommand,
} from '../config/storage.js';

const storageFor = (provider) => provider === 'supabase' ? supabaseStorage : provider === 'r2' ? r2Storage : null;

async function clearExpiredImageReferences(userId, objectKey) {
  await pool.query(
    `UPDATE verification_attempts SET
       id_front_url = CASE WHEN POSITION($2 IN COALESCE(id_front_url, '')) > 0 THEN NULL ELSE id_front_url END,
       id_face_url = CASE WHEN POSITION($2 IN COALESCE(id_face_url, '')) > 0 THEN NULL ELSE id_face_url END,
       id_back_url = CASE WHEN POSITION($2 IN COALESCE(id_back_url, '')) > 0 THEN NULL ELSE id_back_url END,
       selfie_url = CASE WHEN POSITION($2 IN COALESCE(selfie_url, '')) > 0 THEN NULL ELSE selfie_url END
     WHERE user_id = $1 AND (
       POSITION($2 IN COALESCE(id_front_url, '')) > 0 OR POSITION($2 IN COALESCE(id_face_url, '')) > 0 OR
       POSITION($2 IN COALESCE(id_back_url, '')) > 0 OR POSITION($2 IN COALESCE(selfie_url, '')) > 0
     )`,
    [userId, objectKey]
  );
}

export async function registerTemporaryStorageUpload({ userId, provider, bucketName, objectKey, expirationSeconds }) {
  if (!['supabase', 'r2'].includes(provider) || !Number.isFinite(expirationSeconds) || expirationSeconds <= 0) return;
  await pool.query(
    `INSERT INTO temporary_storage_uploads (user_id, provider, bucket_name, object_key, expires_at)
     VALUES ($1, $2, $3, $4, NOW() + ($5 * INTERVAL '1 second'))
     ON CONFLICT (provider, bucket_name, object_key)
     DO UPDATE SET user_id = EXCLUDED.user_id, expires_at = EXCLUDED.expires_at`,
    [userId, provider, bucketName, objectKey, Math.floor(expirationSeconds)]
  );
}

export async function deleteTemporaryStorageUpload(userId, deleteRef) {
  const match = /^(supabase|r2):(.+)$/.exec(deleteRef || '');
  if (!match) return false;
  const [, provider, objectKey] = match;
  const queued = await pool.query(
    `SELECT id, bucket_name FROM temporary_storage_uploads
     WHERE user_id = $1 AND provider = $2 AND object_key = $3 LIMIT 1`,
    [userId, provider, objectKey]
  );
  const storage = storageFor(provider);
  if (!storage) throw new Error(`${provider} storage is not configured`);
  if (!objectKey.startsWith(`${userId}/`)) throw new Error('Temporary upload does not belong to this user');
  const row = queued.rows[0];
  const bucketName = row?.bucket_name || (provider === 'supabase' ? (objectKey.includes('/kyc/') ? SUPABASE_KYC_BUCKET : SUPABASE_STORAGE_BUCKET) : R2_BUCKET);
  await storage.send(new DeleteObjectCommand({ Bucket: bucketName, Key: objectKey }));
  await clearExpiredImageReferences(userId, objectKey);
  if (row) await pool.query('DELETE FROM temporary_storage_uploads WHERE id = $1 AND user_id = $2', [row.id, userId]);
  return true;
}

export async function readTemporaryKycImage(userId, deleteRef) {
  const match = /^supabase:(.+)$/.exec(deleteRef || '');
  if (!match) throw new Error('KYC photo is not stored in private Supabase Storage');
  const objectKey = match[1];
  if (!objectKey.startsWith(`${userId}/kyc/`)) throw new Error('KYC photo does not belong to this user');
  const queued = await pool.query(
    `SELECT bucket_name FROM temporary_storage_uploads
     WHERE user_id = $1 AND provider = 'supabase' AND object_key = $2 AND expires_at > NOW() LIMIT 1`,
    [userId, objectKey]
  );
  if (queued.rows.length === 0) throw new Error('KYC photo has expired or is unavailable; please retake it');
  if (!supabaseStorage) throw new Error('Supabase Storage is not configured');
  const result = await supabaseStorage.send(new GetObjectCommand({ Bucket: queued.rows[0].bucket_name, Key: objectKey }));
  if (!result.Body) throw new Error('KYC photo could not be read from secure storage');
  return Buffer.from(await result.Body.transformToByteArray());
}

export async function expireTemporaryStorageUploads() {
  const expired = await pool.query(
    `SELECT id, user_id, provider, bucket_name, object_key FROM temporary_storage_uploads
     WHERE expires_at <= NOW() ORDER BY expires_at LIMIT 50`
  );
  let deleted = 0;
  for (const row of expired.rows) {
    try {
      const storage = storageFor(row.provider);
      if (!storage) throw new Error(`${row.provider} storage is not configured`);
      await storage.send(new DeleteObjectCommand({ Bucket: row.bucket_name, Key: row.object_key }));
      await clearExpiredImageReferences(row.user_id, row.object_key);
      await pool.query('DELETE FROM temporary_storage_uploads WHERE id = $1', [row.id]);
      deleted++;
    } catch (err) {
      console.error(`[UPLOAD EXPIRY] Could not delete ${row.provider} object:`, err.message);
    }
  }
  if (deleted > 0) console.log(`[UPLOAD EXPIRY] Deleted ${deleted} expired temporary image(s)`);
}
