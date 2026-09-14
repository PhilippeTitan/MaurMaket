require('dotenv').config();
const pg = require('pg');
const p = new pg.Pool({ connectionString: process.env.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } });
(async () => {
  // Test the exact query Better Auth would run
  const r = await p.query("SELECT id, full_name, email, username FROM users WHERE email = $1", ['test_plugin_7@example.com']);
  console.log('User found:', r.rows.length > 0);
  if (r.rows.length > 0) console.log('Row:', r.rows[0]);
  
  // Check if the issue is with the id format
  const r2 = await p.query("SELECT id, typeof(id) as id_type FROM users WHERE email = $1", ['test_plugin_7@example.com']);
  console.log('ID type:', r2.rows[0]);
  await p.end();
})();
