-- 0031_payment_links_webhooks.sql
-- Razorpay Payment Links tracking + webhook event audit log.

-- billing_invoices: payment link references + webhook tracking
ALTER TABLE billing_invoices ADD COLUMN razorpay_payment_link_id TEXT;
ALTER TABLE billing_invoices ADD COLUMN razorpay_payment_link_url TEXT;
ALTER TABLE billing_invoices ADD COLUMN webhook_received_at TEXT;

-- Razorpay webhook event log (audit trail + idempotency)
CREATE TABLE IF NOT EXISTS razorpay_webhook_events (
    id TEXT PRIMARY KEY,
    event_id TEXT UNIQUE,              -- Razorpay event id (idempotency key)
    event_type TEXT NOT NULL,          -- e.g. 'payment.captured', 'payment.failed', 'order.paid'
    entity_id TEXT,                    -- payment_id / order_id
    school_id TEXT,
    payload TEXT,                      -- full raw JSON body
    processed INTEGER DEFAULT 0,
    processed_at TEXT,
    received_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_webhook_events_entity ON razorpay_webhook_events(entity_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_type ON razorpay_webhook_events(event_type);
