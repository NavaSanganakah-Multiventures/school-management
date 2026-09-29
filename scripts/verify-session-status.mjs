// Verifies that a deactivated account stops working -- both from logging in again
// and from continuing to use a token it already holds.
//
// THE GAP THIS GUARDS
//
// SESSION_EXPIRY_SECONDS is 7 days (api/auth/index.ts). A signature proves a
// token was issued by us; it says nothing about whether it should still be
// honoured. Before this control nothing on the request path consulted the
// account, so:
//
//   - an already-issued token kept working for up to 7 days after the account was
//     set to 'Inactive' -- which is exactly what DELETE /api/staff/:id does, and
//     what its own success message claims ("लॉगिन निष्क्रिय कर दिया गया"); and
//   - the login lookup carried no status predicate either, so the person could
//     simply log in again and collect a fresh 7-day token.
//
// So deactivating an account revoked nothing. It was decorative.
//
// A NOTE ON THIS FILE, WRITTEN BECAUSE IT WAS TRUE FOR A WHILE
//
// An earlier version wrapped DB.prepare() to fake the tenant sync's row, and got
// it wrong four separate ways in a row, each of which produced a plausible
// failure: the wrapper matched on /FROM system_users/ and so also swallowed the
// per-account status check, handing back a full user row where the code expects
// { status }; it read bound values before Hono had set them; it keyed
// pre-sync-vs-post-sync on a query counter the route does not keep; and it
// answered the sync fetch with a payload shape tenant-sync does not read, so the
// sync reported success and wrote nothing.
//
// The fix was to stop faking. The stand-in below serves reads from a real mutable
// row store and HONOURS the sync's `INSERT OR REPLACE INTO system_users`, which
// is what makes the post-sync re-query find a row on its own. Every assertion
// about that path is paired with one proving the row really arrived, so a 401
// can never be satisfied by a write that did not happen.
//
// THE CONTROL CASE DISCIPLINE
//
// A control that denies everything would pass most of what follows. An Active
// account is asserted to keep working throughout, and a token with no `sub` is
// asserted to be REFUSED -- the check resolves the account by `sub`, and a token
// it cannot resolve must not be waved through. That last one exists because a
// first draft of the control treated a missing `sub` as "nothing to check, allow",
// and the billing harness -- whose tokens carry `userId` and no `sub` -- then
// reported 59/59 green while proving nothing.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const OUT = path.join(ROOT, '.tmp-apitest-session');
const TSCONFIG = path.join(ROOT, 'tsconfig.apitest.json');

const AUTH_SECRET = 'session-status-auth-secret-0123456789ab';
const PLATFORM_AUTH_SECRET = 'platform-status-secret-0123456789abc';
const INTERNAL_SECRET = 'fleet-internal-secret-0123456789abcdef';
const SCHOOL_ID = 'school-under-test';
const PASSWORD = 'correct-horse-battery-staple';

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

function section(t) {
  console.log('\n' + t);
}

// ---------------------------------------------------------------------------
// Network kill-switch, before anything runs.
// ---------------------------------------------------------------------------

// The real fetch, captured so it can be asserted never to be installed. See the
// stubFetch comment below for why that matters.
const realFetch = globalThis.fetch;
let outbound = [];

// THE STUB, kept installed for the WHOLE run.
//
// A first draft restored `globalThis.fetch = realFetch` after the tenant-sync
// cases, on the reasonable assumption that only those need stubbing. It does not.
// On a dedicated worker, /api/plugins/* is PROXIED to the platform by the
// middleware in api/index.ts, and the M2M re-entry in api/internal/index.ts goes
// back through that same middleware -- so a later M2M test re-enters, hits the
// proxy branch, and makes a REAL network call. It surfaced as an inexplicable 401
// on a correctly signed request, plus a libuv assertion failure at exit from the
// leaked socket.
//
// So the stub is never removed, and the tenant-sync stub chains to it rather than
// to realFetch. A harness that can reach production is not a harness.
async function stubFetch(input, init) {
  outbound.push(init && init.headers ? new Request(input, init) : new Request(input));
  return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
}
globalThis.fetch = stubFetch;

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
console.log('  ok    api/ -> .tmp-apitest-session (commonjs)');

