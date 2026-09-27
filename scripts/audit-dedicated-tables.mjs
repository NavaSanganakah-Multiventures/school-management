// Audits which tables db_migrations creates versus which tables
// scripts/migrate-to-dedicated.mjs copies into a dedicated D1.
//
// A table created by a migration but missing from OPERATIONAL_TABLES is silently
// never copied when a school moves from the shared D1 to its own. Nothing fails:
// copyTable is only ever called for tables in the list, so an omission is invisible
// until someone notices a school "works" on shared and is blank on dedicated.
//
// Run: node scripts/audit-dedicated-tables.mjs

import fs from 'node:fs';
import path from 'node:path';

const MIG_DIR = 'db_migrations';

// Tables handled explicitly rather than through the shared list.
const HANDLED_ELSEWHERE = new Set([
  'school_tenants',      // keyed by id, copied explicitly before the list
  'school_profile',      // keyed by id, copied explicitly before the list
  'user_notification_tokens', // has no school_id column, not school-scoped
  '_cf_KV',              // D1 internal
  'd1_migrations',       // D1 internal
  'sqlite_sequence',     // D1 internal
  'teachers_mig0040',    // transient rebuild table, dropped by 0040
  'fee_invoices_mig0040',// transient rebuild table, dropped by 0040
]);

// Transient rebuild tables: a migration creates `<name>_new`, copies rows across,
// then drops the original. The original name is what survives, and it is already
// in the copy list. Without this, every table-rebuild migration shows up as a
// false "missing" entry -- which is how `school_subscriptions_new` and
// `system_users_new` were reported on the first run of this script.
const TRANSIENT_SUFFIXES = ['_new', '_mig0040', '_mig'];

// Platform-level tables: one shared set for every school, so copying them
// per-school would be wrong (or would duplicate them). Correctly absent from the
// list. Listed here so the audit reports them as understood rather than as
// "needs review", which is noise that trains people to ignore the output.
const PLATFORM_LEVEL = new Set([
  'platform_admins',
  'subscription_plans',
  'password_reset_tokens',
  'plugins',
  'razorpay_plans_cache',
]);

function stripSqlComments(sql) {
  return sql.replace(/--[^\n]*/g, ' ');
}

// Every table a migration creates, or adds a column to.
function collectSchema() {
  const tables = new Map(); // name -> { file, hasSchoolId }
  const files = fs.readdirSync(MIG_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const f of files) {
    const sql = stripSqlComments(fs.readFileSync(path.join(MIG_DIR, f), 'utf-8'));
    // CREATE TABLE [IF NOT EXISTS] name ( ... );
    const createRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["'`\[]?(\w+)["'`\]]?\s*\(([\s\S]*?)\)\s*;/gi;
    let m;
    while ((m = createRe.exec(sql)) !== null) {
      const name = m[1];
      const body = m[2];
      if (!tables.has(name)) {
        tables.set(name, { file: f, hasSchoolId: /school_id/i.test(body) });
      } else if (/school_id/i.test(body)) {
        tables.get(name).hasSchoolId = true;
      }
    }
  }
  return tables;
}

// Tables named in the copy list.
function collectCopyList() {
  const src = fs.readFileSync('scripts/migrate-to-dedicated.mjs', 'utf-8');
  const m = src.match(/const OPERATIONAL_TABLES\s*=\s*\[([\s\S]*?)\];/);
  if (!m) throw new Error('could not find OPERATIONAL_TABLES');
  return new Set(Array.from(stripSqlComments(m[1]).matchAll(/'([^']+)'/g)).map((x) => x[1]));
}

const schema = collectSchema();
const copied = collectCopyList();

let missing = 0;
let notSchoolScoped = 0;

console.log('\nDedicated-D1 table coverage\n');
console.log('  tables created by migrations : ' + schema.size);
console.log('  tables in the copy list      : ' + copied.size + '\n');

const rows = [];
for (const [name, info] of schema) {
  if (HANDLED_ELSEWHERE.has(name)) continue;
  if (copied.has(name)) continue;
  if (TRANSIENT_SUFFIXES.some((s) => name.endsWith(s))) continue;
  if (PLATFORM_LEVEL.has(name)) continue;
  if (info.hasSchoolId) {
    rows.push({ name, file: info.file, verdict: 'MISSING, school-scoped' });
    missing++;
  } else {
    rows.push({ name, file: info.file, verdict: 'REVIEW, no school_id found' });
    notSchoolScoped++;
  }
}

if (rows.length === 0) {
  console.log('  every school-scoped table is in the copy list\n');
} else {
  for (const r of rows) {
    console.log('  ' + r.verdict.padEnd(26) + r.name.padEnd(30) + r.file);
  }
  console.log('');
}

// Copy-list entries that no migration creates are either legacy names or typos,
// and a typo there is a table that silently never gets copied.
const ghosts = [...copied].filter((t) => !schema.has(t));
if (ghosts.length) {
  console.log('  copy-list entries with no matching CREATE TABLE:');
  for (const g of ghosts) console.log('    ' + g);
  console.log('');
}

console.log('  missing (school-scoped, never copied): ' + missing);
console.log('  needs review:                           ' + notSchoolScoped + '\n');

if (missing > 0) {
  console.error('FAIL: ' + missing + ' school-scoped table(s) are never copied to a dedicated D1.\n');
  process.exit(1);
}
console.log('All school-scoped tables are covered.\n');
