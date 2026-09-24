import { Hono } from 'hono';
import { getDB } from '../db';
import { deriveSyncKey, encryptPayload, getInternalSyncSecret } from '../lib/tenant-crypto';

export const internalApp = new Hono<{ Bindings: any }>();

// GET /api/internal/tenant-sync/:schoolId
// Internal endpoint used by dedicated workers and deployment scripts to sync tenant metadata
// from the central platform control plane. Protected by X-Internal-Secret and domain-separated key.
internalApp.get('/tenant-sync/:schoolId', async (c) => {
  const secret = c.req.header('X-Internal-Secret') || '';
  const expectedSecret = await getInternalSyncSecret(c.env);

  if (!expectedSecret || secret !== expectedSecret) {
    return c.json({ success: false, message: 'अनधिकृत आंतरिक अनुरोध (Unauthorized internal request)' }, 401);
  }

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
  const secret = c.req.header('X-Internal-Secret') || '';
  const expectedSecret = await getInternalSyncSecret(c.env);

  if (!expectedSecret || secret !== expectedSecret) {
    return c.json({ success: false, message: 'अनधिकृत आंतरिक अनुरोध (Unauthorized internal request)' }, 401);
  }

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
  const secret = c.req.header('X-Internal-Secret') || '';
  const expectedSecret = await getInternalSyncSecret(c.env);

  if (!expectedSecret || secret !== expectedSecret) {
    return c.json({ success: false, message: 'अनधिकृत आंतरिक अनुरोध (Unauthorized internal request)' }, 401);
  }

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
