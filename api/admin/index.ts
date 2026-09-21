import { Hono } from 'hono';
import { getDB, loadSubscriptionPlans, loadSubscriptionPlanById, makeUniqueUsername } from '../db';
import { getAuthUser, hashPassword } from '../lib/auth';
import { sanitizeSlug, isSlugValid, provisionDedicatedWorker, deprovisionDedicatedWorker } from '../lib/provisioning';
import { processTrialExpirations, processPluginTrialExpirations } from '../lib/trial-expiration';
import { createRazorpayPaymentLink, cancelRazorpaySubscription, pauseRazorpaySubscription, resumeRazorpaySubscription, fetchRazorpaySubscription, createRazorpayPlan, fetchRazorpayPlan } from '../lib/razorpay';
import { sendNotificationEmail } from '../lib/email';
import { broadcastAlert } from '../notifications';

const adminApp = new Hono<{ Bindings: any }>();

// Dedicated Worker Guard: SuperAdmin console and school management is strictly disallowed on dedicated workers
adminApp.use('*', async (c, next) => {
  const isDedicated = !!(c.env && (c.env.IS_DEDICATED_WORKER === 'true' || c.env.SCHOOL_ID));
  if (isDedicated) {
    return c.json({
      success: false,
      message: 'Super Admin कंसोल केवल केंद्रीय प्लेटफ़ॉर्म (pragnya.nasven.com) पर उपलब्ध है। Dedicated स्कूल वर्कर पर यह अनुमत नहीं है।',
    }, 403);
  }
  await next();
});

export function getAuthorizedPlatformEmail(env: any): string {
  return String((env && env.PLATFORM_ADMIN_EMAIL) || '').trim().toLowerCase();
}

export function isAuthorizedPlatformEmail(email: string, env: any): boolean {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return false;
  const platformEmail = getAuthorizedPlatformEmail(env);
  if (platformEmail) {
    return normalized === platformEmail;
  }
  // Fallback when PLATFORM_ADMIN_EMAIL is not yet bound to env (e.g. dev/setup):
  return (
    normalized.endsWith('@nasven.com') ||
    normalized.endsWith('@vidyasetu.com') ||
    normalized.endsWith('@vidyasetu.app') ||
    normalized.endsWith('@pragnyamitra.app') ||
    normalized.endsWith('@pragnyamitra.com') ||
    normalized.endsWith('@navasanganakah.com')
  );
}

export function isValidCalendarDate(dateStr: string): boolean {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const d = new Date(dateStr + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === dateStr;
}

async function requireSuperAdmin(c: any) {
  const authUser = await getAuthUser(c);
  if (!authUser || authUser.role !== 'SuperAdmin') {
    return { ok: false, authUser, error: c.json({ success: false, message: 'केवल Super Admin की अनुमति है।' }, 403) };
  }

  const db = getDB(c);
  let adminEmail = authUser.email;

  // Single Admin Architecture: verify the single active platform admin from DB
  let adminRecord: any = null;
  if (db && authUser.sub) {
    try {
      adminRecord = await db.prepare('SELECT id, email, status FROM platform_admins WHERE id = ?').bind(authUser.sub).first();
      if (!adminRecord || adminRecord.status !== 'Active') {
        return {
          ok: false,
          authUser,
          error: c.json({ success: false, message: 'Super Admin खाता निष्क्रिय या मौजूद नहीं है।' }, 403),
        };
      }
      if (!adminEmail) {
        adminEmail = adminRecord.email;
        authUser.email = adminEmail;
      }
    } catch (_) {}
  }

  // Check env or KV for PLATFORM_ADMIN_EMAIL
  let platformEmail = getAuthorizedPlatformEmail(c.env);
  if (!platformEmail && c.env && c.env.CONFIG_KV) {
    try {
      platformEmail = String((await c.env.CONFIG_KV.get('PLATFORM_ADMIN_EMAIL')) || '').trim().toLowerCase();
    } catch (_) {}
  }

  const normalizedAdminEmail = String(adminEmail || '').trim().toLowerCase();
  // Gate strictly: if PLATFORM_ADMIN_EMAIL is configured, admin email must match exactly
  const isAuthorized = platformEmail
    ? normalizedAdminEmail === platformEmail
    : isAuthorizedPlatformEmail(normalizedAdminEmail, c.env);

  if (!isAuthorized) {
    return {
      ok: false,
      authUser,
      error: c.json({
        success: false,
        message: 'अनधिकृत Super Admin ईमेल। केवल अधिकृत प्लेटफ़ॉर्म एडमिन (' + (platformEmail || 'PLATFORM_ADMIN_EMAIL') + ') ही अनुमत है।',
      }, 403),
    };
  }

  return { ok: true, authUser };
}

// Dedicated worker provisioning logic lives in ../lib/provisioning.ts
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
    provisioningStatus: row.provisioning_status || 'none',
    dedicatedSlug: row.dedicated_slug || '',
    dedicatedDomain: row.dedicated_domain || '',
    d1DatabaseId: row.d1_database_id || '',
    r2BucketName: row.r2_bucket_name || '',
    kvNamespaceId: row.kv_namespace_id || '',
    provisionedAt: row.provisioned_at || '',
    provisioningError: row.provisioning_error || '',
    emailQuotaLimit: row.email_quota_limit === undefined || row.email_quota_limit === null ? null : Number(row.email_quota_limit),
    emailQuotaUsed: row.email_quota_used === undefined || row.email_quota_used === null ? 0 : Number(row.email_quota_used),
    emailQuotaResetAt: row.email_quota_reset_at || '',
    emailFromName: row.email_from_name || '',
    emailFromEmail: row.email_from_email || '',
    emailReplyTo: row.email_reply_to || '',
    emailConfigActive: row.email_config_active === undefined ? true : !!row.email_config_active,
    estimatedStudents: Number(row.estimated_students) || 0,
    estimatedStaff: Number(row.estimated_staff) || 0,
    preferredPlanId: row.preferred_plan_id || 'trial',
    customRequirements: row.custom_requirements || '',
  };
}


// POST /api/admin/bootstrap - idempotent single Super Admin creation/sync from env secrets
adminApp.post('/bootstrap', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);

  let email = getAuthorizedPlatformEmail(c.env);
  if (!email && c.env && c.env.CONFIG_KV) {
    try {
      email = String((await c.env.CONFIG_KV.get('PLATFORM_ADMIN_EMAIL')) || '').trim().toLowerCase();
    } catch (_) {}
  }
  let password = String((c.env && c.env.PLATFORM_ADMIN_PASSWORD) || '').trim();
  if (!password && c.env && c.env.CONFIG_KV) {
    try {
      password = String((await c.env.CONFIG_KV.get('PLATFORM_ADMIN_PASSWORD')) || '').trim();
    } catch (_) {}
  }

  if (!email || !password) {
    return c.json({ success: false, message: 'PLATFORM_ADMIN_EMAIL और PLATFORM_ADMIN_PASSWORD env secrets सेट करें।' }, 400);
  }

  // Verify that the bootstrap email belongs to the authorized platform domain / pattern
  if (!isAuthorizedPlatformEmail(email, c.env)) {
    return c.json({ success: false, message: 'केवल अधिकृत प्लेटफ़ॉर्म ईमेल डोमेन को Super Admin बनाया जा सकता है।' }, 403);
  }

  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();

  // Enforce single-admin rule: check existing admin
  const existing = await db.prepare('SELECT id, email FROM platform_admins ORDER BY created_at ASC LIMIT 1').first();
  if (existing) {
    // Update existing single Super Admin credentials to match env secrets (idempotent bootstrap / rotation)
    await db.prepare('UPDATE platform_admins SET email = ?, password_hash = ?, full_name = ?, status = ?, updated_at = ? WHERE id = ?')
      .bind(email, passwordHash, 'Platform Super Admin', 'Active', now, existing.id).run();

    // Clean up any extra admin records to guarantee exactly 1 Super Admin exists
    await db.prepare('DELETE FROM platform_admins WHERE id != ?').bind(existing.id).run();

    return c.json({ success: true, message: 'Super Admin क्रेडेंशियल्स env secrets के अनुसार सिंक हो गए।' });
  }

  // Create first single Super Admin
  await db.prepare('INSERT INTO platform_admins (id, email, password_hash, full_name, phone, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)')
    .bind('adm-' + Date.now(), email, passwordHash, 'Platform Super Admin', '', 'Active', now, now).run();

  return c.json({ success: true, message: 'Super Admin सफलतापूर्वक बूटस्ट्रैप हो गया।' });
});

// GET /api/admin/schools - सभी स्कूल (किस स्कूल के पास कौन-सा प्लान)
adminApp.get('/schools', async (c) => {
  const guard = await requireSuperAdmin(c);
  if (!guard.ok) return guard.error;
  const db = getDB(c);
  const rows = await db.prepare(
    'SELECT s.*, sub.plan_id AS sub_plan_id, sub.plan_name AS sub_plan_name, sub.status AS sub_status, sub.trial_ends_at AS trial_ends_at, '
    + 'sub.email_quota_limit AS email_quota_limit, sub.email_quota_used AS email_quota_used, sub.email_quota_reset_at AS email_quota_reset_at, '
    + 'ec.from_name AS email_from_name, ec.from_email AS email_from_email, ec.reply_to AS email_reply_to, ec.is_active AS email_config_active '
    + 'FROM school_tenants s '
    + 'LEFT JOIN school_subscriptions sub ON sub.school_id = s.id '
    + 'LEFT JOIN school_email_config ec ON ec.school_id = s.id '
    + 'WHERE s.deleted_at IS NULL ORDER BY s.created_at DESC'
  ).all();
  const schools = (rows.results || []).map(tenantToJson);
  return c.json({ success: true, schools });
});

