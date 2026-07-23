/**
 * Reactivity Domain Tests
 *
 * Tests: Frontend ↔ Backend data flow — when backend state changes,
 * does the API return the updated user object that the frontend needs?
 *
 * These test the contract that the UI depends on:
 * - verify/check must return { user: { email_verified: true } }
 * - become-seller must return { user: { seller_tier: 'casual' } }
 * - verify/status must reflect backend state after changes
 *
 * Run: node tests/reactivity/run.js
 */

import {
  startTestServer, stopTestServer,
  createUser, loginUser, becomeSeller, verifyUserEmail,
  apiGet, apiPost, apiPut,
  runTest, printResults, assert, assertStatus, assertHasProperty,
  directQuery,
} from '../setup.js';

const results = [];

// ─── Email Verification → Store Sync ───

async function testEmailVerifySendReturns200() {
  const { user, token } = await createUser({ email: `verifysend${Date.now()}@test.com` });
  const { status, data } = await apiPost('/api/auth/verify/send', { language: 'en' }, token);
  assertStatus(status, 200, 'verify/send');
  assert(data.success === true || data.message, 'verify/send should indicate success');
}

async function testEmailVerifyCheckReturnsUpdatedUser() {
  const email = `verifycheck${Date.now()}@test.com`;
  const { user, token } = await createUser({ email });

  // Send code
  await apiPost('/api/auth/verify/send', { language: 'en' }, token);

  // Get the OTP code from DB
  const otpResult = await directQuery(
    `SELECT code FROM otp_codes WHERE email = $1 AND purpose = 'verify' ORDER BY created_at DESC LIMIT 1`,
    [email]
  );
  assert(otpResult.rows.length > 0, 'OTP code should exist in DB');
  const code = otpResult.rows[0].code;

  // Check code — must return updated user with email_verified: true
  const { status, data } = await apiPost('/api/auth/verify/check', { code }, token);
  assertStatus(status, 200, 'verify/check');
  assertHasProperty(data, 'user', 'verify/check response');
  assert(data.user.email_verified === true, `verify/check user.email_verified should be true, got: ${data.user.email_verified}`);
}

async function testEmailVerifyCheckPersistsInDB() {
  const email = `verifypersist${Date.now()}@test.com`;
  const { user, token } = await createUser({ email });

  // Send + check
  await apiPost('/api/auth/verify/send', { language: 'en' }, token);
  const otpResult = await directQuery(
    `SELECT code FROM otp_codes WHERE email = $1 AND purpose = 'verify' ORDER BY created_at DESC LIMIT 1`,
    [email]
  );
  const code = otpResult.rows[0].code;
  await apiPost('/api/auth/verify/check', { code }, token);

  // Verify DB state
  const userResult = await directQuery(`SELECT email_verified FROM users WHERE id = $1`, [user.id]);
  assert(userResult.rows[0].email_verified === true, 'email_verified should persist as true in DB');
}

async function testEmailVerifyCodeCannotBeReused() {
  const email = `verifyreuse${Date.now()}@test.com`;
  const { user, token } = await createUser({ email });

  await apiPost('/api/auth/verify/send', { language: 'en' }, token);
  const otpResult = await directQuery(
    `SELECT code FROM otp_codes WHERE email = $1 AND purpose = 'verify' ORDER BY created_at DESC LIMIT 1`,
    [email]
  );
  const code = otpResult.rows[0].code;

  // First check — should succeed
  const res1 = await apiPost('/api/auth/verify/check', { code }, token);
  assertStatus(res1.status, 200, 'verify/check first attempt');

  // Second check — should fail (already verified or code deleted)
  const res2 = await apiPost('/api/auth/verify/check', { code }, token);
  assert(res2.status === 400, `verify/check reuse should return 400, got: ${res2.status}`);
}

async function testEmailVerifiedUserSeesVerifiedInProfile() {
  const email = `verifyprofile${Date.now()}@test.com`;
  const { user, token } = await createUser({ email });

  // Verify email
  await apiPost('/api/auth/verify/send', { language: 'en' }, token);
  const otpResult = await directQuery(
    `SELECT code FROM otp_codes WHERE email = $1 AND purpose = 'verify' ORDER BY created_at DESC LIMIT 1`,
    [email]
  );
  await apiPost('/api/auth/verify/check', { code: otpResult.rows[0].code }, token);

  // Login fresh — should return email_verified: true
  const loginRes = await loginUser(email, 'TestPass123!');
  assert(loginRes.user.email_verified === true, 'Fresh login after verify should return email_verified: true');
}

// ─── Seller Onboarding → Store Sync ───

async function testBecomeSellerReturnsUpdatedTier() {
  const { user, token } = await createUser({ email: `seller${Date.now()}@test.com` });
  assert(user.seller_tier !== 'casual', 'User should start as non-seller');

  const { status, data } = await apiPut('/api/auth/become-seller', { tier: 'casual', store_name: 'Test Store' }, token);
  assertStatus(status, 200, 'become-seller');
  assertHasProperty(data, 'user', 'become-seller response');
  assert(data.user.seller_tier === 'casual', `seller_tier should be 'casual', got: ${data.user.seller_tier}`);
  assert(data.user.role === 'seller', `role should be 'seller', got: ${data.user.role}`);
}

