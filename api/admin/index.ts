import { Hono } from 'hono';
import { getDB } from '../db';
import { getAuthUser } from '../lib/auth';
import { hashPassword } from '../lib/auth';

const adminApp = new Hono();

async function requireSuperAdmin(c: any) {
  const authUser = await getAuthUser(c);
  if (!authUser || authUser.role !== 'SuperAdmin') {
    return { ok: false, authUser, error: c.json({ success: false, message: 'केवल Super Admin की अनुमति है।' }, 403) };
  }
  return { ok: true, authUser };
}

function tenantToJson(row: any) {
  const trial = row.status === 'Trial';
  return {
    id: row.id,
    schoolName: row.school_name,
    subdomain: row.subdomain,
    customDomain: row.custom_domain || '',
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    status: row.status,
    registrationStatus: row.registration_status || 'Active',
    planId: trial ? 'trial' : (row.sub_plan_id || row.plan_id || 'trial'),
    planName: trial ? '7-दिन फ्री ट्रायल' : (row.sub_plan_name || row.plan_name || '7-दिन फ्री ट्रायल'),
    trialEndsAt: row.trial_ends_at || '',
    createdAt: row.created_at,
  };
}

// POST /api/admin/bootstrap - one-time first Super Admin creation from env secrets
adminApp.post('/bootstrap', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const existing = await db.prepare('SELECT COUNT(*) AS n FROM platform_admins').first();
  if (existing && existing.n > 0) {
    return c.json({ success: false, message: 'Super Admin पहले से मौजूद है।' }, 403);
  }
  const email = String((c.env && c.env.PLATFORM_ADMIN_EMAIL) || '').trim().toLowerCase();
  const password = String((c.env && c.env.PLATFORM_ADMIN_PASSWORD) || '').trim();
  if (!email || !password) {
    return c.json({ success: false, message: 'PLATFORM_ADMIN_EMAIL और PLATFORM_ADMIN_PASSWORD env secrets सेट करें।' }, 400);
  }
  const passwordHash = await hashPassword(password);
  await db.prepare('INSERT INTO platform_admins (id, email, password_hash, full_name, phone, status, created_at) VALUES (?,?,?,?,?,?,?)')
    .bind('adm-' + Date.now(), email, passwordHash, 'Platform Admin', '', 'Active', new Date().toISOString()).run();
  return c.json({ success: true, message: 'Super Admin सफलतापूर्वक बूटस्ट्रैप हो गया।' });
});

// GET /api/admin/schools - सभी स्कूल (किस स्कूल के पास कौन-सा प्लान)
adminApp.get('/schools', async (c) => {
  const guard = await requireSuperAdmin(c);
  if (!guard.ok) return guard.error;
  const db = getDB(c);
  const rows = await db.prepare('SELECT s.*, sub.plan_id AS sub_plan_id, sub.plan_name AS sub_plan_name, sub.status AS sub_status, sub.trial_ends_at AS trial_ends_at FROM school_tenants s LEFT JOIN school_subscriptions sub ON sub.school_id = s.id ORDER BY s.created_at DESC').all();
  const schools = (rows.results || []).map(tenantToJson);
  return c.json({ success: true, schools });
});

// GET /api/admin/registrations - pending approvals
adminApp.get('/registrations', async (c) => {
  const guard = await requireSuperAdmin(c);
  if (!guard.ok) return guard.error;
  const db = getDB(c);
  const rows = await db.prepare('SELECT s.*, sub.plan_name AS sub_plan_name FROM school_tenants s LEFT JOIN school_subscriptions sub ON sub.school_id = s.id WHERE s.registration_status = ? ORDER BY s.created_at DESC').bind('Pending_Approval').all();
  return c.json({ success: true, registrations: (rows.results || []).map(tenantToJson) });
});

// POST /api/admin/registrations/approve - approve and start 7-day trial
adminApp.post('/registrations/approve', async (c) => {
  const guard = await requireSuperAdmin(c);
  if (!guard.ok) return guard.error;
  const db = getDB(c);
  const body = await c.req.json().catch(() => ({}));
  const schoolId = body.schoolId;
  if (!schoolId) return c.json({ success: false, message: 'schoolId आवश्यक है।' }, 400);
  const trialEnds = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  await db.prepare('UPDATE school_tenants SET status=?, registration_status=?, trial_ends_at=?, approved_at=?, approved_by=? WHERE id=?')
    .bind('Trial', 'Approved', trialEnds, new Date().toISOString(), guard.authUser.sub, schoolId).run();
  await db.prepare('UPDATE school_subscriptions SET status=?, trial_ends_at=? WHERE school_id=?').bind('Trial', trialEnds, schoolId).run();
  return c.json({ success: true, message: 'स्कूल अप्रूव्ड। 7-दिन का फ्री ट्रायल शुरू हो गया।' });
});

