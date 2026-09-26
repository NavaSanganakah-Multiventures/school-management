-- 0039: parent_student_links — tenant-scoped family scoping.
--
-- WHY
-- Migration 0034 added 'Parents' and 'Students' to system_users.role, but no
-- relationship table links a family account to the children it may see. The API
-- therefore had no way to scope a parent/student request to "my own children",
-- and every authenticated role could read the whole school's student records
-- (including Aadhaar and bank details) and every invoice.
--
-- This table provides that mapping. It is the basis for deny-by-default family
-- scoping in api/lib/rbac.ts (getFamilyStudentScope).
--
-- FAIL-CLOSED NOTE
-- api/lib/rbac.ts treats a missing/unreadable parent_student_links as an EMPTY
-- scope, never as "all students". A parent with no linked child therefore sees
-- nothing until a Principal links them — which is the correct default for PII.
--
-- No BEGIN/COMMIT: `wrangler d1 migrations apply` already wraps each file in its
-- own atomic transaction, and raw BEGIN/COMMIT is rejected by wrangler@4 on
-- remote D1 with error code 7500. See .agents/rules/ai-instructions.md.

CREATE TABLE IF NOT EXISTS parent_student_links (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    parent_user_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    relationship TEXT,
    is_primary INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- One link per (school, parent, student): re-running a link is idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS idx_parent_student_links_unique
    ON parent_student_links (school_id, parent_user_id, student_id);

-- Supports the primary lookup: "which children does this parent account own?"
CREATE INDEX IF NOT EXISTS idx_parent_student_links_parent
    ON parent_student_links (school_id, parent_user_id);

-- Supports the reverse lookup and composite-FK enforcement.
CREATE INDEX IF NOT EXISTS idx_parent_student_links_student
    ON parent_student_links (school_id, student_id);

-- ---------------------------------------------------------------------------
-- fee_payment_idempotency
-- ---------------------------------------------------------------------------
-- POST /api/fees/pay records an offline payment (cash/cheque/bank at the school
-- desk) and is now restricted to Director/Principal. Without a key, a retried
-- or double-tapped request would add the same amount twice, because the update
-- is a compare-and-swap that succeeds against a fresh starting value each time.
--
-- A caller-supplied `idempotencyKey` makes the endpoint replay-safe: the first
-- request records the key, and any repeat returns the already-recorded state
-- instead of crediting again.
CREATE TABLE IF NOT EXISTS fee_payment_idempotency (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    invoice_id TEXT NOT NULL,
    amount REAL NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- One record per key per school: a concurrent repeat loses the INSERT and is
-- treated as a replay rather than a second payment.
CREATE UNIQUE INDEX IF NOT EXISTS idx_fee_payment_idempotency_unique
    ON fee_payment_idempotency (school_id, idempotency_key);

CREATE INDEX IF NOT EXISTS idx_fee_payment_idempotency_invoice
    ON fee_payment_idempotency (school_id, invoice_id);
