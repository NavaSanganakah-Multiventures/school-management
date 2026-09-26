import { Hono } from 'hono';
import { getDB, generateSchoolTopics } from '../db';
import { getAuthUser, getRequestSchoolId } from '../lib/auth';
import {
  buildTokenMessage,
  buildTopicMessage,
  getFcmProjectId,
  isFcmConfigured,
  isRealFcmToken,
  sendFcmMessage,
} from '../lib/fcm';
import { isWebPushConfigured, sendWebPushNotification } from '../lib/webpush';
import { sendSchoolEmail } from '../lib/email';
import { requireSession, type Role } from '../lib/rbac';

const notificationsApp = new Hono();

const requireAnyUser = requireSession();
const requireManager = requireSession({ roles: ['Director', 'Principal', 'SuperAdmin'] as Role[] });

const WEB_STAFF_ROLES = ['Director', 'Principal', 'Staff', 'SuperAdmin', 'Teachers'];

function roleTopic(schoolId: string, role: string): string {
  const r = String(role || 'Parents');
  if (r === 'Students') return 'school_' + schoolId + '_students';
  if (r === 'Parents') return 'school_' + schoolId + '_parents';
  return 'school_' + schoolId + '_teachers';
}

function derivedTopics(schoolId: string, role: string): string[] {
  return ['school_' + schoolId + '_all', roleTopic(schoolId, role)];
}

function parseTopics(raw: any): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) { return []; }
}

function roleInTarget(targetRole: string, deviceRole: string): boolean {
  const t = String(targetRole || 'All');
  if (t === 'All') return true;
  const d = String(deviceRole || '');
  if (t === 'Teachers') return WEB_STAFF_ROLES.indexOf(d) >= 0;
  return d === t;
}


interface BroadcastOptions {
  title: string;
  body: string;
  schoolId: string;
  topicKey?: string;
  targetRole?: string;
  priority?: string;
  data?: Record<string, any>;
}

async function sendBroadcastEmails(db: any, env: any, schoolId: string, targetRole: string, title: string, body: string): Promise<{ attempted: number; sent: number }> {
  if (!db || !env) return { attempted: 0, sent: 0 };
  const emails = new Set<string>();
  const wantParents = targetRole === 'All' || targetRole === 'Parents' || targetRole === 'Students';
  const wantStaff = targetRole === 'All' || targetRole === 'Teachers';

  if (wantParents) {
    try {
      const rows = await db.prepare("SELECT email FROM students WHERE school_id = ? AND status = 'Active' AND email != '' AND email IS NOT NULL").bind(schoolId).all();
      (rows.results || []).forEach((r: any) => { if (r.email) emails.add(String(r.email).trim().toLowerCase()); });
    } catch (_) {}
  }
  if (wantStaff) {
    try {
      const rows = await db.prepare("SELECT email FROM system_users WHERE school_id = ? AND status = 'Active' AND email != '' AND email IS NOT NULL").bind(schoolId).all();
      (rows.results || []).forEach((r: any) => { if (r.email) emails.add(String(r.email).trim().toLowerCase()); });
    } catch (_) {}
  }

  let sent = 0;
  let attempted = 0;
  for (const to of emails) {
    attempted++;
    const res = await sendSchoolEmail(env, { schoolId, to, subject: title, title, message: body });
    if (res.sent) sent++;
  }
  return { attempted, sent };
}

