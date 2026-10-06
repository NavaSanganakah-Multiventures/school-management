// scripts/repair-migration-0040.mjs
//
// WHY THIS EXISTS
//
// Migration 0040 rebuilt `teachers` and `fee_invoices` to convert a global UNIQUE
// into a composite (school_id, …) one. SQLite cannot do that with ALTER, so the
// only way is to create a new table, copy, drop and rename.
//
// A rebuild carries across ONLY the columns it names. 0040 named the columns that
// 0001 and 0004 had added, and missed the ones added by 0035, 0036 and created_at
// from 0001 itself:
//
//   fee_invoices.razorpay_order_id          (0035)   <- dropped
//   fee_invoices.razorpay_payment_id        (0035)   <- dropped
//   fee_invoices.razorpay_payment_link_id   (0035)   <- dropped
//   fee_invoices.razorpay_payment_link_url  (0035)   <- dropped
//   fee_invoices.last_reminder_at           (0036)   <- dropped
//   fee_invoices.created_at                 (0001)   <- dropped
//   teachers.created_at                     (0001)   <- dropped
//
// Migrations run in filename order, so 0035 and 0036 had ALWAYS run before 0040.
// There was no ordering under which this was safe. Every freshly provisioned
// database, and every dedicated school that already applied 0040, lost these
// columns.
//
// WHAT IT BROKE
//
//   GET /api/fees        api/fees/index.ts:68  ORDER BY created_at -> 500
//   GET /api/staff       api/staff/index.ts:83 ORDER BY t.created_at -> 500
//   Online fee payment   api/fees/index.ts:430,:464,:550 and
//                        api/lib/fee-payment.ts:59,:63 -> throw
//   Fee reminders        api/lib/fee-reminders.ts:107, swallowed by catch (_) {}
//
// WHY THIS IS A SCRIPT AND NOT A MIGRATION
//
// The obvious fix is a repair migration using ALTER TABLE … ADD COLUMN. SQLite has
// no `ADD COLUMN IF NOT EXISTS`, so that statement throws on any database where the
// column already exists — which after fixing 0040 is every fresh database. A rebuild
// has the mirror problem: `SELECT … created_at FROM teachers` is an error on a
// database where 0040 really did drop the column.
//
// Plain SQL cannot branch on whether a column exists, so neither form is correct for
// both starting points. Reading PRAGMA table_info and issuing only the ALTERs that are
// actually needed is. That is all this script does, which is also why it is safe to
// run twice and safe to run on a database that was never broken.
//
// 0040 itself is also fixed, so a newly provisioned school never needs this script.
// It exists for the databases that already applied the broken version.
//
// WHAT THIS CANNOT RECOVER
//
// The razorpay ids and the original created_at values were destroyed when 0040 ran.
// A schema repair cannot restore values that are no longer stored; those columns come
// back NULL, and existing rows take the DEFAULT for created_at. Invoice rows,
// amounts and statuses are untouched. A paid invoice can still be reconciled against
// Razorpay itself through api/lib/fee-payment.ts.
//
// USAGE
//
//   node scripts/repair-migration-0040.mjs                  # report on every school
//   node scripts/repair-migration-0040.mjs --apply          # actually repair them
//   node scripts/repair-migration-0040.mjs --slug yagyaashram
//   node scripts/repair-migration-0040.mjs --platform       # the shared/platform D1
//
// Dry run unless --apply. With --apply it prompts before touching production unless
// --yes is also passed.
//
// wrangler-<slug>.toml is used when it exists. It is generated at deploy time, so
// on any machine that is not the CI runner it does not, and the database is then
// resolved by name (school-management-<slug>-db) against the account's actual D1
// list. A name that is not there is an error, never a guess.
//
//   node scripts/verify-repair-migration-0040.mjs    # local-only proof, no network
//
// WHAT THIS WAS GETTING WRONG
//
// The script could not repair production even when run deliberately, and reported
// success while doing nothing. Six defects, each found by running it rather than
// reading it:
//
//  1. parseRows() did JSON.parse on wrangler's whole stdout, which always begins
//     with a banner, and returned [] when that threw. An empty result set is a
//     legitimate answer to every query here, so tableExists() reported "teachers
//     table absent" on a healthy table and the columns were never examined.
//  2. spawnSync('npx.cmd', …, { shell: false }) throws EINVAL on Windows, so the
//     script only ever ran on Linux CI.
//  3. ALTER TABLE … ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP is
//     rejected by the SQLite behind D1 ("Cannot add a column with non-constant
//     default") — but only on a table that has rows. Empty tables accept it, which
//     is why a test against an empty table passes while every production table
//     fails. created_at is now a bare TIMESTAMP, existing rows are backfilled, and
//     a trigger keeps new rows stamped, because api/fees/index.ts:291 and
//     api/staff/index.ts:145 both INSERT without naming created_at.
//  4. The apply loop rebuilt its wrangler arguments from entry.slug, but the
//     report entry only carried `label`, so `-c wrangler-<slug>.toml` was dropped
//     and the repair was aimed at whichever database wrangler.toml names.
//  5. A missing per-school config was a silent SKIP, and with all seven missing the
//     script printed "Nothing to repair" over eight broken databases.
//  6. The backfill and the trigger can only be planned once the column exists, so
//     a single pass always ended at "still missing: created_at". The plan is now
//     re-derived between passes until it stops shrinking.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline/promises';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Column -> DDL type, for `ALTER TABLE ... ADD COLUMN`.
//
// `created_at` is added as a bare TIMESTAMP with NO DEFAULT, and that is not a
// simplification. SQLite refuses a non-constant default on ADD COLUMN:
//
//   ALTER TABLE teachers ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
//   -> SQLITE_ERROR: Cannot add a column with non-constant default
//
// which is what the previous version of this script issued. On every production
// database that statement failed, so the one column that UNBLOCKS
// `ORDER BY created_at` was never added, and the script's own comment claimed it
// "keeps the TIMESTAMP DEFAULT CURRENT_TIMESTAMP it had in 0001".
//
// Backfilling existing rows and stamping future rows are therefore separate
// steps: UPDATE for the rows 0040 left behind, and a BEFORE INSERT trigger
// because neither api/fees nor api/staff passes created_at in their INSERT.
const REQUIRED_COLUMNS = {
  teachers: {
    created_at: 'TIMESTAMP',
  },
  fee_invoices: {
    created_at: 'TIMESTAMP',
    razorpay_order_id: 'TEXT',
    razorpay_payment_id: 'TEXT',
    razorpay_payment_link_id: 'TEXT',
    razorpay_payment_link_url: 'TEXT',
    last_reminder_at: 'TEXT',
  },
};

