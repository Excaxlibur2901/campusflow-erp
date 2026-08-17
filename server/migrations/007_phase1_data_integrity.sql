-- Migration 007: Phase 1 faculty/subject data integrity.
ALTER TABLE faculty
  ADD COLUMN IF NOT EXISTS current_hours INTEGER NOT NULL DEFAULT 0
  CHECK (current_hours >= 0);

-- Backfill the authoritative assignment table from the legacy single-faculty
-- subject column before the APIs start maintaining both representations.
INSERT INTO faculty_subject_assignments
  (institution_id, faculty_id, department_id, subject_id)
SELECT d.institution_id, s.faculty_id, s.department_id, s.id
FROM subjects s
JOIN departments d ON d.id = s.department_id
JOIN faculty f ON f.id = s.faculty_id AND f.institution_id = d.institution_id
WHERE s.faculty_id IS NOT NULL
ON CONFLICT (faculty_id, department_id, subject_id) DO NOTHING;
