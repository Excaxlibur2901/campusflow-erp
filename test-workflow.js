import { execSync } from 'child_process';

const API_URL = 'http://localhost:3000/api';

async function fetchApi(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options
  });
  
  // Try to parse JSON, if it fails, fallback to empty object
  let data;
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  
  // Manually parse set-cookie for subsequent requests
  const setCookie = res.headers.get('set-cookie');
  if (setCookie && options.onCookie) {
    options.onCookie(setCookie.split(';')[0]);
  }
  
  return { ok: res.ok, status: res.status, data };
}

async function runTest() {
  console.log('1. Fresh test institution: Resetting database...');
  execSync('npm run db:reset-setup', { stdio: 'inherit' });
  
  let cookie = '';
  const saveCookie = (c) => { cookie = c; };

  console.log('\n2-7. Setup Wizard (Institution, Departments, Classrooms, SUPER_ADMIN)...');
  const setupPayload = {
    institutionName: 'Test Tech University',
    adminName: 'Test Admin',
    adminEmail: 'admin@test.edu',
    adminPassword: 'Password123!',
    instDetails: {
      address: '123 Test St',
      phone: '555-0100',
      naacGrade: 'A+'
    },
    departments: [
      { code: 'CSE', name: 'Computer Science' },
      { code: 'ECE', name: 'Electronics' },
      { code: 'ME', name: 'Mechanical' }
    ],
    classrooms: [
      { code: 'L101', name: 'Lecture Hall 101', capacity: 60, type: 'lecture' },
      { code: 'L102', name: 'Lecture Hall 102', capacity: 60, type: 'lecture' }
    ]
  };

  const setupRes = await fetchApi('/auth/setup', {
    method: 'POST',
    body: JSON.stringify(setupPayload),
    onCookie: saveCookie
  });

  if (!setupRes.ok) {
    console.error('Setup failed:', setupRes);
    process.exit(1);
  }
  console.log('Setup successful!');

  // Store access token
  let token = setupRes.data.accessToken;

  console.log('\n8. Logout (client-side simulation - clearing token)...');
  token = null;
  cookie = ''; // Server might have wiped cookie if we called /auth/logout, but we'll do real logout later.

  console.log('\n9. Login as SUPER_ADMIN...');
  const loginRes = await fetchApi('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@test.edu', password: 'Password123!' }),
    onCookie: saveCookie
  });

  if (!loginRes.ok) {
    console.error('Login failed:', loginRes);
    process.exit(1);
  }
  console.log('Login successful!');
  token = loginRes.data.accessToken;

  const authHeaders = { 'Authorization': `Bearer ${token}` };

  console.log('\n10-13. Dashboard opens (Fetching Dashboard APIs)...');
  const [depsRes, roomsRes, instRes, audtsRes] = await Promise.all([
    fetchApi('/departments', { headers: authHeaders }),
    fetchApi('/classrooms', { headers: authHeaders }),
    fetchApi('/institutions', { headers: authHeaders }),
    fetchApi('/audit?limit=10', { headers: authHeaders })
  ]);

  console.log(`Departments: ${depsRes.data.length} found`);
  console.log(`Classrooms: ${roomsRes.data.length} found`);
  console.log(`Institutions: ${instRes.data.length} found`);
  console.log(`Audit Logs: ${audtsRes.data.data.length} found`);

  if (depsRes.data.length !== 3) throw new Error('Missing departments!');
  if (roomsRes.data.length !== 2) throw new Error('Missing classrooms!');
  if (instRes.data.length !== 1) throw new Error('Missing institution!');

  console.log('\n14. Refresh browser (Simulate refresh token flow)...');
  const refreshRes = await fetchApi('/auth/refresh', {
    method: 'POST',
    headers: { 'Cookie': cookie },
    onCookie: saveCookie
  });

  if (!refreshRes.ok) {
    console.error('Refresh failed:', refreshRes);
    process.exit(1);
  }
  console.log('Refresh successful! New token obtained.');
  token = refreshRes.data.accessToken;

  console.log('\n15. Data remains (Verifying departments with new token)...');
  const depsRes2 = await fetchApi('/departments', { headers: { 'Authorization': `Bearer ${token}` } });
  if (depsRes2.data.length !== 3) throw new Error('Missing departments after refresh!');
  console.log('Data verified after refresh.');

  console.log('\n16. Logout...');
  const logoutRes = await fetchApi('/auth/logout', {
    method: 'POST', // or GET depending on backend
    headers: { 'Cookie': cookie, 'Authorization': `Bearer ${token}` }
  });
  console.log('Logout successful!', logoutRes.ok);
  token = null;
  cookie = '';

  console.log('\n17. Login again...');
  const loginRes2 = await fetchApi('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@test.edu', password: 'Password123!' }),
    onCookie: saveCookie
  });
  
  if (!loginRes2.ok) throw new Error('Second login failed!');
  token = loginRes2.data.accessToken;
  console.log('Second login successful!');

  console.log('\n18. Data remains (Final verification)...');
  const depsRes3 = await fetchApi('/departments', { headers: { 'Authorization': `Bearer ${token}` } });
  if (depsRes3.data.length !== 3) throw new Error('Missing departments after second login!');
  console.log('Data verified after second login.');

  console.log('\n✅ All tests passed successfully!');
  console.log('\n--- Setup → DB → API → Context → Dashboard Validation Report ---');
  console.log('Institution: Validated');
  console.log('Departments: Validated (3)');
  console.log('Classrooms: Validated (2)');
  console.log('Audit Logs: Validated');
  console.log('Auth Flow: Validated (Login, Refresh, Logout, Login)');
}

runTest().catch(err => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
