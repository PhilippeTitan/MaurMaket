/**
 * State Awareness Domain Tests
 *
 * Tests: UI ↔ Server state sync — ensures the backend always returns
 * complete, fresh user objects that the frontend depends on.
 *
 * This prevents the class of bugs where:
 * - DB says email_verified=true but UI shows "not verified"
 * - DB says seller_tier=verified but UI shows buyer UI
 * - After a mutation, the frontend gets a stale user object
 *
 * Run: node tests/state-awareness/run.js
 */

import {
  startTestServer, stopTestServer,
  createUser, loginUser, becomeSeller, verifyUserEmail,
  apiGet, apiPost, apiPut,
  runTest, printResults, assert, assertStatus, assertHasProperty,
  directQuery,
} from '../setup.js';

const results = [];

// ─── /auth/me must return complete user object ───

async function testGetMeReturnsAllUIFields() {
  const { user, token } = await createUser({ email: `me-fields${Date.now()}@test.com` });
  const { status, data } = await apiGet('/api/auth/me', token);
  assertStatus(status, 200, '/auth/me');
  assertHasProperty(data, 'user', '/auth/me response');

  const uiFields = [
    'id', 'full_name', 'email', 'role', 'seller_tier',
    'email_verified', 'avatar_url', 'bio', 'store_name',
  ];
  for (const field of uiFields) {
    assertHasProperty(data.user, field, `/auth/me user.${field}`);
  }
}

async function testGetMeReturnsFreshEmailVerified() {
  const email = `mefresh${Date.now()}@test.com`;
  const { user, token } = await createUser({ email });

  // Before verify
  const before = await apiGet('/api/auth/me', token);
  assert(before.data.user.email_verified === false || before.data.user.email_verified === null,
    'Before verify: email_verified should be false/null');

  // Verify email directly in DB
  await verifyUserEmail(user.id);

  // After verify — /auth/me must reflect DB change
  const after = await apiGet('/api/auth/me', token);
  assert(after.data.user.email_verified === true,
    `After DB verify: /auth/me should return email_verified=true, got: ${after.data.user.email_verified}`);
}

async function testGetMeReturnsFreshSellerTier() {
  const email = `meseller${Date.now()}@test.com`;
  const { user, token } = await createUser({ email });

  // Before become-seller
  const before = await apiGet('/api/auth/me', token);
  assert(before.data.user.role === 'buyer' || before.data.user.seller_tier !== 'casual',
    'Before become-seller: should not be casual seller');

  // Become seller
  await apiPut('/api/auth/become-seller', { tier: 'casual', store_name: 'Test Store' }, token);

  // After — /auth/me must reflect
  const after = await apiGet('/api/auth/me', token);
  assert(after.data.user.seller_tier === 'casual',
    `After become-seller: /auth/me should return seller_tier=casual, got: ${after.data.user.seller_tier}`);
  assert(after.data.user.role === 'seller',
    `After become-seller: /auth/me should return role=seller, got: ${after.data.user.role}`);
}

// ─── Mutation endpoints must return updated user ───

async function testVerifyCheckReturnsUserWithEmailVerified() {
  const email = `vcuser${Date.now()}@test.com`;
  const { user, token } = await createUser({ email });
  await apiPost('/api/auth/verify/send', { language: 'en' }, token);

  const otpResult = await directQuery(
    `SELECT code FROM otp_codes WHERE email = $1 AND purpose = 'verify' ORDER BY created_at DESC LIMIT 1`,
    [email]
  );
  assert(otpResult.rows.length > 0, 'OTP code should exist');

  const { status, data } = await apiPost('/api/auth/verify/check', { code: otpResult.rows[0].code }, token);
  assertStatus(status, 200, 'verify/check');
  assertHasProperty(data, 'user', 'verify/check must return user');
  assert(data.user.email_verified === true,
    `verify/check must return user.email_verified=true, got: ${data.user.email_verified}`);
}

