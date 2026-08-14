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
    const { dept, search } = req.query;
    const conds = [];
    const params = [];
    let idx = 1;
    conds.push(`d.institution_id = $${idx++}`);
    params.push(req.user.institution_id);
    if (dept) { conds.push(`d.code = $${idx++}`); params.push(dept); }
    if (search) { conds.push(`(s.name ILIKE $${idx} OR s.code ILIKE $${idx})`); params.push(`%${search}%`); idx++; }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT s.*, d.code AS dept_code, d.name AS dept_name
       FROM subjects s
       LEFT JOIN departments d ON d.id = s.department_id
       ${where}
       ORDER BY d.code, s.code`,
      params,
    );
    return res.json(result.rows);
  } catch (err) { next(err); }
});

router.post('/', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'HOD'), async (req, res, next) => {
  try {
    const { code, name, subjectType, credits, weeklyHours, departmentId } = req.body;
    if (!code?.trim()) return res.status(400).json({ error: 'Subject code is required.' });
    if (!name?.trim()) return res.status(400).json({ error: 'Subject name is required.' });
    const result = await pool.query(
      `INSERT INTO subjects (department_id, code, name, subject_type, credits, weekly_hours, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$7) RETURNING *`,
      [departmentId ?? null, code.trim().toUpperCase(), name.trim(),
       subjectType ?? 'theory', credits ?? 0, weeklyHours ?? 0, req.user.id],
    );
    await auditLog({ userId: req.user.id, action: 'CREATE', module: 'Subjects', entity: name.trim(), entityId: result.rows[0].id });
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A subject with this code already exists in the department.' });
    next(err);
  }
});

router.put('/:id', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'HOD'), async (req, res, next) => {
  try {
    const before = await pool.query('SELECT * FROM subjects WHERE id = $1', [req.params.id]);
    if (before.rowCount === 0) return res.status(404).json({ error: 'Subject not found.' });
    const { code, name, subjectType, credits, weeklyHours, active } = req.body;
    const result = await pool.query(
      `UPDATE subjects SET
         code = COALESCE($1, code), name = COALESCE($2, name),
         subject_type = COALESCE($3, subject_type), credits = COALESCE($4, credits),
         weekly_hours = COALESCE($5, weekly_hours), active = COALESCE($6, active),
         updated_by = $7
       WHERE id = $8 RETURNING *`,
      [code?.trim()?.toUpperCase()??null, name?.trim()??null, subjectType??null,
       credits??null, weeklyHours??null, active??null, req.user.id, req.params.id],
    );
    await auditLog({ userId: req.user.id, action: 'UPDATE', module: 'Subjects', entity: result.rows[0].name, entityId: req.params.id, before: before.rows[0], after: result.rows[0] });
    return res.json(result.rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', requireRole('SUPER_ADMIN', 'HOD'), async (req, res, next) => {
  try {
    const before = await pool.query('SELECT * FROM subjects WHERE id = $1', [req.params.id]);
    if (before.rowCount === 0) return res.status(404).json({ error: 'Subject not found.' });
    await pool.query('DELETE FROM subjects WHERE id = $1', [req.params.id]);
    await auditLog({ userId: req.user.id, action: 'DELETE', module: 'Subjects', entity: before.rows[0].name, entityId: req.params.id, before: before.rows[0] });
    return res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
