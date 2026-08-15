import { execSync } from 'child_process';
import { pool } from './server/db.js';
import bcrypt from 'bcryptjs';

const API_URL = 'http://localhost:4000/api';

async function fetchApi(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers }
  });
  let data = {};
  try { data = await res.json(); } catch {}
  return { ok: res.ok, status: res.status, data };
}

async function setupTestData() {
  console.log('Cleaning up previous test data...');
  await pool.query(`DELETE FROM users WHERE email IN ('admin@insta.com', 'admin@instb.com')`);
  await pool.query(`DELETE FROM institutions WHERE name IN ('Institution A', 'Institution B')`);

  // Create Institution A
  console.log('Creating Test Data in PostgreSQL directly for Inst A and Inst B...');
  const instA = await pool.query(`INSERT INTO institutions (name) VALUES ('Institution A') RETURNING id`);
  const instB = await pool.query(`INSERT INTO institutions (name) VALUES ('Institution B') RETURNING id`);
  const idA = instA.rows[0].id;
  const idB = instB.rows[0].id;

  const roleRes = await pool.query(`SELECT id FROM roles WHERE code = 'SUPER_ADMIN'`);
  const adminRoleId = roleRes.rows[0].id;
  
  const hash = await bcrypt.hash('Password123!', 10);
  
  const userA = await pool.query(`INSERT INTO users (institution_id, email, password_hash, full_name, initials, status) VALUES ($1, 'admin@insta.com', $2, 'Admin A', 'AA', 'ACTIVE') RETURNING id`, [idA, hash]);
  await pool.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`, [userA.rows[0].id, adminRoleId]);
  
  const userB = await pool.query(`INSERT INTO users (institution_id, email, password_hash, full_name, initials, status) VALUES ($1, 'admin@instb.com', $2, 'Admin B', 'AB', 'ACTIVE') RETURNING id`, [idB, hash]);
  await pool.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`, [userB.rows[0].id, adminRoleId]);

  // Depts
  const deptA = await pool.query(`INSERT INTO departments (institution_id, code, name) VALUES ($1, 'CS-A', 'Computer Science A') RETURNING id`, [idA]);
  const deptB = await pool.query(`INSERT INTO departments (institution_id, code, name) VALUES ($1, 'CS-B', 'Computer Science B') RETURNING id`, [idB]);
  
  // Programs
  const progA = await pool.query(`INSERT INTO programs (department_id, code, name, duration_years) VALUES ($1, 'BTECH-A', 'BTech A', 4) RETURNING id`, [deptA.rows[0].id]);
  const progB = await pool.query(`INSERT INTO programs (department_id, code, name, duration_years) VALUES ($1, 'BTECH-B', 'BTech B', 4) RETURNING id`, [deptB.rows[0].id]);

  // Semesters
  const semA = await pool.query(`INSERT INTO semesters (program_id, number) VALUES ($1, 1) RETURNING id`, [progA.rows[0].id]);
  const semB = await pool.query(`INSERT INTO semesters (program_id, number) VALUES ($1, 1) RETURNING id`, [progB.rows[0].id]);

  // Sections
  const secA = await pool.query(`INSERT INTO sections (semester_id, code) VALUES ($1, 'A') RETURNING id`, [semA.rows[0].id]);
  const secB = await pool.query(`INSERT INTO sections (semester_id, code) VALUES ($1, 'A') RETURNING id`, [semB.rows[0].id]);

  // Subjects
  const subjA = await pool.query(`INSERT INTO subjects (department_id, code, name) VALUES ($1, 'SUB-A', 'Subject A') RETURNING id`, [deptA.rows[0].id]);
  const subjB = await pool.query(`INSERT INTO subjects (department_id, code, name) VALUES ($1, 'SUB-B', 'Subject B') RETURNING id`, [deptB.rows[0].id]);

  // Subject Offerings
  const offA = await pool.query(`INSERT INTO subject_offerings (subject_id, semester_id, weekly_hours) VALUES ($1, $2, 4) RETURNING id`, [subjA.rows[0].id, semA.rows[0].id]);
  const offB = await pool.query(`INSERT INTO subject_offerings (subject_id, semester_id, weekly_hours) VALUES ($1, $2, 4) RETURNING id`, [subjB.rows[0].id, semB.rows[0].id]);

  // Exams
  const examA = await pool.query(`INSERT INTO exams (institution_id, name, exam_type) VALUES ($1, 'Exam A', 'MID_TERM') RETURNING id`, [idA]);
  const examB = await pool.query(`INSERT INTO exams (institution_id, name, exam_type) VALUES ($1, 'Exam B', 'MID_TERM') RETURNING id`, [idB]);

  // Faculty
  const facA = await pool.query(`INSERT INTO faculty (institution_id, full_name, employee_code, department_id) VALUES ($1, 'Fac A', 'FA01', $2) RETURNING id`, [idA, deptA.rows[0].id]);
  const facB = await pool.query(`INSERT INTO faculty (institution_id, full_name, employee_code, department_id) VALUES ($1, 'Fac B', 'FB01', $2) RETURNING id`, [idB, deptB.rows[0].id]);

  // Classrooms
  const clsA = await pool.query(`INSERT INTO classrooms (institution_id, code, name, capacity) VALUES ($1, 'CL-A', 'Room A', 60) RETURNING id`, [idA]);
  const clsB = await pool.query(`INSERT INTO classrooms (institution_id, code, name, capacity) VALUES ($1, 'CL-B', 'Room B', 60) RETURNING id`, [idB]);

  // Students
  const stuA = await pool.query(`INSERT INTO students (institution_id, full_name, roll_number) VALUES ($1, 'Student A', 'STA01') RETURNING id`, [idA]);
  const stuB = await pool.query(`INSERT INTO students (institution_id, full_name, roll_number) VALUES ($1, 'Student B', 'STB01') RETURNING id`, [idB]);

  // Exam Hall
  const examHallA = await pool.query(`INSERT INTO exam_halls (exam_id, classroom_id, rows_count, columns_count, capacity) VALUES ($1, $2, 6, 10, 60) RETURNING id`, [examA.rows[0].id, clsA.rows[0].id]);
  
  // Attendance Session
  const attA = await pool.query(`INSERT INTO attendance_sessions (subject_offering_id, session_date) VALUES ($1, '2026-01-01') RETURNING id`, [offA.rows[0].id]);

  // Mark Component
  const markCompA = await pool.query(`INSERT INTO mark_components (subject_offering_id, name, component_type, max_marks) VALUES ($1, 'Quiz A', 'quiz', 10) RETURNING id`, [offA.rows[0].id]);

  // Timetable Slot
  const timeA = await pool.query(`INSERT INTO time_slots (institution_id, label, day_of_week, starts_at, ends_at) VALUES ($1, 'Mon-1', 1, '09:00', '10:00') RETURNING id`, [idA]);
  const tteA = await pool.query(`INSERT INTO timetable_entries (subject_offering_id, time_slot_id, section_id, faculty_id) VALUES ($1, $2, $3, $4) RETURNING id`, [offA.rows[0].id, timeA.rows[0].id, secA.rows[0].id, facA.rows[0].id]);

  return {
    instA: idA,
    instB: idB,
    deptA: deptA.rows[0].id,
    subjA: subjA.rows[0].id,
    offA: offA.rows[0].id,
    facA: facA.rows[0].id,
    stuA: stuA.rows[0].id,
    examA: examA.rows[0].id,
    clsA: clsA.rows[0].id,
    examHallA: examHallA.rows[0].id,
    attA: attA.rows[0].id,
    markCompA: markCompA.rows[0].id,
    tteA: tteA.rows[0].id
  };
}

