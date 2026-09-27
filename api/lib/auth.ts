// Real authentication helpers: password hashing (PBKDF2), signed sessions (HMAC).
// No demo data. All secrets come from env (AUTH_SECRET set via GitHub/Cloudflare Secrets).

import { SUPER_ADMIN, normalizeRole, type Role } from './roles';

// Re-exported so the many `import type { PlatformRole } from '../lib/auth'`
// call sites keep compiling. The alias now resolves to the full role set from
// roles.ts rather than the four-role union that used to live here.
//
// That union was the root cause of the authorization audit: the database has
// allowed 'Parents' and 'Students' since migration 0034, so a check written
// against `role === 'Staff'` silently let a Parent or a Student through. See the
// header of api/lib/roles.ts.
export type PlatformRole = Role;

export interface AuthPayload {
  sub: string;
  email?: string;
  role: PlatformRole;
  schoolId: string;
  exp: number;
}

const encoder = new TextEncoder();

function bytesToBase64Url(bytes: any) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).split('+').join('-').split('/').join('_').split('=').join('');
}

function base64UrlToBytes(str: any) {
  const b64 = str.split('-').join('+').split('_').join('/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export async function hashPassword(password: any) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256);
  const hashBytes = new Uint8Array(bits);
  return 'pbkdf2_sha256$100000$' + bytesToBase64Url(salt) + '$' + bytesToBase64Url(hashBytes);
}

export async function verifyPassword(password: any, stored: any) {
  try {
    const parts = stored.split('$');
    if (parts.length !== 4 || parts[0] !== 'pbkdf2_sha256') return false;
    const iterations = parseInt(parts[1], 10);
    const salt = base64UrlToBytes(parts[2]);
    const expected = parts[3];
    const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256);
    const actual = bytesToBase64Url(new Uint8Array(bits));
    return actual === expected;
  } catch (e) {
    return false;
  }
}

function getSecret(c: any) {
  const env = c && c.env;
  const secret = env && env.AUTH_SECRET;

  if (!secret) {
    const environment = (env && env.ENVIRONMENT) || 'development';
    // Fail closed in any deployed environment: a missing secret must never silently
    // downgrade session signing to a well-known development key.
    if (environment === 'production' || environment === 'preview') {
      throw new Error('AUTH_SECRET env secret is not set. Configure a strong AUTH_SECRET (>= 32 characters) before deploying.');
    }
    // Local development fallback only.
    return 'pragnya-mitra-dev-secret-change-me';
  }

  if (typeof secret !== 'string' || secret.length < 32) {
    throw new Error('AUTH_SECRET is too weak: it must be at least 32 characters long.');
  }

  return secret;
}

export async function signToken(c: any, payload: any) {
  const headerStr = bytesToBase64Url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payloadStr = bytesToBase64Url(encoder.encode(JSON.stringify(payload)));
  const signingInput = headerStr + '.' + payloadStr;
  const key = await crypto.subtle.importKey('raw', encoder.encode(getSecret(c)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(signingInput));
  return signingInput + '.' + bytesToBase64Url(new Uint8Array(sig));
}

export async function verifyToken(c: any, token: any) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const key = await crypto.subtle.importKey('raw', encoder.encode(getSecret(c)), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('HMAC', key, base64UrlToBytes(parts[2]), encoder.encode(parts[0] + '.' + parts[1]));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[1])));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

export async function getAuthUser(c: any) {
  const auth = c.req.header('Authorization') || '';
  if (auth.indexOf('Bearer ') !== 0) return null;
  const user = await verifyToken(c, auth.slice(7));
  if (!user) return null;

  const isDedicatedTier = !!(c.env && (c.env.SCHOOL_ID || c.env.IS_DEDICATED_WORKER === 'true'));
  const isSuperAdmin = normalizeRole(user.role) === SUPER_ADMIN;

  // THE TWO TIERS ARE MUTUALLY EXCLUSIVE.
  //
  // This check existed only in the dedicated direction: a SuperAdmin token was
  // refused on a school worker, because that worker is scoped to one school. The
  // converse was NOT enforced, and that was the hole.
  //
  // Every school now runs on its own dedicated worker, including free trials --
  // there is no shared data plane. So a school role token presented to the
  // platform worker has nothing legitimate to do there, and honouring it meant:
  //
  //   - the request was scoped by getRequestSchoolId() to that school, and
  //   - it then ran against the platform worker's SHARED D1.
  //
  // That shared copy is stale by construction: scripts/migrate-to-dedicated.mjs
  // moves a school's rows OUT of shared and into its own database, and nothing
  // writes them back. So a school's Director reading through the platform worker
  // saw missing data, and any write landed in the wrong database entirely. That
  // is the "dedicated does not work / the database is not being used properly"
  // symptom, and it was reachable with nothing more than the session token the
  // school app already holds.
  //
  // A token is a credential, not a capability grant, so being signed is not
  // sufficient. The tier the token is presented to is part of the check.
  if (isDedicatedTier) {
    // A dedicated worker is one school's data plane. No platform roles, and only
    // that one school.
    if (isSuperAdmin) return null;
    if (c.env.SCHOOL_ID && user.schoolId !== c.env.SCHOOL_ID) return null;
  } else {
    // The platform worker is control plane only: website, billing, provisioning
    // and /api/admin. A school role has no business being honoured here.
    if (!isSuperAdmin) return null;
  }

  return user;
}

export function getRequestSchoolId(c: any, authUser: any): string {
  // A dedicated worker is pinned to its own school, full stop.
  if (c.env && c.env.SCHOOL_ID) {
    return c.env.SCHOOL_ID;
  }

  // On the platform worker, X-School-Id is honoured only for SuperAdmin, who is
  // the one role allowed on this tier at all (see getAuthUser).
  const headerSchool = c.req.header('X-School-Id');
  if (headerSchool && authUser && normalizeRole(authUser.role) === SUPER_ADMIN) {
    return headerSchool;
  }

  if (authUser && authUser.schoolId) {
    return authUser.schoolId;
  }

  if (c.get && c.get('schoolId')) {
    return c.get('schoolId');
  }

  // NO invented school.
  //
  // This used to return `DEFAULT_SCHOOL_ID || 'school-01'`, which handed every
  // unauthenticated or misrouted caller a real, valid school id. Combined with the
  // tier hole above, that made the shared D1 reachable as a named tenant. There is
  // no shared school any more, so there is nothing to fall back to: a caller with
  // no school is a caller with no tenant, and the route's own guard should decide
  // whether that is a 401 or a 404.
  //
  // Returning '' rather than a throw keeps the signature stable for the ~40 call
  // sites; a falsy id makes `WHERE school_id = ''` match nothing, which fails
  // closed, and Phase 1's requireSession rejects an unauthenticated caller before
  // this value is used for anything that matters.
  return '';
}
