/**
 * Faculty API — CampusFlow ERP
 * GET /api/faculty | POST | PUT /:id | DELETE /:id
 */
import { Router } from 'express';
import { pool } from '../db.js';
import { authenticateUser, requireRole } from '../middleware/auth.js';
import { auditLog } from '../utils/audit.js';

const router = Router();
router.use(authenticateUser);

async function validateAssignmentSelection(client, institutionId, facultyId, departmentIds = [], subjectIds = []) {
  if (!Array.isArray(departmentIds) || !Array.isArray(subjectIds)) {
    const error = new Error('departmentIds and subjectIds must be arrays.');
    error.status = 400;
    throw error;
  }
  const uniqueDepartmentIds = [...new Set(departmentIds)];
  const uniqueSubjectIds = [...new Set(subjectIds)];
  const departments = await client.query(
    `SELECT id FROM departments WHERE institution_id = $1 AND id = ANY($2::uuid[])`,
    [institutionId, uniqueDepartmentIds],
  );
  const subjects = await client.query(
    `SELECT id, department_id FROM subjects
     WHERE id = ANY($1::uuid[]) AND active = true
       AND department_id IN (SELECT id FROM departments WHERE institution_id = $2)`,
    [uniqueSubjectIds, institutionId],
  );
  const departmentSet = new Set(departments.rows.map(row => row.id));
  const validSubjects = subjects.rows.filter(row => departmentSet.has(row.department_id));
  if (departments.rowCount !== uniqueDepartmentIds.length || validSubjects.length !== uniqueSubjectIds.length) {
    const error = new Error('Every selected branch and subject must belong to this institution, and each subject must belong to a selected branch.');
    error.status = 400;
    throw error;
  }
  return { departmentIds: uniqueDepartmentIds, subjects: validSubjects };
}

async function replaceFacultyAssignments(client, institutionId, facultyId, departmentIds, subjectIds, userId) {
  const selection = await validateAssignmentSelection(client, institutionId, facultyId, departmentIds, subjectIds);
  const affected = await client.query(
    `SELECT subject_id FROM faculty_subject_assignments
     WHERE faculty_id = $1 AND institution_id = $2`,
    [facultyId, institutionId],
  );
  const affectedSubjectIds = new Set(affected.rows.map(row => row.subject_id));
  selection.subjects.forEach(subject => affectedSubjectIds.add(subject.id));

  await client.query(
    `DELETE FROM faculty_subject_assignments WHERE faculty_id = $1 AND institution_id = $2`,
    [facultyId, institutionId],
  );
  for (const subject of selection.subjects) {
    await client.query(
      `INSERT INTO faculty_subject_assignments
         (institution_id, faculty_id, department_id, subject_id, created_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [institutionId, facultyId, subject.department_id, subject.id, userId],
    );
  }
  await syncLegacyFacultyColumns(client, institutionId, [...affectedSubjectIds]);
}

async function syncLegacyFacultyColumns(client, institutionId, subjectIds) {
  if (!subjectIds.length) return;
  await client.query(
    `UPDATE subjects s
     SET faculty_id = selected.faculty_id
     FROM (
       SELECT DISTINCT ON (fsa.subject_id) fsa.subject_id, fsa.faculty_id
       FROM faculty_subject_assignments fsa
       JOIN faculty f ON f.id = fsa.faculty_id AND f.institution_id = $1
       WHERE fsa.institution_id = $1 AND fsa.subject_id = ANY($2::uuid[])
       ORDER BY fsa.subject_id, fsa.created_at DESC, fsa.id DESC
     ) selected
     WHERE s.id = selected.subject_id
       AND s.id = ANY($2::uuid[])`,
    [institutionId, subjectIds],
  );
  await client.query(
    `UPDATE subjects
     SET faculty_id = NULL
     WHERE id = ANY($1::uuid[])
       AND department_id IN (SELECT id FROM departments WHERE institution_id = $2)
       AND NOT EXISTS (
         SELECT 1 FROM faculty_subject_assignments fsa
         WHERE fsa.subject_id = subjects.id AND fsa.institution_id = $2
       )`,
    [subjectIds, institutionId],
  );
}

router.get('/', async (req, res, next) => {
  try {
    const { dept, search, page = '1', limit = '100' } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10)));
    const offset = (pageNum - 1) * limitNum;
    const params = [];
    const conds = [];
    let idx = 1;
    conds.push(`f.institution_id = $${idx++}`);
    params.push(req.user.institution_id);
    if (dept) { conds.push(`d.code = $${idx++}`); params.push(dept); }
    if (search) { conds.push(`f.full_name ILIKE $${idx++}`); params.push(`%${search}%`); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const countRes = await pool.query(
      `SELECT COUNT(*)::int FROM faculty f LEFT JOIN departments d ON d.id = f.department_id ${where}`, params,
    );
    const result = await pool.query(
      `SELECT f.*, d.code AS dept_code, d.name AS dept_name
       FROM faculty f
       LEFT JOIN departments d ON d.id = f.department_id
       ${where}
       ORDER BY f.full_name
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limitNum, offset],
    );
    return res.json({ data: result.rows, total: countRes.rows[0].count, page: pageNum, limit: limitNum });
  } catch (err) { next(err); }
});

