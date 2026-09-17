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
import masterAdminApp from './master-admin';

const app = new Hono<{ Bindings: any }>().basePath('/api');

app.use('*', cors());

app.get('/health', (c) => {
  return c.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    system: 'Pragnya Mitra School Management System & ERP API',
    engine: 'Hono.js Engine on Cloudflare Workers / workerd',
    rolesSupported: ['SuperAdmin', 'Director', 'Principal', 'Staff'],
    paymentGateway: 'Razorpay',
    database: 'Cloudflare D1 (Multi-Worker Isolated Architecture)',
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
app.route('/master', masterAdminApp);

export default app;
