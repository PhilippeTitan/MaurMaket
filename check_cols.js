require('dotenv').config();
const pg = require('pg');
const p = new pg.Pool({ connectionString: process.env.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } });
(async () => {
  const r = await p.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'users' ORDER BY ordinal_position");
  console.log('USERS:', r.rows.map(r => r.column_name).join(', '));
  const t = await p.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'two_factor' ORDER BY ordinal_position");
  console.log('TWO_FACTOR:', t.rows.map(r => r.column_name).join(', '));
  await p.end();
})();