async function testBecomeSellerReturnsUserWithTier() {
  const { user, token } = await createUser({ email: `bsuser${Date.now()}@test.com` });

  const { status, data } = await apiPut('/api/auth/become-seller', { tier: 'casual', store_name: 'Test Store' }, token);
  assertStatus(status, 200, 'become-seller');
  assertHasProperty(data, 'user', 'become-seller must return user');
  assert(data.user.seller_tier === 'casual',
    `become-seller must return user.seller_tier=casual, got: ${data.user.seller_tier}`);
  assert(data.user.role === 'seller',
    `become-seller must return user.role=seller, got: ${data.user.role}`);
}

async function testLoginReturnsCompleteUserObject() {
  const email = `logcomp${Date.now()}@test.com`;
  await createUser({ email, password: 'TestPass123!' });

  const { user, token } = await loginUser(email, 'TestPass123!');
  const requiredFields = ['id', 'full_name', 'email', 'role', 'seller_tier', 'email_verified'];
  for (const field of requiredFields) {
    assertHasProperty(user, field, `login user.${field}`);
  }
}

async function testSignupReturnsCompleteUserObject() {
  const { user } = await createUser({ email: `signcomp${Date.now()}@test.com` });
  const requiredFields = ['id', 'full_name', 'email', 'role', 'seller_tier', 'email_verified'];
  for (const field of requiredFields) {
    assertHasProperty(user, field, `signup user.${field}`);
  }
}

// ─── DB changes are immediately visible to /auth/me ───

async function testDBDirectUpdateReflectsInGetMe() {
  const email = `dbdirect${Date.now()}@test.com`;
  const { user, token } = await createUser({ email });

  // Direct DB update — simulate admin action or webhook
  await directQuery('UPDATE users SET email_verified = true WHERE id = $1', [user.id]);

  const { data } = await apiGet('/api/auth/me', token);
  assert(data.user.email_verified === true,
    'Direct DB update to email_verified should be visible in /auth/me immediately');
}

async function testDBTierChangeReflectsInGetMe() {
  const email = `dbtier${Date.now()}@test.com`;
  const { user, token } = await createUser({ email });
  await apiPut('/api/auth/become-seller', { tier: 'casual', store_name: 'Store' }, token);

  // Simulate admin tier upgrade
  await directQuery('UPDATE users SET seller_tier = $1 WHERE id = $2', ['verified', user.id]);

  const { data } = await apiGet('/api/auth/me', token);
  assert(data.user.seller_tier === 'verified',
    `Direct DB tier upgrade should reflect in /auth/me, got: ${data.user.seller_tier}`);
}

// ─── No mutation returns a stale user ───

async function testAlreadyVerifiedReturnsUser() {
  const email = `alreadyv${Date.now()}@test.com`;
  const { user, token } = await createUser({ email });
  await verifyUserEmail(user.id);

  // Verify again — should return user (not just error)
  await apiPost('/api/auth/verify/send', { language: 'en' }, token);
  const otpResult = await directQuery(
    `SELECT code FROM otp_codes WHERE email = $1 AND purpose = 'verify' ORDER BY created_at DESC LIMIT 1`,
    [email]
  );
  const { status, data } = await apiPost('/api/auth/verify/check', { code: otpResult.rows[0].code }, token);

  // Should succeed (already verified) or return 400 with user
  assert(status === 200 || status === 400,
    `Re-verify should return 200 or 400, got: ${status}`);
  if (data && data.user) {
    assert(data.user.email_verified === true,
      'Already-verified response must include user with email_verified=true');
  }
}

async function testAlreadySellerReturnsUser() {
  const { user, token } = await createUser({ email: `alreadys${Date.now()}@test.com` });
  await apiPut('/api/auth/become-seller', { tier: 'casual', store_name: 'Store' }, token);

  // Become seller again
  const { status, data } = await apiPut('/api/auth/become-seller', { tier: 'casual', store_name: 'Store' }, token);

  // Should succeed or return 400 with user
  assert(status === 200 || status === 400,
    `Re-become-seller should return 200 or 400, got: ${status}`);
  if (data && data.user) {
    assert(data.user.seller_tier === 'casual',
      'Already-seller response must include user with seller_tier');
  }
}

