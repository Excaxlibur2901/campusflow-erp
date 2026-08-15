const BASE_URL = 'http://localhost:3000/api';

async function testMultiTenantSetup() {
  console.log('--- TEST 1: Check Existing Setup Status ---');
  const statusRes = await fetch(`${BASE_URL}/auth/setup-status`);
  const statusData = await statusRes.json();
  console.log('Setup Status HTTP:', statusRes.status, statusData);

  console.log('\n--- TEST 2: Register Second Institution (Institution B) ---');
  const uniqueEmail = `admin_b_${Date.now()}@instb.edu`;
  const setupResB = await fetch(`${BASE_URL}/auth/setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      institutionName: 'St. Xavier Institute of Technology (Institution B)',
      adminName: 'Dr. Admin B',
      adminEmail: uniqueEmail,
      adminPassword: 'Password@123',
      instDetails: {
        affiliation: 'State University',
        address: '45 Tech Campus Road',
        phone: '+91 9876543211',
      },
      departments: [{ code: 'CSB', name: 'Computer Science B', hod: 'Dr. HOD B' }],
      classrooms: [{ code: 'LHB1', name: 'Lecture Hall B1', type: 'lecture', capacity: 60 }],
    }),
  });

  const setupDataB = await setupResB.json();
  console.log('Institution B Setup HTTP:', setupResB.status);
  console.log('Response Profile:', {
    ok: setupDataB.ok,
    user: setupDataB.user,
    hasAccessToken: !!setupDataB.accessToken,
  });

  if (setupResB.status === 201 || setupResB.status === 200) {
    console.log('✅ PASS: Institution B successfully created alongside existing Institution A!');
  } else {
    console.error('❌ FAIL: Expected 200/201 but got', setupResB.status, setupDataB);
    process.exit(1);
  }

  const tokenB = setupDataB.accessToken;

  console.log('\n--- TEST 3: Cross-Tenant Isolation Check for Institution B ---');
  // Fetch departments as Institution B
  const deptResB = await fetch(`${BASE_URL}/departments`, {
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  const deptsB = await deptResB.json();
  console.log('Institution B Departments:', deptsB);

  const belongsToB = Array.isArray(deptsB) && deptsB.every(d => d.institution_id === setupDataB.user?.institution_id || d.code === 'CSB');
  if (belongsToB) {
    console.log('✅ PASS: Institution B only receives its own tenant departments!');
  } else {
    console.error('❌ FAIL: Institution B received cross-tenant data:', deptsB);
  }

  console.log('\n--- TEST 4: Attempt Duplicate Setup with Existing Admin Email ---');
  const duplicateEmailRes = await fetch(`${BASE_URL}/auth/setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      institutionName: 'Institution C',
      adminName: 'Dr. Duplicate',
      adminEmail: uniqueEmail, // Duplicate email
      adminPassword: 'Password@123',
    }),
  });
  const dupData = await duplicateEmailRes.json();
  console.log('Duplicate Email HTTP:', duplicateEmailRes.status, dupData);

  if (duplicateEmailRes.status === 409 || duplicateEmailRes.status === 400) {
    console.log('✅ PASS: Duplicate administrator email correctly rejected!');
  } else {
    console.error('❌ FAIL: Expected 409/400 for duplicate email but got', duplicateEmailRes.status);
  }
}

testMultiTenantSetup().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
