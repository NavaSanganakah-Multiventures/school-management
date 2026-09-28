// api/lib/proxied-auth.ts
// Authentication for the three surfaces a dedicated worker PROXIES to the platform:
// /api/billing, /api/plugins and /api/features.
//
// WHY THIS FILE EXISTS
//
// A dedicated worker cannot answer these three itself -- the platform holds the
// only authoritative records -- so api/index.ts forwards the request there signed
// as the worker itself, with the school named in the SIGNED PATH. The platform's
// tier rules then correctly refuse a school user token, which is why every one of
// these routes used to answer 401 for every dedicated school.
//
// The first fix was to read the M2M headers directly inside api/billing. That
// worked, and left the other two surfaces still broken: they call getAuthUser(),
// which needs an Authorization bearer, and api/internal/index.ts deliberately
// forwards NO user credential. So /api/plugins/* and /api/features/* answered 401
// on every school portal -- verified live, and the same shape as the billing
// regression in #114.
//
// The obvious follow-up -- copy the M2M block into plugins and features -- is how
// this defect happened in the first place. api/plugins/index.ts used to carry its
// own private `authCheck`, and that single divergence is what let a school token
// be honoured on the wrong tier. So the check lives here, once, and all three
// surfaces call it.
//
// HOW A REQUEST LEGITIMATELY ARRIVES
//
//   1. M2M-proxied, from a dedicated worker. M2M headers, no user credential.
//   2. Direct, with a user token. The platform's own SuperAdmin console, which
//      reaches these routes over a normal Bearer token and names its school with
//      X-School-Id.
//
// Both are handled. A request that is neither gets null.
//
// WHY THE SIGNATURE IS RE-VERIFIED HERE, NOT JUST THE SECRET
//
// Accepting a request that merely carried a non-empty `X-Internal-Secret` is not
// a defence: a public caller can set every header on an outgoing request,
// including `X-Internal-Secret: anything` and
// `X-Verified-School-Scope: <someone else's school>`, and would have been handed
// that school's subscription. Comparing the secret alone is not enough either,
// because it is fleet-wide and static, so leaking it is a fleet-wide read for
// anyone who knows it. The signature binds method, path, body and timestamp with
// a fresh HMAC, so a scope cannot be asserted without proving you hold the secret
// AND that this exact request was signed.
//
// The role is re-derived from the verified channel rather than trusted, and
// SuperAdmin is refused outright. A dedicated worker cannot hold a SuperAdmin
// token (api/lib/auth.ts), so nothing legitimate sends one; refusing it keeps a
// school off the platform-wide branches.

import { getAuthUser } from './auth';
import { getInternalSyncSecret } from './tenant-crypto';
import { verifyInternalSignature } from './internal-request-auth';
import { constantTimeEqual } from './constant-time';
import { normalizeRole, SUPER_ADMIN, type Role } from './roles';

export interface ProxiedAuthUser {
  role: Role;
  schoolId: string;
  email: string;
}

/**
 * True when the request carries a complete M2M envelope. Used to decide whether
 * to take the proxied path or the user-token path, and exposed so callers can
 * assert on it.
 */
export function hasInternalEnvelope(c: any): boolean {
  return Boolean(
    String(c.req.header('X-Verified-School-Scope') || '').trim() &&
    c.req.header('X-Internal-Signature') &&
    c.req.header('X-Internal-Timestamp') &&
    c.req.header('X-Internal-Secret'),
  );
}

/**
 * Authenticate a request to a proxied surface, whichever way it arrived.
 *
 * Returns the same shape getAuthUser() returns -- { role, schoolId, email } -- so
 * callers can pass the result straight to getRequestSchoolId() and need no
 * special-casing.
 */
export async function getProxyAwareAuthUser(c: any): Promise<ProxiedAuthUser | null> {
  if (!hasInternalEnvelope(c)) {
    // No M2M envelope: this is a direct request with a user token. getAuthUser()
    // still enforces tier exclusivity, so a school token on the platform is
    // refused there and only SuperAdmin passes on this tier.
    return (await getAuthUser(c)) as ProxiedAuthUser | null;
  }

  const scope = String(c.req.header('X-Verified-School-Scope') || '').trim();
  const signature = c.req.header('X-Internal-Signature') || '';
  const timestamp = c.req.header('X-Internal-Timestamp') || '';
  const providedSecret = c.req.header('X-Internal-Secret') || '';

  // clone(), not text(): every route below still calls c.req.json(), and a
  // consumed body cannot be read twice.
  const rawBody = ['GET', 'HEAD'].includes(c.req.method)
    ? ''
    : await c.req.raw.clone().text().catch(() => '');

  const result = await verifyInternalSignature({
    method: c.req.method,
    path: new URL(c.req.url).pathname,
    timestamp: Number(timestamp),
    body: rawBody,
    signature,
    secret: providedSecret,
  });

  const expectedSecret = await getInternalSyncSecret(c.env);
  if (!result.ok || !expectedSecret) return null;

  // Constant-time: this is a fleet-wide shared secret. A plain `!==` leaks the
  // length and the position of the first differing byte.
  if (!(await constantTimeEqual(providedSecret, expectedSecret))) return null;

  // Re-derived from the verified channel, never taken on faith. Only a real
  // school role is accepted, and SuperAdmin specifically is refused.
  const role = normalizeRole(c.req.header('X-Acting-Role'));
  if (!role || role === SUPER_ADMIN) return null;

  return { role, schoolId: scope, email: String(c.req.header('X-Acting-Email') || '') };
}
