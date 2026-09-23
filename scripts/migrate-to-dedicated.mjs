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
const WRANGLER = 'npx --yes wrangler@4';

// Operational tables that live on a dedicated school worker (school-scoped).
// NOTE: 'staff' is backed by the 'teachers' table and 'fees' by 'fee_invoices';
// school_profile is keyed by id (= schoolId), so it is handled separately below.
const OPERATIONAL_TABLES = [
  'system_users',
  'students',
  'teachers',
  'classes',
  'class_teachers',
  'attendance',
  'fee_invoices',
  'exams',
  'exam_marks',
  'notices',
  'notifications_log',
  'subjects',
  'class_subjects',
  'exam_terms',
  'leave_applications',
  'fee_heads',
  'class_fee_structure',
  'activity_logs',
  'student_academic_history',
  'timetables',
  'tc_requests',
  'principal_history',
  'web_push_subscriptions',
  'user_notification_tokens',
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
  const fullArgs = ['--yes', 'wrangler@4', 'd1', 'execute', ...args];
  const result = spawnSync(executable, fullArgs, { encoding: 'utf-8', shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr || `Command failed with code ${result.status}`);
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
    console.warn(`  ⚠️ Could not parse SELECT output for ${table}: ${e.message}`);
    return 0;
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

async function migrateSchoolData(slug, schoolId) {
  if (!slug || !schoolId) {
    throw new Error('slug and schoolId are required.');
  }
  if (!fs.existsSync(`wrangler-${slug}.toml`)) {
    throw new Error(`Missing config wrangler-${slug}.toml — run scripts/generate-school-configs.mjs first.`);
  }

  if (dedicatedHasData(slug, schoolId)) {
    console.log(`School "${slug}" already has operational data in its dedicated D1 — skipping copy.`);
    return { copied: false, message: 'already-migrated' };
  }

  console.log(`\n======================================================`);
  console.log(`Migrating ${slug} (${schoolId}) from shared D1 -> dedicated D1`);
  console.log(`======================================================\n`);

  let total = 0;
  for (const table of OPERATIONAL_TABLES) {
    console.log(`Copying table: ${table}...`);
    try {
      total += copyTable(slug, schoolId, table, `school_id = ${escapeSql(schoolId)}`);
    } catch (err) {
      console.error(`  ❌ Error copying table ${table}:`, err.message);
    }
  }

  // school_profile and school_tenants are keyed by id (= schoolId) — no school_id column.
  for (const table of ['school_profile', 'school_tenants']) {
    console.log(`Copying table: ${table}...`);
    try {
      total += copyTable(slug, schoolId, table, `id = ${escapeSql(schoolId)}`);
    } catch (err) {
      console.error(`  ❌ Error copying ${table}:`, err.message);
    }
  }

  console.log(`\n✅ Migration complete for "${slug}". Total records copied: ${total}`);
  return { copied: true, total };
}

export async function migrateSchool(slug, schoolId) {
  return migrateSchoolData(slug, schoolId);
}

// CLI entry point.
const isMain = process.argv[1] && process.argv[1].endsWith('migrate-to-dedicated.mjs');
if (isMain) {
  const slug = process.argv[2];
  (async () => {
    if (!slug) {
      console.error('Usage: node scripts/migrate-to-dedicated.mjs <school-slug>');
      process.exit(1);
    }
    const registry = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf-8'));
    const school = registry.schools.find((s) => s && s.slug === slug);
    if (!school) {
      console.error(`School with slug "${slug}" not found in ${REGISTRY_FILE}.`);
      process.exit(1);
    }
    await migrateSchool(slug, school.schoolId);
    process.exit(0);
  })().catch((e) => {
    console.error('Fatal migrate error:', e);
    process.exit(1);
  });
}