// Cloudflare Email Service (send_email binding) helper.
// Sends transactional password reset / invite emails via the SEND_EMAIL binding.

import { checkAndReserveEmailQuota, checkAndReserveSchoolEmailQuota } from './email-quota';

export function getRequestOrigin(c: any, env?: any): string {
  if (env && env.APP_BASE_URL) return env.APP_BASE_URL;
  try {
    return new URL(c.req.url).origin;
  } catch (e) {
    return 'https://pragnya.nasven.com';
  }
}

export interface PasswordResetEmailInput {
  to: string;
  name?: string;
  resetLink: string;
  invite?: boolean;
}

export interface EmailSendResult {
  sent: boolean;
  error?: string;
}

export async function sendPasswordResetEmail(env: any, input: PasswordResetEmailInput): Promise<EmailSendResult> {
  const binding = env && env.SEND_EMAIL;
  if (!binding || typeof binding.send !== 'function') {
    return { sent: false, error: 'SEND_EMAIL binding उपलब्ध नहीं है।' };
  }

  const quota = await checkAndReserveEmailQuota(env, input.to);
  if (!quota.allowed) {
    return { sent: false, error: quota.reason || 'ईमेल भेजने की दैनिक सीमा पार हो गई है।' };
  }

  const name = input.name || 'उपयोगकर्ता';
  const subject = input.invite
    ? 'Pragnya Mitra — अपना लॉगिन पासवर्ड सेट करें'
    : 'Pragnya Mitra — पासवर्ड रीसेट लिंक';
  const intro = input.invite
    ? 'आपका Pragnya Mitra लॉगिन खाता तैयार है। लॉगिन करने से पहले कृपया नीचे दिए बटन से अपना पासवर्ड सेट करें।'
    : 'हमें आपके खाते के लिए पासवर्ड रीसेट का अनुरोध प्राप्त हुआ। नीचे दिए बटन से नया पासवर्ड सेट करें।';

  const html = [
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b;line-height:1.6">',
    '<h1 style="font-size:20px;color:#4f46e5;margin:0 0 16px;">Pragnya Mitra</h1>',
    '<p style="font-size:14px;margin:0 0 12px;">नमस्ते ' + name + ',</p>',
    '<p style="font-size:14px;margin:0 0 24px;">' + intro + '</p>',
    '<p style="text-align:center;margin:0 0 24px;">',
    '<a href="' + input.resetLink + '" style="background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:bold;font-size:14px;display:inline-block;">पासवर्ड सेट करें</a>',
    '</p>',
    '<p style="font-size:12px;color:#64748b;margin:0 0 4px;">यह लिंक 30 मिनट के लिए वैध है और केवल एक बार उपयोग हो सकता है।</p>',
    '<p style="font-size:12px;color:#94a3b8;margin:0;">बटन काम न करे तो यह लिंक ब्राउज़र में खोलें:</p>',
    '<p style="font-size:12px;color:#94a3b8;word-break:break-all;margin:0 0 16px;">' + input.resetLink + '</p>',
    '<p style="font-size:12px;color:#cbd5e1;margin:0;">यदि यह अनुरोध आपने नहीं किया तो इस ईमेल को अनदेखा कर दें।</p>',
    '</div>'
  ].join('');

  const text = [
    'Pragnya Mitra',
    '',
    'नमस्ते ' + name + ',',
    '',
    intro,
    '',
    'पासवर्ड सेट करने के लिए यह लिंक खोलें (30 मिनट के लिए वैध):',
    input.resetLink,
    '',
    'यदि यह अनुरोध आपने नहीं किया तो इस ईमेल को अनदेखा कर दें।'
  ].join('\n');

  try {
    await binding.send({
      to: input.to,
      from: { email: 'pragnya@navasanganakah.com', name: 'Pragnya Mitra' },
      subject: subject,
      html: html,
      text: text
    });
    return { sent: true };
  } catch (e: any) {
    return { sent: false, error: (e && (e.message || e.code)) || 'ईमेल भेजने में त्रुटि हुई।' };
  }
}

export interface WelcomeEmailInput {
  to: string;
  name?: string;
  schoolName?: string;
  portalUrl: string;
  trialDays?: number;
}

