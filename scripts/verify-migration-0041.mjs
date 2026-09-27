#!/usr/bin/env node
// Verifies migration 0041 (parent_student_links backfill) against a real local
// D1 with deliberately awkward fixtures.
//
// WHY A SCRIPT AND NOT A SQL FILE
//
// The migration's value is entirely in what it REFUSES to do. A backfill that
// links every matching row looks fine on a happy-path dataset and silently links a
// parent to another school's child on a real one. So the fixtures include the
// ambiguous and cross-tenant cases, and the assertions are about absence as much
// as presence.
//
// Run: node scripts/verify-migration-0041.mjs
//
// Requires the local D1 to exist. If it does not, the script applies migrations
// first. It DELETES its own fixtures and leaves the rest of the database alone.

import { execSync } from 'child_process';
import fs from 'fs';
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

function wrangler(args) {
  return execSync('npx wrangler ' + args, {
    cwd: REPO,
    encoding: 'utf-8',
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function sql(query) {
  const out = wrangler('d1 execute DB --local --json --command=' + JSON.stringify(query));
  const parsed = JSON.parse(out);
  return (parsed[0] && parsed[0].results) || [];
}

// Migrations first, so the run does not depend on prior local state.
wrangler('d1 migrations apply DB --local');

const fixtures = fs.readFileSync(path.join(REPO, 'scripts/test-fixtures-0041.sql'), 'utf-8');
const tmp = path.join(REPO, '.tmp-fixtures-0041.sql');
fs.writeFileSync(tmp, fixtures, 'utf-8');
try {
  wrangler('d1 execute DB --local --file="' + tmp + '"');
} finally {
  fs.rmSync(tmp, { force: true });
}

// 0041 is a data migration with no schema change, so it is applied by executing it
// directly rather than through `migrations apply`. Going through the migrator here
// would be a no-op after the first run, and this script has to be re-runnable.
const mig = fs.readFileSync(
  path.join(REPO, 'db_migrations/0041_backfill_parent_student_links.sql'),
  'utf-8',
);
const migTmp = path.join(REPO, '.tmp-mig-0041.sql');
fs.writeFileSync(migTmp, mig, 'utf-8');
try {
  // Applied twice on purpose: the second run must change nothing.
  wrangler('d1 execute DB --local --file="' + migTmp + '"');
  wrangler('d1 execute DB --local --file="' + migTmp + '"');
} finally {
  fs.rmSync(migTmp, { force: true });
}

console.log('\nMigration 0041 — parent_student_links backfill\n');

const links = sql('SELECT parent_user_id, student_id, relationship, is_primary FROM parent_student_links');
const forParent = (id) => links.filter((l) => l.parent_user_id === id);
const idsFor = (id) => forParent(id).map((l) => l.student_id).sort();

// --- the shared-phone case, which is the whole point of rule 1 --------------
check(
  'a parent is linked to ALL three children sharing their phone',
  JSON.stringify(idsFor('u-priya')) === JSON.stringify(['s-1', 's-2', 's-3']),
  'got: ' + JSON.stringify(idsFor('u-priya')),
);
check(
  'sibling links are recorded as relationship "Parent"',
  forParent('u-priya').every((l) => l.relationship === 'Parent'),
);

// --- cross-tenant refusal, rule 2 -------------------------------------------
check(
  'a phone that matches students in two schools links NEITHER',
  idsFor('u-amb').length === 0,
  'got: ' + JSON.stringify(idsFor('u-amb')) + ' — a cross-tenant PII leak',
);

// --- no false positives ------------------------------------------------------
check('a parent with no matching child gets no link', idsFor('u-nomatch').length === 0);
check(
  'a Staff account is never treated as a family member',
  idsFor('u-rahul').length === 0,
  'got: ' + JSON.stringify(idsFor('u-rahul')),
);
check(
  'the same phone in a different school creates no cross-tenant link',
  idsFor('u-priya2').length === 0,
  'got: ' + JSON.stringify(idsFor('u-priya2')),
);

// --- self-linking, and the case-insensitivity that makes it work ------------
check(
  'a Student account is linked to their own record (case-insensitive match)',
  JSON.stringify(idsFor('u-self')) === JSON.stringify(['s-6']),
  'got: ' + JSON.stringify(idsFor('u-self')),
);
check(
  'a Student self-link is recorded as relationship "Self"',
  forParent('u-self').every((l) => l.relationship === 'Self'),
);

// --- idempotency, which is what the double-apply above proves ---------------
check(
  're-applying the migration creates no duplicates',
  links.length === forParent('u-priya').length + forParent('u-self').length,
  'expected 4 rows, got ' + links.length,
);

// --- the invariant Phase 1 depends on ---------------------------------------
const orphan = sql(
  "SELECT COUNT(*) AS n FROM parent_student_links l "
  + "LEFT JOIN students s ON s.id = l.student_id AND s.school_id = l.school_id "
  + "WHERE s.id IS NULL",
);
check(
  'every link points at a student in the SAME school',
  Number(orphan[0].n) === 0,
  'found ' + orphan[0].n + ' cross-school or dangling link(s)',
);

console.log('');
if (failures > 0) {
  console.error('FAILED: ' + failures + ' migration 0041 check(s) failed\n');
  process.exit(1);
}
console.log('All migration 0041 checks passed.\n');