// POST /api/admin/schools/email-config - monthly email quota + business-domain sender config
adminApp.post('/schools/email-config', async (c) => {
  const guard = await requireSuperAdmin(c);
  if (!guard.ok) return guard.error;
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);

  const body = await c.req.json().catch(() => ({}));
  const schoolId = String((body && body.schoolId) || '').trim();
  if (!schoolId) return c.json({ success: false, message: 'schoolId आवश्यक है।' }, 400);

  const tenant = await db.prepare('SELECT id FROM school_tenants WHERE id = ?').bind(schoolId).first();
  if (!tenant) return c.json({ success: false, message: 'स्कूल नहीं मिला।' }, 404);

  const limitRaw = String(body.limit === undefined || body.limit === null ? '' : body.limit).trim();
  const limit = limitRaw === '' ? null : Number(limitRaw);
  if (limit !== null && (Number.isNaN(limit) || limit < 0)) {
    return c.json({ success: false, message: 'अमान्य मासिक ईमेल सीमा।' }, 400);
  }

  const fromName = String((body && body.fromName) || '').trim();
  const fromEmail = String((body && body.fromEmail) || '').trim().toLowerCase();
  const replyTo = String((body && body.replyTo) || '').trim().toLowerCase();
  const isActive = body && body.isActive === false ? 0 : 1;
  const now = new Date().toISOString();
  const currentMonth = now.slice(0, 7);

  await db.prepare('UPDATE school_subscriptions SET email_quota_limit = ?, email_quota_used = 0, email_quota_reset_at = ?, updated_at = ? WHERE school_id = ?')
    .bind(limit, currentMonth, now, schoolId).run();

  const existing = await db.prepare('SELECT id FROM school_email_config WHERE school_id = ?').bind(schoolId).first();
  if (existing) {
    await db.prepare('UPDATE school_email_config SET from_name = ?, from_email = ?, reply_to = ?, is_active = ?, updated_at = ? WHERE school_id = ?')
      .bind(fromName, fromEmail, replyTo, isActive, now, schoolId).run();
  } else {
    await db.prepare('INSERT INTO school_email_config (id, school_id, from_name, from_email, reply_to, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind('emcfg-' + crypto.randomUUID(), schoolId, fromName, fromEmail, replyTo, isActive, now, now).run();
  }

  return c.json({ success: true, message: 'ईमेल कोटा व सेंडर कॉन्फ़िगरेशन सहेजा गया।' });
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

// POST /api/admin/registrations/approve - approve with selected plan or 7-day trial
adminApp.post('/registrations/approve', async (c) => {
  const guard = await requireSuperAdmin(c);
  if (!guard.ok) return guard.error;
  const db = getDB(c);
  const body = await c.req.json().catch(() => ({}));
  const schoolId = body.schoolId;
  if (!schoolId) return c.json({ success: false, message: 'schoolId आवश्यक है।' }, 400);

  const selectedPlanId = String(body.planId || '').trim();
  const customTrialEndsAt = String(body.trialEndsAt || '').trim();
  if (customTrialEndsAt && !isValidCalendarDate(customTrialEndsAt)) {
    return c.json({ success: false, message: 'अमान्य समाप्ति तिथि प्रारूप (YYYY-MM-DD)।' }, 400);
  }
  const now = new Date().toISOString();

  if (selectedPlanId && selectedPlanId !== 'trial') {
    const plan = await loadSubscriptionPlanById(db, selectedPlanId);
    if (!plan) return c.json({ success: false, message: 'अमान्य प्लान चयन।' }, 400);

    const periodEnd = customTrialEndsAt || '';
    await db.prepare('UPDATE school_tenants SET status=?, registration_status=?, plan_id=?, trial_ends_at=?, trial_reminder_sent_at=NULL, trial_expired_sent_at=NULL, approved_at=?, approved_by=? WHERE id=?')
      .bind('Active', 'Approved', plan.id, periodEnd, now, guard.authUser.sub, schoolId).run();

    await db.prepare('UPDATE school_subscriptions SET plan_id=?, plan_name=?, status=?, trial_ends_at=?, updated_at=? WHERE school_id=?')
      .bind(plan.id, plan.name, 'Active', periodEnd, now, schoolId).run();

    let provisioning: any = null;
    let provisioningError: string | null = null;
    if (plan.featureFlags && plan.featureFlags.dedicatedWorker) {
      const school = await db.prepare('SELECT * FROM school_tenants WHERE id = ?').bind(schoolId).first();
      if (school) {
        try {
          provisioning = await provisionDedicatedWorker(c.env, db, school, {});
        } catch (provErr: any) {
          console.error('[Admin] provisionDedicatedWorker failed:', provErr);
          provisioningError = provErr?.message || 'डेडीकेटेड वर्कर प्रोविजनिंग विफल रही।';
        }
      }
    }

    return c.json({
      success: true,
      message: provisioningError
        ? `स्कूल को ${plan.name} के साथ स्वीकृत किया गया, परन्तु डेडीकेटेड वर्कर प्रोविजनिंग में त्रुटि: ${provisioningError}`
        : `स्कूल को ${plan.name} के साथ स्वीकृत किया गया।`,
      provisioning,
      provisioningError,
    });
  }

  // Default: 7-day trial (or custom trialEndsAt if set by SuperAdmin)
  const defaultTrialEnds = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const trialEnds = customTrialEndsAt || defaultTrialEnds;
  await db.prepare('UPDATE school_tenants SET status=?, registration_status=?, plan_id=?, trial_ends_at=?, trial_reminder_sent_at=NULL, trial_expired_sent_at=NULL, approved_at=?, approved_by=? WHERE id=?')
    .bind('Trial', 'Approved', 'trial', trialEnds, now, guard.authUser.sub, schoolId).run();
  await db.prepare('UPDATE school_subscriptions SET status=?, plan_id=?, plan_name=?, trial_ends_at=?, updated_at=? WHERE school_id=?')
    .bind('Trial', 'trial', '7-दिन फ्री ट्रायल', trialEnds, now, schoolId).run();
  return c.json({ success: true, message: `स्कूल स्वीकृत। ट्रायल समाप्ति तिथि ${trialEnds} निर्धारित की गई।`, trialEnds });
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

// POST /api/admin/trial/process - सभी स्कूलों के ट्रायल समाप्ति व स्मरण ईमेल की त्वरित जांच
adminApp.post('/trial/process', async (c) => {
  const guard = await requireSuperAdmin(c);
  if (!guard.ok) return guard.error;
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);

  try {
    const result = await processTrialExpirations(c.env, db);
    return c.json({
      success: true,
      message: `ट्रायल जांच पूर्ण: ${result.checkedCount} स्कूल जांचे गए, ${result.remindersSent} स्मरण ईमेल भेजे गए, ${result.expirationsProcessed} समाप्त ट्रायल प्रोसेस किए गए।`,
      result,
    });
  } catch (err: any) {
    console.error('[Admin] processTrialExpirations failed:', err);
    return c.json({ success: false, message: err?.message || 'ट्रायल प्रोसेसिंग विफल रही।' }, 500);
  }
});

// POST /api/admin/plugins/process-trials - प्लगइन ट्रायल प्रोसेसिंग मैन्युअली ट्रिगर
adminApp.post('/plugins/process-trials', async (c) => {
  const guard = await requireSuperAdmin(c);
  if (!guard.ok) return guard.error;
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  try {
    const result = await processPluginTrialExpirations(c.env, db);
    return c.json({
      success: true,
      message: `प्लगइन ट्रायल जांच पूर्ण: ${result.checkedCount} जांचे गए, ${result.remindersSent} स्मरण, ${result.expirationsProcessed} समाप्त।`,
      result,
    });
  } catch (err: any) {
    return c.json({ success: false, message: err?.message || 'प्लगइन ट्रायल प्रोसेसिंग विफल।' }, 500);
  }
});

// POST /api/admin/trial/extend - स्कूल का ट्रायल +N दिन बढ़ाएं
adminApp.post('/trial/extend', async (c) => {
  const guard = await requireSuperAdmin(c);
  if (!guard.ok) return guard.error;
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);

  const body = await c.req.json().catch(() => ({}));
  const schoolId = String(body.schoolId || '').trim();
  const days = Math.max(1, Math.min(60, Number(body.days) || 7));
  if (!schoolId) return c.json({ success: false, message: 'schoolId आवश्यक है।' }, 400);

  const school = await db.prepare('SELECT * FROM school_tenants WHERE id = ?').bind(schoolId).first();
  if (!school) return c.json({ success: false, message: 'विद्यालय नहीं मिला।' }, 404);

  const newTrialEnds = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const nowIso = new Date().toISOString();

  await db.prepare(
    `UPDATE school_tenants
     SET status = 'Trial', registration_status = 'Approved', plan_id = 'trial',
         trial_ends_at = ?, trial_reminder_sent_at = NULL, trial_expired_sent_at = NULL
     WHERE id = ?`
  ).bind(newTrialEnds, schoolId).run();

  await db.prepare(
    `UPDATE school_subscriptions
     SET status = 'Trial', plan_id = 'trial', plan_name = '7-दिन फ्री ट्रायल',
         trial_ends_at = ?, updated_at = ?
     WHERE school_id = ?`
  ).bind(newTrialEnds, nowIso, schoolId).run();

  return c.json({
    success: true,
    message: `"${school.school_name}" का ट्रायल ${days} दिन बढ़ाकर ${newTrialEnds} कर दिया गया है।`,
    newTrialEnds,
  });
});

// GET /api/admin/feature-requests - सभी स्कूलों से प्राप्त विशेष आवश्यकताएं व फीचर अनुरोध
adminApp.get('/feature-requests', async (c) => {
  const guard = await requireSuperAdmin(c);
  if (!guard.ok) return guard.error;
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);

  try {
    const rows = await db.prepare(
      `SELECT fr.*, s.school_name, s.contact_email, s.contact_phone, s.subdomain, s.plan_id
       FROM school_feature_requests fr
       JOIN school_tenants s ON s.id = fr.school_id
       ORDER BY fr.created_at DESC`
    ).all();

    return c.json({ success: true, requests: rows.results || [] });
  } catch (e: any) {
    return c.json({ success: true, requests: [] });
  }
});

// POST /api/admin/feature-requests/status - अनुरोध की स्थिति व नोट्स अपडेट करें
adminApp.post('/feature-requests/status', async (c) => {
  const guard = await requireSuperAdmin(c);
  if (!guard.ok) return guard.error;
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);

  const body = await c.req.json().catch(() => ({}));
  const id = String(body.id || '').trim();
  const status = String(body.status || 'Pending').trim();
  const adminNotes = String(body.adminNotes || '').trim();

  if (!id) return c.json({ success: false, message: 'id आवश्यक है।' }, 400);

  const VALID_STATUSES = ['Pending', 'In_Review', 'Approved', 'Delivered', 'Rejected'];
  if (!VALID_STATUSES.includes(status)) {
    return c.json({ success: false, message: `अमान्य स्थिति। मान्य स्थितियां: ${VALID_STATUSES.join(', ')}` }, 400);
  }

  await db.prepare(
    'UPDATE school_feature_requests SET status = ?, admin_notes = ?, updated_at = ? WHERE id = ?'
  ).bind(status, adminNotes, new Date().toISOString(), id).run();

  return c.json({ success: true, message: 'अनुरोध स्थिति सफलतापूर्वक अपडेट की गई।' });
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

  const planId = String(body.planId || 'trial').trim();
  const plan = await loadSubscriptionPlanById(db, planId);
  if (!plan) return c.json({ success: false, message: 'अमान्य प्लान चयन।' }, 400);

  const customTrialEndsAt = String(body.trialEndsAt || '').trim();
  if (customTrialEndsAt && !isValidCalendarDate(customTrialEndsAt)) {
    return c.json({ success: false, message: 'अमान्य समाप्ति तिथि प्रारूप (YYYY-MM-DD)।' }, 400);
  }
  const defaultTrialEnds = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const isTrialPlan = plan.id === 'trial' || plan.isTrial;
  const trialEndsAt = isTrialPlan ? (customTrialEndsAt || defaultTrialEnds) : (customTrialEndsAt || '');
  const initialStatus = isTrialPlan ? 'Trial' : 'Active';

  const rawCycle = String(body.billingCycle || '').toLowerCase().trim();
  const billingCycle = isTrialPlan
    ? 'monthly'
    : (['monthly', 'quarterly', 'annual'].includes(rawCycle) ? rawCycle : 'annual');

  const pricePerCycle = isTrialPlan ? 0 : (
    billingCycle === 'monthly'
      ? (plan.monthlyPrice || 0)
      : billingCycle === 'quarterly'
      ? (plan.quarterlyPrice || 0)
      : (plan.annualPrice || 0)
  );

  const now = new Date().toISOString();
  const passwordHash = await hashPassword(password);
  const username = await makeUniqueUsername(db, email);

  await db.prepare('INSERT INTO school_tenants (id, school_name, subdomain, custom_domain, contact_email, contact_phone, status, registration_status, plan_id, trial_ends_at, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .bind(schoolId, schoolName, subdomain, body.customDomain || '', email, phone, initialStatus, 'Approved', plan.id, trialEndsAt, now).run();

  await db.prepare('INSERT INTO school_profile (id, school_name, affiliation_number, board_name, school_code, email, phone, alternate_phone, address, city, state, pincode, academic_session, director_name, principal_name, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(schoolId, schoolName, body.affiliationNumber || '', body.boardName || 'CBSE', body.schoolCode || '', email, phone, body.alternatePhone || '', body.address || '-', body.city || '-', body.state || '-', body.pincode || '-', body.academicSession || '2026-2027', directorName, body.principalName || directorName, now.split('T')[0]).run();

  await db.prepare('INSERT INTO system_users (id, username, full_name, email, phone, role, designation, department, qualification, salary, status, school_id, password_hash, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(userId, username, directorName, email, phone, 'Director', body.designation || 'स्कूल निदेशक (Director)', 'प्रबंधन एवं प्रशासन', body.qualification || '', 0, 'Active', schoolId, passwordHash, now).run();

  await db.prepare('INSERT INTO school_subscriptions (id, school_id, plan_id, plan_name, billing_cycle, price_per_cycle, discount_percent, status, trial_ends_at, auto_pay_enabled, payment_method, mandate_id, next_billing_date, period_start, period_end, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind('sub-' + Date.now(), schoolId, plan.id, plan.name, billingCycle, pricePerCycle, 0, initialStatus, trialEndsAt, 1, 'Manual', '', now.split('T')[0], now.split('T')[0], trialEndsAt || now.split('T')[0], now).run();

  let provisioning: any = null;
  if (plan.featureFlags && plan.featureFlags.dedicatedWorker) {
    const school = await db.prepare('SELECT * FROM school_tenants WHERE id = ?').bind(schoolId).first();
    if (school) provisioning = await provisionDedicatedWorker(c.env, db, school, {});
  }
  return c.json({ success: true, message: 'विद्यालय सफलतापूर्वक जोड़ा गया।', schoolId, provisioning });
});

// POST /api/admin/schools/plan - assign/override plan (admin control, dynamic plans)
adminApp.post('/schools/plan', async (c) => {
  const guard = await requireSuperAdmin(c);
  if (!guard.ok) return guard.error;
  const db = getDB(c);
  const body = await c.req.json().catch(() => ({}));
  const schoolId = body.schoolId;
  const planId = String(body.planId || 'starter').trim();
  if (!schoolId) return c.json({ success: false, message: 'schoolId आवश्यक है।' }, 400);
  const plan = await loadSubscriptionPlanById(db, planId);
  if (!plan) return c.json({ success: false, message: 'अमान्य प्लान चयन।' }, 400);

  const isTrial = plan.id === 'trial' || plan.isTrial;
  const customTrialEndsAt = String(body.trialEndsAt || '').trim();
  if (customTrialEndsAt && !isValidCalendarDate(customTrialEndsAt)) {
    return c.json({ success: false, message: 'अमान्य समाप्ति तिथि प्रारूप (YYYY-MM-DD)।' }, 400);
  }
  const defaultTrialEnds = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const trialEnds = isTrial ? (customTrialEndsAt || defaultTrialEnds) : (customTrialEndsAt || '');
  const newStatus = isTrial ? 'Trial' : 'Active';
  const nowIso = new Date().toISOString();

  await db.prepare('UPDATE school_subscriptions SET plan_id=?, plan_name=?, status=?, trial_ends_at=?, updated_at=? WHERE school_id=?')
    .bind(plan.id, plan.name, newStatus, trialEnds, nowIso, schoolId).run();
  await db.prepare('UPDATE school_tenants SET plan_id=?, status=?, registration_status=?, trial_ends_at=?, trial_reminder_sent_at=NULL, trial_expired_sent_at=NULL WHERE id=?')
    .bind(plan.id, newStatus, 'Approved', trialEnds, schoolId).run();

  let provisioning: any = null;
  const school = await db.prepare('SELECT * FROM school_tenants WHERE id = ?').bind(schoolId).first();
  if (plan.featureFlags && plan.featureFlags.dedicatedWorker) {
    if (school) provisioning = await provisionDedicatedWorker(c.env, db, school, {});
  } else if (school && (school.dedicated_slug || school.provisioning_status === 'live' || school.provisioning_status === 'pending')) {
    // School is being downgraded to a shared plan; switch schools.json mode to shared
    try {
      await deprovisionDedicatedWorker(c.env, db, schoolId, school.dedicated_slug);
    } catch (downgradeErr) {
      console.error('[Admin] deprovisionDedicatedWorker on plan downgrade error:', downgradeErr);
    }
  }
  return c.json({ success: true, message: `स्कूल का प्लान "${plan.name}" में बदल दिया गया।`, provisioning, trialEnds });
});

// POST /api/admin/schools/expiry-date - किसी भी स्कूल (मौजूदा या नए) की समाप्ति तिथि तुरंत सेट करें
adminApp.post('/schools/expiry-date', async (c) => {
  const guard = await requireSuperAdmin(c);
  if (!guard.ok) return guard.error;
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);

  const body = await c.req.json().catch(() => ({}));
  const schoolId = String(body.schoolId || '').trim();
  const expiryDate = String(body.expiryDate || body.trialEndsAt || '').trim();

  if (!schoolId) return c.json({ success: false, message: 'schoolId अनिवार्य है।' }, 400);
  if (!expiryDate || !isValidCalendarDate(expiryDate)) {
    return c.json({ success: false, message: 'मान्य कैलेंडर समाप्ति तिथि (YYYY-MM-DD) आवश्यक है।' }, 400);
  }

  const school = await db.prepare('SELECT * FROM school_tenants WHERE id = ?').bind(schoolId).first();
  if (!school) return c.json({ success: false, message: 'विद्यालय नहीं मिला।' }, 404);

  const todayStr = new Date().toISOString().split('T')[0];
  const isFutureOrToday = expiryDate >= todayStr;
  const nowIso = new Date().toISOString();

  const isTrial = school.plan_id === 'trial' || school.status === 'Trial';

  let nextStatus = school.status;
  let nextRegStatus = school.registration_status;

  if (isTrial) {
    if (isFutureOrToday) {
      nextStatus = (school.status === 'Suspended' && school.registration_status === 'Trial_Expired') ? 'Trial' : school.status;
      nextRegStatus = school.registration_status === 'Trial_Expired' ? 'Approved' : school.registration_status;
    } else {
      nextStatus = 'Suspended';
      nextRegStatus = 'Trial_Expired';
    }
  } else {
    // Non-trial / paid school
    if (isFutureOrToday) {
      nextStatus = school.status === 'Suspended' ? 'Active' : school.status;
    } else {
      nextStatus = 'Suspended';
    }
  }

  await db.prepare(
    `UPDATE school_tenants
     SET trial_ends_at = ?, status = ?, registration_status = ?,
         trial_reminder_sent_at = CASE WHEN ? >= ? THEN NULL ELSE trial_reminder_sent_at END,
         trial_expired_sent_at = CASE WHEN ? >= ? THEN NULL ELSE trial_expired_sent_at END
     WHERE id = ?`
  ).bind(expiryDate, nextStatus, nextRegStatus, expiryDate, todayStr, expiryDate, todayStr, schoolId).run();

  const subStatus = nextStatus === 'Suspended'
    ? (isTrial ? 'Expired' : 'Past_Due')
    : (isTrial ? 'Trial' : 'Active');

  await db.prepare(
    `UPDATE school_subscriptions
     SET trial_ends_at = ?, status = ?, updated_at = ?
     WHERE school_id = ?`
  ).bind(expiryDate, subStatus, nowIso, schoolId).run();

  return c.json({
    success: true,
    message: `"${school.school_name}" की समाप्ति तिथि सफलतापूर्वक ${expiryDate} निर्धारित की गई।`,
    expiryDate,
    status: nextStatus,
  });
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

  const tenant = await db.prepare('SELECT subdomain, custom_domain, status, plan_id, trial_ends_at FROM school_tenants WHERE id = ?').bind(schoolId).first();
  let nextPlanId = tenant ? tenant.plan_id : 'starter';
  let planObj: any = null;

  if (body.planId !== undefined && body.planId !== null && String(body.planId).trim() !== '') {
    const candidatePlanId = String(body.planId).trim();
    planObj = await loadSubscriptionPlanById(db, candidatePlanId);
    if (!planObj) {
      return c.json({ success: false, message: 'अमान्य प्लान चयन।' }, 400);
    }
    nextPlanId = planObj.id;
  } else {
    planObj = await loadSubscriptionPlanById(db, nextPlanId);
  }

  const nextTrialEnds = body.trialEndsAt !== undefined && body.trialEndsAt !== null
    ? String(body.trialEndsAt).trim()
    : (tenant ? (tenant.trial_ends_at || '') : '');

  if (nextTrialEnds && !isValidCalendarDate(nextTrialEnds)) {
    return c.json({ success: false, message: 'मान्य समाप्ति तिथि (YYYY-MM-DD) आवश्यक है।' }, 400);
  }

  const nextStatus = val('status', tenant ? tenant.status : 'Active');

  await db.prepare('UPDATE school_tenants SET school_name=?, contact_email=?, contact_phone=?, subdomain=?, custom_domain=?, status=?, plan_id=?, trial_ends_at=? WHERE id=?')
    .bind(
      val('schoolName', existing.school_name),
      val('email', existing.email),
      val('phone', existing.phone),
      val('subdomain', tenant ? tenant.subdomain : ''),
      val('customDomain', tenant ? tenant.custom_domain : ''),
      nextStatus,
      nextPlanId,
      nextTrialEnds,
      schoolId
    ).run();

  // Also sync subscription plan & trial_ends_at if modified
  if (body.planId !== undefined || body.trialEndsAt !== undefined) {
    const isTrial = nextPlanId === 'trial' || (planObj && planObj.isTrial);
    const planName = planObj ? planObj.name : (nextPlanId === 'trial' ? '7-दिन फ्री ट्रायल' : nextPlanId);
    const subStatus = nextStatus === 'Suspended' ? 'Past_Due' : (isTrial ? 'Trial' : 'Active');
    await db.prepare('UPDATE school_subscriptions SET plan_id=?, plan_name=?, status=?, trial_ends_at=?, updated_at=? WHERE school_id=?')
      .bind(nextPlanId, planName, subStatus, nextTrialEnds, new Date().toISOString(), schoolId).run();
  }

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

// POST /api/admin/schools/provision - dedicated worker provision करें (control plane)
adminApp.post('/schools/provision', async (c) => {
  const guard = await requireSuperAdmin(c);
  if (!guard.ok) return guard.error;
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);

  const body = await c.req.json().catch(() => ({}));
  const schoolId = String(body.schoolId || '').trim();
  if (!schoolId) return c.json({ success: false, message: 'schoolId आवश्यक है।' }, 400);

  const school = await db.prepare('SELECT * FROM school_tenants WHERE id = ?').bind(schoolId).first();
  if (!school) return c.json({ success: false, message: 'स्कूल नहीं मिला।' }, 404);

  // Strict Enterprise plan verification:
  const sub = await db.prepare('SELECT plan_id, status FROM school_subscriptions WHERE school_id = ?').bind(schoolId).first();
  const currentPlanId = (sub && sub.status === 'Active' ? sub.plan_id : school.plan_id) || 'trial';
  const plan = await loadSubscriptionPlanById(db, currentPlanId);
  if (!plan || (plan.id !== 'enterprise' && (!plan.featureFlags || !plan.featureFlags.dedicatedWorker))) {
    return c.json({
      success: false,
      message: 'डेडीकेटेड वर्कर केवल एंटरप्राइज (Enterprise) प्लान के लिए उपलब्ध है। कृपया पहले स्कूल को एंटरप्राइज प्लान में अपग्रेड करें।',
    }, 400);
  }

  const slug = sanitizeSlug(body.slug || school.subdomain || school.school_name);
  if (!isSlugValid(slug)) {
    return c.json({ success: false, message: 'अमान्य slug। केवल छोटे अंग्रेज़ी अक्षर, अंक और हाइफ़न (a-z, 0-9, -) उपयोग करें, और अंत में हाइफ़न न रखें।' }, 400);
  }

  const domain = String(body.domain || (slug + '.pragnya.nasven.com')).trim().toLowerCase();
  if (!/^[a-z0-9.-]+$/.test(domain)) {
    return c.json({ success: false, message: 'अमान्य डोमेन।' }, 400);
  }

  const result = await provisionDedicatedWorker(c.env, db, school, { slug, domain });
  if (result.status === 'error') {
    return c.json({ success: false, message: result.error || 'GitHub registry अपडेट में त्रुटि।' }, 502);
  }
  if (result.status === 'skipped') {
    return c.json({ success: true, message: result.message || 'Dedicated worker पहले से provisioned है।', slug: result.slug, domain: result.domain });
  }
  return c.json({
    success: true,
    message: result.message || ('Dedicated worker provisioning शुरू हो गया। ' + result.domain + ' पर deploy कुछ मिनटों में उपलब्ध होगा।'),
    slug: result.slug,
    domain: result.domain,
    next: 'schools.json commit → deploy.yml → provision-school.mjs → dedicated deploy',
  });
});

// POST /api/admin/schools/provision/deprovision - dedicated worker को shared mode में बदलें
adminApp.post('/schools/provision/deprovision', async (c) => {
  const guard = await requireSuperAdmin(c);
  if (!guard.ok) return guard.error;
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);

  const body = await c.req.json().catch(() => ({}));
  const schoolId = String(body.schoolId || '').trim();
  if (!schoolId) return c.json({ success: false, message: 'schoolId आवश्यक है।' }, 400);

  const school = await db.prepare('SELECT * FROM school_tenants WHERE id = ?').bind(schoolId).first();
  if (!school) return c.json({ success: false, message: 'स्कूल नहीं मिला।' }, 404);

  const result = await deprovisionDedicatedWorker(c.env, db, schoolId, school.dedicated_slug);
  if (result.status === 'error') {
    return c.json({ success: false, message: result.error || 'डी-प्रोविजनिंग में त्रुटि।' }, 502);
  }
  return c.json({
    success: true,
    message: 'स्कूल को सफलतापूर्वक शेयर्ड वर्कर मोड में बदल दिया गया।',
  });
});

// POST /api/admin/schools/provision/check - dedicated worker की health जाँच कर स्टेटस 'live' करें
adminApp.post('/schools/provision/check', async (c) => {
  const guard = await requireSuperAdmin(c);
  if (!guard.ok) return guard.error;
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);

  const body = await c.req.json().catch(() => ({}));
  const schoolId = String(body.schoolId || '').trim();
  if (!schoolId) return c.json({ success: false, message: 'schoolId आवश्यक है।' }, 400);

  const school = await db.prepare('SELECT dedicated_domain, provisioning_status FROM school_tenants WHERE id = ?').bind(schoolId).first();
  if (!school || !school.dedicated_domain) {
    return c.json({ success: false, message: 'इस स्कूल के लिए कोई डेडिकेटेड डोमेन कॉन्फ़िगर नहीं है।' }, 404);
  }

  let live = false;
  try {
    const res = await fetch('https://' + school.dedicated_domain + '/api/health');
    const j = await res.json().catch(() => ({}));
    live = !!res.ok && !!j && j.status === 'online';
  } catch (e) { /* deploy अभी चल रहा है */ }

  const status = live ? 'live' : (school.provisioning_status || 'pending');
  if (live) {
    await db.prepare('UPDATE school_tenants SET provisioning_status=?, provisioning_error=? WHERE id=?')
      .bind('live', '', schoolId).run();
  }
  return c.json({ success: true, live, status });
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
    LIMIT 500
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

// ==========================================
// Plugin Trial Management (Admin grants N-day trial to a school)
// ==========================================

// GET /api/admin/plugins/trials - सभी स्कूलों के प्लगइन ट्रायल की स्थिति
adminApp.get('/plugins/trials', async (c) => {
  const guard = await requireSuperAdmin(c);
  if (!guard.ok) return guard.error;
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  try {
    const rows = await db.prepare(`
      SELECT sp.id, sp.school_id, sp.plugin_id, sp.status, sp.valid_until,
             sp.trial_ends_at, sp.trial_granted_by, sp.trial_granted_at, sp.payment_status,
             sp.price_per_cycle, sp.billing_cycle, sp.next_billing_date,
             s.school_name, p.name AS plugin_name, p.price AS plugin_price
      FROM school_plugins sp
      JOIN school_tenants s ON sp.school_id = s.id
      JOIN plugins p ON sp.plugin_id = p.id
      ORDER BY sp.updated_at DESC
      LIMIT 500
    `).all();
    return c.json({ success: true, trials: rows.results || [] });
  } catch (e: any) {
    return c.json({ success: true, trials: [] });
  }
});

// POST /api/admin/plugins/grant-trial - स्कूल को प्लगइन का N-दिन ट्रायल दें
adminApp.post('/plugins/grant-trial', async (c) => {
  const guard = await requireSuperAdmin(c);
  if (!guard.ok) return guard.error;
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);

  const body = await c.req.json().catch(() => ({}));
  const schoolId = String(body.schoolId || '').trim();
  const pluginId = String(body.pluginId || '').trim();
  const trialDays = Math.max(1, Math.min(365, Number(body.trialDays) || 7));

  if (!schoolId || !pluginId) {
    return c.json({ success: false, message: 'schoolId और pluginId आवश्यक हैं।' }, 400);
  }

  const school = await db.prepare('SELECT id, school_name FROM school_tenants WHERE id = ?').bind(schoolId).first();
  if (!school) return c.json({ success: false, message: 'स्कूल नहीं मिला।' }, 404);
  const plugin = await db.prepare('SELECT id, name, price FROM plugins WHERE id = ?').bind(pluginId).first();
  if (!plugin) return c.json({ success: false, message: 'प्लगइन नहीं मिला।' }, 404);

  // Guard: don't overwrite an existing paid subscription with a trial
  const existing = await db.prepare('SELECT payment_status FROM school_plugins WHERE school_id = ? AND plugin_id = ?').bind(schoolId, pluginId).first();
  if (existing && existing.payment_status === 'active') {
    return c.json({ success: false, message: 'यह प्लगइन इस स्कूल के लिए पहले से भुगतान सक्रिय है। ट्रायल देना आवश्यक नहीं है।' }, 400);
  }

  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const nowIso = now.toISOString();
  const id = `sp-${crypto.randomUUID()}`;

  await db.prepare(`
    INSERT INTO school_plugins (id, school_id, plugin_id, status, valid_until, trial_ends_at, trial_granted_by, trial_granted_at, payment_status, trial_reminder_sent_at, updated_at)
    VALUES (?, ?, ?, 'active', ?, ?, ?, ?, 'trial', NULL, CURRENT_TIMESTAMP)
    ON CONFLICT(school_id, plugin_id) DO UPDATE SET
      status = 'active',
      valid_until = excluded.valid_until,
      trial_ends_at = excluded.trial_ends_at,
      trial_granted_by = excluded.trial_granted_by,
      trial_granted_at = excluded.trial_granted_at,
      payment_status = 'trial',
      trial_reminder_sent_at = NULL,
      updated_at = CURRENT_TIMESTAMP
  `).bind(id, schoolId, pluginId, trialEndsAt, trialEndsAt, guard.authUser.sub, nowIso).run();

  return c.json({
    success: true,
    message: `"${school.school_name}" को "${plugin.name}" प्लगइन का ${trialDays}-दिन ट्रायल दे दिया गया (समाप्ति: ${trialEndsAt})।`,
    trialEndsAt,
    trialDays,
  });
});

// POST /api/admin/plugins/revoke-trial - स्कूल का प्लगइन ट्रायल रद्द करें
adminApp.post('/plugins/revoke-trial', async (c) => {
  const guard = await requireSuperAdmin(c);
  if (!guard.ok) return guard.error;
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);

  const body = await c.req.json().catch(() => ({}));
  const schoolId = String(body.schoolId || '').trim();
  const pluginId = String(body.pluginId || '').trim();
  if (!schoolId || !pluginId) {
    return c.json({ success: false, message: 'schoolId और pluginId आवश्यक हैं।' }, 400);
  }

  await db.prepare(`
    UPDATE school_plugins SET status = 'inactive', payment_status = 'expired', trial_ends_at = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE school_id = ? AND plugin_id = ? AND payment_status = 'trial'
  `).bind(schoolId, pluginId).run();

  return c.json({ success: true, message: 'प्लगइन ट्रायल रद्द कर दिया गया।' });
});

// POST /api/admin/plugins/send-payment-link - प्लगइन के लिए पेमेंट लिंक भेजें (ट्रायल के बाद)
adminApp.post('/plugins/send-payment-link', async (c) => {
  const guard = await requireSuperAdmin(c);
  if (!guard.ok) return guard.error;
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);

  const body = await c.req.json().catch(() => ({}));
  const schoolId = String(body.schoolId || '').trim();
  const pluginId = String(body.pluginId || '').trim();
  const billingCycle = ['monthly', 'annual'].indexOf(String(body.billingCycle || 'monthly')) !== -1 ? String(body.billingCycle) : 'monthly';
  if (!schoolId || !pluginId) {
    return c.json({ success: false, message: 'schoolId और pluginId आवश्यक हैं।' }, 400);
  }

  const school = await db.prepare('SELECT * FROM school_tenants WHERE id = ?').bind(schoolId).first();
  if (!school) return c.json({ success: false, message: 'स्कूल नहीं मिला।' }, 404);
  const plugin = await db.prepare('SELECT * FROM plugins WHERE id = ?').bind(pluginId).first();
  if (!plugin) return c.json({ success: false, message: 'प्लगइन नहीं मिला।' }, 404);

  const basePrice = Number(plugin.price) || 0;
  if (basePrice <= 0) return c.json({ success: false, message: 'इस प्लगइन की राशि अमान्य है।' }, 400);
  const annualPrice = billingCycle === 'annual' ? +(basePrice * 12 * 0.8).toFixed(2) : basePrice;
  const gst = +(annualPrice * 0.18).toFixed(2);
  const total = +(annualPrice + gst).toFixed(2);

  const referenceId = 'VSPLG' + Date.now().toString(36) + (crypto.randomUUID().split('-').join('').slice(0, 6));
  const linkResult = await createRazorpayPaymentLink(c, {
    amountINR: total,
    description: plugin.name + ' प्लगइन (' + billingCycle + ') — ' + school.school_name,
    referenceId,
    customerName: school.school_name,
    customerEmail: school.contact_email,
    customerContact: school.contact_phone,
    notes: { school_id: schoolId, plugin_id: pluginId, billing_cycle: billingCycle, type: 'plugin' },
  });

  if (linkResult.error) return c.json({ success: false, message: linkResult.error }, 400);

  const now = new Date().toISOString();
  await db.prepare(`
    UPDATE school_plugins SET payment_status = 'pending', razorpay_payment_link_id = ?,
      billing_cycle = ?, price_per_cycle = ?, updated_at = CURRENT_TIMESTAMP
    WHERE school_id = ? AND plugin_id = ?
  `).bind(linkResult.id, billingCycle, annualPrice, schoolId, pluginId).run().catch(() => {});

  // Send email + FCM
  let emailStatus = 'skipped_no_email';
  if (school.contact_email) {
    const emailRes = await sendNotificationEmail(c.env, {
      to: school.contact_email,
      subject: `💳 Pragnya Mitra — "${plugin.name}" प्लगइन पेमेंट लिंक`,
      title: `पेमेंट लिंक: ${plugin.name}`,
      badge: `${plugin.name} • ${billingCycle} • ₹${total}`,
      message: `नमस्ते,\n\nआपके विद्यालय "${school.school_name}" के लिए "${plugin.name}" प्लगइन का पेमेंट लिंक तैयार है।\n\nराशि: ₹${annualPrice} + 18% GST = ₹${total}\n\nकृपया नीचे दिए बटन पर क्लिक करके भुगतान पूरा करें। भुगतान होते ही प्लगइन स्वचालित सक्रिय हो जाएगा।`,
      buttonText: '🟢 भुगतान करें (Pay Now) →',
      buttonUrl: linkResult.shortUrl || '',
    });
    emailStatus = emailRes.sent ? 'sent' : (emailRes.error || 'failed');
  }
  let pushStatus = 'skipped';
  try {
    const pr = await broadcastAlert(db, c.env, {
      title: `💳 पेमेंट लिंक: ${plugin.name} प्लगइन`,
      body: `"${school.school_name}" के लिए ${plugin.name} प्लगइन का भुगतान लिंक भेजा गया है।`,
      schoolId, targetRole: 'Director', priority: 'high',
      data: { type: 'plugin_payment_link', actionUrl: linkResult.shortUrl || '', pluginId },
    });
    pushStatus = pr.payload && pr.payload.success ? 'sent' : 'failed';
  } catch (_) { pushStatus = 'error'; }

  return c.json({
    success: true,
    message: `${plugin.name} प्लगइन का पेमेंट लिंक "${school.school_name}" को भेज दिया गया।`,
    paymentLink: linkResult.shortUrl, paymentLinkId: linkResult.id,
    emailStatus, pushStatus, totalAmount: total,
  });
});

// ==========================================
// Super Admin Transactions / Payment Links / Notifications
// ==========================================

// GET /api/admin/transactions - सभी स्कूलों के बिलिंग लेन-देन (transactions)
adminApp.get('/transactions', async (c) => {
  const guard = await requireSuperAdmin(c);
  if (!guard.ok) return guard.error;
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);

  const status = c.req.query('status');
  const schoolId = c.req.query('schoolId');
  const from = c.req.query('from');
  const to = c.req.query('to');

  let sql = 'SELECT bi.id, bi.invoice_number, bi.school_id, bi.description, bi.plan_name, bi.billing_cycle, '
    + 'bi.subtotal, bi.gst_percent, bi.gst_amount, bi.total_amount, bi.payment_status, bi.payment_method, '
    + 'bi.transaction_id, bi.invoice_date, bi.paid_at, bi.razorpay_order_id, bi.razorpay_payment_id, '
    + 'bi.razorpay_payment_link_id, bi.razorpay_payment_link_url, bi.webhook_received_at, '
    + 's.school_name, s.subdomain, s.contact_email '
    + 'FROM billing_invoices bi '
    + 'JOIN school_tenants s ON s.id = bi.school_id WHERE 1=1';
  const binds: any[] = [];
  if (status && status !== 'All') {
    sql += ' AND bi.payment_status = ?';
    binds.push(status);
  }
  if (schoolId) {
    sql += ' AND bi.school_id = ?';
    binds.push(schoolId);
  }
  if (from) {
    sql += ' AND bi.invoice_date >= ?';
    binds.push(from);
  }
  if (to) {
    sql += ' AND bi.invoice_date <= ?';
    binds.push(to);
  }
  sql += ' ORDER BY bi.invoice_date DESC, bi.id DESC LIMIT 500';

  let rows: any[] = [];
  try {
    const stmt = binds.length ? db.prepare(sql).bind(...binds) : db.prepare(sql);
    const result = await stmt.all();
    rows = result.results || [];
  } catch (e: any) {
    // Fallback: older schema without the new columns
    try {
      const fallbackSql = 'SELECT bi.id, bi.invoice_number, bi.school_id, bi.description, bi.plan_name, bi.billing_cycle, '
        + 'bi.subtotal, bi.gst_percent, bi.gst_amount, bi.total_amount, bi.payment_status, bi.payment_method, '
        + 'bi.transaction_id, bi.invoice_date, bi.paid_at, bi.razorpay_order_id, bi.razorpay_payment_id, '
        + 's.school_name, s.subdomain, s.contact_email '
        + 'FROM billing_invoices bi JOIN school_tenants s ON s.id = bi.school_id ORDER BY bi.invoice_date DESC LIMIT 500';
      const result = await db.prepare(fallbackSql).all();
      rows = result.results || [];
    } catch (_) {
      rows = [];
    }
  }

  const invoices = rows.map((r: any) => ({
    id: r.id,
    invoiceNumber: r.invoice_number,
    schoolId: r.school_id,
    schoolName: r.school_name,
    subdomain: r.subdomain,
    contactEmail: r.contact_email,
    description: r.description,
    planName: r.plan_name,
    billingCycle: r.billing_cycle,
    subtotal: r.subtotal,
    gstPercent: r.gst_percent,
    gstAmount: r.gst_amount,
    totalAmount: r.total_amount,
    paymentStatus: r.payment_status,
    paymentMethod: r.payment_method,
    transactionId: r.transaction_id,
    invoiceDate: r.invoice_date,
    paidAt: r.paid_at,
    razorpayOrderId: r.razorpay_order_id,
    razorpayPaymentId: r.razorpay_payment_id,
    razorpayPaymentLinkId: r.razorpay_payment_link_id || '',
    razorpayPaymentLinkUrl: r.razorpay_payment_link_url || '',
    webhookReceivedAt: r.webhook_received_at || '',
  }));

  const totalAmount = invoices.reduce((acc: number, inv: any) => acc + (inv.totalAmount || 0), 0);
  const collected = invoices.filter((inv: any) => inv.paymentStatus === 'Paid').reduce((acc: number, inv: any) => acc + (inv.totalAmount || 0), 0);
  const pending = invoices.filter((inv: any) => inv.paymentStatus === 'Processing' || inv.paymentStatus === 'Pending').reduce((acc: number, inv: any) => acc + (inv.totalAmount || 0), 0);
  const failed = invoices.filter((inv: any) => inv.paymentStatus === 'Failed').length;

  return c.json({
    success: true,
    transactions: invoices,
    summary: {
      count: invoices.length,
      paidCount: invoices.filter((inv: any) => inv.paymentStatus === 'Paid').length,
      totalAmount: +totalAmount.toFixed(2),
      collected: +collected.toFixed(2),
      pending: +pending.toFixed(2),
      failedCount: failed,
    },
  });
});

