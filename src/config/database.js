import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const isTestMode = process.env.NODE_ENV === 'test';
const primaryDatabaseUrl = isTestMode ? process.env.DATABASE_URL : process.env.SUPABASE_DATABASE_URL;
const neonBackupDatabaseUrl = !isTestMode
  ? (process.env.NEON_BACKUP_DATABASE_URL || process.env.DATABASE_URL || null)
  : null;

if (!primaryDatabaseUrl) {
  throw new Error(isTestMode ? 'DATABASE_URL is required in test mode' : 'SUPABASE_DATABASE_URL is required in production');
}

const pool = new Pool({
  connectionString: primaryDatabaseUrl,
  max: isTestMode ? 5 : 15,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: isTestMode ? 5000 : 15000,
  ssl: primaryDatabaseUrl.includes('localhost') ? false : { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  console.error('Unexpected pool error:', err);
});

export { pool, isTestMode, neonBackupDatabaseUrl };
