import { Hono } from 'hono';
import { requireProxiedSession } from '../lib/rbac';
import { SUPER_ADMIN, type Role } from '../lib/roles';

const pluginsApp = new Hono<{ Bindings: any }>();

// WHY A requireProxiedSession GUARD
//
// Two separate defects lived in this module. Both are closed by one decision.
//
// 1. TIER EXCLUSIVITY. This used to hand-roll its own check:
//
//        async function authCheck(c) {
//          const token = getCookie(c, 'auth_token') || c.req.header('Authorization')...;
//          return await verifyToken(c, token);
//        }
//
//    That was the only call site of verifyToken() in the whole API outside
//    getAuthUser() itself, so it skipped the three things getAuthUser() exists to
//    enforce: tier exclusivity, role normalisation, and tenant derivation through
//    getRequestSchoolId(). A school Director's token was accepted on the platform
//    worker and the request ran against the platform's shared D1 -- the stale copy
//    migrate-to-dedicated.mjs drains and never writes back. It also read a bare
//    auth_token cookie with no CSRF token, and read schoolId straight off the token.
//    Proven in scripts/verify-plugins-authz.mjs: with the old code, a validly signed
//    Director token naming ANOTHER school got 200 from /subscribe and wrote to that
//    school's rows.
//
// 2. THE ROUTE WAS UNREACHABLE FROM EVERY SCHOOL PORTAL. /api/plugins/* is one of
//    the three prefixes api/index.ts proxies to the platform, because the platform
//    holds the only authoritative plugin records. api/internal/index.ts forwards
//    that request with the M2M envelope and NO user credential -- a school token is
//    only valid on the school's own worker and the platform tier refuses school
//    roles outright, which is why forwarding one answered 401 for every dedicated
//    school (the #114 shape). So a plain getAuthUser() guard here refused every
//    Director on every school portal, always. The marketplace did not work.
//
// getProxyAwareAuthUser (api/lib/proxied-auth.ts) accepts EITHER shape: a verified
// M2M envelope, or a user token for the platform's own SuperAdmin console. It is the
// same helper /api/billing uses, and keeping ONE copy is the point -- a private copy
// in a single file is how the original authCheck existed at all.
//
// The cookie is gone. No code in this repo ever set an auth_token cookie, and
// accepting one with no CSRF token is an attack surface, not a feature.

/** Plugin administration is a Director action (or SuperAdmin on the platform tier). */
const requirePluginManager = () =>
  requireProxiedSession({ roles: ['Director', SUPER_ADMIN] as Role[] });

/** Every plugin route needs a resolved tenant; an empty one must never reach a query. */
function noTenant(c: any) {
  return c.json({ success: false, message: 'स्कूल संदर्भ (tenant) ज़रूरी है।' }, 401);
}

