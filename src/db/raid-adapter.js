/**
 * Better Auth Custom Adapter → Database Controller
 *
 * Routes all Better Auth operations (create, update, delete, findOne, findMany, etc.)
 * through the Database Controller, which handles circuit breaker, failover, and outbox.
 */

/**
 * Create a "pinned" adapter that uses a single client for all queries.
 * Used inside transactions to ensure all operations share one DB connection.
 */
function createPinnedAdapter(controller, client) {
  const pinnedQuery = (sql, params) => client.query(sql, params);

  return {
    async findOne({ model, where, select }) {
      const conditions = where.map((w, i) => {
        if (w.operator === 'in') return `${w.field} IN (${w.value.map((_, j) => `$${i + j + 1}`).join(',')})`;
        if (w.operator === 'gt') return `${w.field} > $${i + 1}`;
        if (w.operator === 'lt') return `${w.field} < $${i + 1}`;
        if (w.operator === 'gte') return `${w.field} >= $${i + 1}`;
        if (w.operator === 'lte') return `${w.field} <= $${i + 1}`;
        return `${w.field} = $${i + 1}`;
      });
      const values = where.flatMap(w => w.operator === 'in' ? w.value : w.value);
      const selectCols = select ? select.join(',') : '*';
      const result = await pinnedQuery(`SELECT ${selectCols} FROM ${model} WHERE ${conditions.join(' AND ')} LIMIT 1`, values);
      return result.rows[0] || null;
    },

    async findMany({ model, where, limit, offset, orderBy }) {
      let conditions = [], values = [];
      if (where?.length) {
        for (const w of where) {
          if (w.operator === 'in') { conditions.push(`${w.field} IN (${w.value.map((_, j) => `$${values.length + j + 1}`).join(',')})`); values.push(...w.value); }
          else if (w.operator === 'gt') { conditions.push(`${w.field} > $${values.length + 1}`); values.push(w.value); }
          else if (w.operator === 'lt') { conditions.push(`${w.field} < $${values.length + 1}`); values.push(w.value); }
          else { conditions.push(`${w.field} = $${values.length + 1}`); values.push(w.value); }
        }
      }
      const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const orderClause = orderBy ? `ORDER BY ${Object.entries(orderBy).map(([k, v]) => `${k} ${v === 'desc' ? 'DESC' : 'ASC'}`).join(', ')}` : '';
      const result = await pinnedQuery(`SELECT * FROM ${model} ${whereClause} ${orderClause} ${limit ? `LIMIT ${parseInt(limit)}` : ''} ${offset ? `OFFSET ${parseInt(offset)}` : ''}`, values);
      return result.rows;
    },

    async create({ model, data }) {
      const keys = Object.keys(data);
      const cols = keys.map((k, i) => `"${k}"`).join(', ');
      const vals = keys.map((_, i) => `$${i + 1}`);
      const result = await pinnedQuery(`INSERT INTO ${model} (${cols}) VALUES (${vals}) RETURNING *`, keys.map(k => data[k]));
      return result.rows[0];
    },

    async update({ model, where, update }) {
      const setClauses = Object.keys(update).map((k, i) => `"${k}" = $${i + 1}`);
      const setValues = Object.values(update);
      const whereClauses = where.map((w, i) => `"${w.field}" = $${setValues.length + i + 1}`);
      const whereValues = where.map(w => w.value);
      const result = await pinnedQuery(
        `UPDATE ${model} SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')} RETURNING *`,
        [...setValues, ...whereValues]
      );
      return result.rows[0];
    },

    async delete({ model, where }) {
      const whereClauses = where.map((w, i) => `"${w.field}" = $${i + 1}`);
      const whereValues = where.map(w => w.value);
      const result = await pinnedQuery(`DELETE FROM ${model} WHERE ${whereClauses.join(' AND ')} RETURNING *`, whereValues);
      return result.rows[0] || null;
    },

    async consumeOne({ model, where }) {
      const whereClauses = where.map((w, i) => `"${w.field}" = $${i + 1}`);
      const whereValues = where.map(w => w.value);
      const result = await pinnedQuery(
        `DELETE FROM ${model} WHERE ${whereClauses.join(' AND ')} RETURNING *`,
        whereValues
      );
      return result.rows[0] || null;
    },

    async incrementOne({ model, where, increments }) {
      const setClauses = Object.keys(increments).map((k, i) => `"${k}" = "${k}" + $${i + 1}`);
      const setValues = Object.values(increments);
      const whereClauses = where.map((w, i) => `"${w.field}" = $${setValues.length + i + 1}`);
      const whereValues = where.map(w => w.value);
      const result = await pinnedQuery(
        `UPDATE ${model} SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')} RETURNING *`,
        [...setValues, ...whereValues]
      );
      return result.rows[0] || null;
    },

    async runRaw(sql, params) {
      return pinnedQuery(sql, params);
    },

    transaction: undefined, // Prevent recursive patching
  };
}

