/**
 * Better Auth Custom Adapter → Database Controller
 *
 * Routes all Better Auth operations through the Database Controller.
 * Handles field mapping (Better Auth ↔ DB columns), model→table mapping,
 * JOIN queries (for includeAccounts), and reverse mapping on read.
 *
 * CRITICAL: The transaction() method buffers all writes and flushes them
 * to mirror_outbox after commit, ensuring Better Auth's transactional
 * operations (signup, session create) get replicated to Neon.
 */
import crypto from 'crypto';

const MODEL_TO_TABLE = {
  user: 'users',
  session: 'sessions',
  account: 'accounts',
  verification: 'verifications',
  twoFactor: 'two_factor',
};

const FIELD_MAP = {
  user: {
    name: 'full_name',
    emailVerified: 'email_verified',
    image: 'avatar_url',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    displayUsername: 'display_username',
    phoneNumber: 'phone_number',
    phoneNumberVerified: 'phone_number_verified',
    twoFactorEnabled: 'two_factor_enabled',
  },
  session: {
    userId: 'user_id',
    ipAddress: 'ip_address',
    userAgent: 'user_agent',
    expiresAt: 'expires_at',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    loginMethod: 'login_method',
  },
  account: {
    userId: 'user_id',
    accountId: 'account_id',
    providerId: 'provider_id',
    accessToken: 'access_token',
    refreshToken: 'refresh_token',
    idToken: 'id_token',
    accessTokenExpiresAt: 'access_token_expires_at',
    refreshTokenExpiresAt: 'refresh_token_expires_at',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  verification: {
    expiresAt: 'expires_at',
    createdAt: 'created_at',
  },
  twoFactor: {
    userId: 'user_id',
    backupCodes: 'backup_codes',
    failedVerificationCount: 'failed_verification_count',
    lockedUntil: 'locked_until',
  },
};

// Build reverse maps once at module load
const REVERSE_MAPS = {};
for (const [model, map] of Object.entries(FIELD_MAP)) {
  const rev = {};
  for (const [baName, dbCol] of Object.entries(map)) {
    rev[dbCol] = baName;
  }
  REVERSE_MAPS[model] = rev;
}

function toTable(model) { return MODEL_TO_TABLE[model] || model; }
function toColumn(model, field) { return (FIELD_MAP[model] || {})[field] || field; }
function toColumns(model, fields) { return fields.map(f => toColumn(model, f)); }

function mapData(model, data) {
  const map = FIELD_MAP[model] || {};
  const out = {};
  for (const [k, v] of Object.entries(data)) out[map[k] || k] = v;
  return out;
}

function fromDbRow(model, row) {
  if (!row) return row;
  const rev = REVERSE_MAPS[model] || {};
  const out = {};
  for (const [k, v] of Object.entries(row)) out[rev[k] || k] = v;
  return out;
}

function fromDbRows(model, rows) { return rows.map(r => fromDbRow(model, r)); }

// ─── WHERE clause builder ───────────────────────────────────────────
function buildWhere(model, where, startIdx = 1) {
  const conditions = [];
  const values = [];
  for (const w of where) {
    const col = toColumn(model, w.field);
    if (w.operator === 'in') {
      const placeholders = w.value.map((_, j) => `$${startIdx + values.length + j}`).join(',');
      conditions.push(`${col} IN (${placeholders})`);
      values.push(...w.value);
    } else {
      const op = w.operator || '=';
      const idx = startIdx + values.length;
      conditions.push(`${col} ${op} $${idx}`);
      values.push(w.value);
    }
  }
  return { conditions, values };
}

// ─── JOIN query support ─────────────────────────────────────────────
// Better Auth passes join: { account: true } to findUserByEmail({ includeAccounts: true })
// We handle this with two queries (main + joined) to avoid column ambiguity.
async function findOneWithJoin(queryFn, model, where, select, join) {
  const joinModels = [];
  if (join) {
    for (const [m, enabled] of Object.entries(join)) {
      if (enabled) joinModels.push(m);
    }
  }

  // Main query
  const tableName = toTable(model);
  const selectCols = select ? toColumns(model, select).join(',') : '*';
  const { conditions, values } = buildWhere(model, where);
  const result = await queryFn(`SELECT ${selectCols} FROM ${tableName} WHERE ${conditions.join(' AND ')} LIMIT 1`, values);
  const mainRow = fromDbRow(model, result.rows[0]);
  if (!mainRow || joinModels.length === 0) return { row: mainRow, joinData: {} };

  // For each join model, query separately to avoid column ambiguity
  const joinData = {};
  for (const jm of joinModels) {
    const joinTable = toTable(jm);
    const fkCol = toColumn(jm, 'userId');
    const joinResult = await queryFn(
      `SELECT * FROM ${joinTable} WHERE ${fkCol} = $1`,
      [mainRow.id]
    );
    joinData[jm] = fromDbRows(jm, joinResult.rows);
  }

  return { row: mainRow, joinData };
}

// ─── Shared query builders ──────────────────────────────────────────
function buildFindManyQuery(model, where, limit, offset, orderBy) {
  const tableName = toTable(model);
  const { conditions, values } = where?.length ? buildWhere(model, where) : { conditions: [], values: [] };
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const orderClause = orderBy ? `ORDER BY ${Object.entries(orderBy).map(([k, v]) => `${toColumn(model, k)} ${v === 'desc' ? 'DESC' : 'ASC'}`).join(', ')}` : '';
  const limitClause = limit ? `LIMIT ${parseInt(limit)}` : '';
  const offsetClause = offset ? `OFFSET ${parseInt(offset)}` : '';
  return {
    sql: `SELECT * FROM ${tableName} ${whereClause} ${orderClause} ${limitClause} ${offsetClause}`,
    values,
  };
}

function buildInsertQuery(model, data) {
  const mapped = mapData(model, data);
  if (!mapped.id) mapped.id = crypto.randomUUID();
  const tableName = toTable(model);
  const keys = Object.keys(mapped);
  return {
    sql: `INSERT INTO ${tableName} (${keys.map(k => `"${k}"`).join(',')}) VALUES (${keys.map((_, i) => `$${i + 1}`)}) RETURNING *`,
    values: keys.map(k => mapped[k]),
  };
}

function buildUpdateQuery(model, where, update) {
  const tableName = toTable(model);
  const mapped = mapData(model, update);
  const setClauses = Object.keys(mapped).map((k, i) => `"${k}" = $${i + 1}`);
  const setValues = Object.values(mapped);
  const { conditions, values: whereValues } = buildWhere(model, where, setValues.length + 1);
  return {
    sql: `UPDATE ${tableName} SET ${setClauses.join(', ')} WHERE ${conditions.join(' AND ')} RETURNING *`,
    values: [...setValues, ...whereValues],
  };
}

function buildDeleteQuery(model, where) {
  const tableName = toTable(model);
  const { conditions, values } = buildWhere(model, where);
  return {
    sql: `DELETE FROM ${tableName} WHERE ${conditions.join(' AND ')} RETURNING *`,
    values,
  };
}

// ─── Pinned adapter (single DB connection for transactions) ─────────
function createPinnedAdapter(queryFn) {
  return {
    async findOne({ model, where, select, join }) {
      const { row, joinData } = await findOneWithJoin(queryFn, model, where, select, join);
      if (row) Object.assign(row, joinData);
      return row;
    },
    async findMany({ model, where, limit, offset, orderBy }) {
      const { sql, values } = buildFindManyQuery(model, where, limit, offset, orderBy);
      return fromDbRows(model, (await queryFn(sql, values)).rows);
    },
    async create({ model, data }) {
      const { sql, values } = buildInsertQuery(model, data);
      return fromDbRow(model, (await queryFn(sql, values)).rows[0]);
    },
    async update({ model, where, update }) {
      const { sql, values } = buildUpdateQuery(model, where, update);
      return fromDbRow(model, (await queryFn(sql, values)).rows[0]);
    },
    async delete({ model, where }) {
      const { sql, values } = buildDeleteQuery(model, where);
      return fromDbRow(model, (await queryFn(sql, values)).rows[0]) || null;
    },
    async consumeOne({ model, where }) {
      const { sql, values } = buildDeleteQuery(model, where);
      return fromDbRow(model, (await queryFn(sql, values)).rows[0]) || null;
    },
    async incrementOne({ model, where, increments }) {
      const tableName = toTable(model);
      const mappedInc = {};
      for (const [k, v] of Object.entries(increments)) mappedInc[toColumn(model, k)] = v;
      const setClauses = Object.keys(mappedInc).map((k, i) => `"${k}" = "${k}" + $${i + 1}`);
      const setValues = Object.values(mappedInc);
      const { conditions, values: whereValues } = buildWhere(model, where, setValues.length + 1);
      const result = await queryFn(
        `UPDATE ${tableName} SET ${setClauses.join(', ')} WHERE ${conditions.join(' AND ')} RETURNING *`,
        [...setValues, ...whereValues]
      );
      return fromDbRow(model, result.rows[0]);
    },
    async runRaw(sql, params) { return queryFn(sql, params); },
    transaction: undefined,
  };
}

// ─── Main adapter (routes through DatabaseController) ───────────────
export function createRaidAdapter(controller) {
  const queryFn = (sql, params) => controller.query(sql, params);

  const adapter = {
    async findOne({ model, where, select, join }) {
      const { row, joinData } = await findOneWithJoin(queryFn, model, where, select, join);
      if (row) Object.assign(row, joinData);
      return row;
    },

    async findMany({ model, where, limit, offset, orderBy }) {
      const { sql, values } = buildFindManyQuery(model, where, limit, offset, orderBy);
      const result = await queryFn(sql, values);
      return fromDbRows(model, result.rows);
    },

    async create({ model, data }) {
      const result = await controller.create(toTable(model), mapData(model, { ...data, ...(data.id ? {} : { id: crypto.randomUUID() }) }));
      return fromDbRow(model, result.result || result);
    },

    async update({ model, where, update }) {
      const record = await this.findOne({ model, where });
      if (!record) return null;
      const mappedUpdate = mapData(model, update);
      const result = await controller.update(toTable(model), record.id, mappedUpdate);
      return fromDbRow(model, result.result || result);
    },

    async delete({ model, where }) {
      const record = await this.findOne({ model, where });
      if (!record) return null;
      const result = await controller.delete(toTable(model), record.id);
      return fromDbRow(model, result.result || result);
    },

    async consumeOne({ model, where }) {
      const whereObj = {};
      for (const w of where) whereObj[toColumn(model, w.field)] = w.value;
      return fromDbRow(model, await controller.consumeOne(toTable(model), whereObj));
    },

    async incrementOne({ model, where, increments }) {
      const whereObj = {};
      for (const w of where) whereObj[toColumn(model, w.field)] = w.value;
      const mappedInc = {};
      for (const [k, v] of Object.entries(increments)) mappedInc[toColumn(model, k)] = v;
      return fromDbRow(model, await controller.incrementOne(toTable(model), whereObj, mappedInc));
    },

    async runRaw(sql, params) { return controller.query(sql, params); },

    /**
     * Execute a Better Auth transaction with outbox replication.
     *
     * Better Auth wraps signup (user + account + session) in a transaction.
     * The pinned adapter writes directly to the pool client for atomicity,
     * which bypasses controller.create() and the outbox — breaking replication.
     *
     * FIX: Buffer all writes during the transaction, then flush them to
     * mirror_outbox after the main commit. This ensures every Better Auth
     * transactional operation gets replicated to Neon.
     */
    async transaction(cb) {
      const writePool = controller._getWritePool();
      if (!writePool) throw new Error('[RAID] No healthy database for transaction');
      const client = await writePool.connect();

      // Buffer to collect all write operations during the transaction
      const writeBuffer = [];

      try {
        await client.query('BEGIN');

        // Pinned adapter: reads go to the client, writes are buffered
        const pinned = {
          async findOne({ model, where, select, join }) {
            const { row, joinData } = await findOneWithJoin(
              (sql, params) => client.query(sql, params), model, where, select, join
            );
            if (row) Object.assign(row, joinData);
            return row;
          },
          async findMany({ model, where, limit, offset, orderBy }) {
            const { sql, values } = buildFindManyQuery(model, where, limit, offset, orderBy);
            return fromDbRows(model, (await client.query(sql, values)).rows);
          },
          async create({ model, data }) {
            const { sql, values } = buildInsertQuery(model, data);
            const result = await client.query(sql, values);
            const row = fromDbRow(model, result.rows[0]);
            // Buffer for outbox flush after commit
            writeBuffer.push({ model: toTable(model), action: 'create', recordId: row.id, payload: mapData(model, { ...data, ...(data.id ? {} : { id: row.id }) }) });
            return row;
          },
          async update({ model, where, update }) {
            const { sql, values } = buildUpdateQuery(model, where, update);
            const result = await client.query(sql, values);
            const row = fromDbRow(model, result.rows[0]);
            if (row) writeBuffer.push({ model: toTable(model), action: 'update', recordId: row.id, payload: mapData(model, update) });
            return row;
          },
          async delete({ model, where }) {
            const { sql, values } = buildDeleteQuery(model, where);
            const result = await client.query(sql, values);
            const row = fromDbRow(model, result.rows[0]);
            if (row) writeBuffer.push({ model: toTable(model), action: 'delete', recordId: row.id, payload: { id: row.id } });
            return row || null;
          },
          async consumeOne({ model, where }) {
            const { sql, values } = buildDeleteQuery(model, where);
            const result = await client.query(sql, values);
            const row = fromDbRow(model, result.rows[0]);
            if (row) writeBuffer.push({ model: toTable(model), action: 'delete', recordId: row.id, payload: { id: row.id } });
            return row || null;
          },
          async incrementOne({ model, where, increments }) {
            const tableName = toTable(model);
            const mappedInc = {};
            for (const [k, v] of Object.entries(increments)) mappedInc[toColumn(model, k)] = v;
            const setClauses = Object.keys(mappedInc).map((k, i) => `"${k}" = "${k}" + $${i + 1}`);
            const setValues = Object.values(mappedInc);
            const { conditions, values: whereValues } = buildWhere(model, where, setValues.length + 1);
            const result = await client.query(
              `UPDATE ${tableName} SET ${setClauses.join(', ')} WHERE ${conditions.join(' AND ')} RETURNING *`,
              [...setValues, ...whereValues]
            );
            const row = fromDbRow(model, result.rows[0]);
            if (row) writeBuffer.push({ model: tableName, action: 'update', recordId: row.id, payload: mapData(model, increments) });
            return row;
          },
          async runRaw(sql, params) { return client.query(sql, params); },
          transaction: undefined,
        };

        // Execute the Better Auth transaction callback
        const result = await cb(pinned);

        // Commit the main transaction (data is now on primary)
        await client.query('COMMIT');

        // Flush buffered writes to outbox (separate transaction)
        if (writeBuffer.length > 0) {
          await this._flushOutbox(writeBuffer);
        }

        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },

    /**
     * Flush buffered write operations to mirror_outbox.
     * Called after the main transaction commits successfully.
     * Uses a separate transaction — if this fails, data is still on primary
     * but won't replicate until a reconciliation pass catches it.
     */
    async _flushOutbox(buffer) {
      const writePool = controller._getWritePool();
      if (!writePool) {
        console.warn(`[RAID] No healthy DB for outbox flush — ${buffer.length} operations won't replicate`);
        return;
      }
      const client = await writePool.connect();
      try {
        await client.query('BEGIN');
        for (const op of buffer) {
          const operationId = crypto.randomUUID();
          await client.query(
            `INSERT INTO mirror_outbox (operation_id, model, action, record_id, payload, source, priority)
             VALUES ($1, $2, $3, $4, $5, 'supabase', $6)`,
            [operationId, op.model, op.action, String(op.recordId), JSON.stringify(op.payload),
             ['users', 'sessions', 'accounts', 'verifications'].includes(op.model) ? 'high' : 'normal']
          );
        }
        await client.query('COMMIT');
        console.log(`[RAID] Flushed ${buffer.length} outbox entries (transaction writes now replicable)`);
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error(`[RAID] Outbox flush failed — ${buffer.length} operations won't replicate:`, error.message);
      } finally {
        client.release();
      }
    },
  };

  return adapter;
}
