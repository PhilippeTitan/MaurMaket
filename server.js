import express from 'express';
import cors from 'cors';
import pg from 'pg';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import path from 'path';
import multer from 'multer';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const app = express();
const PORT = process.env.PORT || 3001;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runMigrations() {
  const c = await pool.connect();
  try {
    await c.query(`
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
    `);
    await c.query(`
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS meetup_lat DECIMAL(10,7);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS meetup_lng DECIMAL(10,7);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS meetup_address TEXT;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS meetup_note TEXT;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS meetup_confirmed BOOLEAN DEFAULT false;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS meetup_proposed_by UUID REFERENCES users(id);
    `);
    await c.query(`
      ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
    `).catch(() => {});
    await c.query(`
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_method VARCHAR(20) DEFAULT 'meetup';
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_name TEXT;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_phone TEXT;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_address TEXT;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_city TEXT;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_note TEXT;
    `);
    console.log('Migrations complete');
  } catch (err) {
    console.error('Migration error:', err);
  } finally {
    c.release();
  }
}

app.use(cors());
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8'); },
}));

app.use(express.static(path.join(__dirname, 'dist')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, path.join(__dirname, 'uploads')),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// Auth middleware
function authRequired(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const payload = JSON.parse(Buffer.from(auth.slice(7), 'base64url').toString());
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function sellerRequired(req, res, next) {
  next();
}

// ───── Auth routes ─────

app.post('/api/auth/signup', async (req, res) => {
  const { fullName, email, password, phone, role } = req.body;
  if (!fullName || !email || !password) {
    return res.status(400).json({ error: 'Full name, email, and password required' });
  }
  try {
    const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
    const cleanPhone = phone ? phone.replace(/^\+/, '') : null;
    const result = await pool.query(
      `INSERT INTO users (full_name, email, password_hash, phone, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, full_name, email, phone, role, avatar_url, created_at`,
      [fullName, email, passwordHash, cleanPhone, role || 'buyer']
    );
    const user = result.rows[0];
    const token = Buffer.from(JSON.stringify({ id: user.id, email: user.email, role: user.role })).toString('base64url');
    res.status(201).json({ user, token });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Email already registered' });
    }
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }
  try {
    const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
    const result = await pool.query(
      `SELECT id, full_name, email, phone, role, avatar_url, bio FROM users WHERE email = $1 AND password_hash = $2`,
      [email, passwordHash]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const user = result.rows[0];
    const token = Buffer.from(JSON.stringify({ id: user.id, email: user.email, role: user.role })).toString('base64url');
    res.json({ user, token });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/auth/me', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, full_name, email, phone, role, avatar_url, bio, created_at FROM users WHERE id = $1`,
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
  let { fullName, email, phone, bio, avatarUrl } = req.body;
  if (phone) phone = phone.replace(/^\+/, '');
  try {
    const result = await pool.query(
      `UPDATE users SET full_name = COALESCE($1, full_name), email = COALESCE($2, email), phone = COALESCE($3, phone), bio = COALESCE($4, bio), avatar_url = COALESCE($5, avatar_url), updated_at = CURRENT_TIMESTAMP WHERE id = $6 RETURNING id, full_name, email, phone, role, avatar_url, bio`,
      [fullName, email || null, phone, bio, avatarUrl, req.user.id]
    );
    res.json({ user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already in use' });
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/auth/password', authRequired, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password required' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }
  try {
    const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const currentHash = crypto.createHash('sha256').update(currentPassword).digest('hex');
    if (currentHash !== result.rows[0].password_hash) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }
    const newHash = crypto.createHash('sha256').update(newPassword).digest('hex');
    await pool.query('UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [newHash, req.user.id]);
    res.json({ updated: true });
  } catch (err) {
    console.error('Password change error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ───── Product routes ─────

app.get('/api/products', async (req, res) => {
  const { category, search, seller, minPrice, maxPrice, sort, page = 1, limit = 20 } = req.query;
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
    conditions.push(`p.price >= $${paramIndex++}`);
    params.push(minPrice);
  }
  if (maxPrice) {
    conditions.push(`p.price <= $${paramIndex++}`);
    params.push(maxPrice);
  }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  let orderBy = 'p.created_at DESC';
  if (sort === 'price_asc') orderBy = 'p.price ASC';
  else if (sort === 'price_desc') orderBy = 'p.price DESC';
  else if (sort === 'oldest') orderBy = 'p.created_at ASC';

  try {
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM products p LEFT JOIN categories c ON p.category_id = c.id ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    const result = await pool.query(
      `SELECT p.id, p.name, p.description, p.price, p.stock, p.created_at,
              u.full_name AS seller_name, u.id AS seller_id,
              c.name AS category,
              (SELECT pi.image_url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.is_primary DESC, pi.display_order ASC LIMIT 1) AS image_url
       FROM products p
       JOIN users u ON p.seller_id = u.id
       LEFT JOIN categories c ON p.category_id = c.id
       ${where}
       ORDER BY ${orderBy}
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, Math.min(limit, 50), offset]
    );

    res.json({ products: result.rows, total, page: +page, pages: Math.ceil(total / Math.min(limit, 50)) });
  } catch (err) {
    console.error('Products fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, u.full_name AS seller_name, u.avatar_url AS seller_avatar, u.phone AS seller_phone, c.name AS category,
              (SELECT json_agg(json_build_object('url', pi.image_url, 'is_primary', pi.is_primary) ORDER BY pi.is_primary DESC, pi.display_order ASC) FROM product_images pi WHERE pi.product_id = p.id) AS images
       FROM products p
       JOIN users u ON p.seller_id = u.id
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    res.json({ product: result.rows[0] });
  } catch (err) {
    console.error('Product detail error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/products', authRequired, sellerRequired, async (req, res) => {
  const { name, description, price, stock, categoryId, images } = req.body;
  if (!name || !price) {
    return res.status(400).json({ error: 'Name and price required' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const productResult = await client.query(
      `INSERT INTO products (seller_id, category_id, name, description, price, stock)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.user.id, categoryId || null, name, description || '', price, stock || 0]
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
    res.status(201).json({ product });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Product create error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

app.delete('/api/products/:id', authRequired, sellerRequired, async (req, res) => {
  try {
    const check = await pool.query('SELECT seller_id FROM products WHERE id = $1', [req.params.id]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    if (check.rows[0].seller_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not your product' });
    }
    await pool.query('DELETE FROM products WHERE id = $1', [req.params.id]);
    res.json({ deleted: true });
  } catch (err) {
    console.error('Product delete error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/products/:id', authRequired, sellerRequired, async (req, res) => {
  try {
    const check = await pool.query('SELECT seller_id FROM products WHERE id = $1', [req.params.id]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    if (check.rows[0].seller_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not your product' });
    }
    const { name, description, price, stock, isAvailable, categoryId } = req.body;
    const result = await pool.query(
      `UPDATE products SET name = COALESCE($1, name), description = COALESCE($2, description), price = COALESCE($3, price), stock = COALESCE($4, stock), is_available = COALESCE($5, is_available), category_id = COALESCE($6, category_id), updated_at = CURRENT_TIMESTAMP WHERE id = $7 RETURNING *`,
      [name, description, price, stock, isAvailable, categoryId, req.params.id]
    );
    res.json({ product: result.rows[0] });
  } catch (err) {
    console.error('Product update error:', err);
    res.status(500).json({ error: 'Server error' });
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

app.get('/api/orders/:id', authRequired, async (req, res) => {
  try {
    const order = await canAccessOrder(req.user.id, req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const items = await pool.query(
      `SELECT oi.*, p.name AS product_name, p.price AS product_price
       FROM order_items oi JOIN products p ON oi.product_id = p.id
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
    res.json({ order: { ...order, items: items.rows, my_role: myRole, other_party: otherParty.rows[0] || null } });
  } catch (err) {
    console.error('Order fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/orders', authRequired, async (req, res) => {
  try {
    const buyerOrders = await pool.query(
      `SELECT o.*, u.full_name AS seller_name, u.phone AS seller_phone,
              'buyer' AS my_role
       FROM orders o
       JOIN order_items oi ON o.id = oi.order_id
       JOIN users u ON oi.seller_id = u.id
       WHERE o.buyer_id = $1
       ORDER BY o.created_at DESC`,
      [req.user.id]
    );
    const sellerOrders = await pool.query(
      `SELECT o.*, u.full_name AS buyer_name, u.phone AS buyer_phone,
              'seller' AS my_role
       FROM orders o
       JOIN order_items oi ON o.id = oi.order_id
       JOIN users u ON o.buyer_id = u.id
       WHERE oi.seller_id = $1
       ORDER BY o.created_at DESC`,
      [req.user.id]
    );
    res.json({ buyerOrders: buyerOrders.rows, sellerOrders: sellerOrders.rows });
  } catch (err) {
    console.error('Orders error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/orders', authRequired, async (req, res) => {
  const { items, deliveryMethod, deliveryName, deliveryPhone, deliveryAddress, deliveryCity, deliveryNote } = req.body;
  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'Cart is empty' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let total = 0;
    const orderItems = [];

    for (const item of items) {
      const prod = await client.query('SELECT id, price, seller_id, stock FROM products WHERE id = $1 AND is_available = TRUE FOR UPDATE', [item.productId]);
      if (prod.rows.length === 0) {
        throw new Error(`Product ${item.productId} not found or unavailable`);
      }
      if (prod.rows[0].stock < (item.quantity || 1)) {
        throw new Error(`Insufficient stock for product ${item.productId}`);
      }
      const price = parseFloat(prod.rows[0].price);
      total += price * (item.quantity || 1);
      orderItems.push({ productId: item.productId, quantity: item.quantity || 1, price, sellerId: prod.rows[0].seller_id });
    }

    const method = deliveryMethod === 'delivery' ? 'delivery' : 'meetup';
    const orderResult = await client.query(
      `INSERT INTO orders (buyer_id, total_amount, status, delivery_method, delivery_name, delivery_phone, delivery_address, delivery_city, delivery_note)
       VALUES ($1, $2, 'pending', $3, $4, $5, $6, $7, $8) RETURNING *`,
      [req.user.id, total, method, deliveryName || null, deliveryPhone || null, deliveryAddress || null, deliveryCity || null, deliveryNote || null]
    );
    const order = orderResult.rows[0];

    for (const oi of orderItems) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, seller_id, quantity, price) VALUES ($1, $2, $3, $4, $5)`,
        [order.id, oi.productId, oi.sellerId, oi.quantity, oi.price]
      );
      await client.query('UPDATE products SET stock = stock - $1 WHERE id = $2', [oi.quantity, oi.productId]);
    }

    await client.query('COMMIT');
    res.status(201).json({ order });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Order create error:', err);
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
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
    if (order.rows[0].status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Only pending orders can be cancelled' });
    }
    const items = await client.query('SELECT product_id, quantity FROM order_items WHERE order_id = $1', [req.params.id]);
    for (const item of items.rows) {
      await client.query('UPDATE products SET stock = stock + $1 WHERE id = $2', [item.quantity, item.product_id]);
    }
    await client.query(
      "UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
      [req.params.id]
    );
    await client.query('COMMIT');
    res.json({ cancelled: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Order cancel error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
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
  try {
    const order = await canAccessOrder(req.user.id, req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'paid' && order.status !== 'pending') return res.status(400).json({ error: 'Order must be paid or pending' });
    await pool.query(
      `UPDATE orders SET meetup_lat = $1, meetup_lng = $2, meetup_address = $3, meetup_note = $4, meetup_confirmed = false, meetup_proposed_by = $5, updated_at = CURRENT_TIMESTAMP WHERE id = $6`,
      [lat, lng, address || null, note || null, req.user.id, req.params.id]
    );
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
    res.json({ updated: true });
  } catch (err) {
    console.error('Meetup confirm error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/orders/:id/complete', authRequired, async (req, res) => {
  try {
    const order = await canAccessOrder(req.user.id, req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status === 'completed') return res.status(400).json({ error: 'Order already completed' });
    if (order.status === 'cancelled') return res.status(400).json({ error: 'Order was cancelled' });
    await pool.query(
      `UPDATE orders SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [req.params.id]
    );
    res.json({ updated: true, status: 'completed' });
  } catch (err) {
    console.error('Order complete error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/payments/retry/:orderId', authRequired, async (req, res) => {
  const { orderId } = req.params;
  try {
    const orderResult = await pool.query(
      "SELECT * FROM orders WHERE id = $1 AND buyer_id = $2 AND status = 'pending'",
      [orderId, req.user.id]
    );
    if (orderResult.rows.length === 0) return res.status(404).json({ error: 'Pending order not found' });
    const order = orderResult.rows[0];

    const moncashRes = await fetch(
      process.env.MONCASH_PAY_CREATE_URL || 'https://hvlmeoqyxaguzcujpmit.supabase.co/functions/v1/pay-create',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.MCC_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: parseFloat(order.total_amount),
          referenceId: orderId,
          returnUrl: `${req.protocol}://${req.get('host')}/payment/return?order=${orderId}`,
        }),
      }
    );

    if (!moncashRes.ok) {
      const errorText = await moncashRes.text();
      return res.status(502).json({ error: `MonCashConnect returned ${moncashRes.status}`, details: errorText });
    }
    const data = await moncashRes.json();
    if (!data.paymentUrl) return res.status(502).json({ error: 'Payment provider error' });

    res.json({ paymentUrl: data.paymentUrl });
  } catch (err) {
    console.error('Payment retry error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ───── Seller dashboard ─────

app.get('/api/seller/products', authRequired, sellerRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, c.name AS category,
              (SELECT pi.image_url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.is_primary DESC, pi.display_order ASC LIMIT 1) AS image_url
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.seller_id = $1
       ORDER BY p.created_at DESC`,
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
      `SELECT o.*, u.full_name AS buyer_name, u.phone AS buyer_phone
       FROM orders o
       JOIN order_items oi ON o.id = oi.order_id
       JOIN users u ON o.buyer_id = u.id
       WHERE oi.seller_id = $1
       GROUP BY o.id, u.full_name, u.phone
       ORDER BY o.created_at DESC`,
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
    const check = await pool.query(
      `SELECT o.id, o.status FROM orders o
       JOIN order_items oi ON o.id = oi.order_id
       WHERE o.id = $1 AND oi.seller_id = $2`,
      [req.params.id, req.user.id]
    );
    if (check.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    const current = check.rows[0].status;
    const transitions = { pending: 'processing', paid: 'processing', processing: 'shipped', shipped: 'delivered' };
    if (transitions[current] !== status) {
      return res.status(400).json({ error: `Cannot transition from ${current} to ${status}` });
    }
    await pool.query(
      `UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [status, req.params.id]
    );
    res.json({ updated: true, status });
  } catch (err) {
    console.error('Order status update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ───── Payment routes ─────

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

    const moncashRes = await fetch(
      process.env.MONCASH_PAY_CREATE_URL || 'https://hvlmeoqyxaguzcujpmit.supabase.co/functions/v1/pay-create',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.MCC_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: parseFloat(order.total_amount),
          referenceId: orderId,
          returnUrl: returnUrl || `${req.protocol}://${req.get('host')}/payment/return`,
        }),
      }
    );

    if (!moncashRes.ok) {
      const errorText = await moncashRes.text();
      console.error(`MonCashConnect HTTP ${moncashRes.status}:`, errorText);
      return res.status(502).json({ error: `MonCashConnect returned ${moncashRes.status}`, details: errorText });
    }
    const data = await moncashRes.json();
    if (!data.paymentUrl) {
      console.error('MonCashConnect missing paymentUrl:', data);
      return res.status(502).json({ error: 'Payment provider error', details: data });
    }

    await pool.query('UPDATE orders SET moncash_reference = $1 WHERE id = $2', [orderId, orderId]);
    res.json({ paymentUrl: data.paymentUrl });
  } catch (err) {
    console.error('Payment create error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/payments/webhook', async (req, res) => {
  const rawBody = req.rawBody;
  const signature = req.headers['x-mcc-signature'];
  const timestamp = req.headers['x-mcc-timestamp'];
  const webhookSecret = process.env.MCC_WEBHOOK_SECRET;

  if (webhookSecret) {
    if (!signature || !timestamp) {
      return res.status(401).json({ error: 'Missing signature headers' });
    }
    const ts = parseInt(timestamp) * 1000;
    const age = (Date.now() - ts) / 1000;
    if (age > 300) {
      return res.status(401).json({ error: 'Webhook timestamp expired' });
    }
    const expected = 'sha256=' + crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
    if (expected !== signature) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
  }

  const { event, reference } = req.body;
  console.log('MonCash webhook:', JSON.stringify(req.body));

  if (!reference) return res.status(400).json({ error: 'reference required' });

  try {
    if (event === 'payment.completed') {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `UPDATE orders SET status = 'paid', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'pending'`,
          [reference]
        );
        const items = await client.query(
          'SELECT seller_id, SUM(price * quantity) AS total FROM order_items WHERE order_id = $1 GROUP BY seller_id',
          [reference]
        );
        for (const item of items.rows) {
          if (item.seller_id) {
            await client.query(
              `INSERT INTO seller_balances (seller_id, balance, total_earned)
               VALUES ($1, $2, $2)
               ON CONFLICT (seller_id)
               DO UPDATE SET balance = seller_balances.balance + $2,
                             total_earned = seller_balances.total_earned + $2,
                             updated_at = CURRENT_TIMESTAMP`,
              [item.seller_id, parseFloat(item.total)]
            );
          }
        }
        await client.query('COMMIT');
        console.log(`Order ${reference} paid, sellers credited`);
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    } else if (event === 'payment.failed') {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const items = await client.query('SELECT product_id, quantity FROM order_items WHERE order_id = $1', [reference]);
        for (const item of items.rows) {
          await client.query('UPDATE products SET stock = stock + $1 WHERE id = $2', [item.quantity, item.product_id]);
        }
        await client.query("UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [reference]);
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
      console.log(`Order ${reference} cancelled via webhook`);
    } else if (event === 'payout.completed') {
      await pool.query(
        `UPDATE payouts SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [reference]
      );
      console.log(`Payout ${reference} completed via webhook`);
    } else if (event === 'payout.failed') {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const payout = await client.query('SELECT seller_id, amount FROM payouts WHERE id = $1', [reference]);
        if (payout.rows.length > 0) {
          const { seller_id, amount } = payout.rows[0];
          await client.query(
            'UPDATE seller_balances SET balance = balance + $1, total_paid_out = total_paid_out - $1, updated_at = CURRENT_TIMESTAMP WHERE seller_id = $2',
            [amount, seller_id]
          );
        }
        await client.query(
          `UPDATE payouts SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [reference]
        );
        await client.query('COMMIT');
        console.log(`Payout ${reference} failed, balance refunded`);
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
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
      return res.json({ balance: { balance: 0, total_earned: 0, total_paid_out: 0 } });
    }
    res.json({ balance: result.rows[0] });
  } catch (err) {
    console.error('Balance fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/seller/payouts', authRequired, sellerRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM payouts WHERE seller_id = $1 ORDER BY created_at DESC`,
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
  const { amount } = req.body;
  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Valid amount required' });
  }

  const MIN_PAYOUT = parseFloat(process.env.MIN_PAYOUT_AMOUNT || '50');
  if (amount < MIN_PAYOUT) {
    return res.status(400).json({ error: `Minimum payout is Rs ${MIN_PAYOUT}` });
  }

  const c = await pool.connect();
  try {
    await c.query('BEGIN');

    const balanceResult = await c.query(
      'SELECT balance FROM seller_balances WHERE seller_id = $1 FOR UPDATE',
      [req.user.id]
    );
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

    // Call MonCashConnect payout API
    try {
      const mccRes = await fetch(
        process.env.MONCASH_PAYOUT_CREATE_URL || 'https://hvlmeoqyxaguzcujpmit.supabase.co/functions/v1/external-payout-create',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.MCC_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ amount, receiver: phone, referenceId: payout.id }),
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
      console.error(`MonCashConnect payout error: ${mccRes.status}`, errorText);
      const refundC = await pool.connect();
      try {
        await refundPayout(refundC, req.user.id, amount, payout.id, `MonCashConnect returned ${mccRes.status}: ${errorText}`);
      } finally {
        refundC.release();
      }
      return res.status(502).json({ error: 'Payout failed', details: errorText });
    } catch (fetchErr) {
      console.error('Payout network error:', fetchErr);
      const refundC = await pool.connect();
      try {
        await refundPayout(refundC, req.user.id, amount, payout.id, fetchErr.message);
      } finally {
        refundC.release();
      }
      return res.status(502).json({ error: 'Payout network error', details: fetchErr.message });
    }
  } catch (err) {
    await c.query('ROLLBACK');
    console.error('Payout request error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    c.release();
  }
});

// ───── Upload ─────

import fs from 'fs';
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

app.post('/api/upload', authRequired, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const url = `/uploads/${req.file.filename}`;
  res.json({ url });
});

// ───── Health check ─────

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected', hasMccKey: !!process.env.MCC_KEY });
  } catch {
    res.status(503).json({ status: 'error', database: 'disconnected' });
  }
});

app.get('/api/debug', async (_req, res) => {
  try {
    const mccRes = await fetch(
      process.env.MONCASH_PAY_CREATE_URL || 'https://hvlmeoqyxaguzcujpmit.supabase.co/functions/v1/pay-balance',
      { headers: { 'Authorization': `Bearer ${process.env.MCC_KEY || ''}` } }
    );
    const data = await mccRes.json();
    res.json({ mccStatus: mccRes.status, mccOk: mccRes.ok, data, hasKey: !!process.env.MCC_KEY, keyPrefix: (process.env.MCC_KEY || '').slice(0, 10) });
  } catch (err) {
    res.status(500).json({ error: err.message, hasKey: !!process.env.MCC_KEY });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const isMain = typeof import.meta !== 'undefined' && import.meta.url && process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  runMigrations().then(() => {
    app.listen(PORT, () => {
      console.log(`MaurMaket API running on http://localhost:${PORT}`);
    });
  });
}

export default app;
