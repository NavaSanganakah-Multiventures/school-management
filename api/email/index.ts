// Email quota + business-domain email endpoints.
// GET /api/email/quota — current school's monthly quota/usage.
// POST /api/email/test — send a test broadcast email (Director/Principal only).

import { Hono } from 'hono';
import { getDB } from '../db';
import { getAuthUser, getRequestSchoolId } from '../lib/auth';
import { getSchoolEmailQuota } from '../lib/email-quota';
import { sendSchoolEmail } from '../lib/email';

const emailApp = new Hono<{ Bindings: any }>();

// GET /api/email/quota — school-scoped monthly email quota + usage
emailApp.get('/quota', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन नहीं है।' }, 401);

  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);

  const schoolId = getRequestSchoolId(c, authUser);
  const quota = await getSchoolEmailQuota(db, schoolId);
  return c.json({ success: true, quota });
});

// POST /api/email/test — send a test email (daily anti-abuse only; Director/Principal)
emailApp.post('/test', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन नहीं है।' }, 401);

  if (authUser.role !== 'Director' && authUser.role !== 'Principal' && authUser.role !== 'SuperAdmin') {
    return c.json({ success: false, message: 'केवल Director या Principal ही परीक्षण ईमेल भेज सकते हैं।' }, 403);
  }

  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);

  const schoolId = getRequestSchoolId(c, authUser);
  const body = await c.req.json().catch(() => ({}));
  const to = String((body && body.to) || (authUser && authUser.email) || '').trim();
  if (!to) return c.json({ success: false, message: 'प्राप्तकर्ता ईमेल आवश्यक है।' }, 400);

  // A test email must be able to prove the school's own configuration works. It must not
  // be usable as a relay.
  //
  // `to` was arbitrary and unvalidated, while sendSchoolEmail sends as the school's own
  // verified sender (school_email_config.from_email) whenever that is configured. So one
  // Director or Principal could send real mail from the school's business domain to any
  // address on the internet, bounded only by the 3/day-per-recipient quota. The
  // deliverability damage lands on the school, not on the caller.
  //
  // Recipients are restricted to the caller themselves, or to the school's own email
  // domain. That still proves SPF/DKIM/routing end to end, which is the whole purpose of
  // the endpoint.
  const recipient = to.toLowerCase();
  const ownAddress = String((authUser && authUser.email) || '').toLowerCase();
  if (recipient !== ownAddress) {
    const recipientDomain = recipient.includes('@') ? recipient.split('@')[1] : '';
    const profileRow: any = await db
      .prepare('SELECT email, contact_email FROM school_profile WHERE id = ?')
      .bind(schoolId)
      .first()
      .catch(() => null);
    const schoolDomains: string[] = [profileRow && profileRow.email, profileRow && profileRow.contact_email]
      .filter((v: any) => !!v && String(v).includes('@'))
      .map((v: any) => String(v).split('@')[1].toLowerCase());
    const allowed = !!recipientDomain && schoolDomains.some(
      (d) => recipientDomain === d || recipientDomain.endsWith('.' + d),
    );
    if (!allowed) {
      return c.json({
        success: false,
        message: 'परीक्षण ईमेल केवल आपके अपने ईमेल या अपने विद्यालय के डोमेन पर भेजा जा सकता है।',
      }, 403);
    }
  }

  const result = await sendSchoolEmail(c.env, {
    schoolId: schoolId,
    to: to,
    subject: 'Pragnya Mitra — परीक्षण ईमेल',
    title: 'परीक्षण ईमेल',
    message: 'यह एक परीक्षण ईमेल है। आपके विद्यालय का ईमेल वितरण सही तरीके से कार्य कर रहा है।'
  });

  if (!result.sent) {
    return c.json({ success: false, message: result.error || 'ईमेल भेजने में त्रुटि।' }, 502);
  }
  return c.json({ success: true, message: 'परीक्षण ईमेल भेज दिया गया।' });
});

export default emailApp;
