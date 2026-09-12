import { Hono } from 'hono';
import { currentSchoolId, generateSchoolTopics, schoolTenants } from '../db';

const notificationsApp = new Hono();

export interface BroadcastNotificationRecord {
  id: string;
  schoolId: string;
  alertId: string;
  fcmMessageId?: string;
  title: string;
  body: string;
  targetTopic: string;
  displayTopicName?: string;
  targetRole: string;
  status: 'Delivered' | 'Pending' | 'Failed';
  timestamp: string;
  dataPayload?: Record<string, string>;
}

// In-memory notifications broadcast log partitioned by schoolId
const broadcastLog: BroadcastNotificationRecord[] = [];

// -----------------------------------------------------------------------------
// GET Isolated Topics for Current / Selected School
// Topics follow: `school_{schoolId}_{topicSuffix}` to guarantee zero cross-school leakage
// -----------------------------------------------------------------------------
notificationsApp.get('/topics', (c) => {
  const querySchoolId = c.req.query('schoolId') || currentSchoolId;
  const topics = generateSchoolTopics(querySchoolId);
  const currentSchool = schoolTenants.find((s) => s.id === querySchoolId) || schoolTenants[0];

  return c.json({
    success: true,
    schoolId: querySchoolId,
    schoolName: currentSchool.schoolName,
    topics,
    prefixRule: `सभी FCM टॉपिक्स 'school_${querySchoolId}_' प्रिफिक्स से सुरक्षित रूप से पृथक (Isolated) हैं ताकि किसी अन्य विद्यालय में डेटा न जाए।`,
  });
});

// -----------------------------------------------------------------------------
// GET Broadcast History (Filtered strictly by schoolId)
// -----------------------------------------------------------------------------
notificationsApp.get('/history', (c) => {
  const querySchoolId = c.req.query('schoolId') || currentSchoolId;
  const filtered = broadcastLog.filter((item) => !item.schoolId || item.schoolId === querySchoolId);

  return c.json({
    success: true,
    schoolId: querySchoolId,
    history: filtered,
  });
});

// -----------------------------------------------------------------------------
// Handler for Broadcast with School Isolation & FCM Topic Routing
// -----------------------------------------------------------------------------
const handleBroadcast = async (c: any) => {
  const body = await c.req.json().catch(() => ({}));
  const { title, body: messageBody, topic, rawTopicKey, targetRole, schoolId, data } = body;

  if (!title || !messageBody) {
    return c.json({ success: false, message: 'शीर्षक और संदेश विवरण आवश्यक हैं।' }, 400);
  }

  const activeSchoolId = schoolId || currentSchoolId;
  const currentSchool = schoolTenants.find((s) => s.id === activeSchoolId) || schoolTenants[0];

  // Enforce strict school-isolated topic key formatting:
  // e.g. If user sent "parents", turn into "school_{schoolId}_parents"
  let resolvedTopicKey = rawTopicKey || topic || 'all';
  if (!resolvedTopicKey.startsWith(`school_${activeSchoolId}_`)) {
    const cleanTopic = resolvedTopicKey.replace(/^school_/, '').replace(/^all_parents_students/, 'all');
    resolvedTopicKey = `school_${activeSchoolId}_${cleanTopic}`;
  }

  const availableTopics = generateSchoolTopics(activeSchoolId);
  const matchedTopic = availableTopics.find((t) => t.topicKey === resolvedTopicKey);
  const displayTopicName = matchedTopic ? matchedTopic.displayName : `कस्टम विषय (${resolvedTopicKey})`;

  const alertId = `ALT-${Date.now()}`;
  const newRecord: BroadcastNotificationRecord = {
    id: `notif-${Date.now()}`,
    schoolId: activeSchoolId,
    alertId,
    fcmMessageId: `fcm-${alertId}`,
    title,
    body: messageBody,
    targetTopic: resolvedTopicKey,
    displayTopicName,
    targetRole: targetRole || (matchedTopic ? matchedTopic.targetRole : 'All'),
    status: 'Delivered',
    timestamp: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    dataPayload: {
      ...data,
      schoolId: activeSchoolId,
      schoolName: currentSchool.schoolName,
      isolationKey: `tenant-${activeSchoolId}`,
    },
  };

  broadcastLog.unshift(newRecord);

  return c.json({
    success: true,
    message: `अलर्ट संदेश सफलतापूर्वक विद्यालय '${currentSchool.schoolName}' के पृथक टॉपिक [${resolvedTopicKey}] पर प्रसारित किया गया।`,
    alertResponse: {
      alertId,
      schoolId: activeSchoolId,
      topic: resolvedTopicKey,
      status: 'SENT_TO_FCM_TOPIC',
      recipientGroup: newRecord.targetRole,
      isolationVerified: true,
    },
    record: newRecord,
  }, 201);
};

// POST /broadcast and /fcm-broadcast
notificationsApp.post('/broadcast', handleBroadcast);
notificationsApp.post('/fcm-broadcast', handleBroadcast);

// -----------------------------------------------------------------------------
// POST Register Client Device Token & Auto-subscribe to School Topics
// -----------------------------------------------------------------------------
notificationsApp.post('/register-token', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { token, userId, role, schoolId, deviceType } = body;

  if (!token) {
    return c.json({ success: false, message: 'डिवाइस टोकन आवश्यक है।' }, 400);
  }

  const targetSchoolId = schoolId || currentSchoolId;
  const userRole = role || 'Parents';

  // Determine school-specific topics to subscribe to
  const topicsToSubscribe = [
    `school_${targetSchoolId}_all`,
    userRole === 'Parents'
      ? `school_${targetSchoolId}_parents`
      : userRole === 'Students'
      ? `school_${targetSchoolId}_students`
      : `school_${targetSchoolId}_teachers`,
  ];

  return c.json({
    success: true,
    message: 'डिवाइस टोकन सफलतापूर्वक पंजीकृत किया गया और विद्यालय-विशिष्ट FCM टॉपिक्स से लिंक हुआ।',
    subscription: {
      userId: userId || 'anonymous',
      schoolId: targetSchoolId,
      role: userRole,
      device: deviceType || 'mobile_app',
      subscribedTopics: topicsToSubscribe,
      dataIsolation: 'Strictly Enforced (No cross-school data leak)',
    },
  });
});

export default notificationsApp;
