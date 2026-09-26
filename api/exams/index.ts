import { Hono } from 'hono';
import { getDB } from '../db';
import { getAuthUser, getRequestSchoolId } from '../lib/auth';
import { logActivity, resolveActorName } from '../lib/activity-logger';
import { canActOnStudent, getFamilyStudentScope, requireSession, type Role } from '../lib/rbac';

const examsApp = new Hono<{ Bindings: any }>();

// Route guards (deny-by-default; see api/lib/rbac.ts).
const requireAnyUser = requireSession();
const requireManager = requireSession({ roles: ['Director', 'Principal'] as Role[] });
const requireAcademics = requireSession({
  roles: ['Director', 'Principal', 'Staff', 'Teacher'] as Role[],
});

function gradeFor(percentage: number) {
  if (percentage >= 90) return 'A+';
  if (percentage >= 75) return 'A';
  if (percentage >= 60) return 'B+';
  if (percentage >= 45) return 'B';
  if (percentage >= 33) return 'C';
  return 'D';
}

// GET /api/exams - exam schedule from D1
examsApp.get('/', async (c) => {
  const guard = await requireAnyUser(c);
  if (!guard.ok) return guard.response;
  const { db, schoolId } = guard;
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);

  let rows = await db.prepare('SELECT * FROM exams WHERE school_id = ? ORDER BY start_date ASC').bind(schoolId).all();

  // If no exams exist yet for this school, seed standard default exams
  if (!rows.results || rows.results.length === 0) {
    const defaultExams = [
      { id: `ex-${schoolId}-mid`, name: 'अर्धवार्षिक परीक्षा 2026 (Mid-Term Exam)', year: '2026-27', term: 'कक्षा 1 से 12', start: '2026-09-25', end: '2026-10-05' },
      { id: `ex-${schoolId}-ann`, name: 'वार्षिक बोर्ड / सत्र परीक्षा 2027 (Annual Exam)', year: '2026-27', term: 'कक्षा 1 से 12', start: '2027-02-15', end: '2027-03-05' },
    ];
    for (const ex of defaultExams) {
      await db.prepare('INSERT OR IGNORE INTO exams (id, exam_name, academic_year, term, start_date, end_date, is_active, school_id) VALUES (?,?,?,?,?,?,?,?)')
        .bind(ex.id, ex.name, ex.year, ex.term, ex.start, ex.end, 1, schoolId).run();
    }
    rows = await db.prepare('SELECT * FROM exams WHERE school_id = ? ORDER BY start_date ASC').bind(schoolId).all();
  }

  const exams = (rows.results || []).map((r: any) => ({
    id: r.id,
    name: r.exam_name,
    academicYear: r.academic_year || '2026-27',
    classes: r.term || '',
    startDate: r.start_date || '',
    endDate: r.end_date || '',
    status: r.is_active ? 'Scheduled' : 'Completed',
  }));
  return c.json({ success: true, exams });
});

// POST /api/exams - create a new exam
//
// AUTHORIZATION CHANGE: management only. Exam creation previously accepted any
// authenticated role, so a Student could fabricate school examinations.
examsApp.post('/', async (c) => {
  const guard = await requireManager(c);
  if (!guard.ok) return guard.response;
  const { db, schoolId } = guard;
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);

  const body = await c.req.json().catch(() => ({}));
  if (!body.examName) {
    return c.json({ success: false, message: 'परीक्षा का नाम आवश्यक है।' }, 400);
  }

  const examId = 'ex-' + Date.now();
  await db.prepare(
    'INSERT INTO exams (id, exam_name, academic_year, term, start_date, end_date, is_active, school_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    examId,
    body.examName,
    body.academicYear || '2026-27',
    body.term || body.classes || 'समस्त कक्षाएं',
    body.startDate || new Date().toISOString().split('T')[0],
    body.endDate || new Date().toISOString().split('T')[0],
    1,
    schoolId
  ).run();

  return c.json({
    success: true,
    message: 'नई परीक्षा सफलतापूर्वक जोड़ी गई।',
    exam: {
      id: examId,
      name: body.examName,
      academicYear: body.academicYear || '2026-27',
      classes: body.term || body.classes || 'समस्त कक्षाएं',
      startDate: body.startDate,
      endDate: body.endDate,
      status: 'Scheduled',
    },
  });
});

