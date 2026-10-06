// Guards against the class of bug migration 0040 actually was: a table rebuild that
// silently drops columns.
//
// THE BUG THIS EXISTS FOR
//
// 0040 rebuilt `teachers` and `fee_invoices` because SQLite cannot turn a global
// UNIQUE into a composite (school_id, …) one. A rebuild only carries across the columns
// it names, and 0040 named the columns 0001 and 0004 had added. It missed razorpay_*,
// last_reminder_at and created_at, which earlier migrations had added — and because
// migrations run in filename order, those earlier migrations had ALWAYS run first.
//
// So on every freshly provisioned database, and on every dedicated school that had
// already applied 0040, those columns were destroyed. GET /api/fees ordered by a column
// that no longer existed, the whole online fee payment path threw, and fee reminders
// failed inside a swallowed catch.
//
// WHY A DEDICATED HARNESS
//
// verify-migrations-apply.mjs already applies every migration and re-applies them, and
// it passed the entire time. Neither pass asserts anything about the COLUMNS a rebuild
// produced: it checks that the SQL ran, and separately that `login_rate_limits` has four
// expected columns. A rebuild that runs cleanly and drops six columns satisfies both.
//
// So this harness answers the only question a table rebuild has to answer: does the
// table have every column that existed before, plus the ones it was meant to add?
//
// HOW IT DETECTS A DROP
//
// It applies all migrations up to and including each rebuild, records the column set,
// applies the rest, and compares. Any column that disappeared is reported by name.
//
// This is a structural check, not a grep. It does not know which columns matter, so a
// future rebuild that drops an unrelated column is caught too.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const MIG_DIR = path.join(ROOT, 'db_migrations');

let DatabaseSync;
try {
  ({ DatabaseSync } = await import('node:sqlite'));
} catch {
  console.error('node:sqlite is unavailable on this Node build (' + process.version + ').');
  console.error('This harness needs Node 22.5+ with node:sqlite enabled.');
  process.exit(1);
}

let passed = 0;
const failures = [];
function check(name, ok, detail) {
  if (ok) {
    passed++;
    console.log('  PASS  ' + name);
  } else {
    failures.push(name);
    console.log('  FAIL  ' + name + (detail ? '\n          ' + detail : ''));
  }
}
function section(t) {
  console.log('\n' + t);
}

const files = fs.readdirSync(MIG_DIR).filter((f) => f.endsWith('.sql')).sort();

const REBUILD_TABLES = ['teachers', 'fee_invoices'];

// Columns these two tables must always carry. `created_at` and the razorpay_* /
// last_reminder_at group are the ones 0040 dropped; the rest are the baseline that
// proves the list is not just a copy of what 0040 happens to emit.
const REQUIRED = {
  teachers: [
    'id', 'employee_code', 'name', 'designation', 'department',
    'subject_specialization', 'phone', 'email', 'qualification', 'salary',
    'joining_date', 'status', 'login_user_id', 'school_id', 'created_at',
  ],
  fee_invoices: [
    'id', 'invoice_number', 'student_id', 'student_name', 'class_name', 'section',
    'title', 'total_amount', 'paid_amount', 'due_date', 'status', 'payment_method',
    'transaction_id', 'paid_at', 'school_id', 'scholar_number', 'created_at',
    'razorpay_order_id', 'razorpay_payment_id', 'razorpay_payment_link_id',
    'razorpay_payment_link_url', 'last_reminder_at',
  ],
};

// True when the SQL rebuilds `table` by the copy/drop/rename dance, regardless of
// how the intermediate table is named or whether the CREATE carries a guard.
//
// The RENAME is the part that cannot be faked: something must end up holding the
// original table's name. `DROP TABLE <table>` plus a rename onto it is the shape
// SQLite requires here, so requiring both is what makes this structural.
function rebuildsTable(sql, table) {
  const escaped = table.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const renames = new RegExp(`ALTER\\s+TABLE\\s+\\w+\\s+RENAME\\s+TO\\s+["']?${escaped}["']?`, 'i');
  if (!renames.test(sql)) return false;
  const drops = new RegExp(`DROP\\s+TABLE\\s+(IF\\s+EXISTS\\s+)?["']?${escaped}["']?`, 'i');
  return drops.test(sql);
}

