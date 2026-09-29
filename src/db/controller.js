/**
 * Dual-Database Controller with Circuit Breaker + Outbox Pattern
 *
 * Drop-in replacement for pg Pool. Same .query() and .connect() API.
 * Routes all writes through the outbox for async replication.
 */

import pg from 'pg';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// ───── Circuit Breaker State ─────
const BREAKER_THRESHOLD = 3;
const BREAKER_COOLDOWN_MS = 15_000;
const QUOTA_COOLDOWN_MS = 60_000; // 1 min for quota errors — don't hammer

function isDatabaseAvailabilityError(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  return code.startsWith('08')
    || ['53300', '57P01', '57P02', '57P03'].includes(code)
    || /quota.*exceeded|exceeded.*quota|connection terminated|connection closed|connect(?:ion)? timeout|econn(?:refused|reset|timedout)|socket hang up/i.test(message);
}

class CircuitBreaker {
  constructor(name) {
    this.name = name;
    this.failures = 0;
    this.unavailableUntil = 0;
    this._quotaLogged = false;
    this.lastError = null;
  }

  get isHealthy() {
    return Date.now() > this.unavailableUntil;
  }

  recordSuccess() {
    this.failures = 0;
    this._quotaLogged = false;
    this.lastError = null;
  }

  recordFailure(errorMsg) {
    this.failures++;
    this.lastError = errorMsg || 'Unknown database error';
    const isQuota = /exceeded the quota|quota.*exceeded/i.test(errorMsg || '');
    if (isQuota && !this._quotaLogged) {
      console.warn(`[DB:${this.name}] Quota exhausted — backing off for ${QUOTA_COOLDOWN_MS / 1000}s`);
      this._quotaLogged = true;
    }
    if (isQuota) {
      // Quota failures are definitive: stop probing immediately instead of
      // burning two more health checks before the quota backoff takes effect.
      this.unavailableUntil = Date.now() + QUOTA_COOLDOWN_MS;
    } else if (this.failures >= BREAKER_THRESHOLD) {
      this.unavailableUntil = Date.now() + BREAKER_COOLDOWN_MS;
      console.warn(`[DB:${this.name}] Circuit breaker OPEN — cooling down for ${BREAKER_COOLDOWN_MS / 1000}s`);
    }
  }
}

// ───── Pool Factory ─────
function createPool(connectionString, label) {
  if (!connectionString) return null;
  const pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10_000,
    ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
  });
  pool.on('error', (err) => {
    console.error(`[DB:${label}] Unexpected pool error:`, err.message);
  });
  return pool;
}

// ───── DatabaseController ─────
export class DatabaseController {
  constructor() {
    this.supabase = createPool(process.env.SUPABASE_DATABASE_URL, 'supabase');
    this.neon = createPool(process.env.NEON_BACKUP_DATABASE_URL || process.env.DATABASE_URL, 'neon');

    this.supabaseBreaker = new CircuitBreaker('supabase');
    this.neonBreaker = new CircuitBreaker('neon');
    this.secondarySchemaReady = false;
    this.prepareSecondary = null;
    this._secondaryPreparePromise = null;

    // Primary state
    this._primary = process.env.DATABASE_PRIMARY || 'supabase';
    this._mode = 'PRIMARY'; // PRIMARY | FAILOVER | RECOVERING

    // Health check interval
    this._healthCheckInterval = parseInt(process.env.HEALTH_CHECK_INTERVAL || '10000', 10);
    this._healthTimer = null;

    console.log(`[DB:Controller] Initialized — primary: ${this._primary}, supabase: ${!!this.supabase}, neon: ${!!this.neon}`);
  }

  // ───── Health ─────

  get primary() { return this._primary; }
  get mode() { return this._mode; }

  get primaryIsHealthy() {
    if (this._primary === 'supabase') return this.supabaseBreaker.isHealthy;
    return this.neonBreaker.isHealthy;
  }

  get secondaryPool() {
    return this._primary === 'supabase' ? this.neon : this.supabase;
  }

  get primaryPool() {
    return this._primary === 'supabase' ? this.supabase : this.neon;
  }

  get primaryBreaker() {
    return this._primary === 'supabase' ? this.supabaseBreaker : this.neonBreaker;
  }

  get secondaryBreaker() {
    return this._primary === 'supabase' ? this.neonBreaker : this.supabaseBreaker;
  }

