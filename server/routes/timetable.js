/**
 * Timetable API — CampusFlow ERP
 * Fully integrated with normalized PostgreSQL tables.
 */

import { Router } from 'express';
import { pool } from '../db.js';
import { authenticateUser, requireRole } from '../middleware/auth.js';
import { auditLog } from '../utils/audit.js';
import { generateTimetable, validateMove } from '../engine/timetable.js';

const router = Router();
router.use(authenticateUser);

/* ── GET /api/timetable ─────────────────────────────────────────── */
router.get('/', async (req, res, next) => {
  try {
    const { dept, semester, section } = req.query;

    const conds = [];
    const params = [];
    let idx = 1;

    if (dept) { conds.push(`d.code = $${idx++}`); params.push(dept); }
    if (semester) { conds.push(`sem.number = $${idx++}`); params.push(Number(semester)); }
    if (section) { conds.push(`sec.code = $${idx++}`); params.push(section); }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT te.id, te.locked, te.created_at,
              ts.label AS time_slot_label, ts.start_time, ts.end_time,
              sec.code AS section_code, sec.division,
              sem.number AS semester,
              d.code AS dept_code, d.name AS dept_name,
              s.id AS subject_id, s.code AS subject_code, s.name AS subject_name, s.subject_type,
              f.id AS faculty_id, f.full_name AS faculty_name,
              c.id AS room_id, c.code AS room_code, c.name AS room_name, c.capacity AS room_capacity,
              te.validation
       FROM timetable_entries te
       JOIN subject_offerings so ON so.id = te.subject_offering_id
       JOIN subjects s ON s.id = so.subject_id
       LEFT JOIN departments d ON d.id = s.department_id
       JOIN time_slots ts ON ts.id = te.time_slot_id
       JOIN sections sec ON sec.id = te.section_id
       JOIN semesters sem ON sem.id = sec.semester_id
       LEFT JOIN faculty f ON f.id = te.faculty_id
       LEFT JOIN classrooms c ON c.id = te.classroom_id
       ${where}
       ORDER BY ts.label`,
      params,
    );

    // Map to frontend friendly format
    const slots = result.rows.map(r => ({
      id: r.id,
      day: r.time_slot_label?.split('-')[0] || 'Mon',
      slotIdx: Number(r.time_slot_label?.split('-')[1]) || 0,
      slot: Number(r.time_slot_label?.split('-')[1]) || 0,
      dept: r.dept_code,
      semester: r.semester,
      section: r.section_code,
      subjectId: r.subject_id,
      subject: r.subject_code,
      subjectName: r.subject_name,
      facultyId: r.faculty_id,
      faculty: r.faculty_name || 'Unassigned',
      roomId: r.room_id,
      room: r.room_code || 'Unassigned',
      locked: r.locked,
      type: r.subject_type,
    }));

    return res.json(slots);
  } catch (err) { next(err); }
});

/* ── POST /api/timetable/generate ───────────────────────────────── */
router.post('/generate', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'HOD'), async (req, res, next) => {
  try {
    const {
      dept = 'CSE',
      sectionCode = 'A',
      days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
      timeSlots = ['9:00-9:50', '9:50-10:40', '10:40-11:30', '11:30-12:20', '1:10-2:00', '2:00-2:50', '2:50-3:40'],
    } = req.body;

    // 1. Fetch PostgreSQL Subjects, Faculty, Classrooms for department/semester
    const [subRes, facRes, roomRes, secRes, existingRes] = await Promise.all([
      pool.query(
        `SELECT s.id, s.code, s.name, s.subject_type, s.credits, s.weekly_hours
         FROM subjects s
         JOIN departments d ON d.id = s.department_id
         WHERE d.code = $1 AND s.active = true`,
        [dept],
      ),
      pool.query(
        `SELECT f.id, f.full_name AS name, f.employee_code, f.max_weekly_hours
         FROM faculty f
         LEFT JOIN departments d ON d.id = f.department_id
         WHERE d.code = $1 AND f.active = true`,
        [dept],
      ),
      pool.query(
        `SELECT c.id, c.code, c.name, c.capacity, c.room_type
         FROM classrooms c
         WHERE c.active = true`,
      ),
      pool.query(
        `SELECT sec.id, sec.code, sec.capacity FROM sections sec
         JOIN semesters sem ON sem.id = sec.semester_id
         JOIN programs p ON p.id = sem.program_id
         JOIN departments d ON d.id = p.department_id
         WHERE d.code = $1 AND sec.code = $2 LIMIT 1`,
        [dept, sectionCode],
      ),
      pool.query(
        `SELECT te.id, te.locked,
                ts.label AS time_slot_label,
                sec.code AS section_code,
                s.id AS subject_id, s.code AS subject_code,
                f.id AS faculty_id, f.full_name AS faculty_name,
                c.id AS room_id, c.code AS room_code
         FROM timetable_entries te
         JOIN subject_offerings so ON so.id = te.subject_offering_id
         JOIN subjects s ON s.id = so.subject_id
         JOIN time_slots ts ON ts.id = te.time_slot_id
         JOIN sections sec ON sec.id = te.section_id
         LEFT JOIN faculty f ON f.id = te.faculty_id
         LEFT JOIN classrooms c ON c.id = te.classroom_id`,
      ),
    ]);

    const subjects = subRes.rows.map((s, idx) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      type: s.subject_type,
      weeklyHours: Number(s.weekly_hours || 3),
      credits: Number(s.credits || 3),
      facultyId: facRes.rows[idx % (facRes.rows.length || 1)]?.id,
      facultyName: facRes.rows[idx % (facRes.rows.length || 1)]?.name,
      roomId: roomRes.rows[idx % (roomRes.rows.length || 1)]?.id,
      roomCode: roomRes.rows[idx % (roomRes.rows.length || 1)]?.code,
    }));

    const existingSlots = existingRes.rows.map(r => ({
      id: r.id,
      day: r.time_slot_label?.split('-')[0] || 'Mon',
      slotIdx: Number(r.time_slot_label?.split('-')[1]) || 0,
      sectionCode: r.section_code,
      subjectId: r.subject_id,
      facultyId: r.faculty_id,
      roomId: r.room_id,
      locked: r.locked,
    }));

    const sectionCapacity = secRes.rows[0]?.capacity || 60;

    // 2. Generate Timetable using Backend Engine
    const result = generateTimetable({
      days,
      timeSlots,
      subjects,
      facultyList: facRes.rows,
      classroomsList: roomRes.rows,
      existingSlots,
      sectionCode,
      sectionCapacity,
    });

    // 3. Save generated slots into PostgreSQL in a transaction
    if (result.slots.length > 0 && !result.hardConflicts.length) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Fetch or create section_id
        let sectionId = secRes.rows[0]?.id;
        if (!sectionId) {
          const defaultSem = await client.query(`SELECT id FROM semesters LIMIT 1`);
          if (defaultSem.rowCount > 0) {
            const newSec = await client.query(
              `INSERT INTO sections (semester_id, code, capacity) VALUES ($1, $2, 60) RETURNING id`,
              [defaultSem.rows[0].id, sectionCode],
            );
            sectionId = newSec.rows[0].id;
          }
        }

        if (sectionId) {
          // Delete existing unlocked entries for this section
          await client.query(`DELETE FROM timetable_entries WHERE section_id = $1 AND locked = false`, [sectionId]);

          for (const slot of result.slots) {
            if (slot.locked) continue;

            // Ensure time_slot record exists
            const tsLabel = `${slot.day}-${slot.slotIdx}`;
            const tsRes = await client.query(
              `INSERT INTO time_slots (label) VALUES ($1) ON CONFLICT (institution_id, label) DO UPDATE SET label = EXCLUDED.label RETURNING id`,
              [tsLabel],
            );
            const timeSlotId = tsRes.rows[0].id;

            // Ensure subject_offering record exists
            const soRes = await client.query(
              `INSERT INTO subject_offerings (subject_id, semester_id, weekly_hours)
               VALUES ($1, (SELECT semester_id FROM sections WHERE id = $2), 3)
               ON CONFLICT DO NOTHING RETURNING id`,
              [slot.subjectId, sectionId],
            );

            let subjectOfferingId = soRes.rows[0]?.id;
            if (!subjectOfferingId) {
              const existingSo = await client.query(
                `SELECT id FROM subject_offerings WHERE subject_id = $1 LIMIT 1`,
                [slot.subjectId],
              );
              subjectOfferingId = existingSo.rows[0]?.id;
            }

            if (subjectOfferingId && timeSlotId) {
              await client.query(
                `INSERT INTO timetable_entries
                   (subject_offering_id, faculty_id, classroom_id, time_slot_id, section_id, locked, validation, created_by, updated_by)
                 VALUES ($1, $2, $3, $4, $5, false, $6::jsonb, $7, $7)
                 ON CONFLICT (section_id, time_slot_id) DO UPDATE SET
                   subject_offering_id = EXCLUDED.subject_offering_id,
                   faculty_id = EXCLUDED.faculty_id,
                   classroom_id = EXCLUDED.classroom_id`,
                [
                  subjectOfferingId, slot.facultyId || null, slot.roomId || null,
                  timeSlotId, sectionId, JSON.stringify(result.report), req.user.id
                ],
              );
            }
          }
        }

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    await auditLog({
      userId: req.user.id,
      action: 'GENERATE',
      module: 'Timetable',
      entity: `Department ${dept} Section ${sectionCode}`,
      after: { slots: result.slots.length, conflicts: result.hardConflicts.length, score: result.score },
    });

    return res.json(result);
  } catch (err) { next(err); }
});

/* ── POST /api/timetable/validate-move ───────────────────────────── */
router.post('/validate-move', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'HOD', 'FACULTY'), async (req, res, next) => {
  try {
    const { targetSlot } = req.body;
    if (!targetSlot) return res.status(400).json({ error: 'targetSlot is required.' });

    const [existingRes, roomRes] = await Promise.all([
      pool.query(
        `SELECT te.id, te.locked, ts.label AS time_slot_label, sec.code AS section_code,
                s.id AS subject_id, f.id AS faculty_id, f.full_name AS faculty_name,
                c.id AS room_id, c.code AS room_code
         FROM timetable_entries te
         JOIN subject_offerings so ON so.id = te.subject_offering_id
         JOIN subjects s ON s.id = so.subject_id
         JOIN time_slots ts ON ts.id = te.time_slot_id
         JOIN sections sec ON sec.id = te.section_id
         LEFT JOIN faculty f ON f.id = te.faculty_id
         LEFT JOIN classrooms c ON c.id = te.classroom_id`,
      ),
      pool.query(`SELECT id, code, capacity FROM classrooms`),
    ]);

    const existingSlots = existingRes.rows.map(r => ({
      id: r.id,
      day: r.time_slot_label?.split('-')[0] || 'Mon',
      slotIdx: Number(r.time_slot_label?.split('-')[1]) || 0,
      sectionCode: r.section_code,
      subjectId: r.subject_id,
      facultyId: r.faculty_id,
      roomId: r.room_id,
      roomCode: r.room_code,
    }));

    const moveResult = validateMove({
      targetSlot,
      existingSlots,
      classroomsList: roomRes.rows,
      sectionCapacity: 60,
    });

    return res.json(moveResult);
  } catch (err) { next(err); }
});

/* ── PUT /api/timetable/entries/:id/lock ───────────────────────── */
router.put('/entries/:id/lock', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'HOD'), async (req, res, next) => {
  try {
    const { locked = true } = req.body;
    const result = await pool.query(
      `UPDATE timetable_entries SET locked = $1, updated_at = now() WHERE id = $2 RETURNING *`,
      [!!locked, req.params.id],
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Timetable entry not found.' });
    return res.json(result.rows[0]);
  } catch (err) { next(err); }
});

/* ── DELETE /api/timetable/entries/:id ─────────────────────────── */
router.delete('/entries/:id', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'HOD'), async (req, res, next) => {
  try {
    const before = await pool.query(`SELECT * FROM timetable_entries WHERE id = $1`, [req.params.id]);
    if (before.rowCount === 0) return res.status(404).json({ error: 'Timetable entry not found.' });
    if (before.rows[0].locked) return res.status(400).json({ error: 'Cannot delete a locked timetable slot.' });

    await pool.query(`DELETE FROM timetable_entries WHERE id = $1`, [req.params.id]);
    return res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
