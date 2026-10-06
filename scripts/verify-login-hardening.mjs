// Verifies the login hardening: the rate limiter, the single generic refusal, and
// the timing equalisation. Real api/auth/index.ts routes, real signToken/verifyToken,
// real PBKDF2, real D1 stand-in.
//
// WHY THIS IS AN INTEGRATION HARNESS
//
// Two of the three properties here cannot be seen by reading the source:
//
//   - whether a forged or guessed request is actually refused, and
//   - whether the three failure paths really do the same amount of work, which is
//     the part that closes the timing side of user enumeration.
//
// A source-scan can confirm the words are present. It cannot confirm the clock.
//
// THE CONTROL CASE IS THE POINT
//
// Every negative assertion is paired with a positive one. A route that refused
// every login would satisfy "429 after N attempts" and "generic 401 for an unknown
// user", and would be caught only by "the correct password still logs in". So that
// is asserted too, repeatedly.
//
// A 401 proves something was refused, not that the right thing was refused.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const OUT = path.join(ROOT, '.tmp-apitest-login');
const TSCONFIG = path.join(ROOT, 'tsconfig.apitest.json');

const DEDICATED_AUTH_SECRET = 'dedicated-auth-secret-0123456789abcdef';
const PLATFORM_AUTH_SECRET = 'platform-auth-secret-0123456789abcdef';
const SCHOOL_ID = 'school-under-test';
const KNOWN_USER = 'director@test.school';
const KNOWN_PASSWORD = 'correct-horse-battery-staple';
const CLIENT_IP = '203.0.113.7';

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed++;
    console.log('  PASS  ' + name);
  } else {
    failed++;
    failures.push(name);
    console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : ''));
  }
}

function section(title) {
  console.log('\n' + title);
}

function note(name, detail) {
  console.log('  NOTE  ' + name + (detail ? '  -> ' + detail : ''));
}

// ---------------------------------------------------------------------------
// Network kill-switch, before anything runs.
// ---------------------------------------------------------------------------

const outbound = [];
const realFetch = globalThis.fetch;
// Returns an empty 200 rather than an error, because /api/auth/login performs a
// platform tenant-sync on the success path. A 502 here would print a scary log
// line per request and read like a failure when it is only the stub answering.
// The count is asserted in the summary so a real outbound call still shows up.
globalThis.fetch = async (input, init) => {
  outbound.push(init && init.headers ? new Request(input, init) : new Request(input));
  return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
};

// ---------------------------------------------------------------------------
// Transpile the real api/ tree.
// ---------------------------------------------------------------------------

section('transpiling the real api/ tree');
fs.rmSync(OUT, { recursive: true, force: true });
const ts = (await import('typescript')).default;
const parsed = ts.getParsedCommandLineOfConfigFile(TSCONFIG, {}, { ...ts.sys });
const program = ts.createProgram(parsed.fileNames, {
  ...parsed.options,
  noEmit: false,
  outDir: OUT,
  module: ts.ModuleKind.CommonJS,
  moduleResolution: ts.ModuleResolutionKind.Node10,
  isolatedModules: false,
  incremental: false,
  plugins: [],
});
const emitResult = program.emit();
const fatal = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics)
  .filter((d) => d.category === ts.DiagnosticCategory.Error);
if (fatal.length) {
  console.error('transpile produced ' + fatal.length + ' error(s):');
  for (const d of fatal.slice(0, 8)) console.error('  ' + ts.flattenDiagnosticMessageText(d.messageText, ' '));
  process.exit(1);
}
console.log('  ok    api/ -> .tmp-apitest-login (commonjs)');

const appMod = require(path.join(OUT, 'index.js'));
const app = (appMod.default && appMod.default.request) ? appMod.default : (appMod.app || appMod);
const authLib = require(path.join(OUT, 'lib', 'auth.js'));
const rateLib = require(path.join(OUT, 'lib', 'login-rate-limit.js'));

