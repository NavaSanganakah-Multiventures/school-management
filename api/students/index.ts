import { Hono } from 'hono';
import { getDB } from '../db';
import { getAuthUser, getRequestSchoolId } from '../lib/auth';
import { getPlanAccess } from '../lib/plan-access';
import { isClassTeacher } from '../lib/permissions';
import { logActivity, resolveActorName } from '../lib/activity-logger';

const studentsApp = new Hono<{ Bindings: any }>();

function mapStudent(r: any): any {
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
    missingDetails: r.missing_details || '',
  };
}

async function getPlanId(db: any, schoolId: any) {
  const sub = await db.prepare('SELECT plan_id, status FROM school_subscriptions WHERE school_id = ?').bind(schoolId).first();
  if (!sub) return 'trial';
  return sub.status === 'Trial' ? 'trial' : sub.plan_id;
}

// ─────────────────────────────────────────────────────────────
// Per-school dynamic custom fields ("Student Extra Fields")
// School Director/Principal defines the schema for their school;
// values are stored per student. Fields appear ONLY for the school
// that defined them (school_id scoping in the shared DB; each
// dedicated worker has its own D1 so it is inherently isolated).
// ─────────────────────────────────────────────────────────────

const CUSTOM_FIELD_TYPES = ['text', 'number', 'dropdown', 'date', 'checkbox'];

function isFieldManager(role: string) {
  return role === 'Director' || role === 'Principal';
}

function parseCustomFieldOptions(raw: any): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}

async function getCustomFieldDefs(db: any, schoolId: string, opts?: { includeInactive?: boolean }) {
  const activeClause = opts?.includeInactive ? '' : ' AND is_active = 1';
  const { results } = await db.prepare(
    'SELECT * FROM student_custom_field_defs WHERE school_id = ?' + activeClause + ' ORDER BY sort_order ASC, created_at ASC'
  ).bind(schoolId).all();
  return (results || []).map((d: any) => ({
    id: d.id,
    fieldKey: d.field_key,
    label: d.label,
    fieldType: d.field_type,
    options: parseCustomFieldOptions(d.options),
    required: !!d.required,
    sortOrder: d.sort_order || 0,
    isActive: !!d.is_active,
  }));
}

