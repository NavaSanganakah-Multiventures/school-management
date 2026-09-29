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

// A fixed, deliberately unusable hash material used only to spend the same CPU as
// a real verification. The iteration count, hash and output length all match
// hashPassword, so the cost is the cost of a genuine attempt.
const DUMMY_SALT = new Uint8Array(16).fill(7);
const DUMMY_ITERATIONS = 100000;

/**
 * Spends the cost of a real password verification, and always returns false.
 *
 * WHY THIS EXISTS
 *
 * Collapsing login's three distinct 401 bodies into one generic message is not
 * enough on its own. The original code returned immediately when no user row was
 * found, and only ran PBKDF2 when one was. A caller can measure that: the reply
 * for a non-existent account came back in about a millisecond, and the reply for
 * a real one took as long as 100,000 SHA-256 rounds. The body said nothing, the
 * clock said everything, and the account list stayed enumerable.
 *
 * So the no-user and no-password-set paths now derive against this dummy before
 * returning the same generic refusal the wrong-password path returns. Same
 * message, same status, same amount of work.
 *
 * It derives against fixed material, so it can never succeed, and it never
 * compares anything -- the return value is a constant.
 */
export async function burnPasswordVerification(password: any): Promise<false> {
  try {
    const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
    await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: DUMMY_SALT, iterations: DUMMY_ITERATIONS, hash: 'SHA-256' },
      key,
      256,
    );
  } catch (e) {
    // Must never throw: the caller treats the result as "not authenticated", and an
    // exception here would turn an authentication failure into a 500.
  }
  return false;
}

// ---------------------------------------------------------------------------
// Is this session still allowed to exist?
//
// A valid signature proves the token was issued by us. It says nothing about
// whether it should still be honoured, which is the gap this closes.
//
// SESSION_EXPIRY_SECONDS is 7 days (api/auth/index.ts). Before this, nothing on
// the request path consulted the account: `getAuthUser` verified the HMAC and the
// expiry and returned. So the one control the product actually has for offboarding
// -- DELETE /api/staff/:id, which sets system_users.status = 'Inactive' and tells
// the caller "लॉगिन निष्क्रिय कर दिया गया" -- did nothing to an already-issued
// token. A teacher removed from a school kept full read and write access to that
// school's students, fees and marks for up to a week, and could not be logged out
// from the server side at all, because POST /api/auth/logout is a no-op.
//
// WHY IT LIVES HERE
//
// In getAuthUser, not in requireSession. getAuthUser is the single point every
// route already passes through, including the ~40 call sites that call it
// directly instead of using a guard. Putting it in requireSession would leave
// every one of those unguarded, which is the shape of bug this repo has already
// been bitten by twice today.
//
// WHAT IT DOES NOT COVER, DELIBERATELY
//
// The M2M path. getProxyAwareAuthUser calls getAuthUser only when the request
// carries no internal envelope, and a proxied request authenticates as the WORKER
// rather than as a person, taking its role from a verified header. There is no
// user account to be deactivated on that path, and it already re-verifies a
// signature on every call.
//
// FAILURE BEHAVIOUR: DENY, IN EVERY CASE
//
// No DB binding, no `sub` in the token, no matching row, a non-Active status, or
// a query that throws -- all of them refuse. This is the opposite of what a first
// draft did, and the draft is worth recording.
//
// It read `if (!db || !subjectId) return true`, on the reasoning that a route
// needing no database has nothing to protect. That is a fail-OPEN branch on a
// deactivation control, and it was not theoretical: scripts/verify-billing-m2m.mjs
// mints tokens with `userId` and no `sub`, so the branch swallowed every status
// check in that harness and it still reported 59/59 green. A security check that
// silently does nothing is worse than no check, because the coverage it appears to
// provide is the thing people rely on.
//
// Both branches are safe to deny. Every config that serves a request binds DB
// (wrangler.toml and wrangler.admin.toml both do; wrangler.preview-migrations.toml
// does not and is only used for `d1 migrations apply`), and both real token issuers
// set `sub` -- api/auth/index.ts for SuperAdmin and for a school user. So denying
// costs nothing real, and it means a future token issuer that forgets `sub` fails
// loudly in review rather than quietly disabling account deactivation.
// ---------------------------------------------------------------------------
async function isSessionSubjectActive(c: any, user: any): Promise<boolean> {
  const db = c && c.env && c.env.DB;
  const subjectId = String((user && user.sub) || '').trim();
  if (!db || !subjectId) return false;

  try {
    // Super Admin lives in platform_admins, everyone else in system_users. Both
    // carry a status column. Written as two explicit queries rather than one
    // interpolated table name: the value is not attacker-controlled today, but
    // an interpolated identifier is the kind of thing that becomes one later.
    const isSuperAdmin = normalizeRole(user.role) === SUPER_ADMIN;
    const row = isSuperAdmin
      ? await db.prepare('SELECT status FROM platform_admins WHERE id = ?').bind(subjectId).first()
      : await db.prepare('SELECT status FROM system_users WHERE id = ?').bind(subjectId).first();

    // No row means the account was removed outright. A deleted account has no
    // session, so this denies rather than allows.
    if (!row) return false;
    return String(row.status || '') === 'Active';
  } catch (e: any) {
    console.error(
      '[auth] session status check failed, denying the request:',
      e && e.message ? e.message : e,
    );
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

  // The signature proves the token is ours. This proves the account is still
  // entitled to use it, which a 7-day token does not carry with it. Without it,
  // deactivating an account only stops future logins and does nothing about the
  // session already in the user's pocket.
  if (!(await isSessionSubjectActive(c, user))) return null;

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