// GET /api/admin/webhook-events - हाल के Razorpay webhook इवेंट्स (audit)
adminApp.get('/webhook-events', async (c) => {
  const guard = await requireSuperAdmin(c);
  if (!guard.ok) return guard.error;
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  try {
    const rows = await db.prepare('SELECT id, event_id, event_type, entity_id, school_id, processed, processed_at, received_at FROM razorpay_webhook_events ORDER BY received_at DESC LIMIT 100').all();
    return c.json({ success: true, events: rows.results || [] });
  } catch (e: any) {
    return c.json({ success: true, events: [] });
  }
});

// POST /api/admin/schools/send-payment-link - स्कूल को Razorpay पेमेंट लिंक भेजें (email + FCM)
adminApp.post('/schools/send-payment-link', async (c) => {
  const guard = await requireSuperAdmin(c);
  if (!guard.ok) return guard.error;
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);

  const body = await c.req.json().catch(() => ({}));
  const schoolId = String(body.schoolId || '').trim();
  const planId = String(body.planId || 'starter').trim();
  const billingCycle = ['monthly', 'quarterly', 'annual'].indexOf(String(body.billingCycle || 'annual')) !== -1 ? String(body.billingCycle) : 'annual';

  if (!schoolId) return c.json({ success: false, message: 'schoolId आवश्यक है।' }, 400);

  const school = await db.prepare('SELECT * FROM school_tenants WHERE id = ?').bind(schoolId).first();
  if (!school) return c.json({ success: false, message: 'स्कूल नहीं मिला।' }, 404);

  const plan = await loadSubscriptionPlanById(db, planId);
  if (!plan || plan.isTrial) return c.json({ success: false, message: 'कृपया कोई भुगतान (non-trial) प्लान चुनें।' }, 400);

  const basePrice = billingCycle === 'monthly' ? (plan.monthlyPrice || 0)
    : billingCycle === 'quarterly' ? (plan.quarterlyPrice || 0)
    : (plan.annualPrice || 0);
  if (basePrice <= 0) return c.json({ success: false, message: 'इस प्लान की राशि अमान्य है।' }, 400);

  const gst = +(basePrice * 0.18).toFixed(2);
  const total = +(basePrice + gst).toFixed(2);

  const referenceId = 'VS-' + schoolId + '-' + Date.now();
  const linkResult = await createRazorpayPaymentLink(c, {
    amountINR: total,
    description: plan.name + ' सदस्यता (' + billingCycle + ') — ' + school.school_name,
    referenceId,
    customerName: school.school_name,
    customerEmail: school.contact_email,
    customerContact: school.contact_phone,
    notes: { school_id: schoolId, plan_id: plan.id, billing_cycle: billingCycle },
  });

  if (linkResult.error) {
    return c.json({ success: false, message: linkResult.error }, 400);
  }

  const invoiceNumber = 'VS-INV-' + Date.now() + '-' + (crypto.randomUUID().split('-').join('').slice(0, 8));
  const now = new Date().toISOString();
  const invoiceId = 'binv-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);

  // Store the invoice with the payment link reference so the webhook can resolve it.
  try {
    await db.prepare(
      'INSERT INTO billing_invoices (id, school_id, invoice_number, description, plan_name, billing_cycle, subtotal, gst_percent, gst_amount, total_amount, payment_status, payment_method, transaction_id, invoice_date, due_date, paid_at, razorpay_payment_link_id, razorpay_payment_link_url) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
    ).bind(
      invoiceId, schoolId, invoiceNumber, plan.name + ' सदस्यता', plan.name, billingCycle,
      basePrice, 18, gst, total, 'Processing', 'Razorpay', '',
      now.split('T')[0], now.split('T')[0], '', linkResult.id || '', linkResult.shortUrl || ''
    ).run();
  } catch (e: any) {
    // Fallback for older schema without payment link columns.
    await db.prepare(
      'INSERT INTO billing_invoices (id, school_id, invoice_number, description, plan_name, billing_cycle, subtotal, gst_percent, gst_amount, total_amount, payment_status, payment_method, transaction_id, invoice_date, due_date, paid_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
    ).bind(
      invoiceId, schoolId, invoiceNumber, plan.name + ' सदस्यता', plan.name, billingCycle,
      basePrice, 18, gst, total, 'Processing', 'Razorpay', '',
      now.split('T')[0], now.split('T')[0], ''
    ).run();
  }

  // Send branded email with the payment link button.
  let emailStatus = 'skipped_no_email';
  if (school.contact_email) {
    const emailRes = await sendNotificationEmail(c.env, {
      to: school.contact_email,
      subject: `💳 Pragnya Mitra — "${school.school_name}" के लिए ${plan.name} सदस्यता पेमेंट लिंक`,
      title: `पेमेंट लिंक: ${plan.name} प्लान`,
      badge: `${plan.name} • ${billingCycle} • ₹${total}`,
      message: `नमस्ते,\n\nआपके विद्यालय "${school.school_name}" के लिए ${plan.name} प्लान की सदस्यता (${billingCycle}) का पेमेंट लिंक तैयार है।\n\nराशि: ₹${basePrice} + 18% GST = ₹${total}\n\nकृपया नीचे दिए बटन पर क्लिक करके सुरक्षित Razorpay पेज पर भुगतान पूरा करें। भुगतान होते ही आपका प्लान स्वचालित सक्रिय हो जाएगा।`,
      buttonText: '🟢 सुरक्षित भुगतान करें (Pay Now) →',
      buttonUrl: linkResult.shortUrl || '',
    });
    emailStatus = emailRes.sent ? 'sent' : (emailRes.error || 'failed');
  }

  // Send FCM push notification to the school's Director.
  let pushStatus = 'skipped';
  try {
    const pr = await broadcastAlert(db, c.env, {
      title: `💳 पेमेंट लिंक: ${plan.name} सदस्यता`,
      body: `"${school.school_name}" के लिए ${plan.name} प्लान का भुगतान लिंक भेजा गया है। भुगतान पूरा करने के लिए क्लिक करें।`,
      schoolId,
      targetRole: 'Director',
      priority: 'high',
      data: { type: 'payment_link', actionUrl: linkResult.shortUrl || '', planId: plan.id },
    });
    pushStatus = pr.payload && pr.payload.success ? 'sent' : (pr.payload && pr.payload.message || 'failed');
  } catch (pushErr) {
    pushStatus = 'error';
    console.error('[admin/send-payment-link] push failed:', pushErr);
  }

  return c.json({
    success: true,
    message: `पेमेंट लिंक "${school.school_name}" को भेज दिया गया।`,
    paymentLink: linkResult.shortUrl,
    paymentLinkId: linkResult.id,
    invoiceId,
    emailStatus,
    pushStatus,
    planName: plan.name,
    totalAmount: total,
  });
});

