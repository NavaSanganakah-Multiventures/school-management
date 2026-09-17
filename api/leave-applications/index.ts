import { Hono } from 'hono';
import { getDB } from '../db';
import { getAuthUser, getRequestSchoolId } from '../lib/auth';
import { logActivity } from '../lib/activity-logger';

const leaveApp = new Hono<{ Bindings: any }>();

// GET /api/leave-applications - List all leaves for a school
leaveApp.get('/', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);
  const schoolId = getRequestSchoolId(c, authUser);

  const leaves = await db.prepare(
    `SELECT l.*, s.first_name, s.last_name, s.class_name, s.section, s.roll_number 
     FROM leave_applications l 
     JOIN students s ON l.student_id = s.id 
     WHERE l.school_id = ? 
     ORDER BY l.created_at DESC`
  ).bind(schoolId).all();

  return c.json({ success: true, leaveApplications: leaves.results || [] });
});

// POST /api/leave-applications - Apply for a new leave
leaveApp.post('/', async (c) => {
  const db = getDB(c);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);
  const schoolId = getRequestSchoolId(c, authUser);
  const body = await c.req.json().catch(() => ({}));

  if (!body.studentId || !body.startDate || !body.endDate || !body.reason) {
    return c.json({ success: false, message: 'छात्र ID, दिनांक और कारण आवश्यक हैं।' }, 400);
  }

  const id = `lv-${crypto.randomUUID()}`;
  await db.prepare(
    `INSERT INTO leave_applications (id, school_id, student_id, start_date, end_date, reason, applied_by_user_id) 
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, schoolId, body.studentId, body.startDate, body.endDate, body.reason, authUser.sub
  ).run();

  await logActivity(db, {
    schoolId, userId: authUser.sub, userName: authUser.role, userRole: authUser.role,
    actionType: 'APPLY_LEAVE', actionTitle: 'छुट्टी का आवेदन',
    description: `छात्र ID '${body.studentId}' के लिए ${body.startDate} से ${body.endDate} तक की छुट्टी का आवेदन किया गया।`,
    entityType: 'LeaveApplication', entityId: id
  });

  return c.json({ success: true, message: 'छुट्टी का आवेदन सफलतापूर्वक दर्ज किया गया।', id });
});

// PUT /api/leave-applications/:id/status - Approve or reject leave
leaveApp.put('/:id/status', async (c) => {
  const db = getDB(c);
  const authUser = await getAuthUser(c);
  if (!authUser || (authUser.role !== 'Director' && authUser.role !== 'Principal' && authUser.role !== 'Staff')) {
    return c.json({ success: false, message: 'अनधिकृत पहुँच।' }, 403);
  }
  const schoolId = getRequestSchoolId(c, authUser);
  const leaveId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));

  if (!['Approved', 'Rejected'].includes(body.status)) {
    return c.json({ success: false, message: 'अवैध स्टेटस।' }, 400);
  }

  const res = await db.prepare(
    `UPDATE leave_applications SET status = ?, approved_by_user_id = ? WHERE id = ? AND school_id = ?`
  ).bind(body.status, authUser.sub, leaveId, schoolId).run();

  if (res.meta.changes === 0) return c.json({ success: false, message: 'आवेदन नहीं मिला।' }, 404);

  await logActivity(db, {
    schoolId, userId: authUser.sub, userName: authUser.role, userRole: authUser.role,
    actionType: 'UPDATE_LEAVE_STATUS', actionTitle: `छुट्टी ${body.status === 'Approved' ? 'स्वीकृत' : 'अस्वीकृत'}`,
    description: `छुट्टी आवेदन (ID: ${leaveId}) को ${body.status} किया गया।`,
    entityType: 'LeaveApplication', entityId: leaveId
  });

  return c.json({ success: true, message: `आवेदन सफलतापूर्वक ${body.status === 'Approved' ? 'स्वीकृत' : 'अस्वीकृत'} किया गया।` });
});

export default leaveApp;
