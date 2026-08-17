/**
 * Academic Structures API — CampusFlow ERP
 * Handles Programs, Academic Years, Semesters, Sections, and Subject Offerings.
 */

import { Router } from 'express';
import { pool } from '../db.js';
import { authenticateUser, requireRole } from '../middleware/auth.js';
import { auditLog } from '../utils/audit.js';

const router = Router();
router.use(authenticateUser);

/* ── HELPER FUNCTIONS ────────────────────────────────────────────── */

export async function ensureAcademicYearForInstitution(clientOrPool, institutionId) {
  if (!institutionId) return null;
  const currentYear = new Date().getFullYear();
  const label = `${currentYear}-${currentYear + 1}`;

  let ay = await clientOrPool.query(
    `SELECT id, label FROM academic_years WHERE institution_id = $1 ORDER BY is_current DESC, starts_on DESC LIMIT 1`,
    [institutionId],
  );

  if (ay.rowCount === 0) {
    const startsOn = `${currentYear}-07-01`;
    const endsOn = `${currentYear + 1}-06-30`;
    const created = await clientOrPool.query(
      `INSERT INTO academic_years (institution_id, label, starts_on, ends_on, is_current)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id, label`,
      [institutionId, label, startsOn, endsOn],
    );
    return created.rows[0];
  }
  return ay.rows[0];
}

export async function ensureSectionsForSemester(clientOrPool, semesterId) {
  if (!semesterId) return null;
  let sec = await clientOrPool.query(
    `SELECT id, code, capacity FROM sections WHERE semester_id = $1 ORDER BY code LIMIT 1`,
    [semesterId],
  );
  if (sec.rowCount === 0) {
    const created = await clientOrPool.query(
      `INSERT INTO sections (semester_id, code, capacity)
       VALUES ($1, 'A', 60)
       RETURNING id, code, capacity`,
      [semesterId],
    );
    return created.rows[0];
  }
  return sec.rows[0];
}

export async function ensureSemestersForInstitution(clientOrPool, institutionId) {
  if (!institutionId) return;
  const depts = await clientOrPool.query(
    `SELECT id, code, name FROM departments WHERE institution_id = $1`,
    [institutionId],
  );

  for (const dept of depts.rows) {
    let prog = await clientOrPool.query(
      `SELECT id, duration_years FROM programs WHERE department_id = $1 ORDER BY created_at LIMIT 1`,
      [dept.id],
    );

    let progId;
    let durationYears = 4;
    if (prog.rowCount === 0) {
      const newProg = await clientOrPool.query(
        `INSERT INTO programs (department_id, code, name, duration_years)
         VALUES ($1, $2, $3, 4)
         RETURNING id, duration_years`,
        [dept.id, `${dept.code}-DEFAULT`, `${dept.code} Program`],
      );
      progId = newProg.rows[0].id;
      durationYears = newProg.rows[0].duration_years || 4;
    } else {
      progId = prog.rows[0].id;
      durationYears = prog.rows[0].duration_years || 4;
    }

    const totalSemesters = Math.min(Math.max(durationYears * 2, 1), 12);
    for (let semNum = 1; semNum <= totalSemesters; semNum++) {
      let semId;
      const existingSem = await clientOrPool.query(
        `SELECT id FROM semesters WHERE program_id = $1 AND number = $2 LIMIT 1`,
        [progId, semNum],
      );
      if (existingSem.rowCount === 0) {
        const createdSem = await clientOrPool.query(
          `INSERT INTO semesters (program_id, number)
           VALUES ($1, $2)
           RETURNING id`,
          [progId, semNum],
        );
        semId = createdSem.rows[0].id;
      } else {
        semId = existingSem.rows[0].id;
      }
      await ensureSectionsForSemester(clientOrPool, semId);
    }
  }
}

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

router.get('/years', async (req, res, next) => {
  try {
    await ensureAcademicYearForInstitution(pool, req.user.institution_id);
    const result = await pool.query(`SELECT * FROM academic_years WHERE institution_id = $1 ORDER BY is_current DESC, label DESC`, [req.user.institution_id]);
    return res.json(result.rows);
  } catch (err) { next(err); }
});

