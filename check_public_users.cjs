require('dotenv').config();
const pg = require('pg');
const p = new pg.Pool({ connectionString: process.env.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } });
(async () => {
  const r = await p.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND table_schema = 'public' ORDER BY ordinal_position");
  console.log('public.users columns:', r.rows.map(r => r.column_name).join(', '));
  await p.end();
})();
