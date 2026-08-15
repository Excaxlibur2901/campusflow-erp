/**
 * Anti-Cheat Exam Seating Allocation Engine — CampusFlow ERP
 *
 * Implements anti-cheat allocation with explicit bench-level constraint enforcement:
 *   1. Group registered students (by subject/dept/year)
 *   2. Order/interleave groups
 *   3. Generate candidate allocations with EXPLICIT BENCH MIXING CONSTRAINTS:
 *        - Two students sharing a bench MUST have different subjects
 *        - Two students sharing a bench MUST have different academic years
 *        - Two students sharing a bench MUST have different classes/sections
 *   4. Spatial & adjacency scoring
 *   5. Swap optimization pass (preserving bench constraints)
 *   6. Explicit validation & conflict reporting for impossible seating
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
 * Check if two students are allowed to share the same bench.
 */
export function canShareBench(studentA, studentB) {
  if (!studentA || !studentB) return true;

  // Constraint 1: Different Subject
  const sameSubject =
    (studentA.subjectId && studentB.subjectId && studentA.subjectId === studentB.subjectId) ||
    (studentA.examSubjectId && studentB.examSubjectId && studentA.examSubjectId === studentB.examSubjectId) ||
    (studentA.subjectCode && studentB.subjectCode && studentA.subjectCode === studentB.subjectCode);
  if (sameSubject) return false;

  // Constraint 2: Different Year
  if (studentA.year && studentB.year && Number(studentA.year) === Number(studentB.year)) {
    return false;
  }

  // Constraint 3: Different Class / Section
  const sameSection =
    (studentA.sectionId && studentB.sectionId && studentA.sectionId === studentB.sectionId) ||
    (studentA.departmentId === studentB.departmentId &&
      studentA.year === studentB.year &&
      studentA.sectionCode === studentB.sectionCode);
  if (sameSection) return false;

  return true;
}

/**
 * Score pair of adjacent students. Higher is better.
 */
