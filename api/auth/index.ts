import { Hono } from 'hono';
import { getDB, makeUniqueUsername } from '../db';
import { hashPassword, verifyPassword, signToken, getAuthUser } from '../lib/auth';
import { issueResetToken, consumeResetToken } from '../lib/reset-tokens';
import { sendPasswordResetEmail, sendWelcomeEmail, getRequestOrigin } from '../lib/email';
import { syncTenantFromPlatform } from '../lib/tenant-sync';
import { provisionDedicatedWorker } from '../lib/provisioning';
import { isAuthorizedPlatformEmail, getAuthorizedPlatformEmail } from '../admin';

const authApp = new Hono<{ Bindings: any }>();

// POST /api/auth/login - role is auto-detected from the real user record.
// There is deliberately no role parameter and no demo/quick login fallback.
authApp.post('/login', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const identifier = String(body.email || body.username || '').trim().toLowerCase();
  const password = String(body.password || '').trim();

  if (!identifier || !password) {
    return c.json({ success: false, message: 'ईमेल/यूज़रनेम और पासवर्ड दोनों आवश्यक हैं।' }, 400);
  }

  const db = getDB(c);
  if (!db) {
    return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  }

  const isDedicated = !!(c.env && (c.env.IS_DEDICATED_WORKER === 'true' || c.env.SCHOOL_ID));

  // 1) Platform Super Admin
  // Strict Isolation: Super Admin is strictly for the central control plane (pragnya.nasven.com).
  // Super Admin login is completely forbidden on dedicated workers.
  if (!isDedicated) {
    const admin = await db.prepare('SELECT * FROM platform_admins WHERE LOWER(email) = ?').bind(identifier).first();
    if (admin) {
      let platformEmail = getAuthorizedPlatformEmail(c.env);
      if (!platformEmail && c.env && c.env.CONFIG_KV) {
        try {
          platformEmail = String((await c.env.CONFIG_KV.get('PLATFORM_ADMIN_EMAIL')) || '').trim().toLowerCase();
        } catch (_) {}
      }

      const normalizedAdminEmail = String(admin.email || '').trim().toLowerCase();
      const isAuthorized = platformEmail
        ? normalizedAdminEmail === platformEmail
        : isAuthorizedPlatformEmail(normalizedAdminEmail, c.env);

      if (!isAuthorized) {
        return c.json({ success: false, message: 'अनधिकृत Super Admin ईमेल। केवल अधिकृत प्लेटफ़ॉर्म एडमिन ही अनुमत है।' }, 403);
      }

      const ok = await verifyPassword(password, admin.password_hash || '');
      if (!ok) return c.json({ success: false, message: 'अमान्य पासवर्ड।' }, 401);
      await db.prepare('UPDATE platform_admins SET updated_at = ? WHERE id = ?').bind(new Date().toISOString(), admin.id).run();
      const SESSION_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 days
      const token = await signToken(c, {
        sub: admin.id,
        email: admin.email,
        role: 'SuperAdmin',
        schoolId: '',
        exp: Math.floor(Date.now() / 1000) + SESSION_EXPIRY_SECONDS,
      });
      return c.json({
        success: true,
        message: 'Super Admin लॉगिन सफल।',
        token,
        user: { id: admin.id, fullName: admin.full_name, email: admin.email, phone: admin.phone, role: 'SuperAdmin', designation: 'प्लेटफ़ॉर्म Super Admin', schoolId: '' },
      });
    }
  } else {
    // If on a dedicated worker, prevent any platform admin login attempt
    try {
      const maybeAdmin = await db.prepare('SELECT id FROM platform_admins WHERE LOWER(email) = ?').bind(identifier).first();
      if (maybeAdmin) {
        return c.json({ success: false, message: 'Dedicated स्कूल पोर्टल पर Super Admin लॉगिन अनुमत नहीं है। कृपया मुख्य प्लेटफ़ॉर्म (pragnya.nasven.com) का उपयोग करें।' }, 403);
      }
    } catch (_) {
      // table may not exist in dedicated DB, safe to ignore
    }
  }

  // 2) School user (Director / Principal / Staff)
  let user = await db.prepare('SELECT * FROM system_users WHERE LOWER(email) = ? OR LOWER(username) = ?').bind(identifier, identifier).first();

  // On dedicated workers, always refresh tenant data from the central platform so
  // system_users, school_profile and school_tenants stay in sync with the main DB
  // (self-healing: pulls newly created users, fixes stale school_tenants rows).
  // The user lookup runs BEFORE the sync (fast path) and AGAIN after the sync in
  // case the account only exists on the platform (e.g. just-provisioned schools).
  if (isDedicated && c.env.SCHOOL_ID) {
    try {
      await syncTenantFromPlatform(c, c.env.SCHOOL_ID);
      if (!user) {
        user = await db.prepare('SELECT * FROM system_users WHERE LOWER(email) = ? OR LOWER(username) = ?').bind(identifier, identifier).first();
      }
    } catch (syncErr) {
      console.warn('Auto-sync during login encountered an error:', syncErr);
    }
  }

  // ── Shared / management portal is NOT a school portal ──────────────────
  // pragnya.nasven.com serves the public website (Next.js). School staff cannot
  // obtain a session here at all — that is exactly what created the cross-DB
  // data leak (school writes landing in the shared/main D1). Live dedicated
  // schools are redirected to their own portal; freshly registered schools get
  // a "portal is being provisioned" notice (instant trial — no approval).
  // Dedicated workers skip this block entirely and authenticate below.
  if (!isDedicated) {
    let dedicatedDomain: string | null = null;
    let standbyDomain: string | null = null;
    if (user && user.school_id) {
      try {
        const tenantRec = await db.prepare(
          'SELECT dedicated_slug, dedicated_domain, provisioning_status, deleted_at FROM school_tenants WHERE id = ?'
        ).bind(user.school_id).first();
        if (tenantRec && !tenantRec.deleted_at && tenantRec.dedicated_slug) {
          const rawDomain = String(tenantRec.dedicated_domain || (tenantRec.dedicated_slug + '.pragnya.nasven.com'));
          const cleanDomain = String(rawDomain).replace(/^https?:\/\//, '').replace(/\/+$/, '');
          if (tenantRec.provisioning_status === 'live') dedicatedDomain = cleanDomain;
          else standbyDomain = cleanDomain;
        }
      } catch (_) {
        // tenant lookup failed (e.g. table missing) — generic notice below
      }
    }
    if (dedicatedDomain) {
      return c.json({
        success: false,
        code: 'USE_DEDICATED_DOMAIN',
        dedicatedDomain,
        dedicatedUrl: 'https://' + dedicatedDomain,
        message: 'आपका स्कूल अपने निजी पोर्टल पर चला गया है। कृपया https://' + dedicatedDomain + ' से लॉगिन करें।',
      }, 403);
    }
    if (standbyDomain) {
      return c.json({
        success: false,
        code: 'PORTAL_READY_SOON',
        dedicatedDomain: standbyDomain,
        dedicatedUrl: 'https://' + standbyDomain,
        message: 'आपका स्कूल अभी पंजीकृत हुआ है और उसका निजी पोर्टल तैयार हो रहा है (Free Trial सक्रिय)। कुछ ही मिनटों में https://' + standbyDomain + ' पर लॉगिन करें।',
      }, 403);
    }
    return c.json({
      success: false,
      code: 'PORTAL_MANAGEMENT_ONLY',
      message: 'यह pragnya.nasven.com पर मुख्य वेबसाइट/प्रबंधन पोर्टल है। स्कूल लॉगिन आपके स्कूल के निजी पोर्टल (slug.pragnya.nasven.com) से किया जाता है।',
    }, 403);
  }

  // ── Dedicated worker: school login path ────────────────────────────────
  if (!user) {
    return c.json({
      success: false,
      message: 'इस स्कूल पोर्टल पर यह उपयोगकर्ता नहीं मिला। कृपया अपने स्कूल एडमिन/डायरेक्टर से संपर्क करें।',
    }, 401);
  }
  if (!user.password_hash) {
    const invite = await issueResetToken(db, user.id, 'system', 'invite');
    if (!invite.limited) {
      const resetLink = getRequestOrigin(c, c.env) + '/?reset=' + invite.token;
      await sendPasswordResetEmail(c.env, { to: user.email, name: user.full_name, resetLink, invite: true });
    }
    return c.json({ success: false, code: 'PASSWORD_NOT_SET', message: 'इस खाते का पासवर्ड अभी सेट नहीं है। हमने आपके ईमेल पर पासवर्ड सेट करने का लिंक भेज दिया है। कृपया इनबॉक्स/स्पैम देखें।' }, 401);
  }
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return c.json({ success: false, message: 'अमान्य पासवर्ड।' }, 401);

  // 3) School approval gate: block login until Super Admin approves the school.
  if (user.school_id) {
    const tenant = await db.prepare('SELECT status, registration_status, deleted_at FROM school_tenants WHERE id = ?').bind(user.school_id).first();
    if (tenant) {
      const regStatus = String(tenant.registration_status || '');
      if (tenant.deleted_at) {
        return c.json({ success: false, message: 'यह स्कूल हटा दिया गया है। कृपया प्लेटफ़ॉर्म Super Admin से संपर्क करें।' }, 403);
      }
      if (regStatus === 'Pending_Approval') {
        return c.json({ success: false, message: 'आपका स्कूल अभी Super Admin द्वारा अनुमोदित (approve) नहीं हुआ है। कृपया अनुमोदन की प्रतीक्षा करें।' }, 403);
      }
      if (regStatus === 'Rejected') {
        return c.json({ success: false, message: 'आपका स्कूल पंजीकरण अस्वीकृत (rejected) कर दिया गया है। कृपया प्लेटफ़ॉर्म Super Admin से संपर्क करें।' }, 403);
      }
      if (regStatus === 'Deleted') {
        return c.json({ success: false, message: 'यह स्कूल हटा दिया गया है। कृपया प्लेटफ़ॉर्म Super Admin से संपर्क करें।' }, 403);
      }
    }
  }

  await db.prepare('UPDATE system_users SET last_login = ? WHERE id = ?').bind(new Date().toISOString(), user.id).run();

  const schoolId = user.school_id || 'school-01';
  const SESSION_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 days
  const token = await signToken(c, {
    sub: user.id,
    email: user.email,
    role: user.role,
    schoolId,
    exp: Math.floor(Date.now() / 1000) + SESSION_EXPIRY_SECONDS,
  });

  return c.json({
    success: true,
    message: user.full_name + ' के रूप में लॉगिन सफल।',
    token,
    user: {
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      designation: user.designation,
      department: user.department,
      schoolId,
    },
  });
});

