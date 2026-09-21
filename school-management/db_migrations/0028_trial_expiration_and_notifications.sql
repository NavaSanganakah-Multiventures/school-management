-- 0028_trial_expiration_and_notifications.sql
-- Automated trial expiration tracking, reminder timestamps, and indexes.

ALTER TABLE school_tenants ADD COLUMN trial_reminder_sent_at TEXT;
ALTER TABLE school_tenants ADD COLUMN trial_expired_sent_at TEXT;

CREATE INDEX IF NOT EXISTS idx_school_tenants_trial ON school_tenants(plan_id, status, trial_ends_at);
