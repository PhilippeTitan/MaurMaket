const fs = require('fs');
const path = './node_modules/better-auth/dist/api/routes/sign-in.mjs';
const content = fs.readFileSync(path, 'utf8');

// Find the email sign-in handler
const idx = content.indexOf('User not found');
if (idx > -1) {
  console.log('Context around "User not found":');
  console.log(content.substring(Math.max(0, idx - 500), idx + 200));
}

process.exit(0);
