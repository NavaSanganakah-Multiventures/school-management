import { Hono } from 'hono';
import { getDB } from '../db';

export const internalApp = new Hono<{ Bindings: any }>();

// GET /api/internal/tenant-sync/:schoolId
// Internal endpoint used by dedicated workers and deployment scripts to sync tenant metadata
// from the central platform control plane. Protected by X-Internal-Secret: AUTH_SECRET.
internalApp.get('/tenant-sync/:schoolId', async (c) => {
  const secret = c.req.header('X-Internal-Secret') || '';
  const expectedSecret = (c.env && (c.env.INTERNAL_SYNC_SECRET || c.env.AUTH_SECRET)) || '';

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
  const usersRows = await db.prepare('SELECT * FROM system_users WHERE school_id = ?').bind(schoolId).all();
  const subscription = await db.prepare('SELECT * FROM school_subscriptions WHERE school_id = ?').bind(schoolId).first();

  let emailConfig = null;
  try {
    emailConfig = await db.prepare('SELECT * FROM school_email_config WHERE school_id = ?').bind(schoolId).first();
  } catch (_) {
    // optional table
  }

  if (!tenant && !profile && (!usersRows.results || usersRows.results.length === 0)) {
    return c.json({ success: false, message: 'स्कूल डेटा नहीं मिला।' }, 404);
  }

  return c.json({
    success: true,
    schoolId,
    tenant,
    profile,
    users: usersRows.results || [],
    subscription,
    emailConfig,
  });
});

export default internalApp;
