import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { verifyToken } from '../lib/auth';

const pluginsApp = new Hono<{ Bindings: any }>();

// Helper to authenticate user
async function authCheck(c: any) {
  const token = getCookie(c, 'auth_token') || c.req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return null;
  return await verifyToken(c, token);
}

// 1. GET /api/plugins/marketplace -> List all global plugins for purchase/subscription
pluginsApp.get('/marketplace', async (c) => {
  try {
    const user = await authCheck(c);
    if (!user) return c.json({ success: false, error: 'Unauthorized' }, 401);
    if (user.role !== 'Director' && user.role !== 'SuperAdmin') {
      return c.json({ success: false, error: 'Forbidden. Only Directors can access plugins.' }, 403);
    }

    // Check if the school is on Enterprise plan
    let isEnterprise = !!(c.env && (c.env.IS_DEDICATED_WORKER === 'true' || c.env.SCHOOL_ID));
    if (!isEnterprise && c.env.DB && user.schoolId) {
      try {
        const sub = await c.env.DB.prepare('SELECT plan_id FROM school_subscriptions WHERE school_id = ?').bind(user.schoolId).first();
        const tenant = await c.env.DB.prepare('SELECT plan_id FROM school_tenants WHERE id = ?').bind(user.schoolId).first();
        const planId = String((sub && sub.plan_id) || (tenant && tenant.plan_id) || '').toLowerCase();
        if (planId === 'enterprise') isEnterprise = true;
      } catch (_) {}
    }

    // Get all active plugins (global + private for this school)
    const { results: plugins } = await c.env.DB.prepare(
      `SELECT * FROM plugins WHERE is_active = 1 AND (type = 'global' OR (type = 'private' AND target_school_id = ?))`
    ).bind(user.schoolId).all();

    // Get currently subscribed plugins for this school
    let mySubscriptions: any[] = [];
    if (user.schoolId) {
      if (isEnterprise) {
        mySubscriptions = (plugins || []).map((p: any) => ({
          plugin_id: p.id,
          status: 'active',
          isEnterpriseIncluded: true,
        }));
      } else {
        const { results } = await c.env.DB.prepare(
          `SELECT plugin_id, status, valid_until, trial_ends_at, payment_status, next_billing_date FROM school_plugins WHERE school_id = ?`
        ).bind(user.schoolId).all();
        mySubscriptions = results || [];
      }
    }

    return c.json({
      success: true,
      isEnterprise,
      plugins: (plugins || []).map((p: any) => Object.assign({}, p, { isEnterpriseIncluded: isEnterprise })),
      mySubscriptions
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// 2. POST /api/plugins/subscribe -> Subscribe to a plugin
pluginsApp.post('/subscribe', async (c) => {
  try {
    const user = await authCheck(c);
    if (!user || !user.schoolId) return c.json({ success: false, error: 'Unauthorized' }, 401);
    if (user.role !== 'Director' && user.role !== 'SuperAdmin') {
      return c.json({ success: false, error: 'Forbidden. Only Directors can subscribe.' }, 403);
    }

    const { pluginId } = await c.req.json();
    if (!pluginId) return c.json({ success: false, error: 'Plugin ID required' }, 400);

    // Check if plugin exists
    const plugin = await c.env.DB.prepare(`SELECT * FROM plugins WHERE id = ?`).bind(pluginId).first();
    if (!plugin) return c.json({ success: false, error: 'Plugin not found' }, 404);

    // Free plugins (price = 0): activate immediately.
    // Paid plugins (price > 0): require an admin-granted trial or payment — do NOT auto-activate.
    const pluginPrice = Number(plugin.price) || 0;
    if (pluginPrice > 0) {
      // Check if school already has an active trial or paid subscription
      const existing = await c.env.DB.prepare(
        `SELECT status, payment_status, trial_ends_at, valid_until FROM school_plugins WHERE school_id = ? AND plugin_id = ?`
      ).bind(user.schoolId, pluginId).first();

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
    await c.env.DB.prepare(`
      INSERT INTO school_plugins (id, school_id, plugin_id, status, payment_status)
      VALUES (?, ?, ?, 'active', 'active')
      ON CONFLICT(school_id, plugin_id) DO UPDATE SET status = 'active', payment_status = 'active', updated_at = CURRENT_TIMESTAMP
    `).bind(id, user.schoolId, pluginId).run();

    return c.json({ success: true, message: 'Subscribed successfully' });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// 3. POST /api/plugins/unsubscribe -> Unsubscribe
pluginsApp.post('/unsubscribe', async (c) => {
    try {
      const user = await authCheck(c);
      if (!user || !user.schoolId) return c.json({ success: false, error: 'Unauthorized' }, 401);
      if (user.role !== 'Director' && user.role !== 'SuperAdmin') {
        return c.json({ success: false, error: 'Forbidden. Only Directors can unsubscribe.' }, 403);
      }
  
      const { pluginId } = await c.req.json();
      if (!pluginId) return c.json({ success: false, error: 'Plugin ID required' }, 400);
  
      await c.env.DB.prepare(`
        UPDATE school_plugins SET status = 'inactive', updated_at = CURRENT_TIMESTAMP
        WHERE school_id = ? AND plugin_id = ?
      `).bind(user.schoolId, pluginId).run();

      return c.json({ success: true, message: 'Unsubscribed successfully' });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 500);
    }
  });

// 4. GET /api/plugins/active -> Get active plugins for the current user's school (Allowed for all roles)
pluginsApp.get('/active', async (c) => {
  try {
    const user = await authCheck(c);
    if (!user || !user.schoolId) return c.json({ success: false, error: 'Unauthorized' }, 401);

    // Check if the school is on Enterprise plan or dedicated worker
    let isEnterprise = !!(c.env && (c.env.IS_DEDICATED_WORKER === 'true' || c.env.SCHOOL_ID));
    if (!isEnterprise && c.env.DB) {
      try {
        const sub = await c.env.DB.prepare(
          'SELECT plan_id FROM school_subscriptions WHERE school_id = ?'
        ).bind(user.schoolId).first();
        const tenant = await c.env.DB.prepare(
          'SELECT plan_id FROM school_tenants WHERE id = ?'
        ).bind(user.schoolId).first();
        const planId = String((sub && sub.plan_id) || (tenant && tenant.plan_id) || '').toLowerCase();
        if (planId === 'enterprise') isEnterprise = true;
      } catch (_) {}
    }

    if (isEnterprise) {
      // Enterprise schools have ALL active plugins automatically unlocked!
      const { results: allPlugins } = await c.env.DB.prepare(
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

    const { results } = await c.env.DB.prepare(
      `SELECT plugin_id FROM school_plugins WHERE school_id = ? AND status = 'active'`
    ).bind(user.schoolId).all();

    return c.json({
      success: true,
      activePlugins: (results || []).map((r: any) => r.plugin_id)
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default pluginsApp;
