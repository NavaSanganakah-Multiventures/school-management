import { sendNotificationEmail } from './email';
import { broadcastAlert } from '../notifications';

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
              s.status, s.registration_status, s.plan_id, s.trial_ends_at, s.trial_expired_sent_at
       FROM school_tenants s
       WHERE (s.plan_id = 'trial' OR s.status = 'Trial' OR s.registration_status = 'Trial_Expired')
         AND s.trial_ends_at IS NOT NULL
         AND s.trial_ends_at != ''
         AND s.trial_ends_at < ?
         AND s.deleted_at IS NULL`
    ).bind(todayStr).all();

    const expiredSchools = expiredRows.results || [];
    checkedCount += expiredSchools.length;

    for (const school of expiredSchools) {
      // 1. Update status to Suspended and Trial_Expired in DB
      await db.prepare(
        `UPDATE school_tenants 
         SET status = 'Suspended', registration_status = 'Trial_Expired'
         WHERE id = ?`
      ).bind(school.id).run();

      await db.prepare(
        `UPDATE school_subscriptions
         SET status = 'Expired', updated_at = ?
         WHERE school_id = ?`
      ).bind(nowIso, school.id).run();

      // 2. Send notification if not already sent
      if (!school.trial_expired_sent_at) {
        const billingUrl = resolveBillingUrl(school, env);

        // A. Send Expiry Email with direct Razorpay payment CTA
        let emailStatus = 'skipped_no_email';
        if (school.contact_email) {
          const emailRes = await sendNotificationEmail(env, {
            to: school.contact_email,
            subject: `⚠️ विद्या सेतु — आपके स्कूल "${school.school_name}" का 7-दिन का ट्रायल समाप्त हो चुका है | अभी भुगतान करें`,
            title: `ट्रायल समाप्त — स्कूल सेवाएं पुनः सक्रिय करें`,
            badge: 'ट्रायल समाप्त (Expired)',
            message: `नमस्ते,\n\nआपके विद्यालय "${school.school_name}" का 7-दिन का निःशुल्क ट्रायल ${school.trial_ends_at} को समाप्त हो गया है।\n\n` +
              `🔒 आपका संपूर्ण स्कूल डेटा (छात्र विवरण, फीस रिकॉर्ड, उपस्थिति, कर्मचारी प्रोफाइल) क्लाउड में 100% सुरक्षित है।\n\n` +
              `स्कूल का सामान्य शैक्षणिक एवं प्रशासनिक कार्य तुरंत पुनः शुरू करने के लिए कृपया नीचे दिए बटन से अपनी आवश्यकतानुसार उपयुक्त प्लान चुनें और भुगतान पूरा करें।`,
            buttonText: 'अभी प्लान चुनें और भुगतान करें (Pay Now) →',
            buttonUrl: billingUrl,
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
              actionUrl: '/?tab=billing',
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
              s.status, s.registration_status, s.plan_id, s.trial_ends_at, s.trial_reminder_sent_at
       FROM school_tenants s
       WHERE (s.plan_id = 'trial' OR s.status = 'Trial')
         AND s.trial_ends_at IS NOT NULL
         AND s.trial_ends_at != ''
         AND s.trial_ends_at >= ?
         AND s.trial_ends_at <= ?
         AND s.trial_reminder_sent_at IS NULL
         AND s.status != 'Suspended'
         AND s.deleted_at IS NULL`
    ).bind(todayStr, twoDaysLaterStr).all();

    const reminderSchools = reminderRows.results || [];
    checkedCount += reminderSchools.length;

    for (const school of reminderSchools) {
      const billingUrl = resolveBillingUrl(school, env);

      // A. Send Pre-Expiry Reminder Email
      let emailStatus = 'skipped_no_email';
      if (school.contact_email) {
        const emailRes = await sendNotificationEmail(env, {
          to: school.contact_email,
          subject: `🔔 विद्या सेतु — आपके स्कूल "${school.school_name}" का फ्री ट्रायल ${school.trial_ends_at} को समाप्त हो रहा है`,
          title: `फ्री ट्रायल शीघ्र समाप्त हो रहा है`,
          badge: 'ट्रायल रिमाइंडर (2 दिन शेष)',
          message: `नमस्ते,\n\nआपके विद्यालय "${school.school_name}" का 7-दिन का फ्री ट्रायल ${school.trial_ends_at} को समाप्त हो रहा है।\n\n` +
            `स्कूल की उपस्थिति, फीस प्रबंधन, और परीक्षा रिकॉर्ड्स में बिना किसी रुकावट के सेवा जारी रखने के लिए कृपया समय रहते अपना उपयुक्त सब्सक्रिप्शन प्लान (Starter, Pro, या Enterprise) सक्रिय करें।`,
          buttonText: 'प्लान देखें और भुगतान करें (View Plans) →',
          buttonUrl: billingUrl,
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
            actionUrl: '/?tab=billing',
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
  const isPlanTrial = school.plan_id === 'trial' || school.status === 'Trial' || school.registration_status === 'Trial_Expired';

  if (isPlanTrial && trialEndsAt < todayStr) {
    // School trial has expired
    const nowIso = new Date().toISOString();

    // Mark as suspended / expired if not already done
    if (school.status !== 'Suspended' || school.registration_status !== 'Trial_Expired') {
      try {
        await db.prepare(
          `UPDATE school_tenants SET status = 'Suspended', registration_status = 'Trial_Expired' WHERE id = ?`
        ).bind(school.id).run();

        await db.prepare(
          `UPDATE school_subscriptions SET status = 'Expired', updated_at = ? WHERE school_id = ?`
        ).bind(nowIso, school.id).run();
      } catch (e) {
        console.error('[checkSingleSchoolTrialStatus] update failed:', e);
      }
    }

    // Trigger notification if not sent
    if (!school.trial_expired_sent_at && env) {
      // Run asynchronously so we do not block response
      processTrialExpirations(env, db).catch((e) => console.error('[TrialAsync] failed:', e));
    }

    return { isExpired: true, trialEndsAt };
  }

  return { isExpired: false, trialEndsAt };
}
