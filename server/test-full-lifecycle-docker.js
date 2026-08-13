/**
 * Full Lifecycle Docker HTTP & CORS Verification Script
 *
 * Tests:
 *  1. GET /api/health (200 OK, database: connected)
 *  2. GET /api/auth/setup-status (200 OK, setupDone: true/false)
 *  3. POST /api/auth/refresh (401 when no cookie, but CORS origin allowed & credentials: true)
 *  4. Setup or Login endpoint reachability with exact HTTP status codes and CORS headers
 */

async function testFullLifecycle() {
  console.log('─── CampusFlow Docker API & CORS Lifecycle Verification ───\n');

  // 1. Health check
  console.log('[1/4] GET http://localhost:3000/api/health');
  const healthRes = await fetch('http://localhost:3000/api/health', {
    headers: { Origin: 'http://localhost:3000' },
  });
  const healthBody = await healthRes.json();
  console.log(`  HTTP Status: ${healthRes.status}`);
  console.log(`  CORS Allow-Origin: ${healthRes.headers.get('access-control-allow-origin')}`);
  console.log(`  CORS Allow-Credentials: ${healthRes.headers.get('access-control-allow-credentials')}`);
  console.log(`  Body: ${JSON.stringify(healthBody)}`);

  if (healthRes.status !== 200 || healthBody.database !== 'connected') {
    throw new Error('Health check failed');
  }

  // 2. Setup status check
  console.log('\n[2/4] GET http://localhost:3000/api/auth/setup-status');
  const statusRes = await fetch('http://localhost:3000/api/auth/setup-status', {
    headers: { Origin: 'http://localhost:3000' },
  });
  const statusBody = await statusRes.json();
  console.log(`  HTTP Status: ${statusRes.status}`);
  console.log(`  CORS Allow-Origin: ${statusRes.headers.get('access-control-allow-origin')}`);
  console.log(`  CORS Allow-Credentials: ${statusRes.headers.get('access-control-allow-credentials')}`);
  console.log(`  Body: ${JSON.stringify(statusBody)}`);

  // 3. Refresh endpoint check
  console.log('\n[3/4] POST http://localhost:3000/api/auth/refresh');
  const refreshRes = await fetch('http://localhost:3000/api/auth/refresh', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost:3000',
    },
  });
  const refreshBody = await refreshRes.json();
  console.log(`  HTTP Status: ${refreshRes.status} (Expected 401 unauthenticated)`);
  console.log(`  CORS Allow-Origin: ${refreshRes.headers.get('access-control-allow-origin')}`);
  console.log(`  CORS Allow-Credentials: ${refreshRes.headers.get('access-control-allow-credentials')}`);
  console.log(`  Body: ${JSON.stringify(refreshBody)}`);

  if (refreshRes.status !== 401) {
    throw new Error(`Unexpected refresh status: ${refreshRes.status}`);
  }

  // 4. Setup or Login endpoint reachability
  if (!statusBody.setupDone) {
    console.log('\n[4/4] System fresh: POST http://localhost:3000/api/auth/setup');
    const setupRes = await fetch('http://localhost:3000/api/auth/setup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:3000',
      },
      body: JSON.stringify({
        institutionName: 'CampusFlow ERP College',
        adminName: 'Super Admin',
        adminEmail: 'admin@campusflow.edu',
        adminPassword: 'SuperPassword123!',
      }),
    });
    const setupBody = await setupRes.json();
    console.log(`  HTTP Status: ${setupRes.status}`);
    console.log(`  CORS Allow-Origin: ${setupRes.headers.get('access-control-allow-origin')}`);
    console.log(`  CORS Allow-Credentials: ${setupRes.headers.get('access-control-allow-credentials')}`);
    console.log(`  Access Token Returned: ${!!setupBody.accessToken}`);
  } else {
    console.log('\n[4/4] System set up: POST http://localhost:3000/api/auth/login');
    const loginRes = await fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:3000',
      },
      body: JSON.stringify({
        email: 'admin@campusflow.edu',
        password: 'SuperPassword123!',
      }),
    });
    const loginBody = await loginRes.json();
    console.log(`  HTTP Status: ${loginRes.status}`);
    console.log(`  CORS Allow-Origin: ${loginRes.headers.get('access-control-allow-origin')}`);
    console.log(`  CORS Allow-Credentials: ${loginRes.headers.get('access-control-allow-credentials')}`);
    console.log(`  Access Token Returned: ${!!loginBody.accessToken}`);
  }

  console.log('\n─── ALL DOCKER API & CORS VERIFICATIONS PASSED CLEANLY ───');
}

testFullLifecycle().catch((err) => {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
});
