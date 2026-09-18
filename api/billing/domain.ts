import { Hono } from 'hono';
import { getDB } from '../db';
import { getAuthUser, getRequestSchoolId } from '../lib/auth';

const domainApp = new Hono<{ Bindings: any }>();

// GET /api/billing/domain/quota - get email quota
domainApp.get('/quota', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'Unauthorized' }, 401);
  const db = getDB(c);
  const schoolId = authUser.role === 'SuperAdmin' ? getRequestSchoolId(c, authUser) : authUser.schoolId;

  const domain = await db.prepare('SELECT monthly_sending_quota, monthly_sent_count FROM school_custom_domains WHERE school_id = ?').bind(schoolId).first();
  if (!domain) {
    return c.json({ success: true, quota: 0, sent: 0, available: 0 });
  }

  const quota = domain.monthly_sending_quota || 0;
  const sent = domain.monthly_sent_count || 0;
  return c.json({ success: true, quota, sent, available: Math.max(0, quota - sent) });
});

export default domainApp;
