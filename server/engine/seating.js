/**
 * Anti-Cheat Exam Seating Allocation Engine — CampusFlow ERP
 *
 * Implements 7-step anti-cheat allocation:
 *   1. Group registered students (by subject/dept)
 *   2. Order/interleave groups (preserving roll number order within streams)
 *   3. Generate candidate allocations across real physical seats
 *   4. Score adjacency conflicts (orthogonal + diagonal neighbors)
 *   5. Select best candidate allocation
 *   6. Perform local improvement / swap pass
 *   7. Validate final arrangement
 *
 * Hard Constraints (Never violated):
 *   - One student per seat
 *   - One seat per student
 *   - Do not exceed hall capacity
 *   - Only allocate registered non-absent students
 *   - Do not allocate to unavailable/locked seats
 */

export const DEFAULT_WEIGHTS = {
  differentSubject: 100,
  differentDept: 40,
  differentYear: 30,
  differentSection: 20,
  sameSubject: -1000,
  sameClass: -400,
  sameSection: -200,
  sameDept: -100,
};

/**
 * Score pair of adjacent students. Higher is better (more anti-cheat separation).
 */
export function scoreNeighborPair(studentA, studentB, weights = DEFAULT_WEIGHTS) {
  if (!studentA || !studentB) return 0;
  const w = { ...DEFAULT_WEIGHTS, ...weights };

  let score = 0;
  // High Priority: Avoid same subject & same class/section
  if (studentA.subjectId === studentB.subjectId) {
    score += w.sameSubject;
  } else {
    score += w.differentSubject;
  }

  const isSameClass =
    studentA.departmentId === studentB.departmentId &&
    studentA.year === studentB.year &&
    studentA.semester === studentB.semester;

  if (isSameClass) {
    score += w.sameClass;
  }

  if (studentA.sectionId && studentB.sectionId && studentA.sectionId === studentB.sectionId) {
    score += w.sameSection;
  } else {
    score += w.differentSection;
  }

  if (studentA.departmentId !== studentB.departmentId) {
    score += w.differentDept;
  } else {
    score += w.sameDept;
  }

  if (studentA.year !== studentB.year) {
    score += w.differentYear;
  }

  return score;
}

/**
 * Main Seating Allocation Generator.
 *
 * @param {object} params
 * @param {Array} params.registrations - Registered student objects from PostgreSQL
 * @param {Array} params.seats - Hall seat objects from PostgreSQL
 * @param {Array} [params.lockedAllocations] - Existing locked allocations to preserve
 * @param {object} [params.weights] - Scoring weights override
 *
 * @returns {{ allocations: Array, score: number, conflicts: Array, warnings: Array, unallocatedStudents: Array, report: object }}
 */
