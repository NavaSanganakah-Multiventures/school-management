// scripts/verify-phase2-money.mjs
// Executable proof for the Phase 2 money-integrity changes.
//
// Covers four areas:
//
//  1. Multi-tenant uniqueness. Two schools must both be able to use the SAME
//     employee_code and the SAME invoice_number: they are per-school display
//     codes generated from a per-school counter, but migration 0001 declared
//     them globally UNIQUE, so the second school could never insert its first
//     row. Asserted against a real local D1, not a mock.
//
//  2. system_users.email must REMAIN globally unique, because
//     api/auth/index.ts logs a user in with
//     `WHERE LOWER(email) = ? OR LOWER(username) = ?` and no tenant predicate.
//     Loosening it would make login ambiguous.
//
//  3. payment_ledger must exist and reject a duplicate payment_id.
//
//  4. Static assertions that the webhook only treats a UNIQUE violation as a
//     duplicate, that `payment.failed` cannot downgrade a paid invoice, that
//     activation no longer charges-without-activating, and that no migration
//     file contains a transaction keyword (including inside a comment).
//
// Usage:
//   npx wrangler d1 migrations apply DB --local
//   node scripts/verify-phase2-money.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');

let failures = 0;
const results = [];
function check(name, ok) {
  results.push({ name, ok: !!ok });
  if (!ok) failures++;
}