// POST /api/admin/schools/notify - किसी स्कूल को मैन्युअल FCM पुश नोटिफिकेशन भेजें
adminApp.post('/schools/notify', async (c) => {
  const guard = await requireSuperAdmin(c);
  if (!guard.ok) return guard.error;
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);

  const body = await c.req.json().catch(() => ({}));
  const schoolId = String(body.schoolId || '').trim();
  const title = String(body.title || '').trim();
  const notifBody = String(body.body || '').trim();
  const priority = String(body.priority || 'high') === 'normal' ? 'normal' : 'high';
  const targetRole = String(body.targetRole || 'Director');

  if (!schoolId || !title || !notifBody) {
    return c.json({ success: false, message: 'schoolId, title और body आवश्यक हैं।' }, 400);
  }

  const school = await db.prepare('SELECT id, school_name FROM school_tenants WHERE id = ?').bind(schoolId).first();
  if (!school) return c.json({ success: false, message: 'स्कूल नहीं मिला।' }, 404);

  const result = await broadcastAlert(db, c.env, {
    title,
    body: notifBody,
    schoolId,
    targetRole,
    priority,
    data: { type: 'admin_manual', actionUrl: body.actionUrl || '' },
  });

  return c.json({ success: true, message: 'नोटिफिकेशन भेजा गया।', result: result.payload });
});

