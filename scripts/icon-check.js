#!/usr/bin/env node
/**
 * Icon guardrail.
 *
 * Every icon goes through src/components/icons/UnifiedIcon.tsx, which resolves
 * names with `ICONS[name] || CircleHelp`. An unmapped name therefore renders as
 * a question-mark circle instead of failing — a silent visual bug with no build
 * error, no type error, and no test failure.
 *
 * This script closes that hole: it collects every icon name the app asks for and
 * fails if any of them is missing from the alias table.
 *
 * Usage: node scripts/icon-check.js
 * Exit code 1 when an unmapped icon name is found.
 */
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, relative } from 'path';

// Matches the other guardrail scripts: they all run from the project root.
const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const UNIFIED = join(SRC, 'components', 'icons', 'UnifiedIcon.tsx');

// ── 1. The names the wrapper can actually render ─────────────────────────────
const unifiedSource = readFileSync(UNIFIED, 'utf8');
const tableStart = unifiedSource.indexOf('= {', unifiedSource.indexOf('const ICONS'));
const tableEnd = unifiedSource.indexOf('\n};', tableStart);
if (tableStart === -1 || tableEnd === -1) {
  console.error('icon-check: could not locate the ICONS alias table in UnifiedIcon.tsx');
  process.exit(1);
}
const table = unifiedSource.slice(tableStart, tableEnd);

// Entries are `'some-name': LucideIcon,` or `someName: LucideIcon,`.
const allowed = new Set();
for (const match of table.matchAll(/(?:'([^']+)'|\b([a-z][\w-]*))\s*:/g)) {
  allowed.add(match[1] || match[2]);
}
if (allowed.size < 100) {
  console.error(`icon-check: parsed only ${allowed.size} icon aliases — the table format probably changed`);
  process.exit(1);
}

// ── 2. Every icon name the app asks for ──────────────────────────────────────
const FILES = [];
(function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walk(full);
    } else if (/\.tsx?$/.test(entry.name)) {
      FILES.push(full);
    }
  }
})(SRC);
for (const extra of ['App.tsx']) {
  const full = join(ROOT, extra);
  if (existsSync(full)) FILES.push(full);
}

// Props that carry an icon name. `name` is ambiguous (TextInput, etc.), so it is
// only read inside the two icon components; `icon` and `iconName` are only ever
// icon names in this codebase.
const ICON_COMPONENTS = ['MaterialCommunityIcons', 'Icon', 'LucideIcon'];
const STRING_LITERAL = /'([^'\\]*)'|"([^"\\]*)"/g;

function literalsIn(expression) {
  const found = [];
  for (const m of expression.matchAll(STRING_LITERAL)) found.push(m[1] ?? m[2]);
  return found;
}

/** Pull the balanced `{...}` expression starting at `open` (an index of `{`). */
function readBraced(source, open) {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return '';
}

/** Read the JSX attribute named `attr` starting from `from`. Returns the raw value. */
function readAttribute(source, from, attr) {
  const re = new RegExp(`\\b${attr}\\s*=\\s*`, 'g');
  re.lastIndex = from;
  const hit = re.exec(source);
  if (!hit) return null;
  const valueStart = hit.index + hit[0].length;
  if (source[valueStart] === '{') return { raw: readBraced(source, valueStart), braced: true, index: hit.index };
  if (source[valueStart] === '"' || source[valueStart] === "'") {
    const quote = source[valueStart];
    const end = source.indexOf(quote, valueStart + 1);
    return { raw: source.slice(valueStart + 1, end === -1 ? source.length : end), braced: false, index: hit.index };
  }
  return null;
}

const used = new Map(); // icon name -> [{ file, line }]

function record(name, file, source, index) {
  if (!name) return;
  // Only kebab-case or single-word lowercase names are ever icon names here.
  if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name)) return;
  const line = source.slice(0, index).split('\n').length;
  if (!used.has(name)) used.set(name, []);
  used.get(name).push({ file: relative(ROOT, file).replace(/\\/g, '/'), line });
}

for (const file of FILES) {
  const source = readFileSync(file, 'utf8');

  // (a) name="..." / name={...} inside the icon components themselves.
  for (const component of ICON_COMPONENTS) {
    const tagRe = new RegExp(`<${component}\\b`, 'g');
    let tag;
    while ((tag = tagRe.exec(source))) {
      const tagEnd = source.indexOf('>', tag.index);
      const span = source.slice(tag.index, tagEnd === -1 ? source.length : tagEnd);
      const attr = readAttribute(span, 0, 'name');
      if (!attr) continue;
      const names = attr.braced ? literalsIn(attr.raw) : [attr.raw];
      for (const name of names) record(name, file, source, tag.index + attr.index);
    }
  }

  // (b) icon="..." / icon={...} / iconName=... anywhere (no other meaning here).
  for (const attr of ['icon', 'iconName']) {
    const re = new RegExp(`\\b${attr}\\s*=\\s*`, 'g');
    let hit;
    while ((hit = re.exec(source))) {
      const valueStart = hit.index + hit[0].length;
      if (source[valueStart] === '{') {
        const expr = readBraced(source, valueStart);
        for (const name of literalsIn(expr)) record(name, file, source, hit.index);
      } else if (source[valueStart] === '"' || source[valueStart] === "'") {
        const quote = source[valueStart];
        const end = source.indexOf(quote, valueStart + 1);
        const name = source.slice(valueStart + 1, end === -1 ? source.length : end);
        record(name, file, source, hit.index);
      }
    }
  }

  // (c) `icon: '...'` in config objects (settings rows, tab bars, menu lists),
  // including prefixed keys such as `emptyIcon:` or `activeIcon:` that are later
  // forwarded to the component as a variable.
  for (const m of source.matchAll(/\b\w*[Ii]con\s*:\s*(?:'([a-z][\w-]*)'|"([a-z][\w-]*)")/g)) {
    record(m[1] || m[2], file, source, m.index);
  }
}

// ── 3. Report ────────────────────────────────────────────────────────────────
const unmapped = [...used.entries()]
  .filter(([name]) => !allowed.has(name))
  .sort((a, b) => b[1].length - a[1].length);

const unused = [...allowed].filter((name) => !used.has(name)).sort();

console.log(`icon-check: ${allowed.size} alias names defined, ${used.size} distinct names used across ${FILES.length} files`);

if (unmapped.length > 0) {
  console.error(`\nERROR: ${unmapped.length} icon name(s) have no alias and render as a "?" circle:\n`);
  for (const [name, sites] of unmapped) {
    console.error(`  ${name}  (${sites.length} use${sites.length === 1 ? '' : 's'})`);
    for (const site of sites.slice(0, 6)) console.error(`      ${site.file}:${site.line}`);
    if (sites.length > 6) console.error(`      … and ${sites.length - 6} more`);
  }
  console.error('\nAdd each name to ICONS in src/components/icons/UnifiedIcon.tsx.');
  process.exit(1);
}

console.log(`OK: every icon name resolves.${unused.length ? ` (${unused.length} defined aliases are unused)` : ''}`);
if (unused.length) console.log(`  unused: ${unused.join(', ')}`);
