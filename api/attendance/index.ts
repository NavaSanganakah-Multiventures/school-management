import { Hono } from 'hono';
import { getDB } from '../db';
import { getAuthUser, getRequestSchoolId } from '../lib/auth';
import { isClassTeacher } from '../lib/permissions';
import { logActivity } from '../lib/activity-logger';
import { buildTokenMessage, isFcmConfigured, isRealFcmToken, sendFcmMessage } from '../lib/fcm';
import { isWebPushConfigured, sendWebPushNotification } from '../lib/webpush';

const attendanceApp = new Hono<{ Bindings: any }>();

function classListWhereClause(classNames: string[]): { clause: string; params: any[] } {
  if (!classNames || classNames.length === 0) return { clause: '', params: [] };
  const placeholders = classNames.map(() => '?').join(',');
  return { clause: ' AND s.class_name IN (' + placeholders + ')', params: classNames };
}

function allowedClassesForUser(authUser: any, targetClass: string | null, assignedClasses: string[]): string[] | null {
  const isAdmin = authUser.role === 'Director' || authUser.role === 'Principal' || authUser.role === 'SuperAdmin';
  if (isAdmin) {
    if (targetClass && targetClass !== 'All') return [targetClass];
    return null;
  }
  let allowed = assignedClasses;
  if (targetClass && targetClass !== 'All') {
    if (!allowed.includes(targetClass)) return [];
    allowed = [targetClass];
  }
  return allowed;
}

async function canMarkAttendanceForClass(db: any, schoolId: string, authUser: any, className: string): Promise<boolean> {
  if (authUser.role === 'Director' || authUser.role === 'Principal' || authUser.role === 'SuperAdmin') return true;
  if (authUser.role !== 'Staff') return false;
  return isClassTeacher(db, schoolId, className, authUser.sub);
}

async function resolveMarkedBy(db: any, authUser: any): Promise<string> {
  const user = await db.prepare('SELECT full_name FROM system_users WHERE id = ?').bind(authUser.sub).first();
  const name = user ? user.full_name : authUser.role;
  return name + ' (' + authUser.role + ')';
}

attendanceApp.get('/', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);

  const schoolId = getRequestSchoolId(c, authUser);
  const date = c.req.query('date') || new Date().toISOString().split('T')[0];
  const className = c.req.query('class') || null;

  const assignedClasses = authUser.role === 'Staff'
    ? (await db.prepare('SELECT class_name FROM class_teachers WHERE school_id = ? AND teacher_user_id = ? ORDER BY class_name').bind(schoolId, authUser.sub).all()).results?.map((r: any) => r.class_name) || []
    : [];

  const isAdmin = authUser.role === 'Director' || authUser.role === 'Principal' || authUser.role === 'SuperAdmin';
  const targetClass = className && className !== 'All' ? className : null;

  let queryClasses: string[] | null = null;
  let accessMessage: string | null = null;
  let canMark = false;

  if (isAdmin) {
    queryClasses = targetClass ? [targetClass] : null;
    canMark = true;
  } else {
    // Staff member (Class Teacher or Non-Class Teacher)
    if (targetClass) {
      queryClasses = [targetClass];
      const isAssigned = assignedClasses.includes(targetClass);
      canMark = isAssigned;
      if (!isAssigned) {
        accessMessage = 'आप इस कक्षा (' + targetClass + ') के अधिकृत कक्षा अध्यापक नहीं हैं। केवल पठन अधिकार (Read-Only) उपलब्ध है।';
      }
    } else {
      if (assignedClasses.length > 0) {
        queryClasses = assignedClasses;
        canMark = assignedClasses.length === 1; // If multiple assigned, marking single requires specific class
      } else {
        queryClasses = null; // show general classes in read-only mode
        canMark = false;
        accessMessage = 'आप किसी भी कक्षा के कक्षा अध्यापक नहीं हैं। उपस्थिति दर्ज करने का अधिकार केवल अधिकृत कक्षा अध्यापक, प्रधानाचार्य या निदेशक को है।';
      }
    }
  }

  const { clause, params } = classListWhereClause(queryClasses || []);
  const sql =
    'SELECT s.id AS student_id, s.first_name, s.last_name, s.class_name, s.section, s.roll_number, s.scholar_number, s.parent_name, s.parent_phone, a.id AS att_id, a.status, a.remarks, a.marked_by ' +
    'FROM students s LEFT JOIN attendance a ON a.student_id = s.id AND a.date = ? ' +
    'WHERE s.school_id = ? AND s.status = ?' + clause + ' ORDER BY s.class_name, s.roll_number, s.first_name';

  const queryParams = [date, schoolId, 'Active', ...(queryClasses ? params : [])];
  const rows = await db.prepare(sql).bind(...queryParams).all();

  const list = ((rows.results || []) as any[]).map((s) => {
    const fullName = (s.first_name || '') + (s.last_name ? ' ' + s.last_name : '');
    return {
      id: s.att_id || ('att-' + s.student_id + '-' + date),
      studentId: s.student_id,
      studentName: fullName,
      scholarNumber: s.scholar_number || s.roll_number || '',
      className: s.class_name,
      section: s.section,
      parentName: s.parent_name || 'अभिभावक',
      parentPhone: s.parent_phone || '',
      date,
      status: s.status || 'Present',
      remarks: s.remarks || '',
      markedBy: s.marked_by || 'कक्षा अध्यापक (Class Teacher)',
    };
  });

  const total = list.length;
  const present = list.filter((r) => r.status === 'Present').length;
  const absent = list.filter((r) => r.status === 'Absent').length;
  const leave = list.filter((r) => r.status === 'Leave').length;
  const rate = total > 0 ? Math.round((present / total) * 100) : 0;

  return c.json({
    success: true,
    date,
    stats: { total, present, absent, leave, rate },
    records: list,
    assignedClasses,
    canMark,
    message: accessMessage,
  });
});

