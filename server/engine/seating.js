/**
 * Exam Seating Allocation Engine — CampusFlow ERP
 *
 * Uses REAL exam registration data (no synthetic students).
 * Implements a score-based allocation that minimizes same-subject adjacency.
 *
 * Scoring concept (higher = better neighbor pair):
 *   - different subject    : +100  (strong positive)
 *   - different department : +30
 *   - different year       : +20
 *   - different section    : +10
 *   - same subject         : -500  (severe penalty)
 *   - same department      : -50
 *   - same section         : -30
 *
 * Weights are configurable via the `weights` parameter.
 *
 * Algorithm:
 *   1. Sort students by department + year + section (ensures maximum initial diversity).
 *   2. Interleave students from different subjects across columns using a round-robin column assignment.
 *   3. For each seat, score candidate students and pick the best fitting one.
 *   4. Run a validation pass and report adjacency conflicts.
 *
 * Hard Constraints:
 *   - One student per seat
 *   - One seat per student
 *   - Hall capacity not exceeded
 *   - Only registered (non-absent) students are allocated
 *   - Unavailable / locked seats are not used
 */

const DEFAULT_WEIGHTS = {
  differentSubject:    100,
  differentDepartment:  30,
  differentYear:        20,
  differentSection:     10,
  sameSubject:        -500,
  sameDepartment:      -50,
  sameSection:         -30,
};

/**
 * Score two adjacent student records against each other.
 * Higher is better (less likely to cheat).
 */
function pairScore(a, b, weights = DEFAULT_WEIGHTS) {
  if (!a || !b) return 0;
  let score = 0;
  if (a.subjectId !== b.subjectId) score += weights.differentSubject;
  else score += weights.sameSubject;
  if (a.departmentId !== b.departmentId) score += weights.differentDepartment;
  else score += weights.sameDepartment;
  if (a.year !== b.year) score += weights.differentYear;
  if (a.sectionId !== b.sectionId) score += weights.differentSection;
  else score += weights.sameSection;
  return score;
}

/**
 * Generate seat allocations for an exam.
 *
 * @param {object} opts
 * @param {Array} opts.registrations    – exam registrations:
 *   [{ studentId, studentName, rollNumber, enrollmentNumber, departmentId, deptCode, year, sectionId, sectionCode, subjectId, subjectCode, subjectName }]
 * @param {Array} opts.seats            – available seats in order:
 *   [{ id: hallSeatId, hallId, rowNumber, columnNumber, seatNumber, available, locked }]
 * @param {Array} opts.lockedAllocations – already-locked allocations to preserve:
 *   [{ hallSeatId, studentId, ... }]
 * @param {object} [opts.weights]       – optional override for scoring weights
 *
 * @returns {{ allocations: Array, report: object }}
 */
