import { Hono } from 'hono';
import { isFcmConfigured, sendFcmMessage, type FcmMessage, type FcmSendResult } from '../lib/fcm';

const app = new Hono<{ Bindings: any }>();

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
  try {
    const { userId, deviceInfo, fcmToken } = await c.req.json();

    if (!userId) {
      return c.json({ error: 'userId required' }, 400);
    }

    // Generate device token
    const deviceToken = fcmToken || `web-device-${userId}-${Date.now()}`;

    // Check if DB exists
    if (!c.env.DB) {
      // Fallback: Return token without DB storage
      console.warn('DB not configured - token generated but not stored');
      return c.json({
        success: true,
        token: deviceToken,
        message: 'Token generated (DB not configured)',
        serverSide: true,
        warning: 'Token not persisted - DB binding missing'
      });
    }

    // Check FCM configured hai ya nahi
    if (!isFcmConfigured(c.env)) {
      return c.json({ 
        error: 'FCM not configured on server', 
        hint: 'Set FCM_SERVICE_ACCOUNT_JSON secret in Cloudflare Workers'
      }, 500);
    }

    try {
      // Store token in database
      const db = c.env.DB;
      
      // Check if token already exists
      const existing = await db.prepare(`
        SELECT id FROM user_notification_tokens 
        WHERE user_id = ? AND device_token = ?
      `).bind(userId, deviceToken).first();

      if (!existing) {
        // Insert new token
        const result = await db.prepare(`
          INSERT INTO user_notification_tokens 
          (user_id, device_token, platform, device_info, created_at, updated_at)
          VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
        `).bind(
          userId,
          deviceToken,
          'web',
          JSON.stringify(deviceInfo || {})
        ).run();

        if (!result.success) {
          throw new Error('Database insert failed');
        }
      } else {
        // Update existing token
        await db.prepare(`
          UPDATE user_notification_tokens 
          SET updated_at = datetime('now'),
              device_info = ?
          WHERE user_id = ? AND device_token = ?
        `).bind(
          JSON.stringify(deviceInfo || {}),
          userId,
          deviceToken
        ).run();
      }

      return c.json({
        success: true,
        token: deviceToken,
        message: 'Token registered successfully',
        serverSide: true
      });

    } catch (dbError: any) {
      // Database error - still return token for user
      console.error('Database error (non-fatal):', dbError);
      
      return c.json({
        success: true,
        token: deviceToken,
        message: 'Token generated (DB error)',
        serverSide: true,
        warning: 'Database storage failed - token may not persist',
        dbError: dbError.message
      });
    }

  } catch (error: any) {
    console.error('Token registration error:', error);
    return c.json({ 
      error: 'Token registration failed', 
      details: error.message,
      stack: error.stack
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
        hint: 'Add FCM_SERVICE_ACCOUNT_JSON secret'
      }, 500);
    }

    // Get user tokens from database
    const db = c.env.DB;
    const tokens = await db.prepare(`
      SELECT device_token FROM user_notification_tokens 
      WHERE user_id = ? AND platform = 'web'
      ORDER BY updated_at DESC
      LIMIT 5
    `).bind(userId).all();

    if (!tokens.results || tokens.results.length === 0) {
      return c.json({ 
        error: 'No tokens found for user',
        userId 
      }, 404);
    }

    // Send test notification to all tokens
    const results: FcmSendResult[] = [];
    
    for (const row of tokens.results) {
      const message: FcmMessage = {
        token: row.device_token as string,
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