export function createRaidAdapter(controller) {
  const adapter = {
    /**
     * Find one record by conditions.
     */
    async findOne({ model, where, select }) {
      const tableName = model;
      const conditions = where.map((w, i) => {
        if (w.operator === 'in') {
          return `${w.field} IN (${w.value.map((_, j) => `$${i + j + 1}`).join(',')})`;
        }
        if (w.operator === 'gt') return `${w.field} > $${i + 1}`;
        if (w.operator === 'lt') return `${w.field} < $${i + 1}`;
        if (w.operator === 'gte') return `${w.field} >= $${i + 1}`;
        if (w.operator === 'lte') return `${w.field} <= $${i + 1}`;
        return `${w.field} = $${i + 1}`;
      });

      const values = where.flatMap(w => {
        if (w.operator === 'in') return w.value;
        return w.value;
      });

      const selectCols = select ? select.join(',') : '*';
      const result = await controller.query(
        `SELECT ${selectCols} FROM ${tableName} WHERE ${conditions.join(' AND ')} LIMIT 1`,
        values
      );
      return result.rows[0] || null;
    },

    /**
     * Find many records.
     */
    async findMany({ model, where, limit, offset, orderBy }) {
      const tableName = model;
      let conditions = [];
      let values = [];

      if (where && where.length > 0) {
        where.forEach((w, i) => {
          if (w.operator === 'in') {
            conditions.push(`${w.field} IN (${w.value.map((_, j) => `$${values.length + j + 1}`).join(',')})`);
            values.push(...w.value);
          } else if (w.operator === 'gt') {
            conditions.push(`${w.field} > $${values.length + 1}`);
            values.push(w.value);
          } else if (w.operator === 'lt') {
            conditions.push(`${w.field} < $${values.length + 1}`);
            values.push(w.value);
          } else {
            conditions.push(`${w.field} = $${values.length + 1}`);
            values.push(w.value);
          }
        });
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const limitClause = limit ? `LIMIT ${parseInt(limit)}` : '';
      const offsetClause = offset ? `OFFSET ${parseInt(offset)}` : '';
      const orderClause = orderBy
        ? `ORDER BY ${Object.entries(orderBy).map(([k, v]) => `${k} ${v === 'desc' ? 'DESC' : 'ASC'}`).join(', ')}`
        : '';

      const result = await controller.query(
        `SELECT * FROM ${tableName} ${whereClause} ${orderClause} ${limitClause} ${offsetClause}`,
        values
      );
      return result.rows;
    },

    /**
     * Create a record. Writes to primary + outbox atomically.
     */
    async create({ model, data }) {
      const result = await controller.create(model, data);
      return result.result || result;
    },

    /**
     * Update a record. Writes to primary + outbox atomically.
     */
    async update({ model, where, update }) {
      // Find the record first to get its ID
      const record = await this.findOne({ model, where });
      if (!record) return null;

      const result = await controller.update(model, record.id, update);
      return result.result || result;
    },

    /**
     * Delete a record. Writes to primary + outbox atomically.
     */
    async delete({ model, where }) {
      const record = await this.findOne({ model, where });
      if (!record) return null;

      const result = await controller.delete(model, record.id);
      return result.result || result;
    },

    /**
     * Atomic read + delete (for verification tokens, etc.)
     */
    async consumeOne({ model, where }) {
      const whereObj = {};
      for (const w of where) {
        whereObj[w.field] = w.value;
      }
      return controller.consumeOne(model, whereObj);
    },

    /**
     * Atomic increment.
     */
    async incrementOne({ model, where, increments }) {
      const whereObj = {};
      for (const w of where) {
        whereObj[w.field] = w.value;
      }
      return controller.incrementOne(model, whereObj, increments);
    },

    /**
     * Execute raw SQL (passthrough).
     */
    async runRaw(sql, params) {
      return controller.query(sql, params);
    },

    /**
     * Transaction support — pins all operations to ONE database connection.
     * Better Auth calls this for atomic multi-step operations (e.g. create user + session).
     */
    async transaction(cb) {
      const pool = controller._getWritePool();
      if (!pool) throw new Error('[RAID] No healthy database for transaction');

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const pinned = createPinnedAdapter(controller, client);
        const result = await cb(pinned);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  };

  return adapter;
}
