import { Hono } from 'hono';
import { getDB } from '../db';
import { getAuthUser, getRequestSchoolId } from '../lib/auth';
import { getPlanAccess } from '../lib/plan-access';

const studentsApp = new Hono();

function mapStudent(r: any) {
  if (!r) return null;
  const full = (r.first_name || '') + (r.last_name ? ' ' + r.last_name : '');
  let status = r.status || 'Active';
  if (status === 'Inactive' && r.tc_issue_date) status = 'TC_Issued';
  return {
    id: r.id,
    scholarNumber: r.scholar_number || r.roll_number || '',
    rollNumber: r.roll_number || '',
    fullName: full,
    fatherName: r.father_name || r.parent_name || '',
    fatherOccupation: r.father_occupation || '',
    motherName: r.mother_name || '',
    className: r.class_name || '',
    section: r.section || '',
    dob: r.dob || '',
    gender: r.gender || 'Other',
    category: r.category || 'General',
    religion: r.religion || 'Hindu',
    aadhaarNumber: r.aadhaar_number || '',
    samagraId: r.samagra_id || '',
    bloodGroup: r.blood_group || '',
    parentPhone: r.parent_phone || '',
    whatsappNumber: r.whatsapp_number || r.parent_phone || '',
    email: r.email || '',
    currentAddress: r.current_address || r.address || '',
    permanentAddress: r.permanent_address || r.address || '',
    previousSchool: r.previous_school || '',
    previousTcNo: r.previous_tc_no || '',
    admissionDate: r.admission_date || '',
    bankAccountNo: r.bank_account_no || '',
    bankName: r.bank_name || '',
    ifscCode: r.ifsc_code || '',
    status,
    tcIssueDate: r.tc_issue_date || '',
    remarks: r.remarks || '',
  };
}

async function getPlanId(db: any, schoolId: any) {
  const sub = await db.prepare('SELECT plan_id, status FROM school_subscriptions WHERE school_id = ?').bind(schoolId).first();
  if (!sub) return 'trial';
  return sub.status === 'Trial' ? 'trial' : sub.plan_id;
}

function camelToWrite(body: any) {
  const fullName = String(body.fullName || '').trim();
  const names = fullName.split(/\s+/);
  const first = names[0] || '';
  const last = names.slice(1).join(' ');
  let status = body.status || 'Active';
  if (['Active', 'Inactive', 'Suspended'].indexOf(status) === -1) status = 'Inactive';
  const gender = ['Male', 'Female', 'Other'].indexOf(body.gender) !== -1 ? body.gender : 'Other';
  const className = body.className || '';
  return {
    first,
    last,
    rollNumber: body.rollNumber || '',
    classId: body.classId || ('cls-' + className.toLowerCase().replace(/\s+/g, '-')),
    className,
    section: body.section || 'A',
    gender,
    dob: body.dob || '',
    parentName: body.fatherName || body.parentName || '',
    parentPhone: body.parentPhone || '',
    email: body.email || '',
    address: body.currentAddress || body.address || '',
    bloodGroup: body.bloodGroup || '',
    admissionDate: body.admissionDate || new Date().toISOString().split('T')[0],
    status,
    scholarNumber: body.scholarNumber || '',
    fatherName: body.fatherName || '',
    fatherOccupation: body.fatherOccupation || '',
    motherName: body.motherName || '',
    category: body.category || 'General',
    religion: body.religion || 'Hindu',
    aadhaarNumber: body.aadhaarNumber || '',
    samagraId: body.samagraId || '',
    whatsappNumber: body.whatsappNumber || '',
    currentAddress: body.currentAddress || '',
    permanentAddress: body.permanentAddress || body.currentAddress || '',
    previousSchool: body.previousSchool || '',
    previousTcNo: body.previousTcNo || '',
    bankAccountNo: body.bankAccountNo || '',
    bankName: body.bankName || '',
    ifscCode: body.ifscCode || '',
    tcIssueDate: body.tcIssueDate || '',
    remarks: body.remarks || '',
  };
}

async function writeStudent(db: any, schoolId: any, id: any, v: any) {
  await db.prepare('INSERT OR REPLACE INTO students (id, roll_number, first_name, last_name, class_id, class_name, section, gender, dob, parent_name, parent_phone, email, address, blood_group, avatar_url, admission_date, status, school_id, scholar_number, father_name, father_occupation, mother_name, category, religion, aadhaar_number, samagra_id, whatsapp_number, current_address, permanent_address, previous_school, previous_tc_no, bank_account_no, bank_name, ifsc_code, tc_issue_date, remarks, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(id, v.rollNumber, v.first, v.last, v.classId, v.className, v.section, v.gender, v.dob, v.parentName, v.parentPhone, v.email, v.address, v.bloodGroup, '', v.admissionDate, v.status, schoolId, v.scholarNumber, v.fatherName, v.fatherOccupation, v.motherName, v.category, v.religion, v.aadhaarNumber, v.samagraId, v.whatsappNumber, v.currentAddress, v.permanentAddress, v.previousSchool, v.previousTcNo, v.bankAccountNo, v.bankName, v.ifscCode, v.tcIssueDate, v.remarks, new Date().toISOString())
    .run();
}

// GET /api/students
studentsApp.get('/', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  const schoolId = getRequestSchoolId(c, authUser);
  const className = c.req.query('class');
  const status = c.req.query('status');
  const search = (c.req.query('q') || '').trim().toLowerCase();

  const rows = await db.prepare('SELECT * FROM students WHERE school_id = ? ORDER BY created_at DESC').bind(schoolId).all();
  let students = (rows.results || []).map(mapStudent);

  if (className && className !== 'All') {
    students = students.filter((s) => s.className.toLowerCase() === className.toLowerCase());
  }
  if (status && status !== 'All') {
    students = students.filter((s) => s.status === status);
  }
  if (search) {
    students = students.filter((s) =>
      s.fullName.toLowerCase().includes(search) ||
      s.scholarNumber.toLowerCase().includes(search) ||
      s.rollNumber.toLowerCase().includes(search) ||
      s.fatherName.toLowerCase().includes(search) ||
      s.parentPhone.includes(search) ||
      (s.aadhaarNumber || '').includes(search)
    );
  }
  return c.json({ success: true, total: students.length, students });
});

