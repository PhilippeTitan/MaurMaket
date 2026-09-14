const fs = require('fs');
const internal = fs.readFileSync('./node_modules/better-auth/dist/db/internal-adapter.mjs', 'utf8');
// Find session-related field references
const lines = internal.split('\n');
for (const line of lines) {
  if (line.includes('loginMethod') || line.includes('login_method')) {
    console.log('MATCH:', line.trim().substring(0, 200));
  }
}
// Find the createSession function
const sessionStart = internal.indexOf('createSession');
if (sessionStart > -1) {
  console.log('\ncreateSession context:');
  console.log(internal.substring(sessionStart, sessionStart + 500));
}
process.exit(0);
