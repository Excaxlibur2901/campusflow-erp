/**
 * Marks API — CampusFlow ERP
 *
 * Mark Components:
 *   GET    /api/marks/components               – List components for a subject offering
 *   POST   /api/marks/components               – Create component
 *   PUT    /api/marks/components/:id           – Update component
 *   DELETE /api/marks/components/:id           – Delete (only if no marks entered)
 *   PUT    /api/marks/components/:id/lock      – Lock/finalize component
 *
 * Marks:
 *   GET    /api/marks                          – Get marks for a component
 *   POST   /api/marks                          – Enter/update marks (validates <= max_marks)
 *   PUT    /api/marks/:id/lock                 – Lock individual mark
 */

import { Router } from 'express';
import { pool } from '../db.js';
import { authenticateUser, requireRole } from '../middleware/auth.js';
import { auditLog } from '../utils/audit.js';

const router = Router();
router.use(authenticateUser);

/* ── MARK COMPONENTS ─────────────────────────────────────────────── */

router.get('/components', async (req, res, next) => {
  try {
    const { subjectOfferingId } = req.query;
    if (!subjectOfferingId) return res.status(400).json({ error: 'subjectOfferingId is required.' });
    const result = await pool.query(
      `SELECT * FROM mark_components WHERE subject_offering_id = $1 ORDER BY name`,
      [subjectOfferingId],
    );
    return res.json(result.rows);
  } catch (err) { next(err); }
});

router.post('/components', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'HOD', 'FACULTY'), async (req, res, next) => {
  try {
    const { subjectOfferingId, name, componentType, maxMarks, weight } = req.body;
    if (!subjectOfferingId) return res.status(400).json({ error: 'subjectOfferingId is required.' });
    if (!name?.trim())      return res.status(400).json({ error: 'Component name is required.' });
    if (!maxMarks || maxMarks <= 0) return res.status(400).json({ error: 'maxMarks must be greater than 0.' });

    const result = await pool.query(
      `INSERT INTO mark_components (subject_offering_id, name, component_type, max_marks, weight, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$6) RETURNING *`,
      [subjectOfferingId, name.trim(), componentType??'internal', maxMarks, weight??null, req.user.id],
    );
    await auditLog({ userId: req.user.id, action: 'CREATE', module: 'Marks', entity: `component:${name.trim()}`, entityId: result.rows[0].id });
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A component with this name already exists for this subject.' });
    next(err);
  }
});

router.put('/components/:id', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'HOD', 'FACULTY'), async (req, res, next) => {
  try {
    const before = await pool.query('SELECT * FROM mark_components WHERE id = $1', [req.params.id]);
    if (before.rowCount === 0) return res.status(404).json({ error: 'Component not found.' });
    if (before.rows[0].locked) return res.status(403).json({ error: 'This marks component is locked and cannot be edited.' });

    const { name, componentType, maxMarks, weight } = req.body;
    const result = await pool.query(
      `UPDATE mark_components SET
         name = COALESCE($1, name), component_type = COALESCE($2, component_type),
         max_marks = COALESCE($3, max_marks), weight = COALESCE($4, weight), updated_by = $5
       WHERE id = $6 RETURNING *`,
      [name?.trim()??null, componentType??null, maxMarks??null, weight??null, req.user.id, req.params.id],
    );
    await auditLog({ userId: req.user.id, action: 'UPDATE', module: 'Marks', entity: `component:${result.rows[0].name}`, entityId: req.params.id, before: before.rows[0], after: result.rows[0] });
    return res.json(result.rows[0]);
  } catch (err) { next(err); }
});

