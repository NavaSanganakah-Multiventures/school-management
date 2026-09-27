import { Hono } from 'hono';
import { getDB } from '../db';
import { deriveSyncKey, encryptPayload, getInternalSyncSecret } from '../lib/tenant-crypto';
import { signatureRequired, verifyInternalSignature, buildInternalAuthHeaders } from '../lib/internal-request-auth';

export const internalApp = new Hono<{ Bindings: any }>();

// The root app, so the school-scoped surface below can be re-entered IN PROCESS.
//
// This exists because the first version of that handler did `fetch()` against the
// worker's own public hostname, and Cloudflare refuses that: a Worker fetching its
// own route comes back 522/523. In production the platform worker answered every
// signed billing request with 522 while the handler itself reported "Ok" and no
// exception was raised, so nothing local showed the problem. Calling app.fetch()
// directly runs the same routing in the same isolate, with no network hop.
let rootApp: any = null;

export function setInternalRootApp(app: any) {
  rootApp = app;
}

// Shared authorization gate for every /api/internal/* route.
//
// Preferred path: a short-lived HMAC signature over method + path + body +
// timestamp (see api/lib/internal-request-auth.ts). That bounds replay to a
// few minutes and stops a captured signature from being replayed against a
// different endpoint with a modified payload.
//
// Legacy path: the bare `X-Internal-Secret` static token, still accepted so an
// in-flight deploy cannot break mid-rollout. Set the Worker secret
// INTERNAL_SYNC_REQUIRE_SIGNATURE="true" to close it permanently.
async function authorizeInternalRequest(
  c: any,
  rawBody?: string,
): Promise<{ ok: true; secret: string } | { ok: false; response: Response }> {
  const expectedSecret = await getInternalSyncSecret(c.env);
  if (!expectedSecret) {
    return {
      ok: false,
      response: c.json(
        { success: false, message: 'Internal sync secret configured नहीं है (server misconfiguration).' },
        500,
      ),
    };
  }

  const providedSecret = c.req.header('X-Internal-Secret') || '';
  const signature = c.req.header('X-Internal-Signature') || '';
  const timestampHeader = c.req.header('X-Internal-Timestamp') || '';

  if (signature && timestampHeader) {
    const result = await verifyInternalSignature({
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      timestamp: Number(timestampHeader),
      body: rawBody ?? '',
      signature,
      secret: providedSecret,
    });
    // The signature covers the secret-bearing request, so also require the
    // static header to match. Without this, a valid signature captured for a
    // different secret would still authenticate.
    if (providedSecret !== expectedSecret) {
      return {
        ok: false,
        response: c.json({ success: false, message: 'अनधिकृत आंतरिक अनुरोध (Unauthorized internal request)' }, 401),
      };
    }
    if (!result.ok) {
      return {
        ok: false,
        response: c.json(
          {
            success: false,
            message: 'अनधिकृत आंतरिक अनुरोध (signature verification failed)',
            reason: result.reason,
          },
          401,
        ),
      };
    }
    return { ok: true, secret: expectedSecret };
  }

  if (signatureRequired(c.env)) {
    return {
      ok: false,
      response: c.json(
        { success: false, message: 'Signed internal request required (unsigned request rejected).' },
        401,
      ),
    };
  }

  if (providedSecret !== expectedSecret) {
    return {
      ok: false,
      response: c.json({ success: false, message: 'अनधिकृत आंतरिक अनुरोध (Unauthorized internal request)' }, 401),
    };
  }

  return { ok: true, secret: expectedSecret };
}