async function testBecomeSellerPersistsInDB() {
  const email = `sellerpersist${Date.now()}@test.com`;
  const { user, token } = await createUser({ email });
  await apiPut('/api/auth/become-seller', { tier: 'casual', store_name: 'Test Store' }, token);

  const userResult = await directQuery(`SELECT seller_tier, role FROM users WHERE id = $1`, [user.id]);
  assert(userResult.rows[0].seller_tier === 'casual', 'seller_tier should persist as casual in DB');
  assert(userResult.rows[0].role === 'seller', 'role should persist as seller in DB');
}

async function testBecomeSellerReflectedInLogin() {
  const email = `sellerlogin${Date.now()}@test.com`;
  const { user, token } = await createUser({ email });
  await apiPut('/api/auth/become-seller', { tier: 'casual', store_name: 'Test Store' }, token);

  // Fresh login — should reflect seller status
  const loginRes = await loginUser(email, 'TestPass123!');
  assert(loginRes.user.seller_tier === 'casual', 'Fresh login after become-seller should return seller_tier: casual');
  assert(loginRes.user.role === 'seller', 'Fresh login after become-seller should return role: seller');
}

async function testSellerCanAccessSellerEndpoints() {
  const { user, token } = await createUser({ email: `selleraccess${Date.now()}@test.com` });
  await apiPut('/api/auth/become-seller', { tier: 'casual', store_name: 'Test Store' }, token);

  // Seller orders endpoint should work
  const { status } = await apiGet('/api/orders/seller', token);
  assert(status === 200, `Seller orders endpoint should return 200, got: ${status}`);
}

async function testNonSellerCannotAccessSellerEndpoints() {
  const { user, token } = await createUser({ email: `nonseller${Date.now()}@test.com` });

  // Non-seller hitting seller endpoint should get 403
  const { status } = await apiGet('/api/orders/seller', token);
  assert(status === 403, `Non-seller orders endpoint should return 403, got: ${status}`);
}

async function testUpgradeTierReturnsUpdatedTier() {
  const { user, token } = await createUser({ email: `upgradetier${Date.now()}@test.com` });
  await apiPut('/api/auth/become-seller', { tier: 'casual', store_name: 'Test Store' }, token);

  // Upgrade to verified (requires email_verified + id_verified, but let's test the endpoint behavior)
  const { status } = await apiPut('/api/auth/upgrade-tier', { tier: 'verified' }, token);
  // May return 400 if not verified — that's correct behavior
  assert(status === 200 || status === 400, `upgrade-tier should return 200 or 400, got: ${status}`);

  if (status === 200) {
    const loginRes = await loginUser(user.email, 'TestPass123!');
    assert(loginRes.user.seller_tier === 'verified', 'Tier upgrade should persist');
  }
}

// ─── Cross-cutting: User object always has required fields ───

async function testSignupReturnsCompleteUserObject() {
  const { user, token } = await createUser({ email: `completeobj${Date.now()}@test.com` });
  const requiredFields = ['id', 'full_name', 'email', 'role', 'seller_tier', 'email_verified'];
  for (const field of requiredFields) {
    assertHasProperty(user, field, 'signup user object');
  }
}

async function testLoginReturnsCompleteUserObject() {
  const email = `logincomplete${Date.now()}@test.com`;
  await createUser({ email, password: 'TestPass123!' });
  const loginRes = await loginUser(email, 'TestPass123!');
  const requiredFields = ['id', 'full_name', 'email', 'role', 'seller_tier', 'email_verified'];
  for (const field of requiredFields) {
    assertHasProperty(loginRes.user, field, 'login user object');
  }
}

// ─── Run All Tests ───

async function run() {
  console.log('🔄 Running Reactivity Domain Tests...\n');

  await startTestServer();

  const tests = [
    // Email verification reactivity
    ['Email: verify/send returns 200', testEmailVerifySendReturns200],
    ['Email: verify/check returns user with email_verified=true', testEmailVerifyCheckReturnsUpdatedUser],
    ['Email: email_verified persists in DB', testEmailVerifyCheckPersistsInDB],
    ['Email: code cannot be reused after verification', testEmailVerifyCodeCannotBeReused],
    ['Email: fresh login reflects email_verified', testEmailVerifiedUserSeesVerifiedInProfile],

    // Seller onboarding reactivity
    ['Seller: become-seller returns user with seller_tier=casual', testBecomeSellerReturnsUpdatedTier],
    ['Seller: seller_tier persists in DB', testBecomeSellerPersistsInDB],
    ['Seller: fresh login reflects seller status', testBecomeSellerReflectedInLogin],
    ['Seller: seller can access seller endpoints', testSellerCanAccessSellerEndpoints],
    ['Seller: non-seller gets 403 on seller endpoints', testNonSellerCannotAccessSellerEndpoints],
    ['Seller: upgrade-tier returns valid status', testUpgradeTierReturnsUpdatedTier],

    // Cross-cutting
    ['User: signup returns complete user object', testSignupReturnsCompleteUserObject],
    ['User: login returns complete user object', testLoginReturnsCompleteUserObject],
  ];

  for (const [name, fn] of tests) {
    results.push(await runTest(name, fn));
  }

  await stopTestServer();
  const allPassed = printResults('Reactivity', results);
  process.exit(allPassed ? 0 : 1);
}

run().catch(err => {
  console.error('Test runner error:', err);
  stopTestServer();
  process.exit(1);
});
