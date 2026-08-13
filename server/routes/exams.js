/**
 * Exams & Seating API — CampusFlow ERP
 *
 * Exams:
 *   GET    /api/exams               – List all exams
 *   POST   /api/exams               – Create exam
 *   PUT    /api/exams/:id           – Update exam
 *   DELETE /api/exams/:id           – Delete exam
 *
 * Exam Registrations:
 *   GET    /api/exams/:id/registrations  – Get all registrations for an exam
 *   POST   /api/exams/:id/registrations  – Register students (bulk)
 *
 * Seating:
 *   POST   /api/exams/:id/seating/generate  – Generate seating using real students
 *   GET    /api/exams/:id/seating           – Get current allocations
 *   PUT    /api/exams/:id/seating/:allocId/lock – Lock allocation
 *   DELETE /api/exams/:id/seating           – Clear unlocked allocations
 */

import { Router } from 'express';
import { pool } from '../db.js';
import { authenticateUser, requireRole } from '../middleware/auth.js';
import { auditLog } from '../utils/audit.js';
import { generateSeating } from '../engine/seating.js';

const router = Router();
router.use(authenticateUser);

/* ─────────────── EXAMS ─────────────────────────────────────────── */

router.get('/', async (req, res, next) => {
  try {
    const { status, search } = req.query;
    const conds = [];
    const params = [];
    let idx = 1;
    if (status) { conds.push(`e.status = $${idx++}`); params.push(status); }
    if (search) { conds.push(`e.name ILIKE $${idx++}`); params.push(`%${search}%`); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT e.*, COUNT(DISTINCT er.id)::int AS registration_count
       FROM exams e
       LEFT JOIN exam_subjects es ON es.exam_id = e.id
       LEFT JOIN exam_registrations er ON er.exam_subject_id = es.id
       ${where}
       GROUP BY e.id
       ORDER BY e.created_at DESC`,
      params,
    );
    return res.json(result.rows);
  } catch (err) { next(err); }
});

router.post('/', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'EXAM_CELL'), async (req, res, next) => {
  try {
    const { name, examType, startsOn, endsOn, institutionId, academicYearId } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Exam name is required.' });
    if (!examType)     return res.status(400).json({ error: 'Exam type is required.' });
    const result = await pool.query(
      `INSERT INTO exams (institution_id, academic_year_id, name, exam_type, starts_on, ends_on, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$7) RETURNING *`,
      [institutionId??null, academicYearId??null, name.trim(), examType,
       startsOn??null, endsOn??null, req.user.id],
    );
    await auditLog({ userId: req.user.id, action: 'CREATE', module: 'Exams', entity: name.trim(), entityId: result.rows[0].id });
    return res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
});

router.put('/:id', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'EXAM_CELL'), async (req, res, next) => {
  try {
    const before = await pool.query('SELECT * FROM exams WHERE id = $1', [req.params.id]);
    if (before.rowCount === 0) return res.status(404).json({ error: 'Exam not found.' });
    const { name, examType, startsOn, endsOn, status } = req.body;
    const result = await pool.query(
      `UPDATE exams SET
         name = COALESCE($1, name), exam_type = COALESCE($2, exam_type),
         starts_on = COALESCE($3, starts_on), ends_on = COALESCE($4, ends_on),
         status = COALESCE($5, status), updated_by = $6
       WHERE id = $7 RETURNING *`,
      [name?.trim()??null, examType??null, startsOn??null, endsOn??null, status??null, req.user.id, req.params.id],
    );
    await auditLog({ userId: req.user.id, action: 'UPDATE', module: 'Exams', entity: result.rows[0].name, entityId: req.params.id, before: before.rows[0], after: result.rows[0] });
    return res.json(result.rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', requireRole('SUPER_ADMIN', 'EXAM_CELL'), async (req, res, next) => {
  try {
    const before = await pool.query('SELECT * FROM exams WHERE id = $1', [req.params.id]);
    if (before.rowCount === 0) return res.status(404).json({ error: 'Exam not found.' });
    await pool.query('DELETE FROM exams WHERE id = $1', [req.params.id]);
    await auditLog({ userId: req.user.id, action: 'DELETE', module: 'Exams', entity: before.rows[0].name, entityId: req.params.id, before: before.rows[0] });
    return res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ─────────────── EXAM SUBJECTS ─────────────────────────────────── */

router.get('/:examId/subjects', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT es.*, s.code AS subject_code, s.name AS subject_name
       FROM exam_subjects es
       LEFT JOIN subjects s ON s.id = es.subject_id
       WHERE es.exam_id = $1
       ORDER BY es.exam_date, es.session`,
      [req.params.examId],
    );
    return res.json(result.rows);
  } catch (err) { next(err); }
});

