import { readFileSync, writeFileSync } from 'fs';
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const backendDeps = ['bcrypt', 'cors', 'dotenv', 'express', 'jsonwebtoken', 'multer', 'pg'];
const filtered = {
  name: pkg.name,
  type: 'module',
  dependencies: Object.fromEntries(
    Object.entries(pkg.dependencies).filter(([k]) => backendDeps.includes(k))
  )
};
writeFileSync('package.json', JSON.stringify(filtered, null, 2));
console.log('Backend-only package.json:', Object.keys(filtered.dependencies));