// ==========================================
// Recurring Subscription Lifecycle (Admin)
// ==========================================

// GET /api/admin/subscriptions - सभी recurring सदस्यताओं की सूची
adminApp.get('/subscriptions', async (c) => {
  const guard = await requireSuperAdmin(c);
  if (!guard.ok) return guard.error;
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  try {
    const rows = await db.prepare(`
      SELECT ss.school_id, ss.plan_id, ss.plan_name, ss.billing_cycle, ss.status,
             ss.auto_pay_enabled, ss.mandate_id, ss.mandate_status,
             ss.razorpay_subscription_id, ss.razorpay_plan_id,
             ss.total_cycles, ss.remaining_cycles,
             ss.current_cycle_start, ss.current_cycle_end, ss.next_billing_date,
             ss.paused_at, ss.updated_at,
             s.school_name, s.status AS school_status, s.contact_email
      FROM school_subscriptions ss
      JOIN school_tenants s ON ss.school_id = s.id
      WHERE ss.razorpay_subscription_id IS NOT NULL
      ORDER BY ss.updated_at DESC
      LIMIT 500
    `).all();
    return c.json({ success: true, subscriptions: rows.results || [] });
  } catch (e: any) {
    return c.json({ success: true, subscriptions: [] });
  }
});

// POST /api/admin/subscriptions/cancel - admin किसी स्कूल की recurring सदस्यता रद्द करें
adminApp.post('/subscriptions/cancel', async (c) => {
  const guard = await requireSuperAdmin(c);
  if (!guard.ok) return guard.error;
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const body = await c.req.json().catch(() => ({}));
  const schoolId = String(body.schoolId || '').trim();
  const cancelAtCycleEnd = !!body.cancelAtCycleEnd;
  if (!schoolId) return c.json({ success: false, message: 'schoolId आवश्यक।' }, 400);

  const sub = await db.prepare('SELECT razorpay_subscription_id FROM school_subscriptions WHERE school_id = ?').bind(schoolId).first();
  if (!sub || !sub.razorpay_subscription_id) return c.json({ success: false, message: 'कोई recurring सदस्यता नहीं।' }, 400);

  const result = await cancelRazorpaySubscription(c.env, sub.razorpay_subscription_id, cancelAtCycleEnd);
  if (result.error) return c.json({ success: false, message: result.error }, 400);

  await db.prepare("UPDATE school_subscriptions SET status = 'Canceled', mandate_status = 'revoked', updated_at = ? WHERE school_id = ?")
    .bind(new Date().toISOString(), schoolId).run().catch(() => {});
  return c.json({ success: true, message: cancelAtCycleEnd ? 'सदस्यता चक्र के अंत में रद्द होगी।' : 'सदस्यता रद्द कर दी गई।' });
});

