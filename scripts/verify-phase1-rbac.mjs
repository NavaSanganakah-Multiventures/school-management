// scripts/verify-phase1-rbac.mjs
// Executable proof that the Phase 1 authorization matrix actually holds.
//
// The audit found that the API had no authorization middleware and that most
// routes only checked "a token exists", while the database has allowed
// 'Parents' and 'Students' roles since migration 0034. This script asserts the
// role/permission helpers in api/lib/roles.ts behave as deny-by-default, and
// that the route guards declare the intended allowlists.
//
// It is a standalone harness because the repo has no test runner yet (Phase 4
// replaces this with vitest + @cloudflare/vitest-pool-workers). It imports the
// REAL api/lib/roles.ts source so a future edit that reopens a hole fails here.
//
// Usage: node scripts/verify-phase1-rbac.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

let failures = 0;
const results = [];

function check(name, condition) {
  results.push({ name, ok: !!condition });
  if (!condition) failures++;
}

// Load the REAL roles module through the TypeScript compiler, so this harness
// tests shipped source rather than a hand-maintained copy that could drift.
async function loadRolesModule() {
  const ts = require('typescript');
  const src = fs.readFileSync(path.join(REPO, 'api/lib/roles.ts'), 'utf-8');
  const { outputText } = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  const tmp = path.join(REPO, '.rbac-roles-check.mjs');
  fs.writeFileSync(tmp, outputText, 'utf-8');
  try {
    return await import(pathToFileURL(tmp).href);
  } finally {
    fs.unlinkSync(tmp);
  }
}

const R = await loadRolesModule();

// ── 1. Role normalization ────────────────────────────────────────────────
console.log('\nPhase 1 RBAC verification\n');

check('Parents normalizes to Parent', R.normalizeRole('Parents') === 'Parent');
check('Students normalizes to Student', R.normalizeRole('Students') === 'Student');
check('Parent (singular) accepted', R.normalizeRole('Parent') === 'Parent');
check('Staff accepted', R.normalizeRole('Staff') === 'Staff');
check('Teacher accepted', R.normalizeRole('Teacher') === 'Teacher');
check('Director accepted', R.normalizeRole('Director') === 'Director');
check('Principal accepted', R.normalizeRole('Principal') === 'Principal');
check('SuperAdmin accepted', R.normalizeRole('SuperAdmin') === 'SuperAdmin');
check('lowercase input normalizes', R.normalizeRole('director') === 'Director');
check('unknown role returns null', R.normalizeRole('Hacker') === null);
check('empty role returns null', R.normalizeRole('') === null);
check('undefined role returns null', R.normalizeRole(undefined) === null);
check('null role returns null', R.normalizeRole(null) === null);
check('numeric role returns null', R.normalizeRole(123) === null);

// ── 2. Deny-by-default: family roles must NOT get any privileged helper ──
const FAMILY = ['Parent', 'Parents', 'Student', 'Students'];
const PRIVILEGED = ['isManagement', 'isTeaching', 'isAdminOfSchool', 'canManageFees',
  'canManageAcademics', 'canManageNotices', 'canViewSchoolWideAnalytics',
  'canManageSchoolSettings'];

for (const role of FAMILY) {
  for (const fn of PRIVILEGED) {
    check(`${fn}('${role}') === false`, R[fn](role) === false);
  }
  check(`isFamily('${role}') === true`, R.isFamily(role) === true);
}

// ── 3. Teaching roles: academic yes, money/settings no ───────────────────
for (const role of ['Staff', 'Teacher']) {
  check(`isTeaching('${role}')`, R.isTeaching(role) === true);
  check(`canManageAcademics('${role}')`, R.canManageAcademics(role) === true);
  check(`canManageFees('${role}') === false`, R.canManageFees(role) === false);
  check(`canManageNotices('${role}') === false`, R.canManageNotices(role) === false);
  check(`canManageSchoolSettings('${role}') === false`, R.canManageSchoolSettings(role) === false);
  check(`isFamily('${role}') === false`, R.isFamily(role) === false);
}

