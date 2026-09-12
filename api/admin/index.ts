import { Hono } from 'hono';
import { getDB, loadSubscriptionPlans, loadSubscriptionPlanById } from '../db';
import { getAuthUser, hashPassword } from '../lib/auth';

const adminApp = new Hono<{ Bindings: any }>();

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
    deletedAt: row.deleted_at || '',
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
  const rows = await db.prepare('SELECT s.*, sub.plan_id AS sub_plan_id, sub.plan_name AS sub_plan_name, sub.status AS sub_status, sub.trial_ends_at AS trial_ends_at FROM school_tenants s LEFT JOIN school_subscriptions sub ON sub.school_id = s.id WHERE s.deleted_at IS NULL ORDER BY s.created_at DESC').all();
  const schools = (rows.results || []).map(tenantToJson);
  return c.json({ success: true, schools });
});

// GET /api/admin/registrations - pending approvals
adminApp.get('/registrations', async (c) => {
  const guard = await requireSuperAdmin(c);
  if (!guard.ok) return guard.error;
  const db = getDB(c);
  const rows = await db.prepare('SELECT s.*, sub.plan_name AS sub_plan_name FROM school_tenants s LEFT JOIN school_subscriptions sub ON sub.school_id = s.id WHERE s.registration_status = ? AND s.deleted_at IS NULL ORDER BY s.created_at DESC').bind('Pending_Approval').all();
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

// POST /api/admin/schools/create - Super Admin द्वारा नया स्कूल जोड़ें
adminApp.post('/schools/create', async (c) => {
  const guard = await requireSuperAdmin(c);
  if (!guard.ok) return guard.error;
  const db = getDB(c);
  const body = await c.req.json().catch(() => ({}));

  const schoolName = String(body.schoolName || '').trim();
  const directorName = String(body.directorName || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const phone = String(body.phone || '').trim();
  const password = String(body.password || '').trim();

  if (!schoolName || !directorName || !email || !phone || !password) {
    return c.json({ success: false, message: 'स्कूल का नाम, डायरेक्टर, ईमेल, फोन और पासवर्ड अनिवार्य हैं।' }, 400);
  }
  if (password.length < 6) return c.json({ success: false, message: 'पासवर्ड कम से कम 6 अक्षरों का होना चाहिए।' }, 400);

  const emailExists = await db.prepare('SELECT id FROM system_users WHERE LOWER(email) = ?').bind(email).first();
  if (emailExists) return c.json({ success: false, message: 'इस ईमेल से पहले से खाता मौजूद है।' }, 409);

  const schoolId = 'school-' + Date.now();
  const userId = 'usr-' + Date.now();
  const subdomain = String(body.subdomain || ('school' + Date.now().toString().slice(-6))).toLowerCase().replace(/[^a-z0-9-]/g, '');
  const subExists = await db.prepare('SELECT id FROM school_tenants WHERE subdomain = ?').bind(subdomain).first();
  if (subExists) return c.json({ success: false, message: 'यह सबडोमेन पहले से उपयोग में है।' }, 409);

  const planId = body.planId || 'starter';
  const plan = await loadSubscriptionPlanById(db, planId);
  if (!plan || plan.isTrial) return c.json({ success: false, message: 'अमान्य प्लान चयन।' }, 400);

  const now = new Date().toISOString();
  const passwordHash = await hashPassword(password);

  await db.prepare('INSERT INTO school_tenants (id, school_name, subdomain, custom_domain, contact_email, contact_phone, status, registration_status, plan_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .bind(schoolId, schoolName, subdomain, body.customDomain || '', email, phone, 'Active', 'Approved', planId, now).run();

  await db.prepare('INSERT INTO school_profile (id, school_name, affiliation_number, board_name, school_code, email, phone, alternate_phone, address, city, state, pincode, academic_session, director_name, principal_name, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(schoolId, schoolName, body.affiliationNumber || '', body.boardName || 'CBSE', body.schoolCode || '', email, phone, body.alternatePhone || '', body.address || '-', body.city || '-', body.state || '-', body.pincode || '-', body.academicSession || '2026-2027', directorName, body.principalName || directorName, now.split('T')[0]).run();

  await db.prepare('INSERT INTO system_users (id, username, full_name, email, phone, role, designation, department, qualification, salary, status, school_id, password_hash, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(userId, email.split('@')[0], directorName, email, phone, 'Director', body.designation || 'स्कूल निदेशक (Director)', 'प्रबंधन एवं प्रशासन', body.qualification || '', 0, 'Active', schoolId, passwordHash, now).run();

  await db.prepare('INSERT INTO school_subscriptions (id, school_id, plan_id, plan_name, billing_cycle, price_per_cycle, discount_percent, status, auto_pay_enabled, payment_method, mandate_id, next_billing_date, period_start, period_end, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind('sub-' + Date.now(), schoolId, plan.id, plan.name, body.billingCycle || 'annual', plan.annualPrice || 0, 0, 'Active', 1, 'Manual', '', now.split('T')[0], now.split('T')[0], now.split('T')[0], now).run();

  return c.json({ success: true, message: 'विद्यालय सफलतापूर्वक जोड़ा गया।', schoolId });
});

// POST /api/admin/schools/plan - assign/override plan (admin control, dynamic plans)
adminApp.post('/schools/plan', async (c) => {
  const guard = await requireSuperAdmin(c);
  if (!guard.ok) return guard.error;
  const db = getDB(c);
  const body = await c.req.json().catch(() => ({}));
  const schoolId = body.schoolId;
  const planId = body.planId || 'starter';
  if (!schoolId) return c.json({ success: false, message: 'schoolId आवश्यक है।' }, 400);
  const plan = await loadSubscriptionPlanById(db, planId);
  if (!plan || plan.isTrial) return c.json({ success: false, message: 'अमान्य प्लान। ट्रायल प्लान असाइन नहीं किया जा सकता।' }, 400);
  await db.prepare('UPDATE school_subscriptions SET plan_id=?, plan_name=?, status=?, updated_at=? WHERE school_id=?')
    .bind(plan.id, plan.name, 'Active', new Date().toISOString(), schoolId).run();
  await db.prepare('UPDATE school_tenants SET plan_id=?, status=?, registration_status=?, trial_ends_at=? WHERE id=?')
    .bind(plan.id, 'Active', 'Approved', '', schoolId).run();
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

  await db.prepare('UPDATE school_profile SET school_name=?, affiliation_number=?, board_name=?, school_code=?, email=?, phone=?, alternate_phone=?, address=?, city=?, state=?, pincode=?, director_name=?, principal_name=?, updated_at=? WHERE id=?')
    .bind(
      val('schoolName', existing.school_name),
      val('affiliationNumber', existing.affiliation_number),
      val('boardName', existing.board_name),
      val('schoolCode', existing.school_code),
      val('email', existing.email),
      val('phone', existing.phone),
      val('alternatePhone', existing.alternate_phone),
      val('address', existing.address),
      val('city', existing.city),
      val('state', existing.state),
      val('pincode', existing.pincode),
      val('directorName', existing.director_name),
      val('principalName', existing.principal_name),
      new Date().toISOString().split('T')[0],
      schoolId
    ).run();

  await db.prepare('UPDATE school_tenants SET school_name=?, contact_email=?, contact_phone=?, subdomain=?, custom_domain=?, status=? WHERE id=?')
    .bind(
      val('schoolName', existing.school_name),
      val('email', existing.email),
      val('phone', existing.phone),
      val('subdomain', (await db.prepare('SELECT subdomain FROM school_tenants WHERE id = ?').bind(schoolId).first()).subdomain),
      val('customDomain', (await db.prepare('SELECT custom_domain FROM school_tenants WHERE id = ?').bind(schoolId).first()).custom_domain),
      val('status', (await db.prepare('SELECT status FROM school_tenants WHERE id = ?').bind(schoolId).first()).status),
      schoolId
    ).run();

  return c.json({ success: true, message: 'स्कूल की जानकारी अपडेट कर दी गई।' });
});

// POST /api/admin/schools/delete - soft delete (सुरक्षित हटाना, डेटा सुरक्षित रहता है)
adminApp.post('/schools/delete', async (c) => {
  const guard = await requireSuperAdmin(c);
  if (!guard.ok) return guard.error;
  const db = getDB(c);
  const body = await c.req.json().catch(() => ({}));
  const schoolId = body.schoolId;
  if (!schoolId) return c.json({ success: false, message: 'schoolId आवश्यक है।' }, 400);
  const tenant = await db.prepare('SELECT id FROM school_tenants WHERE id = ?').bind(schoolId).first();
  if (!tenant) return c.json({ success: false, message: 'स्कूल नहीं मिला।' }, 404);
  await db.prepare('UPDATE school_tenants SET deleted_at=?, status=?, registration_status=? WHERE id=?')
    .bind(new Date().toISOString(), 'Suspended', 'Deleted', schoolId).run();
  return c.json({ success: true, message: 'विद्यालय को हटा दिया गया (सॉफ्ट-डिलीट)।' });
});

// POST /api/admin/schools/restore - हटाए गए स्कूल को वापस लाएं
adminApp.post('/schools/restore', async (c) => {
  const guard = await requireSuperAdmin(c);
  if (!guard.ok) return guard.error;
  const db = getDB(c);
  const body = await c.req.json().catch(() => ({}));
  const schoolId = body.schoolId;
  if (!schoolId) return c.json({ success: false, message: 'schoolId आवश्यक है।' }, 400);
  const tenant = await db.prepare('SELECT id FROM school_tenants WHERE id = ?').bind(schoolId).first();
  if (!tenant) return c.json({ success: false, message: 'स्कूल नहीं मिला।' }, 404);
  await db.prepare('UPDATE school_tenants SET deleted_at=NULL, status=?, registration_status=? WHERE id=?')
    .bind('Active', 'Approved', schoolId).run();
  return c.json({ success: true, message: 'विद्यालय को वापस सक्रिय कर दिया गया।' });
});

// ---------------- Dynamic Plans CRUD ----------------

// GET /api/admin/plans - सभी प्लान (active/inactive सहित)
adminApp.get('/plans', async (c) => {
  const guard = await requireSuperAdmin(c);
  if (!guard.ok) return guard.error;
  const db = getDB(c);
  const plans = await loadSubscriptionPlans(db);
  return c.json({ success: true, plans });
});

// POST /api/admin/plans - नया प्लान बनाएं
adminApp.post('/plans', async (c) => {
  const guard = await requireSuperAdmin(c);
  if (!guard.ok) return guard.error;
  const db = getDB(c);
  const body = await c.req.json().catch(() => ({}));

  const name = String(body.name || '').trim();
  if (!name) return c.json({ success: false, message: 'प्लान का नाम आवश्यक है।' }, 400);

  const id = String(body.id || ('plan-' + Date.now())).trim().toLowerCase().replace(/[^a-z0-9-_]/g, '') || ('plan-' + Date.now());
  const existing = await db.prepare('SELECT id FROM subscription_plans WHERE id = ?').bind(id).first();
  if (existing) return c.json({ success: false, message: 'यह प्लान आईडी पहले से मौजूद है।' }, 409);

  const maxStudents = (body.maxStudents === undefined || body.maxStudents === null || body.maxStudents === '') ? null : Number(body.maxStudents);
  const maxStaff = (body.maxStaff === undefined || body.maxStaff === null || body.maxStaff === '') ? null : Number(body.maxStaff);
  const now = new Date().toISOString();

  await db.prepare('INSERT INTO subscription_plans (id, name, tagline, badge, monthly_price, quarterly_price, annual_price, max_students, max_staff, max_students_label, modules, features, feature_flags, recommended, active, is_trial, sort_order, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(
      id,
      name,
      String(body.tagline || ''),
      String(body.badge || ''),
      Number(body.monthlyPrice) || 0,
      Number(body.quarterlyPrice) || 0,
      Number(body.annualPrice) || 0,
      maxStudents,
      maxStaff,
      String(body.maxStudentsLabel || ''),
      JSON.stringify(Array.isArray(body.modules) ? body.modules : []),
      JSON.stringify(Array.isArray(body.features) ? body.features : []),
      JSON.stringify(body.featureFlags || {}),
      body.recommended ? 1 : 0,
      body.active === false ? 0 : 1,
      body.isTrial ? 1 : 0,
      Number(body.sortOrder) || 0,
      now,
      now
    ).run();

  const plan = await loadSubscriptionPlanById(db, id);
  return c.json({ success: true, message: 'नया प्लान बना दिया गया।', plan });
});

// POST /api/admin/plans/update - मौजूदा प्लान एडिट करें
adminApp.post('/plans/update', async (c) => {
  const guard = await requireSuperAdmin(c);
  if (!guard.ok) return guard.error;
  const db = getDB(c);
  const body = await c.req.json().catch(() => ({}));
  const id = String(body.id || '').trim();
  if (!id) return c.json({ success: false, message: 'प्लान आईडी आवश्यक है।' }, 400);

  const existing = await db.prepare('SELECT * FROM subscription_plans WHERE id = ?').bind(id).first();
  if (!existing) return c.json({ success: false, message: 'प्लान नहीं मिला।' }, 404);

  const str = (v: any, fb: any) => (v === undefined || v === null) ? fb : String(v);
  const num = (v: any, fb: any) => (v === undefined || v === null || v === '') ? fb : Number(v);
  const toInt = (v: any, fb: any) => (v === undefined || v === null) ? fb : (v ? 1 : 0);
  const maxStudents = (body.maxStudents === undefined || body.maxStudents === null) ? existing.max_students : (body.maxStudents === '' ? null : Number(body.maxStudents));
  const maxStaff = (body.maxStaff === undefined || body.maxStaff === null) ? existing.max_staff : (body.maxStaff === '' ? null : Number(body.maxStaff));
  const now = new Date().toISOString();

  await db.prepare('UPDATE subscription_plans SET name=?, tagline=?, badge=?, monthly_price=?, quarterly_price=?, annual_price=?, max_students=?, max_staff=?, max_students_label=?, modules=?, features=?, feature_flags=?, recommended=?, active=?, is_trial=?, sort_order=?, updated_at=? WHERE id=?')
    .bind(
      str(body.name, existing.name),
      str(body.tagline, existing.tagline),
      str(body.badge, existing.badge),
      num(body.monthlyPrice, existing.monthly_price),
      num(body.quarterlyPrice, existing.quarterly_price),
      num(body.annualPrice, existing.annual_price),
      maxStudents,
      maxStaff,
      str(body.maxStudentsLabel, existing.max_students_label),
      JSON.stringify(Array.isArray(body.modules) ? body.modules : JSON.parse(existing.modules || '[]')),
      JSON.stringify(Array.isArray(body.features) ? body.features : JSON.parse(existing.features || '[]')),
      JSON.stringify(body.featureFlags !== undefined ? body.featureFlags : JSON.parse(existing.feature_flags || '{}')),
      toInt(body.recommended, existing.recommended),
      toInt(body.active, existing.active),
      toInt(body.isTrial, existing.is_trial),
      num(body.sortOrder, existing.sort_order),
      now,
      id
    ).run();

  const plan = await loadSubscriptionPlanById(db, id);
  return c.json({ success: true, message: 'प्लान अपडेट कर दिया गया।', plan });
});

// POST /api/admin/plans/delete - प्लान निष्क्रिय करें (soft delete)
adminApp.post('/plans/delete', async (c) => {
  const guard = await requireSuperAdmin(c);
  if (!guard.ok) return guard.error;
  const db = getDB(c);
  const body = await c.req.json().catch(() => ({}));
  const id = String(body.id || '').trim();
  if (!id) return c.json({ success: false, message: 'प्लान आईडी आवश्यक है।' }, 400);
  const existing = await db.prepare('SELECT id FROM subscription_plans WHERE id = ?').bind(id).first();
  if (!existing) return c.json({ success: false, message: 'प्लान नहीं मिला।' }, 404);
  await db.prepare('UPDATE subscription_plans SET active=0, updated_at=? WHERE id=?').bind(new Date().toISOString(), id).run();
  return c.json({ success: true, message: 'प्लान निष्क्रिय कर दिया गया।' });
});

export default adminApp;