// GET /api/exams/marks - get marks for a student or exam
//
// A family role is scoped to its own linked children. Without this, a parent
// could omit studentId and receive the marks of every student in the school.
examsApp.get('/marks', async (c) => {
  const guard = await requireAnyUser(c);
  if (!guard.ok) return guard.response;
  const { db, schoolId, user } = guard;
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const studentId = c.req.query('studentId');
  const examId = c.req.query('examId');

  let query = 'SELECT * FROM exam_marks WHERE school_id = ?';
  const params: any[] = [schoolId];
  if (studentId) {
    if (!(await canActOnStudent(guard, studentId))) {
      return c.json({ success: false, message: 'आपको इस छात्र के अंक देखने की अनुमति नहीं है।' }, 403);
    }
    query += ' AND student_id = ?';
    params.push(studentId);
  } else if (user.role === 'Parent' || user.role === 'Student') {
    const scope = await getFamilyStudentScope(guard);
    if (!scope || scope.size === 0) return c.json({ success: true, marks: [] });
    query += ' AND student_id IN (' + Array.from(scope).map(() => '?').join(',') + ')';
    params.push(...Array.from(scope));
  }
  if (examId) {
    query += ' AND exam_id = ?';
    params.push(examId);
  }

  const rows = await db.prepare(query).bind(...params).all();
  return c.json({ success: true, marks: rows.results || [] });
});

// POST /api/exams/marks - enter / update marks for a student in an exam
//
// CRITICAL AUTHORIZATION FIX
// This route previously required only "a token exists", so a Student or Parent
// could overwrite the marks of any student in any class — corrupting report
// cards, analytics, grades and promotion decisions.
//
// Now restricted to management plus teaching roles, and a teaching role must be
// the assigned class teacher of the TARGET student.
examsApp.post('/marks', async (c) => {
  const guard = await requireAcademics(c);
  if (!guard.ok) return guard.response;
  const { db, schoolId, user } = guard;
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);

  const body = await c.req.json().catch(() => ({}));
  const { examId, studentId, marks } = body;

  // Enhanced validation
  if (!examId || !studentId || !Array.isArray(marks) || marks.length === 0) {
    return c.json({ success: false, message: 'परीक्षा आईडी, छात्र आईडी तथा प्राप्तांक सूची आवश्यक हैं।' }, 400);
  }

  // Verify exam exists
  const exam = await db.prepare('SELECT id, exam_name FROM exams WHERE school_id = ? AND id = ?').bind(schoolId, examId).first();
  if (!exam) {
    return c.json({ success: false, message: 'परीक्षा रिकॉर्ड नहीं मिला। कृपया सही परीक्षा चुनें।' }, 404);
  }

  // Verify student exists
  const st = await db.prepare('SELECT id, first_name, last_name, class_name, section FROM students WHERE school_id = ? AND id = ?').bind(schoolId, studentId).first();
  if (!st) {
    return c.json({ success: false, message: 'छात्र रिकॉर्ड नहीं मिला।' }, 404);
  }

  // Teaching roles may only mark their OWN assigned class.
  if (user.role === 'Staff' || user.role === 'Teacher') {
    const { isClassTeacher } = await import('../lib/permissions');
    const owns = await isClassTeacher(db, schoolId, st.class_name, user.id);
    if (!owns) {
      return c.json({
        success: false,
        message: `आप कक्षा "${st.class_name}" के अधिकृत कक्षा अध्यापक नहीं हैं, इसलिए इस छात्र के अंक दर्ज नहीं किए जा सकते।`,
      }, 403);
    }
  }

  const studentName = (st.first_name || '') + (st.last_name ? ' ' + st.last_name : '');
  const updatedSubjects: string[] = [];
  const errors: string[] = [];

  // Validate and upsert each subject mark
  for (const m of marks) {
    if (!m.subject || !m.subject.trim()) {
      errors.push('विषय का नाम खाली नहीं हो सकता।');
      continue;
    }

    const maxMarks = Number(m.maxMarks) || 100;
    let marksObtained = Number(m.marksObtained);

    // Validation: marks should be valid number
    if (isNaN(marksObtained)) {
      errors.push(`विषय "${m.subject}": अमान्य अंक।`);
      continue;
    }

    // Validation: marks cannot exceed max marks
    if (marksObtained > maxMarks) {
      errors.push(`विषय "${m.subject}": प्राप्तांक (${marksObtained}) पूर्णांक (${maxMarks}) से अधिक नहीं हो सकते।`);
      marksObtained = maxMarks;
    }

    // Validation: marks cannot be negative
    if (marksObtained < 0) {
      errors.push(`विषय "${m.subject}": अंक ऋणात्मक नहीं हो सकते।`);
      continue;
    }

    const percentage = maxMarks > 0 ? (marksObtained / maxMarks) * 100 : 0;
    const grade = m.grade || gradeFor(percentage);
    const remarks = m.remarks || '';

    const existing = await db.prepare(
      'SELECT id FROM exam_marks WHERE school_id = ? AND exam_id = ? AND student_id = ? AND subject = ?'
    ).bind(schoolId, examId, studentId, m.subject.trim()).first();

    const timestamp = new Date().toISOString();

    if (existing) {
      await db.prepare(
        'UPDATE exam_marks SET max_marks = ?, marks_obtained = ?, grade = ?, remarks = ?, updated_at = ?, entered_by_user_id = ? WHERE id = ?'
      ).bind(maxMarks, marksObtained, grade, remarks, timestamp, user.id, existing.id).run();
    } else {
      const id = 'em-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
      await db.prepare(
        'INSERT INTO exam_marks (id, exam_id, student_id, subject, max_marks, marks_obtained, grade, remarks, school_id, entered_by_user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(id, examId, studentId, m.subject.trim(), maxMarks, marksObtained, grade, remarks, schoolId, user.id, timestamp, timestamp).run();
    }

    updatedSubjects.push(m.subject.trim());
  }

  // If no subjects were successfully processed, return failure
  if (updatedSubjects.length === 0) {
    return c.json({
      success: false,
      message: `किसी भी विषय के अंक दर्ज नहीं किए जा सके। सभी विषयों में त्रुटियाँ हैं।`,
      errors,
      timestamp: new Date().toISOString(),
    });
  }

  const actorName = await resolveActorName(db, user.id, user.role);
  await logActivity(db, {
    schoolId,
    userId: user.id,
    userName: actorName,
    userRole: user.role,
    actionType: 'MARKS_ENTRY',
    actionTitle: 'परीक्षा अंक प्रविष्टि',
    description: `छात्र ${studentName} (कक्षा ${st.class_name || '10वीं'} - ${st.section || ''}) के लिए परीक्षा "${exam.exam_name}" के ${updatedSubjects.length} विषयों के अंक दर्ज/अद्यतित किए गए।`,
    entityType: 'exam',
    entityId: examId,
    className: st.class_name || '10वीं',
    metadata: { studentId, studentName, examId, examName: exam.exam_name, subjects: updatedSubjects },
  });

  return c.json({
    success: updatedSubjects.length > 0,
    message: `${studentName} के लिए ${updatedSubjects.length} विषयों के अंक सफलतापूर्वक प्रविष्ट/अद्यतित किए गए।`,
    updatedSubjects,
    errors: errors.length > 0 ? errors : undefined,
    timestamp: new Date().toISOString(),
  });
});

