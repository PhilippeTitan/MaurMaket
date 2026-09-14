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

// ───── Raw primary pool (used for writes + transactions) ─────
const _rawPool = new Pool({
  connectionString: primaryDatabaseUrl,
  max: isTestMode ? 5 : 15,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: isTestMode ? 5000 : 15000,
  ssl: primaryDatabaseUrl.includes('localhost') ? false : { rejectUnauthorized: false },
});

_rawPool.on('error', (err) => {
  console.error('Unexpected pool error:', err);
});

// ───── DB Controller reference (set by server.js after init) ─────
let _controller = null;

/**
 * Called by server.js after DB Controller initializes.
 * Wires SELECT failover through the controller.
 */
function setDbController(controller) {
  _controller = controller;
  console.log('[DB] Failover proxy active — SELECT queries route through DB Controller');
}

// ───── Read-only query classifier ─────
function isReadOnly(sql) {
  if (typeof sql !== 'string') return false;
  const trimmed = sql.trim().toUpperCase();
  return trimmed.startsWith('SELECT')
    || trimmed.startsWith('WITH')
    || trimmed.startsWith('EXPLAIN')
    || trimmed.startsWith('SHOW');
}

// ───── Pool-like proxy (drop-in replacement for raw pool) ─────
/**
 * Exported `pool` is a proxy that:
 *   - SELECT / WITH / EXPLAIN → routes through DB Controller (failover-aware)
 *   - INSERT / UPDATE / DELETE → routes to primary pool (pinned)
 *   - pool.connect() → raw client from primary pool (for transactions)
 *   - pool.on('error', ...) → delegates to raw pool (EventEmitter)
 *
 * This gives ALL existing routes automatic read failover with zero code changes.
 * Writes and transactions remain pinned to the primary database.
 */
const pool = new Proxy(_rawPool, {
  get(target, prop, receiver) {
    // Intercept .query() — route SELECTs through controller for failover
    if (prop === 'query') {
      return async function(sqlOrConfig, params) {
        // If controller is available AND this is a read query, use failover
        if (_controller && isReadOnly(sqlOrConfig)) {
          try {
            return await _controller.query(sqlOrConfig, params);
          } catch (controllerError) {
            // Controller failed — fall through to raw pool as last resort
            console.warn('[DB] Controller query failed, falling back to raw pool:', controllerError.message);
            return target.query(sqlOrConfig, params);
          }
        }
        // Writes go straight to primary pool (pinned, no failover)
        return target.query(sqlOrConfig, params);
      };
    }

    // Intercept .connect() — return raw client (transactions stay pinned)
    if (prop === 'connect') {
      return () => target.connect();
    }

    // Everything else (end, on, off, totalCount, idleCount, etc.) → raw pool
    const value = Reflect.get(target, prop, receiver);
    if (typeof value === 'function') {
      return value.bind(target);
    }
    return value;
  },
});

export { pool, isTestMode, neonBackupDatabaseUrl, setDbController };