router.post('/:examId/subjects', requireRole('SUPER_ADMIN', 'EXAM_CELL'), async (req, res, next) => {
  try {
    const { subjectId, examDate, session, startsAt, endsAt } = req.body;
    if (!subjectId)  return res.status(400).json({ error: 'Subject is required.' });
    if (!examDate)   return res.status(400).json({ error: 'Exam date is required.' });
    if (!session)    return res.status(400).json({ error: 'Session is required.' });
    const result = await pool.query(
      `INSERT INTO exam_subjects (exam_id, subject_id, exam_date, session, starts_at, ends_at)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.examId, subjectId, examDate, session, startsAt??null, endsAt??null],
    );
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'This subject is already scheduled for this date/session.' });
    next(err);
  }
});

/* ─────────────── EXAM REGISTRATIONS ────────────────────────────── */

router.get('/:examId/registrations', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT er.*, s.full_name AS student_name, s.roll_number, s.enrollment_number,
              d.code AS dept_code, sec.code AS section_code,
              sub.code AS subject_code, sub.name AS subject_name, es.exam_date, es.session
       FROM exam_registrations er
       JOIN exam_subjects es ON es.id = er.exam_subject_id
       JOIN students s ON s.id = er.student_id
       LEFT JOIN departments d ON d.id = s.department_id
       LEFT JOIN sections sec ON sec.id = s.section_id
       LEFT JOIN subjects sub ON sub.id = es.subject_id
       WHERE es.exam_id = $1
       ORDER BY s.roll_number`,
      [req.params.examId],
    );
    return res.json(result.rows);
  } catch (err) { next(err); }
});

