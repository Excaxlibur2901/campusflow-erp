/**
 * Automated Seating Engine Verification Suite — CampusFlow ERP
 *
 * Tests the 7-step Anti-Cheat Seating Engine against:
 *   - Multiple subjects (at least 2)
 *   - Multiple departments (at least 2)
 *   - Multiple academic years (at least 2)
 *   - Multiple exam halls
 *   - Uneven student counts
 *   - Absent student handling
 *   - Hard constraint enforcement (no duplicate seats, no duplicate students, capacity limits)
 *   - Standalone validateSeating() verification
 */

import assert from 'node:assert';
import { generateSeating, validateSeating, scoreNeighborPair } from './engine/seating.js';

console.log('─── Running Examination & Seating Engine Test Suite ───');

// 1. Setup Mock Registered Students across 2 Subjects, 2 Depts, 2 Years with Uneven Counts
const mockRegistrations = [];

// Dept 1 (CSE), Year 1, Subject 1 (CS101): 15 Students
for (let i = 1; i <= 15; i++) {
  mockRegistrations.push({
    studentId: `stu-cse-y1-${i}`,
    studentName: `CSE Student ${i}`,
    rollNumber: `2024CSE${String(i).padStart(3, '0')}`,
    departmentId: 'dept-cse',
    deptCode: 'CSE',
    year: 1,
    semester: 1,
    sectionId: 'sec-a',
    sectionCode: 'A',
    subjectId: 'subj-cs101',
    subjectCode: 'CS101',
    subjectName: 'Computer Programming',
    status: 'registered',
  });
}

// Dept 2 (ECE), Year 2, Subject 2 (EC201): 18 Students (Uneven count!)
for (let i = 1; i <= 18; i++) {
  mockRegistrations.push({
    studentId: `stu-ece-y2-${i}`,
    studentName: `ECE Student ${i}`,
    rollNumber: `2023ECE${String(i).padStart(3, '0')}`,
    departmentId: 'dept-ece',
    deptCode: 'ECE',
    year: 2,
    semester: 3,
    sectionId: 'sec-b',
    sectionCode: 'B',
    subjectId: 'subj-ec201',
    subjectCode: 'EC201',
    subjectName: 'Signals & Systems',
    status: 'registered',
  });
}

// 2. Setup Multiple Exam Halls (Hall 1: 4x5 = 20 seats, Hall 2: 4x5 = 20 seats)
const mockSeats = [];

// Hall 1
for (let r = 1; r <= 4; r++) {
  for (let c = 1; c <= 5; c++) {
    mockSeats.push({
      id: `seat-h1-r${r}c${c}`,
      hallId: 'hall-1',
      rowNumber: r,
      columnNumber: c,
      seatNumber: `H1-R${r}C${c}`,
      available: true,
      locked: false,
    });
  }
}

// Hall 2
for (let r = 1; r <= 4; r++) {
  for (let c = 1; c <= 5; c++) {
    mockSeats.push({
      id: `seat-h2-r${r}c${c}`,
      hallId: 'hall-2',
      rowNumber: r,
      columnNumber: c,
      seatNumber: `H2-R${r}C${c}`,
      available: true,
      locked: false,
    });
  }
}

// Mark 1 seat unavailable to test unavailable constraint
mockSeats[0].available = false;

console.log(`[setup] Total Registered Students: ${mockRegistrations.length}`);
console.log(`[setup] Total Usable Seats across 2 Halls: ${mockSeats.filter(s => s.available).length}`);

// TEST 1: Run Anti-Cheat Seating Generation
const result = generateSeating({
  registrations: mockRegistrations,
  seats: mockSeats,
});

assert.strictEqual(result.allocations.length, 33, 'All 33 registered students must be allocated.');
assert.strictEqual(result.unallocatedStudents.length, 0, 'Zero unallocated students expected.');

// Verify hard constraint: Unavailable seat was NOT allocated
const allocatedUnavailable = result.allocations.some(a => a.hallSeatId === mockSeats[0].id);
assert.strictEqual(allocatedUnavailable, false, 'Unavailable seat must not be allocated.');

// Verify hard constraint: No duplicate student allocation
const studentIdCounts = new Map();
for (const a of result.allocations) {
  studentIdCounts.set(a.studentId, (studentIdCounts.get(a.studentId) || 0) + 1);
}
for (const [sId, count] of studentIdCounts) {
  assert.strictEqual(count, 1, `Student ${sId} allocated multiple times.`);
}

// Verify hard constraint: No duplicate seat allocation
const seatIdCounts = new Map();
for (const a of result.allocations) {
  seatIdCounts.set(a.hallSeatId, (seatIdCounts.get(a.hallSeatId) || 0) + 1);
}
for (const [seatId, count] of seatIdCounts) {
  assert.strictEqual(count, 1, `Seat ${seatId} allocated multiple times.`);
}

console.log('✓ Test 1: 7-Step Seating Allocation & Hard Constraints verified.');

// TEST 2: Validate Seating via validateSeating() Function
const validationReport = validateSeating({
  allocations: result.allocations,
  seats: mockSeats,
  registrations: mockRegistrations,
});

assert.strictEqual(validationReport.duplicateStudentCount, 0, 'Zero duplicate students expected.');
assert.strictEqual(validationReport.duplicateSeatCount, 0, 'Zero duplicate seats expected.');
console.log(`[validation] Same Subject Adjacencies Detected: ${validationReport.sameSubjectAdjacencyCount}`);
console.log('✓ Test 2: validateSeating() standalone validation verified.');

// TEST 3: Absent Student Handling
mockRegistrations[0].status = 'absent';

const absentResult = generateSeating({
  registrations: mockRegistrations,
  seats: mockSeats,
});

assert.strictEqual(absentResult.allocations.length, 32, '32 active students allocated after 1 marked absent.');
const allocatedAbsentStudent = absentResult.allocations.some(a => a.studentId === mockRegistrations[0].studentId);
assert.strictEqual(allocatedAbsentStudent, false, 'Absent student must not be allocated to any seat.');
console.log('✓ Test 3: Absent student filtering & reallocation verified.');

// TEST 4: Neighbor Pair Scoring Verification
const studentA = { subjectId: 's1', departmentId: 'd1', year: 1, semester: 1, sectionId: 'sec1' };
const studentB = { subjectId: 's2', departmentId: 'd2', year: 2, semester: 3, sectionId: 'sec2' }; // Completely different
const studentC = { subjectId: 's1', departmentId: 'd1', year: 1, semester: 1, sectionId: 'sec1' }; // Identical subject & class

const scoreDiff = scoreNeighborPair(studentA, studentB);
const scoreSame = scoreNeighborPair(studentA, studentC);

assert.ok(scoreDiff > scoreSame, 'Different subject/dept pair must score significantly higher than same subject pair.');
console.log(`[scoring] Different pair score: ${scoreDiff}, Same pair score: ${scoreSame}`);
console.log('✓ Test 4: Neighbor pair scoring verified.');

console.log('\n─── ALL SEATING ENGINE TESTS PASSED CLEANLY ───');
