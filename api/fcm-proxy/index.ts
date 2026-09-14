import { Hono } from 'hono';
import { isFcmConfigured, sendFcmMessage, isRealFcmToken, type FcmMessage, type FcmSendResult } from '../lib/fcm';

const app = new Hono<{ Bindings: any }>();

/**
 * Simple test endpoint to verify API is working
 */
app.get('/ping', async (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: 'FCM Proxy API is working'
  });
});

/**
 * Web Push Token Registration - Server-Side Approach for Cloudflare Workers
 * 
 * Client sends: { userId, deviceInfo }
 * Server generates: unique device token
 * Server stores: in D1 database
 * Server returns: { token, success }
 * 
 * This bypasses CORS issues on workers.dev by using server-side token management
 */
app.post('/register-token', async (c) => {
  // Log incoming request
  console.log('[FCM] Register token request received');
  
  try {
    // Parse request body
    let requestBody;
    try {
      requestBody = await c.req.json();
      console.log('[FCM] Request body:', JSON.stringify(requestBody));
    } catch (parseError: any) {
      console.error('[FCM] Failed to parse request body:', parseError);
      return c.json({ 
        error: 'Invalid JSON in request body',
        details: parseError.message 
      }, 400);
    }

    const { userId, deviceInfo } = requestBody;
    const rawToken = requestBody.fcmToken || requestBody.token || requestBody.deviceToken;
    const schoolId = requestBody.schoolId || 'school-01';
    const role = requestBody.role || 'Staff';
    const deviceType = requestBody.deviceType || (requestBody.platform === 'flutter' ? 'mobile_app' : 'web');
    const platform = requestBody.platform || (deviceType === 'web' ? 'web' : 'flutter');
    const topics = Array.isArray(requestBody.topics) && requestBody.topics.length > 0
      ? requestBody.topics
      : ['school_' + schoolId + '_all'];

    if (!userId) {
      console.error('[FCM] Missing userId in request');
      return c.json({ error: 'userId required' }, 400);
    }

    console.log('[FCM] Processing for userId:', userId, 'schoolId:', schoolId);

    // Determine device token
    const hasRealToken = isRealFcmToken(rawToken);
    const deviceToken = hasRealToken ? rawToken : (rawToken || `web-device-${userId}-${Date.now()}`);
    console.log('[FCM] Device token:', deviceToken, 'isRealFCM:', hasRealToken);

    // Check if DB exists
    if (!c.env.DB) {
      console.warn('[FCM] DB not configured - returning token without storage');
      return c.json({
        success: true,
        token: deviceToken,
        message: 'Token generated (DB not configured)',
        serverSide: true,
        warning: 'Token not persisted - DB binding missing'
      });
    }

    console.log('[FCM] DB binding found, checking FCM configuration...');

    // Check FCM configured
    const fcmConfigured = isFcmConfigured(c.env);
    console.log('[FCM] FCM configured:', fcmConfigured);

    console.log('[FCM] Attempting to store token in database...');

    try {
      // Store token in database
      const db = c.env.DB;
      
      // Auto-create table if missing so no DB error occurs
      await db.prepare(`
        CREATE TABLE IF NOT EXISTS user_notification_tokens (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          device_token TEXT NOT NULL,
          platform TEXT NOT NULL DEFAULT 'web',
          device_info TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, device_token)
        )
      `).run().catch((e: any) => {
        console.warn('[FCM] Table check:', e.message);
      });

      // Check if token already exists
      console.log('[FCM] Checking for existing token...');
      const existing = await db.prepare(`
        SELECT id FROM user_notification_tokens 
        WHERE user_id = ? AND device_token = ?
      `).bind(String(userId), deviceToken).first();

      if (!existing) {
        console.log('[FCM] Inserting new token...');
        const result = await db.prepare(`
          INSERT INTO user_notification_tokens 
          (user_id, device_token, platform, device_info, created_at, updated_at)
          VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
        `).bind(
          String(userId),
          deviceToken,
          'web',
          JSON.stringify(deviceInfo || {})
        ).run();

        console.log('[FCM] Insert result:', result.success);

        if (!result.success) {
          throw new Error('Database insert failed');
        }
      } else {
        console.log('[FCM] Updating existing token...');
        await db.prepare(`
          UPDATE user_notification_tokens 
          SET updated_at = datetime('now'),
              device_info = ?
          WHERE user_id = ? AND device_token = ?
        `).bind(
          JSON.stringify(deviceInfo || {}),
          String(userId),
          deviceToken
        ).run();
      }

      // Also sync to fcm_device_tokens table if genuine FCM token
      if (hasRealToken) {
        try {
          const id = 'devtok-' + Date.now();
          const now = new Date().toISOString();
          await db.prepare(`
            CREATE TABLE IF NOT EXISTS fcm_device_tokens (
              id TEXT PRIMARY KEY,
              school_id TEXT NOT NULL,
              user_id TEXT,
              role TEXT DEFAULT 'Parents',
              device_token TEXT UNIQUE NOT NULL,
              device_type TEXT DEFAULT 'mobile_app',
              platform TEXT DEFAULT 'flutter',
              subscribed_topics TEXT DEFAULT '[]',
              is_active INTEGER DEFAULT 1,
              last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
          `).run().catch(() => {});

          await db.prepare(`
            INSERT INTO fcm_device_tokens 
            (id, school_id, user_id, role, device_token, device_type, platform, subscribed_topics, is_active, last_seen_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
            ON CONFLICT(device_token) DO UPDATE SET 
              school_id = excluded.school_id,
              user_id = excluded.user_id,
              role = excluded.role,
              device_type = excluded.device_type,
              platform = excluded.platform,
              subscribed_topics = excluded.subscribed_topics,
              is_active = 1,
              last_seen_at = excluded.last_seen_at
          `).bind(id, schoolId, String(userId), role, deviceToken, deviceType, platform, JSON.stringify(topics), now, now).run();
          console.log('[FCM] Token stored in fcm_device_tokens for school:', schoolId);
        } catch (syncErr: any) {
          console.log('[FCM] fcm_device_tokens sync skipped:', syncErr.message);
        }
      }

      console.log('[FCM] Token successfully stored in database');

      return c.json({
        success: true,
        token: deviceToken,
        message: 'Token registered successfully',
        serverSide: true,
        fcmConfigured
      });

    } catch (dbError: any) {
      // Database error - still return token for user
      console.error('[FCM] Database error (non-fatal):', dbError.message, dbError.stack);
      
      return c.json({
        success: true,
        token: deviceToken,
        message: 'Token generated (DB error)',
        serverSide: true,
        fcmConfigured,
        warning: 'Database storage fallback active',
        dbError: dbError.message
      });
    }

  } catch (error: any) {
    console.error('[FCM] Token registration error:', error.message);
    console.error('[FCM] Stack trace:', error.stack);
    console.error('[FCM] Error details:', JSON.stringify(error));
    
    return c.json({ 
      error: 'Token registration failed', 
      details: error.message,
      stack: error.stack,
      type: error.constructor.name
    }, 500);
  }
});

