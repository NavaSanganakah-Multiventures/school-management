import { Hono } from 'hono';
import { studentScholars, attendanceStore, AttendanceRecord } from '../db';

const attendanceApp = new Hono();

// GET /api/attendance - तारीख और कक्षा अनुसार उपस्थिति
attendanceApp.get('/', (c) => {
  const date = c.req.query('date') || new Date().toISOString().split('T')[0];
  const className = c.req.query('class');

  // सुनिश्चित करें कि छात्रों के लिए उस तारीख का रिकॉर्ड उपलब्ध है
  const activeStudents = studentScholars.filter((s) => s.status === 'Active');

  // उस तारीख के लिए रिकॉर्ड तैयार करें यदि पहले से न हों
  activeStudents.forEach((student) => {
    const exists = attendanceStore.some((r) => r.studentId === student.id && r.date === date);
    if (!exists) {
      attendanceStore.push({
        id: `att-${student.id}-${date}`,
        studentId: student.id,
        studentName: student.fullName,
        scholarNumber: student.scholarNumber,
        className: student.className,
        section: student.section,
        date,
        status: 'Present',
        markedBy: 'कक्षा अध्यापक (Class Teacher)',
      });
    }
  });

  let list = attendanceStore.filter((r) => r.date === date);
  if (className && className !== 'All') {
    list = list.filter((r) => r.className.toLowerCase() === className.toLowerCase());
  }

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
  });
});

// POST /api/attendance/mark - एकल छात्र की स्थिति बदलना
attendanceApp.post('/mark', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { studentId, status, date, remarks, markedBy } = body;
  const targetDate = date || new Date().toISOString().split('T')[0];

  const existingIdx = attendanceStore.findIndex(
    (r) => r.studentId === studentId && r.date === targetDate
  );

  if (existingIdx >= 0) {
    attendanceStore[existingIdx].status = status;
    if (remarks !== undefined) attendanceStore[existingIdx].remarks = remarks;
    if (markedBy) attendanceStore[existingIdx].markedBy = markedBy;
  } else {
    const student = studentScholars.find((s) => s.id === studentId);
    attendanceStore.push({
      id: `att-${Date.now()}-${studentId}`,
      studentId,
      studentName: student?.fullName || 'छात्र',
      scholarNumber: student?.scholarNumber || '',
      className: student?.className || 'Class 10',
      section: student?.section || 'A',
      date: targetDate,
      status: status || 'Present',
      remarks,
      markedBy: markedBy || 'स्टाफ शिक्षक',
    });
  }

  return c.json({
    success: true,
    message: 'उपस्थिति दर्ज की गई।',
  });
});

// POST /api/attendance/mark-all-present - कक्षा के सभी विद्यार्थियों को उपस्थित मार्क करना
attendanceApp.post('/mark-all-present', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const targetDate = body.date || new Date().toISOString().split('T')[0];
  const className = body.className;

  attendanceStore.forEach((r) => {
    if (r.date === targetDate && (!className || className === 'All' || r.className === className)) {
      r.status = 'Present';
    }
  });

  return c.json({
    success: true,
    message: 'कक्षा के सभी छात्रों की उपस्थिति Present मार्क कर दी गई।',
  });
});

export default attendanceApp;
