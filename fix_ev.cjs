require('dotenv').config();
const pg = require('pg');
const p = new pg.Pool({ connectionString: process.env.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } });
(async () => {
  const r = await p.query("UPDATE users SET email_verified = true WHERE email = 'test_plugin_7@example.com' RETURNING id, email, email_verified");
  console.log('Updated:', r.rows[0]);
  await p.end();
})();