  get secondaryName() {
    return this._primary === 'supabase' ? 'neon' : 'supabase';
  }

  get isSecondaryReady() {
    return !this.prepareSecondary || this.secondarySchemaReady;
  }

  async _ensureSecondarySchema(pool) {
    if (pool !== this.secondaryPool || !this.prepareSecondary || this.secondarySchemaReady) return;
    if (!this._secondaryPreparePromise) {
      this._secondaryPreparePromise = Promise.resolve()
        .then(() => this.prepareSecondary(pool))
        .then(() => {
          this.secondarySchemaReady = true;
          console.log(`[DB:Controller] Secondary (${this.secondaryName}) schema is ready`);
        })
        .finally(() => { this._secondaryPreparePromise = null; });
    }
    await this._secondaryPreparePromise;
  }

  async healthCheck() {
    const results = { supabase: false, neon: false };

    if (this.supabase && this.supabaseBreaker.isHealthy) {
      try {
        await this.supabase.query('SELECT 1');
        await this._ensureSecondarySchema(this.supabase);
        this.supabaseBreaker.recordSuccess();
        results.supabase = true;
      } catch (e) {
        this.supabaseBreaker.recordFailure(e?.message);
        console.error(`[DB:supabase] Health check failed: ${e?.message || 'Unknown database error'}`);
      }
    }

    if (this.neon && this.neonBreaker.isHealthy) {
      try {
        await this.neon.query('SELECT 1');
        await this._ensureSecondarySchema(this.neon);
        this.neonBreaker.recordSuccess();
        results.neon = true;
      } catch (e) {
        this.neonBreaker.recordFailure(e?.message);
        console.error(`[DB:neon] Health check failed: ${e?.message || 'Unknown database error'}`);
      }
    }

    // Failover logic
    if (this._mode === 'PRIMARY') {
      if (!this.primaryIsHealthy) {
        console.warn(`[DB:Controller] Primary (${this._primary}) unhealthy — entering FAILOVER`);
        this._mode = 'FAILOVER';
      }
    } else if (this._mode === 'FAILOVER') {
      if (this.primaryIsHealthy) {
        console.log(`[DB:Controller] Primary (${this._primary}) recovered — entering RECOVERING`);
        this._mode = 'RECOVERING';
        // Reconciler will transition back to PRIMARY
      }
    }

    return results;
  }

  startHealthChecks() {
    this._healthTimer = setInterval(() => this.healthCheck(), this._healthCheckInterval);
    console.log(`[DB:Controller] Health checks every ${this._healthCheckInterval}ms`);
  }

  stopHealthChecks() {
    if (this._healthTimer) {
      clearInterval(this._healthTimer);
      this._healthTimer = null;
    }
  }

  // ───── Pool Selection ─────

  _getReadPool() {
    if (this._mode === 'FAILOVER') {
      if (this.secondaryBreaker.isHealthy && this.isSecondaryReady) return this.secondaryPool;
      return null;
    }
    if (!this.primaryIsHealthy) {
      if (this.secondaryBreaker.isHealthy && this.isSecondaryReady) return this.secondaryPool;
      return null;
    }
    return this.primaryPool;
  }

  _getWritePool() {
    if (this._mode === 'FAILOVER') {
      // Only use secondary if it's actually healthy
      if (this.secondaryBreaker.isHealthy && this.isSecondaryReady) return this.secondaryPool;
      return null;
    }
    if (!this.primaryIsHealthy) {
      // Primary down — try secondary if healthy
      if (this.secondaryBreaker.isHealthy && this.isSecondaryReady) return this.secondaryPool;
      return null;
    }
    return this.primaryPool;
  }

  _getWriteSource(pool = this.primaryPool) {
    if (pool === this.supabase) return 'supabase';
    if (pool === this.neon) return 'neon';
    return this._primary;
  }

  // ───── Core Operations (pg Pool-compatible API) ─────

