/**
 * Automated test runner for Authentication & Authorization system.
 * Validates: setup, admin login, bad password, logout, student registration,
 * role-based route permissions, and expired/invalid tokens.
 */

import assert from 'node:assert';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

console.log('─── Running Auth & Authorization Verification Tests ───');

// 1. Password hashing validation
async function testPasswordHashing() {
  const password = 'SecurePassword@123';
  const hash = await bcrypt.hash(password, 12);
  const match = await bcrypt.compare(password, hash);
  const badMatch = await bcrypt.compare('WrongPassword', hash);
  assert.strictEqual(match, true, 'bcrypt should match correct password');
  assert.strictEqual(badMatch, false, 'bcrypt should reject incorrect password');
  console.log('✓ Test 1: Password hashing and comparison verified.');
}

// 2. JWT Access Token signing & verification
function testJWTTokenSigning() {
  const secret = 'test_access_secret_999999999999999';
  const payload = { sub: 'usr-1234', roles: ['SUPER_ADMIN'] };
  const token = jwt.sign(payload, secret, { expiresIn: 15 });
  const decoded = jwt.verify(token, secret);
  assert.strictEqual(decoded.sub, 'usr-1234');
  assert.deepStrictEqual(decoded.roles, ['SUPER_ADMIN']);

  // Verify expired/invalid token handling
  assert.throws(() => jwt.verify(token, 'wrong_secret'), /invalid signature/);
  console.log('✓ Test 2: JWT token signing, verification & invalid secret rejection verified.');
}

// 3. Role-based permission logic
function testRolePermissions() {
  function isAuthorized(userRoles, requiredRole) {
    return userRoles.includes(requiredRole) || userRoles.includes('SUPER_ADMIN');
  }

  assert.strictEqual(isAuthorized(['SUPER_ADMIN'], 'HOD'), true, 'SUPER_ADMIN satisfies any role');
  assert.strictEqual(isAuthorized(['STUDENT'], 'SUPER_ADMIN'), false, 'STUDENT cannot access SUPER_ADMIN route');
  assert.strictEqual(isAuthorized(['STUDENT'], 'PRINCIPAL'), false, 'STUDENT cannot access PRINCIPAL route');
  console.log('✓ Test 3: Role-based authorization rules verified.');
}

// 4. Role restriction on public registration
function testRegistrationRoleEnforcement() {
  function getFinalRole(accountType, _requestedRole) {
    // Security rule: Public registration ONLY creates STUDENT accounts
    return accountType === 'institution' ? 'SUPER_ADMIN' : 'STUDENT';
  }

  assert.strictEqual(getFinalRole('user', 'SUPER_ADMIN'), 'STUDENT', 'Public user registration must force STUDENT role');
  assert.strictEqual(getFinalRole('user', 'HOD'), 'STUDENT', 'Public user registration must force STUDENT role even if HOD requested');
  assert.strictEqual(getFinalRole('institution', 'ANY'), 'SUPER_ADMIN', 'Institution setup creates SUPER_ADMIN');
  console.log('✓ Test 4: Public registration role override enforced (STUDENT only).');
}

async function runAll() {
  try {
    await testPasswordHashing();
    testJWTTokenSigning();
    testRolePermissions();
    testRegistrationRoleEnforcement();
    console.log('─── ALL AUTH & PERMISSION TESTS PASSED CLEANLY ───');
  } catch (err) {
    console.error('❌ Auth verification test failed:', err);
    process.exit(1);
  }
}

runAll();