// POST /api/admin/subscriptions/pause - admin सदस्यता रोकें
adminApp.post('/subscriptions/pause', async (c) => {
  const guard = await requireSuperAdmin(c);
  if (!guard.ok) return guard.error;
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const body = await c.req.json().catch(() => ({}));
  const schoolId = String(body.schoolId || '').trim();
  if (!schoolId) return c.json({ success: false, message: 'schoolId आवश्यक।' }, 400);

  const sub = await db.prepare('SELECT razorpay_subscription_id FROM school_subscriptions WHERE school_id = ?').bind(schoolId).first();
  if (!sub || !sub.razorpay_subscription_id) return c.json({ success: false, message: 'कोई recurring सदस्यता नहीं।' }, 400);

  const result = await pauseRazorpaySubscription(c.env, sub.razorpay_subscription_id);
  if (result.error) return c.json({ success: false, message: result.error }, 400);

  await db.prepare("UPDATE school_subscriptions SET paused_at = ?, updated_at = ? WHERE school_id = ?")
    .bind(new Date().toISOString(), new Date().toISOString(), schoolId).run().catch(() => {});
  return c.json({ success: true, message: 'सदस्यता रोक दी गई।' });
});

// POST /api/admin/subscriptions/resume - admin सदस्यता फिर से शुरू करें
adminApp.post('/subscriptions/resume', async (c) => {
  const guard = await requireSuperAdmin(c);
  if (!guard.ok) return guard.error;
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const body = await c.req.json().catch(() => ({}));
  const schoolId = String(body.schoolId || '').trim();
  if (!schoolId) return c.json({ success: false, message: 'schoolId आवश्यक।' }, 400);

  const sub = await db.prepare('SELECT razorpay_subscription_id FROM school_subscriptions WHERE school_id = ?').bind(schoolId).first();
  if (!sub || !sub.razorpay_subscription_id) return c.json({ success: false, message: 'कोई recurring सदस्यता नहीं।' }, 400);

  const result = await resumeRazorpaySubscription(c.env, sub.razorpay_subscription_id);
  if (result.error) return c.json({ success: false, message: result.error }, 400);

  await db.prepare("UPDATE school_subscriptions SET paused_at = NULL, status = 'Active', updated_at = ? WHERE school_id = ?")
    .bind(new Date().toISOString(), schoolId).run().catch(() => {});
  return c.json({ success: true, message: 'सदस्यता फिर से शुरू हो गई।' });
});

