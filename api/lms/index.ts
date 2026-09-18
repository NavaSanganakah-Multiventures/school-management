import { Hono } from 'hono';
import { getDB } from '../db';
import { getAuthUser, getRequestSchoolId } from '../lib/auth';
import { logActivity } from '../lib/activity-logger';

const lmsApp = new Hono<{ Bindings: any }>();

// 1. GET /api/lms/stats - Overview statistics for LMS dashboard
lmsApp.get('/stats', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);

  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'अनधिकृत। कृपया लॉगिन करें।' }, 401);
  const schoolId = getRequestSchoolId(c, authUser);

  try {
    const coursesCount = await db.prepare(
      'SELECT COUNT(*) as count FROM lms_courses WHERE school_id = ?'
    ).bind(schoolId).first();

    const lessonsCount = await db.prepare(
      'SELECT COUNT(*) as count FROM lms_lessons WHERE school_id = ?'
    ).bind(schoolId).first();

    const assignmentsCount = await db.prepare(
      'SELECT COUNT(*) as count FROM lms_assignments WHERE school_id = ?'
    ).bind(schoolId).first();

    const submissionsCount = await db.prepare(
      'SELECT COUNT(*) as count FROM lms_submissions WHERE school_id = ?'
    ).bind(schoolId).first();

    return c.json({
      success: true,
      stats: {
        totalCourses: Number(coursesCount?.count || 0),
        totalLessons: Number(lessonsCount?.count || 0),
        totalAssignments: Number(assignmentsCount?.count || 0),
        totalSubmissions: Number(submissionsCount?.count || 0),
      }
    });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

// 2. GET /api/lms/courses - List courses for the school
lmsApp.get('/courses', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);

  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'अनधिकृत।' }, 401);
  const schoolId = getRequestSchoolId(c, authUser);

  const className = c.req.query('className');
  const subject = c.req.query('subject');

  try {
    let query = 'SELECT * FROM lms_courses WHERE school_id = ?';
    const params: any[] = [schoolId];

    if (className) {
      query += ' AND class_name = ?';
      params.push(className);
    }
    if (subject) {
      query += ' AND subject = ?';
      params.push(subject);
    }

    query += ' ORDER BY created_at DESC';

    const { results } = await db.prepare(query).bind(...params).all();
    return c.json({ success: true, courses: results || [] });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

// 3. POST /api/lms/courses - Create a new course
lmsApp.post('/courses', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);

  const authUser = await getAuthUser(c);
  if (!authUser || (authUser.role !== 'Director' && authUser.role !== 'Principal' && authUser.role !== 'Staff')) {
    return c.json({ success: false, message: 'केवल शिक्षक एवं व्यवस्थापक ही नया कोर्स बना सकते हैं।' }, 403);
  }
  const schoolId = getRequestSchoolId(c, authUser);

  const body = await c.req.json().catch(() => ({}));
  const { title, className, subject, description, thumbnailUrl } = body;

  if (!title || !className || !subject) {
    return c.json({ success: false, message: 'कोर्स का शीर्षक, कक्षा और विषय अनिवार्य हैं।' }, 400);
  }

  const courseId = `crs-${crypto.randomUUID()}`;

  try {
    await db.prepare(`
      INSERT INTO lms_courses (id, school_id, class_name, subject, title, description, teacher_id, teacher_name, thumbnail_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      courseId,
      schoolId,
      className,
      subject,
      title.trim(),
      description?.trim() || '',
      authUser.sub || '',
      authUser.fullName || authUser.role,
      thumbnailUrl?.trim() || null
    ).run();

    await logActivity(db, {
      schoolId,
      userId: authUser.sub,
      userName: authUser.fullName || authUser.role,
      userRole: authUser.role,
      actionType: 'CREATE_LMS_COURSE',
      actionTitle: 'नया LMS कोर्स बनाया गया',
      description: `कोर्स '${title}' (कक्षा: ${className}, विषय: ${subject}) जोड़ा गया।`,
      entityType: 'LMSCourse',
      entityId: courseId,
    });

    return c.json({ success: true, message: 'कोर्स सफलतापूर्वक बनाया गया।', courseId });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

// 4. GET /api/lms/courses/:id - Course details with lessons & assignments
lmsApp.get('/courses/:id', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);

  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'अनधिकृत।' }, 401);
  const schoolId = getRequestSchoolId(c, authUser);
  const courseId = c.req.param('id');

  try {
    const course = await db.prepare(
      'SELECT * FROM lms_courses WHERE id = ? AND school_id = ?'
    ).bind(courseId, schoolId).first();

    if (!course) return c.json({ success: false, message: 'कोर्स नहीं मिला।' }, 404);

    const { results: lessons } = await db.prepare(
      'SELECT * FROM lms_lessons WHERE course_id = ? AND school_id = ? ORDER BY sequence_order ASC, created_at ASC'
    ).bind(courseId, schoolId).all();

    const { results: assignments } = await db.prepare(
      'SELECT * FROM lms_assignments WHERE course_id = ? AND school_id = ? ORDER BY created_at DESC'
    ).bind(courseId, schoolId).all();

    return c.json({
      success: true,
      course,
      lessons: lessons || [],
      assignments: assignments || [],
    });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

// 5. POST /api/lms/courses/:id/lessons - Add lesson
lmsApp.post('/courses/:id/lessons', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);

  const authUser = await getAuthUser(c);
  if (!authUser || (authUser.role !== 'Director' && authUser.role !== 'Principal' && authUser.role !== 'Staff')) {
    return c.json({ success: false, message: 'अनधिकृत।' }, 403);
  }
  const schoolId = getRequestSchoolId(c, authUser);
  const courseId = c.req.param('id');

  const body = await c.req.json().catch(() => ({}));
  const { title, description, contentType, contentUrl, durationMins, sequenceOrder } = body;

  if (!title) return c.json({ success: false, message: 'पाठ का शीर्षक अनिवार्य है।' }, 400);

  const lessonId = `lsn-${crypto.randomUUID()}`;

  try {
    await db.prepare(`
      INSERT INTO lms_lessons (id, school_id, course_id, title, description, content_type, content_url, duration_mins, sequence_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      lessonId,
      schoolId,
      courseId,
      title.trim(),
      description?.trim() || '',
      contentType || 'video',
      contentUrl?.trim() || null,
      Number(durationMins || 15),
      Number(sequenceOrder || 1)
    ).run();

    return c.json({ success: true, message: 'पाठ सफलतापूर्वक जोड़ा गया।', lessonId });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

// 6. POST /api/lms/courses/:id/assignments - Create assignment
lmsApp.post('/courses/:id/assignments', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);

  const authUser = await getAuthUser(c);
  if (!authUser || (authUser.role !== 'Director' && authUser.role !== 'Principal' && authUser.role !== 'Staff')) {
    return c.json({ success: false, message: 'अनधिकृत।' }, 403);
  }
  const schoolId = getRequestSchoolId(c, authUser);
  const courseId = c.req.param('id');

  const body = await c.req.json().catch(() => ({}));
  const { title, instructions, dueDate, maxMarks, attachmentUrl } = body;

  if (!title || !dueDate) {
    return c.json({ success: false, message: 'असाइनमेंट शीर्षक एवं अंतिम तिथि अनिवार्य हैं।' }, 400);
  }

  const assignmentId = `asg-${crypto.randomUUID()}`;

  try {
    await db.prepare(`
      INSERT INTO lms_assignments (id, school_id, course_id, title, instructions, due_date, max_marks, attachment_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      assignmentId,
      schoolId,
      courseId,
      title.trim(),
      instructions?.trim() || '',
      dueDate,
      Number(maxMarks || 100),
      attachmentUrl?.trim() || null
    ).run();

    return c.json({ success: true, message: 'असाइनमेंट सफलतापूर्वक बनाया गया।', assignmentId });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

// 7. GET /api/lms/assignments/:id/submissions - Submissions for assignment
lmsApp.get('/assignments/:id/submissions', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);

  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'अनधिकृत।' }, 401);
  const schoolId = getRequestSchoolId(c, authUser);
  const assignmentId = c.req.param('id');

  try {
    const { results } = await db.prepare(
      'SELECT * FROM lms_submissions WHERE assignment_id = ? AND school_id = ? ORDER BY submitted_at DESC'
    ).bind(assignmentId, schoolId).all();

    return c.json({ success: true, submissions: results || [] });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

// 8. POST /api/lms/assignments/:id/submit - Submit assignment work
lmsApp.post('/assignments/:id/submit', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);

  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'अनधिकृत।' }, 401);
  const schoolId = getRequestSchoolId(c, authUser);
  const assignmentId = c.req.param('id');

  const body = await c.req.json().catch(() => ({}));
  const { submissionText, attachmentUrl, studentName } = body;

  const submissionId = `subm-${crypto.randomUUID()}`;

  try {
    await db.prepare(`
      INSERT INTO lms_submissions (id, school_id, assignment_id, student_id, student_name, submission_text, attachment_url)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      submissionId,
      schoolId,
      assignmentId,
      authUser.sub || 'student',
      studentName || authUser.fullName || 'छात्र',
      submissionText?.trim() || '',
      attachmentUrl?.trim() || null
    ).run();

    return c.json({ success: true, message: 'असाइनमेंट सफलतापूर्वक सबमिट किया गया।', submissionId });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

// 9. POST /api/lms/submissions/:id/grade - Grade submission (Teacher/Principal)
lmsApp.post('/submissions/:id/grade', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);

  const authUser = await getAuthUser(c);
  if (!authUser || (authUser.role !== 'Director' && authUser.role !== 'Principal' && authUser.role !== 'Staff')) {
    return c.json({ success: false, message: 'अनधिकृत।' }, 403);
  }
  const schoolId = getRequestSchoolId(c, authUser);
  const submissionId = c.req.param('id');

  const body = await c.req.json().catch(() => ({}));
  const { marksObtained, teacherFeedback } = body;

  try {
    await db.prepare(`
      UPDATE lms_submissions
      SET marks_obtained = ?, teacher_feedback = ?, status = 'graded', graded_at = CURRENT_TIMESTAMP
      WHERE id = ? AND school_id = ?
    `).bind(Number(marksObtained || 0), teacherFeedback?.trim() || '', submissionId, schoolId).run();

    return c.json({ success: true, message: 'अंक एवं फीडबैक सफलतापूर्वक दर्ज किए गए।' });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

export default lmsApp;