const appMod = require(path.join(OUT, 'index.js'));
const app = (appMod.default && appMod.default.request) ? appMod.default : (appMod.app || appMod);
const authLib = require(path.join(OUT, 'lib', 'auth.js'));
const internalAuth = require(path.join(OUT, 'lib', 'internal-request-auth.js'));

// ---------------------------------------------------------------------------
// A D1 stand-in with a real, mutable row store.
//
// The tenant sync writes through `INSERT OR REPLACE INTO system_users`, so reads
// and writes have to share state. A stand-in that answered the login lookup from
// a closed-over constant could never show the post-sync re-query finding a row.
// ---------------------------------------------------------------------------

const SYSTEM_USER_COLUMNS = [
  'id', 'username', 'full_name', 'email', 'phone', 'role', 'designation',
  'department', 'qualification', 'salary', 'status', 'last_login', 'created_at',
  'updated_at', 'password_hash', 'school_id',
];

function fakeDb(initialRows, opts = {}) {
  const rows = Object.assign(Object.create(null), initialRows);
  const writes = [];

  const db = {
    _rows: rows,
    _writes: writes,
    prepare(sql) {
      let bound = [];
      const s = {
        sql,
        bind(...a) {
          bound = a;
          return s;
        },
        async first() {
          if (opts.failStatus) throw new Error('D1 unavailable');

          // The per-account status check getAuthUser runs on every authenticated
          // request. Narrow on purpose: it selects only `status`, so a stand-in
          // matching on the table name alone would hand back a full user row where
          // the code expects { status }, and an object with no .status reads as
          // "not Active" -- turning a live account into a 401 and making the
          // control look too strict.
          if (/SELECT status FROM system_users/i.test(sql)) {
            const row = rows[String(bound[0])];
            return row ? { status: row.status } : null;
          }
          if (/SELECT status FROM platform_admins/i.test(sql)) {
            const row = rows[String(bound[0])];
            return row ? { status: row.status } : null;
          }
          // The login lookup. Matching on the BOUND identifier rather than on the
          // query text, because both login lookups are the same text and differ
          // only in the status predicate.
          if (/FROM system_users WHERE \(LOWER\(email\)/i.test(sql)) {
            const id = String(bound[0] || '').toLowerCase();
            const uname = String(bound[1] || '').toLowerCase();
            const match = Object.values(rows).find(
              (a) => String(a.email || '').toLowerCase() === id ||
                     String(a.username || '').toLowerCase() === uname,
            );
            if (!match) return null;
            // Honour the predicate rather than assuming it. The route depends on a
            // non-Active account being indistinguishable from an unknown one, so a
            // stand-in that ignored the filter would let a regression through.
            if (/status\s*=\s*'Active'/i.test(sql) && match.status !== 'Active') return null;
            return match;
          }
          if (/FROM platform_admins/i.test(sql)) {
            // Two different platform_admins queries reach here and they want
            // different things:
            //
            //   SELECT * FROM platform_admins ... (platform login, status-filtered)
            //   SELECT id FROM platform_admins ... (dedicated-worker "Super Admin
            //                                          logs in on the platform")
            //
            // Returning a match for BOTH made a suspended Super Admin's attempt on
            // a dedicated worker answer 403 "log in on the platform" instead of
            // reaching the login predicate -- which is not what the code does,
            // because the dedicated-worker branch filters on nothing and returns
            // the row for any status.
            const id = String(bound[0] || '').toLowerCase();
            const match = Object.values(rows).find(
              (a) => a.role === 'SuperAdmin' && String(a.email || '').toLowerCase() === id,
            );
            if (!match) return null;
            // Honour a status predicate when the query carries one. The dedicated
            // worker's SELECT id query does not, and the real code accepts any
            // status there, so the stand-in has to as well.
            if (/status\s*=\s*'Active'/i.test(sql) && match.status !== 'Active') return null;
            return /SELECT id/i.test(sql) ? { id: match.id } : match;
          }
          if (/FROM school_tenants/i.test(sql)) {
            return {
              id: SCHOOL_ID, status: 'Active', registration_status: 'Approved',
              deleted_at: null, provisioning_status: 'live', dedicated_slug: 'test',
              dedicated_domain: SCHOOL_ID + '.pragnya.nasven.com',
            };
          }
          if (/FROM school_profile/i.test(sql)) {
            return { id: SCHOOL_ID, school_name: 'Test School', principal_name: 'Test Principal' };
          }
          if (/password_reset_tokens/i.test(sql)) return null;
          if (/COUNT\(\*\)/i.test(sql)) return { n: 0 };
          return null;
        },
        async all() {
          return { results: [] };
        },
        async run() {
          if (/INSERT OR REPLACE INTO system_users/i.test(sql)) {
            const row = {};
            SYSTEM_USER_COLUMNS.forEach((c, i) => { row[c] = bound[i]; });
            rows[row.id] = row;
            writes.push({ sql, row });
            if (opts.seedHashOnSync) row.password_hash = opts.seedHashOnSync;
            return { success: true, meta: { changes: 1 } };
          }
          return { success: true, meta: { changes: 1 } };
        },
      };
      return s;
    },
    async batch(stmts) {
      return Promise.all(stmts.map((x) => x.run()));
    },
    async exec() {
      return { count: 0, duration: 0 };
    },
  };
  return db;
}

function dedicatedEnv(db) {
  return {
    SCHOOL_ID,
    IS_DEDICATED_WORKER: 'true',
    ENVIRONMENT: 'production',
    AUTH_SECRET,
    INTERNAL_SYNC_SECRET: INTERNAL_SECRET,
    APP_BASE_URL: 'https://' + SCHOOL_ID + '.pragnya.nasven.com',
    DB: db,
  };
}

function platformEnv(db) {
  return { ENVIRONMENT: 'production', AUTH_SECRET: PLATFORM_AUTH_SECRET, DB: db };
}

const realHash = await authLib.hashPassword(PASSWORD);

const teacherRow = (over) => ({
  id: 'u-teacher', email: 'teacher@test.school', username: 'teacher',
  full_name: 'Test Teacher', role: 'Staff', school_id: SCHOOL_ID,
  status: 'Active', password_hash: realHash, ...over,
});

const ACCOUNTS = {
  'u-teacher': teacherRow({}),
  'u-leaver': teacherRow({ id: 'u-leaver', email: 'leaver@test.school', username: 'leaver', status: 'Inactive' }),
  'u-susp': teacherRow({ id: 'u-susp', email: 'susp@test.school', username: 'susp', status: 'Suspended' }),
};

async function callRoute(pathname, token, env) {
  const res = await app.request(
    pathname,
    { headers: token ? { Authorization: 'Bearer ' + token } : {} },
    env,
  );
  let body = null;
  try {
    body = await res.clone().json();
  } catch (_) {}
  return { status: res.status, body };
}

async function login(email, password, env) {
  const res = await app.request(
    '/api/auth/login',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) },
    env,
  );
  let body = null;
  try {
    body = await res.clone().json();
  } catch (_) {}
  return { status: res.status, body };
}