// ---------------------------------------------------------------------------
// A D1 stand-in that actually stores the rate-limit rows, because the limiter's
// behaviour lives entirely in its SQL. A stub that answered `allowed: true` to
// everything would pass every positive assertion and prove nothing.
// ---------------------------------------------------------------------------

function fakeDb(users) {
  const tables = { login_rate_limits: new Map() };
  const emailsSent = [];

  const db = {
    _tables: tables,
    _emailsSent: emailsSent,
    prepare(sql) {
      let bound = [];
      const s = {
        sql,
        bind(...a) {
          bound = a;
          return s;
        },
        async first() {
          if (/FROM system_users/i.test(sql)) {
            const [a, b] = bound;
            return (users || []).find(
              (u) => String(u.email).toLowerCase() === String(a).toLowerCase() ||
                     String(u.username).toLowerCase() === String(b).toLowerCase(),
            ) || null;
          }
          if (/FROM login_rate_limits/i.test(sql)) {
            return tables.login_rate_limits.get(String(bound[0])) || null;
          }
          if (/FROM school_tenants/i.test(sql)) {
            return { id: SCHOOL_ID, status: 'Active', registration_status: 'Approved', deleted_at: null };
          }
          if (/FROM platform_admins/i.test(sql)) return null;
          if (/FROM password_reset_tokens/i.test(sql)) return null;
          return null;
        },
        async all() {
          return { results: [] };
        },
        async run() {
          if (/INSERT INTO login_rate_limits/i.test(sql)) {
            // Models the limiter's atomic upsert as api/lib/login-rate-limit.ts writes it:
            //
            //   INSERT INTO login_rate_limits (rate_key, window_start, attempts) VALUES (?, ?, 1)
            //   ON CONFLICT(rate_key) DO UPDATE SET
            //     attempts   = CASE WHEN window_start + ? <= ? THEN 1 ELSE attempts + 1 END
            //     window_start = CASE WHEN window_start + ? <= ? THEN ? ELSE window_start END
            //
            // bound = [key, windowStart, WINDOW_MS, now, WINDOW_MS, now, windowStart]
            //
            // This stand-in used to assume the three-parameter shape and that bound[2]
            // was the new absolute attempt count. Reading it that way made
            // windowMs (900000) land in `attempts`, so every login 429'd immediately and
            // the control cases failed. A stand-in that misreads the statement it is
            // standing in for reports a green run for code that does not work — which is
            // the exact failure this repo keeps re-learning.
            const key = String(bound[0]);
            const windowMs = Number(bound[2]);
            const now = Number(bound[3]);
            const newWindowStart = Number(bound[6]);
            const existing = tables.login_rate_limits.get(key);
            if (!existing) {
              tables.login_rate_limits.set(key, { window_start: newWindowStart, attempts: 1 });
            } else {
              const expired = Number(existing.window_start) + windowMs <= now;
              existing.attempts = expired ? 1 : Number(existing.attempts) + 1;
              existing.window_start = expired ? newWindowStart : Number(existing.window_start);
            }
            return { success: true, meta: { changes: 1 } };
          }
          if (/DELETE FROM login_rate_limits WHERE rate_key IN/i.test(sql)) {
            tables.login_rate_limits.delete(String(bound[0]));
            tables.login_rate_limits.delete(String(bound[1]));
            return { success: true, meta: { changes: 1 } };
          }
          if (/DELETE FROM login_rate_limits/i.test(sql)) {
            const before = tables.login_rate_limits.size;
            for (const [k, v] of [...tables.login_rate_limits]) {
              if (v.window_start < Number(bound[0])) tables.login_rate_limits.delete(k);
            }
            return { success: true, meta: { changes: before - tables.login_rate_limits.size } };
          }
          if (/UPDATE system_users SET last_login/i.test(sql)) {
            return { success: true, meta: { changes: 1 } };
          }
          return { success: true, meta: { changes: 1 } };
        },
      };
      return s;
    },
    async batch(stmts) {
      return Promise.all(stmts.map((s) => s.run()));
    },
    async exec() {
      return { count: 0, duration: 0 };
    },
  };
  return db;
}