// Registration welcome email — sent as soon as a school self-registers with the
// instant free trial (no admin approval). Tells the director their account is
// active and where their dedicated portal will appear.
export async function sendWelcomeEmail(env: any, input: WelcomeEmailInput): Promise<EmailSendResult> {
  const binding = env && env.SEND_EMAIL;
  if (!binding || typeof binding.send !== 'function') {
    return { sent: false, error: 'SEND_EMAIL binding उपलब्ध नहीं है।' };
  }

  const quota = await checkAndReserveEmailQuota(env, input.to);
  if (!quota.allowed) {
    return { sent: false, error: quota.reason || 'ईमेल भेजने की दैनिक सीमा पार हो गई है।' };
  }

  const name = input.name || 'स्कूल डायरेक्टर';
  const schoolName = input.schoolName || 'आपका स्कूल';
  const days = input.trialDays || 7;

  const html = [
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b;line-height:1.6">',
    '<h1 style="font-size:20px;color:#4f46e5;margin:0 0 16px;">Pragnya Mitra — स्कूल प्रबंधन प्लेटफ़ॉर्म</h1>',
    '<p style="font-size:14px;margin:0 0 12px;">नमस्ते ' + name + ',</p>',
    '<p style="font-size:14px;margin:0 0 12px;">आपका स्कूल <strong>' + schoolName + '</strong> सफलतापूर्वक पंजीकृत हो चुका है और <strong>' + days + '-दिन का FREE TRIAL तुरंत सक्रिय</strong> हो गया है। किसी approval की आवश्यकता नहीं है।</p>',
    '<p style="font-size:14px;margin:0 0 24px;">आपके स्कूल का निजी पोर्टल कुछ ही मिनटों में तैयार हो जाएगा। लॉगिन करने के लिए नीचे दिए गए लिंक का उपयोग करें:</p>',
    '<p style="text-align:center;margin:0 0 24px;">',
    '<a href="' + input.portalUrl + '" style="background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:bold;font-size:14px;display:inline-block;">अपने स्कूल पोर्टल पर जाएं</a>',
    '</p>',
    '<p style="font-size:12px;color:#64748b;margin:0 0 4px;">आपका पोर्टल: <a href="' + input.portalUrl + '" style="color:#4f46e5;">' + input.portalUrl + '</a></p>',
    '<p style="font-size:12px;color:#64748b;margin:0 0 4px;">यदि पोर्टल अभी तैयार नहीं हुआ है तो कृपया 10–20 मिनट बाद पुनः प्रयास करें।</p>',
    '<p style="font-size:12px;color:#94a3b8;margin:0;border-top:1px solid #e2e8f0;padding-top:12px;">किसी भी सहायता के लिए संपर्क करें: pragnya@navasanganakah.com</p>',
    '</div>'
  ].join('');

  const text = [
    'Pragnya Mitra — स्कूल प्रबंधन प्लेटफ़ॉर्म',
    '',
    'नमस्ते ' + name + ',',
    '',
    'आपका स्कूल "' + schoolName + '" सफलतापूर्वक पंजीकृत हो चुका है और ' + days + '-दिन का FREE TRIAL तुरंत सक्रिय हो गया है। किसी approval की आवश्यकता नहीं है।',
    '',
    'आपके स्कूल का निजी पोर्टल कुछ ही मिनटों में तैयार हो जाएगा:',
    input.portalUrl,
    '',
    'यदि पोर्टल अभी तैयार नहीं हुआ है तो कृपया 10–20 मिनट बाद पुनः प्रयास करें।',
    '',
    'सहायता: pragnya@navasanganakah.com'
  ].join('\n');

  try {
    await binding.send({
      to: input.to,
      from: { email: 'pragnya@navasanganakah.com', name: 'Pragnya Mitra' },
      subject: 'Pragnya Mitra — ' + schoolName + ' सक्रिय: FREE TRIAL शुरू हो गया',
      html: html,
      text: text
    });
    return { sent: true };
  } catch (e: any) {
    return { sent: false, error: (e && (e.message || e.code)) || 'ईमेल भेजने में त्रुटि हुई।' };
  }
}

export interface NotificationEmailInput {
  to: string;
  subject: string;
  title?: string;
  message: string;
  buttonText?: string;
  buttonUrl?: string;
  badge?: string;
}

export async function sendNotificationEmail(env: any, input: NotificationEmailInput): Promise<EmailSendResult> {
  const binding = env && env.SEND_EMAIL;
  if (!binding || typeof binding.send !== 'function') {
    return { sent: false, error: 'SEND_EMAIL binding उपलब्ध नहीं है।' };
  }

  const quota = await checkAndReserveEmailQuota(env, input.to);
  if (!quota.allowed) {
    return { sent: false, error: quota.reason || 'ईमेल भेजने की दैनिक सीमा पार हो गई है।' };
  }

  const title = input.title || 'महत्वपूर्ण सूचना';
  const badgeHtml = input.badge
    ? '<span style="display:inline-block;padding:4px 10px;background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;border-radius:9999px;font-size:11px;font-weight:bold;margin-bottom:12px;">' + input.badge + '</span>'
    : '';

  const buttonHtml = input.buttonText && input.buttonUrl
    ? '<p style="text-align:center;margin:28px 0;"><a href="' + input.buttonUrl + '" style="background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 26px;border-radius:10px;font-weight:bold;font-size:14px;display:inline-block;box-shadow:0 2px 4px rgba(79,70,229,0.25);">' + input.buttonText + '</a></p>'
    : '';

  const html = [
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b;line-height:1.6;border:1px solid #e2e8f0;border-radius:16px;background:#ffffff;">',
    '<div style="margin-bottom:16px;border-bottom:1px solid #f1f5f9;padding-bottom:12px;">',
    badgeHtml,
    '<h1 style="font-size:20px;color:#4f46e5;margin:0 0 6px;">Pragnya Mitra — स्कूल प्रबंधन</h1>',
    '<h2 style="font-size:16px;margin:0;color:#0f172a;">' + title + '</h2>',
    '</div>',
    '<div style="font-size:14px;margin:0 0 20px;white-space:pre-wrap;color:#334155;">' + input.message + '</div>',
    buttonHtml,
    '<p style="font-size:12px;color:#94a3b8;margin:24px 0 0;border-top:1px solid #f1f5f9;padding-top:12px;">यह एक स्वचालित संदेश है। किसी भी सहायता के लिए संपर्क करें: pragnya@navasanganakah.com</p>',
    '</div>'
  ].join('');

  const textLines = [
    'Pragnya Mitra — स्कूल प्रबंधन',
    '----------------------------------------',
    title,
    '',
    input.message,
    ''
  ];
  if (input.buttonText && input.buttonUrl) {
    textLines.push(input.buttonText + ': ' + input.buttonUrl, '');
  }
  textLines.push('यह एक स्वचालित संदेश है। सहायता: pragnya@navasanganakah.com');

  try {
    await binding.send({
      to: input.to,
      from: { email: 'pragnya@navasanganakah.com', name: 'Pragnya Mitra Alerts' },
      subject: input.subject,
      html: html,
      text: textLines.join('\n')
    });
    return { sent: true };
  } catch (e: any) {
    return { sent: false, error: (e && (e.message || e.code)) || 'ईमेल भेजने में त्रुटि हुई।' };
  }
}


