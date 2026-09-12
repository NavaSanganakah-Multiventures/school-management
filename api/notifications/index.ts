import { Hono } from 'hono';
import { getDB, generateSchoolTopics } from '../db';
import { getAuthUser, getRequestSchoolId } from '../lib/auth';
import {
  buildTokenMessage,
  buildTopicMessage,
  isFcmConfigured,
  sendFcmMessage,
} from '../lib/fcm';

const notificationsApp = new Hono();

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

function roleInTarget(targetRole: string, deviceRole: string): boolean {
  const t = String(targetRole || 'All');
  if (t === 'All') return true;
  const d = String(deviceRole || '');
  if (t === 'Teachers') return WEB_STAFF_ROLES.indexOf(d) >= 0;
  return d === t;
}

async function broadcastHandler(c: any) {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);

  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);

  const body = await c.req.json().catch(() => ({}));
  const title = body.title;
  const messageBody = body.body;
  if (!title || !messageBody) {
    return c.json({ success: false, message: 'शीर्षक और संदेश विवरण आवश्यक हैं।' }, 400);
  }

  const activeSchoolId = body.schoolId || getRequestSchoolId(c, authUser);
  const availableTopics = generateSchoolTopics(activeSchoolId);

  let resolvedTopicKey = body.rawTopicKey || body.topic || 'school_' + activeSchoolId + '_all';
  const prefix = 'school_' + activeSchoolId + '_';
  if (resolvedTopicKey.indexOf(prefix) !== 0) {
    let clean = String(resolvedTopicKey);
    if (clean.indexOf('school_') === 0) clean = clean.slice('school_'.length);
    if (clean === 'all_parents_students') clean = 'all';
    resolvedTopicKey = prefix + clean;
  }
  const matchedTopic = availableTopics.find((t: any) => t.topicKey === resolvedTopicKey);
  const targetRole = matchedTopic ? matchedTopic.targetRole : (body.targetRole || 'All');
  const priority = (body.data && body.data.priority) ? body.data.priority : (body.priority || 'high');

  if (!isFcmConfigured(c.env)) {
    return c.json({
      success: false,
      message: 'Firebase पुश सूचनाएँ कॉन्फ़िगर नहीं हैं। कृपया FCM_SERVICE_ACCOUNT_JSON secret सेट करें।',
    }, 503);
  }

  const dataPayload: Record<string, any> = Object.assign({}, body.data || {}, {
    schoolId: activeSchoolId,
    tenantId: activeSchoolId,
    targetRole: targetRole,
    priority: priority,
  });

  let topicResult;
  try {
    topicResult = await sendFcmMessage(c.env, buildTopicMessage(resolvedTopicKey, title, messageBody, dataPayload, priority));
  } catch (e: any) {
    topicResult = { success: false, error: e && e.message ? e.message : String(e) };
  }

  let webTokens: string[] = [];
  try {
    const rows = await db.prepare(
      "SELECT device_token, role FROM fcm_device_tokens WHERE school_id = ? AND device_type = 'web' AND is_active = 1"
    ).bind(activeSchoolId).all();
    webTokens = (rows.results || []).filter((r: any) => roleInTarget(targetRole, r.role)).map((r: any) => r.device_token as string);
  } catch (e) {
    webTokens = [];
  }

  let webSuccess = 0;
  let webFailed = 0;
  const webErrors: string[] = [];
  for (let i = 0; i < webTokens.length; i++) {
    const token = webTokens[i];
    try {
      const r = await sendFcmMessage(c.env, buildTokenMessage(token, title, messageBody, dataPayload, priority));
      if (r.success) webSuccess++;
      else { webFailed++; webErrors.push('token: ' + (r.error || 'unknown')); }
    } catch (e: any) {
      webFailed++;
      webErrors.push('token: ' + (e && e.message ? e.message : String(e)));
    }
  }

  const overallSuccess = !!topicResult.success;
  const fcmMessageId = (topicResult.messageId || topicResult.name || '');
  const recordId = 'notif-' + Date.now();
  const timestamp = new Date().toISOString();

  try {
    await db.prepare(
      'INSERT INTO notifications_log (id, fcm_message_id, title, body, target_topic, recipient_token, delivery_status, payload_data, sent_at, school_id) VALUES (?,?,?,?,?,?,?,?,?,?)'
    ).bind(
      recordId,
      fcmMessageId,
      title,
      messageBody,
      resolvedTopicKey,
      webTokens.length ? (webTokens.length + ' web devices') : '',
      overallSuccess ? 'Success' : 'Failed',
      JSON.stringify({ schoolId: activeSchoolId, targetRole: targetRole, topic: resolvedTopicKey, topicSuccess: overallSuccess, webDevices: webTokens.length, webSuccess: webSuccess, webFailed: webFailed, webErrors: webErrors.slice(0, 5) }),
      timestamp,
      activeSchoolId,
    ).run();
  } catch (e) {
    console.error('notifications_log insert failed', e);
  }

  if (!overallSuccess) {
    return c.json({
      success: false,
      message: 'FCM टॉपिक [' + resolvedTopicKey + '] पर संदेश भेजने में त्रुटि: ' + (topicResult.error || 'अज्ञात त्रुटि'),
    }, 502);
  }

  return c.json({
    success: true,
    message: 'अलर्ट टॉपिक [' + resolvedTopicKey + '] पर भेजा गया' + (webTokens.length ? (' तथा ' + webSuccess + ' वेब डिवाइस को प्रेषित हुआ।') : '।'),
    alertResponse: {
      fcmMessageId: fcmMessageId,
      schoolId: activeSchoolId,
      topic: resolvedTopicKey,
      targetRole: targetRole,
      webDevices: webTokens.length,
      webSuccess: webSuccess,
      webFailed: webFailed,
    },
    record: {
      id: recordId,
      schoolId: activeSchoolId,
      title: title,
      body: messageBody,
      targetTopic: resolvedTopicKey,
      targetRole: targetRole,
      deliveryStatus: 'Success',
      sentAt: timestamp,
    },
  }, 201);
}