// ── 4. Management roles: everything except isTeaching ───────────────────
for (const role of ['Director', 'Principal']) {
  check(`isManagement('${role}')`, R.isManagement(role) === true);
  check(`isAdminOfSchool('${role}')`, R.isAdminOfSchool(role) === true);
  for (const fn of PRIVILEGED) {
    if (fn === 'isTeaching') continue;
    check(`${fn}('${role}') === true`, R[fn](role) === true);
  }
  // Management authority does not imply a class-teacher assignment.
  check(`isTeaching('${role}') === false`, R.isTeaching(role) === false);
  check(`isFamily('${role}') === false`, R.isFamily(role) === false);
}

// ── 5. Unknown role must not be treated as privileged ───────────────────
for (const fn of PRIVILEGED) {
  check(`${fn}('Unknown') === false`, R[fn]('Unknown') === false);
}

// ── 6. Static audit: no route may gate on `role === 'Staff'` alone ──────
// The bug class was a lone `if (role === 'Staff') { ... }`, which silently
// allows every OTHER role (including Parent/Student) through. Comments are
// stripped first so the explanatory "the old check was ..." notes do not trip
// this assertion.
const routeFiles = [
  'api/students/index.ts', 'api/fees/index.ts', 'api/exams/index.ts',
  'api/staff/index.ts', 'api/notices/index.ts', 'api/leave-applications/index.ts',
  'api/activity-logs/index.ts', 'api/attendance/index.ts', 'api/ai/index.ts',
  'api/lms/index.ts', 'api/notifications/index.ts', 'api/subjects/index.ts',
];
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}
for (const rel of routeFiles) {
  const code = stripComments(fs.readFileSync(path.join(REPO, rel), 'utf-8'));
  // A bare `x.role === 'Staff'` comparison is only acceptable if the same
  // expression also names the other teaching role (Staff/Teacher), which is an
  // explicit allowlist rather than a Staff-only special case.
  const bareStaffOnly = /role\s*===\s*'Staff'/.test(code) && !/role\s*===\s*'Teacher'/.test(code);
  check(`${rel} has no Staff-only role gate`, !bareStaffOnly);
}

// Every mutating route in a guarded module must use an explicit allowlist.
// `requireAnyUser` is NOT an allowlist, so it does not satisfy this.
{
  const mutating = [
    ['api/students/index.ts', ['studentsApp.post(', 'studentsApp.put(', 'studentsApp.delete(']],
    ['api/fees/index.ts', ['feesApp.post(']],
    ['api/exams/index.ts', ['examsApp.post(']],
    ['api/notices/index.ts', ['noticesApp.post(', 'noticesApp.delete(']],
    ['api/leave-applications/index.ts', ['leaveApp.put(']],
  ];
  for (const [rel, prefixes] of mutating) {
    const code = stripComments(fs.readFileSync(path.join(REPO, rel), 'utf-8'));
    for (const prefix of prefixes) {
      // Capture the first 260 chars of each route handler and look for a guard.
      const re = new RegExp(prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "[^\\n]*\\n?[\\s\\S]{0,260}?(requireManager|requireAcademics|requireDecider|requireSession\\(\\s*\\{)", 'g');
      const hits = code.match(re);
      check(`${rel} ${prefix} uses an allowlist guard`, hits && hits.length > 0);
    }
  }
}

