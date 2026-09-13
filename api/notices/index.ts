import { Hono } from 'hono';
import { getDB } from '../db';
import { getAuthUser, getRequestSchoolId } from '../lib/auth';
import { broadcastAlert } from '../notifications';

const noticesApp = new Hono<{ Bindings: any }>();

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
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  const schoolId = getRequestSchoolId(c, authUser);
  const category = c.req.query('category');
  const rows = await db.prepare('SELECT * FROM notices WHERE school_id = ? ORDER BY published_date DESC').bind(schoolId).all();
  let list = (rows.results || []).map(mapNotice);
  if (category && category !== 'All') {
    list = list.filter((n) => n.category.toLowerCase() === category.toLowerCase());
  }
  return c.json({ success: true, notices: list });
});

// POST /api/notices

noticesApp.post('/', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);
  const schoolId = getRequestSchoolId(c, authUser);
  const body = await c.req.json().catch(() => ({}));

  if (!body.title || !body.content) {
    return c.json({ success: false, message: 'नोटिस शीर्षक एवं विवरण आवश्यक हैं।' }, 400);
  }

  const id = 'not-' + Date.now();
  const targetAudience = body.targetAudience || 'All';
  const priority = body.priority || 'Normal';
  const fcmPriority = (priority === 'Urgent' || priority === 'High') ? 'high' : 'normal';

  await db.prepare('INSERT INTO notices (id, title, content, category, target_audience, published_by, published_date, priority, fcm_broadcast_status, school_id) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .bind(id, body.title, body.content, body.category || 'General', targetAudience, body.publishedBy || 'प्रशासन कार्यालय', new Date().toISOString().split('T')[0], priority, 'Pending', schoolId).run();

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
  await db.prepare('UPDATE notices SET fcm_broadcast_status = ? WHERE id = ?').bind(fcmStatus, id).run();

  const row = await db.prepare('SELECT * FROM notices WHERE id = ?').bind(id).first();
  const notice = mapNotice(row);

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
noticesApp.delete('/:id', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);
  const schoolId = getRequestSchoolId(c, authUser);
  const id = c.req.param('id');
  await db.prepare('DELETE FROM notices WHERE id = ? AND school_id = ?').bind(id, schoolId).run();
  return c.json({ success: true, message: 'नोटिस हटा दिया गया।' });
});

export default noticesApp;
