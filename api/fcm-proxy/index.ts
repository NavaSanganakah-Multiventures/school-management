import { Hono } from 'hono';
import { isFcmConfigured, sendFcmMessage, type FcmMessage, type FcmSendResult } from '../lib/fcm';

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

    const { userId, deviceInfo, fcmToken } = requestBody;

    if (!userId) {
      console.error('[FCM] Missing userId in request');
      return c.json({ error: 'userId required' }, 400);
    }

    console.log('[FCM] Processing for userId:', userId);

    // Generate device token
    const deviceToken = fcmToken || `web-device-${userId}-${Date.now()}`;
    console.log('[FCM] Generated device token:', deviceToken);

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
    
    if (!fcmConfigured) {
      console.error('[FCM] FCM not configured on server');
      return c.json({ 
        error: 'FCM not configured on server', 
        hint: 'Set FCM_SERVICE_ACCOUNT_JSON secret in Cloudflare Workers'
      }, 500);
    }

    console.log('[FCM] Attempting to store token in database...');

    try {
      // Store token in database
      const db = c.env.DB;
      
      // Check if token already exists
      console.log('[FCM] Checking for existing token...');
      const existing = await db.prepare(`
        SELECT id FROM user_notification_tokens 
        WHERE user_id = ? AND device_token = ?
      `).bind(userId, deviceToken).first();

      if (!existing) {
        console.log('[FCM] Inserting new token...');
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
          userId,
          deviceToken
        ).run();
      }

      console.log('[FCM] Token successfully stored in database');

      return c.json({
        success: true,
        token: deviceToken,
        message: 'Token registered successfully',
        serverSide: true
      });

    } catch (dbError: any) {
      // Database error - still return token for user
      console.error('[FCM] Database error (non-fatal):', dbError.message, dbError.stack);
      
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