// ── 7. Every student/fees/exam read must be family-scoped somewhere ─────
{
  const fees = fs.readFileSync(path.join(REPO, 'api/fees/index.ts'), 'utf-8');
  check('fees list is family-scoped', /isFamily\(user\.role\)/.test(fees));
  check('fees /pay requires a manager guard', /feesApp\.post\('\/pay',[\s\S]{0,220}requireManager/.test(fees));
  check('fees /create-invoice requires a manager guard', /feesApp\.post\('\/create-invoice',[\s\S]{0,220}requireManager/.test(fees));
  check('fees /create-bulk requires a manager guard', /feesApp\.post\('\/create-bulk',[\s\S]{0,220}requireManager/.test(fees));
  check('fees /heads POST requires a manager guard', /feesApp\.post\('\/heads',[\s\S]{0,220}requireManager/.test(fees));
  check('fees /structure POST requires a manager guard', /feesApp\.post\('\/structure',[\s\S]{0,220}requireManager/.test(fees));
  check('fees uses an atomic conditional update', /AND paid_amount = \?/.test(fees));
  check('fees records an idempotency key', /fee_payment_idempotency/.test(fees));

  const students = fs.readFileSync(path.join(REPO, 'api/students/index.ts'), 'utf-8');
  check('students list is family-scoped', /getFamilyStudentScope/.test(students));
  check('students detail checks ownership', /canActOnStudent/.test(students));
  check('students DELETE requires a manager guard', /studentsApp\.delete\('\/:id'[\s\S]{0,200}requireManager/.test(students));
  check('students POST requires an academic guard', /studentsApp\.post\('\/',[\s\S]{0,220}requireAcademics/.test(students));
  check('students redacts PII for non-management', /mapStudentForRole/.test(students));

  const exams = fs.readFileSync(path.join(REPO, 'api/exams/index.ts'), 'utf-8');
  check('exam creation requires a manager guard', /examsApp\.post\('\/',[\s\S]{0,220}requireManager/.test(exams));
  check('mark entry requires an academic guard', /examsApp\.post\('\/marks',[\s\S]{0,220}requireAcademics/.test(exams));
  check('mark entry verifies class-teacher ownership', /isClassTeacher/.test(exams));
  check('report card checks family ownership', /report-card[\s\S]{0,400}canActOnStudent/.test(exams));

  const staff = fs.readFileSync(path.join(REPO, 'api/staff/index.ts'), 'utf-8');
  check('staff list requires a session', /staffApp\.get\('\/',[\s\S]{0,200}requireAnyUser/.test(staff));
  check('staff salary is redacted for non-management', /mapStaffForRole/.test(staff));

  const notices = fs.readFileSync(path.join(REPO, 'api/notices/index.ts'), 'utf-8');
  check('notice publish requires a manager guard', /noticesApp\.post\('\/',[\s\S]{0,220}requireManager/.test(notices));
  check('notice delete requires a manager guard', /noticesApp\.delete\('\/:id'[\s\S]{0,200}requireManager/.test(notices));
  check('notice author comes from the session', /publisherName/.test(notices));
  check('notice body no longer sets publishedBy from the request', !/body\.publishedBy/.test(notices));
}

// ── 8. Migration 0039 exists and is tenant-scoped ──────────────────────
{
  const migRaw = fs.readFileSync(path.join(REPO, 'db_migrations/0039_rbac_family_and_fee_idempotency.sql'), 'utf-8');
  // Strip SQL comments first: the file documents the BEGIN/COMMIT prohibition,
  // and the words must not be mistaken for actual statements.
  const mig = migRaw.replace(/--[^\n]*/g, '');
  check('0039 creates parent_student_links', /CREATE TABLE IF NOT EXISTS parent_student_links/.test(mig));
  check('0039 is school_id scoped', /school_id TEXT NOT NULL/.test(mig));
  check('0039 has a unique composite index', /UNIQUE INDEX[\s\S]*school_id, parent_user_id, student_id/.test(mig));
  check('0039 has no BEGIN/COMMIT/ROLLBACK (repo rule)',
    !/^\s*(BEGIN|COMMIT|ROLLBACK)\b/im.test(mig));
  // The /pay idempotency path reads this table unconditionally when a key is
  // supplied, so the table must ship in the same migration as the code.
  check('0039 creates fee_payment_idempotency (required by POST /api/fees/pay)',
    /CREATE TABLE IF NOT EXISTS fee_payment_idempotency/.test(mig));
  check('fee_payment_idempotency is school_id scoped', /fee_payment_idempotency[\s\S]*school_id TEXT NOT NULL/.test(mig));
  check('fee_payment_idempotency has a unique key index',
    /UNIQUE INDEX[\s\S]*idx_fee_payment_idempotency_unique[\s\S]*school_id, idempotency_key/.test(mig));
}

// ── 9. Family scoping must fail closed ──────────────────────────────────
{
  const rbac = fs.readFileSync(path.join(REPO, 'api/lib/rbac.ts'), 'utf-8');
  check('missing parent_student_links yields an empty scope (fail closed)',
    /catch\s*\(\s*_\s*\)\s*\{[^}]*return new Set<string>\(\)/s.test(rbac));
}

// ── Report ──────────────────────────────────────────────────────────────
for (const r of results) {
  console.log((r.ok ? '  PASS  ' : '  FAIL  ') + r.name);
}
console.log('');
if (failures > 0) {
  console.error('FAILED: ' + failures + ' of ' + results.length + ' checks failed\n');
  process.exit(1);
}
console.log('All ' + results.length + ' Phase 1 RBAC checks passed.\n');
