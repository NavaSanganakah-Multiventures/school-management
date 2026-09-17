export interface LogActivityParams {
  schoolId: string;
  userId: string;
  userName: string;
  userRole: string;
  actionType: string;
  actionTitle: string;
  description: string;
  entityType?: string;
  entityId?: string;
  className?: string;
  metadata?: any;
}

/**
 * Log an administrative, academic, or staff activity into the activity_logs audit trail.
 * Designed to be resilient: will not throw or break the parent transaction if logging fails.
 */
export async function logActivity(db: any, params: LogActivityParams): Promise<void> {
  if (!db || !params || !params.schoolId) return;

  try {
    const id = 'act-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8);
    const metaStr = params.metadata ? JSON.stringify(params.metadata) : null;
    const now = new Date().toISOString();

    await db.prepare(
      'INSERT INTO activity_logs (id, school_id, user_id, user_name, user_role, action_type, action_title, description, entity_type, entity_id, class_name, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
      .bind(
        id,
        params.schoolId,
        params.userId || 'system',
        params.userName || 'अज्ञात उपयोगकर्ता',
        params.userRole || 'Staff',
        params.actionType,
        params.actionTitle,
        params.description,
        params.entityType || null,
        params.entityId || null,
        params.className || null,
        metaStr,
        now
      )
      .run();
  } catch (err) {
    console.warn('[ActivityLogger] Error recording audit log:', err);
  }
}

/**
 * Helper to resolve user's display name from auth payload or database
 */
export async function resolveActorName(db: any, userId: string, fallbackRole: string): Promise<string> {
  if (!db || !userId) return fallbackRole;
  try {
    const row = await db.prepare('SELECT full_name FROM system_users WHERE id = ?').bind(userId).first();
    if (row && row.full_name) return row.full_name;
  } catch (_) {}
  return fallbackRole;
}
