-- 0040: multi-tenant uniqueness + payment-application ledger (Phase 2)
--
-- PART A — global UNIQUE constraints that break the second school
--
-- `teachers.employee_code` and `fee_invoices.invoice_number` were declared
-- UNIQUE at the GLOBAL level in migration 0001, before per-school dedicated
-- databases existed. But both are generated per school from a per-school
-- counter:
--
--     api/staff/index.ts  -> the first teacher of EVERY school is 'EMP-010'
--     api/fees/index.ts   -> the first invoice of EVERY school is 'INV-2026/001'
--
-- So the second school registered on the platform could never insert its first
-- teacher or its first fee invoice. These are display codes, not lookup keys,
-- so scoping uniqueness to (school_id, code) is the correct fix.
--
-- DELIBERATELY NOT CHANGED: `system_users.email` stays globally UNIQUE.
-- api/auth/index.ts:83 logs a user in with
--     SELECT * FROM system_users WHERE LOWER(email) = ? OR LOWER(username) = ?
-- with no tenant predicate, so a shared email would make login ambiguous and
-- could authenticate against the wrong school. Loosening that constraint
-- requires school-scoped login resolution first and is deliberately out of
-- scope here.
--
-- SQLite cannot ALTER a UNIQUE constraint, so each table is rebuilt. The
-- existing rows are copied verbatim. `school_id` is backfilled first where it is
-- still NULL, because a composite UNIQUE treats NULLs as distinct and would
-- otherwise silently stop enforcing anything.
--
-- PART B — payment-application ledger
--
-- `razorpay_webhook_events.event_id` only deduplicated a single delivery. It
-- could not stop one *payment* being applied twice, because Razorpay emits both
-- `payment.captured` and `order.paid` for the same payment, and the old code
-- synthesised the event id as `eventType + '-' + payment_id`, so the two events
-- had different keys and both ran the activation path. `payment_ledger` is
-- keyed on the payment id itself and is claimed BEFORE the side effect, so a
-- payment is applied exactly once no matter how many events reference it.
--
-- Transaction-free: `wrangler d1 migrations apply` wraps each migration in its own
-- atomic transaction, and a manual one is rejected by wrangler on remote D1.
-- IMPORTANT: wrangler's splitter reads the raw file and does NOT strip `--`
-- comments, so naming those keywords even inside a comment makes it reject the
-- file with "contains several transactions" — which is what made fresh databases
-- unmigratable via migration 0034. Keep them out of this file.

-- ── Backfill any NULL tenant keys so the composite constraints actually bind ──
UPDATE teachers SET school_id = 'school-01' WHERE school_id IS NULL OR school_id = '';
UPDATE fee_invoices SET school_id = 'school-01' WHERE school_id IS NULL OR school_id = '';

-- ── PART A.1: teachers.employee_code → UNIQUE(school_id, employee_code) ──
CREATE TABLE teachers_mig0040 (
    id TEXT PRIMARY KEY,
    employee_code TEXT NOT NULL,
    name TEXT NOT NULL,
    designation TEXT NOT NULL,
    department TEXT NOT NULL,
    subject_specialization TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    qualification TEXT,
    salary REAL DEFAULT 0,
    joining_date TEXT,
    status TEXT DEFAULT 'Active',
    login_user_id TEXT,
    school_id TEXT DEFAULT 'school-01'
);

INSERT INTO teachers_mig0040
SELECT id, employee_code, name, designation, department, subject_specialization,
       phone, email, qualification, salary, joining_date, status, login_user_id, school_id
FROM teachers;

DROP TABLE teachers;
ALTER TABLE teachers_mig0040 RENAME TO teachers;

CREATE UNIQUE INDEX IF NOT EXISTS idx_teachers_school_employee_code
    ON teachers (school_id, employee_code);
CREATE INDEX IF NOT EXISTS idx_teachers_school
    ON teachers (school_id);

-- ── PART A.2: fee_invoices.invoice_number → UNIQUE(school_id, invoice_number) ──
CREATE TABLE fee_invoices_mig0040 (
    id TEXT PRIMARY KEY,
    invoice_number TEXT NOT NULL,
    student_id TEXT,
    student_name TEXT,
    class_name TEXT,
    section TEXT,
    title TEXT,
    total_amount REAL DEFAULT 0,
    paid_amount REAL DEFAULT 0,
    due_date TEXT,
    status TEXT DEFAULT 'Unpaid',
    payment_method TEXT,
    transaction_id TEXT,
    paid_at TEXT,
    school_id TEXT DEFAULT 'school-01',
    scholar_number TEXT
);

INSERT INTO fee_invoices_mig0040
SELECT id, invoice_number, student_id, student_name, class_name, section, title,
       total_amount, paid_amount, due_date, status, payment_method, transaction_id,
       paid_at, school_id, scholar_number
FROM fee_invoices;

DROP TABLE fee_invoices;
ALTER TABLE fee_invoices_mig0040 RENAME TO fee_invoices;

CREATE UNIQUE INDEX IF NOT EXISTS idx_fee_invoices_school_number
    ON fee_invoices (school_id, invoice_number);
CREATE INDEX IF NOT EXISTS idx_fee_invoices_school_status
    ON fee_invoices (school_id, status);
CREATE INDEX IF NOT EXISTS idx_fee_invoices_school_student
    ON fee_invoices (school_id, student_id);

-- ── PART A.3: school_subscriptions.cancel_at_cycle_end ──
-- api/billing/index.ts needs to record that a cancellation was requested at the
-- END of the current cycle rather than immediately. Without it, a cancel-at-end
-- was stored as a full "Canceled" while Razorpay kept the subscription active
-- and still able to debit, so the platform reported the mandate as dead when it
-- was not. 1 = cancel at cycle end, 0 = immediate.
ALTER TABLE school_subscriptions ADD COLUMN cancel_at_cycle_end INTEGER DEFAULT 0;

-- ── PART B: payment-application ledger ─────────────────────────────────
-- Claimed with an INSERT before any side effect. A duplicate claim raises a
-- UNIQUE violation, which the webhook treats as "already applied" (200) while
-- any OTHER database error is surfaced as 500 so Razorpay retries.
--
-- A failed claim is released by deleting the row, so a genuine transient
-- failure is not permanently swallowed.
CREATE TABLE IF NOT EXISTS payment_ledger (
    payment_id TEXT PRIMARY KEY,
    school_id TEXT,
    kind TEXT,                 -- student_fee | subscription | plugin
    reference_id TEXT,         -- invoice id / subscription id / plugin id
    amount_inr REAL,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payment_ledger_school
    ON payment_ledger (school_id);
CREATE INDEX IF NOT EXISTS idx_payment_ledger_reference
    ON payment_ledger (school_id, kind, reference_id);