function columnsOf(db, table) {
  return new Set(db.prepare(`SELECT name FROM pragma_table_info('${table}')`).all().map((r) => String(r.name)));
}

section('A table rebuild must not drop a column');
console.log('  (applies every migration in order, comparing each rebuild against the');
console.log('   schema that existed immediately before it)');

const dbPath = path.join(
  require('node:os').tmpdir(),
  'pragnya-0040-rebuild-' + Date.now() + '.sqlite',
);
const db = new DatabaseSync(dbPath);

try {
  const dropped = [];

  for (let i = 0; i < files.length; i++) {
    const before = {};
    for (const t of REBUILD_TABLES) before[t] = columnsOf(db, t);

    const file = files[i];
    const sql = fs.readFileSync(path.join(MIG_DIR, file), 'utf8');

    // The comparison below must run even when exec throws. A migration is a whole file,
    // so a statement near the end can fail AFTER the rebuild has already dropped and
    // renamed the table — and skipping the comparison on error is exactly how a broken
    // rebuild reports green. Two separate mistakes made this harness useless:
    //
    //   1. `continue` on error, leaving the old table in place so nothing looked dropped
    //   2. even without that, comparing only the clean path misses a rebuild whose
    //      damage was already done before a later statement failed
    //
    // So: run it, record the error, compare anyway.
    let applyError = '';
    try {
      db.exec(sql);
    } catch (e) {
      applyError = e && e.message ? e.message : String(e);
      check('  ' + file + ' applied', false, applyError);
      console.log('        ' + file + ' -> ' + applyError);
    }

    // A rebuild is detected structurally: something creates a table, copies the
    // old one, drops the old one, and renames. The previous detector was
    //
    //   /CREATE TABLE\s+\w*_?(mig|new)/i
    //
    // which is a naming convention, not a structure. Writing the same rebuild
    // with the `IF NOT EXISTS` guard —
    //
    //   CREATE TABLE IF NOT EXISTS fee_invoices_mig0040 (...)
    //
    // — made it not match, and because the whole column-drop comparison sits
    // behind this test, a column-dropping rebuild would then pass the check
    // silently. A guard is the least risky way to touch a rebuild, so it is the
    // most likely way to write one.
    const isRebuild = REBUILD_TABLES.some(
      (t) => before[t].size > 0 && rebuildsTable(sql, t),
    );
    if (!isRebuild) continue;

    console.log('        ' + file + ' rebuilds a table');
    for (const t of REBUILD_TABLES) {
      if (before[t].size === 0) continue;
      const after = columnsOf(db, t);
      const gone = [...before[t]].filter((c) => !after.has(c));
      if (gone.length) {
        dropped.push({ file, table: t, gone });
        check('  ' + file + ' kept every ' + t + ' column', false,
          'dropped: ' + gone.join(', '));
      }
    }
  }

  check('no rebuild dropped any column', dropped.length === 0,
    dropped.map((d) => d.file + ':' + d.table + ' lost ' + d.gone.join(',')).join(' | '));

  // The detector above decides whether the column comparison runs at all, so it
  // is asserted directly. A check that can be turned off by a naming choice is
  // the same shape of defect as the one this script exists to catch.
  section('the rebuild detector recognises a rebuild however it is written');

  const copyDropRename = (t) => [
    `CREATE TABLE IF NOT EXISTS ${t}_mig0040 (id TEXT, school_id TEXT);`,
    `INSERT INTO ${t}_mig0040 SELECT id, school_id FROM ${t};`,
    `DROP TABLE ${t};`,
    `ALTER TABLE ${t}_mig0040 RENAME TO ${t};`,
  ].join('\n');

  const quietCopyDropRename = (t) => [
    `CREATE TABLE IF NOT EXISTS ${t}_new (id TEXT, school_id TEXT);`,
    `INSERT INTO ${t}_new SELECT id, school_id FROM ${t};`,
    `DROP TABLE IF EXISTS ${t};`,
    `ALTER TABLE ${t}_new RENAME TO "${t}";`,
  ].join('\n');

  for (const t of REBUILD_TABLES) {
    check('detects a guarded rebuild of ' + t, rebuildsTable(copyDropRename(t), t));
    check('detects a differently-named guarded rebuild of ' + t, rebuildsTable(quietCopyDropRename(t), t));
    check('ignores an unrelated table in ' + t + '\'s file',
      !rebuildsTable('CREATE TABLE audit_log (id TEXT);\nINSERT INTO audit_log SELECT id FROM other;', t));
    check('ignores a DROP of ' + t + ' with no rename',
      !rebuildsTable(`DROP TABLE ${t};`, t));
    check('ignores a rename that never drops ' + t,
      !rebuildsTable(`ALTER TABLE tmp_x RENAME TO ${t};`, t));
  }

  section('the rebuilt tables carry every required column');

  for (const table of REBUILD_TABLES) {
    const have = columnsOf(db, table);
    const missing = REQUIRED[table].filter((c) => !have.has(c));
    check(table + ' has all ' + REQUIRED[table].length + ' required columns', missing.length === 0,
      'missing: ' + missing.join(', '));
  }

  section('the rebuilds kept the indexes that depended on the dropped columns');
  const indexNames = new Set(
    db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map((r) => String(r.name)),
  );
  // 0035 created these against the old fee_invoices; 0040 drops that table, so it has
  // to recreate them or every Razorpay lookup becomes a full table scan.
  for (const idx of ['idx_fee_invoices_razorpay_order', 'idx_fee_invoices_razorpay_link']) {
    check(idx + ' exists', indexNames.has(idx));
  }

  section('the migration defines each index exactly once');

  // school_status and school_student were each emitted twice. Harmless at runtime
  // because every statement is IF NOT EXISTS, but the second copy is a place a
  // future edit can land without changing what the migration does.
  const migrationSql = fs.readFileSync(path.join(MIG_DIR, '0040_tenant_uniqueness_and_payment_ledger.sql'), 'utf8');
  const withoutComments = migrationSql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ');

  const defined = new Map();
  const indexRe = /CREATE\s+(UNIQUE\s+)?INDEX\s+(IF\s+NOT\s+EXISTS\s+)?(\w+)/gi;
  let indexMatch;
  while ((indexMatch = indexRe.exec(withoutComments)) !== null) {
    const name = indexMatch[3];
    defined.set(name, (defined.get(name) || 0) + 1);
  }

  const repeated = [...defined].filter(([, n]) => n > 1).map(([name]) => name);
  check('0040 defines each index exactly once', repeated.length === 0,
    'defined more than once: ' + repeated.join(', '));
  check('0040 defines the 7 indexes the rebuild depends on', defined.size >= 7,
    'found ' + defined.size);

  section('the queries the code actually issues still work');
  // The specific statement that was throwing in production, and the two others that
  // depend on the same columns.
  const probes = [
    ['SELECT id FROM fee_invoices ORDER BY created_at DESC LIMIT 1',
      'api/fees/index.ts:68'],
    ['SELECT id FROM teachers ORDER BY created_at DESC LIMIT 1',
      'api/staff/index.ts:83'],
    ['SELECT id FROM fee_invoices WHERE razorpay_order_id = ?', 'api/fees/index.ts:464'],
    ['SELECT id FROM fee_invoices WHERE razorpay_payment_link_id = ?', 'api/fees/index.ts:464'],
    ['UPDATE fee_invoices SET last_reminder_at = ? WHERE id = ?', 'api/lib/fee-reminders.ts:107'],
  ];
  for (const [sql, where] of probes) {
    let ok = true;
    let err = '';
    try {
      if (/^\s*UPDATE/i.test(sql)) {
        // Prepare only. There are no rows, so there is nothing to write, and this
        // checks that the column exists without depending on data.
        db.prepare(sql);
      } else {
        db.prepare(sql).all();
      }
    } catch (e) {
      ok = false;
      err = e && e.message ? e.message : String(e);
    }
    check(where + ' prepares/queries cleanly', ok, err);
  }
} finally {
  try {
    db.close();
  } catch (_) {}
  try {
    fs.unlinkSync(dbPath);
  } catch (_) {}
}

console.log('\n------------------------------------------------------------------');
if (failures.length) {
  console.log('FAILED: ' + failures.length + ' of ' + (passed + failures.length) + ' checks');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log('All ' + passed + ' rebuild-column checks passed.');