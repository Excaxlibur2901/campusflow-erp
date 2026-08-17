/**
 * Subjects API — CampusFlow ERP
 * GET /api/subjects | POST | PUT /:id | DELETE /:id
 */
import { Router } from 'express';
import { pool } from '../db.js';
import { authenticateUser, requireRole } from '../middleware/auth.js';
import { auditLog } from '../utils/audit.js';
import { ensureAcademicYearForInstitution, ensureSectionsForSemester } from './academic.js';

const router = Router();
router.use(authenticateUser);

router.get('/', async (req, res, next) => {
  try {
    const { dept, search, semester } = req.query;
    const conds = [];
    const params = [];
    let idx = 1;
    conds.push(`d.institution_id = $${idx++}`);
    params.push(req.user.institution_id);
    if (dept) { conds.push(`d.code = $${idx++}`); params.push(dept); }
    if (semester) {
      const isSemNum = !isNaN(Number(semester));
      if (isSemNum) {
        conds.push(`(sem.number = $${idx} OR s.semester_id::text = $${idx}::text)`);
        params.push(Number(semester));
      } else {
        conds.push(`s.semester_id::text = $${idx}`);
        params.push(String(semester));
      }
      idx++;
    }
    if (search) { conds.push(`(s.name ILIKE $${idx} OR s.code ILIKE $${idx})`); params.push(`%${search}%`); idx++; }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT s.id, s.department_id, s.code, s.name, s.subject_type, s.credits, s.weekly_hours,
              s.active, s.semester_id, s.created_by, s.updated_by, s.created_at, s.updated_at,
              d.code AS dept_code, d.name AS dept_name,
              f.id AS faculty_id, f.full_name AS faculty_name, f.employee_code AS faculty_code,
              COALESCE(sem.number, 1) AS semester,
              sem.number AS semester_number,
              sem.id AS semester_id
       FROM subjects s
       INNER JOIN departments d ON d.id = s.department_id
       LEFT JOIN faculty f ON f.id = s.faculty_id
       LEFT JOIN semesters sem ON sem.id = s.semester_id
       ${where}
       ORDER BY d.code, s.code`,
      params,
    );
    return res.json(result.rows);
  } catch (err) { next(err); }
});

router.post('/', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'HOD'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { code, name, subjectType, credits, weeklyHours, departmentId, dept, facultyId, semester, semesterId } = req.body;
    if (!code?.trim()) return res.status(400).json({ error: 'Subject code is required.' });
    if (!name?.trim()) return res.status(400).json({ error: 'Subject name is required.' });

    let effectiveDeptId = departmentId;
    if (!effectiveDeptId && dept) {
      const dCheck = await client.query('SELECT id FROM departments WHERE code = $1 AND institution_id = $2', [dept, req.user.institution_id]);
      if (dCheck.rowCount > 0) effectiveDeptId = dCheck.rows[0].id;
    }

    if (effectiveDeptId) {
      const dCheck = await client.query('SELECT id FROM departments WHERE id = $1 AND institution_id = $2', [effectiveDeptId, req.user.institution_id]);
      if (dCheck.rowCount === 0) return res.status(404).json({ error: 'Department not found in your institution.' });
    }

    if (facultyId) {
      const fCheck = await client.query('SELECT id FROM faculty WHERE id = $1 AND institution_id = $2 AND active = true', [facultyId, req.user.institution_id]);
      if (fCheck.rowCount === 0) return res.status(400).json({ error: 'Faculty does not belong to this institution or is inactive.' });
    }

    // Resolve target semester_id
    let targetSemesterId = null;
    let targetSemesterNumber = null;
    const requestedSem = semesterId !== undefined ? semesterId : semester;

    if (requestedSem !== undefined && requestedSem !== null && requestedSem !== '') {
      const isUuid = typeof requestedSem === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestedSem);
      let semCheck;
      if (isUuid) {
        semCheck = await client.query(
          `SELECT sem.id, sem.number FROM semesters sem
           JOIN programs p ON p.id = sem.program_id
           JOIN departments d ON d.id = p.department_id
           WHERE d.institution_id = $1 AND (d.id = $2 OR $2 IS NULL) AND sem.id = $3
           LIMIT 1`,
          [req.user.institution_id, effectiveDeptId, requestedSem],
        );
      } else {
        semCheck = await client.query(
          `SELECT sem.id, sem.number FROM semesters sem
           JOIN programs p ON p.id = sem.program_id
           JOIN departments d ON d.id = p.department_id
           WHERE d.institution_id = $1 AND (d.id = $2 OR $2 IS NULL) AND sem.number = $3
           ORDER BY sem.created_at LIMIT 1`,
          [req.user.institution_id, effectiveDeptId, Number(requestedSem)],
        );
      }

      if (semCheck.rowCount === 0) {
        return res.status(400).json({ error: 'Selected semester is not configured for this subject branch.' });
      }
      targetSemesterId = semCheck.rows[0].id;
      targetSemesterNumber = semCheck.rows[0].number;
    }

    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO subjects (department_id, code, name, subject_type, credits, weekly_hours, faculty_id, semester_id, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING *`,
      [effectiveDeptId ?? null, code.trim().toUpperCase(), name.trim(),
       subjectType ?? 'theory', credits ?? 0, weeklyHours ?? 0,
       facultyId ?? null, targetSemesterId, req.user.id],
    );

    const createdSubject = result.rows[0];

    if (targetSemesterId) {
      const defaultSec = await ensureSectionsForSemester(client, targetSemesterId);
      const defaultYear = await ensureAcademicYearForInstitution(client, req.user.institution_id);
      await client.query(
        `INSERT INTO subject_offerings (subject_id, semester_id, section_id, academic_year_id, weekly_hours)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (subject_id, semester_id, section_id, academic_year_id)
         DO UPDATE SET weekly_hours = EXCLUDED.weekly_hours, updated_at = now()`,
        [createdSubject.id, targetSemesterId, defaultSec?.id || null, defaultYear?.id || null, weeklyHours ?? 3],
      );
    }

    if (facultyId) {
      await client.query(
        `INSERT INTO faculty_subject_assignments (institution_id, faculty_id, department_id, subject_id, created_by)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (faculty_id, department_id, subject_id) DO NOTHING`,
        [req.user.institution_id, facultyId, effectiveDeptId, createdSubject.id, req.user.id],
      );
    }
    await client.query('COMMIT');
    await auditLog({ userId: req.user.id, action: 'CREATE', module: 'Subjects', entity: name.trim(), entityId: createdSubject.id });
    return res.status(201).json({
      ...createdSubject,
      semester_id: targetSemesterId,
      semester: targetSemesterNumber ?? 1,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') return res.status(409).json({ error: 'A subject with this code already exists in the department.' });
    next(err);
  } finally {
    client.release();
  }
});

router.put('/:id', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'HOD'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const before = await client.query(`
      SELECT s.*, d.code AS dept_code FROM subjects s
      INNER JOIN departments d ON d.id = s.department_id
      WHERE s.id = $1 AND d.institution_id = $2
    `, [req.params.id, req.user.institution_id]);
    if (before.rowCount === 0) return res.status(404).json({ error: 'Subject not found.' });

    const { code, name, subjectType, credits, weeklyHours, active, facultyId, departmentId, dept, semester, semesterId } = req.body;
    const current = before.rows[0];

    let effectiveDeptId = current.department_id;
    if (departmentId) {
      const dCheck = await client.query('SELECT id FROM departments WHERE id = $1 AND institution_id = $2', [departmentId, req.user.institution_id]);
      if (dCheck.rowCount === 0) return res.status(404).json({ error: 'Target department not found.' });
      effectiveDeptId = departmentId;
    } else if (dept) {
      const dCheck = await client.query('SELECT id FROM departments WHERE code = $1 AND institution_id = $2', [dept, req.user.institution_id]);
      if (dCheck.rowCount === 0) return res.status(404).json({ error: 'Target department not found.' });
      effectiveDeptId = dCheck.rows[0].id;
    }

    if (facultyId !== undefined && facultyId !== null) {
      const facultyCheck = await client.query('SELECT id FROM faculty WHERE id = $1 AND institution_id = $2 AND active = true', [facultyId, req.user.institution_id]);
      if (facultyCheck.rowCount === 0) return res.status(400).json({ error: 'Faculty does not belong to this institution or is inactive.' });
    }

    // Resolve target semester
    let targetSemesterId = current.semester_id;
    let semesterChanged = false;
    const requestedSem = semesterId !== undefined ? semesterId : semester;

    if (requestedSem !== undefined && requestedSem !== null && requestedSem !== '') {
      const isUuid = typeof requestedSem === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestedSem);
      let semCheck;
      if (isUuid) {
        semCheck = await client.query(
          `SELECT sem.id, sem.number FROM semesters sem
           JOIN programs p ON p.id = sem.program_id
           JOIN departments d ON d.id = p.department_id
           WHERE d.institution_id = $1 AND (d.id = $2 OR $2 IS NULL) AND sem.id = $3
           LIMIT 1`,
          [req.user.institution_id, effectiveDeptId, requestedSem],
        );
      } else {
        semCheck = await client.query(
          `SELECT sem.id, sem.number FROM semesters sem
           JOIN programs p ON p.id = sem.program_id
           JOIN departments d ON d.id = p.department_id
           WHERE d.institution_id = $1 AND (d.id = $2 OR $2 IS NULL) AND sem.number = $3
           ORDER BY sem.created_at LIMIT 1`,
          [req.user.institution_id, effectiveDeptId, Number(requestedSem)],
        );
      }

      if (semCheck.rowCount === 0) {
        return res.status(400).json({ error: 'Selected semester is not configured for this subject branch.' });
      }
      targetSemesterId = semCheck.rows[0].id;
      semesterChanged = (targetSemesterId !== current.semester_id);
    }

    await client.query('BEGIN');
    if (semesterChanged && targetSemesterId) {
      await client.query(
        `DELETE FROM timetable_entries te USING subject_offerings so
         WHERE te.subject_offering_id = so.id AND so.subject_id = $1`,
        [req.params.id],
      );
      const defaultSec = await ensureSectionsForSemester(client, targetSemesterId);
      const defaultYear = await ensureAcademicYearForInstitution(client, req.user.institution_id);
      await client.query(
        `UPDATE subject_offerings SET semester_id = $1, section_id = $2, academic_year_id = $3, updated_at = now() WHERE subject_id = $4`,
        [targetSemesterId, defaultSec?.id || null, defaultYear?.id || null, req.params.id],
      );
      await client.query(
        `INSERT INTO subject_offerings (subject_id, semester_id, section_id, academic_year_id, weekly_hours)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (subject_id, semester_id, section_id, academic_year_id)
         DO UPDATE SET weekly_hours = EXCLUDED.weekly_hours, updated_at = now()`,
        [req.params.id, targetSemesterId, defaultSec?.id || null, defaultYear?.id || null, weeklyHours ?? current.weekly_hours ?? 3],
      );
    }

    const facultyExpression = facultyId !== undefined ? 'faculty_id = $7' : 'faculty_id = COALESCE($7, faculty_id)';
    const result = await client.query(
      `UPDATE subjects SET
         code = COALESCE($1, code), name = COALESCE($2, name),
         subject_type = COALESCE($3, subject_type), credits = COALESCE($4, credits),
         weekly_hours = COALESCE($5, weekly_hours), active = COALESCE($6, active),
         ${facultyExpression}, department_id = COALESCE($8, department_id),
         semester_id = $9,
         updated_by = $10
       WHERE id = $11 RETURNING *`,
      [code?.trim()?.toUpperCase() ?? null, name?.trim() ?? null, subjectType ?? null,
       credits ?? null, weeklyHours ?? null, active ?? null,
       facultyId !== undefined ? facultyId : null,
       effectiveDeptId,
       targetSemesterId,
       req.user.id, req.params.id],
    );

    if (facultyId !== undefined) {
      await client.query('DELETE FROM faculty_subject_assignments WHERE subject_id = $1 AND institution_id = $2', [req.params.id, req.user.institution_id]);
      if (facultyId) {
        await client.query(
          `INSERT INTO faculty_subject_assignments (institution_id, faculty_id, department_id, subject_id, created_by)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (faculty_id, department_id, subject_id) DO NOTHING`,
          [req.user.institution_id, facultyId, effectiveDeptId, req.params.id, req.user.id],
        );
      }
    }

    await client.query('COMMIT');
    await auditLog({ userId: req.user.id, action: 'UPDATE', module: 'Subjects', entity: result.rows[0].name, entityId: req.params.id });

    const semRes = targetSemesterId ? await pool.query('SELECT number FROM semesters WHERE id = $1', [targetSemesterId]) : null;
    return res.json({
      ...result.rows[0],
      semester_id: targetSemesterId,
      semester: semRes?.rows[0]?.number ?? 1,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') return res.status(409).json({ error: 'A subject with this code already exists in the department.' });
    next(err);
  } finally {
    client.release();
  }
});

router.delete('/:id', requireRole('SUPER_ADMIN', 'HOD'), async (req, res, next) => {
  try {
    const before = await pool.query('SELECT s.* FROM subjects s INNER JOIN departments d ON d.id = s.department_id WHERE s.id = $1 AND d.institution_id = $2', [req.params.id, req.user.institution_id]);
    if (before.rowCount === 0) return res.status(404).json({ error: 'Subject not found.' });
    await pool.query('DELETE FROM subjects WHERE id = $1', [req.params.id]);
    await auditLog({ userId: req.user.id, action: 'DELETE', module: 'Subjects', entity: before.rows[0].name, entityId: req.params.id });
    return res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
