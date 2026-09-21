import { Hono } from 'hono';
import { getDB } from '../db';
import { getAuthUser, getRequestSchoolId } from '../lib/auth';

const featuresApp = new Hono<{ Bindings: any }>();

// GET /api/features/my-requests - विद्यालय के पूर्व फीचर व आवश्यकता अनुरोध
featuresApp.get('/my-requests', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'अनधिकृत पहुंच।' }, 401);

  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);

  const schoolId = getRequestSchoolId(c, authUser);
  const rows = await db.prepare(
    'SELECT * FROM school_feature_requests WHERE school_id = ? ORDER BY created_at DESC'
  ).bind(schoolId).all();

  return c.json({
    success: true,
    requests: rows.results || [],
  });
});

// POST /api/features/request - नई आवश्यकता / कस्टम फीचर का अनुरोध भेजें
featuresApp.post('/request', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);

  if (!['Director', 'Principal', 'SuperAdmin'].includes(authUser.role)) {
    return c.json({ success: false, message: 'केवल निदेशक या प्रधानाचार्य ही अनुरोध कर सकते हैं।' }, 403);
  }

  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);

  const body = await c.req.json().catch(() => ({}));
  const title = String(body.title || '').trim();
  const description = String(body.description || '').trim();
  const category = String(body.category || 'custom_feature').trim();

  if (!title || !description) {
    return c.json({ success: false, message: 'शीर्षक और विवरण आवश्यक हैं।' }, 400);
  }

  const schoolId = getRequestSchoolId(c, authUser);
  const requestId = 'freq-' + Date.now();
  const now = new Date().toISOString();

  await db.prepare(
    'INSERT INTO school_feature_requests (id, school_id, requested_by_user_id, title, description, category, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    requestId,
    schoolId,
    authUser.sub || '',
    title,
    description,
    category,
    'Pending',
    now,
    now
  ).run();

  return c.json({
    success: true,
    message: 'आपकी आवश्यकता / फीचर अनुरोध सुपर एडमिन को भेज दिया गया है। हमारी टीम जल्द समीक्षा करेगी।',
    requestId,
  });
});

export default featuresApp;
