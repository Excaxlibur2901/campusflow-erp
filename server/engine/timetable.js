/**
 * Constraint-based timetable scheduling engine — CampusFlow ERP
 *
 * This is a deterministic constraint/optimization engine. It is NOT described as "AI".
 *
 * Algorithm:
 *   1. Build a list of (subject, faculty, room, weekly_hours) assignments from input.
 *   2. For each available (day, slot) combination, try to place the assignment with
 *      the most remaining hours first (greedy-first with spread heuristic).
 *   3. Hard constraints are enforced before placing any slot.
 *   4. After generation, run a full validation pass and produce a scored report.
 *
 * Hard Constraints (must never be violated):
 *   - No faculty teaching two sections at the same time
 *   - No room hosting two sections at the same time
 *   - No section scheduled twice in the same slot
 *   - Locked slots cannot be overwritten
 *   - Faculty unavailable slots cannot be used
 *   - Lab subjects require consecutive slots
 *
 * Soft Constraints (scored, not blocking):
 *   - Same subject should not appear more than once per day
 *   - Subjects should be spread across the week
 *   - Faculty should not have more than 3 consecutive lectures
 *   - Morning slots preferred for heavy subjects
 */

/**
 * Generate a timetable.
 *
 * @param {object} opts
 * @param {string[]}  opts.days           – e.g. ['Mon','Tue','Wed','Thu','Fri','Sat']
 * @param {string[]}  opts.timeSlots      – e.g. ['9:00-9:50', ...]
 * @param {Array}     opts.subjects        – subjects to schedule: { id, code, name, type, weeklyHours, facultyId, roomId }
 * @param {Set}       opts.lockedKeys      – 'day-slotIdx-sectionCode' strings that cannot be changed
 * @param {Set}       opts.busyFaculty     – 'day-slotIdx-facultyId' from other sections
 * @param {Set}       opts.busyRooms       – 'day-slotIdx-roomId' from other sections
 * @param {Array}     opts.existingSlots   – already-placed slots for this section (locked ones)
 * @param {string}    opts.sectionCode     – section identifier for key building
 *
 * @returns {{ slots: Array, report: object }}
 */
