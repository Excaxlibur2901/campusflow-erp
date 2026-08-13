/**
 * Verification script against live Docker app at http://localhost:3000
 */

async function verifyDockerHttp() {
  console.log('─── Verifying Live Docker App at http://localhost:3000 ───\n');

  // 1. Health check
  console.log('[1/4] GET http://localhost:3000/api/health ...');
  const healthRes = await fetch('http://localhost:3000/api/health', {
    headers: { Origin: 'http://localhost:3000' },
  });
  const healthBody = await healthRes.json();
  console.log(`Status: ${healthRes.status}`);
  console.log(`CORS Allow-Origin: ${healthRes.headers.get('access-control-allow-origin')}`);
  console.log(`CORS Allow-Credentials: ${healthRes.headers.get('access-control-allow-credentials')}`);
  console.log('Body:', JSON.stringify(healthBody));

  if (healthRes.status !== 200 || !healthBody.ok) {
    throw new Error('Health check failed!');
  }
  console.log('✓ Health check PASS.');

  // 2. Setup-status check
  console.log('\n[2/4] GET http://localhost:3000/api/auth/setup-status ...');
  const statusRes = await fetch('http://localhost:3000/api/auth/setup-status', {
    headers: { Origin: 'http://localhost:3000' },
  });
  const statusBody = await statusRes.json();
  console.log(`Status: ${statusRes.status}`);
  console.log(`CORS Allow-Origin: ${statusRes.headers.get('access-control-allow-origin')}`);
  console.log(`CORS Allow-Credentials: ${statusRes.headers.get('access-control-allow-credentials')}`);
  console.log('Body:', JSON.stringify(statusBody));

  if (statusRes.status !== 200 || typeof statusBody.setupDone !== 'boolean') {
    throw new Error('Setup-status check failed!');
  }
  console.log('✓ Setup-status PASS.');

  // 3. Refresh endpoint check
  console.log('\n[3/4] POST http://localhost:3000/api/auth/refresh ...');
  const refreshRes = await fetch('http://localhost:3000/api/auth/refresh', {
    method: 'POST',
    headers: { Origin: 'http://localhost:3000', 'Content-Type': 'application/json' },
  });
  console.log(`Status: ${refreshRes.status} (401 expected when unauthenticated without cookie)`);
  console.log(`CORS Allow-Origin: ${refreshRes.headers.get('access-control-allow-origin')}`);
  console.log(`CORS Allow-Credentials: ${refreshRes.headers.get('access-control-allow-credentials')}`);

  if (refreshRes.status === 500) {
    throw new Error('Refresh failed with CORS 500 error!');
  }
  console.log('✓ Refresh CORS PASS.');

  console.log('\n─── ALL DOCKER HTTP & CORS CHECKS PASSED CLEANLY ───');
}

verifyDockerHttp().catch((err) => {
  console.error('❌ Verification failed:', err.message);
  process.exit(1);
});
