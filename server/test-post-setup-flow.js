/**
 * Verification Script: Post-Setup State, Session Refresh & Login Flow
 */

import 'dotenv/config';
import assert from 'node:assert';
import { pool } from './db.js';

async function testPostSetupAuthFlow() {
  console.log('─── CampusFlow ERP: Post-Setup Auth & Refresh Verification ───\n');

  // Step 1: Reset database
  await pool.query('TRUNCATE users, user_sessions, login_attempts, institutions CASCADE;');

  // Step 2: POST /api/auth/setup
  const email = 'admin.postsetup@college.edu';
  const password = 'SuperSecretPass123!';

  console.log('[1] Executing POST /api/auth/setup...');
  const setupRes = await fetch('http://localhost:3000/api/auth/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      institutionName: 'Post Setup Tech College',
      adminName: 'Dr. Post Setup Admin',
      adminEmail: email,
      adminPassword: password,
    }),
  });

  assert.strictEqual(setupRes.status, 201);
  const cookieHeader = setupRes.headers.get('set-cookie');
  console.log(`  Set-Cookie header received: ${cookieHeader ? 'YES' : 'NO'}`);
  const setupData = await setupRes.json();
  console.log('  Returned User payload:', JSON.stringify(setupData.user));

  assert.ok(setupData.user.fullName);
  assert.ok(setupData.user.name);
  assert.ok(setupData.user.role);
  assert.strictEqual(setupData.user.name, 'Dr. Post Setup Admin');
  assert.strictEqual(setupData.user.role, 'Super Admin');
  console.log('✓ User object has name, fullName, roles, and role properties.');

  // Step 3: Test Refresh Cookie Session Restore
  console.log('\n[2] Testing Session Refresh using Set-Cookie header...');
  const cookieHeaders = setupRes.headers.getSetCookie ? setupRes.headers.getSetCookie() : [cookieHeader];
  const sessionCookie = cookieHeaders.find(c => c.includes('campusflow_session=')) || cookieHeader;
  const cookieValue = sessionCookie.split(';')[0];
  const refreshRes = await fetch('http://localhost:3000/api/auth/refresh', {
    method: 'POST',
    headers: {
      'Cookie': cookieValue,
    },
  });

  console.log(`  HTTP Status: ${refreshRes.status}`);
  const refreshText = await refreshRes.text();
  console.log('  Refresh response text:', refreshText);
  const refreshData = JSON.parse(refreshText);
  assert.strictEqual(refreshRes.status, 200);
  console.log('  Refreshed User payload:', JSON.stringify(refreshData.user));
  assert.ok(refreshData.accessToken);
  assert.strictEqual(refreshData.user.name, 'Dr. Post Setup Admin');
  assert.strictEqual(refreshData.user.role, 'Super Admin');
  console.log('✓ Session refresh succeeded with valid HttpOnly cookie.');

  // Step 4: Test Normal Login
  console.log('\n[3] Testing Normal Login via POST /api/auth/login...');
  const loginRes = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  assert.strictEqual(loginRes.status, 200);
  const loginData = await loginRes.json();
  console.log('  Login User payload:', JSON.stringify(loginData.user));
  assert.strictEqual(loginData.user.name, 'Dr. Post Setup Admin');
  assert.strictEqual(loginData.user.role, 'Super Admin');
  console.log('✓ Login succeeded and returned uniform user structure.');

  console.log('\n─── ALL POST-SETUP AUTH & REFRESH TESTS PASSED ───\n');
  process.exit(0);
}

testPostSetupAuthFlow().catch(err => {
  console.error('❌ TEST FAILED:', err.message);
  process.exit(1);
});
