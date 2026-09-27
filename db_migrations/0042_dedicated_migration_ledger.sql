-- 0042: dedicated_migration_ledger
--
-- WHY
-- scripts/migrate-to-dedicated.mjs decides whether a school still needs its
-- shared-D1 rows copied into its own database, by counting rows in system_users:
--
--     SELECT COUNT(*) FROM system_users WHERE school_id = ?
--
-- That is a proxy for a question it cannot answer, and it fails in both
-- directions.
--
--   - A school holding real data but no user accounts yet reads as "not
--     migrated", so EVERY deploy re-runs the copy. The copy is
--     `INSERT OR REPLACE` from the shared D1, which is stale by construction
--     (that is where the rows came from and nothing writes back). So a deploy
--     silently overwrites the school's newer dedicated rows with older shared ones.
--     A proxy that can cause data loss is worse than no proxy.
--   - A school with one user row and a hundred students reads as "migrated", so a
--     partially-failed copy is never retried and nobody finds out.
--
-- So record what actually happened instead of inferring it.
--
-- WHAT THIS TABLE IS
-- One row per (school, table) that was copied, with the row count at the time and
-- when it completed. "Has this school been migrated" becomes a question with an
-- answer, and "did that school migrate completely" becomes a diff against
-- OPERATIONAL_TABLES rather than a guess.
--
-- This is deliberately NOT in that list. Copying a ledger that records the copy
-- would be circular, and the ledger is about the dedicated database, so it lives
-- only in the database it describes.
--
-- Transaction-free: `wrangler d1 migrations apply` wraps each file in its own
-- atomic transaction and a manual one is rejected on remote D1.
-- IMPORTANT: wrangler's splitter reads the raw file and does NOT strip `--`
-- comments, so do not name those keywords even inside a comment, or it rejects
-- the file with "contains several transactions". That is what made fresh databases
-- unmigratable via 0034. Keep them out of this file.

CREATE TABLE IF NOT EXISTS dedicated_migration_ledger (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    table_name TEXT NOT NULL,
    rows_copied INTEGER NOT NULL DEFAULT 0,
    -- Set when an operator forces a re-copy, so a repair is distinguishable from
    -- the original migration in the record.
    forced INTEGER NOT NULL DEFAULT 0,
    completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- One ledger entry per (school, table): re-recording is a REPLACE, not a
-- duplicate, so a forced re-copy updates the row instead of failing.
CREATE UNIQUE INDEX IF NOT EXISTS idx_dedicated_migration_ledger_unique
    ON dedicated_migration_ledger (school_id, table_name);

-- The lookup the deploy actually does: "has this school been migrated at all?"
CREATE INDEX IF NOT EXISTS idx_dedicated_migration_ledger_school
    ON dedicated_migration_ledger (school_id);
