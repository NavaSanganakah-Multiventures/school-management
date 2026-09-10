import { Hono } from 'hono';
import { systemUsers, schoolProfile, UserRole } from '../db';

const authApp = new Hono();

// POST /api/auth/login - ईमेल और पासवर्ड के जरिए सुरक्षित लॉगिन
authApp.post('/login', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { email, password, role, username } = body;

  const normalizedEmail = (email || username || '').trim().toLowerCase();
  const rawPassword = (password || '').trim();

  // Find user by email or username
  let foundUser = systemUsers.find(
    (u) =>
      u.email.toLowerCase() === normalizedEmail ||
      u.username.toLowerCase() === normalizedEmail
  );

  // If not found by email/username and role is explicitly passed for quick switcher
  if (!foundUser && role) {
    foundUser = systemUsers.find((u) => u.role === (role as UserRole));
  }

  if (!foundUser) {
    return c.json(
      {
        success: false,
        message: 'प्रवेश विफल: इस ईमेल के साथ कोई अधिकृत उपयोगकर्ता नहीं मिला।',
      },
      401
    );
  }

  // Verify password if provided
  if (foundUser.password && rawPassword) {
    if (foundUser.password !== rawPassword) {
      return c.json(
        {
          success: false,
          message: 'अमान्य पासवर्ड: कृपया सही पासवर्ड दर्ज करें।',
        },
        401
      );
    }
  } else if (foundUser.password && !rawPassword && !role) {
    return c.json(
      {
        success: false,
        message: 'पासवर्ड आवश्यक है। कृपया अपना पासवर्ड दर्ज करें।',
      },
      400
    );
  }

  // Update last login
  foundUser.lastLogin = new Date().toLocaleString('hi-IN', { timeZone: 'Asia/Kolkata' });

  return c.json({
    success: true,
    message: `${foundUser.fullName} (${foundUser.designation}) के रूप में लॉगिन सफल हुआ।`,
    user: {
      id: foundUser.id,
      fullName: foundUser.fullName,
      email: foundUser.email,
      phone: foundUser.phone,
      role: foundUser.role,
      designation: foundUser.designation,
      department: foundUser.department,
      qualification: foundUser.qualification,
      schoolName: schoolProfile.schoolName,
      affiliationNumber: schoolProfile.affiliationNumber,
      academicSession: schoolProfile.academicSession,
      lastLogin: foundUser.lastLogin,
      token: `auth_sec_${foundUser.role.toLowerCase()}_${Date.now()}`,
    },
    schoolProfile,
  });
});

// GET /api/auth/users - सभी सिस्टम यूज़र्स और उनकी भूमिकाएं (पासवर्ड छिपाकर)
authApp.get('/users', (c) => {
  const safeUsers = systemUsers.map(({ password: _, ...rest }) => rest);
  return c.json({
    success: true,
    users: safeUsers,
  });
});

// GET /api/auth/profile
authApp.get('/profile', (c) => {
  const roleParam = (c.req.query('role') as UserRole) || 'Director';
  const user = systemUsers.find((u) => u.role === roleParam) || systemUsers[0];
  const { password: _, ...safeUser } = user;

  return c.json({
    success: true,
    user: safeUser,
    schoolProfile,
  });
});

// POST /api/auth/logout - लॉगआउट
authApp.post('/logout', (c) => {
  return c.json({
    success: true,
    message: 'सफलतापूर्वक लॉगआउट किया गया।',
  });
});

export default authApp;