async function writeCustomFieldValues(db: any, schoolId: string, studentId: string, customFields: any) {
  if (!customFields || typeof customFields !== 'object') return;
  // Replace previous values wholesale (delete + insert) — idempotent upsert,
  // so edits never accumulate stale rows for removed fields.
  await db.prepare('DELETE FROM student_custom_field_values WHERE school_id = ? AND student_id = ?').bind(schoolId, studentId).run();
  for (const [key, value] of Object.entries(customFields)) {
    const v = value == null ? '' : String(value);
    if (!v.trim()) continue;
    const id = 'scfv-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8);
    await db.prepare(
      'INSERT INTO student_custom_field_values (id, school_id, student_id, field_key, field_value, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(id, schoolId, studentId, key, v, new Date().toISOString()).run();
  }
}

async function readCustomFieldValues(db: any, schoolId: string, studentId: string): Promise<Record<string, string>> {
  const { results } = await db.prepare(
    'SELECT field_key, field_value FROM student_custom_field_values WHERE school_id = ? AND student_id = ?'
  ).bind(schoolId, studentId).all();
  const out: Record<string, string> = {};
  for (const r of results || []) out[r.field_key] = r.field_value;
  return out;
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
  // Use INSERT ... ON CONFLICT(id) DO UPDATE instead of INSERT OR REPLACE so that
  // columns NOT listed here (created_at, missing_details) are preserved on edits
  // instead of being wiped by a delete-then-insert.
  await db.prepare(
    'INSERT INTO students (id, roll_number, first_name, last_name, class_id, class_name, section, gender, dob, parent_name, parent_phone, email, address, blood_group, avatar_url, admission_date, status, school_id, scholar_number, father_name, father_occupation, mother_name, category, religion, aadhaar_number, samagra_id, whatsapp_number, current_address, permanent_address, previous_school, previous_tc_no, bank_account_no, bank_name, ifsc_code, tc_issue_date, remarks, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ' +
    'ON CONFLICT(id) DO UPDATE SET roll_number=excluded.roll_number, first_name=excluded.first_name, last_name=excluded.last_name, class_id=excluded.class_id, class_name=excluded.class_name, section=excluded.section, gender=excluded.gender, dob=excluded.dob, parent_name=excluded.parent_name, parent_phone=excluded.parent_phone, email=excluded.email, address=excluded.address, blood_group=excluded.blood_group, avatar_url=excluded.avatar_url, admission_date=excluded.admission_date, status=excluded.status, school_id=excluded.school_id, scholar_number=excluded.scholar_number, father_name=excluded.father_name, father_occupation=excluded.father_occupation, mother_name=excluded.mother_name, category=excluded.category, religion=excluded.religion, aadhaar_number=excluded.aadhaar_number, samagra_id=excluded.samagra_id, whatsapp_number=excluded.whatsapp_number, current_address=excluded.current_address, permanent_address=excluded.permanent_address, previous_school=excluded.previous_school, previous_tc_no=excluded.previous_tc_no, bank_account_no=excluded.bank_account_no, bank_name=excluded.bank_name, ifsc_code=excluded.ifsc_code, tc_issue_date=excluded.tc_issue_date, remarks=excluded.remarks, updated_at=excluded.updated_at'
  )
    .bind(id, v.rollNumber, v.first, v.last, v.classId, v.className, v.section, v.gender, v.dob, v.parentName, v.parentPhone, v.email, v.address, v.bloodGroup, '', v.admissionDate, v.status, schoolId, v.scholarNumber, v.fatherName, v.fatherOccupation, v.motherName, v.category, v.religion, v.aadhaarNumber, v.samagraId, v.whatsappNumber, v.currentAddress, v.permanentAddress, v.previousSchool, v.previousTcNo, v.bankAccountNo, v.bankName, v.ifscCode, v.tcIssueDate, v.remarks, new Date().toISOString())
    .run();
}

// GET /api/students
studentsApp.get('/', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);
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

// ─────────────────────────────────────────────────────────────
// Per-school custom field definitions ("Student Extra Fields")
// Readable by any authenticated user (forms render these fields);
// create/update/delete restricted to Director/Principal.
// NOTE: defined before GET /:id so "custom-fields" isn't parsed as an id.
// ─────────────────────────────────────────────────────────────

// GET /api/students/custom-fields — active defs for this school
studentsApp.get('/custom-fields', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);
  const schoolId = getRequestSchoolId(c, authUser);
  const fields = await getCustomFieldDefs(db, schoolId);
  return c.json({ success: true, fields });
});

// POST /api/students/custom-fields — create a new field (Director/Principal)
studentsApp.post('/custom-fields', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);
  if (!isFieldManager(authUser.role)) {
    return c.json({ success: false, message: 'केवल निदेशक या प्राचार्य ही अतिरिक्त फ़ील्ड जोड़ सकते हैं।' }, 403);
  }
  const schoolId = getRequestSchoolId(c, authUser);
  const body = await c.req.json().catch(() => ({}));
  const fieldKey = String(body.fieldKey || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const label = String(body.label || '').trim();
  const fieldType = CUSTOM_FIELD_TYPES.includes(body.fieldType) ? body.fieldType : 'text';
  if (!fieldKey || !label) {
    return c.json({ success: false, message: 'फ़ील्ड कुंजी (fieldKey) और लेबल (label) अनिवार्य हैं।' }, 400);
  }
  const dup = await db.prepare(
    'SELECT id FROM student_custom_field_defs WHERE school_id = ? AND field_key = ?'
  ).bind(schoolId, fieldKey).first();
  if (dup) {
    return c.json({ success: false, message: 'इस स्कूल में यह फ़ील्ड कुंजी पहले से मौजूद है।' }, 409);
  }
  const id = 'scfd-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8);
  const options = fieldType === 'dropdown' && Array.isArray(body.options)
    ? JSON.stringify(body.options.map(String))
    : null;
  await db.prepare(
    'INSERT INTO student_custom_field_defs (id, school_id, field_key, label, field_type, options, required, sort_order, is_active, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,1,?,?,?)'
  ).bind(
    id, schoolId, fieldKey, label, fieldType, options,
    body.required ? 1 : 0,
    Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 0,
    authUser.sub, new Date().toISOString(), new Date().toISOString()
  ).run();

  const field = (await getCustomFieldDefs(db, schoolId)).find((f: any) => f.id === id) || null;
  return c.json({ success: true, message: 'अतिरिक्त फ़ील्ड "' + label + '" जोड़ दी गई।', field }, 201);
});

