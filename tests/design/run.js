/**
 * Design/UI Domain Tests
 * 
 * Tests: Hardcoded hex colors, accessibility, touch targets, theme consistency
 * Run: node tests/design/run.js
 */

import { readFileSync, readdirSync } from 'fs';
import { join, extname } from 'path';

const SRC_DIR = join(process.cwd(), 'src');
const THEME_FILE = join(SRC_DIR, 'theme.ts');

const results = [];

// ─── Load theme colors ───

function loadThemeColors() {
  const content = readFileSync(THEME_FILE, 'utf-8');
  const colors = {};
  const colorBlock = content.match(/COLORS\s*=\s*\{([^}]+)\}/s);
  if (colorBlock) {
    const lines = colorBlock[1].split('\n');
    for (const line of lines) {
      const match = line.match(/(\w+)\s*:\s*['"]([^'"]+)['"]/);
      if (match) {
        colors[match[1]] = match[2].toLowerCase();
      }
    }
  }
  return colors;
}

// ─── Tests ───

async function testNoHardcodedHexOutsideTheme() {
  const themeColors = loadThemeColors();
  const themeHexValues = new Set(Object.values(themeColors));
  
  const files = getAllFiles(SRC_DIR);
  const violations = [];
  
  for (const file of files) {
    if (file.includes('theme.ts') || file.includes('theme.js')) continue;
    
    const content = readFileSync(file, 'utf-8');
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Skip comments
      if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;
      
      // Find hex colors
      const hexMatches = line.matchAll(/['"]#([0-9a-fA-F]{6})['"]/g);
      for (const match of hexMatches) {
        const hex = `#${match[1].toLowerCase()}`;
        
        // Allow if it's in theme.ts or matches a theme color
        if (!themeHexValues.has(hex)) {
          violations.push({
            file: file.replace(SRC_DIR, 'src'),
            line: i + 1,
            color: hex,
          });
        }
      }
    }
  }
  
  if (violations.length > 0) {
    const samples = violations.slice(0, 5).map(v => 
      `${v.file}:${v.line} — ${v.color}`
    ).join('\n    ');
    throw new Error(
      `Found ${violations.length} hardcoded hex colors outside theme.ts:\n    ${samples}`
    );
  }
}

async function testAccessibilityLabelsOnIconButtons() {
  const files = getAllFiles(join(SRC_DIR, 'screens'));
  const violations = [];
  
  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    
    // Find TouchableOpacity with only Icon/ MaterialCommunityIcons children
    const tapPattern = /<TouchableOpacity[^>]*>/g;
    let match;
    
    while ((match = tapPattern.exec(content)) !== null) {
      const tag = match[0];
      const startIdx = match.index;
      
      // Check if this TouchableOpacity has accessibilityLabel
      if (!tag.includes('accessibilityLabel') && !tag.includes('accessibilityRole')) {
        // Get surrounding context to check if it's an icon-only button
        const context = content.slice(startIdx, startIdx + 500);
        
        // Check if first child is an Icon
        if (context.includes('<Icon ') || context.includes('<MaterialCommunityIcons ')) {
          // Check if there's text content
          const hasText = context.includes('<Text') || context.includes('{t(');
          
          if (!hasText) {
            violations.push({
              file: file.replace(SRC_DIR, 'src'),
              line: content.slice(0, startIdx).split('\n').length,
            });
          }
        }
      }
    }
  }
  
  if (violations.length > 0) {
    const samples = violations.slice(0, 5).map(v => 
      `${v.file}:${v.line}`
    ).join('\n    ');
    throw new Error(
      `Found ${violations.length} icon-only TouchableOpacity without accessibilityLabel:\n    ${samples}`
    );
  }
}

