import { Hono } from 'hono';
import { getDB } from '../db';
import { getAuthUser, getRequestSchoolId } from '../lib/auth';
import { logActivity, resolveActorName } from '../lib/activity-logger';
import { isClassTeacher } from '../lib/permissions';
import { GoogleGenAI, Type } from '@google/genai';

const aiApp = new Hono<{ Bindings: any }>();

aiApp.post('/chat', async (c) => {
  try {
    const db = getDB(c);
    if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
    const authUser = await getAuthUser(c);
    if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);
    const schoolId = getRequestSchoolId(c, authUser);
    const body = await c.req.json().catch(() => ({}));
    const prompt = body.prompt;

    if (!prompt) {
      return c.json({ success: false, message: 'प्रॉम्प्ट (Prompt) आवश्यक है।' }, 400);
    }

    // Check if plugin is active
    const pluginCheck = await db.prepare(
      `SELECT status FROM school_plugins WHERE school_id = ? AND plugin_id = 'plugin-ai-assistant'`
    ).bind(schoolId).first();
    
    if (!pluginCheck || pluginCheck.status !== 'active') {
      return c.json({ success: false, message: 'AI Assistant प्लगइन एक्टिव नहीं है।' }, 403);
    }

    // Get school settings for custom api key and credits
    const school = await db.prepare(
      `SELECT gemini_api_key, ai_credits FROM school_tenants WHERE id = ?`
    ).bind(schoolId).first();

    let apiKey = school?.gemini_api_key;
    let usingCredits = false;

    if (!apiKey) {
      // Use platform key
      apiKey = c.env.GEMINI_API_KEY;
      if (!apiKey) {
        return c.json({ success: false, message: 'सिस्टम में Gemini API Key कॉन्फ़िगर नहीं है।' }, 500);
      }
      if (!school || school.ai_credits <= 0) {
        return c.json({ success: false, message: 'AI Credits समाप्त हो गए हैं। कृपया कस्टम API Key सेट करें या Credits रीचार्ज करें।' }, 402);
      }
      usingCredits = true;
    }

    // Initialize Google GenAI
    // Use Cloudflare AI Gateway if CLOUDFLARE_AI_GATEWAY_ID and CLOUDFLARE_ACCOUNT_ID exist
    const gatewayId = c.env.CLOUDFLARE_AI_GATEWAY_ID;
    const accountId = c.env.CLOUDFLARE_ACCOUNT_ID;
    let baseUrl: string | undefined = undefined;

    if (gatewayId && accountId) {
      baseUrl = `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayId}/google-genai`;
    }

    const ai = new GoogleGenAI({
      apiKey,
      ...(baseUrl ? { httpOptions: { baseUrl } } : {})
    });

    const systemInstruction = `You are a helpful AI assistant for VidyaSetu School Management System.
Your primary role is to help staff add new students. 
When the user asks to add a student, extract their full name, class name, father's name, and parent phone number. 
If any of these 4 required fields are missing, politely ask the user for them in Hindi.
Once you have all 4 fields, call the 'addStudent' tool.
Always respond in Hindi. Be polite and concise.`;

    const addStudentTool = {
      functionDeclarations: [
        {
          name: 'addStudent',
          description: 'Adds a new student to the school database. Requires full name, class name, father name, and parent phone.',
          parameters: {
            type: Type.OBJECT,
            properties: {
              fullName: { type: Type.STRING, description: 'Full name of the student' },
              className: { type: Type.STRING, description: 'Class name (e.g., 5, 10, VI, etc.)' },
              fatherName: { type: Type.STRING, description: "Father's name" },
              parentPhone: { type: Type.STRING, description: 'Parent phone number (10 digits)' }
            },
            required: ['fullName', 'className', 'fatherName', 'parentPhone']
          }
        }
      ]
    };

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction,
        tools: [addStudentTool],
        temperature: 0.2
      }
    });

    // Check if tool was called
    let functionCall = null;
    if (response.candidates && response.candidates[0]?.content?.parts) {
       for (const part of response.candidates[0].content.parts) {
          if (part.functionCall && part.functionCall.name === 'addStudent') {
             functionCall = part.functionCall;
             break;
          }
       }
    }

    let resultMessage = response.text || "क्षमा करें, मैं आपका अनुरोध समझ नहीं पाया।";

    if (functionCall) {
      // Execute the addStudent logic
      const args = functionCall.args as any;
      const { fullName, className, fatherName, parentPhone } = args;
      
      // Verification logic identical to students API
      if (authUser.role === 'Staff') {
        const isTeacher = await isClassTeacher(db, schoolId, className, authUser.sub);
        if (!isTeacher) {
          return c.json({
            success: false,
            message: `क्षमा करें, केवल अधिकृत कक्षा अध्यापक या प्रधानाचार्य ही कक्षा "${className}" में छात्र प्रवेश दर्ज कर सकते हैं।`,
          }, 403);
        }
      }

      const cntAll = await db.prepare('SELECT COUNT(*) AS n FROM students WHERE school_id = ?').bind(schoolId).first();
      const nextNum = (cntAll ? (cntAll as any).n : 0) + 1;
      const scholarNumber = 'SR-' + new Date().getFullYear() + '/' + String(nextNum).padStart(3, '0');
      const id = 'std-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
      const classId = 'cls-' + String(className).toLowerCase().replace(/\s+/g, '-');

      const admissionDate = new Date().toISOString().split('T')[0];
      const firstName = fullName.split(' ')[0] || '';
      const lastName = fullName.split(' ').slice(1).join(' ') || '';

      await db.prepare('INSERT OR REPLACE INTO students (id, roll_number, first_name, last_name, class_id, class_name, section, gender, dob, parent_name, parent_phone, email, address, blood_group, avatar_url, admission_date, status, school_id, scholar_number, father_name, father_occupation, mother_name, category, religion, aadhaar_number, samagra_id, whatsapp_number, current_address, permanent_address, previous_school, previous_tc_no, bank_account_no, bank_name, ifsc_code, tc_issue_date, remarks, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .bind(
          id, '', firstName, lastName,
          classId, className, 'A', 'Other', '', fatherName, parentPhone, '', '', '', '', admissionDate, 'Active', schoolId, scholarNumber, fatherName, '', '', 'General', 'Hindu', '', '', '', '', '', '', '', '', '', '', '', 'Added via AI Assistant', new Date().toISOString()
        ).run();

      const actorName = await resolveActorName(db, authUser.sub, authUser.role);

      await logActivity(db, {
        schoolId,
        userId: authUser.sub,
        userName: actorName,
        userRole: authUser.role,
        actionType: 'STUDENT_ADD_AI',
        actionTitle: 'AI द्वारा नया स्कॉलर प्रवेश',
        description: `कक्षा ${className} में नए छात्र ${fullName} (स्कॉलर सं.: ${scholarNumber}) का प्रवेश AI द्वारा दर्ज किया गया।`,
        entityType: 'student',
        entityId: id,
        className: String(className),
      });

      // Insert academic history for initial admission
      try {
        const histId = 'sah-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
        await db.prepare(
          'INSERT INTO student_academic_history (id, school_id, student_id, scholar_number, event_type, event_date, academic_session, class_name, section, recorded_by_user_id, recorded_by_name, recorded_by_role, remarks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(
          histId, schoolId, id, scholarNumber, 'Initial_Admission', admissionDate, '2026-2027', className, 'A', authUser.sub, actorName, authUser.role, 'AI Assistant द्वारा प्रथम स्कॉलर प्रवेश'
        ).run();
      } catch(e) {
         console.error('Error writing academic history AI:', e);
      }

      resultMessage = `मैंने छात्र **${fullName}** को सफलतापूर्वक **कक्षा ${className}** में जोड़ दिया है। उनका स्कॉलर नंबर **${scholarNumber}** है।`;
    }

    if (usingCredits) {
      await db.prepare(`UPDATE school_tenants SET ai_credits = ai_credits - 1 WHERE id = ?`).bind(schoolId).run();
    }

    return c.json({ success: true, message: resultMessage });

  } catch (error: any) {
    console.error('AI Chat Error:', error);
    return c.json({ success: false, message: 'AI के साथ संचार करते समय त्रुटि हुई।' }, 500);
  }
});

aiApp.get('/settings', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'Database not available' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'Unauthorized' }, 401);
  const schoolId = getRequestSchoolId(c, authUser);

  const school = await db.prepare(
    `SELECT gemini_api_key, ai_credits FROM school_tenants WHERE id = ?`
  ).bind(schoolId).first();

  return c.json({
    success: true,
    hasCustomApiKey: !!school?.gemini_api_key,
    aiCredits: school?.ai_credits || 0
  });
});

aiApp.put('/settings', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'Database not available' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'Unauthorized' }, 401);
  if (authUser.role !== 'Director' && authUser.role !== 'SuperAdmin' && authUser.role !== 'Principal') {
    return c.json({ success: false, message: 'Forbidden' }, 403);
  }
  const schoolId = getRequestSchoolId(c, authUser);
  const body = await c.req.json().catch(() => ({}));

  await db.prepare(`UPDATE school_tenants SET gemini_api_key = ? WHERE id = ?`).bind(body.apiKey || null, schoolId).run();
  
  return c.json({ success: true, message: 'Settings updated' });
});

export default aiApp;
