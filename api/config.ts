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

  const isDedicated = !!(c.env && (c.env.IS_DEDICATED_WORKER === 'true' || c.env.SCHOOL_ID));

  return c.json({
    firebaseWebConfig: webConfig ? JSON.stringify(webConfig) : null,
    isDedicated,
    schoolName: (c.env && c.env.SCHOOL_NAME) || '',
    schoolSlug: (c.env && c.env.SCHOOL_SLUG) || '',
    schoolId: (c.env && c.env.SCHOOL_ID) || '',
    appBaseUrl: (c.env && c.env.APP_BASE_URL) || '',
  });
});

export default configApp;
