import { Hono } from 'hono';
import { getDB, makeUniqueUsername } from '../db';
import { getAuthUser, getRequestSchoolId, hashPassword } from '../lib/auth';
import { getPlanAccess } from '../lib/plan-access';
import { issueResetToken } from '../lib/reset-tokens';
import { sendPasswordResetEmail, getRequestOrigin } from '../lib/email';
import { requireSession, type Role } from '../lib/rbac';
import { isManagement } from '../lib/roles';

export const staffApp = new Hono<{ Bindings: any }>();

const requireAnyUser = requireSession();
const requireManager = requireSession({
  roles: ['Director', 'Principal', 'SuperAdmin'] as Role[],
});

function mapStaff(r: any): any {
  if (!r) return null;
  return {
    id: r.id,
    employeeCode: r.employee_code,
    name: r.name,
    designation: r.designation,
    department: r.department,
    subject: r.subject_specialization || '',
    phone: r.phone,
    email: r.email,
    qualification: r.qualification || '',
    salary: r.salary || 0,
    status: r.status || 'Active',
    joiningDate: r.joining_date || '',
    loginUserId: r.login_account_id || r.login_user_id || '',
    username: r.login_username || '',
    hasLogin: !!(r.login_account_id || r.login_user_id),
    passwordSet: !!(r.login_password_hash),
  };
}

/**
 * Salary and login-username are management-only. A Student/Parent must never
 * receive another employee's compensation, and a teaching role has no need for
 * a colleague's login id.
 */
function mapStaffForRole(r: any, role: string) {
  const s = mapStaff(r);
  if (!s) return null;
  if (!isManagement(role)) {
    s.salary = null;
    s.username = '';
    s.passwordSet = false;
  }
  return s;
}

// GET /api/staff
//
// SECURITY FIX: this route called getAuthUser() but never checked the result, so
// anyone could read the staff list — including salaries, phone numbers, emails
// and login usernames — with no authentication at all. It now requires a valid
// session, and salary/login metadata is stripped for non-management roles.
staffApp.get('/', async (c) => {
  const guard = await requireAnyUser(c);
  if (!guard.ok) return guard.response;
  const { db, schoolId, user } = guard;
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const department = c.req.query('department');
  const search = (c.req.query('q') || '').toLowerCase();

  const rows = await db.prepare('SELECT t.*, u.username AS login_username, u.id AS login_account_id, u.password_hash AS login_password_hash FROM teachers t LEFT JOIN system_users u ON u.id = t.login_user_id WHERE t.school_id = ? ORDER BY t.created_at DESC').bind(schoolId).all();
  let staff: any[] = (rows.results || []).map((r: any) => mapStaffForRole(r, user.role)).filter(Boolean);

  if (department && department !== 'All') {
    staff = staff.filter((t) => t.department.toLowerCase().includes(department.toLowerCase()));
  }
  if (search) {
    staff = staff.filter((t) =>
      t.name.toLowerCase().includes(search) ||
      t.employeeCode.toLowerCase().includes(search) ||
      t.subject.toLowerCase().includes(search)
    );
  }
  return c.json({ success: true, total: staff.length, staff });
});

