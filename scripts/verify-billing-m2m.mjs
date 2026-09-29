// Verifies the billing M2M path: the real dedicated-worker proxy in api/index.ts and
// the real platform billing routes, running in-process against the actual TypeScript
// modules (transpiled to CJS) and the actual WebCrypto HMAC.
//
// WHY AN INTEGRATION TEST AND NOT A SOURCE-SCAN
//
// This is an authorisation boundary. A source-scan can tell you the right words are
// present; it cannot tell you that a forged request is actually refused. Two earlier
// attempts at cheap harnesses in this repo passed while the code was wrong, and one
// tested a hand-written copy of a function instead of the real one. So this harness
// loads the real app, signs real requests, and asserts on real responses.
//
// WHAT IT COVERS
//
//   Part A - the dedicated worker (api/index.ts). Proves the proxy authenticates as
//            the WORKER: it forwards no user credential, it signs with the internal
//            secret, and the acting role it forwards is the one it verified locally
//            rather than one the caller chose.
//   Part B - the platform (api/billing). Proves a correctly signed request is
//            served for the school named in the signed path, and that every way of
//            asserting a scope without proving you hold the secret is refused,
//            including role escalation to SuperAdmin.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const OUT = path.join(ROOT, '.tmp-apitest');
const TSCONFIG = path.join(ROOT, 'tsconfig.apitest.json');

// 32+ characters: api/lib/auth.ts refuses anything shorter, and the harness should
// not weaken a real check to make itself convenient.
const PLATFORM_SECRET = 'fleet-internal-secret-0123456789abcdef';
const PLATFORM_AUTH_SECRET = 'platform-auth-secret-0123456789abcdef';
const DEDICATED_AUTH_SECRET = 'dedicated-auth-secret-0123456789abcdef';
const SCHOOL_ID = 'school-under-test';
const OTHER_SCHOOL_ID = 'school-victim';

let passed = 0;
let failed = 0;

function check(name, condition, detail) {
  if (condition) {
    passed++;
    console.log('  PASS  ' + name);
  } else {
    failed++;
    console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : ''));
  }
}

function section(title) {
  console.log('\n' + title);
}

// ---------------------------------------------------------------------------
// Compile the real API to CommonJS so Node can require it.
// ---------------------------------------------------------------------------

section('transpiling the real api/ tree');
if (!fs.existsSync(TSCONFIG)) {
  console.error('missing ' + TSCONFIG);
  process.exit(1);
}
fs.rmSync(OUT, { recursive: true, force: true });

// The TypeScript compiler API, in-process. Not a subprocess: `npx` on Windows is a
// .cmd shim and EINVALs under execFileSync, and shelling out would also make this
// harness depend on a working PATH.
const ts = (await import('typescript')).default;
const parsed = ts.getParsedCommandLineOfConfigFile(TSCONFIG, {}, {
  ...ts.sys,
  onUnRecoverableConfigFileDiagnostic: (d) => {
    console.error('tsconfig error: ' + ts.flattenDiagnosticMessageText(d.messageText, '\n'));
  },
});
const program = ts.createProgram(parsed.fileNames, {
  ...parsed.options,
  noEmit: false,
  outDir: OUT,
  module: ts.ModuleKind.CommonJS,
  moduleResolution: ts.ModuleResolutionKind.Node10,
  isolatedModules: false,
  incremental: false,
  plugins: [],
});
const emitResult = program.emit();
const emitDiags = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);
const fatal = emitDiags.filter((d) => d.category === ts.DiagnosticCategory.Error);
if (fatal.length) {
  console.error('transpile produced ' + fatal.length + ' error(s):');
  for (const d of fatal.slice(0, 8)) {
    console.error('  ' + ts.flattenDiagnosticMessageText(d.messageText, ' '));
  }
  process.exit(1);
}
console.log('  ok    api/ -> .tmp-apitest (commonjs)');

