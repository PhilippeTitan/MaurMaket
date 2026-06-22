const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runSchema() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  console.log("Reading schema.sql file...");
  const sqlPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log("Connecting to Neon PostgreSQL database...");
  try {
    await client.connect();
    console.log("Connected. Running schema queries...");
    
    await client.query(sql);
    console.log("SUCCESS! Database schema initialized successfully.");
    
    await client.end();
  } catch (err) {
    console.error("Failed to run schema queries:", err);
    process.exit(1);
  }
}

runSchema();