// POST /api/staff - स्टाफ जोड़ें + लॉगिन खाता (system_users, role='Staff') बनाएं।
staffApp.post('/', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);
  if (authUser.role !== 'Director' && authUser.role !== 'Principal' && authUser.role !== 'SuperAdmin') {
    return c.json({ success: false, message: 'केवल निदेशक/प्रधानाचार्य स्टाफ जोड़ सकते हैं।' }, 403);
  }
  const schoolId = getRequestSchoolId(c, authUser);
  const body = await c.req.json().catch(() => ({}));
  const name = String(body.name || '').trim();
  const phone = String(body.phone || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '').trim();
  if (!name || !phone || !email) {
    return c.json({ success: false, message: 'नाम, फोन और ईमेल आवश्यक हैं।' }, 400);
  }
  if (password && password.length < 6) {
    return c.json({ success: false, message: 'यदि पासवर्ड दिया गया है तो वह कम से कम 6 अक्षरों का होना चाहिए।' }, 400);
  }

  // system_users.email UNIQUE है, इसलिए पहले duplicate रोकें।
  const emailTaken = await db.prepare('SELECT id FROM system_users WHERE LOWER(email) = ?').bind(email).first();
  if (emailTaken) {
    return c.json({ success: false, message: 'इस ईमेल से पहले से एक लॉगिन खाता मौजूद है। कृपया दूसरा ईमेल उपयोग करें।' }, 409);
  }

  const sub = await db.prepare('SELECT plan_id, status FROM school_subscriptions WHERE school_id = ?').bind(schoolId).first();
  const planId = sub && sub.status !== 'Trial' ? sub.plan_id : 'trial';
  const access = await getPlanAccess(planId, db);
  if (access.maxStaff !== null) {
    const cnt = await db.prepare('SELECT COUNT(*) AS n FROM teachers WHERE school_id = ? AND status = ?').bind(schoolId, 'Active').first();
    if (cnt && cnt.n >= access.maxStaff) {
      return c.json({ success: false, message: 'आपके वर्तमान प्लान की स्टाफ सीमा (' + access.maxStaff + ') पूरी हो चुकी है। कृपया उच्च प्लान में अपग्रेड करें।' }, 403);
    }
  }

  const cntAll = await db.prepare('SELECT COUNT(*) AS n FROM teachers WHERE school_id = ?').bind(schoolId).first();
  const code = 'EMP-' + String((cntAll ? cntAll.n : 0) + 10).padStart(3, '0');
  const id = 'tch-' + Date.now();
  const userId = 'usr-' + Date.now();
  const username = await makeUniqueUsername(db, email);
  const passwordHash = password ? await hashPassword(password) : null;
  const now = new Date().toISOString();

  await db.prepare('INSERT INTO teachers (id, employee_code, name, designation, department, subject_specialization, phone, email, qualification, joining_date, school_id, salary, status, login_user_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(id, code, name, body.designation || 'प्रशिक्षित शिक्षक (Teacher)', body.department || 'सामान्य', body.subject || 'सामान्य विषय', phone, email, body.qualification || 'B.Ed.', new Date().toISOString().split('T')[0], schoolId, Number(body.salary) || 45000, 'Active', userId).run();

  await db.prepare('INSERT INTO system_users (id, username, full_name, email, phone, role, designation, department, qualification, salary, status, school_id, password_hash, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(userId, username, name, email, phone, 'Staff', body.designation || 'प्रशिक्षित शिक्षक (Teacher)', body.department || 'सामान्य', body.qualification || 'B.Ed.', Number(body.salary) || 45000, 'Active', schoolId, passwordHash, now).run();

  const row = await db.prepare('SELECT t.*, u.username AS login_username, u.id AS login_account_id, u.password_hash AS login_password_hash FROM teachers t LEFT JOIN system_users u ON u.id = t.login_user_id WHERE t.id = ?').bind(id).first();
  const staffMember = mapStaff(row);

  let inviteLink = '';
  if (!passwordHash) {
    const issued = await issueResetToken(db, userId, 'system', 'invite');
    if (issued.token) {
      inviteLink = getRequestOrigin(c, c.env) + '/?reset=' + issued.token;
      await sendPasswordResetEmail(c.env, { to: email, name: name, resetLink: inviteLink, invite: true });
    }
  }

  const message = passwordHash
    ? name + ' को स्टाफ में जोड़ दिया गया। लॉगिन यूज़रनेम: ' + username
    : name + ' को स्टाफ में जोड़ दिया गया। पासवर्ड सेट करने का लिंक उनके ईमेल पर भेज दिया गया है।';
  return c.json({ success: true, message: message, username: username, staffMember: staffMember, resetLink: inviteLink || undefined }, 201);
});

