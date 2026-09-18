import { Hono } from 'hono';
import { getDB, loadSubscriptionPlans, loadSubscriptionPlanById, makeUniqueUsername } from '../db';
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

// GET /api/admin/schools/deleted - हटाए गए स्कूलों की सूची (restore के लिए)
adminApp.get('/schools/deleted', async (c) => {
  const guard = await requireSuperAdmin(c);
  if (!guard.ok) return guard.error;
  const db = getDB(c);
  const rows = await db.prepare('SELECT s.*, sub.plan_id AS sub_plan_id, sub.plan_name AS sub_plan_name, sub.status AS sub_status, sub.trial_ends_at AS trial_ends_at FROM school_tenants s LEFT JOIN school_subscriptions sub ON sub.school_id = s.id WHERE s.deleted_at IS NOT NULL ORDER BY s.deleted_at DESC').all();
  return c.json({ success: true, schools: (rows.results || []).map(tenantToJson) });
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
  const username = await makeUniqueUsername(db, email);

  await db.prepare('INSERT INTO school_tenants (id, school_name, subdomain, custom_domain, contact_email, contact_phone, status, registration_status, plan_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .bind(schoolId, schoolName, subdomain, body.customDomain || '', email, phone, 'Active', 'Approved', planId, now).run();

  await db.prepare('INSERT INTO school_profile (id, school_name, affiliation_number, board_name, school_code, email, phone, alternate_phone, address, city, state, pincode, academic_session, director_name, principal_name, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(schoolId, schoolName, body.affiliationNumber || '', body.boardName || 'CBSE', body.schoolCode || '', email, phone, body.alternatePhone || '', body.address || '-', body.city || '-', body.state || '-', body.pincode || '-', body.academicSession || '2026-2027', directorName, body.principalName || directorName, now.split('T')[0]).run();

  await db.prepare('INSERT INTO system_users (id, username, full_name, email, phone, role, designation, department, qualification, salary, status, school_id, password_hash, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(userId, username, directorName, email, phone, 'Director', body.designation || 'स्कूल निदेशक (Director)', 'प्रबंधन एवं प्रशासन', body.qualification || '', 0, 'Active', schoolId, passwordHash, now).run();

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

  const tenant = await db.prepare('SELECT subdomain, custom_domain, status FROM school_tenants WHERE id = ?').bind(schoolId).first();
  await db.prepare('UPDATE school_tenants SET school_name=?, contact_email=?, contact_phone=?, subdomain=?, custom_domain=?, status=? WHERE id=?')
    .bind(
      val('schoolName', existing.school_name),
      val('email', existing.email),
      val('phone', existing.phone),
      val('subdomain', tenant ? tenant.subdomain : ''),
      val('customDomain', tenant ? tenant.custom_domain : ''),
      val('status', tenant ? tenant.status : 'Active'),
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

// ==========================================
// Super Admin Plugin Catalog & Management
// ==========================================

// GET /api/admin/plugins - सभी प्लगइन्स की सूची व उनके सक्रिय ग्राहक
adminApp.get('/plugins', async (c) => {
  const guard = await requireSuperAdmin(c);
  if (!guard.ok) return guard.error;
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);

  const { results: plugins } = await db.prepare(`
    SELECT p.*,
      (SELECT COUNT(*) FROM school_plugins sp WHERE sp.plugin_id = p.id AND sp.status = 'active') AS active_subscribers_count
    FROM plugins p
    ORDER BY p.name ASC
  `).all();

  return c.json({ success: true, plugins: plugins || [] });
});

// POST /api/admin/plugins/toggle - प्लगइन को प्लेटफॉर्म पर तुरंत एक्टिव / इनएक्टिव करें
adminApp.post('/plugins/toggle', async (c) => {
  const guard = await requireSuperAdmin(c);
  if (!guard.ok) return guard.error;
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);

  const body = await c.req.json().catch(() => ({}));
  const id = String(body.id || '').trim();
  if (!id) return c.json({ success: false, message: 'प्लगइन आईडी आवश्यक है।' }, 400);

  const existing = await db.prepare('SELECT id, is_active FROM plugins WHERE id = ?').bind(id).first();
  if (!existing) return c.json({ success: false, message: 'प्लगइन नहीं मिला।' }, 404);

  const newStatus = existing.is_active ? 0 : 1;
  await db.prepare('UPDATE plugins SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .bind(newStatus, id).run();

  return c.json({
    success: true,
    message: newStatus === 1 ? 'प्लगइन सक्रिय कर दिया गया।' : 'प्लगइन निष्क्रिय कर दिया गया।',
    isActive: newStatus === 1
  });
});

// POST /api/admin/plugins/create - नया प्लगइन कैटलॉग में जोड़ें
adminApp.post('/plugins/create', async (c) => {
  const guard = await requireSuperAdmin(c);
  if (!guard.ok) return guard.error;
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);

  const body = await c.req.json().catch(() => ({}));
  const id = String(body.id || '').trim();
  const name = String(body.name || '').trim();
  const description = String(body.description || '').trim();
  const type = body.type === 'private' ? 'private' : 'global';
  const price = Number(body.price) || 0;
  const isActive = body.isActive !== false ? 1 : 0;
  const targetSchoolId = type === 'private' ? (String(body.targetSchoolId || '').trim() || null) : null;

  if (!id || !name) {
    return c.json({ success: false, message: 'प्लगइन आईडी और नाम अनिवार्य हैं।' }, 400);
  }

  const existing = await db.prepare('SELECT id FROM plugins WHERE id = ?').bind(id).first();
  if (existing) {
    return c.json({ success: false, message: 'इस आईडी का प्लगइन पहले से मौजूद है।' }, 400);
  }

  await db.prepare(`
    INSERT INTO plugins (id, name, description, type, price, is_active, target_school_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).bind(id, name, description, type, price, isActive, targetSchoolId).run();

  return c.json({ success: true, message: 'नया प्लगइन सफलतापूर्वक जोड़ा गया।' });
});

// POST /api/admin/plugins/update - प्लगइन विवरण अपडेट करें
adminApp.post('/plugins/update', async (c) => {
  const guard = await requireSuperAdmin(c);
  if (!guard.ok) return guard.error;
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);

  const body = await c.req.json().catch(() => ({}));
  const id = String(body.id || '').trim();
  if (!id) return c.json({ success: false, message: 'प्लगइन आईडी आवश्यक है।' }, 400);

  const existing = await db.prepare('SELECT * FROM plugins WHERE id = ?').bind(id).first();
  if (!existing) return c.json({ success: false, message: 'प्लगइन नहीं मिला।' }, 404);

  const name = body.name !== undefined ? String(body.name).trim() : existing.name;
  const description = body.description !== undefined ? String(body.description).trim() : existing.description;
  const type = body.type === 'private' ? 'private' : (body.type === 'global' ? 'global' : existing.type);
  const price = body.price !== undefined ? (Number(body.price) || 0) : existing.price;
  const isActive = body.isActive !== undefined ? (body.isActive ? 1 : 0) : existing.is_active;
  const targetSchoolId = type === 'private' ? (body.targetSchoolId !== undefined ? (String(body.targetSchoolId).trim() || null) : existing.target_school_id) : null;

  await db.prepare(`
    UPDATE plugins
    SET name = ?, description = ?, type = ?, price = ?, is_active = ?, target_school_id = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(name, description, type, price, isActive, targetSchoolId, id).run();

  return c.json({ success: true, message: 'प्लगइन सफलतापूर्वक अपडेट कर दिया गया।' });
});

// GET /api/admin/plugins/subscriptions - सभी स्कूलों के प्लगइन सब्सक्रिप्शन्स
adminApp.get('/plugins/subscriptions', async (c) => {
  const guard = await requireSuperAdmin(c);
  if (!guard.ok) return guard.error;
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);

  const { results: subscriptions } = await db.prepare(`
    SELECT sp.id, sp.school_id, sp.plugin_id, sp.status, sp.valid_until, sp.created_at, sp.updated_at,
           s.school_name, p.name AS plugin_name, p.price AS plugin_price
    FROM school_plugins sp
    JOIN school_tenants s ON sp.school_id = s.id
    JOIN plugins p ON sp.plugin_id = p.id
    ORDER BY sp.updated_at DESC
  `).all();

  return c.json({ success: true, subscriptions: subscriptions || [] });
});

// POST /api/admin/plugins/assign - किसी स्कूल को सीधे प्लगइन आवंटित या सक्रिय करें
adminApp.post('/plugins/assign', async (c) => {
  const guard = await requireSuperAdmin(c);
  if (!guard.ok) return guard.error;
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);

  const body = await c.req.json().catch(() => ({}));
  const schoolId = String(body.schoolId || '').trim();
  const pluginId = String(body.pluginId || '').trim();
  const status = body.status === 'inactive' ? 'inactive' : 'active';

  if (!schoolId || !pluginId) {
    return c.json({ success: false, message: 'स्कूल और प्लगइन दोनों चुनना अनिवार्य है।' }, 400);
  }

  const id = `sp-${crypto.randomUUID()}`;
  await db.prepare(`
    INSERT INTO school_plugins (id, school_id, plugin_id, status, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(school_id, plugin_id) DO UPDATE SET status = excluded.status, updated_at = CURRENT_TIMESTAMP
  `).bind(id, schoolId, pluginId, status).run();

  return c.json({ success: true, message: `स्कूल को प्लगइन ${status === 'active' ? 'सक्रिय' : 'निष्क्रिय'} कर दिया गया।` });
});

// POST /api/admin/plugins/revoke - किसी स्कूल का प्लगइन रद्द करें
adminApp.post('/plugins/revoke', async (c) => {
  const guard = await requireSuperAdmin(c);
  if (!guard.ok) return guard.error;
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);

  const body = await c.req.json().catch(() => ({}));
  const schoolId = String(body.schoolId || '').trim();
  const pluginId = String(body.pluginId || '').trim();

  if (!schoolId || !pluginId) {
    return c.json({ success: false, message: 'स्कूल और प्लगइन आईडी आवश्यक है।' }, 400);
  }

  await db.prepare(`
    UPDATE school_plugins
    SET status = 'inactive', updated_at = CURRENT_TIMESTAMP
    WHERE school_id = ? AND plugin_id = ?
  `).bind(schoolId, pluginId).run();

  return c.json({ success: true, message: 'प्लगइन सफलतापूर्वक निष्क्रिय (Revoke) कर दिया गया।' });
});

export default adminApp;
