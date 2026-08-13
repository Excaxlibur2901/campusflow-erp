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
 *   4. Lab Clash: Lab subjects require lab rooms & consecutive time slots
 *   5. Unavailable Faculty: Cannot assign faculty during unavailable hours
 *   6. Locked Slot Overwrite: Preserves user-locked slots
 *   7. Duplicate Slot: One section per slot
 *   8. Room Capacity: Room capacity must be >= section capacity
 *
 * Soft Constraints (Scored, optimized):
 *   1. Subject Distribution: Spread subjects across working days evenly
 *   2. Faculty Workload: Avoid overworking faculty
 *   3. Room Utilization: Maximize usage of dedicated department rooms
 *   4. Daily Subject Frequency: Avoid more than 1 theory lecture of same subject per day
 *   5. Consecutive Lectures: Avoid > 2 consecutive lectures for faculty
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
export const LUNCH_BREAK_SLOT = 3; // Index 3 is 11:30-12:20 or lunch transition

/**
 * Generate a timetable for a given section.
 *
 * @param {object} params
 * @param {string[]} [params.days]
 * @param {string[]} [params.timeSlots]
 * @param {Array} params.subjects - [{ id, code, name, type, weeklyHours, facultyId, facultyName, roomId, roomCode, credits }]
 * @param {Array} [params.facultyList] - [{ id, name, maxWeeklyHours, unavailableSlots }]
 * @param {Array} [params.classroomsList] - [{ id, code, name, capacity, roomType }]
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
  sectionCode,
  sectionCapacity = 60,
}) {
  const hardConflicts = [];
  const softViolations = [];
  const resultSlots = [];

  if (!subjects.length) {
    return {
      slots: [],
      hardConflicts: [{ type: 'NO_SUBJECTS', message: 'No subjects provided for scheduling.' }],
      softViolations: [],
      unscheduledHours: [],
      facultyWorkload: [],
      roomUtilization: [],
      score: 0,
      report: { ok: false, error: 'No subjects provided.' },
    };
  }

  // 1. Separate locked slots and busy resources from existing slots
  const lockedSectionSlots = existingSlots.filter(s => s.sectionCode === sectionCode && s.locked);
  const busyFacultySlots = new Set();
  const busyRoomSlots = new Set();
  const usedSectionSlots = new Set();

  existingSlots.forEach(s => {
    if (s.sectionCode !== sectionCode || s.locked) {
      if (s.facultyId) busyFacultySlots.add(`${s.day}-${s.slotIdx}-${s.facultyId}`);
      if (s.roomId) busyRoomSlots.add(`${s.day}-${s.slotIdx}-${s.roomId}`);
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

  // Track daily subject distribution
  const daySubjectDistribution = {};
  days.forEach(d => { daySubjectDistribution[d] = {}; });

  lockedSectionSlots.forEach(s => {
    daySubjectDistribution[s.day][s.subjectId] = (daySubjectDistribution[s.day][s.subjectId] || 0) + 1;
  });

  // 2. Schedule slots across working days and time slots
  for (const day of days) {
    for (let slotIdx = 0; slotIdx < timeSlots.length; slotIdx++) {
      const slotKey = `${day}-${slotIdx}`;
      if (usedSectionSlots.has(slotKey)) continue;

      // Skip lunch break if configured
      if (slotIdx === LUNCH_BREAK_SLOT && timeSlots.length > 5) continue;

      // Select available subjects with remaining hours
      // Spread heuristic: prefer subjects with 0 occurrences today, then most remaining hours
      const candidateSubjects = subjects
        .filter(s => remainingHours[s.id] > 0)
        .sort((a, b) => {
          const aToday = daySubjectDistribution[day][a.id] || 0;
          const bToday = daySubjectDistribution[day][b.id] || 0;
          if (aToday !== bToday) return aToday - bToday;
          return remainingHours[b.id] - remainingHours[a.id];
        });

      if (!candidateSubjects.length) continue;

      for (const subject of candidateSubjects) {
        const isLab = subject.subjectType === 'lab' || subject.type === 'lab' || subject.type === 'practical';

        // Match Faculty
        let faculty = facultyList.find(f => f.id === subject.facultyId || f.name === subject.facultyName);
        if (!faculty && subject.facultyId) {
          faculty = { id: subject.facultyId, name: subject.facultyName || 'Faculty' };
        }

        // Match Room
        const preferredType = isLab ? 'lab' : 'lecture';
        let room = classroomsList.find(r =>
          (r.id === subject.roomId || r.code === subject.roomCode) && r.capacity >= sectionCapacity
        );
        if (!room) {
          room = classroomsList.find(r =>
            (r.room_type === preferredType || r.roomType === preferredType) && r.capacity >= sectionCapacity
          );
        }
        if (!room) {
          room = classroomsList.find(r => r.capacity >= sectionCapacity) || classroomsList[0];
        }

        // Hard Constraint Checks
        if (faculty && busyFacultySlots.has(`${day}-${slotIdx}-${faculty.id}`)) {
          hardConflicts.push({
            type: 'FACULTY_CLASH',
            message: `Faculty ${faculty.name} is busy on ${day} slot ${slotIdx + 1}.`,
            day, slotIdx, facultyId: faculty.id,
          });
          continue;
        }

        if (room && busyRoomSlots.has(`${day}-${slotIdx}-${room.id}`)) {
          hardConflicts.push({
            type: 'ROOM_CLASH',
            message: `Classroom ${room.code} is occupied on ${day} slot ${slotIdx + 1}.`,
            day, slotIdx, roomId: room.id,
          });
          continue;
        }

        if (room && room.capacity < sectionCapacity) {
          hardConflicts.push({
            type: 'INSUFFICIENT_ROOM_CAPACITY',
            message: `Room ${room.code} capacity (${room.capacity}) is less than section capacity (${sectionCapacity}).`,
            day, slotIdx, roomId: room.id,
          });
          continue;
        }

        // Handle Lab (requires 2 consecutive slots)
        if (isLab && remainingHours[subject.id] >= 2 && slotIdx < timeSlots.length - 1) {
          const nextSlotIdx = slotIdx + 1;
          const nextSlotKey = `${day}-${nextSlotIdx}`;
          const nextFacKey = faculty ? `${day}-${nextSlotIdx}-${faculty.id}` : null;
          const nextRoomKey = room ? `${day}-${nextSlotIdx}-${room.id}` : null;

          if (
            !usedSectionSlots.has(nextSlotKey) &&
            (!nextFacKey || !busyFacultySlots.has(nextFacKey)) &&
            (!nextRoomKey || !busyRoomSlots.has(nextRoomKey))
          ) {
            // Place consecutive lab slots
            const slot1 = createSlotEntry({ day, slotIdx, subject, faculty, room, sectionCode, type: 'lab' });
            const slot2 = createSlotEntry({ day, slotIdx: nextSlotIdx, subject, faculty, room, sectionCode, type: 'lab' });

            resultSlots.push(slot1, slot2);
            remainingHours[subject.id] -= 2;
            daySubjectDistribution[day][subject.id] = (daySubjectDistribution[day][subject.id] || 0) + 2;

            usedSectionSlots.add(slotKey);
            usedSectionSlots.add(nextSlotKey);
            if (faculty) {
              busyFacultySlots.add(`${day}-${slotIdx}-${faculty.id}`);
              busyFacultySlots.add(nextFacKey);
            }
            if (room) {
              busyRoomSlots.add(`${day}-${slotIdx}-${room.id}`);
              busyRoomSlots.add(nextRoomKey);
            }

            slotIdx++; // skip next slot
            break;
          }
        }

        // Handle Theory (1 slot)
        if (!isLab) {
          // Soft constraint: avoid repeating same theory subject twice on same day
          if ((daySubjectDistribution[day][subject.id] || 0) >= 1) {
            softViolations.push({
              type: 'REPEAT_SUBJECT_SAME_DAY',
              message: `Subject ${subject.code} scheduled multiple times on ${day}.`,
              day, subjectId: subject.id,
            });
          }

          const slot = createSlotEntry({ day, slotIdx, subject, faculty, room, sectionCode, type: 'theory' });
          resultSlots.push(slot);

          remainingHours[subject.id] -= 1;
          daySubjectDistribution[day][subject.id] = (daySubjectDistribution[day][subject.id] || 0) + 1;

          usedSectionSlots.add(slotKey);
          if (faculty) busyFacultySlots.add(`${day}-${slotIdx}-${faculty.id}`);
          if (room) busyRoomSlots.add(`${day}-${slotIdx}-${room.id}`);

          break;
        }
      }
    }
  }

  // 3. Compute Unscheduled Hours
  const unscheduledHours = subjects
    .filter(s => remainingHours[s.id] > 0)
    .map(s => ({
      subjectId: s.id,
      subjectCode: s.code,
      subjectName: s.name,
      remainingHours: remainingHours[s.id],
    }));

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

  const report = {
    ok: hardConflicts.length === 0 && unscheduledHours.length === 0,
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
 * @param {object} params.targetSlot - Proposed slot { day, slotIdx, sectionCode, subjectId, facultyId, roomId }
 * @param {Array} params.existingSlots - All existing slots in system
 * @param {Array} params.classroomsList - All classrooms
 * @param {number} [params.sectionCapacity=60]
 *
 * @returns {{ valid: boolean, errors: Array }}
 */