// POST /api/auth/forgot-password - email पर एक बार उपयोग होने वाला रीसेट लिंक भेजें।
// Response जानबूझकर generic रखा गया है ताकि किसी ईमेल के पंजीकृत होने की जानकारी leak न हो।
authApp.post('/forgot-password', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const body = await c.req.json().catch(() => ({}));
  const identifier = String(body.email || '').trim().toLowerCase();
  if (!identifier) {
    return c.json({ success: false, message: 'कृपया पंजीकृत ईमेल दर्ज करें।' }, 400);
  }

  const generic = { success: true, message: 'यदि यह ईमेल पंजीकृत है, तो पासवर्ड रीसेट लिंक भेज दिया गया है। कृपया इनबॉक्स/स्पैम देखें।' };

  let userId = '';
  let userType = '';
  let userEmail = '';
  let userName = '';
  let tokenType = 'reset';

  const isDedicated = !!(c.env && (c.env.IS_DEDICATED_WORKER === 'true' || c.env.SCHOOL_ID));
  const user = await db.prepare('SELECT * FROM system_users WHERE LOWER(email) = ?').bind(identifier).first();
  if (user) {
    userId = user.id;
    userType = 'system';
    userEmail = user.email;
    userName = user.full_name;
    tokenType = user.password_hash ? 'reset' : 'invite';
  } else if (!isDedicated) {
    const admin = await db.prepare('SELECT * FROM platform_admins WHERE LOWER(email) = ?').bind(identifier).first();
    if (admin) {
      userId = admin.id;
      userType = 'admin';
      userEmail = admin.email;
      userName = admin.full_name || 'Super Admin';
      tokenType = 'reset';
    }
  }

  if (!userId) return c.json(generic);

  const issued = await issueResetToken(db, userId, userType, tokenType);
  if (issued.limited || !issued.token) return c.json(generic);

  // Reset link routing: on the shared worker, live dedicated schools get the
  // link on their OWN portal origin; everyone else (incl. newly-registered
  // schools whose portal is still provisioning) gets the website reset page.
  let resetOrigin = getRequestOrigin(c, c.env);
  if (!isDedicated && user && user.school_id) {
    try {
      const tenantRec = await db.prepare(
        'SELECT dedicated_slug, dedicated_domain, provisioning_status FROM school_tenants WHERE id = ?'
      ).bind(user.school_id).first();
      if (tenantRec && tenantRec.dedicated_slug && tenantRec.provisioning_status === 'live') {
        const rawDomain = String(tenantRec.dedicated_domain || (tenantRec.dedicated_slug + '.pragnya.nasven.com'));
        resetOrigin = 'https://' + String(rawDomain).replace(/^https?:\/\//, '').replace(/\/+$/, '');
      } else {
        resetOrigin = 'https://pragnya.nasven.com/reset';
      }
    } catch (_) {
      // fall through to default origin below
    }
  } else if (!isDedicated) {
    // platform admins / unknown users → website reset page
    resetOrigin = 'https://pragnya.nasven.com/reset';
  }

  const resetLink = resetOrigin.indexOf('/reset') !== -1
    ? resetOrigin + '?token=' + issued.token
    : resetOrigin + '/?reset=' + issued.token;
  await sendPasswordResetEmail(c.env, { to: userEmail, name: userName, resetLink, invite: tokenType === 'invite' });
  return c.json(generic);
});

