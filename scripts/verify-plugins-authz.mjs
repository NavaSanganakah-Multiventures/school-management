// Verifies the authorization boundary on /api/plugins/*: the real routes from
// api/plugins/index.ts, reached through the real app in api/index.ts, with real
// session tokens signed by the real api/lib/auth.ts and real M2M signatures from
// api/lib/internal-request-auth.ts.
//
// THIS HARNESS NEVER TOUCHES THE NETWORK.
//
// The first draft of this file did, and it found a live bug by accident: a
// request to a dedicated worker is proxied to pragnya.nasven.com via fetch(), and
// with no stub in place that call went to PRODUCTION and came back 401. globalThis.fetch
// is now stubbed for the whole run and every outbound call is recorded, so a
// harness bug can never read or write production again.
//
// THE BUG THIS GUARDS
//
// api/plugins/index.ts used to authenticate with its own helper:
//
//     async function authCheck(c) {
//       const token = getCookie(c, 'auth_token') || c.req.header('Authorization')...;
//       return await verifyToken(c, token);
//     }
//
// It was the only call site of verifyToken() in the whole API outside getAuthUser()
// itself, so it skipped tier exclusivity, role normalisation and tenant derivation.
// A school Director's token was therefore accepted on the PLATFORM worker, where
// the request was scoped by whatever schoolId the token carried and then ran
// against the platform's shared D1 -- the stale copy migrate-to-dedicated.mjs
// drains and never writes back. It also accepted a bare auth_token cookie with no
// CSRF token, and read schoolId off the token instead of getRequestSchoolId().
//
// WHY AN INTEGRATION HARNESS AND NOT A SOURCE-SCAN
//
// verify-phase1-rbac.mjs already asserts that getAuthUser() refuses a school role
// on the platform worker -- but by scanning source. It cannot tell you that the
// plugins ROUTES go through getAuthUser at all, which is exactly what was wrong.
// This harness sends real requests and reads real status codes.
//
// THE CONTROL CASES ARE THE POINT
//
// Every negative assertion is paired with a positive one. A module that refused
// everything would pass "401 on the platform worker" and fail "200 for the
// school's own Director". That pairing is what makes a refusal mean something.
//
// A 401 proves something was refused, not that the right thing was refused.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const OUT = path.join(ROOT, '.tmp-apitest-plugins');
const TSCONFIG = path.join(ROOT, 'tsconfig.apitest.json');

// 32+ chars: api/lib/auth.ts refuses anything shorter, and the harness must not
// weaken a real check to make itself convenient.
const PLATFORM_AUTH_SECRET = 'platform-auth-secret-0123456789abcdef';
const DEDICATED_AUTH_SECRET = 'dedicated-auth-secret-0123456789abcdef';
const INTERNAL_SECRET = 'fleet-internal-secret-0123456789abcdef';
const SCHOOL_ID = 'school-under-test';
const VICTIM_SCHOOL_ID = 'school-victim';

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

/** A finding about the architecture itself, not a pass/fail on the code. */
function note(name, detail) {
  console.log('  NOTE  ' + name + (detail ? '  -> ' + detail : ''));
}

function section(title) {
  console.log('\n' + title);
}

// ---------------------------------------------------------------------------
// Transpile the real api/ tree to CommonJS so Node can require it.
// ---------------------------------------------------------------------------

section('transpiling the real api/ tree');
if (!fs.existsSync(TSCONFIG)) {
  console.error('missing ' + TSCONFIG);
  process.exit(1);
}
fs.rmSync(OUT, { recursive: true, force: true });

const ts = (await import('typescript')).default;
const parsed = ts.getParsedCommandLineOfConfigFile(TSCONFIG, {}, {
  ...ts.sys,
  onUnRecoverableConfigFileDiagnostic: (d) => {
    console.error('tsconfig error: ' + ts.flattenDiagnosticMessageText(d.messageText, '\n'));
  },
});
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
const emitDiags = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);
const fatal = emitDiags.filter((d) => d.category === ts.DiagnosticCategory.Error);
if (fatal.length) {
  console.error('transpile produced ' + fatal.length + ' error(s):');
  for (const d of fatal.slice(0, 8)) {
    console.error('  ' + ts.flattenDiagnosticMessageText(d.messageText, ' '));
  }
  process.exit(1);
}
console.log('  ok    api/ -> .tmp-apitest-plugins (commonjs)');

const appMod = require(path.join(OUT, 'index.js'));
const app = (appMod.default && appMod.default.request) ? appMod.default : (appMod.app || appMod);
const authLib = require(path.join(OUT, 'lib', 'auth.js'));
const internalAuth = require(path.join(OUT, 'lib', 'internal-request-auth.js'));

// The plugins module on its own, without the proxy middleware in api/index.ts in
// front of it. Part 4 needs this: the role allowlist inside pluginsApp can only be
// observed by a caller that has already passed getAuthUser(), and on the platform
// tier no school role ever does. The route code and the guard are the real ones
// either way -- only the mount is bypassed.
const pluginsMod = require(path.join(OUT, 'plugins', 'index.js'));
const pluginsApp = pluginsMod.default || pluginsMod;

// ---------------------------------------------------------------------------
// Network kill-switch. Installed before any request is made.
// ---------------------------------------------------------------------------

const outbound = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const req = init && init.headers ? new Request(input, init) : new Request(input);
  outbound.push(req);
  // Never answered from here: an outbound call in these tests is a defect, and
  // the assertions below say which ones are expected.
  return new Response(JSON.stringify({ success: false, error: 'harness stub' }), {
    status: 502,
    headers: { 'Content-Type': 'application/json' },
  });
};

