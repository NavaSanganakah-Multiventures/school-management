// Fee-payment notification helpers: sends a receipt email to the student/parent
// and inserts an in-app notice so the payment is visible in the school's notice board.
// Uses the same patterns as trial-expiration.ts (email + in-app notice).

import { sendNotificationEmail } from './email';

export async function notifyFeePayment(db: any, env: any, invoice: any, schoolId: string): Promise<void> {
  if (!db || !invoice) return;

  const studentName = invoice.student_name || '';
  const invoiceNumber = invoice.invoice_number || '';
  const paidAmount = Number(invoice.paid_amount) || 0;
  const totalAmount = Number(invoice.total_amount) || 0;

  // Resolve the student's email from the students table (student/parent contact).
  let studentEmail = '';
  try {
    // FIX: this selected `full_name`, which does not exist on `students`
    // (migration 0001 defines first_name/last_name and nothing ever added
    // full_name). The query therefore threw, the catch swallowed it, and
    // studentEmail stayed '' — so fee receipt emails were NEVER sent.
    const st = await db.prepare('SELECT email, first_name, last_name, parent_phone, whatsapp_number FROM students WHERE id = ? AND school_id = ?')
      .bind(invoice.student_id, schoolId).first();
    if (st && st.email) studentEmail = String(st.email);
  } catch (e) {
    console.error('[fee-notify] student lookup failed:', e && (e as any).message);
  }

  // A. Receipt email to student/parent.
  if (studentEmail) {
    try {
      await sendNotificationEmail(env, {
        to: studentEmail,
        subject: `✅ Pragnya Mitra — फीस भुगतान प्राप्त (${invoiceNumber})`,
        title: 'फीस भुगतान प्राप्त — रसीद',
        badge: 'भुगतान सफल',
        message: `नमस्ते,\n\n"${studentName}" के लिए फीस भुगतान सफलतापूर्वक प्राप्त हो गया है।\n\n` +
          `चालान सं.: ${invoiceNumber}\nजमा राशि: ₹${paidAmount.toLocaleString('en-IN')}\nकुल देय: ₹${totalAmount.toLocaleString('en-IN')}`,
      });
    } catch (e: any) {
      console.error('[fee-notify] receipt email failed:', e && e.message);
    }
  }

  // B. In-app notice for the school.
  try {
    const noticeId = 'not-fee-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    await db.prepare(
      `INSERT INTO notices (id, title, content, category, target_audience, published_by, published_date, priority, fcm_broadcast_status, school_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      noticeId,
      '✅ फीस भुगतान प्राप्त',
      `${studentName} के चालान ${invoiceNumber} पर ₹${paidAmount.toLocaleString('en-IN')} का भुगतान प्राप्त हुआ।`,
      'General',
      'Staff',
      'सिस्टम (Pragnya Mitra)',
      new Date().toISOString().split('T')[0],
      'Normal',
      'Sent',
      schoolId
    ).run();
  } catch (e: any) {
    console.error('[fee-notify] notice insert failed:', e && e.message);
  }
}