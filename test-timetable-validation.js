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

async function testTimetableValidation() {
  console.log('--- TESTING TIMETABLE ENGINE & VALIDATION ---\n');
  const client = await pool.connect();
  try {
    // Setup Test Institution
    await client.query("DELETE FROM institutions WHERE name = 'Timetable Test Inst'");
    const inst = await client.query("INSERT INTO institutions (name) VALUES ('Timetable Test Inst') RETURNING id");
    const instId = inst.rows[0].id;

    // Setup Admin User & Token
    await client.query("DELETE FROM users WHERE email = 'tt.admin@test.com'");
    const admin = await client.query(`
      INSERT INTO users (institution_id, email, password_hash, full_name, status)
      VALUES ($1, 'tt.admin@test.com', 'hash', 'TT Admin', 'ACTIVE') RETURNING id
    `, [instId]);
    const adminId = admin.rows[0].id;
    await client.query(`INSERT INTO roles (code, name) VALUES ('SUPER_ADMIN', 'SA') ON CONFLICT DO NOTHING`);
    await client.query(`INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE code = 'SUPER_ADMIN'`, [adminId]);
    const token = jwt.sign({ sub: adminId, roles: ['SUPER_ADMIN'] }, process.env.AUTH_ACCESS_TOKEN_SECRET, { expiresIn: '1h' });

    // Setup Department, Program, Semester, Section
    const dept = await client.query(`INSERT INTO departments (institution_id, code, name) VALUES ($1, 'TTCS', 'TT CS') RETURNING id`, [instId]);
    const deptId = dept.rows[0].id;
    const prog = await client.query(`INSERT INTO programs (department_id, code, name, duration_years) VALUES ($1, 'TTBTECH', 'TT BTech', 4) RETURNING id`, [deptId]);
    const sem = await client.query(`INSERT INTO semesters (program_id, number) VALUES ($1, 1) RETURNING id`, [prog.rows[0].id]);
    const sec = await client.query(`INSERT INTO sections (semester_id, code, capacity) VALUES ($1, 'A', 60) RETURNING id`, [sem.rows[0].id]);

    // Setup Faculty & Classroom
    const fac = await client.query(`INSERT INTO faculty (user_id, institution_id, department_id, full_name, employee_code, max_weekly_hours) VALUES ($1, $2, $3, 'Prof X', 'PX1', 20) RETURNING id`, [adminId, instId, deptId]);
    const facId = fac.rows[0].id;

    const roomLec = await client.query(`INSERT INTO classrooms (institution_id, department_id, code, name, room_type, capacity) VALUES ($1, $2, 'CR101', 'Lec Room 1', 'lecture', 70) RETURNING id`, [instId, deptId]);
    const roomLab = await client.query(`INSERT INTO classrooms (institution_id, department_id, code, name, room_type, capacity) VALUES ($1, $2, 'LAB101', 'Lab Room 1', 'lab', 70) RETURNING id`, [instId, deptId]);

    // Setup Theory & Lab Subjects
    const sub1 = await client.query(`INSERT INTO subjects (department_id, code, name, subject_type, weekly_hours) VALUES ($1, 'CS101', 'Intro to CS', 'theory', 3) RETURNING id`, [deptId]);
    const subLab = await client.query(`INSERT INTO subjects (department_id, code, name, subject_type, weekly_hours) VALUES ($1, 'CS101L', 'CS Lab', 'lab', 2) RETURNING id`, [deptId]);

    // 1. Test Valid Generation
    console.log('1. Testing Valid Timetable Generation...');
    const validGen = await fetchApi('/timetable/generate', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        dept: 'TTCS',
        sectionCode: 'A',
        subjects: [
          { id: sub1.rows[0].id, code: 'CS101', name: 'Intro to CS', type: 'theory', weeklyHours: 3, facultyId: facId, roomId: roomLec.rows[0].id },
          { id: subLab.rows[0].id, code: 'CS101L', name: 'CS Lab', type: 'lab', weeklyHours: 2, facultyId: facId, roomId: roomLab.rows[0].id }
        ]
      })
    });

    if (validGen.status === 200 && validGen.data.report?.ok) {
      console.log(`✅ PASSED: Timetable generated successfully (${validGen.data.slots.length} slots)`);
    } else {
      console.log(`❌ FAILED: Valid generation failed:`, validGen.data);
    }

    // 2. Test Conflicting Data: Lab Subject with NO Lab Room Available
    console.log('\n2. Testing Conflict: Lab Subject with No Lab Room Available...');
    const labConflict = await fetchApi('/timetable/generate', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        dept: 'TTCS',
        sectionCode: 'A',
        subjects: [
          { id: subLab.rows[0].id, code: 'CS101L', name: 'CS Lab', type: 'lab', weeklyHours: 2, facultyId: facId, roomId: roomLec.rows[0].id } // passing lecture room only
        ]
      })
    });

    // Delete lab rooms to force conflict
    await client.query("DELETE FROM classrooms WHERE room_type = 'lab' AND institution_id = $1", [instId]);
    const labNoRoomRes = await fetchApi('/timetable/generate', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        dept: 'TTCS',
        sectionCode: 'A',
        subjects: [
          { id: subLab.rows[0].id, code: 'CS101L', name: 'CS Lab', type: 'lab', weeklyHours: 2, facultyId: facId }
        ]
      })
    });

    if (labNoRoomRes.status === 409 && labNoRoomRes.data.report?.ok === false) {
      console.log(`✅ PASSED: Lab without lab room correctly blocked with 409 Conflict`);
      console.log(`   Hard Conflict:`, labNoRoomRes.data.hardConflicts[0]?.message);
    } else {
      console.log(`❌ FAILED: Lab without room expected 409 but got ${labNoRoomRes.status}`, labNoRoomRes.data);
    }

    // 3. Test Conflict: Unassigned Faculty
    console.log('\n3. Testing Conflict: Missing Faculty Assignment...');
    const noFacRes = await fetchApi('/timetable/generate', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        dept: 'TTCS',
        sectionCode: 'A',
        subjects: [
          { id: sub1.rows[0].id, code: 'CS101', name: 'Intro to CS', type: 'theory', weeklyHours: 3, facultyId: null }
        ]
      })
    });

    if (noFacRes.status === 409 && noFacRes.data.report?.ok === false) {
      console.log(`✅ PASSED: Missing faculty correctly blocked with 409 Conflict`);
      console.log(`   Hard Conflict:`, noFacRes.data.hardConflicts[0]?.message);
    } else {
      console.log(`❌ FAILED: Missing faculty expected 409 but got ${noFacRes.status}`, noFacRes.data);
    }

    // 4. Test Conflict: Insufficient Room Capacity
    console.log('\n4. Testing Conflict: Insufficient Room Capacity...');
    await client.query("UPDATE classrooms SET capacity = 20 WHERE institution_id = $1", [instId]);
    const smallRoomRes = await fetchApi('/timetable/generate', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        dept: 'TTCS',
        sectionCode: 'A',
        subjects: [
          { id: sub1.rows[0].id, code: 'CS101', name: 'Intro to CS', type: 'theory', weeklyHours: 3, facultyId: facId }
        ]
      })
    });

    if (smallRoomRes.status === 409 && smallRoomRes.data.report?.ok === false) {
      console.log(`✅ PASSED: Small room capacity correctly blocked with 409 Conflict`);
      console.log(`   Hard Conflict:`, smallRoomRes.data.hardConflicts[0]?.message);
    } else {
      console.log(`❌ FAILED: Small room capacity expected 409 but got ${smallRoomRes.status}`, smallRoomRes.data);
    }

    // 5. Test Validate Move with Lunch Break
    console.log('\n5. Testing validate-move with Lunch Break slot...');
    const moveRes = await fetchApi('/timetable/validate-move', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        targetSlot: {
          day: 'Mon',
          slotIdx: 3, // Lunch break index
          sectionCode: 'A',
          facultyId: facId,
          roomId: roomLec.rows[0].id,
        }
      })
    });

    if (moveRes.status === 200 && moveRes.data.valid === false) {
      console.log(`✅ PASSED: Move into lunch break slot correctly rejected`);
      console.log(`   Error:`, moveRes.data.errors[0]);
    } else {
      console.log(`❌ FAILED: Move into lunch break expected invalid but got:`, moveRes.data);
    }

    console.log('\nDone.');
  } catch(e) {
    console.error('Test Error:', e);
  } finally {
    client.release();
    process.exit(0);
  }
}

testTimetableValidation();
