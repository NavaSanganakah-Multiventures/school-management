import { Hono } from 'hono';
import { getDB } from '../db';
import { getAuthUser, getRequestSchoolId } from '../lib/auth';

const noticesApp = new Hono();

function mapNotice(r: any) {
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
  await db.prepare('INSERT INTO notices (id, title, content, category, target_audience, published_by, published_date, priority, fcm_broadcast_status, school_id) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .bind(id, body.title, body.content, body.category || 'General', body.targetAudience || 'All', body.publishedBy || 'प्रशासन कार्यालय', new Date().toISOString().split('T')[0], body.priority || 'Normal', 'Sent', schoolId).run();

  const row = await db.prepare('SELECT * FROM notices WHERE id = ?').bind(id).first();
  const notice = mapNotice(row);
  return c.json({ success: true, message: 'सूचना नोटिस बोर्ड पर प्रकाशित की गई और त्वरित अलर्ट प्रेषित किया गया।', notice }, 201);
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
