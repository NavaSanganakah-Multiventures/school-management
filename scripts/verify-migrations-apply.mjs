// Applies every db_migrations/*.sql to a real throwaway SQLite database and
// verifies each one runs, is idempotent, and creates what it claims to create.
//
// WHY THIS IS A SEPARATE HARNESS
//
// Migration 0043 (login_rate_limits) was written without being executed. Its SQL
// could have been wrong and every other harness would still have been green,
// because audit-dedicated-tables.mjs only greps the file for CREATE TABLE and
// verify-login-hardening.mjs supplies its own fake D1 that never parses the
// migration at all. So the table the whole rate limiter depends on was unproven.
//
// The rule this repo keeps re-learning applies here: a check that has not been
// shown to fail is not evidence. The idempotency half matters just as much,
// because `wrangler d1 migrations apply` runs the whole file again on a database
// that already has it, and a non-idempotent migration fails the deploy on the
// SECOND school rather than the first.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const MIG_DIR = path.join(ROOT, 'db_migrations');

let passed = 0;
let failed = 0;
const failures = [];

// node:sqlite prints an ExperimentalWarning on load. It goes to stderr and does not
// change the exit code, so it would not fail CI -- but it is noise in a log people
// are trying to read, and the obvious fix for that is a Node flag.
//
// The flag is the wrong fix. `node --no-warnings=ExperimentalWarning` is accepted
// only because `--no-warnings` is a boolean: the value is silently discarded, so it
// actually suppresses EVERY warning while appearing to scope one. Verified --
// `--no-warnings=TotalGarbage` is also accepted. That is a flag that will change
// meaning under a future Node without anyone noticing.
//
// So the warning is filtered here instead, and the harness takes no flag. A CI step
// should not depend on a command-line form whose semantics are this loose.
process.removeAllListeners('warning');
process.on('warning', (w) => {
  if (w && w.name === 'ExperimentalWarning') return;
  console.warn(w && w.stack ? w.stack : String(w));
});

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

// node:sqlite ships with Node 22+. It is the same engine D1 runs on, so a
// migration that works here works there -- and a syntax error shows up now rather
// than halfway through a production deploy.
let DatabaseSync;
try {
  ({ DatabaseSync } = await import('node:sqlite'));
} catch (e) {
  console.error('node:sqlite is unavailable on this Node build (' + process.version + ').');
  console.error('This harness needs Node 22.5+ with node:sqlite enabled.');
  process.exit(1);
}

const files = fs.readdirSync(MIG_DIR).filter((f) => f.endsWith('.sql')).sort();
check('migrations were found', files.length > 0, 'none in ' + MIG_DIR);

const dbPath = path.join(os.tmpdir(), 'pragnya-mig-verify-' + Date.now() + '.sqlite');
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = OFF');

function tables() {
  return new Set(
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => String(r.name)),
  );
}

section('applying every migration in order');

const firstPass = [];
for (const f of files) {
  const sql = fs.readFileSync(path.join(MIG_DIR, f), 'utf8');
  try {
    db.exec(sql);
    firstPass.push({ file: f, ok: true });
  } catch (e) {
    firstPass.push({ file: f, ok: false, error: e && e.message ? e.message : String(e) });
  }
}

const broken = firstPass.filter((r) => !r.ok);
check('every migration applies cleanly', broken.length === 0,
  broken.map((b) => b.file + ': ' + b.error).join(' | '));
console.log('  ok    ' + (firstPass.length - broken.length) + '/' + firstPass.length + ' migrations applied');

for (const b of broken) console.log('        ' + b.file + ' -> ' + b.error);

// Report where it first went wrong, because a cascade of later failures is
// usually one root cause and reading the tail of the log hides it.
if (broken.length) {
  const firstBroken = files.indexOf(broken[0].file);
  console.log('        first failure at index ' + firstBroken + ' (' + broken[0].file + ')');
}

section('re-running every migration (idempotency)');