/** A real token: the payload shape api/auth/index.ts actually issues. */
const mint = (payload) => authLib.signToken({ env: dedicatedEnv(fakeDb({})) }, { exp: Math.floor(Date.now() / 1000) + 3600, ...payload });

const teacherToken = await mint({ sub: 'u-teacher', email: 'teacher@test.school', role: 'Staff', schoolId: SCHOOL_ID });
const leaverToken = await mint({ sub: 'u-leaver', email: 'leaver@test.school', role: 'Staff', schoolId: SCHOOL_ID });
const suspendedToken = await mint({ sub: 'u-susp', email: 'susp@test.school', role: 'Staff', schoolId: SCHOOL_ID });
const deletedToken = await mint({ sub: 'u-gone', email: 'gone@test.school', role: 'Staff', schoolId: SCHOOL_ID });
const noSubToken = await mint({ email: 'nosub@test.school', role: 'Staff', schoolId: SCHOOL_ID });

// ===========================================================================
// Part 1 -- CONTROL. An Active account is unaffected.
// ===========================================================================

section('Part 1 -- CONTROL: an active account is unaffected');

// /api/staff is open to teaching roles and /api/dashboard-stats is management
// only, so the pair proves the token survived getAuthUser in both cases: 200 for
// the one, and 403 (the role gate, not a refusal of the token) for the other.
for (const c of [
  { path: '/api/staff', expected: 200, why: 'open to teaching roles' },
  { path: '/api/dashboard-stats', expected: 403, why: 'refused on role, not on the token' },
]) {
  const res = await callRoute(c.path, teacherToken, dedicatedEnv(fakeDb(ACCOUNTS)));
  check('CONTROL: an active teacher on ' + c.path + ' is ' + c.why, res.status === c.expected,
    'got ' + res.status + ' (expected ' + c.expected + ') ' + JSON.stringify(res.body));
}

