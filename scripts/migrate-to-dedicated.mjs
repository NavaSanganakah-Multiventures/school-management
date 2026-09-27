/**
 * Pragnya Mitra Multi-Tenant Architecture — Migrate-to-Dedicated Script (Shared -> Dedicated)
 *
 * Copies a school's operational data from the shared platform D1 database into its
 * dedicated D1 database while guaranteeing school_id tenant scoping. This is the
 * reverse of scripts/downgrade-school.mjs and is used when a school that was running
 * on the shared worker is moved to its own dedicated worker.
 *
 * The copy is guarded by the migration ledger from migration 0042: it runs once,
 * when the school has no ledger entry in its dedicated D1, and never again on its
 * own. That guard is the point — see migratedTables() for why the
 * previous guard could clobber live data.
 *
 * It is wired into scripts/deploy-dedicated.mjs right before the worker goes live.
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
  // ── Added to catch up with migrations 0003 / 0017 / 0038 / 0039 / 0040 ──
  //
  // These were all missing. A table that a migration creates but that is absent
  // from this list is not copied when a school moves to its own database, and
  // nothing reports it: copyTable is only ever called for names already listed, so
  // the omission is invisible from the deploy. It shows up as a school that works
  // and then silently does not, or a feature that quietly returns nothing.
  //
  // Phase 1 (0039) and Phase 2 (0040) each added tables here and the list was not
  // updated, so a school that moved after those migrations lost its family links,
  // its offline-payment idempotency records and its webhook payment ledger.
  //
  // scripts/audit-dedicated-tables.mjs diffs this list against every CREATE TABLE
  // in db_migrations/ and fails when a school-scoped table is uncovered, so this
  // cannot silently regress again.
  //
  // Ordering: the *_defs tables come before their *_values tables, and
  // parent_student_links comes after both `students` and `system_users` because it
  // references both.
  'school_fcm_topics',
  'subscription_addons',
  'billing_invoices',
  'school_custom_domains',
  'school_plugins',
  'student_custom_field_defs',
  'student_custom_field_values',
  'parent_student_links',
  'fee_payment_idempotency',
  'payment_ledger',
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

const LEDGER_TABLE = 'dedicated_migration_ledger';

/**
 * The set of tables this school has ALREADY had copied, per the ledger from
 * migration 0042.
 *
 * WHY A SET OF TABLES AND NOT A YES/NO FOR THE SCHOOL
 *
 * Because the copy is `INSERT OR REPLACE` from the shared D1, and that source is
 * stale by construction — it is where these rows came from, and nothing writes back
 * after a school moves. So re-copying a table a school already has would overwrite
 * the school's newer dedicated rows with older shared ones. The symptom of that
 * would be nothing: no deploy step fails, no probe catches it, and the audit trail
 * says the migration ran fine.
 *
 * The ledger is recorded per (school, table) precisely so that can be avoided. A
 * school-level boolean cannot express "copy the three tables it has never had, and
 * leave the other forty alone" — and that is exactly the situation the fleet is
 * in right now, because tables have been ADDED to the copy list since these
 * schools last migrated.
 *
 * So: skip a table the school already has an entry for, copy the ones it does not.
 * A fresh school has no entries and copies everything. A school that migrated
 * months ago copies only what is new to it.
 *
 * `forced` bypasses this entirely, which is what an operator repair means.
 */
function migratedTables(slug, schoolId) {
  try {
    const out = runDedicated(
      slug,
      ['--json', `--command=${'SELECT table_name FROM ' + quoteIdent(LEDGER_TABLE) + ' WHERE school_id = ' + escapeSql(schoolId)}`],
    );
    const parsed = JSON.parse(out);
    return new Set(((parsed[0] && parsed[0].results) || []).map((r) => String(r.table_name)));
  } catch (e) {
    const msg = String((e && e.message) || e);
    if (/no such table|no such column/i.test(msg)) {
      // 0042 not applied yet. No entries means "copy everything", which is the
      // correct first run.
      return new Set();
    }
    throw new Error(`Could not read ${LEDGER_TABLE} for ${slug}: ${msg}`);
  }
}