// PUT /api/students/custom-fields/:fieldId — update def (Director/Principal)
studentsApp.put('/custom-fields/:fieldId', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);
  if (!isFieldManager(authUser.role)) {
    return c.json({ success: false, message: 'केवल निदेशक या प्राचार्य ही अतिरिक्त फ़ील्ड संपादित कर सकते हैं।' }, 403);
  }
  const schoolId = getRequestSchoolId(c, authUser);
  const fieldId = c.req.param('fieldId');
  const existing = await db.prepare(
    'SELECT * FROM student_custom_field_defs WHERE id = ? AND school_id = ?'
  ).bind(fieldId, schoolId).first();
  if (!existing) return c.json({ success: false, message: 'फ़ील्ड नहीं मिली।' }, 404);

  const body = await c.req.json().catch(() => ({}));
  const label = body.label !== undefined ? String(body.label).trim() : existing.label;
  const fieldType = body.fieldType !== undefined && CUSTOM_FIELD_TYPES.includes(body.fieldType) ? body.fieldType : existing.field_type;
  const options = fieldType === 'dropdown' && Array.isArray(body.options)
    ? JSON.stringify(body.options.map(String))
    : (Array.isArray(body.options) ? JSON.stringify(body.options.map(String)) : existing.options);
  const required = body.required !== undefined ? (body.required ? 1 : 0) : existing.required;
  const sortOrder = body.sortOrder !== undefined && Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : existing.sort_order;
  const isActive = body.isActive !== undefined ? (body.isActive ? 1 : 0) : existing.is_active;

  if (!label) return c.json({ success: false, message: 'लेबल (label) अनिवार्य है।' }, 400);

  await db.prepare(
    'UPDATE student_custom_field_defs SET label = ?, field_type = ?, options = ?, required = ?, sort_order = ?, is_active = ?, updated_at = ? WHERE id = ? AND school_id = ?'
  ).bind(label, fieldType, options, required, sortOrder, isActive, new Date().toISOString(), fieldId, schoolId).run();

  const field = (await getCustomFieldDefs(db, schoolId, { includeInactive: true })).find((f: any) => f.id === fieldId) || null;
  return c.json({ success: true, message: 'फ़ील्ड "' + label + '" अद्यतित हो गई।', field });
});

// DELETE /api/students/custom-fields/:fieldId — delete def + its values (Director/Principal)
studentsApp.delete('/custom-fields/:fieldId', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);
  if (!isFieldManager(authUser.role)) {
    return c.json({ success: false, message: 'केवल निदेशक या प्राचार्य ही अतिरिक्त फ़ील्ड हटा सकते हैं।' }, 403);
  }
  const schoolId = getRequestSchoolId(c, authUser);
  const fieldId = c.req.param('fieldId');
  const existing = await db.prepare(
    'SELECT * FROM student_custom_field_defs WHERE id = ? AND school_id = ?'
  ).bind(fieldId, schoolId).first();
  if (!existing) return c.json({ success: false, message: 'फ़ील्ड नहीं मिली।' }, 404);

  await db.prepare('DELETE FROM student_custom_field_values WHERE school_id = ? AND field_key = ?').bind(schoolId, existing.field_key).run();
  await db.prepare('DELETE FROM student_custom_field_defs WHERE id = ? AND school_id = ?').bind(fieldId, schoolId).run();

  return c.json({ success: true, message: 'फ़ील्ड "' + existing.label + '" और उसके सभी मान हटा दिए गए।' });
});

