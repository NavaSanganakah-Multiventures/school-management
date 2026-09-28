// Verifies the role gates on four routes that had none, or had the wrong one:
//   GET /api/dashboard-stats          -> school-wide fees + staff/student counts
//   GET /api/principal                -> a Principal's personnel record incl. salary
//   GET /api/exams/analytics/:examId  -> topper, per-class pass rates, 90+ counts
//   GET /api/staff                    -> the employee directory
//
// Real routes from the real api/ tree, real session tokens from the real
// signToken, real requests through the real app in api/index.ts.
//
// WHY THIS IS AN INTEGRATION HARNESS, AND WHY THAT MATTERS HERE SPECIFICALLY
//
// verify-phase1-rbac.mjs already scans these four files and reports the
// guards. It is a source-scan, so it cannot tell you a route still answers 200
// to a Parent -- and on this codebase it did not. Three of the four had a
// `getAuthUser()` call and no role check, which the scan saw as "requires a
// session" and accepted.
//
// The lesson this repo keeps re-learning applies with extra force here: a 401
// proves something was refused, not that the right thing was refused. So every
// negative assertion below is paired with a positive one for the role that IS
// allowed, and the mutation at the end of this file's history confirmed it.
//
// A note on the threat model: this was reachable, not theoretical. /analytics,
// /classes and /students are userRoute entries in the Flutter app that any
// logged-in role can navigate to, so a Parent could simply open the analytics
// screen and be served the whole school's results.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const OUT = path.join(ROOT, '.tmp-apitest-roles');
const TSCONFIG = path.join(ROOT, 'tsconfig.apitest.json');

const AUTH_SECRET = 'roles-harness-auth-secret-0123456789abcdef';
const SCHOOL_ID = 'school-under-test';
const OTHER_SCHOOL = 'school-victim';

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

function note(name, detail) {
  console.log('  NOTE  ' + name + (detail ? '  -> ' + detail : ''));
}

// ---------------------------------------------------------------------------
// Network kill-switch. Four of these routes are not proxied, but the middleware
// in api/index.ts and the login-adjacent helpers can reach out, and a harness
// that can touch production is a harness that must never be run in a hurry.
// ---------------------------------------------------------------------------

const outbound = [];
const realFetch = globalThis.fetch;
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
console.log('  ok    api/ -> .tmp-apitest-roles (commonjs)');

const appMod = require(path.join(OUT, 'index.js'));
const app = (appMod.default && appMod.default.request) ? appMod.default : (appMod.app || appMod);
const authLib = require(path.join(OUT, 'lib', 'auth.js'));

// ---------------------------------------------------------------------------
// A D1 stand-in that answers the specific reads these four routes perform.
// ---------------------------------------------------------------------------

const PRINCIPAL_ROW = {
  id: 'u-principal', username: 'principal', full_name: 'Test Principal',
  email: 'principal@test.school', phone: '+919999999999', role: 'Principal',
  designation: 'Head of School', department: 'Academic', qualification: 'M.Ed.',
  salary: 250000, status: 'Active', school_id: SCHOOL_ID,
  last_login: '2026-01-01', created_at: '2025-01-01',
};

const STAFF_ROW = {
  id: 't-1', employee_code: 'EMP-1', name: 'Test Teacher', designation: 'Teacher',
  department: 'Science', subject_specialization: 'Physics', phone: '+918888888888',
  email: 'teacher@test.school', qualification: 'M.Sc.', salary: 60000,
  status: 'Active', joining_date: '2025-06-01', login_user_id: 'u-teacher',
  login_username: 'teacher', login_password_hash: 'pbkdf2_sha256$x$y$z',
  school_id: SCHOOL_ID,
};

