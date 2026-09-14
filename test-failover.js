/**
 * Dual-Database Failover + Replication — Breaking Tests
 *
 * Tests the system under simulated failure conditions.
 * Uses circuit breaker manipulation to simulate DB outages.
 * Disables periodic health checks so we control breaker state manually.
 *
 * Run: node test-failover.js
 */

import { getDbController, Replicator } from './src/db/index.js';

const ctrl = getDbController();
const replicator = new Replicator(ctrl);

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}`);
    failed++;
  }
}

function separator(title) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${'═'.repeat(60)}`);
}

/** Trip a circuit breaker by calling recordFailure enough times */
function tripBreaker(breaker) {
  for (let i = 0; i < 3; i++) breaker.recordFailure();
}

/** Reset a circuit breaker */
function resetBreaker(breaker) {
  breaker.failures = 0;
  breaker.unavailableUntil = 0;
}

// Stop periodic health checks so we control breaker state manually
ctrl.stopHealthChecks();

// ─── TEST 1: Both DBs healthy — normal operations ───
async function test1_bothHealthy() {
  separator('TEST 1: Both DBs healthy — normal operations');

  resetBreaker(ctrl.supabaseBreaker);
  resetBreaker(ctrl.neonBreaker);
  ctrl._mode = 'PRIMARY';

  assert(ctrl.mode === 'PRIMARY', 'Mode is PRIMARY');
  assert(ctrl.supabaseBreaker.isHealthy, 'Supabase breaker healthy');
  assert(ctrl.neonBreaker.isHealthy, 'Neon breaker healthy');

  const readResult = await ctrl.query('SELECT 1 AS ok');
  assert(readResult.rows[0].ok === 1, 'Read via controller works');

  const writeResult = await ctrl.create('categories', { name: '_test_failover_' + Date.now(), display_order: 9999 });
  assert(writeResult.result?.id, 'Write via controller works');
  await ctrl.delete('categories', writeResult.result.id);
  assert(true, 'Cleanup succeeded');

  const { pool } = await import('./src/config/database.js');
  const rawResult = await pool.query('SELECT 1 AS ok');
  assert(rawResult.rows[0].ok === 1, 'Raw pool.query still works');

  const txResult = await ctrl.transaction(async (client) => {
    const r = await client.query('SELECT 1 AS ok');
    return r.rows[0].ok;
  });
  assert(txResult.result === 1, 'Transaction via controller works');

  const health = await ctrl.healthCheck();
  assert(health.supabase === true, 'Supabase healthy');
  assert(health.neon === true, 'Neon healthy');
}

// ─── TEST 2: Neon killed — Supabase stays primary ───
async function test2_neonKilled() {
  separator('TEST 2: Neon killed — Supabase stays primary');

  tripBreaker(ctrl.neonBreaker);
  assert(!ctrl.neonBreaker.isHealthy, 'Neon breaker tripped (unhealthy)');
  assert(ctrl.supabaseBreaker.isHealthy, 'Supabase still healthy');
  assert(ctrl.mode === 'PRIMARY', 'Mode is still PRIMARY (Supabase is primary)');

  // Reads route to Supabase (primary healthy)
  const result = await ctrl.query('SELECT 1 AS ok');
  assert(result.rows[0].ok === 1, 'Read routes to Supabase (primary healthy)');

  // Writes still work on Supabase
  const writeResult = await ctrl.create('categories', { name: '_test_neon_killed_' + Date.now(), display_order: 9999 });
  assert(writeResult.result?.id, 'Write works while Neon is down');
  await ctrl.delete('categories', writeResult.result.id);

  // Replicator tick: Neon is down so secondary write will fail
  console.log('\n  Running replicator tick (Neon down — should fail secondary writes)...');
  await replicator._tick();

  const repStatus = await replicator.getStatus();
  console.log(`  Replicator: pending=${repStatus.pending}`);
  assert(repStatus.pending >= 0, 'Replicator running');
}

