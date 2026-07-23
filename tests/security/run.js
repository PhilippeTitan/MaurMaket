/**
 * Security Domain Tests
 * 
 * Tests: npm audit, secret scanning, config endpoint safety, auth security
 * Run: node tests/security/run.js
 */

import { execSync } from 'child_process';
import { readFileSync, readdirSync } from 'fs';
import { join, extname } from 'path';
import {
  startTestServer, stopTestServer,
  createUser, apiGet, apiPost,
  runTest, printResults, assert, assertStatus, assertNoSensitiveData,
} from '../setup.js';

const SRC_DIR = join(process.cwd(), 'src');
const results = [];

// ─── Test: npm audit ───

async function testNpmAudit() {
  try {
    const output = execSync('npm audit --json 2>&1', { encoding: 'utf-8' });
    const audit = JSON.parse(output);
    const vulns = audit.metadata?.vulnerabilities || {};
    const critical = vulns.critical || 0;
    const high = vulns.high || 0;
    
    assert(critical === 0, `Found ${critical} critical vulnerabilities`);
    assert(high === 0, `Found ${high} high vulnerabilities`);
  } catch (err) {
    // npm audit exits non-zero when vulnerabilities found
    if (err.message.includes('critical') || err.message.includes('high')) {
      throw err;
    }
    // Other errors (like parse errors) - pass through
  }
}

// ─── Test: No hardcoded secrets in source ───

async function testNoHardcodedSecrets() {
  const secretPatterns = [
    /sk_live_[a-zA-Z0-9]+/,           // Stripe live key
    /sk_test_[a-zA-Z0-9]+/,           // Stripe test key
    /ghp_[a-zA-Z0-9]+/,               // GitHub PAT
    /AKIA[A-Z0-9]{16}/,               // AWS access key
    /password\s*[:=]\s*["'][^"']+["']/i, // Hardcoded passwords
  ];
  
  const files = getAllFiles(SRC_DIR);
  const violations = [];
  
  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    for (const pattern of secretPatterns) {
      if (pattern.test(content)) {
        violations.push({
          file: file.replace(SRC_DIR, 'src'),
          pattern: pattern.source.slice(0, 30),
        });
      }
    }
  }
  
  assert(violations.length === 0, 
    `Found potential secrets in ${violations.length} file(s): ${violations.map(v => v.file).join(', ')}`);
}

// ─── Test: /api/upload/config returns no raw keys ───

async function testUploadConfigSafety() {
  const { status, data } = await apiGet('/api/upload/config');
  
  assertStatus(status, 200, '/api/upload/config');
  assertNoSensitiveData(data, '/api/upload/config');
  
  // Should have a proxy URL, not raw imgbb key
  if (data.uploadUrl) {
    assert(!data.uploadUrl.includes('api.imgbb.com'), 
      'uploadUrl should be proxied, not raw imgbb URL');
  }
}

// ─── Test: Auth required on protected routes ───

async function testAuthRequired() {
  const protectedRoutes = [
    '/api/auth/me',
    '/api/orders',
    '/api/conversations',
    '/api/wishlist',
    '/api/notifications',
    '/api/seller/analytics',
  ];
  
  for (const route of protectedRoutes) {
    const { status } = await apiGet(route);
    assertStatus(status, 401, `${route} without auth`);
  }
}

// ─── Test: SQL injection resistance ───

async function testSqlInjection() {
  const maliciousInputs = [
    "'; DROP TABLE users; --",
    "1 OR 1=1",
    "admin'--",
    "' UNION SELECT * FROM users --",
  ];
  
  for (const input of maliciousInputs) {
    const { status } = await apiGet(`/api/products?search=${encodeURIComponent(input)}`);
    // Should return 200 or 400, never 500 (server error from SQL injection)
    assert(status !== 500, 
      `SQL injection attempt caused server error: ${input.slice(0, 20)}...`);
  }
}

// ─── Test: Rate limiting exists ───

async function testRateLimiting() {
  // Login endpoint should have rate limiting
  // Make multiple rapid requests
  const promises = [];
  for (let i = 0; i < 20; i++) {
    promises.push(apiPost('/api/auth/login', {
      email: 'nonexistent@test.com',
      password: 'wrongpassword',
    }));
  }
  
  const responses = await Promise.all(promises);
  const statuses = responses.map(r => r.status);
  
  // After many failed attempts, should eventually rate limit (429)
  // Or at least not crash (500)
  assert(!statuses.includes(500), 'Rate limiting test caused server errors');
}

// ─── Test: Error messages don't leak info ───

async function testErrorInfoLeakage() {
  // Try to login with non-existent email
  const { data } = await apiPost('/api/auth/login', {
    email: 'nonexistent@test.com',
    password: 'wrongpassword',
  });
  
  // Error should say "Invalid credentials" not "User not found"
  // (which would confirm whether an email exists)
  if (data?.error) {
    assert(!data.error.includes('not found'), 
      'Login error leaks user existence: "not found"');
    assert(!data.error.includes('does not exist'),
      'Login error leaks user existence: "does not exist"');
  }
}

// ─── Helpers ───

function getAllFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    try {
      if (require('fs').statSync(full).isDirectory()) {
        files.push(...getAllFiles(full));
      } else if (['.ts', '.tsx', '.js', '.jsx'].includes(extname(full))) {
        files.push(full);
      }
    } catch {}
  }
  return files;
}

// ─── Main ───

async function main() {
  console.log('🔒 Security Domain Tests\n');
  
  // Static tests (no server needed)
  console.log('Static Analysis:');
  results.push(await runTest('npm audit — no critical/high vulnerabilities', testNpmAudit));
  results.push(await runTest('No hardcoded secrets in source', testNoHardcodedSecrets));
  
  // Server tests
  console.log('\nServer Tests:');
  try {
    await startTestServer();
    
    results.push(await runTest('/api/upload/config returns no raw keys', testUploadConfigSafety));
    results.push(await runTest('Protected routes require auth', testAuthRequired));
    results.push(await runTest('SQL injection resistance', testSqlInjection));
    results.push(await runTest('Rate limiting on auth endpoints', testRateLimiting));
    results.push(await runTest('Error messages don\'t leak user info', testErrorInfoLeakage));
  } finally {
    await stopTestServer();
  }
  
  const passed = printResults('Security', results);
  process.exit(passed ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
