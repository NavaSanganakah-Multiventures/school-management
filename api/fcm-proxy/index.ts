import { Hono } from 'hono';

const app = new Hono<{ Bindings: any }>();

/**
 * Proxy endpoint for Firebase FCM token registration
 * Bypasses CORS issues on Cloudflare Workers by proxying through backend
 */
app.post('/register-token', async (c) => {
  try {
    const body = await c.req.json();
    const { vapidKey, firebaseConfig } = body;

    if (!vapidKey || !firebaseConfig) {
      return c.json({ error: 'Missing vapidKey or firebaseConfig' }, 400);
    }

    // This endpoint will be called from frontend with service worker registration
    // and will proxy the token registration to Firebase
    
    // For now, we'll return a guidance response
    // The actual implementation would use Firebase Admin SDK on the backend
    
    return c.json({
      success: true,
      message: 'Token registration proxy endpoint - implement with Firebase Admin SDK',
      guidance: {
        step1: 'Install firebase-admin in your backend',
        step2: 'Use getMessaging().send() to send notifications',
        step3: 'Store tokens in D1 database',
        workaround: 'For now, use server-side Firebase Admin SDK for all FCM operations'
      }
    });

  } catch (error: any) {
    return c.json({ 
      error: 'Token registration failed', 
      details: error.message 
    }, 500);
  }
});

/**
 * CORS preflight handler
 */
app.options('/*', (c) => {
  return c.text('', 204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
});

export default app;
