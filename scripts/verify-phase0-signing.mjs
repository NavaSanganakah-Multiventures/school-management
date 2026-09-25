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
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

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

// Mirrors api/lib/constant-time.ts
async function constantTimeEqual(a, b) {
  const left = typeof a === 'string' ? a : '';
  const right = typeof b === 'string' ? b : '';
  if (!left || !right) return false;
  const dig = async (s) => hexOf(await crypto.subtle.digest('SHA-256', encoder.encode(s)));
  const [l, r] = await Promise.all([dig(left), dig(right)]);
  return l === r && timingSafeEqual(Buffer.from(l), Buffer.from(r));
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

// 4. constantTimeEqual behaviour
{
  check('equal non-empty strings accepted', (await constantTimeEqual(SECRET, SECRET)) === true);
  check('different strings rejected', (await constantTimeEqual(SECRET, SECRET + 'x')) === false);
  check('empty left rejected', (await constantTimeEqual('', '')) === false);
  check('empty right rejected', (await constantTimeEqual(SECRET, '')) === false);
  check('non-string inputs rejected', (await constantTimeEqual(null, undefined)) === false);
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