// `wrangler d1 migrations apply` tracks what it has already applied in a
// d1_migrations table and only runs pending files, so a non-idempotent migration
// does not fail a normal production deploy. It is still a real problem:
//
//   - README.md states "Migrations idempotent (CREATE TABLE IF NOT EXISTS /
//     INSERT OR IGNORE)". That documented property is false for these files.
//   - A manual `wrangler d1 execute --file` breaks on the second run.
//   - Restoring a backup that already has the columns, or applying a migration by
//     hand during an incident, fails halfway.
//
// 19 of the 42 migrations add a column with a bare `ALTER TABLE ... ADD COLUMN`,
// which SQLite has no `IF NOT EXISTS` form for. They are listed in
// KNOWN_NON_IDEMPOTENT below so the harness fails on a NEW violation while still
// reporting the existing ones. Making the check "everything must be idempotent"
// would mean it is red from day one for a reason nobody introduced, and a check
// that is always red is a check people stop reading.
//
// The rule this encodes: this count may only ever go down.
const KNOWN_NON_IDEMPOTENT = new Set([
  '0004_auth_trial_razorpay_admin.sql',
  '0005_admin_plan_school_crud.sql',
  '0008_staff_login_accounts.sql',
  '0013_class_assignments_timetables_tc_workflow.sql',
  '0018_plugin_target_school.sql',
  '0019_ai_assistant_plugin.sql',
  '0020_student_missing_details.sql',
  '0023_lms_boards_and_assignments.sql',
  '0025_school_provisioning.sql',
  '0026_school_email_quota.sql',
  '0027_subscription_feature_gating_and_requests.sql',
  '0028_trial_expiration_and_notifications.sql',
  '0030_exam_improvements.sql',
  '0031_payment_links_webhooks.sql',
  '0032_subscriptions_recurring.sql',
  '0033_plugin_trials.sql',
  '0040_tenant_uniqueness_and_payment_ledger.sql',
  // 0035 and 0036 were NOT failures until 0040 stopped dropping the columns they add.
  // 0040's table rebuild omitted razorpay_order_id / razorpay_payment_id /
  // razorpay_payment_link_id / razorpay_payment_link_url (0035) and last_reminder_at
  // (0036), so on this second pass the columns were absent again and the bare
  // ALTER TABLE ... ADD COLUMN succeeded every time. The rebuild was accidentally
  // making two broken migrations look idempotent.
  //
  // Fixing 0040 restored the columns, so re-running 0035/0036 now reports "duplicate
  // column name" — which is the truth about them, and is the same known limitation as
  // every other file in this set. Listing them here is not a new violation being
  // tolerated; it is a masked defect becoming visible. The count this set encodes went
  // 17 -> 19 because two of those seventeen were never really passing.
  '0035_student_fee_razorpay.sql',
  '0036_fee_reminders.sql',
]);

const secondPass = [];
for (const f of files) {
  const sql = fs.readFileSync(path.join(MIG_DIR, f), 'utf8');
  try {
    db.exec(sql);
    secondPass.push({ file: f, ok: true });
  } catch (e) {
    secondPass.push({ file: f, ok: false, error: e && e.message ? e.message : String(e) });
  }
}
const notIdempotent = secondPass.filter((r) => !r.ok);
const newViolations = notIdempotent.filter((r) => !KNOWN_NON_IDEMPOTENT.has(r.file));
const fixedSince = [...KNOWN_NON_IDEMPOTENT].filter((f) => !notIdempotent.some((r) => r.file === f));

check('no NEW non-idempotent migration was introduced', newViolations.length === 0,
  newViolations.map((b) => b.file + ': ' + b.error).join(' | '));
console.log('  ok    ' + (secondPass.length - notIdempotent.length) + '/' + secondPass.length + ' re-applied cleanly');

if (notIdempotent.length) {
  console.log('');
  console.log('  KNOWN pre-existing, not introduced here (' + notIdempotent.length + ' of ' + files.length + '):');
  for (const b of notIdempotent) {
    const known = KNOWN_NON_IDEMPOTENT.has(b.file);
    console.log('    ' + (known ? 'known    ' : 'NEW!!    ') + b.file);
  }
  console.log('');
  console.log('    These add a column with a bare ALTER TABLE ... ADD COLUMN, which SQLite has no');
  console.log('    IF NOT EXISTS form for. README.md claims migrations are idempotent; for these');
  console.log('    files that is not true. `wrangler d1 migrations apply` is unaffected because it');
  console.log('    tracks what it has applied, so this is a documentation and manual-restore');
  console.log('    concern rather than a deploy blocker.');
}
if (fixedSince.length) {
  console.log('');
  console.log('  no longer failing (remove from KNOWN_NON_IDEMPOTENT): ' + fixedSince.join(', '));
}

// Wrangler's migration splitter reads the raw file and does NOT strip `--`
// comments, so it rejects a file whose comments merely NAME a transaction keyword
// with "contains several transactions". That is what made fresh databases
// unmigratable via 0034, and it is invisible to any normal SQL run.
section('wrangler transaction safety');
for (const f of files) {
  const sql = fs.readFileSync(path.join(MIG_DIR, f), 'utf8');
  const hasManualTx = /^\s*(BEGIN|COMMIT|ROLLBACK)\b/im.test(sql);
  if (hasManualTx) check(f + ' has no manual transaction', false, 'wrangler rejects this on remote D1');
}
check('no migration declares a manual transaction (wrangler rejects those on remote D1)', true);

section('the login rate-limit table exists and is shaped as the limiter expects');

