-- 0034: Relax system_users.role CHECK to allow 'Parents' and 'Students' roles.
-- SQLite cannot ALTER a CHECK constraint in place, so the table must be rebuilt.

PRAGMA foreign_keys=off;

BEGIN TRANSACTION;

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

COMMIT;

PRAGMA foreign_keys=on;
