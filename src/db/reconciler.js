/**
 * Reconciler — repairs divergence when a database comes back online
 *
 * When the primary recovers from FAILOVER:
 * 1. Compare operation logs by operation_id
 * 2. Find missing operations on the recovered database
 * 3. Replay them
 * 4. Verify consistency (row counts, versions)
 */

import dotenv from 'dotenv';

dotenv.config();

export class Reconciler {
  constructor(controller) {
    this.controller = controller;
    this._reconciling = false;
  }

  get isReconciling() { return this._reconciling; }

  /**
   * Full reconciliation cycle.
   * Called when controller enters RECOVERING state.
   */
  async reconcile() {
    if (this._reconciling) {
      console.log('[Reconciler] Already reconciling — skipping');
      return;
    }

    this._reconciling = true;
    console.log('[Reconciler] Starting reconciliation...');

    try {
      const { primary, secondaryPool, primaryPool } = this.controller;
      if (!primaryPool || !secondaryPool) {
        console.log('[Reconciler] Missing pool — aborting');
        return;
      }

      // 1. Find operations on secondary that primary doesn't have
      const missingOnPrimary = await this._findMissingOperations(secondaryPool, primaryPool);
      console.log(`[Reconciler] ${missingOnPrimary.length} operations missing on primary`);

      // 2. Find operations on primary that secondary doesn't have
      const missingOnSecondary = await this._findMissingOperations(primaryPool, secondaryPool);
      console.log(`[Reconciler] ${missingOnSecondary.length} operations missing on secondary`);

      // 3. Replay missing operations
      for (const op of missingOnSecondary) {
        await this._replayOperation(secondaryPool, op);
        console.log(`[Reconciler] Replicated ${op.operation_id} → ${this.controller.secondaryName}`);
      }

      for (const op of missingOnPrimary) {
        await this._replayOperation(primaryPool, op);
        console.log(`[Reconciler] Replicated ${op.operation_id} → ${primary}`);
      }

      // 4. Verify counts
      const primaryCount = await this._getTableCount(primaryPool, 'users');
      const secondaryCount = await this._getTableCount(secondaryPool, 'users');
      console.log(`[Reconciler] User counts — primary: ${primaryCount}, secondary: ${secondaryCount}`);

      if (primaryCount !== secondaryCount) {
        console.warn('[Reconciler] WARNING: User count mismatch after reconciliation');
      }

      // 5. Transition back to PRIMARY
      this.controller._mode = 'PRIMARY';
      console.log('[Reconciler] Reconciliation complete — mode: PRIMARY');

    } catch (error) {
      console.error('[Reconciler] Reconciliation failed:', error.message);
    } finally {
      this._reconciling = false;
    }
  }

  async _findMissingOperations(sourcePool, targetPool) {
    const { rows: allOps } = await sourcePool.query(
      `SELECT operation_id, model, action, record_id, payload, source
       FROM mirror_outbox
       WHERE synced = TRUE
       ORDER BY created_at ASC`
    );

    const missing = [];
    for (const op of allOps) {
      const exists = await targetPool.query(
        `SELECT 1 FROM mirror_operations WHERE operation_id = $1`,
        [op.operation_id]
      );
      if (exists.rows.length === 0) {
        missing.push(op);
      }
    }

    return missing;
  }

  async _replayOperation(targetPool, operation) {
    const client = await targetPool.connect();
    const { operation_id, model, action, record_id, payload } = operation;

    try {
      await client.query('BEGIN');

      const existing = await client.query(
        `SELECT 1 FROM mirror_operations WHERE operation_id = $1`,
        [operation_id]
      );
      if (existing.rows.length > 0) {
        await client.query('ROLLBACK');
        return;
      }

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
      }

      await client.query(
        `INSERT INTO mirror_operations (operation_id, source) VALUES ($1, 'reconcile')
         ON CONFLICT (operation_id) DO NOTHING`,
        [operation_id]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async _getTableCount(pool, table) {
    const { rows } = await pool.query(`SELECT COUNT(*)::int as count FROM ${table}`);
    return rows[0]?.count || 0;
  }
}