export async function broadcastAlert(db: any, env: any, opts: BroadcastOptions): Promise<{ status: number; payload: any }> {
  const activeSchoolId = opts.schoolId;
  const availableTopics = generateSchoolTopics(activeSchoolId);

  let resolvedTopicKey = opts.topicKey || 'school_' + activeSchoolId + '_all';
  const prefix = 'school_' + activeSchoolId + '_';
  if (resolvedTopicKey.indexOf(prefix) !== 0) {
    let clean = String(resolvedTopicKey);
    if (clean.indexOf('school_') === 0) clean = clean.slice('school_'.length);
    if (clean === 'all_parents_students') clean = 'all';
    resolvedTopicKey = prefix + clean;
  }
  const matchedTopic = availableTopics.find((t: any) => t.topicKey === resolvedTopicKey);
  const targetRole = matchedTopic ? matchedTopic.targetRole : (opts.targetRole || 'All');
  const priority = (opts.data && opts.data.priority) ? opts.data.priority : (opts.priority || 'high');

  const dataPayload: Record<string, any> = Object.assign({}, opts.data || {}, {
    schoolId: activeSchoolId,
    tenantId: activeSchoolId,
    targetRole: targetRole,
    priority: priority,
  });

  const fcmConfigured = isFcmConfigured(env);
  const webPushConfigured = isWebPushConfigured(env);

  let topicResult: any = { success: false, error: 'FCM कॉन्फ़िगर नहीं है।' };
  if (fcmConfigured) {
    try {
      topicResult = await sendFcmMessage(env, buildTopicMessage(resolvedTopicKey, opts.title, opts.body, dataPayload, priority));
    } catch (e: any) {
      topicResult = { success: false, error: e && e.message ? e.message : String(e) };
    }
  }

  let allTargetDevices: Array<{ token: string; role: string; deviceType: string; subscribedTopics: string[] }> = [];
  let directTokens: Array<{ token: string; role: string; deviceType: string; subscribedTopics: string[] }> = [];
  let tokenSkipped = 0;
  let webCount = 0;
  let mobileCount = 0;

  try {
    const rows = await db.prepare(
      'SELECT device_token, role, device_type, subscribed_topics FROM fcm_device_tokens WHERE school_id = ? AND is_active = 1'
    ).bind(activeSchoolId).all();

    allTargetDevices = (rows.results || [])
      .filter((r: any) => roleInTarget(targetRole, r.role))
      .map((r: any) => ({
        token: (r.device_token as string) || '',
        role: (r.role as string) || '',
        deviceType: (r.device_type as string) || 'web',
        subscribedTopics: parseTopics(r.subscribed_topics)
      }));

    webCount = allTargetDevices.filter((d) => d.deviceType === 'web').length;
    mobileCount = allTargetDevices.filter((d) => d.deviceType !== 'web').length;

    // Direct FCM mobile tokens: only genuine Google FCM tokens from mobile apps
    const canSkipViaTopic = fcmConfigured && !!topicResult.success;
    directTokens = allTargetDevices.filter((d) => {
      if (!isRealFcmToken(d.token)) return false;
      if (canSkipViaTopic && String(d.deviceType || '') === 'web' && d.subscribedTopics.indexOf(resolvedTopicKey) >= 0) {
        tokenSkipped++;
        return false;
      }
      return true;
    });
  } catch (e) {
    allTargetDevices = [];
    directTokens = [];
  }

  // Native Web Push subscriptions (real browser PushSubscription) — background delivery.
  let webPushSubs: Array<{ id: string; endpoint: string; p256dh: string; auth: string; role: string; subscribedTopics: string[] }> = [];
  try {
    const webRows = await db.prepare(
      'SELECT id, endpoint, p256dh, auth, role, subscribed_topics FROM web_push_subscriptions WHERE school_id = ? AND is_active = 1'
    ).bind(activeSchoolId).all();
    webPushSubs = (webRows.results || [])
      .filter((r: any) => roleInTarget(targetRole, r.role))
      .map((r: any) => ({
        id: String(r.id || ''),
        endpoint: String(r.endpoint || ''),
        p256dh: String(r.p256dh || ''),
        auth: String(r.auth || ''),
        role: String(r.role || ''),
        subscribedTopics: parseTopics(r.subscribed_topics),
      }));
  } catch (e) {
    webPushSubs = [];
  }

  let tokenSuccess = 0;
  let tokenFailed = 0;
  const tokenErrors: string[] = [];
  if (fcmConfigured && directTokens.length > 0) {
    for (let i = 0; i < directTokens.length; i++) {
      const token = directTokens[i].token;
      try {
        const r = await sendFcmMessage(env, buildTokenMessage(token, opts.title, opts.body, dataPayload, priority));
        if (r.success) {
          tokenSuccess++;
        } else {
          tokenFailed++;
          const errStr = r.error || 'unknown';
          tokenErrors.push('token: ' + errStr);
          // Auto-deactivate invalid/unregistered tokens in DB
          if (errStr.includes('not a valid FCM registration token') || errStr.includes('UNREGISTERED') || errStr.includes('INVALID_ARGUMENT') || errStr.includes('NOT_FOUND')) {
            await db.prepare('UPDATE fcm_device_tokens SET is_active = 0 WHERE device_token = ?').bind(token).run().catch(() => {});
          }
        }
      } catch (e: any) {
        tokenFailed++;
        const errStr = e && e.message ? e.message : String(e);
        tokenErrors.push('token: ' + errStr);
        if (errStr.includes('not a valid FCM registration token') || errStr.includes('UNREGISTERED') || errStr.includes('INVALID_ARGUMENT')) {
          await db.prepare('UPDATE fcm_device_tokens SET is_active = 0 WHERE device_token = ?').bind(token).run().catch(() => {});
        }
      }
    }
  }

  let webPushSent = 0;
  let webPushFailed = 0;
  const webPushErrors: string[] = [];
  if (webPushSubs.length > 0) {
    const webPayload = {
      notification: { title: opts.title, body: opts.body },
      data: dataPayload,
    };
    for (let i = 0; i < webPushSubs.length; i++) {
      const sub = webPushSubs[i];
      if (!webPushConfigured) {
        webPushFailed++;
        webPushErrors.push('WEB_PUSH_VAPID_PRIVATE_KEY कॉन्फ़िगर नहीं है');
        continue;
      }
      try {
        const r = await sendWebPushNotification(env, { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, webPayload);
        if (r.success) {
          webPushSent++;
        } else {
          webPushFailed++;
          webPushErrors.push(r.error || ('HTTP ' + (r.status || '?')));
          if (r.status === 404 || r.status === 410) {
            await db.prepare('UPDATE web_push_subscriptions SET is_active = 0 WHERE id = ?').bind(sub.id).run().catch(() => {});
          }
        }
      } catch (e: any) {
        webPushFailed++;
        webPushErrors.push(e && e.message ? e.message : String(e));
      }
    }
  }

  const anyPushConfigured = fcmConfigured || webPushConfigured;

  // Email channel (only when the caller requested an email dispatch mode).
  let emailAttempted = 0;
  let emailSent = 0;
  const emailMode = (opts.data && opts.data.emailDispatchMode) || '';
  if (emailMode && emailMode !== 'fcm_only') {
    try {
      const emailResult = await sendBroadcastEmails(db, env, activeSchoolId, targetRole, opts.title, opts.body);
      emailAttempted = emailResult.attempted;
      emailSent = emailResult.sent;
    } catch (e: any) {
      console.error('[broadcast] email dispatch failed:', e && e.message);
    }
  }

  const anySuccess = !!topicResult.success || tokenSuccess > 0 || webPushSent > 0 || emailSent > 0;
  const overallStatus = anyPushConfigured ? (anySuccess ? 'Success' : 'Failed') : 'NotConfigured';
  const fcmMessageId = (topicResult.messageId || topicResult.name || '');

  // TODO(debug): FCM/Web Push सत्यापन पूर्ण होने के बाद यह diag block हटाया जा सकता है।
  const fcmProjectId = getFcmProjectId(env);
  const diag = {
    fcmProjectId: fcmProjectId,
    fcmConfigured: fcmConfigured,
    webPushConfigured: webPushConfigured,
    topic: resolvedTopicKey,
    targetRole: targetRole,
    topicSuccess: !!topicResult.success,
    topicError: topicResult.error || null,
    topicMessageId: fcmMessageId || null,
    deviceCount: allTargetDevices.length,
    webCount: webCount,
    mobileCount: mobileCount,
    directCount: directTokens.length,
    topicDedupCount: tokenSkipped,
    tokenSuccess: tokenSuccess,
    tokenFailed: tokenFailed,
    tokenErrors: tokenErrors.slice(0, 10),
    webPushSubscriptionCount: webPushSubs.length,
    webPushSent: webPushSent,
    webPushFailed: webPushFailed,
    webPushErrors: webPushErrors.slice(0, 10),
    emailAttempted: emailAttempted,
    emailSent: emailSent,
  };
  console.log('[FCM] broadcast diag ' + JSON.stringify(diag));

  const recordId = 'notif-' + Date.now();
  const timestamp = new Date().toISOString();

  let saved = false;
  try {
    await db.prepare(
      'INSERT INTO notifications_log (id, fcm_message_id, title, body, target_topic, recipient_token, delivery_status, payload_data, sent_at, school_id) VALUES (?,?,?,?,?,?,?,?,?,?)'
    ).bind(
      recordId,
      fcmMessageId,
      opts.title,
      opts.body,
      resolvedTopicKey,
      allTargetDevices.length ? (allTargetDevices.length + ' devices') : (webPushSubs.length ? (webPushSubs.length + ' web push') : ''),
      overallStatus,
      JSON.stringify({ schoolId: activeSchoolId, fcmProjectId: fcmProjectId, targetRole: targetRole, topic: resolvedTopicKey, topicSuccess: !!topicResult.success, fcmConfigured: fcmConfigured, webPushConfigured: webPushConfigured, deviceCount: allTargetDevices.length, webCount: webCount, mobileCount: mobileCount, directCount: directTokens.length, topicDedupCount: tokenSkipped, tokenSuccess: tokenSuccess, tokenFailed: tokenFailed, tokenErrors: tokenErrors.slice(0, 5), webPushSubscriptionCount: webPushSubs.length, webPushSent: webPushSent, webPushFailed: webPushFailed, webPushErrors: webPushErrors.slice(0, 5), emailAttempted: emailAttempted, emailSent: emailSent }),
      timestamp,
      activeSchoolId,
    ).run();
    saved = true;
  } catch (e) {
    console.error('notifications_log insert failed', e);
  }

  const baseRecord = {
    id: recordId,
    schoolId: activeSchoolId,
    title: opts.title,
    body: opts.body,
    targetTopic: resolvedTopicKey,
    targetRole: targetRole,
    deliveryStatus: overallStatus,
    sentAt: timestamp,
  };

  if (!saved) {
    return { status: 500, payload: { success: false, message: 'सूचना भेजी गई, किंतु लॉग सहेजने में विफलता हुई।', diag: diag } };
  }

  if (!anyPushConfigured) {
    return {
      status: 503,
      payload: {
        success: false,
        message: 'Firebase या Web Push सूचनाएँ कॉन्फ़िगर नहीं हैं। कृपया FCM_SERVICE_ACCOUNT_JSON या WEB_PUSH_VAPID_PRIVATE_KEY secret सेट करें। (प्रयास लॉग में सहेजा गया)',
        diag: diag,
        record: baseRecord,
      },
    };
  }

  if (!anySuccess) {
    return {
      status: 502,
      payload: {
        success: false,
        message: 'पुश संदेश [' + resolvedTopicKey + '] भेजने में त्रुटि: ' + (topicResult.error || (webPushErrors[0] || 'अज्ञात त्रुटि')),
        diag: diag,
        record: baseRecord,
      },
    };
  }

  return {
    status: 201,
    payload: {
      success: true,
      message: 'अलर्ट [' + resolvedTopicKey + '] भेजा गया — FCM topic ' + (topicResult.success ? 'सफल' : 'N/A') + ', mobile direct ' + tokenSuccess + ', web push ' + webPushSent + '।',
      alertResponse: {
        fcmMessageId: fcmMessageId,
        schoolId: activeSchoolId,
        topic: resolvedTopicKey,
        targetRole: targetRole,
        devices: allTargetDevices.length,
        tokenSuccess: tokenSuccess,
        tokenFailed: tokenFailed,
        webPushSent: webPushSent,
        webPushFailed: webPushFailed,
      },
      diag: diag,
      record: baseRecord,
    },
  };
}

async function broadcastHandler(c: any) {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);

  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);
  // Broadcasts are an admin-level action: only Director/Principal/SuperAdmin may push school-wide alerts.
  if (authUser.role !== 'Director' && authUser.role !== 'Principal' && authUser.role !== 'SuperAdmin') {
    return c.json({ success: false, message: 'केवल निदेशक/प्रधानाचार्य ही स्कूल-व्यापी अलर्ट प्रेषित कर सकते हैं।' }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const title = body.title;
  const messageBody = body.body;
  if (!title || !messageBody) {
    return c.json({ success: false, message: 'शीर्षक और संदेश विवरण आवश्यक हैं।' }, 400);
  }

  // Do NOT trust a body-supplied schoolId (would allow cross-tenant broadcast). SuperAdmin can still
  // target another school via the X-School-Id header, which getRequestSchoolId honors for SuperAdmin.
  const activeSchoolId = getRequestSchoolId(c, authUser);
  const result = await broadcastAlert(db, c.env, {
    title: title,
    body: messageBody,
    schoolId: activeSchoolId,
    topicKey: body.rawTopicKey || body.topic,
    targetRole: body.targetRole,
    priority: body.priority,
    data: body.data,
  });

  return c.json(result.payload, result.status);
}

notificationsApp.get('/topics', async (c) => {
  // SECURITY FIX: this route called getAuthUser() but never rejected a null
  // result, so anyone could enumerate a tenant's FCM topic keys and subscriber
  // counts (and, on a shared worker, the default tenant's).
  const guard = await requireAnyUser(c);
  if (!guard.ok) return guard.response;
  const db = guard.db;
  const schoolId = guard.schoolId;
  const topics = generateSchoolTopics(schoolId);

  let subscriberCounts: Record<string, number> = {};
  if (db) {
    try {
      const rows = await db.prepare('SELECT topic_key, subscriber_count FROM school_fcm_topics WHERE school_id = ?').bind(schoolId).all();
      subscriberCounts = {};
      (rows.results || []).forEach((row: any) => { subscriberCounts[row.topic_key] = row.subscriber_count; });
    } catch (e) {}
  }

  return c.json({
    success: true,
    topics: topics.map((topic: any) => ({
      ...topic,
      schoolId: schoolId,
      subscriberCount: subscriberCounts[topic.topicKey] || 0,
      usageCount: 0,
    })),
  });
});

notificationsApp.get('/history', async (c) => {
  const db = getDB(c);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);
  const schoolId = getRequestSchoolId(c, authUser);
  if (!db) return c.json({ success: false, history: [], message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);

  const result = await db.prepare(
    'SELECT id, fcm_message_id, title, body, target_topic, recipient_token, delivery_status, payload_data, sent_at, school_id FROM notifications_log WHERE school_id = ? ORDER BY sent_at DESC LIMIT 100'
  ).bind(schoolId).all();

  const history = (result.results || []).map((r: any) => ({
    id: r.id,
    fcmMessageId: r.fcm_message_id,
    title: r.title,
    body: r.body,
    targetTopic: r.target_topic,
    recipientToken: r.recipient_token,
    deliveryStatus: r.delivery_status === 'Success' ? 'Delivered' : (r.delivery_status === 'Failed' ? 'Failed' : r.delivery_status),
    payload: r.payload_data ? safeJson(r.payload_data) : null,
    sentAt: r.sent_at,
    schoolId: r.school_id,
  }));

  return c.json({ success: true, history });
});

function safeJson(raw: string): any {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return raw; }
}

