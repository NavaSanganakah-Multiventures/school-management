import { Hono } from 'hono';
import { studentScholars, StudentScholar } from '../db';

const studentsApp = new Hono();

// GET /api/students - सभी स्कॉलर छात्रों की सूची (खोज व फ़िल्टरिंग सहित)
studentsApp.get('/', (c) => {
  const className = c.req.query('class');
  const status = c.req.query('status');
  const search = c.req.query('q')?.trim().toLowerCase();

  let filtered = [...studentScholars];

  if (className && className !== 'All') {
    filtered = filtered.filter((s) => s.className.toLowerCase() === className.toLowerCase());
  }

  if (status && status !== 'All') {
    filtered = filtered.filter((s) => s.status === status);
  }

  if (search) {
    filtered = filtered.filter(
      (s) =>
        s.fullName.toLowerCase().includes(search) ||
        s.scholarNumber.toLowerCase().includes(search) ||
        s.rollNumber.toLowerCase().includes(search) ||
        s.fatherName.toLowerCase().includes(search) ||
        s.parentPhone.includes(search) ||
        (s.aadhaarNumber && s.aadhaarNumber.includes(search))
    );
  }

  return c.json({
    success: true,
    total: filtered.length,
    students: filtered,
  });
});

// GET /api/students/:id - एकल छात्र का सम्पूर्ण स्कॉलर विवरण
studentsApp.get('/:id', (c) => {
  const id = c.req.param('id');
  const student = studentScholars.find((s) => s.id === id || s.scholarNumber === id);

  if (!student) {
    return c.json({ success: false, message: 'छात्र रिकॉर्ड नहीं मिला।' }, 404);
  }

  return c.json({ success: true, student });
});

// POST /api/students - नया स्कॉलर छात्र प्रवेश (New Scholar Admission)
studentsApp.post('/', async (c) => {
  try {
    const body = await c.req.json();

    if (!body.fullName || !body.className || !body.fatherName || !body.parentPhone) {
      return c.json({
        success: false,
        message: 'छात्र का नाम, कक्षा, पिता का नाम और अभिभावक फोन नंबर अनिवार्य हैं।',
      }, 400);
    }

    // ऑटो-जनरेटेड स्कॉलर क्रमांक यदि प्रदान नहीं किया गया है
    const nextNum = studentScholars.length + 1;
    const scholarNumber =
      body.scholarNumber?.trim() || `SR-${new Date().getFullYear()}/${String(nextNum).padStart(3, '0')}`;

    // डुप्लीकेट स्कॉलर नंबर चेक
    const exists = studentScholars.some((s) => s.scholarNumber === scholarNumber);
    if (exists && body.scholarNumber) {
      return c.json({
        success: false,
        message: `स्कॉलर क्रमांक '${scholarNumber}' पहले से किसी अन्य छात्र के नाम पर दर्ज है।`,
      }, 409);
    }

    const newStudent: StudentScholar = {
      id: `std-sr-${Date.now()}`,
      scholarNumber,
      rollNumber: body.rollNumber || String(nextNum),
      fullName: body.fullName.trim(),
      fatherName: body.fatherName.trim(),
      fatherOccupation: body.fatherOccupation?.trim() || '',
      motherName: body.motherName?.trim() || '',
      className: body.className,
      section: body.section || 'A',
      dob: body.dob || '2012-01-01',
      gender: body.gender || 'Male',
      category: body.category || 'General',
      religion: body.religion || 'Hindu',
      aadhaarNumber: body.aadhaarNumber?.trim() || '',
      samagraId: body.samagraId?.trim() || '',
      bloodGroup: body.bloodGroup || 'B+',
      parentPhone: body.parentPhone.trim(),
      whatsappNumber: body.whatsappNumber?.trim() || body.parentPhone.trim(),
      email: body.email?.trim() || '',
      currentAddress: body.currentAddress?.trim() || '',
      permanentAddress: body.permanentAddress?.trim() || body.currentAddress?.trim() || '',
      previousSchool: body.previousSchool?.trim() || '',
      previousTcNo: body.previousTcNo?.trim() || '',
      admissionDate: body.admissionDate || new Date().toISOString().split('T')[0],
      bankAccountNo: body.bankAccountNo?.trim() || '',
      bankName: body.bankName?.trim() || '',
      ifscCode: body.ifscCode?.trim() || '',
      status: 'Active',
      remarks: body.remarks?.trim() || '',
    };

    studentScholars.unshift(newStudent);

    return c.json({
      success: true,
      message: `छात्र ${newStudent.fullName} का प्रवेश सफलतापूर्वक दर्ज हुआ। स्कॉलर क्रमांक: ${newStudent.scholarNumber}`,
      student: newStudent,
    }, 201);
  } catch (error: any) {
    return c.json({ success: false, message: error?.message || 'छात्र जोड़ने में त्रुटि हुई' }, 500);
  }
});

// PUT /api/students/:id - छात्र विवरण संपादित करें (Edit Student)
studentsApp.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const idx = studentScholars.findIndex((s) => s.id === id);

    if (idx === -1) {
      return c.json({ success: false, message: 'छात्र रिकॉर्ड नहीं मिला।' }, 404);
    }

    const current = studentScholars[idx];
    const updated: StudentScholar = {
      ...current,
      ...body,
      id: current.id, // ID cannot change
      scholarNumber: body.scholarNumber || current.scholarNumber,
    };

    studentScholars[idx] = updated;

    return c.json({
      success: true,
      message: `${updated.fullName} का विवरण सफलतापूर्वक अद्यतित किया गया।`,
      student: updated,
    });
  } catch (error: any) {
    return c.json({ success: false, message: error?.message || 'अद्यतन विफल' }, 500);
  }
});

// POST /api/students/:id/issue-tc - टीसी जारी करना (Issue Transfer Certificate)
studentsApp.post('/:id/issue-tc', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const student = studentScholars.find((s) => s.id === id);

  if (!student) {
    return c.json({ success: false, message: 'छात्र नहीं मिला।' }, 404);
  }

  student.status = 'TC_Issued';
  student.tcIssueDate = new Date().toISOString().split('T')[0];
  student.remarks = body.reason || 'अभिभावक के अनुरोध पर टीसी जारी की गई।';

  return c.json({
    success: true,
    message: `${student.fullName} के लिए टीसी जारी की गई। स्कॉलर स्थिति: TC_Issued.`,
    student,
  });
});

// DELETE /api/students/:id - छात्र रिकॉर्ड हटाना
studentsApp.delete('/:id', (c) => {
  const id = c.req.param('id');
  const idx = studentScholars.findIndex((s) => s.id === id);

  if (idx === -1) {
    return c.json({ success: false, message: 'छात्र नहीं मिला।' }, 404);
  }

  const removed = studentScholars.splice(idx, 1)[0];
  return c.json({
    success: true,
    message: `छात्र ${removed.fullName} (स्कॉलर: ${removed.scholarNumber}) का रिकॉर्ड सफलतापूर्वक हटा दिया गया।`,
  });
});

export default studentsApp;
