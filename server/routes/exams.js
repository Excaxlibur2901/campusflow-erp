/**
 * Exams & Seating API — CampusFlow ERP
 *
 * Fully integrated with normalized PostgreSQL tables and real student records.
 */

import { Router } from 'express';
import { pool } from '../db.js';
import { authenticateUser, requireRole } from '../middleware/auth.js';
import { auditLog } from '../utils/audit.js';
import { generateSeating, validateSeating } from '../engine/seating.js';

const router = Router();
router.use(authenticateUser);

/* ─────────────── EXAMS ─────────────────────────────────────────── */

router.get('/', async (req, res, next) => {
  try {
    const { status, search } = req.query;
    const conds = [];
    const params = [];
    let idx = 1;
    conds.push(`e.institution_id = $${idx++}`);
    params.push(req.user.institution_id);
    if (status) { conds.push(`e.status = $${idx++}`); params.push(status); }
    if (search) { conds.push(`e.name ILIKE $${idx++}`); params.push(`%${search}%`); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT e.*,
              COUNT(DISTINCT es.id)::int AS subject_count,
              COUNT(DISTINCT er.id)::int AS registration_count,
              COUNT(DISTINCT eh.id)::int AS hall_count
       FROM exams e
       LEFT JOIN exam_subjects es ON es.exam_id = e.id
       LEFT JOIN exam_registrations er ON er.exam_subject_id = es.id
       LEFT JOIN exam_halls eh ON eh.exam_id = e.id
       ${where}
       GROUP BY e.id
       ORDER BY e.created_at DESC`,
      params,
    );
    return res.json(result.rows);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT e.*,
              COUNT(DISTINCT es.id)::int AS subject_count,
              COUNT(DISTINCT er.id)::int AS registration_count,
              COUNT(DISTINCT eh.id)::int AS hall_count
       FROM exams e
       LEFT JOIN exam_subjects es ON es.exam_id = e.id
       LEFT JOIN exam_registrations er ON er.exam_subject_id = es.id
       LEFT JOIN exam_halls eh ON eh.exam_id = e.id
       WHERE e.id = $1 AND e.institution_id = $2
       GROUP BY e.id`,
      [req.params.id, req.user.institution_id],
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Exam not found.' });
    return res.json(result.rows[0]);
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
      [req.user.institution_id, academicYearId ?? null, name.trim(), examType, startsOn ?? null, endsOn ?? null, req.user.id],
    );
    await auditLog({ userId: req.user.id, action: 'CREATE', module: 'Exams', entity: name.trim(), entityId: result.rows[0].id });
    return res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
});

router.put('/:id', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'EXAM_CELL'), async (req, res, next) => {
  try {
    const before = await pool.query('SELECT * FROM exams WHERE id = $1 AND institution_id = $2', [req.params.id, req.user.institution_id]);
    if (before.rowCount === 0) return res.status(404).json({ error: 'Exam not found.' });
    const { name, examType, startsOn, endsOn, status } = req.body;

    const result = await pool.query(
      `UPDATE exams SET
         name = COALESCE($1, name), exam_type = COALESCE($2, exam_type),
         starts_on = COALESCE($3, starts_on), ends_on = COALESCE($4, ends_on),
         status = COALESCE($5, status), updated_by = $6
       WHERE id = $7 AND institution_id = $8 RETURNING *`,
      [name?.trim() ?? null, examType ?? null, startsOn ?? null, endsOn ?? null, status ?? null, req.user.id, req.params.id, req.user.institution_id],
    );
    await auditLog({ userId: req.user.id, action: 'UPDATE', module: 'Exams', entity: result.rows[0].name, entityId: req.params.id, before: before.rows[0], after: result.rows[0] });
    return res.json(result.rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', requireRole('SUPER_ADMIN', 'EXAM_CELL'), async (req, res, next) => {
  try {
    const before = await pool.query('SELECT * FROM exams WHERE id = $1 AND institution_id = $2', [req.params.id, req.user.institution_id]);
    if (before.rowCount === 0) return res.status(404).json({ error: 'Exam not found.' });
    await pool.query('DELETE FROM exams WHERE id = $1 AND institution_id = $2', [req.params.id, req.user.institution_id]);
    await auditLog({ userId: req.user.id, action: 'DELETE', module: 'Exams', entity: before.rows[0].name, entityId: req.params.id, before: before.rows[0] });
    return res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ─────────────── EXAM SUBJECTS ─────────────────────────────────── */

router.get('/:examId/subjects', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT es.*, s.code AS subject_code, s.name AS subject_name, d.code AS dept_code
       FROM exam_subjects es
       LEFT JOIN subjects s ON s.id = es.subject_id
       LEFT JOIN departments d ON d.id = s.department_id
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
    if (!subjectId) return res.status(400).json({ error: 'Subject is required.' });
    if (!examDate)  return res.status(400).json({ error: 'Exam date is required.' });
    if (!session)   return res.status(400).json({ error: 'Session is required.' });

    const result = await pool.query(
      `INSERT INTO exam_subjects (exam_id, subject_id, exam_date, session, starts_at, ends_at)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.examId, subjectId, examDate, session, startsAt ?? null, endsAt ?? null],
    );
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'This subject is already scheduled for this date/session.' });
    next(err);
  }
});

/* ─────────────── EXAM HALLS ────────────────────────────────────── */

router.get('/:examId/halls', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT eh.*, c.code AS classroom_code, c.name AS classroom_name,
              COUNT(hs.id)::int AS total_seats,
              COUNT(CASE WHEN hs.available THEN 1 END)::int AS available_seats
       FROM exam_halls eh
       JOIN classrooms c ON c.id = eh.classroom_id
       LEFT JOIN hall_seats hs ON hs.exam_hall_id = eh.id
       WHERE eh.exam_id = $1
       GROUP BY eh.id, c.id
       ORDER BY c.code`,
      [req.params.examId],
    );
    return res.json(result.rows);
  } catch (err) { next(err); }
});

router.post('/:examId/halls', requireRole('SUPER_ADMIN', 'EXAM_CELL'), async (req, res, next) => {
  try {
    const { classroomId, rowsCount = 8, columnsCount = 10, benchesCount = 40, seatsPerBench = 2, unavailableSeats = [] } = req.body;
    const examId = req.params.examId;
    if (!classroomId) return res.status(400).json({ error: 'classroomId is required.' });

    const capacity = rowsCount * columnsCount;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const hallRes = await client.query(
        `INSERT INTO exam_halls (exam_id, classroom_id, rows_count, columns_count, benches_count, seats_per_bench, capacity)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (exam_id, classroom_id) DO UPDATE SET
           rows_count = EXCLUDED.rows_count, columns_count = EXCLUDED.columns_count,
           benches_count = EXCLUDED.benches_count, seats_per_bench = EXCLUDED.seats_per_bench,
           capacity = EXCLUDED.capacity
         RETURNING *`,
        [examId, classroomId, rowsCount, columnsCount, benchesCount, seatsPerBench, capacity],
      );

      const hallId = hallRes.rows[0].id;
      const unavailSet = new Set(unavailableSeats.map(s => `${s.row}-${s.col}`));

      // Generate grid seats in hall_seats
      for (let r = 1; r <= rowsCount; r++) {
        for (let c = 1; c <= columnsCount; c++) {
          const seatNum = `R${r}C${c}`;
          const isAvailable = !unavailSet.has(`${r}-${c}`);
          const benchNum = Math.ceil(( (r - 1) * columnsCount + c) / seatsPerBench);

          await client.query(
            `INSERT INTO hall_seats (exam_hall_id, row_number, column_number, bench_number, seat_number, available)
             VALUES ($1,$2,$3,$4,$5,$6)
             ON CONFLICT (exam_hall_id, row_number, column_number) DO UPDATE SET
               seat_number = EXCLUDED.seat_number, available = EXCLUDED.available`,
            [hallId, r, c, benchNum, seatNum, isAvailable],
          );
        }
      }

      await client.query('COMMIT');
      return res.status(201).json(hallRes.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

/* ─────────────── EXAM REGISTRATIONS ────────────────────────────── */

router.get('/:examId/registrations', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT er.*, s.full_name AS student_name, s.roll_number, s.enrollment_number, s.year, s.division,
              d.id AS department_id, d.code AS dept_code, d.name AS dept_name,
              sec.id AS section_id, sec.code AS section_code,
              sub.id AS subject_id, sub.code AS subject_code, sub.name AS subject_name,
              es.exam_date, es.session
       FROM exam_registrations er
       JOIN exam_subjects es ON es.id = er.exam_subject_id
       JOIN students s ON s.id = er.student_id
       LEFT JOIN departments d ON d.id = s.department_id
       LEFT JOIN sections sec ON sec.id = s.section_id
       LEFT JOIN subjects sub ON sub.id = es.subject_id
       WHERE es.exam_id = $1
       ORDER BY sub.code, s.roll_number`,
      [req.params.examId],
    );
    return res.json(result.rows);
  } catch (err) { next(err); }
});

router.post('/:examId/registrations', requireRole('SUPER_ADMIN', 'EXAM_CELL', 'HOD'), async (req, res, next) => {
  try {
    const { examSubjectId, studentIds, departmentId } = req.body;
    if (!examSubjectId) return res.status(400).json({ error: 'examSubjectId is required.' });

    let idsToRegister = studentIds;

    // If departmentId provided without studentIds, auto-fetch department students
    if ((!idsToRegister || !idsToRegister.length) && departmentId) {
      const stuRes = await pool.query(`SELECT id FROM students WHERE department_id = $1 AND status = 'ACTIVE'`, [departmentId]);
      idsToRegister = stuRes.rows.map(r => r.id);
    }

    if (!Array.isArray(idsToRegister) || !idsToRegister.length) {
      return res.status(400).json({ error: 'No student records found to register.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      let inserted = 0;
      let skipped = 0;

      for (const studentId of idsToRegister) {
        const res = await client.query(
          `INSERT INTO exam_registrations (exam_subject_id, student_id, status)
           VALUES ($1, $2, 'registered')
           ON CONFLICT (exam_subject_id, student_id) DO NOTHING
           RETURNING id`,
          [examSubjectId, studentId],
        );
        if (res.rowCount > 0) inserted++;
        else skipped++;
      }

      await client.query('COMMIT');
      return res.json({ ok: true, inserted, skipped });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

router.put('/:examId/registrations/:regId/absent', requireRole('SUPER_ADMIN', 'EXAM_CELL', 'FACULTY'), async (req, res, next) => {
  try {
    const { absent = true } = req.body;
    const newStatus = absent ? 'absent' : 'registered';

    const result = await pool.query(
      `UPDATE exam_registrations SET status = $1, updated_at = now() WHERE id = $2 RETURNING *`,
      [newStatus, req.params.regId],
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Exam registration not found.' });

    // Update associated seat allocation if marked absent
    if (absent) {
      await pool.query(
        `UPDATE seat_allocations SET allocation_status = 'absent'
         WHERE exam_id = $1 AND student_id = $2`,
        [req.params.examId, result.rows[0].student_id],
      );
    } else {
      await pool.query(
        `UPDATE seat_allocations SET allocation_status = 'allocated'
         WHERE exam_id = $1 AND student_id = $2`,
        [req.params.examId, result.rows[0].student_id],
      );
    }

    return res.json(result.rows[0]);
  } catch (err) { next(err); }
});

/* ─────────────── SEATING ALLOCATION ────────────────────────────── */

router.get('/:examId/seating', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT sa.*, s.full_name AS student_name, s.roll_number, s.enrollment_number, s.year, s.division,
              d.code AS dept_code, d.name AS dept_name,
              sec.code AS section_code,
              sub.id AS subject_id, sub.code AS subject_code, sub.name AS subject_name,
              hs.seat_number, hs.row_number, hs.column_number, hs.bench_number, hs.available,
              c.code AS classroom_code, c.name AS classroom_name, eh.id AS hall_id
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
       ORDER BY c.code, hs.row_number, hs.column_number`,
      [req.params.examId],
    );
    return res.json(result.rows);
  } catch (err) { next(err); }
});

router.post('/:examId/seating/generate', requireRole('SUPER_ADMIN', 'EXAM_CELL'), async (req, res, next) => {
  try {
    const examId = req.params.examId;
    const { weights } = req.body;

    // Check if exam is locked
    const examRes = await pool.query(`SELECT status FROM exams WHERE id = $1`, [examId]);
    if (examRes.rowCount > 0 && examRes.rows[0].status === 'locked') {
      return res.status(403).json({ error: 'This exam seating arrangement is locked and cannot be regenerated.' });
    }

    // Fetch real registered students from PostgreSQL
    const regResult = await pool.query(
      `SELECT er.id AS registration_id, er.student_id, er.exam_subject_id, er.status,
              s.full_name AS student_name, s.roll_number, s.enrollment_number, s.year, s.division,
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
      return res.status(400).json({ error: 'No registered active students found for this exam. Register real students before generating seating.' });
    }

    // Fetch hall seats from PostgreSQL
    const seatResult = await pool.query(
      `SELECT hs.id, hs.exam_hall_id AS hall_id, hs.row_number, hs.column_number,
              hs.bench_number, hs.seat_number, hs.available, hs.locked
       FROM hall_seats hs
       JOIN exam_halls eh ON eh.id = hs.exam_hall_id
       WHERE eh.exam_id = $1 AND hs.available = true
       ORDER BY eh.id, hs.row_number, hs.column_number`,
      [examId],
    );

    if (seatResult.rowCount === 0) {
      return res.status(400).json({ error: 'No available hall seats found. Configure exam halls first.' });
    }

    const registrations = regResult.rows.map(r => ({
      studentId: r.student_id,
      studentName: r.student_name,
      rollNumber: r.roll_number,
      enrollmentNumber: r.enrollment_number,
      departmentId: r.department_id,
      deptCode: r.dept_code,
      year: r.year,
      sectionId: r.section_id,
      sectionCode: r.section_code,
      subjectId: r.subject_id,
      subjectCode: r.subject_code,
      subjectName: r.subject_name,
      examSubjectId: r.exam_subject_id,
    }));

    const result = generateSeating({
      registrations,
      seats: seatResult.rows,
      weights,
    });

    // Save allocations into PostgreSQL
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Delete existing unlocked allocations
      await client.query(`DELETE FROM seat_allocations WHERE exam_id = $1 AND locked = false`, [examId]);

      for (const alloc of result.allocations) {
        const reg = regResult.rows.find(r => r.student_id === alloc.studentId);
        await client.query(
          `INSERT INTO seat_allocations
             (exam_id, exam_subject_id, exam_registration_id, student_id, hall_seat_id,
              allocation_status, score, conflict_flags, locked, created_by, updated_by)
           VALUES ($1, $2, $3, $4, $5, 'allocated', $6, $7::jsonb, false, $8, $8)`,
          [
            examId, alloc.examSubjectId || reg?.exam_subject_id, reg?.registration_id,
            alloc.studentId, alloc.hallSeatId, alloc.score || 0,
            JSON.stringify(alloc.conflictFlags || []), req.user.id
          ],
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return res.json(result);
  } catch (err) { next(err); }
});

router.post('/:examId/seating/validate', async (req, res, next) => {
  try {
    const examId = req.params.examId;

    const [allocRes, seatRes, regRes] = await Promise.all([
      pool.query(
        `SELECT sa.*, s.full_name AS student_name, s.roll_number, s.enrollment_number, s.year, s.division,
                d.id AS department_id, d.code AS dept_code,
                sec.id AS section_id, sec.code AS section_code,
                sub.id AS subject_id, sub.code AS subject_code, sub.name AS subject_name,
                hs.seat_number, hs.row_number, hs.column_number, hs.exam_hall_id AS hall_id
         FROM seat_allocations sa
         JOIN students s ON s.id = sa.student_id
         LEFT JOIN departments d ON d.id = s.department_id
         LEFT JOIN sections sec ON sec.id = s.section_id
         LEFT JOIN exam_subjects es ON es.id = sa.exam_subject_id
         LEFT JOIN subjects sub ON sub.id = es.subject_id
         JOIN hall_seats hs ON hs.id = sa.hall_seat_id
         WHERE sa.exam_id = $1`,
        [examId],
      ),
      pool.query(
        `SELECT hs.id, hs.exam_hall_id AS hall_id, hs.row_number, hs.column_number, hs.seat_number, hs.available
         FROM hall_seats hs
         JOIN exam_halls eh ON eh.id = hs.exam_hall_id
         WHERE eh.exam_id = $1`,
        [examId],
      ),
      pool.query(
        `SELECT er.student_id, er.status, s.full_name AS student_name, s.roll_number
         FROM exam_registrations er
         JOIN exam_subjects es ON es.id = er.exam_subject_id
         JOIN students s ON s.id = er.student_id
         WHERE es.exam_id = $1`,
        [examId],
      ),
    ]);

    const report = validateSeating({
      allocations: allocRes.rows,
      seats: seatRes.rows,
      registrations: regRes.rows,
    });

    return res.json(report);
  } catch (err) { next(err); }
});

router.put('/:examId/seating/lock', requireRole('SUPER_ADMIN', 'EXAM_CELL'), async (req, res, next) => {
  try {
    const examId = req.params.examId;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`UPDATE seat_allocations SET locked = true WHERE exam_id = $1`, [examId]);
      await client.query(`UPDATE exams SET status = 'locked' WHERE id = $1`, [examId]);
      await client.query('COMMIT');
      return res.json({ ok: true, message: 'Exam seating finalized and locked.' });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

export default router;
