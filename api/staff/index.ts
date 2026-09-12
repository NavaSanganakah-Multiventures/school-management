import { Hono } from 'hono';
import { getDB } from '../db';
import { getAuthUser, getRequestSchoolId } from '../lib/auth';
import { getPlanAccess } from '../lib/plan-access';

export const staffApp = new Hono();

function mapStaff(r: any) {
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
  };
}

// GET /api/staff
staffApp.get('/', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  const schoolId = getRequestSchoolId(c, authUser);
  const department = c.req.query('department');
  const search = (c.req.query('q') || '').toLowerCase();

  const rows = await db.prepare('SELECT * FROM teachers WHERE school_id = ? ORDER BY created_at DESC').bind(schoolId).all();
  let staff = (rows.results || []).map(mapStaff);

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

// POST /api/staff
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
  const name = body.name;
  const phone = body.phone;
  const email = body.email;
  if (!name || !phone || !email) {
    return c.json({ success: false, message: 'नाम, फोन और ईमेल आवश्यक हैं।' }, 400);
  }

  const sub = await db.prepare('SELECT plan_id, status FROM school_subscriptions WHERE school_id = ?').bind(schoolId).first();
  const planId = sub && sub.status !== 'Trial' ? sub.plan_id : 'trial';
  const access = getPlanAccess(planId);
  if (access.maxStaff !== null) {
    const cnt = await db.prepare('SELECT COUNT(*) AS n FROM teachers WHERE school_id = ? AND status = ?').bind(schoolId, 'Active').first();
    if (cnt && cnt.n >= access.maxStaff) {
      return c.json({ success: false, message: 'आपके वर्तमान प्लान की स्टाफ सीमा (' + access.maxStaff + ') पूरी हो चुकी है। कृपया उच्च प्लान में अपग्रेड करें।' }, 403);
    }
  }

  const cntAll = await db.prepare('SELECT COUNT(*) AS n FROM teachers WHERE school_id = ?').bind(schoolId).first();
  const code = 'EMP-' + String((cntAll ? cntAll.n : 0) + 10).padStart(3, '0');
  const id = 'tch-' + Date.now();
  await db.prepare('INSERT INTO teachers (id, employee_code, name, designation, department, subject_specialization, phone, email, qualification, joining_date, school_id, salary, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(id, code, name, body.designation || 'प्रशिक्षित शिक्षक (Teacher)', body.department || 'सामान्य', body.subject || 'सामान्य विषय', phone, email, body.qualification || 'B.Ed.', new Date().toISOString().split('T')[0], schoolId, Number(body.salary) || 45000, 'Active').run();

  const row = await db.prepare('SELECT * FROM teachers WHERE id = ?').bind(id).first();
  const staffMember = mapStaff(row);
  return c.json({ success: true, message: name + ' को स्टाफ में सफलतापूर्वक जोड़ दिया गया। कर्मचारी कोड: ' + code, staffMember }, 201);
});

// DELETE /api/staff/:id
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
  await db.prepare('DELETE FROM teachers WHERE id = ? AND school_id = ?').bind(id, schoolId).run();
  return c.json({ success: true, message: row.name + ' को स्टाफ सूची से हटा दिया गया।' });
});
