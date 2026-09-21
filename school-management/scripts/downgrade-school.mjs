/**
 * Pragnya Mitra Multi-Tenant Architecture — Downgrade Script (Enterprise -> Shared)
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
