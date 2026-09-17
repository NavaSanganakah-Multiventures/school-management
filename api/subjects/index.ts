import { Hono } from 'hono';
import { getDB } from '../db';
import { getAuthUser, getRequestSchoolId } from '../lib/auth';
import { logActivity } from '../lib/activity-logger';

const subjectsApp = new Hono<{ Bindings: any }>();

// GET /api/subjects - Get all subjects and class-subject mappings
subjectsApp.get('/', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);
  const schoolId = getRequestSchoolId(c, authUser);

  const subjects = await db.prepare('SELECT * FROM subjects WHERE school_id = ? ORDER BY subject_name').bind(schoolId).all();
  const mappings = await db.prepare(
    `SELECT cs.*, s.subject_name, s.subject_code 
     FROM class_subjects cs 
     JOIN subjects s ON cs.subject_id = s.id 
     WHERE cs.school_id = ? 
     ORDER BY cs.class_name, s.subject_name`
  ).bind(schoolId).all();

  return c.json({
    success: true,
    subjects: subjects.results || [],
    classSubjects: mappings.results || []
  });
});

// POST /api/subjects - Add a new global subject
subjectsApp.post('/', async (c) => {
  const db = getDB(c);
  const authUser = await getAuthUser(c);
  if (!authUser || (authUser.role !== 'Director' && authUser.role !== 'Principal')) {
    return c.json({ success: false, message: 'अनधिकृत पहुँच।' }, 403);
  }
  const schoolId = getRequestSchoolId(c, authUser);
  const body = await c.req.json().catch(() => ({}));
  
  if (!body.subjectName) return c.json({ success: false, message: 'विषय का नाम आवश्यक है।' }, 400);

  const id = `sub-${crypto.randomUUID()}`;
  await db.prepare('INSERT INTO subjects (id, school_id, subject_name, subject_code) VALUES (?, ?, ?, ?)')
    .bind(id, schoolId, body.subjectName.trim(), body.subjectCode?.trim() || null).run();

  await logActivity(db, {
    schoolId, userId: authUser.sub, userName: authUser.role, userRole: authUser.role,
    actionType: 'CREATE_SUBJECT', actionTitle: 'नया विषय जोड़ा गया',
    description: `विषय '${body.subjectName}' जोड़ा गया।`, entityType: 'Subject', entityId: id
  });

  return c.json({ success: true, message: 'विषय सफलतापूर्वक जोड़ा गया।', id });
});

// POST /api/subjects/map - Map a subject to a class
subjectsApp.post('/map', async (c) => {
  const db = getDB(c);
  const authUser = await getAuthUser(c);
  if (!authUser || (authUser.role !== 'Director' && authUser.role !== 'Principal')) {
    return c.json({ success: false, message: 'अनधिकृत पहुँच।' }, 403);
  }
  const schoolId = getRequestSchoolId(c, authUser);
  const body = await c.req.json().catch(() => ({}));

  if (!body.className || !body.subjectId) {
    return c.json({ success: false, message: 'कक्षा और विषय आवश्यक हैं।' }, 400);
  }

  const id = `cs-${crypto.randomUUID()}`;
  await db.prepare(
    `INSERT INTO class_subjects (id, school_id, class_name, subject_id, subject_type, is_optional, max_marks) 
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, schoolId, body.className, body.subjectId, 
    body.subjectType || 'Theory', body.isOptional ? 1 : 0, body.maxMarks || 100
  ).run();

  return c.json({ success: true, message: 'विषय कक्षा के साथ सफलतापूर्वक मैप किया गया।' });
});

export default subjectsApp;
