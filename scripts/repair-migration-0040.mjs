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
// This needs wrangler-<slug>.toml, which is generated at deploy time. If it is
// missing, run `node scripts/generate-school-configs.mjs` first.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline/promises';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Column -> DDL type. `created_at` keeps the TIMESTAMP DEFAULT CURRENT_TIMESTAMP it
// had in 0001 so new rows are still stamped and ORDER BY created_at sorts correctly.
const REQUIRED_COLUMNS = {
  teachers: {
    created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
  },
  fee_invoices: {
    created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
    razorpay_order_id: 'TEXT',
    razorpay_payment_id: 'TEXT',
    razorpay_payment_link_id: 'TEXT',
    razorpay_payment_link_url: 'TEXT',
    last_reminder_at: 'TEXT',
  },
};

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

function runD1(args) {
  const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const fullArgs = ['wrangler', 'd1', 'execute', ...args];
  const result = spawnSync(executable, fullArgs, { encoding: 'utf-8', shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    // Both streams, because wrangler@4 reports SQL errors as JSON on stdout.
    const detail = [result.stderr, result.stdout].filter((x) => x && x.trim()).join('\n').trim();
    throw new Error(detail || `wrangler d1 execute failed with code ${result.status}`);
  }
  return result.stdout;
}

function parseRows(stdout) {
  // wrangler returns JSON array(s). Shape differs slightly across versions, so find
  // the first object that looks like a result set rather than trusting one path.
  const text = String(stdout || '').trim();
  if (!text) return [];
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  const candidates = Array.isArray(parsed) ? parsed : [parsed];
  for (const entry of candidates) {
    if (entry && Array.isArray(entry.results)) return entry.results;
  }
  return [];
}

function target(slug) {
  const args = ['DB'];
  if (useRemote) args.push('--remote');
  if (slug) args.push('-c', `wrangler-${slug}.toml`);
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

function tableExists(slug, table) {
  const rows = parseRows(runD1([...target(slug), '--command',
    `SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'`]));
  return rows.length > 0;
}

function loadSchools() {
  const registryPath = path.join(ROOT, 'schools.json');
  if (!fs.existsSync(registryPath)) return [];
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
  return Array.isArray(registry.schools) ? registry.schools : [];
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

  return problems;
}

async function main() {
  const schools = loadSchools();
  const targets = [];

  if (wantPlatform) {
    targets.push({ slug: null, label: 'platform / shared D1 (wrangler.toml)' });
  } else if (onlySlug) {
    if (!schools.some((s) => s.slug === onlySlug)) {
      console.error(`Unknown slug "${onlySlug}". Not in schools.json, so this would guess at a database.`);
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

  const report = [];
  for (const entry of targets) {
    const configName = entry.slug ? `wrangler-${entry.slug}.toml` : 'wrangler.toml';
    if (entry.slug && !fs.existsSync(path.join(ROOT, configName))) {
      console.log(`  ${entry.slug}: SKIPPED — ${configName} not found.`);
      console.log(`           Run: node scripts/generate-school-configs.mjs`);
      report.push({ label: entry.slug, skipped: true });
      continue;
    }
    try {
      const problems = plan(entry.slug, entry.label);
      if (!problems.length) {
        console.log(`  ${entry.slug || 'platform'}: OK — schema is complete.`);
        report.push({ label: entry.slug, problems: [] });
        continue;
      }
      console.log(`  ${entry.slug || 'platform'}: ${problems.filter((p) => p.kind !== 'note').length} problem(s)`);
      for (const p of problems) {
        if (p.kind === 'note') console.log(`      - ${p.text}`);
        else console.log(`      - ${p.kind === 'column' ? 'missing column' : 'missing index '} ${p.table}.${p.column}`);
      }
      report.push({ label: entry.slug, problems });
    } catch (e) {
      console.log(`  ${entry.slug || 'platform'}: ERROR — ${e.message}`);
      report.push({ label: entry.slug, error: e.message });
    }
  }

  const actionable = report.filter((r) => !r.skipped && r.problems && r.problems.some((p) => p.kind !== 'note'));
  if (!actionable.length) {
    console.log('');
    console.log('Nothing to repair.');
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

  for (const entry of actionable) {
    console.log('');
    console.log(`  repairing ${entry.label || 'platform'} …`);
    for (const p of entry.problems) {
      if (p.kind === 'note') continue;
      try {
        runD1([...target(entry.slug), '--command', p.sql]);
        console.log(`      + ${p.kind} ${p.table}.${p.column}`);
      } catch (e) {
        // A concurrent deploy may have added it between the plan and here. Report it
        // rather than aborting, then re-verify at the end.
        console.log(`      ! ${p.table}.${p.column} — ${e.message.split('\n')[0]}`);
      }
    }
    const remaining = plan(entry.slug, entry.label).filter((p) => p.kind !== 'note');
    console.log(remaining.length
      ? `      still missing: ${remaining.map((p) => `${p.table}.${p.column}`).join(', ')}`
      : `      verified complete.`);
  }

  console.log('');
  console.log('Done. Verify with: node scripts/repair-migration-0040.mjs');
}

main().catch((e) => {
  console.error(e && e.message ? e.message : e);
  process.exit(1);
});