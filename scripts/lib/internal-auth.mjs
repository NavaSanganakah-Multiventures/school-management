// scripts/lib/internal-auth.mjs
// Derives the machine-to-machine internal sync token for calls to the platform
// worker's /api/internal/* endpoints. Mirrors api/lib/tenant-crypto.ts
// (getInternalSyncSecret) exactly:
//   1. INTERNAL_SYNC_SECRET (if set) is used verbatim.
//   2. Otherwise an independent HMAC-SHA256 token is derived from AUTH_SECRET,
//      so the same value can be computed in CI and on the worker.
//
// Requests are also SIGNED (X-Internal-Signature) so the static token is not
// sufficient on its own: a captured request cannot be replayed indefinitely or
// re-used on a different endpoint/path with a modified body. The worker-side
// verifier is api/lib/internal-request-auth.ts and the canonical signing string
// must stay byte-identical between the two files.

const INTERNAL_SIGNATURE_VERSION = 'v1';
const INTERNAL_MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

const encoder = new TextEncoder();

export async function resolveInternalToken(env = process.env) {
  const direct = String(env.INTERNAL_SYNC_SECRET || '').trim();
  if (direct) return direct;

  const authKey = String(env.AUTH_SECRET || '').trim();
  if (!authKey) return '';

  const key = await crypto.subtle.importKey(
    'raw',
    enc(authKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    enc('vidyasetu-m2m-tenant-sync-token-v1'),
  );
  const hex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return 'm2m_' + hex;
}

function enc(input) {
  return encoder.encode(input);
}

function bytesToBase64Url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).split('+').join('-').split('/').join('_').split('=').join('');
}

function bytesToHex(input) {
  const view = input instanceof Uint8Array ? input : new Uint8Array(input);
  let out = '';
  for (let i = 0; i < view.length; i++) out += view[i].toString(16).padStart(2, '0');
  return out;
}

export async function buildInternalSignature({ secret, method, path, body, now }) {
  const timestamp = now ?? Date.now();
  const digest = await crypto.subtle.digest('SHA-256', enc(body || ''));
  const signingString = [
    INTERNAL_SIGNATURE_VERSION,
    String(method).toUpperCase(),
    path,
    String(timestamp),
    bytesToHex(digest),
  ].join('\n');

  const key = await crypto.subtle.importKey(
    'raw',
    enc(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc(signingString));
  return {
    'X-Internal-Timestamp': String(timestamp),
    'X-Internal-Signature': `${INTERNAL_SIGNATURE_VERSION}=${bytesToBase64Url(new Uint8Array(sig))}`,
  };
}

export function platformBaseUrl(env = process.env) {
  return String(env.PLATFORM_BASE_URL || 'https://pragnya.nasven.com').replace(/\/+$/, '');
}

export async function internalApiFetch(env, path, init = {}) {
  const token = await resolveInternalToken(env);
  if (!token) {
    throw new Error('INTERNAL_SYNC_SECRET या AUTH_SECRET उपलब्ध नहीं है — internal API call नहीं हो सकता।');
  }
  const method = String(init.method || 'GET').toUpperCase();
  // The signature must cover the exact serialized body that is sent on the wire.
  const body = typeof init.body === 'string' ? init.body : '';
  const sigHeaders = await buildInternalSignature({ secret: token, method, path, body });
  const headers = {
    'Content-Type': 'application/json',
    'X-Internal-Secret': token,
    ...sigHeaders,
    ...(init.headers || {}),
  };
  const res = await fetch(platformBaseUrl(env) + path, { ...init, method, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error('Internal API ' + path + ' failed (' + res.status + '): ' + text.slice(0, 300));
  }
  return res.json();
}

export { INTERNAL_MAX_CLOCK_SKEW_MS };