// GET /api/admin/subscriptions/detail - स्कूल की recurring सदस्यता का विस्तृत विवरण
adminApp.get('/subscriptions/detail', async (c) => {
  const guard = await requireSuperAdmin(c);
  if (!guard.ok) return guard.error;
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const schoolId = c.req.query('schoolId') || '';
  if (!schoolId) return c.json({ success: false, message: 'schoolId आवश्यक।' }, 400);

  const sub = await db.prepare('SELECT * FROM school_subscriptions WHERE school_id = ?').bind(schoolId).first();
  if (!sub) return c.json({ success: false, message: 'सदस्यता नहीं मिली।' }, 404);

  let razorpayDetail: any = null;
  if (sub.razorpay_subscription_id) {
    razorpayDetail = await fetchRazorpaySubscription(c.env, sub.razorpay_subscription_id);
  }

  return c.json({
    success: true,
    subscription: {
      planId: sub.plan_id, planName: sub.plan_name, billingCycle: sub.billing_cycle,
      status: sub.status, autoPayEnabled: !!sub.auto_pay_enabled,
      mandateStatus: sub.mandate_status, mandateId: sub.mandate_id,
      razorpaySubscriptionId: sub.razorpay_subscription_id,
      totalCycles: sub.total_cycles, remainingCycles: sub.remaining_cycles,
      currentCycleStart: sub.current_cycle_start, currentCycleEnd: sub.current_cycle_end,
      nextBillingDate: sub.next_billing_date, pausedAt: sub.paused_at,
    },
    razorpayDetail: razorpayDetail && !razorpayDetail.error ? razorpayDetail : null,
  });
});

