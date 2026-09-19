#!/usr/bin/env node
/**
 * Rank source files by count of likely-hardcoded UI strings.
 * Heuristic: capitalized multi-word strings not passed through t(...).
 * Usage: node scripts/i18n-rank.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIRS = ['src/screens', 'src/components'];

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/\.(tsx|ts)$/.test(e.name)) yield p;
  }
}

const results = [];
for (const dir of DIRS) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) continue;
  for (const file of walk(abs)) {
    const src = fs.readFileSync(file, 'utf8');
    const rel = path.relative(ROOT, file);
    // strings with 2+ words, starting uppercase — typical UI copy
    const matches = src.match(/"[A-Z][a-zA-Z'&!?.,()\- ]{6,}"|'[A-Z][a-zA-Z&!?.,()\- ]{6,}'/g) || [];
    // filter obvious non-UI
    const ui = matches.filter(s => !/^(use client|require|data-|aria-)/i.test(s));
    // count t() usage
    const tCount = (src.match(/\bt\('/g) || []).length;
    if (ui.length > 0) results.push({ file: rel, hardcoded: ui.length, tCalls: tCount });
  }
}

results.sort((a, b) => b.hardcoded - a.hardcoded);
console.log('hardcoded  t()  file');
for (const r of results.slice(0, 25)) {
  console.log(String(r.hardcoded).padStart(9), String(r.tCalls).padStart(4), r.file);
}
const total = results.reduce((s, r) => s + r.hardcoded, 0);
console.log(`\n${results.length} files with suspected hardcoded strings, ~${total} total`);
