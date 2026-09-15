import { Hono } from 'hono';
import { getDB } from '../db';
import { getAuthUser, getRequestSchoolId } from '../lib/auth';
import { isClassTeacher } from '../lib/permissions';

const attendanceApp = new Hono<{ Bindings: any }>();

function classListWhereClause(classNames: string[]): { clause: string; params: any[] } {
  if (!classNames || classNames.length === 0) return { clause: '', params: [] };
  const placeholders = classNames.map(() => '?').join(',');
  return { clause: ' AND s.class_name IN (' + placeholders + ')', params: classNames };
}

function allowedClassesForUser(authUser: any, targetClass: string | null, assignedClasses: string[]): string[] | null {
  const isAdmin = authUser.role === 'Director' || authUser.role === 'Principal' || authUser.role === 'SuperAdmin';
  if (isAdmin) {
    if (targetClass && targetClass !== 'All') return [targetClass];
    return null;
  }
  let allowed = assignedClasses;
  if (targetClass && targetClass !== 'All') {
    if (!allowed.includes(targetClass)) return [];
    allowed = [targetClass];
  }
  return allowed;
}

async function canMarkAttendanceForClass(db: any, schoolId: string, authUser: any, className: string): Promise<boolean> {
  if (authUser.role === 'Director' || authUser.role === 'Principal' || authUser.role === 'SuperAdmin') return true;
  if (authUser.role !== 'Staff') return false;
  return isClassTeacher(db, schoolId, className, authUser.sub);
}

async function resolveMarkedBy(db: any, authUser: any): Promise<string> {
  const user = await db.prepare('SELECT full_name FROM system_users WHERE id = ?').bind(authUser.sub).first();
  const name = user ? user.full_name : authUser.role;
  return name + ' (' + authUser.role + ')';
}

attendanceApp.get('/', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);

  const schoolId = getRequestSchoolId(c, authUser);
  const date = c.req.query('date') || new Date().toISOString().split('T')[0];
  const className = c.req.query('class') || null;

  const assignedClasses = authUser.role === 'Staff'
    ? (await db.prepare('SELECT class_name FROM class_teachers WHERE school_id = ? AND teacher_user_id = ? ORDER BY class_name').bind(schoolId, authUser.sub).all()).results?.map((r: any) => r.class_name) || []
    : [];

  const allowed = allowedClassesForUser(authUser, className, assignedClasses);
  if (allowed && allowed.length === 0) {
    return c.json({
      success: true, date, stats: { total: 0, present: 0, absent: 0, leave: 0, rate: 0 }, records: [], assignedClasses, canMark: false,
      message: 'आपको किसी भी कक्षा के लिए कक्षा अध्यापक के रूप में नियुक्त नहीं किया गया है।',
    });
  }

  const { clause, params } = classListWhereClause(allowed || []);
  const sql =
    'SELECT s.id AS student_id, s.first_name, s.last_name, s.class_name, s.section, s.roll_number, s.scholar_number, a.id AS att_id, a.status, a.remarks, a.marked_by ' +
    'FROM students s LEFT JOIN attendance a ON a.student_id = s.id AND a.date = ? ' +
    'WHERE s.school_id = ? AND s.status = ?' + clause + ' ORDER BY s.class_name, s.roll_number, s.first_name';

  const queryParams = [date, schoolId, 'Active', ...(allowed ? params : [])];
  const rows = await db.prepare(sql).bind(...queryParams).all();

  const list = ((rows.results || []) as any[]).map((s) => {
    const fullName = (s.first_name || '') + (s.last_name ? ' ' + s.last_name : '');
    return {
      id: s.att_id || ('att-' + s.student_id + '-' + date),
      studentId: s.student_id,
      studentName: fullName,
      scholarNumber: s.scholar_number || s.roll_number || '',
      className: s.class_name,
      section: s.section,
      date,
      status: s.status || 'Present',
      remarks: s.remarks || '',
      markedBy: s.marked_by || 'कक्षा अध्यापक (Class Teacher)',
    };
  });

  const total = list.length;
  const present = list.filter((r) => r.status === 'Present').length;
  const absent = list.filter((r) => r.status === 'Absent').length;
  const leave = list.filter((r) => r.status === 'Leave').length;
  const rate = total > 0 ? Math.round((present / total) * 100) : 0;
  const isAdmin = authUser.role === 'Director' || authUser.role === 'Principal' || authUser.role === 'SuperAdmin';
  const canMark = isAdmin || (assignedClasses.length > 0);

  return c.json({
    success: true,
    date,
    stats: { total, present, absent, leave, rate },
    records: list,
    assignedClasses,
    canMark,
  });
});

