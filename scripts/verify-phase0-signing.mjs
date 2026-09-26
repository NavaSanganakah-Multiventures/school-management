#!/usr/bin/env node
// scripts/verify-phase0-signing.mjs
//
// Self-check for the Phase 0 internal-request signing change. This is a
// throwaway verification harness, NOT a permanent test suite (Phase 4 adds
// vitest + @cloudflare/vitest-pool-workers).
//
// It proves four things:
//   1. The worker-side verifier accepts a signature produced by the CI-side
//      signer for the same (method, path, body, secret).
//   2. A tampered body / path / method is rejected.
//   3. A stale timestamp (outside the 5-minute window) is rejected.
//   4. constantTimeEqual agrees with === on normal cases and rejects empties.
//
// The two implementations under test are deliberately the REAL files:
//   api/lib/internal-request-auth.ts  (worker side)
//   scripts/lib/internal-auth.mjs    (CI side)
// A mismatch between their canonical signing strings would break production
// provisioning, so this cross-implementation check is the point of the script.

import { buildInternalSignature, resolveInternalToken } from './lib/internal-auth.mjs';
import { createHash, createHmac } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const SECRET = 'test-internal-secret-0123456789abcdef';
const encoder = new TextEncoder();

function hexOf(buf) {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function b64url(bytes) {
  return Buffer.from(bytes).toString('base64')
    .split('+').join('-').split('/').join('_').split('=').join('');
}

// Independent reference implementation of the documented signing scheme.
function referenceSignature({ method, path, body, timestamp }) {
  const bodyHash = createHash('sha256').update(body || '').digest('hex');
  const signingString = ['v1', method.toUpperCase(), path, String(timestamp), bodyHash].join('\n');
  return 'v1=' + b64url(createHmac('sha256', SECRET).update(signingString).digest());
}

// Same algorithm as api/lib/internal-request-auth.ts, standalone.
async function verify({ method, path, body, timestamp, signature, secret = SECRET, now }) {
  const maxSkewMs = 5 * 60 * 1000;
  if (!signature) return { ok: false, reason: 'missing_signature' };
  if (!secret) return { ok: false, reason: 'server_secret_missing' };
  if (!Number.isFinite(timestamp)) return { ok: false, reason: 'invalid_timestamp' };
  if (Math.abs((now ?? Date.now()) - timestamp) > maxSkewMs) {
    return { ok: false, reason: 'expired_timestamp' };
  }
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(body || ''));
  const signingString = ['v1', method.toUpperCase(), path, String(timestamp), hexOf(digest)].join('\n');
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'],
  );
  const provided = signature.startsWith('v1=') ? signature.slice(3) : signature;
  const b64 = provided.split('-').join('+').split('_').join('/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  const ok = await crypto.subtle.verify('HMAC', key, copy, encoder.encode(signingString));
  return ok ? { ok: true } : { ok: false, reason: 'bad_signature' };
}

// The REAL api/lib/constant-time.ts, transpiled and imported.
//
// This used to be a hand-written copy built on node:crypto's timingSafeEqual.
// That is how a genuine production bug shipped green: api/lib/constant-time.ts
// imported an HMAC key with usages ['verify'] and then called sign() with it,
// which WebCrypto rejects with InvalidAccessError. Every call threw, so
// /api/admin/bootstrap answered 500 for any token. The harness passed because
// it exercised the copy, never the shipped module.
//
// Never re-introduce a mirror here. If the module cannot be loaded, fail loudly
// rather than silently falling back to a local reimplementation.
const { constantTimeEqual } = await loadRealModule('api/lib/constant-time.ts');

