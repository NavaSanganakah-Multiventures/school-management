import { Hono } from 'hono';
import { getDB } from '../db';
import { getAuthUser, getRequestSchoolId } from '../lib/auth';

const attendanceApp = new Hono<{ Bindings: any }>();

// GET /api/attendance
attendanceApp.get('/', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  const schoolId = getRequestSchoolId(c, authUser);
  const date = c.req.query('date') || new Date().toISOString().split('T')[0];
  const className = c.req.query('class');

  const sRows = await db.prepare('SELECT id, first_name, last_name, class_name, section, roll_number, scholar_number, status FROM students WHERE school_id = ? AND status = ?').bind(schoolId, 'Active').all();
  const students = (sRows.results || []);
  const aRows = await db.prepare('SELECT * FROM attendance WHERE school_id = ? AND date = ?').bind(schoolId, date).all();
  const attMap: Record<string, any> = {};
  (aRows.results || []).forEach((a) => { attMap[a.student_id] = a; });

  let list = students.map((s) => {
    const a = attMap[s.id];
    const fullName = (s.first_name || '') + (s.last_name ? ' ' + s.last_name : '');
    return {
      id: a ? a.id : ('att-' + s.id + '-' + date),
      studentId: s.id,
      studentName: fullName,
      scholarNumber: s.scholar_number || s.roll_number || '',
      className: s.class_name,
      section: s.section,
      date,
      status: a ? a.status : 'Present',
      remarks: a ? (a.remarks || '') : '',
      markedBy: a ? (a.marked_by || '') : 'कक्षा अध्यापक (Class Teacher)',
    };
  });

  if (className && className !== 'All') {
    list = list.filter((r) => r.className.toLowerCase() === className.toLowerCase());
  }

  const total = list.length;
  const present = list.filter((r) => r.status === 'Present').length;
  const absent = list.filter((r) => r.status === 'Absent').length;
  const leave = list.filter((r) => r.status === 'Leave').length;
  const rate = total > 0 ? Math.round((present / total) * 100) : 0;

  return c.json({ success: true, date, stats: { total, present, absent, leave, rate }, records: list });
});

// POST /api/attendance/mark
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

  const student = await db.prepare('SELECT id FROM students WHERE id = ? AND school_id = ?').bind(studentId, schoolId).first();
  if (!student) return c.json({ success: false, message: 'छात्र नहीं मिला।' }, 404);

  const id = 'att-' + studentId + '-' + targetDate;
  await db.prepare('INSERT INTO attendance (id, student_id, date, status, remarks, marked_by, school_id) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status, remarks=excluded.remarks, marked_by=excluded.marked_by')
    .bind(id, studentId, targetDate, status, body.remarks || '', body.markedBy || 'स्टाफ शिक्षक', schoolId).run();

  return c.json({ success: true, message: 'उपस्थिति दर्ज की गई।' });
});

// POST /api/attendance/mark-all-present
attendanceApp.post('/mark-all-present', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);
  const schoolId = getRequestSchoolId(c, authUser);
  const body = await c.req.json().catch(() => ({}));
  const targetDate = body.date || new Date().toISOString().split('T')[0];
  const className = body.className;

  let sRows;
  if (className && className !== 'All') {
    sRows = await db.prepare('SELECT id FROM students WHERE school_id = ? AND status = ? AND class_name = ?').bind(schoolId, 'Active', className).all();
  } else {
    sRows = await db.prepare('SELECT id FROM students WHERE school_id = ? AND status = ?').bind(schoolId, 'Active').all();
  }
  const students = (sRows.results || []);
  for (const s of students) {
    const id = 'att-' + s.id + '-' + targetDate;
    await db.prepare('INSERT INTO attendance (id, student_id, date, status, remarks, marked_by, school_id) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status')
      .bind(id, s.id, targetDate, 'Present', '', 'कक्षा अध्यापक', schoolId).run();
  }
  return c.json({ success: true, message: 'कक्षा के सभी छात्रों की उपस्थिति Present मार्क कर दी गई।' });
});

export default attendanceApp;
