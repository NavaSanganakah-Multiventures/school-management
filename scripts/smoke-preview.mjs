// scripts/smoke-preview.mjs
// Runs the Phase 0/1/2 endpoint smoke tests against a deployed worker URL.
//
// The same assertions run inside .github/workflows/deploy-preview.yml, but this
// script can be pointed at ANY deployed URL from a terminal, which is how a
// worker gets re-checked after a fix without re-running a deploy.
//
// Usage: node scripts/smoke-preview.mjs https://host.workers.dev
//
// IMPLEMENTATION NOTE
//
// curl is invoked with execFileSync and an ARGS ARRAY, never by joining a shell
// command string. An earlier version built the command by concatenating quoted
// arguments, which CodeQL correctly flagged as indirect command injection
// (js/indirect-command-line-injection) plus incomplete sanitization: a URL or
// probe description containing a shell metacharacter would have been executed.
// Passing arguments as an array means no shell is involved at all.

import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const URL = (process.argv[2] || 'https://school-management-preview.nssite.workers.dev').replace(/\/+$/, '');

// A unique per-run directory rather than a fixed filename. A predictable path in
// the shared temp directory is vulnerable to a symlink planted by another local
// user, which would let that user read or corrupt the response bodies captured
// here (CodeQL js/insecure-temporary-file).
const WORK_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-preview-'));
const BODY_FILE = path.join(WORK_DIR, 'body.tmp');

let failed = 0;
const rows = [];

function record(ok, desc, path_, code, note) {
  if (!ok) failed++;
  rows.push(
    (ok ? '  PASS  ' : '  FAIL  ') + desc.padEnd(42) + path_ + '  -> ' + code
    + (ok ? '' : '  ' + note),
  );
}

