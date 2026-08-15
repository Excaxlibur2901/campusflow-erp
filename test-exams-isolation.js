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

async function testExamsIsolation() {
  console.log('--- TESTING EXAMS CROSS-INSTITUTION SECURITY ---\n');
  const client = await pool.connect();
  try {
    // 1. Setup Test Institutions A and B
    await client.query("DELETE FROM institutions WHERE name IN ('Exams Inst A', 'Exams Inst B')");
    
    const instA = await client.query("INSERT INTO institutions (name) VALUES ('Exams Inst A') RETURNING id");
    const idA = instA.rows[0].id;
    
    const instB = await client.query("INSERT INTO institutions (name) VALUES ('Exams Inst B') RETURNING id");
    const idB = instB.rows[0].id;
    
    // 2. Setup Super Admin for A
    await client.query("DELETE FROM users WHERE email IN ('exams.adminA@test.com', 'exams.adminB@test.com')");
    
    const adminA = await client.query(`
      INSERT INTO users (institution_id, email, password_hash, full_name, status)
      VALUES ($1, 'exams.adminA@test.com', 'hash', 'Admin A', 'ACTIVE') RETURNING id
    `, [idA]);
    const idAdminA = adminA.rows[0].id;
    await client.query(`INSERT INTO roles (code, name) VALUES ('SUPER_ADMIN', 'SA') ON CONFLICT DO NOTHING`);
    await client.query(`INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE code = 'SUPER_ADMIN'`, [idAdminA]);
    
    // Generate token for Admin A
    const tokenA = jwt.sign({ sub: idAdminA, roles: ['SUPER_ADMIN'] }, process.env.AUTH_ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
    
    // 3. Setup Department & Subjects for A and B
    const deptA = await client.query(`INSERT INTO departments (institution_id, code, name) VALUES ($1, 'CSA', 'CS A') RETURNING id`, [idA]);
    const progA = await client.query(`INSERT INTO programs (department_id, code, name, duration_years) VALUES ($1, 'BTECHA', 'BTech A', 4) RETURNING id`, [deptA.rows[0].id]);
    const semA = await client.query(`INSERT INTO semesters (program_id, number) VALUES ($1, 1) RETURNING id`, [progA.rows[0].id]);
    const secA = await client.query(`INSERT INTO sections (semester_id, code, capacity) VALUES ($1, 'A', 60) RETURNING id`, [semA.rows[0].id]);
    const subA = await client.query(`INSERT INTO subjects (department_id, semester_id, code, name, credits) VALUES ($1, $2, 'SUB_A', 'Sub A', 3) RETURNING id`, [deptA.rows[0].id, semA.rows[0].id]);
    const classA = await client.query(`INSERT INTO classrooms (institution_id, code, name, capacity) VALUES ($1, 'CA', 'Class A', 50) RETURNING id`, [idA]);
    const stuA = await client.query(`INSERT INTO students (user_id, institution_id, department_id, program_id, semester_id, section_id, roll_number, full_name) VALUES ($1, $2, $3, $4, $5, $6, 'E1', 'Stu A') RETURNING id`, [idAdminA, idA, deptA.rows[0].id, progA.rows[0].id, semA.rows[0].id, secA.rows[0].id]);

    const deptB = await client.query(`INSERT INTO departments (institution_id, code, name) VALUES ($1, 'CSB', 'CS B') RETURNING id`, [idB]);
    const progB = await client.query(`INSERT INTO programs (department_id, code, name, duration_years) VALUES ($1, 'BTECHB', 'BTech B', 4) RETURNING id`, [deptB.rows[0].id]);
    const semB = await client.query(`INSERT INTO semesters (program_id, number) VALUES ($1, 1) RETURNING id`, [progB.rows[0].id]);
    const secB = await client.query(`INSERT INTO sections (semester_id, code, capacity) VALUES ($1, 'A', 60) RETURNING id`, [semB.rows[0].id]);
    const subB = await client.query(`INSERT INTO subjects (department_id, semester_id, code, name, credits) VALUES ($1, $2, 'SUB_B', 'Sub B', 3) RETURNING id`, [deptB.rows[0].id, semB.rows[0].id]);
    const classB = await client.query(`INSERT INTO classrooms (institution_id, code, name, capacity) VALUES ($1, 'CB', 'Class B', 50) RETURNING id`, [idB]);
    const stuB = await client.query(`INSERT INTO students (user_id, institution_id, department_id, program_id, semester_id, section_id, roll_number, full_name) VALUES ($1, $2, $3, $4, $5, $6, 'E1', 'Stu B') RETURNING id`, [idAdminA, idB, deptB.rows[0].id, progB.rows[0].id, semB.rows[0].id, secB.rows[0].id]);

    // Create an exam in A
    const examA = await fetchApi('/exams', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}` },
      body: JSON.stringify({ name: 'Exam A', examType: 'midterm' })
    });
    const examIdA = examA.data.id;

    // Create an exam in B directly through DB
    const examBDB = await client.query(`INSERT INTO exams (institution_id, name, exam_type, created_by, updated_by) VALUES ($1, 'Exam B', 'midterm', $2, $2) RETURNING id`, [idB, idAdminA]);
    const examIdB = examBDB.rows[0].id;
    const esB = await client.query(`INSERT INTO exam_subjects (exam_id, subject_id, exam_date, session) VALUES ($1, $2, '2025-01-01', 'morning') RETURNING id`, [examIdB, subB.rows[0].id]);
    const regB = await client.query(`INSERT INTO exam_registrations (exam_subject_id, student_id, status) VALUES ($1, $2, 'registered') RETURNING id`, [esB.rows[0].id, stuB.rows[0].id]);

    // 4. Test adding subject B to exam A
    console.log('1. Attempting to add cross-tenant subject to exam...');
    const esRes = await fetchApi(`/exams/${examIdA}/subjects`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}` },
      body: JSON.stringify({ subjectId: subB.rows[0].id, examDate: '2025-01-01', session: 'morning' })
    });
    if (esRes.status === 403 || esRes.status === 404) console.log(`✅ PASSED: Cross-tenant subject blocked (${esRes.status})`);
    else console.log(`❌ FAILED: Cross-tenant subject allowed! ${esRes.status}`);

    // Add subject A to exam A to continue
    const validEsRes = await fetchApi(`/exams/${examIdA}/subjects`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}` },
      body: JSON.stringify({ subjectId: subA.rows[0].id, examDate: '2025-01-01', session: 'morning' })
    });
    const examSubjectIdA = validEsRes.data.id;

    // 5. Test adding classroom B to exam A
    console.log('\n2. Attempting to add cross-tenant classroom to exam...');
    const hallRes = await fetchApi(`/exams/${examIdA}/halls`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}` },
      body: JSON.stringify({ classroomId: classB.rows[0].id })
    });
    if (hallRes.status === 403 || hallRes.status === 404) console.log(`✅ PASSED: Cross-tenant classroom blocked (${hallRes.status})`);
    else console.log(`❌ FAILED: Cross-tenant classroom allowed! ${hallRes.status}`);

    // 6. Test registering student B to exam A
    console.log('\n3. Attempting to register cross-tenant student to exam...');
    const regRes = await fetchApi(`/exams/${examIdA}/registrations`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenA}` },
      body: JSON.stringify({ examSubjectId: examSubjectIdA, studentIds: [stuB.rows[0].id] })
    });
    if (regRes.status === 403 || regRes.status === 404) console.log(`✅ PASSED: Cross-tenant student blocked (${regRes.status})`);
    else console.log(`❌ FAILED: Cross-tenant student allowed! ${regRes.status}`);

    // 7. Test marking absent registration B using Exam A
    console.log('\n4. Attempting to update foreign registration via own exam context...');
    const absentRes = await fetchApi(`/exams/${examIdA}/registrations/${regB.rows[0].id}/absent`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${tokenA}` },
      body: JSON.stringify({ absent: true })
    });
    if (absentRes.status === 403 || absentRes.status === 404) console.log(`✅ PASSED: Cross-tenant registration update blocked (${absentRes.status})`);
    else console.log(`❌ FAILED: Cross-tenant registration update allowed! ${absentRes.status}`);

    console.log('\nDone.');
  } catch(e) {
    console.error('Test Error:', e);
  } finally {
    client.release();
    process.exit(0);
  }
}

testExamsIsolation();
