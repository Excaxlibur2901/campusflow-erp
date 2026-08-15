import { pool } from './server/db.js';

async function fetchApi(path, options = {}) {
  const url = `http://localhost:4000/api${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  let data;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, ok: res.ok, data };
}


async function testRegistration() {
  console.log('--- TESTING REGISTRATION SECURITY ---\n');

  try {
    // Clean up test user if exists
    await pool.query("DELETE FROM users WHERE email = 'hacker@hack.com'");

    // 1. Unauthorized Institution Creation
    console.log('1. Attempting unauthorized institution creation...');
    const instReg = await fetchApi('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        accountType: 'institution',
        institutionName: 'Hacker Institute',
        fullName: 'Hacker Man',
        email: 'hacker@hack.com',
        password: 'password123',
      }),
    });
    if (instReg.status === 403) {
      console.log('✅ PASSED: Unauthorized institution creation blocked (403)');
    } else {
      console.log(`❌ FAILED: Unauthorized institution creation returned ${instReg.status}`);
    }

    // Prepare a test institution for student registration
    await pool.query("DELETE FROM institutions WHERE name = 'Student Test Institution'");
    const instRes = await pool.query("INSERT INTO institutions (name) VALUES ('Student Test Institution') RETURNING id");
    const instId = instRes.rows[0].id;

    // Clean up test user if exists
    await pool.query("DELETE FROM users WHERE email = 'student@test.com'");

    // 2. Normal Student Registration
    console.log('\n2. Attempting normal student registration...');
    const stuReg = await fetchApi('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        accountType: 'user',
        institutionId: instId,
        fullName: 'Test Student',
        email: 'student@test.com',
        password: 'password123',
      }),
    });
    if (stuReg.status === 201) {
      console.log('✅ PASSED: Student registration succeeded');
      if (stuReg.data?.user?.roles?.includes('STUDENT') && !stuReg.data?.user?.roles?.includes('SUPER_ADMIN')) {
        console.log('✅ PASSED: Student was assigned correct role');
      } else {
        console.log('❌ FAILED: Student was assigned incorrect roles:', stuReg.data?.user?.roles);
      }
    } else {
      console.log(`❌ FAILED: Student registration returned ${stuReg.status}`, stuReg.data);
    }

    // 3. Duplicate Registration
    console.log('\n3. Attempting duplicate registration...');
    const dupReg = await fetchApi('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        accountType: 'user',
        institutionId: instId,
        fullName: 'Test Student Duplicate',
        email: 'student@test.com',
        password: 'password123',
      }),
    });
    if (dupReg.status === 409) {
      console.log('✅ PASSED: Duplicate registration blocked (409)');
    } else {
      console.log(`❌ FAILED: Duplicate registration returned ${dupReg.status}`);
    }

    // 4. Test Setup Wizard (status)
    console.log('\n4. Checking Setup Wizard status...');
    const setupStatus = await fetchApi('/auth/setup-status');
    if (setupStatus.status === 200) {
      console.log('✅ PASSED: Setup Wizard status works');
    } else {
      console.log(`❌ FAILED: Setup Wizard status returned ${setupStatus.status}`);
    }

    console.log('\nDone.');
  } catch (err) {
    console.error('Test error:', err);
  } finally {
    process.exit(0);
  }
}

testRegistration();