router.put('/components/:id/lock', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'HOD'), async (req, res, next) => {
  try {
    const { locked } = req.body;
    const result = await pool.query(
      `UPDATE mark_components SET locked = $1, updated_by = $2 WHERE id = $3 RETURNING *`,
      [!!locked, req.user.id, req.params.id],
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Component not found.' });
    await auditLog({ userId: req.user.id, action: locked ? 'LOCK' : 'UNLOCK', module: 'Marks', entity: `component:${result.rows[0].name}`, entityId: req.params.id });
    return res.json(result.rows[0]);
  } catch (err) { next(err); }
});

/* ── MARKS ───────────────────────────────────────────────────────── */

router.get('/', async (req, res, next) => {
  try {
    const { componentId } = req.query;
    if (!componentId) return res.status(400).json({ error: 'componentId is required.' });
    const result = await pool.query(
      `SELECT m.*, s.full_name AS student_name, s.roll_number
       FROM marks m
       JOIN students s ON s.id = m.student_id
       WHERE m.mark_component_id = $1
       ORDER BY s.roll_number`,
      [componentId],
    );
    return res.json(result.rows);
  } catch (err) { next(err); }
});

router.post('/', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'HOD', 'FACULTY'), async (req, res, next) => {
  try {
    const { componentId, studentId, obtainedMarks } = req.body;
    if (!componentId)         return res.status(400).json({ error: 'componentId is required.' });
    if (!studentId)           return res.status(400).json({ error: 'studentId is required.' });
    if (obtainedMarks === undefined || obtainedMarks === null) {
      return res.status(400).json({ error: 'obtainedMarks is required.' });
    }
    if (obtainedMarks < 0)    return res.status(400).json({ error: 'Marks cannot be negative.' });

    // Fetch component to validate max marks
    const compResult = await pool.query('SELECT * FROM mark_components WHERE id = $1', [componentId]);
    if (compResult.rowCount === 0) return res.status(404).json({ error: 'Component not found.' });
    const component = compResult.rows[0];
    if (component.locked) return res.status(403).json({ error: 'This marks component is locked. Contact your HOD to unlock it.' });
    if (Number(obtainedMarks) > Number(component.max_marks)) {
      return res.status(400).json({ error: `Marks (${obtainedMarks}) cannot exceed maximum marks (${component.max_marks}).` });
    }

    // Check if existing mark is locked
    const existing = await pool.query(
      `SELECT id, locked FROM marks WHERE mark_component_id = $1 AND student_id = $2`,
      [componentId, studentId],
    );
    if (existing.rowCount > 0 && existing.rows[0].locked) {
      return res.status(403).json({ error: 'This student\'s marks are locked and cannot be changed.' });
    }

    const before = existing.rows[0] ?? null;
    const result = await pool.query(
      `INSERT INTO marks (mark_component_id, student_id, obtained_marks, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $4)
       ON CONFLICT (mark_component_id, student_id)
       DO UPDATE SET obtained_marks = $3, updated_by = $4, updated_at = now()
       RETURNING *`,
      [componentId, studentId, obtainedMarks, req.user.id],
    );

    await auditLog({
      userId: req.user.id, action: before ? 'UPDATE' : 'CREATE', module: 'Marks',
      entity: `student:${studentId} component:${componentId}`,
      entityId: result.rows[0].id,
      before: before ? { obtained_marks: before.obtained_marks } : null,
      after: { obtained_marks: obtainedMarks },
    });
    return res.json(result.rows[0]);
  } catch (err) { next(err); }
});

router.put('/:id/lock', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'HOD'), async (req, res, next) => {
  try {
    const { locked } = req.body;
    const result = await pool.query(
      `UPDATE marks SET locked = $1, finalized_at = $2, updated_by = $3
       WHERE id = $4 RETURNING *`,
      [!!locked, locked ? new Date() : null, req.user.id, req.params.id],
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Mark not found.' });
    await auditLog({ userId: req.user.id, action: locked ? 'LOCK' : 'UNLOCK', module: 'Marks', entity: `mark:${req.params.id}`, entityId: req.params.id });
    return res.json(result.rows[0]);
  } catch (err) { next(err); }
});

export default router;
