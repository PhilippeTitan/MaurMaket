/**
 * One-time sync: copy all users + accounts from Supabase → Neon
 * so replicator FK constraints pass.
 */
const { Pool } = require('pg');
require('dotenv').config();

const supa = new Pool({
  connectionString: process.env.SUPABASE_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
const neon = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function syncTable(name) {
  console.log(`Reading ${name} from Supabase...`);
  const { rows } = await supa.query(`SELECT * FROM ${name}`);
  console.log(`Found ${rows.length} rows in ${name}`);
  let synced = 0;
  for (const row of rows) {
    try {
      const cols = Object.keys(row);
      const vals = Object.values(row);
      const ph = cols.map((_, i) => `$${i + 1}`);
      const upd = cols.filter(c => c !== 'id').map(c => `${c}=EXCLUDED.${c}`);
      await neon.query(
        `INSERT INTO ${name} (${cols.join(',')}) VALUES (${ph.join(',')}) ON CONFLICT (id) DO UPDATE SET ${upd.join(',')}`,
        vals
      );
      synced++;
    } catch (rowErr) {
      console.error(`  Row ${row.id} failed:`, rowErr.message);
    }
  }
  return synced;
}

(async () => {
  console.log('Connecting to Supabase...');
  await supa.query('SELECT 1');
  console.log('Supabase connected');
  console.log('Connecting to Neon...');
  await neon.query('SELECT 1');
  console.log('Neon connected');
  const users = await syncTable('users');
  console.log(`Users synced: ${users}`);
  const accounts = await syncTable('accounts');
  console.log(`Accounts synced: ${accounts}`);
  await supa.end();
  await neon.end();
  console.log('Done!');
})().catch(e => {
  console.error('Sync failed:', e.message);  console.error('Stack:', e.stack);  process.exit(1);
});