// GET /api/attendance/absentees-summary - Fetch absent students for date & class
attendanceApp.get('/absentees-summary', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);

  const schoolId = getRequestSchoolId(c, authUser);
  const date = c.req.query('date') || new Date().toISOString().split('T')[0];
  const className = c.req.query('class') || null;

  const isAdmin = authUser.role === 'Director' || authUser.role === 'Principal' || authUser.role === 'SuperAdmin';
  const assignedClasses = authUser.role === 'Staff'
    ? (await db.prepare('SELECT class_name FROM class_teachers WHERE school_id = ? AND teacher_user_id = ? ORDER BY class_name').bind(schoolId, authUser.sub).all()).results?.map((r: any) => r.class_name) || []
    : [];

  let queryClasses: string[] | null = null;
  const targetClass = className && className !== 'All' ? className : null;

  if (isAdmin) {
    queryClasses = targetClass ? [targetClass] : null;
  } else {
    if (targetClass) {
      if (!assignedClasses.includes(targetClass)) {
        return c.json({ success: false, message: 'अनुमति अस्वीकृत: आप ' + targetClass + ' के अधिकृत कक्षा अध्यापक नहीं हैं।' }, 403);
      }
      queryClasses = [targetClass];
    } else {
      queryClasses = assignedClasses.length > 0 ? assignedClasses : null;
    }
  }

  const { clause, params } = classListWhereClause(queryClasses || []);
  const sql =
    'SELECT s.id AS student_id, s.first_name, s.last_name, s.class_name, s.section, s.roll_number, s.scholar_number, s.parent_name, s.parent_phone, a.id AS att_id, a.status, a.remarks, a.marked_by, a.date ' +
    'FROM students s INNER JOIN attendance a ON a.student_id = s.id AND a.date = ? ' +
    'WHERE s.school_id = ? AND s.status = ? AND a.status = ?' + clause + ' ORDER BY s.class_name, s.roll_number, s.first_name';

  const queryParams = [date, schoolId, 'Active', 'Absent', ...(queryClasses ? params : [])];
  const rows = await db.prepare(sql).bind(...queryParams).all();

  const absentees = ((rows.results || []) as any[]).map((s) => {
    const fullName = ((s.first_name || '') + (s.last_name ? ' ' + s.last_name : '')).trim();
    return {
      id: s.att_id || ('att-' + s.student_id + '-' + date),
      studentId: s.student_id,
      studentName: fullName,
      scholarNumber: s.scholar_number || s.roll_number || '',
      className: s.class_name,
      section: s.section,
      parentName: s.parent_name || 'अभिभावक',
      parentPhone: s.parent_phone || '',
      date: s.date || date,
      status: s.status || 'Absent',
      remarks: s.remarks || '',
      markedBy: s.marked_by || '',
    };
  });

  return c.json({
    success: true,
    date,
    count: absentees.length,
    absentees,
  });
});