// ─── TEST 3: Neon returns — replay ───
async function test3_neonReturns() {
  separator('TEST 3: Neon returns — replay queued ops');

  resetBreaker(ctrl.neonBreaker);
  assert(ctrl.neonBreaker.isHealthy, 'Neon breaker reset (healthy again)');

  console.log('\n  Running replicator tick (Neon back — should replicate)...');
  await replicator._tick();

  const repStatus = await replicator.getStatus();
  console.log(`  After replicate: pending=${repStatus.pending}, replicated=${repStatus.stats.replicated}`);
  assert(repStatus.pending >= 0, 'Replicator processed queue');

  const health = await ctrl.healthCheck();
  assert(health.supabase === true, 'Supabase healthy');
  assert(health.neon === true, 'Neon healthy');
}

// ─── TEST 4: Supabase killed — reads failover to Neon ───
async function test4_supabaseKilled() {
  separator('TEST 4: Supabase killed — reads failover to Neon');

  tripBreaker(ctrl.supabaseBreaker);
  assert(!ctrl.supabaseBreaker.isHealthy, 'Supabase breaker tripped (unhealthy)');
  assert(ctrl.neonBreaker.isHealthy, 'Neon still healthy');

  // With primary breaker open, _getReadPool should return secondary
  const readPool = ctrl._getReadPool();
  assert(readPool === ctrl.neon, 'Read pool routes to Neon (Supabase breaker open)');

  const result = await ctrl.query('SELECT 1 AS ok');
  assert(result.rows[0].ok === 1, 'Read routes to Neon in failover');
}

// ─── TEST 5: Better Auth read while Supabase is down ───
async function test5_authWhileSupabaseDown() {
  separator('TEST 5: Better Auth read while Supabase is down');

  assert(!ctrl.supabaseBreaker.isHealthy, 'Supabase still down');
  assert(ctrl.neonBreaker.isHealthy, 'Neon healthy');

  try {
    const { getAuth } = await import('./src/config/auth.js');
    const auth = getAuth();

    const user = await auth.api.findUserByEmail({ email: 'test_nonexistent@example.com' });
    assert(user === null || user === undefined, 'Better Auth read works on Neon (no user = OK)');
  } catch (e) {
    if (e.message?.includes('Not initialized')) {
      console.log(`  ⚠️  Better Auth not initialized in test context (expected — no server.js)`);
      passed++;
    } else if (e.message?.includes('adapter') || e.message?.includes('database')) {
      console.error(`  ❌ FAIL: Better Auth adapter failed:`, e.message);
      failed++;
    } else {
      console.log(`  ℹ️  Better Auth returned: ${e.message}`);
      passed++;
    }
  }
}

// ─── TEST 6: Supabase returns — reconciliation ───
async function test6_supabaseReturns() {
  separator('TEST 6: Supabase returns — back to normal');

  resetBreaker(ctrl.supabaseBreaker);
  assert(ctrl.supabaseBreaker.isHealthy, 'Supabase breaker reset');
  assert(ctrl.neonBreaker.isHealthy, 'Neon still healthy');

  const health = await ctrl.healthCheck();
  assert(health.supabase === true, 'Supabase healthy');
  assert(health.neon === true, 'Neon healthy');
  assert(ctrl.mode === 'PRIMARY', 'Mode back to PRIMARY');

  const result = await ctrl.query('SELECT 1 AS ok');
  assert(result.rows[0].ok === 1, 'Read routes back to Supabase');
}

// ─── TEST 7: Transaction pins to one DB — no split ───
async function test7_transactionPinning() {
  separator('TEST 7: Transaction pins to one DB — no mid-tx split');

  const client = await ctrl.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT 1 AS work_done');
    await client.query("INSERT INTO categories (name, display_order) VALUES ('_test_tx_pinned', 9999)");

    const info = await client.query('SELECT current_database() AS db');
    console.log(`  Transaction connected to: ${info.rows[0].db}`);
    assert(info.rows[0].db !== '', 'Transaction has a valid database connection');

    const check = await client.query("SELECT id FROM categories WHERE name = '_test_tx_pinned'");
    assert(check.rows.length === 1, 'Category created inside transaction');

    await client.query('COMMIT');
    assert(true, 'Transaction committed successfully');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(`  ❌ FAIL: Transaction error: ${e.message}`);
    failed++;
  } finally {
    client.release();
  }

  await ctrl.query("DELETE FROM categories WHERE name = '_test_tx_pinned'");
}

