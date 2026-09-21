-- Pragnya Mitra School Management â D1 schema (reference)
-- This file mirrors db_migrations/0001..0013 (all migrations, in order).
-- Apply changes via wrangler migrations; use this file only as a human-readable
-- reference of the migration sequence and final schema.
-- Migration: 0001_initial_schema.sql
-- Description: Initial schema setup for Cloudflare D1 database (Pragnya Mitra School Management)

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
    subdomain TEXT UNIQUE NOT NULL,       -- e.g. 'pragnya-mitra', 'delhi-public'
    custom_domain TEXT,                   -- e.g. 'pragnyamitra.edu.in'
    contact_email TEXT NOT NULL,
    contact_phone TEXT NOT NULL,
    status TEXT DEFAULT 'Active' CHECK(status IN ('Active', 'Suspended', 'Trial')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. School Subscriptions (Starter, Professional, Enterprise with Auto-Pay)
-- NOTE (migration 0005): this table is rebuilt â the old plan_id CHECK was removed so
-- Super Admin can assign dynamic/custom plan IDs, and trial/Razorpay columns were added.
CREATE TABLE IF NOT EXISTS school_subscriptions (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    plan_id TEXT NOT NULL,
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
    trial_ends_at TEXT,
    razorpay_order_id TEXT,
    razorpay_payment_id TEXT,
    razorpay_signature TEXT,
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
    domain_name TEXT NOT NULL,           -- e.g. 'pragnyamitra.edu.in'
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

-- Migration: 0005_admin_plan_school_crud.sql
-- Description: Super Admin school CRUD (add/edit/soft-delete) and dynamic subscription
-- plans (create/edit/deactivate). Also removes the hard-coded plan_id CHECK so custom
-- plans can be assigned to schools.

-- 1. Soft-delete marker for schools (safe delete/restore without losing data)
ALTER TABLE school_tenants ADD COLUMN deleted_at TEXT;

-- 2. Rebuild school_subscriptions without the restrictive plan_id CHECK
CREATE TABLE school_subscriptions_new (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    plan_id TEXT NOT NULL,
    plan_name TEXT NOT NULL,
    billing_cycle TEXT NOT NULL CHECK(billing_cycle IN ('monthly', 'quarterly', 'annual')),
    price_per_cycle REAL NOT NULL,
    discount_percent REAL DEFAULT 0,
    status TEXT DEFAULT 'Active' CHECK(status IN ('Active', 'Past_Due', 'Canceled', 'Trial')),
    auto_pay_enabled INTEGER DEFAULT 1,
    payment_method TEXT DEFAULT 'UPI AutoPay',
    mandate_id TEXT,
    next_billing_date TEXT NOT NULL,
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    trial_ends_at TEXT,
    razorpay_order_id TEXT,
    razorpay_payment_id TEXT,
    razorpay_signature TEXT,
    FOREIGN KEY (school_id) REFERENCES school_tenants(id)
);

INSERT INTO school_subscriptions_new
    (id, school_id, plan_id, plan_name, billing_cycle, price_per_cycle, discount_percent, status,
     auto_pay_enabled, payment_method, mandate_id, next_billing_date, period_start, period_end,
     updated_at, trial_ends_at, razorpay_order_id, razorpay_payment_id, razorpay_signature)
SELECT
    id, school_id, plan_id, plan_name, billing_cycle, price_per_cycle, discount_percent, status,
    auto_pay_enabled, payment_method, mandate_id, next_billing_date, period_start, period_end,
    updated_at, trial_ends_at, razorpay_order_id, razorpay_payment_id, razorpay_signature
FROM school_subscriptions;

DROP TABLE school_subscriptions;
ALTER TABLE school_subscriptions_new RENAME TO school_subscriptions;

-- 3. Dynamic subscription plans master table
CREATE TABLE IF NOT EXISTS subscription_plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    tagline TEXT DEFAULT '',
    badge TEXT DEFAULT '',
    monthly_price REAL NOT NULL DEFAULT 0,
    quarterly_price REAL NOT NULL DEFAULT 0,
    annual_price REAL NOT NULL DEFAULT 0,
    max_students INTEGER,
    max_staff INTEGER,
    max_students_label TEXT DEFAULT '',
    modules TEXT NOT NULL DEFAULT '[]',
    features TEXT NOT NULL DEFAULT '[]',
    feature_flags TEXT NOT NULL DEFAULT '{}',
    recommended INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1,
    is_trial INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT,
    updated_at TEXT
);

-- 4. Seed the existing four plans (keeps behavior identical to the previous static definitions)
INSERT INTO subscription_plans
    (id, name, tagline, badge, monthly_price, quarterly_price, annual_price,
     max_students, max_staff, max_students_label, modules, features, feature_flags,
     recommended, active, is_trial, sort_order, created_at, updated_at)
VALUES
    ('trial', '7-à¤¦à¤¿à¤¨ à¤«à¥à¤°à¥ à¤à¥à¤°à¤¾à¤¯à¤²', 'à¤¨à¤ à¤¸à¥à¤à¥à¤² à¤ªà¤à¤à¥à¤à¤°à¤£ à¤¹à¥à¤¤à¥ à¤¨à¤¿à¤à¤¶à¥à¤²à¥à¤ à¤ªà¤°à¥à¤à¥à¤·à¤£ (Super Admin à¤à¤ªà¥à¤°à¥à¤µà¤² à¤à¥ à¤¬à¤¾à¤¦ 7 à¤¦à¤¿à¤¨)', 'à¤«à¥à¤°à¥', 0, 0, 0,
     50, 10, '50 à¤µà¤¿à¤¦à¥à¤¯à¤¾à¤°à¥à¤¥à¥',
     '["dashboard","students","attendance","staff","notices","fees","settings","billing"]',
     '["à¤¡à¥à¤¶à¤¬à¥à¤°à¥à¤¡ à¤µ à¤¸à¥à¤à¥à¤² à¤ªà¥à¤°à¥à¤«à¤¼à¤¾à¤à¤² à¤¸à¥à¤à¤à¤ª","à¤¸à¥à¤à¥à¤²à¤° à¤°à¤à¤¿à¤¸à¥à¤à¤° (à¤à¤§à¤¿à¤à¤¤à¤® 50 à¤à¤¾à¤¤à¥à¤°)","à¤¦à¥à¤¨à¤¿à¤ à¤à¤¾à¤¤à¥à¤° à¤à¤ªà¤¸à¥à¤¥à¤¿à¤¤à¤¿","à¤¸à¥à¤à¤¾à¤« à¤¨à¤¿à¤°à¥à¤¦à¥à¤¶à¤¿à¤à¤¾ (à¤à¤§à¤¿à¤à¤¤à¤® 10 à¤¸à¤¦à¤¸à¥à¤¯)","à¤¨à¥à¤à¤¿à¤¸ à¤ªà¤à¥à¤ à¤µ à¤¸à¥à¤à¤¨à¤¾","à¤¬à¥à¤¨à¤¿à¤¯à¤¾à¤¦à¥ à¤«à¥à¤¸ à¤à¤¾à¤²à¤¾à¤¨"]',
     '{"reportCards":false,"principalHistory":false,"autopay":false,"domainEmail":false,"multiSchool":false,"prioritySupport":false,"customDomainIncluded":false}',
     0, 1, 1, 0, datetime('now'), datetime('now')),
    ('starter', 'à¤¸à¥à¤à¤¾à¤°à¥à¤à¤° à¤ªà¥à¤²à¤¾à¤¨ (Starter)', 'à¤ªà¥à¤°à¤¾à¤¥à¤®à¤¿à¤ à¤µà¤¿à¤¦à¥à¤¯à¤¾à¤²à¤¯à¥à¤ (500 à¤à¤¾à¤¤à¥à¤°à¥à¤ à¤¤à¤) à¤à¥ à¤²à¤¿à¤ à¤à¤ªà¤¯à¥à¤à¥à¤¤', NULL, 201, 573, 1932,
     500, 25, '500 à¤µà¤¿à¤¦à¥à¤¯à¤¾à¤°à¥à¤¥à¥',
     '["dashboard","students","attendance","staff","notices","fees","exams","settings","billing"]',
     '["à¤¡à¤¿à¤à¤¿à¤à¤² à¤¸à¥à¤à¥à¤²à¤° à¤°à¤à¤¿à¤¸à¥à¤à¤° (à¤¦à¤¾à¤à¤¿à¤²à¤¾-à¤à¤¾à¤°à¤¿à¤)","à¤¦à¥à¤¨à¤¿à¤ à¤à¤¾à¤¤à¥à¤° à¤à¤ªà¤¸à¥à¤¥à¤¿à¤¤à¤¿","à¤¨à¤¿à¤¦à¥à¤¶à¤, à¤ªà¥à¤°à¤§à¤¾à¤¨à¤¾à¤à¤¾à¤°à¥à¤¯ à¤µ à¤¶à¤¿à¤à¥à¤·à¤ 3-à¤°à¥à¤² à¤µà¥à¤¯à¤µà¤¸à¥à¤¥à¤¾","à¤«à¥à¤¸ à¤°à¤¸à¥à¤¦ à¤µ à¤à¤¾à¤²à¤¾à¤¨ à¤¨à¤¿à¤°à¥à¤®à¤¾à¤£","à¤¸à¤¾à¤®à¤¾à¤¨à¥à¤¯ à¤à¤®à¥à¤² à¤¸à¥à¤à¤¨à¤¾ à¤¸à¥à¤µà¤¾","à¤ªà¤°à¥à¤à¥à¤·à¤¾ à¤µ à¤à¤à¤ à¤ªà¥à¤°à¤µà¤¿à¤·à¥à¤à¤¿ (à¤¬à¥à¤¸à¤¿à¤)"]',
     '{"reportCards":false,"principalHistory":false,"autopay":false,"domainEmail":false,"multiSchool":false,"prioritySupport":false,"customDomainIncluded":false}',
     0, 1, 0, 1, datetime('now'), datetime('now')),
    ('pro', 'à¤ªà¥à¤°à¥à¤«à¥à¤¶à¤¨à¤² à¤ªà¥à¤²à¤¾à¤¨ (Professional)', 'à¤¸à¥à¤¨à¤¿à¤¯à¤° à¤¸à¥à¤à¥à¤à¤¡à¤°à¥ à¤µ à¤¤à¥à¤à¥ à¤¸à¥ à¤¬à¤¢à¤¼à¤¤à¥ à¤µà¤¿à¤¦à¥à¤¯à¤¾à¤²à¤¯à¥à¤ (1500 à¤à¤¾à¤¤à¥à¤°à¥à¤ à¤¤à¤) à¤à¥ à¤²à¤¿à¤', 'à¤¸à¤°à¥à¤µà¤¾à¤§à¤¿à¤ à¤²à¥à¤à¤ªà¥à¤°à¤¿à¤¯', 501, 1428, 4812,
     1500, 100, '1500 à¤µà¤¿à¤¦à¥à¤¯à¤¾à¤°à¥à¤¥à¥',
     '["dashboard","students","attendance","staff","notices","fees","exams","principal","settings","billing"]',
     '["à¤¸à¥à¤à¤¾à¤°à¥à¤à¤° à¤à¥ à¤¸à¤­à¥ à¤¸à¥à¤µà¤¿à¤§à¤¾à¤à¤","à¤µà¤¿à¤¸à¥à¤¤à¥à¤¤ à¤°à¤¿à¤ªà¥à¤°à¥à¤ à¤à¤¾à¤°à¥à¤¡ à¤µ à¤ªà¤°à¥à¤à¥à¤·à¤¾ à¤ªà¤°à¤¿à¤£à¤¾à¤®","à¤ªà¥à¤°à¤§à¤¾à¤¨à¤¾à¤à¤¾à¤°à¥à¤¯ à¤¨à¤¿à¤¯à¥à¤à¥à¤¤à¤¿ à¤à¤µà¤ à¤à¤¤à¤¿à¤¹à¤¾à¤¸","à¤à¤à¥-à¤ªà¥ à¤°à¤¿à¤à¤°à¤¿à¤à¤ à¤¬à¤¿à¤²à¤¿à¤à¤ (UPI/e-NACH)","à¤à¤¸à¥à¤à¤® à¤¡à¥à¤®à¥à¤¨ à¤à¤®à¥à¤² à¤à¤¡-à¤à¤¨","à¤ªà¥à¤°à¤¾à¤¥à¤®à¤¿à¤à¤¤à¤¾ à¤¤à¤à¤¨à¥à¤à¥ à¤¸à¤¹à¤¾à¤¯à¤¤à¤¾"]',
     '{"reportCards":true,"principalHistory":true,"autopay":true,"domainEmail":true,"multiSchool":false,"prioritySupport":true,"customDomainIncluded":false}',
     1, 1, 0, 2, datetime('now'), datetime('now')),
    ('enterprise', 'à¤à¤à¤à¤°à¤ªà¥à¤°à¤¾à¤à¤ à¤ªà¥à¤²à¤¾à¤¨ (Enterprise)', 'à¤¬à¤¡à¤¼à¥ à¤¸à¤à¤¸à¥à¤¥à¤¾à¤¨à¥à¤, à¤à¥à¤°à¤¸à¥à¤ à¤µ à¤¬à¤¹à¥-à¤¶à¤¾à¤à¤¾ à¤à¥à¤°à¥à¤ª à¤à¤« à¤¸à¥à¤à¥à¤²à¥à¤¸ à¤à¥ à¤²à¤¿à¤', 'à¤à¤¸à¥à¤®à¤¿à¤¤ à¤à¥à¤·à¤®à¤¤à¤¾', 1001, 2853, 9612,
     NULL, NULL, 'à¤à¤¸à¥à¤®à¤¿à¤¤ à¤µà¤¿à¤¦à¥à¤¯à¤¾à¤°à¥à¤¥à¥',
     '["dashboard","students","attendance","staff","notices","fees","exams","principal","settings","billing"]',
     '["à¤ªà¥à¤°à¥ à¤à¥ à¤¸à¤­à¥ à¤¸à¥à¤µà¤¿à¤§à¤¾à¤à¤","à¤à¤¸à¥à¤à¤® à¤¡à¥à¤®à¥à¤¨ à¤à¤«à¤¿à¤¶à¤¿à¤¯à¤² à¤à¤®à¥à¤² (à¤¶à¤¾à¤®à¤¿à¤²)","à¤®à¤²à¥à¤à¥-à¤¸à¥à¤à¥à¤² à¤à¥à¤¨à¥à¤¨à¥à¤¸à¥ à¤®à¥à¤¨à¥à¤à¤®à¥à¤à¤","GST à¤à¤¨à¤µà¥à¤à¤¸à¤¿à¤à¤ à¤µ à¤à¤¡à¤¿à¤ à¤°à¤¿à¤ªà¥à¤°à¥à¤à¥à¤¸","à¤¡à¥à¤¡à¤¿à¤à¥à¤à¥à¤¡ à¤à¤à¤¾à¤à¤à¤ à¤®à¥à¤¨à¥à¤à¤°","99.9% à¤à¤ªà¤à¤¾à¤à¤® SLA"]',
     '{"reportCards":true,"principalHistory":true,"autopay":true,"domainEmail":true,"multiSchool":true,"prioritySupport":true,"customDomainIncluded":true}',
     0, 1, 0, 3, datetime('now'), datetime('now'));

-- Migration: 0006_fcm_device_tokens.sql
-- Description: Stores FCM registration tokens for website (web push) and mobile app
-- devices so broadcasts can be delivered directly to website staff devices, and the
-- registry supports future device-level targeting and audit.

CREATE TABLE IF NOT EXISTS fcm_device_tokens (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    user_id TEXT,
    role TEXT DEFAULT 'Parents',
    device_token TEXT UNIQUE NOT NULL,
    device_type TEXT DEFAULT 'mobile_app',
    platform TEXT DEFAULT 'flutter',
    subscribed_topics TEXT DEFAULT '[]',
    is_active INTEGER DEFAULT 1,
    last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (school_id) REFERENCES school_tenants(id)
);

CREATE INDEX IF NOT EXISTS idx_fcm_device_tokens_school ON fcm_device_tokens(school_id, device_type);

-- Migration: 0007_fcm_web_topic_reset.sql
-- Description: One-time data cleanup â reset legacy web-device FCM topics after the web-push topic fix.
-- Older web-device rows stored *derived* FCM topics (school_<id>_all + role topic)
-- even though the web client never actually subscribed to them. The web client now
-- subscribes to topics itself and reports the real list on every registration, so
-- reset legacy web rows to an empty list. This keeps direct-token delivery working
-- until those devices re-register with the updated client.
UPDATE fcm_device_tokens SET subscribed_topics = '[]' WHERE device_type = 'web';

-- Migration: 0008_staff_login_accounts.sql
-- Description: Link staff (teachers) records to system_users login accounts so
-- teachers/staff can log in and receive web push notifications.

ALTER TABLE teachers ADD COLUMN login_user_id TEXT;

-- Migration: 0009_password_reset_tokens.sql
-- Description: Single-use password reset / invite tokens for staff & school users.
-- Tokens are stored only as SHA-256 hashes (never plaintext) and expire after 30 minutes.

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_type TEXT NOT NULL CHECK(user_type IN ('system', 'admin')),
  token_hash TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('invite', 'reset')),
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens(user_id, created_at);

