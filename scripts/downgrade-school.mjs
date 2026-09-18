/**
 * VidyaSetu Multi-Tenant Architecture — Downgrade Script (Enterprise -> Shared)
 * 
 * Migrates a school's operational data from its dedicated D1 database back
 * to the shared platform D1 database while guaranteeing school_id tenant scoping,
 * and updates schools.json mode from 'dedicated' to 'shared'.
 * 
 * Usage:
 *   node scripts/downgrade-school.mjs <slug>
 */

import fs from 'fs';
import { execSync } from 'child_process';

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

function run(cmd) {
  console.log(`> ${cmd}`);
  return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
}

async function downgradeSchool(slug) {
  if (!slug) {
    console.error('Usage: node scripts/downgrade-school.mjs <school-slug>');
    process.exit(1);
  }

  if (!fs.existsSync(REGISTRY_FILE)) {
    console.error(`Registry file ${REGISTRY_FILE} not found.`);
    process.exit(1);
  }

  const registry = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf-8'));
  const school = registry.schools.find((s) => s.slug === slug);

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
      const queryCmd = `npx wrangler d1 execute ${dedicatedDbName} --command="SELECT * FROM ${table} WHERE school_id = '${schoolId}'" --json`;
      let out;
      try {
        out = run(queryCmd);
      } catch (e) {
        // Table might not exist or empty
        console.log(`  ℹ️ Table ${table} does not exist or has no records in dedicated DB.`);
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
          run(`npx wrangler d1 execute ${sharedDbName} --command="${insertCmd}"`);
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
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2));

  console.log(`\n✅ Downgrade complete. School "${slug}" is now set to shared mode in ${REGISTRY_FILE}.`);
}

const targetSlug = process.argv[2];
downgradeSchool(targetSlug).catch((e) => {
  console.error('Fatal downgrade error:', e);
  process.exit(1);
});
