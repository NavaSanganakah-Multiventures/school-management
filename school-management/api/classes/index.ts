import { Hono } from 'hono';
import { getDB } from '../db';
import { getAuthUser, getRequestSchoolId } from '../lib/auth';
import { canManageClassTeachers } from '../lib/permissions';
import { logActivity, resolveActorName } from '../lib/activity-logger';

const classesApp = new Hono<{ Bindings: any }>();

const DEFAULT_CLASS_ORDER = [
  'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5',
  'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10',
  'Class 11 (Science)', 'Class 11 (Commerce)',
  'Class 12 (Science)', 'Class 12 (Commerce)',
];

function normalizeClassName(name: string): string {
  return String(name || '').trim();
}

classesApp.get('/', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);
  const schoolId = getRequestSchoolId(c, authUser);

  const assigned = await db.prepare(
    'SELECT ct.class_name, ct.teacher_user_id, u.full_name AS teacher_name, u.email AS teacher_email ' +
    'FROM class_teachers ct LEFT JOIN system_users u ON u.id = ct.teacher_user_id WHERE ct.school_id = ?'
  ).bind(schoolId).all();

  const assignedMap = new Map<string, { teacherUserId?: string; teacherName?: string; teacherEmail?: string }>();
  for (const r of (assigned.results || []) as any[]) {
    assignedMap.set(normalizeClassName(r.class_name), {
      teacherUserId: r.teacher_user_id,
      teacherName: r.teacher_name,
      teacherEmail: r.teacher_email,
    });
  }

  const activeStudents = await db.prepare('SELECT DISTINCT class_name FROM students WHERE school_id = ? AND status = ? ORDER BY class_name')
    .bind(schoolId, 'Active').all();
  const studentClasses = ((activeStudents.results || []) as any[]).map(r => normalizeClassName(r.class_name));

  const allClasses = Array.from(new Set([...DEFAULT_CLASS_ORDER, ...studentClasses]));

  return c.json({
    success: true,
    classes: allClasses.map((className) => ({
      className,
      classTeacherUserId: assignedMap.get(className)?.teacherUserId || null,
      classTeacherName: assignedMap.get(className)?.teacherName || null,
      classTeacherEmail: assignedMap.get(className)?.teacherEmail || null,
    })),
  });
});

classesApp.get('/my-classes', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);
  const schoolId = getRequestSchoolId(c, authUser);

  const activeStudents = await db.prepare('SELECT DISTINCT class_name FROM students WHERE school_id = ? AND status = ? ORDER BY class_name')
    .bind(schoolId, 'Active').all();
  const studentClasses = ((activeStudents.results || []) as any[]).map(r => normalizeClassName(r.class_name));
  const allClasses = Array.from(new Set([...studentClasses, ...DEFAULT_CLASS_ORDER]));

  const assignedRows = await db.prepare('SELECT class_name FROM class_teachers WHERE school_id = ? AND teacher_user_id = ? ORDER BY class_name')
    .bind(schoolId, authUser.sub).all();
  const assignedClasses = ((assignedRows.results || []) as any[]).map(r => normalizeClassName(r.class_name));

  const isAdmin = canManageClassTeachers(authUser.role as any);

  return c.json({
    success: true,
    role: authUser.role,
    isAdmin,
    classes: isAdmin ? allClasses : (assignedClasses.length > 0 ? assignedClasses : allClasses),
    assignedClasses,
    allClasses,
    isClassTeacher: assignedClasses.length > 0,
    canMarkAll: isAdmin,
  });
});

