import pg from 'pg';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const products = [
  { name: 'iPhone 14 Pro', description: 'Like new, 256GB, Deep Purple', price: 45000, stock: 3, category: 'Electronics', image: 'https://images.unsplash.com/photo-1695048133142-1a735d44fea3?w=400&q=80' },
  { name: 'Casio Vintage Watch', description: 'Classic A158W, gold tone', price: 2500, stock: 10, category: 'Fashion', image: 'https://images.unsplash.com/photo-1524592094714-0f0654e20314?w=400&q=80' },
  { name: 'Bluetooth Speaker', description: 'JBL Flip 6, waterproof, bass', price: 3500, stock: 7, category: 'Electronics', image: 'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=400&q=80' },
  { name: 'Nike Air Sneakers', description: 'Size 42, white, worn once', price: 5500, stock: 2, category: 'Fashion', image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&q=80' },
  { name: 'Scented Candle Set', description: 'Set of 3, vanilla lavender rose', price: 1200, stock: 15, category: 'Home & Garden', image: 'https://images.unsplash.com/photo-1602523961351-f18c3d9b5c7c?w=400&q=80' },
  { name: 'Wireless Earbuds', description: 'AirPods Pro 2nd gen, excellent condition', price: 12000, stock: 5, category: 'Electronics', image: 'https://images.unsplash.com/photo-1588423771073-b8903fbb85b5?w=400&q=80' },
  { name: 'Ray-Ban Aviator', description: 'Gold frame, green lens', price: 8000, stock: 4, category: 'Fashion', image: 'https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=400&q=80' },
  { name: 'North Face Backpack', description: 'Borealis, grey, spacious', price: 4500, stock: 6, category: 'Fashion', image: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400&q=80' },
  { name: 'Fitness Tracker', description: 'Mi Band 8, black, all features', price: 1800, stock: 12, category: 'Sports', image: 'https://images.unsplash.com/photo-1576243345690-4e4b79b63288?w=400&q=80' },
  { name: 'Dior Sauvage', description: '100ml Eau de Toilette, original', price: 9500, stock: 3, category: 'Beauty', image: 'https://images.unsplash.com/photo-1541643600914-78b084683601?w=400&q=80' },
  { name: 'Clear Phone Case', description: 'iPhone 14 Pro, shockproof', price: 800, stock: 20, category: 'Electronics', image: 'https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?w=400&q=80' },
  { name: 'Nespresso Coffee Maker', description: 'Vertuo, red, barely used', price: 15000, stock: 2, category: 'Home & Garden', image: 'https://images.unsplash.com/photo-1517668808822-9ebb02f2a0e6?w=400&q=80' },
];

async function seed() {
  const client = await pool.connect();
  try {
    // Create demo seller
    const hash = crypto.createHash('sha256').update('demo123').digest('hex');
    const seller = await client.query(
      `INSERT INTO users (full_name, email, password_hash, phone, role) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE SET full_name = $1 RETURNING id`,
      ['Demo Seller', 'seller@demo.com', hash, '5555 1234', 'seller']
    );
    const sellerId = seller.rows[0].id;

    // Insert products
    for (const p of products) {
      const cat = await client.query('SELECT id FROM categories WHERE name = $1', [p.category]);
      const catId = cat.rows[0]?.id || null;

      const prod = await client.query(
        `INSERT INTO products (seller_id, category_id, name, description, price, stock)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [sellerId, catId, p.name, p.description, p.price, p.stock]
      );

      await client.query(
        `INSERT INTO product_images (product_id, image_url, is_primary, display_order) VALUES ($1, $2, TRUE, 0)`,
        [prod.rows[0].id, p.image]
      );
    }

    console.log(`✅ Seeded ${products.length} products for Demo Seller (seller@demo.com / demo123)`);
  } catch (err) {
    console.error('Seed error:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
