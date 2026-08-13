-- Migration 002: Seed initial data for roles (already done in 001) and create
-- a placeholder for the setup wizard to register the first institution.
-- The actual SUPER_ADMIN user is created via POST /api/auth/setup during the
-- SetupWizard flow with a real bcrypt-hashed password provided by the admin.

-- Ensure all role codes are present (idempotent — 001 already inserts them).
INSERT INTO roles (code, name, description)
VALUES
  ('SUPER_ADMIN', 'Super Admin',  'Full system control'),
  ('PRINCIPAL',   'Principal',    'Institution overview, approvals, analytics, reports'),
  ('HOD',         'HOD',          'Department management and academic operations'),
  ('FACULTY',     'Faculty',      'Teaching, attendance, marks, timetable access'),
  ('EXAM_CELL',   'Exam Cell',    'Exam and seating operations'),
  ('STUDENT',     'Student',      'Student self-service access')
ON CONFLICT (code) DO NOTHING;