// ALL /api/internal/:schoolId/* -- the platform-authoritative surface a dedicated
// worker reaches for billing, plugins and features.
//
// WHY THIS EXISTS
//
// A dedicated worker does not answer billing itself; the platform worker holds the
// only authoritative subscription records, so the request has to be answered here.
// It used to be a transparent proxy that forwarded the school's own user token, and
// that broke the moment the two tiers were made mutually exclusive: a school role is
// valid only on its dedicated worker, and the platform tier refuses school roles, so
// every authenticated billing call on a dedicated school answered 401. Verified live
// on yagyaashram.pragnya.nasven.com: /api/auth/me 200, /api/billing/subscription 401.
//
// So the dedicated worker now signs the request as ITSELF (M2M) and does not forward
// a user credential at all. The platform therefore decides the answer from its own
// database, which is the property that keeps this from becoming a billing bypass: a
// school cannot name its own plan, it can only ask.
//
// WHY THE SCHOOL ID IS IN THE PATH
//
// INTERNAL_SYNC_SECRET is fleet-wide, so it authenticates "a dedicated worker" and not
// "this dedicated worker". A school id carried in a header could be swapped by any
// dedicated worker and the signature would still verify. The signing string covers
// the path, so putting the school id inside the path puts it inside the signature --
// no change to the signing scheme, and the school id becomes tamper-evident.
//
// The route shape is `/:schoolId/api/:surface/*`, which is what the dedicated
// worker generates. It is deliberately narrow rather than `/:schoolId/*`: Hono
// matches in registration order, and a two-segment wildcard would also match
// `/tenant-sync/<schoolId>`, `/provisioning/record` and
// `/provisioning/registry` as schoolId='tenant-sync' etc. Those have their own
// handlers further down this file and must keep winning. This shape needs four
// segments, so nothing here can collide with them.
//
// The handler below is reached only after authorizeInternalRequest succeeds, so the
// scope it pins is authenticated. The downstream billing handler is still told who is
// asking, via a header that requires the internal secret to be present, so a request
// arriving from anywhere else cannot borrow it.
internalApp.all('/:schoolId/api/:surface/*', async (c) => {
  const rawBody = c.req.method === 'GET' || c.req.method === 'HEAD'
    ? ''
    : await c.req.text().catch(() => '');

  const auth = await authorizeInternalRequest(c, rawBody);
  if (!auth.ok) return auth.response;

  const schoolId = String(c.req.param('schoolId') || '').trim();
  if (!schoolId) {
    return c.json({ success: false, message: 'schoolId आवश्यक है।' }, 400);
  }

  // Only the three proxied surfaces are reachable here. This is not a general
  // "call anything as any school" door: /api/admin and every other platform route
  // stay out of reach, and the school id is fixed by the signed path.
  const rest = new URL(c.req.url).pathname.replace(/^\/api\/internal\/[^/]+/, '');
  if (!/^\/api\/(billing|plugins|features)(\/|$)/.test(rest)) {
    return c.json({ success: false, message: 'यह internal route नहीं है।' }, 404);
  }

  const headers = new Headers();
  const contentType = c.req.header('Content-Type');
  if (contentType) headers.set('Content-Type', contentType);

  // Re-sign for the path being entered, not the one that arrived.
  //
  // The signature the dedicated worker produced covers /api/internal/<schoolId>/...,
  // because that is what it sent. This handler re-enters the billing app at
  // /api/billing/..., and api/billing verifies a signature over the path IT sees. So
  // the original signature does not verify there and every request was refused with
  // "Unauthorized internal request" -- while each hop passed in isolation, because
  // neither hop was ever asked about the other's path.
  //
  // Re-signing is the right fix rather than relaxing the check: the school id stays
  // inside the signed string, so the scope the billing app is told to trust is still
  // the scope that was signed.
  for (const [k, v] of Object.entries(await buildInternalAuthHeaders({
    secret: auth.secret,
    method: c.req.method,
    path: rest,
    body: rawBody,
  }))) {
    headers.set(k, v);
  }

  // Set only after authorizeInternalRequest passed. billing reads this as the
  // authoritative school scope instead of a user token, and it re-verifies the
  // signature above, so the header cannot be asserted by a public caller.
  headers.set('X-Verified-School-Scope', schoolId);
  // The acting role, as verified by the dedicated worker that sent this. Passed
  // through here because it arrived over the verified M2M channel, but it is NOT
  // treated as trusted at this point: api/billing re-normalises it against the
  // role list and refuses SuperAdmin, so a header that reached this far still
  // cannot buy platform-wide access.
  const actingRole = c.req.header('X-Acting-Role') || '';
  const actingEmail = c.req.header('X-Acting-Email') || '';
  if (actingRole) headers.set('X-Acting-Role', actingRole);
  if (actingEmail) headers.set('X-Acting-Email', actingEmail);

  const platformUrl = new URL(c.req.url);
  platformUrl.pathname = rest;

  const reentry = new Request(platformUrl.toString(), {
    method: c.req.method,
    headers,
    body: rawBody || undefined,
  });

  // In process, NOT over the network. See setInternalRootApp above: a Worker
  // fetching its own public hostname is answered 522/523 by Cloudflare, which is
  // what this returned in production while reporting no error at all.
  //
  // c.executionCtx is deliberately NOT forwarded. Reading that getter throws when no
  // ExecutionContext exists, so touching it here turned a routing decision into a
  // 500 anywhere the context is absent -- which is exactly what the in-process test
  // harness is. Nothing under /api/billing, /api/plugins or /api/features uses it.
  if (rootApp) {
    return rootApp.fetch(reentry, c.env, undefined);
  }

  return c.json(
    { success: false, message: 'Internal dispatcher not registered (server misconfiguration).' },
    500,
  );
});

