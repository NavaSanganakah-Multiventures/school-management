-- 0032_subscriptions_recurring.sql
-- Razorpay recurring subscriptions + mandates (auto-debit, Cloudflare-style billing).

-- school_subscriptions: recurring billing tracking
ALTER TABLE school_subscriptions ADD COLUMN razorpay_plan_id TEXT;
ALTER TABLE school_subscriptions ADD COLUMN razorpay_subscription_id TEXT;
ALTER TABLE school_subscriptions ADD COLUMN razorpay_customer_id TEXT;
ALTER TABLE school_subscriptions ADD COLUMN total_cycles INTEGER;
ALTER TABLE school_subscriptions ADD COLUMN remaining_cycles INTEGER;
ALTER TABLE school_subscriptions ADD COLUMN current_cycle_start TEXT;
ALTER TABLE school_subscriptions ADD COLUMN current_cycle_end TEXT;
ALTER TABLE school_subscriptions ADD COLUMN mandate_status TEXT DEFAULT 'none';  -- none/pending/active/revoked
ALTER TABLE school_subscriptions ADD COLUMN paused_at TEXT;

-- Cache of Razorpay plan IDs created from our subscription_plans
CREATE TABLE IF NOT EXISTS razorpay_plans_cache (
    id TEXT PRIMARY KEY,
    platform_plan_id TEXT,
    razorpay_plan_id TEXT UNIQUE,
    period TEXT,                 -- monthly / yearly
    amount INTEGER,              -- paise
    razorpay_item_id TEXT,
    created_at TEXT
);
