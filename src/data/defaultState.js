export const defaultSettings = {
  institutionName: '',
  affiliation: '',
  address: '',
  phone: '',
  email: '',
  website: '',
  naacGrade: '',
  collegeLogo: '',
  principalName: '',
  establishedYear: '',
  aisheCode: '',
  autonomousStatus: '',
  collegeType: '',
  motto: '',
  headerFont: 'Arial',
  bodyFontSize: '12pt',
  pageMargins: '15mm',
  qrVerification: 'Enabled',
  jwtExpiry: '15 minutes',
  refreshExpiry: '7 days',
  bcryptCost: '12',
  httpsEnforcement: 'Enabled',
  autoBackup: 'Daily at 2:00 AM',
  retentionPeriod: '30 days',
};

export const defaultState = {
  setupDone: false,

  departments: [
    { id: 'd1', name: 'Computer Science', code: 'CSE', hod: 'Dr. Ramesh Iyer', active: true, faculty: 3, students: 2 },
    { id: 'd2', name: 'Electronics & Communication', code: 'ECE', hod: 'Dr. Anjali Mehta', active: true, faculty: 2, students: 1 },
    { id: 'd3', name: 'Mechanical Engineering', code: 'ME', hod: 'Dr. Sunil Joshi', active: true, faculty: 2, students: 1 },
  ],

  faculty: [
    { id: 'f1', name: 'Dr. Ramesh Iyer', empCode: 'FAC001', department: 'Computer Science', designation: 'Professor & HOD', email: 'ramesh@campus.edu', phone: '9800000001', specialization: 'Machine Learning', joiningDate: '2015-06-01', maxHours: 18, currentHours: 14 },
    { id: 'f2', name: 'Prof. Kavitha Nair', empCode: 'FAC002', department: 'Computer Science', designation: 'Associate Professor', email: 'kavitha@campus.edu', phone: '9800000002', specialization: 'Data Structures', joiningDate: '2018-07-15', maxHours: 20, currentHours: 16 },
    { id: 'f3', name: 'Dr. Anjali Mehta', empCode: 'FAC003', department: 'Electronics & Communication', designation: 'Professor & HOD', email: 'anjali@campus.edu', phone: '9800000003', specialization: 'VLSI Design', joiningDate: '2014-01-10', maxHours: 18, currentHours: 12 },
  ],

  subjects: [
    { id: 's1', name: 'Data Structures & Algorithms', code: 'CS301', department: 'Computer Science', semester: '3', credits: 4, type: 'Theory' },
    { id: 's2', name: 'Database Management Systems', code: 'CS302', department: 'Computer Science', semester: '3', credits: 4, type: 'Theory' },
    { id: 's3', name: 'Operating Systems', code: 'CS303', department: 'Computer Science', semester: '3', credits: 3, type: 'Theory' },
    { id: 's4', name: 'Digital Signal Processing', code: 'EC301', department: 'Electronics & Communication', semester: '3', credits: 4, type: 'Theory' },
    { id: 's5', name: 'Thermodynamics', code: 'ME301', department: 'Mechanical Engineering', semester: '3', credits: 4, type: 'Theory' },
  ],

  classrooms: [
    { id: 'r1', code: 'LH-101', building: 'Main Block', capacity: 60, type: 'Lecture Hall', floor: 'Ground' },
    { id: 'r2', code: 'LH-102', building: 'Main Block', capacity: 60, type: 'Lecture Hall', floor: 'Ground' },
    { id: 'r3', code: 'LAB-201', building: 'Science Block', capacity: 40, type: 'Computer Lab', floor: '1st' },
    { id: 'r4', code: 'LH-301', building: 'Main Block', capacity: 80, type: 'Seminar Hall', floor: '2nd' },
  ],

  students: [
    { id: 'st1', name: 'Aarav Sharma', rollNo: 'CSE2024001', rollNumber: 'CSE2024001', dept: 'CSE', department: 'Computer Science', semester: 3, year: '2', email: 'aarav@campus.edu', phone: '9876543210', admissionDate: '2024-08-01', fatherName: 'Rajesh Sharma', motherName: 'Sunita Sharma', bloodGroup: 'B+', address: '42, MG Road, Pune 411001', attendance: 92, section: 'A' },
    { id: 'st2', name: 'Priya Patel', rollNo: 'ECE2024015', rollNumber: 'ECE2024015', dept: 'ECE', department: 'Electronics & Communication', semester: 3, year: '2', email: 'priya@campus.edu', phone: '9876543211', admissionDate: '2024-08-01', fatherName: 'Vikram Patel', motherName: 'Meena Patel', bloodGroup: 'A+', address: '15, Station Road, Mumbai 400001', attendance: 88, section: 'A' },
    { id: 'st3', name: 'Rahul Kumar', rollNo: 'ME2023042', rollNumber: 'ME2023042', dept: 'ME', department: 'Mechanical Engineering', semester: 5, year: '3', email: 'rahul@campus.edu', phone: '9876543212', admissionDate: '2023-08-01', fatherName: 'Suresh Kumar', motherName: 'Anita Kumar', bloodGroup: 'O+', address: '78, Civil Lines, New Delhi 110001', attendance: 95, section: 'B' },
    { id: 'st4', name: 'Sneha Reddy', rollNo: 'CSE2024008', rollNumber: 'CSE2024008', dept: 'CSE', department: 'Computer Science', semester: 3, year: '2', email: 'sneha@campus.edu', phone: '9876543213', admissionDate: '2024-08-01', fatherName: 'Venkat Reddy', motherName: 'Lakshmi Reddy', bloodGroup: 'AB+', address: '23, Jubilee Hills, Hyderabad 500033', attendance: 97, section: 'A' },
  ],

  exams: [
    { id: 'e1', name: 'Mid Semester Examination — July 2026', type: 'Mid-Term', date: '2026-07-15', startTime: '10:00', endTime: '13:00', department: 'Computer Science', semester: '3', subjects: ['Data Structures & Algorithms', 'Database Management Systems', 'Operating Systems'], status: 'Upcoming', halls: ['LH-101', 'LH-102'], totalStudents: 2 },
  ],

  notifications: [],
  audit: [],
  timetable: [],
  seats: [],
  attendanceHistory: [],
  documents: [],
  settings: defaultSettings,
};