// GET /api/exams/report-card/:studentId - report card computed from marks
//
// A family role may only request a report card for its own linked child.
examsApp.get('/report-card/:studentId', async (c) => {
  const guard = await requireAnyUser(c);
  if (!guard.ok) return guard.response;
  const { db, schoolId } = guard;
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const studentId = c.req.param('studentId');
  const examId = c.req.query('examId');

  if (!(await canActOnStudent(guard, studentId))) {
    return c.json({ success: false, message: 'आपको इस छात्र की रिपोर्ट कार्ड की अनुमति नहीं है।' }, 403);
  }

  const st = await db.prepare('SELECT * FROM students WHERE school_id = ? AND id = ?').bind(schoolId, studentId).first();
  if (!st) return c.json({ success: false, message: 'छात्र रिकॉर्ड नहीं मिला।' }, 404);

  let query = 'SELECT em.subject, em.max_marks, em.marks_obtained, em.grade, em.remarks, em.updated_at, e.id as exam_id, e.exam_name, e.academic_year, e.term, COALESCE(es.passing_marks, 33) as passing_marks FROM exam_marks em LEFT JOIN exams e ON e.id = em.exam_id LEFT JOIN exam_subjects es ON es.exam_id = em.exam_id AND es.subject_name = em.subject AND es.school_id = em.school_id WHERE em.student_id = ? AND em.school_id = ?';
  const params: any[] = [studentId, schoolId];
  if (examId) {
    query += ' AND em.exam_id = ?';
    params.push(examId);
  }
  query += ' ORDER BY em.subject ASC';

  const mRows = await db.prepare(query).bind(...params).all();
  const marks = mRows.results || [];

  // Real data validation: If no marks exist, return empty state with proper message
  if (marks.length === 0) {
    const fullName = (st.first_name || '') + (st.last_name ? ' ' + st.last_name : '');
    return c.json({
      success: false,
      message: 'इस छात्र के लिए कोई परीक्षा अंक प्रविष्ट नहीं हुए हैं। कृपया पहले अंक प्रविष्टि करें।',
      hasData: false,
      studentInfo: {
        studentId,
        studentName: fullName,
        scholarNumber: st.scholar_number || st.roll_number || '',
        rollNumber: st.roll_number || '',
        className: st.class_name || '',
        section: st.section || '',
      },
    });
  }

  // Calculate real-time statistics from actual marks
  const subjects = marks.map((m: any) => {
    const marksObtained = Number(m.marks_obtained) || 0;
    const maxMarks = Number(m.max_marks) || 100;
    const passingMarks = Number(m.passing_marks) || 33;
    const percentage = maxMarks > 0 ? (marksObtained / maxMarks) * 100 : 0;
    return {
      subject: m.subject,
      marks: marksObtained,
      maxMarks: maxMarks,
      passingMarks: passingMarks,
      grade: m.grade || gradeFor(percentage),
      remarks: m.remarks || (marksObtained >= passingMarks ? 'उत्तीर्ण' : 'अनुत्तीर्ण'),
      percentage: +percentage.toFixed(1),
      isPassed: marksObtained >= passingMarks,
    };
  });

  const totalMarks = subjects.reduce((a: number, s: any) => a + s.marks, 0);
  const maxTotal = subjects.reduce((a: number, s: any) => a + s.maxMarks, 0);
  const percentage = maxTotal > 0 ? +((totalMarks / maxTotal) * 100).toFixed(1) : 0;
  const firstMark = marks[0] || {};
  const fullName = (st.first_name || '') + (st.last_name ? ' ' + st.last_name : '');

  // Get latest update timestamp
  const lastUpdated = marks.reduce((latest: string, m: any) => {
    const updated = m.updated_at || m.created_at || '';
    return updated > latest ? updated : latest;
  }, '');

  // Determine division
  let division = '';
  if (percentage >= 60) {
    division = 'प्रथम श्रेणी (First Division)';
  } else if (percentage >= 45) {
    division = 'द्वितीय श्रेणी (Second Division)';
  } else if (percentage >= 33) {
    division = 'तृतीय श्रेणी (Third Division)';
  } else {
    division = 'अनुत्तीर्ण (Fail)';
  }

  const reportCard = {
    studentId,
    studentName: fullName,
    scholarNumber: st.scholar_number || st.roll_number || '',
    rollNumber: st.roll_number || '',
    className: st.class_name || '',
    section: st.section || '',
    fatherName: st.father_name || st.parent_name || '',
    motherName: st.mother_name || '',
    dob: st.dob || '',
    admissionDate: st.admission_date || '',
    term: firstMark.exam_name || firstMark.term || '',
    academicYear: firstMark.academic_year || '2026-27',
    examId: firstMark.exam_id || examId || '',
    subjects,
    totalMarks,
    maxTotal,
    percentage,
    finalGrade: gradeFor(percentage),
    result: subjects.every((s: any) => s.isPassed) ? 'उत्तीर्ण (PASS)' : 'अनुत्तीर्ण (FAIL)',
    division,
    lastUpdated,
    hasData: true,
  };

  return c.json({ success: true, reportCard, lastUpdated });
});