// GET /api/internal/tenant-sync/:schoolId
// Internal endpoint used by dedicated workers and deployment scripts to sync tenant metadata
// from the central platform control plane. Protected by a signed internal request and a
// domain-separated encryption key.
internalApp.get('/tenant-sync/:schoolId', async (c) => {
  const auth = await authorizeInternalRequest(c);
  if (!auth.ok) return auth.response;
  const expectedSecret = auth.secret;

  const schoolId = c.req.param('schoolId');
  if (!schoolId) {
    return c.json({ success: false, message: 'schoolId आवश्यक है।' }, 400);
  }

  const db = getDB(c);
  if (!db) {
    return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  }

  const tenant = await db.prepare('SELECT * FROM school_tenants WHERE id = ?').bind(schoolId).first();
  const profile = await db.prepare('SELECT * FROM school_profile WHERE id = ?').bind(schoolId).first();
  const usersRows = await db.prepare(
    'SELECT id, username, full_name, email, phone, role, designation, department, qualification, salary, status, last_login, created_at, updated_at, password_hash, school_id '
    + 'FROM system_users WHERE school_id = ?'
  ).bind(schoolId).all();
  const subscription = await db.prepare('SELECT * FROM school_subscriptions WHERE school_id = ?').bind(schoolId).first();

  let emailConfig = null;
  try {
    emailConfig = await db.prepare('SELECT * FROM school_email_config WHERE school_id = ?').bind(schoolId).first();
  } catch (_) {
    // optional table
  }

  const rawUsers = (usersRows.results || []) as any[];
  if (!tenant && !profile && rawUsers.length === 0) {
    return c.json({ success: false, message: 'स्कूल डेटा नहीं मिला।' }, 404);
  }

  // Sanitize user records so no password hashes are exposed in the users array
  const cleanUsers: any[] = [];
  const credentialsMap: Record<string, string> = {};

  for (const u of rawUsers) {
    const { password_hash, ...safeUser } = u;
    cleanUsers.push(safeUser);
    if (password_hash) {
      credentialsMap[u.id] = password_hash;
    }
  }

  // Encrypt authentication credentials via domain-separated AES-GCM
  let encryptedCredentials = '';
  try {
    const syncKey = await deriveSyncKey(expectedSecret, schoolId);
    encryptedCredentials = await encryptPayload(syncKey, credentialsMap);
  } catch (encErr) {
    console.error('Failed to encrypt tenant sync credentials:', encErr);
    return c.json({ success: false, message: 'क्रेडेंशियल्स एन्क्रिप्शन विफल रहा।' }, 500);
  }

  return c.json({
    success: true,
    schoolId,
    tenant,
    profile,
    users: cleanUsers,
    encryptedCredentials,
    subscription,
    emailConfig,
  });
});

