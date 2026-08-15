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

async function testMarksIsolation() {
  console.log('--- TESTING MARKS CROSS-INSTITUTION SECURITY ---\n');
  const client = await pool.connect();
  try {
    // 1. Setup Test Institutions A and B
    await client.query("DELETE FROM institutions WHERE name IN ('Marks Inst A', 'Marks Inst B')");
    
    const instA = await client.query("INSERT INTO institutions (name) VALUES ('Marks Inst A') RETURNING id");
    const idA = instA.rows[0].id;
    
    const instB = await client.query("INSERT INTO institutions (name) VALUES ('Marks Inst B') RETURNING id");
    const idB = instB.rows[0].id;
    
    // 2. Setup Super Admin for A
    await client.query("DELETE FROM users WHERE email IN ('marks.adminA@test.com', 'marks.adminB@test.com')");
    
    const adminA = await client.query(`
      INSERT INTO users (institution_id, email, password_hash, full_name, status)
      VALUES ($1, 'marks.adminA@test.com', 'hash', 'Admin A', 'ACTIVE') RETURNING id
    `, [idA]);
    const idAdminA = adminA.rows[0].id;
    await client.query(`INSERT INTO roles (code, name) VALUES ('SUPER_ADMIN', 'SA') ON CONFLICT DO NOTHING`);
    await client.query(`INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE code = 'SUPER_ADMIN'`, [idAdminA]);
    
    // Generate token for Admin A
    const tokenA = jwt.sign({ sub: idAdminA, roles: ['SUPER_ADMIN'] }, process.env.AUTH_ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
    
    // 3. Setup Department & Subjects for B
    const deptB = await client.query(`INSERT INTO departments (institution_id, code, name) VALUES ($1, 'CSB', 'CS B') RETURNING id`, [idB]);
    const progB = await client.query(`INSERT INTO programs (department_id, code, name, duration_years) VALUES ($1, 'BTECHB', 'BTech B', 4) RETURNING id`, [deptB.rows[0].id]);
    const semB = await client.query(`INSERT INTO semesters (program_id, number) VALUES ($1, 1) RETURNING id`, [progB.rows[0].id]);
    const secB = await client.query(`INSERT INTO sections (semester_id, code, capacity) VALUES ($1, 'A', 60) RETURNING id`, [semB.rows[0].id]);
    
    const subB = await client.query(`INSERT INTO subjects (department_id, semester_id, code, name, credits) VALUES ($1, $2, 'SUB_B', 'Sub B', 3) RETURNING id`, [deptB.rows[0].id, semB.rows[0].id]);
    const offB = await client.query(`INSERT INTO subject_offerings (subject_id, semester_id, section_id, weekly_hours) VALUES ($1, $2, $3, 3) RETURNING id`, [subB.rows[0].id, semB.rows[0].id, secB.rows[0].id]);
    
    const stuB = await client.query(`INSERT INTO students (user_id, institution_id, department_id, program_id, semester_id, section_id, roll_number, full_name) VALUES ($1, $2, $3, $4, $5, $6, 'M1', 'Stu B') RETURNING id`, [idAdminA, idB, deptB.rows[0].id, progB.rows[0].id, semB.rows[0].id, secB.rows[0].id]);
    
    const compB = await client.query(`INSERT INTO mark_components (subject_offering_id, subject_id, semester, section_id, name, component_type, max_marks, weight, status) VALUES ($1, $2, $3, $4, 'Midterm', 'internal', 100, 50, 'draft') RETURNING id`, [offB.rows[0].id, subB.rows[0].id, 1, secB.rows[0].id]);
    
    // 4. Attempt to create component in B as A
    console.log('1. Attempting cross-tenant component creation...');
    const createRes = await fetchApi('/marks/components', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}` },
      body: JSON.stringify({
        subjectId: subB.rows[0].id,
        name: 'Final',
        maxMarks: 100
      })
    });
    
    if (createRes.status === 403 || createRes.status === 404) {
      console.log(`✅ PASSED: Component creation blocked (${createRes.status})`);
    } else {
      console.log(`❌ FAILED: Component creation allowed! ${createRes.status}`, createRes.data);
    }
    
    // 5. Setup native subject & component in A to test cross-tenant marks assignment
    const deptA = await client.query(`INSERT INTO departments (institution_id, code, name) VALUES ($1, 'CSA', 'CS A') RETURNING id`, [idA]);
    const progA = await client.query(`INSERT INTO programs (department_id, code, name, duration_years) VALUES ($1, 'BTECHA', 'BTech A', 4) RETURNING id`, [deptA.rows[0].id]);
    const semA = await client.query(`INSERT INTO semesters (program_id, number) VALUES ($1, 1) RETURNING id`, [progA.rows[0].id]);
    const secA = await client.query(`INSERT INTO sections (semester_id, code, capacity) VALUES ($1, 'A', 60) RETURNING id`, [semA.rows[0].id]);
    
    const subA = await client.query(`INSERT INTO subjects (department_id, semester_id, code, name, credits) VALUES ($1, $2, 'SUB_A', 'Sub A', 3) RETURNING id`, [deptA.rows[0].id, semA.rows[0].id]);
    const offA = await client.query(`INSERT INTO subject_offerings (subject_id, semester_id, section_id, weekly_hours) VALUES ($1, $2, $3, 3) RETURNING id`, [subA.rows[0].id, semA.rows[0].id, secA.rows[0].id]);
    
    const stuA = await client.query(`INSERT INTO students (user_id, institution_id, department_id, program_id, semester_id, section_id, roll_number, full_name) VALUES ($1, $2, $3, $4, $5, $6, 'M1', 'Stu A') RETURNING id`, [idAdminA, idA, deptA.rows[0].id, progA.rows[0].id, semA.rows[0].id, secA.rows[0].id]);
    
    const compA = await client.query(`INSERT INTO mark_components (subject_offering_id, subject_id, semester, section_id, name, component_type, max_marks, weight, status) VALUES ($1, $2, $3, $4, 'Midterm A', 'internal', 100, 50, 'draft') RETURNING id`, [offA.rows[0].id, subA.rows[0].id, 1, secA.rows[0].id]);
    
    console.log('\n2. Attempting to assign cross-tenant mark (Student B in Component A)...');
    const assignRes = await fetchApi(`/marks`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}` },
      body: JSON.stringify({
        componentId: compA.rows[0].id,
        studentId: stuB.rows[0].id,
        obtainedMarks: 95
      })
    });
    
    if (assignRes.status === 403 || assignRes.status === 404) {
      console.log(`✅ PASSED: Cross-tenant mark assignment blocked (${assignRes.status})`);
    } else {
      console.log(`❌ FAILED: Cross-tenant mark assignment allowed! ${assignRes.status}`, assignRes.data);
    }
    
    console.log('\n3. Attempting to assign cross-tenant mark (Student A in Component B)...');
    const assignRes2 = await fetchApi(`/marks`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}` },
      body: JSON.stringify({
        componentId: compB.rows[0].id,
        studentId: stuA.rows[0].id,
        obtainedMarks: 95
      })
    });
    
    if (assignRes2.status === 403 || assignRes2.status === 404) {
      console.log(`✅ PASSED: Cross-tenant mark assignment blocked (${assignRes2.status})`);
    } else {
      console.log(`❌ FAILED: Cross-tenant mark assignment allowed! ${assignRes2.status}`, assignRes2.data);
    }
    
    console.log('\n4. Attempting native valid mark assignment...');
    const validRes = await fetchApi(`/marks`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}` },
      body: JSON.stringify({
        componentId: compA.rows[0].id,
        studentId: stuA.rows[0].id,
        obtainedMarks: 95
      })
    });
    
    if (validRes.status === 200) {
      console.log(`✅ PASSED: Valid submission worked`);
    } else {
      console.log(`❌ FAILED: Valid submission failed ${validRes.status}`, validRes.data);
    }
    
    console.log('\n5. Attempting to bulk-assign cross-tenant mark (Student B in Component A)...');
    const bulkRes = await fetchApi(`/marks/bulk`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}` },
      body: JSON.stringify({
        componentId: compA.rows[0].id,
        entries: [
          { studentId: stuA.rows[0].id, obtainedMarks: 90 }, // Valid
          { studentId: stuB.rows[0].id, obtainedMarks: 90 }  // Invalid, belongs to B
        ]
      })
    });
    
    if (bulkRes.status === 200 && bulkRes.data.skippedCount === 1 && bulkRes.data.updatedCount === 1) {
      console.log(`✅ PASSED: Cross-tenant student skipped in bulk assignment`);
    } else {
      console.log(`❌ FAILED: Bulk assignment behaved unexpectedly:`, bulkRes.data);
    }
    
    console.log('\nDone.');
  } catch(e) {
    console.error('Test Error:', e);
  } finally {
    client.release();
    process.exit(0);
  }
}

testMarksIsolation();