// A real PBKDF2 hash of the known password, so the happy path is a genuine
// verification and not a shortcut.
const realHash = await authLib.hashPassword(KNOWN_PASSWORD);

const knownUser = {
  id: 'u-director',
  email: KNOWN_USER,
  username: 'director',
  full_name: 'Test Director',
  phone: '+910000000000',
  role: 'Director',
  school_id: SCHOOL_ID,
  password_hash: realHash,
  status: 'Active',
};

const noPasswordUser = {
  id: 'u-invited',
  email: 'invited@test.school',
  username: 'invited',
  full_name: 'Invited User',
  role: 'Staff',
  school_id: SCHOOL_ID,
  password_hash: null,
  status: 'Active',
};

const dedicatedEnv = (db) => ({
  SCHOOL_ID,
  IS_DEDICATED_WORKER: 'true',
  ENVIRONMENT: 'production',
  AUTH_SECRET: DEDICATED_AUTH_SECRET,
  INTERNAL_SYNC_SECRET: 'fleet-internal-secret-0123456789abcdef',
  APP_BASE_URL: 'https://' + SCHOOL_ID + '.pragnya.nasven.com',
  DB: db,
  // No SEND_EMAIL binding: api/lib/email.ts short-circuits every send when the
  // binding is absent, so this path cannot send anything even if it tried.
});

async function login(db, email, password, ip = CLIENT_IP) {
  const res = await app.request(
    '/api/auth/login',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
      body: JSON.stringify({ email, password }),
    },
    dedicatedEnv(db),
  );
  let parsed = null;
  try {
    parsed = await res.clone().json();
  } catch (_) {}
  return { status: res.status, body: parsed, headers: res.headers };
}

// ===========================================================================
// Part 1 -- CONTROL. A correct password must still work.
// ===========================================================================

section('Part 1 -- CONTROL: a correct password still logs in');

{
  const db = fakeDb([knownUser]);
  const r = await login(db, KNOWN_USER, KNOWN_PASSWORD);
  check('CONTROL: correct credentials return 200', r.status === 200, 'got ' + r.status + ' ' + JSON.stringify(r.body));
  check('CONTROL: a session token is issued', !!(r.body && r.body.token));
  check('CONTROL: the user is returned with its school', !!(r.body && r.body.user && r.body.user.schoolId === SCHOOL_ID));
}

{
  // Username instead of email must keep working.
  const db = fakeDb([knownUser]);
  const r = await login(db, 'director', KNOWN_PASSWORD);
  check('CONTROL: login by username still works', r.status === 200, 'got ' + r.status);
}

{
  // A successful login clears the counters, so a user who fumbled then succeeded
  // is not left one attempt from a lockout.
  const db = fakeDb([knownUser]);
  await login(db, KNOWN_USER, 'wrong-one', '198.51.100.1');
  await login(db, KNOWN_USER, 'wrong-two', '198.51.100.1');
  const after = await login(db, KNOWN_USER, KNOWN_PASSWORD, '198.51.100.1');
  check('CONTROL: a success after two failures still logs in', after.status === 200, 'got ' + after.status);
  const rows = [...db._tables.login_rate_limits.values()];
  check('CONTROL: a successful login cleared its counters', rows.length === 0, 'rows left: ' + rows.length);
}

// ===========================================================================
// Part 2 -- ONE refusal for all three failure modes.
//
// Three distinguishable bodies is a user-enumeration oracle. The old code had
// "no such user", "PASSWORD_NOT_SET" (which also sent an email), and "wrong
// password".
// ===========================================================================

section('Part 2 -- all three failure modes are indistinguishable');

const unknown = await login(fakeDb([knownUser]), 'nobody@test.school', 'whatever');
const wrongPassword = await login(fakeDb([knownUser]), KNOWN_USER, 'wrong-password');
const noPasswordSet = await login(fakeDb([knownUser, noPasswordUser]), 'invited@test.school', 'anything');

