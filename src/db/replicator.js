/**
 * Outbox Replicator Worker
 *
 * Reads pending operations from mirror_outbox on primary,
 * applies them to secondary with idempotency checks.
 */

import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const BATCH_SIZE = 50;
const REPLICATION_INTERVAL = parseInt(process.env.REPLICATION_INTERVAL || '5000', 10);

export class Replicator {
  constructor(controller) {
    this.controller = controller;
    this._timer = null;
    this._running = false;
    this._stats = { replicated: 0, failed: 0, skipped: 0 };
    this._retryCount = new Map(); // operation_id → retry count
    this._MAX_RETRIES = 3;
  }

  start() {
    if (this._timer) return;
    console.log(`[Replicator] Starting — interval: ${REPLICATION_INTERVAL}ms`);
    this._timer = setInterval(() => this._tick(), REPLICATION_INTERVAL);
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    console.log('[Replicator] Stopped');
  }

  get stats() { return { ...this._stats }; }

  async getStatus() {
    const primaryPool = this.controller.primaryPool;
    let pending = 0;
    let lastSyncedAt = null;
    if (primaryPool) {
      try {
        const { rows } = await primaryPool.query(
          `SELECT COUNT(*)::int AS pending FROM mirror_outbox WHERE synced = FALSE`
        );
        pending = rows[0]?.pending || 0;
        const { rows: last } = await primaryPool.query(
          `SELECT synced_at FROM mirror_outbox WHERE synced = TRUE ORDER BY synced_at DESC LIMIT 1`
        );
        lastSyncedAt = last[0]?.synced_at || null;
      } catch { /* ignore — primary may be down */ }
    }
    return {
      running: !!this._timer,
      pending,
      lastSyncedAt,
      stats: this.stats,
    };
  }

  async _tick() {
    if (this._running) return;
    this._running = true;

    try {
      await this._replicateBatch();
    } catch (error) {
      console.error('[Replicator] Batch error:', error.message);
    } finally {
      this._running = false;
    }
  }

  async _replicateBatch() {
    const primaryPool = this.controller.primaryPool;
    const secondaryPool = this.controller.secondaryPool;

    if (!primaryPool || !secondaryPool) return;

    // Skip replication if secondary is down (circuit breaker open)
    if (!this.controller.secondaryBreaker.isHealthy) {
      if (!this._secondaryLoggedDown) {
        console.warn(`[Replicator] Secondary (${this.controller.secondaryName}) is down — skipping replication`);
        this._secondaryLoggedDown = true;
      }
      return;
    }
    this._secondaryLoggedDown = false;

    // Ensure replication tables exist on secondary
    await this._ensureSchema(secondaryPool);

    // Read pending operations from primary
    const { rows: operations } = await primaryPool.query(
      `SELECT id, operation_id, model, action, record_id, payload, source, priority, created_at
       FROM mirror_outbox
       WHERE synced = FALSE
       ORDER BY
         CASE WHEN priority = 'high' THEN 0 ELSE 1 END,
         created_at ASC
       LIMIT $1`,
      [BATCH_SIZE]
    );

    if (operations.length === 0) return;

    console.log(`[Replicator] Processing ${operations.length} pending operations`);

    for (const op of operations) {
      try {
        await this._applyOperation(secondaryPool, op);

        // Mark as synced on primary
        await primaryPool.query(
          `UPDATE mirror_outbox SET synced = TRUE, synced_at = NOW() WHERE operation_id = $1`,
          [op.operation_id]
        );

        this._stats.replicated++;
        this._retryCount.delete(op.operation_id);
      } catch (error) {
        this._stats.failed++;
        const retries = (this._retryCount.get(op.operation_id) || 0) + 1;
        this._retryCount.set(op.operation_id, retries);

        // FK constraint = referenced data doesn't exist on secondary — skip permanently
        const isFK = error.message?.includes('foreign key constraint');
        if (isFK || retries >= this._MAX_RETRIES) {
          console.warn(`[Replicator] Dead-lettering ${op.operation_id} (${op.model}/${op.action}) after ${retries} retries: ${error.message}`);
          await primaryPool.query(
            `UPDATE mirror_outbox SET synced = TRUE, synced_at = NOW() WHERE operation_id = $1`,
            [op.operation_id]
          ).catch(() => {});
          this._retryCount.delete(op.operation_id);
        } else {
          console.error(`[Replicator] Failed operation ${op.operation_id} (attempt ${retries}):`, error.message);
        }
        break; // Stop batch on failure (will retry next tick)
      }
    }
  }

  async _ensureSchema(pool) {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS mirror_operations (
          operation_id UUID PRIMARY KEY,
          source TEXT NOT NULL,
          processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_mirror_operations_source
        ON mirror_operations(source, processed_at)
      `);
    } catch { /* table may already exist or no permission — continue */ }
  }

  async _applyOperation(targetPool, operation) {
    const { operation_id, model, action, record_id, payload } = operation;
    const client = await targetPool.connect();

    try {
      await client.query('BEGIN');

      // Idempotency check: has this operation already been processed?
      const existing = await client.query(
        `SELECT 1 FROM mirror_operations WHERE operation_id = $1`,
        [operation_id]
      );

      if (existing.rows.length > 0) {
        await client.query('ROLLBACK');
        this._stats.skipped++;
        return;
      }

      // Apply the operation
      switch (action) {
        case 'create': {
          const columns = Object.keys(payload);
          const values = Object.values(payload);
          const placeholders = columns.map((_, i) => `$${i + 1}`);

          await client.query(
            `INSERT INTO ${model} (${columns.join(',')})
             VALUES (${placeholders.join(',')})
             ON CONFLICT (id) DO UPDATE SET ${columns.filter(c => c !== 'id').map(c => `${c} = EXCLUDED.${c}`).join(', ')}`,
            values
          );
          break;
        }

        case 'update': {
          const entries = Object.entries(payload).filter(([k]) => k !== 'id');
          const setClauses = entries.map(([key], i) => `${key} = $${i + 1}`);
          const values = entries.map(([, val]) => val);
          values.push(record_id);

          await client.query(
            `UPDATE ${model} SET ${setClauses.join(', ')} WHERE id = $${values.length}`,
            values
          );
          break;
        }

        case 'delete': {
          await client.query(`DELETE FROM ${model} WHERE id = $1`, [record_id]);
          break;
        }

        default:
          throw new Error(`Unknown action: ${action}`);
      }

      // Record idempotency guard
      await client.query(
        `INSERT INTO mirror_operations (operation_id, source) VALUES ($1, $2)
         ON CONFLICT (operation_id) DO NOTHING`,
        [operation_id, this.controller.primary]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
