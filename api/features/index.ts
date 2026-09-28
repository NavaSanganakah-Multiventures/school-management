import { Hono } from 'hono';
import { requireProxiedSession } from '../lib/rbac';
import { SUPER_ADMIN, type Role } from '../lib/roles';

const featuresApp = new Hono<{ Bindings: any }>();

// WHY requireProxiedSession AND NOT getAuthUser
//
// /api/features/* is one of the three prefixes api/index.ts proxies to the platform
// (api/index.ts:56), because the platform holds the authoritative feature records.
// api/internal/index.ts forwards that request carrying the M2M envelope and NO user
// credential -- a school token is only valid on the school's own worker, and the
// platform tier refuses school roles outright (api/lib/auth.ts). So a getAuthUser()
// guard on this module answered 401 for every Director on every dedicated school
// portal, every time. A school's "request a feature" button could not work.
//
// This is the same defect and the same fix as the billing proxy regression in #114,
// and the same one that made /api/plugins/* unreachable. getProxyAwareAuthUser
// (api/lib/proxied-auth.ts) accepts either a verified M2M envelope or a user token,
// so this module works both on a school portal and on the platform's own console.
//
// The role allowlist is unchanged -- Director, Principal, or SuperAdmin -- but it is
// now expressed through the guard, which normalises the role (so 'director' and
// 'superadmin' are handled rather than silently refused) and denies anything not
// listed instead of testing a raw string. Note that SuperAdmin is refused on the
// M2M path by design: a dedicated worker cannot hold a SuperAdmin token, so nothing
// legitimate sends one, and a school must not be able to reach platform-wide roles
// by naming one in a header.

const REQUEST_ROLES = ['Director', 'Principal', SUPER_ADMIN] as Role[];

// GET /api/features/my-requests - विद्यालय के पूर्व फीचर व आवश्यकता अनुरोध
featuresApp.get('/my-requests', async (c) => {
  const guard = await requireProxiedSession()(c);
  if (!guard.ok) return guard.response;
  const { db, schoolId } = guard;
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);

  // Fail closed rather than querying `WHERE school_id = ''`.
  if (!schoolId) return c.json({ success: false, message: 'स्कूल संदर्भ (tenant) ज़रूरी है।' }, 401);

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
  const guard = await requireProxiedSession({ roles: REQUEST_ROLES })(c);
  if (!guard.ok) return guard.response;
  const { user, db, schoolId } = guard;
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  if (!schoolId) return c.json({ success: false, message: 'स्कूल संदर्भ (tenant) ज़रूरी है।' }, 401);

  const body = await c.req.json().catch(() => ({}));
  const title = String(body.title || '').trim();
  const description = String(body.description || '').trim();
  const category = String(body.category || 'custom_feature').trim();

  if (!title || !description) {
    return c.json({ success: false, message: 'शीर्षक और विवरण आवश्यक हैं।' }, 400);
  }

  const requestId = 'freq-' + Date.now();
  const now = new Date().toISOString();

  await db.prepare(
    'INSERT INTO school_feature_requests (id, school_id, requested_by_user_id, title, description, category, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    requestId,
    schoolId,
    // The actor is the verified session, never the request body. Over the M2M path
    // there is no user id -- the worker forwarded the school, not a person -- so this
    // is empty rather than invented.
    user.id || '',
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
