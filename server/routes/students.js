/**
 * Students API — CampusFlow ERP
 *
 * GET    /api/students              – List students (paginated, filterable)
 * POST   /api/students              – Create student
 * PUT    /api/students/:id          – Update student
 * DELETE /api/students/:id          – Delete student (SUPER_ADMIN, HOD only)
 * POST   /api/students/import       – Bulk import from CSV/JSON
 */

import { Router } from 'express';
import { pool } from '../db.js';
import { authenticateUser, requireRole } from '../middleware/auth.js';
import { auditLog } from '../utils/audit.js';

const router = Router();
router.use(authenticateUser);

/* ── GET /api/students ─────────────────────────────────────────── */
router.get('/', async (req, res, next) => {
  try {
    const { dept, section, status, search, page = '1', limit = '50' } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10)));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const params = [];
    let idx = 1;

    conditions.push(`s.institution_id = $${idx++}`);
    params.push(req.user.institution_id);

    if (dept) { conditions.push(`d.code = $${idx++}`); params.push(dept); }
    if (section) { conditions.push(`sec.code = $${idx++}`); params.push(section); }
    if (status) { conditions.push(`s.status = $${idx++}`); params.push(status.toUpperCase()); }
    if (search) {
      conditions.push(`(s.full_name ILIKE $${idx} OR s.roll_number ILIKE $${idx} OR s.enrollment_number ILIKE $${idx})`);
      params.push(`%${search}%`); idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await pool.query(
      `SELECT COUNT(*)::int FROM students s
       LEFT JOIN departments d ON d.id = s.department_id
       LEFT JOIN sections sec ON sec.id = s.section_id
       ${where}`,
      params,
    );

    const result = await pool.query(
      `SELECT s.id, s.roll_number, s.enrollment_number, s.full_name, s.email, s.phone, s.status,
              d.code AS dept_code, d.name AS dept_name,
              dep.code AS dept,
              sec.code AS section,
              s.created_at, s.updated_at
       FROM students s
       LEFT JOIN departments d ON d.id = s.department_id
       LEFT JOIN departments dep ON dep.id = s.department_id
       LEFT JOIN sections sec ON sec.id = s.section_id
       ${where}
       ORDER BY s.roll_number
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limitNum, offset],
    );

    return res.json({
      data: result.rows,
      total: countRes.rows[0].count,
      page: pageNum,
      limit: limitNum,
    });
  } catch (err) { next(err); }
});

/* ── POST /api/students ─────────────────────────────────────────── */
router.post('/', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'HOD'), async (req, res, next) => {
  try {
    const { rollNumber, enrollmentNumber, fullName, email, phone, departmentId, sectionId } = req.body;

    if (!rollNumber?.trim()) return res.status(400).json({ error: 'Roll number is required.' });
    if (!fullName?.trim())   return res.status(400).json({ error: 'Full name is required.' });

    const result = await pool.query(
      `INSERT INTO students
         (institution_id, department_id, section_id, roll_number, enrollment_number, full_name, email, phone, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
       RETURNING *`,
      [req.user.institution_id, departmentId ?? null, sectionId ?? null,
       rollNumber.trim(), enrollmentNumber?.trim() ?? null,
       fullName.trim(), email?.trim() ?? null, phone?.trim() ?? null,
       req.user.id],
    );
    await auditLog({ userId: req.user.id, action: 'CREATE', module: 'Students', entity: fullName.trim(), entityId: result.rows[0].id });
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A student with this roll number or enrollment number already exists.' });
    next(err);
  }
});

/* ── PUT /api/students/:id ──────────────────────────────────────── */
router.put('/:id', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'HOD'), async (req, res, next) => {
  try {
    const before = await pool.query('SELECT * FROM students WHERE id = $1 AND institution_id = $2', [req.params.id, req.user.institution_id]);
    if (before.rowCount === 0) return res.status(404).json({ error: 'Student not found.' });

    const { rollNumber, enrollmentNumber, fullName, email, phone, departmentId, sectionId, status } = req.body;
    const result = await pool.query(
      `UPDATE students SET
         roll_number        = COALESCE($1, roll_number),
         enrollment_number  = COALESCE($2, enrollment_number),
         full_name          = COALESCE($3, full_name),
         email              = COALESCE($4, email),
         phone              = COALESCE($5, phone),
         department_id      = COALESCE($6, department_id),
         section_id         = COALESCE($7, section_id),
         status             = COALESCE($8, status),
         updated_by         = $9
       WHERE id = $10 AND institution_id = $11
       RETURNING *`,
      [rollNumber?.trim() ?? null, enrollmentNumber?.trim() ?? null,
       fullName?.trim() ?? null, email?.trim() ?? null, phone?.trim() ?? null,
       departmentId ?? null, sectionId ?? null, status ?? null,
       req.user.id, req.params.id, req.user.institution_id],
    );
    await auditLog({
      userId: req.user.id, action: 'UPDATE', module: 'Students',
      entity: result.rows[0].full_name, entityId: req.params.id,
      before: before.rows[0], after: result.rows[0],
    });
    return res.json(result.rows[0]);
  } catch (err) { next(err); }
});

/* ── DELETE /api/students/:id ───────────────────────────────────── */
router.delete('/:id', requireRole('SUPER_ADMIN', 'HOD'), async (req, res, next) => {
  try {
    const before = await pool.query('SELECT * FROM students WHERE id = $1 AND institution_id = $2', [req.params.id, req.user.institution_id]);
    if (before.rowCount === 0) return res.status(404).json({ error: 'Student not found.' });

    await pool.query('DELETE FROM students WHERE id = $1 AND institution_id = $2', [req.params.id, req.user.institution_id]);
    await auditLog({ userId: req.user.id, action: 'DELETE', module: 'Students', entity: before.rows[0].full_name, entityId: req.params.id, before: before.rows[0] });
    return res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ── POST /api/students/import ──────────────────────────────────── */
router.post('/import', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'HOD'), async (req, res, next) => {
  try {
    const { students, institutionId } = req.body;
    if (!Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ error: 'No student records provided.' });
    }
    if (students.length > 1000) {
      return res.status(400).json({ error: 'Maximum 1000 students per import batch.' });
    }

    // Preflight validation
    const errors = [];
    students.forEach((s, i) => {
      if (!s.rollNumber?.trim()) errors.push(`Row ${i + 1}: roll number is required.`);
      if (!s.fullName?.trim())   errors.push(`Row ${i + 1}: full name is required.`);
    });
    if (errors.length) return res.status(400).json({ errors });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      let inserted = 0;
      let skipped = 0;

      for (const s of students) {
        const existing = await client.query(
          `SELECT id FROM students WHERE institution_id = $1 AND roll_number = $2`,
          [institutionId ?? null, s.rollNumber.trim()],
        );
        if (existing.rowCount > 0) { skipped++; continue; }

        await client.query(
          `INSERT INTO students
             (institution_id, department_id, section_id, roll_number, enrollment_number, full_name, email, phone, created_by, updated_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)`,
          [institutionId ?? null, s.departmentId ?? null, s.sectionId ?? null,
           s.rollNumber.trim(), s.enrollmentNumber?.trim() ?? null,
           s.fullName.trim(), s.email?.trim() ?? null, s.phone?.trim() ?? null,
           req.user.id],
        );
        inserted++;
      }

      await client.query('COMMIT');
      await auditLog({ userId: req.user.id, action: 'CREATE', module: 'Students', entity: `Bulk import: ${inserted} inserted, ${skipped} skipped` });
      return res.json({ ok: true, inserted, skipped });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

export default router;