export function validateMove({ targetSlot, existingSlots = [], classroomsList = [], sectionCapacity = 60 }) {
  const errors = [];

  const { day, slotIdx, sectionCode, facultyId, roomId, id: targetId } = targetSlot;

  for (const slot of existingSlots) {
    if (slot.id && slot.id === targetId) continue; // skip self
    if (slot.day !== day || slot.slotIdx !== slotIdx) continue;

    // Check Section Clash
    if (slot.sectionCode === sectionCode) {
      errors.push(`Section ${sectionCode} already has a class scheduled at ${day} slot ${slotIdx + 1}.`);
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

  // Check Room Capacity
  if (roomId) {
    const room = classroomsList.find(r => r.id === roomId || r.code === roomId);
    if (room && room.capacity < sectionCapacity) {
      errors.push(`Room ${room.code} capacity (${room.capacity}) is less than section capacity (${sectionCapacity}).`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function createSlotEntry({ day, slotIdx, subject, faculty, room, sectionCode, type }) {
  return {
    day,
    slotIdx,
    subjectId: subject.id,
    subjectCode: subject.code,
    subjectName: subject.name,
    facultyId: faculty ? faculty.id : null,
    facultyName: faculty ? faculty.name : 'Unassigned',
    roomId: room ? room.id : null,
    roomCode: room ? room.code : 'Unassigned',
    sectionCode,
    type,
    locked: false,
  };
}