// Spawning a `.cmd` shim through execFileSync is not portable (EINVAL on
// Windows), so wrangler is driven through a shell command string instead.
//
// No version is pinned here: wrangler is a devDependency at an exact version, so
// `npx wrangler` resolves the local build. That is the whole point -- this
// harness has to exercise the same wrangler that deploy.yml and the preview
// workflow use, otherwise a green harness says nothing about the deploy.
function wranglerSql(sql) {
  const cmd = 'npx wrangler d1 execute DB --local --json --command='
    + JSON.stringify(sql);
  const out = execSync(cmd, {
    cwd: REPO,
    encoding: 'utf-8',
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const parsed = JSON.parse(out);
  const rows = [];
  for (const chunk of parsed) {
    if (chunk && Array.isArray(chunk.results)) rows.push(...chunk.results);
  }
  return rows;
}

function wranglerSqlFails(sql) {
  try {
    wranglerSql(sql);
    return null;
  } catch (e) {
    return String((e && (e.stderr || e.message)) || '');
  }
}

// Strips only COMMENTS, deliberately keeping string literals: the assertions
// below match SQL and header names that live inside string literals (e.g.
// c.req.header('X-Razorpay-Event-Id'), SELECT ... first_name ...).
// Comments are stripped so a fix that NAMES the bad column in its own
// explanation is not mistaken for executable SQL.
function codeOf(relPath) {
  const src = fs.readFileSync(path.join(REPO, relPath), 'utf-8');
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

console.log('\nPhase 2 money-integrity verification\n');

// ---------------------------------------------------------------------------
// Fixtures: two schools holding identical per-school codes.
// Prior fixtures are cleared so the script is re-runnable against a long-lived
// local D1 (system_users.email is globally unique, so a leftover row from an
// earlier run would fail this script's own setup).
// ---------------------------------------------------------------------------
wranglerSql('DELETE FROM teachers');
wranglerSql('DELETE FROM fee_invoices');
wranglerSql('DELETE FROM payment_ledger');
wranglerSql("DELETE FROM system_users WHERE id IN ('u-a1','u-b1')");

wranglerSql(
  "INSERT INTO teachers (id, employee_code, name, designation, department, subject_specialization, school_id) VALUES "
  + "('t-a1','EMP-010','A Teacher','Teacher','Science','Physics','school-A'),"
  + "('t-b1','EMP-010','B Teacher','Teacher','Science','Physics','school-B')"
);

// 1. employee_code is tenant-scoped
{
  const rows = wranglerSql(
    "SELECT school_id, employee_code FROM teachers WHERE employee_code = 'EMP-010' ORDER BY school_id"
  );
  check(
    'two schools can both hold employee_code EMP-010 (global UNIQUE removed)',
    rows.length === 2 && rows[0].school_id === 'school-A' && rows[1].school_id === 'school-B',
    'got ' + rows.length + ' rows'
  );

  const err = wranglerSqlFails(
    "INSERT INTO teachers (id, employee_code, name, designation, department, subject_specialization, school_id) "
    + "VALUES ('t-a2','EMP-010','Dup A','Teacher','Science','Physics','school-A')"
  );
  check('the SAME school still cannot duplicate its employee_code', !!err, 'error=' + err);
}

// 2. invoice_number is tenant-scoped
wranglerSql(
  "INSERT INTO fee_invoices (id, invoice_number, student_name, title, total_amount, paid_amount, school_id) VALUES "
  + "('f-a1','INV-2026/001','A Student','Term 1',1000,0,'school-A'),"
  + "('f-b1','INV-2026/001','B Student','Term 1',1000,0,'school-B')"
);
{
  const rows = wranglerSql(
    "SELECT school_id FROM fee_invoices WHERE invoice_number = 'INV-2026/001' ORDER BY school_id"
  );
  check(
    'two schools can both issue invoice INV-2026/001 (global UNIQUE removed)',
    rows.length === 2,
    'got ' + rows.length + ' rows'
  );

  const err = wranglerSqlFails(
    "INSERT INTO fee_invoices (id, invoice_number, student_name, title, total_amount, paid_amount, school_id) "
    + "VALUES ('f-a2','INV-2026/001','Dup','Term 1',1000,0,'school-A')"
  );
  check('the SAME school still cannot duplicate its invoice_number', !!err, 'error=' + err);
}

// 3. system_users.email must STAY globally unique
{
  wranglerSql(
    "INSERT INTO system_users (id, username, full_name, email, phone, role, designation, school_id) "
    + "VALUES ('u-a1','a1','A Director','shared@example.com','9','Director','Director','school-A')"
  );
  const err = wranglerSqlFails(
    "INSERT INTO system_users (id, username, full_name, email, phone, role, designation, school_id) "
    + "VALUES ('u-b1','b1','B Director','shared@example.com','9','Director','Director','school-B')"
  );
  check(
    'system_users.email is STILL globally unique (login resolves by email with no tenant filter)',
    !!err,
    'error=' + err
  );
}

// 4. payment_ledger dedupes a payment id
{
  wranglerSql(
    "INSERT INTO payment_ledger (payment_id, school_id, kind, reference_id, amount_inr) "
    + "VALUES ('pay_dup_1','school-A','student_fee','f-a1',1000)"
  );
  const err = wranglerSqlFails(
    "INSERT INTO payment_ledger (payment_id, school_id, kind, reference_id, amount_inr) "
    + "VALUES ('pay_dup_1','school-A','student_fee','f-a1',1000)"
  );
  check('payment_ledger rejects a second claim for the same payment_id', !!err, 'error=' + err);

  const rows = wranglerSql("SELECT payment_id FROM payment_ledger WHERE payment_id = 'pay_dup_1'");
  check('payment_ledger retained exactly one row', rows.length === 1);
}

// 5. Static assertions on the webhook
{
  const wh = codeOf('api/webhooks/index.ts');

  // The bug: a single `catch` around the event-log insert returned 200 for ANY
  // error and called it a duplicate, so a transient D1 failure permanently
  // discarded a captured payment while telling Razorpay not to retry.
  check('webhook only treats a UNIQUE violation as a duplicate', /isUniqueViolation/.test(wh));
  check(
    'a non-duplicate log failure returns 500 so Razorpay retries',
    /not a duplicate[\s\S]{0,300}?500/.test(wh)
  );
  check(
    'webhook uses the Razorpay X-Razorpay-Event-Id header for delivery idempotency',
    /X-Razorpay-Event-Id/.test(wh)
  );
  check('webhook claims the payment in payment_ledger before applying side effects', /claimPayment/.test(wh));
  check('a failed claim is released so a retry can re-process', /releasePaymentClaim/.test(wh));
  check('payment.failed cannot overwrite an already-Paid invoice', /payment_status != 'Paid'/.test(wh));
  check(
    'subscription lifecycle events are matched on razorpay_subscription_id',
    /WHERE school_id = \? AND razorpay_subscription_id = \?/.test(wh)
  );
  check(
    'a subscription event with no id is refused rather than applied by school_id alone',
    /if \(!schoolId \|\| !razorpaySubscriptionId\) return 0/.test(wh)
  );

  // 6. Static assertions on activation
  const act = codeOf('api/lib/billing-activation.ts');
  // The bug: the synthesized invoice was INSERTed with payment_status='Paid',
  // so the immediately following conditional UPDATE
  // (`WHERE ... payment_status != 'Paid'`) matched zero rows and the function
  // returned alreadyPaid -- charging the school and never activating the plan.
  check(
    'synthesized invoice is inserted as Processing, never as already Paid',
    /Processing/.test(act) && !/total, 'Paid'/.test(act)
  );
  check(
    'activation sets the paid service period',
    /period_start=\?/.test(act) && /period_end=\?/.test(act) && /next_billing_date=\?/.test(act)
  );
  // The bug: subtotal was the amount actually PAID (already GST inclusive) and
  // GST was then added on top, overstating the fallback invoice by 18%.
  check(
    'fallback invoice derives subtotal from the plan price, not the paid amount',
    /const price = priceForPlan\(plan, billingCycle\)/.test(act)
  );
  check('a failed invoice update is no longer swallowed', /invoice update failed/.test(act));

  const fee = codeOf('api/lib/fee-payment.ts');
  check('fee activation uses a compare-and-swap update', /AND paid_amount = \?/.test(fee));
  check(
    'fee activation re-reads tenant-scoped',
    /FROM fee_invoices WHERE id = \? AND school_id = \?/.test(fee)
  );

  // 7. The two non-existent-column bugs
  const notify = codeOf('api/lib/fee-notify.ts');
  check('fee receipt no longer selects the non-existent full_name column', !/full_name/.test(notify));
  check('fee receipt selects the real student name columns', /first_name/.test(notify) && /last_name/.test(notify));

  const ai = codeOf('api/ai/index.ts');
  check('AI no longer queries the non-existent auth_users table', !/FROM auth_users/.test(ai));
  check('AI uses system_users with a real status column', /FROM system_users/.test(ai) && /status = 'Active'/.test(ai));

  // 8. Recurring subscription guards
  const bill = codeOf('api/billing/index.ts');
  check('totalCycles is clamped to the cycle length', /Math\.min\([\s\S]{0,120}cyclesPerYear/.test(bill));
  check('a second live auto-debit mandate is refused', /ALREADY_SUBSCRIBED/.test(bill));
  check(
    'a failed local subscription write is surfaced, not swallowed',
    /LOCAL_PERSIST_FAILED/.test(bill)
  );
  check('cancel-at-cycle-end is recorded instead of falsely marking Canceled', /cancel_at_cycle_end = \?/.test(bill));

  // 9. No production DDL at request time
  {
    let ddl = [];
    const apiDir = path.join(REPO, 'api');
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith('.ts')) {
          if (/prepare\(\s*['"\`]CREATE TABLE/.test(fs.readFileSync(p, 'utf-8'))) ddl.push(path.relative(REPO, p));
        }
      }
    };
    walk(apiDir);
    check('no API route executes CREATE TABLE at request time', ddl.length === 0, 'offenders: ' + ddl.join(', '));
  }

  // 10. The Cloudflare Email binding must exist on the dedicated + admin configs
  {
    const gen = fs.readFileSync(path.join(REPO, 'scripts/generate-school-configs.mjs'), 'utf-8');
    const admin = fs.readFileSync(path.join(REPO, 'wrangler.admin.toml'), 'utf-8');
    const plat = fs.readFileSync(path.join(REPO, 'wrangler.toml'), 'utf-8');
    check('dedicated worker configs declare the SEND_EMAIL binding', /\[\[send_email\]\]/.test(gen) && /SEND_EMAIL/.test(gen));
    check('admin worker config declares the SEND_EMAIL binding', /\[\[send_email\]\]/.test(admin));
    check('platform worker config already declares the SEND_EMAIL binding', /\[\[send_email\]\]/.test(plat));
  }
}

// 11. No migration file may contain a transaction/pragma keyword ANYWHERE
{
  const dir = path.join(REPO, 'db_migrations');
  const bad = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql'))) {
    const src = fs.readFileSync(path.join(dir, f), 'utf-8');
    for (const kw of ['BEGIN', 'COMMIT', 'ROLLBACK', 'SAVEPOINT', 'PRAGMA']) {
      if (new RegExp('\\b' + kw + '\\b', 'i').test(src)) bad.push(f + ' (' + kw + ')');
    }
  }
  check(
    'no migration contains a transaction/pragma keyword anywhere, including comments',
    bad.length === 0,
    'offenders: ' + bad.join(', ')
  );
}

// Report
for (const r of results) console.log((r.ok ? '  PASS  ' : '  FAIL  ') + r.name);
console.log('');
if (failures > 0) {
  console.error('FAILED: ' + failures + ' of ' + results.length + ' checks failed\n');
  process.exit(1);
}
console.log('All ' + results.length + ' Phase 2 money-integrity checks passed.\n');
