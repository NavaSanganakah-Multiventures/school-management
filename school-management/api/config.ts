import { Hono } from 'hono';
import { resolveTenant, extractHostDetails } from './lib/tenant-resolver';

const configApp = new Hono<{ Bindings: any }>();

// GET /api/config/resolve-school - Public endpoint to resolve school by domain/subdomain/slug from headers or query
configApp.get('/resolve-school', async (c) => {
  const hostDetails = extractHostDetails(c);
  const tenant = await resolveTenant(c);

  return c.json({
    success: true,
    detectedHost: hostDetails.cleanHost,
    subdomain: hostDetails.subdomain,
    customDomain: hostDetails.customDomain,
    tenant,
  });
});

configApp.get('/', async (c) => {
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

  const tenant = await resolveTenant(c);

  return c.json({
    firebaseWebConfig: webConfig ? JSON.stringify(webConfig) : null,
    isDedicated: tenant.isDedicated,
    schoolName: tenant.schoolName,
    schoolSlug: tenant.subdomain || tenant.dedicatedSlug || '',
    schoolId: tenant.schoolId,
    logoUrl: tenant.logoUrl || null,
    baseDomain: tenant.baseDomain,
    apiBaseUrl: tenant.apiBaseUrl,
    appBaseUrl: (c.env && c.env.APP_BASE_URL) || tenant.apiBaseUrl,
  });
});

export default configApp;