notificationsApp.post('/register-token', async (c) => {
  const db = getDB(c);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);
  const body = await c.req.json().catch(() => ({}));
  const token = body.token || body.deviceToken || body.fcmToken;

  if (!token) return c.json({ success: false, message: 'डिवाइस टोकन आवश्यक है।' }, 400);

  // Derive identity from the authenticated session; never trust body-supplied school/role/user
  // (otherwise a caller could register a device under another tenant / spoof a Director role).
  const schoolId = getRequestSchoolId(c, authUser);
  const role = authUser.role || 'Staff';
  const userId = authUser.sub || authUser.id || authUser.userId || 'anonymous';
  const deviceType = body.deviceType || (body.platform === 'flutter' ? 'mobile_app' : 'web');
  const platform = body.platform || (deviceType === 'web' ? 'web' : 'flutter');
  const topics = Array.isArray(body.topics) && body.topics.length > 0
    ? body.topics
    : derivedTopics(schoolId, role);

  const isReal = isRealFcmToken(token);
  const isWebToken = typeof token === 'string' && (token.startsWith('web-') || deviceType === 'web' || platform === 'web');

  // Allow authentic Google FCM tokens AND web client session tokens
  if (!isReal && !isWebToken && String(token).trim().length < 20) {
    return c.json({
      success: false,
      message: 'अमान्य टोकन: केवल Google FCM टोकन या वेब डिवाइस सत्र टोकन ही पंजीकृत किए जा सकते हैं।',
      rejectedTokenPrefix: String(token).slice(0, 20)
    }, 400);
  }

  const subscription = { userId: userId, schoolId: schoolId, role: role, device: deviceType, platform: platform, subscribedTopics: topics };

  if (!db) {
    return c.json({ success: true, message: 'डिवाइस टोकन अनुबंध सहेजा गया (डेटाबेस उपलब्ध नहीं)।', subscription: subscription }, 200);
  }

  // Ensure table exists
  await db.prepare(
    'CREATE TABLE IF NOT EXISTS fcm_device_tokens (' +
    'id TEXT PRIMARY KEY, ' +
    'school_id TEXT NOT NULL, ' +
    'user_id TEXT, ' +
    "role TEXT DEFAULT 'Parents', " +
    'device_token TEXT UNIQUE NOT NULL, ' +
    "device_type TEXT DEFAULT 'mobile_app', " +
    "platform TEXT DEFAULT 'flutter', " +
    "subscribed_topics TEXT DEFAULT '[]', " +
    'is_active INTEGER DEFAULT 1, ' +
    'last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, ' +
    'created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP' +
    ')'
  ).run().catch(() => {});

  const id = isWebToken ? ('web-' + schoolId + '-' + userId) : ('devtok-' + Date.now());
  const now = new Date().toISOString();
  await db.prepare(
    'INSERT INTO fcm_device_tokens (id, school_id, user_id, role, device_token, device_type, platform, subscribed_topics, is_active, last_seen_at, created_at) ' +
    'VALUES (?,?,?,?,?,?,?,?,1,?,?) ' +
    'ON CONFLICT(device_token) DO UPDATE SET school_id=excluded.school_id, user_id=excluded.user_id, role=excluded.role, device_type=excluded.device_type, platform=excluded.platform, subscribed_topics=excluded.subscribed_topics, is_active=1, last_seen_at=excluded.last_seen_at'
  ).bind(id, schoolId, String(userId), role, String(token).trim(), deviceType, platform, JSON.stringify(topics), now, now).run();

  return c.json({
    success: true,
    message: isReal ? 'Google FCM डिवाइस टोकन सफलतापूर्वक पंजीकृत हुआ।' : 'वेब डिवाइस सत्र सफलतापूर्वक पंजीकृत हुआ।',
    deviceType: deviceType,
    subscription: subscription,
  }, 200);
});

