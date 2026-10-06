// api/lib/login-rate-limit.ts
// A D1-backed fixed-window rate limiter for the unauthenticated login endpoint.
//
// WHY THE LOGIN ENDPOINT SPECIFICALLY
//
// /api/auth/login verifies a password with 100,000-iteration PBKDF2
// (api/lib/auth.ts). That makes every attempt expensive on purpose, and it also
// makes an unlimited endpoint expensive to the operator: an attacker gets both
// an online password-guessing oracle and a CPU-exhaustion vector against the
// Worker, for free, without an account.
//
// The codebase already documents this reasoning for the sibling endpoint:
// api/admin/index.ts says /api/admin/bootstrap "forces a PBKDF2 derivation per
// call, making it a free CPU-exhaustion vector against the Worker". The same
// applies here and was not implemented.
//
// WHY D1 AND NOT KV
//
// CONFIG_KV is the obvious place for a counter, but it is deliberately absent
// from Previews (wrangler.toml: "there is deliberately no `kv_namespaces`
// binding on Previews"). A limiter that silently does nothing in the one
// environment where you would test it is worse than no limiter. D1 is bound on
// every worker, and the table is migration 0043.
//
// FAIL-OPEN, DELIBERATELY, AND ONLY HERE
//
// If the limiter itself throws -- migration 0043 has not been applied yet, the
// binding is missing, D1 is unavailable -- login CONTINUES. Login is the one
// endpoint where failing closed locks every user out of the product, and a
// missing rate limit is a far smaller problem than a platform nobody can sign in
// to. Every other check in this codebase fails closed, and several of the
// comments in this repo argue for that; login is the exception, and the reason
// is availability rather than convenience.
//
// The consequence is honest: a deployment that has not applied 0043 is
// unprotected against guessing. So the failure is logged, loudly, rather than
// swallowed -- the operator is told, and the check that the table exists is in
// verify-login-rate-limit.mjs.

export interface RateLimitVerdict {
  allowed: boolean;
  remaining: number;
  /** Seconds until the current window ends. Only meaningful when !allowed. */
  retryAfterSeconds: number;
  /** Set when the limiter could not be consulted at all. */
  degraded?: boolean;
}

const WINDOW_MS = 15 * 60 * 1000;

/**
 * Per-identifier limit. Tight enough to stop a guessing run, loose enough that a
 * user who fumbles their password a few times is not locked out mid-work.
 */
const IDENTIFIER_LIMIT = 5;

/**
 * Per-IP limit. Deliberately much higher than the identifier limit: many staff
 * of one school sit behind a single school NAT, so this exists to stop a broad
 * spray, not to police a shared connection.
 */
const IP_LIMIT = 30;

function windowKey(kind: string, value: string): string {
  return kind + ':' + value;
}

function normaliseIp(ip: string): string {
  return String(ip || '').trim().toLowerCase().slice(0, 64);
}

async function readAttempts(db: any, key: string, now: number): Promise<number> {
  const row = await db
    .prepare('SELECT window_start, attempts FROM login_rate_limits WHERE rate_key = ?')
    .bind(key)
    .first();
  if (!row) return 0;
  // A row from a previous window counts as nothing.
  if (Number(row.window_start || 0) + WINDOW_MS <= now) return 0;
  return Number(row.attempts || 0);
}

/**
 * Increments the counter by exactly one, atomically.
 *
 * This used to take an absolute `attempts` value computed by the caller from its own
 * earlier read, and write it with `attempts = excluded.attempts`. That is a
 * read-modify-write across two statements, so N concurrent wrong-password requests all
 * read the same N-1 and all wrote N: the counter advanced by one no matter how many
 * attempts actually happened. An attacker who parallelised their guesses therefore
 * defeated both jobs this limiter exists for — the online password-guessing oracle and
 * the PBKDF2 CPU-exhaustion vector described in the header.
 *
 * The increment now happens inside the upsert, so the database applies it. `window_start`
 * is rolled forward only when the stored window has actually closed, which is the same
 * rule readAttempts applies, so the two cannot disagree about whether a row is live.
 */
