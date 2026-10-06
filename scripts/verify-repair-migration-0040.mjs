// Local-only harness for scripts/repair-migration-0040.mjs.
//
// Every case runs against a LOCAL wrangler D1. Nothing here touches the remote
// account. Each block was written against a defect that was observed live.
//
//   Defect 1  parseRows swallowed the wrangler banner and returned [], so
//             tableExists() said "table absent" on a perfectly healthy table.
//   Defect 2  spawnSync('npx.cmd', {shell:false}) throws EINVAL on Windows.
//   Defect 3  ALTER TABLE ... DEFAULT CURRENT_TIMESTAMP is rejected by the
//             SQLite behind D1, so created_at — the one column that unblocks
//             ORDER BY — could never be added.
//   Defect 4  the report entry carried only `label`, so the apply loop lost the
//             slug and wrote to the wrong database.
//   Defect 5  a missing wrangler-<slug>.toml was a silent SKIP, printing
//             "Nothing to repair" over eight broken databases.
//   Defect 6  backfill/trigger depend on the column existing, so a single pass
//             never converged.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const WRANGLER = path.resolve('node_modules/wrangler/bin/wrangler.js');
const SCRIPT = path.resolve('scripts/repair-migration-0040.mjs');
const CFG = path.resolve('wrangler-selftest.toml');
const TMP = path.resolve('.tmp-repair-0040');
const FIXTURE = path.join(TMP, 'schools.json');
const DB = 'repair_selftest';

const CONFIG = `name = "repair-selftest"
compatibility_date = "2025-01-01"

[[d1_databases]]
binding = "DB"
database_name = "${DB}"
database_id = "local"
`;

// The 0040 damage: created_at and the 0035/0036 columns absent from the tables
// 0040 rebuilt. Also carries rows, so the backfill has something to do.
const SEED = `
CREATE TABLE teachers (id TEXT PRIMARY KEY, employee_code TEXT, name TEXT, school_id TEXT);
CREATE TABLE fee_invoices (id TEXT PRIMARY KEY, invoice_number TEXT, student_id TEXT,
  total_amount REAL, paid_amount REAL, status TEXT, school_id TEXT, scholar_number TEXT);
CREATE TABLE students (id TEXT PRIMARY KEY);
CREATE TABLE system_users (id TEXT PRIMARY KEY);
INSERT INTO teachers VALUES ('t1','E1','Asha','s1');
INSERT INTO teachers VALUES ('t2','E2','Ravi','s1');
INSERT INTO fee_invoices VALUES ('f1','INV-1','st1',100,0,'Unpaid','s1','1');
INSERT INTO fee_invoices VALUES ('f2','INV-2','st2',250,250,'Paid','s1','2');
`;

function wrangler(args, { allowFail = false } = {}) {
  const r = spawnSync(process.execPath, [WRANGLER, ...args], { encoding: 'utf-8', shell: false });
  if (!allowFail && r.status !== 0) {
    throw new Error((r.stderr || r.stdout || '').split('\n').slice(0, 4).join(' '));
  }
  return r;
}

function raw(args) { return wrangler(['d1', 'execute', '-c', CFG, DB, ...args]).stdout; }

function rows(args) {
  const text = String(raw(args) || '');
  const start = text.search(/^\[\s*$/m);
  if (start === -1) throw new Error('no JSON array in wrangler output');
  const p = JSON.parse(text.slice(start));
  for (const e of (Array.isArray(p) ? p : [p])) if (e && Array.isArray(e.results)) return e.results;
  return [];
}

function one(args) { return rows(args)[0]; }

function indexNames() {
  return rows(['--local', '--command', "SELECT name FROM sqlite_master WHERE type='index'"]).map((r) => r.name);
}

function triggerNames() {
  return rows(['--local', '--command', "SELECT name FROM sqlite_master WHERE type='trigger'"]).map((r) => r.name);
}

function reset() {
  fs.rmSync(path.resolve('.wrangler', 'state'), { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });
  fs.writeFileSync(CFG, CONFIG);
  fs.writeFileSync(path.join(TMP, 'seed.sql'), SEED);
  fs.writeFileSync(FIXTURE, JSON.stringify({
    schools: [{ slug: 'selftest', schoolId: 'school-selftest', mode: 'dedicated', name: 'Self test' }],
  }));
  wrangler(['d1', 'execute', '-c', CFG, DB, '--local', '--file', path.join(TMP, 'seed.sql')]);
}

function run(...extra) {
  return spawnSync(process.execPath, [SCRIPT, '--local', '--registry', FIXTURE, ...extra],
    { encoding: 'utf-8', shell: false });
}

let pass = 0, fail = 0;
function check(name, ok) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  ok ? pass++ : fail++;
}