/**
 * Register web client session under school tenant for server-side push handling
 */
notificationsApp.post('/register-client', async (c) => {
  const db = getDB(c);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);
  const body = await c.req.json().catch(() => ({}));

  const schoolId = getRequestSchoolId(c, authUser);
  const role = authUser.role || 'Staff';
  const userId = authUser.sub || authUser.id || authUser.userId || 'anonymous';
  const deviceType = body.deviceType || 'web';
  const platform = body.platform || 'web';
  const topics = Array.isArray(body.topics) && body.topics.length > 0
    ? body.topics
    : derivedTopics(schoolId, role);

  const clientToken = 'web-client-' + schoolId + '-' + userId;

  if (db) {
    await db.prepare(
      'CREATE TABLE IF NOT EXISTS fcm_device_tokens (' +
      'id TEXT PRIMARY KEY, ' +
      'school_id TEXT NOT NULL, ' +
      'user_id TEXT, ' +
      "role TEXT DEFAULT 'Parents', " +
      'device_token TEXT UNIQUE NOT NULL, ' +
      "device_type TEXT DEFAULT 'mobile_app', " +
      "platform TEXT DEFAULT 'flutter', " +
      "subscribed_topics TEXT DEFAULT '[]', " +
      'is_active INTEGER DEFAULT 1, ' +
      'last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, ' +
      'created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP' +
      ')'
    ).run().catch(() => {});

    const now = new Date().toISOString();
    await db.prepare(
      'INSERT INTO fcm_device_tokens ' +
      '(id, school_id, user_id, role, device_token, device_type, platform, subscribed_topics, is_active, last_seen_at, created_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?) ' +
      'ON CONFLICT(device_token) DO UPDATE SET ' +
      'school_id = excluded.school_id, ' +
      'user_id = excluded.user_id, ' +
      'role = excluded.role, ' +
      'device_type = excluded.device_type, ' +
      'platform = excluded.platform, ' +
      'subscribed_topics = excluded.subscribed_topics, ' +
      'is_active = 1, ' +
      'last_seen_at = excluded.last_seen_at'
    ).bind('devtok-' + Date.now(), schoolId, String(userId), role, clientToken, deviceType, platform, JSON.stringify(topics), now, now).run().catch(() => {});
  }

  return c.json({
    success: true,
    message: 'वेब क्लाइंट सर्वर-साइड सफलतापूर्वक पंजीकृत हुआ।',
    schoolId,
    clientToken,
    topics,
  });
});

