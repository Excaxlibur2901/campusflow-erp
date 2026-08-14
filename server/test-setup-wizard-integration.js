/**
 * End-to-End Verification for First Admin Account & SetupWizard Integration
 */

import 'dotenv/config';
import assert from 'node:assert';
import { pool } from './db.js';

async function runIntegrationTest() {
  console.log('─── CampusFlow ERP: First Admin Account & SetupWizard Integration Test ───\n');

  // Step 1: Reset database to unconfigured state
  console.log('[Step 1] Resetting setup state for test...');
  await pool.query('TRUNCATE users, user_sessions, login_attempts, institutions CASCADE;');
  console.log('✓ Database truncated cleanly.');

  // Step 2: GET /api/auth/setup-status
  console.log('\n[Step 2] GET http://localhost:3000/api/auth/setup-status (Unconfigured DB)');
  const res1 = await fetch('http://localhost:3000/api/auth/setup-status');
  const data1 = await res1.json();
  console.log(`  HTTP Status: ${res1.status}`);
  console.log(`  Body: ${JSON.stringify(data1)}`);
  assert.strictEqual(res1.status, 200);
  assert.strictEqual(data1.setupDone, false);
  console.log('✓ setupDone is false for unconfigured database (triggers SetupWizard UI).');

  // Step 3: Test Validation Error (e.g. Password mismatch)
  console.log('\n[Step 3] Testing backend validation error handling (POST /api/auth/setup with short password)');
  const badRes = await fetch('http://localhost:3000/api/auth/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      institutionName: 'Validation Test Institute',
      adminName: 'Admin User',
      adminEmail: 'admin@val.edu',
      adminPassword: '123', // Short password
    }),
  });
  const badData = await badRes.json();
  console.log(`  HTTP Status: ${badRes.status}`);
  console.log(`  Error Message Returned: "${badData.error}"`);
  assert.strictEqual(badRes.status, 400);
  assert.ok(badData.error.includes('Password must be at least 8 characters'));
  console.log('✓ Validation error returned clearly without silent failure.');

  // Step 4: POST /api/auth/setup (Valid Onboarding Submission)
  const testInst = 'National Institute of Technology';
  const testAdminName = 'Dr. Rajesh V. Sharma';
  const testAdminEmail = 'rajesh.sharma@nit.edu';
  const testAdminPass = 'NitAdminPassword2026!';

  console.log('\n[Step 4] Launching CampusFlow: POST http://localhost:3000/api/auth/setup');
  const setupRes = await fetch('http://localhost:3000/api/auth/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      institutionName: testInst,
      adminName: testAdminName,
      adminEmail: testAdminEmail,
      adminPassword: testAdminPass,
      instDetails: {
        affiliation: 'Central Technological University',
        address: 'Campus Road, Tech City - 400001',
        phone: '+91 22 98765432',
        email: 'info@nit.edu',
        website: 'https://nit.edu',
        naacGrade: 'A++',
        aisheCode: 'C-98765',
        establishedYear: '1985',
        autonomousStatus: 'Autonomous',
        collegeType: 'Engineering',
        motto: 'Excellence in Education',
      },
      departments: [
        { code: 'CSE', name: 'Computer Science & Engineering', hod: 'Dr. A. K. Gupta' },
        { code: 'ECE', name: 'Electronics & Communication', hod: 'Dr. M. S. Rao' },
      ],
      classrooms: [
        { code: 'LH-101', name: 'Lecture Hall 101', type: 'lecture', capacity: 75, floor: 1 },
        { code: 'LAB-201', name: 'Advanced AI Lab', type: 'lab', capacity: 40, floor: 2 },
      ],
    }),
  });

  const setupData = await setupRes.json();
  console.log(`  HTTP Status: ${setupRes.status}`);
  console.log(`  CORS Allow-Origin: ${setupRes.headers.get('access-control-allow-origin')}`);
  console.log(`  Set-Cookie Header Present: ${setupRes.headers.has('set-cookie')}`);
  console.log(`  Access Token Issued: ${!!setupData.accessToken}`);
  console.log(`  User Created: ${setupData.user?.email} (${setupData.user?.fullName})`);
  console.log(`  Assigned Roles: [${setupData.user?.roles?.join(', ')}]`);

  assert.strictEqual(setupRes.status, 201);
  assert.ok(setupData.accessToken);
  assert.strictEqual(setupData.user.email, testAdminEmail.toLowerCase());
  assert.deepStrictEqual(setupData.user.roles, ['SUPER_ADMIN']);
  console.log('✓ Institution, SUPER_ADMIN user, departments, classrooms, and authenticated session created atomically.');

  // Step 5: Verify Database Records Directly
  console.log('\n[Step 5] Database Direct Inspection');
  const dbInst = await pool.query('SELECT id, name, affiliation, naac_grade FROM institutions WHERE name = $1', [testInst]);
  const dbUser = await pool.query('SELECT u.id, u.email, u.full_name, r.code as role FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id WHERE u.email = $1', [testAdminEmail]);
  const dbDepts = await pool.query('SELECT code, name FROM departments WHERE institution_id = $1 ORDER BY code', [dbInst.rows[0].id]);
  const dbRooms = await pool.query('SELECT code, name, room_type, capacity FROM classrooms WHERE institution_id = $1 ORDER BY code', [dbInst.rows[0].id]);

  console.log(`  Institution: ${dbInst.rows[0].name} (NAAC: ${dbInst.rows[0].naac_grade})`);
  console.log(`  Super Admin User: ${dbUser.rows[0].email} (Role: ${dbUser.rows[0].role})`);
  console.log(`  Departments Created (${dbDepts.rowCount}): ${dbDepts.rows.map(d => d.code).join(', ')}`);
  console.log(`  Classrooms Created (${dbRooms.rowCount}): ${dbRooms.rows.map(r => r.code).join(', ')}`);

  assert.strictEqual(dbInst.rowCount, 1);
  assert.strictEqual(dbUser.rowCount, 1);
  assert.strictEqual(dbUser.rows[0].role, 'SUPER_ADMIN');
  assert.strictEqual(dbDepts.rowCount, 2);
  assert.strictEqual(dbRooms.rowCount, 2);
  console.log('✓ PostgreSQL Database records verified directly.');

  // Step 6: Post-Setup setup-status check
  console.log('\n[Step 6] GET http://localhost:3000/api/auth/setup-status (Configured DB)');
  const res2 = await fetch('http://localhost:3000/api/auth/setup-status');
  const data2 = await res2.json();
  console.log(`  HTTP Status: ${res2.status}`);
  console.log(`  Body: ${JSON.stringify(data2)}`);
  assert.strictEqual(res2.status, 200);
  assert.strictEqual(data2.setupDone, true);
  console.log('✓ setupDone is true for configured database (renders Login / Dashboard flow).');

  console.log('\n─── ALL FIRST ADMIN ACCOUNT & SETUP INTEGRATION TESTS PASSED CLEANLY ───\n');
  process.exit(0);
}

runIntegrationTest().catch((err) => {
  console.error('\n❌ INTEGRATION TEST FAILED:', err.message);
  process.exit(1);
});