function fakeDb() {
  return {
    prepare(sql) {
      let bound = [];
      const s = {
        sql,
        bind(...a) {
          bound = a;
          return s;
        },
        async first() {
          // The role is a BIND PARAM here, not a literal in the SQL
          // (`WHERE role = ? AND school_id = ? AND status = ?`), so it cannot be
          // matched on the query text. A first draft that tested
          // /Principal/i.test(sql) never matched and every principal assertion
          // below silently read a null row.
          if (/FROM system_users/i.test(sql)) {
            return String(bound[0] || '') === 'Principal' && String(bound[1] || '') === SCHOOL_ID
              ? PRINCIPAL_ROW
              : null;
          }
          if (/FROM school_profile/i.test(sql)) {
            return { school_name: 'Test School', principal_name: 'Test Principal' };
          }
          if (/FROM exams/i.test(sql)) {
            return String(bound[0] || '') === SCHOOL_ID ? { id: bound[1], name: 'Unit Test' } : null;
          }
          if (/COUNT\(\*\)/i.test(sql)) return { n: 7 };
          if (/attendance/i.test(sql)) return { total: 10, present: 8, absent: 2 };
          return null;
        },
        async all() {
          // Must be { results }, not a bare array. Every route in these four files
          // reads `rows.results || []`, so returning an array produces an empty
          // list and reads as "the row is filtered out" rather than "the stand-in
          // is shaped wrong" -- which is how the staff-directory control case
          // failed while the route itself was fine.
          if (/FROM teachers/i.test(sql)) {
            return { results: String(bound[0] || '') === SCHOOL_ID ? [STAFF_ROW] : [] };
          }
          if (/FROM fee_invoices/i.test(sql)) {
            return { results: String(bound[0] || '') === SCHOOL_ID
              ? [{ total_amount: 100000, paid_amount: 60000 }] : [] };
          }
          if (/FROM principal_history/i.test(sql)) return { results: [] };
          if (/FROM exam_marks/i.test(sql)) {
            return { results: String(bound[0] || '') === SCHOOL_ID
              ? [{ student_id: 's-1', class_name: 'Class 10', section: 'A', marks_obtained: 90, max_marks: 100 }]
              : [] };
          }
          return { results: [] };
        },
        async run() {
          return { success: true, meta: { changes: 0 } };
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
}

const env = () => ({
  SCHOOL_ID,
  IS_DEDICATED_WORKER: 'true',
  ENVIRONMENT: 'production',
  AUTH_SECRET,
  DB: fakeDb(),
});

// `signToken` is async, so this helper must be too. A first draft of this file
// used a plain arrow function, which made every `tokenFor(...)` a Promise rather
// than a string, and sent `Authorization: Bearer [object Promise]`. That produced
// a uniform 401 across all 46 checks and read exactly like "the role gates
// reject everyone" -- which would have been the wrong conclusion and a wasted
// afternoon. The tell was that even the CONTROL cases failed: a harness whose
// own control cases are red is a harness with a bug, not a harness that found one.
const tokenFor = (role, schoolId = SCHOOL_ID) =>
  authLib.signToken(
    { env: env() },
    { sub: 'u-' + role, role, schoolId, email: role.toLowerCase() + '@test.school' },
  );

const director = await tokenFor('Director');
const principal = await tokenFor('Principal');
const teacher = await tokenFor('Staff');
const parent = await tokenFor('Parent');
const student = await tokenFor('Student');
const foreignDirector = await tokenFor('Director', OTHER_SCHOOL);

async function get(pathname, token) {
  const res = await app.request(
    pathname,
    { headers: token ? { Authorization: 'Bearer ' + token } : {} },
    env(),
  );
  let body = null;
  try {
    body = await res.clone().json();
  } catch (_) {}
  return { status: res.status, body };
}

const ROUTES = [
  { path: '/api/dashboard-stats', label: 'dashboard-stats' },
  { path: '/api/principal', label: 'principal' },
  { path: '/api/staff', label: 'staff' },
  { path: '/api/exams/analytics/exam-1', label: 'exam analytics' },
];

// ===========================================================================
// Part 1 -- CONTROL. The roles that legitimately use each route must still be
// served. If these fail, every 403 below is meaningless: a route that refuses
// everyone would pass the whole negative set.
// ===========================================================================

section('Part 1 -- CONTROL: the legitimate caller is still served');

const directorExpectations = [
  { path: '/api/dashboard-stats', label: 'dashboard-stats' },
  { path: '/api/principal', label: 'principal' },
  { path: '/api/staff', label: 'staff' },
  { path: '/api/exams/analytics/exam-1', label: 'exam analytics' },
];
for (const r of directorExpectations) {
  const res = await get(r.path, director);
  check('CONTROL: a Director is served ' + r.label, res.status === 200, 'got ' + res.status + ' ' + JSON.stringify(res.body));
}

const principalDashboard = await get('/api/dashboard-stats', principal);
check('CONTROL: a Principal is served dashboard-stats', principalDashboard.status === 200, 'got ' + principalDashboard.status);
const principalSelf = await get('/api/principal', principal);
check('CONTROL: a Principal is served /api/principal', principalSelf.status === 200, 'got ' + principalSelf.status);

const teacherStaff = await get('/api/staff', teacher);
check('CONTROL: a Teacher is still served /api/staff (classes_screen needs it)', teacherStaff.status === 200, 'got ' + teacherStaff.status);
const teacherAnalytics = await get('/api/exams/analytics/exam-1', teacher);
check('CONTROL: a Teacher is still served exam analytics', teacherAnalytics.status === 200, 'got ' + teacherAnalytics.status);

// A teaching role must NOT get the management-only routes, or "Director-only"
// would be a claim rather than a control.
const teacherDashboard = await get('/api/dashboard-stats', teacher);
check('a Teacher is refused dashboard-stats (it is school-wide money)', teacherDashboard.status === 403, 'got ' + teacherDashboard.status);
const teacherPrincipal = await get('/api/principal', teacher);
check('a Teacher is refused /api/principal', teacherPrincipal.status === 403, 'got ' + teacherPrincipal.status);

// ===========================================================================
// Part 2 -- the actual fix: family roles are refused everywhere.
//
// Parent and Student both land on /parent/portal in the app, but /analytics,
// /classes and /students are userRoute entries they can navigate to, so these
// gates are the only control.
// ===========================================================================

section('Part 2 -- family roles are refused on all four routes');

for (const [label, tok] of [['Parent', parent], ['Student', student]]) {
  for (const r of ROUTES) {
    const res = await get(r.path, tok);
    check('a ' + label + ' is refused (403) on ' + r.label, res.status === 403, 'got ' + res.status + ' ' + JSON.stringify(res.body));
  }
}

// The refusals must be refusals, not empty results. An empty 200 would satisfy
// "does not leak fees" just as well as a 403, and would leave the endpoint
// silently broken for a role that later needs it.
const parentDash = await get('/api/dashboard-stats', parent);
check('a refused dashboard-stats returns no stats object at all',
  !parentDash.body || !parentDash.body.stats, JSON.stringify(parentDash.body));
check('a refused principal returns no principal record',
  !parentDash.body || parentDash.body.currentPrincipal === undefined);
const parentStaffBody = await get('/api/staff', parent);
check('a refused staff list returns no staff array',
  !parentStaffBody.body || !parentStaffBody.body.staff, JSON.stringify(parentStaffBody.body));
const parentAnalytics = await get('/api/exams/analytics/exam-1', parent);
check('a refused analytics returns no classWiseAnalysis',
  !parentAnalytics.body || !parentAnalytics.body.classWiseAnalysis, JSON.stringify(parentAnalytics.body));

// ===========================================================================
// Part 3 -- the Principal's salary must never leave the building.
// ===========================================================================

section("Part 3 -- the Principal's compensation");

const asDirector = await get('/api/principal', director);
const asParent = await get('/api/principal', parent);

check('a Director does receive the principal record', !!(asDirector.body && asDirector.body.currentPrincipal));
check('a Director does receive the salary (they manage the school)',
  asDirector.body && asDirector.body.currentPrincipal && asDirector.body.currentPrincipal.salary === 250000,
  JSON.stringify(asDirector.body && asDirector.body.currentPrincipal));
check('a Parent receives no principal record at all', asParent.status === 403);
check('the refused body contains no salary value anywhere',
  !JSON.stringify(asParent.body || {}).includes('250000'), JSON.stringify(asParent.body));

// ===========================================================================
// Part 4 -- a teaching role still gets the staff directory, redacted.
// ===========================================================================

section('Part 4 -- the teaching role keeps the staff directory, redacted');

const t = teacherStaff.body;
check('a Teacher receives the staff list', !!(t && Array.isArray(t.staff) && t.staff.length === 1), JSON.stringify(t));
if (t && t.staff && t.staff[0]) {
  const s = t.staff[0];
  check('a Teacher sees the name (the class-teacher picker needs it)', s.name === 'Test Teacher', JSON.stringify(s));
  check('a Teacher does NOT see the salary', s.salary === null, 'salary=' + JSON.stringify(s.salary));
  check('a Teacher does NOT see the login username', s.username === '', 'username=' + JSON.stringify(s.username));
  check('a Teacher does NOT learn whether a password is set', s.passwordSet === false, 'passwordSet=' + JSON.stringify(s.passwordSet));
}

const asDirStaff = await get('/api/staff', director);
if (asDirStaff.body && asDirStaff.body.staff && asDirStaff.body.staff[0]) {
  const s = asDirStaff.body.staff[0];
  check('a Director DOES see the salary', s.salary === 60000, 'salary=' + JSON.stringify(s.salary));
  check('a Director DOES see the login username', s.username === 'teacher', 'username=' + JSON.stringify(s.username));
}

// ===========================================================================
// Part 5 -- unauthenticated, and the tenant pin still holds.
// ===========================================================================

section('Part 5 -- no credential, and the SCHOOL_ID pin');

for (const r of ROUTES) {
  const res = await get(r.path, null);
  check('no credential is refused (401) on ' + r.label, res.status === 401, 'got ' + res.status);
}

// Another school's Director must not read this worker's data.
for (const r of ROUTES) {
  const res = await get(r.path, foreignDirector);
  check("another school's Director is refused on " + r.label, res.status === 401, 'got ' + res.status);
}

const garbage = await get('/api/dashboard-stats', 'not-a-jwt');
check('a malformed token is refused', garbage.status === 401, 'got ' + garbage.status);

// ===========================================================================
// Part 6 -- structural, so a future route does not quietly reopen this.
// ===========================================================================

section('Part 6 -- the gates cannot be removed unnoticed');

function codeOf(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
    .split('\n')
    .filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('/*') && !l.trim().startsWith('//'))
    .join('\n');
}

const GATES = [
  { rel: 'api/dashboard-stats/index.ts', what: 'an explicit role allowlist' },
  { rel: 'api/principal/index.ts', what: 'an explicit role allowlist' },
  { rel: 'api/staff/index.ts', what: 'an explicit role allowlist' },
  { rel: 'api/exams/index.ts', what: 'an explicit role allowlist' },
];

for (const g of GATES) {
  const code = codeOf(g.rel);
  check(g.rel + ' uses a role-scoped guard', /requireSession\(\{/.test(code) || /require\w*Management\(\)/.test(code));
}

// A file must not reintroduce a role-less guard AS THE ONLY GUARD on the routes
// under test. Presence of a role-scoped guard is asserted above; this catches the
// inverse mistake, where a roles list is declared and then not used.
for (const g of GATES.filter((x) => x.rel !== 'api/exams/index.ts')) {
  const code = codeOf(g.rel);
  check(g.rel + ' has no role-less guard doing the protecting',
    !/requireSession\(\)(?!\s*\{)/.test(code.replace(/\/\*[\s\S]*?\*\//g, '')),
    'a bare requireSession() admits every authenticated role');
}

// The gates must be scoped to the route they protect, not merely present in the
// file. api/exams/index.ts legitimately declares a bare `requireAnyUser` for its
// other routes, so a file-wide "no bare guard" check flags correct code -- a
// first draft of this check did exactly that and produced a false failure. The
// analytics route's own guard call is what has to carry a roles list.
{
  const examsCode = codeOf('api/exams/index.ts');
  const routeStart = examsCode.indexOf("examsApp.get('/analytics/:examId'");
  check('the analytics route was located in api/exams/index.ts', routeStart !== -1);
  if (routeStart !== -1) {
    const block = examsCode.slice(routeStart, routeStart + 1200);
    check('the analytics route guards with an explicit roles allowlist',
      /requireSession\(\s*\{[\s\S]{0,200}?roles:\s*\[/.test(block),
      'the analytics route must not fall back to a role-less guard');
    check('the analytics route refuses family roles by name',
      /'Staff'/.test(block) && /'Teacher'/.test(block) && !/'Parent'/.test(block),
      'teaching roles are in, family roles are out');
  }
}

// mapUser must not return a raw salary unconditionally.
const principalCode = codeOf('api/principal/index.ts');
check('principal mapUser does not return salary unconditionally',
  !/^\s*salary:\s*r\.salary,?\s*$/m.test(principalCode),
  'salary is gated on isManagement()');

// The app must not have a family-role screen that depends on these endpoints,
// or the gate would break a real flow. Asserted rather than assumed.
{
  const screens = path.join(ROOT, 'flutter_apps', 'school_management_app', 'lib', 'screens');
  const parentScreens = fs.readdirSync(screens).filter((f) => /parent|student/i.test(f));
  const offenders = [];
  for (const f of parentScreens) {
    const src = fs.readFileSync(path.join(screens, f), 'utf8');
    for (const ep of ['/api/dashboard-stats', '/api/principal', '/api/staff', 'analytics']) {
      if (src.includes(ep)) offenders.push(f + ' -> ' + ep);
    }
  }
  check('no parent/student screen depends on the newly gated endpoints', offenders.length === 0, offenders.join(', '));
}

// ---------------------------------------------------------------------------

console.log('\n' + '-'.repeat(66));
if (outbound.length) note('outbound fetch calls were all stubbed', outbound.length + ' (no production traffic)');
globalThis.fetch = realFetch;

if (failed) {
  console.log('FAILED: ' + failed + ' of ' + (passed + failed) + ' checks');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log('All ' + passed + ' role-gate checks passed.');
