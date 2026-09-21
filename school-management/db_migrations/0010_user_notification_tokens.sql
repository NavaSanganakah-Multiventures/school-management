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