export function generateSeating({ registrations = [], seats = [], lockedAllocations = [], weights = {} }) {
  const w = { ...DEFAULT_WEIGHTS, ...weights };

  // Filter out absent/cancelled registrations
  const activeRegs = registrations.filter(r => r.status !== 'absent' && r.status !== 'cancelled');

  // Filter out unavailable or locked seats
  const availableSeats = seats.filter(s => s.available !== false && !s.locked);

  const lockedSeatIds = new Set(lockedAllocations.map(a => a.hallSeatId));
  const lockedStudentIds = new Set(lockedAllocations.map(a => a.studentId));

  const usableSeats = availableSeats.filter(s => !lockedSeatIds.has(s.id));
  const unallocatedRegs = activeRegs.filter(r => !lockedStudentIds.has(r.studentId));

  if (!unallocatedRegs.length && !lockedAllocations.length) {
    return {
      allocations: [],
      score: 0,
      conflicts: [],
      warnings: ['No registered active students provided for allocation.'],
      unallocatedStudents: [],
      report: { ok: false, error: 'No registered active students.' },
    };
  }

  if (!usableSeats.length && !lockedAllocations.length) {
    return {
      allocations: [],
      score: 0,
      conflicts: [{ type: 'NO_SEATS', message: 'No usable hall seats available.' }],
      warnings: ['No usable seats.'],
      unallocatedStudents: unallocatedRegs,
      report: { ok: false, error: 'No available hall seats.' },
    };
  }

  // STEP 1: Group registered students by subjectId / examSubjectId
  const subjectGroups = new Map();
  for (const student of unallocatedRegs) {
    const key = student.subjectId || student.examSubjectId || 'GLOBAL';
    if (!subjectGroups.has(key)) {
      subjectGroups.set(key, []);
    }
    subjectGroups.get(key).push(student);
  }

  // STEP 2: Order within group by Roll Number for attendance convenience, then interleave
  for (const [, group] of subjectGroups) {
    group.sort((a, b) => (a.rollNumber || '').localeCompare(b.rollNumber || '', undefined, { numeric: true }));
  }

  // Interleave groups in round-robin order
  const interleavedStudents = [];
  const iterators = [...subjectGroups.values()].map(g => g[Symbol.iterator]());
  let active = true;
  while (active) {
    active = false;
    for (const it of iterators) {
      const { value, done } = it.next();
      if (!done) {
        interleavedStudents.push(value);
        active = true;
      }
    }
  }

  // STEP 3: Generate candidate layout strategies
  // Sort seats primarily by hallId, then row, then column
  const sortedSeats = [...usableSeats].sort((a, b) => {
    if (a.hallId !== b.hallId) return (a.hallId || '').localeCompare(b.hallId || '');
    if (a.rowNumber !== b.rowNumber) return a.rowNumber - b.rowNumber;
    return a.columnNumber - b.columnNumber;
  });

  // Candidate 1: Sequential Row-major allocation
  const candidateAllocations = [];
  const seatMap = new Map(lockedAllocations.map(a => [a.hallSeatId, a]));
  const studentMap = new Map(lockedAllocations.map(a => [a.studentId, a]));

  const unallocatedStudents = [];

  for (let i = 0; i < interleavedStudents.length; i++) {
    const student = interleavedStudents[i];
    const seat = sortedSeats[i];

    if (!seat) {
      unallocatedStudents.push(student);
      continue;
    }

    const alloc = {
      hallSeatId: seat.id,
      studentId: student.studentId,
      studentName: student.studentName,
      rollNumber: student.rollNumber,
      enrollmentNumber: student.enrollmentNumber || '',
      departmentId: student.departmentId,
      deptCode: student.deptCode || 'GEN',
      year: student.year || 1,
      semester: student.semester || 1,
      sectionId: student.sectionId,
      sectionCode: student.sectionCode || 'A',
      subjectId: student.subjectId,
      subjectCode: student.subjectCode || 'SUBJ',
      subjectName: student.subjectName || '',
      examSubjectId: student.examSubjectId,
      rowNumber: seat.rowNumber,
      columnNumber: seat.columnNumber,
      seatNumber: seat.seatNumber,
      hallId: seat.hallId,
      locked: false,
      conflictFlags: [],
    };

    candidateAllocations.push(alloc);
    seatMap.set(seat.id, alloc);
    studentMap.set(student.studentId, alloc);
  }

  // Combine with locked allocations
  const allAllocations = [...lockedAllocations.map(l => ({ ...l, locked: true })), ...candidateAllocations];

  // STEP 4 & 5: Score adjacency conflicts & build spatial lookup
  const positionMap = new Map();
  for (const seat of seats) {
    positionMap.set(`${seat.hallId}-${seat.rowNumber}-${seat.columnNumber}`, seat);
  }
  const allocSeatMap = new Map(allAllocations.map(a => [a.hallSeatId, a]));

  // Helper to get neighbors (up, down, left, right, diagonals)
  const getNeighborAllocations = (alloc) => {
    const seat = seats.find(s => s.id === alloc.hallSeatId);
    if (!seat) return [];

    const neighbors = [];
    const deltas = [
      [-1, 0], [1, 0], [0, -1], [0, 1], // Orthogonal
      [-1, -1], [-1, 1], [1, -1], [1, 1] // Diagonal
    ];

    for (const [dr, dc] of deltas) {
      const neighborSeat = positionMap.get(`${seat.hallId}-${seat.rowNumber + dr}-${seat.columnNumber + dc}`);
      if (neighborSeat && allocSeatMap.has(neighborSeat.id)) {
        neighbors.push({ alloc: allocSeatMap.get(neighborSeat.id), dr, dc });
      }
    }
    return neighbors;
  };

  // STEP 6: Improvement / Swap pass to eliminate adjacencies
  let maxSwapPasses = 300;
  let swapsMade = 0;
  for (let pass = 0; pass < maxSwapPasses; pass++) {
    let swapped = false;
    for (let i = 0; i < candidateAllocations.length; i++) {
      for (let j = i + 1; j < candidateAllocations.length; j++) {
        const allocA = candidateAllocations[i];
        const allocB = candidateAllocations[j];

        if (allocA.locked || allocB.locked) continue;
        if (allocA.subjectId === allocB.subjectId && allocA.departmentId === allocB.departmentId) continue;

        // Current score contribution of A and B
        const neighborsA = getNeighborAllocations(allocA);
        const neighborsB = getNeighborAllocations(allocB);

        const currentScoreA = neighborsA.reduce((sum, n) => sum + scoreNeighborPair(allocA, n.alloc, w), 0);
        const currentScoreB = neighborsB.reduce((sum, n) => sum + scoreNeighborPair(allocB, n.alloc, w), 0);
        const totalBefore = currentScoreA + currentScoreB;

        // Score if swapped
        const swappedScoreA = neighborsA.reduce((sum, n) => sum + scoreNeighborPair(allocB, n.alloc, w), 0);
        const swappedScoreB = neighborsB.reduce((sum, n) => sum + scoreNeighborPair(allocA, n.alloc, w), 0);
        const totalAfter = swappedScoreA + swappedScoreB;

        if (totalAfter > totalBefore) {
          // Perform swap in student mapping
          const tempStudentId = allocA.studentId;
          const tempName = allocA.studentName;
          const tempRoll = allocA.rollNumber;
          const tempEnr = allocA.enrollmentNumber;
          const tempDeptId = allocA.departmentId;
          const tempDeptCode = allocA.deptCode;
          const tempYear = allocA.year;
          const tempSem = allocA.semester;
          const tempSecId = allocA.sectionId;
          const tempSecCode = allocA.sectionCode;
          const tempSubjId = allocA.subjectId;
          const tempSubjCode = allocA.subjectCode;
          const tempSubjName = allocA.subjectName;

          allocA.studentId = allocB.studentId;
          allocA.studentName = allocB.studentName;
          allocA.rollNumber = allocB.rollNumber;
          allocA.enrollmentNumber = allocB.enrollmentNumber;
          allocA.departmentId = allocB.departmentId;
          allocA.deptCode = allocB.deptCode;
          allocA.year = allocB.year;
          allocA.semester = allocB.semester;
          allocA.sectionId = allocB.sectionId;
          allocA.sectionCode = allocB.sectionCode;
          allocA.subjectId = allocB.subjectId;
          allocA.subjectCode = allocB.subjectCode;
          allocA.subjectName = allocB.subjectName;

          allocB.studentId = tempStudentId;
          allocB.studentName = tempName;
          allocB.rollNumber = tempRoll;
          allocB.enrollmentNumber = tempEnr;
          allocB.departmentId = tempDeptId;
          allocB.deptCode = tempDeptCode;
          allocB.year = tempYear;
          allocB.semester = tempSem;
          allocB.sectionId = tempSecId;
          allocB.sectionCode = tempSecCode;
          allocB.subjectId = tempSubjId;
          allocB.subjectCode = tempSubjCode;
          allocB.subjectName = tempSubjName;

          swapped = true;
          swapsMade++;
          break;
        }
      }
      if (swapped) break;
    }
    if (!swapped) break;
  }

  // STEP 7: Validate final arrangement
  const validation = validateSeating({
    allocations: allAllocations,
    seats,
    registrations: activeRegs,
    weights: w,
  });

  return {
    allocations: allAllocations,
    score: validation.score,
    conflicts: validation.conflicts,
    warnings: validation.warnings,
    unallocatedStudents,
    report: {
      ...validation,
      swapsPerformed: swapsMade,
    },
  };
}

