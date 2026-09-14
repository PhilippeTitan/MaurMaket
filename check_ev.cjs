require('dotenv').config();
const pg = require('pg');
const p = new pg.Pool({ connectionString: process.env.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } });
(async () => {
  const r = await p.query("SELECT id, email, email_verified, username FROM users WHERE email = 'test_plugin_7@example.com'");
  console.log('User:', JSON.stringify(r.rows[0], null, 2));
  await p.end();
})();