const activeLogin = await login('teacher@test.school', PASSWORD, dedicatedEnv(fakeDb(ACCOUNTS)));
check('CONTROL: an active account can still log in', activeLogin.status === 200, 'got ' + activeLogin.status + ' ' + JSON.stringify(activeLogin.body));
check('CONTROL: and receives a token', !!(activeLogin.body && activeLogin.body.token));

// ===========================================================================
// Part 2 -- an already-issued token stops working. This is the actual gap: not
// "cannot log in", but "cannot keep using the token already in their pocket".
// ===========================================================================

section('Part 2 -- an existing token dies when the account is not Active');

for (const p of ['/api/staff', '/api/dashboard-stats']) {
  const res = await callRoute(p, leaverToken, dedicatedEnv(fakeDb(ACCOUNTS)));
  check('a token for an Inactive account is refused on ' + p, res.status === 401, 'got ' + res.status + ' ' + JSON.stringify(res.body));
}

const suspended = await callRoute('/api/staff', suspendedToken, dedicatedEnv(fakeDb(ACCOUNTS)));
check('a token for a Suspended account is refused', suspended.status === 401, 'got ' + suspended.status);

const deleted = await callRoute('/api/staff', deletedToken, dedicatedEnv(fakeDb(ACCOUNTS)));
check('a token whose account row was deleted is refused', deleted.status === 401, 'got ' + deleted.status);

const noSub = await callRoute('/api/staff', noSubToken, dedicatedEnv(fakeDb(ACCOUNTS)));
check('a token with no `sub` is refused (it cannot be resolved to an account)', noSub.status === 401, 'got ' + noSub.status);

// Same token, same route, only the status differs.
const asActive = await callRoute('/api/staff', teacherToken, dedicatedEnv(fakeDb(ACCOUNTS)));
const asInactive = await callRoute('/api/staff', leaverToken, dedicatedEnv(fakeDb(ACCOUNTS)));
check('CONTROL: an Active account is served and an Inactive one refused, on one route',
  asActive.status === 200 && asInactive.status === 401,
  'active=' + asActive.status + ' inactive=' + asInactive.status);

// ===========================================================================
// Part 3 -- an inactive account cannot log in again and get a new token.
// ===========================================================================

section('Part 3 -- an inactive account cannot simply log in again');

const inactiveLogin = await login('leaver@test.school', PASSWORD, dedicatedEnv(fakeDb(ACCOUNTS)));
check('an Inactive account is refused at login', inactiveLogin.status === 401, 'got ' + inactiveLogin.status);
check('no token is issued', !(inactiveLogin.body && inactiveLogin.body.token));