/**
 * Standalone Seating Validator.
 * MUST validate an existing allocation against actual hall seats.
 * Does NOT call generator with empty seats!
 *
 * @param {object} params
 * @param {Array} params.allocations - Allocations to validate
 * @param {Array} params.seats - Actual hall seats
 * @param {Array} params.registrations - Registered students
 * @param {object} [params.weights] - Weights override
 */
export function validateSeating({ allocations = [], seats = [], registrations = [], weights = {} }) {
  const w = { ...DEFAULT_WEIGHTS, ...weights };
  const conflicts = [];
  const warnings = [];

  const seenStudents = new Map();
  const seenSeats = new Map();
  const seatByPos = new Map();

  for (const seat of seats) {
    seatByPos.set(`${seat.hallId}-${seat.rowNumber}-${seat.columnNumber}`, seat);
  }

  let totalScore = 0;
  let sameSubjectCount = 0;
  let sameClassCount = 0;

  // 1. Check duplicate students, duplicate seats, and unavailable seat usage
  for (const alloc of allocations) {
    if (seenStudents.has(alloc.studentId)) {
      conflicts.push({
        type: 'DUPLICATE_STUDENT',
        message: `Student ${alloc.studentName} (${alloc.rollNumber}) allocated to multiple seats.`,
        studentId: alloc.studentId,
        seatNumber: alloc.seatNumber,
      });
      if (!alloc.conflictFlags?.includes('duplicate_student')) {
        alloc.conflictFlags = alloc.conflictFlags || [];
        alloc.conflictFlags.push('duplicate_student');
      }
    } else {
      seenStudents.set(alloc.studentId, alloc);
    }

    if (seenSeats.has(alloc.hallSeatId)) {
      conflicts.push({
        type: 'DUPLICATE_SEAT',
        message: `Seat ${alloc.seatNumber} occupied by multiple students.`,
        hallSeatId: alloc.hallSeatId,
      });
      if (!alloc.conflictFlags?.includes('duplicate_seat')) {
        alloc.conflictFlags = alloc.conflictFlags || [];
        alloc.conflictFlags.push('duplicate_seat');
      }
    } else {
      seenSeats.set(alloc.hallSeatId, alloc);
    }

    const actualSeat = seats.find(s => s.id === alloc.hallSeatId);
    if (actualSeat && actualSeat.available === false) {
      conflicts.push({
        type: 'UNAVAILABLE_SEAT',
        message: `Student allocated to unavailable seat ${alloc.seatNumber}.`,
        hallSeatId: alloc.hallSeatId,
      });
    }
  }

  // 2. Check Adjacencies (Orthogonal + Diagonal)
  const allocSeatMap = new Map(allocations.map(a => [a.hallSeatId, a]));

  for (const alloc of allocations) {
    const seat = seats.find(s => s.id === alloc.hallSeatId);
    if (!seat) continue;

    // Check right, down, diagonal right-down, diagonal left-down (avoid double counting)
    const deltas = [[0, 1], [1, 0], [1, 1], [1, -1]];
    for (const [dr, dc] of deltas) {
      const neighborSeat = seatByPos.get(`${seat.hallId}-${seat.rowNumber + dr}-${seat.columnNumber + dc}`);
      if (!neighborSeat) continue;

      const neighborAlloc = allocSeatMap.get(neighborSeat.id);
      if (!neighborAlloc) continue;

      const pairScore = scoreNeighborPair(alloc, neighborAlloc, w);
      totalScore += pairScore;

      // Check Same Subject
      if (alloc.subjectId && neighborAlloc.subjectId && alloc.subjectId === neighborAlloc.subjectId) {
        sameSubjectCount++;
        conflicts.push({
          type: 'SAME_SUBJECT_ADJACENT',
          message: `Same subject (${alloc.subjectCode}) adjacent at ${alloc.seatNumber} and ${neighborAlloc.seatNumber}.`,
          seat1: alloc.seatNumber,
          seat2: neighborAlloc.seatNumber,
          subjectCode: alloc.subjectCode,
        });
        if (!alloc.conflictFlags?.includes('same_subject_adjacent')) {
          alloc.conflictFlags = alloc.conflictFlags || [];
          alloc.conflictFlags.push('same_subject_adjacent');
        }
        if (!neighborAlloc.conflictFlags?.includes('same_subject_adjacent')) {
          neighborAlloc.conflictFlags = neighborAlloc.conflictFlags || [];
          neighborAlloc.conflictFlags.push('same_subject_adjacent');
        }
      }

      // Check Same Class
      const sameClass = alloc.departmentId === neighborAlloc.departmentId &&
                        alloc.year === neighborAlloc.year &&
                        alloc.semester === neighborAlloc.semester;
      if (sameClass) {
        sameClassCount++;
        if (!alloc.subjectId || alloc.subjectId !== neighborAlloc.subjectId) {
          warnings.push({
            type: 'SAME_CLASS_ADJACENT',
            message: `Same class adjacent at ${alloc.seatNumber} and ${neighborAlloc.seatNumber}.`,
          });
        }
      }
    }
  }

  // 3. Check unallocated students
  const activeRegs = registrations.filter(r => r.status !== 'absent' && r.status !== 'cancelled');
  const allocatedIds = new Set(allocations.map(a => a.studentId));
  const unallocatedStudents = activeRegs.filter(r => !allocatedIds.has(r.studentId));

  if (unallocatedStudents.length > 0) {
    warnings.push({
      type: 'UNALLOCATED_STUDENTS',
      message: `${unallocatedStudents.length} registered students could not be seated due to capacity limits.`,
      count: unallocatedStudents.length,
    });
  }

  return {
    ok: conflicts.length === 0,
    score: totalScore,
    conflicts,
    warnings,
    unallocatedStudents,
    totalRegistered: activeRegs.length,
    allocatedCount: allocations.length,
    sameSubjectAdjacencyCount: sameSubjectCount,
    sameClassAdjacencyCount: sameClassCount,
    duplicateStudentCount: conflicts.filter(c => c.type === 'DUPLICATE_STUDENT').length,
    duplicateSeatCount: conflicts.filter(c => c.type === 'DUPLICATE_SEAT').length,
    capacityUsed: allocations.length,
    capacityAvailable: seats.length,
  };
}
