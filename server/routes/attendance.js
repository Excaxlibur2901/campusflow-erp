/**
 * Attendance API — CampusFlow ERP
 *
 * POST /api/attendance/sessions          – Create attendance session
 * GET  /api/attendance/sessions          – List sessions (filterable)
 * POST /api/attendance/sessions/:id/records – Submit/update records
 * GET  /api/attendance/students/:studentId/percentage – Per-student percentage
 * GET  /api/attendance/defaulters        – Students below threshold
 * GET  /api/attendance/history           – Session history
 */

import { Router } from 'express';
import { pool } from '../db.js';
import { authenticateUser, requireRole } from '../middleware/auth.js';
import { auditLog } from '../utils/audit.js';

const router = Router();
router.use(authenticateUser);

/* ── POST /api/attendance/sessions ──────────────────────────────── */
router.post('/sessions', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'HOD', 'FACULTY'), async (req, res, next) => {
  try {
    const { subjectOfferingId, facultyId, sectionId, timeSlotId, sessionDate } = req.body;
    if (!sessionDate) return res.status(400).json({ error: 'Session date is required.' });

    // Prevent duplicate sessions
    const dup = await pool.query(
      `SELECT id FROM attendance_sessions
       WHERE subject_offering_id = $1 AND section_id = $2 AND session_date = $3
         AND (time_slot_id = $4 OR ($4 IS NULL AND time_slot_id IS NULL))`,
      [subjectOfferingId??null, sectionId??null, sessionDate, timeSlotId??null],
    );
    if (dup.rowCount > 0) {
      return res.status(409).json({ error: 'An attendance session already exists for this subject, section, date, and slot.' });
    }

    const result = await pool.query(
      `INSERT INTO attendance_sessions (subject_offering_id, faculty_id, section_id, time_slot_id, session_date, status, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,'draft',$6,$6) RETURNING *`,
      [subjectOfferingId??null, facultyId??null, sectionId??null, timeSlotId??null, sessionDate, req.user.id],
    );
    await auditLog({ userId: req.user.id, action: 'CREATE', module: 'Attendance', entity: `session:${sessionDate}`, entityId: result.rows[0].id });
    return res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
});

/* ── GET /api/attendance/sessions ───────────────────────────────── */
router.get('/sessions', async (req, res, next) => {
  try {
    const { sectionId, date, status, page = '1', limit = '50' } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const offset = (pageNum - 1) * limitNum;
    const conds = [];
    const params = [];
    let idx = 1;
    if (sectionId) { conds.push(`s.section_id = $${idx++}`); params.push(sectionId); }
    if (date)      { conds.push(`s.session_date = $${idx++}`); params.push(date); }
    if (status)    { conds.push(`s.status = $${idx++}`); params.push(status); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT s.*, COUNT(ar.id)::int AS record_count,
              COUNT(ar.id) FILTER (WHERE ar.status = 'present')::int AS present_count
       FROM attendance_sessions s
       LEFT JOIN attendance_records ar ON ar.attendance_session_id = s.id
       ${where}
       GROUP BY s.id
       ORDER BY s.session_date DESC, s.created_at DESC
       LIMIT $${idx} OFFSET $${idx+1}`,
      [...params, limitNum, offset],
    );
    return res.json(result.rows);
  } catch (err) { next(err); }
});

/* ── POST /api/attendance/sessions/:id/records ───────────────────── */
router.post('/sessions/:id/records', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'HOD', 'FACULTY'), async (req, res, next) => {
  try {
    const sessionId = req.params.id;
    const { records } = req.body; // [{ studentId, status: 'present'|'absent'|'late'|'excused', remarks }]

    if (!Array.isArray(records) || !records.length) {
      return res.status(400).json({ error: 'records array is required.' });
    }

    // Verify session exists and is not locked
    const sessionResult = await pool.query('SELECT * FROM attendance_sessions WHERE id = $1', [sessionId]);
    if (sessionResult.rowCount === 0) return res.status(404).json({ error: 'Session not found.' });
    if (sessionResult.rows[0].status === 'locked') {
      return res.status(403).json({ error: 'This attendance session is locked and cannot be modified.' });
    }

    const validStatuses = ['present', 'absent', 'late', 'excused'];
    const invalid = records.filter((r) => !validStatuses.includes(r.status));
    if (invalid.length) {
      return res.status(400).json({ error: `Invalid status values: ${invalid.map((r) => r.status).join(', ')}` });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const record of records) {
        await client.query(
          `INSERT INTO attendance_records (attendance_session_id, student_id, status, remarks, updated_at)
           VALUES ($1, $2, $3, $4, now())
           ON CONFLICT (attendance_session_id, student_id)
           DO UPDATE SET status = $3, remarks = $4, updated_at = now()`,
          [sessionId, record.studentId, record.status, record.remarks ?? null],
        );
      }

      // Update session to submitted
      await client.query(
        `UPDATE attendance_sessions SET status = 'submitted', updated_by = $1 WHERE id = $2`,
        [req.user.id, sessionId],
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    const present = records.filter((r) => r.status === 'present').length;
    await auditLog({
      userId: req.user.id, action: 'UPDATE', module: 'Attendance',
      entity: `session:${sessionId}`,
      after: { total: records.length, present, absent: records.length - present },
    });

    return res.json({ ok: true, total: records.length, present, absent: records.length - present });
  } catch (err) { next(err); }
});

/* ── GET /api/attendance/students/:studentId/percentage ─────────── */
router.get('/students/:studentId/percentage', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT
         COUNT(ar.id)::int AS total_classes,
         COUNT(ar.id) FILTER (WHERE ar.status = 'present')::int AS present_count,
         COUNT(ar.id) FILTER (WHERE ar.status = 'absent')::int AS absent_count,
         CASE WHEN COUNT(ar.id) > 0
           THEN ROUND((COUNT(ar.id) FILTER (WHERE ar.status = 'present')::numeric / COUNT(ar.id)) * 100, 2)
           ELSE 0
         END AS percentage
       FROM attendance_records ar
       WHERE ar.student_id = $1`,
      [req.params.studentId],
    );
    return res.json(result.rows[0] ?? { total_classes: 0, present_count: 0, absent_count: 0, percentage: 0 });
  } catch (err) { next(err); }
});