router.post('/:examId/registrations', requireRole('SUPER_ADMIN', 'EXAM_CELL', 'HOD'), async (req, res, next) => {
  try {
    const { examSubjectId, studentIds } = req.body;
    if (!examSubjectId)          return res.status(400).json({ error: 'examSubjectId is required.' });
    if (!Array.isArray(studentIds) || !studentIds.length) {
      return res.status(400).json({ error: 'studentIds array is required.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      let inserted = 0;
      let skipped = 0;
      for (const studentId of studentIds) {
        const existing = await client.query(
          `SELECT id FROM exam_registrations WHERE exam_subject_id = $1 AND student_id = $2`,
          [examSubjectId, studentId],
        );
        if (existing.rowCount > 0) { skipped++; continue; }
        await client.query(
          `INSERT INTO exam_registrations (exam_subject_id, student_id) VALUES ($1, $2)`,
          [examSubjectId, studentId],
        );
        inserted++;
      }
      await client.query('COMMIT');
      await auditLog({ userId: req.user.id, action: 'CREATE', module: 'ExamRegistrations', entity: `examSubject:${examSubjectId}`, after: { inserted, skipped } });
      return res.json({ ok: true, inserted, skipped });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

/* ─────────────── SEATING ───────────────────────────────────────── */

router.get('/:examId/seating', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT sa.*, s.full_name AS student_name, s.roll_number, s.enrollment_number,
              d.code AS dept_code, sec.code AS section_code,
              sub.code AS subject_code, sub.name AS subject_name,
              hs.seat_number, hs.row_number, hs.column_number,
              c.code AS classroom_code, c.name AS classroom_name
       FROM seat_allocations sa
       JOIN students s ON s.id = sa.student_id
       LEFT JOIN departments d ON d.id = s.department_id
       LEFT JOIN sections sec ON sec.id = s.section_id
       LEFT JOIN exam_subjects es ON es.id = sa.exam_subject_id
       LEFT JOIN subjects sub ON sub.id = es.subject_id
       JOIN hall_seats hs ON hs.id = sa.hall_seat_id
       JOIN exam_halls eh ON eh.id = hs.exam_hall_id
       JOIN classrooms c ON c.id = eh.classroom_id
       WHERE sa.exam_id = $1
       ORDER BY hs.row_number, hs.column_number`,
      [req.params.examId],
    );
    return res.json(result.rows);
  } catch (err) { next(err); }
});

router.post('/:examId/seating/generate', requireRole('SUPER_ADMIN', 'EXAM_CELL'), async (req, res, next) => {
  try {
    const { hallIds, weights } = req.body;
    const examId = req.params.examId;

    // Fetch registered students for this exam (excluding absent/cancelled)
    const regResult = await pool.query(
      `SELECT er.id AS registration_id, er.student_id, er.exam_subject_id, er.status,
              s.full_name AS student_name, s.roll_number, s.enrollment_number,
              d.id AS department_id, d.code AS dept_code,
              sec.id AS section_id, sec.code AS section_code,
              sub.id AS subject_id, sub.code AS subject_code, sub.name AS subject_name
       FROM exam_registrations er
       JOIN exam_subjects es ON es.id = er.exam_subject_id
       JOIN students s ON s.id = er.student_id
       LEFT JOIN departments d ON d.id = s.department_id
       LEFT JOIN sections sec ON sec.id = s.section_id
       LEFT JOIN subjects sub ON sub.id = es.subject_id
       WHERE es.exam_id = $1 AND er.status = 'registered'
       ORDER BY s.roll_number`,
      [examId],
    );

    if (regResult.rowCount === 0) {
      return res.status(400).json({ error: 'No registered students found for this exam. Register students before generating seating.' });
    }

    // Fetch available hall seats (not locked)
    const hallFilter = hallIds?.length
      ? `AND eh.id = ANY($2::uuid[])`
      : '';
    const seatParams = hallIds?.length ? [examId, hallIds] : [examId];

    const seatResult = await pool.query(
      `SELECT hs.id, hs.exam_hall_id AS hall_id, hs.row_number, hs.column_number,
              hs.seat_number, hs.available, hs.locked
       FROM hall_seats hs
       JOIN exam_halls eh ON eh.id = hs.exam_hall_id
       WHERE eh.exam_id = $1 ${hallFilter}
         AND hs.available = true
       ORDER BY hs.row_number, hs.column_number`,
      seatParams,
    );

    if (seatResult.rowCount === 0) {
      return res.status(400).json({ error: 'No available seats found. Configure exam halls and seats first.' });
    }

    // Fetch locked allocations to preserve
    const lockedResult = await pool.query(
      `SELECT sa.hall_seat_id, sa.student_id, sa.exam_subject_id,
              s.full_name AS student_name, s.roll_number, s.enrollment_number,
              d.code AS dept_code, sec.code AS section_code,
              sub.code AS subject_code, sub.name AS subject_name
       FROM seat_allocations sa
       JOIN students s ON s.id = sa.student_id
       LEFT JOIN departments d ON d.id = s.department_id
       LEFT JOIN sections sec ON sec.id = s.section_id
       LEFT JOIN exam_subjects es ON es.id = sa.exam_subject_id
       LEFT JOIN subjects sub ON sub.id = es.subject_id
       WHERE sa.exam_id = $1 AND sa.locked = true`,
      [examId],
    );

    const registrations = regResult.rows.map((r) => ({
      studentId: r.student_id,
      studentName: r.student_name,
      rollNumber: r.roll_number,
      enrollmentNumber: r.enrollment_number,
      departmentId: r.department_id,
      deptCode: r.dept_code,
      sectionId: r.section_id,
      sectionCode: r.section_code,
      subjectId: r.subject_id,
      subjectCode: r.subject_code,
      subjectName: r.subject_name,
    }));

    const { allocations, report } = generateSeating({
      registrations,
      seats: seatResult.rows,
      lockedAllocations: lockedResult.rows.map((r) => ({
        hallSeatId: r.hall_seat_id,
        studentId: r.student_id,
        studentName: r.student_name,
        rollNumber: r.roll_number,
        enrollmentNumber: r.enrollment_number,
        deptCode: r.dept_code,
        sectionCode: r.section_code,
        subjectId: r.subject_id,
        subjectCode: r.subject_code,
        subjectName: r.subject_name,
      })),
      weights,
    });

    // Save to DB in a transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Delete existing unlocked allocations for this exam
      await client.query(
        `DELETE FROM seat_allocations WHERE exam_id = $1 AND locked = false`,
        [examId],
      );

      // Insert new allocations
      for (const alloc of allocations) {
        if (alloc.locked) continue; // already in DB
        // Find exam_subject_id from the registration
        const reg = regResult.rows.find((r) => r.student_id === alloc.studentId);
        await client.query(
          `INSERT INTO seat_allocations
             (exam_id, exam_subject_id, exam_registration_id, student_id, hall_seat_id,
              allocation_status, score, conflict_flags, locked, created_by, updated_by)
           SELECT $1, $2, er.id, $3, $4, 'allocated', $5, $6::jsonb, false, $7, $7
           FROM exam_registrations er
           WHERE er.exam_subject_id = $2 AND er.student_id = $3
           LIMIT 1`,
          [examId, reg?.exam_subject_id ?? null, alloc.studentId, alloc.hallSeatId,
           alloc.score, JSON.stringify(alloc.conflictFlags), req.user.id],
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    await auditLog({
      userId: req.user.id, action: 'GENERATE', module: 'Seating',
      entity: `exam:${examId}`,
      after: { allocated: report.allocated, unallocated: report.unallocatedCount, conflicts: report.sameSubjectAdjacencyCount },
    });

    return res.json({ allocations, report });
  } catch (err) { next(err); }
});

export default router;
