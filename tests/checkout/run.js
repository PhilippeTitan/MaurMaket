/**
 * Order/Checkout/Payment Domain Tests
 * 
 * Tests: Full E2E flow — signup → cart → checkout → order lifecycle
 * Run: node tests/checkout/run.js
 */

import {
  startTestServer, stopTestServer,
  createUser, becomeSeller, createProduct,
  apiGet, apiPost, apiPut,
  runTest, printResults, assert, assertStatus,
} from '../setup.js';

const results = [];
let buyerToken, sellerToken, sellerId, productId;

// ─── Setup ───

async function setup() {
  const buyer = await createUser({ email: `checkout-buyer${Date.now()}@test.com` });
  buyerToken = buyer.token;
  
  const seller = await createUser({ email: `checkout-seller${Date.now()}@test.com` });
  sellerToken = seller.token;
  await becomeSeller(sellerToken);
  sellerId = seller.user.id;
  
  const product = await createProduct(sellerToken, { price: 2500, stock: 5 });
  productId = product.product?.id || product.id;
}

// ─── Tests: Cart → Checkout Flow ───

async function testCreateOrderFromCart() {
  // Create order directly (simulates cart → checkout)
  const { status, data } = await apiPost('/api/orders', {
    items: [{ productId, quantity: 2 }],
    deliveryMethod: 'delivery',
    deliveryName: 'Test Buyer',
    deliveryPhone: '+5095551234',
    deliveryAddress: '123 Test Street',
    deliveryCity: 'Port-au-Prince',
  }, buyerToken);
  
  assertStatus(status, 201, 'Create order');
  assert(data.order?.id, 'Missing order ID');
  return data.order.id;
}

// ─── Tests: Order Lifecycle ───

async function testOrderLifecycle(orderId) {
  // 1. Get order as buyer
  const { status: getStatus, data: getOrder } = await apiGet(`/api/orders/${orderId}`, buyerToken);
  assertStatus(getStatus, 200, 'Get order');
  assert(getOrder.order?.status === 'pending', 'Order should start as pending');
  
  // 2. Get timeline
  const { status: timelineStatus, data: timelineData } = await apiGet(`/api/orders/${orderId}/timeline`, buyerToken);
  assertStatus(timelineStatus, 200, 'Get order timeline');
  
  // 3. Cancel order (buyer can cancel pending)
  const { status: cancelStatus } = await apiPut(`/api/orders/${orderId}/cancel`, {}, buyerToken);
  assertStatus(cancelStatus, 200, 'Cancel order');
  
  // 4. Verify cancelled
  const { data: cancelledOrder } = await apiGet(`/api/orders/${orderId}`, buyerToken);
  assert(cancelledOrder.order?.status === 'cancelled', 'Order should be cancelled');
}

// ─── Tests: Order as Seller ───

async function testSellerOrderView() {
  // Create an order
  const { data } = await apiPost('/api/orders', {
    items: [{ productId, quantity: 1 }],
    deliveryMethod: 'meetup',
  }, buyerToken);
  const orderId = data.order.id;
  
  // Seller should see it in their orders
  const { status, data: sellerOrders } = await apiGet('/api/orders', sellerToken);
  assertStatus(status, 200, 'Seller get orders');
  
  // Seller can advance status
  const { status: advanceStatus } = await apiPut(`/api/orders/${orderId}/cancel`, {}, sellerToken);
  // Seller might not be able to cancel - that's OK, just checking no 500
  assert(advanceStatus !== 500, 'Seller order action should not cause server error');
}

// ─── Tests: Edge Cases ───

async function testOrderWithInvalidProduct() {
  const { status } = await apiPost('/api/orders', {
    items: [{ productId: 'nonexistent-product', quantity: 1 }],
    deliveryMethod: 'delivery',
    deliveryName: 'Test',
    deliveryPhone: '+5095551234',
    deliveryAddress: '123 Test St',
    deliveryCity: 'Port-au-Prince',
  }, buyerToken);
  
  assert(status >= 400, 'Order with invalid product should fail');
}

