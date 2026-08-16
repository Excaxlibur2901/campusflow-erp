-- Migration 005: Add faculty assignment and semester columns
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS faculty_id UUID REFERENCES faculty(id) ON DELETE SET NULL;
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS semester INTEGER DEFAULT 3;
ALTER TABLE students ADD COLUMN IF NOT EXISTS semester INTEGER DEFAULT 3;
