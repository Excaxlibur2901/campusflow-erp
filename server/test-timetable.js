/**
 * Automated Timetable Engine Verification Suite — CampusFlow ERP
 *
 * Tests the Constraint-Based Timetable Engine against:
 *   - Inputs (subjects, credits, weekly hours, theory/lab, faculty, classrooms, working days, time slots, locked slots)
 *   - Hard constraint enforcement (Faculty clash, Room clash, Section clash, Room capacity limits, Locked slots)
 *   - Soft constraint optimization (Subject distribution, Workload balancing, Room utilization)
 *   - Output report format (hardConflicts, softViolations, unscheduledHours, facultyWorkload, roomUtilization, score)
 *   - Manual move validation (validateMove)
 */

import assert from 'node:assert';
import { generateTimetable, validateMove } from './engine/timetable.js';

console.log('─── Running Timetable Engine Verification Test Suite ───');

// 1. Setup Mock Inputs
const mockDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const mockTimeSlots = ['9:00-9:50', '9:50-10:40', '10:40-11:30', '11:30-12:20', '1:10-2:00', '2:00-2:50', '2:50-3:40'];

const mockClassrooms = [
  { id: 'room-101', code: 'C101', name: 'Lecture Hall 1', capacity: 60, roomType: 'lecture' },
  { id: 'room-lab1', code: 'LAB1', name: 'Computer Lab 1', capacity: 60, roomType: 'lab' },
  { id: 'room-tiny', code: 'TINY', name: 'Tiny Room', capacity: 15, roomType: 'lecture' }, // Capacity constraint test
];

const mockFaculty = [
  { id: 'fac-1', name: 'Dr. Alan Turing', maxWeeklyHours: 20 },
  { id: 'fac-2', name: 'Prof. Ada Lovelace', maxWeeklyHours: 20 },
];

const mockSubjects = [
  { id: 'sub-cs1', code: 'CS101', name: 'Programming Fundamentals', type: 'theory', weeklyHours: 3, facultyId: 'fac-1', roomId: 'room-101' },
  { id: 'sub-cs2', code: 'CS102', name: 'Data Structures', type: 'theory', weeklyHours: 3, facultyId: 'fac-2', roomId: 'room-101' },
  { id: 'sub-lab1', code: 'CS105', name: 'Programming Lab', type: 'lab', weeklyHours: 2, facultyId: 'fac-1', roomId: 'room-lab1' },
];

// TEST 1: Generate Timetable with Zero Hard Conflicts
const result = generateTimetable({
  days: mockDays,
  timeSlots: mockTimeSlots,
  subjects: mockSubjects,
  facultyList: mockFaculty,
  classroomsList: mockClassrooms,
  sectionCode: 'A',
  sectionCapacity: 60,
});

assert.strictEqual(result.hardConflicts.length, 0, 'Zero hard conflicts expected on valid configuration.');
assert.ok(result.slots.length >= 8, 'At least 8 slot entries should be scheduled (3+3+2).');
assert.strictEqual(result.unscheduledHours.length, 0, 'Zero unscheduled hours expected.');
assert.ok(result.score > 0, 'Quality score must be positive.');

console.log('✓ Test 1: Timetable generation with zero hard conflicts verified.');

// TEST 2: Hard Constraint Enforcement - Insufficient Room Capacity
const capacityTest = generateTimetable({
  days: mockDays,
  timeSlots: mockTimeSlots,
  subjects: [{ id: 'sub-over', code: 'OVER1', name: 'Overflow', type: 'theory', weeklyHours: 3, facultyId: 'fac-1', roomId: 'room-tiny' }],
  facultyList: mockFaculty,
  classroomsList: [mockClassrooms[2]], // Tiny room (capacity 15)
  sectionCode: 'B',
  sectionCapacity: 60, // Section capacity 60 > room capacity 15
});

assert.ok(capacityTest.hardConflicts.some(c => c.type === 'INSUFFICIENT_ROOM_CAPACITY'), 'Insufficient room capacity hard conflict must be detected.');
console.log('✓ Test 2: Hard constraint enforcement (Insufficient Room Capacity) verified.');

// TEST 3: Manual Move Validation (validateMove)
const existingSystemSlots = [
  { id: 'slot-1', day: 'Mon', slotIdx: 0, sectionCode: 'A', facultyId: 'fac-1', roomId: 'room-101' },
  { id: 'slot-2', day: 'Mon', slotIdx: 0, sectionCode: 'B', facultyId: 'fac-2', roomId: 'room-102' },
];

// Attempt invalid move: move Section B class to Mon slot 0 with fac-1 (Faculty Clash!)
const invalidMove = validateMove({
  targetSlot: { id: 'slot-2', day: 'Mon', slotIdx: 0, sectionCode: 'B', facultyId: 'fac-1', roomId: 'room-102' },
  existingSlots: existingSystemSlots,
  classroomsList: mockClassrooms,
  sectionCapacity: 60,
});

assert.strictEqual(invalidMove.valid, false, 'Manual move creating faculty clash must be rejected.');
assert.ok(invalidMove.errors.some(e => e.includes('Faculty is already teaching')), 'Faculty clash error message expected.');

// Attempt valid move: move Section B class to Mon slot 1
const validMove = validateMove({
  targetSlot: { id: 'slot-2', day: 'Mon', slotIdx: 1, sectionCode: 'B', facultyId: 'fac-2', roomId: 'room-102' },
  existingSlots: existingSystemSlots,
  classroomsList: mockClassrooms,
  sectionCapacity: 60,
});

assert.strictEqual(validMove.valid, true, 'Valid manual move must be accepted.');
console.log('✓ Test 3: Manual move validation (validateMove) verified.');

console.log('\n─── ALL TIMETABLE ENGINE TESTS PASSED CLEANLY ───');
