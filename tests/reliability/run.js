/**
 * Reliability Domain Tests
 * 
 * Tests: API endpoint smoke tests, error handling, data integrity
 * Run: node tests/reliability/run.js
 */

import {
  startTestServer, stopTestServer,
  createUser, becomeSeller, createProduct,
  apiGet, apiPost, apiPut, apiDelete,
  runTest, printResults, assert, assertStatus,
} from '../setup.js';

const results = [];
let userToken, sellerToken, sellerId, productId;

// ─── Setup ───

async function setup() {
  // Create buyer
  const buyer = await createUser({ email: `buyer${Date.now()}@test.com` });
  userToken = buyer.token;
  
  // Create seller
  const seller = await createUser({ email: `seller${Date.now()}@test.com` });
  sellerToken = seller.token;
  await becomeSeller(sellerToken);
  sellerId = seller.user.id;
  
  // Create product
  const product = await createProduct(sellerToken);
  productId = product.product?.id || product.id;
}

// ─── Tests: Health & Core ───

async function testHealthEndpoint() {
  const { status, data } = await apiGet('/api/health');
  assertStatus(status, 200, '/api/health');
  assert(data.status === 'ok', 'Health status not ok');
}

async function testRootEndpoint() {
  const { status, data } = await apiGet('/');
  assertStatus(status, 200, '/');
  assert(data.status === 'ok', 'Root status not ok');
}

async function testCategoriesEndpoint() {
  const { status, data } = await apiGet('/api/categories');
  assertStatus(status, 200, '/api/categories');
  assert(Array.isArray(data.categories), 'Categories not an array');
}

// ─── Tests: Products ───

async function testProductList() {
  const { status, data } = await apiGet('/api/products');
  assertStatus(status, 200, '/api/products');
  assert(data.products !== undefined, 'Missing products array');
}

async function testProductDetail() {
  if (!productId) return;
  const { status, data } = await apiGet(`/api/products/${productId}`);
  assertStatus(status, 200, `/api/products/${productId}`);
  assert(data.product?.id === productId, 'Product ID mismatch');
}

async function testProductNotFound() {
  const { status } = await apiGet('/api/products/nonexistent-id-12345');
  assertStatus(status, 404, 'Product not found');
}

async function testCreateProductRequiresAuth() {
  const { status } = await apiPost('/api/products', {
    name: 'Test', price: 100, category: 'Electronics', stock: 1,
  });
  assertStatus(status, 401, 'Create product without auth');
}

async function testCreateProductRequiresSeller() {
  const { status } = await apiPost('/api/products', {
    name: 'Test', price: 100, category: 'Electronics', stock: 1,
  }, userToken);
  // Should be 403 (not seller) or similar
  assert(status >= 400, 'Create product without seller role should fail');
}

// ─── Tests: Orders ───

async function testOrderList() {
  const { status, data } = await apiGet('/api/orders', userToken);
  assertStatus(status, 200, '/api/orders');
  assert(data.buyerOrders !== undefined || Array.isArray(data), 'Orders response format');
}

async function testOrderDetailNotFound() {
  const { status } = await apiGet('/api/orders/nonexistent-id', userToken);
  assert(status >= 400, 'Order detail for nonexistent ID should fail');
}

// ─── Tests: Conversations ───

async function testConversationList() {
  const { status, data } = await apiGet('/api/conversations', userToken);
  assertStatus(status, 200, '/api/conversations');
}

async function testCreateConversation() {
  const { status, data } = await apiPost('/api/conversations', {
    sellerId,
  }, userToken);
  assertStatus(status, 201, 'Create conversation');
  assert(data.conversationId, 'Missing conversationId');
  return data.conversationId;
}

// ─── Tests: Wishlist ───

async function testWishlistEmpty() {
  const { status, data } = await apiGet('/api/wishlist', userToken);
  assertStatus(status, 200, '/api/wishlist');
  assert(data.items !== undefined, 'Missing items array');
}

async function testWishlistAddRemove() {
  if (!productId) return;
  
  // Add to wishlist
  const { status: addStatus } = await apiPost(`/api/wishlist/${productId}`, {}, userToken);
  assertStatus(addStatus, 200, 'Add to wishlist');
  
  // Check wishlist
  const { data } = await apiGet('/api/wishlist', userToken);
  const found = data.items?.some(i => i.id === productId);
  assert(found, 'Product not in wishlist after adding');
  
  // Remove from wishlist
  const { status: removeStatus } = await apiDelete(`/api/wishlist/${productId}`, userToken);
  assertStatus(removeStatus, 200, 'Remove from wishlist');
}

// ─── Tests: Notifications ───

async function testNotifications() {
  const { status, data } = await apiGet('/api/notifications', userToken);
  assertStatus(status, 200, '/api/notifications');
}

async function testUnreadCount() {
  const { status, data } = await apiGet('/api/notifications/unread-count', userToken);
  assertStatus(status, 200, '/api/notifications/unread-count');
  assert(typeof data.count === 'number', 'Unread count not a number');
}

// ─── Tests: Error Handling ───

async function testInvalidJson() {
  const res = await fetch(`http://localhost:3099/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'not json',
  });
  // Should return 400 or 422, not 500
  assert(res.status !== 500, 'Invalid JSON caused server error');
}

async function testMissingFields() {
  const { status } = await apiPost('/api/auth/login', {
    email: 'test@test.com',
    // missing password
  });
  assert(status >= 400, 'Missing fields should return error');
}

// ─── Main ───

async function main() {
  console.log('🔧 Reliability Domain Tests\n');
  
  try {
    await startTestServer();
    await setup();
    
    console.log('Health & Core:');
    results.push(await runTest('GET /api/health returns 200', testHealthEndpoint));
    results.push(await runTest('GET / returns 200', testRootEndpoint));
    results.push(await runTest('GET /api/categories returns array', testCategoriesEndpoint));
    
    console.log('\nProducts:');
    results.push(await runTest('GET /api/products returns list', testProductList));
    results.push(await runTest('GET /api/products/:id returns product', testProductDetail));
    results.push(await runTest('GET /api/products/:id (nonexistent) returns 404', testProductNotFound));
    results.push(await runTest('POST /api/products without auth returns 401', testCreateProductRequiresAuth));
    results.push(await runTest('POST /api/products without seller role fails', testCreateProductRequiresSeller));
    
    console.log('\nOrders:');
    results.push(await runTest('GET /api/orders returns list', testOrderList));
    results.push(await runTest('GET /api/orders/:id (nonexistent) fails', testOrderDetailNotFound));
    
    console.log('\nConversations:');
    results.push(await runTest('GET /api/conversations returns list', testConversationList));
    const convId = await runTest('POST /api/conversations creates conversation', testCreateConversation);
    
    console.log('\nWishlist:');
    results.push(await runTest('GET /api/wishlist returns list', testWishlistEmpty));
    results.push(await runTest('Add/remove product from wishlist', testWishlistAddRemove));
    
    console.log('\nNotifications:');
    results.push(await runTest('GET /api/notifications returns list', testNotifications));
    results.push(await runTest('GET /api/notifications/unread-count returns number', testUnreadCount));
    
    console.log('\nError Handling:');
    results.push(await runTest('Invalid JSON returns 4xx, not 500', testInvalidJson));
    results.push(await runTest('Missing fields returns 4xx', testMissingFields));
    
  } finally {
    await stopTestServer();
  }
  
  const passed = printResults('Reliability', results);
  process.exit(passed ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
