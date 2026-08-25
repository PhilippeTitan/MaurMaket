// This script writes the new CheckoutScreen.tsx
// Run with: node scripts/write-checkout.cjs
const fs = require('fs');
const path = require('path');
const content = fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', 'CheckoutScreen.tsx'), 'utf8');
console.log('Current file size:', content.length, 'bytes');
console.log('Has StepIndicator:', content.includes('StepIndicator'));
console.log('Has step state:', content.includes('const [step, setStep]'));
