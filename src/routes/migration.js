import { Router } from 'express';
import express from 'express';
import sharp from 'sharp';
import { pool } from '../config/database.js';
import { authRequired } from '../middleware/auth.js';
import { r2Storage, R2_BUCKET, R2_PUBLIC_BASE, PutObjectCommand } from '../config/storage.js';

const router = Router();

// One-time migration: convert all JPG images to WebP ≤300KB
router.post('/api/admin/convert-to-webp', authRequired, express.json({ limit: '1mb' }), async (req, res) => {
  // Only allow admin
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  try {
    const { rows } = await pool.query(
      `SELECT id, image_url FROM product_images WHERE image_url LIKE '%.jpg' OR image_url LIKE '%.jpeg' OR image_url LIKE '%.png'`
    );
    console.log(`[WEBP] Found ${rows.length} images to convert`);
    res.json({ total: rows.length, message: 'Conversion started (check server logs)' });

    // Process in background
    for (const row of rows) {
      try {
        const response = await fetch(row.image_url);
        if (!response.ok) continue;
        const buffer = Buffer.from(await response.arrayBuffer());
        const webpBuffer = await sharp(buffer).webp({ quality: 80, effort: 4 }).toBuffer();

        // Upload to R2
        if (r2Storage && webpBuffer.length < 300 * 1024) {
          const key = `products/${row.id}.webp`;
          await r2Storage.send(new PutObjectCommand({
            Bucket: R2_BUCKET,
            Key: key,
            Body: webpBuffer,
            ContentType: 'image/webp',
          }));
          const newUrl = `${R2_PUBLIC_BASE}/${key}`;
          await pool.query('UPDATE product_images SET image_url = $1 WHERE id = $2', [newUrl, row.id]);
          console.log(`[WEBP] Converted ${row.id}`);
        }
      } catch (e) {
        console.error(`[WEBP] Failed ${row.id}:`, e.message);
      }
    }
  } catch (err) {
    console.error('WebP conversion error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
