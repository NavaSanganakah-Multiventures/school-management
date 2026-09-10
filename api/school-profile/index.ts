import { Hono } from 'hono';
import { schoolProfile } from '../db';

export const schoolProfileApp = new Hono();

// GET /api/school-profile
schoolProfileApp.get('/', (c) => {
  return c.json({
    success: true,
    profile: schoolProfile,
  });
});

// PUT /api/school-profile - स्कूल प्रोफाइल अपडेट करना (केवल डायरेक्टर के लिए)
schoolProfileApp.put('/', async (c) => {
  try {
    const body = await c.req.json();
    Object.assign(schoolProfile, {
      schoolName: body.schoolName || schoolProfile.schoolName,
      affiliationNumber: body.affiliationNumber || schoolProfile.affiliationNumber,
      boardName: body.boardName || schoolProfile.boardName,
      schoolCode: body.schoolCode || schoolProfile.schoolCode,
      email: body.email || schoolProfile.email,
      phone: body.phone || schoolProfile.phone,
      alternatePhone: body.alternatePhone || schoolProfile.alternatePhone,
      address: body.address || schoolProfile.address,
      city: body.city || schoolProfile.city,
      state: body.state || schoolProfile.state,
      pincode: body.pincode || schoolProfile.pincode,
      academicSession: body.academicSession || schoolProfile.academicSession,
      directorName: body.directorName || schoolProfile.directorName,
      principalName: body.principalName || schoolProfile.principalName,
      updatedAt: new Date().toISOString().split('T')[0],
    });

    return c.json({
      success: true,
      message: 'स्कूल प्रोफाइल व सेटिंग्स सफलतापूर्वक अद्यतित की गईं।',
      profile: schoolProfile,
    });
  } catch (error: any) {
    return c.json({ success: false, message: error?.message || 'त्रुटि हुई' }, 500);
  }
});