// GET /api/students/:id
studentsApp.get('/:id', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);
  const schoolId = getRequestSchoolId(c, authUser);
  const id = c.req.param('id');
  const row = await db.prepare('SELECT * FROM students WHERE school_id = ? AND (id = ? OR scholar_number = ?)').bind(schoolId, id, id).first();
  const student = mapStudent(row);
  if (!student) return c.json({ success: false, message: 'छात्र रिकॉर्ड नहीं मिला।' }, 404);
  // Attach per-school extra field values for this student
  try {
    student.customFields = await readCustomFieldValues(db, schoolId, student.id);
  } catch (err) {
    console.warn('[Students] Error reading custom fields:', err);
    student.customFields = {};
  }
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

  // Permission Check: If Staff, must be the assigned class teacher of this class
  if (authUser.role === 'Staff') {
    const isTeacher = await isClassTeacher(db, schoolId, body.className, authUser.sub);
    if (!isTeacher) {
      return c.json({
        success: false,
        message: `केवल अधिकृत कक्षा अध्यापक या प्रधानाचार्य/निदेशक ही कक्षा "${body.className}" में छात्र प्रवेश दर्ज कर सकते हैं।`,
      }, 403);
    }
  }

  const planId = await getPlanId(db, schoolId);
  const access = await getPlanAccess(planId, db);
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

  // Per-school extra fields (Student Extra Fields)
  try {
    await writeCustomFieldValues(db, schoolId, id, body.customFields);
  } catch (err) {
    console.warn('[Students] Error saving custom fields on add:', err);
  }

  const row = await db.prepare('SELECT * FROM students WHERE id = ?').bind(id).first();
  const student = mapStudent(row);

  const actorName = await resolveActorName(db, authUser.sub, authUser.role);

  // 1. Record Initial Admission in Academic History
  try {
    const histId = 'sah-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
    await db.prepare(
      'INSERT INTO student_academic_history (id, school_id, student_id, scholar_number, event_type, event_date, academic_session, class_name, section, recorded_by_user_id, recorded_by_name, recorded_by_role, remarks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      histId,
      schoolId,
      id,
      student.scholarNumber,
      'Initial_Admission',
      student.admissionDate || new Date().toISOString().split('T')[0],
      body.academicSession || '2026-2027',
      student.className,
      student.section || 'A',
      authUser.sub,
      actorName,
      authUser.role,
      body.remarks || 'प्रथम स्कॉलर प्रवेश (Initial Admission)'
    ).run();
  } catch (err) {
    console.warn('[Students] Error writing initial academic history:', err);
  }

  // 2. Record in School Activity Log
  await logActivity(db, {
    schoolId,
    userId: authUser.sub,
    userName: actorName,
    userRole: authUser.role,
    actionType: 'STUDENT_ADD',
    actionTitle: 'नया स्कॉलर प्रवेश',
    description: `कक्षा ${student.className} (वर्ग ${student.section}) में नए छात्र ${student.fullName} (स्कॉलर सं.: ${student.scholarNumber}) का प्रवेश दर्ज किया गया।`,
    entityType: 'student',
    entityId: id,
    className: student.className,
    metadata: { scholarNumber: student.scholarNumber, rollNumber: student.rollNumber, parentPhone: student.parentPhone },
  });

  return c.json({ success: true, message: 'छात्र ' + student.fullName + ' का प्रवेश सफलतापूर्वक दर्ज हुआ। स्कॉलर क्रमांक: ' + student.scholarNumber, student }, 201);
});

// GET /api/students/:id/history
studentsApp.get('/:id/history', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  const schoolId = getRequestSchoolId(c, authUser);
  const id = c.req.param('id');

  const studentRow = await db.prepare('SELECT * FROM students WHERE school_id = ? AND (id = ? OR scholar_number = ?)').bind(schoolId, id, id).first();
  if (!studentRow) return c.json({ success: false, message: 'छात्र रिकॉर्ड नहीं मिला।' }, 404);

  const historyRows = await db.prepare(
    'SELECT * FROM student_academic_history WHERE school_id = ? AND (student_id = ? OR scholar_number = ?) ORDER BY event_date ASC, created_at ASC'
  ).bind(schoolId, studentRow.id, studentRow.scholar_number || studentRow.roll_number).all();

  let history: any[] = (historyRows.results || []).map((r: any) => ({
    id: r.id,
    eventType: r.event_type,
    eventDate: r.event_date,
    academicSession: r.academic_session,
    className: r.class_name,
    section: r.section,
    tcNumber: r.tc_number,
    tcIssueDate: r.tc_issue_date,
    reason: r.reason,
    intermediateSchoolName: r.intermediate_school_name,
    intermediateTcNo: r.intermediate_tc_no,
    recordedByName: r.recorded_by_name,
    recordedByRole: r.recorded_by_role,
    remarks: r.remarks,
    createdAt: r.created_at,
  }));

  // Retroactive fallback: If no history records exist yet (e.g. created prior to migration 0014),
  // synthesize initial admission and TC issued records from the current student row so the timeline is never empty!
  if (history.length === 0) {
    history.push({
      id: 'synth-init-' + studentRow.id,
      eventType: 'Initial_Admission',
      eventDate: studentRow.admission_date || '2026-04-01',
      academicSession: '2026-2027',
      className: studentRow.class_name,
      section: studentRow.section || 'A',
      remarks: 'मूल दाखिला-खारिज (SR) रजिस्टर प्रविष्टि',
      createdAt: studentRow.created_at || new Date().toISOString(),
    });

    if (studentRow.tc_issue_date) {
      history.push({
        id: 'synth-tc-' + studentRow.id,
        eventType: 'TC_Issued',
        eventDate: studentRow.tc_issue_date,
        academicSession: '2026-2027',
        className: studentRow.class_name,
        section: studentRow.section || 'A',
        reason: studentRow.remarks || 'अभिभावक के अनुरोध पर टीसी निर्गत।',
        remarks: 'स्थानांतरण प्रमाण पत्र निर्गत',
        createdAt: studentRow.updated_at || studentRow.tc_issue_date,
      });
    }
  }

  return c.json({
    success: true,
    studentId: studentRow.id,
    scholarNumber: studentRow.scholar_number || studentRow.roll_number,
    studentName: (studentRow.first_name || '') + (studentRow.last_name ? ' ' + studentRow.last_name : ''),
    history,
  });
});

