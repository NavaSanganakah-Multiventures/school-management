import { Hono } from 'hono';
import { getDB } from '../db';
import { getAuthUser, getRequestSchoolId } from '../lib/auth';
import { getAssignedClassNames } from '../lib/permissions';
import { isManagement, isTeaching, normalizeRole } from '../lib/roles';

const activityLogsApp = new Hono<{ Bindings: any }>();

// GET /api/activity-logs
activityLogsApp.get('/', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);

  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);

  const schoolId = getRequestSchoolId(c, authUser);
  const targetUserId = c.req.query('userId');
  const actionType = c.req.query('actionType');
  const className = c.req.query('class');
  const date = c.req.query('date');
  const search = (c.req.query('q') || '').trim().toLowerCase();
  const limit = Math.min(Math.max(parseInt(c.req.query('limit') || '50', 10), 1), 200);
  const offset = Math.max(parseInt(c.req.query('offset') || '0', 10), 0);

  const userRole = authUser.role;

  // Role-based visibility enforcement
  //
  // SECURITY FIX: this was an if/else-if chain with no final `else`. A
  // 'Parents' or 'Students' token (valid since migration 0034) matched no
  // branch, so NO visibility condition was added and the caller received every
  // activity log in the school — which includes student names, class names,
  // fee/payment actions and admin identities.
  //
  // Now deny-by-default: anything that is not explicitly management or teaching
  // is scoped to only its own rows.
  let whereConditions: string[] = ['school_id = ?'];
  let params: any[] = [schoolId];

  const role = normalizeRole(userRole);
  if (isManagement(role)) {
    // Principal / Director / SuperAdmin see the whole school.
    if (targetUserId) {
      whereConditions.push('user_id = ?');
      params.push(targetUserId);
    }
  } else if (isTeaching(role)) {
    // Teaching roles see their own activity plus their assigned classes.
    const assignedClasses = await getAssignedClassNames(db, schoolId, authUser.sub);
    if (assignedClasses.length > 0) {
      const placeholders = assignedClasses.map(() => '?').join(',');
      whereConditions.push(`(user_id = ? OR class_name IN (${placeholders}))`);
      params.push(authUser.sub, ...assignedClasses);
    } else {
      whereConditions.push('user_id = ?');
      params.push(authUser.sub);
    }
  } else {
    // Parent / Student / any unknown role: only rows they themselves created.
    whereConditions.push('user_id = ?');
    params.push(authUser.sub);
  }

  if (actionType && actionType !== 'All') {
    whereConditions.push('action_type = ?');
    params.push(actionType);
  }

  if (className && className !== 'All') {
    whereConditions.push('class_name = ?');
    params.push(className);
  }

  if (date) {
    whereConditions.push('created_at LIKE ?');
    params.push(`${date}%`);
  }

  const whereClause = whereConditions.length ? `WHERE ${whereConditions.join(' AND ')}` : '';

  // Get total count
  const countRow = await db
    .prepare(`SELECT COUNT(*) as count FROM activity_logs ${whereClause}`)
    .bind(...params)
    .first();
  const total = countRow?.count || 0;

  // Get records ordered by latest first
  const query = `
    SELECT id, school_id, user_id, user_name, user_role, action_type, action_title,
           description, entity_type, entity_id, class_name, metadata, created_at
    FROM activity_logs
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `;

  const rows = await db.prepare(query).bind(...params, limit, offset).all();
  let logs = (rows.results || []).map((r: any) => ({
    id: r.id,
    schoolId: r.school_id,
    userId: r.user_id,
    userName: r.user_name,
    userRole: r.user_role,
    actionType: r.action_type,
    actionTitle: r.action_title,
    description: r.description,
    entityType: r.entity_type,
    entityId: r.entity_id,
    className: r.class_name,
    metadata: r.metadata ? (() => { try { return JSON.parse(r.metadata); } catch (_) { return null; } })() : null,
    createdAt: r.created_at,
  }));

  if (search) {
    logs = logs.filter(
      (l: any) =>
        l.description.toLowerCase().includes(search) ||
        l.userName.toLowerCase().includes(search) ||
        l.actionTitle.toLowerCase().includes(search) ||
        (l.className && l.className.toLowerCase().includes(search))
    );
  }

  return c.json({
    success: true,
    role: userRole,
    total,
    logs,
  });
});

// GET /api/activity-logs/summary
activityLogsApp.get('/summary', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);

  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);

  const schoolId = getRequestSchoolId(c, authUser);
  const today = new Date().toISOString().split('T')[0];

  const todayCountRow = await db
    .prepare('SELECT COUNT(*) as count FROM activity_logs WHERE school_id = ? AND created_at LIKE ?')
    .bind(schoolId, `${today}%`)
    .first();

  const userActionStats = await db
    .prepare('SELECT action_type, COUNT(*) as count FROM activity_logs WHERE school_id = ? AND created_at LIKE ? GROUP BY action_type')
    .bind(schoolId, `${today}%`)
    .all();

  return c.json({
    success: true,
    todayTotal: todayCountRow?.count || 0,
    byAction: (userActionStats.results || []).reduce((acc: any, curr: any) => {
      acc[curr.action_type] = curr.count;
      return acc;
    }, {}),
  });
});

export default activityLogsApp;
