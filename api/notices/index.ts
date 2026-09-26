import { Hono } from 'hono';
import { getDB } from '../db';
import { getAuthUser, getRequestSchoolId } from '../lib/auth';
import { broadcastAlert } from '../notifications';
import { logActivity, resolveActorName } from '../lib/activity-logger';
import { requireSession, type Role } from '../lib/rbac';

const noticesApp = new Hono<{ Bindings: any }>();

const requireAnyUser = requireSession();
const requireManager = requireSession({ roles: ['Director', 'Principal'] as Role[] });

function mapNotice(r: any): any {
  if (!r) return null;
  return {
    id: r.id,
    title: r.title,
    content: r.content,
    category: r.category,
    targetAudience: r.target_audience,
    publishedBy: r.published_by,
    publishedDate: r.published_date,
    priority: r.priority,
    alertSent: r.fcm_broadcast_status === 'Sent',
  };
}

function audienceToTopic(schoolId: string, audience: string): string {
  const a = String(audience || 'All');
  if (a === 'Students') return 'school_' + schoolId + '_students';
  if (a === 'Teachers') return 'school_' + schoolId + '_teachers';
  if (a === 'Parents') return 'school_' + schoolId + '_parents';
  return 'school_' + schoolId + '_all';
}

// GET /api/notices
noticesApp.get('/', async (c) => {
  const guard = await requireAnyUser(c);
  if (!guard.ok) return guard.response;
  const { db, schoolId } = guard;
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const category = c.req.query('category');
  const rows = await db.prepare('SELECT * FROM notices WHERE school_id = ? ORDER BY published_date DESC').bind(schoolId).all();
  let list: any[] = (rows.results || []).map(mapNotice);
  if (category && category !== 'All') {
    list = list.filter((n: any) => n.category.toLowerCase() === category.toLowerCase());
  }
  return c.json({ success: true, notices: list });
});

// POST /api/notices
//
// AUTHORIZATION CHANGE: management only. Publishing a notice triggers a real
// push broadcast to a school-wide or role-targeted FCM topic, so previously
// any authenticated account (including a Student) could spam every device in
// the school and impersonate the publisher via the caller-supplied
// `publishedBy` field. The author is now derived from the session.
noticesApp.post('/', async (c) => {
  const guard = await requireManager(c);
  if (!guard.ok) return guard.response;
  const { db, schoolId, user } = guard;
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const body = await c.req.json().catch(() => ({}));

  if (!body.title || !body.content) {
    return c.json({ success: false, message: 'नोटिस शीर्षक एवं विवरण आवश्यक हैं।' }, 400);
  }

  const id = 'not-' + Date.now();
  const targetAudience = body.targetAudience || 'All';
  const priority = body.priority || 'Normal';
  const fcmPriority = (priority === 'Urgent' || priority === 'High') ? 'high' : 'normal';

  // published_by comes from the session, never from the request body.
  const publisherName = await resolveActorName(db, user.id, user.role);

  await db.prepare('INSERT INTO notices (id, title, content, category, target_audience, published_by, published_date, priority, fcm_broadcast_status, school_id) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .bind(id, body.title, body.content, body.category || 'General', targetAudience, publisherName, new Date().toISOString().split('T')[0], priority, 'Pending', schoolId).run();

  const broadcast = await broadcastAlert(db, c.env, {
    title: body.title,
    body: body.content,
    schoolId: schoolId,
    topicKey: audienceToTopic(schoolId, targetAudience),
    priority: fcmPriority,
    data: {
      noticeId: id,
      click_action: 'FLUTTER_NOTIFICATION_CLICK',
      tenantId: schoolId,
      priority: fcmPriority,
    },
  });

  const fcmStatus = broadcast.payload && broadcast.payload.success ? 'Sent' : 'Failed';
  await db.prepare('UPDATE notices SET fcm_broadcast_status = ? WHERE id = ? AND school_id = ?').bind(fcmStatus, id, schoolId).run();

  const row = await db.prepare('SELECT * FROM notices WHERE id = ? AND school_id = ?').bind(id, schoolId).first();
  const notice = mapNotice(row);

  const actorName = publisherName;
  await logActivity(db, {
    schoolId,
    userId: user.id,
    userName: actorName,
    userRole: user.role,
    actionType: 'NOTICE_PUBLISH',
    actionTitle: 'सूचना प्रकाशित की गई',
    description: `शीर्षक: "${body.title}" (लक्षित वर्ग: ${targetAudience}, प्राथमिकता: ${priority}) सूचना पट्ट पर जारी की गई।`,
    entityType: 'notice',
    entityId: id,
    metadata: { title: body.title, category: body.category, priority, targetAudience },
  });

  return c.json({
    success: true,
    message: broadcast.payload && broadcast.payload.success
      ? 'सूचना नोटिस बोर्ड पर प्रकाशित की गई और त्वरित अलर्ट प्रेषित किया गया।'
      : 'सूचना नोटिस बोर्ड पर प्रकाशित की गई। त्वरित अलर्ट में समस्या: ' + (broadcast.payload && broadcast.payload.message ? broadcast.payload.message : ''),
    notice,
    broadcast: broadcast.payload,
  }, 201);
});

// DELETE /api/notices/:id
//
// AUTHORIZATION CHANGE: management only. Deleting an official notice was
// previously open to any authenticated role.
noticesApp.delete('/:id', async (c) => {
  const guard = await requireManager(c);
  if (!guard.ok) return guard.response;
  const { db, schoolId, user } = guard;
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const id = c.req.param('id');
  const existing = await db.prepare('SELECT title FROM notices WHERE id = ? AND school_id = ?').bind(id, schoolId).first();
  if (!existing) return c.json({ success: false, message: 'नोटिस नहीं मिला।' }, 404);
  await db.prepare('DELETE FROM notices WHERE id = ? AND school_id = ?').bind(id, schoolId).run();

  const actorName = await resolveActorName(db, user.id, user.role);
  await logActivity(db, {
    schoolId,
    userId: user.id,
    userName: actorName,
    userRole: user.role,
    actionType: 'NOTICE_DELETE',
    actionTitle: 'सूचना हटाई गई',
    description: `सूचना "${existing?.title || id}" को नोटिस बोर्ड से हटाया गया।`,
    entityType: 'notice',
    entityId: id,
  });

  return c.json({ success: true, message: 'नोटिस हटा दिया गया।' });
});

export default noticesApp;
