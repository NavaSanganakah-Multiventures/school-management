import { Hono } from 'hono';
import { principalHistory, systemUsers, schoolProfile, PrincipalHistoryRecord } from '../db';

export const principalApp = new Hono();

// GET /api/principal - वर्तमान प्रिंसिपल और इतिहास प्राप्त करें
principalApp.get('/', (c) => {
  const currentPrincipal = systemUsers.find((u) => u.role === 'Principal');
  return c.json({
    success: true,
    currentPrincipal: currentPrincipal || null,
    history: principalHistory,
    schoolProfile: {
      principalName: schoolProfile.principalName,
      schoolName: schoolProfile.schoolName,
    },
  });
});

// POST /api/principal/change - केवल डायरेक्टर के लिए: प्रिंसिपल को बदलना या नया प्रिंसिपल नियुक्त करना
principalApp.post('/change', async (c) => {
  try {
    const body = await c.req.json();
    const {
      fullName,
      email,
      phone,
      qualification,
      appointedDate,
      remarks,
      salary,
      directorId,
    } = body;

    if (!fullName || !email || !phone) {
      return c.json({
        success: false,
        message: 'प्रधानाचार्य का नाम, ईमेल और फोन नंबर अनिवार्य हैं।',
      }, 400);
    }

    const effectiveDate = appointedDate || new Date().toISOString().split('T')[0];

    // 1. यदि कोई वर्तमान प्रिंसिपल है, तो उसे इतिहास में Past के रूप में दर्ज करें
    const existingIndex = systemUsers.findIndex((u) => u.role === 'Principal');
    if (existingIndex !== -1) {
      const oldPrincipal = systemUsers[existingIndex];
      // इतिहास में रिलेविंग डेट जोड़ें
      const activeHist = principalHistory.find((h) => h.status === 'Active');
      if (activeHist) {
        activeHist.status = 'Past';
        activeHist.relievedDate = effectiveDate;
      }

      // अपडेट करें या नया क्रेडेंशियल बनाएं
      systemUsers[existingIndex] = {
        ...oldPrincipal,
        fullName,
        email,
        phone,
        qualification: qualification || oldPrincipal.qualification,
        salary: Number(salary) || oldPrincipal.salary,
        status: 'Active',
      };
    } else {
      systemUsers.push({
        id: `usr-principal-${Date.now()}`,
        username: email.split('@')[0] || 'principal_new',
        fullName,
        email,
        phone,
        role: 'Principal',
        designation: 'प्रधानाचार्य (Principal & Head of School)',
        department: 'शैक्षणिक एवं विद्यालय प्रशासन (Academics)',
        qualification: qualification || 'M.A., M.Ed., Ph.D.',
        salary: Number(salary) || 120000,
        status: 'Active',
        createdAt: effectiveDate,
      });
    }

    // 2. स्कूल प्रोफाइल में भी प्रिंसिपल का नाम अपडेट करें
    schoolProfile.principalName = fullName;

    // 3. नया इतिहास रिकॉर्ड जोड़ें
    const newRecord: PrincipalHistoryRecord = {
      id: `prn-hist-${Date.now()}`,
      fullName,
      email,
      phone,
      qualification: qualification || 'M.A., M.Ed., Ph.D.',
      appointedDate: effectiveDate,
      status: 'Active',
      appointedBy: directorId || 'सत्यप्रकाश शर्मा (डायरेक्टर)',
      remarks: remarks || 'डायरेक्टर द्वारा नया पदभार सौंपा गया',
    };
    principalHistory.unshift(newRecord);

    return c.json({
      success: true,
      message: `प्रधानाचार्य सफलतापूर्वक बदल दिए गए हैं। नए प्रधानाचार्य: ${fullName}`,
      currentPrincipal: systemUsers.find((u) => u.role === 'Principal'),
      history: principalHistory,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error?.message || 'प्रधानाचार्य बदलने में त्रुटि हुई',
    }, 500);
  }
});