// POST /api/admin/registrations/reject
adminApp.post('/registrations/reject', async (c) => {
  const guard = await requireSuperAdmin(c);
  if (!guard.ok) return guard.error;
  const db = getDB(c);
  const body = await c.req.json().catch(() => ({}));
  const schoolId = body.schoolId;
  if (!schoolId) return c.json({ success: false, message: 'schoolId आवश्यक है।' }, 400);
  await db.prepare('UPDATE school_tenants SET status=?, registration_status=? WHERE id=?').bind('Suspended', 'Rejected', schoolId).run();
  return c.json({ success: true, message: 'स्कूल रजिस्ट्रेशन अस्वीकृत कर दिया गया।' });
});

// POST /api/admin/schools/plan - assign/override plan (admin control)
adminApp.post('/schools/plan', async (c) => {
  const guard = await requireSuperAdmin(c);
  if (!guard.ok) return guard.error;
  const db = getDB(c);
  const body = await c.req.json().catch(() => ({}));
  const schoolId = body.schoolId;
  const planId = body.planId || 'starter';
  if (!schoolId) return c.json({ success: false, message: 'schoolId आवश्यक है।' }, 400);
  const allowed = ['starter', 'pro', 'enterprise'];
  if (allowed.indexOf(planId) === -1) return c.json({ success: false, message: 'अमान्य प्लान।' }, 400);
  const planNames = { starter: 'स्टार्टर प्लान (Starter)', pro: 'प्रोफेशनल प्लान (Professional)', enterprise: 'एंटरप्राइज प्लान (Enterprise)' };
  await db.prepare('UPDATE school_subscriptions SET plan_id=?, plan_name=?, status=?, updated_at=? WHERE school_id=?')
    .bind(planId, planNames[planId], 'Active', new Date().toISOString(), schoolId).run();
  await db.prepare('UPDATE school_tenants SET plan_id=?, status=?, registration_status=?, trial_ends_at=? WHERE id=?')
    .bind(planId, 'Active', 'Approved', '', schoolId).run();
  return c.json({ success: true, message: 'स्कूल का प्लान अपडेट कर दिया गया।' });
});

// POST /api/admin/schools/update - edit any school profile
adminApp.post('/schools/update', async (c) => {
  const guard = await requireSuperAdmin(c);
  if (!guard.ok) return guard.error;
  const db = getDB(c);
  const body = await c.req.json().catch(() => ({}));
  const schoolId = body.schoolId;
  if (!schoolId) return c.json({ success: false, message: 'schoolId आवश्यक है।' }, 400);
  const existing = await db.prepare('SELECT * FROM school_profile WHERE id = ?').bind(schoolId).first();
  if (!existing) return c.json({ success: false, message: 'स्कूल प्रोफ़ाइल नहीं मिली।' }, 404);
  const val = (field: any, fallback: any) => (body[field] !== undefined && body[field] !== null && body[field] !== '') ? body[field] : fallback;
  await db.prepare('UPDATE school_profile SET school_name=?, affiliation_number=?, board_name=?, school_code=?, email=?, phone=?, address=?, city=?, state=?, pincode=?, director_name=?, principal_name=?, updated_at=? WHERE id=?')
    .bind(
      val('schoolName', existing.school_name),
      val('affiliationNumber', existing.affiliation_number),
      val('boardName', existing.board_name),
      val('schoolCode', existing.school_code),
      val('email', existing.email),
      val('phone', existing.phone),
      val('address', existing.address),
      val('city', existing.city),
      val('state', existing.state),
      val('pincode', existing.pincode),
      val('directorName', existing.director_name),
      val('principalName', existing.principal_name),
      new Date().toISOString().split('T')[0],
      schoolId
    ).run();
  await db.prepare('UPDATE school_tenants SET school_name=?, contact_email=?, contact_phone=? WHERE id=?')
    .bind(val('schoolName', existing.school_name), val('email', existing.email), val('phone', existing.phone), schoolId).run();
  return c.json({ success: true, message: 'स्कूल की जानकारी अपडेट कर दी गई।' });
});

export default adminApp;
