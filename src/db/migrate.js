/**
 * Run replication schema on both Supabase and Neon.
 * Idempotent — safe to run multiple times.
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(join(__dirname, '01-replication-schema.sql'), 'utf8');

const databases = [
  { name: 'Supabase', url: process.env.SUPABASE_DATABASE_URL },
  { name: 'Neon', url: process.env.NEON_BACKUP_DATABASE_URL || process.env.DATABASE_URL },
];

async function runMigrations() {
  for (const db of databases) {
    if (!db.url) {
      console.log(`[Migration] ${db.name}: no connection string — skipping`);
      continue;
    }

    const pool = new pg.Pool({
      connectionString: db.url,
      ssl: db.url.includes('localhost') ? false : { rejectUnauthorized: false },
    });

    try {
      console.log(`[Migration] ${db.name}: applying replication schema...`);
      await pool.query(schema);
      console.log(`[Migration] ${db.name}: ✅ done`);
    } catch (error) {
      console.error(`[Migration] ${db.name}: ❌ failed —`, error.message);
    } finally {
      await pool.end();
    }
  }
}

runMigrations().catch(console.error);
