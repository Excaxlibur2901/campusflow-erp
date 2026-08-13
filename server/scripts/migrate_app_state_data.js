/**
 * Data Migration Script — CampusFlow ERP
 * Safely migrates existing app_state JSON data into normalized PostgreSQL tables.
 * Detects duplicates, reports duplicate counts, and preserves existing data.
 */

import { pool } from '../db.js';

export async function migrateAppStateToNormalizedTables() {
  console.log('─── Starting app_state -> PostgreSQL Normalized Migration ───');

  const stateRes = await pool.query(`SELECT data FROM app_state WHERE id = 'main'`);
  if (stateRes.rowCount === 0) {
    console.log('[migration] No app_state data found. Skipping migration.');
    return { status: 'skipped', reason: 'no_app_state' };
  }

  const data = stateRes.rows[0].data ?? {};
  const stats = {
    institutions: 0,
    departments: { migrated: 0, duplicates: 0 },
    faculty: { migrated: 0, duplicates: 0 },
    students: { migrated: 0, duplicates: 0 },
    subjects: { migrated: 0, duplicates: 0 },
    classrooms: { migrated: 0, duplicates: 0 },
  };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Institution Migration
    let institutionId = null;
    const settings = data.settings ?? {};
    const instName = settings.institutionName?.trim() || 'Default Institution';

    const instRes = await client.query(
      `INSERT INTO institutions (name, affiliation, address, phone, email, website, naac_grade, aishe_code, principal_name, autonomous_status, college_type, motto, logo_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [
        instName, settings.affiliation || null, settings.address || null,
        settings.phone || null, settings.email || null, settings.website || null,
        settings.naacGrade || null, settings.aisheCode || null, settings.principalName || null,
        settings.autonomousStatus || null, settings.collegeType || null, settings.motto || null, settings.collegeLogo || null
      ],
    );

    if (instRes.rowCount > 0) {
      institutionId = instRes.rows[0].id;
      stats.institutions++;
    } else {
      const existingInst = await client.query(`SELECT id FROM institutions WHERE name = $1 LIMIT 1`, [instName]);
      if (existingInst.rowCount > 0) institutionId = existingInst.rows[0].id;
    }

    // Map department code to UUID
    const deptIdMap = new Map();

    // 2. Departments Migration
    const depts = Array.isArray(data.departments) ? data.departments : [];
    for (const d of depts) {
      const code = (d.code || d.id || '').toString().trim().toUpperCase();
      const name = (d.name || code).toString().trim();
      if (!code || !name) continue;

      try {
        const res = await client.query(
          `INSERT INTO departments (institution_id, code, name, active)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (code) DO NOTHING
           RETURNING id`,
          [institutionId, code, name, d.active !== false],
        );
        if (res.rowCount > 0) {
          deptIdMap.set(code, res.rows[0].id);
          stats.departments.migrated++;
        } else {
          stats.departments.duplicates++;
          const existing = await client.query(`SELECT id FROM departments WHERE code = $1 LIMIT 1`, [code]);
          if (existing.rowCount > 0) deptIdMap.set(code, existing.rows[0].id);
        }
      } catch (err) {
        console.warn(`[migration] Department insert warning (${code}):`, err.message);
      }
    }

    // 3. Faculty Migration
    const facultyList = Array.isArray(data.facultyList) ? data.facultyList : [];
    for (const f of facultyList) {
      const code = (f.employeeCode || f.id || `EMP-${Date.now()}`).toString().trim();
      const name = (f.fullName || f.name || '').toString().trim();
      if (!name) continue;

      const deptCode = (f.dept || f.department || '').toString().trim().toUpperCase();
      const deptId = deptIdMap.get(deptCode) || null;

      try {
        const res = await client.query(
          `INSERT INTO faculty (institution_id, department_id, employee_code, full_name, email, phone, designation, specialization, max_weekly_hours, active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (institution_id, employee_code) DO NOTHING
           RETURNING id`,
          [
            institutionId, deptId, code, name,
            f.email || null, f.phone || null, f.designation || f.role || null,
            f.specialization || null, Number(f.maxWeeklyHours || 22), f.active !== false
          ],
        );
        if (res.rowCount > 0) stats.faculty.migrated++;
        else stats.faculty.duplicates++;
      } catch (err) {
        console.warn(`[migration] Faculty insert warning (${code}):`, err.message);
      }
    }

    // 4. Students Migration
    const studentsList = Array.isArray(data.studentsList) ? data.studentsList : [];
    for (const s of studentsList) {
      const rollNumber = (s.rollNumber || s.roll_number || s.id || `ROLL-${Date.now()}`).toString().trim();
      const fullName = (s.fullName || s.name || '').toString().trim();
      if (!fullName) continue;

      const deptCode = (s.dept || s.department || '').toString().trim().toUpperCase();
      const deptId = deptIdMap.get(deptCode) || null;

      try {
        const res = await client.query(
          `INSERT INTO students (institution_id, department_id, roll_number, enrollment_number, full_name, email, phone, year, division, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (institution_id, roll_number) DO NOTHING
           RETURNING id`,
          [
            institutionId, deptId, rollNumber, s.enrollmentNumber || null,
            fullName, s.email || null, s.phone || null,
            Number(s.year || 1), s.division || s.section || null, s.status ? s.status.toUpperCase() : 'ACTIVE'
          ],
        );
        if (res.rowCount > 0) stats.students.migrated++;
        else stats.students.duplicates++;
      } catch (err) {
        console.warn(`[migration] Student insert warning (${rollNumber}):`, err.message);
      }
    }

    // 5. Subjects Migration
    const subjectsList = Array.isArray(data.subjectsList) ? data.subjectsList : [];
    for (const sub of subjectsList) {
      const code = (sub.code || sub.id || '').toString().trim().toUpperCase();
      const name = (sub.name || code).toString().trim();
      if (!code || !name) continue;

      const deptCode = (sub.dept || sub.department || '').toString().trim().toUpperCase();
      const deptId = deptIdMap.get(deptCode) || null;

      const rawType = (sub.subjectType || sub.type || 'theory').toString().toLowerCase();
      const validTypes = ['theory', 'lab', 'practical', 'project', 'elective'];
      const subjectType = validTypes.includes(rawType) ? rawType : 'theory';

      try {
        const res = await client.query(
          `INSERT INTO subjects (department_id, code, name, subject_type, credits, weekly_hours, active)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (department_id, code) DO NOTHING
           RETURNING id`,
          [
            deptId, code, name, subjectType,
            Number(sub.credits || 3), Number(sub.weeklyHours || sub.hours || 3), sub.active !== false
          ],
        );
        if (res.rowCount > 0) stats.subjects.migrated++;
        else stats.subjects.duplicates++;
      } catch (err) {
        console.warn(`[migration] Subject insert warning (${code}):`, err.message);
      }
    }

    // 6. Classrooms Migration
    const classroomsList = Array.isArray(data.classroomsList) ? data.classroomsList : [];
    for (const c of classroomsList) {
      const code = (c.code || c.roomNumber || c.id || '').toString().trim().toUpperCase();
      const name = (c.name || code).toString().trim();
      if (!code) continue;

      const rawType = (c.roomType || c.type || 'lecture').toString().toLowerCase();
      const typeMap = { 'lecture': 'lecture', 'lab': 'lab', 'seminar': 'seminar', 'exam': 'exam_hall', 'exam_hall': 'exam_hall' };
      const roomType = typeMap[rawType] || 'lecture';

      try {
        const res = await client.query(
          `INSERT INTO classrooms (institution_id, code, name, room_type, capacity, rows_count, columns_count, benches_count, seats_per_bench, active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (institution_id, code) DO NOTHING
           RETURNING id`,
          [
            institutionId, code, name, roomType,
            Math.max(1, Number(c.capacity || 60)), Number(c.rowsCount || c.rows || 6),
            Number(c.columnsCount || c.cols || 10), Number(c.benchesCount || 30), Number(c.seatsPerBench || 2), c.active !== false
          ],
        );
        if (res.rowCount > 0) stats.classrooms.migrated++;
        else stats.classrooms.duplicates++;
      } catch (err) {
        console.warn(`[migration] Classroom insert warning (${code}):`, err.message);
      }
    }

    await client.query('COMMIT');
    console.log('─── Data Migration Finished Successfully ───');
    console.log(JSON.stringify(stats, null, 2));
    return { status: 'success', stats };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Data migration failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}