/**
 * Register a real browser PushSubscription (native Web Push) for background delivery.
 */
notificationsApp.post('/register-web-push', async (c) => {
  const db = getDB(c);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);
  const body = await c.req.json().catch(() => ({}));

  const subscription = body.subscription || {};
  const endpoint = subscription.endpoint || body.endpoint;
  const keys = subscription.keys || {};
  const p256dh = keys.p256dh || body.p256dh;
  const auth = keys.auth || body.auth;

  if (!endpoint || !p256dh || !auth) {
    return c.json({ success: false, message: 'PushSubscription (endpoint, p256dh, auth) आवश्यक है।' }, 400);
  }

  const schoolId = getRequestSchoolId(c, authUser);
  const role = authUser.role || 'Staff';
  const userId = authUser.sub || authUser.id || authUser.userId || 'anonymous';
  const topics = Array.isArray(body.topics) && body.topics.length > 0
    ? body.topics
    : derivedTopics(schoolId, role);

  if (!db) {
    return c.json({ success: true, message: 'Web Push subscription सहेजा गया (डेटाबेस उपलब्ध नहीं)।' }, 200);
  }

  await db.prepare(
    'CREATE TABLE IF NOT EXISTS web_push_subscriptions (' +
    'id TEXT PRIMARY KEY, ' +
    'school_id TEXT NOT NULL, ' +
    'user_id TEXT, ' +
    "role TEXT DEFAULT 'Staff', " +
    'endpoint TEXT UNIQUE NOT NULL, ' +
    'p256dh TEXT NOT NULL, ' +
    'auth TEXT NOT NULL, ' +
    "subscribed_topics TEXT DEFAULT '[]', " +
    'is_active INTEGER DEFAULT 1, ' +
    'last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, ' +
    'created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP' +
    ')'
  ).run().catch(() => {});

  const now = new Date().toISOString();
  const id = 'webpush-' + schoolId + '-' + String(userId) + '-' + Date.now();
  await db.prepare(
    'INSERT INTO web_push_subscriptions ' +
    '(id, school_id, user_id, role, endpoint, p256dh, auth, subscribed_topics, is_active, last_seen_at, created_at) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?) ' +
    'ON CONFLICT(endpoint) DO UPDATE SET ' +
    'school_id = excluded.school_id, ' +
    'user_id = excluded.user_id, ' +
    'role = excluded.role, ' +
    'p256dh = excluded.p256dh, ' +
    'auth = excluded.auth, ' +
    'subscribed_topics = excluded.subscribed_topics, ' +
    'is_active = 1, ' +
    'last_seen_at = excluded.last_seen_at'
  ).bind(id, schoolId, String(userId), role, String(endpoint), String(p256dh), String(auth), JSON.stringify(topics), now, now).run();

  return c.json({ success: true, message: 'Web Push subscription सफलतापूर्वक पंजीकृत हुआ।', endpoint: String(endpoint), topics }, 200);
});

