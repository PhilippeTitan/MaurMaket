import { readFileSync, writeFileSync } from 'fs';
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const backendDeps = ['bcrypt', 'cors', 'dotenv', 'express', 'jsonwebtoken', 'multer', 'pg', 'node-cron', 'nodemailer', 'google-auth-library', 'googleapis', 'expo-server-sdk', 'express-rate-limit', 'morgan'];
const filtered = {
  name: pkg.name,
  version: pkg.version,
  type: 'module',
  scripts: {
    start: 'node server.js'
  },
  dependencies: Object.fromEntries(
    Object.entries(pkg.dependencies).filter(([k]) => backendDeps.includes(k))
  )
};
writeFileSync('package.json', JSON.stringify(filtered, null, 2));
console.log('✅ Backend-only package.json written:', Object.keys(filtered.dependencies));
