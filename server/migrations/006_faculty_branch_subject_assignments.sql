-- Migration 006: Allow faculty to teach subjects across multiple departments.
CREATE TABLE IF NOT EXISTS faculty_subject_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  faculty_id UUID NOT NULL REFERENCES faculty(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (faculty_id, department_id, subject_id)
);

CREATE INDEX IF NOT EXISTS idx_fsa_faculty
  ON faculty_subject_assignments(faculty_id);

CREATE INDEX IF NOT EXISTS idx_fsa_subject
  ON faculty_subject_assignments(subject_id);

CREATE INDEX IF NOT EXISTS idx_fsa_department
  ON faculty_subject_assignments(department_id);