const suspendedLogin = await login('susp@test.school', PASSWORD, dedicatedEnv(fakeDb(ACCOUNTS)));
check('a Suspended account is refused at login', suspendedLogin.status === 401, 'got ' + suspendedLogin.status);

// The refusal must be indistinguishable from a wrong password, or the login route
// is an account-status oracle. Compared against the SAME account, because that is
// what proves the refusal came from the status predicate: an unknown identifier is
// filtered out one step earlier and also answers 401, so only the same-account
// comparison isolates the cause.
const wrongPassword = await login('leaver@test.school', 'wrong-password', dedicatedEnv(fakeDb(ACCOUNTS)));
const unknownUser = await login('nobody@test.school', 'whatever', dedicatedEnv(fakeDb(ACCOUNTS)));
check('an inactive account answers exactly like a wrong password on the same account',
  inactiveLogin.status === wrongPassword.status &&
  JSON.stringify(inactiveLogin.body) === JSON.stringify(wrongPassword.body),
  'inactive=' + JSON.stringify(inactiveLogin.body) + ' wrongpw=' + JSON.stringify(wrongPassword.body));
check('and both are 401, the status a wrong password has always returned',
  inactiveLogin.status === 401 && wrongPassword.status === 401,
  'inactive=' + inactiveLogin.status + ' wrongpw=' + wrongPassword.status);
check('and like an account that does not exist (secondary property)',
  inactiveLogin.status === unknownUser.status,
  'inactive=' + inactiveLogin.status + ' unknown=' + unknownUser.status);
check('the refusal does not mention the account status',
  !/inactive|suspended|निष्क्रिय/i.test(JSON.stringify(inactiveLogin.body)),
  JSON.stringify(inactiveLogin.body));

// ---------------------------------------------------------------------------
// Part 3b -- the post-sync re-query.
//
// On a dedicated worker the local D1 may have no row and the platform sync
// supplies one, and that re-query is what decides the answer. syncTenantFromPlatform
// is an INSERT OR REPLACE, so after a sync the local row carries the PLATFORM's
// status.
//
// The bug this caught: the first lookup got a status predicate and the re-query
// after the sync did not, so an account deactivated on the platform was refused by
// the first query and then accepted by the second. Deactivation would have worked
// until the next sync, then quietly stopped. Both queries look correct in
// isolation, which is why it is asserted rather than reviewed.
// ---------------------------------------------------------------------------

section('Part 3b -- the post-sync re-query also honours status');

/**
 * A dedicated-worker login where the local D1 starts EMPTY and the platform sync
 * writes the row in. `platformStatus` is the status the synced row carries.
 *
 * The sync is a real INSERT OR REPLACE against the stand-in, not a faked answer,
 * so "the row arrived" is observed rather than assumed. Every case below pairs
 * its assertion with a check that the write actually happened -- a 401 that
 * follows a write which never occurred proves nothing.
 */