// ==========================================
// Razorpay Plan Management (Admin creates/syncs plans on Razorpay)
// ==========================================

// GET /api/admin/razorpay/plans - list all cached Razorpay plans
adminApp.get('/razorpay/plans', async (c) => {
  const guard = await requireSuperAdmin(c);
  if (!guard.ok) return guard.error;
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  try {
    const rows = await db.prepare('SELECT * FROM razorpay_plans_cache ORDER BY created_at DESC').all();
    return c.json({ success: true, plans: rows.results || [] });
  } catch (e: any) {
    return c.json({ success: true, plans: [] });
  }
});

// POST /api/admin/razorpay/plans/create - create a Razorpay Plan from a platform plan
adminApp.post('/razorpay/plans/create', async (c) => {
  const guard = await requireSuperAdmin(c);
  if (!guard.ok) return guard.error;
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);

  const body = await c.req.json().catch(() => ({}));
  const planId = String(body.planId || '').trim();
  const billingCycle = String(body.billingCycle || 'monthly').trim();

  if (!planId) return c.json({ success: false, message: 'planId आवश्यक है।' }, 400);

  const allPlans = await loadSubscriptionPlans(db);
  const plan = allPlans.find((p: any) => p.id === planId && !p.isTrial);
  if (!plan) return c.json({ success: false, message: 'प्लान नहीं मिला।' }, 404);

  const period = billingCycle === 'annual' ? 'yearly' : 'monthly';
  const interval = billingCycle === 'quarterly' ? 3 : 1;
  const baseAmount = billingCycle === 'monthly' ? plan.monthlyPrice : (billingCycle === 'quarterly' ? plan.quarterlyPrice : plan.annualPrice);
  if (!baseAmount || baseAmount <= 0) return c.json({ success: false, message: 'प्लान की राशि अमान्य है।' }, 400);

  // Check if already cached
  const existing = await db.prepare('SELECT razorpay_plan_id FROM razorpay_plans_cache WHERE platform_plan_id = ? AND period = ? AND amount = ?')
    .bind(planId, period, Math.round(baseAmount * 100)).first();
  if (existing) return c.json({ success: false, message: 'यह प्लान पहले से Razorpay पर बना हुआ है।', razorpayPlanId: existing.razorpay_plan_id }, 409);

  // Create on Razorpay
  const result = await createRazorpayPlan(c.env, {
    period: period as 'monthly' | 'yearly',
    interval,
    amountINR: baseAmount,
    name: plan.name + ' (' + billingCycle + ')',
    description: plan.name + ' सदस्यता — Pragnya Mitra',
    notes: { platform_plan_id: planId, billing_cycle: billingCycle },
  });
  if (result.error) return c.json({ success: false, message: result.error }, 400);

  // Cache in DB
  const cacheId = 'rpc-' + Date.now();
  await db.prepare('INSERT INTO razorpay_plans_cache (id, platform_plan_id, razorpay_plan_id, period, amount, razorpay_item_id, created_at) VALUES (?,?,?,?,?,?,?)')
    .bind(cacheId, planId, result.id, period, Math.round(baseAmount * 100), result.itemId, new Date().toISOString()).run().catch(() => {});

  return c.json({
    success: true,
    message: `Razorpay प्लान बन गया: ${plan.name} (${billingCycle}) — ₹${baseAmount}/${period === 'yearly' ? 'वर्ष' : 'माह'}`,
    razorpayPlanId: result.id,
    razorpayItemId: result.itemId,
  });
});

// POST /api/admin/razorpay/plans/sync-all - create Razorpay Plans for all active platform plans (all cycles)
adminApp.post('/razorpay/plans/sync-all', async (c) => {
  const guard = await requireSuperAdmin(c);
  if (!guard.ok) return guard.error;
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);

  const allPlans = await loadSubscriptionPlans(db);
  const activePlans = allPlans.filter((p: any) => !p.isTrial && p.active !== false);
  const results: any[] = [];

  for (const plan of activePlans) {
    const cycles = [
      { cycle: 'monthly', amount: plan.monthlyPrice, period: 'monthly', interval: 1 },
      { cycle: 'quarterly', amount: plan.quarterlyPrice, period: 'monthly', interval: 3 },
      { cycle: 'annual', amount: plan.annualPrice, period: 'yearly', interval: 1 },
    ];
    for (const cyc of cycles) {
      if (!cyc.amount || cyc.amount <= 0) continue;
      // Skip if already cached
      const existing = await db.prepare('SELECT razorpay_plan_id FROM razorpay_plans_cache WHERE platform_plan_id = ? AND period = ? AND amount = ?')
        .bind(plan.id, cyc.period, Math.round(cyc.amount * 100)).first();
      if (existing) { results.push({ planId: plan.id, cycle: cyc.cycle, status: 'exists', razorpayPlanId: existing.razorpay_plan_id }); continue; }

      const result = await createRazorpayPlan(c.env, {
        period: cyc.period as 'monthly' | 'yearly',
        interval: cyc.interval,
        amountINR: cyc.amount,
        name: plan.name + ' (' + cyc.cycle + ')',
        description: plan.name + ' सदस्यता — Pragnya Mitra',
        notes: { platform_plan_id: plan.id, billing_cycle: cyc.cycle },
      });
      if (result.error) { results.push({ planId: plan.id, cycle: cyc.cycle, status: 'error', error: result.error }); continue; }

      const cacheId = 'rpc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 4);
      await db.prepare('INSERT INTO razorpay_plans_cache (id, platform_plan_id, razorpay_plan_id, period, amount, razorpay_item_id, created_at) VALUES (?,?,?,?,?,?,?)')
        .bind(cacheId, plan.id, result.id, cyc.period, Math.round(cyc.amount * 100), result.itemId, new Date().toISOString()).run().catch(() => {});

      results.push({ planId: plan.id, cycle: cyc.cycle, status: 'created', razorpayPlanId: result.id });
    }
  }

  const created = results.filter(r => r.status === 'created').length;
  const exists = results.filter(r => r.status === 'exists').length;
  const errors = results.filter(r => r.status === 'error').length;

  return c.json({
    success: true,
    message: `Razorpay प्लान सिंक पूर्ण: ${created} नए बनाए, ${exists} पहले से मौजूद, ${errors} त्रुटियां।`,
    results,
    summary: { created, exists, errors },
  });
});

// GET /api/admin/razorpay/plans/detail - fetch live Razorpay plan details by razorpay_plan_id
adminApp.get('/razorpay/plans/detail', async (c) => {
  const guard = await requireSuperAdmin(c);
  if (!guard.ok) return guard.error;
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const razorpayPlanId = c.req.query('razorpayPlanId') || '';
  if (!razorpayPlanId) return c.json({ success: false, message: 'razorpayPlanId आवश्यक।' }, 400);

  const detail = await fetchRazorpayPlan(c.env, razorpayPlanId);
  if (detail.error) return c.json({ success: false, message: detail.error }, 400);

  // Return only whitelisted fields
  const item = detail.item || {};
  return c.json({
    success: true,
    plan: {
      id: detail.id,
      status: detail.status || 'active',
      period: detail.period,
      interval: detail.interval,
      amount: item.amount ? item.amount / 100 : 0,
      currency: item.currency || 'INR',
      name: item.name || '',
      description: item.description || '',
      createdAt: detail.created_at,
    },
  });
});

export default adminApp;
