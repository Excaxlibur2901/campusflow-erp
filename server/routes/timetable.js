/**
 * Timetable API — CampusFlow ERP
 * Fully integrated with normalized PostgreSQL tables, subject offerings, and tenant isolation.
 */

import { Router } from 'express';
import { pool } from '../db.js';
import { authenticateUser, requireRole } from '../middleware/auth.js';
import { auditLog } from '../utils/audit.js';
import { generateTimetable, validateMove } from '../engine/timetable.js';
import { ensureAcademicYearForInstitution, ensureSectionsForSemester, ensureSemestersForInstitution } from './academic.js';

const router = Router();
router.use(authenticateUser);

/* ── TIME SLOT HELPERS ───────────────────────────────────────────── */

function getDayOfWeek(day) {
  if (typeof day === 'number') return Math.min(7, Math.max(1, day));
  const dayStr = String(day || '').toLowerCase().slice(0, 3);
  switch (dayStr) {
    case 'mon': return 1;
    case 'tue': return 2;
    case 'wed': return 3;
    case 'thu': return 4;
    case 'fri': return 5;
    case 'sat': return 6;
    case 'sun': return 7;
    default: return 1;
  }
}

function parseTimeRange(timeSlotStr, slotIdx = 0) {
  if (typeof timeSlotStr === 'object' && timeSlotStr !== null) {
    return {
      startsAt: timeSlotStr.startsAt || timeSlotStr.starts_at || timeSlotStr.start || '09:00:00',
      endsAt: timeSlotStr.endsAt || timeSlotStr.ends_at || timeSlotStr.end || '09:50:00',
    };
  }

  const str = String(timeSlotStr || '').trim();
  const parts = str.split('-').map(s => s.trim());
  if (parts.length === 2) {
    const normalizeTime = (t) => {
      let [hStr, mStr] = t.split(':');
      let h = parseInt(hStr, 10);
      let m = parseInt(mStr, 10);
      if (isNaN(h)) h = 9;
      if (isNaN(m)) m = 0;
      if (h >= 1 && h <= 6 && slotIdx >= 4) {
        h += 12;
      }
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
    };

    const startsAt = normalizeTime(parts[0]);
    const endsAt = normalizeTime(parts[1]);
    return { startsAt, endsAt };
  }

  const baseHour = 9 + slotIdx;
  return {
    startsAt: `${String(baseHour).padStart(2, '0')}:00:00`,
    endsAt: `${String(baseHour).padStart(2, '0')}:50:00`,
  };
}

async function ensureTimeSlot(clientOrPool, institutionId, day, slotIdx, timeSlots = []) {
  const dayOfWeek = getDayOfWeek(day);
  const timeSlotStr = (timeSlots && timeSlots[slotIdx]) ? timeSlots[slotIdx] : null;
  const { startsAt, endsAt } = parseTimeRange(timeSlotStr, slotIdx);
  const label = `${day}-${slotIdx}`;

  let tsRes = await clientOrPool.query(
    `SELECT id, label, day_of_week, starts_at, ends_at FROM time_slots WHERE institution_id = $1 AND label = $2 LIMIT 1`,
    [institutionId, label],
  );

  if (tsRes.rowCount === 0) {
    tsRes = await clientOrPool.query(
      `INSERT INTO time_slots (institution_id, label, day_of_week, starts_at, ends_at, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, label, day_of_week, starts_at, ends_at`,
      [institutionId, label, dayOfWeek, startsAt, endsAt, slotIdx],
    );
  } else {
    await clientOrPool.query(
      `UPDATE time_slots
       SET day_of_week = $1, starts_at = $2, ends_at = $3, sort_order = $4, updated_at = now()
       WHERE id = $5`,
      [dayOfWeek, startsAt, endsAt, slotIdx, tsRes.rows[0].id],
    );
  }

  return tsRes.rows[0];
}