router.post('/years', requireRole('SUPER_ADMIN', 'PRINCIPAL'), async (req, res, next) => {
  try {
    const { label, startsOn, endsOn, isCurrent } = req.body;
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
    const { programId, departmentId } = req.query;
    await ensureSemestersForInstitution(pool, req.user.institution_id);
    await ensureAcademicYearForInstitution(pool, req.user.institution_id);

    const conds = ['d.institution_id = $1'];
    const params = [req.user.institution_id];
    let pIdx = 2;
    if (programId) { conds.push(`s.program_id = $${pIdx++}`); params.push(programId); }
    if (departmentId) { conds.push(`p.department_id = $${pIdx++}`); params.push(departmentId); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT s.id, s.number, s.program_id, s.academic_year_id, s.starts_on, s.ends_on,
              p.name AS program_name, p.code AS program_code, p.department_id,
              d.id AS dept_id, d.code AS dept_code, d.name AS dept_name,
              ay.label AS academic_year_label
       FROM semesters s
       INNER JOIN programs p ON p.id = s.program_id
       INNER JOIN departments d ON d.id = p.department_id
       LEFT JOIN academic_years ay ON ay.id = s.academic_year_id
       ${where} ORDER BY d.code, s.number`,
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
    await ensureSectionsForSemester(pool, result.rows[0].id);
    await auditLog({ userId: req.user.id, action: 'CREATE', module: 'Academic', entity: `semester:${number}`, entityId: result.rows[0].id });
    return res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
});

/* ── SECTIONS ────────────────────────────────────────────────────── */

router.get('/sections', async (req, res, next) => {
  try {
    const { semesterId, departmentId } = req.query;
    await ensureSemestersForInstitution(pool, req.user.institution_id);

    const conds = ['d.institution_id = $1'];
    const params = [req.user.institution_id];
    let pIdx = 2;
    if (semesterId) { conds.push(`sec.semester_id = $${pIdx++}`); params.push(semesterId); }
    if (departmentId) { conds.push(`d.id = $${pIdx++}`); params.push(departmentId); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT sec.*, sem.number AS semester_number,
              d.id AS department_id, d.code AS dept_code, d.name AS dept_name
       FROM sections sec
       INNER JOIN semesters sem ON sem.id = sec.semester_id
       INNER JOIN programs p ON p.id = sem.program_id
       INNER JOIN departments d ON d.id = p.department_id
       ${where} ORDER BY d.code, sem.number, sec.code`,
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

/* ── SUBJECT OFFERINGS ───────────────────────────────────────────── */

router.get('/offerings', async (req, res, next) => {
  try {
    const { departmentId, semesterId, sectionId, academicYearId, subjectId } = req.query;
    await ensureSemestersForInstitution(pool, req.user.institution_id);
    await ensureAcademicYearForInstitution(pool, req.user.institution_id);

    const conds = ['d.institution_id = $1'];
    const params = [req.user.institution_id];
    let pIdx = 2;

    if (departmentId) { conds.push(`d.id = $${pIdx++}`); params.push(departmentId); }
    if (semesterId) { conds.push(`so.semester_id = $${pIdx++}`); params.push(semesterId); }
    if (sectionId) { conds.push(`so.section_id = $${pIdx++}`); params.push(sectionId); }
    if (academicYearId) { conds.push(`so.academic_year_id = $${pIdx++}`); params.push(academicYearId); }
    if (subjectId) { conds.push(`so.subject_id = $${pIdx++}`); params.push(subjectId); }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT so.id, so.subject_id, so.semester_id, so.section_id, so.academic_year_id, so.weekly_hours,
              so.created_at, so.updated_at,
              s.code AS subject_code, s.name AS subject_name, s.subject_type, s.credits,
              sem.number AS semester_number,
              sec.code AS section_code, sec.division,
              ay.label AS academic_year_label,
              d.id AS department_id, d.code AS dept_code, d.name AS dept_name
       FROM subject_offerings so
       JOIN subjects s ON s.id = so.subject_id
       JOIN departments d ON d.id = s.department_id
       JOIN semesters sem ON sem.id = so.semester_id
       LEFT JOIN sections sec ON sec.id = so.section_id
       LEFT JOIN academic_years ay ON ay.id = so.academic_year_id
       ${where}
       ORDER BY d.code, sem.number, sec.code, s.code`,
      params,
    );
    return res.json(result.rows);
  } catch (err) { next(err); }
});

router.post('/offerings', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'HOD'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { departmentId, semesterId, academicYearId, sectionId, subjectId, weeklyHours } = req.body;

    if (!subjectId) return res.status(400).json({ error: 'subjectId is required.' });

    // 1. Validate subject belongs to this institution
    const subCheck = await client.query(
      `SELECT s.id, s.department_id, s.semester_id, s.weekly_hours, d.institution_id
       FROM subjects s
       JOIN departments d ON d.id = s.department_id
       WHERE s.id = $1 AND d.institution_id = $2`,
      [subjectId, req.user.institution_id],
    );
    if (subCheck.rowCount === 0) {
      return res.status(404).json({ error: 'Subject not found or does not belong to this institution.' });
    }
    const subject = subCheck.rows[0];

    // If departmentId is passed, verify it matches
    if (departmentId && departmentId !== subject.department_id) {
      return res.status(400).json({ error: 'Subject does not belong to the selected department.' });
    }

    // 2. Resolve semester_id
    let effectiveSemesterId = semesterId || subject.semester_id;
    if (!effectiveSemesterId) {
      return res.status(400).json({ error: 'semesterId is required.' });
    }
    const semCheck = await client.query(
      `SELECT sem.id, sem.number, p.department_id
       FROM semesters sem
       JOIN programs p ON p.id = sem.program_id
       JOIN departments d ON d.id = p.department_id
       WHERE sem.id = $1 AND d.institution_id = $2`,
      [effectiveSemesterId, req.user.institution_id],
    );
    if (semCheck.rowCount === 0) {
      return res.status(404).json({ error: 'Semester not found or does not belong to this institution.' });
    }

    // 3. Resolve academic_year_id
    let effectiveYearId = academicYearId;
    if (!effectiveYearId) {
      const year = await ensureAcademicYearForInstitution(client, req.user.institution_id);
      effectiveYearId = year?.id || null;
    } else {
      const yearCheck = await client.query(
        `SELECT id FROM academic_years WHERE id = $1 AND institution_id = $2`,
        [effectiveYearId, req.user.institution_id],
      );
      if (yearCheck.rowCount === 0) {
        return res.status(404).json({ error: 'Academic Year not found or does not belong to this institution.' });
      }
    }

    // 4. Resolve section_id
    let effectiveSectionId = sectionId;
    if (!effectiveSectionId) {
      const sec = await ensureSectionsForSemester(client, effectiveSemesterId);
      effectiveSectionId = sec?.id || null;
    } else {
      const secCheck = await client.query(
        `SELECT sec.id FROM sections sec
         JOIN semesters sem ON sem.id = sec.semester_id
         JOIN programs p ON p.id = sem.program_id
         JOIN departments d ON d.id = p.department_id
         WHERE sec.id = $1 AND d.institution_id = $2`,
        [effectiveSectionId, req.user.institution_id],
      );
      if (secCheck.rowCount === 0) {
        return res.status(404).json({ error: 'Section not found or does not belong to this institution.' });
      }
    }

    const effectiveWeeklyHours = weeklyHours !== undefined && weeklyHours !== null
      ? Math.max(0, parseInt(weeklyHours, 10))
      : (subject.weekly_hours || 3);

    // 5. Upsert subject_offering
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO subject_offerings (subject_id, semester_id, section_id, academic_year_id, weekly_hours)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (subject_id, semester_id, section_id, academic_year_id)
       DO UPDATE SET weekly_hours = EXCLUDED.weekly_hours, updated_at = now()
       RETURNING *`,
      [subject.id, effectiveSemesterId, effectiveSectionId, effectiveYearId, effectiveWeeklyHours],
    );

    // Also ensure subject.semester_id is updated if previously empty
    await client.query(
      `UPDATE subjects SET semester_id = $1 WHERE id = $2 AND semester_id IS NULL`,
      [effectiveSemesterId, subject.id],
    );

    await client.query('COMMIT');

    const created = await pool.query(
      `SELECT so.id, so.subject_id, so.semester_id, so.section_id, so.academic_year_id, so.weekly_hours,
              so.created_at, so.updated_at,
              s.code AS subject_code, s.name AS subject_name, s.subject_type, s.credits,
              sem.number AS semester_number,
              sec.code AS section_code, sec.division,
              ay.label AS academic_year_label,
              d.id AS department_id, d.code AS dept_code, d.name AS dept_name
       FROM subject_offerings so
       JOIN subjects s ON s.id = so.subject_id
       JOIN departments d ON d.id = s.department_id
       JOIN semesters sem ON sem.id = so.semester_id
       LEFT JOIN sections sec ON sec.id = so.section_id
       LEFT JOIN academic_years ay ON ay.id = so.academic_year_id
       WHERE so.id = $1`,
      [result.rows[0].id],
    );

    await auditLog({
      userId: req.user.id,
      action: 'CREATE',
      module: 'Academic',
      entity: `offering:${subject.id}`,
      entityId: result.rows[0].id,
    });

    return res.status(201).json(created.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  } finally {
    client.release();
  }
});

router.delete('/offerings/:id', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'HOD'), async (req, res, next) => {
  try {
    const check = await pool.query(
      `SELECT so.id FROM subject_offerings so
       JOIN subjects s ON s.id = so.subject_id
       JOIN departments d ON d.id = s.department_id
       WHERE so.id = $1 AND d.institution_id = $2`,
      [req.params.id, req.user.institution_id],
    );
    if (check.rowCount === 0) return res.status(404).json({ error: 'Subject offering not found.' });

    await pool.query(`DELETE FROM subject_offerings WHERE id = $1`, [req.params.id]);
    await auditLog({ userId: req.user.id, action: 'DELETE', module: 'Academic', entity: `offering:${req.params.id}`, entityId: req.params.id });
    return res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
