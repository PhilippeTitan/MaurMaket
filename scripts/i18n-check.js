#!/usr/bin/env node
/**
 * i18n Sync Check — ensures all 3 languages have identical keys
 * Also verifies t() calls in source match defined keys
 * Run: node scripts/i18n-check.js
 * Exit code 0 = clean, 1 = mismatches found
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

const I18N_FILE = join(process.cwd(), 'src', 'i18n.ts');
const SRC_DIR = join(process.cwd(), 'src');
const VALID_EXTS = new Set(['.ts', '.tsx']);

// --- Parse keys from i18n.ts ---
function parseKeys(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const langBlocks = {};

  // Find each language section by looking for "  en: {" etc.
  const langs = ['en', 'ht', 'fr'];
  for (const lang of langs) {
    const startRegex = new RegExp(`^\\s+${lang}:\\s*\\{\\s*$`, 'm');
    const startMatch = startRegex.exec(content);
    if (!startMatch) continue;

    const startIdx = startMatch.index;
    // Find the matching closing "  };" by counting braces
    let depth = 0;
    let endIdx = startIdx;
    for (let i = startIdx; i < content.length; i++) {
      if (content[i] === '{') depth++;
      if (content[i] === '}') {
        depth--;
        if (depth === 0) { endIdx = i; break; }
      }
    }

    const block = content.slice(startIdx, endIdx);
    const keys = [];
    const keyPattern = /'([a-z][a-zA-Z0-9_.]+)':\s*['"]/g;
    let km;
    while ((km = keyPattern.exec(block)) !== null) {
      keys.push(km[1]);
    }
    langBlocks[lang] = keys;
  }
  return langBlocks;
}

// --- Find all t() calls in source ---
function findTranslationCalls(dir) {
  const calls = new Set();
  let entries;
  try {
    entries = readdirSync(dir);
  } catch { return calls; }

  for (const entry of entries) {
    const full = join(dir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch { continue; }

    if (stat.isDirectory()) {
      // Skip node_modules, .git, etc.
      if (entry === 'node_modules' || entry === '.git' || entry === 'assets') continue;
      const subCalls = findTranslationCalls(full);
      for (const c of subCalls) calls.add(c);
    } else if (VALID_EXTS.has(extname(entry).toLowerCase())) {
      try {
        const content = readFileSync(full, 'utf-8');
        const pattern = /\bt\(\s*['"]([a-zA-Z0-9_.]+)['"]\s*(?:,\s*\{[^}]*\})?\)/g;
        let m;
        while ((m = pattern.exec(content)) !== null) {
          calls.add(m[1]);
        }
      } catch { /* skip unreadable files */ }
    }
  }
  return calls;
}

// --- Main ---
let exitCode = 0;

console.log('Checking i18n sync...\n');

// 1. Parse translation keys
const langKeys = parseKeys(I18N_FILE);
const languages = Object.keys(langKeys);

if (languages.length < 3) {
  console.error(`FAIL: Expected 3 languages, found ${languages.length}: [${languages.join(', ')}]`);
  exitCode = 1;
} else {
  console.log(`Found ${langKeys.en?.length || 0} EN, ${langKeys.ht?.length || 0} HT, ${langKeys.fr?.length || 0} FR keys`);
}

// 2. Check for missing keys between languages
const enSet = new Set(langKeys.en || []);
const htSet = new Set(langKeys.ht || []);
const frSet = new Set(langKeys.fr || []);

const missingInHt = [...enSet].filter(k => !htSet.has(k));
const missingInFr = [...enSet].filter(k => !frSet.has(k));
const extraInHt = [...htSet].filter(k => !enSet.has(k));
const extraInFr = [...frSet].filter(k => !enSet.has(k));

if (missingInHt.length > 0) {
  console.error(`\nFAIL: ${missingInHt.length} key(s) missing in HT:`);
  missingInHt.forEach(k => console.error(`  - ${k}`));
  exitCode = 1;
}
if (missingInFr.length > 0) {
  console.error(`\nFAIL: ${missingInFr.length} key(s) missing in FR:`);
  missingInFr.forEach(k => console.error(`  - ${k}`));
  exitCode = 1;
}
if (extraInHt.length > 0) {
  console.error(`\nFAIL: ${extraInHt.length} extra key(s) in HT not in EN:`);
  extraInHt.forEach(k => console.error(`  + ${k}`));
  exitCode = 1;
}
if (extraInFr.length > 0) {
  console.error(`\nFAIL: ${extraInFr.length} extra key(s) in FR not in EN:`);
  extraInFr.forEach(k => console.error(`  + ${k}`));
  exitCode = 1;
}

// 3. Check t() calls in source exist in translations
const usedKeys = findTranslationCalls(SRC_DIR);
const undefinedKeys = [...usedKeys].filter(k => !enSet.has(k));

if (undefinedKeys.length > 0) {
  console.error(`\nFAIL: ${undefinedKeys.length} t() key(s) used in source but not defined in translations:`);
  undefinedKeys.forEach(k => console.error(`  - ${k}`));
  exitCode = 1;
}

// 4. Check for unused translation keys
const unusedKeys = [...enSet].filter(k => !usedKeys.has(k));
if (unusedKeys.length > 0) {
  console.log(`\nWARN: ${unusedKeys.length} unused translation key(s) (defined but never called via t()):`);
  unusedKeys.forEach(k => console.log(`  - ${k}`));
}

// 5. Summary
if (exitCode === 0) {
  console.log(`\nOK: All ${enSet.size} keys in sync across EN/HT/FR. ${usedKeys.size} t() calls validated.`);
} else {
  console.error(`\nSync check failed. Fix the mismatches above.`);
}

process.exit(exitCode);