// GET /api/exams/terms - List exam terms
examsApp.get('/terms', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);
  const schoolId = getRequestSchoolId(c, authUser);

  const terms = await db.prepare('SELECT * FROM exam_terms WHERE school_id = ? ORDER BY created_at ASC').bind(schoolId).all();
  return c.json({ success: true, examTerms: terms.results || [] });
});

// POST /api/exams/terms - Add an exam term
examsApp.post('/terms', async (c) => {
  const db = getDB(c);
  const authUser = await getAuthUser(c);
  if (!authUser || (authUser.role !== 'Director' && authUser.role !== 'Principal')) {
    return c.json({ success: false, message: 'अनधिकृत पहुँच।' }, 403);
  }
  const schoolId = getRequestSchoolId(c, authUser);
  const body = await c.req.json().catch(() => ({}));

  if (!body.termName) {
    return c.json({ success: false, message: 'टर्म का नाम (Term Name) आवश्यक है।' }, 400);
  }

  const id = `term-${crypto.randomUUID()}`;
  await db.prepare('INSERT INTO exam_terms (id, school_id, term_name, weightage_percent) VALUES (?, ?, ?, ?)')
    .bind(id, schoolId, body.termName.trim(), parseFloat(body.weightagePercent) || 100).run();

  return c.json({ success: true, message: 'परीक्षा टर्म सफलतापूर्वक जोड़ा गया।', id });
});