/* ── GET /api/faculty/:id/assignments ───────────────────────────── */
router.get('/:id/assignments', async (req, res, next) => {
  try {
    const result = await pool.query(
      `WITH assignments AS (
         SELECT fsa.id, fsa.faculty_id, fsa.department_id, fsa.subject_id, 1 AS priority
         FROM faculty_subject_assignments fsa
         WHERE fsa.faculty_id = $1 AND fsa.institution_id = $2
         UNION ALL
         SELECT s.id, s.faculty_id, s.department_id, s.id, 2 AS priority
         FROM subjects s
         JOIN faculty f ON f.id = s.faculty_id
         WHERE s.faculty_id = $1 AND f.institution_id = $2
       ), preferred AS (
         SELECT DISTINCT ON (subject_id) id, faculty_id, department_id, subject_id
         FROM assignments
         ORDER BY subject_id, priority
       )
       SELECT p.id, p.faculty_id, p.department_id, p.subject_id,
              d.code AS department_code, d.name AS department_name,
              s.code AS subject_code, s.name AS subject_name,
              COALESCE(s.semester, sem.number) AS semester
       FROM preferred p
       JOIN departments d ON d.id = p.department_id AND d.institution_id = $2
       JOIN subjects s ON s.id = p.subject_id
       LEFT JOIN semesters sem ON sem.id = s.semester_id
       ORDER BY d.code, s.code`,
      [req.params.id, req.user.institution_id],
    );
    return res.json(result.rows);
  } catch (err) { next(err); }
});

/* ── PUT /api/faculty/:id/assignments ───────────────────────────── */
router.put('/:id/assignments', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'HOD'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { departmentIds = [], subjectIds = [] } = req.body;

    const facultyCheck = await client.query(
      `SELECT id FROM faculty WHERE id = $1 AND institution_id = $2`,
      [req.params.id, req.user.institution_id],
    );
    if (facultyCheck.rowCount === 0) return res.status(404).json({ error: 'Faculty not found.' });

    await client.query('BEGIN');
    await replaceFacultyAssignments(client, req.user.institution_id, req.params.id, departmentIds, subjectIds, req.user.id);
    await client.query('COMMIT');

    const saved = await pool.query(
      `SELECT fsa.id, fsa.faculty_id, fsa.department_id, fsa.subject_id,
              d.code AS department_code, d.name AS department_name,
              s.code AS subject_code, s.name AS subject_name,
              COALESCE(s.semester, sem.number, 3) AS semester
       FROM faculty_subject_assignments fsa
       JOIN departments d ON d.id = fsa.department_id
       JOIN subjects s ON s.id = fsa.subject_id
       LEFT JOIN semesters sem ON sem.id = s.semester_id
       WHERE fsa.faculty_id = $1 AND fsa.institution_id = $2
       ORDER BY d.code, s.code`,
      [req.params.id, req.user.institution_id],
    );
    return res.json(saved.rows);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  } finally {
    client.release();
  }
});