// POST /api/internal/provisioning/record
// Called by the deploy pipeline (scripts/provision-school.mjs) AFTER the per-school
// Cloudflare resources (D1 database, R2 bucket, KV namespace) are created. Persists
// the resource identifiers into the control-plane school_tenants row so the main DB
// is the single source of truth for provisioning, and marks the school 'live'
// (production-ready) once all three resources exist.
internalApp.post('/provisioning/record', async (c) => {
  // Read the raw body first: the request signature covers the exact payload.
  const rawBody = await c.req.raw.clone().text().catch(() => '');
  const auth = await authorizeInternalRequest(c, rawBody);
  if (!auth.ok) return auth.response;

  const db = getDB(c);
  if (!db) {
    return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  }

  const body: any = await c.req.json().catch(() => null);
  if (!body) {
    return c.json({ success: false, message: 'अमान्य JSON बॉडी।' }, 400);
  }

  const schoolId = String(body.schoolId || '').trim();
  const slug = String(body.slug || '').trim();
  const domain = String(body.domain || '').trim();
  const d1DatabaseId = String(body.d1DatabaseId || '').trim();
  const r2BucketName = String(body.r2BucketName || '').trim();
  const kvNamespaceId = String(body.kvNamespaceId || '').trim();
  const schoolName = String(body.schoolName || '').trim();

  if (!schoolId) {
    return c.json({ success: false, message: 'schoolId आवश्यक है।' }, 400);
  }
  if (!slug || !d1DatabaseId || !r2BucketName || !kvNamespaceId) {
    return c.json({ success: false, message: 'slug, d1DatabaseId, r2BucketName और kvNamespaceId सभी आवश्यक हैं।' }, 400);
  }

  const now = new Date().toISOString();
  const subdomain = slug;
  const contactEmail = 'admin@' + slug + '.pragnya.nasven.com';
  // Upsert: अगर school_tenants row मौजूद नहीं है (जैसे स्कूल normal registration
  // path से बाहर बना हो) तो भी record बन जाता है — silent no-op से बचने के लिए।
  await db.prepare(
    'INSERT INTO school_tenants (id, school_name, subdomain, contact_email, contact_phone, status, registration_status, dedicated_slug, dedicated_domain, d1_database_id, r2_bucket_name, kv_namespace_id, provisioning_status, provisioned_at, provisioning_error) '
    + 'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) '
    + 'ON CONFLICT(id) DO UPDATE SET school_name=excluded.school_name, subdomain=excluded.subdomain, '
    + 'dedicated_slug=excluded.dedicated_slug, dedicated_domain=excluded.dedicated_domain, '
    + 'd1_database_id=excluded.d1_database_id, r2_bucket_name=excluded.r2_bucket_name, '
    + 'kv_namespace_id=excluded.kv_namespace_id, provisioning_status=excluded.provisioning_status, '
    + 'provisioned_at=excluded.provisioned_at, provisioning_error=excluded.provisioning_error'
  ).bind(
    schoolId,
    schoolName || slug,
    subdomain,
    contactEmail,
    '',
    'Active',
    'Approved',
    slug,
    domain,
    d1DatabaseId,
    r2BucketName,
    kvNamespaceId,
    'live',
    now,
    ''
  ).run();

  return c.json({ success: true, message: 'प्रोविज़निंग रिकॉर्ड सेव हो गया।', schoolId, slug, domain });
});

// GET /api/internal/provisioning/registry
// Returns the provisioning metadata of every dedicated school from the control-plane
// DB. Used by the deploy pipeline (scripts/generate-school-configs.mjs) to build the
// per-school wrangler configs from the main DB at deploy time.
internalApp.get('/provisioning/registry', async (c) => {
  const auth = await authorizeInternalRequest(c);
  if (!auth.ok) return auth.response;

  const db = getDB(c);
  if (!db) {
    return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  }

  const rows = await db.prepare(
    'SELECT id AS schoolId, school_name, dedicated_slug AS slug, dedicated_domain AS domain, '
    + 'd1_database_id AS d1DatabaseId, r2_bucket_name AS r2BucketName, kv_namespace_id AS kvNamespaceId, '
    + 'provisioning_status AS provisioningStatus '
    + "FROM school_tenants WHERE dedicated_slug IS NOT NULL AND dedicated_slug != ''"
  ).all();

  return c.json({ success: true, schools: (rows.results || []) });
});

export default internalApp;