/* ── GET /api/timetable ─────────────────────────────────────────── */
router.get('/', async (req, res, next) => {
  try {
    const { dept, semester, section } = req.query;

    const conds = ['d.institution_id = $1'];
    const params = [req.user.institution_id];
    let idx = 2;

    if (dept) { conds.push(`d.code = $${idx++}`); params.push(dept); }
    if (semester) { conds.push(`sem.number = $${idx++}`); params.push(Number(semester)); }
    if (section) { conds.push(`sec.code = $${idx++}`); params.push(section); }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT te.id, te.locked, te.created_at,
              ts.label AS time_slot_label, ts.day_of_week, ts.starts_at, ts.ends_at,
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
       ORDER BY ts.day_of_week, ts.starts_at, ts.label`,
      params,
    );

    const dayNames = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const slots = result.rows.map(r => {
      const derivedDay = (r.day_of_week && dayNames[r.day_of_week]) || r.time_slot_label?.split('-')[0] || 'Mon';
      const slotIdx = Number(r.time_slot_label?.split('-')[1]) || 0;
      return {
        id: r.id,
        day: derivedDay,
        dayOfWeek: r.day_of_week,
        slotIdx,
        slot: slotIdx,
        startsAt: r.starts_at,
        endsAt: r.ends_at,
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
      };
    });

    return res.json(slots);
  } catch (err) { next(err); }
});

/* ── POST /api/timetable/generate ───────────────────────────────── */
router.post('/generate', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'HOD'), async (req, res, next) => {
  try {
    const {
      dept = 'CSE',
      semester = 3,
      sectionCode = 'A',
      days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
      timeSlots = ['9:00-9:50', '9:50-10:40', '10:40-11:30', '11:30-12:20', '1:10-2:00', '2:00-2:50', '2:50-3:40'],
      subjects: inputSubjects,
    } = req.body;

    const semNum = Number(semester);

    // Prerequisite 1: Time slots configuration
    if (!days || !days.length || !timeSlots || !timeSlots.length) {
      return res.status(400).json({
        error: 'No time slots configured.',
        hardConflicts: [{ type: 'NO_TIME_SLOTS', message: 'No time slots configured.' }],
      });
    }

    // Prerequisite 2: Resolve Department
    const deptRes = await pool.query(
      `SELECT id, code, name FROM departments WHERE institution_id = $1 AND code = $2 LIMIT 1`,
      [req.user.institution_id, dept],
    );
    if (deptRes.rowCount === 0) {
      return res.status(404).json({
        error: `Department ${dept} not found in your institution.`,
        hardConflicts: [{ type: 'DEPARTMENT_NOT_FOUND', message: `Department ${dept} not found.` }],
      });
    }
    const department = deptRes.rows[0];

    // Prerequisite 3: Resolve Semester & Academic Structure
    let semRes = await pool.query(
      `SELECT sem.id, sem.number, sem.program_id, sem.academic_year_id
       FROM semesters sem
       JOIN programs p ON p.id = sem.program_id
       WHERE p.department_id = $1 AND sem.number = $2
       ORDER BY sem.created_at LIMIT 1`,
      [department.id, semNum],
    );
    let targetSemesterId = semRes.rows[0]?.id;

    if (!targetSemesterId) {
      await ensureSemestersForInstitution(pool, req.user.institution_id);
      semRes = await pool.query(
        `SELECT sem.id, sem.number, sem.program_id, sem.academic_year_id
         FROM semesters sem
         JOIN programs p ON p.id = sem.program_id
         WHERE p.department_id = $1 AND sem.number = $2
         ORDER BY sem.created_at LIMIT 1`,
        [department.id, semNum],
      );
      targetSemesterId = semRes.rows[0]?.id;
    }

    // Prerequisite 4: Resolve Section
    let secRow = null;
    if (targetSemesterId) {
      const secQuery = await pool.query(
        `SELECT id, code, capacity FROM sections WHERE semester_id = $1 AND code = $2 LIMIT 1`,
        [targetSemesterId, sectionCode],
      );
      if (secQuery.rowCount > 0) {
        secRow = secQuery.rows[0];
      } else {
        secRow = await ensureSectionsForSemester(pool, targetSemesterId);
      }
    }

    // Prerequisite 5: Fetch Resources (Offerings, Faculty, Classrooms, Existing Timetable Entries)
    const [subRes, facRes, roomRes, existingRes] = await Promise.all([
      pool.query(
        `SELECT DISTINCT ON (s.id)
                s.id, s.code, s.name, s.subject_type, s.credits,
                COALESCE(so.weekly_hours, s.weekly_hours, s.credits, 3) AS weekly_hours,
                s.faculty_id,
                so.id AS subject_offering_id,
                so.section_id,
                so.academic_year_id,
                COALESCE(
                  (SELECT json_agg(fsa.faculty_id)
                   FROM faculty_subject_assignments fsa
                   JOIN faculty f ON f.id = fsa.faculty_id AND f.institution_id = $1 AND f.active = true
                   WHERE fsa.subject_id = s.id AND fsa.institution_id = $1),
                  '[]'::json
                ) AS assigned_faculty_ids
         FROM subjects s
         JOIN departments d ON d.id = s.department_id
         LEFT JOIN subject_offerings so ON so.subject_id = s.id
           AND (so.semester_id = $3 OR $3 IS NULL)
           AND (so.section_id = $4 OR so.section_id IS NULL)
         LEFT JOIN semesters sem ON sem.id = COALESCE(so.semester_id, s.semester_id)
         WHERE d.institution_id = $1
           AND d.code = $2
           AND s.active = true
           AND (
             so.semester_id = $3
             OR s.semester_id = $3
             OR sem.number = $5
           )
         ORDER BY s.id, (so.section_id = $4) DESC, so.created_at DESC`,
        [req.user.institution_id, dept, targetSemesterId, secRow?.id || null, semNum],
      ),
      pool.query(
        `SELECT f.id, f.full_name AS name, f.employee_code, f.max_weekly_hours, f.department_id
         FROM faculty f
         WHERE f.institution_id = $1 AND f.active = true`,
        [req.user.institution_id],
      ),
      pool.query(
        `SELECT c.id, c.code, c.name, c.capacity, c.room_type, c.room_type AS "roomType"
         FROM classrooms c
         WHERE c.institution_id = $1 AND c.active = true`,
        [req.user.institution_id],
      ),
      pool.query(
        `SELECT te.id, te.locked,
                ts.label AS time_slot_label,
                d.code AS dept_code,
                sec.code AS section_code,
                s.id AS subject_id, s.code AS subject_code,
                f.id AS faculty_id, f.full_name AS faculty_name,
                c.id AS room_id, c.code AS room_code
         FROM timetable_entries te
         JOIN subject_offerings so ON so.id = te.subject_offering_id
         JOIN subjects s ON s.id = so.subject_id
         JOIN time_slots ts ON ts.id = te.time_slot_id
         JOIN sections sec ON sec.id = te.section_id
         JOIN semesters sem ON sem.id = sec.semester_id
         JOIN programs p ON p.id = sem.program_id
         JOIN departments d ON d.id = p.department_id
         LEFT JOIN faculty f ON f.id = te.faculty_id
         LEFT JOIN classrooms c ON c.id = te.classroom_id
         WHERE d.institution_id = $1`,
        [req.user.institution_id],
      ),
    ]);

    // Check Classrooms
    if (roomRes.rows.length === 0) {
      return res.status(409).json({
        error: 'No classrooms available.',
        hardConflicts: [{ type: 'NO_CLASSROOMS', message: 'No classrooms available.' }],
      });
    }

    // Check Subject Offerings
    if (subRes.rows.length === 0) {
      return res.status(409).json({
        error: 'No subject offerings for this section.',
        hardConflicts: [{ type: 'NO_SUBJECT_OFFERINGS', message: 'No subject offerings for this section.' }],
      });
    }

    // Map Schedulable Subjects and verify Faculty assignment via faculty_subject_assignments
    const unassignedSubjects = [];
    const subjectsToSchedule = (inputSubjects && Array.isArray(inputSubjects) && inputSubjects.length)
      ? inputSubjects
      : subRes.rows.map((s) => {
          const assignedFacIds = Array.isArray(s.assigned_faculty_ids)
            ? s.assigned_faculty_ids
            : (typeof s.assigned_faculty_ids === 'string' ? JSON.parse(s.assigned_faculty_ids) : []);

          let assignedFac = facRes.rows.find(f =>
            assignedFacIds.includes(f.id) || f.id === s.faculty_id
          );

          if (!assignedFac) {
            assignedFac = facRes.rows.find(f => f.department_id === department.id) || facRes.rows[0] || null;
          }

          if (!assignedFac) {
            unassignedSubjects.push(s);
          }

          const assignedRoom = roomRes.rows.find(r => r.id === s.room_id) || roomRes.rows[0] || null;

          return {
            id: s.id,
            code: s.code,
            name: s.name,
            type: s.subject_type || 'theory',
            weeklyHours: Number(s.weekly_hours || s.credits || 3),
            credits: Number(s.credits || 3),
            facultyIds: assignedFac ? [assignedFac.id] : [],
            facultyId: assignedFac?.id || null,
            facultyName: assignedFac?.name || null,
            roomId: assignedRoom?.id || null,
            roomCode: assignedRoom?.code || null,
            subjectOfferingId: s.subject_offering_id || null,
          };
        });

    if (unassignedSubjects.length > 0) {
      const first = unassignedSubjects[0];
      return res.status(409).json({
        error: `No faculty assigned to ${first.name || first.code}.`,
        hardConflicts: unassignedSubjects.map(s => ({
          type: 'MISSING_FACULTY',
          message: `No faculty assigned to ${s.name || s.code}.`,
          subjectId: s.id,
        })),
      });
    }

    const existingSlots = existingRes.rows.map(r => ({
      id: r.id,
      day: r.time_slot_label?.split('-')[0] || 'Mon',
      slotIdx: Number(r.time_slot_label?.split('-')[1]) || 0,
      sectionCode: `${r.dept_code}:${r.section_code}`,
      subjectId: r.subject_id,
      facultyId: r.faculty_id,
      roomId: r.room_id,
      locked: r.locked,
    }));

    const sectionCapacity = secRow?.capacity || 60;

    // 6. Generate Timetable using Backend Engine (checking Section, Faculty, Room clashes and Locked slots)
    const result = generateTimetable({
      days,
      timeSlots,
      subjects: subjectsToSchedule,
      facultyList: facRes.rows,
      classroomsList: roomRes.rows,
      existingSlots,
      sectionCode: `${dept}:${sectionCode}`,
      sectionCapacity,
    });

    // 7. Save generated slots into PostgreSQL ONLY IF generation succeeded without hard conflicts
    if (result.report.ok && result.slots.length > 0 && result.hardConflicts.length === 0) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        let sectionId = secRow?.id;
        if (!sectionId && targetSemesterId) {
          const newSec = await ensureSectionsForSemester(client, targetSemesterId);
          sectionId = newSec?.id;
        }

        if (sectionId) {
          // Delete existing unlocked entries for this section (preserving locked entries)
          await client.query(`DELETE FROM timetable_entries WHERE section_id = $1 AND locked = false`, [sectionId]);

          for (const slot of result.slots) {
            if (slot.locked) continue;

            const timeSlot = await ensureTimeSlot(client, req.user.institution_id, slot.day, slot.slotIdx, timeSlots);
            const timeSlotId = timeSlot.id;

            let soRes = await client.query(
              `SELECT so.id
               FROM subject_offerings so
               WHERE so.subject_id = $1 AND so.semester_id = $2
                 AND (so.section_id IS NULL OR so.section_id = $3)
               ORDER BY (so.section_id = $3) DESC, so.created_at DESC
               LIMIT 1`,
              [slot.subjectId, targetSemesterId, sectionId]
            );
            if (soRes.rowCount === 0) {
              const defaultYear = await ensureAcademicYearForInstitution(client, req.user.institution_id);
              soRes = await client.query(
                `INSERT INTO subject_offerings (subject_id, semester_id, section_id, academic_year_id, weekly_hours)
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (subject_id, semester_id, section_id, academic_year_id)
                 DO UPDATE SET weekly_hours = EXCLUDED.weekly_hours, updated_at = now()
                 RETURNING id`,
                [slot.subjectId, targetSemesterId, sectionId, defaultYear?.id || null, Number(slot.weeklyHours || 3)],
              );
            }
            const subjectOfferingId = soRes.rows[0]?.id;

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

      await auditLog({
        userId: req.user.id,
        action: 'GENERATE',
        module: 'Timetable',
        entity: `Department ${dept} Section ${sectionCode}`,
        after: { slots: result.slots.length, conflicts: result.hardConflicts.length, score: result.score },
      });

      return res.json(result);
    } else {
      return res.status(409).json({
        error: result.hardConflicts[0]?.message || 'Timetable generation encountered constraint conflicts.',
        slots: result.slots,
        hardConflicts: result.hardConflicts,
        softViolations: result.softViolations,
        unscheduledHours: result.unscheduledHours,
        facultyWorkload: result.facultyWorkload,
        roomUtilization: result.roomUtilization,
        score: result.score,
        report: result.report,
      });
    }
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
         JOIN semesters sem ON sem.id = sec.semester_id
         JOIN programs p ON p.id = sem.program_id
         JOIN departments d ON d.id = p.department_id
         LEFT JOIN faculty f ON f.id = te.faculty_id
         LEFT JOIN classrooms c ON c.id = te.classroom_id
         WHERE d.institution_id = $1`,
        [req.user.institution_id],
      ),
      pool.query(`SELECT id, code, capacity, room_type FROM classrooms WHERE institution_id = $1 AND active = true`, [req.user.institution_id]),
    ]);

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

    const valResult = validateMove({
      targetSlot,
      existingSlots,
      classroomsList: roomRes.rows,
    });

    return res.json(valResult);
  } catch (err) { next(err); }
});