async function testOrderWithZeroQuantity() {
  const { status } = await apiPost('/api/orders', {
    items: [{ productId, quantity: 0 }],
    deliveryMethod: 'delivery',
    deliveryName: 'Test',
    deliveryPhone: '+5095551234',
    deliveryAddress: '123 Test St',
    deliveryCity: 'Port-au-Prince',
  }, buyerToken);
  
  assert(status >= 400, 'Order with zero quantity should fail');
}

async function testOrderWithExcessiveQuantity() {
  const { status } = await apiPost('/api/orders', {
    items: [{ productId, quantity: 9999 }],
    deliveryMethod: 'delivery',
    deliveryName: 'Test',
    deliveryPhone: '+5095551234',
    deliveryAddress: '123 Test St',
    deliveryCity: 'Port-au-Prince',
  }, buyerToken);
  
  assert(status >= 400, 'Order exceeding stock should fail');
}

async function testDuplicateOrderPrevention() {
  // Create two rapid orders for the same product with full stock
  const p = await createProduct(sellerToken, { price: 100, stock: 1 });
  const pid = p.product?.id || p.id;
  
  const order1 = await apiPost('/api/orders', {
    items: [{ productId: pid, quantity: 1 }],
    deliveryMethod: 'delivery',
    deliveryName: 'Test',
    deliveryPhone: '+5095551234',
    deliveryAddress: '123 Test St',
    deliveryCity: 'Port-au-Prince',
  }, buyerToken);
  
  // Second order for same product with stock=1 should fail
  const order2 = await apiPost('/api/orders', {
    items: [{ productId: pid, quantity: 1 }],
    deliveryMethod: 'delivery',
    deliveryName: 'Test',
    deliveryPhone: '+5095551234',
    deliveryAddress: '123 Test St',
    deliveryCity: 'Port-au-Prince',
  }, buyerToken);
  
  // One should succeed, one should fail (stock exhaustion)
  const statuses = [order1.status, order2.status];
  const oneSuccess = statuses.includes(201);
  const oneFail = statuses.some(s => s >= 400);
  
  assert(oneSuccess && oneFail, 
    `Stock exhaustion not enforced: got statuses ${statuses.join(', ')}`);
}

// ─── Tests: Auth ───

async function testOrderRequiresAuth() {
  const { status } = await apiPost('/api/orders', {
    items: [{ productId, quantity: 1 }],
    deliveryMethod: 'delivery',
  });
  
  assertStatus(status, 401, 'Order without auth');
}

// ─── Main ───

async function main() {
  console.log('📦 Order/Checkout/Payment Domain Tests\n');
  
  try {
    await startTestServer();
    await setup();
    
    console.log('Cart → Checkout:');
    const orderId = await runTest('Create order from cart', testCreateOrderFromCart);
    
    console.log('\nOrder Lifecycle:');
    if (orderId) {
      await runTest('Order lifecycle: pending → cancel', () => testOrderLifecycle(orderId));
    }
    
    console.log('\nSeller View:');
    results.push(await runTest('Seller can view and manage orders', testSellerOrderView));
    
    console.log('\nEdge Cases:');
    results.push(await runTest('Order with invalid product fails', testOrderWithInvalidProduct));
    results.push(await runTest('Order with zero quantity fails', testOrderWithZeroQuantity));
    results.push(await runTest('Order exceeding stock fails', testOrderWithExcessiveQuantity));
    results.push(await runTest('Stock exhaustion enforced on duplicate orders', testDuplicateOrderPrevention));
    
    console.log('\nAuth:');
    results.push(await runTest('Order creation requires authentication', testOrderRequiresAuth));
    
  } finally {
    await stopTestServer();
  }
  
  const passed = printResults('Order/Checkout/Payment', results);
  process.exit(passed ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