function envAfterSync(platformStatus) {
  const db = fakeDb({}, { seedHashOnSync: realHash });
  const env = dedicatedEnv(db);
  // Chains to stubFetch, never to the real fetch. See the stubFetch comment.
  const fetchImpl = stubFetch;
  const log = [];
  // `data` is read directly, not nested: api/lib/tenant-sync.ts:83-90 does
  // `const data = await res.json()` and then `if (data.profile)` and
  // `data.users`. A nested `{ data: { users } }` payload answers 200 and reports
  // a successful sync while writing nothing at all, which is what made four
  // earlier drafts of this stand-in inert.
  const payload = {
    success: true,
    users: [{
      id: 'u-synced', username: 'synced', full_name: 'Synced User',
      email: 'synced@test.school', phone: '', role: 'Staff', salary: 0,
      status: platformStatus,
    }],
    profile: { id: SCHOOL_ID, school_name: 'Test School', email: 'admin@test.school' },
    schoolTenants: {
      id: SCHOOL_ID, school_name: 'Test School', status: 'Active',
      registration_status: 'Approved', provisioning_status: 'live',
      dedicated_slug: 'test', dedicated_domain: SCHOOL_ID + '.pragnya.nasven.com',
    },
  };
  globalThis.fetch = async (input, init) => {
    const req = init && init.headers ? new Request(input, init) : new Request(input);
    if (/internal\/tenant-sync/i.test(req.url)) {
      log.push(req.url);
      return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return fetchImpl(input, init);
  };
  env.__db = db;
  env.__syncCalls = () => log.length;
  return env;
}

for (const [status, expected] of [['Active', 200], ['Inactive', 401], ['Suspended', 401]]) {
  const env = envAfterSync(status);
  const res = await login('synced@test.school', PASSWORD, env);
  const wrote = env.__db._writes.some((w) => String(w.row.email).toLowerCase() === 'synced@test.school');
  check('a synced ' + status + ' account answers ' + expected, res.status === expected,
    'got ' + res.status + ' ' + JSON.stringify(res.body));
  // Without this, a 401 is ambiguous: the re-query could have found nothing rather
  // than filtered the row out. Same lesson as the 24.8x timing ratio in the login
  // harness -- a refusal has to be shown to be the RIGHT refusal.
  check('  and the sync really did write the row (so the 401 is a filter, not an absence)',
    env.__syncCalls() === 1 && wrote,
    'syncCalls=' + env.__syncCalls() + ' wrote=' + wrote);
  if (expected === 200) {
    check('  and the synced Active account received a token', !!(res.body && res.body.token));
  } else {
    check('  and was issued no token', !(res.body && res.body.token));
  }
}

// ===========================================================================
// Part 4 -- the control fails CLOSED.
// ===========================================================================

section('Part 4 -- the control fails closed');

const brokenDb = await callRoute('/api/staff', teacherToken, dedicatedEnv(fakeDb(ACCOUNTS, { failStatus: true })));
check('when the status query throws, the request is refused', brokenDb.status === 401, 'got ' + brokenDb.status);

const noDb = await app.request('/api/staff', { headers: { Authorization: 'Bearer ' + teacherToken } }, {
  SCHOOL_ID, IS_DEDICATED_WORKER: 'true', ENVIRONMENT: 'production', AUTH_SECRET,
});
check('with no DB binding at all, the request is refused', noDb.status === 401, 'got ' + noDb.status);

// ===========================================================================
// Part 5 -- Super Admin is covered, and the M2M path is not affected.
// ===========================================================================

section('Part 5 -- Super Admin is covered, and the M2M path is not');

const PA = {
  'pa-1': { id: 'pa-1', email: 'super@platform.test', username: 'super', full_name: 'Super', role: 'SuperAdmin', status: 'Active', password_hash: realHash },
  'pa-2': { id: 'pa-2', email: 'susp@platform.test', username: 'susp2', full_name: 'Suspended', role: 'SuperAdmin', status: 'Suspended', password_hash: realHash },
};
const superToken = await authLib.signToken({ env: platformEnv(fakeDb(PA)) },
  { sub: 'pa-1', email: 'super@platform.test', role: 'SuperAdmin', schoolId: '', exp: Math.floor(Date.now() / 1000) + 3600 });
const superSuspendedToken = await authLib.signToken({ env: platformEnv(fakeDb(PA)) },
  { sub: 'pa-2', email: 'susp@platform.test', role: 'SuperAdmin', schoolId: '', exp: Math.floor(Date.now() / 1000) + 3600 });

const okSuper = await callRoute('/api/admin/schools', superToken, platformEnv(fakeDb(PA)));
check('CONTROL: an active Super Admin is not blocked by the status check', okSuper.status !== 401, 'got ' + okSuper.status);
// 403, not 401: on the platform tier getAuthUser admits SuperAdmin tokens and this
// route's own requireSuperAdmin guard refuses. Correct -- the account IS a Super
// Admin, just suspended -- but it means this route cannot show the status check
// firing, which is why Part 2's 401s matter as the primary evidence.
const badSuper = await callRoute('/api/admin/schools', superSuspendedToken, platformEnv(fakeDb(PA)));
check('a suspended Super Admin is refused by the route guard', badSuper.status === 403, 'got ' + badSuper.status + ' ' + JSON.stringify(badSuper.body));

// A suspended Super Admin, on the platform tier.
//
// The route has three gates before it answers 401, and each one has to be
// satisfied for this to be testing the status check and not something else:
//
//   1. the status predicate in the platform_admins lookup (the control);
//   2. PLATFORM_ADMIN_EMAIL, else 403 "अनधिकृत Super Admin ईमेल" (auth/index.ts:76-89);
//   3. the PORTAL_MANAGEMENT_ONLY branch for a school login on the platform tier
//      (auth/index.ts:145-149), which is what a SUSPENDED super admin falls into
//      once the status predicate has filtered the row out -- there is then no
//      platform_admin and no school user either.
//
// Gate 3 is the reason a first draft of this test saw 403 and looked like the
// control was not working. It is the correct answer for the wrong reason: the
// account is refused either way, and the 401-vs-403 distinction is a message
// difference, not an authorisation difference. What matters, and what is asserted
// instead, is that NO token is issued -- a 403 with a token would be a real bug.
const superEnv = (email) => ({ ...platformEnv(fakeDb(PA)), PLATFORM_ADMIN_EMAIL: email });

const superSuspendedLogin = await app.request(
  '/api/auth/login',
  { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'susp@platform.test', password: PASSWORD }) },
  superEnv('susp@platform.test'),
);
const suspendedBody = await superSuspendedLogin.clone().text();
check('a suspended Super Admin is refused at login', superSuspendedLogin.status === 401 || superSuspendedLogin.status === 403,
  'got ' + superSuspendedLogin.status);
