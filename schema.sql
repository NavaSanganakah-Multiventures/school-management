-- VidyaSetu School Management — D1 schema (reference)
-- This file mirrors db_migrations/0001..0004. Apply changes via wrangler migrations;
-- use this file only as a human-readable reference of the final schema.

-- Migration: 0001_initial_schema.sql
-- Description: Initial schema setup for Cloudflare D1 database (VidyaSetu School Management)

CREATE TABLE IF NOT EXISTS classes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    section TEXT NOT NULL,
    room_number TEXT,
    class_teacher_name TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,
    roll_number TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    class_id TEXT NOT NULL,
    class_name TEXT NOT NULL,
    section TEXT NOT NULL,
    gender TEXT CHECK(gender IN ('Male', 'Female', 'Other')),
    dob TEXT,
    parent_name TEXT NOT NULL,
    parent_phone TEXT NOT NULL,
    email TEXT,
    address TEXT,
    blood_group TEXT,
    avatar_url TEXT,
    admission_date TEXT DEFAULT CURRENT_DATE,
    status TEXT DEFAULT 'Active' CHECK(status IN ('Active', 'Inactive', 'Suspended')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS teachers (
    id TEXT PRIMARY KEY,
    employee_code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    designation TEXT NOT NULL,
    department TEXT NOT NULL,
    subject_specialization TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL,
    qualification TEXT,
    joining_date TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS attendance (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    date TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('Present', 'Absent', 'Late', 'Leave')),
    remarks TEXT,
    marked_by TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fee_invoices (
    id TEXT PRIMARY KEY,
    invoice_number TEXT UNIQUE NOT NULL,
    student_id TEXT NOT NULL,
    student_name TEXT NOT NULL,
    class_name TEXT NOT NULL,
    title TEXT NOT NULL,
    total_amount REAL NOT NULL,
    paid_amount REAL DEFAULT 0,
    due_date TEXT NOT NULL,
    status TEXT DEFAULT 'Unpaid' CHECK(status IN ('Paid', 'Partial', 'Unpaid', 'Overdue')),
    payment_method TEXT,
    transaction_id TEXT,
    paid_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS exams (
    id TEXT PRIMARY KEY,
    exam_name TEXT NOT NULL,
    academic_year TEXT NOT NULL,
    term TEXT NOT NULL,
    start_date TEXT,
    end_date TEXT,
    is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS exam_marks (
    id TEXT PRIMARY KEY,
    exam_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    subject TEXT NOT NULL,
    max_marks REAL DEFAULT 100,
    marks_obtained REAL NOT NULL,
    grade TEXT,
    remarks TEXT
);

CREATE TABLE IF NOT EXISTS notices (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT DEFAULT 'General',
    target_audience TEXT DEFAULT 'All',
    published_by TEXT NOT NULL,
    published_date TEXT DEFAULT CURRENT_DATE,
    priority TEXT DEFAULT 'Normal',
    fcm_broadcast_status TEXT DEFAULT 'Sent',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notifications_log (
    id TEXT PRIMARY KEY,
    fcm_message_id TEXT,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    target_topic TEXT,
    recipient_token TEXT,
    delivery_status TEXT DEFAULT 'Success',
    payload_data TEXT,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS timetables (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL,
    day_of_week TEXT NOT NULL,
    period_number INTEGER NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    subject TEXT NOT NULL,
    teacher_name TEXT NOT NULL,
    room_number TEXT
);


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


-- Migration: 0003_enterprise_plans_autopay_multitenancy.sql
-- Description: Multi-Tenancy Architecture, Enterprise Subscription & Auto-Pay, Custom Domain Email Add-on, and Isolated School FCM Topics

-- 1. Multi-Tenant Schools Master Table
CREATE TABLE IF NOT EXISTS school_tenants (
    id TEXT PRIMARY KEY,
    school_name TEXT NOT NULL,
    subdomain TEXT UNIQUE NOT NULL,       -- e.g. 'vidyasetu', 'delhi-public'
    custom_domain TEXT,                   -- e.g. 'vidyasetuschool.edu.in'
    contact_email TEXT NOT NULL,
    contact_phone TEXT NOT NULL,
    status TEXT DEFAULT 'Active' CHECK(status IN ('Active', 'Suspended', 'Trial')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. School Subscriptions (Starter, Professional, Enterprise with Auto-Pay)
CREATE TABLE IF NOT EXISTS school_subscriptions (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    plan_id TEXT NOT NULL CHECK(plan_id IN ('starter', 'pro', 'enterprise')),
    plan_name TEXT NOT NULL,
    billing_cycle TEXT NOT NULL CHECK(billing_cycle IN ('monthly', 'quarterly', 'annual')),
    price_per_cycle REAL NOT NULL,
    discount_percent REAL DEFAULT 0,
    status TEXT DEFAULT 'Active' CHECK(status IN ('Active', 'Past_Due', 'Canceled', 'Trial')),
    auto_pay_enabled INTEGER DEFAULT 1,   -- 1 = Auto-Pay active, 0 = Manual
    payment_method TEXT DEFAULT 'UPI AutoPay', -- 'UPI AutoPay', 'e-NACH Mandate', 'Corporate Card'
    mandate_id TEXT,                      -- e.g. 'MANDATE-UPI-2026-09012'
    next_billing_date TEXT NOT NULL,
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (school_id) REFERENCES school_tenants(id)
);

-- 3. Subscription Add-ons (Custom Domain Email, Extra Cloud Storage, SMS Quota)
CREATE TABLE IF NOT EXISTS subscription_addons (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    addon_type TEXT NOT NULL CHECK(addon_type IN ('custom_domain_email', 'extra_storage', 'sms_broadcast')),
    addon_name TEXT NOT NULL,
    quantity INTEGER DEFAULT 1,
    unit_price REAL NOT NULL,
    billing_cycle TEXT DEFAULT 'monthly' CHECK(billing_cycle IN ('monthly', 'quarterly', 'annual')),
    status TEXT DEFAULT 'Active' CHECK(status IN ('Active', 'Inactive')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (school_id) REFERENCES school_tenants(id)
);

-- 4. Custom School Domain for Official Emails (Cloudflare Email Routing & DNS verification)
CREATE TABLE IF NOT EXISTS school_custom_domains (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    domain_name TEXT NOT NULL,           -- e.g. 'vidyasetuschool.edu.in'
    spf_record_status TEXT DEFAULT 'Verified' CHECK(spf_record_status IN ('Verified', 'Pending', 'Failed')),
    dkim_record_status TEXT DEFAULT 'Verified' CHECK(dkim_record_status IN ('Verified', 'Pending', 'Failed')),
    mx_record_status TEXT DEFAULT 'Verified' CHECK(mx_record_status IN ('Verified', 'Pending', 'Failed')),
    dmarc_record_status TEXT DEFAULT 'Verified' CHECK(dmarc_record_status IN ('Verified', 'Pending', 'Failed')),
    is_active INTEGER DEFAULT 1,
    monthly_sending_quota INTEGER DEFAULT 10000,
    monthly_sent_count INTEGER DEFAULT 0,
    configured_mailboxes TEXT,          -- JSON array of active email IDs
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (school_id) REFERENCES school_tenants(id)
);

-- 5. Enterprise Billing & Auto-Pay Tax Invoices
CREATE TABLE IF NOT EXISTS billing_invoices (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    invoice_number TEXT UNIQUE NOT NULL, -- e.g. 'VS-INV-2026-0901'
    description TEXT NOT NULL,
    plan_name TEXT NOT NULL,
    billing_cycle TEXT NOT NULL,
    subtotal REAL NOT NULL,
    gst_percent REAL DEFAULT 18.0,
    gst_amount REAL NOT NULL,
    total_amount REAL NOT NULL,
    payment_status TEXT DEFAULT 'Paid' CHECK(payment_status IN ('Paid', 'Pending', 'Failed', 'Processing')),
    payment_method TEXT,
    transaction_id TEXT,
    invoice_date TEXT NOT NULL,
    due_date TEXT NOT NULL,
    paid_at TIMESTAMP,
    FOREIGN KEY (school_id) REFERENCES school_tenants(id)
);

-- 6. School-Isolated FCM Topics Table
CREATE TABLE IF NOT EXISTS school_fcm_topics (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    topic_key TEXT UNIQUE NOT NULL,      -- e.g. 'school_school-01_parents'
    display_name TEXT NOT NULL,
    target_role TEXT NOT NULL,
    subscriber_count INTEGER DEFAULT 0,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (school_id) REFERENCES school_tenants(id)
);


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