// Rows that already existed when the column came back, and new rows after it.
// The trigger is required rather than optional: api/fees/index.ts:291 and :371 and
// api/staff/index.ts:145 all INSERT without naming created_at, so with no trigger
// and no column default every future row would land as NULL.
const REQUIRED_BACKFILLS = [
  'UPDATE teachers SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL',
  'UPDATE fee_invoices SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL',
];

const REQUIRED_TRIGGERS = [
  {
    table: 'teachers',
    name: 'trg_teachers_created_at_default',
    sql: `CREATE TRIGGER IF NOT EXISTS trg_teachers_created_at_default
AFTER INSERT ON teachers WHEN NEW.created_at IS NULL
BEGIN
  UPDATE teachers SET created_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END`,
  },
  {
    table: 'fee_invoices',
    name: 'trg_fee_invoices_created_at_default',
    sql: `CREATE TRIGGER IF NOT EXISTS trg_fee_invoices_created_at_default
AFTER INSERT ON fee_invoices WHEN NEW.created_at IS NULL
BEGIN
  UPDATE fee_invoices SET created_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END`,
  },
];

// Indexes 0040's rebuild destroyed, because it dropped the table they were on.
const REQUIRED_INDEXES = [
  { table: 'teachers', name: 'idx_teachers_school_employee_code', sql: 'CREATE UNIQUE INDEX IF NOT EXISTS idx_teachers_school_employee_code ON teachers (school_id, employee_code)' },
  { table: 'teachers', name: 'idx_teachers_school', sql: 'CREATE INDEX IF NOT EXISTS idx_teachers_school ON teachers (school_id)' },
  { table: 'fee_invoices', name: 'idx_fee_invoices_school_number', sql: 'CREATE UNIQUE INDEX IF NOT EXISTS idx_fee_invoices_school_number ON fee_invoices (school_id, invoice_number)' },
  { table: 'fee_invoices', name: 'idx_fee_invoices_school_status', sql: 'CREATE INDEX IF NOT EXISTS idx_fee_invoices_school_status ON fee_invoices (school_id, status)' },
  { table: 'fee_invoices', name: 'idx_fee_invoices_school_student', sql: 'CREATE INDEX IF NOT EXISTS idx_fee_invoices_school_student ON fee_invoices (school_id, student_id)' },
  { table: 'fee_invoices', name: 'idx_fee_invoices_razorpay_order', sql: 'CREATE INDEX IF NOT EXISTS idx_fee_invoices_razorpay_order ON fee_invoices(razorpay_order_id)' },
  { table: 'fee_invoices', name: 'idx_fee_invoices_razorpay_link', sql: 'CREATE INDEX IF NOT EXISTS idx_fee_invoices_razorpay_link ON fee_invoices(razorpay_payment_link_id)' },
];

