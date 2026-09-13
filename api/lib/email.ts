// Cloudflare Email Service (send_email binding) helper.
// Sends transactional password reset / invite emails via the SEND_EMAIL binding.

export function getRequestOrigin(c: any, env?: any): string {
  if (env && env.APP_BASE_URL) return env.APP_BASE_URL;
  try {
    return new URL(c.req.url).origin;
  } catch (e) {
    return 'https://school-management.nssite.workers.dev';
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