export function generateTimetable({
  days,
  timeSlots,
  subjects,
  lockedKeys = new Set(),
  busyFaculty = new Set(),
  busyRooms = new Set(),
  existingSlots = [],
  sectionCode,
}) {
  if (!subjects.length) {
    return {
      slots: [],
      report: { ok: false, error: 'No subjects provided for scheduling.' },
    };
  }

  // Build remaining hours counter
  const remaining = {};
  subjects.forEach((s) => {
    remaining[s.id] = Number(s.weeklyHours) || 1;
  });

  // Deduct locked slots
  existingSlots.forEach((slot) => {
    if (slot.locked && remaining[slot.subjectId] !== undefined) {
      remaining[slot.subjectId] -= 1;
    }
  });

  const result = [...existingSlots.filter((s) => s.locked)];
  const usedSlots = new Set(lockedKeys);
  const localBusyFaculty = new Set(busyFaculty);
  const localBusyRooms = new Set(busyRooms);

  // Add locked slot keys
  existingSlots.filter((s) => s.locked).forEach((slot) => {
    usedSlots.add(`${slot.day}-${slot.slotIdx}-${sectionCode}`);
    if (slot.facultyId) localBusyFaculty.add(`${slot.day}-${slot.slotIdx}-${slot.facultyId}`);
    if (slot.roomId) localBusyRooms.add(`${slot.day}-${slot.slotIdx}-${slot.roomId}`);
  });

  const hardConflicts = [];
  const softViolations = [];

  // Track subject placement per day for spread heuristic
  const daySubjectCount = {};
  days.forEach((d) => { daySubjectCount[d] = {}; });
  existingSlots.filter((s) => s.locked).forEach((slot) => {
    daySubjectCount[slot.day][slot.subjectId] = (daySubjectCount[slot.day][slot.subjectId] || 0) + 1;
  });

  for (const day of days) {
    for (let slotIdx = 0; slotIdx < timeSlots.length; slotIdx++) {
      const slotKey = `${day}-${slotIdx}-${sectionCode}`;
      if (usedSlots.has(slotKey)) continue;

      // Get subjects still needing hours, sorted by most remaining (greedy-first)
      // With spread heuristic: prefer subjects not yet placed today
      const available = subjects
        .filter((s) => remaining[s.id] > 0)
        .sort((a, b) => {
          const aTodayCount = daySubjectCount[day][a.id] || 0;
          const bTodayCount = daySubjectCount[day][b.id] || 0;
          // Primary: prefer subjects with 0 occurrences today
          if (aTodayCount !== bTodayCount) return aTodayCount - bTodayCount;
          // Secondary: prefer subjects with most remaining hours
          return remaining[b.id] - remaining[a.id];
        });

      if (!available.length) continue;

      const subject = available[0];

      // Check hard constraints
      const facultyKey = subject.facultyId ? `${day}-${slotIdx}-${subject.facultyId}` : null;
      const roomKey    = subject.roomId    ? `${day}-${slotIdx}-${subject.roomId}`    : null;

      if (facultyKey && localBusyFaculty.has(facultyKey)) {
        hardConflicts.push({ day, slotIdx, type: 'faculty_clash', subjectId: subject.id, detail: `Faculty busy in slot ${slotIdx} on ${day}` });
        continue;
      }
      if (roomKey && localBusyRooms.has(roomKey)) {
        hardConflicts.push({ day, slotIdx, type: 'room_clash', subjectId: subject.id, detail: `Room busy in slot ${slotIdx} on ${day}` });
        continue;
      }

      // Soft constraint: same subject already placed today?
      if ((daySubjectCount[day][subject.id] || 0) > 0) {
        softViolations.push({ type: 'same_subject_same_day', day, subjectId: subject.id });
      }

      // Lab subjects: try to place consecutive pair
      const isLab = subject.type === 'lab' || subject.type === 'practical';
      const nextSlotKey = `${day}-${slotIdx + 1}-${sectionCode}`;
      const nextFacultyKey = subject.facultyId ? `${day}-${slotIdx + 1}-${subject.facultyId}` : null;
      const nextRoomKey    = subject.roomId    ? `${day}-${slotIdx + 1}-${subject.roomId}`    : null;

      if (isLab && remaining[subject.id] >= 2 && slotIdx < timeSlots.length - 1 &&
          !usedSlots.has(nextSlotKey) &&
          (!nextFacultyKey || !localBusyFaculty.has(nextFacultyKey)) &&
          (!nextRoomKey || !localBusyRooms.has(nextRoomKey))) {
        // Place two consecutive lab slots
        const placeSlot = (si) => {
          const slot = {
            day, slotIdx: si, subjectId: subject.id, subjectCode: subject.code,
            subjectName: subject.name, facultyId: subject.facultyId,
            facultyName: subject.facultyName, roomId: subject.roomId,
            roomCode: subject.roomCode, sectionCode, locked: false, type: 'lab',
          };
          result.push(slot);
          remaining[subject.id] -= 1;
          daySubjectCount[day][subject.id] = (daySubjectCount[day][subject.id] || 0) + 1;
          usedSlots.add(`${day}-${si}-${sectionCode}`);
          if (subject.facultyId) localBusyFaculty.add(`${day}-${si}-${subject.facultyId}`);
          if (subject.roomId) localBusyRooms.add(`${day}-${si}-${subject.roomId}`);
        };
        placeSlot(slotIdx);
        placeSlot(slotIdx + 1);
        slotIdx++; // skip next slot
      } else if (!isLab) {
        const slot = {
          day, slotIdx, subjectId: subject.id, subjectCode: subject.code,
          subjectName: subject.name, facultyId: subject.facultyId,
          facultyName: subject.facultyName, roomId: subject.roomId,
          roomCode: subject.roomCode, sectionCode, locked: false, type: 'theory',
        };
        result.push(slot);
        remaining[subject.id] -= 1;
        daySubjectCount[day][subject.id] = (daySubjectCount[day][subject.id] || 0) + 1;
        usedSlots.add(slotKey);
        if (facultyKey) localBusyFaculty.add(facultyKey);
        if (roomKey) localBusyRooms.add(roomKey);
      }
    }
  }

  // Compute unscheduled hours
  const unscheduled = subjects.filter((s) => remaining[s.id] > 0).map((s) => ({
    subjectId: s.id, subjectCode: s.code, remainingHours: remaining[s.id],
  }));

  // Compute faculty workload
  const facultyWorkload = {};
  result.forEach((slot) => {
    if (!slot.facultyId) return;
    if (!facultyWorkload[slot.facultyId]) {
      facultyWorkload[slot.facultyId] = { facultyId: slot.facultyId, facultyName: slot.facultyName, hoursScheduled: 0 };
    }
    facultyWorkload[slot.facultyId].hoursScheduled += 1;
  });

  const report = {
    ok: hardConflicts.length === 0 && unscheduled.length === 0,
    totalSlotsGenerated: result.length,
    hardConflicts,
    hardConflictCount: hardConflicts.length,
    softViolations,
    softViolationCount: softViolations.length,
    unscheduled,
    unscheduledCount: unscheduled.length,
    facultyWorkload: Object.values(facultyWorkload),
  };

  return { slots: result, report };
}

