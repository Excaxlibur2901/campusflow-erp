/**
 * Timetable API — CampusFlow ERP
 *
 * GET  /api/timetable              – Get timetable slots (filterable)
 * POST /api/timetable/generate     – Generate timetable for a section
 * POST /api/timetable/validate     – Validate existing slots
 * PUT  /api/timetable/:id/lock     – Lock/unlock a slot
 * DELETE /api/timetable/:id        – Delete unlocked slot
 * DELETE /api/timetable            – Clear unlocked slots for a section
 */

import { Router } from 'express';
import { pool } from '../db.js';
import { authenticateUser, requireRole } from '../middleware/auth.js';
import { auditLog } from '../utils/audit.js';
import { generateTimetable, validateTimetable } from '../engine/timetable.js';

const router = Router();
router.use(authenticateUser);

/* ── GET /api/timetable ─────────────────────────────────────────── */
router.get('/', async (req, res, next) => {
  try {
    const { dept, semester, section } = req.query;
    // For now, delegate to the app_state for backwards compatibility
    // until frontend migration is complete.
    const stateResult = await pool.query('SELECT data FROM app_state WHERE id = $1', ['main']);
    const timetable = stateResult.rows[0]?.data?.timetable ?? [];

    let filtered = timetable;
    if (dept)     filtered = filtered.filter((s) => s.dept === dept);
    if (semester) filtered = filtered.filter((s) => String(s.semester) === String(semester));
    if (section)  filtered = filtered.filter((s) => s.section === section);

    return res.json(filtered);
  } catch (err) { next(err); }
});

/* ── POST /api/timetable/generate ───────────────────────────────── */
router.post('/generate', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'HOD'), async (req, res, next) => {
  try {
    const { days, timeSlots, subjects, sectionCode, existingSlots = [] } = req.body;

    if (!Array.isArray(days) || !days.length)       return res.status(400).json({ error: 'days array is required.' });
    if (!Array.isArray(timeSlots) || !timeSlots.length) return res.status(400).json({ error: 'timeSlots array is required.' });
    if (!Array.isArray(subjects) || !subjects.length)   return res.status(400).json({ error: 'subjects array is required.' });
    if (!sectionCode)                                return res.status(400).json({ error: 'sectionCode is required.' });

    // Build sets from existing slots for other sections
    const lockedKeys  = new Set();
    const busyFaculty = new Set();
    const busyRooms   = new Set();

    existingSlots
      .filter((s) => s.sectionCode !== sectionCode)
      .forEach((s) => {
        if (s.facultyId) busyFaculty.add(`${s.day}-${s.slotIdx}-${s.facultyId}`);
        if (s.roomId)    busyRooms.add(`${s.day}-${s.slotIdx}-${s.roomId}`);
      });

    const sectionLocked = existingSlots.filter((s) => s.sectionCode === sectionCode && s.locked);
    sectionLocked.forEach((s) => {
      lockedKeys.add(`${s.day}-${s.slotIdx}-${sectionCode}`);
    });

    const { slots, report } = generateTimetable({
      days,
      timeSlots,
      subjects,
      lockedKeys,
      busyFaculty,
      busyRooms,
      existingSlots: existingSlots.filter((s) => s.sectionCode === sectionCode),
      sectionCode,
    });

    await auditLog({
      userId: req.user.id,
      action: 'GENERATE',
      module: 'Timetable',
      entity: `Section ${sectionCode}`,
      after: { slotsGenerated: slots.length, report },
    });

    return res.json({ slots, report });
  } catch (err) { next(err); }
});

/* ── POST /api/timetable/validate ───────────────────────────────── */
router.post('/validate', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'HOD', 'FACULTY'), async (req, res, next) => {
  try {
    const { slots = [], subjects = [] } = req.body;
    const report = validateTimetable(slots, subjects);
    return res.json(report);
  } catch (err) { next(err); }
});

/* ── PUT /api/timetable/:slotKey/lock ───────────────────────────── */
router.put('/:slotKey/lock', requireRole('SUPER_ADMIN', 'PRINCIPAL', 'HOD'), async (req, res, next) => {
  try {
    const { locked } = req.body;
    // This operates on the JSON blob until normalized timetable_entries migration
    const stateResult = await pool.query('SELECT data FROM app_state WHERE id = $1', ['main']);
    const timetable = stateResult.rows[0]?.data?.timetable ?? [];
    const { day, slotIdx, sectionCode } = req.body;

    const updated = timetable.map((slot) =>
      slot.day === day && slot.slot === slotIdx && slot.section === sectionCode
        ? { ...slot, locked: !!locked }
        : slot,
    );

    await pool.query(
      `UPDATE app_state SET data = data || $1::jsonb WHERE id = 'main'`,
      [JSON.stringify({ timetable: updated })],
    );

    return res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