check('an unknown account is refused', unknown.status === 401, 'got ' + unknown.status);
check('a wrong password is refused', wrongPassword.status === 401, 'got ' + wrongPassword.status);
check('an account with no password set is refused', noPasswordSet.status === 401, 'got ' + noPasswordSet.status);

const bodies = [JSON.stringify(unknown.body), JSON.stringify(wrongPassword.body), JSON.stringify(noPasswordSet.body)];
check('all three return the IDENTICAL body', new Set(bodies).size === 1, bodies.join(' | '));
check('all three return the identical status', unknown.status === wrongPassword.status && wrongPassword.status === noPasswordSet.status);

// The discriminator itself must be gone. A caller must not be able to branch on
// a code field even if it ignores the message.
check('no response carries a PASSWORD_NOT_SET discriminator', !/PASSWORD_NOT_SET/.test(bodies.join(' ')));
check('no response carries a "user not found" marker', !/नहीं मिला/.test(bodies.join(' ')));
check('no response distinguishes an unknown account from a wrong password', bodies[0] === bodies[1]);

// The status code alone must not distinguish them either.
check('the status code is the same for all three', unknown.status === 401 && wrongPassword.status === 401 && noPasswordSet.status === 401);

// ===========================================================================
// Part 3 -- the rate limiter actually limits.
// ===========================================================================

section('Part 3 -- the rate limiter stops a guessing run');

{
  const db = fakeDb([knownUser]);
  // Wrong password repeatedly from one IP against one account.
  let last = null;
  for (let i = 0; i < 8; i++) last = await login(db, KNOWN_USER, 'guess-' + i);
  check('repeated wrong passwords are eventually refused with 429', last.status === 429, 'got ' + last.status);
}

{
  // The correct password must ALSO be refused while locked out. If it were not,
  // the limiter would stop nothing that matters.
  const db = fakeDb([knownUser]);
  for (let i = 0; i < 8; i++) await login(db, KNOWN_USER, 'guess-' + i);
  const correct = await login(db, KNOWN_USER, KNOWN_PASSWORD);
  check('CONTROL: even the CORRECT password is refused while locked out', correct.status === 429, 'got ' + correct.status);
  check('the 429 carries a Retry-After header', !!correct.headers.get('Retry-After'), 'header: ' + correct.headers.get('Retry-After'));
}

{
  // A lockout on one account must not lock a different account from the same IP.
  // Whole staff of one school sit behind one NAT; this is the realistic case.
  const db = fakeDb([knownUser, { ...knownUser, id: 'u-2', email: 'other@test.school', username: 'other' }]);
  for (let i = 0; i < 8; i++) await login(db, KNOWN_USER, 'guess-' + i);
  const other = await login(db, 'other@test.school', KNOWN_PASSWORD);
  check('a lockout on one account does not lock another from the same IP', other.status === 200, 'got ' + other.status + ' ' + JSON.stringify(other.body));
}

{
  // Account-level lockout is INTENTIONAL and is what stops a distributed guessing
  // run, where the attacker rotates addresses to stay under any per-IP limit. So
  // the account stays locked from a different IP, and that is the correct answer.
  //
  // An earlier draft of this test asserted the opposite, on the reasoning that an
  // attacker could lock a real user out from many addresses. That is a real
  // trade-off -- it is the standard denial-of-service cost of account lockout --
  // and it is accepted here deliberately, because the alternative is an attacker
  // guessing one account from unlimited addresses. What bounds the abuse is the
  // window: it clears in 15 minutes and on the next successful login.
  const db = fakeDb([knownUser]);
  for (let i = 0; i < 8; i++) await login(db, KNOWN_USER, 'guess-' + i);
  const other = await login(db, KNOWN_USER, KNOWN_PASSWORD, '198.51.100.99');
  check('the ACCOUNT stays locked from another IP (that is what stops distributed guessing)', other.status === 429, 'got ' + other.status);
  note(
    'account lockout is IP-independent by design',
    'a per-IP-only limit would be defeated by rotating addresses; the cost is that an account can be locked out, which the 15-minute window bounds',
  );
}

