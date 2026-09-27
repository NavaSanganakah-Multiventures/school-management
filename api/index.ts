import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { buildInternalAuthHeaders } from './lib/internal-request-auth';
import { getInternalSyncSecret } from './lib/tenant-crypto';
import { getAuthUser } from './lib/auth';
import authApp from './auth';
import studentsApp from './students';
import attendanceApp from './attendance';
import feesApp from './fees';
import examsApp from './exams';
import noticesApp from './notices';
import notificationsApp from './notifications';
import dashboardStatsApp from './dashboard-stats';
import { principalApp } from './principal';

import { staffApp } from './staff';
import { schoolProfileApp } from './school-profile';
import billingApp from './billing';
import adminApp from './admin';
import fcmProxyApp from './fcm-proxy';
import classesApp from './classes';
import activityLogsApp from './activity-logs';
import subjectsApp from './subjects';
import leaveApp from './leave-applications';
import pluginsApp from './plugins';
import aiApp from './ai';
import configApp from './config';
import lmsApp from './lms';
import emailApp from './email';
import internalApp, { setInternalRootApp } from './internal';
import featuresApp from './features';
import webhooksApp from './webhooks';
import { processTrialExpirations, processPluginTrialExpirations, processSubscriptionRenewals } from './lib/trial-expiration';
import { processFeeReminders } from './lib/fee-reminders';

const app = new Hono<{ Bindings: any }>().basePath('/api');

app.use('*', cors());

// Dedicated Worker Request Policy:
// 1. Billing, Plugins, and Features routes are proxied to the central platform worker (pragnya.nasven.com).
// 2. SuperAdmin / Admin Console routes are strictly BLOCKED on dedicated school workers.
app.use('*', async (c, next) => {
  const isDedicated = !!(c.env && (c.env.IS_DEDICATED_WORKER === 'true' || c.env.SCHOOL_ID));
  if (isDedicated) {
    const path = new URL(c.req.url).pathname;

    // Strict SuperAdmin boundary: never proxy or allow platform admin routes on dedicated workers
    if (path.startsWith('/api/admin')) {
      return c.json({
        success: false,
        message: 'Super Admin कंसोल केवल केंद्रीय प्लेटफ़ॉर्म (pragnya.nasven.com) पर उपलब्ध है। Dedicated स्कूल वर्कर पर यह अनुमत नहीं है।',
      }, 403);
    }

    if (path.startsWith('/api/billing') || path.startsWith('/api/plugins') || path.startsWith('/api/features')) {
      // The platform worker is the only billing authority, so these routes have to
      // be answered there. But the school's own user token must NOT travel with the
      // request: a school role is only valid on its dedicated worker, and the
      // platform tier refuses school roles outright (api/lib/auth.ts). Forwarding
      // the token therefore answered every authenticated billing call on a
      // dedicated worker with 401 -- verified live against
      // yagyaashram.pragnya.nasven.com, where /api/billing/subscription returned
      // 401 while /api/auth/me returned 200.
      //
      // So the proxy authenticates as the WORKER, not as the user, and the school
      // is taken from SCHOOL_ID in this worker's own env -- which a caller cannot
      // influence, because a dedicated worker only ever serves one school.
      //
      // The request is retargeted at /api/internal/<schoolId>/... rather than
      // /api/... for one specific reason: the M2M signing string covers the path,
      // so putting the school id INSIDE the path puts it inside the signature.
      // INTERNAL_SYNC_SECRET is fleet-wide, so a header-carried school id could be
      // swapped by any dedicated worker and the signature would still verify. In
      // the path it cannot.
      const schoolId = String((c.env && c.env.SCHOOL_ID) || '').trim();
      if (!schoolId) {
        // Without a school id the platform cannot scope the answer, and guessing
        // is exactly the invented-tenant behaviour that was removed.
        return c.json({
          success: false,
          message: 'इस dedicated worker पर SCHOOL_ID सेट नहीं है, इसलिए billing सेवा नहीं दी जा सकती।',
        }, 500);
      }

      // A token that is PRESENT but does not verify is rejected here. A request with
      // no token at all is still forwarded, because parts of billing are public --
      // /api/billing/plans and /api/billing/razorpay/config carry no auth and the
      // pricing page has to render before anyone logs in. Demanding a token for the
      // whole prefix turned those into 401 on every dedicated school, which is the
      // same class of outage as the one this change fixes.
      //
      // What the platform then does with it is the single authority: a public route
      // needs no role, an authenticated route without a verified role is refused
      // there. So the role is forwarded only when a token actually verified here.
      const caller = await getAuthUser(c);
      if (c.req.header('Authorization') && !caller) {
        return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);
      }

      const secret = await getInternalSyncSecret(c.env);
      if (!secret) {
        return c.json({
          success: false,
          message: 'Internal sync secret configured नहीं है, इसलिए billing सेवा अनुपलब्ध है।',
        }, 500);
      }

      // Read the body once: the signature is computed over it, and the body can
      // only be consumed once.
      const rawBody = ['GET', 'HEAD'].includes(c.req.method)
        ? ''
        : await c.req.text();

      // `/api/billing/x` -> `/api/internal/<schoolId>/api/billing/x`. The school
      // id has to sit inside the signed path, not in a header: INTERNAL_SYNC_SECRET
      // is fleet-wide, so it proves "a dedicated worker asked" and not "this
      // dedicated worker asked", and a header could be swapped by any of them.
      const targetPath = `/api/internal/${encodeURIComponent(schoolId)}${path}`;
      const platformUrl = new URL(c.req.url);
      platformUrl.hostname = 'pragnya.nasven.com';
      platformUrl.protocol = 'https:';
      platformUrl.pathname = targetPath;

      const headers = new Headers();
      headers.set('Content-Type', c.req.header('Content-Type') || 'application/json');
      for (const [k, v] of Object.entries(await buildInternalAuthHeaders({
        secret,
        method: c.req.method,
        path: targetPath,
        body: rawBody,
      }))) {
        headers.set(k, v);
      }
      // Identity for auditing and for the platform's role checks, both taken from
      // the token this worker just verified -- never from a request header. An
      // earlier draft forwarded X-Forwarded-User straight through, which let any
      // caller write whatever identity it liked into the platform's audit trail.
      if (caller) {
        headers.set('X-Acting-Role', String(caller.role || ''));
        headers.set('X-Acting-Email', String(caller.email || ''));
      }

      const proxyRequest = new Request(platformUrl.toString(), {
        method: c.req.method,
        headers,
        body: rawBody || undefined,
      });
      return await fetch(proxyRequest);
    }
  }
  await next();
});

