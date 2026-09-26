/**
 * Pragnya Mitra Multi-Tenant Architecture — Migrate-to-Dedicated Script (Shared -> Dedicated)
 *
 * Copies a school's operational data from the shared platform D1 database into its
 * dedicated D1 database while guaranteeing school_id tenant scoping. This is the
 * reverse of scripts/downgrade-school.mjs and is used when a school that was running
 * on the shared worker is moved to its own dedicated worker.
 *
 * The copy is idempotent + guarded: it only runs when the dedicated D1 has no
 * operational rows for the school yet (so re-deploys never clobber live data),
 * and it is wired into scripts/deploy-dedicated.mjs right before the worker goes live.
 *
 * Usage:
 *   node scripts/migrate-to-dedicated.mjs <slug>
 */
import fs from 'fs';
import { spawnSync } from 'child_process';

const REGISTRY_FILE = 'schools.json';
// Pinned in package.json; see the note in scripts/deploy-dedicated.mjs.
const WRANGLER = 'npx wrangler';

// Operational tables that live on a dedicated school worker (school-scoped).
// ORDER MATTERS: tables are copied in this order, and several tables carry a
// FOREIGN KEY referencing a table earlier in this list (e.g. school_subscriptions
// -> school_tenants, exam_marks -> subjects/exams, fee_invoices -> fee_heads).
// A fresh dedicated D1 has NO rows at all, so a child row inserted before its
// parent row fails with SQLITE_CONSTRAINT_FOREIGNKEY and aborts the deploy.
// Parents (school_tenants, school_profile, subjects, fee_heads, exams, students)
// are therefore copied FIRST, and school_tenants/school_profile are handled
// explicitly at the top of migrateSchoolData below (keyed by id = schoolId).
// NOTE: 'staff' is backed by the 'teachers' table and 'fees' by 'fee_invoices'.
const OPERATIONAL_TABLES = [
  // Pure parents / FK targets — copy before any child that references them.
  'subjects',
  'fee_heads',
  'exams',
  'students',
  'classes',
  'class_teachers',
  'class_subjects',
  'exam_terms',
  'class_fee_structure',
  // Children — copied after their parents exist.
  'system_users',
  'teachers',
  'attendance',
  'fee_invoices',
  'exam_marks',
  'notices',
  'notifications_log',
  'leave_applications',
  'activity_logs',
  'student_academic_history',
  'timetables',
  'tc_requests',
  'principal_history',
  'web_push_subscriptions',
  // user_notification_tokens is user-scoped (keyed by user_id, no school_id column
  // per migration 0010), so it is NOT school-scoped and cannot be copied per-school.
  // It would otherwise fail-loud on the shared `WHERE school_id = ...` SELECT.
  'fcm_device_tokens',
  'lms_courses',
  'lms_lessons',
  'lms_assignments',
  'lms_submissions',
  'school_preferences',
  'result_analytics',
  'exam_subjects',
  'report_card_templates',
  'school_email_config',
  'email_quota',
  'fee_reminders_log',
  'razorpay_webhook_events',
  'school_feature_requests',
  // school_subscriptions is school_id-scoped (kept here); school_tenants is keyed
  // by id (= schoolId) and is handled with school_profile below.
  'school_subscriptions',
];