router.post('/', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'HOD'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { employeeCode, fullName, email, phone, departmentId, specialization, designation, maxWeeklyHours, currentHours, departmentIds, subjectIds } = req.body;
    if (!employeeCode?.trim()) return res.status(400).json({ error: 'Employee code is required.' });
    if (!fullName?.trim())     return res.status(400).json({ error: 'Full name is required.' });
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO faculty (institution_id, department_id, employee_code, full_name, email, phone, specialization, designation, max_weekly_hours, current_hours, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11) RETURNING *`,
      [req.user.institution_id, departmentId ?? null, employeeCode.trim(), fullName.trim(),
       email?.trim() ?? null, phone?.trim() ?? null, specialization?.trim() ?? null,
       designation?.trim() || 'Faculty', maxWeeklyHours ?? 22,
       currentHours === undefined ? 0 : Number(currentHours), req.user.id],
    );
    if (departmentIds !== undefined || subjectIds !== undefined) {
      await replaceFacultyAssignments(client, req.user.institution_id, result.rows[0].id,
        departmentIds ?? (departmentId ? [departmentId] : []), subjectIds ?? [], req.user.id);
    }
    await client.query('COMMIT');
    await auditLog({ userId: req.user.id, action: 'CREATE', module: 'Faculty', entity: fullName.trim(), entityId: result.rows[0].id });
    const saved = await pool.query('SELECT * FROM faculty WHERE id = $1 AND institution_id = $2', [result.rows[0].id, req.user.institution_id]);
    return res.status(201).json(saved.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') return res.status(409).json({ error: 'Faculty with this employee code already exists.' });
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  } finally {
    client.release();
  }
});

router.put('/:id', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'HOD'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const before = await client.query('SELECT * FROM faculty WHERE id = $1 AND institution_id = $2', [req.params.id, req.user.institution_id]);
    if (before.rowCount === 0) return res.status(404).json({ error: 'Faculty not found.' });
    const { fullName, email, phone, departmentId, specialization, designation, maxWeeklyHours, currentHours, active, departmentIds, subjectIds } = req.body;
    await client.query('BEGIN');
    await client.query(
      `UPDATE faculty SET
         full_name = COALESCE($1, full_name), email = COALESCE($2, email),
         phone = COALESCE($3, phone), department_id = COALESCE($4, department_id),
         specialization = COALESCE($5, specialization), designation = COALESCE($6, designation),
         max_weekly_hours = COALESCE($7, max_weekly_hours), current_hours = COALESCE($8, current_hours),
         active = COALESCE($9, active), updated_by = $10
       WHERE id = $11 AND institution_id = $12 RETURNING *`,
      [fullName?.trim()??null, email?.trim()??null, phone?.trim()??null,
       departmentId??null, specialization?.trim()??null, designation?.trim()??null,
       maxWeeklyHours??null, currentHours !== undefined ? Number(currentHours) : null,
       active??null, req.user.id, req.params.id, req.user.institution_id],
    );
    if (departmentIds !== undefined || subjectIds !== undefined) {
      await replaceFacultyAssignments(client, req.user.institution_id, req.params.id,
        departmentIds ?? (departmentId ? [departmentId] : []), subjectIds ?? [], req.user.id);
    }
    await client.query('COMMIT');
    const saved = await pool.query('SELECT * FROM faculty WHERE id = $1 AND institution_id = $2', [req.params.id, req.user.institution_id]);
    await auditLog({ userId: req.user.id, action: 'UPDATE', module: 'Faculty', entity: saved.rows[0].full_name, entityId: req.params.id, before: before.rows[0], after: saved.rows[0] });
    return res.json(saved.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  } finally {
    client.release();
  }
});

router.delete('/:id', requireRole('SUPER_ADMIN', 'HOD'), async (req, res, next) => {
  try {
    const before = await pool.query('SELECT * FROM faculty WHERE id = $1 AND institution_id = $2', [req.params.id, req.user.institution_id]);
    if (before.rowCount === 0) return res.status(404).json({ error: 'Faculty not found.' });
    await pool.query('DELETE FROM faculty WHERE id = $1 AND institution_id = $2', [req.params.id, req.user.institution_id]);
    await auditLog({ userId: req.user.id, action: 'DELETE', module: 'Faculty', entity: before.rows[0].full_name, entityId: req.params.id, before: before.rows[0] });
    return res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