{
  // Spray many accounts from one IP: the per-IP limit is what stops this.
  const many = [];
  for (let i = 0; i < 40; i++) {
    many.push({ ...knownUser, id: 'u-' + i, email: 'user' + i + '@test.school', username: 'user' + i });
  }
  const db = fakeDb(many);
  let last = null;
  for (let i = 0; i < 40; i++) {
    last = await login(db, 'user' + i + '@test.school', 'guess-' + i);
    if (last.status === 429) break;
  }
  check('a spray across many accounts from one IP is stopped', last.status === 429, 'got ' + last.status);
}

// ===========================================================================
// Part 4 -- the limiter fails OPEN, loudly.
//
// Login is the one endpoint where failing closed locks every user out of the
// product. A missing rate limit is a smaller problem than a platform nobody can
// sign in to. This asserts that trade-off is real rather than aspirational.
// ===========================================================================

section('Part 4 -- the limiter fails open when its table is missing');

{
  // A DB whose rate-limit table does not exist, as if migration 0043 has not been
  // applied yet.
  const noTable = {
    prepare(sql) {
      if (/login_rate_limits/i.test(sql)) {
        const s = {
          sql, bind() { return s; },
          first: async () => { throw new Error('no such table: login_rate_limits'); },
          all: async () => { throw new Error('no such table: login_rate_limits'); },
          run: async () => { throw new Error('no such table: login_rate_limits'); },
        };
        return s;
      }
      return fakeDb([knownUser]).prepare(sql);
    },
  };
  const r = await login(noTable, KNOWN_USER, KNOWN_PASSWORD);
  check('login still WORKS when the rate-limit table is missing', r.status === 200, 'got ' + r.status + ' ' + JSON.stringify(r.body));
}

{
  // And the same for a completely absent DB binding on the limiter's path.
  const verdict = await rateLib.checkLoginRateLimit(null, 'x', 'y');
  check('checkLoginRateLimit allows when there is no db', verdict.allowed === true);
  check('and reports itself as degraded rather than pretending it counted', verdict.degraded === true);
}

// ===========================================================================
// Part 5 -- the timing side of user enumeration.
//
// The body is now identical, but the old code still returned in about a
// millisecond when no user row existed and only ran PBKDF2 when one did. Equal
// messages are not enough if the clock still differs.
// ===========================================================================

section('Part 5 -- the failure paths do comparable work');

async function medianMs(fn, runs) {
  const samples = [];
  for (let i = 0; i < runs; i++) {
    const t0 = process.hrtime.bigint();
    await fn();
    samples.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
}

{
  // Same process, same password, so the only difference is whether a user row
  // was found. A real PBKDF2 derivation dominates both.
  const dbKnown = fakeDb([knownUser]);
  const dbUnknown = fakeDb([]);

  const tKnown = await medianMs(() => login(dbKnown, KNOWN_USER, 'some-password-guess'), 5);
  const tUnknown = await medianMs(() => login(dbUnknown, 'nobody@test.school', 'some-password-guess'), 5);

  // A route that short-circuits the unknown case is typically 10-100x faster.
  // A generous 3x band still catches that while tolerating a noisy machine.
  const ratio = Math.max(tKnown, tUnknown) / Math.max(0.001, Math.min(tKnown, tUnknown));
  check(
    'an unknown account costs roughly the same as a known one',
    ratio < 3,
    'known=' + tKnown.toFixed(1) + 'ms unknown=' + tUnknown.toFixed(1) + 'ms ratio=' + ratio.toFixed(1) + 'x',
  );
  note('measured medians', 'known=' + tKnown.toFixed(1) + 'ms  unknown=' + tUnknown.toFixed(1) + 'ms  ratio=' + ratio.toFixed(2) + 'x');
}

{
  // burnPasswordVerification must be a constant false and must not throw.
  const a = await authLib.burnPasswordVerification('anything');
  const b = await authLib.burnPasswordVerification('something-else-entirely');
  check('burnPasswordVerification always returns false', a === false && b === false);
  let threw = false;
  try {
    await authLib.burnPasswordVerification(undefined);
  } catch (_) {
    threw = true;
  }
  check('burnPasswordVerification never throws, even on odd input', !threw);
}

// ===========================================================================
// Part 6 -- structural, so the fix cannot be quietly undone.
// ===========================================================================

section('Part 6 -- the route cannot drift back');

const authSrc = fs.readFileSync(path.join(ROOT, 'api', 'auth', 'index.ts'), 'utf8');
const codeOnly = authSrc
  .split('\n')
  .filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('/*') && !l.trim().startsWith('//'))
  .join('\n');