// POST /api/auth/reset-password - magic link से नया पासवर्ड सेट करें।
authApp.post('/reset-password', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const body = await c.req.json().catch(() => ({}));
  const token = String(body.token || '').trim();
  const password = String(body.password || '').trim();

  if (!token) return c.json({ success: false, message: 'रीसेट टोकन आवश्यक है।' }, 400);
  if (!password || password.length < 6) {
    return c.json({ success: false, message: 'नया पासवर्ड कम से कम 6 अक्षरों का होना चाहिए।' }, 400);
  }

  const consumed = await consumeResetToken(db, token);
  if (!consumed) {
    return c.json({ success: false, message: 'रीसेट लिंक अमान्य या समाप्त हो चुका है। कृपया नया लिंक माँगें।' }, 400);
  }

  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();
  if (consumed.userType === 'admin') {
    await db.prepare('UPDATE platform_admins SET password_hash = ?, updated_at = ? WHERE id = ?').bind(passwordHash, now, consumed.userId).run();
  } else {
    await db.prepare('UPDATE system_users SET password_hash = ?, updated_at = ? WHERE id = ?').bind(passwordHash, now, consumed.userId).run();
  }

  return c.json({ success: true, message: 'पासवर्ड सफलतापूर्वक सेट हो गया। अब आप लॉगिन कर सकते हैं।' });
});

