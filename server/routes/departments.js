/**
 * Departments API — CampusFlow ERP
 *
 * GET    /api/departments           – List all departments
 * POST   /api/departments           – Create department (SUPER_ADMIN, PRINCIPAL, HOD)
 * PUT    /api/departments/:id       – Update department
 * DELETE /api/departments/:id       – Delete department (SUPER_ADMIN only)
 */

import { Router } from 'express';
import { pool } from '../db.js';
import { authenticateUser, requireRole } from '../middleware/auth.js';
import { auditLog } from '../utils/audit.js';

const router = Router();
router.use(authenticateUser);

router.get('/', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT d.*,
              COUNT(DISTINCT f.id)::int AS faculty_count,
              COUNT(DISTINCT s.id)::int AS student_count
       FROM departments d
       LEFT JOIN faculty f ON f.department_id = d.id AND f.active = true
       LEFT JOIN students s ON s.department_id = d.id AND s.status = 'ACTIVE'
       GROUP BY d.id
       ORDER BY d.name`,
    );
    return res.json(result.rows);
  } catch (err) { next(err); }
});

router.post('/', requireRole('SUPER_ADMIN', 'PRINCIPAL'), async (req, res, next) => {
  try {
    const { code, name, institutionId } = req.body;
    if (!code?.trim()) return res.status(400).json({ error: 'Department code is required.' });
    if (!name?.trim()) return res.status(400).json({ error: 'Department name is required.' });

    const result = await pool.query(
      `INSERT INTO departments (institution_id, code, name, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $4)
       RETURNING *`,
      [institutionId ?? null, code.trim().toUpperCase(), name.trim(), req.user.id],
    );
    await auditLog({ userId: req.user.id, action: 'CREATE', module: 'Departments', entity: name.trim(), entityId: result.rows[0].id });
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A department with this code already exists.' });
    next(err);
  }
});

router.put('/:id', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'HOD'), async (req, res, next) => {
  try {
    const { code, name, active } = req.body;
    const before = await pool.query('SELECT * FROM departments WHERE id = $1', [req.params.id]);
    if (before.rowCount === 0) return res.status(404).json({ error: 'Department not found.' });

    const result = await pool.query(
      `UPDATE departments SET
         code = COALESCE($1, code),
         name = COALESCE($2, name),
         active = COALESCE($3, active),
         updated_by = $4
       WHERE id = $5
       RETURNING *`,
      [code?.trim()?.toUpperCase() ?? null, name?.trim() ?? null, active ?? null, req.user.id, req.params.id],
    );
    await auditLog({
      userId: req.user.id, action: 'UPDATE', module: 'Departments',
      entity: result.rows[0].name, entityId: req.params.id,
      before: before.rows[0], after: result.rows[0],
    });
    return res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A department with this code already exists.' });
    next(err);
  }
});

router.delete('/:id', requireRole('SUPER_ADMIN'), async (req, res, next) => {
  try {
    const before = await pool.query('SELECT * FROM departments WHERE id = $1', [req.params.id]);
    if (before.rowCount === 0) return res.status(404).json({ error: 'Department not found.' });

    await pool.query('DELETE FROM departments WHERE id = $1', [req.params.id]);
    await auditLog({ userId: req.user.id, action: 'DELETE', module: 'Departments', entity: before.rows[0].name, entityId: req.params.id, before: before.rows[0] });
    return res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
