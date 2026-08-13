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
    const conds = [];
    const params = [];
    if (departmentId) { conds.push(`p.department_id = $1`); params.push(departmentId); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT p.*, d.name AS dept_name, d.code AS dept_code
       FROM programs p
       LEFT JOIN departments d ON d.id = p.department_id
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
    const result = await pool.query(`SELECT * FROM academic_years ORDER BY label DESC`);
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
      [institutionId ?? null, label.trim(), startsOn ?? null, endsOn ?? null, !!isCurrent],
    );
    await auditLog({ userId: req.user.id, action: 'CREATE', module: 'Academic', entity: `year:${label.trim()}`, entityId: result.rows[0].id });
    return res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
});

/* ── SEMESTERS ───────────────────────────────────────────────────── */

router.get('/semesters', async (req, res, next) => {
  try {
    const { programId } = req.query;
    const conds = [];
    const params = [];
    if (programId) { conds.push(`s.program_id = $1`); params.push(programId); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT s.*, p.name AS program_name, ay.label AS academic_year_label
       FROM semesters s
       LEFT JOIN programs p ON p.id = s.program_id
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
    const conds = [];
    const params = [];
    if (semesterId) { conds.push(`sec.semester_id = $1`); params.push(semesterId); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT sec.*, sem.number AS semester_number
       FROM sections sec
       LEFT JOIN semesters sem ON sem.id = sec.semester_id
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
