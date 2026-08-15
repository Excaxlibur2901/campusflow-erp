import { generateSeating, validateSeating, canShareBench } from './server/engine/seating.js';

function runTests() {
  console.log('--- TESTING EXAM BENCH CONSTRAINTS & SEATING ENGINE ---\n');

  // Test 1: Helper canShareBench
  console.log('1. Testing canShareBench helper...');
  const s1 = { studentId: '1', subjectId: 'SUB1', year: 1, sectionId: 'SEC1', deptCode: 'CS' };
  const s2SameSubj = { studentId: '2', subjectId: 'SUB1', year: 2, sectionId: 'SEC2', deptCode: 'EE' };
  const s3SameYear = { studentId: '3', subjectId: 'SUB2', year: 1, sectionId: 'SEC2', deptCode: 'EE' };
  const s4SameSec = { studentId: '4', subjectId: 'SUB2', year: 2, sectionId: 'SEC1', deptCode: 'CS' };
  const s5DiffAll = { studentId: '5', subjectId: 'SUB2', year: 2, sectionId: 'SEC2', deptCode: 'EE' };

  console.log('   Same Subject:', canShareBench(s1, s2SameSubj) === false ? '✅ FALSE' : '❌ TRUE');
  console.log('   Same Year:', canShareBench(s1, s3SameYear) === false ? '✅ FALSE' : '❌ TRUE');
  console.log('   Same Section:', canShareBench(s1, s4SameSec) === false ? '✅ FALSE' : '❌ TRUE');
  console.log('   Different All:', canShareBench(s1, s5DiffAll) === true ? '✅ TRUE' : '❌ FALSE');

  // Test 2: 2 students, same subject/year/section, 1 bench (2 seats) -> Impossible seating condition
  console.log('\n2. Testing 2 students (same subject) on 1 bench (2 seats)...');
  const seats1Bench = [
    { id: 'seat1', hallId: 'H1', rowNumber: 1, columnNumber: 1, benchNumber: 1, seatNumber: 'R1C1', available: true },
    { id: 'seat2', hallId: 'H1', rowNumber: 1, columnNumber: 2, benchNumber: 1, seatNumber: 'R1C2', available: true },
  ];
  const regs2Same = [
    { studentId: 'stu1', studentName: 'Alice', rollNumber: '01', subjectId: 'SUB1', subjectCode: 'CS101', year: 1, sectionId: 'SEC1', departmentId: 'DEP1' },
    { studentId: 'stu2', studentName: 'Bob', rollNumber: '02', subjectId: 'SUB1', subjectCode: 'CS101', year: 1, sectionId: 'SEC1', departmentId: 'DEP1' },
  ];

  const res2Same = generateSeating({ registrations: regs2Same, seats: seats1Bench });
  if (res2Same.report.ok === false && res2Same.unallocatedStudents.length === 1) {
    console.log('✅ PASSED: 2 students with same subject on 1 bench correctly rejected 2nd student.');
    console.log('   Allocated:', res2Same.allocations.length, '| Unallocated:', res2Same.unallocatedStudents.length);
  } else {
    console.log('❌ FAILED: 2 same subject students incorrectly seated together:', res2Same);
  }

  // Test 3: 2 students, different subjects & years, 1 bench (2 seats) -> Valid seating
  console.log('\n3. Testing 2 students (different subjects & years) on 1 bench (2 seats)...');
  const regs2Diff = [
    { studentId: 'stu1', studentName: 'Alice', rollNumber: '01', subjectId: 'SUB1', subjectCode: 'CS101', year: 1, sectionId: 'SEC1', departmentId: 'DEP1' },
    { studentId: 'stu2', studentName: 'Charlie', rollNumber: '02', subjectId: 'SUB2', subjectCode: 'EE101', year: 2, sectionId: 'SEC2', departmentId: 'DEP2' },
  ];

  const res2Diff = generateSeating({ registrations: regs2Diff, seats: seats1Bench });
  if (res2Diff.report.ok === true && res2Diff.allocations.length === 2) {
    console.log('✅ PASSED: 2 different students seated on 1 bench with 0 conflicts.');
  } else {
    console.log('❌ FAILED: 2 different students failed seating:', res2Diff);
  }

  // Test 4: 4 students, different subjects & years, 2 benches (4 seats)
  console.log('\n4. Testing 4 students (different subjects & years) on 2 benches (4 seats)...');
  const seats2Benches = [
    ...seats1Bench,
    { id: 'seat3', hallId: 'H1', rowNumber: 2, columnNumber: 1, benchNumber: 2, seatNumber: 'R2C1', available: true },
    { id: 'seat4', hallId: 'H1', rowNumber: 2, columnNumber: 2, benchNumber: 2, seatNumber: 'R2C2', available: true },
  ];
  const regs4Diff = [
    { studentId: 'stu1', studentName: 'Alice', rollNumber: '01', subjectId: 'SUB1', subjectCode: 'CS101', year: 1, sectionId: 'SEC1', departmentId: 'DEP1' },
    { studentId: 'stu2', studentName: 'Bob', rollNumber: '02', subjectId: 'SUB1', subjectCode: 'CS101', year: 1, sectionId: 'SEC1', departmentId: 'DEP1' },
    { studentId: 'stu3', studentName: 'Charlie', rollNumber: '03', subjectId: 'SUB2', subjectCode: 'EE101', year: 2, sectionId: 'SEC2', departmentId: 'DEP2' },
    { studentId: 'stu4', studentName: 'David', rollNumber: '04', subjectId: 'SUB2', subjectCode: 'EE101', year: 2, sectionId: 'SEC2', departmentId: 'DEP2' },
  ];

  const res4Diff = generateSeating({ registrations: regs4Diff, seats: seats2Benches });
  if (res4Diff.report.ok === true && res4Diff.allocations.length === 4) {
    console.log('✅ PASSED: 4 students interleaved across 2 benches with 0 bench conflicts.');
  } else {
    console.log('❌ FAILED: 4 students seating failed:', res4Diff);
  }

  // Test 5: Odd number of students (3 students on 2 benches = 4 seats)
  console.log('\n5. Testing Odd number of students (3 students on 2 benches)...');
  const regs3Diff = regs4Diff.slice(0, 3);
  const res3Diff = generateSeating({ registrations: regs3Diff, seats: seats2Benches });
  if (res3Diff.report.ok === true && res3Diff.allocations.length === 3) {
    console.log('✅ PASSED: 3 students seated cleanly on 2 benches with 0 conflicts.');
  } else {
    console.log('❌ FAILED: 3 students seating failed:', res3Diff);
  }

  // Test 6: Insufficient hall capacity (5 students, 2 benches = 4 seats)
  console.log('\n6. Testing Insufficient Hall Capacity (5 students on 4 seats)...');
  const regs5Diff = [
    ...regs4Diff,
    { studentId: 'stu5', studentName: 'Eve', rollNumber: '05', subjectId: 'SUB3', subjectCode: 'ME101', year: 3, sectionId: 'SEC3', departmentId: 'DEP3' }
  ];
  const res5Diff = generateSeating({ registrations: regs5Diff, seats: seats2Benches });
  if (res5Diff.report.ok === false && res5Diff.unallocatedStudents.length === 1) {
    console.log('✅ PASSED: 5th student correctly flagged as unallocated with report.ok = false.');
  } else {
    console.log('❌ FAILED: 5 students test failed:', res5Diff);
  }

  // Test 7: Multiple rooms test
  console.log('\n7. Testing Multiple Rooms (4 students across Hall H1 and Hall H2)...');
  const seatsMultiHalls = [
    { id: 'seat1_H1', hallId: 'H1', rowNumber: 1, columnNumber: 1, benchNumber: 1, seatNumber: 'H1-R1C1', available: true },
    { id: 'seat2_H1', hallId: 'H1', rowNumber: 1, columnNumber: 2, benchNumber: 1, seatNumber: 'H1-R1C2', available: true },
    { id: 'seat1_H2', hallId: 'H2', rowNumber: 1, columnNumber: 1, benchNumber: 1, seatNumber: 'H2-R1C1', available: true },
    { id: 'seat2_H2', hallId: 'H2', rowNumber: 1, columnNumber: 2, benchNumber: 1, seatNumber: 'H2-R1C2', available: true },
  ];
  const resMulti = generateSeating({ registrations: regs4Diff, seats: seatsMultiHalls });
  if (resMulti.report.ok === true && resMulti.allocations.length === 4) {
    console.log('✅ PASSED: 4 students seated cleanly across multiple halls.');
  } else {
    console.log('❌ FAILED: Multi-room seating failed:', resMulti);
  }

  // Test 8: Explicit Validator Detection of Forced Violation
  console.log('\n8. Testing Standalone Validator on Forced Bench Violation...');
  const forcedViolatingAllocations = [
    { hallSeatId: 'seat1', studentId: 'stu1', studentName: 'Alice', rollNumber: '01', subjectId: 'SUB1', subjectCode: 'CS101', year: 1, sectionId: 'SEC1', departmentId: 'DEP1', benchNumber: 1, hallId: 'H1', seatNumber: 'R1C1' },
    { hallSeatId: 'seat2', studentId: 'stu2', studentName: 'Bob', rollNumber: '02', subjectId: 'SUB1', subjectCode: 'CS101', year: 1, sectionId: 'SEC1', departmentId: 'DEP1', benchNumber: 1, hallId: 'H1', seatNumber: 'R1C2' },
  ];
  const valResult = validateSeating({ allocations: forcedViolatingAllocations, seats: seats1Bench, registrations: regs2Same });

  if (valResult.ok === false && valResult.conflicts.some(c => c.type === 'SAME_BENCH_SAME_SUBJECT') && valResult.conflicts.some(c => c.type === 'SAME_BENCH_SAME_YEAR')) {
    console.log('✅ PASSED: Validator explicitly detected SAME_BENCH_SAME_SUBJECT and SAME_BENCH_SAME_YEAR conflicts!');
    console.log('   Conflicts:', valResult.conflicts.map(c => c.type).join(', '));
  } else {
    console.log('❌ FAILED: Validator failed to detect explicit bench violations:', valResult);
  }

  console.log('\nAll tests completed.');
}

runTests();