async function testNoGenericErrorMessages() {
  const files = getAllFiles(join(SRC_DIR, 'screens'));
  const genericPatterns = [
    /Alert\.alert\([^,]*,\s*['"]Error['"]\)/,
    /Alert\.alert\([^,]*,\s*['"]Something went wrong['"]\)/,
    /Alert\.alert\([^,]*,\s*['"]Failed['"]\)/,
    /Alert\.alert\([^,]*,\s*['"]An error occurred['"]\)/,
  ];
  
  const violations = [];
  
  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      for (const pattern of genericPatterns) {
        if (pattern.test(lines[i])) {
          violations.push({
            file: file.replace(SRC_DIR, 'src'),
            line: i + 1,
          });
        }
      }
    }
  }
  
  if (violations.length > 0) {
    const samples = violations.slice(0, 5).map(v => 
      `${v.file}:${v.line}`
    ).join('\n    ');
    throw new Error(
      `Found ${violations.length} generic error messages:\n    ${samples}`
    );
  }
}

async function testTouchTargetMinimum() {
  const files = getAllFiles(join(SRC_DIR, 'screens'));
  const violations = [];
  
  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Find width/height patterns in TouchableOpacity styles
      const sizeMatch = line.match(/width:\s*(\d+).*height:\s*(\d+)|height:\s*(\d+).*width:\s*(\d+)/);
      if (sizeMatch) {
        const w = parseInt(sizeMatch[1] || sizeMatch[3]);
        const h = parseInt(sizeMatch[2] || sizeMatch[4]);
        
        // Skip very small decorative elements
        if (w <= 2 || h <= 2) continue;
        if (w >= 40 && h >= 40) continue;
        
        // Skip non-interactive patterns
        const context = lines.slice(Math.max(0, i - 3), i + 1).join(' ');
        if (/badge|dot|indicator|icon|avatar|logo|divider|separator/i.test(context)) continue;
        if (/size[=:]\s*\{?\d+/.test(line)) continue;
        
        // Check if context shows it's a button style
        if (/btn|Button|TouchableOpacity|Pressable/i.test(context) && (w < 44 || h < 44)) {
          violations.push({
            file: file.replace(SRC_DIR, 'src'),
            line: i + 1,
            size: `${w}x${h}`,
          });
        }
      }
    }
  }
  
  if (violations.length > 0) {
    const samples = violations.slice(0, 5).map(v => 
      `${v.file}:${v.line} — ${v.size}`
    ).join('\n    ');
    throw new Error(
      `Found ${violations.length} touch targets below 44x44:\n    ${samples}`
    );
  }
}

async function testThemeConsistency() {
  const themeColors = loadThemeColors();
  
  // Verify required colors exist
  const requiredColors = ['coral', 'bg', 'surface', 'text', 'text2', 'border'];
  const missing = requiredColors.filter(c => !themeColors[c]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required theme colors: ${missing.join(', ')}`);
  }
  
  // Verify colors are not pure black/white (should use off-black/off-white)
  if (themeColors.bg === '#000000' || themeColors.bg === '#ffffff') {
    throw new Error('Background color should not be pure black/white — use off-black/off-white');
  }
}

// ─── Helpers ───

function getAllFiles(dir) {
  const files = [];
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      try {
        if (require('fs').statSync(full).isDirectory()) {
          files.push(...getAllFiles(full));
        } else if (['.tsx', '.ts'].includes(extname(full))) {
          files.push(full);
        }
      } catch {}
    }
  } catch {}
  return files;
}

async function runTest(name, fn) {
  const start = Date.now();
  try {
    await fn();
    const duration = Date.now() - start;
    console.log(`  ✅ ${name} (${duration}ms)`);
    return { name, passed: true, duration };
  } catch (err) {
    const duration = Date.now() - start;
    console.log(`  ❌ ${name} (${duration}ms)`);
    console.log(`     ${err.message}`);
    return { name, passed: false, duration, error: err.message };
  }
}

function printResults(domain, results) {
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  console.log(`\n📊 ${domain}: ${passed}/${results.length} passed`);
  
  if (failed > 0) {
    console.log(`   ${failed} test(s) failed`);
  }
  
  return failed === 0;
}

// ─── Main ───

async function main() {
  console.log('🎨 Design/UI Domain Tests\n');
  
  console.log('Static Analysis:');
  results.push(await runTest('No hardcoded hex colors outside theme.ts', testNoHardcodedHexOutsideTheme));
  results.push(await runTest('Icon buttons have accessibilityLabel', testAccessibilityLabelsOnIconButtons));
  results.push(await runTest('No generic error messages', testNoGenericErrorMessages));
  results.push(await runTest('Touch targets ≥ 44x44 on buttons', testTouchTargetMinimum));
  results.push(await runTest('Theme color consistency', testThemeConsistency));
  
  const passed = printResults('Design/UI', results);
  process.exit(passed ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