// GET /api/exams/:examId/subjects - Get subjects configured for an exam
examsApp.get('/:examId/subjects', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);
  const schoolId = getRequestSchoolId(c, authUser);
  const examId = c.req.param('examId');

  const subjects = await db.prepare(
    'SELECT * FROM exam_subjects WHERE school_id = ? AND exam_id = ? ORDER BY subject_name ASC'
  ).bind(schoolId, examId).all();

  return c.json({ success: true, subjects: subjects.results || [] });
});

// POST /api/exams/:examId/subjects - Add subject to exam
examsApp.post('/:examId/subjects', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser || (authUser.role !== 'Director' && authUser.role !== 'Principal')) {
    return c.json({ success: false, message: 'केवल प्रधानाचार्य या निदेशक ही परीक्षा विषय जोड़ सकते हैं।' }, 403);
  }
  const schoolId = getRequestSchoolId(c, authUser);
  const examId = c.req.param('examId');
  const body = await c.req.json().catch(() => ({}));

  if (!body.subjectName) {
    return c.json({ success: false, message: 'विषय का नाम आवश्यक है।' }, 400);
  }

  const exam = await db.prepare('SELECT id FROM exams WHERE school_id = ? AND id = ?').bind(schoolId, examId).first();
  if (!exam) {
    return c.json({ success: false, message: 'परीक्षा नहीं मिली।' }, 404);
  }

  const id = 'exsub-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  await db.prepare(
    'INSERT INTO exam_subjects (id, school_id, exam_id, subject_id, subject_name, max_marks, passing_marks, subject_type, weightage_percent, is_optional) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    id,
    schoolId,
    examId,
    body.subjectId || `sub-${body.subjectName.toLowerCase().replace(/\s+/g, '-')}`,
    body.subjectName,
    Number(body.maxMarks) || 100,
    Number(body.passingMarks) || 33,
    body.subjectType || 'Theory',
    Number(body.weightagePercent) || 100,
    body.isOptional ? 1 : 0
  ).run();

  return c.json({ success: true, message: `विषय "${body.subjectName}" सफलतापूर्वक जोड़ा गया।`, id });
});

// GET /api/exams/templates - Get all report card templates
examsApp.get('/templates', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);

  const templates = await db.prepare(
    'SELECT * FROM report_card_templates WHERE is_active = 1 ORDER BY is_default DESC, template_name ASC'
  ).all();

  return c.json({ success: true, templates: templates.results || [] });
});

// GET /api/exams/school-preferences - Get school's report preferences
examsApp.get('/school-preferences', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);
  const schoolId = getRequestSchoolId(c, authUser);

  let prefs = await db.prepare('SELECT * FROM school_preferences WHERE school_id = ?').bind(schoolId).first();

  // Create default preferences if not exist
  if (!prefs) {
    const id = 'pref-' + schoolId;
    await db.prepare(
      'INSERT INTO school_preferences (id, school_id, default_report_template_id) VALUES (?, ?, ?)'
    ).bind(id, schoolId, 'template_cbse').run();
    prefs = await db.prepare('SELECT * FROM school_preferences WHERE school_id = ?').bind(schoolId).first();
  }

  return c.json({ success: true, preferences: prefs });
});