/* ── PUT /api/timetable/entries/:id/move ─────────────────────────── */
router.put('/entries/:id/move', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'HOD', 'FACULTY'), async (req, res, next) => {
  try {
    const { day, slotIdx, roomId, facultyId } = req.body;
    if (!day || slotIdx === undefined) return res.status(400).json({ error: 'day and slotIdx are required.' });

    const entryRes = await pool.query(
      `SELECT te.*, sec.code AS section_code, d.institution_id
       FROM timetable_entries te
       JOIN sections sec ON sec.id = te.section_id
       JOIN semesters sem ON sem.id = sec.semester_id
       JOIN programs p ON p.id = sem.program_id
       JOIN departments d ON d.id = p.department_id
       WHERE te.id = $1 AND d.institution_id = $2`,
      [req.params.id, req.user.institution_id],
    );
    if (entryRes.rowCount === 0) return res.status(404).json({ error: 'Timetable entry not found.' });
    if (entryRes.rows[0].locked) return res.status(400).json({ error: 'Cannot move a locked timetable slot.' });

    const timeSlot = await ensureTimeSlot(pool, req.user.institution_id, day, Number(slotIdx));

    const result = await pool.query(
      `UPDATE timetable_entries
       SET time_slot_id = $1,
           classroom_id = COALESCE($2, classroom_id),
           faculty_id = COALESCE($3, faculty_id),
           updated_at = now()
       WHERE id = $4
       RETURNING *`,
      [timeSlot.id, roomId || null, facultyId || null, req.params.id],
    );

    return res.json(result.rows[0]);
  } catch (err) { next(err); }
});

