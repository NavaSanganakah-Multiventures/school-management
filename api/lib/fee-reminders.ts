// Automated fee due reminders: sends email + push notifications for unpaid/partial
// fee invoices that are due soon (within 3 days) or overdue. Idempotent via
// fee_reminders_log (one reminder per invoice per stage).
// Called by the scheduled cron alongside the other processors.

import { sendNotificationEmail } from './email';
import { broadcastAlert } from '../notifications';

export interface FeeReminderResult {
  success: boolean;
  timestamp: string;
  checkedCount: number;
  remindersSent: number;
  details: Array<{
    schoolId: string;
    invoiceId: string;
    studentName: string;
    stage: string;
    emailStatus?: string;
  }>;
}

export async function processFeeReminders(env: any, passedDb?: any): Promise<FeeReminderResult> {
  const db = passedDb || (env && env.DB);
  if (!db || typeof db.prepare !== 'function') {
    throw new Error('Database binding (DB) is required to process fee reminders.');
  }

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const threeDaysLater = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const nowIso = now.toISOString();

  let checkedCount = 0;
  let remindersSent = 0;
  const details: FeeReminderResult['details'] = [];

  const stages = [
    { stage: 'overdue', where: 'f.due_date < ?', params: [todayStr] },
    { stage: 'due_soon', where: 'f.due_date >= ? AND f.due_date <= ?', params: [todayStr, threeDaysLater] },
  ];

  for (const s of stages) {
    let rows: any[] = [];
    try {
      const res = await db.prepare(
        `SELECT f.id, f.school_id, f.student_id, f.student_name, f.invoice_number, f.title, f.total_amount, f.paid_amount, f.due_date
         FROM fee_invoices f
         WHERE f.status != 'Paid' AND ${s.where}
         ORDER BY f.due_date ASC
         LIMIT 200`
      ).bind(...s.params).all();
      rows = res.results || [];
    } catch (err: any) {
      console.error('[FeeReminders] query failed for', s.stage, err && err.message);
      continue;
    }

    for (const inv of rows) {
      checkedCount++;

      // Idempotency: skip if this stage was already sent for this invoice.
      try {
        const existing = await db.prepare('SELECT id FROM fee_reminders_log WHERE invoice_id = ? AND stage = ?')
          .bind(inv.id, s.stage).first();
        if (existing) continue;
      } catch (_) {}

      const remaining = Number(inv.total_amount) - Number(inv.paid_amount);
      let studentEmail = '';
      try {
        const st = await db.prepare('SELECT email FROM students WHERE id = ? AND school_id = ?')
          .bind(inv.student_id, inv.school_id).first();
        if (st && st.email) studentEmail = String(st.email);
      } catch (_) {}

      let emailStatus = 'skipped_no_email';
      const dueLabel = s.stage === 'overdue' ? 'अतिदेय (Overdue)' : 'नियत तिथि निकट';
      if (studentEmail) {
        const emailRes = await sendNotificationEmail(env, {
          to: studentEmail,
          subject: `🔔 Pragnya Mitra — फीस अनुस्मारक (${inv.invoice_number})`,
          title: `फीस भुगतान अनुस्मारक — ${inv.title}`,
          badge: dueLabel,
          message: `नमस्ते,\n\n"${inv.student_name}" के लिए फीस चालान ${inv.invoice_number} का भुगतान ${inv.due_date} तक देय है।\n\nशेष राशि: ₹${remaining.toLocaleString('en-IN')}\n\nकृपया समय पर भुगतान करें।`,
        }).catch((e: any) => ({ sent: false, error: e && e.message ? e.message : 'failed' }));
        emailStatus = emailRes.sent ? 'sent' : (emailRes.error || 'failed');
      }

      // Push to the fees_due topic (parents).
      try {
        await broadcastAlert(db, env, {
          title: '🔔 फीस भुगतान अनुस्मारक',
          body: `"${inv.student_name}" के चालान ${inv.invoice_number} की शेष राशि ₹${remaining.toLocaleString('en-IN')} ${inv.due_date} तक देय है।`,
          schoolId: inv.school_id,
          topicKey: 'school_' + inv.school_id + '_fees_due',
          priority: 'normal',
          data: { type: 'fee_reminder', stage: s.stage, invoiceId: inv.id },
        });
      } catch (_) {}

      // Record the reminder (idempotency).
      try {
        const logId = 'fr-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
        await db.prepare('INSERT INTO fee_reminders_log (id, school_id, invoice_id, stage, sent_at) VALUES (?,?,?,?,?)')
          .bind(logId, inv.school_id, inv.id, s.stage, nowIso).run();
        await db.prepare('UPDATE fee_invoices SET last_reminder_at = ? WHERE id = ?').bind(nowIso, inv.id).run();
      } catch (_) {}

      remindersSent++;
      details.push({ schoolId: inv.school_id, invoiceId: inv.id, studentName: inv.student_name, stage: s.stage, emailStatus });
    }
  }

  return { success: true, timestamp: nowIso, checkedCount, remindersSent, details };
}