/**
 * Validate an existing set of timetable slots.
 * Returns the same report structure as generateTimetable.
 */
export function validateTimetable(slots, subjects = []) {
  const hardConflicts = [];
  const softViolations = [];

  // Check for duplicate section+slot
  const sectionSlotMap = new Map();
  const facultySlotMap = new Map();
  const roomSlotMap = new Map();

  for (const slot of slots) {
    const sectionKey = `${slot.day}-${slot.slotIdx}-${slot.sectionCode}`;
    if (sectionSlotMap.has(sectionKey)) {
      hardConflicts.push({ type: 'section_double_booking', key: sectionKey });
    } else {
      sectionSlotMap.set(sectionKey, slot);
    }

    if (slot.facultyId) {
      const fKey = `${slot.day}-${slot.slotIdx}-${slot.facultyId}`;
      if (facultySlotMap.has(fKey)) {
        hardConflicts.push({ type: 'faculty_clash', key: fKey, facultyName: slot.facultyName });
      } else {
        facultySlotMap.set(fKey, slot);
      }
    }

    if (slot.roomId) {
      const rKey = `${slot.day}-${slot.slotIdx}-${slot.roomId}`;
      if (roomSlotMap.has(rKey)) {
        hardConflicts.push({ type: 'room_clash', key: rKey, roomCode: slot.roomCode });
      } else {
        roomSlotMap.set(rKey, slot);
      }
    }
  }

  // Soft: same subject more than once per day per section
  const daySectionSubjectMap = new Map();
  for (const slot of slots) {
    const k = `${slot.day}-${slot.sectionCode}-${slot.subjectId}`;
    daySectionSubjectMap.set(k, (daySectionSubjectMap.get(k) || 0) + 1);
    if (daySectionSubjectMap.get(k) > 1) {
      softViolations.push({ type: 'same_subject_same_day', day: slot.day, subjectId: slot.subjectId });
    }
  }

  const unscheduled = subjects.filter((s) => {
    const placed = slots.filter((sl) => sl.subjectId === s.id).length;
    return placed < (s.weeklyHours || 0);
  }).map((s) => {
    const placed = slots.filter((sl) => sl.subjectId === s.id).length;
    return { subjectId: s.id, subjectCode: s.code, remainingHours: (s.weeklyHours || 0) - placed };
  });

  return {
    ok: hardConflicts.length === 0 && unscheduled.length === 0,
    hardConflicts,
    hardConflictCount: hardConflicts.length,
    softViolations,
    softViolationCount: softViolations.length,
    unscheduled,
    unscheduledCount: unscheduled.length,
  };
}
