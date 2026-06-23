const API = 'http://localhost:3001/api';
const TS = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const PASS = [];
const FAIL = [];
function check(name, ok, detail) {
  if (ok) PASS.push(name);
  else FAIL.push(name + (detail ? ': ' + detail : ''));
  console.log((ok ? '  [PASS]' : '  [FAIL]') + ' ' + name + (detail && !ok ? ' \u2014 ' + detail : ''));
}

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    body: opts.body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);
  return data;
}

async function raw(path, opts = {}) {
  const res = await fetch(API + path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    body: opts.body,
  });
  const data = await res.json();
  return { status: res.status, ok: res.ok, data };
}

async function main() {
  console.log('========================================================');
  console.log('  COMPREHENSIVE BUYER/SELLER STRESS TEST');
  console.log('  Timestamp: ' + new Date().toISOString());
  console.log('========================================================\n');

  // === 1. AUTH ===
  console.log('--- 1. AUTH ---');
  const b = await api('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ fullName: 'Alice Buyer', email: 'a' + TS + '@t.com', password: 'pass123', phone: '50936309001' }),
  });
  const bToken = b.token;
  const bId = b.user.id;
  check('Buyer signup returns token', !!bToken);
  check('Buyer has user id', !!bId);

  const s = await api('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ fullName: 'Bob Seller', email: 's' + TS + '@t.com', password: 'pass123', phone: '50936309002', role: 'seller' }),
  });
  const sToken = s.token;
  const sId = s.user.id;
  check('Seller signup returns token', !!sToken);
  check('Seller has user id', !!sId);

  const me = await api('/auth/me', { headers: { Authorization: 'Bearer ' + bToken } });
  check('GET /auth/me returns correct user', me.user.id === bId);

  const dup = await raw('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ fullName: 'Dup', email: 'a' + TS + '@t.com', password: 'x', phone: '50936309003' }),
  });
  check('Duplicate email rejected (409)', dup.status === 409);

  const login = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'a' + TS + '@t.com', password: 'pass123' }),
  });
  check('Login matches token', login.token === bToken);

  const badLogin = await raw('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'a' + TS + '@t.com', password: 'wrong' }),
  });
  check('Wrong password gives 401', badLogin.status === 401);

  // === 2. PRODUCT LISTING ===
  console.log('\n--- 2. PRODUCT LISTING ---');

  const catsRaw = await raw('/categories');
  const cats = catsRaw.data.categories || catsRaw.data;
  check('Categories endpoint works', Array.isArray(cats) && cats.length > 0);
  const catId = Array.isArray(cats) && cats.length > 0 ? cats[0].id : null;
  if (!catId) console.log('  [WARN] No categories found, products created without category');

  const p1r = await raw('/products', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + sToken },
    body: JSON.stringify({ name: 'Noise Cancelling Headphones', description: 'Premium bluetooth headphones with ANC', price: 2500, stock: 5, categoryId: catId }),
  });
  check('Create product (201)', p1r.ok);
  if (!p1r.ok) { console.log('  [DEBUG] Product 1 response:', JSON.stringify(p1r.data)); }
  const pId = p1r.ok ? p1r.data.product.id : null;

  const p2r = await raw('/products', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + sToken },
    body: JSON.stringify({ name: 'Wireless Mouse', description: 'Ergonomic mouse', price: 800, stock: 10, categoryId: catId }),
  });
  check('Create second product (201)', p2r.ok);
  const p2Id = p2r.ok ? p2r.data.product.id : null;

  if (!pId || !p2Id) { console.log('  [SKIP] Remaining tests depend on products\n'); printSummary(); return; }

  const noAuthProd = await raw('/products', {
    method: 'POST',
    body: JSON.stringify({ name: 'NoAuth', price: 1 }),
  });
  check('Create product without auth rejected (401)', noAuthProd.status === 401);

  const prodDetail = await api('/products/' + pId);
  check('Product detail has images field', 'images' in prodDetail.product);
  check('Product detail has seller info', !!(prodDetail.product.seller_name));
  check('Product detail has category', !!prodDetail.product.category);

  // === 3. SEARCH & FILTERS ===
  console.log('\n--- 3. SEARCH & FILTERS ---');
  const search = await api('/products?search=headphones');
  check('Search by name returns results', search.total >= 1);

  const searchNone = await api('/products?search=zzzznonexistent');
  check('Bad search returns 0', searchNone.total === 0);

  const priceFilter = await api('/products?minPrice=1000&maxPrice=3000');
  check('Price filter works', priceFilter.total >= 1);

  const sortDesc = await api('/products?sort=price_desc');
  check('Sort price desc', sortDesc.products.length >= 2 &&
    parseFloat(sortDesc.products[0].price) >= parseFloat(sortDesc.products[sortDesc.products.length - 1].price));

  const sortAsc = await api('/products?sort=price_asc');
  check('Sort price asc', sortAsc.products.length >= 2 &&
    parseFloat(sortAsc.products[0].price) <= parseFloat(sortAsc.products[sortAsc.products.length - 1].price));

  const page = await api('/products?page=1&limit=1');
  check('Pagination', page.products.length === 1 && page.pages >= 2);

  // === 4. ORDER CREATION ===
  console.log('\n--- 4. ORDER CREATION ---');

  const order1 = await api('/orders', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + bToken },
    body: JSON.stringify({ items: [{ productId: pId, quantity: 2 }] }),
  });
  const o1Id = order1.order.id;
  check('Order created (meetup default)', order1.order.status === 'pending' && order1.order.delivery_method === 'meetup');

  const order2 = await api('/orders', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + bToken },
    body: JSON.stringify({
      items: [{ productId: p2Id, quantity: 1 }],
      deliveryMethod: 'delivery',
      deliveryName: 'Alice Buyer',
      deliveryPhone: '50936309001',
      deliveryAddress: '123 Rue du Centre',
      deliveryCity: 'Port-au-Prince',
      deliveryNote: 'Leave at gate',
    }),
  });
  const o2Id = order2.order.id;
  check('Order with delivery fields', order2.order.delivery_method === 'delivery' && order2.order.delivery_address === '123 Rue du Centre');

  const noAuthOrder = await raw('/orders', {
    method: 'POST',
    body: JSON.stringify({ items: [{ productId: pId, quantity: 1 }] }),
  });
  check('Order without auth rejected (401)', noAuthOrder.status === 401);

  const emptyOrder = await raw('/orders', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + bToken },
    body: JSON.stringify({ items: [] }),
  });
  check('Empty cart rejected (400)', emptyOrder.status === 400);

  const oos = await raw('/orders', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + bToken },
    body: JSON.stringify({ items: [{ productId: pId, quantity: 999 }] }),
  });
  check('Out of stock rejected', oos.status === 400 || oos.status === 409);

  const afterStock = await api('/products/' + pId);
  const expectedStock = 5 - 2; // 5 initial - 2 from order1 (order with qty 2), -999 order failed so stock unchanged
  check('Stock decremented after order', afterStock.product.stock === expectedStock, 'got ' + afterStock.product.stock + ' expected ' + expectedStock);

  // === 5. ORDER LIST & DETAIL ===
  console.log('\n--- 5. ORDER LIST & DETAIL ---');
  const bOrders = await api('/orders', { headers: { Authorization: 'Bearer ' + bToken } });
  check('Buyer sees buyerOrders', Array.isArray(bOrders.buyerOrders) && bOrders.buyerOrders.length >= 2);
  check('Buyer sees 0 sellerOrders', bOrders.sellerOrders.length === 0);

  const sOrders = await api('/orders', { headers: { Authorization: 'Bearer ' + sToken } });
  check('Seller sees sellerOrders', sOrders.sellerOrders.length >= 2);

  const detail = await api('/orders/' + o1Id, { headers: { Authorization: 'Bearer ' + bToken } });
  check('Order detail has items', detail.order.items && detail.order.items.length > 0);
  check('Order detail has other_party', !!detail.order.other_party);
  check('Order detail my_role=buyer', detail.order.my_role === 'buyer');

  const detailS = await api('/orders/' + o1Id, { headers: { Authorization: 'Bearer ' + sToken } });
  check('Seller can view same order', detailS.order.id === o1Id);
  check('Seller my_role=seller', detailS.order.my_role === 'seller');

  const randUser = await api('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ fullName: 'Random', email: 'r' + TS + '@t.com', password: 'x', phone: '50936309003' }),
  });
  const thirdParty = await raw('/orders/' + o1Id, { headers: { Authorization: 'Bearer ' + randUser.token } });
  check('Third party denied (403/404)', thirdParty.status === 403 || thirdParty.status === 404);

  // === 6. CANCEL ORDER ===
  console.log('\n--- 6. CANCEL ORDER ---');
  const toCancel = await api('/orders', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + bToken },
    body: JSON.stringify({ items: [{ productId: pId, quantity: 1 }] }),
  });
  const cancelId = toCancel.order.id;

  const cancelled = await api('/orders/' + cancelId + '/cancel', { method: 'PUT', headers: { Authorization: 'Bearer ' + bToken } });
  check('Cancel succeeds', cancelled.cancelled === true);

  const doubleCancel = await raw('/orders/' + cancelId + '/cancel', { method: 'PUT', headers: { Authorization: 'Bearer ' + bToken } });
  check('Double cancel rejected', doubleCancel.status === 400);

  const sellerCancel = await raw('/orders/' + o1Id + '/cancel', { method: 'PUT', headers: { Authorization: 'Bearer ' + sToken } });
  check('Seller cannot cancel buyer order', sellerCancel.status === 403 || sellerCancel.status === 400);

  const restored = await api('/products/' + pId);
  check('Stock restored after cancel', restored.product.stock >= 3, 'stock=' + restored.product.stock);

  // === 7. MEETUP FLOW ===
  console.log('\n--- 7. MEETUP FLOW ---');
  const mt = await api('/orders/' + o1Id + '/meetup', {
    method: 'PUT',
    headers: { Authorization: 'Bearer ' + bToken },
    body: JSON.stringify({ lat: 18.9712, lng: -72.2852, address: 'Place du Canave-Vert', note: 'At the fountain' }),
  });
  check('Propose meetup', mt.updated === true);

  const selfConfirm = await raw('/orders/' + o1Id + '/meetup/confirm', { method: 'PUT', headers: { Authorization: 'Bearer ' + bToken } });
  check('Self-confirm rejected (400)', selfConfirm.status === 400);

  const confirm = await api('/orders/' + o1Id + '/meetup/confirm', { method: 'PUT', headers: { Authorization: 'Bearer ' + sToken } });
  check('Seller confirms meetup', confirm.updated === true);

  const reConfirm = await api('/orders/' + o1Id + '/meetup/confirm', { method: 'PUT', headers: { Authorization: 'Bearer ' + sToken } });
  check('Re-confirm idempotent', reConfirm.updated === true);

  const noMeetupOrder = await api('/orders', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + bToken },
    body: JSON.stringify({ items: [{ productId: p2Id, quantity: 1 }] }),
  });
  const noMeetupId = noMeetupOrder.order.id;
  const confirmNoLoc = await raw('/orders/' + noMeetupId + '/meetup/confirm', { method: 'PUT', headers: { Authorization: 'Bearer ' + sToken } });
  check('Confirm without location rejected (400)', confirmNoLoc.status === 400);

  const altMeetup = await api('/orders/' + o1Id + '/meetup', {
    method: 'PUT',
    headers: { Authorization: 'Bearer ' + sToken },
    body: JSON.stringify({ lat: 18.9733, lng: -72.2883, address: 'March\u00e9 de Fer', note: 'Alternative spot' }),
  });
  check('Propose alternative meetup (overwrites)', altMeetup.updated === true);

  const buyerReConfirm = await api('/orders/' + o1Id + '/meetup/confirm', { method: 'PUT', headers: { Authorization: 'Bearer ' + bToken } });
  check('Buyer confirms alternative', buyerReConfirm.updated === true);

  // === 8. COMPLETE ORDER ===
  console.log('\n--- 8. COMPLETE ORDER ---');
  const comp = await api('/orders/' + o1Id + '/complete', { method: 'PUT', headers: { Authorization: 'Bearer ' + bToken } });
  check('Complete confirmed order', comp.status === 'completed');

  const doubleComp = await raw('/orders/' + o1Id + '/complete', { method: 'PUT', headers: { Authorization: 'Bearer ' + bToken } });
  check('Double complete rejected (400)', doubleComp.status === 400);

  // Completing a cancelled order
  const compCancelled = await raw('/orders/' + cancelId + '/complete', { method: 'PUT', headers: { Authorization: 'Bearer ' + bToken } });
  check('Complete cancelled rejected', compCancelled.status === 400);

  // === 9. SELLER DASHBOARD ===
  console.log('\n--- 9. SELLER DASHBOARD ---');
  const sp = await api('/seller/products', { headers: { Authorization: 'Bearer ' + sToken } });
  check('Seller products list', sp.products && sp.products.length >= 2);

  const so = await api('/seller/orders', { headers: { Authorization: 'Bearer ' + sToken } });
  check('Seller orders list', Array.isArray(so.orders));

  const bal = await api('/seller/balance', { headers: { Authorization: 'Bearer ' + sToken } });
  check('Seller balance accessible', typeof bal.balance === 'object' && bal.balance !== null, 'got ' + typeof bal.balance);
  check('Seller balance has balance field', bal.balance && typeof bal.balance.balance === 'number');

  const payouts = await api('/seller/payouts', { headers: { Authorization: 'Bearer ' + sToken } });
  check('Seller payouts history', Array.isArray(payouts.payouts || payouts), JSON.stringify(payouts).slice(0,50));

  // === 10. ORDER STATUS TRANSITIONS ===
  console.log('\n--- 10. ORDER STATUS TRANSITIONS ---');
  const stOrder = await api('/orders', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + bToken },
    body: JSON.stringify({ items: [{ productId: pId, quantity: 1 }] }),
  });
  const stOrderId = stOrder.order.id;

  const st1 = await raw('/seller/orders/' + stOrderId + '/status', {
    method: 'PUT',
    headers: { Authorization: 'Bearer ' + sToken },
    body: JSON.stringify({ status: 'processing' }),
  });
  check('pending -> processing', st1.ok);

  const st2 = await raw('/seller/orders/' + stOrderId + '/status', {
    method: 'PUT',
    headers: { Authorization: 'Bearer ' + sToken },
    body: JSON.stringify({ status: 'shipped' }),
  });
  check('processing -> shipped', st2.ok);

  const st3 = await raw('/seller/orders/' + stOrderId + '/status', {
    method: 'PUT',
    headers: { Authorization: 'Bearer ' + sToken },
    body: JSON.stringify({ status: 'delivered' }),
  });
  check('shipped -> delivered', st3.ok);

  const stBad = await raw('/seller/orders/' + stOrderId + '/status', {
    method: 'PUT',
    headers: { Authorization: 'Bearer ' + sToken },
    body: JSON.stringify({ status: 'completed' }),
  });
  check('delivered -> completed blocked for seller (400)', stBad.status === 400);

  const skipBad = await raw('/seller/orders/' + cancelId + '/status', {
    method: 'PUT',
    headers: { Authorization: 'Bearer ' + sToken },
    body: JSON.stringify({ status: 'shipped' }),
  });
  check('pending -> shipped skip blocked', skipBad.status === 400);

  // === 11. PROFILE & SETTINGS ===
  console.log('\n--- 11. PROFILE & SETTINGS ---');
  const prof = await api('/auth/profile', {
    method: 'PUT',
    headers: { Authorization: 'Bearer ' + bToken },
    body: JSON.stringify({ fullName: 'Alice B Updated', bio: 'Test bio' }),
  });
  check('Update profile name', prof.user.full_name === 'Alice B Updated');

  const pw = await api('/auth/password', {
    method: 'PUT',
    headers: { Authorization: 'Bearer ' + bToken },
    body: JSON.stringify({ currentPassword: 'pass123', newPassword: 'newpass456' }),
  });
  check('Change password', pw.updated === true);

  const pwBad = await raw('/auth/password', {
    method: 'PUT',
    headers: { Authorization: 'Bearer ' + bToken },
    body: JSON.stringify({ currentPassword: 'wrong', newPassword: 'newpass456' }),
  });
  check('Wrong current pw rejected', pwBad.status === 400 || pwBad.status === 401);

  const pwShort = await raw('/auth/password', {
    method: 'PUT',
    headers: { Authorization: 'Bearer ' + bToken },
    body: JSON.stringify({ currentPassword: 'newpass456', newPassword: 'ab' }),
  });
  check('Short new pw rejected (<6 chars)', pwShort.status === 400);

  const relogin = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'a' + TS + '@t.com', password: 'newpass456' }),
  });
  check('Login with new password works', !!relogin.token);

  // === 12. PAYOUT EDGE CASES ===
  console.log('\n--- 12. PAYOUT ---');
  const payoutLow = await raw('/seller/payouts/request', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + sToken },
    body: JSON.stringify({ amount: 1 }),
  });
  check('Payout below min rejected (400)', payoutLow.status === 400);

  const payoutNeg = await raw('/seller/payouts/request', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + sToken },
    body: JSON.stringify({ amount: -50 }),
  });
  check('Negative payout rejected', payoutNeg.status === 400);

  const payoutNoAuth = await raw('/seller/payouts/request', {
    method: 'POST',
    body: JSON.stringify({ amount: 100 }),
  });
  check('Payout without auth rejected (401)', payoutNoAuth.status === 401);

  // === 13. AUTH GUARDS ===
  console.log('\n--- 13. AUTH GUARDS ---');
  const guardTests = [
    ['GET', '/orders'],
    ['GET', '/seller/products'],
    ['GET', '/seller/orders'],
    ['GET', '/seller/balance'],
    ['POST', '/products', JSON.stringify({ name: 'x', price: 1 })],
    ['PUT', '/auth/password', JSON.stringify({ currentPassword: 'x', newPassword: 'y' })],
    ['POST', '/payments/create', JSON.stringify({ orderId: 'x', returnUrl: 'http://x.com' })],
  ];
  for (const g of guardTests) {
    const [method, path, body] = g;
    const r = await raw(path, { method, body });
    check(method + ' ' + path + ' without auth -> 401', r.status === 401);
  }

  printSummary();
}

function printSummary() {
  console.log('\n========================================================');
  console.log('  RESULTS');
  console.log('========================================================');
  console.log('  PASSED:  ' + PASS.length);
  console.log('  FAILED:  ' + FAIL.length);
  if (FAIL.length > 0) {
    console.log('\n  FAILURES:');
    FAIL.forEach(function (f) { console.log('    \u2022 ' + f); });
  }
  console.log('\n  Total assertions: ' + (PASS.length + FAIL.length));
  console.log('========================================================');
}

main().catch(function (e) { console.error('FATAL:', e.message); printSummary(); process.exit(1); });
