require('dotenv').config();
const { Pool } = require('pg');

async function auditDb(name, connStr) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${name.toUpperCase()} DATABASE SCHEMA`);
  console.log(`${'='.repeat(60)}`);

  const pool = new Pool({ connectionString: connStr, ssl: { rejectUnauthorized: false } });

  // Better Auth core tables
  const tables = ['users', 'sessions', 'accounts', 'verifications', 'two_factor'];

  for (const tbl of tables) {
    const r = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default,
             (SELECT COUNT(*) FROM information_schema.table_constraints tc
              JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
              WHERE tc.table_name = '${tbl}' AND tc.constraint_type = 'PRIMARY KEY' AND kcu.column_name = c.column_name) > 0 as is_pk
      FROM information_schema.columns c
      WHERE table_name = '${tbl}' AND table_schema = 'public'
      ORDER BY ordinal_position
    `);

    if (r.rows.length === 0) {
      console.log(`\n  ${tbl}: TABLE DOES NOT EXIST`);
      continue;
    }

    console.log(`\n  ${tbl} (${r.rows.length} columns):`);
    for (const row of r.rows) {
      const pk = row.is_pk ? ' [PK]' : '';
      const nullable = row.is_nullable === 'YES' ? ' NULL' : ' NOT NULL';
      const def = row.column_default ? ` DEFAULT ${row.column_default.substring(0, 60)}` : '';
      console.log(`    ${row.column_name.padEnd(35)} ${row.data_type.padEnd(20)}${nullable}${def}${pk}`);
    }

    // Check FK constraints
    const fks = await pool.query(`
      SELECT kcu.column_name, ccu.table_name as ref_table, ccu.column_name as ref_column
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
      WHERE tc.table_name = '${tbl}' AND tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
    `);
    if (fks.rows.length > 0) {
      for (const fk of fks.rows) {
        console.log(`    FK: ${fk.column_name} → ${fk.ref_table}(${fk.ref_column})`);
      }
    }

    // Check unique constraints
    const uniques = await pool.query(`
      SELECT kcu.column_name, tc.constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      WHERE tc.table_name = '${tbl}' AND tc.constraint_type = 'UNIQUE' AND tc.table_schema = 'public'
      ORDER BY kcu.ordinal_position
    `);
    // Group by constraint name
    const uniqueGroups = {};
    for (const u of uniques.rows) {
      if (!uniqueGroups[u.constraint_name]) uniqueGroups[u.constraint_name] = [];
      uniqueGroups[u.constraint_name].push(u.column_name);
    }
    for (const [name, cols] of Object.entries(uniqueGroups)) {
      console.log(`    UNIQUE: ${cols.join(', ')}`);
    }
  }

  await pool.end();
}

(async () => {
  await auditDb('Supabase', process.env.SUPABASE_DATABASE_URL);
  await auditDb('Neon', process.env.NEON_BACKUP_DATABASE_URL);
  process.exit(0);
})();
