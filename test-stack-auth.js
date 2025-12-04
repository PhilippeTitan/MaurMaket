#!/usr/bin/env node

/**
 * Test Stack Auth Integration Locally
 * Usage: node test-stack-auth.js
 */

const http = require('http');
const https = require('https');
const querystring = require('querystring');

const PROJECT_ID = 'c3b3d35e-d752-4d62-8757-12521977c4d1';
const PCK = 'pck_4gqygdjnxqz2w5abt5c2pztfm5v1jtkte2vn3ewkraex8';

// Test email/password (use a test account or disposable email)
const TEST_EMAIL = 'test-' + Date.now() + '@example.com';
const TEST_PASSWORD = 'TestPassword123!';

console.log('🔐 Stack Auth Integration Test\n');
console.log('Project ID:', PROJECT_ID);
console.log('Test Email:', TEST_EMAIL);
console.log('Test Password:', TEST_PASSWORD);
console.log('\n');

// Helper to make HTTPS requests
function makeRequest(options, body) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve({ status: res.statusCode, headers: res.headers, body: json });
                } catch (e) {
                    resolve({ status: res.statusCode, headers: res.headers, body: data });
                }
            });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function testSignup() {
    console.log('📝 Testing Signup...');
    const url = `https://api.stack-auth.com/api/v1/projects/${PROJECT_ID}/users/email-password/sign-up`;
    
    const options = {
        hostname: 'api.stack-auth.com',
        path: `/api/v1/projects/${PROJECT_ID}/users/email-password/sign-up`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Stack-Publishable-Key': PCK
        }
    };

    try {
        const res = await makeRequest(options, {
            email: TEST_EMAIL,
            password: TEST_PASSWORD
        });
        
        console.log(`  Status: ${res.status}`);
        console.log(`  Response:`, JSON.stringify(res.body, null, 2));
        
        if (res.status === 200 && res.body.access_token) {
            console.log('  ✅ Signup successful! Token received.\n');
            return res.body.access_token;
        } else {
            console.log('  ⚠️  Signup response did not contain access_token.\n');
            return null;
        }
    } catch (err) {
        console.error('  ❌ Signup error:', err.message, '\n');
        return null;
    }
}

async function testLogin() {
    console.log('🔑 Testing Login...');
    const options = {
        hostname: 'api.stack-auth.com',
        path: `/api/v1/projects/${PROJECT_ID}/users/email-password/sign-in`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Stack-Publishable-Key': PCK
        }
    };

    try {
        const res = await makeRequest(options, {
            email: TEST_EMAIL,
            password: TEST_PASSWORD
        });
        
        console.log(`  Status: ${res.status}`);
        console.log(`  Response:`, JSON.stringify(res.body, null, 2));
        
        if (res.status === 200 && res.body.access_token) {
            console.log('  ✅ Login successful! Token received.\n');
            return res.body.access_token;
        } else {
            console.log('  ⚠️  Login response did not contain access_token.\n');
            return null;
        }
    } catch (err) {
        console.error('  ❌ Login error:', err.message, '\n');
        return null;
    }
}

async function runTests() {
    const signupToken = await testSignup();
    const loginToken = await testLogin();

    console.log('📊 Test Summary:');
    console.log(`  Signup: ${signupToken ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`  Login: ${loginToken ? '✅ PASS' : '❌ FAIL'}`);
    console.log('\n💡 Tip: If tests fail with 404, verify:');
    console.log('  1. Project ID is correct');
    console.log('  2. Publishable Key matches your Stack Auth project');
    console.log('  3. Email/password routes are enabled in your provider');
    console.log('  4. Your domain (https://maurmaket.netlify.app) is added as trusted');
}

runTests().catch(console.error);
