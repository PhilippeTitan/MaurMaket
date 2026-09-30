import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'https://example.supabase.co/';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'server-only-test-key';
process.env.BETTER_AUTH_SECRET = 'offline-test-secret';

const { userTopic, publishUserEvent, realtimeEnabled } = await import('../src/utils/realtime.js');

const topicA = userTopic('user-a');
assert.equal(topicA, userTopic('user-a'));
assert.notEqual(topicA, userTopic('user-b'));
assert.match(topicA, /^u_[0-9a-f]{40}$/);
assert.ok(!topicA.includes('user-a'));
assert.equal(realtimeEnabled(), true);

const calls = [];
globalThis.fetch = async (url, options) => {
  calls.push({ url, options });
  return { ok: true, status: 202 };
};
publishUserEvent('user-a', 'payment_confirmed');
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(calls.length, 1);
assert.equal(calls[0].url, 'https://example.supabase.co/realtime/v1/api/broadcast');
assert.equal(calls[0].options.headers.apikey, 'server-only-test-key');
const payload = JSON.parse(calls[0].options.body).messages[0];
assert.equal(payload.topic, topicA);
assert.equal(payload.event, 'ping');
assert.deepEqual(payload.payload, { type: 'payment_confirmed' });
assert.equal(payload.private, false);

globalThis.fetch = async () => { throw new Error('mock network failure'); };
assert.doesNotThrow(() => publishUserEvent('user-a', 'payment_failed'));
await new Promise(resolve => setTimeout(resolve, 0));

delete process.env.SUPABASE_URL;
assert.equal(realtimeEnabled(), false);
const callCount = calls.length;
globalThis.fetch = async (...args) => calls.push(args);
publishUserEvent('user-a', 'payment_failed');
assert.equal(calls.length, callCount);

console.log('realtime-check: passed');
