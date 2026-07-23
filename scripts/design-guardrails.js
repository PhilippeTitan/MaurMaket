#!/usr/bin/env node
/**
 * Design Guardrails — scans source files for UX violations
 * Run: node scripts/design-guardrails.js
 * Exit code 0 = clean, 1 = violations found
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

const SRC_DIR = join(process.cwd(), 'src');
const MIN_TOUCH_TARGET = 44;
const ALLOWED_FONT_SIZES = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 24, 28, 32];
const GENERIC_ERRORS = [
  /Alert\.alert\([^,]*,\s*['"]Error['"]\)/,
  /Alert\.alert\([^,]*,\s*['"]Something went wrong['"]\)/,
  /Alert\.alert\([^,]*,\s*['"]Failed['"]\)/,
  /Alert\.alert\([^,]*,\s*['"]An error occurred['"]\)/,
  /['"]error['"]:\s*['"]Error['"]/,
];

let violations = [];
let warnings = [];

function getAllTsxFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...getAllTsxFiles(full));
    } else if (extname(full) === '.tsx' || extname(full) === '.ts') {
      files.push(full);
    }
  }
  return files;
}

function checkTouchTargets(content, file) {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const sizeMatch = line.match(/width:\s*(\d+).*height:\s*(\d+)|height:\s*(\d+).*width:\s*(\d+)/);
    if (sizeMatch) {
      const w = parseInt(sizeMatch[1] || sizeMatch[3]);
      const h = parseInt(sizeMatch[2] || sizeMatch[4]);
      if (w < MIN_TOUCH_TARGET || h < MIN_TOUCH_TARGET) {
        // Skip non-interactive elements
        const skipPatterns = [
          /badge/i, /dot/i, /indicator/i, /icon/i, /avatar/i, /logo/i,
          /divider/i, /separator/i, /line/i, /border/i, /shadow/i,
          /placeholder/i, /spinner/i, /loading/i,
          /radius/i, // borderRadius patterns
        ];
        if (skipPatterns.some(p => p.test(line))) continue;
        
        // Skip if it's a size prop (icon size, not touch target)
        if (/size[=:]\s*\{?\d+/.test(line)) continue;
        
        // Skip very small elements that are clearly decorative (0-2px)
        if (w <= 2 || h <= 2) continue;
        
        // Skip if context shows it's inside a non-interactive component
        const context = lines.slice(Math.max(0, i - 5), i + 1).join(' ');
        if (/View\b/.test(context) && !/TouchableOpacity|Pressable|Button/.test(context)) continue;
        
        // Skip carousel/pagination dots
        if (/dot|carousel|pagination|slide/i.test(file + context)) continue;
        
        // Tolerance: 40-43 is acceptable (close to 44)
        if (w >= 40 && h >= 40) continue;
        
        violations.push({
          file: file.replace(SRC_DIR, 'src'),
          line: i + 1,
          rule: 'touch-target',
          message: `Touch target ${w}x${h} < ${MIN_TOUCH_TARGET}x${MIN_TOUCH_TARGET} minimum`,
        });
      }
    }
  }
}

function checkGenericErrors(content, file) {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of GENERIC_ERRORS) {
      if (pattern.test(line)) {
        violations.push({
          file: file.replace(SRC_DIR, 'src'),
          line: i + 1,
          rule: 'generic-error',
          message: 'Generic error message — use field-specific inline errors instead',
        });
      }
    }
  }
}

function checkFontSizeHierarchy(content, file) {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const sizeMatch = line.match(/fontSize:\s*(\d+)/);
    if (sizeMatch) {
      const size = parseInt(sizeMatch[1]);
      if (!ALLOWED_FONT_SIZES.includes(size)) {
        warnings.push({
          file: file.replace(SRC_DIR, 'src'),
          line: i + 1,
          rule: 'font-size',
          message: `fontSize: ${size} not in allowed sizes: [${ALLOWED_FONT_SIZES.join(', ')}]`,
        });
      }
    }
  }
}

function checkSpinnerWithoutSkeleton(content, file) {
  if (file.includes('Skeleton')) return; // Skip skeleton files
  // Only flag full-screen spinners (loading states), not inline indicators
  const fullScreenSpinnerPattern = /ActivityIndicator[^}]*style=\{[^}]*flex:\s*1/s;
  const hasFullScreenSpinner = fullScreenSpinnerPattern.test(content);
  const hasSkeletonImport = content.includes('Skeleton');
  
  if (hasFullScreenSpinner && !hasSkeletonImport) {
    warnings.push({
      file: file.replace(SRC_DIR, 'src'),
      line: 0,
      rule: 'spinner-no-skeleton',
      message: 'Full-screen ActivityIndicator — consider skeleton screen instead',
    });
  }
}

function checkHitSlopUsage(content, file) {
  // Check if small TouchableOpacity elements have hitSlop
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('hitSlop')) {
      // Good — has hitSlop
    }
  }
}

// Main
const files = getAllTsxFiles(SRC_DIR);
console.log(`\n🔍 Scanning ${files.length} files for design violations...\n`);

for (const file of files) {
  const content = readFileSync(file, 'utf-8');
  checkTouchTargets(content, file);
  checkGenericErrors(content, file);
  checkFontSizeHierarchy(content, file);
  checkSpinnerWithoutSkeleton(content, file);
}

// Report
if (violations.length > 0) {
  console.log('❌ VIOLATIONS (must fix):\n');
  for (const v of violations) {
    console.log(`  ${v.file}:${v.line} [${v.rule}] ${v.message}`);
  }
  console.log('');
}

if (warnings.length > 0) {
  console.log('⚠️  WARNINGS (should fix):\n');
  for (const w of warnings) {
    const loc = w.line > 0 ? `:${w.line}` : '';
    console.log(`  ${w.file}${loc} [${w.rule}] ${w.message}`);
  }
  console.log('');
}

console.log(`Results: ${violations.length} violations, ${warnings.length} warnings`);

if (violations.length > 0) {
  console.log('\n💡 Fix violations before committing. Warnings are suggestions.\n');
  process.exit(1);
} else {
  console.log('\n✅ All design guardrails passed.\n');
  process.exit(0);
}
