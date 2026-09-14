const fs = require('fs');
// Search all dist files for loginMethod
const dir = './node_modules/better-auth/dist/';
function searchDir(d) {
  const files = fs.readdirSync(d, { withFileTypes: true });
  for (const f of files) {
    if (f.isDirectory()) {
      searchDir(d + f.name + '/');
    } else if (f.name.endsWith('.mjs') || f.name.endsWith('.js')) {
      const content = fs.readFileSync(d + f.name, 'utf8');
      if (content.includes('loginMethod')) {
        // Find the context
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes('loginMethod')) {
            console.log(`${f.name}:${i+1}: ${lines[i].trim().substring(0, 200)}`);
          }
        }
      }
    }
  }
}
searchDir(dir);
process.exit(0);