// POST /api/staff/:id/login - staff को पासवर्ड-रीसेट/इनवाइट लिंक भेजें।
// body में password (min 6) दिया गया हो तो सीधे manual password set हो जाता है (fallback);
// नहीं तो ईमेल पर magic link भेजा जाता है।
staffApp.post('/:id/login', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);
  if (authUser.role !== 'Director' && authUser.role !== 'Principal' && authUser.role !== 'SuperAdmin') {
    return c.json({ success: false, message: 'केवल निदेशक/प्रधानाचार्य स्टाफ लॉगिन सेट कर सकते हैं।' }, 403);
  }
  const schoolId = getRequestSchoolId(c, authUser);
  const id = c.req.param('id');
  const teacher = await db.prepare('SELECT * FROM teachers WHERE school_id = ? AND id = ?').bind(schoolId, id).first();
  if (!teacher) return c.json({ success: false, message: 'स्टाफ सदस्य नहीं मिला' }, 404);

  const body = await c.req.json().catch(() => ({}));
  const password = String(body.password || '').trim();
  if (password && password.length < 6) {
    return c.json({ success: false, message: 'पासवर्ड कम से कम 6 अक्षरों का होना चाहिए।' }, 400);
  }

  const email = String(teacher.email || '').trim().toLowerCase();
  const existing = await db.prepare('SELECT * FROM system_users WHERE LOWER(email) = ?').bind(email).first();
  let userId: string = teacher.login_user_id || '';
  let username: string = existing ? existing.username : '';

  if (existing) {
    if (String(existing.role) !== 'Staff' || String(existing.school_id) !== schoolId) {
      return c.json({ success: false, message: 'इस ईमेल से पहले से किसी अन्य उपयोगकर्ता का खाता जुड़ा है। कृपया स्टाफ का ईमेल बदलें।' }, 409);
    }
    userId = existing.id;
    username = existing.username;
  } else {
    userId = 'usr-' + Date.now();
    username = await makeUniqueUsername(db, email);
    await db.prepare('INSERT INTO system_users (id, username, full_name, email, phone, role, designation, department, qualification, salary, status, school_id, password_hash, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(userId, username, teacher.name, email, teacher.phone, 'Staff', teacher.designation || 'प्रशिक्षित शिक्षक (Teacher)', teacher.department || 'सामान्य', teacher.qualification || 'B.Ed.', Number(teacher.salary) || 45000, 'Active', schoolId, null, new Date().toISOString()).run();
  }

  await db.prepare('UPDATE teachers SET login_user_id = ? WHERE id = ?').bind(userId, id).run();

  if (password) {
    const passwordHash = await hashPassword(password);
    await db.prepare('UPDATE system_users SET password_hash = ?, full_name = ?, phone = ?, status = ? WHERE id = ?')
      .bind(passwordHash, teacher.name, teacher.phone, 'Active', userId).run();
    return c.json({ success: true, message: 'पासवर्ड सेट हो गया। यूज़रनेम: ' + username, username: username });
  }

  const issued = await issueResetToken(db, userId, 'system', 'invite');
  if (issued.limited || !issued.token) {
    return c.json({ success: true, message: 'हाल ही में रीसेट लिंक भेजा जा चुका है। कृपया ईमेल जाँचें या 2 मिनट बाद पुनः प्रयास करें।' });
  }

  const resetLink = getRequestOrigin(c, c.env) + '/?reset=' + issued.token;
  await sendPasswordResetEmail(c.env, { to: email, name: teacher.name, resetLink: resetLink, invite: true });
  return c.json({ success: true, message: teacher.name + ' के ईमेल पर पासवर्ड सेट करने का लिंक भेज दिया गया है।', resetLink: resetLink, username: username });
});

// DELETE /api/staff/:id - staff हटाएं + लॉगिन निष्क्रिय करें + उसके device tokens बंद करें।
staffApp.delete('/:id', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);
  if (authUser.role !== 'Director' && authUser.role !== 'SuperAdmin') {
    return c.json({ success: false, message: 'केवल निदेशक स्टाफ हटा सकते हैं।' }, 403);
  }
  const schoolId = getRequestSchoolId(c, authUser);
  const id = c.req.param('id');
  const row = await db.prepare('SELECT * FROM teachers WHERE school_id = ? AND id = ?').bind(schoolId, id).first();
  if (!row) return c.json({ success: false, message: 'स्टाफ सदस्य नहीं मिला' }, 404);
  if (row.login_user_id) {
    await db.prepare('UPDATE system_users SET status = ? WHERE id = ?').bind('Inactive', row.login_user_id).run();
    await db.prepare('UPDATE fcm_device_tokens SET is_active = 0 WHERE school_id = ? AND user_id = ?').bind(schoolId, row.login_user_id).run();
  }
  await db.prepare('DELETE FROM teachers WHERE id = ? AND school_id = ?').bind(id, schoolId).run();
  return c.json({ success: true, message: row.name + ' को स्टाफ सूची से हटा दिया गया। लॉगिन निष्क्रिय कर दिया गया।' });
});