async function runTest() {
  const ids = await setupTestData();

  console.log('\nLogging in as Admin A (Institution A)...');
  const loginRes = await fetchApi('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@insta.com', password: 'Password123!' })
  });
  if (!loginRes.ok) throw new Error('Login failed for A');
  const headers = { 'Authorization': `Bearer ${loginRes.data.accessToken}` };

  console.log('\n--- TESTING SAME-TENANT ACCESS (A ACCESSING A\'S RESOURCES) ---');
  let failures = [];

  const check = async (name, promise) => {
    const res = await promise;
    if (res.status !== 403 && res.status !== 404) {
      console.log(`❌ FAILED: ${name} (Returned ${res.status})`);
      if (res.status === 500) {
        console.log(`   Body:`, res.data);
      }
      failures.push(name);
    } else {
      console.log(`✅ PASSED: ${name} (Returned ${res.status})`);
    }
  };

  await check('GET /institutions/:id_A', fetchApi(`/institutions/${ids.instA}`, { headers }));
  await check('PUT /institutions/:id_A', fetchApi(`/institutions/${ids.instA}`, { method: 'PUT', headers, body: JSON.stringify({ name: 'Hacked' }) }));
  await check('DELETE /institutions/:id_A', fetchApi(`/institutions/${ids.instA}`, { method: 'DELETE', headers }));

  await check('GET /departments/:id_A', fetchApi(`/departments/${ids.deptA}`, { headers }));
  await check('PUT /departments/:id_A', fetchApi(`/departments/${ids.deptA}`, { method: 'PUT', headers, body: JSON.stringify({ name: 'Hacked' }) }));
  
  await check('PUT /subjects/:id_A', fetchApi(`/subjects/${ids.subjA}`, { method: 'PUT', headers, body: JSON.stringify({ name: 'Hacked' }) }));
  await check('DELETE /subjects/:id_A', fetchApi(`/subjects/${ids.subjA}`, { method: 'DELETE', headers }));

  await check('PUT /classrooms/:id_A', fetchApi(`/classrooms/${ids.clsA}`, { method: 'PUT', headers, body: JSON.stringify({ name: 'Hacked' }) }));
  
  await check('PUT /faculty/:id_A', fetchApi(`/faculty/${ids.facA}`, { method: 'PUT', headers, body: JSON.stringify({ fullName: 'Hacked' }) }));
  
  await check('PUT /students/:id_A', fetchApi(`/students/${ids.stuA}`, { method: 'PUT', headers, body: JSON.stringify({ fullName: 'Hacked' }) }));

  await check('PUT /exams/:id_A', fetchApi(`/exams/${ids.examA}`, { method: 'PUT', headers, body: JSON.stringify({ name: 'Hacked' }) }));
  await check('GET /exams/:id_A/seating', fetchApi(`/exams/${ids.examA}/seating`, { headers }));
  await check('POST /exams/:id_A/seating/generate', fetchApi(`/exams/${ids.examA}/seating/generate`, { method: 'POST', headers, body: JSON.stringify({}) }));

  await check('PUT /marks/components/:id_A', fetchApi(`/marks/components/${ids.markCompA}`, { method: 'PUT', headers, body: JSON.stringify({ name: 'Hacked' }) }));
  await check('DELETE /marks/components/:id_A', fetchApi(`/marks/components/${ids.markCompA}`, { method: 'DELETE', headers }));
  await check('GET /marks/components/:id_A/marks', fetchApi(`/marks/components/${ids.markCompA}/marks`, { headers }));
  await check('POST /marks/components/:id_A/marks', fetchApi(`/marks/components/${ids.markCompA}/marks`, { method: 'POST', headers, body: JSON.stringify({ marks: [] }) }));

  await check('POST /attendance/sessions/:id_A/records', fetchApi(`/attendance/sessions/${ids.attA}/records`, { method: 'POST', headers, body: JSON.stringify({ records: [{studentId: ids.stuA, status: 'present'}] }) }));

  await check('PUT /timetable/:id_A', fetchApi(`/timetable/${ids.tteA}`, { method: 'PUT', headers, body: JSON.stringify({}) }));
  await check('DELETE /timetable/:id_A', fetchApi(`/timetable/${ids.tteA}`, { method: 'DELETE', headers }));

  if (failures.length > 0) {
    console.error(`\n❌ Total Vulnerabilities Found: ${failures.length}`);
    failures.forEach(f => console.log('  - ' + f));
    // Do not exit 1 yet so we can see all output during dev
  } else {
    console.log(`\n✅ ALL ISOLATION TESTS PASSED!`);
  }
}

runTest().catch(console.error).finally(() => process.exit(0));