  /**
   * Execute a read query. Routes to healthy pool with circuit breaker.
   */
  async query(sql, params) {
    const pool = this._getReadPool();
    if (!pool) {
      const failures = [
        this.supabaseBreaker.lastError && `Supabase: ${this.supabaseBreaker.lastError}`,
        this.neonBreaker.lastError && `Neon: ${this.neonBreaker.lastError}`,
      ].filter(Boolean).join('; ');
      throw new Error(`[DB:Controller] No healthy database available${failures ? ` (${failures})` : ''}`);
    }

    try {
      const result = await pool.query(sql, params);
      this._breakerForPool(pool).recordSuccess();
      return result;
    } catch (error) {
      const poolBreaker = this._breakerForPool(pool);
      if (!isDatabaseAvailabilityError(error)) throw error;
      poolBreaker.recordFailure(error?.message);
      // Reads may fail over to the other database. Use the actual configured
      // secondary pool; `_secondaryPool` was never initialized.
      const secondary = pool === this.primaryPool ? this.secondaryPool : this.primaryPool;
      const secondaryBreaker = pool === this.primaryPool ? this.secondaryBreaker : this.primaryBreaker;
      if (secondary && secondary !== pool && secondaryBreaker.isHealthy) {
        try {
          const result = await secondary.query(sql, params);
          secondaryBreaker.recordSuccess();
          return result;
        } catch (secondaryError) {
          if (!isDatabaseAvailabilityError(secondaryError)) throw secondaryError;
          secondaryBreaker.recordFailure(secondaryError?.message);
          throw new AggregateError([error, secondaryError], '[DB:Controller] Read failed on both databases');
        }
      }
      throw error;
    }
  }

  _breakerForPool(pool) {
    if (pool === this.supabase) return this.supabaseBreaker;
    if (pool === this.neon) return this.neonBreaker;
    throw new Error('[DB:Controller] Query used an unregistered database pool');
  }

  /**
   * Get a client from the primary pool (for transactions).
   * Caller MUST call client.release() when done.
   */
  async connect() {
    const pool = this._getWritePool();
    if (!pool) throw new Error('[DB:Controller] No healthy database available');
    return pool.connect();
  }

  // ───── Atomic Write with Outbox ─────