notificationsApp.get('/topics', async (c) => {
  const db = getDB(c);
  const authUser = await getAuthUser(c);
  const schoolId = getRequestSchoolId(c, authUser);
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
  const body = await c.req.json().catch(() => ({}));
  const token = body.token;

  if (!token) return c.json({ success: false, message: 'डिवाइस टोकन आवश्यक है।' }, 400);

  const schoolId = body.schoolId || getRequestSchoolId(c, authUser);
  const role = body.role || (authUser && authUser.role) || 'Parents';
  const userId = body.userId || (authUser && (authUser.sub || authUser.id || authUser.userId)) || 'anonymous';
  const deviceType = body.deviceType || 'mobile_app';
  const platform = body.platform || (deviceType === 'web' ? 'web' : 'flutter');
  const topics = (body.topics && Array.isArray(body.topics) && body.topics.length) ? body.topics : derivedTopics(schoolId, role);

  const subscription = { userId: userId, schoolId: schoolId, role: role, device: deviceType, platform: platform, subscribedTopics: topics };

  if (!db) {
    return c.json({ success: true, message: 'डिवाइस टोकन पंजीकरण अनुबंध सहेजा गया (डेटाबेस उपलब्ध नहीं)।', subscription: subscription }, 201);
  }

  const id = 'devtok-' + Date.now();
  const now = new Date().toISOString();
  await db.prepare(
    'INSERT INTO fcm_device_tokens (id, school_id, user_id, role, device_token, device_type, platform, subscribed_topics, is_active, last_seen_at, created_at) ' +
    'VALUES (?,?,?,?,?,?,?,?,1,?,?) ' +
    'ON CONFLICT(device_token) DO UPDATE SET school_id=excluded.school_id, user_id=excluded.user_id, role=excluded.role, device_type=excluded.device_type, platform=excluded.platform, subscribed_topics=excluded.subscribed_topics, is_active=1, last_seen_at=excluded.last_seen_at'
  ).bind(id, schoolId, userId, role, token, deviceType, platform, JSON.stringify(topics), now, now).run();

  return c.json({ success: true, message: 'डिवाइस टोकन सफलतापूर्वक पंजीकृत हुआ।', subscription: subscription }, 201);
});

notificationsApp.post('/broadcast', broadcastHandler);
notificationsApp.post('/fcm-broadcast', broadcastHandler);

export default notificationsApp;
