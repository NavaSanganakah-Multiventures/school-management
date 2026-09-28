-- 0043: login_rate_limits
--
-- WHY
--
-- POST /api/auth/login had no rate limit, no lockout and no CAPTCHA. Each
-- wrong-password attempt costs a 100,000-iteration PBKDF2 derivation
-- (api/lib/auth.ts hashPassword), so that single endpoint was both:
--
--   - an online password-guessing oracle, and
--   - an unauthenticated CPU-exhaustion vector against the Worker.
--
-- The codebase already recognises this exact pattern for its sibling endpoint:
-- api/admin/index.ts carries a comment saying that /api/admin/bootstrap "forces
-- a PBKDF2 derivation per call, making it a free CPU-exhaustion vector against
-- the Worker". The same reasoning applies to /login and was not applied there.
--
-- WHY D1 AND NOT KV
--
-- CONFIG_KV would be the obvious place for a counter, but it is deliberately
-- absent from Previews (see wrangler.toml: "there is deliberately no
-- `kv_namespaces` binding on Previews"). A limiter that silently does nothing on
-- a preview environment is worse than no limiter, because the one place it is
-- most useful to test is the one place it would not run. D1 is bound on every
-- worker.
--
-- WHAT THIS TABLE IS
-- A fixed-window counter, one row per rate-limit key. The key is namespaced by
-- the caller, so "user:someone@school.test" and "ip:203.0.113.7" are counted
-- independently and a shared NAT address cannot be used to lock a single
-- account out by locking everyone behind it out.
--
-- Counters are cleared on a successful login, so a legitimate user who
-- mistypes twice and then logs in is not left one attempt from a lockout.
--
-- ROW HYGIENE
-- Rows are small and self-limiting but are not deleted on a schedule, because a
-- Worker has no cron that is guaranteed to run and an unbounded table on a
-- dedicated D1 is a slow problem rather than an urgent one. The read path
-- ignores rows whose window has expired, so an old row is inert; see
-- api/lib/login-rate-limit.ts, which also prunes expired rows opportunistically
-- on write so the table stays proportional to recent activity.
--
-- Transaction-free: `wrangler d1 migrations apply` wraps each file in its own
-- atomic transaction and a manual one is rejected on remote D1.
-- IMPORTANT: wrangler's splitter reads the raw file and does NOT strip `--`
-- comments, so do not name those keywords even inside a comment, or it rejects
-- the file with "contains several transactions". That is what made fresh
-- databases unmigratable via 0034. Keep them out of this file.

CREATE TABLE IF NOT EXISTS login_rate_limits (
    rate_key TEXT PRIMARY KEY,
    -- Unix milliseconds at which the current window opened.
    window_start INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0
);

-- The read path is "is this key over its limit", which is the primary key. This
-- index supports the opportunistic prune by window_start.
CREATE INDEX IF NOT EXISTS idx_login_rate_limits_window
    ON login_rate_limits (window_start);
