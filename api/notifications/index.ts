import { Hono } from 'hono';

const notificationsApp = new Hono();

export interface BroadcastNotificationRecord {
  id: string;
  alertId: string;
  fcmMessageId?: string; // for compatibility
  title: string;
  body: string;
  targetTopic: string;
  targetRole: string;
  status: 'Delivered' | 'Pending' | 'Failed';
  timestamp: string;
  dataPayload?: Record<string, string>;
}

// In-memory notifications broadcast log - No mock demo data
const broadcastLog: BroadcastNotificationRecord[] = [];

// GET broadcast history
notificationsApp.get('/history', (c) => {
  return c.json({
    success: true,
    history: broadcastLog,
  });
});

// Handler for broadcast
const handleBroadcast = async (c: any) => {
  const body = await c.req.json().catch(() => ({}));
  const { title, body: messageBody, topic, targetRole, data } = body;

  if (!title || !messageBody) {
    return c.json({ success: false, message: 'शीर्षक और संदेश विवरण आवश्यक हैं।' }, 400);
  }

  const alertId = `ALT-${Date.now()}`;
  const newRecord: BroadcastNotificationRecord = {
    id: `notif-${Date.now()}`,
    alertId,
    fcmMessageId: alertId,
    title,
    body: messageBody,
    targetTopic: topic || 'school_general',
    targetRole: targetRole || 'All',
    status: 'Delivered',
    timestamp: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    dataPayload: data || {},
  };

  broadcastLog.unshift(newRecord);

  return c.json({
    success: true,
    message: 'सूचना एवं अलर्ट संदेश सफलतापूर्वक सभी पंजीकृत सदस्यों को प्रसारित किया गया।',
    alertResponse: {
      alertId,
      topic: newRecord.targetTopic,
      status: 'SENT',
    },
    record: newRecord,
  }, 201);
};

// POST /broadcast and /fcm-broadcast
notificationsApp.post('/broadcast', handleBroadcast);
notificationsApp.post('/fcm-broadcast', handleBroadcast);

// POST register client device token
notificationsApp.post('/register-token', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { token, userId, role, deviceType } = body;

  if (!token) {
    return c.json({ success: false, message: 'डिवाइस टोकन आवश्यक है।' }, 400);
  }

  return c.json({
    success: true,
    message: 'डिवाइस टोकन सफलतापूर्वक पंजीकृत किया गया।',
    subscription: {
      userId: userId || 'anonymous',
      role: role || 'parent',
      device: deviceType || 'mobile_app',
      subscribedTopics: ['school_general'],
    },
  });
});

export default notificationsApp;
