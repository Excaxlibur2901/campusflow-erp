import { pool } from './server/db.js';
import crypto from 'node:crypto';

// We need to parse cookies for refresh endpoint
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
  
  // get set-cookie
  const cookies = res.headers.get('set-cookie');
  
  return { status: res.status, ok: res.ok, data, cookies };
}

async function testSessions() {
  console.log('--- TESTING REFRESH SESSIONS ---\n');
  try {
    // 3. Login
    console.log('\n2. Testing Login...');
    const loginRes = await fetchApi('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'student@test.com',
        password: 'password123',
      })
    });
    
    let refreshCookie = '';
    if (loginRes.status === 200 && loginRes.cookies) {
      console.log('✅ PASSED: Login successful');
      const match = loginRes.cookies.match(/campusflow_session=([^;]+)/);
      if (match) {
        refreshCookie = match[1];
        console.log('✅ PASSED: Refresh cookie found');
      } else {
        console.log('❌ FAILED: No refresh cookie found');
      }
    } else {
      console.log(`❌ FAILED: Login failed with status ${loginRes.status}`);
    }

    // 4. Refresh
    console.log('\n3. Testing Refresh...');
    const refreshRes = await fetchApi('/auth/refresh', {
      method: 'POST',
      headers: {
        'Cookie': `campusflow_session=${refreshCookie}`
      }
    });
    
    let newRefreshCookie = '';
    if (refreshRes.status === 200) {
      console.log('✅ PASSED: Refresh successful');
      const match = refreshRes.cookies?.match(/campusflow_session=([^;]+)/);
      if (match) {
        newRefreshCookie = match[1];
      }
    } else {
      console.log(`❌ FAILED: Refresh failed with status ${refreshRes.status}`);
    }
    
    // 5. Invalid Session
    console.log('\n4. Testing Invalid Session...');
    const invalidRes = await fetchApi('/auth/refresh', {
      method: 'POST',
      headers: {
        'Cookie': `campusflow_session=fake.token.here`
      }
    });
    if (invalidRes.status === 401) {
      console.log('✅ PASSED: Invalid session rejected');
    } else {
      console.log(`❌ FAILED: Invalid session got status ${invalidRes.status}`);
    }
    
    // 6. Expired Session Simulation
    console.log('\n5. Testing Expired Session...');
    // We will just update the DB to make the session expired
    const hash = crypto.createHash('sha256').update(newRefreshCookie).digest('hex');
    await pool.query(`UPDATE user_sessions SET expires_at = now() - interval '1 day' WHERE refresh_token_hash = $1`, [hash]);
    
    const expiredRes = await fetchApi('/auth/refresh', {
      method: 'POST',
      headers: {
        'Cookie': `campusflow_session=${newRefreshCookie}`
      }
    });
    
    if (expiredRes.status === 401) {
      console.log('✅ PASSED: Expired session rejected');
    } else {
      console.log(`❌ FAILED: Expired session got status ${expiredRes.status}`);
    }
    
    // Restore session so we can test logout
    await pool.query(`UPDATE user_sessions SET expires_at = now() + interval '1 day' WHERE refresh_token_hash = $1`, [hash]);
    
    // 7. Logout
    console.log('\n6. Testing Logout...');
    const logoutRes = await fetchApi('/auth/logout', {
      method: 'POST',
      headers: {
        'Cookie': `campusflow_session=${newRefreshCookie}`
      }
    });
    
    if (logoutRes.status === 200) {
      console.log('✅ PASSED: Logout successful');
      
      // verify it's revoked
      const checkRevoked = await fetchApi('/auth/refresh', {
        method: 'POST',
        headers: {
          'Cookie': `campusflow_session=${newRefreshCookie}`
        }
      });
      if (checkRevoked.status === 401) {
         console.log('✅ PASSED: Session properly revoked after logout');
      } else {
         console.log(`❌ FAILED: Session still worked after logout! Status ${checkRevoked.status}`);
      }
    } else {
      console.log(`❌ FAILED: Logout failed with status ${logoutRes.status}`);
    }
    
    console.log('\nDone.');
  } catch(e) {
    console.error('Test error:', e);
  } finally {
    process.exit(0);
  }
}

testSessions();