// GET /api/attendance/summary - Attendance statistics for student or school
attendanceApp.get('/summary', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);

  const schoolId = getRequestSchoolId(c, authUser);
  const studentId = c.req.query('studentId') || null;
  const className = c.req.query('class') || null;
  const today = new Date().toISOString().split('T')[0];

  if (studentId) {
    const student = await db.prepare('SELECT id, first_name, last_name, class_name, section, roll_number FROM students WHERE id = ? AND school_id = ?').bind(studentId, schoolId).first();
    if (!student) return c.json({ success: false, message: 'छात्र नहीं मिला।' }, 404);

    const counts = await db.prepare(
      'SELECT ' +
      'COUNT(*) AS total, ' +
      'SUM(CASE WHEN status = "Present" THEN 1 ELSE 0 END) AS present, ' +
      'SUM(CASE WHEN status = "Absent" THEN 1 ELSE 0 END) AS absent, ' +
      'SUM(CASE WHEN status = "Leave" THEN 1 ELSE 0 END) AS leave ' +
      'FROM attendance WHERE student_id = ? AND school_id = ?'
    ).bind(studentId, schoolId).first();

    const todayRecord = await db.prepare('SELECT status, remarks FROM attendance WHERE student_id = ? AND date = ? AND school_id = ?').bind(studentId, today, schoolId).first();

    const total = Number(counts?.total || 0);
    const present = Number(counts?.present || 0);
    const absent = Number(counts?.absent || 0);
    const leave = Number(counts?.leave || 0);
    const rate = total > 0 ? Math.round((present / total) * 100) : 100;

    return c.json({
      success: true,
      student,
      todayStatus: todayRecord?.status || 'Unmarked',
      stats: { total, present, absent, leave, rate },
    });
  }

  let sql =
    'SELECT ' +
    'COUNT(*) AS total, ' +
    'SUM(CASE WHEN a.status = "Present" THEN 1 ELSE 0 END) AS present, ' +
    'SUM(CASE WHEN a.status = "Absent" THEN 1 ELSE 0 END) AS absent, ' +
    'SUM(CASE WHEN a.status = "Leave" THEN 1 ELSE 0 END) AS leave ' +
    'FROM students s LEFT JOIN attendance a ON a.student_id = s.id AND a.date = ? ' +
    'WHERE s.school_id = ? AND s.status = "Active"';
  const params: any[] = [today, schoolId];

  if (className && className !== 'All') {
    sql += ' AND s.class_name = ?';
    params.push(className);
  }

  const counts = await db.prepare(sql).bind(...params).first();
  const total = Number(counts?.total || 0);
  const present = Number(counts?.present || 0);
  const absent = Number(counts?.absent || 0);
  const leave = Number(counts?.leave || 0);
  const rate = total > 0 ? Math.round((present / total) * 100) : 0;

  return c.json({
    success: true,
    date: today,
    stats: { total, present, absent, leave, rate },
  });
});

