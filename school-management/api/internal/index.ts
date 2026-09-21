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

export default internalApp;
