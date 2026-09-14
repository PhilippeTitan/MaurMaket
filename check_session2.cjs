const fs = require('fs');
const internal = fs.readFileSync('./node_modules/better-auth/dist/db/internal-adapter.mjs', 'utf8');

// Find createSession and its data
const idx = internal.indexOf('createSession');
if (idx > -1) {
  // Get a bigger chunk
  const chunk = internal.substring(idx, idx + 1500);
  // Look for object literals with field names
  const matches = chunk.match(/\b\w+:\s/g);
  if (matches) {
    console.log('Fields near createSession:');
    for (const m of matches) {
      console.log('  ', m.trim());
    }
  }
}

// Also check the default session schema
const schemaIdx = internal.indexOf('session:');
if (schemaIdx > -1) {
  console.log('\nschema context:');
  console.log(internal.substring(schemaIdx, schemaIdx + 800));
}

process.exit(0);