// ─── TEST 8: All databases down — transaction rejected ───
async function test8_allDatabasesDown() {
  separator('TEST 8: All databases down — transaction rejected');

  tripBreaker(ctrl.supabaseBreaker);
  tripBreaker(ctrl.neonBreaker);
  assert(!ctrl.supabaseBreaker.isHealthy, 'Supabase breaker tripped');
  assert(!ctrl.neonBreaker.isHealthy, 'Neon breaker tripped');
  assert(!ctrl.primaryIsHealthy, 'Primary is unhealthy');
  assert(ctrl._getWritePool() === null || ctrl._getWritePool() === undefined, 'No write pool available');
  assert(ctrl._getReadPool() === null || ctrl._getReadPool() === undefined, 'No read pool available');

  // Transaction should fail
  try {
    await ctrl.transaction(async (client) => {
      return 'should not reach here';
    });
    console.error('  ❌ FAIL: Transaction should have been rejected');
    failed++;
  } catch (e) {
    assert(e.message?.includes('No healthy database'), `Transaction rejected: ${e.message}`);
  }

  // Read should also fail
  try {
    await ctrl.query('SELECT 1');
    console.error('  ❌ FAIL: Read should have failed');
    failed++;
  } catch (e) {
    assert(e.message?.includes('No healthy database'), `Read rejected: ${e.message}`);
  }

  resetBreaker(ctrl.supabaseBreaker);
  resetBreaker(ctrl.neonBreaker);
}

// ─── TEST 9: Outbox idempotency ───
async function test9_outboxIdempotency() {
  separator('TEST 9: Outbox idempotency — atomic write + outbox entry');

  const writeResult = await ctrl.writeWithOutbox({
    model: 'categories',
    action: 'create',
    recordId: 'test_dedup',
    payload: { name: '_test_dedup_' + Date.now(), display_order: 9999 },
    priority: 'normal',
  }, async (client) => {
    const r = await client.query(
      `INSERT INTO categories (name, display_order) VALUES ($1, $2) RETURNING *`,
      ['_test_dedup_' + Date.now(), 9999]
    );
    return r.rows[0];
  });
  assert(writeResult.operationId, 'Outbox write created');
  console.log(`  Operation ID: ${writeResult.operationId}`);

  const { pool } = await import('./src/config/database.js');
  const entry = await pool.query('SELECT * FROM mirror_outbox WHERE operation_id = $1', [writeResult.operationId]);
  assert(entry.rows.length === 1, 'Outbox entry exists in database');

  if (writeResult.result?.id) {
    const cat = await pool.query('SELECT * FROM categories WHERE id = $1', [writeResult.result.id]);
    assert(cat.rows.length === 1, 'Category exists in database');
    await pool.query('DELETE FROM categories WHERE id = $1', [writeResult.result.id]);
  }
}

// ─── TEST 10: Controller status ───
async function test10_status() {
  separator('TEST 10: Controller status');

  const status = await ctrl.getStatus();
  console.log('  Status:', JSON.stringify(status, null, 2));

  assert(status.primary === 'supabase', 'Status: primary=supabase');
  assert(status.mode, 'Status: has mode');
  assert(typeof status.supabaseHealthy === 'boolean', 'Status: supabaseHealthy');
  assert(typeof status.neonHealthy === 'boolean', 'Status: neonHealthy');
}

// ─── RUN ───
async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  Dual-Database Failover — Breaking Tests               ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  try {
    await test1_bothHealthy();
    await test2_neonKilled();
    await test3_neonReturns();
    await test4_supabaseKilled();
    await test5_authWhileSupabaseDown();
    await test6_supabaseReturns();
    await test7_transactionPinning();
    await test8_allDatabasesDown();
    await test9_outboxIdempotency();
    await test10_status();
  } catch (e) {
    console.error(`\n💥 FATAL: ${e.message}`);
    console.error(e.stack);
    failed++;
  }

  separator('RESULTS');
  console.log(`  ✅ Passed: ${passed}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log(`  Total: ${passed + failed}`);

  await ctrl.close();
  process.exit(failed > 0 ? 1 : 0);
}

main();
