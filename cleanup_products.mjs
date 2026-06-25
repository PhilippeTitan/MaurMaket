import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const DEMO_SELLER = 'e6bd7a53-cb0f-41e5-b140-9c617c4c3d51';

async function cleanup() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Delete order_items referencing non-demo products
    await client.query(
      `DELETE FROM order_items WHERE product_id NOT IN (SELECT id FROM products WHERE seller_id = $1)`,
      [DEMO_SELLER]
    );
    // Delete product_images for non-demo products
    await client.query(
      `DELETE FROM product_images WHERE product_id NOT IN (SELECT id FROM products WHERE seller_id = $1)`,
      [DEMO_SELLER]
    );
    // Delete wishlists for non-demo products
    await client.query(
      `DELETE FROM wishlists WHERE product_id NOT IN (SELECT id FROM products WHERE seller_id = $1)`,
      [DEMO_SELLER]
    );

    // Delete all products NOT from demo seller
    const del = await client.query(
      `DELETE FROM products WHERE seller_id != $1 RETURNING name`,
      [DEMO_SELLER]
    );
    console.log(`Deleted ${del.rowCount} junk products:`);
    del.rows.forEach(r => console.log(`  - ${r.name}`));

    // Now fix Globe product's broken local image URL
    const globeFix = await client.query(
      `UPDATE product_images SET image_url = 'https://images.unsplash.com/photo-1513836279014-a89f7a76ae86?w=400&q=80'
       WHERE image_url LIKE '/uploads/%' RETURNING product_id`,
    );
    if (globeFix.rowCount > 0) {
      console.log(`\nFixed ${globeFix.rowCount} local /uploads/ image URL(s)`);
    }

    // Delete all orders from non-demo users (cleanup test orders)
    await client.query(`DELETE FROM order_events WHERE order_id IN (SELECT id FROM orders WHERE buyer_id != $1)`, [DEMO_SELLER]);
    await client.query(`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE buyer_id != $1)`, [DEMO_SELLER]);
    const ordersDel = await client.query(`DELETE FROM orders WHERE buyer_id != $1 RETURNING id`, [DEMO_SELLER]);
    console.log(`Deleted ${ordersDel.rowCount} test orders`);

    await client.query('COMMIT');

    // Verify remaining products
    const check = await client.query(
      `SELECT p.name, p.price, c.name as category, 
              (SELECT image_url FROM product_images pi WHERE pi.product_id = p.id AND pi.is_primary = true LIMIT 1) as img
       FROM products p LEFT JOIN categories c ON p.category_id = c.id
       ORDER BY c.name, p.name`
    );
    console.log(`\nRemaining products (${check.rowCount}):`);
    check.rows.forEach(r => console.log(`  ${r.name} | ${r.category || 'none'} | ${r.img ? '✓ has image' : '✗ no image'}`));

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error:', err.message);
  } finally {
    client.release();
    pool.end();
  }
}

cleanup();
