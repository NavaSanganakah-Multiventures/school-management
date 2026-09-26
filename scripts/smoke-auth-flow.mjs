// scripts/smoke-auth-flow.mjs
// End-to-end check that the Phase 1 RBAC guards did NOT break legitimate use.
//
// A smoke test that only asserts "401 without a token" proves the doors are
// locked, but not that a real Director can still walk through them. This
// registers a throwaway school on the target environment, logs in as its
// Director, and then asserts the management-gated routes still work for that
// role.
//
// DANGER: this creates a real tenant. It is safe against the preview
// environment (own empty D1) and must NOT be run against production.
//
// Usage: node scripts/smoke-auth-flow.mjs https://host.workers.dev

import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

// The URL is required, with no default. Previews are branch-named deployments of
// the production worker, so there is no single fixed URL; a hardcoded default
// would point at the deleted `school-management-preview` worker.
const URL = String(process.argv[2] || '').replace(/\/+$/, '');
if (!URL) {
  console.error(
    '\nUsage: node scripts/smoke-auth-flow.mjs <preview-url>\n'
    + 'Get it from the "Deploy Preview" workflow summary on the branch.\n',
  );
  process.exit(2);
}

// A unique per-run directory rather than fixed filenames in the shared temp
// directory. A predictable path there is vulnerable to a symlink planted by
// another local user, who could then read or corrupt the request/response
// bodies written here (CodeQL js/insecure-temporary-file). These bodies include
// a session token, so the exposure is not merely theoretical.
const WORK_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-auth-'));
const BODY_FILE = path.join(WORK_DIR, 'body.tmp');
const REQ_FILE = path.join(WORK_DIR, 'req.tmp');

// This script has several early-exit paths, so clean up on every exit rather
// than trying not to miss one.
process.on('exit', () => {
  try { fs.rmSync(WORK_DIR, { recursive: true, force: true }); } catch (_) { /* best effort */ }
});

let failed = 0;
function report(ok, label, detail) {
  if (!ok) failed++;
  console.log((ok ? '  PASS  ' : '  FAIL  ') + label.padEnd(50) + (detail || ''));
}

// The request body is written to a file and sent with --data-binary. Passing
// JSON inline through a shell mangles quoting on Windows, which produced a
// misleading "field required" response from /api/auth/register.
function curl(method, urlPath, { token, body } = {}) {
  const args = [
    '-sS', '-o', BODY_FILE, '-w', '%{http_code}',
    '--connect-timeout', '10', '--max-time', '90',
    '-X', method,
  ];
  if (token) args.push('-H', 'Authorization: Bearer ' + token);
  if (body !== undefined) {
    fs.writeFileSync(REQ_FILE, body, 'utf-8');
    args.push('-H', 'Content-Type: application/json', '--data-binary', '@' + REQ_FILE);
  }
  args.push(URL + urlPath);

  let code = '000000';
  let text = '';
  try {
    code = execFileSync('curl', args, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    text = fs.readFileSync(BODY_FILE, 'utf-8');
  } catch (e) {
    code = String((e && e.status) || '000000');
    text = String((e && e.stdout) || '') || String((e && e.stderr) || '');
  }
  let json = null;
  try { json = JSON.parse(text); } catch (_) { /* not JSON */ }
  return { code, text, json };
}

const stamp = Date.now().toString(36);
const email = `rbac-smoke-${stamp}@example.com`;
const password = 'SmokeTest' + stamp + 'a1';

console.log('\nAuth-flow smoke test against ' + URL);
console.log('  throwaway school email: ' + email + '\n');

const reg = curl('POST', '/api/auth/register', {
  body: JSON.stringify({
    schoolName: 'RBAC Smoke ' + stamp,
    directorName: 'Smoke Director',
    email,
    phone: '9000000000',
    password,
    address: 'Test Lane',
    city: 'Testville',
    state: 'Uttar Pradesh',
    pincode: '000000',
  }),
});
report(reg.code === '200' || reg.code === '201', 'register a throwaway school', '-> ' + reg.code);
if (!reg.json || !reg.json.success) {
  console.log('        ' + String(reg.text).slice(0, 300));
  console.error('\nFAILED: registration did not succeed, cannot continue\n');
  process.exit(1);
}

const login = curl('POST', '/api/auth/login', {
  body: JSON.stringify({ email, password }),
});
const token = login.json && login.json.token;
report(!!token, 'Director can log in', '-> ' + login.code);
if (!token) {
  console.log('        ' + String(login.text).slice(0, 300));
  console.error('\nFAILED: cannot continue without a session token\n');
  process.exit(1);
}
console.log('        role=' + (login.json.user && login.json.user.role)
  + ' schoolId=' + (login.json.user && login.json.user.schoolId) + '\n');

// A Director must still be able to read the screens they work in.
for (const urlPath of [
  '/api/students', '/api/staff', '/api/fees', '/api/attendance',
  '/api/exams', '/api/notices', '/api/leave-applications',
  '/api/notifications/topics', '/api/activity-logs', '/api/classes',
]) {
  const r = curl('GET', urlPath, { token });
  report(r.code === '200', 'Director can GET ' + urlPath, '-> ' + r.code);
}

// The mutating routes Phase 1 restricted must NOT refuse this Director.
// An incomplete payload yields 400/404 from validation, which still proves the
// role gate let the request through; a 403 would mean the guard is too strict.
for (const [urlPath, payload] of [
  ['/api/fees/pay', { invoiceId: 'does-not-exist' }],
  ['/api/fees/create-invoice', { studentName: 'X', title: 'T', totalAmount: 100 }],
  ['/api/fees/create-bulk', { className: 'Class 1', title: 'T', totalAmount: 100 }],
  ['/api/students', {}],
  ['/api/notices', {}],
  ['/api/exams', {}],
  ['/api/exams/marks', { examId: 'e', studentId: 's', marks: [{ subject: 'Math', marksObtained: 10, maxMarks: 100 }] }],
]) {
  const r = curl('POST', urlPath, { token, body: JSON.stringify(payload) });
  const blocked = r.code === '403' || r.code === '401';
  report(!blocked, 'Director not role-blocked on POST ' + urlPath, '-> ' + r.code);
}

// A tampered token must still be refused.
const bad = curl('GET', '/api/students', { token: token.slice(0, -3) + 'aaa' });
report(bad.code === '401', 'tampered session token is refused', '-> ' + bad.code);

console.log('');
if (failed > 0) {
  console.error('FAILED: ' + failed + ' probe(s) failed\n');
  process.exit(1);
}
console.log('All auth-flow probes passed. RBAC guards did not break Director access.\n');