const argv = process.argv.slice(2);
const apply = argv.includes('--apply');
const assumeYes = argv.includes('--yes');
const wantPlatform = argv.includes('--platform');
const slugIndex = argv.indexOf('--slug');
const onlySlug = slugIndex !== -1 ? argv[slugIndex + 1] : null;
const useRemote = !argv.includes('--local');
// --registry lets this be exercised against a fixture instead of the real
// schools.json, which is what makes it testable at all. Production reads the
// committed registry unless this is passed.
const registryIndex = argv.indexOf('--registry');
const registryFile = registryIndex !== -1 ? argv[registryIndex + 1] : 'schools.json';

// Resolve wrangler's JS entry so it can be run by the CURRENT node binary.
//
// The previous form was spawnSync('npx.cmd', [...], { shell: false }), which
// throws EINVAL on Windows before wrangler is ever reached. It also meant a
// production repair could not be run from a Windows workstation at all, so the
// only place it worked was CI - and the fix has to be run by a person.
//
// shell:true is NOT the answer: it re-splits the SQL and wrangler then reports
// "Unknown arguments: name, FROM, pragma_table_info('teachers')".
function wranglerEntry() {
  const local = path.join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  if (fs.existsSync(local)) return local;
  return null; // fall back to npx
}

function runD1(args) {
  if (process.env.REPAIR_DEBUG) console.error('[debug] d1 execute', JSON.stringify(args));
  const entry = wranglerEntry();
  const result = entry
    ? spawnSync(process.execPath, [entry, 'd1', 'execute', ...args], { encoding: 'utf-8', shell: false })
    : spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['wrangler', 'd1', 'execute', ...args], { encoding: 'utf-8', shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    // Both streams, because wrangler@4 reports SQL errors as JSON on stdout.
    const detail = [result.stderr, result.stdout].filter((x) => x && x.trim()).join('\n').trim();
    throw new Error(detail || `wrangler d1 execute failed with code ${result.status}`);
  }
  return result.stdout;
}