// PUT /api/exams/school-preferences - Update school's report preferences
examsApp.put('/school-preferences', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser || (authUser.role !== 'Director' && authUser.role !== 'Principal')) {
    return c.json({ success: false, message: 'केवल प्रधानाचार्य या निदेशक ही प्राथमिकताएं बदल सकते हैं।' }, 403);
  }
  const schoolId = getRequestSchoolId(c, authUser);
  const body = await c.req.json().catch(() => ({}));

  const existing = await db.prepare('SELECT id FROM school_preferences WHERE school_id = ?').bind(schoolId).first();

  if (existing) {
    await db.prepare(
      'UPDATE school_preferences SET default_report_template_id = ?, school_logo_url = ?, school_seal_url = ?, custom_header = ?, custom_footer = ?, show_attendance_in_report = ?, show_remarks_in_report = ?, auto_calculate_grades = ?, updated_at = ? WHERE school_id = ?'
    ).bind(
      body.defaultReportTemplateId || 'template_cbse',
      body.schoolLogoUrl || null,
      body.schoolSealUrl || null,
      body.customHeader || null,
      body.customFooter || null,
      body.showAttendanceInReport ? 1 : 0,
      body.showRemarksInReport !== false ? 1 : 0,
      body.autoCalculateGrades !== false ? 1 : 0,
      new Date().toISOString(),
      schoolId
    ).run();
  } else {
    const id = 'pref-' + schoolId;
    await db.prepare(
      'INSERT INTO school_preferences (id, school_id, default_report_template_id, school_logo_url, school_seal_url, custom_header, custom_footer, show_attendance_in_report, show_remarks_in_report, auto_calculate_grades) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      id,
      schoolId,
      body.defaultReportTemplateId || 'template_cbse',
      body.schoolLogoUrl || null,
      body.schoolSealUrl || null,
      body.customHeader || null,
      body.customFooter || null,
      body.showAttendanceInReport ? 1 : 0,
      body.showRemarksInReport !== false ? 1 : 0,
      body.autoCalculateGrades !== false ? 1 : 0
    ).run();
  }

  return c.json({ success: true, message: 'स्कूल प्राथमिकताएं सफलतापूर्वक अद्यतित की गईं।' });
});