function runD1(args) {
  const isWindows = process.platform === 'win32';
  const executable = isWindows ? 'npx.cmd' : 'npx';
  const fullArgs = ['wrangler', 'd1', 'execute', ...args];
  const result = spawnSync(executable, fullArgs, { encoding: 'utf-8', shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    // Include BOTH stderr and stdout so the real wrangler D1 error text is visible.
    // wrangler@4 emits SQL errors as JSON on stdout (stderr can be empty), and
    // migrateSchoolData's schema-drift tolerance ("no such table|no such column")
    // must be able to see that text — otherwise a genuine drift is treated as a
    // generic "Command failed with code 1" and the deploy aborts incorrectly.
    const detail = [result.stderr, result.stdout].filter((x) => x && x.trim()).join('\n').trim();
    throw new Error(detail || `Command failed with code ${result.status}`);
  }
  return result.stdout;
}

function runShared(extraArgs) {
  // Shared D1 resolves via the default wrangler.toml binding DB.
  return runD1(['DB', '--remote', ...extraArgs]);
}

function runDedicated(slug, extraArgs) {
  return runD1(['DB', '--remote', '-c', `wrangler-${slug}.toml`, ...extraArgs]);
}

function escapeSql(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function quoteIdent(name) {
  return '"' + String(name).replace(/"/g, '""') + '"';
}

/** Returns true when the dedicated D1 already holds operational rows for this school. */
function dedicatedHasData(slug, schoolId) {
  try {
    const out = runDedicated(
      slug,
      ['--json', `--command=${'SELECT COUNT(*) AS n FROM system_users WHERE school_id = ' + escapeSql(schoolId)}`],
    );
    const parsed = JSON.parse(out);
    const n = Number((parsed[0] && parsed[0].results && parsed[0].results[0] && parsed[0].results[0].n) || 0);
    return n > 0;
  } catch (e) {
    // Table missing (migrations not applied yet) — treat as no data (safe).
    return false;
  }
}

/** Copies all school-scoped rows for a table from shared D1 into the dedicated D1. */
function copyTable(slug, schoolId, table, whereClause) {
  // 1) SELECT rows from the shared D1.
  // Fail-loud policy: only a genuine "no such table / no such column" SQL error is
  // tolerated (schema drift). Anything else (auth/network/wrangler failure) must
  // abort the deploy so a worker is never published with a silently-empty database.
  let out;
  try {
    out = runShared(['--json', `--command=${'SELECT * FROM ' + quoteIdent(table) + ' WHERE ' + whereClause}`]);
  } catch (e) {
    const msg = String((e && e.message) || e);
    if (/no such table|no such column/i.test(msg)) {
      console.log(`  ℹ️ Table ${table} does not exist (or no such column) in shared D1 — skipped.`);
      return 0;
    }
    throw new Error(`Shared D1 query failed for ${table}: ${msg}`);
  }

  let rows;
  try {
    const parsed = JSON.parse(out);
    rows = (parsed[0] && parsed[0].results) || [];
  } catch (e) {
    throw new Error(`Could not parse SELECT output for ${table} (fail-loud): ${(e && e.message) || e}`);
  }

  if (!rows.length) {
    console.log(`  0 records found in ${table} (shared).`);
    return 0;
  }

  // 2) INSERT OR REPLACE each row into the dedicated D1.
  // Migrations run before this copy, so a failing INSERT is never a schema drift —
  // it is a real data-loss risk and must abort the deploy (fail-loud).
  for (const row of rows) {
    const columns = Object.keys(row);
    const values = columns.map((col) => {
      const v = (row[col] === null || row[col] === undefined) ? 'NULL' : escapeSql(row[col]);
      return v;
    });
    const insertCmd =
      `INSERT OR REPLACE INTO ${quoteIdent(table)} (${columns.map(quoteIdent).join(', ')}) VALUES (${values.join(', ')});`;
    try {
      runDedicated(slug, [`--command=${insertCmd}`]);
    } catch (e) {
      throw new Error(`Failed to insert row into ${table} (dedicated D1): ${(e && e.message) || e}`);
    }
  }

  console.log(`  ✅ Copied ${rows.length} records into ${table}.`);
  return rows.length;
}

async function migrateSchoolData(slug, schoolId, options = {}) {
  if (!slug || !schoolId) {
    throw new Error('slug and schoolId are required.');
  }
  if (!fs.existsSync(`wrangler-${slug}.toml`)) {
    throw new Error(`Missing config wrangler-${slug}.toml — run scripts/generate-school-configs.mjs first.`);
  }

  // Force re-copy: used for one-off repairs when a school's dedicated D1 is
  // missing rows that landed in the shared/main DB (INSERT OR REPLACE is
  // idempotent, so re-running is safe). Triggered via --force CLI flag or the
  // FORCE_SCHOOL_DATA_COPY env var passed through deploy.yml.
  const force = !!(options && options.force);
  if (!force && dedicatedHasData(slug, schoolId)) {
    console.log(`School "${slug}" already has operational data in its dedicated D1 — skipping copy.`);
    return { copied: false, message: 'already-migrated' };
  }

  console.log(`\n======================================================`);
  console.log(`Migrating ${slug} (${schoolId}) from shared D1 -> dedicated D1`);
  console.log(`======================================================\n`);

  let total = 0;

  // Parent tables FIRST: school_tenants and school_profile are keyed by id
  // (= schoolId) and nearly every school-scoped table carries a FOREIGN KEY
  // back to school_tenants (e.g. school_subscriptions -> school_tenants).
  // On a fresh dedicated D1 the tenant row does not exist yet, so inserting a
  // child before its parent fails with SQLITE_CONSTRAINT_FOREIGNKEY and aborts
  // the deploy. Copying these first makes every later INSERT valid.
  for (const table of ['school_tenants', 'school_profile']) {
    console.log(`Copying table: ${table}...`);
    total += copyTable(slug, schoolId, table, `id = ${escapeSql(schoolId)}`);
  }

  // Then the school-scoped operational tables (parents already in place;
  // OPERATIONAL_TABLES itself is also ordered parents-first, see above).
  for (const table of OPERATIONAL_TABLES) {
    console.log(`Copying table: ${table}...`);
    // Fail-loud: copyTable itself tolerates only genuine schema drift ("no such
    // table"/"no such column") and returns 0 for it. Any error thrown here is a
    // real wrangler/auth/data failure and MUST abort the deploy so a worker is
    // never published with a silently-empty database.
    total += copyTable(slug, schoolId, table, `school_id = ${escapeSql(schoolId)}`);
  }

  console.log(`\n✅ Migration complete for "${slug}". Total records copied: ${total}`);
  return { copied: true, total };
}

export async function migrateSchool(slug, schoolId, options) {
  return migrateSchoolData(slug, schoolId, options || {});
}

// CLI entry point.
const isMain = process.argv[1] && process.argv[1].endsWith('migrate-to-dedicated.mjs');
if (isMain) {
  const slug = process.argv[2];
  const force = process.argv.includes('--force');
  (async () => {
    if (!slug) {
      console.error('Usage: node scripts/migrate-to-dedicated.mjs <school-slug> [--force]');
      process.exit(1);
    }
    const registry = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf-8'));
    const school = registry.schools.find((s) => s && s.slug === slug);
    if (!school) {
      console.error(`School with slug "${slug}" not found in ${REGISTRY_FILE}.`);
      process.exit(1);
    }
    if (force) console.log('⚙️  FORCE mode: re-copying shared-D1 data (INSERT OR REPLACE).');
    await migrateSchool(slug, school.schoolId, { force });
    process.exit(0);
  })().catch((e) => {
    console.error('Fatal migrate error:', e);
    process.exit(1);
  });
}
