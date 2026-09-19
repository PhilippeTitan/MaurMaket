#!/usr/bin/env node
/**
 * i18n Audit — cross-references t('key') usages in src/ against messages/*.json
 *
 * Usage: node scripts/i18n-audit.cjs [--orphans]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');

const en = require(path.join(ROOT, 'messages/en.json'));
const ht = require(path.join(ROOT, 'messages/ht.json'));
const fr = require(path.join(ROOT, 'messages/fr.json'));

// Recursively collect .ts/.tsx files
function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

const files = walk(SRC);
const keyRe = /\bt\(\s*['"]([a-z]+[a-zA-Z0-9_]*\.[a-zA-Z0-9_.]+)['"]/g;

const used = new Set();
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  let m;
  while ((m = keyRe.exec(text)) !== null) used.add(m[1]);
}

const usedList = [...used].sort();
const missing = (dict) => usedList.filter((k) => !(k in dict));

const missingEN = missing(en);
const missingHT = missing(ht);
const missingFR = missing(fr);

const usedSet = new Set(usedList);
const orphans = Object.keys(en).filter((k) => !usedSet.has(k));

console.log(`Files scanned: ${files.length}`);
console.log(`Used keys in code: ${usedList.length}`);
console.log(`en.json: ${Object.keys(en).length} | ht.json: ${Object.keys(ht).length} | fr.json: ${Object.keys(fr).length}`);
console.log('');
console.log(`CRITICAL — used in code but missing from en.json: ${missingEN.length}`);
missingEN.forEach((k) => console.log(`  - ${k}`));
console.log('');
console.log(`Missing from ht.json (falls back to en): ${missingHT.length}`);
missingHT.forEach((k) => console.log(`  - ${k}`));
console.log('');
console.log(`Missing from fr.json (falls back to en): ${missingFR.length}`);
missingFR.forEach((k) => console.log(`  - ${k}`));
console.log('');
console.log(`Orphan keys in en.json (defined but not referenced): ${orphans.length}`);
if (process.argv.includes('--orphans')) orphans.forEach((k) => console.log(`  - ${k}`));
