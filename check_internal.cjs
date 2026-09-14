const fs = require('fs');
const internal = fs.readFileSync('./node_modules/better-auth/dist/db/internal-adapter.mjs', 'utf8');

// Find findUserByEmail
const idx = internal.indexOf('findUserByEmail');
if (idx > -1) {
  console.log('findUserByEmail:');
  console.log(internal.substring(idx, idx + 600));
}

process.exit(0);
