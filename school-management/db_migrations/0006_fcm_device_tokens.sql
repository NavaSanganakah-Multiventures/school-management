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
