-- Migration: 0004_auth_trial_razorpay_admin.sql
-- Description: Real auth (hashed passwords, signed sessions), Super Admin, school
-- registration approval, 7-day free trial, Razorpay billing, and multi-tenant isolation.

-- 1. Platform Super Admins (kept separate so existing school role CHECK stays intact)
CREATE TABLE IF NOT EXISTS platform_admins (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    phone TEXT,
    status TEXT DEFAULT 'Active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Auth fields on school users
ALTER TABLE system_users ADD COLUMN password_hash TEXT;
ALTER TABLE system_users ADD COLUMN school_id TEXT DEFAULT 'school-01';

-- 3. School tenants: registration approval + plan + trial
ALTER TABLE school_tenants ADD COLUMN registration_status TEXT DEFAULT 'Active';
ALTER TABLE school_tenants ADD COLUMN plan_id TEXT DEFAULT 'trial';
ALTER TABLE school_tenants ADD COLUMN trial_ends_at TEXT;
ALTER TABLE school_tenants ADD COLUMN approved_at TEXT;
ALTER TABLE school_tenants ADD COLUMN approved_by TEXT;

-- 4. Subscriptions: trial + Razorpay references
ALTER TABLE school_subscriptions ADD COLUMN trial_ends_at TEXT;
ALTER TABLE school_subscriptions ADD COLUMN razorpay_order_id TEXT;
ALTER TABLE school_subscriptions ADD COLUMN razorpay_payment_id TEXT;
ALTER TABLE school_subscriptions ADD COLUMN razorpay_signature TEXT;

-- 5. Billing invoices: Razorpay references
ALTER TABLE billing_invoices ADD COLUMN razorpay_order_id TEXT;
ALTER TABLE billing_invoices ADD COLUMN razorpay_payment_id TEXT;

-- 6. Scholar register: upgrade students to full register + school isolation
ALTER TABLE students ADD COLUMN school_id TEXT DEFAULT 'school-01';
ALTER TABLE students ADD COLUMN scholar_number TEXT;
ALTER TABLE students ADD COLUMN father_name TEXT;
ALTER TABLE students ADD COLUMN father_occupation TEXT;
ALTER TABLE students ADD COLUMN mother_name TEXT;
ALTER TABLE students ADD COLUMN category TEXT DEFAULT 'General';
ALTER TABLE students ADD COLUMN religion TEXT DEFAULT 'Hindu';
ALTER TABLE students ADD COLUMN aadhaar_number TEXT;
ALTER TABLE students ADD COLUMN samagra_id TEXT;
ALTER TABLE students ADD COLUMN whatsapp_number TEXT;
ALTER TABLE students ADD COLUMN current_address TEXT;
ALTER TABLE students ADD COLUMN permanent_address TEXT;
ALTER TABLE students ADD COLUMN previous_school TEXT;
ALTER TABLE students ADD COLUMN previous_tc_no TEXT;
ALTER TABLE students ADD COLUMN bank_account_no TEXT;
ALTER TABLE students ADD COLUMN bank_name TEXT;
ALTER TABLE students ADD COLUMN ifsc_code TEXT;
ALTER TABLE students ADD COLUMN tc_issue_date TEXT;
ALTER TABLE students ADD COLUMN remarks TEXT;
ALTER TABLE students ADD COLUMN updated_at TEXT;

-- 7. Staff / teachers: school isolation + salary/status
ALTER TABLE teachers ADD COLUMN school_id TEXT DEFAULT 'school-01';
ALTER TABLE teachers ADD COLUMN salary REAL DEFAULT 0;
ALTER TABLE teachers ADD COLUMN status TEXT DEFAULT 'Active';

-- 8. Attendance: school isolation
ALTER TABLE attendance ADD COLUMN school_id TEXT DEFAULT 'school-01';

-- 9. Fees: school isolation + scholar/section
ALTER TABLE fee_invoices ADD COLUMN school_id TEXT DEFAULT 'school-01';
ALTER TABLE fee_invoices ADD COLUMN scholar_number TEXT;
ALTER TABLE fee_invoices ADD COLUMN section TEXT;

-- 10. Exams: school isolation
ALTER TABLE exams ADD COLUMN school_id TEXT DEFAULT 'school-01';
ALTER TABLE exam_marks ADD COLUMN school_id TEXT DEFAULT 'school-01';

-- 11. Notices: school isolation
ALTER TABLE notices ADD COLUMN school_id TEXT DEFAULT 'school-01';

-- 12. Principal history: school isolation
ALTER TABLE principal_history ADD COLUMN school_id TEXT DEFAULT 'school-01';

-- 13. Classes: school isolation
ALTER TABLE classes ADD COLUMN school_id TEXT DEFAULT 'school-01';

-- 14. Notification log: school isolation
ALTER TABLE notifications_log ADD COLUMN school_id TEXT DEFAULT 'school-01';