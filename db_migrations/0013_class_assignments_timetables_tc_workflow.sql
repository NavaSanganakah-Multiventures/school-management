-- Migration: 0013_class_assignments_timetables_tc_workflow.sql
-- Description: Class Teacher Assignment, Timetable Periods Allocation, and TC Request/Approval Workflow

-- 1. Classes: add class_teacher_id to link with teachers/staff table
ALTER TABLE classes ADD COLUMN class_teacher_id TEXT;
ALTER TABLE classes ADD COLUMN max_students INTEGER DEFAULT 45;

-- 2. Timetables: add school_id, teacher_id, class_name, section
ALTER TABLE timetables ADD COLUMN school_id TEXT DEFAULT 'school-01';
ALTER TABLE timetables ADD COLUMN teacher_id TEXT;
ALTER TABLE timetables ADD COLUMN class_name TEXT;
ALTER TABLE timetables ADD COLUMN section TEXT;

-- 3. TC Requests: Class Teacher request -> Principal/Director Approval Workflow
CREATE TABLE IF NOT EXISTS tc_requests (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    scholar_number TEXT,
    student_name TEXT NOT NULL,
    class_name TEXT NOT NULL,
    section TEXT,
    requested_by_user_id TEXT NOT NULL,
    requested_by_name TEXT NOT NULL,
    requested_by_role TEXT NOT NULL DEFAULT 'Staff',
    request_date TEXT NOT NULL,
    reason TEXT NOT NULL,
    conduct TEXT DEFAULT 'उत्कृष्ट एवं चरित्रवान (Good & Exemplary)',
    working_days TEXT DEFAULT '210',
    present_days TEXT DEFAULT '194',
    fees_dues_status TEXT DEFAULT 'मार्च 2026 तक समस्त शुल्क चुकता (All Dues Cleared)',
    remarks TEXT,
    status TEXT NOT NULL DEFAULT 'Pending_Approval' CHECK(status IN ('Pending_Approval', 'Approved', 'Rejected')),
    reviewed_by_user_id TEXT,
    reviewed_by_name TEXT,
    reviewed_by_role TEXT,
    reviewed_at TIMESTAMP,
    tc_number TEXT,
    issue_date TEXT,
    rejection_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tc_requests_school ON tc_requests(school_id, status);
CREATE INDEX IF NOT EXISTS idx_tc_requests_student ON tc_requests(student_id);
