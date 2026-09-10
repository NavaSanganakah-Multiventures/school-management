import { Hono } from 'hono';
import { staffMembers, TeacherStaff } from '../db';

export const staffApp = new Hono();

// GET /api/staff - सभी स्टाफ/शिक्षकों की सूची
staffApp.get('/', (c) => {
  const department = c.req.query('department');
  const search = c.req.query('q')?.toLowerCase() || '';

  let filtered = [...staffMembers];
  if (department && department !== 'All') {
    filtered = filtered.filter((t) => t.department.toLowerCase().includes(department.toLowerCase()));
  }
  if (search) {
    filtered = filtered.filter(
      (t) =>
        t.name.toLowerCase().includes(search) ||
        t.employeeCode.toLowerCase().includes(search) ||
        t.subject.toLowerCase().includes(search)
    );
  }

  return c.json({
    success: true,
    total: filtered.length,
    staff: filtered,
  });
});

// POST /api/staff - नया शिक्षक/स्टाफ जोड़ना (डायरेक्टर व प्रिंसिपल के लिए)
staffApp.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const { name, designation, department, subject, phone, email, qualification, salary } = body;

    if (!name || !phone || !email) {
      return c.json({
        success: false,
        message: 'नाम, फोन और ईमेल आवश्यक हैं।',
      }, 400);
    }

    const code = `EMP-${String(staffMembers.length + 10).padStart(3, '0')}`;
    const newStaff: TeacherStaff = {
      id: `tch-${Date.now()}`,
      employeeCode: code,
      name,
      designation: designation || 'प्रशिक्षित शिक्षक (Teacher)',
      department: department || 'सामान्य',
      subject: subject || 'सामान्य विषय',
      phone,
      email,
      qualification: qualification || 'B.Ed.',
      salary: Number(salary) || 45000,
      status: 'Active',
      joiningDate: new Date().toISOString().split('T')[0],
    };

    staffMembers.push(newStaff);

    return c.json({
      success: true,
      message: `${name} को स्टाफ में सफलतापूर्वक जोड़ दिया गया। कर्मचारी कोड: ${code}`,
      staffMember: newStaff,
    }, 201);
  } catch (error: any) {
    return c.json({ success: false, message: error?.message || 'त्रुटि हुई' }, 500);
  }
});

// DELETE /api/staff/:id - स्टाफ हटाना (केवल डायरेक्टर के लिए)
staffApp.delete('/:id', (c) => {
  const id = c.req.param('id');
  const idx = staffMembers.findIndex((s) => s.id === id);
  if (idx === -1) {
    return c.json({ success: false, message: 'स्टाफ सदस्य नहीं मिला' }, 404);
  }
  const removed = staffMembers.splice(idx, 1)[0];
  return c.json({
    success: true,
    message: `${removed.name} को स्टाफ सूची से हटा दिया गया।`,
  });
});
