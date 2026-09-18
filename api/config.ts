import { Hono } from 'hono';

const configApp = new Hono<{ Bindings: any }>();

configApp.get('/', (c) => {
  let webConfig = null;
  if (c.env && c.env.FIREBASE_WEB_CONFIG_JSON) {
    try {
      const parsed = typeof c.env.FIREBASE_WEB_CONFIG_JSON === 'string'
        ? JSON.parse(c.env.FIREBASE_WEB_CONFIG_JSON)
        : c.env.FIREBASE_WEB_CONFIG_JSON;

      // Extract only safe, public client keys
      webConfig = {
        apiKey: parsed.apiKey || '',
        authDomain: parsed.authDomain || '',
        projectId: parsed.projectId || '',
        storageBucket: parsed.storageBucket || '',
        messagingSenderId: parsed.messagingSenderId || '',
        appId: parsed.appId || '',
        vapidKey: parsed.vapidKey || '',
      };
    } catch (e) {
      console.error('Failed to parse FIREBASE_WEB_CONFIG_JSON:', e);
    }
  }

  return c.json({
    firebaseWebConfig: webConfig ? JSON.stringify(webConfig) : null,
  });
});

export default configApp;