// POST /api/auth/register - नया स्कूल + डायरेक्टर रजिस्ट्रेशन।
// अब INSTANT ACCESS: पंजीकरण के साथ ही 7-दिन FREE TRIAL तुरंत सक्रिय होता है
// (status Active + Approved), किसी Super Admin approval की आवश्यकता नहीं है।
// स्कूल का nija dedicated portal स्वतः provision होकर कुछ ही मिनटों में
// slug.pragnya.nasven.com पर live आ जाता है (schools.json commit → CI auto-deploy).
authApp.post('/register', async (c) => {
  const isDedicated = !!(c.env && (c.env.IS_DEDICATED_WORKER === 'true' || c.env.SCHOOL_ID));
  if (isDedicated) {
    return c.json({
      success: false,
      message: 'Dedicated स्कूल पोर्टल से नया स्कूल रजिस्टर नहीं किया जा सकता। कृपया मुख्य वेबसाइट (pragnya.nasven.com) पर जाएं।',
    }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);

  const schoolName = String(body.schoolName || '').trim();
  const directorName = String(body.directorName || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const phone = String(body.phone || '').trim();
  const password = String(body.password || '').trim();

  if (!schoolName || !directorName || !email || !phone || !password) {
    return c.json({ success: false, message: 'स्कूल का नाम, डायरेक्टर का नाम, ईमेल, फोन और पासवर्ड अनिवार्य हैं।' }, 400);
  }
  if (password.length < 6) {
    return c.json({ success: false, message: 'पासवर्ड कम से कम 6 अक्षरों का होना चाहिए।' }, 400);
  }

  const existing = await db.prepare('SELECT id FROM system_users WHERE LOWER(email) = ?').bind(email).first();
  if (existing) {
    return c.json({ success: false, message: 'इस ईमेल से पहले से खाता मौजूद है।' }, 409);
  }

  const schoolId = 'school-' + Date.now();
  const userId = 'usr-' + Date.now();
  const rawSubdomain = String(body.subdomain || ('school' + Date.now().toString().slice(-6))).toLowerCase().trim();
  const subdomain = rawSubdomain.replace(/[^a-z0-9-]/g, '').replace(/--+/g, '-').replace(/^-+|-+$/g, '') || ('school' + Date.now().toString().slice(-6));
  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();
  const username = await makeUniqueUsername(db, email);

  const estimatedStudents = Math.max(0, Number(body.estimatedStudents) || 0);
  const estimatedStaff = Math.max(0, Number(body.estimatedStaff) || 0);
  const VALID_PLANS = ['trial', 'starter', 'pro', 'enterprise'];
  const rawPreferredPlan = String(body.preferredPlanId || 'trial').trim().toLowerCase();
  const preferredPlanId = VALID_PLANS.includes(rawPreferredPlan) ? rawPreferredPlan : 'trial';
  const customRequirements = String(body.customRequirements || '').trim();

  // 7-दिन FREE TRIAL — instant access, कोई approval नहीं।
  const TRIAL_DAYS = 7;
  const trialEndDate = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // YYYY-MM-DD
  const today = now.split('T')[0];

  await db.prepare('INSERT INTO school_tenants (id, school_name, subdomain, custom_domain, contact_email, contact_phone, status, registration_status, plan_id, estimated_students, estimated_staff, preferred_plan_id, custom_requirements, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(schoolId, schoolName, subdomain, body.customDomain || '', email, phone, 'Active', 'Approved', preferredPlanId === 'trial' ? 'trial' : preferredPlanId, estimatedStudents, estimatedStaff, preferredPlanId, customRequirements, now).run();

  await db.prepare('UPDATE school_tenants SET trial_ends_at=?, approved_at=?, approved_by=? WHERE id=?')
    .bind(trialEndDate, now, 'system-auto-register', schoolId).run();

  await db.prepare('INSERT INTO school_profile (id, school_name, affiliation_number, board_name, school_code, email, phone, alternate_phone, address, city, state, pincode, academic_session, director_name, principal_name, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(schoolId, schoolName, body.affiliationNumber || '', body.boardName || 'CBSE', body.schoolCode || '', email, phone, body.alternatePhone || '', body.address || '', body.city || '', body.state || '', body.pincode || '', body.academicSession || '2026-2027', directorName, body.principalName || directorName, today).run();

  await db.prepare('INSERT INTO system_users (id, username, full_name, email, phone, role, designation, department, qualification, salary, status, school_id, password_hash, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(userId, username, directorName, email, phone, 'Director', body.designation || 'स्कूल निदेशक (Director)', 'प्रबंधन एवं प्रशासन', body.qualification || '', 0, 'Active', schoolId, passwordHash, now).run();

  await db.prepare('INSERT INTO school_subscriptions (id, school_id, plan_id, plan_name, billing_cycle, price_per_cycle, discount_percent, status, auto_pay_enabled, payment_method, mandate_id, next_billing_date, period_start, period_end, trial_ends_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind('sub-' + Date.now(), schoolId, 'trial', '7-दिन फ्री ट्रायल', 'monthly', 0, 0, 'Trial', 0, '', '', trialEndDate, today, trialEndDate, trialEndDate, now).run();

  if (customRequirements) {
    try {
      await db.prepare(
        'INSERT INTO school_feature_requests (id, school_id, requested_by_user_id, title, description, category, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        'freq-' + Date.now(),
        schoolId,
        userId,
        'पंजीकरण के समय विशेष आवश्यकताएं',
        customRequirements,
        'onboarding_requirement',
        'Pending',
        now,
        now
      ).run();
    } catch (_) {
      // Non-fatal if table not migrated yet
    }
  }

  // AUTO-PROVISION the school's dedicated portal (slug.pragnya.nasven.com).
  // provisionDedicatedWorker commits the school into schools.json (mode:
  // dedicated) via GitHub API — that push to main auto-triggers deploy.yml,
  // which creates the dedicated D1/R2/KV and deploys the per-school worker.
  let portalDomain = subdomain + '.pragnya.nasven.com';
  let provisioningMessage = 'आपका निजी पोर्टल तैयार हो रहा है — कुछ ही मिनटों में https://' + portalDomain + ' पर उपलब्ध होगा।';
  try {
    const provisioning = await provisionDedicatedWorker(c.env, db, {
      id: schoolId,
      school_name: schoolName,
      subdomain,
      provisioning_status: '',
    }, {});
    if (provisioning.ok && provisioning.status === 'started' && provisioning.domain) {
      portalDomain = String(provisioning.domain).replace(/^https?:\/\//, '').replace(/\/+$/, '');
    } else if (provisioning.error) {
      console.warn('[Register] auto-provision not started:', provisioning.error);
      provisioningMessage = 'आपका स्कूल खाता सक्रिय है। पोर्टल तैयारी थोड़ी देर में पूरी होगी (https://' + portalDomain + ').';
    }
  } catch (provErr) {
    console.warn('[Register] auto-provision error:', provErr);
  }

  try {
    await sendWelcomeEmail(c.env, {
      to: email,
      name: directorName,
      schoolName,
      portalUrl: 'https://' + portalDomain,
      trialDays: TRIAL_DAYS,
    });
  } catch (_) {
    // Non-fatal: welcome email is best-effort
  }

  return c.json({
    success: true,
    message: 'पंजीकरण सफल! आपके स्कूल का 7-दिन FREE TRIAL तुरंत सक्रिय हो गया है। ' + provisioningMessage,
    schoolId,
    subdomain,
    dedicatedDomain: portalDomain,
    dedicatedUrl: 'https://' + portalDomain,
    trialEndsAt: trialEndDate,
  });
});

// GET /api/auth/me - current user from the signed session token
authApp.get('/me', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन नहीं है।' }, 401);
  return c.json({ success: true, user: authUser });
});

// POST /api/auth/logout
authApp.post('/logout', (c) => {
  return c.json({ success: true, message: 'सफलतापूर्वक लॉगआउट किया गया।' });
});

export default authApp;
