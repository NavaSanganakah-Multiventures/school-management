-- Migration: 0012_class_teacher_assignment.sql
-- Description: Class-teacher assignment and attendance permission schema.

CREATE TABLE IF NOT EXISTS class_teachers (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    class_name TEXT NOT NULL,
    teacher_user_id TEXT NOT NULL,
    teacher_name TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(school_id, class_name)
);

CREATE INDEX IF NOT EXISTS idx_class_teachers_school_class ON class_teachers(school_id, class_name);
CREATE INDEX IF NOT EXISTS idx_class_teachers_teacher ON class_teachers(school_id, teacher_user_id);

CREATE INDEX IF NOT EXISTS idx_attendance_school_date ON attendance(school_id, date);
CREATE INDEX IF NOT EXISTS idx_students_school_status_class ON students(school_id, status, class_name);