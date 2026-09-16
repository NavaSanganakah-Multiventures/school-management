-- Migration: 0014_student_history_and_activity_logs.sql
-- Description: Student Academic & Enrollment History (TC and Re-Admission Lifecycle)
-- and School-wide Activity Log & Audit Trail System.

-- 1. Student Academic & Enrollment History (Tracking Initial Admission, TC Issuance, Intermediate Schooling, and Re-Admission)
CREATE TABLE IF NOT EXISTS student_academic_history (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    scholar_number TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK(event_type IN ('Initial_Admission', 'TC_Issued', 'Re_Admission', 'Class_Promotion', 'Status_Change')),
    event_date TEXT NOT NULL,
    academic_session TEXT,
    class_name TEXT NOT NULL,
    section TEXT,
    tc_number TEXT,
    tc_issue_date TEXT,
    reason TEXT,
    intermediate_school_name TEXT,
    intermediate_tc_no TEXT,
    recorded_by_user_id TEXT,
    recorded_by_name TEXT,
    recorded_by_role TEXT,
    remarks TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (school_id) REFERENCES school_tenants(id)
);

CREATE INDEX IF NOT EXISTS idx_student_history_school_student ON student_academic_history(school_id, student_id, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_student_history_scholar ON student_academic_history(school_id, scholar_number);

-- 2. Comprehensive School Activity Logs & Audit Trail
CREATE TABLE IF NOT EXISTS activity_logs (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    user_role TEXT NOT NULL CHECK(user_role IN ('Director', 'Principal', 'Staff', 'SuperAdmin')),
    action_type TEXT NOT NULL,
    action_title TEXT NOT NULL,
    description TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    class_name TEXT,
    metadata TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (school_id) REFERENCES school_tenants(id)
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_school_created ON activity_logs(school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON activity_logs(school_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_class ON activity_logs(school_id, class_name);
CREATE INDEX IF NOT EXISTS idx_activity_logs_type ON activity_logs(school_id, action_type);