function parseRows(stdout) {
  // wrangler prints a banner ("⛅️ wrangler 4.x.0", a rule, "Resource location:
  // remote", …) to stdout BEFORE the JSON payload. JSON.parse on the whole
  // string therefore always throws.
  //
  // This used to catch that and `return []`. An empty result set is not an
  // error, it is a VALID ANSWER to every query this script asks, so the
  // consequences were silent and all in the wrong direction:
  //
  //   tableExists()  -> false  -> "teachers table absent, nothing to do"
  //   columnsOf()    -> {}    -> (never consulted, table already "absent")
  //   indexesOf()    -> {}    -> all 7 indexes looked missing
  //
  // So on every production database the script printed "nothing to do", and with
  // --apply it created the two 0035 indexes and then reported "verified
  // complete" while all 7 columns stayed missing and /api/fees kept throwing.
  // Verified against school_management_production: committed parse returned 0
  // rows for PRAGMA table_info('teachers'), the corrected one returns 14.
  //
  // Never swallow a parse failure here. A wrong row count is how this script
  // would report a broken database as healthy.
  const raw = String(stdout || '');
  const start = raw.search(/^\[\s*$/m);
  if (start === -1) {
    throw new Error(`no JSON result array in wrangler output: ${raw.trim().slice(0, 200) || '(empty)'}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw.slice(start));
  } catch (e) {
    throw new Error(`could not parse wrangler output: ${e.message}`);
  }
  const candidates = Array.isArray(parsed) ? parsed : [parsed];
  for (const entry of candidates) {
    if (entry && Array.isArray(entry.results)) return entry.results;
  }
  throw new Error('wrangler returned no results[] array');
}

// Resolve a school's D1 database when wrangler-<slug>.toml is absent.
//
// Those configs are generated at deploy time, so on any machine that is not the
// CI runner all seven were missing and the script reported SKIPPED for every
// school, then "Nothing to repair" - while all eight production databases were
// broken. A repair you cannot run is not a repair.
//
// The database name follows the same convention as provision-school.mjs:
//   school-management-<slug>-db
// but the UUID is resolved from the account's actual `wrangler d1 list` output
// rather than trusted, so a name that does not exist there is an error and not a
// guess. Nothing is inferred when the name is absent from the account.
let d1ListCache = null;

function listDatabases() {
  if (d1ListCache) return d1ListCache;
  const entry = wranglerEntry();
  const result = entry
    ? spawnSync(process.execPath, [entry, 'd1', 'list', '--json'], { encoding: 'utf-8', shell: false })
    : spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['wrangler', 'd1', 'list', '--json'], { encoding: 'utf-8', shell: false });
  if (result.status !== 0) {
    throw new Error(`wrangler d1 list failed: ${[result.stderr, result.stdout].filter(Boolean).join('\n').slice(0, 200)}`);
  }
  // `d1 list --json` is a plain array of database objects. It has no `results[]`
  // wrapper, so parseRows (which expects one) throws here and the message becomes
  // "wrangler returned no results[] array" — which says nothing about what went
  // wrong.
  const text = String(result.stdout || '');
  const start = text.search(/^\[\s*$/m);
  if (start === -1) throw new Error(`could not read the D1 database list: ${text.trim().slice(0, 200)}`);
  let parsed;
  try {
    parsed = JSON.parse(text.slice(start));
  } catch (e) {
    throw new Error(`could not parse the D1 database list: ${e.message}`);
  }
  if (!Array.isArray(parsed) || !parsed.every((d) => d && d.uuid && d.name)) {
    throw new Error('the D1 database list did not have the expected shape (uuid + name per entry)');
  }
  d1ListCache = parsed;
  return d1ListCache;
}

function resolveByName(slug) {
  const wanted = `school-management-${slug}-db`;
  const hit = listDatabases().find((d) => String(d.name) === wanted);
  if (!hit) {
    throw new Error(`no D1 database named "${wanted}" in this account. Refusing to guess a database to ALTER.`);
  }
  return String(hit.uuid);
}

function target(slug) {
  const args = [];
  if (slug) {
    const config = `wrangler-${slug}.toml`;
    if (fs.existsSync(path.join(ROOT, config))) {
      args.push('-c', config, 'DB');
    } else {
      args.push(resolveByName(slug));
    }
  } else {
    args.push('DB');
  }
  // `--local` is not just the absence of `--remote`. Without it wrangler defaults
  // to the REMOTE database, so a run the operator believed was local against
  // their own D1 would have written to production.
  args.push(useRemote ? '--remote' : '--local');
  return args;
}

function columnsOf(slug, table) {
  const rows = parseRows(runD1([...target(slug), '--command', `PRAGMA table_info(${table})`]));
  return new Set(rows.map((r) => String(r.name)));
}

function indexesOf(slug) {
  const rows = parseRows(runD1([...target(slug), '--command',
    "SELECT name FROM sqlite_master WHERE type='index'"]));
  return new Set(rows.map((r) => String(r.name)));
}

// Triggers live under type='trigger', NOT 'index'. Without this the trigger check
// reported every database as missing one and re-created it on every run.
function triggersOf(slug) {
  const rows = parseRows(runD1([...target(slug), '--command',
    "SELECT name FROM sqlite_master WHERE type='trigger'"]));
  return new Set(rows.map((r) => String(r.name)));
}

function tableExists(slug, table) {
  const rows = parseRows(runD1([...target(slug), '--command',
    `SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'`]));
  return rows.length > 0;
}

function loadSchools() {
  const registryPath = path.resolve(ROOT, registryFile);

  // A missing registry must stop the run. Returning [] was reachable through the
  // most common invocation (`npm run repair:0040`, no --registry) and produced:
  //
  //   Nothing to repair. Every database in scope was examined and answered.
  //   exit 0
  //
  // with zero databases examined. That is the same false reassurance this script
  // was rewritten to remove, reached a second way — and the qualified sentence I
  // added is what made it worse, because it now claims databases answered.
  if (!fs.existsSync(registryPath)) {
    throw new Error(
      `registry file ${registryPath} not found. Nothing was examined. ` +
      `The registry lists the schools to repair; without it there is no list to walk.`,
    );
  }

  // A BOM makes JSON.parse throw on an otherwise valid registry, and the error
  // surfaces as "Unexpected token" with no mention of which file.
  let registry;
  try {
    registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8').replace(/^\uFEFF/, ''));
  } catch (e) {
    throw new Error(`could not parse ${registryPath}: ${e.message}`);
  }

  if (!Array.isArray(registry.schools)) {
    // Same reasoning: an empty list and a malformed list both mean "no schools",
    // and both used to print the reassuring sentence.
    throw new Error(`${registryPath} has no "schools" array. Nothing was examined.`);
  }
  if (!registry.schools.length) {
    throw new Error(`${registryPath} lists zero schools, so there is nothing to repair. ` +
      `If that is wrong, fix the registry; if it is right, there is no work to do.`);
  }
  return registry.schools;
}

async function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(question)).trim().toLowerCase();
  rl.close();
  return answer === 'y' || answer === 'yes';
}

function plan(slug, label) {
  const problems = [];

  if (!tableExists(slug, 'teachers')) {
    problems.push({ kind: 'note', text: 'teachers table absent — database predates this repair; nothing to do' });
  } else {
    const have = columnsOf(slug, 'teachers');
    for (const [column, type] of Object.entries(REQUIRED_COLUMNS.teachers)) {
      if (!have.has(column)) {
        problems.push({ kind: 'column', table: 'teachers', column, sql: `ALTER TABLE teachers ADD COLUMN ${column} ${type}` });
      }
    }
  }

  if (!tableExists(slug, 'fee_invoices')) {
    problems.push({ kind: 'note', text: 'fee_invoices table absent — database predates this repair; nothing to do' });
  } else {
    const have = columnsOf(slug, 'fee_invoices');
    for (const [column, type] of Object.entries(REQUIRED_COLUMNS.fee_invoices)) {
      if (!have.has(column)) {
        problems.push({ kind: 'column', table: 'fee_invoices', column, sql: `ALTER TABLE fee_invoices ADD COLUMN ${column} ${type}` });
      }
    }
  }

  const haveIndexes = indexesOf(slug);
  for (const index of REQUIRED_INDEXES) {
    if (!haveIndexes.has(index.name)) {
      problems.push({ kind: 'index', table: index.table, column: index.name, sql: index.sql });
    }
  }

  // created_at is only useful if the rows 0040 left behind are actually stamped,
  // and only stays that way if new rows are stamped too. The backfill is planned
  // per table and only once the column exists, so it cannot run ahead of the
  // ALTER it depends on.
  const haveTeachers = tableExists(slug, 'teachers');
  const haveInvoices = tableExists(slug, 'fee_invoices');
  for (const [table, present] of [['teachers', haveTeachers], ['fee_invoices', haveInvoices]]) {
    if (!present) continue;
    if (!columnsOf(slug, table).has('created_at')) continue;
    const nulls = parseRows(runD1([...target(slug), '--command',
      `SELECT COUNT(*) AS n FROM ${table} WHERE created_at IS NULL`]))[0];
    if (nulls && Number(nulls.n) > 0) {
      problems.push({
        kind: 'backfill', table, column: 'created_at',
        sql: `UPDATE ${table} SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL`,
        rows: Number(nulls.n),
      });
    }
  }

  const haveTriggers = triggersOf(slug);
  for (const trigger of REQUIRED_TRIGGERS) {
    if (!tableExists(slug, trigger.table)) continue;
    if (!columnsOf(slug, trigger.table).has('created_at')) continue;
    if (!haveTriggers.has(trigger.name)) {
      problems.push({ kind: 'trigger', table: trigger.table, column: trigger.name, sql: trigger.sql });
    }
  }

  return problems;
}

async function main() {
  const schools = loadSchools();
  const targets = [];

  if (wantPlatform) {
    targets.push({ slug: null, label: 'platform / shared D1 (wrangler.toml)' });
  } else if (onlySlug) {
    if (!schools.some((s) => s.slug === onlySlug)) {
      console.error(`Unknown slug "${onlySlug}". Not in ${registryFile}, so this would guess at a database.`);
      process.exit(1);
    }
    targets.push({ slug: onlySlug, label: `${onlySlug} (wrangler-${onlySlug}.toml)` });
  } else {
    for (const school of schools) {
      targets.push({ slug: school.slug, label: `${school.slug} (wrangler-${school.slug}.toml)` });
    }
  }

  console.log('');
  console.log(`Mode: ${useRemote ? 'REMOTE (production)' : 'local'}${apply ? ', APPLYING' : ', dry run — no changes will be made'}`);
  console.log('');

  // Every target in scope is reported, including the ones that failed. A school
  // that could not be repaired has to be visible as a failure, not as absence —
  // the old SKIPPED-on-missing-config behaviour hid all eight databases.
  const report = [];
  for (const entry of targets) {
    const configName = entry.slug ? `wrangler-${entry.slug}.toml` : 'wrangler.toml';
    try {
      const problems = plan(entry.slug, entry.label);
      if (!problems.length) {
        console.log(`  ${entry.slug || 'platform'}: OK — schema is complete.`);
        report.push({ slug: entry.slug, label: entry.label, problems: [] });
        continue;
      }
      console.log(`  ${entry.slug || 'platform'}: ${problems.filter((p) => p.kind !== 'note').length} problem(s)`);
      for (const p of problems) {
        if (p.kind === 'note') console.log(`      - ${p.text}`);
        // Index problems carry the index NAME in `column`, so `${table}.${column}`
        // printed "teachers.idx_teachers_school" — which reads like a column.
        else if (p.kind === 'column') console.log(`      - missing column   ${p.table}.${p.column}`);
        else if (p.kind === 'backfill') console.log(`      - unbackfilled     ${p.table}.created_at — ${p.rows} row(s) are NULL`);
        else if (p.kind === 'trigger') console.log(`      - missing trigger  ${p.column} (on ${p.table})`);
        else console.log(`      - missing index    ${p.column} (on ${p.table})`);
      }
      // `slug` MUST be carried on the report entry, not only in `label`.
      //
      // The apply loop rebuilds its wrangler arguments from entry.slug. This entry
      // used to carry only `label`, so entry.slug was undefined and target()
      // produced `['DB', '--local', ...]` with NO `-c wrangler-<slug>.toml`. The
      // dry run then read the school's database and the apply wrote to the
      // default one — "no such table: teachers" locally, and against production it
      // would have been seven schools' repairs aimed at whichever database
      // wrangler.toml names.
      report.push({ slug: entry.slug, label: entry.label, problems });
    } catch (e) {
      console.log(`  ${entry.slug || 'platform'}: ERROR — ${e.message}`);
      report.push({ slug: entry.slug, label: entry.label, error: e.message });
    }
  }

  // "Nothing to repair" must never be printed while a database went unexamined.
// It is the exact sentence this script used to print when all seven schools were
// skipped and every real database was broken.
const errored = report.filter((r) => r.error);
  const unexamined = report.filter((r) => !r.error && !Array.isArray(r.problems));
  // No `!r.skipped` term: nothing sets `skipped` any more, and a filter term that
  // can never be false is a condition that will not catch anyone when a skip is
  // reintroduced somewhere else. A database that could not be examined is now
  // carried by `errored` and must stop the run rather than drop out of it.
  const actionable = report.filter((r) => r.problems && r.problems.some((p) => p.kind !== 'note'));

  if (errored.length || unexamined.length) {
    console.log('');
    console.log(`INCOMPLETE — ${errored.length + unexamined.length} database(s) could not be examined:`);
    for (const r of [...errored, ...unexamined]) console.log(`  - ${r.label}: ${r.error || 'no result'}`);
    console.log('');
    console.log('This says nothing about the databases that did answer. Do not read it as "healthy".');
    if (!actionable.length) process.exitCode = 1;
  }

  if (!actionable.length) {
    if (!errored.length && !unexamined.length) {
      console.log('');
      console.log('Nothing to repair. Every database in scope was examined and answered.');
    }
    return;
  }

  if (!apply) {
    console.log('');
    console.log(`Dry run. ${actionable.length} database(s) need repair. Re-run with --apply to fix them.`);
    return;
  }

  console.log('');
  if (useRemote && !assumeYes) {
    const ok = await confirm(`Repair ${actionable.length} PRODUCTION database(s) now? This adds columns and creates indexes. [y/N] `);
    if (!ok) {
      console.log('Aborted. Nothing was changed.');
      return;
    }
  }

  const unverified = [];

  // Problems are applied in passes and the plan is RE-DERIVED between them.
//
// The backfill and the trigger can only be planned once created_at exists, so a
// single pass would always end with "still missing: created_at" — the column
// statement succeeded, and the follow-up that depends on it was never in the
// list. Re-planning until it stops shrinking is what makes the run converge.
const MAX_PASSES = 4;

  for (const entry of actionable) {
    console.log('');
    console.log(`  repairing ${entry.label || 'platform'} …`);

    let pending = entry.problems.filter((p) => p.kind !== 'note');
    for (let pass = 1; pass <= MAX_PASSES && pending.length; pass++) {
      for (const p of pending) {
        try {
          runD1([...target(entry.slug), '--command', p.sql]);
          console.log(`      + ${p.kind} ${p.table}.${p.column}`);
        } catch (e) {
          // A concurrent deploy may have added it between the plan and here. Report it
          // rather than aborting, then re-verify at the end.
          console.log(`      ! ${p.table}.${p.column} — ${e.message.split('\n')[0]}`);
        }
      }
      if (pass === MAX_PASSES) break;
      let next;
      try {
        next = plan(entry.slug, entry.label).filter((q) => q.kind !== 'note');
      } catch (e) {
        console.log(`      ! could not re-plan: ${e.message.split('\n')[0]}`);
        break;
      }
      if (next.length >= pending.length) { pending = next; break; }
      pending = next;
    }
    // Re-derive the schema from the database rather than trusting the plan. The
    // recheck is the only thing standing between "I ran the SQL" and "the
    // database is actually fixed", and it must not be able to pass silently.
    let remaining;
    try {
      remaining = plan(entry.slug, entry.label).filter((p) => p.kind !== 'note');
    } catch (e) {
      remaining = null;
      unverified.push(entry.label);
      console.log(`      ! could not re-verify: ${e.message.split('\n')[0]}`);
    }
    if (remaining === null) continue;
    console.log(remaining.length
      ? `      still missing: ${remaining.map((p) => `${p.table}.${p.column}`).join(', ')}`
      : `      verified complete.`);
  }

  if (unverified.length) {
    console.log('');
    console.log(`NOT VERIFIED — ${unverified.length} database(s) could not be re-checked: ${unverified.join(', ')}`);
    process.exitCode = 1;
  }

  console.log('');
  console.log('Done. Verify with: node scripts/repair-migration-0040.mjs');
}

main().catch((e) => {
  console.error(e && e.message ? e.message : e);
  process.exit(1);
});