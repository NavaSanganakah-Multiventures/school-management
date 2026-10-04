import { Hono } from 'hono';
import { resolveTenant, extractHostDetails } from './lib/tenant-resolver';
import { getAuthUser } from './lib/auth';

const configApp = new Hono<{ Bindings: any }>();

/**
 * Resolves the tenant for an unauthenticated request, WITHOUT letting the caller name
 * the tenant.
 *
 * /api/config has to stay anonymous: the login screen reads it before there is a session,
 * to learn the base URL and the school's branding. So authentication is not available as
 * the fix.
 *
 * What is not needed is the ability to select an ARBITRARY tenant. extractHostDetails
 * honours `?schoolId=`, and on the platform tier — whose D1 holds every tenant — that
 * turned `GET /api/config?schoolId=school-…` into an anonymous customer directory
 * (schoolId, school name, logo, and via resolve-school also board, affiliation number,
 * city and state).
 *
 * So the schoolId from the query/headers is dropped for anonymous callers, leaving Host
 * and subdomain as the only way in. That is the legitimate direction: a caller asking
 * "who is at this hostname", not "tell me about tenant X". A dedicated worker ignores
 * these inputs entirely and answers from its own SCHOOL_ID.
 */
async function resolveForConfig(c: any) {
  const authUser = await getAuthUser(c);
  if (authUser) return resolveTenant(c);

  const originalQuery = c.req.query.bind(c.req);
  const query = (key: string) => (key === 'schoolId' ? undefined : originalQuery(key));
  // A shallow stand-in is enough: extractHostDetails and resolveTenant only ever read
  // through these two accessors.
  const stripped = { ...c.req, query, header: c.req.header.bind(c.req), url: c.req.url };
  return resolveTenant({ ...c, req: stripped });
}

// GET /api/config/resolve-school - Public endpoint to resolve school by domain/subdomain/slug from headers or query
configApp.get('/resolve-school', async (c) => {
  const hostDetails = extractHostDetails(c);
  const tenant = await resolveForConfig(c);

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

  const tenant = await resolveForConfig(c);

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