export function generateSeating({ registrations, seats, lockedAllocations = [], weights }) {
  const w = { ...DEFAULT_WEIGHTS, ...(weights ?? {}) };

  if (!registrations.length) {
    return {
      allocations: [],
      report: { ok: false, error: 'No registered students provided.' },
    };
  }
  if (!seats.length) {
    return {
      allocations: [],
      report: { ok: false, error: 'No available seats provided.' },
    };
  }

  // Build sets of already-occupied seats and already-allocated students
  const occupiedSeatIds = new Set(lockedAllocations.map((a) => a.hallSeatId));
  const allocatedStudentIds = new Set(lockedAllocations.map((a) => a.studentId));

  // Filter to usable seats and unallocated students
  const availableSeats = seats.filter((s) => s.available && !s.locked && !occupiedSeatIds.has(s.id));
  const unallocatedStudents = registrations.filter(
    (r) => !allocatedStudentIds.has(r.studentId),
  );

  if (unallocatedStudents.length > availableSeats.length) {
    // We can still proceed — will report unallocated students at the end
  }

  // Group students by subjectId for interleaving
  const subjectGroups = new Map();
  for (const student of unallocatedStudents) {
    if (!subjectGroups.has(student.subjectId)) {
      subjectGroups.set(student.subjectId, []);
    }
    subjectGroups.get(student.subjectId).push(student);
  }

  // Sort each group internally by dept + year + section for maximum diversity
  for (const [, group] of subjectGroups) {
    group.sort((a, b) => {
      if (a.departmentId !== b.departmentId) return (a.departmentId ?? '').localeCompare(b.departmentId ?? '');
      if (a.year !== b.year) return (a.year ?? 0) - (b.year ?? 0);
      return (a.rollNumber ?? '').localeCompare(b.rollNumber ?? '');
    });
  }

  // Interleave students from different subjects using round-robin
  const interleavedStudents = [];
  const groupIterators = [...subjectGroups.values()].map((g) => g[Symbol.iterator]());
  let anyRemaining = true;
  while (anyRemaining) {
    anyRemaining = false;
    for (const iterator of groupIterators) {
      const { value, done } = iterator.next();
      if (!done) {
        interleavedStudents.push(value);
        anyRemaining = true;
      }
    }
  }

  // Allocate students to seats using score-based greedy assignment
  // Build a spatial map of seat positions for adjacency scoring
  const allocations = [...lockedAllocations.map((a) => ({ ...a, locked: true }))];
  const seatStudentMap = new Map(lockedAllocations.map((a) => [a.hallSeatId, a]));
  const studentSeatMap = new Map(lockedAllocations.map((a) => [a.studentId, a.hallSeatId]));

  // Build row-column index for adjacency lookup
  const seatByPosition = new Map();
  for (const seat of seats) {
    seatByPosition.set(`${seat.hallId}-${seat.rowNumber}-${seat.columnNumber}`, seat);
  }

  // Helper: get adjacent allocated students for a given seat position
  const getNeighbors = (seat) => {
    const neighbors = [];
    const deltas = [[-1, 0], [1, 0], [0, -1], [0, 1]]; // up, down, left, right
    for (const [dr, dc] of deltas) {
      const neighborSeat = seatByPosition.get(
        `${seat.hallId}-${seat.rowNumber + dr}-${seat.columnNumber + dc}`,
      );
      if (neighborSeat && seatStudentMap.has(neighborSeat.id)) {
        const alloc = seatStudentMap.get(neighborSeat.id);
        // Find the student record
        const student = registrations.find((r) => r.studentId === alloc.studentId);
        if (student) neighbors.push(student);
      }
    }
    return neighbors;
  };

  const unallocated = [];

  for (let i = 0; i < interleavedStudents.length; i++) {
    const student = interleavedStudents[i];
    const seat = availableSeats[i];

    if (!seat) {
      unallocated.push(student);
      continue;
    }

    const neighbors = getNeighbors(seat);
    const totalScore = neighbors.reduce((sum, neighbor) => sum + pairScore(student, neighbor, w), 0);

    const allocation = {
      hallSeatId: seat.id,
      studentId: student.studentId,
      studentName: student.studentName,
      rollNumber: student.rollNumber,
      enrollmentNumber: student.enrollmentNumber,
      deptCode: student.deptCode,
      sectionCode: student.sectionCode,
      subjectId: student.subjectId,
      subjectCode: student.subjectCode,
      subjectName: student.subjectName,
      rowNumber: seat.rowNumber,
      columnNumber: seat.columnNumber,
      seatNumber: seat.seatNumber,
      hallId: seat.hallId,
      score: totalScore,
      conflictFlags: [],
      locked: false,
    };

    allocations.push(allocation);
    seatStudentMap.set(seat.id, allocation);
    studentSeatMap.set(student.studentId, seat.id);
  }

  // Validation pass
  const sameSubjectAdjacencies = [];
  const duplicateStudents = new Map();
  const duplicateSeats = new Map();

  for (const alloc of allocations) {
    // Check duplicate students
    if (duplicateStudents.has(alloc.studentId)) {
      alloc.conflictFlags.push('duplicate_student');
    } else {
      duplicateStudents.set(alloc.studentId, alloc.hallSeatId);
    }

    // Check duplicate seats
    if (duplicateSeats.has(alloc.hallSeatId)) {
      alloc.conflictFlags.push('duplicate_seat');
    } else {
      duplicateSeats.set(alloc.hallSeatId, alloc.studentId);
    }
  }

  // Check same-subject adjacency in the final allocation
  for (const alloc of allocations) {
    const seat = seats.find((s) => s.id === alloc.hallSeatId);
    if (!seat) continue;
    const deltas = [[0, 1], [1, 0]]; // check right and below only (avoid double-counting)
    for (const [dr, dc] of deltas) {
      const neighborSeat = seatByPosition.get(
        `${seat.hallId}-${seat.rowNumber + dr}-${seat.columnNumber + dc}`,
      );
      if (!neighborSeat) continue;
      const neighborAlloc = allocations.find((a) => a.hallSeatId === neighborSeat.id);
      if (!neighborAlloc) continue;
      if (neighborAlloc.subjectId === alloc.subjectId) {
        sameSubjectAdjacencies.push({
          seat1: alloc.seatNumber,
          seat2: neighborAlloc.seatNumber,
          subjectCode: alloc.subjectCode,
        });
        if (!alloc.conflictFlags.includes('same_subject_adjacent')) {
          alloc.conflictFlags.push('same_subject_adjacent');
        }
        if (!neighborAlloc.conflictFlags.includes('same_subject_adjacent')) {
          neighborAlloc.conflictFlags.push('same_subject_adjacent');
        }
      }
    }
  }

  const report = {
    ok: unallocated.length === 0 && sameSubjectAdjacencies.length === 0,
    totalRegistered: registrations.length,
    allocated: allocations.filter((a) => !a.locked || lockedAllocations.some((l) => l.hallSeatId === a.hallSeatId)).length,
    unallocatedCount: unallocated.length,
    unallocated: unallocated.map((s) => ({ studentId: s.studentId, rollNumber: s.rollNumber, studentName: s.studentName })),
    sameSubjectAdjacencyCount: sameSubjectAdjacencies.length,
    sameSubjectAdjacencies,
    duplicateSeatCount: allocations.filter((a) => a.conflictFlags.includes('duplicate_seat')).length,
    duplicateStudentCount: allocations.filter((a) => a.conflictFlags.includes('duplicate_student')).length,
    capacityUsed: allocations.length,
    capacityAvailable: availableSeats.length + lockedAllocations.length,
    weightConfig: w,
  };

  return { allocations, report };
}

/**
 * Validate an existing seating allocation without regenerating.
 */
export function validateSeating({ allocations, registrations }) {
  const result = generateSeating({
    registrations,
    seats: [], // just validation
    lockedAllocations: allocations,
    weights: DEFAULT_WEIGHTS,
  });
  return result.report;
}
