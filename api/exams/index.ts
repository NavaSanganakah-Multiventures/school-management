import { Hono } from 'hono';
import { getDB } from '../db';
import { getAuthUser, getRequestSchoolId } from '../lib/auth';

const examsApp = new Hono();

function gradeFor(p: any) {
  if (p >= 90) return 'A+';
  if (p >= 75) return 'A';
  if (p >= 60) return 'B+';
  if (p >= 45) return 'B';
  if (p >= 33) return 'C';
  return 'D';
}

// GET /api/exams - real exam schedule from D1 (no demo data)
examsApp.get('/', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  const schoolId = getRequestSchoolId(c, authUser);
  const rows = await db.prepare('SELECT * FROM exams WHERE school_id = ? ORDER BY start_date ASC').bind(schoolId).all();
  const exams = (rows.results || []).map((r) => ({
    id: r.id,
    name: r.exam_name,
    classes: r.term || '',
    startDate: r.start_date || '',
    endDate: r.end_date || '',
    status: r.is_active ? 'Scheduled' : 'Completed',
  }));
  return c.json({ success: true, exams });
});

// GET /api/exams/report-card/:studentId - real report card computed from marks (no demo data)
examsApp.get('/report-card/:studentId', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  const schoolId = getRequestSchoolId(c, authUser);
  const studentId = c.req.param('studentId');

  const st = await db.prepare('SELECT * FROM students WHERE school_id = ? AND id = ?').bind(schoolId, studentId).first();
  if (!st) return c.json({ success: false, message: 'छात्र रिपोर्ट कार्ड नहीं मिला' }, 404);

  const mRows = await db.prepare('SELECT em.subject, em.max_marks, em.marks_obtained, em.grade, e.exam_name, e.academic_year, e.term FROM exam_marks em LEFT JOIN exams e ON e.id = em.exam_id WHERE em.student_id = ? AND em.school_id = ?').bind(studentId, schoolId).all();
  const marks = mRows.results || [];
  if (marks.length === 0) {
    return c.json({ success: false, message: 'अभी तक इस छात्र के लिए कोई परीक्षा अंक दर्ज नहीं हैं।' }, 404);
  }
  const subjects = marks.map((m) => ({ subject: m.subject, marks: m.marks_obtained, maxMarks: m.max_marks, grade: m.grade || gradeFor(m.max_marks ? (m.marks_obtained / m.max_marks) * 100 : 0) }));
  const totalMarks = subjects.reduce((a, s) => a + s.marks, 0);
  const maxTotal = subjects.reduce((a, s) => a + s.maxMarks, 0);
  const percentage = maxTotal > 0 ? +((totalMarks / maxTotal) * 100).toFixed(1) : 0;
  const firstMark = marks[0];
  const fullName = (st.first_name || '') + (st.last_name ? ' ' + st.last_name : '');
  const reportCard = {
    studentId,
    studentName: fullName,
    rollNumber: st.roll_number,
    className: st.class_name,
    term: firstMark.exam_name || firstMark.term || '',
    subjects,
    totalMarks,
    maxTotal,
    percentage,
    finalGrade: gradeFor(percentage),
    result: percentage >= 33 ? 'Pass' : 'Fail',
  };
  return c.json({ success: true, reportCard });
});

export default examsApp;