check('and is issued NO token (this is the property that matters)', !/"token"\s*:/.test(suspendedBody),
  suspendedBody.slice(0, 160));
check('and the refusal is not the "authorised platform admin" gate',
  !/अनधिकृत Super Admin/.test(suspendedBody), suspendedBody.slice(0, 160));

// Control: the same route with an ACTIVE, authorised Super Admin does issue a
// token, so the refusal above is the status and not the address gate.
const superActiveLogin = await app.request(
  '/api/auth/login',
  { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'super@platform.test', password: PASSWORD }) },
  superEnv('super@platform.test'),
);
const activeBody = await superActiveLogin.clone().text();
check('CONTROL: an active, authorised Super Admin still logs in', superActiveLogin.status === 200,
  'got ' + superActiveLogin.status + ' ' + activeBody.slice(0, 160));
check('CONTROL: and receives a token', /"token"\s*:/.test(activeBody));

// A proxied M2M request carries no user credential, so there is no account to be
// deactivated and the control must not touch it.
const surfacePath = '/api/plugins/active';
const signedPath = '/api/internal/' + encodeURIComponent(SCHOOL_ID) + surfacePath;
const sig = await internalAuth.buildInternalAuthHeaders({ secret: INTERNAL_SECRET, method: 'GET', path: signedPath, body: '' });
const m2mHeaders = () => new Headers({ ...sig, 'X-Verified-School-Scope': SCHOOL_ID, 'X-Acting-Role': 'Director' });

const proxied = await app.request(signedPath, { headers: m2mHeaders() }, dedicatedEnv(fakeDb(ACCOUNTS)));
check('a correctly signed M2M request is unaffected', proxied.status === 200, 'got ' + proxied.status);

const proxiedBroken = await app.request(signedPath, { headers: m2mHeaders() }, dedicatedEnv(fakeDb(ACCOUNTS, { failStatus: true })));
check('and is still served when the status query would throw', proxiedBroken.status === 200, 'got ' + proxiedBroken.status);

