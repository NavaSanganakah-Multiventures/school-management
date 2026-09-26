/**
 * Pragnya Mitra Multi-Tenant Architecture — Downgrade Script (Enterprise -> Shared)
 *
 * ============================ DISABLED ============================
 * This script is HARD-BLOCKED. It is kept only for archaeology/recovery work.
 * Do not re-enable it for a production cutover without a Phase 3 rewrite.
 *
 * WHY (verified defects, audit Phase 0):
 *   1. `d1 execute` calls omit `--remote`, so wrangler targets the LOCAL D1,
 *      not production. A "production downgrade" copies almost nothing.
 *   2. OPERATIONAL_TABLES lists tables that do not exist — `staff` and `fees`
 *      are really `teachers` and `fee_invoices`.
 *   3. `school_profile` is queried by `school_id`, but that table's tenant key
 *      column is `id`.
 *   4. Every query/insert error is caught or warned and execution continues, so
 *      the script still sets the school to mode:'shared' after total failure.
 *   5. It uses INSERT OR REPLACE with unchanged IDs, so colliding shared rows
 *      get silently overwritten, and the ID-collision mapping the deployment
 *      docs claim it performs is not implemented.
 *
 * Net effect of running it: routing flips to shared while the school's newest
 * data stays only in the dedicated D1 → looks like data loss.
 *
 * A safe replacement must: target remote DBs explicitly, derive the table list
 * from schema metadata, run dry by default, reconcile row counts/checksums,
 * refuse to overwrite newer shared rows, and require an explicit cutover
 * approval. See docs/audit-phase0-safety-rails.md.
 *
 * Emergency escape hatch (recovery only, not for routine cutovers):
 *   PRAGNYA_ALLOW_UNSAFE_DOWNGRADE=1 node scripts/downgrade-school.mjs <slug> --i-accept-data-loss-risk
 * =================================================================
 *
 * Migrates a school's operational data from its dedicated D1 database back
 * to the shared platform D1 database while guaranteeing school_id tenant scoping,
 * and updates schools.json mode from 'dedicated' to 'shared'.
 *
 * Usage:
 *   node scripts/downgrade-school.mjs <slug>
 */

import fs from 'fs';
import { spawnSync } from 'child_process';

// --- HARD SAFETY GATE -------------------------------------------------------
const UNSAFE_OVERRIDE = 'PRAGNYA_ALLOW_UNSAFE_DOWNGRADE';
const UNSAFE_FLAG = '--i-accept-data-loss-risk';
if (String(process.env[UNSAFE_OVERRIDE] || '') !== '1' || !process.argv.includes(UNSAFE_FLAG)) {
  console.error([
    '',
    '  ============================================================================',
    '  BLOCKED: scripts/downgrade-school.mjs is disabled (data-loss risk).',
    '  ============================================================================',
    '',
    '  This script omits `--remote` (so it targets the LOCAL D1), references tables',
    '  that do not exist (`staff`, `fees`), and still marks the school as "shared"',
    '  even when every copy step failed. Running it can strand a school\'s newest',
    '  records in its dedicated D1 and make the switch look like data loss.',
    '',
    '  A safe downgrade requires (Phase 3): remote DB targets, schema-derived table',
    '  list, dry-run by default, row-count/checksum reconciliation, non-overwriting',
    '  upserts, and an explicit approved cutover plan.',
    '',
    '  If you are doing emergency data recovery, re-run with BOTH of:',
    `      ${UNSAFE_OVERRIDE}=1 ${UNSAFE_FLAG}`,
    '',
    '  Rationale: docs/audit-phase0-safety-rails.md',
    '  ============================================================================',
    '',
  ].join('\n'));
  process.exit(1);
}
console.warn('[UNSAFE] downgrade-school.mjs running WITHOUT its data-safety guarantees.');
// --- END HARD SAFETY GATE ---------------------------------------------------