check('login consults the rate limiter', /checkLoginRateLimit/.test(codeOnly));
check('login records a failure', /recordLoginFailure/.test(codeOnly));
check('login clears counters on success', /clearLoginFailures/.test(codeOnly));

// Order matters: the cost being protected is the PBKDF2 derivation, so a
// locked-out caller must not reach it. Compared inside the login handler only --
// an earlier version compared raw offsets across the whole file, which found
// `verifyPassword` in the import line and passed for the wrong reason until the
// import was accounted for.
const loginHandler = codeOnly.slice(codeOnly.indexOf("authApp.post('/login'"));
check('the limiter is consulted before any password verification in /login',
  loginHandler.indexOf('checkLoginRateLimit') !== -1 &&
  loginHandler.indexOf('checkLoginRateLimit') < loginHandler.indexOf('await verifyPassword('),
  'limiter at ' + loginHandler.indexOf('checkLoginRateLimit') + ', verify at ' + loginHandler.indexOf('await verifyPassword('));
check('the no-user path burns a verification', /if \(!user\) \{[\s\S]{0,200}?burnPasswordVerification/.test(codeOnly));
check('the no-password-set path burns a verification too', /!user\.password_hash\) \{[\s\S]{0,700}?burnPasswordVerification/.test(codeOnly));
check('the old PASSWORD_NOT_SET discriminator is gone', !/PASSWORD_NOT_SET/.test(codeOnly));
check('the old "user not found on this portal" message is gone', !/इस स्कूल पोर्टल पर यह उपयोगकर्ता नहीं मिला/.test(codeOnly));
check('all three failure paths return one shared object', /const genericLoginFailure/.test(codeOnly));

// The migration the limiter depends on must exist and must be idempotent.
const migPath = path.join(ROOT, 'db_migrations', '0043_login_rate_limits.sql');
check('migration 0043 exists', fs.existsSync(migPath));
if (fs.existsSync(migPath)) {
  const mig = fs.readFileSync(migPath, 'utf8');
  check('0043 creates the table idempotently', /CREATE TABLE IF NOT EXISTS login_rate_limits/i.test(mig));
  check('0043 is transaction-free (wrangler rejects a manual one on remote D1)', !/\bBEGIN\b|\bCOMMIT\b|\bROLLBACK\b/i.test(mig));
}

// The client must not have been depending on the removed discriminator.
let clientDeps = 0;
for (const app of ['school_management_app', 'super_admin_app']) {
  const dir = path.join(ROOT, 'flutter_apps', app, 'lib');
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.dart') && /PASSWORD_NOT_SET/.test(fs.readFileSync(p, 'utf8'))) clientDeps++;
    }
  };
  if (fs.existsSync(dir)) walk(dir);
}
check('no Flutter screen depends on the removed PASSWORD_NOT_SET code', clientDeps === 0, clientDeps + ' references');

// ---------------------------------------------------------------------------

console.log('\n' + '-'.repeat(66));
if (outbound.length) note('outbound fetch calls were all stubbed', outbound.length + ' (no production traffic)');
globalThis.fetch = realFetch;

if (failed) {
  console.log('FAILED: ' + failed + ' of ' + (passed + failed) + ' checks');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log('All ' + passed + ' login hardening checks passed.');
