/**
 * Classrooms API — CampusFlow ERP
 * GET /api/classrooms | POST | PUT /:id | DELETE /:id
 */
import { Router } from 'express';
import { pool } from '../db.js';
import { authenticateUser, requireRole } from '../middleware/auth.js';
import { auditLog } from '../utils/audit.js';

const router = Router();
router.use(authenticateUser);

router.get('/', async (req, res, next) => {
  try {
    const { type, search } = req.query;
    const conds = [];
    const params = [];
    let idx = 1;
    conds.push(`c.institution_id = $${idx++}`);
    params.push(req.user.institution_id);
    if (type) { conds.push(`c.room_type = $${idx++}`); params.push(type); }
    if (search) { conds.push(`(c.code ILIKE $${idx} OR c.name ILIKE $${idx})`); params.push(`%${search}%`); idx++; }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT c.*, d.code AS dept_code FROM classrooms c
       LEFT JOIN departments d ON d.id = c.department_id
       ${where} ORDER BY c.code`,
      params,
    );
    return res.json(result.rows);
  } catch (err) { next(err); }
});

router.post('/', requireRole('SUPER_ADMIN', 'PRINCIPAL'), async (req, res, next) => {
  try {
    const { code, name, roomType, capacity, rowsCount, columnsCount, benchesCount, seatsPerBench, departmentId } = req.body;
    if (!code?.trim()) return res.status(400).json({ error: 'Room code is required.' });
    if (!capacity || capacity < 1) return res.status(400).json({ error: 'Capacity must be at least 1.' });
    const result = await pool.query(
      `INSERT INTO classrooms (institution_id, department_id, code, name, room_type, capacity, rows_count, columns_count, benches_count, seats_per_bench, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11) RETURNING *`,
      [req.user.institution_id, departmentId??null, code.trim().toUpperCase(), name?.trim()??code.trim(),
       roomType??'lecture', capacity, rowsCount??null, columnsCount??null, benchesCount??null, seatsPerBench??1, req.user.id],
    );
    await auditLog({ userId: req.user.id, action: 'CREATE', module: 'Classrooms', entity: code.trim(), entityId: result.rows[0].id });
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A classroom with this code already exists.' });
    next(err);
  }
});

router.put('/:id', requireRole('SUPER_ADMIN', 'PRINCIPAL'), async (req, res, next) => {
  try {
    const before = await pool.query('SELECT * FROM classrooms WHERE id = $1 AND institution_id = $2', [req.params.id, req.user.institution_id]);
    if (before.rowCount === 0) return res.status(404).json({ error: 'Classroom not found.' });
    const { code, name, roomType, capacity, rowsCount, columnsCount, benchesCount, seatsPerBench, active } = req.body;
    const result = await pool.query(
      `UPDATE classrooms SET
         code = COALESCE($1, code), name = COALESCE($2, name),
         room_type = COALESCE($3, room_type), capacity = COALESCE($4, capacity),
         rows_count = COALESCE($5, rows_count), columns_count = COALESCE($6, columns_count),
         benches_count = COALESCE($7, benches_count), seats_per_bench = COALESCE($8, seats_per_bench),
         active = COALESCE($9, active), updated_by = $10
       WHERE id = $11 AND institution_id = $12 RETURNING *`,
      [code?.trim()??null, name?.trim()??null, roomType??null, capacity??null,
       rowsCount??null, columnsCount??null, benchesCount??null, seatsPerBench??null,
       active??null, req.user.id, req.params.id, req.user.institution_id],
    );
    await auditLog({ userId: req.user.id, action: 'UPDATE', module: 'Classrooms', entity: result.rows[0].code, entityId: req.params.id, before: before.rows[0], after: result.rows[0] });
    return res.json(result.rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', requireRole('SUPER_ADMIN'), async (req, res, next) => {
  try {
    const before = await pool.query('SELECT * FROM classrooms WHERE id = $1 AND institution_id = $2', [req.params.id, req.user.institution_id]);
    if (before.rowCount === 0) return res.status(404).json({ error: 'Classroom not found.' });
    await pool.query('DELETE FROM classrooms WHERE id = $1 AND institution_id = $2', [req.params.id, req.user.institution_id]);
    await auditLog({ userId: req.user.id, action: 'DELETE', module: 'Classrooms', entity: before.rows[0].code, entityId: req.params.id, before: before.rows[0] });
    return res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