  /**
   * Execute a write inside a transaction with atomic outbox entry.
   * The outbox entry is written in the SAME transaction as the actual change.
   *
   * @param {string} model - Table/model name (e.g., 'users', 'sessions')
   * @param {string} action - 'create' | 'update' | 'delete'
   * @param {string} recordId - ID of the affected record
   * @param {object} payload - Full row data
   * @param {string} priority - 'high' | 'normal'
   * @param {function} writeFn - async (client) => result  (the actual DB write)
   */
  async writeWithOutbox({ model, action, recordId, payload, priority = 'normal' }, writeFn) {
    const pool = this._getWritePool();
    if (!pool) throw new Error('[DB:Controller] No healthy database available');

    const client = await pool.connect();
    const operationId = crypto.randomUUID();
    const source = this._getWriteSource(pool);

    try {
      await client.query('BEGIN');

      // Execute the actual write
      const result = await writeFn(client);

      // Insert outbox entry (same transaction = atomic)
      await client.query(
        `INSERT INTO mirror_outbox (operation_id, model, action, record_id, payload, source, priority)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [operationId, model, action, String(recordId), JSON.stringify(payload), source, priority]
      );

      await client.query('COMMIT');
      this._breakerForPool(pool).recordSuccess();
      return { result, operationId };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      if (isDatabaseAvailabilityError(error)) this._breakerForPool(pool).recordFailure(error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  // ───── Convenience Methods ─────

  /**
   * Create a record with outbox entry.
   */
  async create(model, data) {
    return this.writeWithOutbox(
      { model, action: 'create', recordId: data.id || crypto.randomUUID(), payload: data, priority: this._isHighPriority(model) ? 'high' : 'normal' },
      async (client) => {
        const columns = Object.keys(data);
        const values = Object.values(data);
        const placeholders = columns.map((_, i) => `$${i + 1}`);
        const result = await client.query(
          `INSERT INTO ${model} (${columns.join(',')}) VALUES (${placeholders.join(',')}) RETURNING *`,
          values
        );
        return result.rows[0];
      }
    );
  }

  /**
   * Update a record with outbox entry.
   */
  async update(model, id, data) {
    return this.writeWithOutbox(
      { model, action: 'update', recordId: id, payload: data, priority: this._isHighPriority(model) ? 'high' : 'normal' },
      async (client) => {
        const entries = Object.entries(data);
        const setClauses = entries.map(([key], i) => `${key} = $${i + 1}`);
        const values = entries.map(([, val]) => val);
        if (!entries.some(([key]) => key === 'updated_at')) setClauses.push('updated_at = NOW()');
        values.push(id);
        const result = await client.query(
          `UPDATE ${model} SET ${setClauses.join(', ')} WHERE id = $${values.length} RETURNING *`,
          values
        );
        return result.rows[0];
      }
    );
  }

  /**
   * Delete a record with outbox entry.
   */
  async delete(model, id) {
    return this.writeWithOutbox(
      { model, action: 'delete', recordId: id, payload: { id }, priority: 'normal' },
      async (client) => {
        const result = await client.query(`DELETE FROM ${model} WHERE id = $1 RETURNING id`, [id]);
        return result.rows[0];
      }
    );
  }

  /**
   * Delete every row matching a mapped predicate and enqueue one mirror
   * operation per row in the same transaction.
   */
  async deleteMany(model, where) {
    const pool = this._getWritePool();
    if (!pool) throw new Error('[DB:Controller] No healthy database available');

    const client = await pool.connect();
    const source = this._getWriteSource(pool);
    try {
      await client.query('BEGIN');
      if (!Array.isArray(where) || !where.length) throw new Error('[DB:Controller] Refusing unfiltered deleteMany');
      const values = [];
      const conditions = where.map(({ column, operator = 'eq', value }) => {
        if (operator === 'in' || operator === 'not_in') {
          if (!Array.isArray(value) || value.length === 0) return operator === 'in' ? 'FALSE' : 'TRUE';
          const placeholders = value.map(item => { values.push(item); return `$${values.length}`; });
          return `"${column}" ${operator === 'not_in' ? 'NOT IN' : 'IN'} (${placeholders.join(', ')})`;
        }
        if (value === null && (operator === 'eq' || operator === 'ne')) {
          return `"${column}" IS ${operator === 'ne' ? 'NOT ' : ''}NULL`;
        }
        const sqlOperator = ({ eq: '=', ne: '<>', lt: '<', lte: '<=', gt: '>', gte: '>=' })[operator];
        if (!sqlOperator) throw new Error(`[DB:Controller] Unsupported deleteMany operator: ${operator}`);
        values.push(value);
        return `"${column}" ${sqlOperator} $${values.length}`;
      });
      const result = await client.query(
        `DELETE FROM ${model} WHERE ${conditions.join(' AND ')} RETURNING *`,
        values
      );
      for (const row of result.rows) {
        await client.query(
          `INSERT INTO mirror_outbox (operation_id, model, action, record_id, payload, source, priority)
           VALUES ($1, $2, 'delete', $3, $4, $5, $6)`,
          [crypto.randomUUID(), model, String(row.id), JSON.stringify({ id: row.id }), source, this._isHighPriority(model) ? 'high' : 'normal']
        );
      }
      await client.query('COMMIT');
      this._breakerForPool(pool).recordSuccess();
      return result.rowCount;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      if (isDatabaseAvailabilityError(error)) this._breakerForPool(pool).recordFailure(error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Atomic consume: read + delete in one operation (for verification tokens, etc.)
   */
  async consumeOne(model, where) {
    const pool = this._getWritePool();
    if (!pool) throw new Error('[DB:Controller] No healthy database available');

    const client = await pool.connect();
    const operationId = crypto.randomUUID();
    const source = this._getWriteSource(pool);

    try {
      await client.query('BEGIN');

      // Find the record
      const conditions = Object.entries(where).map(([key], i) => `${key} = $${i + 1}`);
      const values = Object.values(where);
      const findResult = await client.query(
        `SELECT * FROM ${model} WHERE ${conditions.join(' AND ')} FOR UPDATE`,
        values
      );

      if (findResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }

      const record = findResult.rows[0];

      // Delete it
      await client.query(
        `DELETE FROM ${model} WHERE ${conditions.join(' AND ')}`,
        values
      );

      // Outbox entry
      await client.query(
        `INSERT INTO mirror_outbox (operation_id, model, action, record_id, payload, source, priority)
         VALUES ($1, $2, 'delete', $3, $4, $5, 'high')`,
        [operationId, model, String(record.id), JSON.stringify(record), source]
      );

      await client.query('COMMIT');
      this._breakerForPool(pool).recordSuccess();
      return record;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      if (isDatabaseAvailabilityError(error)) this._breakerForPool(pool).recordFailure(error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Atomic increment with outbox.
   */
  async incrementOne(model, where, increments) {
    const pool = this._getWritePool();
    if (!pool) throw new Error('[DB:Controller] No healthy database available');

    const client = await pool.connect();
    const operationId = crypto.randomUUID();
    const source = this._getWriteSource(pool);

    try {
      await client.query('BEGIN');

      const conditions = Object.entries(where).map(([key], i) => `${key} = $${i + 1}`);
      const values = Object.values(where);

      const setClauses = Object.entries(increments).map(([key, val], i) => {
        return `${key} = ${key} + $${values.length + i + 1}`;
      });
      const incrementValues = Object.values(increments);
      const allValues = [...values, ...incrementValues];

      const result = await client.query(
        `UPDATE ${model} SET ${setClauses.join(', ')}, updated_at = NOW()
         WHERE ${conditions.join(' AND ')} RETURNING *`,
        allValues
      );

      const record = result.rows[0];
      if (record) {
        await client.query(
          `INSERT INTO mirror_outbox (operation_id, model, action, record_id, payload, source, priority)
           VALUES ($1, $2, 'update', $3, $4, $5, 'high')`,
          [operationId, model, String(record.id), JSON.stringify(record), source]
        );
      }

      await client.query('COMMIT');
      this._breakerForPool(pool).recordSuccess();
      return record;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      if (isDatabaseAvailabilityError(error)) this._breakerForPool(pool).recordFailure(error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  _isHighPriority(model) {
    return ['users', 'sessions', 'accounts', 'verifications'].includes(model);
  }

  // ───── General Transaction (for migrating existing route code) ─────

  /**
   * Execute a function inside a transaction pinned to one database.
   *
   * Usage (drop-in for pool.connect + BEGIN/COMMIT):
   *
   *   const result = await controller.transaction(async (client) => {
   *     await client.query('UPDATE orders SET status = $1 WHERE id = $2', [status, id]);
   *     await client.query('INSERT INTO order_events ...');
   *     return { ok: true };
   *   });
   *
   * The client is pinned to ONE database for the entire transaction.
   * If the primary is down at transaction start, the transaction runs on the secondary.
   * If the database dies MID-transaction, the transaction ROLLBACKs and throws —
   * it does NOT switch to the other database.
   *
   * @param {function} fn - async (client) => result
   * @param {object} [opts] - optional outbox entries to include atomically
   * @param {string} [opts.model] - table name for outbox
   * @param {string} [opts.action] - 'create' | 'update' | 'delete'
   * @param {string} [opts.recordId] - affected record ID
   * @param {object} [opts.payload] - full row data for outbox
   * @param {string} [opts.priority] - 'high' | 'normal'
   * @returns {Promise<{result, operationId?}>}
   */
  async transaction(fn, opts = {}) {
    const pool = this._getWritePool();
    if (!pool) throw new Error('[DB:Controller] No healthy database available for transaction');

    const client = await pool.connect();
    const operationId = opts.model ? crypto.randomUUID() : null;
    const source = this._getWriteSource(pool);

    try {
      await client.query('BEGIN');

      const result = await fn(client);

      // Atomically insert outbox entry if opts provided
      if (opts.model && operationId) {
        await client.query(
          `INSERT INTO mirror_outbox (operation_id, model, action, record_id, payload, source, priority)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [operationId, opts.model, opts.action, String(opts.recordId), JSON.stringify(opts.payload || {}), source, opts.priority || 'normal']
        );
      }

      await client.query('COMMIT');
      this._breakerForPool(pool).recordSuccess();
      return { result, operationId };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      if (isDatabaseAvailabilityError(error)) this._breakerForPool(pool).recordFailure(error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  // ───── Status ─────

  async getStatus() {
    return {
      primary: this._primary,
      mode: this._mode,
      supabaseHealthy: this.supabaseBreaker.isHealthy,
      neonHealthy: this.neonBreaker.isHealthy,
      supabaseFailures: this.supabaseBreaker.failures,
      neonFailures: this.neonBreaker.failures,
      secondarySchemaReady: this.isSecondaryReady,
    };
  }

  async close() {
    this.stopHealthChecks();
    if (this.supabase) await this.supabase.end();
    if (this.neon) await this.neon.end();
    console.log('[DB:Controller] All pools closed');
  }
}

// Singleton
let _instance = null;
export function getDbController() {
  if (!_instance) _instance = new DatabaseController();
  return _instance;
}

// For backward compatibility: expose a pg Pool-like object
export function createPoolProxy() {
  const controller = getDbController();
  return {
    query: (sql, params) => controller.query(sql, params),
    connect: () => controller.connect(),
    end: () => controller.close(),
  };
}