// POST /api/students/:id/readmit (Re-Admission after gap/transfer)
studentsApp.post('/:id/readmit', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);
  const schoolId = getRequestSchoolId(c, authUser);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));

  const existingRow = await db.prepare('SELECT * FROM students WHERE school_id = ? AND id = ?').bind(schoolId, id).first();
  if (!existingRow) return c.json({ success: false, message: 'छात्र रिकॉर्ड नहीं मिला।' }, 404);

  const newClass = body.className || existingRow.class_name;
  const newSection = body.section || existingRow.section || 'A';
  const newRoll = body.rollNumber || existingRow.roll_number || '';
  const readmissionDate = body.readmissionDate || new Date().toISOString().split('T')[0];
  const intermediateSchool = body.intermediateSchool || body.previousSchool || '';
  const intermediateTcNo = body.intermediateTcNo || body.previousTcNo || '';
  const academicSession = body.academicSession || '2026-2027';
  const remarks = body.remarks || 'अन्य विद्यालय में अध्ययन के उपरांत पुनः प्रवेश दर्ज हुआ।';

  // Permission Check: If Staff, must be class teacher of target class
  if (authUser.role === 'Staff') {
    const isTeacher = await isClassTeacher(db, schoolId, newClass, authUser.sub);
    if (!isTeacher) {
      return c.json({
        success: false,
        message: `केवल अधिकृत कक्षा अध्यापक या प्रधानाचार्य/निदेशक ही कक्षा "${newClass}" में पुनः प्रवेश दर्ज कर सकते हैं।`,
      }, 403);
    }
  }

  // Update student status to Active and update class/section/intermediate details
  await db.prepare(
    'UPDATE students SET status = ?, class_name = ?, section = ?, roll_number = ?, admission_date = ?, previous_school = ?, previous_tc_no = ?, tc_issue_date = NULL, remarks = ?, updated_at = ? WHERE id = ? AND school_id = ?'
  ).bind(
    'Active',
    newClass,
    newSection,
    newRoll,
    readmissionDate,
    intermediateSchool,
    intermediateTcNo,
    remarks,
    new Date().toISOString(),
    id,
    schoolId
  ).run();

  const actorName = await resolveActorName(db, authUser.sub, authUser.role);
  const scholarNum = existingRow.scholar_number || existingRow.roll_number || '';

  // Record Re_Admission event in Academic History
  try {
    const histId = 'sah-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
    await db.prepare(
      'INSERT INTO student_academic_history (id, school_id, student_id, scholar_number, event_type, event_date, academic_session, class_name, section, reason, intermediate_school_name, intermediate_tc_no, recorded_by_user_id, recorded_by_name, recorded_by_role, remarks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      histId,
      schoolId,
      id,
      scholarNum,
      'Re_Admission',
      readmissionDate,
      academicSession,
      newClass,
      newSection,
      'अन्य विद्यालय में अध्ययन के उपरांत पुनः प्रवेश',
      intermediateSchool,
      intermediateTcNo,
      authUser.sub,
      actorName,
      authUser.role,
      remarks
    ).run();
  } catch (err) {
    console.warn('[Students] Error recording re-admission history:', err);
  }

  const updatedRow = await db.prepare('SELECT * FROM students WHERE id = ?').bind(id).first();
  const student = mapStudent(updatedRow);

  // Record in Activity Log
  await logActivity(db, {
    schoolId,
    userId: authUser.sub,
    userName: actorName,
    userRole: authUser.role,
    actionType: 'STUDENT_READMIT',
    actionTitle: 'छात्र पुनः प्रवेश (Re-Admission)',
    description: `पूर्व छात्र ${student.fullName} (स्कॉलर सं.: ${student.scholarNumber}) का कक्षा ${newClass} (वर्ग ${newSection}) में पुनः प्रवेश दर्ज किया गया। मध्यवर्ती स्कूल: ${intermediateSchool || 'उल्लेखित नहीं'}`,
    entityType: 'student',
    entityId: id,
    className: newClass,
    metadata: { intermediateSchool, intermediateTcNo, newClass, newSection, readmissionDate },
  });

  return c.json({
    success: true,
    message: `${student.fullName} का कक्षा ${newClass} में पुनः प्रवेश सफलतापूर्वक दर्ज किया गया। स्कॉलर क्रमांक: ${student.scholarNumber}`,
    student,
  });
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

  // If staff, verify class teacher permission
  if (authUser.role === 'Staff') {
    const isTeacher = await isClassTeacher(db, schoolId, existingRow.class_name, authUser.sub);
    if (!isTeacher) {
      return c.json({ success: false, message: 'केवल अधिकृत कक्षा अध्यापक या प्रशासनिक अधिकारी ही छात्र विवरण बदल सकते हैं।' }, 403);
    }
  }

  const merged = Object.assign({}, mapStudent(existingRow), body);
  const values = camelToWrite(merged);
  values.scholarNumber = values.scholarNumber || existingRow.scholar_number || existingRow.roll_number || '';
  await writeStudent(db, schoolId, id, values);

  // Per-school extra fields (Student Extra Fields)
  try {
    await writeCustomFieldValues(db, schoolId, id, body.customFields);
  } catch (err) {
    console.warn('[Students] Error saving custom fields on update:', err);
  }

  const row = await db.prepare('SELECT * FROM students WHERE id = ?').bind(id).first();
  const student = mapStudent(row);
  try {
    student.customFields = await readCustomFieldValues(db, schoolId, id);
  } catch (err) {
    console.warn('[Students] Error reading custom fields on update:', err);
    student.customFields = {};
  }

  const actorName = await resolveActorName(db, authUser.sub, authUser.role);
  await logActivity(db, {
    schoolId,
    userId: authUser.sub,
    userName: actorName,
    userRole: authUser.role,
    actionType: 'STUDENT_UPDATE',
    actionTitle: 'छात्र विवरण अद्यतन',
    description: `छात्र ${student.fullName} (स्कॉलर सं.: ${student.scholarNumber}, कक्षा: ${student.className}) का रिकॉर्ड अद्यतित किया गया।`,
    entityType: 'student',
    entityId: id,
    className: student.className,
  });

  return c.json({ success: true, message: student.fullName + ' का विवरण सफलतापूर्वक अद्यतित किया गया।', student });
});

