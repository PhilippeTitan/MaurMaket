const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'assets', 'leaflet.html'), 'utf8');

// Extract CSS between <style> and </style>
const cssMatch = html.match(/<style>([\s\S]*?)<\/style>/);
const css = cssMatch ? cssMatch[1].trim() : '';

// Extract the longest <script> block (Leaflet JS)
const scriptRegex = /<script>([\s\S]*?)<\/script>/g;
let match;
let leafletJs = '';
while ((match = scriptRegex.exec(html)) !== null) {
  if (match[1].trim().length > leafletJs.length) {
    leafletJs = match[1].trim();
  }
}

console.log('CSS length:', css.length, 'bytes');
console.log('JS length:', leafletJs.length, 'bytes');

const ts = `// Auto-generated from assets/leaflet.html — Leaflet 1.9.4 bundled locally
// DO NOT EDIT MANUALLY — regenerate with: node scripts/build-leaflet-bundle.cjs
export const LEAFLET_CSS = ${JSON.stringify(css)};
export const LEAFLET_JS = ${JSON.stringify(leafletJs)};
`;

const outPath = path.join(__dirname, '..', 'src', 'lib', 'leaflet-bundle.ts');
fs.writeFileSync(outPath, ts);
console.log('Written', outPath);
console.log('Total:', ts.length, 'bytes');