attendanceApp.post('/mark', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);

  const schoolId = getRequestSchoolId(c, authUser);
  const body = await c.req.json().catch(() => ({}));
  const studentId = body.studentId;
  const status = body.status || 'Present';
  const targetDate = body.date || new Date().toISOString().split('T')[0];

  if (!studentId) return c.json({ success: false, message: 'studentId आवश्यक है।' }, 400);
  if (['Present', 'Absent', 'Late', 'Leave'].indexOf(status) === -1) return c.json({ success: false, message: 'अमान्य उपस्थिति स्थिति।' }, 400);

  const student = await db.prepare('SELECT id, class_name FROM students WHERE id = ? AND school_id = ? AND status = ?')
    .bind(studentId, schoolId, 'Active').first();
  if (!student) return c.json({ success: false, message: 'छात्र नहीं मिला।' }, 404);

  const permitted = await canMarkAttendanceForClass(db, schoolId, authUser, student.class_name);
  if (!permitted) {
    return c.json({ success: false, message: 'केवल कक्षा अध्यापक/प्रधानाचार्य/निदेशक ही इस कक्षा की उपस्थिति दर्ज कर सकते हैं।' }, 403);
  }

  const id = 'att-' + studentId + '-' + targetDate;
  const markedBy = await resolveMarkedBy(db, authUser);

  await db.prepare(
    'INSERT INTO attendance (id, student_id, date, status, remarks, marked_by, school_id) VALUES (?,?,?,?,?,?,?) ' +
    'ON CONFLICT(id) DO UPDATE SET status=excluded.status, remarks=excluded.remarks, marked_by=excluded.marked_by'
  ).bind(id, studentId, targetDate, status, body.remarks || '', markedBy, schoolId).run();

  return c.json({ success: true, message: 'उपस्थिति दर्ज कर दी गई।', markedBy });
});

attendanceApp.post('/mark-all-present', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);

  const schoolId = getRequestSchoolId(c, authUser);
  const body = await c.req.json().catch(() => ({}));
  const targetDate = body.date || new Date().toISOString().split('T')[0];
  const className = body.className || null;

  const isAdmin = authUser.role === 'Director' || authUser.role === 'Principal' || authUser.role === 'SuperAdmin';

  let allowed: string[] | null = null;
  if (!isAdmin) {
    const rows = await db.prepare('SELECT class_name FROM class_teachers WHERE school_id = ? AND teacher_user_id = ? ORDER BY class_name')
      .bind(schoolId, authUser.sub).all();
    allowed = (rows.results || []).map((r: any) => r.class_name);
  }

  if (!isAdmin && className && className !== 'All') {
    if (!allowed!.includes(className)) {
      return c.json({ success: false, message: 'आप इस कक्षा के लिए कक्षा अध्यापक नहीं हैं।' }, 403);
    }
    allowed = [className];
  } else if (!isAdmin && (!allowed || allowed.length === 0)) {
    return c.json({ success: false, message: 'आपको किसी भी कक्षा के लिए कक्षा अध्यापक नियुक्त नहीं किया गया है।' }, 403);
  }

  const { clause, params } = classListWhereClause(allowed || []);
  const sql = 'SELECT id FROM students WHERE school_id = ? AND status = ?' + clause;
  const rows = await db.prepare(sql).bind(schoolId, 'Active', ...(allowed ? params : [])).all();
  const students = (rows.results || []) as any[];

  const markedBy = await resolveMarkedBy(db, authUser);

  for (const s of students) {
    const id = 'att-' + s.id + '-' + targetDate;
    await db.prepare(
      'INSERT INTO attendance (id, student_id, date, status, remarks, marked_by, school_id) VALUES (?,?,?,?,?,?,?) ' +
      'ON CONFLICT(id) DO UPDATE SET status=excluded.status, marked_by=excluded.marked_by'
    ).bind(id, s.id, targetDate, 'Present', '', markedBy, schoolId).run();
  }

  return c.json({ success: true, message: 'कक्षा के सभी छात्रों की उपस्थिति Present मार्क कर दी गई।', count: students.length });
});

export default attendanceApp;