/* ── GET /api/attendance/defaulters ─────────────────────────────── */
router.get('/defaulters', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'HOD', 'FACULTY', 'EXAM_CELL'), async (req, res, next) => {
  try {
    const threshold = Number(req.query.threshold ?? 75);
    const result = await pool.query(
      `SELECT
         s.id, s.full_name, s.roll_number, s.enrollment_number,
         d.code AS dept_code, sec.code AS section_code,
         COUNT(ar.id)::int AS total_classes,
         COUNT(ar.id) FILTER (WHERE ar.status = 'present')::int AS present_count,
         CASE WHEN COUNT(ar.id) > 0
           THEN ROUND((COUNT(ar.id) FILTER (WHERE ar.status = 'present')::numeric / COUNT(ar.id)) * 100, 2)
           ELSE 0
         END AS percentage
       FROM students s
       LEFT JOIN attendance_records ar ON ar.student_id = s.id
       LEFT JOIN departments d ON d.id = s.department_id
       LEFT JOIN sections sec ON sec.id = s.section_id
       WHERE s.status = 'ACTIVE'
       GROUP BY s.id, d.code, sec.code
       HAVING COUNT(ar.id) > 0 AND
              ROUND((COUNT(ar.id) FILTER (WHERE ar.status = 'present')::numeric / COUNT(ar.id)) * 100, 2) < $1
       ORDER BY percentage ASC`,
      [threshold],
    );
    return res.json(result.rows);
  } catch (err) { next(err); }
});

/* ── GET /api/attendance/history ────────────────────────────────── */
router.get('/history', async (req, res, next) => {
  try {
    const { page = '1', limit = '50' } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const offset = (pageNum - 1) * limitNum;

    const result = await pool.query(
      `SELECT
         s.id, s.session_date, s.status,
         sub.code AS subject_code, sub.name AS subject_name,
         d.code AS dept_code, sec.code AS section_code,
         COUNT(ar.id)::int AS total,
         COUNT(ar.id) FILTER (WHERE ar.status = 'present')::int AS present,
         COUNT(ar.id) FILTER (WHERE ar.status = 'absent')::int AS absent,
         CASE WHEN COUNT(ar.id) > 0
           THEN ROUND((COUNT(ar.id) FILTER (WHERE ar.status = 'present')::numeric / COUNT(ar.id)) * 100)
           ELSE 0
         END AS rate
       FROM attendance_sessions s
       LEFT JOIN attendance_records ar ON ar.attendance_session_id = s.id
       LEFT JOIN subject_offerings so ON so.id = s.subject_offering_id
       LEFT JOIN subjects sub ON sub.id = so.subject_id
       LEFT JOIN sections sec ON sec.id = s.section_id
       LEFT JOIN semesters sem ON sem.id = sec.semester_id
       LEFT JOIN programs p ON p.id = sem.program_id
       LEFT JOIN departments d ON d.id = p.department_id
       GROUP BY s.id, sub.code, sub.name, d.code, sec.code
       ORDER BY s.session_date DESC
       LIMIT $1 OFFSET $2`,
      [limitNum, offset],
    );
    return res.json(result.rows);
  } catch (err) { next(err); }
});

export default router;