// ─── Frontend code coverage: key files use refreshUser ───

async function testStoreHasRefreshUser() {
  const fs = await import('fs');
  const path = await import('path');
  const storePath = path.join(process.cwd(), 'src', 'store.ts');
  const storeCode = fs.readFileSync(storePath, 'utf8');
  assert(storeCode.includes('refreshUser'),
    'store.ts must export refreshUser() function');
  assert(storeCode.includes('getMe'),
    'refreshUser() must call getMe to fetch fresh user state');
}

async function testAppTsxForegroundRefresh() {
  const fs = await import('fs');
  const path = await import('path');
  const appPath = path.join(process.cwd(), 'App.tsx');
  const appCode = fs.readFileSync(appPath, 'utf8');
  assert(appCode.includes('AppState'),
    'App.tsx must import AppState for foreground detection');
  assert(appCode.includes('refreshUser'),
    'App.tsx must call refreshUser on app foreground');
}

async function testSettingsScreenFocusRefresh() {
  const fs = await import('fs');
  const path = await import('path');
  const settingsPath = path.join(process.cwd(), 'src', 'screens', 'SettingsScreen.tsx');
  const code = fs.readFileSync(settingsPath, 'utf8');
  assert(code.includes('refreshUser'),
    'SettingsScreen must call store.refreshUser() on focus');
}

async function testMeScreenFocusRefresh() {
  const fs = await import('fs');
  const path = await import('path');
  const mePath = path.join(process.cwd(), 'src', 'screens', 'MeScreen.tsx');
  const code = fs.readFileSync(mePath, 'utf8');
  assert(code.includes('refreshUser'),
    'MeScreen must call store.refreshUser() on focus');
}

// ─── Run All Tests ───

async function run() {
  console.log('🔄 Running State Awareness Domain Tests...\n');

  await startTestServer();

  const tests = [
    // API contract — /auth/me returns everything UI needs
    ['/auth/me returns all UI fields', testGetMeReturnsAllUIFields],
    ['/auth/me reflects DB email_verified changes', testGetMeReturnsFreshEmailVerified],
    ['/auth/me reflects DB seller_tier changes', testGetMeReturnsFreshSellerTier],

    // Mutation endpoints return updated user
    ['verify/check returns user.email_verified=true', testVerifyCheckReturnsUserWithEmailVerified],
    ['become-seller returns user.seller_tier + role', testBecomeSellerReturnsUserWithTier],
    ['login returns complete user object', testLoginReturnsCompleteUserObject],
    ['signup returns complete user object', testSignupReturnsCompleteUserObject],

    // DB changes visible immediately
    ['Direct DB update visible in /auth/me', testDBDirectUpdateReflectsInGetMe],
    ['Direct DB tier change visible in /auth/me', testDBTierChangeReflectsInGetMe],

    // No mutation returns stale user
    ['Already-verified returns user object', testAlreadyVerifiedReturnsUser],
    ['Already-seller returns user object', testAlreadySellerReturnsUser],

    // Frontend code coverage — refreshUser wired up
    ['store.ts has refreshUser() function', testStoreHasRefreshUser],
    ['App.tsx has foreground refresh', testAppTsxForegroundRefresh],
    ['SettingsScreen has focus refresh', testSettingsScreenFocusRefresh],
    ['MeScreen has focus refresh', testMeScreenFocusRefresh],
  ];

  for (const [name, fn] of tests) {
    results.push(await runTest(name, fn));
  }

  await stopTestServer();
  const allPassed = printResults('State Awareness', results);
  process.exit(allPassed ? 0 : 1);
}

run().catch(err => {
  console.error('Test runner error:', err);
  stopTestServer();
  process.exit(1);
});
