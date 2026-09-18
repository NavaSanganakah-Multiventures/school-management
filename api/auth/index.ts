import { Hono } from 'hono';
import { getDB, makeUniqueUsername } from '../db';
import { hashPassword, verifyPassword, signToken, getAuthUser } from '../lib/auth';
import { issueResetToken, consumeResetToken } from '../lib/reset-tokens';
import { sendPasswordResetEmail, getRequestOrigin } from '../lib/email';

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

  // 1) Platform Super Admin
  const admin = await db.prepare('SELECT * FROM platform_admins WHERE LOWER(email) = ?').bind(identifier).first();
  if (admin) {
    const ok = await verifyPassword(password, admin.password_hash || '');
    if (!ok) return c.json({ success: false, message: 'अमान्य पासवर्ड।' }, 401);
    await db.prepare('UPDATE platform_admins SET updated_at = ? WHERE id = ?').bind(new Date().toISOString(), admin.id).run();
    const SESSION_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 days
    const token = await signToken(c, { sub: admin.id, role: 'SuperAdmin', schoolId: '', exp: Math.floor(Date.now() / 1000) + SESSION_EXPIRY_SECONDS });
    return c.json({
      success: true,
      message: 'Super Admin लॉगिन सफल।',
      token,
      user: { id: admin.id, fullName: admin.full_name, email: admin.email, phone: admin.phone, role: 'SuperAdmin', designation: 'प्लेटफ़ॉर्म Super Admin', schoolId: '' },
    });
  }

  // 2) School user (Director / Principal / Staff)
  const user = await db.prepare('SELECT * FROM system_users WHERE LOWER(email) = ? OR LOWER(username) = ?').bind(identifier, identifier).first();
  if (!user) {
    return c.json({ success: false, message: 'इस ईमेल से कोई अधिकृत उपयोगकर्ता नहीं मिला। कृपया पहले स्कूल रजिस्टर करें।' }, 401);
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

  await db.prepare('UPDATE system_users SET last_login = ? WHERE id = ?').bind(new Date().toISOString(), user.id).run();

  const schoolId = user.school_id || 'school-01';
  const SESSION_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 days
  const token = await signToken(c, { sub: user.id, role: user.role, schoolId, exp: Math.floor(Date.now() / 1000) + SESSION_EXPIRY_SECONDS });

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

  const user = await db.prepare('SELECT * FROM system_users WHERE LOWER(email) = ?').bind(identifier).first();
  if (user) {
    userId = user.id;
    userType = 'system';
    userEmail = user.email;
    userName = user.full_name;
    tokenType = user.password_hash ? 'reset' : 'invite';
  } else {
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

  const resetLink = getRequestOrigin(c, c.env) + '/?reset=' + issued.token;
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
// School starts as Suspended/Pending_Approval. Super Admin approval starts the 7-day trial.
authApp.post('/register', async (c) => {
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
  const subdomain = String(body.subdomain || ('school' + Date.now().toString().slice(-6))).toLowerCase().replace(/[^a-z0-9-]/g, '');
  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();
  const username = await makeUniqueUsername(db, email);

  await db.prepare('INSERT INTO school_tenants (id, school_name, subdomain, custom_domain, contact_email, contact_phone, status, registration_status, plan_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .bind(schoolId, schoolName, subdomain, body.customDomain || '', email, phone, 'Suspended', 'Pending_Approval', 'trial', now).run();

  await db.prepare('INSERT INTO school_profile (id, school_name, affiliation_number, board_name, school_code, email, phone, alternate_phone, address, city, state, pincode, academic_session, director_name, principal_name, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(schoolId, schoolName, body.affiliationNumber || '', body.boardName || 'CBSE', body.schoolCode || '', email, phone, body.alternatePhone || '', body.address || '', body.city || '', body.state || '', body.pincode || '', body.academicSession || '2026-2027', directorName, body.principalName || directorName, now.split('T')[0]).run();

  await db.prepare('INSERT INTO system_users (id, username, full_name, email, phone, role, designation, department, qualification, salary, status, school_id, password_hash, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(userId, username, directorName, email, phone, 'Director', body.designation || 'स्कूल निदेशक (Director)', 'प्रबंधन एवं प्रशासन', body.qualification || '', 0, 'Active', schoolId, passwordHash, now).run();

  await db.prepare('INSERT INTO school_subscriptions (id, school_id, plan_id, plan_name, billing_cycle, price_per_cycle, discount_percent, status, auto_pay_enabled, payment_method, mandate_id, next_billing_date, period_start, period_end, trial_ends_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind('sub-' + Date.now(), schoolId, 'starter', '7-दिन फ्री ट्रायल', 'monthly', 0, 0, 'Trial', 0, '', '', '', '', '', '', now).run();

  return c.json({
    success: true,
    message: 'स्कूल पंजीकरण अनुरोध प्राप्त हुआ। Super Admin अप्रूवल के बाद 7-दिन का फ्री ट्रायल शुरू होगा।',
    schoolId,
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