// GET /api/students/:id
studentsApp.get('/:id', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  const schoolId = getRequestSchoolId(c, authUser);
  const id = c.req.param('id');
  const row = await db.prepare('SELECT * FROM students WHERE school_id = ? AND (id = ? OR scholar_number = ?)').bind(schoolId, id, id).first();
  const student = mapStudent(row);
  if (!student) return c.json({ success: false, message: 'छात्र रिकॉर्ड नहीं मिला।' }, 404);
  return c.json({ success: true, student });
});

// POST /api/students
studentsApp.post('/', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);
  const schoolId = getRequestSchoolId(c, authUser);
  const body = await c.req.json().catch(() => ({}));

  if (!body.fullName || !body.className || !body.fatherName || !body.parentPhone) {
    return c.json({ success: false, message: 'छात्र का नाम, कक्षा, पिता का नाम और अभिभावक फोन नंबर अनिवार्य हैं।' }, 400);
  }

  const planId = await getPlanId(db, schoolId);
  const access = getPlanAccess(planId);
  if (access.maxStudents !== null) {
    const cnt = await db.prepare('SELECT COUNT(*) AS n FROM students WHERE school_id = ? AND status = ?').bind(schoolId, 'Active').first();
    if (cnt && cnt.n >= access.maxStudents) {
      return c.json({ success: false, message: 'आपके वर्तमान प्लान की छात्र सीमा (' + access.maxStudents + ') पूरी हो चुकी है। कृपया उच्च प्लान में अपग्रेड करें।' }, 403);
    }
  }

  const cntAll = await db.prepare('SELECT COUNT(*) AS n FROM students WHERE school_id = ?').bind(schoolId).first();
  const nextNum = (cntAll ? cntAll.n : 0) + 1;
  const values = camelToWrite(body);
  if (!values.scholarNumber) {
    values.scholarNumber = 'SR-' + new Date().getFullYear() + '/' + String(nextNum).padStart(3, '0');
  }
  const id = 'std-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
  await writeStudent(db, schoolId, id, values);

  const row = await db.prepare('SELECT * FROM students WHERE id = ?').bind(id).first();
  const student = mapStudent(row);
  return c.json({ success: true, message: 'छात्र ' + student.fullName + ' का प्रवेश सफलतापूर्वक दर्ज हुआ। स्कॉलर क्रमांक: ' + student.scholarNumber, student }, 201);
});

// PUT /api/students/:id
studentsApp.put('/:id', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);
  const schoolId = getRequestSchoolId(c, authUser);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const existingRow = await db.prepare('SELECT * FROM students WHERE school_id = ? AND id = ?').bind(schoolId, id).first();
  if (!existingRow) return c.json({ success: false, message: 'छात्र रिकॉर्ड नहीं मिला।' }, 404);
  const merged = Object.assign({}, mapStudent(existingRow), body);
  const values = camelToWrite(merged);
  values.scholarNumber = values.scholarNumber || existingRow.scholar_number || existingRow.roll_number || '';
  await writeStudent(db, schoolId, id, values);
  const row = await db.prepare('SELECT * FROM students WHERE id = ?').bind(id).first();
  const student = mapStudent(row);
  return c.json({ success: true, message: student.fullName + ' का विवरण सफलतापूर्वक अद्यतित किया गया।', student });
});

// POST /api/students/:id/issue-tc
studentsApp.post('/:id/issue-tc', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);
  const schoolId = getRequestSchoolId(c, authUser);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const row = await db.prepare('SELECT * FROM students WHERE school_id = ? AND id = ?').bind(schoolId, id).first();
  if (!row) return c.json({ success: false, message: 'छात्र नहीं मिला।' }, 404);
  const today = new Date().toISOString().split('T')[0];
  await db.prepare('UPDATE students SET status = ?, tc_issue_date = ?, remarks = ?, updated_at = ? WHERE id = ? AND school_id = ?')
    .bind('Inactive', today, body.reason || 'अभिभावक के अनुरोध पर टीसी जारी की गई।', new Date().toISOString(), id, schoolId).run();
  const updated = await db.prepare('SELECT * FROM students WHERE id = ?').bind(id).first();
  const student = mapStudent(updated);
  return c.json({ success: true, message: student.fullName + ' के लिए टीसी जारी की गई। स्कॉलर स्थिति: TC_Issued.', student });
});

// DELETE /api/students/:id
studentsApp.delete('/:id', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);
  const schoolId = getRequestSchoolId(c, authUser);
  const id = c.req.param('id');
  const row = await db.prepare('SELECT * FROM students WHERE school_id = ? AND id = ?').bind(schoolId, id).first();
  if (!row) return c.json({ success: false, message: 'छात्र नहीं मिला।' }, 404);
  await db.prepare('DELETE FROM students WHERE id = ? AND school_id = ?').bind(id, schoolId).run();
  const full = (row.first_name || '') + (row.last_name ? ' ' + row.last_name : '');
  return c.json({ success: true, message: 'छात्र ' + full + ' का रिकॉर्ड सफलतापूर्वक हटा दिया गया।' });
});

export default studentsApp;
