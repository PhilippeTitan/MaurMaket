/**
 * Shared test infrastructure for MaurMaket CI
 * 
 * Provides: test server, auth helpers, DB cleanup, fixtures
 * Run: node tests/setup.js
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

const TEST_PORT = 3099;
const SERVER_PATH = join(process.cwd(), 'server.js');

let serverProcess = null;
let serverUrl = `http://localhost:${TEST_PORT}`;
let pgPool = null;

// ─── DB Helpers (direct connection for test setup) ───

async function getPool() {
  if (pgPool) return pgPool;
  const { Pool } = await import('pg');
  const dbUrl = process.env.DATABASE_URL || process.env.TEST_DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5432/maurmaket_test';
  pgPool = new Pool({ connectionString: dbUrl });
  return pgPool;
}

export async function directQuery(sql, params = []) {
  const pool = await getPool();
  return pool.query(sql, params);
}

// ─── Server Management ───

export async function startTestServer() {
  // Set test environment
  process.env.NODE_ENV = 'test';
  process.env.PORT = String(TEST_PORT);
  
  // Use Supabase for CI tests (or local if available)
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 
      'postgresql://postgres:postgres@localhost:5432/maurmaket_test';
  }

  // Start server as child process
  const { spawn } = await import('child_process');
  serverProcess = spawn('node', [SERVER_PATH], {
    env: { ...process.env, PORT: String(TEST_PORT) },
    stdio: 'pipe',
    detached: false,
  });

  serverProcess.stderr.on('data', (data) => {
    // Suppress server logs during tests unless DEBUG
    if (process.env.DEBUG) {
      process.stderr.write(data);
    }
  });

  // Wait for server to be ready
  await waitForServer(serverUrl, 15000);
  return serverUrl;
}

export async function stopTestServer() {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  }
}

async function waitForServer(url, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) return;
    } catch {
      // Server not ready yet
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`Server did not start within ${timeoutMs}ms`);
}

// ─── Auth Helpers ───

export async function createUser(userData = {}) {
  const timestamp = Date.now();
  const defaultData = {
    fullName: `Test User ${timestamp}`,
    email: `test${timestamp}@maurmaket.test`,
    password: 'TestPass123!',
    phone: `+509555${String(timestamp).slice(-6)}`,
  };
  const data = { ...defaultData, ...userData };

  const res = await fetch(`${serverUrl}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to create user: ${err}`);
  }

  const result = await res.json();
  return { ...result, password: data.password };
}

export async function loginUser(email, password) {
  const res = await fetch(`${serverUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) throw new Error('Login failed');
  return res.json();
}

export async function becomeSeller(token, sellerData = {}) {
  const res = await fetch(`${serverUrl}/api/auth/become-seller`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      store_name: `Test Store ${Date.now()}`,
      ...sellerData,
    }),
  });

  if (!res.ok) throw new Error('Failed to become seller');
  return res.json();
}

export async function verifyUserEmail(userId) {
  await directQuery('UPDATE users SET email_verified = true WHERE id = $1', [userId]);
}

// ─── API Helpers ───

export async function apiGet(path, token) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const res = await fetch(`${serverUrl}${path}`, { headers });
  return { status: res.status, data: await res.json().catch(() => null) };
}

export async function apiPost(path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const res = await fetch(`${serverUrl}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

export async function apiPut(path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const res = await fetch(`${serverUrl}${path}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

export async function apiDelete(path, token) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const res = await fetch(`${serverUrl}${path}`, {
    method: 'DELETE',
    headers,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

// ─── Fixtures ───

export async function createProduct(token, productData = {}) {
  const timestamp = Date.now();
  const defaultData = {
    name: `Test Product ${timestamp}`,
    description: `Test description ${timestamp}`,
    price: 1000,
    categoryId: 'cat-electronics',
    stock: 10,
    images: [{ image_url: 'https://placehold.co/400x400', is_primary: true }],
  };
  const data = { ...defaultData, ...productData };

  const res = await apiPost('/api/products', data, token);
  if (res.status !== 201) throw new Error(`Failed to create product (${res.status}): ${JSON.stringify(res.data)}`);
  return res.data;
}

export async function createConversation(token, sellerId, productId) {
  const res = await apiPost('/api/conversations', {
    sellerId,
    productId,
  }, token);
  if (res.status !== 201) throw new Error(`Failed to create conversation: ${JSON.stringify(res.data)}`);
  return res.data;
}

export async function sendMessage(token, conversationId, content) {
  const res = await apiPost(`/api/conversations/${conversationId}/messages`, {
    content,
  }, token);
  if (res.status !== 201) throw new Error(`Failed to send message: ${JSON.stringify(res.data)}`);
  return res.data;
}

// ─── Assertions ───

export function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

export function assertStatus(actual, expected, context) {
  if (actual !== expected) {
    throw new Error(`${context}: expected status ${expected}, got ${actual}`);
  }
}

export function assertHasProperty(obj, prop, context) {
  if (!(prop in obj)) {
    throw new Error(`${context}: missing property '${prop}'`);
  }
}

export function assertNoSensitiveData(data, context) {
  const sensitiveKeys = ['password', 'password_hash', 'secret', 'api_key', 'token'];
  const jsonStr = JSON.stringify(data);
  
  for (const key of sensitiveKeys) {
    if (jsonStr.includes(key) && !jsonStr.includes(`${key}_hash`)) {
      // Check if it's actually leaking the value
      const regex = new RegExp(`"${key}"\\s*:\\s*"[^"]{3,}"`, 'i');
      if (regex.test(jsonStr) && !key.includes('token')) {
        throw new Error(`${context}: potential sensitive data leak - '${key}' found in response`);
      }
    }
  }
}

// ─── Test Runner ───

export async function runTest(name, fn) {
  const start = Date.now();
  try {
    await fn();
    const duration = Date.now() - start;
    console.log(`  ✅ ${name} (${duration}ms)`);
    return { name, passed: true, duration };
  } catch (err) {
    const duration = Date.now() - start;
    console.log(`  ❌ ${name} (${duration}ms)`);
    console.log(`     ${err.message}`);
    return { name, passed: false, duration, error: err.message };
  }
}

export function printResults(domain, results) {
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;
  
  console.log(`\n📊 ${domain}: ${passed}/${total} passed`);
  
  if (failed > 0) {
    console.log(`   ${failed} test(s) failed:`);
    for (const r of results.filter(r => !r.passed)) {
      console.log(`   - ${r.name}: ${r.error}`);
    }
  }
  
  return failed === 0;
}