// 1. GET /api/plugins/marketplace -> List all global plugins for purchase/subscription
pluginsApp.get('/marketplace', async (c) => {
  const guard = await requirePluginManager()(c);
  if (!guard.ok) return guard.response;
  const { user, schoolId, db } = guard;
  if (!schoolId) return noTenant(c);

  try {
    // Check if the school is on Enterprise plan
    let isEnterprise = !!(c.env && (c.env.IS_DEDICATED_WORKER === 'true' || c.env.SCHOOL_ID));
    if (!isEnterprise && db) {
      try {
        const sub = await db.prepare('SELECT plan_id FROM school_subscriptions WHERE school_id = ?').bind(schoolId).first();
        const tenant = await db.prepare('SELECT plan_id FROM school_tenants WHERE id = ?').bind(schoolId).first();
        const planId = String((sub && sub.plan_id) || (tenant && tenant.plan_id) || '').toLowerCase();
        if (planId === 'enterprise') isEnterprise = true;
      } catch (_) {}
    }

    // Get all active plugins (global + private for this school)
    const { results: plugins } = await db.prepare(
      `SELECT * FROM plugins WHERE is_active = 1 AND (type = 'global' OR (type = 'private' AND target_school_id = ?))`
    ).bind(schoolId).all();

    // Get currently subscribed plugins for this school
    let mySubscriptions: any[] = [];
    if (isEnterprise) {
      mySubscriptions = (plugins || []).map((p: any) => ({
        plugin_id: p.id,
        status: 'active',
        isEnterpriseIncluded: true,
      }));
    } else {
      const { results } = await db.prepare(
        `SELECT plugin_id, status, valid_until, trial_ends_at, payment_status, next_billing_date FROM school_plugins WHERE school_id = ?`
      ).bind(schoolId).all();
      mySubscriptions = results || [];
    }

    return c.json({
      success: true,
      isEnterprise,
      plugins: (plugins || []).map((p: any) => Object.assign({}, p, { isEnterpriseIncluded: isEnterprise })),
      mySubscriptions,
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// 2. POST /api/plugins/subscribe -> Subscribe to a plugin
pluginsApp.post('/subscribe', async (c) => {
  const guard = await requirePluginManager()(c);
  if (!guard.ok) return guard.response;
  const { schoolId, db } = guard;
  if (!schoolId) return noTenant(c);

  try {
    const { pluginId } = await c.req.json();
    if (!pluginId) return c.json({ success: false, error: 'Plugin ID required' }, 400);

    // A plugin must be VISIBLE to this school before it can be subscribed to.
    //
    // This used to be `SELECT * FROM plugins WHERE id = ?`, which ignored
    // is_active, type and target_school_id. A private plugin is a per-school paid
    // artefact, and the read path above (:76) already scopes those two fields, so the
    // subscribe path was strictly weaker than the list path: a Director could POST
    // any plugin id — enumerable through GET /api/admin/plugins, or guessable as
    // 'plugin-lms' — and receive status='active' for a plugin another tenant had
    // paid for. GET /api/plugins then reported it active to this school.
    //
    // Same predicate as the read path, on purpose.
    const plugin = await db.prepare(
      `SELECT * FROM plugins WHERE id = ? AND is_active = 1 AND (type = 'global' OR (type = 'private' AND target_school_id = ?))`
    ).bind(pluginId, schoolId).first();
    if (!plugin) return c.json({ success: false, error: 'Plugin not found' }, 404);

    // Free plugins (price = 0): activate immediately.
    // Paid plugins (price > 0): require an admin-granted trial or payment — do NOT auto-activate.
    const pluginPrice = Number(plugin.price) || 0;
    if (pluginPrice > 0) {
      // Check if school already has an active trial or paid subscription
      const existing = await db.prepare(
        `SELECT status, payment_status, trial_ends_at, valid_until FROM school_plugins WHERE school_id = ? AND plugin_id = ?`
      ).bind(schoolId, pluginId).first();

      if (existing) {
        const today = new Date().toISOString().split('T')[0];
        const trialActive = existing.payment_status === 'trial' && existing.trial_ends_at && existing.trial_ends_at >= today;
        const paidActive = existing.payment_status === 'active' && existing.status === 'active'
          && (!existing.valid_until || existing.valid_until >= today);
        if (trialActive || paidActive) {
          return c.json({ success: true, message: 'प्लगइन पहले से सक्रिय है।' });
        }
      }
      return c.json({
        success: false,
        error: 'यह एक सशुल्क प्लगइन है। कृपया Super Admin से ट्रायल या पेमेंट लिंक का अनुरोध करें।',
        needsPayment: true,
        pluginPrice,
      }, 402);
    }

    const id = crypto.randomUUID();

    // Upsert subscription (free plugin — activate immediately)
    await db.prepare(`
      INSERT INTO school_plugins (id, school_id, plugin_id, status, payment_status)
      VALUES (?, ?, ?, 'active', 'active')
      ON CONFLICT(school_id, plugin_id) DO UPDATE SET status = 'active', payment_status = 'active', updated_at = CURRENT_TIMESTAMP
    `).bind(id, schoolId, pluginId).run();

    return c.json({ success: true, message: 'Subscribed successfully' });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// 3. POST /api/plugins/unsubscribe -> Unsubscribe
pluginsApp.post('/unsubscribe', async (c) => {
  const guard = await requirePluginManager()(c);
  if (!guard.ok) return guard.response;
  const { schoolId, db } = guard;
  if (!schoolId) return noTenant(c);

  try {
    const { pluginId } = await c.req.json();
    if (!pluginId) return c.json({ success: false, error: 'Plugin ID required' }, 400);

    await db.prepare(`
      UPDATE school_plugins SET status = 'inactive', updated_at = CURRENT_TIMESTAMP
      WHERE school_id = ? AND plugin_id = ?
    `).bind(schoolId, pluginId).run();

    return c.json({ success: true, message: 'Unsubscribed successfully' });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// 4. GET /api/plugins/active -> Which plugins this school has, so the app knows
// which feature widgets to mount.
//
// Deliberately open to every AUTHENTICATED role: a Parent or Student has to be
// able to read this or the app renders the wrong screen for them. It reveals
// nothing beyond "which modules does your own school run" and is scoped to the
// caller's own tenant. What it must never do is authenticate outside
// getAuthUser() — which is what this module used to do.
pluginsApp.get('/active', async (c) => {
  const guard = await requireProxiedSession()(c);
  if (!guard.ok) return guard.response;
  const { schoolId, db } = guard;
  if (!schoolId) return noTenant(c);

  try {
    // Check if the school is on Enterprise plan or dedicated worker
    let isEnterprise = !!(c.env && (c.env.IS_DEDICATED_WORKER === 'true' || c.env.SCHOOL_ID));
    if (!isEnterprise && db) {
      try {
        const sub = await db.prepare(
          'SELECT plan_id FROM school_subscriptions WHERE school_id = ?'
        ).bind(schoolId).first();
        const tenant = await db.prepare(
          'SELECT plan_id FROM school_tenants WHERE id = ?'
        ).bind(schoolId).first();
        const planId = String((sub && sub.plan_id) || (tenant && tenant.plan_id) || '').toLowerCase();
        if (planId === 'enterprise') isEnterprise = true;
      } catch (_) {}
    }

    if (isEnterprise) {
      // Enterprise schools have ALL active plugins automatically unlocked!
      const { results: allPlugins } = await db.prepare(
        'SELECT id FROM plugins WHERE is_active = 1'
      ).all();
      const pluginIds = (allPlugins || []).map((r: any) => r.id);
      const standardPlugins = ['plugin-lms', 'plugin-ai-assistant', 'plugin-ai-reports'];
      const combined = Array.from(new Set([...standardPlugins, ...pluginIds]));
      return c.json({
        success: true,
        isEnterprise: true,
        activePlugins: combined,
      });
    }

    const { results } = await db.prepare(
      `SELECT plugin_id FROM school_plugins WHERE school_id = ? AND status = 'active'`
    ).bind(schoolId).all();

    return c.json({
      success: true,
      activePlugins: (results || []).map((r: any) => r.plugin_id)
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default pluginsApp;
