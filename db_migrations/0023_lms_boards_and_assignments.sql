-- Migration: 0023_lms_boards_and_assignments.sql
-- Description: Add education board support to lms_courses and targeted student allocation to lms_assignments

-- 1. Add education board support to lms_courses
ALTER TABLE lms_courses ADD COLUMN board TEXT DEFAULT 'CBSE';
CREATE INDEX IF NOT EXISTS idx_lms_courses_board ON lms_courses(school_id, board, class_name);

-- 2. Add targeted assignment allocation support to lms_assignments
ALTER TABLE lms_assignments ADD COLUMN target_type TEXT DEFAULT 'all';
ALTER TABLE lms_assignments ADD COLUMN target_section TEXT;
ALTER TABLE lms_assignments ADD COLUMN assigned_student_ids TEXT;
ALTER TABLE lms_assignments ADD COLUMN assigned_student_names TEXT;
