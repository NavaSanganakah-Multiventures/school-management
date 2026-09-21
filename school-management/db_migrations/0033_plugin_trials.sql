-- 0033_plugin_trials.sql
-- Plugin trial grants + payment tracking for school_plugins.

ALTER TABLE school_plugins ADD COLUMN trial_ends_at TEXT;
ALTER TABLE school_plugins ADD COLUMN trial_granted_by TEXT;
ALTER TABLE school_plugins ADD COLUMN trial_granted_at TEXT;
ALTER TABLE school_plugins ADD COLUMN payment_status TEXT DEFAULT 'active';  -- trial/active/expired/pending
ALTER TABLE school_plugins ADD COLUMN razorpay_subscription_id TEXT;
ALTER TABLE school_plugins ADD COLUMN razorpay_plan_id TEXT;
ALTER TABLE school_plugins ADD COLUMN razorpay_payment_link_id TEXT;
ALTER TABLE school_plugins ADD COLUMN billing_cycle TEXT;
ALTER TABLE school_plugins ADD COLUMN price_per_cycle REAL;
ALTER TABLE school_plugins ADD COLUMN next_billing_date TEXT;
ALTER TABLE school_plugins ADD COLUMN trial_reminder_sent_at TEXT;
ALTER TABLE school_plugins ADD COLUMN trial_expired_sent_at TEXT;

CREATE INDEX IF NOT EXISTS idx_school_plugins_trial ON school_plugins(payment_status, trial_ends_at);