/**
 * Test notification endpoint
 * Sends test push notification to verify FCM working
 */
app.post('/test-notification', async (c) => {
  try {
    const { userId, title, body } = await c.req.json();

    if (!userId) {
      return c.json({ error: 'userId required' }, 400);
    }

    if (!isFcmConfigured(c.env)) {
      return c.json({ 
        error: 'FCM not configured',
        hint: 'Add FCM_SERVICE_ACCOUNT_JSON secret in Cloudflare Workers'
      }, 500);
    }

    // Get user tokens from database
    const db = c.env.DB;
    let tokens: any = await db.prepare(`
      SELECT device_token FROM user_notification_tokens 
      WHERE user_id = ? AND platform = 'web'
      ORDER BY updated_at DESC
      LIMIT 5
    `).bind(String(userId)).all().catch(() => ({ results: [] }));

    if (!tokens.results || tokens.results.length === 0) {
      tokens = await db.prepare(`
        SELECT device_token FROM fcm_device_tokens 
        WHERE user_id = ? AND is_active = 1
        ORDER BY last_seen_at DESC
        LIMIT 5
      `).bind(String(userId)).all().catch(() => ({ results: [] }));
    }

    const realTokens = (tokens.results || [])
      .map((r: any) => r.device_token as string)
      .filter((t: string) => isRealFcmToken(t));

    // If no direct real device tokens exist, test via school topic broadcast
    if (realTokens.length === 0) {
      const testTopic = 'school_school-01_all';
      const topicMsg: FcmMessage = {
        topic: testTopic,
        notification: {
          title: title || '🔔 Test Notification (Topic Test)',
          body: body || 'सर्वर-साइड FCM प्रमाणीकरण एवं ब्रॉडकास्ट सफल है!'
        },
        data: {
          test: 'true',
          userId: String(userId),
          timestamp: new Date().toISOString()
        }
      };

      const topicResult = await sendFcmMessage(c.env, topicMsg);
      return c.json({
        success: topicResult.success,
        mode: 'topic_broadcast',
        topic: testTopic,
        topicResult,
        message: topicResult.success
          ? 'FCM सर्वर-साइड टोकन व प्रमाणीकरण सत्यापित: टॉपिक संदेश सफलतापूर्वक प्रेषित।'
          : ('FCM प्रेषण त्रुटि: ' + (topicResult.error || 'अज्ञात त्रुटि')),
        totalSent: topicResult.success ? 1 : 0,
        totalFailed: topicResult.success ? 0 : 1
      });
    }

    // Send test notification to all real tokens
    const results: FcmSendResult[] = [];
    
    for (const token of realTokens) {
      const message: FcmMessage = {
        token: token,
        notification: {
          title: title || '🔔 Test Notification',
          body: body || 'यह एक test notification है। FCM working properly है!'
        },
        webpush: {
          fcmOptions: {
            link: c.env.APP_BASE_URL || 'https://pragnya.navasanganakah.com'
          }
        }
      };

      const result = await sendFcmMessage(c.env, message);
      results.push(result);
    }

    return c.json({
      success: true,
      results,
      totalSent: results.filter(r => r.success).length,
      totalFailed: results.filter(r => !r.success).length
    });

  } catch (error: any) {
    console.error('Test notification error:', error);
    return c.json({ 
      error: 'Failed to send test notification', 
      details: error.message 
    }, 500);
  }
});

/**
 * Get FCM configuration status
 */
app.get('/status', async (c) => {
  const configured = isFcmConfigured(c.env);
  
  return c.json({
    fcmConfigured: configured,
    environment: c.env.ENVIRONMENT || 'unknown',
    serverSideFcm: true,
    cors: 'bypassed via server-side implementation',
    platform: 'Cloudflare Workers'
  });
});

export default app;