// POST /api/students/:id/issue-tc
studentsApp.post('/:id/issue-tc', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);
  if (authUser.role !== 'Director' && authUser.role !== 'Principal') {
    return c.json({ success: false, message: 'केवल निदेशक या प्राचार्य ही टी.सी. निर्गत कर सकते हैं।' }, 403);
  }
  const schoolId = getRequestSchoolId(c, authUser);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const row = await db.prepare('SELECT * FROM students WHERE school_id = ? AND id = ?').bind(schoolId, id).first();
  if (!row) return c.json({ success: false, message: 'छात्र नहीं मिला।' }, 404);

  // Prevent double-issuance
  if (row.status === 'Inactive' && row.tc_issue_date) {
    return c.json({ success: false, message: 'इस छात्र के लिए टी.सी. पहले ही निर्गत हो चुकी है।' }, 409);
  }

  const today = body.issueDate || new Date().toISOString().split('T')[0];
  const tcNum = body.tcNumber || `TC/${new Date().getFullYear()}/${Math.floor(100 + Math.random() * 900)}`;
  const reason = body.reason || 'अभिभावक के अनुरोध पर टीसी जारी की गई।';

  // Build TC detail remarks from extra fields
  const tcDetails = [
    body.promotionStatus ? `पदोन्नति: ${body.promotionStatus}` : '',
    body.conduct ? `आचरण: ${body.conduct}` : '',
    body.annualResult ? `वार्षिक परिणाम: ${body.annualResult}` : '',
    body.feesDues ? `शुल्क: ${body.feesDues}` : '',
    body.workingDays && body.presentDays ? `उपस्थिति: ${body.presentDays}/${body.workingDays} दिवस` : '',
    body.remarks ? `टिप्पणी: ${body.remarks}` : '',
  ].filter(Boolean).join(' | ');

  await db.prepare('UPDATE students SET status = ?, tc_issue_date = ?, remarks = ?, updated_at = ? WHERE id = ? AND school_id = ?')
    .bind('Inactive', today, reason, new Date().toISOString(), id, schoolId).run();
  const updated = await db.prepare('SELECT * FROM students WHERE id = ?').bind(id).first();
  const student = mapStudent(updated);

  const actorName = await resolveActorName(db, authUser.sub, authUser.role);

  // Record TC issuance in Academic History
  try {
    const histId = 'sah-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
    await db.prepare(
      'INSERT INTO student_academic_history (id, school_id, student_id, scholar_number, event_type, event_date, academic_session, class_name, section, tc_number, tc_issue_date, reason, recorded_by_user_id, recorded_by_name, recorded_by_role, remarks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      histId,
      schoolId,
      id,
      row.scholar_number || row.roll_number,
      'TC_Issued',
      today,
      body.academicSession || '2026-2027',
      row.class_name,
      row.section || 'A',
      tcNum,
      today,
      reason,
      authUser.sub,
      actorName,
      authUser.role,
      tcDetails || 'स्थानांतरण प्रमाण पत्र निर्गत (TC Issued)'
    ).run();
  } catch (err) {
    console.warn('[Students] Error recording TC issuance history:', err);
  }

  // Record in Activity Log
  await logActivity(db, {
    schoolId,
    userId: authUser.sub,
    userName: actorName,
    userRole: authUser.role,
    actionType: 'TC_ISSUE',
    actionTitle: 'स्थानांतरण प्रमाण पत्र (TC) जारी',
    description: `छात्र ${student.fullName} (कक्षा ${student.className}, स्कॉलर सं.: ${student.scholarNumber}) को टीसी (${tcNum}) जारी की गई। कारण: ${reason}`,
    entityType: 'student',
    entityId: id,
    className: student.className,
    metadata: { tcNumber: tcNum, reason, promotionStatus: body.promotionStatus, conduct: body.conduct, annualResult: body.annualResult, feesDues: body.feesDues, workingDays: body.workingDays, presentDays: body.presentDays },
  });

  return c.json({ success: true, message: student.fullName + ' के लिए टीसी जारी की गई। स्कॉलर स्थिति: TC_Issued.', student });
});