app.get('/health', (c) => {
  return c.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    system: 'Pragnya Mitra School Management System & CRM API',
    engine: 'Hono.js Engine',
    rolesSupported: ['SuperAdmin', 'Director', 'Principal', 'Staff'],
    paymentGateway: 'Razorpay',
    database: 'Cloudflare D1 (real data)',
  });
});

app.route('/auth', authApp);
app.route('/students', studentsApp);
app.route('/principal', principalApp);
app.route('/staff', staffApp);
app.route('/school-profile', schoolProfileApp);
app.route('/attendance', attendanceApp);
app.route('/fees', feesApp);
app.route('/exams', examsApp);
app.route('/notices', noticesApp);
app.route('/notifications', notificationsApp);
app.route('/dashboard-stats', dashboardStatsApp);
app.route('/billing', billingApp);
app.route('/admin', adminApp);
app.route('/classes', classesApp);
app.route('/fcm-proxy', fcmProxyApp);
app.route('/activity-logs', activityLogsApp);
app.route('/subjects', subjectsApp);
app.route('/leave-applications', leaveApp);
app.route('/plugins', pluginsApp);
app.route('/ai', aiApp);
app.route('/config', configApp);
app.route('/lms', lmsApp);
app.route('/email', emailApp);
app.route('/internal', internalApp);

// Let the internal surface re-enter this app in process for the school-scoped
// billing/plugins/features routes. Registered after the mounts so the root app is
// fully routed by the time any request can reach it.
setInternalRootApp(app);
app.route('/features', featuresApp);
app.route('/webhooks', webhooksApp);

const worker = {
  fetch: (request: Request, env: any, ctx: any) => app.fetch(request, env, ctx),
  scheduled: async (event: any, env: any, ctx: any) => {
    try {
      const task = Promise.all([
        processTrialExpirations(env),
        processPluginTrialExpirations(env),
        processSubscriptionRenewals(env),
        processFeeReminders(env),
      ]);
      if (ctx && typeof ctx.waitUntil === 'function') {
        ctx.waitUntil(task);
      } else {
        await task;
      }
    } catch (e) {
      console.error('[Scheduled] trial expiration error:', e);
    }
  },
};

export default worker;
export { app };
