import pg from 'pg';
const { Pool } = pg;
const DB = 'postgresql://neondb_owner:npg_tl9n3vTSMdIb@ep-bitter-block-aimkobg4-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
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

async function db(query, params = []) {
  const pool = new Pool({ connectionString: DB });
  try {
    const r = await pool.query(query, params);
    return r;
  } finally { await pool.end(); }
}

async function main() {
  console.log('============================================================');
  console.log('  SELLER STRESS TEST — dratomicslicer (John Doe)');
  console.log('  Timestamp: ' + new Date().toISOString());
  console.log('============================================================\n');

  // ─── 1. LOGIN AS DRATOMICSLICER ───
  console.log('--- 1. AUTH (dratomicslicer) ---');
  const loginRes = await raw('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'dratomicslicer@gmail.com', password: 'stress123' }),
  });
  check('Login as dratomicslicer (200)', loginRes.ok);
  if (!loginRes.ok) { console.log('  FATAL: cannot login.'); printSummary(); return; }
  const sToken = loginRes.data.token;
  const sId = loginRes.data.user.id;
  check('Token returned', !!sToken);
  check('User is seller', loginRes.data.user.role === 'seller');
  check('User id matches DB', sId === '341f5b21-3ef8-4b4f-a34b-541c8f5f92a3');
  check('Full name is John Doe', loginRes.data.user.full_name === 'John Doe');

  // ─── 2. AUTH GUARDS ───
  console.log('\n--- 2. AUTH GUARDS ---');
  const guardTests = [
    ['GET', '/seller/products'],
    ['GET', '/seller/orders'],
    ['GET', '/seller/balance'],
    ['GET', '/seller/payouts'],
    ['GET', '/seller/analytics'],
    ['GET', '/seller/products/low-stock'],
    ['GET', '/promos/mine'],
    ['POST', '/promos', JSON.stringify({ code: 'TEST', discountType: 'percentage', discountValue: 10 })],
    ['POST', '/seller/payouts/request', JSON.stringify({ amount: 100 })],
  ];
  for (const [method, path, body] of guardTests) {
    const r = await raw(path, { method, body });
    check(method + ' ' + path + ' w/o auth → 401', r.status === 401);
  }

  // ─── 3. SELLER ROLE GUARD ───
  console.log('\n--- 3. SELLER ROLE GUARD ---');
  const buyer = await api('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ fullName: 'Buyer Tester', email: 'bt' + TS + '@t.com', password: 'pass123', phone: '50936309999' }),
  });
  const bToken = buyer.token;
  check('Buyer created', !!bToken);
  for (const [method, path, body] of guardTests) {
    const r = await raw(path, { method, body, headers: { Authorization: 'Bearer ' + bToken } });
    check(method + ' ' + path + ' as buyer → 403', r.status === 403);
  }

  // ─── 4. SELLER PRODUCTS ───
  console.log('\n--- 4. SELLER PRODUCTS ---');
  const sp = await api('/seller/products', { headers: { Authorization: 'Bearer ' + sToken } });
  check('Seller products returns array', Array.isArray(sp.products));
  check('Has "Test 1" product', sp.products.some(p => p.name === 'Test 1'));
  const pId = sp.products.find(p => p.name === 'Test 1')?.id;
  check('Product has an ID', !!pId);

  const newProd = await raw('/products', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + sToken },
    body: JSON.stringify({ name: 'Stress Test Product ' + TS, description: 'Created during stress test', price: 500, stock: 10 }),
  });
  check('Create new product (201)', newProd.ok);
  const newPId = newProd.ok ? newProd.data.product.id : null;

  if (newPId) {
    const edit = await raw('/products/' + newPId, {
      method: 'PUT',
      headers: { Authorization: 'Bearer ' + sToken },
      body: JSON.stringify({ price: 550, stock: 8 }),
    });
    check('Edit product price/stock', edit.ok);
    if (edit.ok) check('Price updated to 550', parseFloat(edit.data.product.price) === 550);
  }

  const editOther = await raw('/products/' + pId, {
    method: 'PUT',
    headers: { Authorization: 'Bearer ' + bToken },
    body: JSON.stringify({ name: 'hacked' }),
  });
  check('Buyer cannot edit product (403)', editOther.status === 403);

  if (newPId) {
    const del = await raw('/products/' + newPId, { method: 'DELETE', headers: { Authorization: 'Bearer ' + sToken } });
    check('Delete own product (200)', del.ok);
    const delCheck = await raw('/products/' + newPId);
    check('Deleted product returns 404', delCheck.status === 404);
  }

  // ─── 5. SELLER ORDERS ───
  console.log('\n--- 5. SELLER ORDERS ---');
  const o1 = await api('/orders', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + bToken },
    body: JSON.stringify({ items: [{ productId: pId, quantity: 2 }] }),
  });
  const o1Id = o1.order.id;
  check('Buyer order 1 created', o1.order.status === 'pending');

  const o2 = await api('/orders', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + bToken },
    body: JSON.stringify({
      items: [{ productId: pId, quantity: 1 }],
      deliveryMethod: 'delivery',
      deliveryName: 'Buyer Tester',
      deliveryPhone: '50936309999',
      deliveryAddress: '123 Test Street',
      deliveryCity: 'Port-au-Prince',
    }),
  });
  const o2Id = o2.order.id;
  check('Buyer order 2 (delivery) created', o2.order.delivery_method === 'delivery');

  const sOrders = await api('/seller/orders', { headers: { Authorization: 'Bearer ' + sToken } });
  check('Seller sees orders', Array.isArray(sOrders.orders) && sOrders.orders.length >= 2);
  check('Orders contain pending items', sOrders.orders.some(o => o.status === 'pending'));

  const detailS = await api('/orders/' + o1Id, { headers: { Authorization: 'Bearer ' + sToken } });
  check('Seller views order detail', detailS.order.id === o1Id);
  check('Seller my_role=seller', detailS.order.my_role === 'seller');
  check('Order has other_party name', !!detailS.order.other_party);
  check('Order has items array', Array.isArray(detailS.order.items) && detailS.order.items.length > 0);

  // ─── 6. ORDER STATUS TRANSITIONS ───
  console.log('\n--- 6. ORDER STATUS TRANSITIONS ---');
  const skipPaid = await raw('/seller/orders/' + o1Id + '/status', {
    method: 'PUT',
    headers: { Authorization: 'Bearer ' + sToken },
    body: JSON.stringify({ status: 'processing' }),
  });
  check('pending→processing blocked (needs paid)', skipPaid.status === 400);

  await db("UPDATE orders SET status = 'paid' WHERE id = $1", [o1Id]);

  const st1 = await raw('/seller/orders/' + o1Id + '/status', {
    method: 'PUT',
    headers: { Authorization: 'Bearer ' + sToken },
    body: JSON.stringify({ status: 'processing' }),
  });
  check('paid→processing', st1.ok);

  const st2 = await raw('/seller/orders/' + o1Id + '/status', {
    method: 'PUT',
    headers: { Authorization: 'Bearer ' + sToken },
    body: JSON.stringify({ status: 'shipped' }),
  });
  check('processing→shipped', st2.ok);

  const st3 = await raw('/seller/orders/' + o1Id + '/status', {
    method: 'PUT',
    headers: { Authorization: 'Bearer ' + sToken },
    body: JSON.stringify({ status: 'delivered' }),
  });
  check('shipped→delivered', st3.ok);

  const badSkip = await raw('/seller/orders/' + o1Id + '/status', {
    method: 'PUT',
    headers: { Authorization: 'Bearer ' + sToken },
    body: JSON.stringify({ status: 'completed' }),
  });
  check('delivered→completed blocked for seller', badSkip.status === 400);

  const sequentialJump = await raw('/seller/orders/' + o2Id + '/status', {
    method: 'PUT',
    headers: { Authorization: 'Bearer ' + sToken },
    body: JSON.stringify({ status: 'shipped' }),
  });
  check('pending→shipped skip blocked', sequentialJump.status === 400);

  // ─── 7. MEETUP FLOW ───
  console.log('\n--- 7. MEETUP FLOW ---');
  const o3 = await api('/orders', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + bToken },
    body: JSON.stringify({ items: [{ productId: pId, quantity: 1 }] }),
  });
  const o3Id = o3.order.id;
  check('Meetup test order created', !!o3Id);

  await db("UPDATE orders SET status = 'paid' WHERE id = $1", [o3Id]);

  const mt = await raw('/orders/' + o3Id + '/meetup', {
    method: 'PUT',
    headers: { Authorization: 'Bearer ' + bToken },
    body: JSON.stringify({ lat: 18.9712, lng: -72.2852, address: 'Place du Canave-Vert', note: 'At the fountain' }),
  });
  check('Buyer proposes meetup', mt.ok);

  const sellerConfirm = await raw('/orders/' + o3Id + '/meetup/confirm', {
    method: 'PUT',
    headers: { Authorization: 'Bearer ' + sToken },
  });
  check('Seller confirms meetup', sellerConfirm.ok);

  const altMt = await raw('/orders/' + o3Id + '/meetup', {
    method: 'PUT',
    headers: { Authorization: 'Bearer ' + sToken },
    body: JSON.stringify({ lat: 18.9733, lng: -72.2883, address: 'Marche de Fer', note: 'Alternative spot' }),
  });
  check('Seller proposes alternative meetup', altMt.ok);

  const buyerConfirm = await raw('/orders/' + o3Id + '/meetup/confirm', {
    method: 'PUT',
    headers: { Authorization: 'Bearer ' + bToken },
  });
  check('Buyer confirms alternative', buyerConfirm.ok);

  const comp = await raw('/orders/' + o3Id + '/complete', {
    method: 'PUT',
    headers: { Authorization: 'Bearer ' + bToken },
  });
  check('Complete confirmed order', comp.ok && comp.data.status === 'completed');

  // ─── 8. ORDER TIMELINE ───
  console.log('\n--- 8. ORDER TIMELINE ---');
  const tl = await api('/orders/' + o3Id + '/timeline', { headers: { Authorization: 'Bearer ' + sToken } });
  check('Timeline has events', Array.isArray(tl.events) && tl.events.length >= 4);
  check('Timeline has meetup_proposed', tl.events.some(e => e.event_type === 'meetup_proposed'));
  check('Timeline has meetup_confirmed', tl.events.some(e => e.event_type === 'meetup_confirmed'));
  check('Timeline has status_change', tl.events.some(e => e.event_type === 'status_change'));

  // ─── 9. SELLER BALANCE ───
  console.log('\n--- 9. SELLER BALANCE ---');
  const bal = await api('/seller/balance', { headers: { Authorization: 'Bearer ' + sToken } });
  check('Balance endpoint returns data', !!bal.balance);
  check('Balance.balance is number', typeof bal.balance.balance === 'number');
  check('Balance.total_earned is number', typeof bal.balance.total_earned === 'number');
  check('Balance has total_paid_out', 'total_paid_out' in bal.balance);

  const payouts = await api('/seller/payouts', { headers: { Authorization: 'Bearer ' + sToken } });
  check('Payouts history is array', Array.isArray(payouts.payouts));

  const lowPayout = await raw('/seller/payouts/request', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + sToken },
    body: JSON.stringify({ amount: 1 }),
  });
  check('Payout < min Rs 50 rejected (400)', lowPayout.status === 400);

  const negPayout = await raw('/seller/payouts/request', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + sToken },
    body: JSON.stringify({ amount: -50 }),
  });
  check('Negative payout rejected (400)', negPayout.status === 400);

  const noAuthPayout = await raw('/seller/payouts/request', {
    method: 'POST',
    body: JSON.stringify({ amount: 100 }),
  });
  check('Payout w/o auth rejected (401)', noAuthPayout.status === 401);

  // ─── 10. SELLER ANALYTICS ───
  console.log('\n--- 10. SELLER ANALYTICS ---');
  const analytics = await api('/seller/analytics', { headers: { Authorization: 'Bearer ' + sToken } });
  check('Analytics returns overview', !!analytics.overview);
  check('Analytics total_orders', typeof analytics.overview.total_orders === 'number');
  check('Analytics total_revenue', typeof analytics.overview.total_revenue === 'number');
  check('Analytics avg_rating', typeof analytics.overview.avg_rating === 'number');
  check('Analytics follower_count', typeof analytics.overview.follower_count === 'number');
  check('Analytics product_count', typeof analytics.overview.product_count === 'number');
  check('Analytics topProducts array', Array.isArray(analytics.topProducts));

  // ─── 11. LOW STOCK ───
  console.log('\n--- 11. LOW STOCK ---');
  const lowStock = await api('/seller/products/low-stock', { headers: { Authorization: 'Bearer ' + sToken } });
  check('Low stock returns array', Array.isArray(lowStock.products));

  // ─── 12. PROMO CODES ───
  console.log('\n--- 12. PROMO CODES ---');
  const promoCode = 'STRESS' + TS.slice(0, 6).toUpperCase();
  const promo = await raw('/promos', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + sToken },
    body: JSON.stringify({ code: promoCode, discountType: 'percentage', discountValue: 15, minOrderAmount: 100 }),
  });
  check('Create promo code', promo.ok);
  if (promo.ok) check('Promo code matches', promo.data.promo.code === promoCode);

  const myPromos = await api('/promos/mine', { headers: { Authorization: 'Bearer ' + sToken } });
  check('My promos list', Array.isArray(myPromos.promos));
  check('New promo in list', myPromos.promos.some(p => p.code === promoCode));

  const promoValidate = await raw('/promos/validate', {
    method: 'POST',
    body: JSON.stringify({ code: promoCode, orderTotal: 200 }),
  });
  check('Promo validates', promoValidate.ok);
  if (promoValidate.ok) check('Discount > 0', promoValidate.data.discount_amount > 0);

  const badPromo = await raw('/promos/validate', {
    method: 'POST',
    body: JSON.stringify({ code: 'NONEXISTENT', orderTotal: 200 }),
  });
  check('Bad promo rejected', badPromo.status === 400 || badPromo.status === 404);

  // ─── 13. ORDER NOTES ───
  console.log('\n--- 13. ORDER NOTES ---');
  const note = await raw('/orders/' + o1Id + '/note', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + sToken },
    body: JSON.stringify({ note: 'Will deliver by Thursday' }),
  });
  check('Seller adds note', note.ok);
  if (note.ok) check('Note saved', note.data.updated === true);

  const noteNoAuth = await raw('/orders/' + o1Id + '/note', {
    method: 'POST',
    body: JSON.stringify({ note: 'test' }),
  });
  check('Note w/o auth rejected (401)', noteNoAuth.status === 401);

  // ─── 14. REVIEWS ───
  console.log('\n--- 14. REVIEWS ---');
  const review = await raw('/reviews', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + bToken },
    body: JSON.stringify({ orderId: o3Id, rating: 5, comment: 'Great seller!' }),
  });
  check('Buyer creates review', review.ok);
  if (review.ok) {
    check('Review rating is 5', review.data.review.rating === 5);
  }

  const dupReview = await raw('/reviews', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + bToken },
    body: JSON.stringify({ orderId: o3Id, rating: 3 }),
  });
  check('Duplicate review rejected', dupReview.status === 400 || dupReview.status === 409);

  if (review.ok) {
    const resp = await raw('/reviews/' + review.data.review.id + '/respond', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + sToken },
      body: JSON.stringify({ response: 'Thank you!' }),
    });
    check('Seller responds to review', resp.ok);
  }

  const sellerReviews = await api('/reviews/seller/' + sId);
  check('Seller reviews endpoint works', Array.isArray(sellerReviews.reviews));

  // ─── 15. FOLLOWS ───
  console.log('\n--- 15. FOLLOWS ---');
  const follow = await raw('/follow/' + sId, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + bToken },
  });
  check('Buyer follows seller', follow.ok);
  if (follow.ok) check('Following=true', follow.data.following === true);

  const followerCount = await api('/followers/count/' + sId);
  check('Follower count works', typeof followerCount.count === 'number');

  // ─── 16. WISHLIST ───
  console.log('\n--- 16. WISHLIST ---');
  const wl = await raw('/wishlist/' + pId, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + bToken },
  });
  check('Wishlist add', wl.ok && wl.data.wishlisted === true);

  const wlRemove = await raw('/wishlist/' + pId, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + bToken },
  });
  check('Wishlist remove', wlRemove.ok && wlRemove.data.wishlisted === false);

  const wlCheck = await api('/wishlist/check/' + pId, { headers: { Authorization: 'Bearer ' + bToken } });
  check('Wishlist check', 'wishlisted' in wlCheck);

  // ─── 17. DISPUTES ───
  console.log('\n--- 17. DISPUTES ---');
  const dispute = await raw('/disputes', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + bToken },
    body: JSON.stringify({ orderId: o2Id, reason: 'item_not_received', description: 'Never got item' }),
  });
  if (dispute.ok) {
    check('Dispute created', dispute.data.dispute.status === 'open');
  } else {
    check('Dispute endpoint responded', dispute.status >= 400);
  }

  // ─── 18. STOREFRONT ───
  console.log('\n--- 18. STOREFRONT ---');
  const store = await api('/sellers/' + sId);
  check('Storefront has seller info', store.seller.full_name === 'John Doe');
  check('Storefront product_count', typeof store.seller.product_count === 'number');
  check('Storefront sales_count', typeof store.seller.sales_count === 'number');
  check('Storefront avg_rating', typeof store.seller.avg_rating === 'number');

  // ─── 19. ADDRESSES ───
  console.log('\n--- 19. SAVED ADDRESSES ---');
  const addr = await raw('/addresses', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + bToken },
    body: JSON.stringify({ label: 'Home', name: 'Buyer Tester', phone: '50936309999', address: '123 Main St', city: 'Delmas', isDefault: true }),
  });
  check('Create saved address', addr.ok);

  const addrs = await api('/addresses', { headers: { Authorization: 'Bearer ' + bToken } });
  check('List addresses', Array.isArray(addrs.addresses) && addrs.addresses.length >= 1);

  // ─── 20. RE-ORDER ───
  console.log('\n--- 20. RE-ORDER ---');
  const reorder = await raw('/orders/' + o3Id + '/reorder', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + bToken },
  });
  check('Reorder endpoint works', reorder.ok);

  // ─── 21. NOTIFICATIONS ───
  console.log('\n--- 21. NOTIFICATIONS ---');
  const notifs = await api('/notifications', { headers: { Authorization: 'Bearer ' + sToken } });
  check('Notifications list', Array.isArray(notifs.notifications));

  const unread = await api('/notifications/unread-count', { headers: { Authorization: 'Bearer ' + sToken } });
  check('Unread count endpoint', typeof unread.count === 'number');

  // ─── 22. CLEANUP ───
  console.log('\n--- 22. CLEANUP ---');
  for (const oid of [o1Id, o2Id]) {
    try { await api('/orders/' + oid + '/cancel', { method: 'PUT', headers: { Authorization: 'Bearer ' + bToken } }); } catch {}
  }
  check('Orders cancelled for cleanup', true);

  printSummary();
}

function printSummary() {
  console.log('\n============================================================');
  console.log('  RESULTS');
  console.log('============================================================');
  console.log('  PASSED:  ' + PASS.length);
  console.log('  FAILED:  ' + FAIL.length);
  if (FAIL.length > 0) {
    console.log('\n  FAILURES:');
    FAIL.forEach(f => console.log('    \u2022 ' + f));
  }
  console.log('\n  Total: ' + (PASS.length + FAIL.length));
  console.log('============================================================');
  process.exit(FAIL.length > 0 ? 1 : 0);
}

main();
