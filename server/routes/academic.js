/**
 * Academic Structures API — CampusFlow ERP
 * Handles Programs, Academic Years, Semesters, and Sections.
 */

import { Router } from 'express';
import { pool } from '../db.js';
import { authenticateUser, requireRole } from '../middleware/auth.js';
import { auditLog } from '../utils/audit.js';

const router = Router();
router.use(authenticateUser);

/* ── PROGRAMS ────────────────────────────────────────────────────── */

router.get('/programs', async (req, res, next) => {
  try {
    const { departmentId } = req.query;
    const conds = ['d.institution_id = $1'];
    const params = [req.user.institution_id];
    let pIdx = 2;
    if (departmentId) { conds.push(`p.department_id = $${pIdx++}`); params.push(departmentId); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT p.*, d.name AS dept_name, d.code AS dept_code
       FROM programs p
       INNER JOIN departments d ON d.id = p.department_id
       ${where} ORDER BY p.name`,
      params,
    );
    return res.json(result.rows);
  } catch (err) { next(err); }
});

router.post('/programs', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'HOD'), async (req, res, next) => {
  try {
    const { departmentId, code, name, degreeLevel, totalSemesters, durationYears } = req.body;
    if (!code?.trim()) return res.status(400).json({ error: 'Program code is required.' });
    if (!name?.trim()) return res.status(400).json({ error: 'Program name is required.' });

    const deptCheck = await pool.query('SELECT id FROM departments WHERE id = $1 AND institution_id = $2', [departmentId, req.user.institution_id]);
    if (deptCheck.rowCount === 0) return res.status(404).json({ error: 'Department not found.' });

    const result = await pool.query(
      `INSERT INTO programs (department_id, code, name, degree_level, total_semesters, duration_years)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [departmentId ?? null, code.trim().toUpperCase(), name.trim(), degreeLevel ?? 'UG', totalSemesters ?? 8, durationYears ?? 4],
    );
    await auditLog({ userId: req.user.id, action: 'CREATE', module: 'Academic', entity: `program:${name.trim()}`, entityId: result.rows[0].id });
    return res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
});

/* ── ACADEMIC YEARS ──────────────────────────────────────────────── */

router.get('/years', async (_req, res, next) => {
  try {
    const result = await pool.query(`SELECT * FROM academic_years WHERE institution_id = $1 ORDER BY label DESC`, [req.user.institution_id]);
    return res.json(result.rows);
  } catch (err) { next(err); }
});

router.post('/years', requireRole('SUPER_ADMIN', 'PRINCIPAL'), async (req, res, next) => {
  try {
    const { label, startsOn, endsOn, isCurrent, institutionId } = req.body;
    if (!label?.trim()) return res.status(400).json({ error: 'Academic year label is required.' });

    const result = await pool.query(
      `INSERT INTO academic_years (institution_id, label, starts_on, ends_on, is_current)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.user.institution_id, label.trim(), startsOn ?? null, endsOn ?? null, !!isCurrent],
    );
    await auditLog({ userId: req.user.id, action: 'CREATE', module: 'Academic', entity: `year:${label.trim()}`, entityId: result.rows[0].id });
    return res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
});

/* ── SEMESTERS ───────────────────────────────────────────────────── */

router.get('/semesters', async (req, res, next) => {
  try {
    const { programId } = req.query;
    const conds = ['d.institution_id = $1'];
    const params = [req.user.institution_id];
    let pIdx = 2;
    if (programId) { conds.push(`s.program_id = $${pIdx++}`); params.push(programId); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT s.*, p.name AS program_name, ay.label AS academic_year_label
       FROM semesters s
       INNER JOIN programs p ON p.id = s.program_id
       INNER JOIN departments d ON d.id = p.department_id
       LEFT JOIN academic_years ay ON ay.id = s.academic_year_id
       ${where} ORDER BY s.number`,
      params,
    );
    return res.json(result.rows);
  } catch (err) { next(err); }
});

router.post('/semesters', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'HOD'), async (req, res, next) => {
  try {
    const { programId, academicYearId, number, startsOn, endsOn } = req.body;
    if (!programId) return res.status(400).json({ error: 'programId is required.' });
    if (!number || number < 1) return res.status(400).json({ error: 'Valid semester number is required.' });

    const progCheck = await pool.query(`SELECT p.id FROM programs p INNER JOIN departments d ON d.id = p.department_id WHERE p.id = $1 AND d.institution_id = $2`, [programId, req.user.institution_id]);
    if (progCheck.rowCount === 0) return res.status(404).json({ error: 'Program not found.' });

    const result = await pool.query(
      `INSERT INTO semesters (program_id, academic_year_id, number, starts_on, ends_on)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [programId, academicYearId ?? null, number, startsOn ?? null, endsOn ?? null],
    );
    await auditLog({ userId: req.user.id, action: 'CREATE', module: 'Academic', entity: `semester:${number}`, entityId: result.rows[0].id });
    return res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
});

/* ── SECTIONS ────────────────────────────────────────────────────── */

router.get('/sections', async (req, res, next) => {
  try {
    const { semesterId } = req.query;
    const conds = ['d.institution_id = $1'];
    const params = [req.user.institution_id];
    let pIdx = 2;
    if (semesterId) { conds.push(`sec.semester_id = $${pIdx++}`); params.push(semesterId); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT sec.*, sem.number AS semester_number
       FROM sections sec
       INNER JOIN semesters sem ON sem.id = sec.semester_id
       INNER JOIN programs p ON p.id = sem.program_id
       INNER JOIN departments d ON d.id = p.department_id
       ${where} ORDER BY sec.code`,
      params,
    );
    return res.json(result.rows);
  } catch (err) { next(err); }
});

router.post('/sections', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'HOD'), async (req, res, next) => {
  try {
    const { semesterId, code, division, capacity } = req.body;
    if (!semesterId)   return res.status(400).json({ error: 'semesterId is required.' });
    if (!code?.trim()) return res.status(400).json({ error: 'Section code is required.' });

    const semCheck = await pool.query(`SELECT sem.id FROM semesters sem INNER JOIN programs p ON p.id = sem.program_id INNER JOIN departments d ON d.id = p.department_id WHERE sem.id = $1 AND d.institution_id = $2`, [semesterId, req.user.institution_id]);
    if (semCheck.rowCount === 0) return res.status(404).json({ error: 'Semester not found.' });

    const result = await pool.query(
      `INSERT INTO sections (semester_id, code, division, capacity)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [semesterId, code.trim().toUpperCase(), division?.trim() ?? null, capacity ?? 60],
    );
    await auditLog({ userId: req.user.id, action: 'CREATE', module: 'Academic', entity: `section:${code.trim()}`, entityId: result.rows[0].id });
    return res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
});

export default router;
