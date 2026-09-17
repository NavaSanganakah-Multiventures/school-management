import { Hono } from 'hono';
import { getDB } from '../db';
import { getAuthUser, getRequestSchoolId } from '../lib/auth';
import { logActivity, resolveActorName } from '../lib/activity-logger';
import { isClassTeacher } from '../lib/permissions';
import { GoogleGenAI, Type } from '@google/genai';
import { broadcastAlert } from '../notifications';
import { sendNotificationEmail } from '../lib/email';

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
    const files = body.files || []; // Expected format: [{ mimeType: 'image/jpeg', data: 'base64...' }]

    if (!prompt && files.length === 0) {
      return c.json({ success: false, message: 'प्रॉम्प्ट (Prompt) या फ़ाइल आवश्यक है।' }, 400);
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
Your primary role is to help staff add new students by reading their requests or analyzing uploaded documents (images, PDFs, etc.). 
Extract these 4 details: full name, class name, father's name, and parent phone number. 
Automatically detect if any of these details are missing from the provided text or document.
If any details are missing, you MUST ask the user to provide the missing details (e.g., "मुझे आपका फोन नंबर नहीं मिला, कृपया प्रदान करें").
Only call the 'addStudent' tool when you have gathered all the details, OR if the user explicitly tells you to proceed with missing details.
If proceeding with missing details, pass the missing field names as a comma-separated string to the 'missingDetails' parameter.
Always respond in Hindi. Be polite and concise.`;

    const addStudentTool = {
      functionDeclarations: [
        {
          name: 'addStudent',
          description: 'Adds a new student. Extract details from text/files. If user explicitly asks to proceed despite missing details, pass them in missingDetails.',
          parameters: {
            type: Type.OBJECT,
            properties: {
              fullName: { type: Type.STRING, description: 'Full name of the student (or empty if missing)' },
              className: { type: Type.STRING, description: 'Class name (e.g., 5, 10, VI, etc.) (or empty if missing)' },
              fatherName: { type: Type.STRING, description: "Father's name (or empty if missing)" },
              parentPhone: { type: Type.STRING, description: 'Parent phone number (10 digits) (or empty if missing)' },
              missingDetails: { type: Type.STRING, description: 'Comma separated list of missing fields if any (e.g. "phone, class")' }
            }
          }
        }
      ]
    };

    const apiContents: any[] = [];
    if (prompt) {
      apiContents.push({ text: prompt });
    }
    for (const file of files) {
      if (file.mimeType && file.data) {
        // Strip data URL prefix if present
        const base64Data = file.data.includes(',') ? file.data.split(',')[1] : file.data;
        apiContents.push({
          inlineData: {
            mimeType: file.mimeType,
            data: base64Data
          }
        });
      }
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: apiContents,
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
      const fullName = args.fullName || '';
      const className = args.className || 'Unknown';
      const fatherName = args.fatherName || '';
      const parentPhone = args.parentPhone || '';
      const missingDetails = args.missingDetails || '';

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
      const id = crypto.randomUUID();
      const classId = 'cls-' + String(className).toLowerCase().replace(/\\s+/g, '-');

      const admissionDate = new Date().toISOString().split('T')[0];
      const firstName = fullName.split(' ')[0] || '';
      const lastName = fullName.split(' ').slice(1).join(' ') || '';
      const histId = crypto.randomUUID();
      const actorName = await resolveActorName(db, authUser.sub, authUser.role);

      await db.prepare('INSERT OR REPLACE INTO students (id, roll_number, first_name, last_name, class_id, class_name, section, gender, dob, parent_name, parent_phone, email, address, blood_group, avatar_url, admission_date, status, school_id, scholar_number, father_name, father_occupation, mother_name, category, religion, aadhaar_number, samagra_id, whatsapp_number, current_address, permanent_address, previous_school, previous_tc_no, bank_account_no, bank_name, ifsc_code, tc_issue_date, remarks, updated_at, missing_details) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .bind(
          id, '', firstName, lastName,
          classId, className, 'A', 'Other', '', fatherName, parentPhone, '', '', '', '', admissionDate, 'Active', schoolId, scholarNumber, fatherName, '', '', 'General', 'Hindu', '', '', '', '', '', '', '', '', '', '', '', 'Added via AI Assistant', new Date().toISOString(), missingDetails
        ).run();

      await db.prepare(
        'INSERT INTO student_academic_history (id, school_id, student_id, scholar_number, event_type, event_date, academic_session, class_name, section, recorded_by_user_id, recorded_by_name, recorded_by_role, remarks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        histId, schoolId, id, scholarNumber, 'Initial_Admission', admissionDate, '2026-2027', className, 'A', authUser.sub, actorName, authUser.role, 'AI Assistant द्वारा प्रथम स्कॉलर प्रवेश'
      ).run();

      if (usingCredits) {
        await db.prepare(`UPDATE school_tenants SET ai_credits = ai_credits - 1 WHERE id = ?`).bind(schoolId).run();
      }

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

      resultMessage = `मैंने छात्र **${fullName}** को सफलतापूर्वक **कक्षा ${className}** में जोड़ दिया है। उनका स्कॉलर नंबर **${scholarNumber}** है।`;
      
      if (missingDetails) {
        resultMessage += `\n\n**ध्यान दें:** निम्नलिखित विवरण गायब हैं: ${missingDetails}।`;
        
        // Notify Director/Principal via FCM Broadcast
        await broadcastAlert(db, c.env, {
          title: 'Missing Student Details Alert',
          body: `Student ${fullName || scholarNumber} was added by AI with missing details: ${missingDetails}.`,
          schoolId: schoolId,
          targetRole: 'Director'
        });
        await broadcastAlert(db, c.env, {
          title: 'Missing Student Details Alert',
          body: `Student ${fullName || scholarNumber} was added by AI with missing details: ${missingDetails}.`,
          schoolId: schoolId,
          targetRole: 'Principal'
        });

        // Fetch emails of Director/Principal to send email alert
        const adminUsers = await db.prepare(
          `SELECT email FROM auth_users WHERE school_id = ? AND role IN ('Director', 'Principal') AND is_active = 1`
        ).bind(schoolId).all();

        if (adminUsers && adminUsers.results) {
          for (const admin of adminUsers.results as any[]) {
            if (admin.email) {
              await sendNotificationEmail(c.env, {
                to: admin.email,
                subject: 'Action Required: Missing Student Details',
                title: 'Missing Student Details',
                message: `Hello,\n\nA new student (${fullName || scholarNumber}) was registered via the AI Assistant, but some details are missing:\n\nMissing Fields: ${missingDetails}\n\nPlease update the student record in the system.`
              });
            }
          }
        }
      }
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
