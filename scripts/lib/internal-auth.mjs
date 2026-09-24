// scripts/lib/internal-auth.mjs
// Derives the machine-to-machine internal sync token for calls to the platform
// worker's /api/internal/* endpoints. Mirrors api/lib/tenant-crypto.ts
// (getInternalSyncSecret) exactly:
//   1. INTERNAL_SYNC_SECRET (if set) is used verbatim.
//   2. Otherwise an independent HMAC-SHA256 token is derived from AUTH_SECRET,
//      so the same value can be computed in CI and on the worker.

export async function resolveInternalToken(env = process.env) {
  const direct = String(env.INTERNAL_SYNC_SECRET || '').trim();
  if (direct) return direct;

  const authKey = String(env.AUTH_SECRET || '').trim();
  if (!authKey) return '';

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(authKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    enc.encode('vidyasetu-m2m-tenant-sync-token-v1')
  );
  const hex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return 'm2m_' + hex;
}

export function platformBaseUrl(env = process.env) {
  return String(env.PLATFORM_BASE_URL || 'https://pragnya.nasven.com').replace(/\/+$/, '');
}

export async function internalApiFetch(env, path, init = {}) {
  const token = await resolveInternalToken(env);
  if (!token) {
    throw new Error('INTERNAL_SYNC_SECRET या AUTH_SECRET उपलब्ध नहीं है — internal API call नहीं हो सकता।');
  }
  const headers = {
    'Content-Type': 'application/json',
    'X-Internal-Secret': token,
    ...(init.headers || {}),
  };
  const res = await fetch(platformBaseUrl(env) + path, { ...init, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error('Internal API ' + path + ' failed (' + res.status + '): ' + text.slice(0, 300));
  }
  return res.json();
}