const t = tables();
check('login_rate_limits exists', t.has('login_rate_limits'));

if (t.has('login_rate_limits')) {
  const cols = db.prepare('PRAGMA table_info(login_rate_limits)').all().map((r) => ({
    name: String(r.name),
    type: String(r.type),
    notnull: Number(r.notnull),
    pk: Number(r.pk),
  }));
  const byName = Object.fromEntries(cols.map((c) => [c.name, c]));

  // These three, with these exact names, are what api/lib/login-rate-limit.ts
  // binds. A rename would make every login silently fall through to fail-open.
  for (const [name, type] of [['rate_key', 'TEXT'], ['window_start', 'INTEGER'], ['attempts', 'INTEGER']]) {
    check('login_rate_limits.' + name + ' exists and is ' + type, !!byName[name] && byName[name].type === type,
      byName[name] ? byName[name].type : 'column missing');
  }
  check('rate_key is the primary key (the ON CONFLICT target)', byName.rate_key && byName.rate_key.pk === 1,
    byName.rate_key ? 'pk=' + byName.rate_key.pk : 'column missing');
  check('window_start is NOT NULL', byName.window_start && byName.window_start.notnull === 1);
  check('attempts defaults to 0', /DEFAULT 0/i.test(
    db.prepare("SELECT sql FROM sqlite_master WHERE name = 'login_rate_limits'").get().sql));

  // The limiter's upsert, run for real against the real schema.
  const upsert = db.prepare(
    `INSERT INTO login_rate_limits (rate_key, window_start, attempts) VALUES (?, ?, ?)
     ON CONFLICT(rate_key) DO UPDATE SET attempts = excluded.attempts, window_start = excluded.window_start`,
  );
  upsert.run('user:a@b.test', 1000, 1);
  upsert.run('user:a@b.test', 2000, 2);
  const row = db.prepare('SELECT window_start, attempts FROM login_rate_limits WHERE rate_key = ?').get('user:a@b.test');
  check('the limiter upsert runs and updates in place', Number(row.attempts) === 2 && Number(row.window_start) === 2000,
    JSON.stringify(row));
  check('no duplicate row was created for the same key',
    Number(db.prepare('SELECT COUNT(*) AS n FROM login_rate_limits WHERE rate_key = ?').get('user:a@b.test').n) === 1);

  // Both reads and both deletes the limiter performs.
  const read = db.prepare('SELECT window_start, attempts FROM login_rate_limits WHERE rate_key = ?').get('user:x@y.test');
  check('the limiter read returns null for an unknown key', read === undefined);
  db.prepare('DELETE FROM login_rate_limits WHERE rate_key IN (?, ?)').run('user:a@b.test', 'ip:1.2.3.4');
  check('the limiter clear-by-two-keys delete runs', Number(db.prepare('SELECT COUNT(*) AS n FROM login_rate_limits').get().n) === 0);

  db.prepare('INSERT INTO login_rate_limits (rate_key, window_start, attempts) VALUES (?,?,?)').run('user:old', 1, 5);
  db.prepare('DELETE FROM login_rate_limits WHERE window_start < ?').run(1000);
  check('the prune-by-window delete runs', Number(db.prepare('SELECT COUNT(*) AS n FROM login_rate_limits').get().n) === 0);
}

// The whole point of migration 0043: without it the limiter fails OPEN, so login
// works but is unprotected. Assert the table the code depends on is really there,
// because a renamed table fails open silently and nothing else would notice.
section('the code and the schema agree');
const rateSrc = fs.readFileSync(path.join(ROOT, 'api', 'lib', 'login-rate-limit.ts'), 'utf8');
for (const ident of ['rate_key', 'window_start', 'attempts']) {
  check('login-rate-limit.ts references ' + ident, rateSrc.includes(ident));
}
check('login_rate_limits is classified as worker-local in the copy audit',
  /WORKER_LOCAL_EPHEMERAL[\s\S]*login_rate_limits/.test(
    fs.readFileSync(path.join(ROOT, 'scripts', 'audit-dedicated-tables.mjs'), 'utf8')));
check('login_rate_limits is NOT in the shared-to-dedicated copy list',
  !/OPERATIONAL_TABLES[\s\S]*?login_rate_limits/.test(
    fs.readFileSync(path.join(ROOT, 'scripts', 'migrate-to-dedicated.mjs'), 'utf8')));

db.close();
try { fs.unlinkSync(dbPath); } catch (_) {}

console.log('\n' + '-'.repeat(66));
if (failed) {
  console.log('FAILED: ' + failed + ' of ' + (passed + failed) + ' checks');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log('All ' + passed + ' migration checks passed (' + files.length + ' migrations applied and re-applied).');
