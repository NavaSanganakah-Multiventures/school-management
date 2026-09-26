// scripts/smoke-preview.mjs
// Runs the Phase 0/1/2 endpoint smoke tests against a deployed worker URL.
//
// The same assertions run inside .github/workflows/deploy-preview.yml, but this
// script can be pointed at ANY deployed URL from a terminal, which is how the
// preview worker gets re-checked after a fix without re-running a deploy.
//
// Usage: node scripts/smoke-preview.mjs https://host.workers.dev

import { execSync } from 'child_process';
import os from 'os';
import path from 'path';

const URL = (process.argv[2] || 'https://school-management-preview.nssite.workers.dev').replace(/\/+$/, '');

// curl's -o target must be a real writable path: /dev/null does not exist on
// Windows, and passing it makes curl abort with "client returned ERROR on
// write" (exit 23) before any status code is read.
const BODY_FILE = path.join(os.tmpdir(), 'smoke-preview-body.tmp');

let failed = 0;
const rows = [];

function probe(desc, expected, path, method = 'GET') {
  let code = '000000';
  let body = '';
  try {
    const args = [
      '-sS', '-o', BODY_FILE, '-w', '%{http_code}',
      '--connect-timeout', '10', '--max-time', '25',
      '-X', method,
    ];
    if (method === 'POST') {
      args.push('-H', 'Content-Type: application/json', '-d', '{}');
    }
    args.push(URL + path);
    code = execSync('curl ' + args.map((a) => '"' + a.replace(/"/g, '\\"') + '"').join(' '), {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch (e) {
    code = String((e && e.status) || '000000');
    body = String((e && e.stderr) || '').slice(0, 200);
  }
  const ok = code === String(expected);
  if (!ok) failed++;
  rows.push((ok ? '  PASS  ' : '  FAIL  ') + desc.padEnd(42) + path + '  -> ' + code + (ok ? '' : ' (expected ' + expected + ') ' + body));
}

// Asserts an exact status while sending extra request headers.
//
// Needed because "the gate refuses" and "the gate is wired up" are different
// properties, and only the second one can catch a comparison helper that throws.
// See the X-Bootstrap-Token probe below.
function probeWithHeaders(desc, expected, path, method, headers) {
  let code = '000000';
  let body = '';
  try {
    const args = [
      '-sS', '-o', BODY_FILE, '-w', '%{http_code}',
      '--connect-timeout', '10', '--max-time', '25',
      '-X', method,
    ];
    for (const h of headers) args.push('-H', h);
    if (method === 'POST') {
      args.push('-H', 'Content-Type: application/json', '-d', '{}');
    }
    args.push(URL + path);
    code = execSync('curl ' + args.map((a) => '"' + a.replace(/"/g, '\\"') + '"').join(' '), {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch (e) {
    code = String((e && e.status) || '000000');
    body = String((e && e.stderr) || '').slice(0, 200);
  }
  const ok = code === String(expected);
  if (!ok) failed++;
  let note = '';
  if (!ok && code === '503' && path === '/api/admin/bootstrap') {
    note = ' -- PLATFORM_BOOTSTRAP_TOKEN is not configured in this environment, '
      + 'so the gate returns 503 without ever running the comparison. This probe '
      + 'cannot pass until the secret is set here.';
  }
  rows.push((ok ? '  PASS  ' : '  FAIL  ') + desc.padEnd(42) + path + '  -> ' + code
    + (ok ? '' : ' (expected ' + expected + ')' + note + ' ' + body));
}

// Asserts the response is NOT a success. Used where the correct status depends
// on whether a given secret is configured in the target environment, but the
// security property ("this endpoint never acts on an unauthenticated caller")
// holds either way.
function probeNotSuccess(desc, path, method = 'GET', reject = ['400', '401', '403', '500', '503']) {
  let code = '000000';
  let body = '';
  try {
    const args = [
      '-sS', '-o', BODY_FILE, '-w', '%{http_code}',
      '--connect-timeout', '10', '--max-time', '25',
      '-X', method,
    ];
    if (method === 'POST') {
      args.push('-H', 'Content-Type: application/json', '-d', '{}');
    }
    args.push(URL + path);
    code = execSync('curl ' + args.map((a) => '"' + a.replace(/"/g, '\\"') + '"').join(' '), {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch (e) {
    code = String((e && e.status) || '000000');
    body = String((e && e.stderr) || '').slice(0, 200);
  }
  const ok = reject.indexOf(code) !== -1;
  if (!ok) failed++;
  rows.push((ok ? '  PASS  ' : '  FAIL  ') + desc.padEnd(42) + path + '  -> ' + code + (ok ? '' : ' (expected one of ' + reject.join('/') + ') ' + body));
}

console.log('\nSmoke testing ' + URL + '\n');

// Public endpoints
probe('health endpoint', 200, '/api/health');
// The route is registered as `configApp.get('/')` and mounted at /api/config,
// so the path has no trailing slash.
probe('public config', 200, '/api/config');

// Phase 0: the bootstrap endpoint must never act on an unauthenticated caller.
// 503 is the intended fail-closed answer when PLATFORM_BOOTSTRAP_TOKEN is not
// configured; 401 is the answer when it is. Either proves the gate is closed.
probeNotSuccess('bootstrap never runs unauthenticated', '/api/admin/bootstrap', 'POST');

// A WRONG token must produce exactly 401, never 500.
//
// This is deliberately stricter than the probe above and is the check that
// catches a broken constant-time comparison. api/lib/constant-time.ts once
// imported an HMAC key with usages ['verify'] and then called sign() with it,
// which WebCrypto rejects with InvalidAccessError. Because the helper threw on
// every call, the endpoint answered 500 for every token, including a correct
// one, and the Phase 0 deploy failed at the Super Admin bootstrap step.
//
// A "refuses the request" assertion cannot see that difference, since 500 is
// also a refusal. Asserting the specific status does see it, and 500 is never
// the right answer here: it means the gate itself is broken, not that the
// caller was denied.
probeWithHeaders(
  'bootstrap rejects a wrong token with 401', 401,
  '/api/admin/bootstrap', 'POST',
  ['X-Bootstrap-Token: definitely-not-the-real-token-0000'],
);

// Phase 1: these reads used to answer with no session at all, or with any role.
probe('students list requires auth', 401, '/api/students');
probe('staff list requires auth', 401, '/api/staff');
probe('fees list requires auth', 401, '/api/fees');
probe('student history requires auth', 401, '/api/students/std-1/history');
probe('notification topics require auth', 401, '/api/notifications/topics');
probe('leave list requires auth', 401, '/api/leave-applications');
probe('attendance register requires auth', 401, '/api/attendance');
probe('activity logs require auth', 401, '/api/activity-logs');
probe('lms courses require auth', 401, '/api/lms/courses');
probe('exams list requires auth', 401, '/api/exams');

// Phase 1 + 2: money endpoints must be auth-gated, never open.
probe('fee pay requires auth', 401, '/api/fees/pay', 'POST');
probe('fee create-bulk requires auth', 401, '/api/fees/create-bulk', 'POST');
probe('fee create-invoice requires auth', 401, '/api/fees/create-invoice', 'POST');
probe('recurring subscribe requires auth', 401, '/api/billing/subscribe-recurring', 'POST');
probe('admin schools requires superadmin', 403, '/api/admin/schools');

// Phase 2: the webhook must reject an unsigned body.
// Phase 2: when RAZORPAY_WEBHOOK_SECRET is absent the handler refuses earlier
// with 500 instead of reaching signature verification. Both are refusals, so
// this asserts "never accepts" rather than pinning one status code.
probeNotSuccess('razorpay webhook rejects unsigned', '/api/webhooks/razorpay', 'POST');

console.log(rows.join('\n'));
console.log('');
if (failed > 0) {
  console.error('FAILED: ' + failed + ' of ' + rows.length + ' smoke probes failed\n');
  process.exit(1);
}
console.log('All ' + rows.length + ' smoke probes passed.\n');
