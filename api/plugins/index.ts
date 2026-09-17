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

    // Get all active plugins (global + private for this school)
    const { results: plugins } = await c.env.DB.prepare(
      `SELECT * FROM plugins WHERE is_active = 1 AND (type = 'global' OR (type = 'private' AND target_school_id = ?))`
    ).bind(user.schoolId).all();

    // Get currently subscribed plugins for this school
    let mySubscriptions: any[] = [];
    if (user.schoolId) {
      const { results } = await c.env.DB.prepare(
        `SELECT plugin_id, status, valid_until FROM school_plugins WHERE school_id = ?`
      ).bind(user.schoolId).all();
      mySubscriptions = results;
    }

    return c.json({
      success: true,
      plugins,
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

    const id = crypto.randomUUID();
    
    // Upsert subscription
    await c.env.DB.prepare(`
      INSERT INTO school_plugins (id, school_id, plugin_id, status)
      VALUES (?, ?, ?, 'active')
      ON CONFLICT(school_id, plugin_id) DO UPDATE SET status = 'active', updated_at = CURRENT_TIMESTAMP
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

    const { results } = await c.env.DB.prepare(
      `SELECT plugin_id FROM school_plugins WHERE school_id = ? AND status = 'active'`
    ).bind(user.schoolId).all();

    return c.json({
      success: true,
      activePlugins: results.map((r: any) => r.plugin_id)
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default pluginsApp;
