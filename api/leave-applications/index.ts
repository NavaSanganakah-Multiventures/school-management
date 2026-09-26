import { Hono } from 'hono';
import { getDB } from '../db';
import { logActivity } from '../lib/activity-logger';
import { canActOnStudent, getFamilyStudentScope, requireSession, type Role } from '../lib/rbac';
import { isFamily, isManagement } from '../lib/roles';
import { getAssignedClassNames, isClassTeacher } from '../lib/permissions';

const leaveApp = new Hono<{ Bindings: any }>();

const requireAnyUser = requireSession();
const requireDecider = requireSession({
  roles: ['Director', 'Principal', 'Staff', 'Teacher'] as Role[],
});

// GET /api/leave-applications - List leaves
//
// AUTHORIZATION CHANGE
// This previously returned every leave in the school to any authenticated
// account, leaking the reason, dates, class and roll number for every student.
// Now:
//   - family roles see only their own linked children (parent_student_links,
//     migration 0039); an unlinked account sees nothing (fail closed),
//   - a teaching role sees only its assigned classes,
//   - management sees the whole school.
leaveApp.get('/', async (c) => {
  const guard = await requireAnyUser(c);
  if (!guard.ok) return guard.response;
  const { db, schoolId, user } = guard;
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);

  let sql =
    `SELECT l.*, s.first_name, s.last_name, s.class_name, s.section, s.roll_number
     FROM leave_applications l
     JOIN students s ON l.student_id = s.id AND s.school_id = l.school_id
     WHERE l.school_id = ? AND s.school_id = ?`;
  const params: any[] = [schoolId, schoolId];

  if (isFamily(user.role)) {
    const scope = await getFamilyStudentScope(guard);
    if (!scope || scope.size === 0) return c.json({ success: true, leaveApplications: [] });
    sql += ` AND l.student_id IN (${Array.from(scope).map(() => '?').join(',')})`;
    params.push(...Array.from(scope));
  } else if (!isManagement(user.role)) {
    const classes = await getAssignedClassNames(db, schoolId, user.id);
    if (classes.length === 0) return c.json({ success: true, leaveApplications: [] });
    sql += ` AND s.class_name IN (${classes.map(() => '?').join(',')})`;
    params.push(...classes);
  }
  sql += ' ORDER BY l.created_at DESC';

  const leaves = await db.prepare(sql).bind(...params).all();
  return c.json({ success: true, leaveApplications: leaves.results || [] });
});

// POST /api/leave-applications - Apply for a new leave
//
// A family role may only file leave for a linked child. Previously any
// authenticated account could file leave for any student in the school.
leaveApp.post('/', async (c) => {
  const guard = await requireAnyUser(c);
  if (!guard.ok) return guard.response;
  const { db, schoolId, user } = guard;
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const body = await c.req.json().catch(() => ({}));

  if (!body.studentId || !body.startDate || !body.endDate || !body.reason) {
    return c.json({ success: false, message: 'छात्र ID, दिनांक और कारण आवश्यक हैं।' }, 400);
  }

  // Verify the student belongs to this school (prevents cross-tenant references).
  const student = await db.prepare('SELECT id FROM students WHERE id = ? AND school_id = ?')
    .bind(body.studentId, schoolId).first();
  if (!student) {
    return c.json({ success: false, message: 'छात्र आपके स्कूल में नहीं मिला।' }, 404);
  }

  if (!(await canActOnStudent(guard, String(body.studentId)))) {
    return c.json({ success: false, message: 'आपके अधिकार में यह छात्र नहीं है।' }, 403);
  }

  const id = `lv-${crypto.randomUUID()}`;
  await db.prepare(
    'INSERT INTO leave_applications (id, school_id, student_id, start_date, end_date, reason, applied_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    id, schoolId, body.studentId, body.startDate, body.endDate, body.reason, user.id
  ).run();

  await logActivity(db, {
    schoolId, userId: user.id, userName: user.role, userRole: user.role,
    actionType: 'APPLY_LEAVE', actionTitle: 'छुट्टी का आवेदन',
    description: `छात्र ID '${body.studentId}' के लिए ${body.startDate} से ${body.endDate} तक की छुट्टी का आवेदन किया गया।`,
    entityType: 'LeaveApplication', entityId: id,
  });

  return c.json({ success: true, message: 'छुट्टी का आवेदन सफलतापूर्वक दर्ज किया गया।', id });
});

// PUT /api/leave-applications/:id/status - Approve or reject leave
//
// A teaching role may only decide leaves for students in its assigned class.
// Previously any Staff account could approve or reject any leave in the school.
leaveApp.put('/:id/status', async (c) => {
  const guard = await requireDecider(c);
  if (!guard.ok) return guard.response;
  const { db, schoolId, user } = guard;
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const leaveId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));

  if (!['Approved', 'Rejected'].includes(body.status)) {
    return c.json({ success: false, message: 'अवैध स्टेटस।' }, 400);
  }

  if (!isManagement(user.role)) {
    const target = await db.prepare(
      'SELECT s.class_name FROM leave_applications l '
      + 'JOIN students s ON l.student_id = s.id AND s.school_id = l.school_id '
      + 'WHERE l.id = ? AND l.school_id = ?'
    ).bind(leaveId, schoolId).first();
    if (!target) return c.json({ success: false, message: 'आवेदन नहीं मिला।' }, 404);
    const owns = await isClassTeacher(db, schoolId, target.class_name, user.id);
    if (!owns) {
      return c.json({
        success: false,
        message: 'आप केवल अपने कक्षा के छात्रों के आवेदन ही स्वीकृत/अस्वीकृत कर सकते हैं।',
      }, 403);
    }
  }

  const res = await db.prepare(
    'UPDATE leave_applications SET status = ?, approved_by_user_id = ? WHERE id = ? AND school_id = ?'
  ).bind(body.status, user.id, leaveId, schoolId).run();

  if (res.meta.changes === 0) return c.json({ success: false, message: 'आवेदन नहीं मिला।' }, 404);

  await logActivity(db, {
    schoolId, userId: user.id, userName: user.role, userRole: user.role,
    actionType: 'UPDATE_LEAVE_STATUS',
    actionTitle: `छुट्टी ${body.status === 'Approved' ? 'स्वीकृत' : 'अस्वीकृत'}`,
    description: `छुट्टी आवेदन (ID: ${leaveId}) को ${body.status} किया गया।`,
    entityType: 'LeaveApplication', entityId: leaveId,
  });

  return c.json({
    success: true,
    message: `आवेदन सफलतापूर्वक ${body.status === 'Approved' ? 'स्वीकृत' : 'अस्वीकृत'} किया गया।`,
  });
});

export default leaveApp;