// DELETE /api/students/:id
studentsApp.delete('/:id', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);
  if (authUser.role === 'Staff') {
    return c.json({ success: false, message: 'केवल प्रधानाचार्य या निदेशक ही छात्र रिकॉर्ड हटा सकते हैं।' }, 403);
  }
  const schoolId = getRequestSchoolId(c, authUser);
  const id = c.req.param('id');
  const row = await db.prepare('SELECT * FROM students WHERE school_id = ? AND id = ?').bind(schoolId, id).first();
  if (!row) return c.json({ success: false, message: 'छात्र नहीं मिला।' }, 404);

  const full = (row.first_name || '') + (row.last_name ? ' ' + row.last_name : '');
  await db.prepare('DELETE FROM students WHERE id = ? AND school_id = ?').bind(id, schoolId).run();

  const actorName = await resolveActorName(db, authUser.sub, authUser.role);
  await logActivity(db, {
    schoolId,
    userId: authUser.sub,
    userName: actorName,
    userRole: authUser.role,
    actionType: 'STUDENT_DELETE',
    actionTitle: 'छात्र रिकॉर्ड हटाया गया',
    description: `छात्र ${full} (कक्षा ${row.class_name}, स्कॉलर सं.: ${row.scholar_number || row.roll_number}) का रिकॉर्ड हटाया गया।`,
    entityType: 'student',
    entityId: id,
    className: row.class_name,
  });

  return c.json({ success: true, message: 'छात्र ' + full + ' का रिकॉर्ड सफलतापूर्वक हटा दिया गया।' });
});

export default studentsApp;
