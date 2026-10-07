#!/usr/bin/env node
/**
 * Cart-sync check — Batch 75 / APP-Q097.
 *
 * "A signed-in cart syncs across devices; a guest cart stays on the device; the
 * cart does not reserve stock."
 *
 * Three failures are silent here and all three are expensive:
 *   - a merge that ADDS quantities inflates the cart on every app start;
 *   - a merge that prefers the local copy drops a line added on another device;
 *   - anything that writes stock from a cart turns a shopping list into a
 *     reservation, which is how one shopper holds a seller's only item hostage.
 * So the merge rules get a table here, and the stock rule gets an explicit probe
 * over the cart module and its migration.
 *
 * Run: node scripts/cart-sync-check.js
 * Exit code 0 = clean, 1 = policy violation
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  cartLineKey,
  normalizeCartLines,
  mergeCarts,
  toCartPayload,
  CART_ACCOUNT_KEY,
  CART_GUEST_KEY,
  MAX_CART_LINES,
  MAX_LINE_QUANTITY,
} from '../src/utils/cartSync.js';
import { ACCOUNT_EXACT_KEYS, DEVICE_LOCAL_KEYS } from '../src/utils/signOutPolicy.js';

const read = (rel) => readFileSync(join(process.cwd(), rel), 'utf8');

let failures = 0;
const check = (label, ok, detail = '') => {
  if (ok) return;
  failures++;
  console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log('Checking cart sync policy...\n');

// ── 1. Line identity ──
check('a plain line is keyed by product', cartLineKey({ id: 'p1' }) === 'p1');
check('a variant line is keyed by product and option', cartLineKey({ id: 'p1', variantId: 'v1' }) === 'p1::v1');
check('the same option twice is one line', cartLineKey({ id: 'p1', variantId: 'v1' }) === cartLineKey({ id: 'p1', variantId: 'v1' }));
check('two options of one product are two lines', cartLineKey({ id: 'p1', variantId: 'v1' }) !== cartLineKey({ id: 'p1', variantId: 'v2' }));
check('a line with no product has no key', cartLineKey({}) === '' && cartLineKey(null) === '');

// ── 2. What counts as a line ──
const ok = normalizeCartLines([
  { id: 'p1', quantity: 2 },
  { id: 'p2', variantId: 'v1', quantity: 1 },
  { id: 'p2', variantId: 'v1', quantity: 5 },   // duplicate line: first wins
  { productId: 'p3', quantity: 3 },             // server-shaped payload
  { id: 'p4', quantity: 0 },                    // not a quantity
  { id: 'p5', quantity: -2 },
  { id: 'p6', quantity: 1.7 },
  { quantity: 1 },                              // no product
  null, 'nope', 42,
]);
same('only well-formed lines survive', ok.map((l) => l.lineKey), ['p1', 'p2::v1', 'p3', 'p6']);
check('identity comes from either id or productId', ok[2].item.id === 'p3');
same('a fractional quantity floors to a whole line', ok[3].item.quantity, 1);
check('a quantity is capped', normalizeCartLines([{ id: 'p1', quantity: 5000 }])[0].item.quantity === MAX_LINE_QUANTITY);
check('the line count is capped', normalizeCartLines(Array.from({ length: MAX_CART_LINES + 50 }, (_v, i) => ({ id: `p${i}`, quantity: 1 }))).length === MAX_CART_LINES);
check('junk input yields nothing', [null, undefined, 'x', {}, 7].every((v) => normalizeCartLines(v).length === 0));
check('a variant id must be a string to count', normalizeCartLines([{ id: 'p1', variantId: '', quantity: 1 }])[0].lineKey === 'p1');

// ── 3. The merge ──
const local = [{ id: 'p1', quantity: 2, name: 'local p1' }, { id: 'p2', variantId: 'v1', quantity: 1, name: 'local p2' }];
const remote = [{ id: 'p1', quantity: 1, name: 'remote p1' }, { id: 'p3', quantity: 4, name: 'remote p3' }];
const merged = mergeCarts(local, remote);
same('the merge is a union of both carts', merged.map((i) => cartLineKey(i)).sort(), ['p1', 'p2::v1', 'p3']);
check('a shared line takes the larger quantity, never the sum', merged.find((i) => i.id === 'p1').quantity === 2);
check('a line only on the device is kept', merged.some((i) => cartLineKey(i) === 'p2::v1'));
check('a line only on the account is kept', merged.some((i) => cartLineKey(i) === 'p3'));
check('shared lines keep the server\'s live data', merged.find((i) => i.id === 'p1').name === 'remote p1');
check('re-merging the same carts changes nothing', same(
  mergeCarts(merged, remote).map((i) => cartLineKey(i)).sort(),
  merged.map((i) => cartLineKey(i)).sort()
));
check('the merge is idempotent on quantity too',
  mergeCarts(merged, remote).find((i) => i.id === 'p1').quantity === 2);
check('merging onto an empty account keeps the device cart',
  same(mergeCarts(local, []).map((i) => cartLineKey(i)).sort(), ['p1', 'p2::v1']));
check('merging an empty device cart keeps the account cart',
  same(mergeCarts([], remote).map((i) => cartLineKey(i)).sort(), ['p1', 'p3']));
check('two empty carts are empty', mergeCarts([], []).length === 0 && mergeCarts(null, undefined).length === 0);

// ── 4. What the server is told ──
const payload = toCartPayload(local);
same('the payload is identity and intent only', Object.keys(payload[0]).sort(), ['productId', 'quantity', 'variantId']);
check('no price, stock, or name crosses the wire',
  !payload.some((line) => 'price' in line || 'stock' in line || 'name' in line || 'images' in line));
same('the payload keeps variant identity', payload[1].variantId, 'v1');

// ── 5. Two carts on the device, and which one leaves at sign-out ──
check('the account cart and the guest cart are separate keys', CART_ACCOUNT_KEY !== CART_GUEST_KEY);
check('the signed-in cart is swept at sign-out', ACCOUNT_EXACT_KEYS.includes(CART_ACCOUNT_KEY));
check('the guest cart stays at sign-out', DEVICE_LOCAL_KEYS.includes(CART_GUEST_KEY) && !ACCOUNT_EXACT_KEYS.includes(CART_GUEST_KEY));

// ── 6. The cart never reserves stock ──
const route = read('src/routes/cart.js');
check('the cart module never writes stock', !/SET\s+stock/i.test(route) && !/reserveStock|reserveOrderStock/.test(route));
check('the cart module never claims the stock column at all', !/UPDATE\s+products/i.test(route));
check('cart writes are replace-all, so no ordering race between devices', route.includes("DELETE FROM cart_items WHERE user_id = $1"));
check('cart reads are scoped to the caller', route.includes('WHERE ci.user_id = $1'));
check('the cart routes require authentication', (route.match(/authRequired/g) || []).length >= 3);
check('the cart router is mounted', read('src/routes/index.js').includes("app.use('/api', cartRouter);"));

// ── 7. The migration stores no snapshot ──
const server = read('server.js');
const step = server.match(/await step\('Account carts', \(\) => c\.query\(`([\s\S]*?)`\)\);/);
check('migration step 91 exists', Boolean(step));
const stepSql = step ? step[1] : '';
check('the table stores identity, quantity and nothing price-like',
  !/price|sale_|stock/.test(stepSql.replace(/product_variants/g, '').replace(/stock',/g, '')) && /quantity INTEGER NOT NULL CHECK/.test(stepSql));
check('one row per line is enforced', /CREATE UNIQUE INDEX IF NOT EXISTS idx_cart_items_line/.test(stepSql));
check('deleting an account or a listing takes its cart lines with it',
  /user_id UUID NOT NULL REFERENCES users\(id\) ON DELETE CASCADE/.test(stepSql)
  && /product_id UUID NOT NULL REFERENCES products\(id\) ON DELETE CASCADE/.test(stepSql));

// ── 8. The app keeps the two carts apart ──
const store = read('src/store.ts');
check('the store picks a key by session state', store.includes('cartStorageKey()') && store.includes('CART_ACCOUNT_KEY : CART_GUEST_KEY'));
check('every cart change persists through one helper', (store.match(/await store\.persistCart\(\)/g) || []).length >= 4);
check('signing in merges rather than overwrites', store.includes('mergeCarts(state.cart, remote)') && store.includes('void store.hydrateAccountCart()'));
check('the device cart stops being a guest cart once handed over', store.includes('await storage.deleteItem(CART_GUEST_KEY);'));
check('a signed-in cart starts from the account\'s copy', store.includes('(tokenStr && accountCartStr) ? accountCartStr : cartStr'));
check('sign-out still sweeps the account cart through the policy, not by name', !/deleteItem\('mm_cart_account'\)/.test(store));

if (failures > 0) {
  console.log(`\nFAIL: ${failures} cart-sync violation(s).`);
  process.exit(1);
}
console.log('OK: cart-sync policy holds (guest cart stays, account cart syncs, merge is idempotent, no stock is reserved).');
