import { Hono } from 'hono';
import { getDB, makeUniqueUsername } from '../db';
import { hashPassword, verifyPassword, signToken, getAuthUser, burnPasswordVerification } from '../lib/auth';
import { issueResetToken, consumeResetToken } from '../lib/reset-tokens';
import { sendPasswordResetEmail, sendWelcomeEmail, getRequestOrigin } from '../lib/email';
import { syncTenantFromPlatform } from '../lib/tenant-sync';
import { provisionDedicatedWorker } from '../lib/provisioning';
import { isAuthorizedPlatformEmail, getAuthorizedPlatformEmail } from '../admin';
import { checkLoginRateLimit, recordLoginFailure, clearLoginFailures } from '../lib/login-rate-limit';

const authApp = new Hono<{ Bindings: any }>();

/**
 * The caller's source address, for rate limiting.
 *
 * CF-Connecting-IP is set by Cloudflare on the edge and cannot be set by a client
 * that is not already going through Cloudflare, so it is used in preference to
 * CF-Ray/X-Forwarded-For. The fallbacks only matter when the Worker is reached in
 * a way that bypasses the edge, and an absent value becomes the single key
 * "ip:" which the per-identifier limit still covers.
 */
function getClientIp(c: any): string {
  const headers = c.req.header.bind(c.req);
  return String(
    headers('CF-Connecting-IP') ||
    headers('X-Forwarded-For')?.split(',')[0] ||
    headers('X-Real-IP') ||
    '',
  ).trim();
}

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

  // Consulted BEFORE anything expensive, because the cost being protected is the
  // PBKDF2 derivation further down. Checking afterwards would mean a locked-out
  // caller had already been made to pay.
  //
  // Two keys, deliberately: one per account and one per source, so a broad spray
  // from one address is stopped by the IP limit without a shared school NAT
  // locking out one person's account.
  const limit = await checkLoginRateLimit(db, identifier, getClientIp(c));
  if (!limit.allowed) {
    return c.json(
      { success: false, message: 'बहुत अधिक लॉगिन प्रयास। कृपया कुछ देर बाद कोशिश करें।' },
      429,
      limit.retryAfterSeconds ? { 'Retry-After': String(limit.retryAfterSeconds) } : undefined,
    );
  }

  // 1) Platform Super Admin
  // Strict Isolation: Super Admin is strictly for the central control plane (pragnya.nasven.com).
  // Super Admin login is completely forbidden on dedicated workers.
  if (!isDedicated) {
    // platform_admins carries its own status column, and suspending a Super Admin
    // has to mean the same thing here as deactivating a school user does. The
    // predicate is in the lookup so a suspended admin gets the ordinary wrong-
    // credentials answer rather than one that reveals the account exists.
    const admin = await db.prepare("SELECT * FROM platform_admins WHERE LOWER(email) = ? AND status = 'Active'").bind(identifier).first();
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
      if (!ok) {
        // Awaited, not fire-and-forget. These calls were unawaited, so the response
        // could be returned and the isolate frozen before the counter reached D1 — which
        // is the one case where the limiter has to be correct.
        await recordLoginFailure(db, identifier, getClientIp(c));
        return c.json({ success: false, message: 'अमान्य पासवर्ड।' }, 401);
      }
      await clearLoginFailures(db, identifier, getClientIp(c));
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
  //
  // status = 'Active' is part of the lookup, not a check afterwards, and that is
  // deliberate on two counts.
  //
  // It makes deactivation actually mean something. The lookup used to carry no
  // status predicate, so an account set to 'Inactive' -- which is exactly what
  // DELETE /api/staff/:id does, and what its own success message claims
  // ("लॉगिन निष्क्रिय कर दिया गया") -- could simply log in again and collect a
  // fresh 7-day token. The control was decorative.
  //
  // And it keeps the refusal indistinguishable: an inactive account now takes the
  // same branch as an account that does not exist, so it returns the same generic
  // 401 a wrong password returns. Testing the status after the fetch would make
  // the two tellable apart, which is the user-enumeration problem this route was
  // hardened against.
  let user = await db.prepare("SELECT * FROM system_users WHERE (LOWER(email) = ? OR LOWER(username) = ?) AND status = 'Active'").bind(identifier, identifier).first();

  // On dedicated workers, always refresh tenant data from the central platform so
  // system_users, school_profile and school_tenants stay in sync with the main DB
  // (self-healing: pulls newly created users, fixes stale school_tenants rows).
  // The user lookup runs BEFORE the sync (fast path) and AGAIN after the sync in
  // case the account only exists on the platform (e.g. just-provisioned schools).
  if (isDedicated && c.env.SCHOOL_ID) {
    try {
      await syncTenantFromPlatform(c, c.env.SCHOOL_ID);
      if (!user) {
        // The status predicate is repeated here, and it has to be.
        //
        // This second lookup is the one that actually decides the answer on a
        // dedicated worker, and it is also the one that can resurrect a
        // deactivated account. syncTenantFromPlatform runs
        // `INSERT OR REPLACE INTO system_users` (api/lib/tenant-sync.ts:133), so
        // after a sync the local row reflects the PLATFORM's status -- and the
        // first lookup, which filtered on status, is not what is being consulted
        // here.
        //
        // So without this predicate, a school user deactivated on the platform
        // would be refused by the first query and then accepted by this one, and
        // the deactivation control would work only until the next sync. Caught by
        // scripts/verify-session-status.mjs rather than by reading the diff,
        // because both queries look correct in isolation.
        user = await db.prepare("SELECT * FROM system_users WHERE (LOWER(email) = ? OR LOWER(username) = ?) AND status = 'Active'").bind(identifier, identifier).first();
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
  //
  // ONE REFUSAL FOR ALL THREE FAILURE MODES, AND ONE AMOUNT OF WORK
  //
  // This used to answer three distinguishable 401s:
  //
  //   no such user        -> "इस स्कूल पोर्टल पर यह उपयोगकर्ता नहीं मिला"
  //   user, no password   -> code PASSWORD_NOT_SET, and it SENT AN EMAIL
  //   wrong password      -> "अमान्य पासवर्ड"
  //
  // Three bodies is a user-enumeration oracle: an unauthenticated caller could
  // tell which staff addresses exist, and the middle branch also let anyone who
  // knew a staff address cause an outbound email to be sent to that person --
  // a spam relay aimed at a school's own staff, rate-limited but still usable.
  //
  // The timing leaked it too, and that is why the no-user path now calls
  // burnPasswordVerification() rather than just returning: it used to reply in
  // about a millisecond while a real attempt took 100,000 SHA-256 rounds, so
  // equal messages were not enough on their own.
  //
  // The invite email is still sent on the PASSWORD_NOT_SET path. What is lost is
  // only the in-app hint, and the user learns the same thing from the email
  // itself. This is what every major provider does, and it is the only way the
  // three cases stop being distinguishable.
  //
  // Note the client never read the `code` field: grepping the Flutter apps for
  // PASSWORD_NOT_SET and PORTAL_READY_SOON returns nothing, so no screen
  // depended on the distinction and nothing in the UI needed changing.
  const genericLoginFailure = {
    success: false,
    message: 'ईमेल/यूज़रनेम या पासवर्ड गलत है।',
  };

  if (!user) {
    await burnPasswordVerification(password);
    await recordLoginFailure(db, identifier, getClientIp(c));
    return c.json(genericLoginFailure, 401);
  }
  if (!user.password_hash) {
    const invite = await issueResetToken(db, user.id, 'system', 'invite');
    if (!invite.limited) {
      const resetLink = getRequestOrigin(c, c.env) + '/?reset=' + invite.token;
      await sendPasswordResetEmail(c.env, { to: user.email, name: user.full_name, resetLink, invite: true });
    }
    await burnPasswordVerification(password);
    await recordLoginFailure(db, identifier, getClientIp(c));
    return c.json(genericLoginFailure, 401);
  }
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    await recordLoginFailure(db, identifier, getClientIp(c));
    return c.json(genericLoginFailure, 401);
  }

  // Authenticated. Clear the counters so a user who fumbled their password and
  // then got it right is not left one attempt from a lockout, and so a shared
  // school NAT is not penalised for one person's typos.
  await clearLoginFailures(db, identifier, getClientIp(c));

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

  // No invented school on the session token.
  //
  // This was `user.school_id || 'school-01'`, so a user row with a NULL
  // school_id produced a session that looked like it belonged to a real tenant.
  // Combined with getAuthUser accepting a school role on the platform worker, that
  // minted a credential that scoped itself to a school and then ran against the
  // shared D1.
  //
  // A school account with no school_id is a data problem, not something to paper
  // over. Refuse it here, where the user row is in hand and the message can be
  // acted on, instead of issuing a token that fails confusingly later.
  const schoolId = String(user.school_id || '').trim();
  if (!schoolId) {
    console.error('[Login] refusing session: user has no school_id', user.id, user.role);
    return c.json({
      success: false,
      message: 'आपके खाते में स्कूल से जुड़ाव नहीं है। कृपया स्कूल के निदेशक से संपर्क करें।',
    }, 403);
  }

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

  // `plan_id` is the AUTHORITATIVE entitlement and is always 'trial' here, whatever
  // the request asked for. This endpoint is unauthenticated, so accepting a
  // caller-supplied plan had two consequences:
  //
  //  1. Trial never expired. api/lib/trial-expiration.ts selects on
  //     `WHERE (s.plan_id = 'trial' OR s.status = 'Trial')`, and this INSERT writes
  //     status 'Active', never 'Trial'. A tenant registered with
  //     preferredPlanId 'enterprise' therefore matched neither arm and was skipped by
  //     both the cron sweep (:142) and the single-school check (:378) — free access,
  //     forever, with no suspension and no notification.
  //  2. Enterprise entitlements. api/plugins/index.ts:69 and api/ai/index.ts:41 fall
  //     back to `tenant.plan_id === 'enterprise'` when no subscription row exists.
  //
  // The caller's preference is a sales signal and is recorded in `preferred_plan_id`,
  // which nothing treats as an entitlement. Upgrading is the billing path's job.
  const planId = 'trial';

  // 7-दिन FREE TRIAL — instant access, कोई approval नहीं।
  const TRIAL_DAYS = 7;
  const trialEndDate = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // YYYY-MM-DD
  const today = now.split('T')[0];

  await db.prepare('INSERT INTO school_tenants (id, school_name, subdomain, custom_domain, contact_email, contact_phone, status, registration_status, plan_id, estimated_students, estimated_staff, preferred_plan_id, custom_requirements, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(schoolId, schoolName, subdomain, body.customDomain || '', email, phone, 'Active', 'Approved', planId, estimatedStudents, estimatedStaff, preferredPlanId, customRequirements, now).run();

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

  // Is the dedicated worker actually serving this school yet?
  //
  // Auto-provisioning is asynchronous: it commits the school to schools.json,
  // which triggers a deploy that creates the D1/R2/KV and deploys the per-school
  // worker. Until that finishes, `<slug>.pragnya.nasven.com` does not resolve to a
  // school portal. So at registration time this is essentially always false, and
  // that is the point: previously the response advertised the URL unconditionally
  // and the customer opened it to the platform's marketing website.
  //
  // Re-read the tenant rather than assuming, because provisionDedicatedWorker
  // returns `skipped` when the school is already pending or live, in which case
  // the URL is real and should be handed over.
  let portalLive = false;
  try {
    const tenant = await db.prepare('SELECT provisioning_status FROM school_tenants WHERE id = ?')
      .bind(schoolId).first();
    portalLive = !!tenant && String(tenant.provisioning_status || '') === 'live';
  } catch (_) {
    // Non-fatal: fall through to "not live yet", which is the safe direction
  }

  const portalUrl = 'https://' + portalDomain;
  // The public website. Only reachable one, and the thing we can honestly offer
  // while the dedicated worker is still deploying.
  const platformUrl = 'https://pragnya.nasven.com';

  try {
    await sendWelcomeEmail(c.env, {
      to: email,
      name: directorName,
      schoolName,
      portalUrl,
      portalPending: !portalLive,
      platformUrl,
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
    // The subdomain this school WILL have. Always present so the UI can show
    // what to expect, and clearly separate from the live link below.
    portalDomain,
    // `live` once the dedicated worker is serving the school, `provisioning`
    // until then. The client must not present a `provisioning` URL as a working
    // portal link.
    portalStatus: portalLive ? 'live' : 'provisioning',
    // Null while provisioning. Deliberately not the subdomain: a link that
    // resolves to the marketing website is worse than no link, because the
    // customer believes they have reached their portal.
    dedicatedDomain: portalLive ? portalDomain : null,
    dedicatedUrl: portalLive ? portalUrl : null,
    // What the customer can actually open right now.
    platformUrl,
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
