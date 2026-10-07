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
  cartNeedsPush,
  normalizeOfferReference,
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
const screen = read('src/screens/CartScreen.tsx');
check('the store picks a key by session state', store.includes('cartStorageKey()') && store.includes('CART_ACCOUNT_KEY : CART_GUEST_KEY'));
check('every cart change persists through one helper', (store.match(/await store\.persistCart\(\)/g) || []).length >= 4);
check('signing in merges rather than overwrites', store.includes('mergeCarts(state.cart, remote)') && store.includes('void store.hydrateAccountCart()'));
check('the device cart stops being a guest cart once handed over', store.includes('await storage.deleteItem(CART_GUEST_KEY);'));
check('a signed-in cart starts from the account\'s copy', store.includes('(tokenStr && accountCartStr) ? accountCartStr : cartStr'));
check('sign-out still sweeps the account cart through the policy, not by name', !/deleteItem\('mm_cart_account'\)/.test(store));

// ── 9. An agreed price travels with the line ──
// "A price agreed in a chat and tapped into the cart belongs to the account, not
// to the phone that accepted it." The reference is opaque here: whether it still
// stands is the server's answer.
const OFFER = '11111111-2222-3333-4444-555555555555';
const OTHER_OFFER = '99999999-8888-7777-6666-555555555555';
check('an offer reference must be a uuid, or nothing',
  normalizeOfferReference(OFFER) === OFFER
  && normalizeOfferReference('not-an-offer') === null
  && normalizeOfferReference(null) === null
  && normalizeOfferReference(42) === null
  && normalizeOfferReference(` ${OFFER} `) === OFFER);
check('a line carries the agreement it was accepted under',
  normalizeCartLines([{ id: 'p1', quantity: 1, acceptedOfferMessageId: OFFER }])[0].item.offerMessageId === OFFER);
check('a junk reference is dropped, not guessed at',
  normalizeCartLines([{ id: 'p1', quantity: 1, acceptedOfferMessageId: 'x' }])[0].item.offerMessageId === null);
check('an ordinary line carries no reference',
  normalizeCartLines([{ id: 'p1', quantity: 1 }])[0].item.offerMessageId === null);
same('the reference crosses the wire only on the line that has one',
  toCartPayload([{ id: 'p1', quantity: 1, acceptedOfferMessageId: OFFER }, { id: 'p2', quantity: 2 }]),
  [{ productId: 'p1', variantId: null, quantity: 1, acceptedOfferMessageId: OFFER },
    { productId: 'p2', variantId: null, quantity: 2 }]);
check('an agreement made on this device survives a merge with an account that has none',
  mergeCarts([{ id: 'p1', quantity: 1, acceptedOfferMessageId: OFFER }], [{ id: 'p1', quantity: 1 }])[0].acceptedOfferMessageId === OFFER);
check('the account\'s own record of the agreement wins',
  mergeCarts([{ id: 'p1', quantity: 1, acceptedOfferMessageId: OTHER_OFFER }],
    [{ id: 'p1', quantity: 1, acceptedOfferMessageId: OFFER }])[0].acceptedOfferMessageId === OFFER);
check('a merge does not invent an agreement for a plain line',
  mergeCarts([{ id: 'p1', quantity: 1 }], [{ id: 'p1', quantity: 1 }])[0].acceptedOfferMessageId === undefined);

// ── 10. When the account needs this device's version of the cart ──
// Pushing on every sign-in is noise; not pushing after a real change loses an
// agreement. Prices and stock are never a reason: the server reads those live.
same('a line the account has never seen needs a push', cartNeedsPush([{ id: 'p2', quantity: 1 }], [{ id: 'p1', quantity: 1 }]), true);
same('a larger quantity here needs a push', cartNeedsPush([{ id: 'p1', quantity: 3 }], [{ id: 'p1', quantity: 1 }]), true);
same('an agreement the account does not have needs a push',
  cartNeedsPush([{ id: 'p1', quantity: 1, acceptedOfferMessageId: OFFER }], [{ id: 'p1', quantity: 1 }]), true);
same('a larger quantity on the account does not', cartNeedsPush([{ id: 'p1', quantity: 1 }], [{ id: 'p1', quantity: 2 }]), false);
same('the same cart twice does not', cartNeedsPush([{ id: 'p1', quantity: 1 }], [{ id: 'p1', quantity: 1 }]), false);
same('two empty carts do not', cartNeedsPush([], []), false);

// ── 11. The offer is checked, never trusted ──
check('the offer must be the caller\'s, for this product',
  /mo\.buyer_id = ci\.user_id/.test(route) && /mo\.product_id = ci\.product_id/.test(route));
check('the offer must still be accepted, unconsumed and unexpired',
  /mo\.status = 'accepted'/.test(route) && /mo\.accepted_checkout_id IS NULL/.test(route) && /accepted_expires_at/.test(route));
check('the writer checks the offer the same way before storing it',
  /status = 'accepted'/.test(route) && /buyer_id = \$2/.test(route) && /offer\.quantity\) !== line\.item\.quantity/.test(route));
check('one offer cannot be claimed by two lines', /claimedOffers\.has\(line\.item\.offerMessageId\)/.test(route));
check('a lapsed agreement is released with a reason, not dropped silently',
  /released\.push/.test(route) && /reason: 'offer-expired'/.test(route) && /reason: 'offer-mismatch'/.test(route));
check('the route stores a reference, never the agreed price',
  /accepted_offer_message_id/.test(route) && !/offered_price/.test(route.replace(/mo\.offered_price AS offer_price/g, '')));
check('a refused line names its variant too, so the right line is removed',
  /reason: 'unavailable'/.test(route) && /productId: line\.item\.id, variantId: line\.item\.variantId/.test(route));

// ── 12. The migration adds a reference, not a snapshot ──
const step92 = server.match(/await step\('Cart offer references', \(\) => c\.query\(`([\s\S]*?)`\)\);/);
check('migration step 92 exists', Boolean(step92));
const step92Sql = step92 ? step92[1] : '';
check('the reference is a message and the line outlives it',
  /accepted_offer_message_id UUID REFERENCES messages\(id\) ON DELETE SET NULL/.test(step92Sql));
check('the migration stores no price', !/price/i.test(step92Sql));

// ── 13. The app acts on the account\'s answer ──
check('the answer is applied, not discarded', store.includes('store.applyCartAnswer(pushed)'));
check('a line the account refused is removed here too, so it cannot come back',
  /state\.cart = state\.cart\.filter\(\(item\) => !dropped\.has\(cartLineKey\(item\)\)\)/.test(store));
check('a lapsed agreement unlocks the line instead of deleting it',
  /delete line\.acceptedOfferMessageId;/.test(store));
check('only the named lines are touched, so an in-flight change is not overwritten',
  !/state\.cart = answer\.items/.test(store));
check('the cart explains what happened instead of losing a line quietly',
  screen.includes("t('cart.syncNoteRemoved'") && screen.includes("t('cart.syncNoteReleased'") && screen.includes('store.clearCartIssues()'));
const localeKeys = ['cart.syncNoteRemoved', 'cart.syncNoteReleased'];
for (const lang of ['en', 'fr', 'ht']) {
  const messages = JSON.parse(read(`messages/${lang}.json`));
  check(`the cart notice is localised in ${lang}`, localeKeys.every((key) => typeof messages[key] === 'string'));
}

if (failures > 0) {
  console.log(`\nFAIL: ${failures} cart-sync violation(s).`);
  process.exit(1);
}
console.log('OK: cart-sync policy holds (guest cart stays, account cart syncs, merge is idempotent, no stock is reserved).');
