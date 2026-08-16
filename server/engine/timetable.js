/**
 * Constraint-based Timetable Engine — CampusFlow ERP
 *
 * Implements deterministic constraint-based timetable scheduling and optimization.
 * Backed by normalized PostgreSQL records (subjects, faculty, classrooms, sections).
 *
 * Hard Constraints (Must NEVER be violated):
 *   1. Faculty Clash: No faculty scheduled in 2 places at same time slot
 *   2. Room Clash: No classroom hosting 2 classes at same time slot
 *   3. Section Clash: No section scheduled for 2 subjects at same time slot
 *   4. Lab Clash: Lab subjects require lab rooms & 2 consecutive time slots
 *   5. Unavailable Faculty: Cannot assign faculty during unavailable hours
 *   6. Missing Faculty: Every subject must have an assigned faculty member
 *   7. Room Capacity: Room capacity must be >= section capacity
 *   8. Subject Weekly Hours: All required weekly hours must be scheduled
 *   9. Lunch Break: No classes scheduled during lunch break slot
 *
 * Soft Constraints (Scored, optimized):
 *   1. Subject Distribution: Spread subjects across working days evenly
 *   2. Faculty Workload: Avoid exceeding faculty max weekly hours
 *   3. Room Utilization: Maximize usage of dedicated department rooms
 *   4. Daily Subject Frequency: Avoid more than 1 theory lecture of same subject per day
 */

export const DEFAULT_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
export const DEFAULT_TIME_SLOTS = [
  '9:00-9:50',
  '9:50-10:40',
  '10:40-11:30',
  '11:30-12:20',
  '1:10-2:00',
  '2:00-2:50',
  '2:50-3:40',
  '3:40-4:30',
];
export const LUNCH_BREAK_SLOT = 3; // Index 3 (11:30-12:20) is lunch break

/**
 * Generate a timetable for a given section.
 *
 * @param {object} params
 * @param {string[]} [params.days]
 * @param {string[]} [params.timeSlots]
 * @param {Array} params.subjects - [{ id, code, name, type, weeklyHours, facultyId, facultyName, roomId, roomCode, credits }]
 * @param {Array} [params.facultyList] - [{ id, name, maxWeeklyHours, unavailableSlots }]
 * @param {Array} [params.classroomsList] - [{ id, code, name, capacity, room_type, roomType }]
 * @param {Array} [params.existingSlots] - Slots for other sections or locked slots
 * @param {string} params.sectionCode
 * @param {number} [params.sectionCapacity=60]
 *
 * @returns {{ slots: Array, hardConflicts: Array, softViolations: Array, unscheduledHours: Array, facultyWorkload: Array, roomUtilization: Array, score: number, report: object }}
 */