// GET /api/exams/analytics/:examId - Get result analytics for an exam
examsApp.get('/analytics/:examId', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);
  const schoolId = getRequestSchoolId(c, authUser);
  const examId = c.req.param('examId');
  const dateRange = c.req.query('dateRange') || 'monthly';

  // Get exam details
  const exam = await db.prepare('SELECT * FROM exams WHERE school_id = ? AND id = ?').bind(schoolId, examId).first();
  if (!exam) {
    return c.json({ success: false, message: 'परीक्षा नहीं मिली।' }, 404);
  }

  // Get all marks for this exam
  const marksRows = await db.prepare(
    'SELECT em.*, s.class_name, s.section FROM exam_marks em JOIN students s ON s.id = em.student_id WHERE em.school_id = ? AND em.exam_id = ?'
  ).bind(schoolId, examId).all();

  const marks = marksRows.results || [];

  // Calculate analytics based on date range
  const studentMarksMap = new Map<string, { totalMarks: number; maxTotal: number; className: string; section: string }>();

  // Date range filtering logic (currently exams are single-time events, but we can filter by exam dates if needed)
  let dateRangeInfo = 'All data';
  if (dateRange === 'weekly') {
    dateRangeInfo = 'Last 7 days';
  } else if (dateRange === 'monthly') {
    dateRangeInfo = 'Last 30 days';
  } else if (dateRange === 'quarterly') {
    dateRangeInfo = 'Last 90 days';
  }

  marks.forEach((m: any) => {
    const key = m.student_id;
    if (!studentMarksMap.has(key)) {
      studentMarksMap.set(key, { totalMarks: 0, maxTotal: 0, className: m.class_name, section: m.section });
    }
    const data = studentMarksMap.get(key)!;
    data.totalMarks += Number(m.marks_obtained) || 0;
    data.maxTotal += Number(m.max_marks) || 100;
  });

  const studentResults = Array.from(studentMarksMap.entries()).map(([studentId, data]) => {
    const percentage = data.maxTotal > 0 ? (data.totalMarks / data.maxTotal) * 100 : 0;
    return { studentId, ...data, percentage, passed: percentage >= 33 };
  });

  const totalStudents = studentResults.length;
  const studentsPassed = studentResults.filter((s) => s.passed).length;
  const passPercentage = totalStudents > 0 ? (studentsPassed / totalStudents) * 100 : 0;
  const averagePercentage = totalStudents > 0 ? studentResults.reduce((a, s) => a + s.percentage, 0) / totalStudents : 0;
  const highestPercentage = Math.max(...studentResults.map((s) => s.percentage), 0);
  const lowestPercentage = Math.min(...studentResults.map((s) => s.percentage), 100);

  const topper = studentResults.find((s) => s.percentage === highestPercentage);

  // Subject-wise analysis
  const subjectStatsMap = new Map<string, { totalMarks: number; maxMarks: number; count: number; highest: number; lowest: number }>();
  marks.forEach((m: any) => {
    const key = m.subject;
    if (!subjectStatsMap.has(key)) {
      subjectStatsMap.set(key, { totalMarks: 0, maxMarks: 0, count: 0, highest: 0, lowest: 100 });
    }
    const data = subjectStatsMap.get(key)!;
    const marksObtained = Number(m.marks_obtained) || 0;
    const maxMarks = Number(m.max_marks) || 100;
    data.totalMarks += marksObtained;
    data.maxMarks += maxMarks;
    data.count++;
    data.highest = Math.max(data.highest, marksObtained);
    data.lowest = Math.min(data.lowest, marksObtained);
  });

  const subjectWiseAnalysis = Array.from(subjectStatsMap.entries()).map(([subject, data]) => {
    const averageMarks = data.count > 0 ? data.totalMarks / data.count : 0;
    const averagePercentage = data.maxMarks > 0 ? (data.totalMarks / data.maxMarks) * 100 : 0;
    const passCount = marks.filter((m: any) => m.subject === subject && ((Number(m.marks_obtained) || 0) >= (Number(m.max_marks) || 100) * 0.33)).length;
    const passPercentage = data.count > 0 ? (passCount / data.count) * 100 : 0;

    return {
      subject,
      averageMarks: +averageMarks.toFixed(1),
      maxMarks: data.maxMarks / data.count,
      passPercentage: +passPercentage.toFixed(1),
      highestMarks: data.highest,
      lowestMarks: data.lowest,
    };
  });

  // Class-wise analysis
  const classStatsMap = new Map<string, { totalStudents: number; studentsPassed: number; totalPercentage: number }>();
  studentResults.forEach((s) => {
    const key = s.className || 'Unknown';
    if (!classStatsMap.has(key)) {
      classStatsMap.set(key, { totalStudents: 0, studentsPassed: 0, totalPercentage: 0 });
    }
    const data = classStatsMap.get(key)!;
    data.totalStudents++;
    if (s.passed) data.studentsPassed++;
    data.totalPercentage += s.percentage;
  });

  const classWiseAnalysis = Array.from(classStatsMap.entries()).map(([className, data]) => ({
    className,
    totalStudents: data.totalStudents,
    studentsPassed: data.studentsPassed,
    passPercentage: data.totalStudents > 0 ? +((data.studentsPassed / data.totalStudents) * 100).toFixed(1) : 0,
    averagePercentage: data.totalStudents > 0 ? +(data.totalPercentage / data.totalStudents).toFixed(1) : 0,
  }));

  // Count students who actually scored above 90%
  const studentsAbove90 = studentResults.filter(s => s.percentage >= 90).length;

  // Compute real grade distribution from actual student percentages
  const gradeDistribution = [
    { range: '90-100%', label: 'A+ (Outstanding)', count: studentResults.filter(s => s.percentage >= 90).length },
    { range: '75-89%', label: 'A (Excellent)', count: studentResults.filter(s => s.percentage >= 75 && s.percentage < 90).length },
    { range: '60-74%', label: 'B+ (Good)', count: studentResults.filter(s => s.percentage >= 60 && s.percentage < 75).length },
    { range: '45-59%', label: 'B (Satisfactory)', count: studentResults.filter(s => s.percentage >= 45 && s.percentage < 60).length },
    { range: '33-44%', label: 'C (Pass)', count: studentResults.filter(s => s.percentage >= 33 && s.percentage < 45).length },
    { range: 'Below 33%', label: 'D (Fail)', count: studentResults.filter(s => s.percentage < 33).length },
  ];

  return c.json({
    success: true,
    analytics: {
      examId,
      examName: exam.exam_name,
      dateRange,
      totalStudents,
      studentsPassed,
      studentsAbove90,
      passPercentage: +passPercentage.toFixed(1),
      averagePercentage: +averagePercentage.toFixed(1),
      highestPercentage: +highestPercentage.toFixed(1),
      lowestPercentage: +lowestPercentage.toFixed(1),
      topperStudentId: topper?.studentId || null,
      subjectWiseAnalysis,
      classWiseAnalysis,
      gradeDistribution,
    },
  });
});

export default examsApp;