const REGISTRY_FILE = 'schools.json';
const OPERATIONAL_TABLES = [
  'school_profile',
  'system_users',
  'students',
  'staff',
  'classes',
  'class_teachers',
  'attendance',
  'fees',
  'exams',
  'notices',
  'subjects',
  'leave_applications',
  'activity_logs',
  'lms_courses',
  'lms_lessons',
  'lms_assignments',
  'lms_submissions'
];

function runD1(dbName, sqlCommand, jsonOutput = false) {
  const isWindows = process.platform === 'win32';
  const executable = isWindows ? 'npx.cmd' : 'npx';
  const args = ['wrangler', 'd1', 'execute', dbName, `--command=${sqlCommand}`];
  if (jsonOutput) {
    args.push('--json');
  }

  const result = spawnSync(executable, args, {
    encoding: 'utf-8',
    shell: false,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(result.stderr || `Command failed with code ${result.status}`);
  }
  return result.stdout;
}

async function downgradeSchool(slug) {
  if (!slug || typeof slug !== 'string' || !/^[a-z0-9-]+$/.test(slug)) {
    console.error('Usage: node scripts/downgrade-school.mjs <school-slug>');
    console.error('Error: slug must only contain lowercase alphanumeric characters and hyphens.');
    process.exit(1);
  }

  let registry;
  try {
    const raw = fs.readFileSync(REGISTRY_FILE, 'utf-8');
    registry = JSON.parse(raw);
  } catch (err) {
    console.error(`Error reading registry file ${REGISTRY_FILE}:`, err.message);
    process.exit(1);
  }

  const school = registry.schools?.find((s) => s.slug === slug);

  if (!school) {
    console.error(`School with slug "${slug}" not found in ${REGISTRY_FILE}.`);
    process.exit(1);
  }

  if (school.mode !== 'dedicated') {
    console.log(`School "${slug}" is already in ${school.mode} mode. No downgrade needed.`);
    return;
  }

  const dedicatedDbName = `school-management-${slug}-db`;
  const sharedDbName = registry.sharedWorker?.name || 'school-management';
  const schoolId = school.schoolId;

  console.log(`\n======================================================`);
  console.log(`Beginning Downgrade for School: ${slug} (${schoolId})`);
  console.log(`From Dedicated D1: ${dedicatedDbName}`);
  console.log(`To Shared D1:      ${sharedDbName}`);
  console.log(`======================================================\n`);

  for (const table of OPERATIONAL_TABLES) {
    console.log(`Migrating table: ${table}...`);
    try {
      // Query rows from dedicated DB
      let out;
      try {
        out = runD1(dedicatedDbName, `SELECT * FROM ${table} WHERE school_id = '${schoolId}'`, true);
      } catch (e) {
        console.log(`  ℹ️ Table ${table} does not exist or is empty in dedicated DB.`);
        continue;
      }

      const parsed = JSON.parse(out);
      const rows = parsed[0]?.results || [];

      if (rows.length === 0) {
        console.log(`  0 records found in ${table}.`);
        continue;
      }

      console.log(`  Found ${rows.length} records. Merging into shared DB...`);

      for (const row of rows) {
        const columns = Object.keys(row);
        const values = Object.values(row).map((v) => (v === null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`));

        const insertCmd = `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${values.join(', ')});`;
        try {
          runD1(sharedDbName, insertCmd, false);
        } catch (e) {
          console.warn(`  ⚠️ Failed to insert row into ${table}: ${e.message}`);
        }
      }

      console.log(`  ✅ Successfully merged ${table}.`);
    } catch (err) {
      console.error(`  ❌ Error migrating table ${table}:`, err.message);
    }
  }

  // Update registry mode
  school.mode = 'shared';
  school.downgradedAt = new Date().toISOString();
  try {
    fs.writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2), 'utf-8');
    console.log(`\n✅ Downgrade complete. School "${slug}" is now set to shared mode in ${REGISTRY_FILE}.`);
  } catch (err) {
    console.error(`Error saving updated registry:`, err.message);
    process.exit(1);
  }
}

const targetSlug = process.argv[2];
downgradeSchool(targetSlug).catch((e) => {
  console.error('Fatal downgrade error:', e);
  process.exit(1);
});