export function generateTimetable({
  days = DEFAULT_DAYS,
  timeSlots = DEFAULT_TIME_SLOTS,
  subjects = [],
  facultyList = [],
  classroomsList = [],
  existingSlots = [],
  sectionCode = 'A',
  sectionCapacity = 60,
}) {
  const hardConflicts = [];
  const softViolations = [];
  const resultSlots = [];

  if (!subjects || !subjects.length) {
    const report = {
      ok: false,
      error: 'No subjects provided for scheduling.',
      totalSlotsGenerated: 0,
      hardConflicts: [{ type: 'NO_SUBJECTS', message: 'No subjects provided for scheduling.' }],
      hardConflictCount: 1,
      softViolations: [],
      softViolationCount: 0,
      unscheduledHours: [],
      unscheduledCount: 0,
      facultyWorkload: [],
      roomUtilization: [],
      score: 0,
    };
    return {
      slots: [],
      hardConflicts: report.hardConflicts,
      softViolations: [],
      unscheduledHours: [],
      facultyWorkload: [],
      roomUtilization: [],
      score: 0,
      report,
    };
  }

  // 1. Separate locked slots and busy resources from existing slots
  const lockedSectionSlots = existingSlots.filter(s => s.sectionCode === sectionCode && s.locked);
  const busyFacultySlots = new Set();
  const busyRoomSlots = new Set();
  const busySubjectSlots = new Set();
  const usedSectionSlots = new Set();

  existingSlots.forEach(s => {
    if (s.sectionCode !== sectionCode || s.locked) {
      if (s.facultyId) busyFacultySlots.add(`${s.day}-${s.slotIdx}-${s.facultyId}`);
      if (s.roomId) busyRoomSlots.add(`${s.day}-${s.slotIdx}-${s.roomId}`);
      if (s.subjectId) busySubjectSlots.add(`${s.day}-${s.slotIdx}-${s.subjectId}`);
    }
  });

  lockedSectionSlots.forEach(s => {
    usedSectionSlots.add(`${s.day}-${s.slotIdx}`);
    resultSlots.push({ ...s, locked: true });
  });

  // Track remaining hours per subject
  const remainingHours = {};
  subjects.forEach(s => {
    remainingHours[s.id] = Number(s.weeklyHours || s.credits || 3);
  });

  // Deduct locked hours
  lockedSectionSlots.forEach(s => {
    if (remainingHours[s.subjectId] !== undefined) {
      remainingHours[s.subjectId] = Math.max(0, remainingHours[s.subjectId] - 1);
    }
  });

  // Build faculty unavailability set
  const facultyUnavailableSet = new Set();
  facultyList.forEach(f => {
    if (Array.isArray(f.unavailableSlots)) {
      f.unavailableSlots.forEach(slot => {
        if (typeof slot === 'string') {
          facultyUnavailableSet.add(`${slot}-${f.id}`);
        } else if (slot && slot.day !== undefined && slot.slotIdx !== undefined) {
          facultyUnavailableSet.add(`${slot.day}-${slot.slotIdx}-${f.id}`);
        }
      });
    }
  });

  // Pre-check subject constraints: faculty assignment & room availability
  subjects.forEach(s => {
    const faculties = getFacultyCandidates(s, facultyList);
    if (!faculties.length) {
      hardConflicts.push({
        type: 'MISSING_FACULTY',
        message: `Subject ${s.code} (${s.name}) has no faculty assigned.`,
        subjectId: s.id,
      });
    }

    const isLab = s.subjectType === 'lab' || s.type === 'lab' || s.type === 'practical';
    if (isLab) {
      const validLabRoom = classroomsList.find(r =>
        (r.room_type === 'lab' || r.roomType === 'lab') && r.capacity >= sectionCapacity
      );
      if (!validLabRoom) {
        hardConflicts.push({
          type: 'NO_LAB_ROOM',
          message: `Subject ${s.code} requires a lab room with capacity >= ${sectionCapacity}, but none is available.`,
          subjectId: s.id,
        });
      }
    } else {
      const validRoom = classroomsList.find(r => r.capacity >= sectionCapacity);
      if (!validRoom) {
        hardConflicts.push({
          type: 'INSUFFICIENT_ROOM_CAPACITY',
          message: `No classroom available with capacity >= ${sectionCapacity} for section ${sectionCode}.`,
          subjectId: s.id,
        });
      }
    }
  });

  // Track daily subject distribution
  const daySubjectDistribution = {};
  days.forEach(d => { daySubjectDistribution[d] = {}; });

  lockedSectionSlots.forEach(s => {
    daySubjectDistribution[s.day][s.subjectId] = (daySubjectDistribution[s.day][s.subjectId] || 0) + 1;
  });

  const facultyHoursMap = new Map();

  // 2. Schedule slots across working days and time slots
  for (const day of days) {
    for (let slotIdx = 0; slotIdx < timeSlots.length; slotIdx++) {
      const slotKey = `${day}-${slotIdx}`;
      if (usedSectionSlots.has(slotKey)) continue;

      // Skip lunch break if configured
      if (slotIdx === LUNCH_BREAK_SLOT && timeSlots.length > 5) continue;

      // Select candidate subjects with remaining hours
      const candidateSubjects = subjects
        .filter(s => remainingHours[s.id] > 0)
        .sort((a, b) => {
          const aLab = a.subjectType === 'lab' || a.type === 'lab' || a.type === 'practical';
          const bLab = b.subjectType === 'lab' || b.type === 'lab' || b.type === 'practical';
          if (aLab !== bLab) return aLab ? -1 : 1; // Labs first

          const aToday = daySubjectDistribution[day][a.id] || 0;
          const bToday = daySubjectDistribution[day][b.id] || 0;
          if (aToday !== bToday) return aToday - bToday;
          return remainingHours[b.id] - remainingHours[a.id];
        });

      if (!candidateSubjects.length) continue;

      for (const subject of candidateSubjects) {
        const isLab = subject.subjectType === 'lab' || subject.type === 'lab' || subject.type === 'practical';

        // Match Faculty
        const faculty = getFacultyCandidates(subject, facultyList).find(candidate => {
          if (
            facultyUnavailableSet.has(`${day}-${slotIdx}-${candidate.id}`) ||
            facultyUnavailableSet.has(`${day}-${timeSlots[slotIdx]}-${candidate.id}`) ||
            busyFacultySlots.has(`${day}-${slotIdx}-${candidate.id}`)
          ) return false;
          const currentHours = facultyHoursMap.get(candidate.id) || 0;
          const maxHours = Number(candidate.maxWeeklyHours || candidate.max_weekly_hours || 22);
          return currentHours + (isLab ? 2 : 1) <= maxHours;
        });
        if (!faculty) continue;
        const facCurrentHours = facultyHoursMap.get(faculty.id) || 0;

        // A subject cannot be taught to another section at the same time.
        if (busySubjectSlots.has(`${day}-${slotIdx}-${subject.id}`)) continue;

        // Find available room
        const preferredType = isLab ? 'lab' : 'lecture';
        const candidates = classroomsList.filter(r => {
          if (r.capacity < sectionCapacity) return false;
          const rType = r.room_type || r.roomType || 'lecture';
          if (isLab && rType !== 'lab') return false;
          if (busyRoomSlots.has(`${day}-${slotIdx}-${r.id}`)) return false;
          return true;
        });

        if (!candidates.length) continue;

        const availableRoom = candidates.find(r => r.id === subject.roomId || r.code === subject.roomCode)
                           || candidates.find(r => (r.room_type || r.roomType) === preferredType)
                           || candidates[0];

        // Handle Lab (requires 2 consecutive slots)
        if (isLab) {
          if (remainingHours[subject.id] < 2) continue;
          if (slotIdx >= timeSlots.length - 1) continue;
          const nextSlotIdx = slotIdx + 1;
          if (nextSlotIdx === LUNCH_BREAK_SLOT && timeSlots.length > 5) continue;

          const nextSlotKey = `${day}-${nextSlotIdx}`;
          const nextFacKey = `${day}-${nextSlotIdx}-${faculty.id}`;
          const nextRoomKey = `${day}-${nextSlotIdx}-${availableRoom.id}`;

          if (
            usedSectionSlots.has(nextSlotKey) ||
            busyFacultySlots.has(nextFacKey) ||
            busySubjectSlots.has(`${day}-${nextSlotIdx}-${subject.id}`) ||
            busyRoomSlots.has(nextRoomKey) ||
            facultyUnavailableSet.has(`${day}-${nextSlotIdx}-${faculty.id}`)
          ) {
            continue;
          }

          // Successfully place lab
          const slot1 = createSlotEntry({ day, slotIdx, subject, faculty, room: availableRoom, sectionCode, type: 'lab' });
          const slot2 = createSlotEntry({ day, slotIdx: nextSlotIdx, subject, faculty, room: availableRoom, sectionCode, type: 'lab' });

          resultSlots.push(slot1, slot2);
          remainingHours[subject.id] -= 2;
          daySubjectDistribution[day][subject.id] = (daySubjectDistribution[day][subject.id] || 0) + 2;
          facultyHoursMap.set(faculty.id, facCurrentHours + 2);

          usedSectionSlots.add(slotKey);
          usedSectionSlots.add(nextSlotKey);
          busyFacultySlots.add(`${day}-${slotIdx}-${faculty.id}`);
          busyFacultySlots.add(nextFacKey);
          busySubjectSlots.add(`${day}-${slotIdx}-${subject.id}`);
          busySubjectSlots.add(`${day}-${nextSlotIdx}-${subject.id}`);
          busyRoomSlots.add(`${day}-${slotIdx}-${availableRoom.id}`);
          busyRoomSlots.add(nextRoomKey);

          slotIdx++; // skip next slot
          break;
        }

        // Handle Theory (1 slot)
        if (!isLab) {
          if ((daySubjectDistribution[day][subject.id] || 0) >= 1) {
            softViolations.push({
              type: 'REPEAT_SUBJECT_SAME_DAY',
              message: `Subject ${subject.code} scheduled multiple times on ${day}.`,
              day, subjectId: subject.id,
            });
          }

          const slot = createSlotEntry({ day, slotIdx, subject, faculty, room: availableRoom, sectionCode, type: 'theory' });
          resultSlots.push(slot);

          remainingHours[subject.id] -= 1;
          daySubjectDistribution[day][subject.id] = (daySubjectDistribution[day][subject.id] || 0) + 1;
          facultyHoursMap.set(faculty.id, facCurrentHours + 1);

          usedSectionSlots.add(slotKey);
          busyFacultySlots.add(`${day}-${slotIdx}-${faculty.id}`);
          busyRoomSlots.add(`${day}-${slotIdx}-${availableRoom.id}`);
          busySubjectSlots.add(`${day}-${slotIdx}-${subject.id}`);

          break;
        }
      }
    }
  }

  // 3. Compute Unscheduled Hours
  const unscheduledHours = [];
  subjects.forEach(s => {
    if (remainingHours[s.id] > 0) {
      unscheduledHours.push({
        subjectId: s.id,
        subjectCode: s.code,
        subjectName: s.name,
        remainingHours: remainingHours[s.id],
      });
      hardConflicts.push({
        type: 'UNSCHEDULED_HOURS',
        message: `Could not schedule ${remainingHours[s.id]} required weekly hours for subject ${s.code} (${s.name}) due to resource or slot constraints.`,
        subjectId: s.id,
        remainingHours: remainingHours[s.id],
      });
    }
  });

  // 4. Compute Faculty Workload & Room Utilization
  const facultyWorkloadMap = new Map();
  const roomUtilizationMap = new Map();

  resultSlots.forEach(s => {
    if (s.facultyId) {
      const prev = facultyWorkloadMap.get(s.facultyId) || { facultyId: s.facultyId, facultyName: s.facultyName, hoursScheduled: 0 };
      prev.hoursScheduled += 1;
      facultyWorkloadMap.set(s.facultyId, prev);
    }
    if (s.roomId) {
      const prev = roomUtilizationMap.get(s.roomId) || { roomId: s.roomId, roomCode: s.roomCode, hoursUsed: 0 };
      prev.hoursUsed += 1;
      roomUtilizationMap.set(s.roomId, prev);
    }
  });

  // Calculate quality score
  let score = 1000;
  score -= hardConflicts.length * 500;
  score -= softViolations.length * 30;
  score -= unscheduledHours.reduce((sum, u) => sum + u.remainingHours * 50, 0);

  const isOk = hardConflicts.length === 0 && unscheduledHours.length === 0;

  const report = {
    ok: isOk,
    totalSlotsGenerated: resultSlots.length,
    hardConflicts,
    hardConflictCount: hardConflicts.length,
    softViolations,
    softViolationCount: softViolations.length,
    unscheduledHours,
    unscheduledCount: unscheduledHours.length,
    facultyWorkload: Array.from(facultyWorkloadMap.values()),
    roomUtilization: Array.from(roomUtilizationMap.values()),
    score,
  };

  return {
    slots: resultSlots,
    hardConflicts,
    softViolations,
    unscheduledHours,
    facultyWorkload: Array.from(facultyWorkloadMap.values()),
    roomUtilization: Array.from(roomUtilizationMap.values()),
    score,
    report,
  };
}