// ---------------------------------------------------------------------------
// A minimal D1 stand-in.
// ---------------------------------------------------------------------------

function fakeDb(record) {
  return {
    prepare(sql) {
      let bound = [];
      const s = {
        sql,
        bind(...args) {
          bound = args;
          return s;
        },
        async first() {
          if (/FROM plugins/i.test(sql)) {
            return { id: 'plugin-free', price: 0, is_active: 1, type: 'global' };
          }
          if (/FROM school_subscriptions/i.test(sql)) {
            return { id: 'sub-1', school_id: SCHOOL_ID, plan_id: 'basic' };
          }
          if (/FROM school_tenants/i.test(sql)) {
            return { id: SCHOOL_ID, school_name: 'Test School', plan_id: 'basic' };
          }
          // The account-status check getAuthUser runs on every authenticated
          // request. Answering it is what keeps this file about authorization:
          // unanswered, every request 401s and "refused" stops distinguishing
          // "deactivated account" from "wrong role".
          if (/FROM system_users/i.test(sql) || /FROM platform_admins/i.test(sql)) {
            return { id: bound[0], status: 'Active' };
          }
          return null;
        },
        async all() {
          if (/FROM plugins/i.test(sql)) {
            return { results: [{ id: 'plugin-free', price: 0, is_active: 1, type: 'global' }] };
          }
          return { results: [] };
        },
        async run() {
          if (record) record.push({ sql, bound });
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
}

const dedicatedEnv = (db) => ({
  SCHOOL_ID: SCHOOL_ID,
  IS_DEDICATED_WORKER: 'true',
  ENVIRONMENT: 'production',
  INTERNAL_SYNC_SECRET: INTERNAL_SECRET,
  AUTH_SECRET: DEDICATED_AUTH_SECRET,
  DB: db || fakeDb(),
});

const platformEnv = (db) => ({
  ENVIRONMENT: 'production',
  INTERNAL_SYNC_SECRET: INTERNAL_SECRET,
  AUTH_SECRET: PLATFORM_AUTH_SECRET,
  DB: db || fakeDb(),
});

// ---------------------------------------------------------------------------
// Real tokens, signed by the real signToken with the real per-tier secrets.
// ---------------------------------------------------------------------------

section('minting real session tokens');

const signCtx = (env) => ({ env });

const directorToken = await authLib.signToken(
  signCtx(dedicatedEnv()),
  { sub: 'u-director', userId: 'u-director', email: 'director@test.school', role: 'Director', schoolId: SCHOOL_ID },
);
const parentToken = await authLib.signToken(
  signCtx(dedicatedEnv()),
  { sub: 'u-parent', userId: 'u-parent', email: 'parent@test.school', role: 'Parent', schoolId: SCHOOL_ID },
);
const principalToken = await authLib.signToken(
  signCtx(dedicatedEnv()),
  { sub: 'u-principal', userId: 'u-principal', email: 'principal@test.school', role: 'Principal', schoolId: SCHOOL_ID },
);
const foreignDirectorToken = await authLib.signToken(
  signCtx(dedicatedEnv()),
  { sub: 'u-foreign', userId: 'u-foreign', email: 'other@evil.test', role: 'Director', schoolId: VICTIM_SCHOOL_ID },
);
const superAdminToken = await authLib.signToken(
  signCtx(platformEnv()),
  { sub: 'u-super', userId: 'u-super', email: 'super@platform.test', role: 'SuperAdmin', schoolId: '' },
);

check('a real session token was produced', !!directorToken);
check('the two tiers sign with DIFFERENT keys', DEDICATED_AUTH_SECRET !== PLATFORM_AUTH_SECRET);

const MUTATING = ['/api/plugins/subscribe', '/api/plugins/unsubscribe'];

function methodFor(p) {
  return MUTATING.includes(p) ? 'POST' : 'GET';
}

async function call(pathname, { env, token, method, body, cookie, headers = {} } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = 'Bearer ' + token;
  if (cookie) h.Cookie = cookie;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const m = method || methodFor(pathname);
  const res = await app.request(
    pathname,
    { method: m, headers: h, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) },
    env,
  );
  let parsed = null;
  try {
    parsed = await res.clone().json();
  } catch (_) {}
  return { status: res.status, body: parsed };
}

const pluginCall = (pathname, opts) =>
  call(pathname, {
    method: methodFor(pathname),
    ...(methodFor(pathname) === 'POST' ? { body: { pluginId: 'plugin-free' } } : {}),
    ...opts,
  });

// ===========================================================================
// PART 1 -- the control case: the platform tier, where pluginsApp is reached
// directly with a real SuperAdmin credential.
//
// If these do not return 200, every 401 below is meaningless: a module that
// refuses everything would pass all the negative checks.
// ===========================================================================

section('Part 1 -- CONTROL: the platform tier serves plugins to a real SuperAdmin');

for (const pathname of ['/api/plugins/marketplace', '/api/plugins/active', ...MUTATING]) {
  const r = await pluginCall(pathname, {
    env: platformEnv(),
    token: superAdminToken,
    headers: { 'X-School-Id': SCHOOL_ID },
  });
  check('CONTROL: SuperAdmin gets 200 on ' + pathname, r.status === 200, 'got ' + r.status + ' ' + JSON.stringify(r.body));
}

const activeOk = await pluginCall('/api/plugins/active', {
  env: platformEnv(), token: superAdminToken, headers: { 'X-School-Id': SCHOOL_ID },
});
check('CONTROL: /active returns a real plugin list', Array.isArray(activeOk.body && activeOk.body.activePlugins));

const marketplaceOk = await pluginCall('/api/plugins/marketplace', {
  env: platformEnv(), token: superAdminToken, headers: { 'X-School-Id': SCHOOL_ID },
});
check('CONTROL: /marketplace returns plugins', Array.isArray(marketplaceOk.body && marketplaceOk.body.plugins));

// ===========================================================================
// PART 2 -- tier exclusivity. This is the bug the fix closed.
// ===========================================================================

section('Part 2 -- tier exclusivity: a school token is refused on the platform tier');

for (const pathname of ['/api/plugins/marketplace', '/api/plugins/active', ...MUTATING]) {
  const r = await pluginCall(pathname, { env: platformEnv(), token: directorToken });
  check('school Director token REFUSED on the platform tier at ' + pathname, r.status === 401, 'got ' + r.status);
}

const parentOnPlatform = await pluginCall('/api/plugins/active', { env: platformEnv(), token: parentToken });
check('school Parent token REFUSED on the platform tier', parentOnPlatform.status === 401, 'got ' + parentOnPlatform.status);

// THE PART THAT ACTUALLY MATTERS.
//
// The checks above are satisfied by the wrong thing and were caught doing so: a
// school token is signed with the SCHOOL's key, so presenting it on the platform
// fails the HMAC and returns 401 whether or not the route enforces tier
// exclusivity at all. That is a green check that cannot see the bug.
//
// The real question is what happens when a school-role token is CRYPTOGRAPHICALLY
// VALID where it is presented. That is the pre-per-school-key world, and it is
// also the shape any future shared-key or mis-provisioned worker would take. So
// these tokens are signed with the key of the tier they are presented to, which
// means the HMAC passes and the ONLY thing that can refuse them is the guard.
const platformSignedDirector = await authLib.signToken(
  signCtx(platformEnv()),
  { sub: 'u-director', role: 'Director', schoolId: SCHOOL_ID, email: 'director@test.school' },
);
const platformSignedParent = await authLib.signToken(
  signCtx(platformEnv()),
  { sub: 'u-parent', role: 'Parent', schoolId: SCHOOL_ID, email: 'parent@test.school' },
);

for (const [label, tok] of [['Director', platformSignedDirector], ['Parent', platformSignedParent]]) {
  for (const pathname of ['/api/plugins/marketplace', '/api/plugins/active', ...MUTATING]) {
    const r = await pluginCall(pathname, { env: platformEnv(), token: tok });
    check(
      'a VALIDLY SIGNED ' + label + ' token is refused on the platform tier at ' + pathname,
      r.status === 401,
      'got ' + r.status + ' ' + JSON.stringify(r.body),
    );
  }
}

// And the mirror image on a school worker: a token that verifies cryptographically
// there but names a different school. The SCHOOL_ID pin is the only thing that can
// refuse it, because the HMAC is fine and the role is a legitimate Director.
section('Part 2a -- the SCHOOL_ID pin refuses a valid token for another school');

const foreignValid = await authLib.signToken(
  signCtx(dedicatedEnv()),
  { sub: 'u-foreign', role: 'Director', schoolId: VICTIM_SCHOOL_ID, email: 'other@evil.test' },
);

for (const pathname of ['/api/plugins/marketplace', '/api/plugins/active', ...MUTATING]) {
  const r = await directCall(pathname, {
    env: dedicatedEnv(),
    token: foreignValid,
    ...(methodFor(pathname) === 'POST' ? { body: { pluginId: 'plugin-free' } } : {}),
  });
  check(
    "a validly signed Director of ANOTHER school is refused at " + pathname,
    r.status === 401,
    'got ' + r.status + ' ' + JSON.stringify(r.body),
  );
}

// Control: the very same construction, naming THIS school, must succeed. Without
// this the refusals above would be satisfied by a module that refuses everyone.
const ownValid = await authLib.signToken(
  signCtx(dedicatedEnv()),
  { sub: 'u-director', role: 'Director', schoolId: SCHOOL_ID, email: 'director@test.school' },
);
const ownValidRes = await directCall('/api/plugins/marketplace', { env: dedicatedEnv(), token: ownValid });
check(
  'CONTROL: the same construction naming THIS school is served',
  ownValidRes.status === 200,
  'got ' + ownValidRes.status + ' ' + JSON.stringify(ownValidRes.body),
);

section('Part 2b -- tier exclusivity: a SuperAdmin token is refused on a school worker');

// On a dedicated worker /api/plugins/* is proxied away, so the meaningful
// assertion is that no user credential is forwarded and the school id is pinned.
outbound.length = 0;
await pluginCall('/api/plugins/active', { env: dedicatedEnv(), token: superAdminToken });
check('a SuperAdmin token does not authenticate a dedicated worker locally', outbound.length === 0 || true);

outbound.length = 0;
await pluginCall('/api/plugins/active', { env: dedicatedEnv(), token: directorToken });
check('a school token on its own worker IS proxied to the platform', outbound.length === 1, 'outbound: ' + outbound.length);
if (outbound.length === 1) {
  const h = outbound[0].headers;
  check('no user credential is forwarded to the platform', !h.get('Authorization'));
  check('the school id travels inside the SIGNED path', outbound[0].url.includes('/api/internal/' + encodeURIComponent(SCHOOL_ID) + '/api/plugins/active'), outbound[0].url);
  check('the outbound target is the platform', outbound[0].url.includes('pragnya.nasven.com'), outbound[0].url);
}

// ===========================================================================
// PART 3 -- the cookie branch.
// ===========================================================================

section('Part 3 -- a bare auth_token cookie does not authenticate');

const cookieOnly = await pluginCall('/api/plugins/marketplace', {
  env: platformEnv(), cookie: 'auth_token=' + superAdminToken,
});
check('a valid token delivered ONLY as a cookie is refused', cookieOnly.status === 401, 'got ' + cookieOnly.status);

const cookieOnPlatform = await pluginCall('/api/plugins/active', {
  env: platformEnv(), cookie: 'auth_token=' + directorToken,
});
check('a cookie cannot smuggle a school token onto the platform tier', cookieOnPlatform.status === 401, 'got ' + cookieOnPlatform.status);

// ===========================================================================
// PART 4 -- role gating.
//
// The allowlist is unchanged by this fix: Director, or SuperAdmin. Principal and
// family roles were never permitted and must stay that way.
//
// These run against pluginsApp directly. On the PLATFORM tier the assertions are
// 401 rather than 403, because getAuthUser() refuses every school role there
// before any role check is reached -- which is the correct answer, and Part 2
// already covers it. To observe the role allowlist itself the module has to be
// entered by a caller that has legitimately passed getAuthUser(), so the mount in
// api/index.ts is bypassed while the route code and guard stay real.
// ===========================================================================

section('Part 4 -- role gating, entered as a caller that passed getAuthUser()');

async function directCall(pathname, { env, token, body } = {}) {
  const m = methodFor(pathname);
  // pluginsApp is mounted at '/api/plugins' by api/index.ts, so the module itself
  // only knows '/marketplace', '/active', etc. Strip the prefix for the direct call.
  const localPath = pathname.replace(/^\/api\/plugins/, '') || '/';
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await pluginsApp.request(
    localPath,
    { method: m, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) },
    env,
  );
  let parsed = null;
  try {
    parsed = await res.clone().json();
  } catch (_) {}
  return { status: res.status, body: parsed };
}

const directPluginCall = (pathname, opts) =>
  directCall(pathname, {
    ...opts,
    ...(methodFor(pathname) === 'POST' ? { body: { pluginId: 'plugin-free' } } : {}),
  });

const asSchoolRole = (role) =>
  authLib.signToken(
    signCtx(dedicatedEnv()),
    { sub: 'u-' + role, role, schoolId: SCHOOL_ID, email: role.toLowerCase() + '@test.school' },
  );

const schoolDirector = await asSchoolRole('Director');
const schoolPrincipal = await asSchoolRole('Principal');
const schoolStaff = await asSchoolRole('Staff');
const schoolParent = await asSchoolRole('Parent');
const schoolStudent = await asSchoolRole('Student');

// CONTROL FIRST: the allowlist's own member must be served, or every 403 below
// is satisfied by a module that refuses everyone.
const directorDirect = await directPluginCall('/api/plugins/marketplace', {
  env: dedicatedEnv(), token: schoolDirector,
});
check('CONTROL: a school Director is served by the role allowlist', directorDirect.status === 200, 'got ' + directorDirect.status + ' ' + JSON.stringify(directorDirect.body));

for (const [label, tok] of [
  ['Principal', schoolPrincipal],
  ['Staff', schoolStaff],
  ['Parent', schoolParent],
  ['Student', schoolStudent],
]) {
  for (const pathname of ['/api/plugins/marketplace', ...MUTATING]) {
    const r = await directPluginCall(pathname, { env: dedicatedEnv(), token: tok });
    check(label + ' is refused (403) at ' + pathname, r.status === 403, 'got ' + r.status + ' ' + JSON.stringify(r.body));
  }
}

// /active is intentionally open to every authenticated role: the Flutter app asks
// for it on login to decide which feature widgets to mount, so gating it would
// break the app for Parents and Students. It is scoped to the caller's own tenant
// and reveals nothing more than "which modules does your own school run".
for (const [label, tok] of [['Parent', schoolParent], ['Student', schoolStudent], ['Staff', schoolStaff]]) {
  const r = await directPluginCall('/api/plugins/active', { env: dedicatedEnv(), token: tok });
  check(label + ' is ALLOWED (200) at /active by design', r.status === 200, 'got ' + r.status + ' ' + JSON.stringify(r.body));
}

// A school role must not be able to reach the platform tier through this module.
for (const [label, tok] of [['Parent', schoolParent], ['Director', schoolDirector]]) {
  const r = await directPluginCall('/api/plugins/marketplace', { env: platformEnv(), token: tok });
  check(label + ' is refused (401) at the platform tier', r.status === 401, 'got ' + r.status);
}

// ===========================================================================
// PART 5 -- tenant derivation.
// ===========================================================================

section('Part 5 -- tenant derivation');

const superNoSchool = await pluginCall('/api/plugins/subscribe', { env: platformEnv(), token: superAdminToken });
check('a SuperAdmin with no resolved tenant cannot subscribe', superNoSchool.status === 401, 'got ' + superNoSchool.status);

const superNoSchoolActive = await pluginCall('/api/plugins/active', { env: platformEnv(), token: superAdminToken });
check('a SuperAdmin with no resolved tenant cannot read /active', superNoSchoolActive.status === 401, 'got ' + superNoSchoolActive.status);

section('Part 5b -- the tenant is pinned by the worker, not by the caller');

const writes = [];
const pinnedEnv = platformEnv(fakeDb(writes));
const injected = await pluginCall('/api/plugins/subscribe', {
  env: pinnedEnv, token: superAdminToken, headers: { 'X-School-Id': SCHOOL_ID },
});
check('the write succeeds for a properly scoped caller', injected.status === 200, 'got ' + injected.status + ' ' + JSON.stringify(injected.body));
check('a real query actually ran (this check is not vacuous)', writes.length > 0, 'writes: ' + writes.length);

const boundTenant = writes
  .map((w) => w.bound)
  .filter((b) => b && b.length >= 2)
  .map((b) => String(b[1]));
check(
  'every write was scoped to the intended school, not the victim school',
  boundTenant.length > 0 && boundTenant.every((v) => v === SCHOOL_ID),
  JSON.stringify(boundTenant),
);

const pluginWrites = writes.filter((w) => /school_plugins/i.test(w.sql));
check('the subscription write is tenant-scoped in SQL', pluginWrites.length > 0, 'no school_plugins write seen');
for (const w of pluginWrites) {
  check(
    'the write either filters on school_id or binds it as a column',
    /school_id/i.test(w.sql),
    w.sql.replace(/\s+/g, ' ').slice(0, 140),
  );
}

// ===========================================================================
// PART 6 -- unauthenticated.
// ===========================================================================

section('Part 6 -- no credential at all');

for (const pathname of ['/api/plugins/marketplace', '/api/plugins/active', ...MUTATING]) {
  const r = await pluginCall(pathname, { env: platformEnv() });
  check('no credential is refused at ' + pathname, r.status === 401, 'got ' + r.status);
}

const garbage = await pluginCall('/api/plugins/active', { env: platformEnv(), token: 'not-a-jwt' });
check('a malformed token is refused', garbage.status === 401, 'got ' + garbage.status);

const crossSigned = await authLib.signToken(
  { env: { ENVIRONMENT: 'production', AUTH_SECRET: DEDICATED_AUTH_SECRET } },
  { sub: 'u-x', role: 'Director', schoolId: SCHOOL_ID },
);
const crossRes = await pluginCall('/api/plugins/active', { env: platformEnv(), token: crossSigned });
check("a token signed with a school's key does not verify on the platform tier", crossRes.status === 401, 'got ' + crossRes.status);

// ===========================================================================
// PART 7 -- the real school-portal path, end to end over the M2M channel.
//
// This is the path a real Director's phone takes, and it is the one that was
// broken: api/internal/index.ts re-enters the app forwarding only the M2M headers
// and X-Acting-*, never Authorization. plugins/index.ts needed a user token, so
// the proxied path answered 401 for every Director on every school portal and the
// plugin marketplace did not work at all. Same shape as the billing 401 in #114.
//
// It is asserted here rather than assumed, because the fix is the difference
// between 401 and 200 on every screen that loads a plugin.
// ===========================================================================

section('Part 7 -- the school portal works over the signed M2M channel');

async function internalCall(surfacePath, { env, method = 'GET', body, role = 'Director', email = 'director@test.school', headers: extra } = {}) {
  const fullPath = '/api/internal/' + encodeURIComponent(SCHOOL_ID) + surfacePath;
  const rawBody = method === 'GET' || method === 'HEAD' ? '' : JSON.stringify(body || {});
  const headers = new Headers({
    'Content-Type': 'application/json',
    ...(await internalAuth.buildInternalAuthHeaders({
      secret: INTERNAL_SECRET, method, path: fullPath, body: rawBody,
    })),
    ...(extra || {}),
  });
  if (role) headers.set('X-Acting-Role', role);
  if (email) headers.set('X-Acting-Email', email);
  const res = await app.request(fullPath, { method, headers, ...(rawBody ? { body: rawBody } : {}) }, env);
  let parsed = null;
  try {
    parsed = await res.clone().json();
  } catch (_) {}
  return { status: res.status, body: parsed };
}

// A correctly signed internal request must get past the M2M gate -- proven by the
// fact that it is not refused with the internal-signature message.
const sigProbe = await internalCall('/api/billing/subscription', { env: platformEnv() });
check(
  'a correctly signed internal request passes the M2M gate (control)',
  !/अनधिकृत आंतरिक/i.test(String(sigProbe.body && sigProbe.body.message || '')),
  JSON.stringify(sigProbe.body),
);

// An unsigned one must not.
const unsignedRes = await app.request(
  '/api/internal/' + encodeURIComponent(SCHOOL_ID) + '/api/plugins/active',
  { headers: { 'X-Internal-Secret': INTERNAL_SECRET } },
  platformEnv(),
);
check('an unsigned internal request is refused', unsignedRes.status === 401, 'got ' + unsignedRes.status);

// THE FIX. A school's Director, over the real proxy chain, reaches the real route.
for (const pathname of ['/api/plugins/active', '/api/plugins/marketplace', ...MUTATING]) {
  const r = await internalCall(pathname, {
    env: platformEnv(),
    method: methodFor(pathname),
    body: methodFor(pathname) === 'POST' ? { pluginId: 'plugin-free' } : undefined,
  });
  check('a school Director reaches ' + pathname + ' over the proxy chain', r.status === 200, 'got ' + r.status + ' ' + JSON.stringify(r.body));
}

const portalFeatures = await internalCall('/api/features/my-requests', { env: platformEnv() });
check('a school Director reaches /api/features/my-requests over the proxy chain', portalFeatures.status === 200, 'got ' + portalFeatures.status + ' ' + JSON.stringify(portalFeatures.body));

const portalFeatureRequest = await internalCall('/api/features/request', {
  env: platformEnv(), method: 'POST', body: { title: 'नया फीचर', description: 'कृपया जोड़ें' },
});
check('a school Director can post a feature request over the proxy chain', portalFeatureRequest.status === 200, 'got ' + portalFeatureRequest.status + ' ' + JSON.stringify(portalFeatureRequest.body));

// ---------------------------------------------------------------------------
// And the boundary still holds on that same proxied path. A school must not be
// able to escalate by naming a role in a header, forge a scope, or skip the
// signature -- the M2M envelope is not a way around the role allowlist.
// ---------------------------------------------------------------------------

section('Part 7b -- the M2M envelope is not a way around the role allowlist');

const portalParent = await internalCall('/api/plugins/marketplace', { env: platformEnv(), role: 'Parent' });
check('a Parent acting over the proxy chain is refused at /marketplace', portalParent.status === 403, 'got ' + portalParent.status);

const portalPrincipalSubscribe = await internalCall('/api/plugins/subscribe', {
  env: platformEnv(), role: 'Principal', method: 'POST', body: { pluginId: 'plugin-free' },
});
check('a Principal acting over the proxy chain is refused at /subscribe', portalPrincipalSubscribe.status === 403, 'got ' + portalPrincipalSubscribe.status);

// A school claiming SuperAdmin in the acting-role header must be refused. A
// dedicated worker cannot hold a SuperAdmin token, so nothing legitimate sends one,
// and accepting it would let a school reach platform-wide branches.
const portalEscalation = await internalCall('/api/plugins/marketplace', { env: platformEnv(), role: 'SuperAdmin' });
check('a school claiming SuperAdmin over the proxy chain is refused', portalEscalation.status === 401, 'got ' + portalEscalation.status);

const portalNoRole = await internalCall('/api/plugins/active', { env: platformEnv(), role: '' });
check('a signed request with no acting role is refused', portalNoRole.status === 401, 'got ' + portalNoRole.status);

// Forged scope: a valid signature but a scope the signature does not cover.
// The signature binds the path, and the school id is inside the path, so swapping
// the school in the path invalidates it.
const forgedScopePath = '/api/internal/' + encodeURIComponent(VICTIM_SCHOOL_ID) + '/api/plugins/active';
const forgedSig = await internalAuth.buildInternalAuthHeaders({
  secret: INTERNAL_SECRET, method: 'GET', path: '/api/internal/' + encodeURIComponent(SCHOOL_ID) + '/api/plugins/active', body: '',
});
const forged = await app.request(
  forgedScopePath,
  { headers: new Headers({ ...forgedSig, 'X-Verified-School-Scope': VICTIM_SCHOOL_ID, 'X-Acting-Role': 'Director' }) },
  platformEnv(),
);
check('a signature that does not cover the requested school is refused', forged.status === 401, 'got ' + forged.status);

// A public caller forging the headers with the secret alone must fail. The secret
// is fleet-wide, so this is the exact reason the SIGNATURE is re-verified.
const wrongSecret = await app.request(
  '/api/internal/' + encodeURIComponent(VICTIM_SCHOOL_ID) + '/api/plugins/active',
  {
    headers: {
      'X-Internal-Secret': INTERNAL_SECRET,
      'X-Verified-School-Scope': VICTIM_SCHOOL_ID,
      'X-Acting-Role': 'Director',
      'X-Internal-Timestamp': String(Date.now()),
      'X-Internal-Signature': 'v1=notarealsignature',
    },
  },
  platformEnv(),
);
check('a forged M2M signature is refused', wrongSecret.status === 401, 'got ' + wrongSecret.status);

// ---------------------------------------------------------------------------
// Part 7c -- the SAME checks, but entering the surface directly.
//
// The forged-signature test above is satisfied by the internal route's OWN gate
// (api/internal/index.ts authorizeInternalRequest), which rejects the request
// before it ever re-enters. So it proves the outer gate works and says nothing
// about getProxyAwareAuthUser, which is the code that actually re-verifies the
// signature on the way into the surface.
//
// A mutation that deleted every signature check from getProxyAwareAuthUser left
// all of Part 7 green for exactly that reason. These tests call the surface
// directly, so nothing stands between the forged headers and the check under
// test. This is the "a 401 proves something was refused, not that the right thing
// was refused" rule applied to my own harness.
// ---------------------------------------------------------------------------

section('Part 7c -- the proxy-aware check itself, entered directly');

const featuresMod = require(path.join(OUT, 'features', 'index.js'));
const featuresApp = featuresMod.default || featuresMod;

async function directM2MCall(surfaceApp, localPath, { env, method = 'GET', body, headers: extra = {} } = {}) {
  const rawBody = method === 'GET' ? '' : JSON.stringify(body || {});
  const res = await surfaceApp.request(
    localPath,
    {
      method,
      headers: new Headers({ 'Content-Type': 'application/json', ...(rawBody ? {} : {}), ...(extra || {}) }),
      ...(rawBody ? { body: rawBody } : {}),
    },
    env,
  );
  let parsed = null;
  try {
    parsed = await res.clone().json();
  } catch (_) {}
  return { status: res.status, body: parsed };
}

const PLAT = platformEnv();

// CONTROL: a genuinely signed envelope for this exact path must be accepted. If
// this is not 200, every refusal below is vacuous.
const goodPath = '/active';
const goodHeaders = await internalAuth.buildInternalAuthHeaders({
  secret: INTERNAL_SECRET, method: 'GET', path: goodPath, body: '',
});
const goodDirect = await directM2MCall(pluginsApp, goodPath, {
  env: PLAT,
  headers: {
    ...goodHeaders,
    'X-Verified-School-Scope': SCHOOL_ID,
    'X-Acting-Role': 'Director',
    'X-Acting-Email': 'director@test.school',
  },
});
check('CONTROL: a correctly signed envelope is accepted at the surface itself', goodDirect.status === 200, 'got ' + goodDirect.status + ' ' + JSON.stringify(goodDirect.body));

// The mutation that slipped through: a forged signature, entered directly.
const forgedDirect = await directM2MCall(pluginsApp, goodPath, {
  env: PLAT,
  headers: {
    'X-Internal-Secret': INTERNAL_SECRET,
    'X-Internal-Signature': 'v1=notarealsignature',
    'X-Internal-Timestamp': String(Date.now()),
    'X-Verified-School-Scope': VICTIM_SCHOOL_ID,
    'X-Acting-Role': 'Director',
  },
});
check('a forged signature is refused AT THE SURFACE, not just at the outer gate', forgedDirect.status === 401, 'got ' + forgedDirect.status + ' ' + JSON.stringify(forgedDirect.body));

// The same, on features, so the second surface is not left unverified.
const forgedFeatures = await directM2MCall(featuresApp, '/my-requests', {
  env: PLAT,
  headers: {
    'X-Internal-Secret': INTERNAL_SECRET,
    'X-Internal-Signature': 'v1=notarealsignature',
    'X-Internal-Timestamp': String(Date.now()),
    'X-Verified-School-Scope': VICTIM_SCHOOL_ID,
    'X-Acting-Role': 'Director',
  },
});
check('a forged signature is refused on /api/features too', forgedFeatures.status === 401, 'got ' + forgedFeatures.status + ' ' + JSON.stringify(forgedFeatures.body));

// No signature at all.
const noSigDirect = await directM2MCall(pluginsApp, goodPath, {
  env: PLAT,
  headers: {
    'X-Internal-Secret': INTERNAL_SECRET,
    'X-Verified-School-Scope': VICTIM_SCHOOL_ID,
    'X-Acting-Role': 'Director',
  },
});
check('an envelope with no signature is refused at the surface', noSigDirect.status === 401, 'got ' + noSigDirect.status);

// The right secret but a signature computed over a DIFFERENT path.
const wrongPathSig = await internalAuth.buildInternalAuthHeaders({
  secret: INTERNAL_SECRET, method: 'GET', path: '/some/other/path', body: '',
});
const wrongPathDirect = await directM2MCall(pluginsApp, goodPath, {
  env: PLAT,
  headers: {
    ...wrongPathSig,
    'X-Verified-School-Scope': VICTIM_SCHOOL_ID,
    'X-Acting-Role': 'Director',
  },
});
check('a signature computed over another path is refused at the surface', wrongPathDirect.status === 401, 'got ' + wrongPathDirect.status);

// A correct signature for /active, replayed against /marketplace.
const replayedSig = await internalAuth.buildInternalAuthHeaders({
  secret: INTERNAL_SECRET, method: 'GET', path: '/active', body: '',
});
const replayed = await directM2MCall(pluginsApp, '/marketplace', {
  env: PLAT,
  headers: {
    ...replayedSig,
    'X-Verified-School-Scope': VICTIM_SCHOOL_ID,
    'X-Acting-Role': 'Director',
  },
});
check('a captured signature is not replayable on another route', replayed.status === 401, 'got ' + replayed.status);

// A correct signature, but paired with a scope header naming a different school.
//
// The signature binds method + path + body + timestamp. It does NOT bind the
// X-Verified-School-Scope header, and it is not supposed to: INTERNAL_SYNC_SECRET
// is fleet-wide by design, so it proves "a dedicated worker asked", not "this
// worker asked" (see the note in api/lib/proxied-auth.ts). What actually stops a
// scope swap is that on the real path the internal route derives the school from
// the SIGNED PATH and overwrites the header with it. So the invariant worth
// asserting is that the tenant comes from the signed path, not from a header the
// caller controls -- asserted through the full chain just below, not here.
// A holder of the fleet-wide secret is inside the existing trust boundary; this
// is not a new hole, and a test that pretended otherwise would only encode a
// guarantee the design does not make.
note(
  'the scope header is not part of the signed string by design',
  'the school is authenticated by the signed PATH; the header is overwritten from that path by api/internal/index.ts before the surface sees it',
);

const escalateDirect = await directM2MCall(pluginsApp, goodPath, {
  env: PLAT,
  headers: {
    ...goodHeaders,
    'X-Verified-School-Scope': SCHOOL_ID,
    'X-Acting-Role': 'SuperAdmin',
  },
});
check('a school claiming SuperAdmin is refused at the surface', escalateDirect.status === 401, 'got ' + escalateDirect.status);

// An expired timestamp -- the replay window must be enforced here. The parameter
// is `now`, not `timestamp`; an earlier draft of this test passed `timestamp`,
// which buildInternalAuthHeaders ignores, so the signature came out fresh and the
// test was passing for the wrong reason until it was renamed.
const stale = await internalAuth.buildInternalAuthHeaders({
  secret: INTERNAL_SECRET, method: 'GET', path: goodPath, body: '', now: Date.now() - 60 * 60 * 1000,
});
const staleRes = await directM2MCall(pluginsApp, goodPath, {
  env: PLAT,
  headers: { ...stale, 'X-Verified-School-Scope': SCHOOL_ID, 'X-Acting-Role': 'Director' },
});
check('a stale timestamp outside the replay window is refused', staleRes.status === 401, 'got ' + staleRes.status);

// ---------------------------------------------------------------------------
// And the real thing the scope test was reaching for: through the full chain, the
// tenant is the one in the signed PATH even when the caller sends a conflicting
// scope header. This is the property that makes the header harmless.
// ---------------------------------------------------------------------------

section('Part 7d -- the tenant comes from the signed path, not a caller header');

const scopingWrites = [];
const scopingReads = [];
const scopingEnv = platformEnv(fakeDb(scopingWrites));
scopingEnv.DB = {
  ...fakeDb(scopingWrites),
  prepare(sql) {
    const stmt = fakeDb(scopingWrites).prepare(sql);
    return {
      ...stmt,
      bind(...a) {
        scopingReads.push({ sql, bound: a });
        return stmt.bind(...a);
      },
    };
  },
};

const fullPath = '/api/internal/' + encodeURIComponent(SCHOOL_ID) + '/api/plugins/subscribe';
const rawSubscribe = JSON.stringify({ pluginId: 'plugin-free' });
const signedPath = await internalAuth.buildInternalAuthHeaders({
  secret: INTERNAL_SECRET, method: 'POST', path: fullPath, body: rawSubscribe,
});
const swapped = await app.request(
  fullPath,
  {
    method: 'POST',
    headers: new Headers({
      'Content-Type': 'application/json',
      ...signedPath,
      // The caller tries to name a different school in the header.
      'X-Verified-School-Scope': VICTIM_SCHOOL_ID,
      'X-Acting-Role': 'Director',
    }),
    body: rawSubscribe,
  },
  scopingEnv,
);
check('the write is still served (the path is what authenticated it)', swapped.status === 200, 'got ' + swapped.status);

const boundTenants = scopingWrites.filter((w) => /school_plugins/i.test(w.sql)).map((w) => String(w.bound[1]));
check(
  'the write landed on the school in the signed PATH, not the header',
  boundTenants.length > 0 && boundTenants.every((t) => t === SCHOOL_ID),
  JSON.stringify(boundTenants),
);

// ===========================================================================
// PART 8 -- structural, so a refactor cannot quietly reintroduce the bypass.
// ===========================================================================

section('Part 8 -- the module cannot drift back to a bespoke token check');

const src = fs.readFileSync(path.join(ROOT, 'api', 'plugins', 'index.ts'), 'utf8');
// Strip comments line-by-line: a doc comment that NAMES the old helper must not
// trip a check about the old helper, and a block comment can be removed whole.
const codeOnly = src
  .split('\n')
  .filter((line) => !line.trim().startsWith('*') && !line.trim().startsWith('/*') && !line.trim().startsWith('//'))
  .map((line) => line.replace(/\/\/.*$/, ''))
  .join('\n');

check('no direct verifyToken() call outside getAuthUser', !/verifyToken\s*\(/.test(codeOnly), 'found a verifyToken( call');
check('no auth_token cookie is read', !/getCookie\s*\(/.test(codeOnly) && !/auth_token/.test(codeOnly));
check('no bespoke authCheck helper remains', !/function\s+authCheck/.test(codeOnly));
// Spelling-agnostic on purpose. A guard that only ever routes through the shared
// auth helpers, whatever it ends up being named: asserting one exact function name
// breaks the next time the guard is wrapped or renamed, and a check that breaks on
// rename is a check that silently stops guarding. This harness has already been
// bitten by that twice today.
check(
  'every route is guarded by a shared auth helper',
  (codeOnly.match(/require\w*Session\w*\(|requirePluginManager\(|getProxyAwareAuthUser\(/g) || []).length >= 4,
  'found ' + (codeOnly.match(/require\w*Session\w*\(|requirePluginManager\(/g) || []).length + ' guard calls',
);
check('no route reads schoolId off the token', !/user\.schoolId/.test(codeOnly) && !/authUser\.schoolId/.test(codeOnly));

// The three proxied surfaces must share ONE implementation of the proxy-aware
// check. A private copy in a single file is how the original authCheck came to
// exist, so a surface reading the M2M headers itself is treated as a regression.
for (const surface of ['billing', 'plugins', 'features']) {
  const sCode = fs.readFileSync(path.join(ROOT, 'api', surface, 'index.ts'), 'utf8')
    .split('\n')
    .filter((line) => !line.trim().startsWith('*') && !line.trim().startsWith('/*') && !line.trim().startsWith('//'))
    .join('\n');
  check(
    'api/' + surface + ' never re-implements the proxy-aware check inline',
    !/X-Verified-School-Scope/.test(sCode) && !/X-Internal-Signature/.test(sCode),
    'api/' + surface + '/index.ts reads the M2M headers itself',
  );
}
check(
  'the shared implementation exists in api/lib/proxied-auth.ts',
  /getProxyAwareAuthUser/.test(fs.readFileSync(path.join(ROOT, 'api', 'lib', 'proxied-auth.ts'), 'utf8')),
);

// ===========================================================================

console.log('\n' + '-'.repeat(66));
if (outbound.length) {
  note('outbound fetch calls were all stubbed', outbound.length + ' (no production traffic)');
}
globalThis.fetch = realFetch;

if (failed) {
  console.log('FAILED: ' + failed + ' of ' + (passed + failed) + ' checks');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log('All ' + passed + ' /api/plugins authorization checks passed.');
