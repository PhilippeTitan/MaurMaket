require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  const email = 'lexikonstrsut@gmail.com';
  const sql = `
    UPDATE "users"
    SET
      "role" = $1,
      "seller_tier" = $2,
      id_verified = true,
      id_verified_at = NOW(),
      id_verification_result = $3,
      id_submitted_at = COALESCE(id_submitted_at, NOW()),
      email_verified = true,
      store_name = COALESCE(store_name, $4),
      use_store_identity = true,
      bio = COALESCE(bio, $5)
    WHERE email = $6
    RETURNING id, full_name, email, role, seller_tier, id_verified, id_verification_result, email_verified, store_name, id_verified_at;
  `;

  const result = await pool.query(sql, [
    'seller',
    'verified',
    'verified',
    'Lexi Tester',
    'Tester account for QA and product validation.',
    email
  ]);

  const rows = result.rows;
  console.log('Updated rows:', JSON.stringify(rows, null, 2));

  const user = await pool.query(
    'SELECT id, full_name, email, role, seller_tier, id_verified, id_verification_result, email_verified, store_name FROM "users" WHERE email = $1',
    [email]
  );

  console.log('Verified user state:', JSON.stringify(user.rows[0] ?? { found: false }, null, 2));
  await pool.end();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