/** Records that `table` was copied for this school, replacing any earlier entry. */
function recordMigration(slug, schoolId, table, rowsCopied, forced) {
  const id = 'dml-' + String(schoolId) + '-' + table;
  const sql =
    'INSERT OR REPLACE INTO ' + quoteIdent(LEDGER_TABLE)
    + ' (id, school_id, table_name, rows_copied, forced, completed_at) VALUES ('
    + escapeSql(id) + ', '
    + escapeSql(schoolId) + ', '
    + escapeSql(table) + ', '
    + Number(rowsCopied) + ', '
    + (forced ? 1 : 0) + ', '
    + escapeSql(new Date().toISOString()) + ');';
  runDedicated(slug, [`--command=${sql}`]);
}

/** Drops this school's ledger entries, so the next run re-copies from scratch. */
function clearMigrationRecord(slug, schoolId) {
  try {
    runDedicated(
      slug,
      [`--command=${'DELETE FROM ' + quoteIdent(LEDGER_TABLE) + ' WHERE school_id = ' + escapeSql(schoolId)}`],
    );
    return true;
  } catch (e) {
    const msg = String((e && e.message) || e);
    if (/no such table|no such column/i.test(msg)) return false;
    throw new Error(`Could not clear ${LEDGER_TABLE} for ${slug}: ${msg}`);
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

  // Whether this school still needs copying is answered by the ledger (0042), per
  // TABLE. See migratedTables() for why a school-level answer is not enough: the
  // copy is INSERT OR REPLACE from a stale source, so re-copying a table the school
  // already has would undo the school's newer data.
  const force = !!(options && options.force);
  const already = force ? new Set() : migratedTables(slug, schoolId);
  if (force && clearMigrationRecord(slug, schoolId)) {
    console.log('  Cleared the previous migration record (forced re-copy).');
  }

  const allTables = ['school_tenants', 'school_profile', ...OPERATIONAL_TABLES];
  const pending = allTables.filter((t) => !already.has(t));
  const skipped = allTables.length - pending.length;

  if (pending.length === 0) {
    console.log(`School "${slug}": all ${allTables.length} table(s) already recorded as copied — nothing to do.`);
    return { copied: false, message: 'already-migrated', tables: allTables.length };
  }

  console.log(`\n======================================================`);
  console.log(`Migrating ${slug} (${schoolId}) from shared D1 -> dedicated D1`);
  if (skipped > 0) {
    console.log(`  ${skipped} table(s) already copied previously and will NOT be touched; ${pending.length} to copy.`);
  }
  console.log(`======================================================\n`);

  let total = 0;
  let recorded = 0;

  // Parent tables FIRST: school_tenants and school_profile are keyed by id
  // (= schoolId) and nearly every school-scoped table carries a FOREIGN KEY
  // back to school_tenants (e.g. school_subscriptions -> school_tenants).
  // On a fresh dedicated D1 the tenant row does not exist yet, so inserting a
  // child before its parent fails with SQLITE_CONSTRAINT_FOREIGNKEY and aborts
  // the deploy. Copying these first makes every later INSERT valid.
  //
  // So the whole sequence runs in this order and skips per table: the tenant row is
  // only missing for a school that has never been migrated, and such a school has
  // no ledger entries at all, so it copies the parents first as before.
  for (const table of allTables) {
    if (!pending.includes(table)) {
      continue;
    }
    console.log(`Copying table: ${table}...`);
    // Fail-loud: copyTable itself tolerates only genuine schema drift ("no such
    // table"/"no such column") and returns 0 for it. Any error thrown here is a
    // real wrangler/auth/data failure and MUST abort the deploy so a worker is
    // never published with a silently-empty database.
    const where = (table === 'school_tenants' || table === 'school_profile')
      ? `id = ${escapeSql(schoolId)}`
      : `school_id = ${escapeSql(schoolId)}`;
    const n = copyTable(slug, schoolId, table, where);
    total += n;
    recordMigration(slug, schoolId, table, n, force);
    recorded++;
  }

  console.log(`  Ledger: recorded ${recorded} table(s) for ${schoolId} in its dedicated D1.`);

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