console.log('\nSeeding a local database that has the 0040 damage …\n');
reset();
{
  const cols = new Set(rows(['--local', '--command', "SELECT name FROM pragma_table_info('teachers')"]).map((r) => r.name));
  console.log(`  seeded teachers columns: ${cols.size}, created_at present: ${cols.has('created_at')}`);
}

// ---------------------------------------------------------------- 1
console.log('\n1. The wrangler banner must not be mistaken for "no rows"\n');
{
  const out = raw(['--local', '--command', "SELECT name FROM pragma_table_info('teachers')"]);
  check('wrangler really does print a banner first', String(out).trim().startsWith('\u26C5'));
  let oldRows = [];
  try {
    const p = JSON.parse(String(out).trim());
    if (Array.isArray(p) && p[0] && Array.isArray(p[0].results)) oldRows = p[0].results;
  } catch { /* the old parser's path */ }
  check('the old whole-string parse yields nothing', oldRows.length === 0);
  check('the corrected parse yields the real rows', rows(['--local', '--command', "SELECT name FROM pragma_table_info('teachers')"]).length === 4);
  check('a healthy table is not called absent', !/table absent/.test(run('--slug', 'selftest').stdout));
}

// ---------------------------------------------------------------- 2
console.log('\n2. A dry run must name the missing columns\n');
{
  const out = String(run('--slug', 'selftest').stdout || '');
  check('teachers.created_at reported', /missing column\s+teachers\.created_at/.test(out));
  check('fee_invoices.created_at reported', /missing column\s+fee_invoices\.created_at/.test(out));
  check('razorpay_order_id reported', /missing column\s+fee_invoices\.razorpay_order_id/.test(out));
  check('last_reminder_at reported', /missing column\s+fee_invoices\.last_reminder_at/.test(out));
  check('index shown as an index, not a column', /missing index\s+idx_fee_invoices_razorpay_order/.test(out));
  check('announces a dry run needing repair', /Dry run\. 1 database\(s\) need repair/.test(out));
  check('changed nothing', new Set(rows(['--local', '--command', "SELECT name FROM pragma_table_info('teachers')"]).map((r) => r.name)).has('created_at') === false);
}

