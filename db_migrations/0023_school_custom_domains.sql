-- Migration: 0023_school_custom_domains.sql
-- Description: Create school_custom_domains table for email quota tracking (in case 0003 didn't fully create it).

CREATE TABLE IF NOT EXISTS school_custom_domains (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    domain_name TEXT NOT NULL,
    spf_record_status TEXT DEFAULT 'Verified' CHECK(spf_record_status IN ('Verified', 'Pending', 'Failed')),
    dkim_record_status TEXT DEFAULT 'Verified' CHECK(dkim_record_status IN ('Verified', 'Pending', 'Failed')),
    mx_record_status TEXT DEFAULT 'Verified' CHECK(mx_record_status IN ('Verified', 'Pending', 'Failed')),
    dmarc_record_status TEXT DEFAULT 'Verified' CHECK(dmarc_record_status IN ('Verified', 'Pending', 'Failed')),
    is_active INTEGER DEFAULT 1,
    monthly_sending_quota INTEGER DEFAULT 10000,
    monthly_sent_count INTEGER DEFAULT 0,
    configured_mailboxes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (school_id) REFERENCES school_tenants(id)
);
