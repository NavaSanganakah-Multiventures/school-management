import { sendNotificationEmail } from './email';
import { broadcastAlert } from '../notifications';
import { createRazorpayPaymentLink } from './razorpay';
import { loadSubscriptionPlanById } from '../db';

export interface TrialProcessResult {
  success: boolean;
  timestamp: string;
  checkedCount: number;
  remindersSent: number;
  expirationsProcessed: number;
  details: Array<{
    schoolId: string;
    schoolName: string;
    action: 'reminder_sent' | 'expired_processed' | 'already_notified';
    trialEndsAt: string;
    emailStatus?: string;
  }>;
}

function resolveBillingUrl(school: any, env?: any): string {
  const baseDomain = env && env.APP_BASE_URL ? env.APP_BASE_URL : 'https://pragnya.nasven.com';
  if (school && school.custom_domain) {
    return `https://${school.custom_domain}/?tab=billing`;
  }
  if (school && school.subdomain) {
    return `https://${school.subdomain}.pragnya.nasven.com/?tab=billing`;
  }
  return `${baseDomain}/?tab=billing`;
}

/**
 * Resolves a real Razorpay payment link (short_url) for a school's recommended plan.
 * Falls back to the billing-page URL if Razorpay keys aren't configured or the link
 * creation fails (so trial emails still always send a usable CTA).
 * Also creates a pending billing_invoices row so the webhook can auto-activate on payment.
 */
async function resolvePaymentLink(env: any, db: any, school: any): Promise<{ url: string; invoiceId?: string; linkId?: string; planName?: string; total?: number; source: string }> {
  const fallbackUrl = resolveBillingUrl(school, env);
  const planId = (school.preferred_plan_id && school.preferred_plan_id !== 'trial') ? school.preferred_plan_id : 'starter';
  let plan: any = null;
  try {
    plan = await loadSubscriptionPlanById(db, planId);
  } catch (_) { plan = null; }
  if (!plan || plan.isTrial) {
    try { plan = await loadSubscriptionPlanById(db, 'starter'); } catch (_) { plan = null; }
  }
  if (!plan || plan.isTrial) {
    return { url: fallbackUrl, source: 'billing_url_no_paid_plan' };
  }

  const basePrice = plan.annualPrice || plan.monthlyPrice || 0;
  if (basePrice <= 0) return { url: fallbackUrl, source: 'billing_url_zero_price' };

  const gst = +(basePrice * 0.18).toFixed(2);
  const total = +(basePrice + gst).toFixed(2);
  const referenceId = 'VSTRL' + Date.now().toString(36) + (crypto.randomUUID().split('-').join('').slice(0, 6));

  // Reuse an existing pending payment-link invoice for this school to avoid duplicates per cron run.
  try {
    const existing = await db.prepare(
      "SELECT id, razorpay_payment_link_url FROM billing_invoices WHERE school_id = ? AND payment_status = 'Processing' AND razorpay_payment_link_url != '' AND razorpay_payment_link_url IS NOT NULL ORDER BY invoice_date DESC LIMIT 1"
    ).bind(school.id).first();
    if (existing && existing.razorpay_payment_link_url) {
      return { url: existing.razorpay_payment_link_url, invoiceId: existing.id, linkId: '', planName: plan.name, total, source: 'existing_link' };
    }
  } catch (_) {}

  const linkResult = await createRazorpayPaymentLink(env, {
    amountINR: total,
    description: plan.name + ' सदस्यता (annual) — ' + school.school_name,
    referenceId,
    customerName: school.school_name,
    customerEmail: school.contact_email,
    customerContact: school.contact_phone,
    notes: { school_id: school.id, plan_id: plan.id, billing_cycle: 'annual' },
  });

  if (linkResult.error || !linkResult.shortUrl) {
    return { url: fallbackUrl, planName: plan.name, total, source: 'billing_url_link_failed' };
  }

  // Store a pending invoice so the webhook resolves it on payment.
  const invoiceNumber = 'VS-INV-' + Date.now() + '-' + (crypto.randomUUID().split('-').join('').slice(0, 8));
  const now = new Date().toISOString();
  const invoiceId = 'binv-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  try {
    await db.prepare(
      'INSERT INTO billing_invoices (id, school_id, invoice_number, description, plan_name, billing_cycle, subtotal, gst_percent, gst_amount, total_amount, payment_status, payment_method, transaction_id, invoice_date, due_date, paid_at, razorpay_payment_link_id, razorpay_payment_link_url) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
    ).bind(
      invoiceId, school.id, invoiceNumber, plan.name + ' सदस्यता', plan.name, 'annual',
      basePrice, 18, gst, total, 'Processing', 'Razorpay', '',
      now.split('T')[0], now.split('T')[0], '', linkResult.id || '', linkResult.shortUrl
    ).run();
  } catch (_) {
    // Older schema — store without link columns.
    try {
      await db.prepare(
        'INSERT INTO billing_invoices (id, school_id, invoice_number, description, plan_name, billing_cycle, subtotal, gst_percent, gst_amount, total_amount, payment_status, payment_method, transaction_id, invoice_date, due_date, paid_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
      ).bind(
        invoiceId, school.id, invoiceNumber, plan.name + ' सदस्यता', plan.name, 'annual',
        basePrice, 18, gst, total, 'Processing', 'Razorpay', '',
        now.split('T')[0], now.split('T')[0], ''
      ).run();
    } catch (_) {}
  }

  return { url: linkResult.shortUrl, invoiceId, linkId: linkResult.id, planName: plan.name, total, source: 'razorpay_link' };
}

