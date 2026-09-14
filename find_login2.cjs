const fs = require('fs');
// Search all packages for loginMethod
const pkgs = ['better-auth', '@better-auth/core', '@better-auth/infra'];
for (const pkg of pkgs) {
  const dir = `./node_modules/${pkg}/dist/`;
  if (!fs.existsSync(dir)) { console.log(`${pkg}: no dist`); continue; }
  function searchDir(d) {
    const files = fs.readdirSync(d, { withFileTypes: true });
    for (const f of files) {
      if (f.isDirectory()) searchDir(d + f.name + '/');
      else if (f.name.endsWith('.mjs') || f.name.endsWith('.js')) {
        const content = fs.readFileSync(d + f.name, 'utf8');
        if (content.includes('loginMethod')) {
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('loginMethod')) {
              console.log(`${pkg}/${f.name}:${i+1}: ${lines[i].trim().substring(0, 200)}`);
            }
          }
        }
      }
    }
  }
  searchDir(dir);
}
process.exit(0);
