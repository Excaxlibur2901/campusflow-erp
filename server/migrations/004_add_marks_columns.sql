-- Migration 004: Add support columns for Mark Components and Marks Workflow

ALTER TABLE mark_components ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL;
ALTER TABLE mark_components ADD COLUMN IF NOT EXISTS semester INTEGER;
ALTER TABLE mark_components ADD COLUMN IF NOT EXISTS section_id UUID REFERENCES sections(id) ON DELETE SET NULL;
ALTER TABLE mark_components ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft';
