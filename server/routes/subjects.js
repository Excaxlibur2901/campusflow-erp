/**
 * Subjects API — CampusFlow ERP
 * GET /api/subjects | POST | PUT /:id | DELETE /:id
 */
import { Router } from 'express';
import { pool } from '../db.js';
import { authenticateUser, requireRole } from '../middleware/auth.js';
import { auditLog } from '../utils/audit.js';

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
      conds.push(`(s.semester = $${idx} OR sem.number = $${idx})`);
      params.push(Number(semester));
      idx++;
    }
    if (search) { conds.push(`(s.name ILIKE $${idx} OR s.code ILIKE $${idx})`); params.push(`%${search}%`); idx++; }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT s.*, d.code AS dept_code, d.name AS dept_name,
              f.id AS faculty_id, f.full_name AS faculty_name, f.employee_code AS faculty_code,
              COALESCE(s.semester, sem.number, 3) AS semester
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
    const { code, name, subjectType, credits, weeklyHours, departmentId, facultyId, semester } = req.body;
    if (!code?.trim()) return res.status(400).json({ error: 'Subject code is required.' });
    if (!name?.trim()) return res.status(400).json({ error: 'Subject name is required.' });

    const deptCheck = await pool.query('SELECT id FROM departments WHERE id = $1 AND institution_id = $2', [departmentId, req.user.institution_id]);
    if (deptCheck.rowCount === 0) return res.status(404).json({ error: 'Department not found.' });

    if (facultyId) {
      const facultyCheck = await client.query('SELECT id FROM faculty WHERE id = $1 AND institution_id = $2 AND active = true', [facultyId, req.user.institution_id]);
      if (facultyCheck.rowCount === 0) return res.status(400).json({ error: 'Faculty does not belong to this institution or is inactive.' });
    }

    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO subjects (department_id, code, name, subject_type, credits, weekly_hours, faculty_id, semester, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING *`,
      [departmentId ?? null, code.trim().toUpperCase(), name.trim(),
       subjectType ?? 'theory', credits ?? 0, weeklyHours ?? 0,
       facultyId ?? null, semester ? Number(semester) : 3, req.user.id],
    );
    if (facultyId) {
      await client.query(
        `INSERT INTO faculty_subject_assignments (institution_id, faculty_id, department_id, subject_id, created_by)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (faculty_id, department_id, subject_id) DO NOTHING`,
        [req.user.institution_id, facultyId, departmentId, result.rows[0].id, req.user.id],
      );
    }
    await client.query('COMMIT');
    await auditLog({ userId: req.user.id, action: 'CREATE', module: 'Subjects', entity: name.trim(), entityId: result.rows[0].id });
    return res.status(201).json(result.rows[0]);
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
      SELECT s.* FROM subjects s
      INNER JOIN departments d ON d.id = s.department_id
      WHERE s.id = $1 AND d.institution_id = $2
    `, [req.params.id, req.user.institution_id]);
    if (before.rowCount === 0) return res.status(404).json({ error: 'Subject not found.' });
    const { code, name, subjectType, credits, weeklyHours, active, facultyId, semester } = req.body;
    const current = before.rows[0];
    const semesterChanged = semester !== undefined && Number(semester) !== Number(current.semester);
    let targetSemesterId = null;
    if (semesterChanged) {
      const targetSemester = await client.query(
        `SELECT sem.id FROM semesters sem
         JOIN programs p ON p.id = sem.program_id
         JOIN departments d ON d.id = p.department_id
         WHERE d.id = $1 AND sem.number = $2 LIMIT 1`,
        [current.department_id, Number(semester)],
      );
      if (targetSemester.rowCount === 0) return res.status(400).json({ error: 'Selected semester is not configured for this subject branch.' });
      targetSemesterId = targetSemester.rows[0].id;
    }
    if (facultyId !== undefined && facultyId !== null) {
      const facultyCheck = await client.query('SELECT id FROM faculty WHERE id = $1 AND institution_id = $2 AND active = true', [facultyId, req.user.institution_id]);
      if (facultyCheck.rowCount === 0) return res.status(400).json({ error: 'Faculty does not belong to this institution or is inactive.' });
    }
    await client.query('BEGIN');
    if (semesterChanged) {
      await client.query(
        `DELETE FROM timetable_entries te USING subject_offerings so
         WHERE te.subject_offering_id = so.id AND so.subject_id = $1`,
        [req.params.id],
      );
      await client.query(
        `UPDATE subject_offerings SET semester_id = $1, section_id = NULL WHERE subject_id = $2`,
        [targetSemesterId, req.params.id],
      );
    }
    const facultyExpression = facultyId !== undefined ? 'faculty_id = $7' : 'faculty_id = COALESCE($7, faculty_id)';
    const result = await client.query(
      `UPDATE subjects SET
         code = COALESCE($1, code), name = COALESCE($2, name),
         subject_type = COALESCE($3, subject_type), credits = COALESCE($4, credits),
         weekly_hours = COALESCE($5, weekly_hours), active = COALESCE($6, active),
         ${facultyExpression}, semester = COALESCE($8, semester),
         updated_by = $9
       WHERE id = $10 RETURNING *`,
      [code?.trim()?.toUpperCase()??null, name?.trim()??null, subjectType??null,
       credits??null, weeklyHours??null, active??null,
       facultyId !== undefined ? facultyId : null,
       semester !== undefined ? Number(semester) : null,
       req.user.id, req.params.id],
    );
    if (facultyId !== undefined) {
      await client.query('DELETE FROM faculty_subject_assignments WHERE subject_id = $1 AND institution_id = $2', [req.params.id, req.user.institution_id]);
      if (facultyId) {
        await client.query(
          `INSERT INTO faculty_subject_assignments (institution_id, faculty_id, department_id, subject_id, created_by)
           VALUES ($1, $2, $3, $4, $5)`,
          [req.user.institution_id, facultyId, current.department_id, req.params.id, req.user.id],
        );
      }
    }
    await client.query('COMMIT');
    await auditLog({ userId: req.user.id, action: 'UPDATE', module: 'Subjects', entity: result.rows[0].name, entityId: req.params.id, before: before.rows[0], after: result.rows[0] });
    return res.json(result.rows[0]);
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
    const before = await pool.query(`
      SELECT s.* FROM subjects s
      INNER JOIN departments d ON d.id = s.department_id
      WHERE s.id = $1 AND d.institution_id = $2
    `, [req.params.id, req.user.institution_id]);
    if (before.rowCount === 0) return res.status(404).json({ error: 'Subject not found.' });
    await pool.query('DELETE FROM subjects WHERE id = $1', [req.params.id]);
    await auditLog({ userId: req.user.id, action: 'DELETE', module: 'Subjects', entity: before.rows[0].name, entityId: req.params.id, before: before.rows[0] });
    return res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
