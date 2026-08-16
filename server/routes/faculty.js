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
      `SELECT fsa.id, fsa.faculty_id, fsa.department_id, fsa.subject_id,
              d.code AS department_code, d.name AS department_name,
              s.code AS subject_code, s.name AS subject_name,
              COALESCE(s.semester, sem.number, 3) AS semester
       FROM faculty_subject_assignments fsa
       JOIN faculty f ON f.id = fsa.faculty_id
       JOIN departments d ON d.id = fsa.department_id
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
    if (!Array.isArray(departmentIds) || !Array.isArray(subjectIds)) {
      return res.status(400).json({ error: 'departmentIds and subjectIds must be arrays.' });
    }

    const facultyCheck = await client.query(
      `SELECT id FROM faculty WHERE id = $1 AND institution_id = $2`,
      [req.params.id, req.user.institution_id],
    );
    if (facultyCheck.rowCount === 0) return res.status(404).json({ error: 'Faculty not found.' });

    const departments = await client.query(
      `SELECT id FROM departments WHERE institution_id = $1 AND id = ANY($2::uuid[])`,
      [req.user.institution_id, [...new Set(departmentIds)]],
    );
    const subjects = await client.query(
      `SELECT id, department_id FROM subjects
       WHERE id = ANY($1::uuid[]) AND active = true
         AND department_id IN (SELECT id FROM departments WHERE institution_id = $2)`,
      [[...new Set(subjectIds)], req.user.institution_id],
    );
    const departmentSet = new Set(departments.rows.map(row => row.id));
    const validSubjects = subjects.rows.filter(row => departmentSet.has(row.department_id));
    if (departments.rowCount !== new Set(departmentIds).size || validSubjects.length !== new Set(subjectIds).size) {
      return res.status(400).json({ error: 'Every selected branch and subject must belong to this institution, and subjects must belong to a selected branch.' });
    }

    await client.query('BEGIN');
    await client.query(
      `DELETE FROM faculty_subject_assignments
       WHERE faculty_id = $1 AND institution_id = $2`,
      [req.params.id, req.user.institution_id],
    );

    for (const subject of validSubjects) {
      await client.query(
        `INSERT INTO faculty_subject_assignments
           (institution_id, faculty_id, department_id, subject_id, created_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [req.user.institution_id, req.params.id, subject.department_id, subject.id, req.user.id],
      );
    }
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
    next(err);
  } finally {
    client.release();
  }
});

router.post('/', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'HOD'), async (req, res, next) => {
  try {
    const { employeeCode, fullName, email, phone, departmentId, specialization, maxWeeklyHours } = req.body;
    if (!employeeCode?.trim()) return res.status(400).json({ error: 'Employee code is required.' });
    if (!fullName?.trim())     return res.status(400).json({ error: 'Full name is required.' });
    const result = await pool.query(
      `INSERT INTO faculty (institution_id, department_id, employee_code, full_name, email, phone, specialization, max_weekly_hours, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING *`,
      [req.user.institution_id, departmentId ?? null, employeeCode.trim(), fullName.trim(),
       email?.trim() ?? null, phone?.trim() ?? null, specialization?.trim() ?? null,
       maxWeeklyHours ?? 22, req.user.id],
    );
    await auditLog({ userId: req.user.id, action: 'CREATE', module: 'Faculty', entity: fullName.trim(), entityId: result.rows[0].id });
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Faculty with this employee code already exists.' });
    next(err);
  }
});

router.put('/:id', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'HOD'), async (req, res, next) => {
  try {
    const before = await pool.query('SELECT * FROM faculty WHERE id = $1 AND institution_id = $2', [req.params.id, req.user.institution_id]);
    if (before.rowCount === 0) return res.status(404).json({ error: 'Faculty not found.' });
    const { fullName, email, phone, departmentId, specialization, maxWeeklyHours, active } = req.body;
    const result = await pool.query(
      `UPDATE faculty SET
         full_name = COALESCE($1, full_name), email = COALESCE($2, email),
         phone = COALESCE($3, phone), department_id = COALESCE($4, department_id),
         specialization = COALESCE($5, specialization),
         max_weekly_hours = COALESCE($6, max_weekly_hours),
         active = COALESCE($7, active), updated_by = $8
       WHERE id = $9 AND institution_id = $10 RETURNING *`,
      [fullName?.trim()??null, email?.trim()??null, phone?.trim()??null,
       departmentId??null, specialization?.trim()??null, maxWeeklyHours??null,
       active??null, req.user.id, req.params.id, req.user.institution_id],
    );
    await auditLog({ userId: req.user.id, action: 'UPDATE', module: 'Faculty', entity: result.rows[0].full_name, entityId: req.params.id, before: before.rows[0], after: result.rows[0] });
    return res.json(result.rows[0]);
  } catch (err) { next(err); }
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
