const BASE_URL = 'http://localhost:3000/api';

async function testRoutingAndSetup() {
  console.log('--- TEST 1: Check Setup Status ---');
  const statusRes = await fetch(`${BASE_URL}/auth/setup-status`);
  const statusData = await statusRes.json();
  console.log('Setup Status HTTP:', statusRes.status, statusData);

  console.log('\n--- TEST 2: Attempt Duplicate Setup on Existing DB ---');
  const setupRes = await fetch(`${BASE_URL}/auth/setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      institutionName: 'Duplicate Tech University',
      adminName: 'Test Admin',
      adminEmail: 'testadmin@duplicate.edu',
      adminPassword: 'Password@123',
    }),
  });
  const setupData = await setupRes.json();
  console.log('Duplicate Setup HTTP:', setupRes.status, setupData);

  if (setupRes.status === 409) {
    console.log('✅ PASS: 409 Conflict correctly returned for duplicate setup attempt.');
  } else {
    console.error('❌ FAIL: Expected 409 Conflict but got', setupRes.status);
  }
}

testRoutingAndSetup().catch(err => {
  console.error('Error during test execution:', err);
  process.exit(1);
});
