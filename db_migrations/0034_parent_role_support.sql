-- 0034: Relax system_users.role CHECK to allow 'Parents' and 'Students' roles.
-- SQLite cannot ALTER a CHECK constraint in place, so the table must be rebuilt.
--
-- IMPORTANT WHEN EDITING THIS FILE
--
-- This migration used to open with two statements that toggled SQLite's
-- foreign-key enforcement off and then back on around the table rebuild. They
-- have been removed, for two reasons.
--
-- First, correctness: SQLite ignores that setting inside a transaction,
-- and `wrangler d1 migrations apply` has already opened one, so the toggle was
-- a no-op. The rebuild does not need it either — it only drops and recreates
-- `system_users`, and nothing in migrations 0001-0038 declares a foreign key
-- that points at that table.
--
-- Second, and more seriously: `wrangler d1 migrations apply` scans the raw file
-- for transaction keywords and does NOT strip `--` comments first. Any of the
-- following words appearing even inside a comment makes it reject the file
-- with "contains several transactions" — which meant a FRESH database could
-- not be migrated at all, so a newly provisioned school could never finish
-- `provision-school.mjs`. The removed statements are named here only
-- descriptively; please keep the literal keywords out of this file, and keep it
-- free of explicit transaction statements since D1 supplies its own.


CREATE TABLE system_users_new (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('Director', 'Principal', 'Staff', 'Parents', 'Students')),
    designation TEXT NOT NULL,
    department TEXT,
    qualification TEXT,
    salary REAL DEFAULT 0,
    status TEXT DEFAULT 'Active' CHECK(status IN ('Active', 'Inactive')),
    password_hash TEXT,
    school_id TEXT DEFAULT 'school-01',
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO system_users_new (id, username, full_name, email, phone, role, designation, department, qualification, salary, status, password_hash, school_id, last_login, created_at, updated_at)
SELECT id, username, full_name, email, phone, role, designation, department, qualification, salary, status, password_hash, school_id, last_login, created_at, updated_at
FROM system_users;

DROP TABLE system_users;
ALTER TABLE system_users_new RENAME TO system_users;