/**
 * Checks and processes trial expirations across all schools.
 * 1. Schools with trials expiring in <= 2 days receive a friendly payment reminder email & push notification.
 * 2. Schools whose trial has ended (trial_ends_at < today) are marked Expired/Suspended,
 *    and receive an urgent payment & reactivation notice.
 */
export async function processTrialExpirations(env: any, passedDb?: any): Promise<TrialProcessResult> {
  const db = passedDb || (env && env.DB);
  if (!db || typeof db.prepare !== 'function') {
    throw new Error('Database binding (DB) is required to process trial expirations.');
  }

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const twoDaysLaterDate = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
  const twoDaysLaterStr = twoDaysLaterDate.toISOString().split('T')[0];
  const nowIso = now.toISOString();

  let checkedCount = 0;
  let remindersSent = 0;
  let expirationsProcessed = 0;
  const details: TrialProcessResult['details'] = [];

  // -------------------------------------------------------------
  // 1. Process Expired Schools (trial_ends_at < today)
  // -------------------------------------------------------------
  try {
    const expiredRows = await db.prepare(
      `SELECT s.id, s.school_name, s.subdomain, s.custom_domain, s.contact_email, s.contact_phone,
              s.status, s.registration_status, s.plan_id, s.trial_ends_at, s.trial_expired_sent_at, s.preferred_plan_id
       FROM school_tenants s
       WHERE (s.plan_id = 'trial' OR s.status = 'Trial')
          AND s.trial_ends_at IS NOT NULL
          AND s.trial_ends_at != ''
          AND s.trial_ends_at < ?
          AND s.deleted_at IS NULL
          LIMIT 200`
    ).bind(todayStr).all();

    const expiredSchools = expiredRows.results || [];
    checkedCount += expiredSchools.length;

    for (const school of expiredSchools) {
      // 1. Update status to Suspended and Trial_Expired in DB (atomic pair)
      // NOTE: school_subscriptions.status is CHECK-constrained to ('Active','Past_Due','Canceled','Trial'),
      // so we use 'Past_Due' for a lapsed/expired trial (never 'Expired' — that throws a constraint violation).
      try {
        await db.batch([
          db.prepare(`UPDATE school_tenants SET status = 'Suspended', registration_status = 'Trial_Expired' WHERE id = ?`).bind(school.id),
          db.prepare(`UPDATE school_subscriptions SET status = 'Past_Due', updated_at = ? WHERE school_id = ?`).bind(nowIso, school.id),
        ]);
      } catch (updErr) {
        console.error('[TrialProcessor] Failed to mark school expired:', school.id, updErr);
        continue;
      }

      // 2. Send notification if not already sent
      if (!school.trial_expired_sent_at) {
        const link = await resolvePaymentLink(env, db, school);

        // A. Send Expiry Email with direct Razorpay payment CTA
        let emailStatus = 'skipped_no_email';
        if (school.contact_email) {
          const priceLine = link.total ? `\n\nअनुशंसित प्लान: ${link.planName} — ₹${link.total}/वर्ष` : '';
          const emailRes = await sendNotificationEmail(env, {
            to: school.contact_email,
            subject: `⚠️ विद्या सेतु — आपके स्कूल "${school.school_name}" का 7-दिन का ट्रायल समाप्त हो चुका है | अभी भुगतान करें`,
            title: `ट्रायल समाप्त — स्कूल सेवाएं पुनः सक्रिय करें`,
            badge: 'ट्रायल समाप्त (Expired)',
            message: `नमस्ते,\n\nआपके विद्यालय "${school.school_name}" का 7-दिन का निःशुल्क ट्रायल ${school.trial_ends_at} को समाप्त हो गया है।\n\n` +
              `🔒 आपका संपूर्ण स्कूल डेटा (छात्र विवरण, फीस रिकॉर्ड, उपस्थिति, कर्मचारी प्रोफाइल) क्लाउड में 100% सुरक्षित है।\n\n` +
              `स्कूल का सामान्य शैक्षणिक एवं प्रशासनिक कार्य तुरंत पुनः शुरू करने के लिए कृपया नीचे दिए बटन से अपनी आवश्यकतानुसार उपयुक्त प्लान चुनें और भुगतान पूरा करें।` + priceLine,
            buttonText: 'अभी प्लान चुनें और भुगतान करें (Pay Now) →',
            buttonUrl: link.url,
          });
          emailStatus = emailRes.sent ? 'sent' : (emailRes.error || 'failed');
        }

        // B. Send High-Priority Push Notification to Director
        try {
          await broadcastAlert(db, env, {
            title: '⚠️ स्कूल फ्री ट्रायल समाप्त — तुरंत प्लान सक्रिय करें',
            body: `आपके स्कूल "${school.school_name}" का 7-दिन का फ्री ट्रायल समाप्त हो गया है। सेवाएं चालू रखने के लिए अभी बिलिंग से प्लान खरीदें।`,
            schoolId: school.id,
            targetRole: 'Director',
            priority: 'high',
            data: {
              type: 'trial_expired',
              actionUrl: link.url,
            },
          });
        } catch (pushErr) {
          console.error('[TrialProcessor] Expiry push failed for school', school.id, pushErr);
        }

        // C. Insert In-App Notice for the school
        try {
          const noticeId = 'not-exp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
          await db.prepare(
            `INSERT INTO notices (id, title, content, category, target_audience, published_by, published_date, priority, fcm_broadcast_status, school_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            noticeId,
            '⚠️ स्कूल फ्री ट्रायल समाप्त — तुरंत प्लान सक्रिय करें',
            `प्रिय निदेशक जी, आपके स्कूल का 7-दिन का फ्री ट्रायल समाप्त हो गया है। आपका डेटा सुरक्षित है। स्कूल का संचालन तुरंत बहाल करने के लिए कृपया बिलिंग सेक्शन में जाकर पेमेंट पूरा करें।`,
            'Subscription',
            'Staff',
            'सिस्टम प्रशासक (VidyaSetu)',
            todayStr,
            'Urgent',
            'Sent',
            school.id
          ).run();
        } catch (noticeErr) {
          console.error('[TrialProcessor] Expiry notice insert failed:', noticeErr);
        }

        // D. Mark notification as sent in DB
        await db.prepare(
          `UPDATE school_tenants SET trial_expired_sent_at = ? WHERE id = ?`
        ).bind(nowIso, school.id).run();

        expirationsProcessed++;
        details.push({
          schoolId: school.id,
          schoolName: school.school_name,
          action: 'expired_processed',
          trialEndsAt: school.trial_ends_at,
          emailStatus,
        });
      } else {
        details.push({
          schoolId: school.id,
          schoolName: school.school_name,
          action: 'already_notified',
          trialEndsAt: school.trial_ends_at,
        });
      }
    }
  } catch (err: any) {
    console.error('[TrialProcessor] Error processing expired trials:', err);
  }

  // -------------------------------------------------------------
  // 2. Process Pre-Expiry Reminders (trial ends in <= 2 days)
  // -------------------------------------------------------------
  try {
    const reminderRows = await db.prepare(
      `SELECT s.id, s.school_name, s.subdomain, s.custom_domain, s.contact_email, s.contact_phone,
              s.status, s.registration_status, s.plan_id, s.trial_ends_at, s.trial_reminder_sent_at, s.preferred_plan_id
       FROM school_tenants s
       WHERE (s.plan_id = 'trial' OR s.status = 'Trial')
          AND s.trial_ends_at IS NOT NULL
          AND s.trial_ends_at != ''
          AND s.trial_ends_at >= ?
          AND s.trial_ends_at <= ?
          AND s.trial_reminder_sent_at IS NULL
          AND s.status != 'Suspended'
          AND s.deleted_at IS NULL
          LIMIT 200`
    ).bind(todayStr, twoDaysLaterStr).all();

    const reminderSchools = reminderRows.results || [];
    checkedCount += reminderSchools.length;

    for (const school of reminderSchools) {
      const link = await resolvePaymentLink(env, db, school);

      // A. Send Pre-Expiry Reminder Email
      let emailStatus = 'skipped_no_email';
      if (school.contact_email) {
        const priceLine = link.total ? `\n\nअनुशंसित प्लान: ${link.planName} — ₹${link.total}/वर्ष` : '';
        const emailRes = await sendNotificationEmail(env, {
          to: school.contact_email,
          subject: `🔔 विद्या सेतु — आपके स्कूल "${school.school_name}" का फ्री ट्रायल ${school.trial_ends_at} को समाप्त हो रहा है`,
          title: `फ्री ट्रायल शीघ्र समाप्त हो रहा है`,
          badge: 'ट्रायल रिमाइंडर (2 दिन शेष)',
          message: `नमस्ते,\n\nआपके विद्यालय "${school.school_name}" का 7-दिन का फ्री ट्रायल ${school.trial_ends_at} को समाप्त हो रहा है।\n\n` +
            `स्कूल की उपस्थिति, फीस प्रबंधन, और परीक्षा रिकॉर्ड्स में बिना किसी रुकावट के सेवा जारी रखने के लिए कृपया समय रहते अपना उपयुक्त सब्सक्रिप्शन प्लान (Starter, Pro, या Enterprise) सक्रिय करें।` + priceLine,
          buttonText: 'प्लान देखें और भुगतान करें (View Plans) →',
          buttonUrl: link.url,
        });
        emailStatus = emailRes.sent ? 'sent' : (emailRes.error || 'failed');
      }

      // B. Send Push Notification to Director
      try {
        await broadcastAlert(db, env, {
          title: '🔔 7-दिन का ट्रायल समाप्त होने वाला है',
          body: `आपके स्कूल "${school.school_name}" का ट्रायल ${school.trial_ends_at} को समाप्त हो रहा है। निरंतर सेवा के लिए बिलिंग से प्लान खरीदें।`,
          schoolId: school.id,
          targetRole: 'Director',
          priority: 'high',
          data: {
            type: 'trial_reminder',
            actionUrl: link.url,
          },
        });
      } catch (pushErr) {
        console.error('[TrialProcessor] Reminder push failed for school', school.id, pushErr);
      }

      // C. Insert In-App Notice
      try {
        const noticeId = 'not-rem-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
        await db.prepare(
          `INSERT INTO notices (id, title, content, category, target_audience, published_by, published_date, priority, fcm_broadcast_status, school_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          noticeId,
          '🔔 7-दिन का फ्री ट्रायल समाप्त होने वाला है',
          `प्रिय निदेशक जी, आपके स्कूल का फ्री ट्रायल ${school.trial_ends_at} को समाप्त हो रहा है। कृपया बिना किसी बाधा के सेवाएं जारी रखने के लिए बिलिंग सेक्शन से उपयुक्त प्लान का चयन कर पेमेंट करें।`,
          'Subscription',
          'Staff',
          'सिस्टम प्रशासक (VidyaSetu)',
          todayStr,
          'High',
          'Sent',
          school.id
        ).run();
      } catch (noticeErr) {
        console.error('[TrialProcessor] Reminder notice insert failed:', noticeErr);
      }

      // D. Mark reminder as sent in DB
      await db.prepare(
        `UPDATE school_tenants SET trial_reminder_sent_at = ? WHERE id = ?`
      ).bind(nowIso, school.id).run();

      remindersSent++;
      details.push({
        schoolId: school.id,
        schoolName: school.school_name,
        action: 'reminder_sent',
        trialEndsAt: school.trial_ends_at,
        emailStatus,
      });
    }
  } catch (err: any) {
    console.error('[TrialProcessor] Error processing trial reminders:', err);
  }

  return {
    success: true,
    timestamp: nowIso,
    checkedCount,
    remindersSent,
    expirationsProcessed,
    details,
  };
}

/**
 * Checks a specific school's trial status synchronously on request.
 * If the trial has expired, updates the database and returns isExpired: true.
 */
export async function checkSingleSchoolTrialStatus(
  db: any,
  env: any,
  school: any
): Promise<{ isExpired: boolean; trialEndsAt: string }> {
  if (!school) return { isExpired: false, trialEndsAt: '' };

  const trialEndsAt = school.trial_ends_at || '';
  if (!trialEndsAt) return { isExpired: false, trialEndsAt: '' };

  const todayStr = new Date().toISOString().split('T')[0];
  const isPlanTrial = school.plan_id === 'trial' || school.status === 'Trial';

  if (isPlanTrial && trialEndsAt < todayStr) {
    // School trial has expired
    const nowIso = new Date().toISOString();

    // Mark as suspended / expired if not already done (single-school only — no global side effects on a read).
    // Use 'Past_Due' for the subscription (CHECK-constrained; 'Expired' would throw).
    if (school.status !== 'Suspended' || school.registration_status !== 'Trial_Expired') {
      try {
        await db.batch([
          db.prepare(`UPDATE school_tenants SET status = 'Suspended', registration_status = 'Trial_Expired' WHERE id = ?`).bind(school.id),
          db.prepare(`UPDATE school_subscriptions SET status = 'Past_Due', updated_at = ? WHERE school_id = ?`).bind(nowIso, school.id),
        ]);
      } catch (e) {
        console.error('[checkSingleSchoolTrialStatus] update failed:', e);
      }
    }

    // Notification sending (emails/push/notices) is handled by the scheduled cron, not by this read path.

    return { isExpired: true, trialEndsAt };
  }

  return { isExpired: false, trialEndsAt };
}

// ==========================================
// Plugin Trial Expiration Processing
// ==========================================

export interface PluginTrialProcessResult {
  success: boolean;
  timestamp: string;
  checkedCount: number;
  remindersSent: number;
  expirationsProcessed: number;
  details: Array<{
    schoolId: string;
    schoolName: string;
    pluginName: string;
    action: 'reminder_sent' | 'expired_processed' | 'already_notified';
    trialEndsAt: string;
    emailStatus?: string;
  }>;
}

/**
 * Resolves a Razorpay payment link for a plugin subscription.
 * Uses the same annual discount (20%) as the admin send-payment-link endpoint.
 */
async function resolvePluginPaymentLink(env: any, db: any, school: any, plugin: any, billingCycle: string = 'monthly'): Promise<{ url: string; linkId?: string; total?: number }> {
  const fallbackUrl = resolveBillingUrl(school, env) + '&tab=plugins';
  const basePrice = Number(plugin.price) || 0;
  if (basePrice <= 0) return { url: fallbackUrl };

  const cyclePrice = billingCycle === 'annual' ? +(basePrice * 12 * 0.8).toFixed(2) : basePrice;
  const gst = +(cyclePrice * 0.18).toFixed(2);
  const total = +(cyclePrice + gst).toFixed(2);
  const referenceId = 'VSPLG' + Date.now().toString(36) + (crypto.randomUUID().split('-').join('').slice(0, 6));

  try {
    const linkResult = await createRazorpayPaymentLink(env, {
      amountINR: total,
      description: plugin.name + ' प्लगइन (' + billingCycle + ') — ' + school.school_name,
      referenceId,
      customerName: school.school_name,
      customerEmail: school.contact_email,
      customerContact: school.contact_phone,
      notes: { school_id: school.id, plugin_id: plugin.id, billing_cycle: billingCycle, type: 'plugin' },
    });
    if (linkResult.error || !linkResult.shortUrl) {
      return { url: fallbackUrl, total };
    }
    await db.prepare(`
      UPDATE school_plugins SET razorpay_payment_link_id = ?, payment_status = 'pending', price_per_cycle = ?, billing_cycle = ?, updated_at = CURRENT_TIMESTAMP
      WHERE school_id = ? AND plugin_id = ?
    `).bind(linkResult.id, cyclePrice, billingCycle, school.id, plugin.id).run().catch(() => {});
    return { url: linkResult.shortUrl, linkId: linkResult.id, total };
  } catch (_) {
    return { url: fallbackUrl, total };
  }
}

/**
 * Processes plugin trial expirations across all schools.
 * Called by the scheduled cron alongside processTrialExpirations.
 */
export async function processPluginTrialExpirations(env: any, passedDb?: any): Promise<PluginTrialProcessResult> {
  const db = passedDb || (env && env.DB);
  if (!db || typeof db.prepare !== 'function') {
    throw new Error('Database binding (DB) is required to process plugin trial expirations.');
  }

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const twoDaysLaterStr = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const nowIso = now.toISOString();

  let checkedCount = 0;
  let remindersSent = 0;
  let expirationsProcessed = 0;
  const details: PluginTrialProcessResult['details'] = [];

  // -------------------------------------------------------------
  // 1. Expired plugin trials (trial_ends_at < today)
  // -------------------------------------------------------------
  try {
    const expiredRows = await db.prepare(`
      SELECT sp.id, sp.school_id, sp.plugin_id, sp.trial_ends_at, sp.trial_reminder_sent_at, sp.payment_status,
             s.school_name, s.subdomain, s.custom_domain, s.contact_email, s.contact_phone,
             p.name AS plugin_name, p.price AS plugin_price
      FROM school_plugins sp
      JOIN school_tenants s ON sp.school_id = s.id
      JOIN plugins p ON sp.plugin_id = p.id
      WHERE sp.payment_status = 'trial'
        AND sp.trial_ends_at IS NOT NULL
        AND sp.trial_ends_at != ''
        AND sp.trial_ends_at < ?
        AND sp.trial_expired_sent_at IS NULL
        AND s.deleted_at IS NULL
      LIMIT 200
    `).bind(todayStr).all();

    const expiredPlugins = expiredRows.results || [];
    checkedCount += expiredPlugins.length;

    for (const row of expiredPlugins) {
      // Deactivate the plugin
      await db.prepare(`
        UPDATE school_plugins SET status = 'inactive', payment_status = 'expired', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(row.id).run().catch(() => {});

      const link = await resolvePluginPaymentLink(env, db, row, { id: row.plugin_id, name: row.plugin_name, price: row.plugin_price });

      let emailStatus = 'skipped_no_email';
      if (row.contact_email) {
        const emailRes = await sendNotificationEmail(env, {
          to: row.contact_email,
          subject: `⚠️ विद्या सेतु — "${row.plugin_name}" प्लगइन ट्रायल समाप्त`,
          title: `प्लगइन ट्रायल समाप्त — ${row.plugin_name}`,
          badge: 'ट्रायल समाप्त',
          message: `नमस्ते,\n\nआपके विद्यालय "${row.school_name}" के "${row.plugin_name}" प्लगइन का ट्रायल ${row.trial_ends_at} को समाप्त हो गया है।\n\nप्लगइन सेवा जारी रखने के लिए कृपया नीचे दिए बटन से भुगतान करें।`,
          buttonText: '🟢 भुगतान करें (Pay Now) →',
          buttonUrl: link.url,
        });
        emailStatus = emailRes.sent ? 'sent' : (emailRes.error || 'failed');
      }

      try {
        await broadcastAlert(db, env, {
          title: `⚠️ "${row.plugin_name}" प्लगइन ट्रायल समाप्त`,
          body: `"${row.school_name}" के ${row.plugin_name} प्लगइन का ट्रायल समाप्त हो गया है। सेवा जारी रखने के लिए भुगतान करें।`,
          schoolId: row.school_id, targetRole: 'Director', priority: 'high',
          data: { type: 'plugin_trial_expired', actionUrl: link.url, pluginId: row.plugin_id },
        });
      } catch (_) {}

      await db.prepare(`UPDATE school_plugins SET trial_expired_sent_at = ? WHERE id = ?`).bind(nowIso, row.id).run().catch(() => {});

      expirationsProcessed++;
      details.push({ schoolId: row.school_id, schoolName: row.school_name, pluginName: row.plugin_name, action: 'expired_processed', trialEndsAt: row.trial_ends_at, emailStatus });
    }
  } catch (err: any) {
    console.error('[PluginTrialProcessor] Error processing expired plugin trials:', err);
  }

  // -------------------------------------------------------------
  // 1b. Expired paid plugin subscriptions (valid_until < today)
  // -------------------------------------------------------------
  try {
    const paidExpiredRows = await db.prepare(`
      SELECT sp.id, sp.school_id, sp.plugin_id, sp.valid_until, sp.payment_status,
             s.school_name, s.contact_email,
             p.name AS plugin_name
      FROM school_plugins sp
      JOIN school_tenants s ON sp.school_id = s.id
      JOIN plugins p ON sp.plugin_id = p.id
      WHERE sp.payment_status = 'active'
        AND sp.status = 'active'
        AND sp.valid_until IS NOT NULL
        AND sp.valid_until != ''
        AND sp.valid_until < ?
        AND s.deleted_at IS NULL
      LIMIT 200
    `).bind(todayStr).all();

    for (const row of (paidExpiredRows.results || [])) {
      checkedCount++;
      await db.prepare(`UPDATE school_plugins SET status = 'inactive', payment_status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .bind(row.id).run().catch(() => {});
      expirationsProcessed++;
      details.push({ schoolId: row.school_id, schoolName: row.school_name, pluginName: row.plugin_name, action: 'expired_processed', trialEndsAt: row.valid_until });
    }
  } catch (err: any) {
    console.error('[PluginTrialProcessor] Error processing expired paid plugins:', err);
  }

  // -------------------------------------------------------------
  // 2. Pre-expiry reminders (trial ends in <= 2 days)
  // -------------------------------------------------------------
  try {
    const reminderRows = await db.prepare(`
      SELECT sp.id, sp.school_id, sp.plugin_id, sp.trial_ends_at, sp.trial_reminder_sent_at,
             s.school_name, s.subdomain, s.custom_domain, s.contact_email, s.contact_phone,
             p.name AS plugin_name, p.price AS plugin_price
      FROM school_plugins sp
      JOIN school_tenants s ON sp.school_id = s.id
      JOIN plugins p ON sp.plugin_id = p.id
      WHERE sp.payment_status = 'trial'
        AND sp.trial_ends_at IS NOT NULL
        AND sp.trial_ends_at != ''
        AND sp.trial_ends_at >= ?
        AND sp.trial_ends_at <= ?
        AND sp.trial_reminder_sent_at IS NULL
        AND sp.status = 'active'
        AND s.deleted_at IS NULL
      LIMIT 200
    `).bind(todayStr, twoDaysLaterStr).all();

    const reminderPlugins = reminderRows.results || [];
    checkedCount += reminderPlugins.length;

    for (const row of reminderPlugins) {
      const link = await resolvePluginPaymentLink(env, db, row, { id: row.plugin_id, name: row.plugin_name, price: row.plugin_price });

      let emailStatus = 'skipped_no_email';
      if (row.contact_email) {
        const emailRes = await sendNotificationEmail(env, {
          to: row.contact_email,
          subject: `🔔 विद्या सेतु — "${row.plugin_name}" प्लगइन ट्रायल ${row.trial_ends_at} को समाप्त हो रहा है`,
          title: `प्लगइन ट्रायल शीघ्र समाप्त`,
          badge: 'ट्रायल रिमाइंडर',
          message: `नमस्ते,\n\nआपके विद्यालय "${row.school_name}" के "${row.plugin_name}" प्लगइन का ट्रायल ${row.trial_ends_at} को समाप्त हो रहा है।\n\nनिरंतर सेवा के लिए कृपया समय रहते भुगतान करें।`,
          buttonText: '🟢 भुगतान करें (Pay Now) →',
          buttonUrl: link.url,
        });
        emailStatus = emailRes.sent ? 'sent' : (emailRes.error || 'failed');
      }

      try {
        await broadcastAlert(db, env, {
          title: `🔔 "${row.plugin_name}" प्लगइन ट्रायल समाप्त होने वाला है`,
          body: `"${row.school_name}" के ${row.plugin_name} प्लगइन का ट्रायल ${row.trial_ends_at} को समाप्त हो रहा है।`,
          schoolId: row.school_id, targetRole: 'Director', priority: 'high',
          data: { type: 'plugin_trial_reminder', actionUrl: link.url, pluginId: row.plugin_id },
        });
      } catch (_) {}

      await db.prepare(`UPDATE school_plugins SET trial_reminder_sent_at = ? WHERE id = ?`).bind(nowIso, row.id).run().catch(() => {});

      remindersSent++;
      details.push({ schoolId: row.school_id, schoolName: row.school_name, pluginName: row.plugin_name, action: 'reminder_sent', trialEndsAt: row.trial_ends_at, emailStatus });
    }
  } catch (err: any) {
    console.error('[PluginTrialProcessor] Error processing plugin trial reminders:', err);
  }

  return { success: true, timestamp: nowIso, checkedCount, remindersSent, expirationsProcessed, details };
}

// ==========================================
// Subscription Renewal Processor (recurring billing lifecycle)
// ==========================================

export interface SubscriptionRenewalResult {
  success: boolean;
  timestamp: string;
  checkedCount: number;
  actionsTaken: number;
  details: Array<{
    schoolId: string;
    schoolName: string;
    action: string;
    message: string;
  }>;
}

/**
 * Processes recurring subscriptions for renewal lifecycle:
 * 1. Subscriptions with next_billing_date < today: send renewal reminder
 * 2. Subscriptions with Past_Due status for > 7 days: suspend school
 * 3. Subscriptions with remaining_cycles = 0: mark as expired, notify
 */
export async function processSubscriptionRenewals(env: any, passedDb?: any): Promise<SubscriptionRenewalResult> {
  const db = passedDb || (env && env.DB);
  if (!db || typeof db.prepare !== 'function') {
    throw new Error('Database binding (DB) is required.');
  }

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const nowIso = now.toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  let checkedCount = 0;
  let actionsTaken = 0;
  const details: SubscriptionRenewalResult['details'] = [];

  // 1. Renewal reminders (next_billing_date within 3 days)
  try {
    const threeDaysLater = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const dueRows = await db.prepare(`
      SELECT ss.school_id, ss.plan_name, ss.billing_cycle, ss.next_billing_date,
             s.school_name, s.contact_email
      FROM school_subscriptions ss
      JOIN school_tenants s ON ss.school_id = s.id
      WHERE ss.next_billing_date IS NOT NULL
        AND ss.next_billing_date >= ?
        AND ss.next_billing_date <= ?
        AND ss.status = 'Active'
        AND s.deleted_at IS NULL
      LIMIT 200
    `).bind(todayStr, threeDaysLater).all();

    for (const row of (dueRows.results || [])) {
      checkedCount++;
      if (row.contact_email) {
        await sendNotificationEmail(env, {
          to: row.contact_email,
          subject: `🔔 विद्या सेतु — सदस्यता नवीनीकरण ${row.next_billing_date} को`,
          title: `सदस्यता नवीनीकरण शीघ्र`,
          badge: 'नवीनीकरण अनुस्मारक',
          message: `नमस्ते,\n\nआपके विद्यालय "${row.school_name}" की ${row.plan_name} सदस्यता ${row.next_billing_date} को नवीनीकरण होने वाली है।\n\nऑटो-पे सक्रिय होने पर राशि स्वचालित कट जाएगी। अन्यथा कृपया समय रहते भुगतान करें।`,
          buttonText: 'बिलिंग देखें →',
          buttonUrl: resolveBillingUrl(row, env),
        }).catch(() => {});
      }
      actionsTaken++;
      details.push({ schoolId: row.school_id, schoolName: row.school_name, action: 'renewal_reminder', message: `नवीनीकरण ${row.next_billing_date}` });
    }
  } catch (err: any) {
    console.error('[SubRenewal] renewal reminders failed:', err?.message);
  }

  // 2. Suspend schools with Past_Due > 7 days
  try {
    const pastDueRows = await db.prepare(`
      SELECT ss.school_id, ss.updated_at, s.school_name
      FROM school_subscriptions ss
      JOIN school_tenants s ON ss.school_id = s.id
      WHERE ss.status = 'Past_Due'
        AND ss.updated_at < ?
        AND s.status != 'Suspended'
        AND s.deleted_at IS NULL
      LIMIT 200
    `).bind(sevenDaysAgo).all();

    for (const row of (pastDueRows.results || [])) {
      checkedCount++;
      try {
        await db.prepare("UPDATE school_tenants SET status = 'Suspended', registration_status = 'Subscription_Expired' WHERE id = ?")
          .bind(row.school_id).run();
      } catch (_) {}
      actionsTaken++;
      details.push({ schoolId: row.school_id, schoolName: row.school_name, action: 'suspended', message: 'Past_Due > 7 दिन — स्कूल निलंबित' });
    }
  } catch (err: any) {
    console.error('[SubRenewal] past_due suspension failed:', err?.message);
  }

  // 3. Expired subscriptions (remaining_cycles = 0)
  try {
    const expiredRows = await db.prepare(`
      SELECT ss.school_id, ss.plan_name, s.school_name, s.contact_email
      FROM school_subscriptions ss
      JOIN school_tenants s ON ss.school_id = s.id
      WHERE ss.remaining_cycles = 0
        AND ss.status != 'Canceled'
        AND ss.status != 'Past_Due'
        AND s.deleted_at IS NULL
      LIMIT 200
    `).all();

    for (const row of (expiredRows.results || [])) {
      checkedCount++;
      try {
        await db.prepare("UPDATE school_subscriptions SET status = 'Past_Due', updated_at = ? WHERE school_id = ?")
          .bind(nowIso, row.school_id).run();
      } catch (_) {}
      if (row.contact_email) {
        await sendNotificationEmail(env, {
          to: row.contact_email,
          subject: `⚠️ विद्या सेतु — ${row.plan_name} सदस्यता समाप्त`,
          title: 'सदस्यता समाप्त',
          badge: 'समाप्त',
          message: `नमस्ते,\n\nआपके विद्यालय "${row.school_name}" की ${row.plan_name} सदस्यता के सभी चक्र पूर्ण हो गए हैं। सेवा जारी रखने के लिए कृपया नवीनीकरण करें।`,
          buttonText: 'नवीनीकरण करें →',
          buttonUrl: resolveBillingUrl(row, env),
        }).catch(() => {});
      }
      actionsTaken++;
      details.push({ schoolId: row.school_id, schoolName: row.school_name, action: 'expired', message: 'सभी चक्र पूर्ण — समाप्त' });
    }
  } catch (err: any) {
    console.error('[SubRenewal] expired cycle processing failed:', err?.message);
  }

  return { success: true, timestamp: nowIso, checkedCount, actionsTaken, details };
}