attendanceApp.post('/mark', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);

  const schoolId = getRequestSchoolId(c, authUser);
  const body = await c.req.json().catch(() => ({}));
  const studentId = body.studentId;
  const status = body.status || 'Present';
  const targetDate = body.date || new Date().toISOString().split('T')[0];

  if (!studentId) return c.json({ success: false, message: 'studentId आवश्यक है।' }, 400);
  if (['Present', 'Absent', 'Late', 'Leave'].indexOf(status) === -1) return c.json({ success: false, message: 'अमान्य उपस्थिति स्थिति।' }, 400);

  const student = await db.prepare('SELECT id, class_name FROM students WHERE id = ? AND school_id = ? AND status = ?')
    .bind(studentId, schoolId, 'Active').first();
  if (!student) return c.json({ success: false, message: 'छात्र नहीं मिला।' }, 404);

  const permitted = await canMarkAttendanceForClass(db, schoolId, authUser, student.class_name);
  if (!permitted) {
    return c.json({ success: false, message: 'अनुमति अस्वीकृत: केवल अधिकृत कक्षा अध्यापक, प्रधानाचार्य या निदेशक ही इस कक्षा की उपस्थिति दर्ज कर सकते हैं।' }, 403);
  }

  const id = 'att-' + studentId + '-' + targetDate;
  const markedBy = await resolveMarkedBy(db, authUser);

  await db.prepare(
    'INSERT INTO attendance (id, student_id, date, status, remarks, marked_by, school_id) VALUES (?,?,?,?,?,?,?) ' +
    'ON CONFLICT(id) DO UPDATE SET status=excluded.status, remarks=excluded.remarks, marked_by=excluded.marked_by'
  ).bind(id, studentId, targetDate, status, body.remarks || '', markedBy, schoolId).run();

  await logActivity(db, {
    schoolId,
    userId: authUser.sub,
    userName: markedBy,
    userRole: authUser.role,
    actionType: 'ATTENDANCE_MARK',
    actionTitle: 'छात्र उपस्थिति दर्ज',
    description: `कक्षा ${student.class_name} के छात्र (ID: ${studentId}) को दिनांक ${targetDate} हेतु "${status}" दर्ज किया गया।`,
    entityType: 'attendance',
    entityId: id,
    className: student.class_name,
    metadata: { studentId, status, date: targetDate },
  });

  return c.json({ success: true, message: 'उपस्थिति दर्ज कर दी गई।', markedBy });
});

attendanceApp.post('/mark-all-present', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);

  const schoolId = getRequestSchoolId(c, authUser);
  const body = await c.req.json().catch(() => ({}));
  const targetDate = body.date || new Date().toISOString().split('T')[0];
  const className = body.className || null;

  const isAdmin = authUser.role === 'Director' || authUser.role === 'Principal' || authUser.role === 'SuperAdmin';

  let allowed: string[] | null = null;
  if (!isAdmin) {
    const rows = await db.prepare('SELECT class_name FROM class_teachers WHERE school_id = ? AND teacher_user_id = ? ORDER BY class_name')
      .bind(schoolId, authUser.sub).all();
    allowed = (rows.results || []).map((r: any) => r.class_name);
  }

  if (!isAdmin && className && className !== 'All') {
    if (!allowed!.includes(className)) {
      return c.json({ success: false, message: 'अनुमति अस्वीकृत: आप ' + className + ' के अधिकृत कक्षा अध्यापक नहीं हैं।' }, 403);
    }
    allowed = [className];
  } else if (!isAdmin && (!allowed || allowed.length === 0)) {
    return c.json({ success: false, message: 'अनुमति अस्वीकृत: आप किसी भी कक्षा के कक्षा अध्यापक नहीं हैं। केवल कक्षा अध्यापक, प्रधानाचार्य या निदेशक ही उपस्थिति दर्ज कर सकते हैं।' }, 403);
  }

  const { clause, params } = classListWhereClause(allowed || []);
  const sql = 'SELECT id FROM students WHERE school_id = ? AND status = ?' + clause;
  const rows = await db.prepare(sql).bind(schoolId, 'Active', ...(allowed ? params : [])).all();
  const students = (rows.results || []) as any[];

  const markedBy = await resolveMarkedBy(db, authUser);

  for (const s of students) {
    const id = 'att-' + s.id + '-' + targetDate;
    await db.prepare(
      'INSERT INTO attendance (id, student_id, date, status, remarks, marked_by, school_id) VALUES (?,?,?,?,?,?,?) ' +
      'ON CONFLICT(id) DO UPDATE SET status=excluded.status, marked_by=excluded.marked_by'
    ).bind(id, s.id, targetDate, 'Present', '', markedBy, schoolId).run();
  }

  await logActivity(db, {
    schoolId,
    userId: authUser.sub,
    userName: markedBy,
    userRole: authUser.role,
    actionType: 'ATTENDANCE_MARK',
    actionTitle: 'सामूहिक उपस्थिति (All Present) दर्ज',
    description: `कक्षा ${className || 'समस्त आवंटित कक्षाएं'} के कुल ${students.length} छात्रों को दिनांक ${targetDate} हेतु उपस्थित दर्ज किया गया।`,
    entityType: 'attendance',
    className: className || undefined,
    metadata: { className, count: students.length, date: targetDate },
  });

  return c.json({ success: true, message: 'कक्षा के सभी छात्रों की उपस्थिति Present मार्क कर दी गई।', count: students.length });
});

