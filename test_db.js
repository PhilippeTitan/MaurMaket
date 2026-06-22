const { Client } = require('pg');
require('dotenv').config();

async function testConnection() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  console.log("Connecting to Neon PostgreSQL database...");
  try {
    await client.connect();
    console.log("SUCCESS! Connected to Neon Database.");
    
    const res = await client.query('SELECT NOW()');
    console.log("Current Time from DB:", res.rows[0].now);
    
    await client.end();
  } catch (err) {
    console.error("Connection failed:", err);
  }
}

testConnection();
