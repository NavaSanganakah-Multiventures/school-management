import { Hono } from 'hono';
import { getDB } from '../db';
import { getAuthUser, getRequestSchoolId } from '../lib/auth';

export const schoolProfileApp = new Hono();

function rowToProfile(row) {
  return {
    id: row.id,
    schoolName: row.school_name,
    affiliationNumber: row.affiliation_number,
    boardName: row.board_name,
    schoolCode: row.school_code,
    email: row.email,
    phone: row.phone,
    alternatePhone: row.alternate_phone,
    address: row.address,
    city: row.city,
    state: row.state,
    pincode: row.pincode,
    academicSession: row.academic_session,
    directorName: row.director_name,
    principalName: row.principal_name,
    logoUrl: row.logo_url,
    updatedAt: row.updated_at,
  };
}

// GET /api/school-profile
schoolProfileApp.get('/', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  const schoolId = getRequestSchoolId(c, authUser);
  const row = await db.prepare('SELECT * FROM school_profile WHERE id = ?').bind(schoolId).first();
  if (!row) return c.json({ success: false, message: 'स्कूल प्रोफ़ाइल नहीं मिली।' }, 404);
  return c.json({ success: true, profile: rowToProfile(row) });
});

// PUT /api/school-profile - केवल Director या Super Admin (scoped to their school)
schoolProfileApp.put('/', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);
  if (authUser.role !== 'Director' && authUser.role !== 'SuperAdmin') {
    return c.json({ success: false, message: 'केवल निदेशक या Super Admin स्कूल प्रोफ़ाइल बदल सकते हैं।' }, 403);
  }
  const schoolId = authUser.role === 'SuperAdmin' ? getRequestSchoolId(c, authUser) : authUser.schoolId;
  const body = await c.req.json().catch(() => ({}));
  const existing = await db.prepare('SELECT * FROM school_profile WHERE id = ?').bind(schoolId).first();
  if (!existing) return c.json({ success: false, message: 'स्कूल प्रोफ़ाइल नहीं मिली।' }, 404);

  const val = (field, fallback) => (body[field] !== undefined && body[field] !== null && body[field] !== '') ? body[field] : fallback;
  const now = new Date().toISOString().split('T')[0];

  await db.prepare('UPDATE school_profile SET school_name=?, affiliation_number=?, board_name=?, school_code=?, email=?, phone=?, alternate_phone=?, address=?, city=?, state=?, pincode=?, academic_session=?, director_name=?, principal_name=?, updated_at=? WHERE id=?')
    .bind(
      val('schoolName', existing.school_name),
      val('affiliationNumber', existing.affiliation_number),
      val('boardName', existing.board_name),
      val('schoolCode', existing.school_code),
      val('email', existing.email),
      val('phone', existing.phone),
      val('alternatePhone', existing.alternate_phone),
      val('address', existing.address),
      val('city', existing.city),
      val('state', existing.state),
      val('pincode', existing.pincode),
      val('academicSession', existing.academic_session),
      val('directorName', existing.director_name),
      val('principalName', existing.principal_name),
      now,
      schoolId
    ).run();

  const updated = await db.prepare('SELECT * FROM school_profile WHERE id = ?').bind(schoolId).first();
  return c.json({ success: true, message: 'स्कूल प्रोफ़ाइल व सेटिंग्स सफलतापूर्वक अद्यतित की गईं।', profile: rowToProfile(updated) });
});
