-- Migration 003: Add support columns for Faculty designation, Student year/division, Subject semester, and Classroom lab_info.

ALTER TABLE faculty ADD COLUMN IF NOT EXISTS designation TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS year INTEGER;
ALTER TABLE students ADD COLUMN IF NOT EXISTS division TEXT;
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS semester_id UUID REFERENCES semesters(id) ON DELETE SET NULL;
ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS lab_info JSONB DEFAULT '{}'::jsonb;