-- Migration: 0010_user_notification_tokens.sql
-- Description: Stores notification tokens for server-side FCM proxy for Cloudflare Workers

CREATE TABLE IF NOT EXISTS user_notification_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    device_token TEXT NOT NULL,
    platform TEXT NOT NULL DEFAULT 'web',
    device_info TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, device_token)
);

CREATE INDEX IF NOT EXISTS idx_user_notification_tokens_user ON user_notification_tokens(user_id);

-- Migration: 0011_web_push_subscriptions.sql
-- Description: Stores native browser Web Push subscriptions (PushSubscription JSON) so
-- the server can deliver real background push notifications via VAPID + RFC 8291.
-- This complements fcm_device_tokens (mobile FCM) and replaces the old fake
-- web-client-* session tokens for actual web push delivery.

CREATE TABLE IF NOT EXISTS web_push_subscriptions (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    user_id TEXT,
    role TEXT DEFAULT 'Staff',
    endpoint TEXT UNIQUE NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    subscribed_topics TEXT DEFAULT '[]',
    is_active INTEGER DEFAULT 1,
    last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (school_id) REFERENCES school_tenants(id)
);

CREATE INDEX IF NOT EXISTS idx_web_push_subscriptions_school ON web_push_subscriptions(school_id, role, is_active);

