require('dotenv').config();
const pg = require('pg');
const p = new pg.Pool({ connectionString: process.env.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } });
(async () => {
  const r = await p.query("SELECT id, user_id, account_id, provider_id, password IS NOT NULL as has_password FROM accounts WHERE user_id = '5fee8bc8-d885-42b6-aebd-8f1bf78c2955'");
  console.log('accounts:', JSON.stringify(r.rows, null, 2));
  
  // Check sessions too
  const s = await p.query("SELECT id, user_id, login_method FROM sessions ORDER BY created_at DESC LIMIT 3");
  console.log('sessions:', JSON.stringify(s.rows, null, 2));
  await p.end();
})();