/* ── PUT /api/timetable/entries/:id/lock ─────────────────────────── */
router.put('/entries/:id/lock', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'HOD'), async (req, res, next) => {
  try {
    const { locked = true } = req.body;
    const result = await pool.query(
      `UPDATE timetable_entries te
       SET locked = $1, updated_at = now()
       FROM sections sec, semesters sem, programs p, departments d
       WHERE te.id = $2
         AND te.section_id = sec.id
         AND sec.semester_id = sem.id
         AND sem.program_id = p.id
         AND p.department_id = d.id
         AND d.institution_id = $3
       RETURNING te.*`,
      [locked, req.params.id, req.user.institution_id],
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Timetable entry not found.' });
    return res.json(result.rows[0]);
  } catch (err) { next(err); }
});

/* ── DELETE /api/timetable/entries/:id ───────────────────────────── */
router.delete('/entries/:id', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'HOD'), async (req, res, next) => {
  try {
    const check = await pool.query(
      `SELECT te.id, te.locked
       FROM timetable_entries te
       JOIN sections sec ON sec.id = te.section_id
       JOIN semesters sem ON sem.id = sec.semester_id
       JOIN programs p ON p.id = sem.program_id
       JOIN departments d ON d.id = p.department_id
       WHERE te.id = $1 AND d.institution_id = $2`,
      [req.params.id, req.user.institution_id],
    );
    if (check.rowCount === 0) return res.status(404).json({ error: 'Timetable entry not found.' });
    if (check.rows[0].locked) return res.status(400).error ? res.status(400).json({ error: 'Cannot delete a locked slot. Unlock it first.' }) : res.status(400).json({ error: 'Cannot delete a locked slot. Unlock it first.' });

    await pool.query(`DELETE FROM timetable_entries WHERE id = $1`, [req.params.id]);
    return res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
