// Verifies the migration ledger (0042) that replaces the system_users row-count
// as the "has this school been migrated?" guard.
//
// WHY THIS NEEDS A TEST
//
// The guard it replaced was wrong in a way no static check could catch. It counted
// system_users rows, so a school with data but no accounts was read as
// NOT migrated, and every deploy re-ran the copy — which is INSERT OR REPLACE
// from the shared D1, a source that is stale by construction. So a deploy could
// silently overwrite a school's newer dedicated rows with older shared ones, and
// the only symptom would be data quietly going backwards.
//
// Run: node scripts/verify-migration-0042.mjs

import { execSync } from 'child_process';
import path from 'path';

const REPO = process.cwd();
let failures = 0;

function check(name, condition, detail) {
  if (condition) {
    console.log('  PASS  ' + name);
  } else {
    failures++;
    console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : ''));
  }
}

function sql(query) {
  const out = execSync('npx wrangler d1 execute DB --local --json --command=' + JSON.stringify(query), {
    cwd: REPO, encoding: 'utf-8', maxBuffer: 32 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const parsed = JSON.parse(out);
  return (parsed[0] && parsed[0].results) || [];
}

console.log('\nMigration 0042 — dedicated migration ledger\n');

const tables = sql("SELECT name FROM sqlite_master WHERE type='table' AND name='dedicated_migration_ledger'");
check('the ledger table exists', tables.length === 1, 'run: npx wrangler d1 migrations apply DB --local');
if (tables.length === 0) {
  console.error('\nFAILED: apply migrations first\n');
  process.exit(1);
}

// The columns the script depends on. If one is renamed the deploy's ledger write
// fails at run time, on a production deploy, which is the worst place to find out.
const cols = sql('PRAGMA table_info(dedicated_migration_ledger)').map((c) => c.name);
for (const c of ['id', 'school_id', 'table_name', 'rows_copied', 'forced', 'completed_at']) {
  check('column ' + c + ' exists', cols.includes(c), 'have: ' + cols.join(', '));
}

// The UNIQUE index is what makes INSERT OR REPLACE re-record rather than collide.
const idx = sql("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='dedicated_migration_ledger'");
check('indexes exist on the ledger', idx.length >= 2, idx.map((i) => i.name).join(', '));

// ---- behaviour: record, re-record, and query-by-school --------------------
const SCHOOL = 'ledger-test-school';
sql(`DELETE FROM dedicated_migration_ledger WHERE school_id = '${SCHOOL}'`);

const insert = (table, rows, forced) =>
  `INSERT OR REPLACE INTO dedicated_migration_ledger (id, school_id, table_name, rows_copied, forced, completed_at) `
  + `VALUES ('dml-${SCHOOL}-${table}', '${SCHOOL}', '${table}', ${rows}, ${forced ? 1 : 0}, CURRENT_TIMESTAMP)`;

sql(insert('students', 42, 0));
sql(insert('system_users', 3, 0));
sql(insert('fees', 0, 0));

const count = sql(`SELECT COUNT(*) AS n FROM dedicated_migration_ledger WHERE school_id = '${SCHOOL}'`)[0].n;
check('one row per copied table', Number(count) === 3, 'got ' + count);

// Re-recording the same table must UPDATE, not duplicate. Without the UNIQUE
// index this would either collide or pile up rows, and the deploy's forced
// re-copy path depends on it.
sql(insert('students', 50, 1));
const afterRerecord = sql(`SELECT rows_copied, forced FROM dedicated_migration_ledger WHERE school_id = '${SCHOOL}' AND table_name = 'students'`)[0];
check('re-recording a table updates it in place', Number(afterRerecord.rows_copied) === 50, JSON.stringify(afterRerecord));
check('a forced re-copy is distinguishable in the record', Number(afterRerecord.forced) === 1, JSON.stringify(afterRerecord));

// The lookup the deploy actually performs.
const has = sql(`SELECT COUNT(*) AS n FROM dedicated_migration_ledger WHERE school_id = '${SCHOOL}'`)[0].n;
check('the guard query finds the school', Number(has) > 0);

const other = sql("SELECT COUNT(*) AS n FROM dedicated_migration_ledger WHERE school_id = 'some-other-school'")[0].n;
check('the guard does not match a different school', Number(other) === 0);

// Deleting the school's entries is what a forced re-copy does first.
sql(`DELETE FROM dedicated_migration_ledger WHERE school_id = '${SCHOOL}'`);
const afterDelete = sql(`SELECT COUNT(*) AS n FROM dedicated_migration_ledger WHERE school_id = '${SCHOOL}'`)[0].n;
check('clearing the record makes the guard miss again', Number(afterDelete) === 0);

sql(`DELETE FROM dedicated_migration_ledger WHERE school_id = '${SCHOOL}'`);

console.log('');
if (failures > 0) {
  console.error('FAILED: ' + failures + ' migration 0042 check(s) failed\n');
  process.exit(1);
}
console.log('All migration 0042 checks passed.\n');
