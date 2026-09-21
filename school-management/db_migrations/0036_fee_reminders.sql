-- 0036_fee_reminders.sql
-- Automated fee due reminders (email + push) with idempotency log.

ALTER TABLE fee_invoices ADD COLUMN last_reminder_at TEXT;

CREATE TABLE IF NOT EXISTS fee_reminders_log (
    id TEXT PRIMARY KEY,
    school_id TEXT,
    invoice_id TEXT,
    stage TEXT,              -- 'due_soon' | 'overdue'
    sent_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fee_reminders_stage ON fee_reminders_log(invoice_id, stage);