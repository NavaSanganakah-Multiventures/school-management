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
