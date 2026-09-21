-- Migration: 0024_email_quota.sql
-- Description: Daily email sending quota / rate-limit counters.
-- Purpose: Anti-abuse for unauthenticated email flows (forgot-password) and daily volume control.

CREATE TABLE IF NOT EXISTS email_quota (
    id TEXT PRIMARY KEY,
    day TEXT NOT NULL,
    recipient TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(day, recipient)
);

CREATE INDEX IF NOT EXISTS idx_email_quota_day ON email_quota(day);