const appMod = require(path.join(OUT, 'index.js'));
const app = (appMod.default && appMod.default.request) ? appMod.default : (appMod.app || appMod);
const authLib = require(path.join(OUT, 'lib', 'auth.js'));
const internalAuth = require(path.join(OUT, 'lib', 'internal-request-auth.js'));

// ---------------------------------------------------------------------------
// A minimal D1 stand-in. Only the reads /api/billing/subscription performs are
// answered with real rows; anything else comes back empty, which is enough because
// the assertions are about WHO the request is scoped to, not about plan maths.
// ---------------------------------------------------------------------------

function fakeDb() {
  return {
    prepare(sql) {
      let bound = [];
      const s = {
        sql,
        bind(...args) {
          bound = args;
          return s;
        },
        async first() {
          if (/school_subscriptions/i.test(sql)) {
            return { id: 'sub-1', school_id: SCHOOL_ID, plan_id: 'basic', status: 'Trial' };
          }
          if (/school_tenants/i.test(sql)) {
            return { id: SCHOOL_ID, school_name: 'Test School', plan_id: 'basic' };
          }
          // The account-status check getAuthUser runs on every authenticated
          // request. Without this the stand-in models a user with a valid token
          // and no row in the database, which the real code treats as a deleted
          // account and refuses.
          if (/FROM system_users/i.test(sql) || /FROM platform_admins/i.test(sql)) {
            return { id: bound[0], status: 'Active' };
          }
          return null;
        },
        async all() {
          return { results: [] };
        },
        async run() {
          return { success: true };
        },
      };
      return s;
    },
    async batch(stmts) {
      return Promise.all(stmts.map((s) => s.run()));
    },
    async exec() {
      return { count: 0, duration: 0 };
    },
  };
}

const platformEnv = () => ({
  INTERNAL_SYNC_SECRET: PLATFORM_SECRET,
  AUTH_SECRET: PLATFORM_AUTH_SECRET,
  DB: fakeDb(),
});

function signedHeaders(method, urlPath, body) {
  return internalAuth.buildInternalAuthHeaders({
    secret: PLATFORM_SECRET,
    method,
    path: urlPath,
    body: body || '',
  });
}

// ---------------------------------------------------------------------------
// Part A -- the dedicated worker's proxy.
//
// api/index.ts answers /api/billing/* by calling fetch() to the platform, so the
// test intercepts globalThis.fetch and inspects what it was asked to send.
// ---------------------------------------------------------------------------

section('Part A -- dedicated worker proxy (api/index.ts)');

const dedicatedEnv = {
  SCHOOL_ID: SCHOOL_ID,
  IS_DEDICATED_WORKER: 'true',
  INTERNAL_SYNC_SECRET: PLATFORM_SECRET,
  AUTH_SECRET: DEDICATED_AUTH_SECRET,
  DB: fakeDb(),
};

// A real Director token for this worker, signed with the worker's own AUTH_SECRET.
const directorToken = await authLib.signToken(
  { env: dedicatedEnv },
  // `sub`, not `userId`: that is what api/auth/index.ts actually puts in a real
  // session token, and getAuthUser now resolves the account by `sub` to check
  // that it is still Active. Tokens minted with `userId` and no `sub` were
  // silently exempt from that check, which is how this harness reported 59/59
  // green while proving nothing about a deactivation control.
  { sub: 'u-director', userId: 'u-director', email: 'director@test.school', role: 'Director', schoolId: SCHOOL_ID },
);