-- Migration: 0012_class_teacher_assignment.sql
-- Description: Class-teacher assignment and attendance permission schema.

CREATE TABLE IF NOT EXISTS class_teachers (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    class_name TEXT NOT NULL,
    teacher_user_id TEXT NOT NULL,
    teacher_name TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(school_id, class_name)
);

CREATE INDEX IF NOT EXISTS idx_class_teachers_school_class ON class_teachers(school_id, class_name);
CREATE INDEX IF NOT EXISTS idx_class_teachers_teacher ON class_teachers(school_id, teacher_user_id);

CREATE INDEX IF NOT EXISTS idx_attendance_school_date ON attendance(school_id, date);
CREATE INDEX IF NOT EXISTS idx_students_school_status_class ON students(school_id, status, class_name);

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
    conduct TEXT DEFAULT 'à¤à¤¤à¥à¤à¥à¤·à¥à¤ à¤à¤µà¤ à¤à¤°à¤¿à¤¤à¥à¤°à¤µà¤¾à¤¨ (Good & Exemplary)',
    working_days TEXT DEFAULT '210',
    present_days TEXT DEFAULT '194',
    fees_dues_status TEXT DEFAULT 'à¤®à¤¾à¤°à¥à¤ 2026 à¤¤à¤ à¤¸à¤®à¤¸à¥à¤¤ à¤¶à¥à¤²à¥à¤ à¤à¥à¤à¤¤à¤¾ (All Dues Cleared)',
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