// Single HTTP helper for every probe below.
function curl(method, path_, headers) {
  const args = [
    '-sS', '-o', BODY_FILE, '-w', '%{http_code}',
    '--connect-timeout', '10', '--max-time', '25',
    '-X', method,
  ];
  for (const h of headers || []) args.push('-H', h);
  if (method === 'POST') args.push('-H', 'Content-Type: application/json', '-d', '{}');
  args.push(URL + path_);

  let code = '000000';
  let detail = '';
  try {
    code = execFileSync('curl', args, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    code = String((e && e.status) || '000000');
    detail = String((e && e.stderr) || '').slice(0, 200);
  }
  return { code, detail };
}

// Asserts one exact status code.
function expectStatus(desc, expected, path_, method = 'GET', headers = []) {
  const r = curl(method, path_, headers);
  let note = '(expected ' + expected + ') ' + r.detail;
  // A 503 on bootstrap means the environment is missing the secret, so the gate
  // returns before the comparison runs. That is an environment problem, not a
  // code problem, and the two need different fixes, so say which it is.
  if (r.code === '503' && path_ === '/api/admin/bootstrap') {
    note = '(expected ' + expected + ') PLATFORM_BOOTSTRAP_TOKEN is not configured here, '
      + 'so the gate returns 503 without running the comparison. ' + note;
  }
  record(r.code === String(expected), desc, path_, r.code, note);
}

// Asserts the response is any of a set of refusals. Used where the correct code
// depends on whether a secret is configured in the target environment, but the
// property that matters - this endpoint never acts on an unauthenticated caller
// - holds either way.
function expectRefusal(desc, path_, method = 'GET', allowed = ['400', '401', '403', '500', '503']) {
  const r = curl(method, path_);
  record(
    allowed.indexOf(r.code) !== -1,
    desc, path_, r.code,
    '(expected one of ' + allowed.join('/') + ') ' + r.detail,
  );
}

console.log('\nSmoke testing ' + URL + '\n');

// ---- public -----------------------------------------------------------------
expectStatus('health endpoint', 200, '/api/health');
// Registered as `configApp.get('/')` and mounted at /api/config, so the path has
// no trailing slash.
expectStatus('public config', 200, '/api/config');

// A dedicated school worker and the platform worker are different targets, not
// different versions of the same one, and a few probes have a different correct
// answer on each. /api/config reports which one this is.
//
// The distinction matters for /api/admin/*: a dedicated worker refuses the whole
// admin surface at the routing layer, so those requests never reach the handler
// and the per-endpoint token gate is not what answers them. A probe written only
// for the platform would then report a false failure against a perfectly correct
// school worker, and someone chasing it might be tempted to weaken the platform
// gate to satisfy the test.
const IS_DEDICATED = (() => {
  try {
    return JSON.parse(fs.readFileSync(BODY_FILE, 'utf-8')).isDedicated === true;
  } catch (_) {
    return false;
  }
})();
console.log('  target: ' + (IS_DEDICATED ? 'dedicated school worker' : 'platform / shared worker') + '\n');

// ---- Phase 0 ----------------------------------------------------------------
// 503 is the intended fail-closed answer when PLATFORM_BOOTSTRAP_TOKEN is unset;
// 401 is the answer when it is set. Both refuse, so either proves the gate is
// closed.
expectRefusal('bootstrap never runs unauthenticated', '/api/admin/bootstrap', 'POST');

// A WRONG token must produce exactly 401, never 500.
//
// This is deliberately stricter than the probe above and is the check that
// catches a broken constant-time comparison. api/lib/constant-time.ts once
// imported an HMAC key with usages ['verify'] and then called sign() with it,
// which WebCrypto rejects with InvalidAccessError. The helper threw on every
// call, so the endpoint answered 500 for every token including a correct one,
// and the Phase 0 deploy failed at the Super Admin bootstrap step.
//
// A "the endpoint refuses" assertion cannot see that difference, because 500 is
// also a refusal. Asserting the specific status does see it, and 500 is never
// correct here: it means the gate itself is broken, not that the caller was
// denied.
//
// On a dedicated worker 403 is the correct answer instead, because the admin
// router rejects the request before the token gate runs. Skipping it there is
// deliberate: the platform worker is where that gate has to be proven.
if (IS_DEDICATED) {
  console.log('  SKIP  bootstrap wrong-token gate (admin surface is refused at the routing layer here)');
} else {
  expectStatus(
    'bootstrap rejects a wrong token with 401', 401,
    '/api/admin/bootstrap', 'POST',
    ['X-Bootstrap-Token: definitely-not-the-real-token-0000'],
  );
}

// ---- Phase 1 ----------------------------------------------------------------
// These reads used to answer with no session at all, or with any role.
expectRefusal('students list requires auth', '/api/students');
expectRefusal('staff list requires auth', '/api/staff');
expectRefusal('fees list requires auth', '/api/fees');
expectRefusal('student history requires auth', '/api/students/std-1/history');
expectRefusal('notification topics require auth', '/api/notifications/topics');
expectRefusal('leave list requires auth', '/api/leave-applications');
expectRefusal('attendance register requires auth', '/api/attendance');
expectRefusal('activity logs require auth', '/api/activity-logs');
expectRefusal('lms courses require auth', '/api/lms/courses');
expectRefusal('exams list requires auth', '/api/exams');
// /api/notifications has no GET "/" handler, so probing it would assert a 404
// and tell us nothing. These are its real read routes.
expectRefusal('notification history requires auth', '/api/notifications/history');
expectRefusal('registered devices requires auth', '/api/notifications/devices');
expectRefusal('notices requires auth', '/api/notices');

// ---- Phase 1 + 2 ------------------------------------------------------------
// Money endpoints must be auth-gated, never open.
expectRefusal('fee pay requires auth', '/api/fees/pay', 'POST');
expectRefusal('fee create-bulk requires auth', '/api/fees/create-bulk', 'POST');
expectRefusal('fee create-invoice requires auth', '/api/fees/create-invoice', 'POST');
expectRefusal('recurring subscribe requires auth', '/api/billing/subscribe-recurring', 'POST');

// Super Admin surface must be refused to a non-SuperAdmin caller.
expectStatus('admin schools requires superadmin', 403, '/api/admin/schools');

// ---- Phase 2 ----------------------------------------------------------------
// When RAZORPAY_WEBHOOK_SECRET is absent the handler refuses earlier with 500
// instead of reaching signature verification. Both are refusals, so this asserts
// "never accepts" rather than pinning one status.
expectRefusal('razorpay webhook rejects unsigned', '/api/webhooks/razorpay', 'POST');

console.log(rows.join('\n') + '\n');

fs.rmSync(WORK_DIR, { recursive: true, force: true });

if (failed > 0) {
  console.error('FAILED: ' + failed + ' of ' + rows.length + ' smoke probes failed\n');
  process.exit(1);
}
console.log('All ' + rows.length + ' smoke probes passed.\n');
