import { Hono } from 'hono';
import { cors } from 'hono/cors';
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
import internalApp from './internal';
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
      try {
        const platformUrl = new URL(c.req.url);
        platformUrl.hostname = 'pragnya.nasven.com';
        platformUrl.protocol = 'https:';
        const proxyRequest = new Request(platformUrl.toString(), c.req.raw);
        return await fetch(proxyRequest);
      } catch (err: any) {
        console.error('Error proxying to platform worker pragnya.nasven.com:', err);
        return c.json({
          success: false,
          error: 'केंद्रीय प्लेटफ़ॉर्म सेवा अस्थायी रूप से अनुपलब्ध है। कृपया कुछ समय बाद पुनः प्रयास करें।',
          details: err?.message || 'Platform proxy unreachable'
        }, 502);
      }
    }
  }
  await next();
});

app.get('/health', (c) => {
  return c.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    system: 'VidyaSetu School Management System & CRM API',
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