- -   M i g r a t i o n :   0 0 1 6 _ d y n a m i c _ s c h o o l _ m a n a g e m e n t . s q l  
 - -   D e s c r i p t i o n :   A d d s   t a b l e s   f o r   D y n a m i c   S u b j e c t s ,   M a r k s h e e t   T e r m s ,   F e e   H e a d s ,   a n d   L e a v e   A p p l i c a t i o n s  
  
 - -   1 .   D y n a m i c   S u b j e c t s   &   C l a s s   M a p p i n g  
 C R E A T E   T A B L E   I F   N O T   E X I S T S   s u b j e c t s   (  
         i d   T E X T   P R I M A R Y   K E Y ,  
         s c h o o l _ i d   T E X T   N O T   N U L L ,  
         s u b j e c t _ n a m e   T E X T   N O T   N U L L ,  
         s u b j e c t _ c o d e   T E X T ,  
         c r e a t e d _ a t   T I M E S T A M P   D E F A U L T   C U R R E N T _ T I M E S T A M P ,  
         F O R E I G N   K E Y   ( s c h o o l _ i d )   R E F E R E N C E S   s c h o o l _ t e n a n t s ( i d )  
 ) ;  
  
 C R E A T E   T A B L E   I F   N O T   E X I S T S   c l a s s _ s u b j e c t s   (  
         i d   T E X T   P R I M A R Y   K E Y ,  
         s c h o o l _ i d   T E X T   N O T   N U L L ,  
         c l a s s _ n a m e   T E X T   N O T   N U L L ,  
         s u b j e c t _ i d   T E X T   N O T   N U L L ,  
         s u b j e c t _ t y p e   T E X T   D E F A U L T   ' T h e o r y '   C H E C K ( s u b j e c t _ t y p e   I N   ( ' T h e o r y ' ,   ' P r a c t i c a l ' ,   ' C o - S c h o l a s t i c ' ) ) ,  
         i s _ o p t i o n a l   I N T E G E R   D E F A U L T   0 ,  
         m a x _ m a r k s   R E A L   D E F A U L T   1 0 0 ,  
         c r e a t e d _ a t   T I M E S T A M P   D E F A U L T   C U R R E N T _ T I M E S T A M P ,  
         F O R E I G N   K E Y   ( s c h o o l _ i d )   R E F E R E N C E S   s c h o o l _ t e n a n t s ( i d ) ,  
         F O R E I G N   K E Y   ( s u b j e c t _ i d )   R E F E R E N C E S   s u b j e c t s ( i d )  
 ) ;  
  
 - -   2 .   E x a m   T e r m s   f o r   D y n a m i c   M a r k s h e e t s  
 C R E A T E   T A B L E   I F   N O T   E X I S T S   e x a m _ t e r m s   (  
         i d   T E X T   P R I M A R Y   K E Y ,  
         s c h o o l _ i d   T E X T   N O T   N U L L ,  
         t e r m _ n a m e   T E X T   N O T   N U L L ,   - -   e . g . ,   ' T e r m   1 ' ,   ' T e r m   2 ' ,   ' H a l f - Y e a r l y '  
         w e i g h t a g e _ p e r c e n t   R E A L   D E F A U L T   1 0 0 ,  
         c r e a t e d _ a t   T I M E S T A M P   D E F A U L T   C U R R E N T _ T I M E S T A M P ,  
         F O R E I G N   K E Y   ( s c h o o l _ i d )   R E F E R E N C E S   s c h o o l _ t e n a n t s ( i d )  
 ) ;  
  
 - -   3 .   L e a v e   A p p l i c a t i o n s   f o r   S t u d e n t s  
 C R E A T E   T A B L E   I F   N O T   E X I S T S   l e a v e _ a p p l i c a t i o n s   (  
         i d   T E X T   P R I M A R Y   K E Y ,  
         s c h o o l _ i d   T E X T   N O T   N U L L ,  
         s t u d e n t _ i d   T E X T   N O T   N U L L ,  
         s t a r t _ d a t e   T E X T   N O T   N U L L ,  
         e n d _ d a t e   T E X T   N O T   N U L L ,  
         r e a s o n   T E X T   N O T   N U L L ,  
         s t a t u s   T E X T   D E F A U L T   ' P e n d i n g '   C H E C K ( s t a t u s   I N   ( ' P e n d i n g ' ,   ' A p p r o v e d ' ,   ' R e j e c t e d ' ) ) ,  
         a p p l i e d _ b y _ u s e r _ i d   T E X T ,  
         a p p r o v e d _ b y _ u s e r _ i d   T E X T ,  
         c r e a t e d _ a t   T I M E S T A M P   D E F A U L T   C U R R E N T _ T I M E S T A M P ,  
         F O R E I G N   K E Y   ( s c h o o l _ i d )   R E F E R E N C E S   s c h o o l _ t e n a n t s ( i d ) ,  
         F O R E I G N   K E Y   ( s t u d e n t _ i d )   R E F E R E N C E S   s t u d e n t s ( i d )  
 ) ;  
  
 - -   4 .   D y n a m i c   F e e   S t r u c t u r e s  
 C R E A T E   T A B L E   I F   N O T   E X I S T S   f e e _ h e a d s   (  
         i d   T E X T   P R I M A R Y   K E Y ,  
         s c h o o l _ i d   T E X T   N O T   N U L L ,  
         h e a d _ n a m e   T E X T   N O T   N U L L ,   - -   e . g . ,   ' T u i t i o n   F e e ' ,   ' T r a n s p o r t   F e e '  
         d e s c r i p t i o n   T E X T ,  
         c r e a t e d _ a t   T I M E S T A M P   D E F A U L T   C U R R E N T _ T I M E S T A M P ,  
         F O R E I G N   K E Y   ( s c h o o l _ i d )   R E F E R E N C E S   s c h o o l _ t e n a n t s ( i d )  
 ) ;  
  
 C R E A T E   T A B L E   I F   N O T   E X I S T S   c l a s s _ f e e _ s t r u c t u r e   (  
         i d   T E X T   P R I M A R Y   K E Y ,  
         s c h o o l _ i d   T E X T   N O T   N U L L ,  
         c l a s s _ n a m e   T E X T   N O T   N U L L ,  
         f e e _ h e a d _ i d   T E X T   N O T   N U L L ,  
         a m o u n t   R E A L   N O T   N U L L ,  
         b i l l i n g _ c y c l e   T E X T   D E F A U L T   ' M o n t h l y '   C H E C K ( b i l l i n g _ c y c l e   I N   ( ' M o n t h l y ' ,   ' Q u a r t e r l y ' ,   ' A n n u a l ' ,   ' O n e - T i m e ' ) ) ,  
         c r e a t e d _ a t   T I M E S T A M P   D E F A U L T   C U R R E N T _ T I M E S T A M P ,  
         F O R E I G N   K E Y   ( s c h o o l _ i d )   R E F E R E N C E S   s c h o o l _ t e n a n t s ( i d ) ,  
         F O R E I G N   K E Y   ( f e e _ h e a d _ i d )   R E F E R E N C E S   f e e _ h e a d s ( i d )  
 ) ;  
 