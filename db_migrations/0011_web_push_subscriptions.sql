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
