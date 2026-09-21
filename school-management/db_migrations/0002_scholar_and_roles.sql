-- Migration: 0002_scholar_and_roles.sql
-- Description: Add School Profile, 3-Role CRM User Auth (Director, Principal, Staff), Principal Change History, and Comprehensive Scholar Register fields

CREATE TABLE IF NOT EXISTS school_profile (
    id TEXT PRIMARY KEY,
    school_name TEXT NOT NULL,
    affiliation_number TEXT,
    board_name TEXT DEFAULT 'CBSE',
    school_code TEXT,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    alternate_phone TEXT,
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    pincode TEXT NOT NULL,
    academic_session TEXT DEFAULT '2026-2027',
    director_name TEXT NOT NULL,
    principal_name TEXT NOT NULL,
    logo_url TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS system_users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('Director', 'Principal', 'Staff')),
    designation TEXT NOT NULL,
    department TEXT,
    qualification TEXT,
    salary REAL DEFAULT 0,
    status TEXT DEFAULT 'Active' CHECK(status IN ('Active', 'Inactive')),
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS principal_history (
    id TEXT PRIMARY KEY,
    principal_user_id TEXT NOT NULL,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    qualification TEXT,
    appointed_date TEXT NOT NULL,
    relieved_date TEXT,
    status TEXT DEFAULT 'Active' CHECK(status IN ('Active', 'Past')),
    appointed_by TEXT DEFAULT 'Director',
    remarks TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
