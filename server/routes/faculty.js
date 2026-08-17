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

  const uniqueSubjectIds = [...new Set(subjectIds.filter(Boolean))];

  // 1. Fetch and validate all subjects belonging to this institution
  let validSubjects = [];
  if (uniqueSubjectIds.length > 0) {
    const subjects = await client.query(
      `SELECT s.id, s.department_id, d.institution_id
       FROM subjects s
       JOIN departments d ON d.id = s.department_id
       WHERE s.id = ANY($1::uuid[]) AND d.institution_id = $2`,
      [uniqueSubjectIds, institutionId],
    );

    if (subjects.rowCount !== uniqueSubjectIds.length) {
      const error = new Error('One or more selected subjects do not belong to this institution.');
      error.status = 400;
      throw error;
    }
    validSubjects = subjects.rows;
  }

  // 2. Collect all referenced department IDs from valid subjects plus any explicitly passed departmentIds
  const subjectDeptIds = validSubjects.map(s => s.department_id);
  const allDeptIds = [...new Set([...departmentIds.filter(Boolean), ...subjectDeptIds])];

  if (allDeptIds.length > 0) {
    const depts = await client.query(
      `SELECT id FROM departments WHERE institution_id = $1 AND id = ANY($2::uuid[])`,
      [institutionId, allDeptIds],
    );
    if (depts.rowCount !== allDeptIds.length) {
      const error = new Error('One or more selected departments do not belong to this institution.');
      error.status = 400;
      throw error;
    }
  }

  return { departmentIds: allDeptIds, subjects: validSubjects };
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

  // Remove existing assignments for this faculty in this institution
  await client.query(
    `DELETE FROM faculty_subject_assignments WHERE faculty_id = $1 AND institution_id = $2`,
    [facultyId, institutionId],
  );

  // Insert all valid assignments
  for (const subject of selection.subjects) {
    await client.query(
      `INSERT INTO faculty_subject_assignments
         (institution_id, faculty_id, department_id, subject_id, created_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (faculty_id, department_id, subject_id) DO NOTHING`,
      [institutionId, facultyId, subject.department_id, subject.id, userId],
    );
  }

  await syncLegacyFacultyColumns(client, institutionId, [...affectedSubjectIds]);
}

async function syncLegacyFacultyColumns(client, institutionId, subjectIds) {
  if (!subjectIds.length) return;
  // Sync subjects.faculty_id if column exists
  try {
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
  } catch {
    // Best-effort legacy column sync
  }
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
      `SELECT f.*, d.code AS dept_code, d.name AS dept_name,
              COALESCE(
                (SELECT json_agg(json_build_object(
                   'id', fsa.id,
                   'subject_id', fsa.subject_id,
                   'department_id', fsa.department_id,
                   'department_code', dept.code,
                   'department_name', dept.name,
                   'subject_code', subj.code,
                   'subject_name', subj.name,
                   'semester', COALESCE(sem.number, 1)
                 ) ORDER BY dept.code, subj.code)
                 FROM faculty_subject_assignments fsa
                 JOIN departments dept ON dept.id = fsa.department_id AND dept.institution_id = f.institution_id
                 JOIN subjects subj ON subj.id = fsa.subject_id
                 LEFT JOIN semesters sem ON sem.id = subj.semester_id
                 WHERE fsa.faculty_id = f.id AND fsa.institution_id = f.institution_id
                ),
                '[]'::json
              ) AS assignments
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
    const facultyCheck = await pool.query(
      `SELECT id FROM faculty WHERE id = $1 AND institution_id = $2`,
      [req.params.id, req.user.institution_id],
    );
    if (facultyCheck.rowCount === 0) return res.status(404).json({ error: 'Faculty not found.' });

    const result = await pool.query(
      `SELECT fsa.id, fsa.faculty_id, fsa.department_id, fsa.subject_id,
              d.code AS department_code, d.name AS department_name,
              s.code AS subject_code, s.name AS subject_name,
              COALESCE(sem.number, 1) AS semester
       FROM faculty_subject_assignments fsa
       JOIN departments d ON d.id = fsa.department_id AND d.institution_id = $2
       JOIN subjects s ON s.id = fsa.subject_id
       LEFT JOIN semesters sem ON sem.id = s.semester_id
       WHERE fsa.faculty_id = $1 AND fsa.institution_id = $2
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
              COALESCE(sem.number, 1) AS semester
       FROM faculty_subject_assignments fsa
       JOIN departments d ON d.id = fsa.department_id AND d.institution_id = $2
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
    if (subjectIds !== undefined || departmentIds !== undefined) {
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
    if (subjectIds !== undefined || departmentIds !== undefined) {
      await replaceFacultyAssignments(client, req.user.institution_id, req.params.id,
        departmentIds ?? [], subjectIds ?? [], req.user.id);
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