/**
 * Get registered devices summary for a school
 */
notificationsApp.get('/devices', async (c) => {
  const db = getDB(c);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);
  if (authUser.role !== 'Director' && authUser.role !== 'Principal' && authUser.role !== 'SuperAdmin') {
    return c.json({ success: false, message: 'अनधिकृत पहुँच।' }, 403);
  }
  const schoolId = getRequestSchoolId(c, authUser);

  if (!db) {
    return c.json({ success: true, schoolId, totalCount: 0, webCount: 0, mobileCount: 0, devices: [] });
  }

  try {
    const rows = await db.prepare(
      'SELECT id, school_id, user_id, role, device_token, device_type, platform, subscribed_topics, is_active, last_seen_at, created_at FROM fcm_device_tokens WHERE school_id = ? AND is_active = 1 ORDER BY last_seen_at DESC'
    ).bind(schoolId).all();

    const devices = rows.results || [];
    return c.json({
      success: true,
      schoolId: schoolId,
      totalCount: devices.length,
      webCount: devices.filter((d: any) => d.device_type === 'web').length,
      mobileCount: devices.filter((d: any) => d.device_type !== 'web').length,
      devices: devices.map((d: any) => ({
        id: d.id,
        userId: d.user_id,
        role: d.role,
        deviceType: d.device_type,
        platform: d.platform,
        hasRealFcmToken: isRealFcmToken(d.device_token),
        tokenSnippet: d.device_token ? String(d.device_token).slice(0, 15) + '...' : '',
        lastSeenAt: d.last_seen_at,
      })),
    });
  } catch (e: any) {
    return c.json({ success: true, schoolId, totalCount: 0, webCount: 0, mobileCount: 0, devices: [] });
  }
});

notificationsApp.post('/broadcast', broadcastHandler);
notificationsApp.post('/fcm-broadcast', broadcastHandler);

export default notificationsApp;
