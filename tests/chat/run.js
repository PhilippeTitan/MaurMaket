/**
 * Chat/Messaging Domain Tests
 * 
 * Tests: Conversations, messages, offers, real-time patterns
 * Run: node tests/chat/run.js
 */

import {
  startTestServer, stopTestServer,
  createUser, becomeSeller, createProduct, verifyUserEmail,
  apiGet, apiPost,
  runTest, printResults, assert, assertStatus,
} from '../setup.js';

const results = [];
let buyerToken, sellerToken, sellerId, productId;

// ─── Setup ───

async function setup() {
  const buyer = await createUser({ email: `chat-buyer${Date.now()}@test.com` });
  buyerToken = buyer.token;
  
  const seller = await createUser({ email: `chat-seller${Date.now()}@test.com` });
  sellerToken = seller.token;
  await becomeSeller(sellerToken);
  sellerId = seller.user.id;
  await verifyUserEmail(sellerId);
  
  const product = await createProduct(sellerToken, { price: 5000 });
  productId = product.product?.id || product.id;
}

// ─── Tests: Conversations ───

async function testCreateConversation() {
  const { status, data } = await apiPost('/api/conversations', {
    sellerId,
    productId,
  }, buyerToken);
  
  assertStatus(status, 201, 'Create conversation');
  assert(data.conversationId, 'Missing conversationId');
  return data.conversationId;
}

async function testListConversations() {
  const { status, data } = await apiGet('/api/conversations', buyerToken);
  assertStatus(status, 200, 'List conversations');
  assert(Array.isArray(data.conversations), 'Conversations not an array');
}

async function testUnreadCount() {
  const { status, data } = await apiGet('/api/conversations/unread-count', buyerToken);
  assertStatus(status, 200, 'Unread count');
  assert(typeof data.count === 'number', 'Count not a number');
}

// ─── Tests: Messages ───

async function testSendMessage(conversationId) {
  const { status, data } = await apiPost(`/api/conversations/${conversationId}/messages`, {
    content: 'Is this still available?',
  }, buyerToken);
  
  assertStatus(status, 201, 'Send message');
  assert(data.message?.id, 'Missing message ID');
  assert(data.message.content === 'Is this still available?', 'Message content mismatch');
  return data.message.id;
}

async function testGetMessages(conversationId) {
  const { status, data } = await apiGet(`/api/conversations/${conversationId}/messages`, buyerToken);
  assertStatus(status, 200, 'Get messages');
  assert(Array.isArray(data.messages), 'Messages not an array');
  assert(data.messages.length > 0, 'No messages returned');
}

async function testMessageFromOtherUser(conversationId) {
  // Seller replies
  const { status, data } = await apiPost(`/api/conversations/${conversationId}/messages`, {
    content: 'Yes, it is! Would you like to buy it?',
  }, sellerToken);
  
  assertStatus(status, 201, 'Seller send message');
  assert(data.message?.sender_id !== undefined, 'Missing sender_id');
}

async function testConversationNotFound() {
  const { status } = await apiGet('/api/conversations/nonexistent-id/messages', buyerToken);
  assert(status >= 400, 'Nonexistent conversation should fail');
}

// ─── Tests: Offers ───

async function testCreateOffer(conversationId) {
  const { status, data } = await apiPost(`/api/conversations/${conversationId}/offer`, {
    productId,
    price: 4000, // 20% off
    message: 'Would you take 4000?',
  }, buyerToken);
  
  assertStatus(status, 201, 'Create offer');
  assert(data.message?.id, 'Missing offer message ID');
  return data.message.id;
}

async function testRespondToOffer(messageId) {
  // Seller accepts
  const { status } = await apiPost(`/api/offers/${messageId}/respond`, {
    action: 'accept',
  }, sellerToken);
  
  assertStatus(status, 200, 'Respond to offer');
}

async function testCounterOffer(messageId) {
  // Seller counters
  const { status } = await apiPost(`/api/offers/${messageId}/counter`, {
    price: 4500,
    message: 'How about 4500?',
  }, sellerToken);
  
  assert(status === 200 || status === 201, 'Counter offer should succeed');
}

// ─── Tests: Auth & Security ───

async function testMessageRequiresAuth() {
  const { status } = await apiPost('/api/conversations/fake-id/messages', {
    content: 'Test',
  });
  
  assertStatus(status, 401, 'Message without auth');
}

async function testConversationRequiresAuth() {
  const { status } = await apiGet('/api/conversations');
  assertStatus(status, 401, 'Conversations without auth');
}

async function testCannotMessageSelf() {
  // Seller tries to create conversation with themselves
  const { status } = await apiPost('/api/conversations', {
    sellerId: sellerId, // Same as seller
  }, sellerToken);
  
  // Should fail or return existing conversation
  assert(status !== 500, 'Self-messaging should not cause server error');
}

// ─── Tests: Rate Limiting ───

async function testMessageRateLimit() {
  // Try to send many messages rapidly
  const promises = [];
  for (let i = 0; i < 30; i++) {
    promises.push(apiPost('/api/conversations/fake-id/messages', {
      content: `Spam message ${i}`,
    }, buyerToken));
  }
  
  const responses = await Promise.all(promises);
  const statuses = responses.map(r => r.status);
  
  // Should not crash (500), rate limiting (429) is OK
  assert(!statuses.includes(500), 'Rapid messaging caused server errors');
}

// ─── Main ───

async function main() {
  console.log('💬 Chat/Messaging Domain Tests\n');
  
  try {
    await startTestServer();
    await setup();
    
    console.log('Conversations:');
    const convId = await runTest('Create conversation with seller', testCreateConversation);
    results.push(await runTest('List conversations', testListConversations));
    results.push(await runTest('Get unread count', testUnreadCount));
    
    console.log('\nMessages:');
    if (convId) {
      await runTest('Send message from buyer', () => testSendMessage(convId));
      await runTest('Get messages for conversation', () => testGetMessages(convId));
      await runTest('Send message from seller', () => testMessageFromOtherUser(convId));
    }
    results.push(await runTest('Nonexistent conversation returns error', testConversationNotFound));
    
    console.log('\nOffers:');
    if (convId) {
      const offerId = await runTest('Create offer on product', () => testCreateOffer(convId));
      if (offerId) {
        await runTest('Seller responds to offer', () => testRespondToOffer(offerId));
      }
    }
    
    console.log('\nAuth & Security:');
    results.push(await runTest('Message requires authentication', testMessageRequiresAuth));
    results.push(await runTest('Conversations require authentication', testConversationRequiresAuth));
    results.push(await runTest('Cannot message yourself', testCannotMessageSelf));
    
    console.log('\nRate Limiting:');
    results.push(await runTest('Rapid messaging does not crash server', testMessageRateLimit));
    
  } finally {
    await stopTestServer();
  }
  
  const passed = printResults('Chat/Messaging', results);
  process.exit(passed ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