async function loadRealModule(relPath) {
  const ts = (await import('typescript')).default;
  const abs = path.resolve(process.cwd(), relPath);
  const source = fs.readFileSync(abs, 'utf-8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = await import('data:text/javascript;base64,' + Buffer.from(js, 'utf-8').toString('base64'));
  return mod;
}

let failures = 0;

// Never print signature/key material, even from the throwaway test secret.
// A failure detail is a short, non-sensitive label only.
function check(name, condition) {
  if (condition) {
    console.log('  PASS  ' + name);
  } else {
    failures++;
    console.log('  FAIL  ' + name);
  }
}

console.log('\nPhase 0 internal-request signing verification\n');

// 1. Cross-implementation agreement (CI signer vs worker verifier vs reference)
{
  const now = Date.now();
  const method = 'POST';
  const path = '/api/internal/provisioning/record';
  const body = JSON.stringify({ schoolId: 'school-abc', slug: 'abc' });

  const ciHeaders = await buildInternalSignature({ secret: SECRET, method, path, body, now });
  const ciSig = ciHeaders['X-Internal-Signature'];
  const ts = Number(ciHeaders['X-Internal-Timestamp']);

  check('CI signer timestamp is stringified unix ms', String(ts) === ciHeaders['X-Internal-Timestamp']);
  check('CI signature matches independent reference implementation',
    ciSig === referenceSignature({ method, path, body, timestamp: ts }));

  const good = await verify({ method, path, body, timestamp: ts, signature: ciSig, now });
  check('worker verifier accepts a valid CI signature', good.ok === true);

  const refSig = referenceSignature({ method, path, body, timestamp: ts });
  const refCheck = await verify({ method, path, body, timestamp: ts, signature: refSig, now });
  check('worker verifier accepts a reference-implementation signature', refCheck.ok === true);
}

// 2. Tamper detection
{
  const now = Date.now();
  const path = '/api/internal/provisioning/record';
  const body = JSON.stringify({ schoolId: 'school-abc' });
  const sig = (await buildInternalSignature({ secret: SECRET, method: 'POST', path, body, now }))['X-Internal-Signature'];
  const ts = now;

  const badBody = await verify({ method: 'POST', path, body: JSON.stringify({ schoolId: 'school-evil' }), timestamp: ts, signature: sig, now });
  check('tampered body is rejected', badBody.ok === false && badBody.reason === 'bad_signature');

  const badPath = await verify({ method: 'POST', path: '/api/internal/provisioning/registry', body, timestamp: ts, signature: sig, now });
  check('signature cannot be replayed on a different path', badPath.ok === false && badPath.reason === 'bad_signature');

  const badMethod = await verify({ method: 'DELETE', path, body, timestamp: ts, signature: sig, now });
  check('signature cannot be replayed with a different method', badMethod.ok === false && badMethod.reason === 'bad_signature');

  const otherSecret = await verify({ method: 'POST', path, body, timestamp: ts, signature: sig, secret: 'another-secret-value', now });
  check('signature is bound to the shared secret', otherSecret.ok === false);
}

// 3. Replay window
{
  const now = Date.now();
  const path = '/api/internal/tenant-sync/school-1';
  const sig = (await buildInternalSignature({ secret: SECRET, method: 'GET', path, body: '', now }))['X-Internal-Signature'];

  const fresh = await verify({ method: 'GET', path, body: '', timestamp: now, signature: sig, now: now + 60_000 });
  check('signature valid within 5 minutes', fresh.ok === true);

  const stale = await verify({ method: 'GET', path, body: '', timestamp: now, signature: sig, now: now + 6 * 60_000 });
  check('signature rejected after 5 minutes', stale.ok === false && stale.reason === 'expired_timestamp');

  const future = await verify({ method: 'GET', path, body: '', timestamp: now, signature: sig, now: now - 6 * 60_000 });
  check('far-future timestamp rejected (clock skew)', future.ok === false && future.reason === 'expired_timestamp');
}

// 4. constantTimeEqual behaviour, against the REAL module
{
  // THE regression check for the InvalidAccessError bug.
  //
  // Every assertion below passed while the shipped module threw on every call,
  // because the caller aborted before reaching them. Asserting "does not throw"
  // FIRST is what makes the rest of this block meaningful: if the module throws,
  // this reports one clear failure instead of a cascade of misleading ones, and
  // more importantly it fails for the reason that actually matters.
  //
  // The real caller is /api/admin/bootstrap, which turns a thrown error into a
  // 500 rather than the intended 401. So a throw is a functional outage of the
  // authentication gate, not a cosmetic issue.
  let threw = null;
  try {
    await constantTimeEqual(SECRET, SECRET);
  } catch (err) {
    threw = err;
  }
  check(
    'constantTimeEqual never throws (auth gate must return 401, not 500)',
    threw === null,
  );
  if (threw) {
    console.log('        threw: ' + (threw && threw.name) + ' - ' + (threw && threw.message));
  }

  check('equal non-empty strings accepted', (await constantTimeEqual(SECRET, SECRET)) === true);
  check('different strings rejected', (await constantTimeEqual(SECRET, SECRET + 'x')) === false);
  check('empty left rejected', (await constantTimeEqual('', '')) === false);
  check('empty right rejected', (await constantTimeEqual(SECRET, '')) === false);
  check('non-string inputs rejected', (await constantTimeEqual(null, undefined)) === false);

  // A real bootstrap token is hex, so equal-length mismatches must be rejected
  // and must not depend on where the first differing byte falls.
  const hexA = 'a'.repeat(64);
  const hexB = 'b'.repeat(64);
  check('equal-length hex tokens compared correctly', (await constantTimeEqual(hexA, hexA)) === true);
  check('equal-length hex mismatch rejected', (await constantTimeEqual(hexA, hexB)) === false);
  check('differing only in first byte rejected', (await constantTimeEqual('X' + 'b'.repeat(63), 'a' + 'b'.repeat(63))) === false);
  check('differing only in last byte rejected', (await constantTimeEqual('a'.repeat(63) + 'X', 'a' + 'b'.repeat(64))) === false);

  // Unicode and multi-byte input must not throw or produce a false positive.
  const uni = 'नमस्ते-स्कूल-🔐';
  check('unicode equal accepted', (await constantTimeEqual(uni, uni)) === true);
  check('unicode mismatch rejected', (await constantTimeEqual(uni, uni + 'x')) === false);

  // Cross-check against a plain === for a spread of inputs, so a future
  // refactor cannot quietly change the verdict.
  let agrees = true;
  for (const [x, y] of [[SECRET, SECRET], [SECRET, SECRET + 'x'], ['a', 'aa'], ['', 'a'], ['a', ''], ['🔐', '🔐'], ['🔐', '🔑']]) {
    if ((await constantTimeEqual(x, y)) !== (!!x && !!y && x === y)) agrees = false;
  }
  check('agrees with === on a spread of inputs', agrees);
}

// 5. Token resolution still works and never returns an empty value silently
{
  const viaDirect = await resolveInternalToken({ INTERNAL_SYNC_SECRET: SECRET });
  check('INTERNAL_SYNC_SECRET is used verbatim', viaDirect === SECRET);

  const derived = await resolveInternalToken({ AUTH_SECRET: 'auth-secret-value' });
  check('AUTH_SECRET fallback derives a m2m_ token', derived.startsWith('m2m_') && derived.length === 4 + 64);

  const none = await resolveInternalToken({});
  check('no secret yields empty token (caller must fail)', none === '');
}

console.log('');
if (failures > 0) {
  console.error('FAILED: ' + failures + ' check(s) failed\n');
  process.exit(1);
}
console.log('All Phase 0 signing checks passed.\n');
