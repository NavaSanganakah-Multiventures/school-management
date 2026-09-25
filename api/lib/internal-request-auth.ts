// api/lib/internal-request-auth.ts
// Signed machine-to-machine authentication for /api/internal/* endpoints.
//
// PROBLEM THIS SOLVES
// The internal endpoints return full user rows (including encrypted password
// hashes) for an arbitrary caller-supplied schoolId, and they accept a static
// `X-Internal-Secret` bearer token. A static token is:
//   - replayable forever (no expiry, no freshness),
//   - indistinguishable between endpoints/tenants,
//   - and if leaked, gives a fleet-wide credential oracle (every dedicated
//     worker is configured with the same platform AUTH_SECRET).
//
// WHAT THIS ADDS
// A short-lived HMAC-SHA256 signature over method + path + body + timestamp.
// The timestamp bounds replay to a small window instead of "forever", and
// binding the method/path/body stops a captured signature from being re-used on
// a different endpoint or with a modified payload.
//
// ROLLOUT (do not remove the legacy path until the fleet is fully migrated)
//   1. Deploy this code. The worker accepts BOTH a valid signature and the
//      legacy static secret.
//   2. CI scripts send a signature on every call (see
//      scripts/lib/internal-auth.mjs), so all real traffic is protected
//      immediately and replay is bounded to INTERNAL_MAX_CLOCK_SKEW_MS.
//   3. Once you are confident, set the Worker secret
//      INTERNAL_SYNC_REQUIRE_SIGNATURE="true" to reject unsigned calls.

export const INTERNAL_SIGNATURE_VERSION = 'v1';

/** Replay window. A captured signature is only usable inside this window. */
export const INTERNAL_MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

const encoder = new TextEncoder();

function bytesToHex(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let out = '';
  for (let i = 0; i < view.length; i++) out += view[i].toString(16).padStart(2, '0');
  return out;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).split('+').join('-').split('/').join('_').split('=').join('');
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(input));
  return bytesToHex(digest);
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

/**
 * Canonical string that gets signed. Field order is fixed and must stay in sync
 * with scripts/lib/internal-auth.mjs.
 */
export async function buildInternalSigningString(params: {
  method: string;
  path: string;
  timestamp: number;
  body: string;
}): Promise<string> {
  const bodyHash = await sha256Hex(params.body || '');
  return [
    INTERNAL_SIGNATURE_VERSION,
    params.method.toUpperCase(),
    params.path,
    String(params.timestamp),
    bodyHash,
  ].join('\n');
}

export interface InternalSignatureInput {
  method: string;
  path: string;
  timestamp: number;
  body: string;
  signature: string;
  secret: string;
  now?: number;
  maxSkewMs?: number;
}

export type InternalAuthResult =
  | { ok: true; mode: 'signed' }
  | { ok: false; mode: 'signed'; reason: string }
  | { ok: false; mode: 'unsigned'; reason: string };

/**
 * Verifies a signed internal request using crypto.subtle.verify so the
 * comparison is constant-time (never a plain string `===`).
 */
export async function verifyInternalSignature(
  input: InternalSignatureInput,
): Promise<InternalAuthResult> {
  const { method, path, timestamp, body, signature, secret } = input;
  const maxSkewMs = input.maxSkewMs ?? INTERNAL_MAX_CLOCK_SKEW_MS;
  const now = input.now ?? Date.now();

  if (!signature) {
    return { ok: false, mode: 'signed', reason: 'missing_signature' };
  }
  if (!secret) {
    return { ok: false, mode: 'signed', reason: 'server_secret_missing' };
  }
  if (!Number.isFinite(timestamp)) {
    return { ok: false, mode: 'signed', reason: 'invalid_timestamp' };
  }

  const skew = Math.abs(now - timestamp);
  if (skew > maxSkewMs) {
    return { ok: false, mode: 'signed', reason: 'expired_timestamp' };
  }

  try {
    const signingString = await buildInternalSigningString({ method, path, timestamp, body });
    const key = await hmacKey(secret);
    const provided = signature.startsWith('v1=') ? signature.slice(3) : signature;
    const providedBytes = base64UrlToBytes(provided);
    // Copy into a fresh ArrayBuffer so the view is guaranteed ArrayBuffer-backed
    // (TS lib.dom models a bare Uint8Array as ArrayBufferLike, which WebCrypto rejects).
    const providedBuffer = new Uint8Array(providedBytes.length);
    providedBuffer.set(providedBytes);
    const ok = await crypto.subtle.verify(
      'HMAC',
      key,
      providedBuffer,
      encoder.encode(signingString),
    );
    if (!ok) {
      return { ok: false, mode: 'signed', reason: 'bad_signature' };
    }
    return { ok: true, mode: 'signed' };
  } catch (_) {
    return { ok: false, mode: 'signed', reason: 'signature_parse_error' };
  }
}

function base64UrlToBytes(str: string): Uint8Array {
  const b64 = str.split('-').join('+').split('_').join('/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * Produces the `X-Internal-*` headers for an outgoing signed request.
 * Mirrored by scripts/lib/internal-auth.mjs.
 */
export async function buildInternalAuthHeaders(params: {
  secret: string;
  method: string;
  path: string;
  body: string;
  now?: number;
}): Promise<Record<string, string>> {
  const timestamp = params.now ?? Date.now();
  const signingString = await buildInternalSigningString({
    method: params.method,
    path: params.path,
    timestamp,
    body: params.body,
  });
  const key = await hmacKey(params.secret);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(signingString));
  return {
    'X-Internal-Secret': params.secret,
    'X-Internal-Timestamp': String(timestamp),
    'X-Internal-Signature': `${INTERNAL_SIGNATURE_VERSION}=${bytesToBase64Url(new Uint8Array(sig))}`,
  };
}

/** True when the deployment has opted out of the legacy static-secret path. */
export function signatureRequired(env: any): boolean {
  return String((env && env.INTERNAL_SYNC_REQUIRE_SIGNATURE) || '').trim().toLowerCase() === 'true';
}