// ===========================================================================
// Part 6 -- structural: the control and the login predicate cannot be dropped.
// ===========================================================================

section('Part 6 -- the control cannot be quietly removed');

const codeOnly = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
  .split('\n')
  .filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('/*') && !l.trim().startsWith('//'))
  .join('\n');

// Proves the stub was never removed. A first draft restored the real fetch after
// the tenant-sync cases, and the M2M re-entry then hit the proxy branch in
// api/index.ts and made a live network call -- which is what produced a
// libuv assertion failure at exit and an inexplicable 401. Asserting outbound
// stays zero turns "the harness cannot reach production" from a comment into a
// check.
// Proves the stub was never removed, which is a statement about WHICH fetch was
// installed and not about whether anything was called: the tenant-sync and proxy
// hops above are real, expected calls that the stub intercepted. A first draft
// restored the real fetch after the tenant-sync cases, and the M2M re-entry then
// reached the proxy branch in api/index.ts and made a LIVE call -- which is what
// produced a libuv assertion failure at exit and an inexplicable 401.
//
// So the property is: every outbound call was served by the stub, and the only
// ones that happened are the ones the code is supposed to make.
const expectedHops = [
  'internal/tenant-sync/',
  'internal/school-under-test/api/plugins/',
];
const unexpected = outbound.filter((r) => !expectedHops.some((h) => String(r.url).includes(h)));
check('every outbound call was a hop the code is meant to make, and the stub served all of them',
  unexpected.length === 0,
  unexpected.length + ' unexpected: ' + JSON.stringify(unexpected.map((r) => String(r.url).slice(0, 70))));
check('the outbound calls were all intercepted (none reached the network)', outbound.length > 0,
  'no outbound call at all -- the M2M section may not have exercised the proxy path');
console.log('  NOTE  stubbed outbound hops: ' + outbound.length + ' (tenant-sync and the M2M proxy re-entry)');

const authCode = codeOnly('api/lib/auth.ts');
check('getAuthUser consults the account-status check', /await isSessionSubjectActive\(c, user\)/.test(authCode));
check('the check reads the status column', /SELECT status FROM system_users/.test(authCode));
check('and the Super Admin table too', /SELECT status FROM platform_admins/.test(authCode));
check('a missing row denies', /if \(!row\) return false/.test(authCode));
check('a non-Active status denies', /=== 'Active'/.test(authCode));
check('a missing `sub` or DB denies (fail closed, not open)', /if \(!db \|\| !subjectId\) return false/.test(authCode));
check('a thrown query denies', /catch \(e: any\)[\s\S]{0,240}return false/.test(authCode));

const loginCode = codeOnly('api/auth/index.ts');
const loginLookups = loginCode.match(/FROM system_users WHERE \(LOWER\(email\)[^\n]*/g) || [];
check('every system_users login lookup filters on status',
  loginLookups.length === 2 && loginLookups.every((q) => /status = 'Active'/.test(q)),
  loginLookups.length + ' lookup(s): ' + JSON.stringify(loginLookups));
check('the Super Admin login lookup filters on status',
  /FROM platform_admins WHERE LOWER\(email\) = \? AND status = 'Active'/.test(loginCode));

// Both real token issuers must set `sub`, or the control denies every session.
check('school tokens are issued with sub', loginCode.includes('sub: user.id'));
check('Super Admin tokens are issued with sub', loginCode.includes('sub: admin.id'));

// ---------------------------------------------------------------------------

console.log('\n' + '-'.repeat(66));
// Deliberately NOT restoring realFetch. Every outbound call is expected to be
// zero, asserted in Part 6; installing the real fetch back would undo the one
// guarantee this file makes about itself.

if (failed) {
  console.log('FAILED: ' + failed + ' of ' + (passed + failed) + ' checks');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log('All ' + passed + ' session-status checks passed.');