let capturedRequest = null;
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  capturedRequest = init && init.headers ? new Request(input, init) : new Request(input);
  return new Response(JSON.stringify({ success: true, captured: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

try {
  const res = await app.request(
    '/api/billing/subscription',
    { headers: { Authorization: 'Bearer ' + directorToken } },
    dedicatedEnv,
  );
  check('proxy responds 200 (it reached the platform fetch stub)', res.status === 200, 'got ' + res.status);
} finally {
  globalThis.fetch = realFetch;
}

check('proxy actually issued an outbound request', !!capturedRequest);
if (capturedRequest) {
  const h = capturedRequest.headers;
  check(
    'outbound host is the platform, not the school',
    capturedRequest.url.includes('pragnya.nasven.com'),
    capturedRequest.url,
  );
  check(
    'school id is inside the SIGNED path',
    capturedRequest.url.includes('/api/internal/' + encodeURIComponent(SCHOOL_ID) + '/api/billing/'),
    capturedRequest.url,
  );
  check(
    'no user credential is forwarded',
    !h.get('Authorization'),
    'Authorization: ' + h.get('Authorization'),
  );
  check('M2M secret header is set', h.get('X-Internal-Secret') === PLATFORM_SECRET, h.get('X-Internal-Secret'));
  check('M2M signature header is set', !!h.get('X-Internal-Signature'));
  check('M2M timestamp header is set', !!h.get('X-Internal-Timestamp'));
  check(
    'acting role is the verified Director role',
    h.get('X-Acting-Role') === 'Director',
    h.get('X-Acting-Role'),
  );
  check(
    'acting email is the verified token email',
    h.get('X-Acting-Email') === 'director@test.school',
    h.get('X-Acting-Email'),
  );
}

// A caller that claims to be SuperAdmin must not be able to choose its own role:
// the proxy overwrites the header from the token it verified.
let escalateCapture = null;
globalThis.fetch = async (input, init) => {
  escalateCapture = init && init.headers ? new Request(input, init) : new Request(input);
  return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
};
try {
  await app.request(
    '/api/billing/subscription',
    {
      headers: {
        Authorization: 'Bearer ' + directorToken,
        'X-Acting-Role': 'SuperAdmin',
        'X-Acting-Email': 'attacker@evil.test',
        'X-Verified-School-Scope': OTHER_SCHOOL_ID,
      },
    },
    dedicatedEnv,
  );
} finally {
  globalThis.fetch = realFetch;
}
check(
  'a caller cannot inject X-Acting-Role (overwritten with the verified role)',
  !!escalateCapture && escalateCapture.headers.get('X-Acting-Role') === 'Director',
  escalateCapture ? escalateCapture.headers.get('X-Acting-Role') : 'no request',
);
check(
  'a caller cannot inject X-Acting-Email (overwritten with the verified email)',
  !!escalateCapture && escalateCapture.headers.get('X-Acting-Email') === 'director@test.school',
  escalateCapture ? escalateCapture.headers.get('X-Acting-Email') : 'no request',
);

// ...but the PUBLIC parts of billing must stay public.
//
// /api/billing/plans and /api/billing/razorpay/config require no authentication --
// the pricing page has to render before anyone logs in, and /api/billing/plans was
// verified returning 200 unauthenticated in production before this change. So the
// proxy must NOT demand a token of its own accord. An earlier draft did, and it
// turned both of these into 401 on every dedicated school, which is a second outage
// of the same shape as the one being fixed here.
//
// The resolution: the proxy forwards an M2M-signed request either way and passes the
// acting role only when it verified a token. The platform remains the single
// authority on who may see what -- a public route needs no role, an authenticated
// route without one is refused there.
let publicCapture = null;
globalThis.fetch = async (input, init) => {
  publicCapture = init && init.headers ? new Request(input, init) : new Request(input);
  return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
};
const publicRes = await app.request('/api/billing/plans', {}, dedicatedEnv);
globalThis.fetch = realFetch;
check('an unauthenticated call to the public pricing route is still proxied, not 401', publicRes.status === 200, 'got ' + publicRes.status);
check(
  'the public pricing request carries no acting role',
  !!publicCapture && !publicCapture.headers.get('X-Acting-Role'),
  publicCapture ? String(publicCapture.headers.get('X-Acting-Role')) : 'no request',
);
check(
  'but it is still M2M signed, so the platform can tell it came from a school',
  !!publicCapture && !!publicCapture.headers.get('X-Internal-Signature'),
);

// A token that is present but WRONG is rejected on the dedicated worker rather than
// forwarded, so a stale token does not turn into a confusing platform-side 401 and a
// pointless outbound call.
let badTokenCapture = null;
globalThis.fetch = async (input, init) => {
  badTokenCapture = init && init.headers ? new Request(input, init) : new Request(input);
  return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
};
const badTokenRes = await app.request(
  '/api/billing/subscription',
  { headers: { Authorization: 'Bearer not.a.real.token' } },
  dedicatedEnv,
);
globalThis.fetch = realFetch;
check('a bogus token is refused on the dedicated worker with 401', badTokenRes.status === 401, 'got ' + badTokenRes.status);
check('and is not forwarded to the platform', badTokenCapture === null);

// A dedicated worker with no SCHOOL_ID must fail loudly, not invent a tenant.
const noSchoolEnv = { ...dedicatedEnv };
delete noSchoolEnv.SCHOOL_ID;
const noSchoolRes = await app.request(
  '/api/billing/subscription',
  { headers: { Authorization: 'Bearer ' + directorToken } },
  noSchoolEnv,
);
check(
  'a dedicated worker without SCHOOL_ID fails with 500 instead of guessing a tenant',
  noSchoolRes.status === 500,
  'got ' + noSchoolRes.status,
);

// The deploy must not quietly put a school back on the platform's shared signing key.
// Asserted as source, and deliberately so: the failure mode is precisely that it
// would not be observable from a request. A shared key still signs and verifies
// correctly -- it just verifies in too many places. Nothing above would notice.
const deploySrc = fs.readFileSync(path.join(ROOT, 'scripts', 'deploy-dedicated.mjs'), 'utf8');
// Any `||` at all on the AUTH_SECRET line is a fallback to the platform key, whatever
// the left-hand side is called. The first version of this check named the old
// variable explicitly, so renaming it to a validated local -- which is what the
// fail-closed guard produced -- silently disarmed the check. The mutation runner
// caught that by failing to apply a mutation, which is the only reason it was noticed.
check(
  'the deploy never falls back to the platform AUTH_SECRET',
  !/AUTH_SECRET:[^\n]*\|\|/.test(deploySrc),
  'found a fallback on the AUTH_SECRET line',
);
check(
  'the AUTH_SECRET written to the worker is the validated per-school value',
  /AUTH_SECRET:\s*perSchoolAuthSecret\s*,/.test(deploySrc),
  'AUTH_SECRET is not the per-school value',
);
check(
  'the deploy fails closed when a school has no AUTH_SECRET of its own',
  /REFUSING TO DEPLOY[\s\S]{0,400}no per-school AUTH_SECRET/.test(deploySrc),
  'the per-school AUTH_SECRET guard is missing',
);
check(
  'the deploy fails closed when INTERNAL_SYNC_SECRET is absent',
  /REFUSING TO DEPLOY[\s\S]{0,400}INTERNAL_SYNC_SECRET is not set/.test(deploySrc),
  'the INTERNAL_SYNC_SECRET guard is missing',
);

// The two secrets are coupled in code and independent in intent. The decoupling has
// to be present on both sides, and it was never exercised before because the secret
// had not been created -- so the fallback path in getInternalSyncSecret is the one
// this whole arrangement depends on NOT being taken.
//
// The step is located by splitting on `- name:` rather than by a character window.
// The first version of this check used a 400-character look-ahead and reported the
// secret missing, because a six-line explanatory comment sat between the two keys and
// pushed the match past the window. The code was right and the check was wrong --
// which is the same shape of mistake as the extractor regex that matched nothing on
// CRLF, and it is why this is written structurally.
const workflowSrc = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'deploy.yml'), 'utf8');
const steps = workflowSrc.split(/^\s*-\s+name:\s+/m);
const dedicatedStep = steps.find((s) => s.startsWith('Deploy Dedicated Workers'));
check('the dedicated deploy step was found in deploy.yml', !!dedicatedStep);
if (dedicatedStep) {
  check(
    'the dedicated deploy step forwards INTERNAL_SYNC_SECRET',
    /INTERNAL_SYNC_SECRET:\s*\$\{\{\s*secrets\.INTERNAL_SYNC_SECRET\s*\}\}/.test(dedicatedStep),
    'INTERNAL_SYNC_SECRET is not in the dedicated deploy step env',
  );
  check(
    'the dedicated deploy step forwards DEDICATED_SECRETS_JSON',
    /DEDICATED_SECRETS_JSON:\s*\$\{\{\s*secrets\.DEDICATED_SECRETS_JSON\s*\}\}/.test(dedicatedStep),
    'DEDICATED_SECRETS_JSON is not in the dedicated deploy step env',
  );
}
const cryptoSrc = fs.readFileSync(path.join(ROOT, 'api', 'lib', 'tenant-crypto.ts'), 'utf8');
check(
  'getInternalSyncSecret still prefers an explicit secret over the AUTH_SECRET derivation',
  /INTERNAL_SYNC_SECRET[\s\S]{0,200}return env\.INTERNAL_SYNC_SECRET\.trim\(\)/.test(cryptoSrc),
  'the explicit branch is gone -- per-school auth keys would break M2M fleet-wide',
);

// ---------------------------------------------------------------------------
// Part B -- the platform's billing routes.
//
// These run the real getBillingAuthUser against the real verifyInternalSignature.
// ---------------------------------------------------------------------------

section('Part B -- platform billing auth (api/billing)');

const SUBSCRIPTION_PATH = '/api/billing/subscription';

async function callPlatform(urlPath, { headers, method, body } = {}) {
  return app.request(urlPath, { method: method || 'GET', headers: headers || {}, body }, platformEnv());
}

const baseHeaders = await signedHeaders('GET', SUBSCRIPTION_PATH, '');

const okRes = await callPlatform(SUBSCRIPTION_PATH, {
  headers: {
    'X-Internal-Secret': baseHeaders['X-Internal-Secret'],
    'X-Internal-Signature': baseHeaders['X-Internal-Signature'],
    'X-Internal-Timestamp': baseHeaders['X-Internal-Timestamp'],
    'X-Verified-School-Scope': SCHOOL_ID,
    'X-Acting-Role': 'Director',
    'X-Acting-Email': 'director@test.school',
  },
});
const okBody = await okRes.json().catch(() => ({}));
check('a correctly signed request is served', okRes.status === 200, 'got ' + okRes.status);
check(
  'and it is scoped to the school named in the signed path',
  okBody.subscription && okBody.subscription.schoolId === SCHOOL_ID,
  JSON.stringify(okBody.subscription || {}),
);

// 1. No signature at all -- the "just set the headers" forgery.
const noSig = await callPlatform(SUBSCRIPTION_PATH, {
  headers: { 'X-Verified-School-Scope': OTHER_SCHOOL_ID, 'X-Internal-Secret': PLATFORM_SECRET, 'X-Acting-Role': 'Director' },
});
check('a scope asserted with no signature is refused', noSig.status === 401, 'got ' + noSig.status);

// 2. Right shape, wrong secret.
const wrongSecret = await callPlatform(SUBSCRIPTION_PATH, {
  headers: { ...baseHeaders, 'X-Internal-Secret': 'not-the-secret', 'X-Verified-School-Scope': OTHER_SCHOOL_ID, 'X-Acting-Role': 'Director' },
});
check('a signature made with the wrong secret is refused', wrongSecret.status === 401, 'got ' + wrongSecret.status);

// 3. Signature is valid, but for a different path.
const pathSwapped = await callPlatform('/api/billing/invoices', {
  headers: { ...baseHeaders, 'X-Verified-School-Scope': SCHOOL_ID, 'X-Acting-Role': 'Director' },
});
check('a signature replayed onto a different path is refused', pathSwapped.status === 401, 'got ' + pathSwapped.status);

// 4. Signature is valid, but the body changed afterwards.
//
// The pair of assertions below matters more than either alone. Asserting only that a
// tampered body gets 401 is satisfied just as well by code that refuses EVERY signed
// POST -- including a correctly signed one. That is the same blindness as the
// original bug, where a 401 on an unauthenticated probe was indistinguishable from a
// 401 caused by the regression.
//
// So the control case is asserted too: the identical request with an UNCHANGED body
// must get past authentication and be rejected by the route's own validation, which
// answers 400 for an unknown plan. 400 proves the signature verified; 401 proves it
// did not. If body verification were removed, both would answer 401 and the control
// case would fail.
const postPath = '/api/billing/subscribe';
const postBody = JSON.stringify({ planId: 'not-a-real-plan', billingCycle: 'annual' });
const postSigned = await signedHeaders('POST', postPath, postBody);
const postHeaders = {
  'Content-Type': 'application/json',
  'X-Internal-Secret': postSigned['X-Internal-Secret'],
  'X-Internal-Signature': postSigned['X-Internal-Signature'],
  'X-Internal-Timestamp': postSigned['X-Internal-Timestamp'],
  'X-Verified-School-Scope': SCHOOL_ID,
  'X-Acting-Role': 'Director',
};
const control = await callPlatform(postPath, { method: 'POST', headers: postHeaders, body: postBody });
check(
  'a correctly signed POST passes authentication and reaches route validation (400)',
  control.status === 400,
  'got ' + control.status,
);
const tamperedBody = await callPlatform(postPath, {
  method: 'POST',
  headers: postHeaders,
  body: JSON.stringify({ planId: 'enterprise', billingCycle: 'annual' }),
});
check('a body edited after signing is refused', tamperedBody.status === 401, 'got ' + tamperedBody.status);

// 5. Replay window.
const stale = await signedHeaders('GET', SUBSCRIPTION_PATH, '');
const staleRes = await callPlatform(SUBSCRIPTION_PATH, {
  headers: {
    'X-Internal-Secret': stale['X-Internal-Secret'],
    'X-Internal-Signature': stale['X-Internal-Signature'],
    'X-Internal-Timestamp': String(Date.now() - 60 * 60 * 1000),
    'X-Verified-School-Scope': SCHOOL_ID,
    'X-Acting-Role': 'Director',
  },
});
check('a signature with an hour-old timestamp is refused (replay window)', staleRes.status === 401, 'got ' + staleRes.status);

// 6. Role escalation: signed, correct school, but claiming SuperAdmin.
const escalate = await callPlatform(SUBSCRIPTION_PATH, {
  headers: { ...baseHeaders, 'X-Verified-School-Scope': SCHOOL_ID, 'X-Acting-Role': 'SuperAdmin' },
});
check('a signed request claiming SuperAdmin is refused', escalate.status === 401, 'got ' + escalate.status);

// 7. A role that is not in the role list at all.
const bogusRole = await callPlatform(SUBSCRIPTION_PATH, {
  headers: { ...baseHeaders, 'X-Verified-School-Scope': SCHOOL_ID, 'X-Acting-Role': 'root' },
});
check('a signed request with an unknown role is refused', bogusRole.status === 401, 'got ' + bogusRole.status);

// 8. A signed request with no role header at all.
const noRole = await callPlatform(SUBSCRIPTION_PATH, {
  headers: { ...baseHeaders, 'X-Verified-School-Scope': SCHOOL_ID },
});
check('a signed request with no acting role is refused', noRole.status === 401, 'got ' + noRole.status);

// 9. No headers whatsoever still means "log in", not "internal".
const plain = await callPlatform(SUBSCRIPTION_PATH);
check('an ordinary unauthenticated request is still 401', plain.status === 401, 'got ' + plain.status);

// 10. Every authenticated billing route goes through the new helper. A route left on
//     the bare getAuthUser() would still 401 for every dedicated school, which is the
//     exact bug this change exists to fix -- and it would not show up in any of the
//     tests above, which only touch /subscription.
section('Part C -- every authenticated billing route uses the shared helper');
const billingSrc = fs.readFileSync(path.join(ROOT, 'api', 'billing', 'index.ts'), 'utf8');
const bareGetAuthUser = (billingSrc.match(/await getAuthUser\(c\)/g) || []).length;
const helperCalls = (billingSrc.match(/await getBillingAuthUser\(c\)/g) || []).length;
check('no route calls the bare getAuthUser() any more', bareGetAuthUser === 0, bareGetAuthUser + ' left');
check('all 10 authenticated routes use getBillingAuthUser()', helperCalls === 10, 'found ' + helperCalls);

// The scope header must never be honoured without a verified signature, which is why
// the helper delegates to getAuthUser() when any part of the M2M shape is missing.
//
// That logic moved out of this file into api/lib/proxied-auth.ts, because /api/plugins
// and /api/features are proxied the same way and needed the identical rule -- and a
// private copy in one file is exactly how api/plugins/index.ts ended up with a
// private `authCheck` that skipped tier exclusivity in the first place.
//
// This is written structurally on purpose. An earlier version grepped for the
// literal line `if (!scope || !signature || ...) { return getAuthUser(c); }` and
// kept failing every time the guard was merely refactored, which is the "a check
// that greps for spelling breaks when the variable is renamed" trap. It now looks
// for the two structural facts: the envelope test exists, and the incomplete
// envelope path returns getAuthUser().
const proxiedAuthSrc = fs.readFileSync(path.join(ROOT, 'api', 'lib', 'proxied-auth.ts'), 'utf8');
check(
  'the shared helper tests the M2M envelope before trusting it',
  /function\s+hasInternalEnvelope\s*\(/.test(proxiedAuthSrc) && /hasInternalEnvelope\(c\)/.test(proxiedAuthSrc),
  'no hasInternalEnvelope() in api/lib/proxied-auth.ts',
);
check(
  'the helper falls back to the token path when the M2M shape is incomplete',
  /if\s*\(!hasInternalEnvelope\(c\)\)\s*\{[\s\S]{0,600}?getAuthUser\(c\)/.test(proxiedAuthSrc),
  'fallback to getAuthUser() not found in api/lib/proxied-auth.ts',
);

// One implementation, three surfaces. A second private copy is how this class of
// defect starts, so the invariant is asserted rather than left to review.
//
// This deliberately checks the BEHAVIOUR (a surface reaches the proxy-aware
// check, and never the bare getAuthUser) instead of the import path. The three
// surfaces reach it two different ways -- billing imports the helper, plugins and
// features use the requireProxiedSession guard that wraps it -- so asserting an
// import line would be asserting spelling, and would fail the moment either side
// is refactored. That is the "a check that greps for a variable name breaks when
// the variable is renamed" trap this harness was already bitten by once.
for (const surface of ['billing', 'plugins', 'features']) {
  const src = fs.readFileSync(path.join(ROOT, 'api', surface, 'index.ts'), 'utf8');
  const code = src
    .split('\n')
    .filter((line) => !line.trim().startsWith('*') && !line.trim().startsWith('/*') && !line.trim().startsWith('//'))
    .join('\n');

  check(
    'api/' + surface + ' reaches the proxy-aware auth check',
    /getProxyAwareAuthUser|getBillingAuthUser|requireProxiedSession|requireProxiedManagement/.test(code),
    'api/' + surface + '/index.ts uses neither the helper nor the proxied guard',
  );
  check(
    'api/' + surface + ' does not call the bare getAuthUser() on a proxied route',
    !/await getAuthUser\(c\)/.test(code),
    'bare getAuthUser(c) found in api/' + surface + '/index.ts',
  );
  check(
    'api/' + surface + ' does not call verifyToken() directly',
    !/verifyToken\s*\(/.test(code),
    'verifyToken( found in api/' + surface + '/index.ts',
  );
}

// ---------------------------------------------------------------------------
// Part D -- the whole chain, in one process.
//
// Parts A and B test each hop with the other end stubbed. This runs both hops for
// real: the dedicated worker's middleware issues a genuine outbound request and the
// stub hands it to the platform app running the real middleware and the real billing
// routes.
//
// This is the test for the actual regression. The bug that shipped answered 401 to a
// logged-in Director, and every probe that had ever been run against it was
// unauthenticated -- where a 401 is the correct answer and therefore indistinguishable
// from the broken one. Only a test that logs in can tell those two apart.
// ---------------------------------------------------------------------------

section('Part D -- end to end, dedicated worker -> platform');

let hops = 0;
globalThis.fetch = async (input, init) => {
  hops++;
  // The dedicated worker rewrote the host to the platform; strip it back to a path
  // and let the same app instance serve it under the platform's env.
  //
  // app.fetch(Request, env) and not app.request(path, init, env): the proxy calls
  // fetch() with a Request, so `init` is undefined and app.request() would drop every
  // header -- including the signature. That mistake made all four end-to-end checks
  // fail for the wrong reason, which is worth writing down because a harness that
  // fails for the wrong reason is nearly as dangerous as one that passes for the
  // wrong reason.
  const incoming = input instanceof Request ? input : new Request(input, init);
  const url = new URL(incoming.url);
  return app.fetch(new Request(url.toString(), incoming), platformEnv(), undefined);
};

// One top-level dedicated request must cost exactly ONE network hop: dedicated worker
// -> platform. The platform side has to re-enter its own routing in process.
//
// This assertion exists because of what happened when it did not. The first version
// of the internal handler called fetch() against the worker's own public hostname to
// reach the billing app, and Cloudflare answers a Worker fetching its own route with
// 522/523. In production every signed billing call returned 522, with the tail
// reporting "Ok" and an empty exceptions array -- so a status check alone would have
// read 522 and moved on. Counting hops catches the extra round trip, and an in-process
// re-entry keeps the count at one.
function assertSingleHop(name, result, expectedStatus) {
  check(name + ' (' + expectedStatus + ')', result.status === expectedStatus, 'got ' + result.status);
  check(name + ' -- exactly one network hop', hops === 1, hops + ' hop(s)');
}

try {
  hops = 0;
  const e2e = await app.request(
    '/api/billing/subscription',
    { headers: { Authorization: 'Bearer ' + directorToken } },
    dedicatedEnv,
  );
  const body = await e2e.json().catch(() => ({}));
  assertSingleHop('a logged-in Director on a dedicated school reads their own subscription', e2e, 200);
  check(
    'and it is their own school, not another one',
    body.subscription && body.subscription.schoolId === SCHOOL_ID,
    JSON.stringify(body.subscription || {}),
  );

  hops = 0;
  const e2eAnon = await app.request('/api/billing/subscription', {}, dedicatedEnv);
  check(
    'an anonymous call on the same route is still refused end to end',
    e2eAnon.status === 401,
    'got ' + e2eAnon.status,
  );

  hops = 0;
  const e2ePlans = await app.request('/api/billing/plans', {}, dedicatedEnv);
  assertSingleHop('the public pricing page still works end to end on a dedicated school', e2ePlans, 200);

  // A Teacher is a real school role and may read the subscription, and that has to
  // hold across the proxy too -- otherwise the role check is decoration.
  const teacherToken = await authLib.signToken(
    { env: dedicatedEnv },
    { sub: 'u-teacher', userId: 'u-teacher', email: 'teacher@test.school', role: 'Teacher', schoolId: SCHOOL_ID },
  );
  hops = 0;
  const e2eTeacher = await app.request(
    '/api/billing/subscription',
    { headers: { Authorization: 'Bearer ' + teacherToken } },
    dedicatedEnv,
  );
  assertSingleHop('a Teacher can still read the subscription', e2eTeacher, 200);
} finally {
  globalThis.fetch = realFetch;
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
fs.rmSync(OUT, { recursive: true, force: true });
process.exit(failed === 0 ? 0 : 1);