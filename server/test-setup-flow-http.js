/**
 * Complete Setup & Launch Flow Verification Script against Docker http://localhost:3000
 */

async function verifySetupAndLaunchFlow() {
  console.log('─── Verifying Complete Setup & Launch Flow on Docker (http://localhost:3000) ───\n');

  // Step 1: Initial setup status
  console.log('[Step 1] Initial setup-status check: GET http://localhost:3000/api/auth/setup-status');
  const s1Res = await fetch('http://localhost:3000/api/auth/setup-status', {
    headers: { Origin: 'http://localhost:3000' },
  });
  const s1Body = await s1Res.json();
  console.log(`  HTTP Status: ${s1Res.status}`);
  console.log(`  setupDone: ${s1Body.setupDone}`);

  // Step 2: Fill setup form & submit: POST /api/auth/setup
  const testInstName = `Docker Test College ${Date.now()}`;
  const testEmail = `admin_${Date.now()}@docker.edu`;
  const testPass = 'DockerAdminPass123!';

  console.log('\n[Step 2] Launching CampusFlow: POST http://localhost:3000/api/auth/setup');
  const setupRes = await fetch('http://localhost:3000/api/auth/setup', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost:3000',
    },
    body: JSON.stringify({
      institutionName: testInstName,
      adminName: 'Docker Admin User',
      adminEmail: testEmail,
      adminPassword: testPass,
    }),
  });

  const setupBody = await setupRes.json();
  console.log(`  HTTP Status: ${setupRes.status}`);
  console.log(`  CORS Allow-Origin: ${setupRes.headers.get('access-control-allow-origin')}`);
  console.log(`  CORS Allow-Credentials: ${setupRes.headers.get('access-control-allow-credentials')}`);
  console.log(`  Set-Cookie Header Present: ${setupRes.headers.has('set-cookie')}`);
  console.log(`  Access Token Returned: ${!!setupBody.accessToken}`);
  console.log(`  User Created: ${setupBody.user?.email} (Roles: [${setupBody.user?.roles?.join(', ')}])`);

  if (setupRes.status !== 201 || !setupBody.accessToken) {
    throw new Error(`Setup failed with status ${setupRes.status}: ${JSON.stringify(setupBody)}`);
  }

  // Step 3: Verify setup-status after launch
  console.log('\n[Step 3] Post-Launch setup-status check: GET http://localhost:3000/api/auth/setup-status');
  const s3Res = await fetch('http://localhost:3000/api/auth/setup-status', {
    headers: { Origin: 'http://localhost:3000' },
  });
  const s3Body = await s3Res.json();
  console.log(`  HTTP Status: ${s3Res.status}`);
  console.log(`  setupDone: ${s3Body.setupDone}`);

  if (!s3Body.setupDone) {
    throw new Error('Database setupDone should be true after setup!');
  }

  // Step 4: Verify login with new credentials
  console.log('\n[Step 4] Login check with created credentials: POST http://localhost:3000/api/auth/login');
  const loginRes = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost:3000',
    },
    body: JSON.stringify({
      email: testEmail,
      password: testPass,
    }),
  });
  const loginBody = await loginRes.json();
  console.log(`  HTTP Status: ${loginRes.status}`);
  console.log(`  CORS Allow-Origin: ${loginRes.headers.get('access-control-allow-origin')}`);
  console.log(`  CORS Allow-Credentials: ${loginRes.headers.get('access-control-allow-credentials')}`);
  console.log(`  Access Token Returned: ${!!loginBody.accessToken}`);
  console.log(`  User Authenticated: ${loginBody.user?.fullName}`);

  if (loginRes.status !== 200 || !loginBody.accessToken) {
    throw new Error(`Login failed with status ${loginRes.status}`);
  }

  console.log('\n─── COMPLETE LAUNCH & AUTHENTICATION FLOW VERIFIED SUCCESSFULLY ───');
}

verifySetupAndLaunchFlow().catch((err) => {
  console.error('❌ Setup flow test failed:', err.message);
  process.exit(1);
});