export interface SchoolEmailConfig {
  fromName: string;
  fromEmail: string;
  replyTo: string;
  isActive: boolean;
}

export async function getSchoolEmailConfig(db: any, schoolId: string): Promise<SchoolEmailConfig | null> {
  if (!db || typeof db.prepare !== 'function' || !schoolId) return null;
  try {
    const row = await db.prepare(
      'SELECT from_name, from_email, reply_to, is_active FROM school_email_config WHERE school_id = ?'
    ).bind(schoolId).first();
    if (!row) return null;
    return {
      fromName: row.from_name || '',
      fromEmail: row.from_email || '',
      replyTo: row.reply_to || '',
      isActive: row.is_active === undefined ? true : !!row.is_active,
    };
  } catch (e: any) {
    console.error('school email config read failed:', e && e.message);
    return null;
  }
}

export interface SchoolEmailInput {
  schoolId?: string;
  to: string;
  subject: string;
  title?: string;
  message: string;
}

export async function sendSchoolEmail(env: any, input: SchoolEmailInput): Promise<EmailSendResult> {
  const binding = env && env.SEND_EMAIL;
  if (!binding || typeof binding.send !== 'function') {
    return { sent: false, error: 'SEND_EMAIL binding उपलब्ध नहीं है। Email Routing सक्षम करें।' };
  }

  const db = env && env.DB;
  if (input.schoolId && db && typeof db.prepare === 'function') {
    const schoolQuota = await checkAndReserveSchoolEmailQuota(db, input.schoolId);
    if (!schoolQuota.allowed) {
      return { sent: false, error: schoolQuota.reason || 'मासिक ईमेल सीमा पार हो गई है।' };
    }
  }

  const dailyQuota = await checkAndReserveEmailQuota(env, input.to);
  if (!dailyQuota.allowed) {
    return { sent: false, error: dailyQuota.reason || 'दैनिक ईमेल सीमा पार हो गई है।' };
  }

  let fromName = 'Pragnya Mitra Alerts';
  let fromEmail = 'pragnya@navasanganakah.com';
  if (input.schoolId && db && typeof db.prepare === 'function') {
    const cfg = await getSchoolEmailConfig(db, input.schoolId);
    if (cfg && cfg.isActive && cfg.fromEmail) {
      fromEmail = cfg.fromEmail;
      fromName = cfg.fromName || cfg.fromEmail;
    }
  }

  const title = input.title || 'महत्वपूर्ण सूचना';
  const html = [
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b;line-height:1.6">',
    '<h1 style="font-size:20px;color:#4f46e5;margin:0 0 16px;">' + fromName + '</h1>',
    '<h2 style="font-size:16px;margin:0 0 12px;">' + title + '</h2>',
    '<p style="font-size:14px;margin:0 0 24px;white-space:pre-wrap;">' + input.message + '</p>',
    '<p style="font-size:12px;color:#cbd5e1;margin:0;border-top:1px solid #e2e8f0;padding-top:12px;">यह एक स्वचालित ईमेल है, कृपया इसका उत्तर न दें।</p>',
    '</div>'
  ].join('');

  const text = [
    fromName,
    '',
    title,
    '',
    input.message,
    '',
    'यह एक स्वचालित ईमेल है, कृपया इसका उत्तर न दें।'
  ].join('\n');

  try {
    await binding.send({
      to: input.to,
      from: { email: fromEmail, name: fromName },
      subject: input.subject,
      html: html,
      text: text
    });
    return { sent: true };
  } catch (e: any) {
    return { sent: false, error: (e && (e.message || e.code)) || 'ईमेल भेजने में त्रुटि हुई।' };
  }
}