async function incrementAttempts(db: any, key: string, now: number): Promise<void> {
  const windowStart = Math.floor(now / WINDOW_MS) * WINDOW_MS;
  await db
    .prepare(
      `INSERT INTO login_rate_limits (rate_key, window_start, attempts) VALUES (?, ?, 1)
       ON CONFLICT(rate_key) DO UPDATE SET
         attempts = CASE
           WHEN login_rate_limits.window_start + ? <= ? THEN 1
           ELSE login_rate_limits.attempts + 1
         END,
         window_start = CASE
           WHEN login_rate_limits.window_start + ? <= ? THEN ?
           ELSE login_rate_limits.window_start
         END`,
    )
    .bind(key, windowStart, WINDOW_MS, now, WINDOW_MS, now, windowStart)
    .run();
}

/**
 * Best-effort prune of windows that have closed. There is no cron that is
 * guaranteed to run, so this rides along on a write and keeps the table
 * proportional to recent activity rather than to all traffic since deploy.
 * A failure here is not the caller's problem and is deliberately ignored.
 */
async function pruneExpired(db: any, now: number): Promise<void> {
  try {
    await db
      .prepare('DELETE FROM login_rate_limits WHERE window_start < ?')
      .bind(Math.floor(now / WINDOW_MS) * WINDOW_MS)
      .run();
  } catch (_) {
    // Intentionally ignored.
  }
}

const ALWAYS_ALLOWED: RateLimitVerdict = { allowed: true, remaining: IDENTIFIER_LIMIT, retryAfterSeconds: 0 };

/**
 * Checks both limits and reports the stricter of the two.
 *
 * This is called BEFORE the password is verified, so a locked-out caller never
 * reaches the PBKDF2 derivation. That is the whole point: the CPU cost is what
 * is being protected, so the limit has to be consulted first.
 */
export async function checkLoginRateLimit(
  db: any,
  identifier: string,
  ip: string,
): Promise<RateLimitVerdict> {
  if (!db) return { ...ALWAYS_ALLOWED, degraded: true };
  const now = Date.now();
  const idKey = windowKey('user', String(identifier || '').toLowerCase());
  const ipKey = windowKey('ip', normaliseIp(ip));

  try {
    const [byId, byIp] = await Promise.all([
      readAttempts(db, idKey, now),
      readAttempts(db, ipKey, now),
    ]);

    const limit = Math.min(
      byId < IDENTIFIER_LIMIT ? IDENTIFIER_LIMIT - byId : 0,
      byIp < IP_LIMIT ? IP_LIMIT - byIp : 0,
    );
    const blocked = byId >= IDENTIFIER_LIMIT || byIp >= IP_LIMIT;

    return {
      allowed: !blocked,
      remaining: limit,
      retryAfterSeconds: blocked ? Math.ceil(WINDOW_MS / 1000) : 0,
    };
  } catch (err: any) {
    // See the header: login fails OPEN, and loudly. See verify-login-rate-limit.mjs.
    console.error(
      '[login-rate-limit] unavailable, login proceeding WITHOUT a limit:',
      err && err.message ? err.message : err,
    );
    return { ...ALWAYS_ALLOWED, degraded: true };
  }
}

/** Records a failed attempt against both the identifier and the source IP. */
export async function recordLoginFailure(
  db: any,
  identifier: string,
  ip: string,
): Promise<void> {
  if (!db) return;
  const now = Date.now();
  const idKey = windowKey('user', String(identifier || '').toLowerCase());
  const ipKey = windowKey('ip', normaliseIp(ip));

  try {
    // Each key is incremented on its own; no read is needed, so nothing can be lost to
    // a concurrent writer. Kept sequential because D1 serialises writes anyway.
    await incrementAttempts(db, idKey, now);
    await incrementAttempts(db, ipKey, now);
    await pruneExpired(db, now);
  } catch (err: any) {
    console.error('[login-rate-limit] could not record a failure:', err && err.message ? err.message : err);
  }
}

/**
 * Clears the counters after a SUCCESSFUL login, so a user who mistyped twice and
 * then got it right is not left one attempt away from a lockout, and so a shared
 * school IP is not penalised for one person's typos.
 */
export async function clearLoginFailures(db: any, identifier: string, ip: string): Promise<void> {
  if (!db) return;
  try {
    await db
      .prepare('DELETE FROM login_rate_limits WHERE rate_key IN (?, ?)')
      .bind(windowKey('user', String(identifier || '').toLowerCase()), windowKey('ip', normaliseIp(ip)))
      .run();
  } catch (err: any) {
    console.error('[login-rate-limit] could not clear counters:', err && err.message ? err.message : err);
  }
}

export const LOGIN_RATE_LIMIT_CONFIG = {
  WINDOW_MS,
  IDENTIFIER_LIMIT,
  IP_LIMIT,
};
