-- Migration: 0016_dynamic_school_management.sql
-- Description: Adds tables for Dynamic Subjects, Marksheet Terms, Fee Heads, and Leave Applications

-- 1. Dynamic Subjects & Class Mapping
CREATE TABLE IF NOT EXISTS subjects (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    subject_name TEXT NOT NULL,
    subject_code TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (school_id) REFERENCES school_tenants(id)
);

CREATE TABLE IF NOT EXISTS class_subjects (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    class_name TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    subject_type TEXT DEFAULT 'Theory' CHECK(subject_type IN ('Theory', 'Practical', 'Co-Scholastic')),
    is_optional INTEGER DEFAULT 0,
    max_marks REAL DEFAULT 100,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (school_id) REFERENCES school_tenants(id),
    FOREIGN KEY (subject_id) REFERENCES subjects(id)
);

-- 2. Exam Terms for Dynamic Marksheets
CREATE TABLE IF NOT EXISTS exam_terms (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    term_name TEXT NOT NULL, -- e.g., 'Term 1', 'Term 2', 'Half-Yearly'
    weightage_percent REAL DEFAULT 100,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (school_id) REFERENCES school_tenants(id)
);

-- 3. Leave Applications for Students
CREATE TABLE IF NOT EXISTS leave_applications (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    reason TEXT NOT NULL,
    status TEXT DEFAULT 'Pending' CHECK(status IN ('Pending', 'Approved', 'Rejected')),
    applied_by_user_id TEXT,
    approved_by_user_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (school_id) REFERENCES school_tenants(id),
    FOREIGN KEY (student_id) REFERENCES students(id)
);

-- 4. Dynamic Fee Structures
CREATE TABLE IF NOT EXISTS fee_heads (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    head_name TEXT NOT NULL, -- e.g., 'Tuition Fee', 'Transport Fee'
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (school_id) REFERENCES school_tenants(id)
);

CREATE TABLE IF NOT EXISTS class_fee_structure (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    class_name TEXT NOT NULL,
    fee_head_id TEXT NOT NULL,
    amount REAL NOT NULL,
    billing_cycle TEXT DEFAULT 'Monthly' CHECK(billing_cycle IN ('Monthly', 'Quarterly', 'Annual', 'One-Time')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (school_id) REFERENCES school_tenants(id),
    FOREIGN KEY (fee_head_id) REFERENCES fee_heads(id)
);