classesApp.post('/assign-teacher', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);
  if (!canManageClassTeachers(authUser.role as any)) {
    return c.json({ success: false, message: 'केवल निदेशक/प्रधानाचार्य कक्षा अध्यापक नियुक्त कर सकते हैं।' }, 403);
  }

  const schoolId = getRequestSchoolId(c, authUser);
  const body = await c.req.json().catch(() => ({}));
  const className = normalizeClassName(body.className);
  const teacherUserId = String(body.teacherUserId || '').trim();

  if (!className) return c.json({ success: false, message: 'कक्षा का नाम आवश्यक है।' }, 400);
  if (!teacherUserId) return c.json({ success: false, message: 'शिक्षक चुनना आवश्यक है।' }, 400);

  const teacher = await db.prepare('SELECT id, full_name, role, school_id, status FROM system_users WHERE id = ? AND school_id = ?')
    .bind(teacherUserId, schoolId).first();
  if (!teacher) return c.json({ success: false, message: 'चुना गया शिक्षक नहीं मिला।' }, 404);
  if (String(teacher.status) !== 'Active') {
    return c.json({ success: false, message: 'निष्क्रिय खाते को कक्षा अध्यापक नहीं बनाया जा सकता।' }, 400);
  }
  if (teacher.role !== 'Staff' && teacher.role !== 'Principal' && teacher.role !== 'Director') {
    return c.json({ success: false, message: 'केवल स्टाफ/शिक्षक को कक्षा अध्यापक बनाया जा सकता है।' }, 400);
  }

  const id = 'ct-' + Date.now();
  await db.prepare(
    'INSERT INTO class_teachers (id, school_id, class_name, teacher_user_id, teacher_name) VALUES (?,?,?,?,?) ' +
    'ON CONFLICT(school_id, class_name) DO UPDATE SET teacher_user_id=excluded.teacher_user_id, teacher_name=excluded.teacher_name'
  ).bind(id, schoolId, className, teacherUserId, teacher.full_name).run();

  try {
    await db.prepare('UPDATE classes SET class_teacher_id = ? WHERE name = ?').bind(teacherUserId, className).run();
  } catch (e) {}

  const actorName = await resolveActorName(db, authUser.sub, authUser.role);
  await logActivity(db, {
    schoolId,
    userId: authUser.sub,
    userName: actorName,
    userRole: authUser.role,
    actionType: 'CLASS_TEACHER_ASSIGN',
    actionTitle: 'कक्षा अध्यापक नियुक्ति',
    description: `कक्षा ${className} के लिए ${teacher.full_name} को कक्षा अध्यापक नियुक्त किया गया।`,
    entityType: 'class',
    className,
    metadata: { teacherUserId, teacherName: teacher.full_name, className },
  });

  return c.json({
    success: true,
    message: className + ' का कक्षा अध्यापक ' + teacher.full_name + ' नियुक्त किया गया।',
    className,
    teacherUserId,
    teacherName: teacher.full_name,
  });
});

classesApp.post('/remove-teacher', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);
  if (!canManageClassTeachers(authUser.role as any)) {
    return c.json({ success: false, message: 'केवल निदेशक/प्रधानाचार्य कक्षा अध्यापक हटा सकते हैं।' }, 403);
  }
  const schoolId = getRequestSchoolId(c, authUser);
  const body = await c.req.json().catch(() => ({}));
  const className = normalizeClassName(body.className);
  if (!className) return c.json({ success: false, message: 'कक्षा का नाम आवश्यक है।' }, 400);

  await db.prepare('DELETE FROM class_teachers WHERE school_id = ? AND class_name = ?').bind(schoolId, className).run();
  try {
    await db.prepare('UPDATE classes SET class_teacher_id = NULL WHERE name = ?').bind(className).run();
  } catch (e) {}

  const actorName = await resolveActorName(db, authUser.sub, authUser.role);
  await logActivity(db, {
    schoolId,
    userId: authUser.sub,
    userName: actorName,
    userRole: authUser.role,
    actionType: 'CLASS_TEACHER_REMOVE',
    actionTitle: 'कक्षा अध्यापक पदमुक्ति',
    description: `कक्षा ${className} से कक्षा अध्यापक का प्रभार हटाया गया।`,
    entityType: 'class',
    className,
  });

  return c.json({ success: true, message: className + ' से कक्षा अध्यापक हटा दिया गया।' });
});

export default classesApp;