/**
 * Validate a manual slot move or edit against hard constraints.
 *
 * @param {object} params
 * @param {object} params.targetSlot - Proposed slot { day, slotIdx, sectionCode, subjectId, facultyId, roomId, subjectType }
 * @param {Array} params.existingSlots - All existing slots in system
 * @param {Array} params.classroomsList - All classrooms
 * @param {number} [params.sectionCapacity=60]
 *
 * @returns {{ valid: boolean, errors: Array }}
 */
export function validateMove({ targetSlot, existingSlots = [], classroomsList = [], sectionCapacity = 60 }) {
  const errors = [];

  if (!targetSlot) return { valid: false, errors: ['No target slot provided.'] };

  const { day, slotIdx, sectionCode, facultyId, roomId, subjectType, id: targetId } = targetSlot;

  // Check Lunch Break
  if (slotIdx === LUNCH_BREAK_SLOT) {
    errors.push(`Slot ${slotIdx + 1} is designated as lunch break and cannot be scheduled.`);
  }

  for (const slot of existingSlots) {
    if (slot.id && slot.id === targetId) continue; // skip self
    if (slot.day !== day || slot.slotIdx !== slotIdx) continue;

    // Check Section Clash
    if (slot.sectionCode === sectionCode) {
      errors.push(`Section ${sectionCode} already has a class scheduled at ${day} slot ${slotIdx + 1}.`);
    }

    // Do not allow the same subject to be taught to another class at the same
    // time. This mirrors the generator's global subject occupancy check.
    if (targetSlot.subjectId && slot.subjectId === targetSlot.subjectId) {
      errors.push(`Subject is already scheduled for Section ${slot.sectionCode} at ${day} slot ${slotIdx + 1}.`);
    }

    // Check Faculty Clash
    if (facultyId && slot.facultyId === facultyId) {
      errors.push(`Faculty is already teaching Section ${slot.sectionCode} at ${day} slot ${slotIdx + 1}.`);
    }

    // Check Room Clash
    if (roomId && slot.roomId === roomId) {
      errors.push(`Room ${slot.roomCode || 'selected'} is occupied by Section ${slot.sectionCode} at ${day} slot ${slotIdx + 1}.`);
    }
  }

  // Check Room Capacity & Room Type
  if (roomId) {
    const room = classroomsList.find(r => r.id === roomId || r.code === roomId);
    if (room) {
      if (room.capacity < sectionCapacity) {
        errors.push(`Room ${room.code} capacity (${room.capacity}) is less than section capacity (${sectionCapacity}).`);
      }
      const isLab = subjectType === 'lab' || subjectType === 'practical';
      const rType = room.room_type || room.roomType || 'lecture';
      if (isLab && rType !== 'lab') {
        errors.push(`Lab subject requires a lab room, but ${room.code} is a ${rType} room.`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function getFacultyCandidates(subject, facultyList) {
  const assignedIds = Array.isArray(subject.facultyIds) && subject.facultyIds.length
    ? subject.facultyIds
    : subject.facultyId
      ? [subject.facultyId]
      : [];

  if (assignedIds.length) {
    const candidates = facultyList.filter(f => assignedIds.includes(f.id));
    if (candidates.length) return candidates;
    if (subject.facultyId) return [{ id: subject.facultyId, name: subject.facultyName || 'Faculty' }];
    return [];
  }

  const byName = facultyList.find(f => f.name === subject.facultyName || f.full_name === subject.facultyName);
  return byName ? [byName] : [];
}

function createSlotEntry({ day, slotIdx, subject, faculty, room, sectionCode, type }) {
  return {
    day,
    slotIdx,
    subjectId: subject.id,
    subjectCode: subject.code,
    subjectName: subject.name,
    facultyId: faculty ? faculty.id : null,
    facultyName: faculty ? faculty.name || faculty.full_name : 'Unassigned',
    roomId: room ? room.id : null,
    roomCode: room ? room.code : 'Unassigned',
    sectionCode,
    type,
    locked: false,
  };
}
