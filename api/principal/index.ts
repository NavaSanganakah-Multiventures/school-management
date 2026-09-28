import { Hono } from 'hono';
import { getDB } from '../db';
import { getAuthUser, getRequestSchoolId, hashPassword } from '../lib/auth';
import { requireSession, type Role } from '../lib/rbac';
import { SUPER_ADMIN, isManagement } from '../lib/roles';

export const principalApp = new Hono<{ Bindings: any }>();

// GET /api/principal is management-only.
//
// It called getAuthUser() and nothing else, then returned mapUser(pRow) from a
// bare `SELECT *` on system_users. mapUser included `salary`, so a Parent or
// Student token received the Principal's compensation, phone, email and
// qualification. The query itself was correctly school-scoped; the problem is
// that no role was required to see a Principal's personnel record.
//
// Refused rather than redacted: the app points no family-role screen at this
// route, and `/classes`, `/analytics` and `/students` are userRoute entries any
// logged-in role can navigate to, so the route guard is the only control here.
const requireManagement = () =>
  requireSession({ roles: ['Director', 'Principal', SUPER_ADMIN] as Role[] });

function mapUser(r: any, role: any) {
  if (!r) return null;
  return {
    id: r.id,
    username: r.username,
    fullName: r.full_name,
    email: r.email,
    phone: r.phone,
    role: r.role,
    designation: r.designation,
    department: r.department,
    qualification: r.qualification,
    // Compensation is never sent to a role with no operational need for it. The
    // route is management-only today, so this is defence in depth rather than the
    // control itself -- but the route guard and the field guard should not be the
    // same thing, because only one of them survives a future caller adding a
    // second entry point to this mapper.
    salary: isManagement(role) ? r.salary : null,
    status: r.status,
    schoolId: r.school_id,
    lastLogin: r.last_login,
    createdAt: r.created_at,
  };
}

function mapHistory(r: any) {
  if (!r) return null;
  return {
    id: r.id,
    schoolId: r.school_id,
    fullName: r.full_name,
    email: r.email,
    phone: r.phone,
    qualification: r.qualification,
    appointedDate: r.appointed_date,
    relievedDate: r.relieved_date || '',
    status: r.status,
    appointedBy: r.appointed_by,
    remarks: r.remarks || '',
  };
}

// GET /api/principal
principalApp.get('/', async (c) => {
  const guard = await requireManagement()(c);
  if (!guard.ok) return guard.response;
  const { db, schoolId, user } = guard;
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  if (!schoolId) return c.json({ success: false, message: 'स्कूल संदर्भ (tenant) ज़रूरी है।' }, 401);
  const pRow = await db.prepare('SELECT * FROM system_users WHERE role = ? AND school_id = ? AND status = ?').bind('Principal', schoolId, 'Active').first();
  const hRows = await db.prepare('SELECT * FROM principal_history WHERE school_id = ? ORDER BY created_at DESC').bind(schoolId).all();
  const prof = await db.prepare('SELECT school_name, principal_name FROM school_profile WHERE id = ?').bind(schoolId).first();
  return c.json({
    success: true,
    currentPrincipal: mapUser(pRow, user.role),
    history: (hRows.results || []).map(mapHistory),
    schoolProfile: { principalName: prof ? prof.principal_name : '', schoolName: prof ? prof.school_name : '' },
  });
});

// POST /api/principal/change - केवल Director/SuperAdmin
principalApp.post('/change', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);
  if (authUser.role !== 'Director' && authUser.role !== 'SuperAdmin') {
    return c.json({ success: false, message: 'केवल निदेशक या Super Admin प्रधानाचार्य बदल सकते हैं।' }, 403);
  }
  const schoolId = getRequestSchoolId(c, authUser);
  const body = await c.req.json().catch(() => ({}));
  const fullName = body.fullName;
  const email = body.email;
  const phone = body.phone;
  if (!fullName || !email || !phone) {
    return c.json({ success: false, message: 'प्रधानाचार्य का नाम, ईमेल और फोन नंबर अनिवार्य हैं।' }, 400);
  }
  const effectiveDate = body.appointedDate || new Date().toISOString().split('T')[0];

  // Relieve active principal in history
  await db.prepare('UPDATE principal_history SET status = ?, relieved_date = ? WHERE school_id = ? AND status = ?')
    .bind('Past', effectiveDate, schoolId, 'Active').run();

  // Find existing principal user
  const existing = await db.prepare('SELECT * FROM system_users WHERE role = ? AND school_id = ?').bind('Principal', schoolId).first();
  let principalUserId;
  if (existing) {
    principalUserId = existing.id;
    const passwordHash = body.password ? await hashPassword(String(body.password)) : existing.password_hash;
    await db.prepare('UPDATE system_users SET full_name = ?, email = ?, phone = ?, qualification = ?, salary = ?, status = ?, password_hash = ? WHERE id = ?')
      .bind(fullName, email, phone, body.qualification || existing.qualification, Number(body.salary) || existing.salary, 'Active', passwordHash, existing.id).run();
  } else {
    principalUserId = 'usr-principal-' + Date.now();
    const passwordHash = body.password ? await hashPassword(String(body.password)) : null;
    await db.prepare('INSERT INTO system_users (id, username, full_name, email, phone, role, designation, department, qualification, salary, status, school_id, password_hash, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(principalUserId, email.split('@')[0] || 'principal', fullName, email, phone, 'Principal', 'प्रधानाचार्य (Principal & Head of School)', 'शैक्षणिक एवं विद्यालय प्रशासन', body.qualification || 'M.A., M.Ed., Ph.D.', Number(body.salary) || 120000, 'Active', schoolId, passwordHash, new Date().toISOString()).run();
  }

  await db.prepare('UPDATE school_profile SET principal_name = ? WHERE id = ?').bind(fullName, schoolId).run();

  await db.prepare('INSERT INTO principal_history (id, principal_user_id, full_name, email, phone, qualification, appointed_date, status, appointed_by, remarks, school_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .bind('prn-hist-' + Date.now(), principalUserId, fullName, email, phone, body.qualification || 'M.A., M.Ed., Ph.D.', effectiveDate, 'Active', body.directorId || authUser.sub, body.remarks || 'डायरेक्टर द्वारा नया पदभार सौंपा गया', schoolId).run();

  const pRow = await db.prepare('SELECT * FROM system_users WHERE id = ?').bind(principalUserId).first();
  const hRows = await db.prepare('SELECT * FROM principal_history WHERE school_id = ? ORDER BY created_at DESC').bind(schoolId).all();
  return c.json({
    success: true,
    message: 'प्रधानाचार्य सफलतापूर्वक बदल दिए गए हैं। नए प्रधानाचार्य: ' + fullName,
    currentPrincipal: mapUser(pRow, authUser.role),
    history: (hRows.results || []).map(mapHistory),
  });
});
