-- Migration: 0026_school_email_quota.sql
-- Description: Phase 3 — plan-based monthly email quota + business-domain (per-school) email sender config.
--   * subscription_plans.email_quota_limit = default monthly quota per plan (NULL = unlimited)
--   * school_subscriptions.email_quota_* = per-school override + usage counter (resets monthly)
--   * school_email_config = per-school sender identity for broadcast/notification email

-- 1. Plan-level default monthly email quota (NULL = unlimited)
ALTER TABLE subscription_plans ADD COLUMN email_quota_limit INTEGER;

UPDATE subscription_plans SET email_quota_limit = 50 WHERE id = 'trial';
UPDATE subscription_plans SET email_quota_limit = 500 WHERE id = 'starter';
UPDATE subscription_plans SET email_quota_limit = 2000 WHERE id = 'pro';
UPDATE subscription_plans SET email_quota_limit = NULL WHERE id = 'enterprise';

-- 2. Per-school monthly quota override + usage counter (school_subscriptions)
ALTER TABLE school_subscriptions ADD COLUMN email_quota_limit INTEGER;
ALTER TABLE school_subscriptions ADD COLUMN email_quota_used INTEGER NOT NULL DEFAULT 0;
ALTER TABLE school_subscriptions ADD COLUMN email_quota_reset_at TEXT;

-- 3. Business-domain (per-school) email sender configuration
CREATE TABLE IF NOT EXISTS school_email_config (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL UNIQUE,
    from_name TEXT DEFAULT '',
    from_email TEXT DEFAULT '',
    reply_to TEXT DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT,
    updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_school_email_config_school_id ON school_email_config(school_id);
