const fs = require('fs');
const infra = fs.readFileSync('./node_modules/@better-auth/infra/index.mjs', 'utf8');

// Find session-related schema fields from dash plugin
const dashIdx = infra.indexOf('loginMethod: getLoginMethod');
if (dashIdx > -1) {
  console.log('dash plugin session fields context:');
  console.log(infra.substring(dashIdx - 200, dashIdx + 200));
}

// Search for session table schema additions
const sessionSchemaIdx = infra.indexOf('loginMethod:');
if (sessionSchemaIdx > -1) {
  // Find all field names near the schema definition
  const chunk = infra.substring(0, sessionSchemaIdx);
  const lastCreateTable = chunk.lastIndexOf('CREATE TABLE');
  if (lastCreateTable > -1) {
    console.log('\nCREATE TABLE context:');
    console.log(infra.substring(lastCreateTable, lastCreateTable + 500));
  }
}

process.exit(0);