// POST /api/attendance/notify-absentees - Send absentee alert to parents via FCM push & web push
attendanceApp.post('/notify-absentees', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);

  const schoolId = getRequestSchoolId(c, authUser);
  const body = await c.req.json().catch(() => ({}));
  const targetDate = body.date || new Date().toISOString().split('T')[0];
  const className = body.className || null;
  const customMessage = body.customMessage ? String(body.customMessage).trim() : null;
  const studentIds: string[] | null = Array.isArray(body.studentIds) && body.studentIds.length > 0 ? body.studentIds : null;

  const isAdmin = authUser.role === 'Director' || authUser.role === 'Principal' || authUser.role === 'SuperAdmin';
  if (!isAdmin && authUser.role !== 'Staff') {
    return c.json({ success: false, message: 'अनुमति अस्वीकृत: केवल स्टाफ या प्रशासक ही अनुपस्थिति अलर्ट भेज सकते हैं।' }, 403);
  }

  // Find absent students
  let sql =
    'SELECT s.id AS student_id, s.first_name, s.last_name, s.class_name, s.section, s.roll_number, s.scholar_number, s.parent_name, s.parent_phone ' +
    'FROM students s INNER JOIN attendance a ON a.student_id = s.id AND a.date = ? ' +
    'WHERE s.school_id = ? AND s.status = ? AND a.status = ?';
  const params: any[] = [targetDate, schoolId, 'Active', 'Absent'];

  if (studentIds && studentIds.length > 0) {
    const placeholders = studentIds.map(() => '?').join(',');
    sql += ' AND s.id IN (' + placeholders + ')';
    params.push(...studentIds);
  } else if (className && className !== 'All') {
    sql += ' AND s.class_name = ?';
    params.push(className);
  }

  sql += ' ORDER BY s.class_name, s.roll_number, s.first_name';
  const rows = await db.prepare(sql).bind(...params).all();
  const absentStudents = (rows.results || []) as any[];

  if (absentStudents.length === 0) {
    return c.json({
      success: true,
      count: 0,
      notifiedCount: 0,
      message: 'चयनित तिथि हेतु कोई अनुपस्थित छात्र नहीं मिला।',
    });
  }

  const senderName = await resolveMarkedBy(db, authUser);
  const alertBody = customMessage || `सादर नमस्कार, आपका पाल्य आज (${targetDate}) विद्यालय में अनुपस्थित है। कृपया अनुपस्थिति का कारण विद्यालय को सूचित करें।`;
  const alertTitle = '⚠️ अनुपस्थिति सूचना | VidyaSetu';

  // Send TARGETED push notifications to ONLY the absent students' parents (not all parents).
  // Previously this used broadcastAlert with targetRole 'Parents' which sent to every parent
  // subscribed to the school's parents topic. Now we resolve each absent student's parent_phone
  // to a system_users account, then fetch FCM device tokens / web push subscriptions for those
  // specific parent users only.
  let tokenSuccess = 0;
  let tokenFailed = 0;
  let webPushSent = 0;
  let webPushFailed = 0;
  let notifiedParentCount = 0;

  const parentPhones = Array.from(new Set(
    absentStudents
      .map((s: any) => String(s.parent_phone || '').trim())
      .filter((p: string) => p.length >= 7)
  ));

  if (parentPhones.length > 0) {
    // Resolve parent user accounts by phone number
    const phonePlaceholders = parentPhones.map(() => '?').join(',');
    const userRows = await db.prepare(
      'SELECT id FROM system_users WHERE school_id = ? AND role = ? AND phone IN (' + phonePlaceholders + ')'
    ).bind(schoolId, 'Parents', ...parentPhones).all().catch(() => ({ results: [] }));

    const parentUserIds = (userRows.results || []).map((r: any) => String(r.id));
    notifiedParentCount = parentUserIds.length;

    if (parentUserIds.length > 0) {
      const userIdPlaceholders = parentUserIds.map(() => '?').join(',');
      const dataPayload: Record<string, string> = {
        type: 'absentee_alert',
        date: targetDate,
        className: className || 'All',
        absentCount: String(absentStudents.length),
        schoolId,
        priority: 'high',
      };

      // FCM direct tokens for the absent students' parents
      if (isFcmConfigured(c.env)) {
        const tokenRows = await db.prepare(
          'SELECT device_token FROM fcm_device_tokens WHERE school_id = ? AND is_active = 1 AND user_id IN (' + userIdPlaceholders + ')'
        ).bind(schoolId, ...parentUserIds).all().catch(() => ({ results: [] }));

        const tokens = (tokenRows.results || [])
          .map((r: any) => String(r.device_token || ''))
          .filter((t: string) => isRealFcmToken(t));

        for (let i = 0; i < tokens.length; i++) {
          try {
            const r = await sendFcmMessage(c.env, buildTokenMessage(tokens[i], alertTitle, alertBody, dataPayload, 'high'));
            if (r.success) {
              tokenSuccess++;
            } else {
              tokenFailed++;
              const errStr = r.error || '';
              if (errStr.includes('UNREGISTERED') || errStr.includes('INVALID_ARGUMENT') || errStr.includes('NOT_FOUND')) {
                await db.prepare('UPDATE fcm_device_tokens SET is_active = 0 WHERE device_token = ?').bind(tokens[i]).run().catch(() => {});
              }
            }
          } catch (e: any) {
            tokenFailed++;
          }
        }
      }

      // Web Push subscriptions for the absent students' parents
      const webPushRows = await db.prepare(
        'SELECT id, endpoint, p256dh, auth FROM web_push_subscriptions WHERE school_id = ? AND is_active = 1 AND user_id IN (' + userIdPlaceholders + ')'
      ).bind(schoolId, ...parentUserIds).all().catch(() => ({ results: [] }));

      const webPushSubs = webPushRows.results || [];
      if (webPushSubs.length > 0 && isWebPushConfigured(c.env)) {
        const webPayload = {
          notification: { title: alertTitle, body: alertBody },
          data: dataPayload,
        };
        for (let i = 0; i < webPushSubs.length; i++) {
          const sub = webPushSubs[i] as any;
          try {
            const r = await sendWebPushNotification(c.env, { endpoint: String(sub.endpoint), keys: { p256dh: String(sub.p256dh), auth: String(sub.auth) } }, webPayload);
            if (r.success) {
              webPushSent++;
            } else {
              webPushFailed++;
              if (r.status === 404 || r.status === 410) {
                await db.prepare('UPDATE web_push_subscriptions SET is_active = 0 WHERE id = ?').bind(String(sub.id)).run().catch(() => {});
              }
            }
          } catch (e) {
            webPushFailed++;
          }
        }
      }
    }
  }

  // Log activity
  await logActivity(db, {
    schoolId,
    userId: authUser.sub,
    userName: senderName,
    userRole: authUser.role,
    actionType: 'ATTENDANCE_NOTIFY',
    actionTitle: 'अनुपस्थिति अलर्ट प्रेषित',
    description: `कक्षा ${className || 'समस्त'} के कुल ${absentStudents.length} अनुपस्थित छात्रों के अभिभावकों को अनुपस्थिति सूचना भेजी गई।`,
    entityType: 'attendance',
    className: className && className !== 'All' ? className : undefined,
    metadata: {
      date: targetDate,
      className,
      count: absentStudents.length,
      studentNames: absentStudents.slice(0, 10).map((s) => (s.first_name + ' ' + (s.last_name || '')).trim()),
    },
  });

  return c.json({
    success: true,
    count: absentStudents.length,
    notifiedCount: notifiedParentCount,
    tokenSuccess,
    tokenFailed,
    webPushSent,
    message: notifiedParentCount > 0
      ? `${notifiedParentCount} अभिभावकों को अनुपस्थिति अलर्ट सफलतापूर्वक प्रेषित कर दिया गया।`
      : `${absentStudents.length} छात्र अनुपस्थित हैं, किंतु किसी के अभिभावक का पंजीकृत डिवाइस नहीं मिला।`,
  });
});

export default attendanceApp;