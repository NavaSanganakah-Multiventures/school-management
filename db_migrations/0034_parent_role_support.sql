-- 0034: Relax system_users.role CHECK to allow 'Parents' and 'Students' roles.
-- SQLite cannot ALTER a CHECK constraint in place, so the table must be rebuilt.
--
-- Note: no explicit BEGIN/COMMIT here. D1's `wrangler d1 migrations apply`
-- already wraps each migration file in its own atomic transaction, so raw
-- `BEGIN TRANSACTION` statements would be redundant AND are rejected by
-- wrangler@4 on remote D1 (errors with code 7500).

PRAGMA foreign_keys=off;

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

PRAGMA foreign_keys=on;