// ---------------------------------------------------------------- 3
console.log('\n3. miniflare rejects a non-constant default on ADD COLUMN\n');
{
  // Two facts make this easy to get wrong, and both were observed here:
  //
  //   a) node's own bundled SQLite 3.51 ACCEPTS
  //      ADD COLUMN ... DEFAULT CURRENT_TIMESTAMP. A check written against
  //      node:sqlite would pass and still fail against D1.
  //   b) miniflare's local D1 ACCEPTS it on an EMPTY table and REJECTS it on a
  //      table that holds rows. Probing an empty table therefore proves nothing
  //      about production, where teachers and fee_invoices both have rows
  //      (2 and 0 on the platform DB, 2 and 0 on `a`).
  //
  // So the probe must run against a table that has a row in it.
  wrangler(['d1', 'execute', '-c', CFG, DB, '--local', '--command',
    'CREATE TABLE probe_default (id TEXT PRIMARY KEY, v TEXT)']);
  wrangler(['d1', 'execute', '-c', CFG, DB, '--local', '--command',
    "INSERT INTO probe_default VALUES ('a','1')"]);

  const rejected = wrangler(['d1', 'execute', '-c', CFG, DB, '--local', '--command',
    'ALTER TABLE probe_default ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP'],
    { allowFail: true });
  check('rejected on a table that has rows', rejected.status !== 0);
  check('the error is the documented one', /non-constant default/.test(String(rejected.stderr) + String(rejected.stdout)));

  const plain = wrangler(['d1', 'execute', '-c', CFG, DB, '--local', '--command',
    'ALTER TABLE probe_default ADD COLUMN other TEXT'], { allowFail: true });
  check('a plain ADD COLUMN is accepted', plain.status === 0);

  wrangler(['d1', 'execute', '-c', CFG, DB, '--local', '--command', 'DROP TABLE probe_default']);

  const src = fs.readFileSync(SCRIPT, 'utf-8');
  check('the script issues no non-constant default', !/DEFAULT CURRENT_TIMESTAMP'/.test(src));
  check('the script adds created_at as a bare TIMESTAMP', /created_at: 'TIMESTAMP'/.test(src));
}

// ---------------------------------------------------------------- 4
console.log('\n4. --apply must write to the database the dry run inspected\n');
{
  const out = String(run('--slug', 'selftest', '--apply', '--yes').stdout || '');
  check('apply reported no error on any statement', !/^\s+! /m.test(out));
  check('used the school config, naming it in the output', /repairing selftest \(wrangler-selftest\.toml\)/.test(out));
  check('verified complete', /verified complete\./.test(out));

  const t = new Set(rows(['--local', '--command', "SELECT name FROM pragma_table_info('teachers')"]).map((r) => r.name));
  const f = new Set(rows(['--local', '--command', "SELECT name FROM pragma_table_info('fee_invoices')"]).map((r) => r.name));
  check('teachers.created_at exists', t.has('created_at'));
  for (const c of ['created_at', 'razorpay_order_id', 'razorpay_payment_id',
    'razorpay_payment_link_id', 'razorpay_payment_link_url', 'last_reminder_at']) {
    check(`fee_invoices.${c} exists`, f.has(c));
  }

  const idx = indexNames();
  check('idx_fee_invoices_razorpay_order created', idx.includes('idx_fee_invoices_razorpay_order'));
  check('idx_teachers_school_employee_code created', idx.includes('idx_teachers_school_employee_code'));

  check('pre-existing rows kept', Number(one(['--local', '--command', 'SELECT COUNT(*) AS n FROM fee_invoices']).n) === 2);
  check('pre-existing teachers kept', Number(one(['--local', '--command', 'SELECT COUNT(*) AS n FROM teachers']).n) === 2);
}

// ---------------------------------------------------------------- 5
console.log('\n5. created_at must be backfilled and stay stamped\n');
{
  check('no NULL created_at left in teachers',
    Number(one(['--local', '--command', 'SELECT COUNT(*) AS n FROM teachers WHERE created_at IS NULL']).n) === 0);
  check('no NULL created_at left in fee_invoices',
    Number(one(['--local', '--command', 'SELECT COUNT(*) AS n FROM fee_invoices WHERE created_at IS NULL']).n) === 0);
  // The exact statement api/fees/index.ts:68 runs, which used to throw
  // "no such column: created_at" on every school.
  const ordered = rows(['--local', '--command', 'SELECT id FROM fee_invoices ORDER BY created_at DESC']);
  check('the query that used to throw now answers', ordered.length === 2);
  const orderedTeachers = rows(['--local', '--command', 'SELECT id FROM teachers ORDER BY created_at DESC']);
  check('api/staff/index.ts:83 ordering also works', orderedTeachers.length === 2);

  const trg = triggerNames();
  check('teachers trigger exists', trg.includes('trg_teachers_created_at_default'));
  check('fee_invoices trigger exists', trg.includes('trg_fee_invoices_created_at_default'));

  // api/staff/index.ts:145 and api/fees/index.ts:291 INSERT without created_at.
  wrangler(['d1', 'execute', '-c', CFG, DB, '--local', '--command',
    "INSERT INTO teachers (id,employee_code,name,school_id) VALUES ('t9','E9','Fresh','s1')"]);
  const fresh = one(['--local', '--command', "SELECT created_at FROM teachers WHERE id='t9'"]);
  check('a new row inserted without created_at is stamped', !!fresh && !!fresh.created_at);
}

// ---------------------------------------------------------------- 6
console.log('\n6. Running again must be a clean no-op\n');
{
  const out = String(run('--slug', 'selftest').stdout || '');
  check('schema is complete', /OK — schema is complete/.test(out));
  check('says nothing to repair', /Nothing to repair\. Every database in scope was examined and answered\./.test(out));
  check('no error text', !/ERROR|INCOMPLETE/.test(out));
}

// ---------------------------------------------------------------- 7
console.log('\n7. With no per-school config, the slug must resolve by name or fail\n');
{
  // This is the production path: wrangler-<slug>.toml is generated at deploy time
  // and is absent on any machine that is not the CI runner. The script now
  // resolves `school-management-<slug>-db` from the account and must refuse when
  // that name is not there, rather than dropping to wrangler.toml's database.
  fs.renameSync(CFG, path.join(TMP, 'wrangler-selftest.toml'));
  try {
    const r = spawnSync(process.execPath,
      [SCRIPT, '--local', '--registry', FIXTURE, '--slug', 'selftest'], { encoding: 'utf-8', shell: false });
    const out = String(r.stdout || '') + String(r.stderr || '');
    check('does not silently succeed', !/OK — schema is complete/.test(out));
    check('refuses to invent a database', /no D1 database named|Refusing to guess/i.test(out));
    check('flags the run as INCOMPLETE', /INCOMPLETE/.test(out));
    check('does not print the reassuring sentence', !/Nothing to repair\. Every database/.test(out));
  } finally {
    fs.renameSync(path.join(TMP, 'wrangler-selftest.toml'), CFG);
  }
  check('the config is back', fs.existsSync(CFG));
}

console.log('\n7b. A slug the account does not have a database for must be refused\n');
{
  // In the registry, so it passes the membership check, but no such database
  // exists. resolveByName has to refuse.
  const bad = path.join(TMP, 'schools-bad.json');
  fs.writeFileSync(bad, JSON.stringify({
    schools: [{ slug: 'no-such-school', schoolId: 'x', mode: 'dedicated', name: 'nope' }],
  }));
  const r = spawnSync(process.execPath,
    [SCRIPT, '--local', '--registry', bad, '--slug', 'no-such-school'], { encoding: 'utf-8', shell: false });
  const out = String(r.stdout || '') + String(r.stderr || '');
  check('non-zero exit', r.status !== 0);
  check('refuses by name', /no D1 database named "school-management-no-such-school-db"/.test(out));
  check('says it will not guess', /Refusing to guess/i.test(out));
  check('does not print the reassuring sentence', !/Nothing to repair/.test(out));
}

console.log('\n7c. A slug absent from the registry must be refused before any query\n');
{
  const r = run('--slug', 'never-registered');
  const out = String(r.stdout || '') + String(r.stderr || '');
  check('non-zero exit', r.status !== 0);
  check('names the slug as unknown', /Unknown slug "never-registered"/.test(out));
  check('does not print the reassuring sentence', !/Nothing to repair/.test(out));
}

// ---------------------------------------------------------------- 8
console.log('\n8. A missing registry must not read as an empty one\n');
{
  const r = spawnSync(process.execPath,
    [SCRIPT, '--local', '--registry', path.join(TMP, 'nope.json'), '--slug', 'selftest'],
    { encoding: 'utf-8', shell: false });
  const out = String(r.stdout || '') + String(r.stderr || '');
  check('non-zero exit', r.status !== 0);
  check('names the missing file', /registry file .*nope\.json not found/.test(out));
}

// ---------------------------------------------------------------- 9
console.log('\n9. The bugs must stay fixed in the source\n');
{
  const src = fs.readFileSync(SCRIPT, 'utf-8');
  check('parseRows no longer returns [] on a parse failure', !/catch \{\s*return \[\];\s*\}/.test(src));
  // The npx fallback is legitimate, so assert the local entry point is preferred
  // rather than asserting the string "npx" is absent.
  check('wrangler is invoked through its own entry point', /wranglerEntry\(\)/.test(src));
  check('the silent SKIP is gone', !/SKIPPED — /.test(src));
  check('report entries carry slug', /report\.push\(\{ slug: entry\.slug/.test(src));
  check('Nothing to repair is qualified', /Nothing to repair\. Every database in scope/.test(src));
}

// cleanup
fs.rmSync(CFG, { force: true });
fs.rmSync(TMP, { recursive: true, force: true });
fs.rmSync(path.resolve('.wrangler', 'state'), { recursive: true, force: true });

console.log(`\n${fail === 0 ? 'ALL GREEN' : 'FAILURES PRESENT'} — ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);