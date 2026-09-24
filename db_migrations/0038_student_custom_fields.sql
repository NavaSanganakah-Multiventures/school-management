-- Migration: 0038_student_custom_fields.sql
-- Description: Per-school dynamic custom fields for students ("Student Extra Fields").
-- School Directors/Principals can define extra fields (text/number/dropdown/date/checkbox)
-- that appear ONLY for their school in the Add/Edit Student forms and Student Detail view.
-- Definitions are one row per school (school_id); values are stored per student.
-- Transaction-free (wrangler@4 remote D1 rejects BEGIN/COMMIT with code 7500).

CREATE TABLE IF NOT EXISTS student_custom_field_defs (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    field_key TEXT NOT NULL,
    label TEXT NOT NULL,
    field_type TEXT NOT NULL DEFAULT 'text'
        CHECK(field_type IN ('text','number','dropdown','date','checkbox')),
    options TEXT,
    required INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_by TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS student_custom_field_values (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    field_key TEXT NOT NULL,
    field_value TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_custom_field_defs_school
    ON student_custom_field_defs(school_id, is_active);

CREATE INDEX IF NOT EXISTS idx_custom_field_values_student
    ON student_custom_field_values(school_id, student_id);