export function scoreNeighborPair(studentA, studentB, weights = DEFAULT_WEIGHTS) {
  if (!studentA || !studentB) return 0;
  const w = { ...DEFAULT_WEIGHTS, ...weights };

  let score = 0;
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

  // Normalize bench number for seats
  const normalizedSeats = usableSeats.map(s => ({
    ...s,
    benchNumber: s.benchNumber || s.bench_number || Math.ceil((s.columnNumber || 1) / (s.seatsPerBench || 2)),
  }));

  // Group seats into benches
  const benchesMap = new Map();
  normalizedSeats.forEach(seat => {
    const key = `${seat.hallId || 'H1'}-${seat.benchNumber}`;
    if (!benchesMap.has(key)) benchesMap.set(key, []);
    benchesMap.get(key).push(seat);
  });

  // Sort benches by hallId, then benchNumber
  const sortedBenches = [...benchesMap.entries()].sort(([aKey], [bKey]) => aKey.localeCompare(bKey));

  // Group students by subject
  const subjectGroups = new Map();
  for (const student of unallocatedRegs) {
    const key = student.subjectId || student.examSubjectId || student.subjectCode || 'GLOBAL';
    if (!subjectGroups.has(key)) subjectGroups.set(key, []);
    subjectGroups.get(key).push(student);
  }

  // Sort within groups by Roll Number
  for (const [, group] of subjectGroups) {
    group.sort((a, b) => (a.rollNumber || '').localeCompare(b.rollNumber || '', undefined, { numeric: true }));
  }

  // Interleave students across subject groups
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

  // Bench-aware placement
  const candidateAllocations = [];
  const unallocatedStudents = [];
  const remainingStudents = [...interleavedStudents];

  for (const [, benchSeats] of sortedBenches) {
    const benchAllocatedStudents = [];

    for (const seat of benchSeats) {
      if (!remainingStudents.length) break;

      // Find first remaining student compatible with current bench occupants
      const matchIdx = remainingStudents.findIndex(candidate =>
        benchAllocatedStudents.every(occ => canShareBench(candidate, occ))
      );

      if (matchIdx !== -1) {
        const student = remainingStudents.splice(matchIdx, 1)[0];
        benchAllocatedStudents.push(student);

        const alloc = {
          hallSeatId: seat.id,
          studentId: student.studentId,
          studentName: student.studentName,
          rollNumber: student.rollNumber,
          enrollmentNumber: student.enrollmentNumber || '',
          departmentId: student.departmentId,
          deptCode: student.deptCode || 'GEN',
          year: Number(student.year || 1),
          semester: Number(student.semester || 1),
          sectionId: student.sectionId,
          sectionCode: student.sectionCode || 'A',
          subjectId: student.subjectId,
          subjectCode: student.subjectCode || 'SUBJ',
          subjectName: student.subjectName || '',
          examSubjectId: student.examSubjectId,
          rowNumber: seat.rowNumber,
          columnNumber: seat.columnNumber,
          benchNumber: seat.benchNumber,
          seatNumber: seat.seatNumber,
          hallId: seat.hallId,
          locked: false,
          conflictFlags: [],
        };
        candidateAllocations.push(alloc);
      }
    }
  }

  // Remaining students could not be seated due to capacity or bench mixing constraints
  unallocatedStudents.push(...remainingStudents);

  const allAllocations = [...lockedAllocations.map(l => ({ ...l, locked: true })), ...candidateAllocations];

  // Spatial neighbor lookup for swap optimization
  const positionMap = new Map();
  for (const seat of normalizedSeats) {
    positionMap.set(`${seat.hallId}-${seat.rowNumber}-${seat.columnNumber}`, seat);
  }
  const allocSeatMap = new Map(allAllocations.map(a => [a.hallSeatId, a]));

  const getNeighborAllocations = (alloc) => {
    const seat = normalizedSeats.find(s => s.id === alloc.hallSeatId);
    if (!seat) return [];
    const neighbors = [];
    const deltas = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];
    for (const [dr, dc] of deltas) {
      const neighborSeat = positionMap.get(`${seat.hallId}-${seat.rowNumber + dr}-${seat.columnNumber + dc}`);
      if (neighborSeat && allocSeatMap.has(neighborSeat.id)) {
        neighbors.push({ alloc: allocSeatMap.get(neighborSeat.id) });
      }
    }
    return neighbors;
  };

  // Swap optimization (enforcing bench constraints on swap)
  let swapsMade = 0;
  for (let pass = 0; pass < 200; pass++) {
    let swapped = false;
    for (let i = 0; i < candidateAllocations.length; i++) {
      for (let j = i + 1; j < candidateAllocations.length; j++) {
        const allocA = candidateAllocations[i];
        const allocB = candidateAllocations[j];

        if (allocA.locked || allocB.locked) continue;
        if (allocA.benchNumber === allocB.benchNumber && allocA.hallId === allocB.hallId) continue;

        // Check if swapping violates bench constraints on A's bench or B's bench
        const benchAOthers = candidateAllocations.filter(a => a.hallId === allocA.hallId && a.benchNumber === allocA.benchNumber && a.hallSeatId !== allocA.hallSeatId);
        const benchBOthers = candidateAllocations.filter(a => a.hallId === allocB.hallId && a.benchNumber === allocB.benchNumber && a.hallSeatId !== allocB.hallSeatId);

        if (!benchAOthers.every(occ => canShareBench(allocB, occ))) continue;
        if (!benchBOthers.every(occ => canShareBench(allocA, occ))) continue;

        const neighborsA = getNeighborAllocations(allocA);
        const neighborsB = getNeighborAllocations(allocB);

        const currentScore = neighborsA.reduce((sum, n) => sum + scoreNeighborPair(allocA, n.alloc, w), 0) +
                             neighborsB.reduce((sum, n) => sum + scoreNeighborPair(allocB, n.alloc, w), 0);

        const swappedScore = neighborsA.reduce((sum, n) => sum + scoreNeighborPair(allocB, n.alloc, w), 0) +
                             neighborsB.reduce((sum, n) => sum + scoreNeighborPair(allocA, n.alloc, w), 0);

        if (swappedScore > currentScore) {
          // Perform swap
          const tempKeys = ['studentId', 'studentName', 'rollNumber', 'enrollmentNumber', 'departmentId', 'deptCode', 'year', 'semester', 'sectionId', 'sectionCode', 'subjectId', 'subjectCode', 'subjectName', 'examSubjectId'];
          const tempA = {};
          tempKeys.forEach(k => { tempA[k] = allocA[k]; });
          tempKeys.forEach(k => { allocA[k] = allocB[k]; });
          tempKeys.forEach(k => { allocB[k] = tempA[k]; });

          swapped = true;
          swapsMade++;
          break;
        }
      }
      if (swapped) break;
    }
    if (!swapped) break;
  }

  // Validate final arrangement
  const validation = validateSeating({
    allocations: allAllocations,
    seats: normalizedSeats,
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
 * Standalone Seating Validator with Explicit Bench Rule Detection.
 */
export function validateSeating({ allocations = [], seats = [], registrations = [], weights = {} }) {
  const w = { ...DEFAULT_WEIGHTS, ...weights };
  const conflicts = [];
  const warnings = [];

  const seenStudents = new Map();
  const seenSeats = new Map();
  const seatByPos = new Map();

  const normalizedSeats = seats.map(s => ({
    ...s,
    benchNumber: s.benchNumber || s.bench_number || Math.ceil((s.columnNumber || 1) / (s.seatsPerBench || 2)),
  }));

  for (const seat of normalizedSeats) {
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
      alloc.conflictFlags = alloc.conflictFlags || [];
      if (!alloc.conflictFlags.includes('duplicate_student')) alloc.conflictFlags.push('duplicate_student');
    } else {
      seenStudents.set(alloc.studentId, alloc);
    }

    if (seenSeats.has(alloc.hallSeatId)) {
      conflicts.push({
        type: 'DUPLICATE_SEAT',
        message: `Seat ${alloc.seatNumber} occupied by multiple students.`,
        hallSeatId: alloc.hallSeatId,
      });
      alloc.conflictFlags = alloc.conflictFlags || [];
      if (!alloc.conflictFlags.includes('duplicate_seat')) alloc.conflictFlags.push('duplicate_seat');
    } else {
      seenSeats.set(alloc.hallSeatId, alloc);
    }

    const actualSeat = normalizedSeats.find(s => s.id === alloc.hallSeatId);
    if (actualSeat && actualSeat.available === false) {
      conflicts.push({
        type: 'UNAVAILABLE_SEAT',
        message: `Student allocated to unavailable seat ${alloc.seatNumber}.`,
        hallSeatId: alloc.hallSeatId,
      });
    }
  }

  // 2. EXPLICIT BENCH-LEVEL CONSTRAINT VALIDATION
  const benchAllocMap = new Map();
  for (const alloc of allocations) {
    const seat = normalizedSeats.find(s => s.id === alloc.hallSeatId);
    const benchNum = alloc.benchNumber || seat?.benchNumber || seat?.bench_number;
    const hallId = alloc.hallId || seat?.hallId || 'H1';
    const key = `${hallId}-${benchNum}`;
    if (!benchAllocMap.has(key)) benchAllocMap.set(key, []);
    benchAllocMap.get(key).push({ alloc, seat });
  }

  for (const [benchKey, occupants] of benchAllocMap.entries()) {
    if (occupants.length > 1) {
      for (let i = 0; i < occupants.length; i++) {
        for (let j = i + 1; j < occupants.length; j++) {
          const a = occupants[i].alloc;
          const b = occupants[j].alloc;

          // Check Bench Rule 1: Different Subject
          const sameSubj = (a.subjectId && b.subjectId && a.subjectId === b.subjectId) ||
                           (a.examSubjectId && b.examSubjectId && a.examSubjectId === b.examSubjectId) ||
                           (a.subjectCode && b.subjectCode && a.subjectCode === b.subjectCode);
          if (sameSubj) {
            conflicts.push({
              type: 'SAME_BENCH_SAME_SUBJECT',
              message: `Bench ${a.benchNumber || benchKey} (Seats ${a.seatNumber}, ${b.seatNumber}): Both students take the same subject (${a.subjectCode}).`,
              seat1: a.seatNumber,
              seat2: b.seatNumber,
              benchKey,
              subjectCode: a.subjectCode,
            });
            a.conflictFlags = a.conflictFlags || [];
            b.conflictFlags = b.conflictFlags || [];
            if (!a.conflictFlags.includes('same_bench_same_subject')) a.conflictFlags.push('same_bench_same_subject');
            if (!b.conflictFlags.includes('same_bench_same_subject')) b.conflictFlags.push('same_bench_same_subject');
          }

          // Check Bench Rule 2: Different Year
          if (a.year && b.year && Number(a.year) === Number(b.year)) {
            conflicts.push({
              type: 'SAME_BENCH_SAME_YEAR',
              message: `Bench ${a.benchNumber || benchKey} (Seats ${a.seatNumber}, ${b.seatNumber}): Both students are in Year ${a.year}.`,
              seat1: a.seatNumber,
              seat2: b.seatNumber,
              benchKey,
              year: a.year,
            });
            a.conflictFlags = a.conflictFlags || [];
            b.conflictFlags = b.conflictFlags || [];
            if (!a.conflictFlags.includes('same_bench_same_year')) a.conflictFlags.push('same_bench_same_year');
            if (!b.conflictFlags.includes('same_bench_same_year')) b.conflictFlags.push('same_bench_same_year');
          }

          // Check Bench Rule 3: Different Class / Section
          const sameSec = (a.sectionId && b.sectionId && a.sectionId === b.sectionId) ||
                          (a.departmentId === b.departmentId && a.year === b.year && a.sectionCode === b.sectionCode);
          if (sameSec) {
            conflicts.push({
              type: 'SAME_BENCH_SAME_SECTION',
              message: `Bench ${a.benchNumber || benchKey} (Seats ${a.seatNumber}, ${b.seatNumber}): Both students belong to the same section/class (${a.sectionCode || a.deptCode}).`,
              seat1: a.seatNumber,
              seat2: b.seatNumber,
              benchKey,
              sectionCode: a.sectionCode,
            });
            a.conflictFlags = a.conflictFlags || [];
            b.conflictFlags = b.conflictFlags || [];
            if (!a.conflictFlags.includes('same_bench_same_section')) a.conflictFlags.push('same_bench_same_section');
            if (!b.conflictFlags.includes('same_bench_same_section')) b.conflictFlags.push('same_bench_same_section');
          }
        }
      }
    }
  }

  // 3. Check General Adjacencies (Orthogonal + Diagonal)
  const allocSeatMap = new Map(allocations.map(a => [a.hallSeatId, a]));

  for (const alloc of allocations) {
    const seat = normalizedSeats.find(s => s.id === alloc.hallSeatId);
    if (!seat) continue;

    const deltas = [[0, 1], [1, 0], [1, 1], [1, -1]];
    for (const [dr, dc] of deltas) {
      const neighborSeat = seatByPos.get(`${seat.hallId}-${seat.rowNumber + dr}-${seat.columnNumber + dc}`);
      if (!neighborSeat) continue;

      const neighborAlloc = allocSeatMap.get(neighborSeat.id);
      if (!neighborAlloc) continue;

      const pairScore = scoreNeighborPair(alloc, neighborAlloc, w);
      totalScore += pairScore;

      if (alloc.subjectId && neighborAlloc.subjectId && alloc.subjectId === neighborAlloc.subjectId) {
        sameSubjectCount++;
      }

      const sameClass = alloc.departmentId === neighborAlloc.departmentId &&
                        alloc.year === neighborAlloc.year &&
                        alloc.semester === neighborAlloc.semester;
      if (sameClass) {
        sameClassCount++;
      }
    }
  }

  // 4. Check unallocated students & capacity limits
  const activeRegs = registrations.filter(r => r.status !== 'absent' && r.status !== 'cancelled');
  const allocatedIds = new Set(allocations.map(a => a.studentId));
  const unallocatedStudents = activeRegs.filter(r => !allocatedIds.has(r.studentId));

  if (unallocatedStudents.length > 0) {
    conflicts.push({
      type: 'UNALLOCATED_STUDENTS',
      message: `${unallocatedStudents.length} student(s) could not be seated due to hall capacity or bench mixing constraints.`,
      count: unallocatedStudents.length,
    });
  }

  const isOk = conflicts.length === 0;

  return {
    ok: isOk,
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
    capacityAvailable: normalizedSeats.length,
  };
}
