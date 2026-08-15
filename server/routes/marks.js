/**
 * Marks Management API — CampusFlow ERP
 *
 * Fully integrated with normalized PostgreSQL tables:
 * mark_components, marks, subjects, students.
 */

import { Router } from 'express';
import { pool } from '../db.js';
import { authenticateUser, requireRole } from '../middleware/auth.js';
import { auditLog } from '../utils/audit.js';

const router = Router();
router.use(authenticateUser);

router.param('id', async (req, res, next, id) => {
  try {
    const compCheck = await pool.query(`
      SELECT mc.id FROM mark_components mc
      LEFT JOIN subject_offerings so ON so.id = mc.subject_offering_id
      LEFT JOIN subjects sub ON sub.id = so.subject_id
      LEFT JOIN departments d ON d.id = sub.department_id
      WHERE mc.id = $1 AND d.institution_id = $2
    `, [id, req.user.institution_id]);
    if (compCheck.rowCount === 0) return res.status(404).json({ error: 'Component not found.' });
    next();
  } catch (err) { next(err); }
});

/* ── MARK COMPONENTS ─────────────────────────────────────────────── */

router.get('/components', async (req, res, next) => {
  try {
    const { subjectId, semester, sectionId } = req.query;
    const conds = ['d.institution_id = $1'];
    const params = [req.user.institution_id];
    let idx = 2;

    if (subjectId) { conds.push(`mc.subject_id = $${idx++}`); params.push(subjectId); }
    if (semester)  { conds.push(`mc.semester = $${idx++}`); params.push(Number(semester)); }
    if (sectionId) { conds.push(`mc.section_id = $${idx++}`); params.push(sectionId); }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT mc.*, s.code AS subject_code, s.name AS subject_name,
              COUNT(m.id)::int AS entries_count
       FROM mark_components mc
       LEFT JOIN subject_offerings so ON so.id = mc.subject_offering_id
       LEFT JOIN subjects s ON s.id = so.subject_id
       LEFT JOIN departments d ON d.id = s.department_id
       LEFT JOIN marks m ON m.mark_component_id = mc.id
       ${where}
       GROUP BY mc.id, s.id
       ORDER BY mc.name`,
      params,
    );
    return res.json(result.rows);
  } catch (err) { next(err); }
});

router.post('/components', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'HOD', 'FACULTY'), async (req, res, next) => {
  try {
    const { subjectId, name, componentType = 'internal', maxMarks, weight, semester, sectionId, subjectOfferingId } = req.body;

    if (!name?.trim()) return res.status(400).json({ error: 'Component name is required.' });
    if (!maxMarks || maxMarks <= 0) return res.status(400).json({ error: 'maxMarks must be greater than 0.' });

    let targetOfferingId = subjectOfferingId;

    // Verify ownership of subject offering or subject
    if (targetOfferingId) {
      const soCheck = await pool.query(`
        SELECT so.id FROM subject_offerings so
        JOIN subjects sub ON sub.id = so.subject_id
        JOIN departments d ON d.id = sub.department_id
        WHERE so.id = $1 AND d.institution_id = $2
      `, [targetOfferingId, req.user.institution_id]);
      if (soCheck.rowCount === 0) return res.status(403).json({ error: 'Unauthorized or invalid subject offering.' });
    } else if (subjectId) {
      const subCheck = await pool.query(`
        SELECT sub.id FROM subjects sub
        JOIN departments d ON d.id = sub.department_id
        WHERE sub.id = $1 AND d.institution_id = $2
      `, [subjectId, req.user.institution_id]);
      if (subCheck.rowCount === 0) return res.status(403).json({ error: 'Unauthorized or invalid subject.' });
      
      const offering = await pool.query(`SELECT id FROM subject_offerings WHERE subject_id = $1 LIMIT 1`, [subjectId]);
      if (offering.rowCount > 0) {
        targetOfferingId = offering.rows[0].id;
      } else {
        const defaultSem = await pool.query(`
          SELECT sem.id FROM semesters sem
          JOIN programs p ON p.id = sem.program_id
          JOIN departments d ON d.id = p.department_id
          WHERE d.institution_id = $1 LIMIT 1
        `, [req.user.institution_id]);
        if (defaultSem.rowCount > 0) {
          const newOffering = await pool.query(
            `INSERT INTO subject_offerings (subject_id, semester_id, weekly_hours) VALUES ($1, $2, 3) RETURNING id`,
            [subjectId, defaultSem.rows[0].id],
          );
          targetOfferingId = newOffering.rows[0].id;
        }
      }
    }

    if (!targetOfferingId) {
      return res.status(400).json({ error: 'Valid subject or subjectOfferingId is required.' });
    }

    const result = await pool.query(
      `INSERT INTO mark_components (subject_offering_id, subject_id, semester, section_id, name, component_type, max_marks, weight, status, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft', $9, $9) RETURNING *`,
      [targetOfferingId, subjectId || null, semester ? Number(semester) : null, sectionId || null, name.trim(), componentType, maxMarks, weight ?? null, req.user.id],
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

    // Enforce role permission on locked component
    if (before.rows[0].locked && !['SUPER_ADMIN', 'PRINCIPAL', 'HOD'].includes(req.user.role)) {
      return res.status(403).json({ error: 'This marks component is locked. Only HOD or Administrator can edit it.' });
    }

    const { name, componentType, maxMarks, weight, status } = req.body;
    const result = await pool.query(
      `UPDATE mark_components SET
         name = COALESCE($1, name), component_type = COALESCE($2, component_type),
         max_marks = COALESCE($3, max_marks), weight = COALESCE($4, weight),
         status = COALESCE($5, status), updated_by = $6
       WHERE id = $7 RETURNING *`,
      [name?.trim() ?? null, componentType ?? null, maxMarks ?? null, weight ?? null, status ?? null, req.user.id, req.params.id],
    );

    await auditLog({ userId: req.user.id, action: 'UPDATE', module: 'Marks', entity: `component:${result.rows[0].name}`, entityId: req.params.id, before: before.rows[0], after: result.rows[0] });
    return res.json(result.rows[0]);
  } catch (err) { next(err); }
});

router.put('/components/:id/lock', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'HOD'), async (req, res, next) => {
  try {
    const { locked } = req.body;
    const newStatus = locked ? 'locked' : 'draft';
    const result = await pool.query(
      `UPDATE mark_components SET locked = $1, status = $2, updated_by = $3 WHERE id = $4 RETURNING *`,
      [!!locked, newStatus, req.user.id, req.params.id],
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Component not found.' });

    // Also update lock status on child marks
    await pool.query(`UPDATE marks SET locked = $1 WHERE mark_component_id = $2`, [!!locked, req.params.id]);

    await auditLog({ userId: req.user.id, action: locked ? 'LOCK' : 'UNLOCK', module: 'Marks', entity: `component:${result.rows[0].name}`, entityId: req.params.id });
    return res.json(result.rows[0]);
  } catch (err) { next(err); }
});

router.delete('/components/:id', requireRole('SUPER_ADMIN', 'HOD'), async (req, res, next) => {
  try {
    const before = await pool.query('SELECT * FROM mark_components WHERE id = $1', [req.params.id]);
    if (before.rowCount === 0) return res.status(404).json({ error: 'Component not found.' });
    if (before.rows[0].locked) return res.status(400).json({ error: 'Cannot delete a locked component.' });

    await pool.query('DELETE FROM mark_components WHERE id = $1', [req.params.id]);
    await auditLog({ userId: req.user.id, action: 'DELETE', module: 'Marks', entity: `component:${before.rows[0].name}`, entityId: req.params.id });
    return res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ── MARKS ───────────────────────────────────────────────────────── */

router.get('/', async (req, res, next) => {
  try {
    const { componentId, subjectId } = req.query;
    if (!componentId && !subjectId) return res.status(400).json({ error: 'componentId or subjectId is required.' });

    const conds = ['s.institution_id = $1'];
    const params = [req.user.institution_id];
    let idx = 2;

    if (componentId) { conds.push(`m.mark_component_id = $${idx++}`); params.push(componentId); }
    if (subjectId)   { conds.push(`mc.subject_id = $${idx++}`); params.push(subjectId); }

    const where = `WHERE ${conds.join(' AND ')}`;

    const result = await pool.query(
      `SELECT m.*, s.full_name AS student_name, s.roll_number, s.enrollment_number,
              mc.name AS component_name, mc.max_marks, mc.weight, mc.locked AS component_locked
       FROM marks m
       JOIN mark_components mc ON mc.id = m.mark_component_id
       JOIN students s ON s.id = m.student_id
       ${where}
       ORDER BY s.roll_number`,
      params,
    );
    return res.json(result.rows);
  } catch (err) { next(err); }
});

router.post('/', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'HOD', 'FACULTY'), async (req, res, next) => {
  try {
    const { componentId, studentId, obtainedMarks } = req.body;
    if (!componentId) return res.status(400).json({ error: 'componentId is required.' });
    if (!studentId)   return res.status(400).json({ error: 'studentId is required.' });
    if (obtainedMarks === undefined || obtainedMarks === null) {
      return res.status(400).json({ error: 'obtainedMarks is required.' });
    }
    if (Number(obtainedMarks) < 0) return res.status(400).json({ error: 'Marks cannot be negative.' });

    // Validate component and max marks within institution context
    const compResult = await pool.query(`
      SELECT mc.* FROM mark_components mc
      JOIN subject_offerings so ON so.id = mc.subject_offering_id
      JOIN subjects s ON s.id = so.subject_id
      JOIN departments d ON d.id = s.department_id
      WHERE mc.id = $1 AND d.institution_id = $2
    `, [componentId, req.user.institution_id]);
    if (compResult.rowCount === 0) return res.status(404).json({ error: 'Component not found or unauthorized.' });
    const component = compResult.rows[0];

    // Verify student ownership
    const stuResult = await pool.query('SELECT id FROM students WHERE id = $1 AND institution_id = $2', [studentId, req.user.institution_id]);
    if (stuResult.rowCount === 0) return res.status(403).json({ error: 'Unauthorized or invalid student.' });

    // Check lock permission
    if (component.locked && !['SUPER_ADMIN', 'PRINCIPAL', 'HOD'].includes(req.user.role)) {
      return res.status(403).json({ error: 'This marks component is locked and cannot be edited by faculty.' });
    }

    if (Number(obtainedMarks) > Number(component.max_marks)) {
      return res.status(400).json({ error: `Obtained marks (${obtainedMarks}) cannot exceed maximum marks (${component.max_marks}).` });
    }

    // Check if existing mark is locked
    const existing = await pool.query(
      `SELECT id, locked FROM marks WHERE mark_component_id = $1 AND student_id = $2`,
      [componentId, studentId],
    );
    if (existing.rowCount > 0 && existing.rows[0].locked && !['SUPER_ADMIN', 'PRINCIPAL', 'HOD'].includes(req.user.role)) {
      return res.status(403).json({ error: 'This student\'s marks are locked and cannot be changed.' });
    }

    const before = existing.rows[0] ?? null;
    const result = await pool.query(
      `INSERT INTO marks (mark_component_id, student_id, obtained_marks, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $4)
       ON CONFLICT (mark_component_id, student_id)
       DO UPDATE SET obtained_marks = $3, updated_by = $4, updated_at = now()
       RETURNING *`,
      [componentId, studentId, Number(obtainedMarks), req.user.id],
    );

    await auditLog({
      userId: req.user.id, action: before ? 'UPDATE' : 'CREATE', module: 'Marks',
      entity: `student:${studentId} component:${componentId}`,
      entityId: result.rows[0].id,
      before: before ? { obtained_marks: before.obtained_marks } : null,
      after: { obtained_marks: Number(obtainedMarks) },
    });
    return res.json(result.rows[0]);
  } catch (err) { next(err); }
});

router.post('/bulk', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'HOD', 'FACULTY'), async (req, res, next) => {
  try {
    const { componentId, entries } = req.body;
    if (!componentId) return res.status(400).json({ error: 'componentId is required.' });
    if (!Array.isArray(entries) || !entries.length) {
      return res.status(400).json({ error: 'entries array is required.' });
    }

    const compResult = await pool.query(`
      SELECT mc.* FROM mark_components mc
      JOIN subject_offerings so ON so.id = mc.subject_offering_id
      JOIN subjects s ON s.id = so.subject_id
      JOIN departments d ON d.id = s.department_id
      WHERE mc.id = $1 AND d.institution_id = $2
    `, [componentId, req.user.institution_id]);
    if (compResult.rowCount === 0) return res.status(404).json({ error: 'Component not found or unauthorized.' });
    const component = compResult.rows[0];

    if (component.locked && !['SUPER_ADMIN', 'PRINCIPAL', 'HOD'].includes(req.user.role)) {
      return res.status(403).json({ error: 'This component is locked and cannot be edited.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      let updatedCount = 0;
      let skippedCount = 0;

      for (const entry of entries) {
        const { rollNumber, studentId: entryStuId, obtainedMarks } = entry;

        // Resolve studentId if rollNumber supplied, explicitly matching institution
        let targetStuId = entryStuId;
        if (!targetStuId && rollNumber) {
          const stuRes = await client.query('SELECT id FROM students WHERE roll_number = $1 AND institution_id = $2 LIMIT 1', [rollNumber.trim(), req.user.institution_id]);
          if (stuRes.rowCount > 0) targetStuId = stuRes.rows[0].id;
        } else if (targetStuId) {
          const validStu = await client.query('SELECT id FROM students WHERE id = $1 AND institution_id = $2', [targetStuId, req.user.institution_id]);
          if (validStu.rowCount === 0) targetStuId = null;
        }

        if (!targetStuId) { skippedCount++; continue; }
        if (obtainedMarks === undefined || obtainedMarks === null || Number(obtainedMarks) < 0 || Number(obtainedMarks) > Number(component.max_marks)) {
          skippedCount++;
          continue;
        }

        await client.query(
          `INSERT INTO marks (mark_component_id, student_id, obtained_marks, created_by, updated_by)
           VALUES ($1, $2, $3, $4, $4)
           ON CONFLICT (mark_component_id, student_id)
           DO UPDATE SET obtained_marks = $3, updated_by = $4, updated_at = now()`,
          [componentId, targetStuId, Number(obtainedMarks), req.user.id],
        );
        updatedCount++;
      }

      await client.query('COMMIT');
      await auditLog({ userId: req.user.id, action: 'BULK_IMPORT', module: 'Marks', entity: `component:${componentId}`, after: { updatedCount, skippedCount } });
      return res.json({ ok: true, updatedCount, skippedCount });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

export default router;
