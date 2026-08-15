import { pool } from './server/db.js';
import jwt from 'jsonwebtoken';

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

async function testAttendanceIsolation() {
  console.log('--- TESTING ATTENDANCE CROSS-INSTITUTION SECURITY ---\n');
  const client = await pool.connect();
  try {
    // 1. Setup Test Institutions A and B
    await client.query("DELETE FROM institutions WHERE name IN ('Att Inst A', 'Att Inst B')");
    
    const instA = await client.query("INSERT INTO institutions (name) VALUES ('Att Inst A') RETURNING id");
    const idA = instA.rows[0].id;
    
    const instB = await client.query("INSERT INTO institutions (name) VALUES ('Att Inst B') RETURNING id");
    const idB = instB.rows[0].id;
    
    // 2. Setup Super Admin for A
    await client.query("DELETE FROM users WHERE email IN ('att.adminA@test.com', 'att.adminB@test.com')");
    
    const adminA = await client.query(`
      INSERT INTO users (institution_id, email, password_hash, full_name, status)
      VALUES ($1, 'att.adminA@test.com', 'hash', 'Admin A', 'ACTIVE') RETURNING id
    `, [idA]);
    const idAdminA = adminA.rows[0].id;
    await client.query(`INSERT INTO roles (code, name) VALUES ('SUPER_ADMIN', 'SA') ON CONFLICT DO NOTHING`);
    await client.query(`INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE code = 'SUPER_ADMIN'`, [idAdminA]);
    
    // Generate token for Admin A
    const tokenA = jwt.sign({ sub: idAdminA, roles: ['SUPER_ADMIN'] }, process.env.AUTH_ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
    
    // 3. Setup Department & Faculty for B
    const deptB = await client.query(`INSERT INTO departments (institution_id, code, name) VALUES ($1, 'CSB', 'CS B') RETURNING id`, [idB]);
    const progB = await client.query(`INSERT INTO programs (department_id, code, name, duration_years) VALUES ($1, 'BTECHB', 'BTech B', 4) RETURNING id`, [deptB.rows[0].id]);
    const semB = await client.query(`INSERT INTO semesters (program_id, number) VALUES ($1, 1) RETURNING id`, [progB.rows[0].id]);
    const secB = await client.query(`INSERT INTO sections (semester_id, code, capacity) VALUES ($1, 'A', 60) RETURNING id`, [semB.rows[0].id]);
    
    const subB = await client.query(`INSERT INTO subjects (department_id, semester_id, code, name, credits) VALUES ($1, $2, 'SUB_B', 'Sub B', 3) RETURNING id`, [deptB.rows[0].id, semB.rows[0].id]);
    const offB = await client.query(`INSERT INTO subject_offerings (subject_id, semester_id, section_id, weekly_hours) VALUES ($1, $2, $3, 3) RETURNING id`, [subB.rows[0].id, semB.rows[0].id, secB.rows[0].id]);
    
    const facB = await client.query(`INSERT INTO faculty (user_id, institution_id, department_id, full_name, email, employee_code) VALUES ($1, $2, $3, 'Fac B', 'facB@test.com', 'FB1') RETURNING id`, [idAdminA, idB, deptB.rows[0].id]); // reusing user just for fk
    
    const stuB = await client.query(`INSERT INTO students (user_id, institution_id, department_id, program_id, semester_id, section_id, roll_number, full_name) VALUES ($1, $2, $3, $4, $5, $6, '1', 'Stu B') RETURNING id`, [idAdminA, idB, deptB.rows[0].id, progB.rows[0].id, semB.rows[0].id, secB.rows[0].id]);
    
    // 4. Attempt to create session in B as A
    console.log('1. Attempting cross-tenant session creation...');
    const createRes = await fetchApi('/attendance/sessions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}` },
      body: JSON.stringify({
        subjectOfferingId: offB.rows[0].id,
        facultyId: facB.rows[0].id,
        sectionId: secB.rows[0].id,
        sessionDate: '2025-01-01'
      })
    });
    
    if (createRes.status === 403 || createRes.status === 404) {
      console.log(`✅ PASSED: Session creation blocked (${createRes.status})`);
    } else {
      console.log(`❌ FAILED: Session creation allowed! ${createRes.status}`, createRes.data);
    }
    
    // 5. Setup native session in A to test cross-tenant student submission
    const deptA = await client.query(`INSERT INTO departments (institution_id, code, name) VALUES ($1, 'CSA', 'CS A') RETURNING id`, [idA]);
    const progA = await client.query(`INSERT INTO programs (department_id, code, name, duration_years) VALUES ($1, 'BTECHA', 'BTech A', 4) RETURNING id`, [deptA.rows[0].id]);
    const semA = await client.query(`INSERT INTO semesters (program_id, number) VALUES ($1, 1) RETURNING id`, [progA.rows[0].id]);
    const secA = await client.query(`INSERT INTO sections (semester_id, code, capacity) VALUES ($1, 'A', 60) RETURNING id`, [semA.rows[0].id]);
    
    const subA = await client.query(`INSERT INTO subjects (department_id, semester_id, code, name, credits) VALUES ($1, $2, 'SUB_A', 'Sub A', 3) RETURNING id`, [deptA.rows[0].id, semA.rows[0].id]);
    const offA = await client.query(`INSERT INTO subject_offerings (subject_id, semester_id, section_id, weekly_hours) VALUES ($1, $2, $3, 3) RETURNING id`, [subA.rows[0].id, semA.rows[0].id, secA.rows[0].id]);
    const facA = await client.query(`INSERT INTO faculty (user_id, institution_id, department_id, full_name, email, employee_code) VALUES ($1, $2, $3, 'Fac A', 'facA@test.com', 'FA1') RETURNING id`, [idAdminA, idA, deptA.rows[0].id]);
    const stuA = await client.query(`INSERT INTO students (user_id, institution_id, department_id, program_id, semester_id, section_id, roll_number, full_name) VALUES ($1, $2, $3, $4, $5, $6, '1', 'Stu A') RETURNING id`, [idAdminA, idA, deptA.rows[0].id, progA.rows[0].id, semA.rows[0].id, secA.rows[0].id]);
    
    const sessA = await client.query(`INSERT INTO attendance_sessions (subject_offering_id, faculty_id, section_id, session_date, status) VALUES ($1, $2, $3, '2025-01-01', 'draft') RETURNING id`, [offA.rows[0].id, facA.rows[0].id, secA.rows[0].id]);
    
    console.log('\n2. Attempting to submit cross-tenant student records to native session...');
    const recordRes = await fetchApi(`/attendance/sessions/${sessA.rows[0].id}/records`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}` },
      body: JSON.stringify({
        records: [
          { studentId: stuA.rows[0].id, status: 'present' }, // Valid
          { studentId: stuB.rows[0].id, status: 'present' }  // Invalid (belongs to B)
        ]
      })
    });
    
    if (recordRes.status === 403 || recordRes.status === 404) {
      console.log(`✅ PASSED: Record submission blocked (${recordRes.status})`);
    } else {
      console.log(`❌ FAILED: Record submission allowed! ${recordRes.status}`, recordRes.data);
    }
    
    // 6. Test native successful submission
    console.log('\n3. Attempting native valid student submission...');
    const validRes = await fetchApi(`/attendance/sessions/${sessA.rows[0].id}/records`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}` },
      body: JSON.stringify({
        records: [
          { studentId: stuA.rows[0].id, status: 'present' }
        ]
      })
    });
    
    if (validRes.status === 200) {
      console.log(`✅ PASSED: Valid submission worked`);
    } else {
      console.log(`❌ FAILED: Valid submission failed ${validRes.status}`, validRes.data);
    }
    
    console.log('\nDone.');
  } catch(e) {
    console.error('Test Error:', e);
  } finally {
    client.release();
    process.exit(0);
  }
}

testAttendanceIsolation();
