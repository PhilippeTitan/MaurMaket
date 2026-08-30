import { Router } from 'express';
import { pool } from '../config/database.js';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const result = await pool.query('SELECT * FROM categories ORDER BY display_order ASC');
    res.json({ categories: result.rows });
  } catch (err) {
    console.error('Categories error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
