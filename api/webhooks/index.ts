import { Hono } from 'hono';
import { getDB, loadSubscriptionPlanById } from '../db';
import { verifyRazorpayWebhookSignature, getRazorpayWebhookSecret } from '../lib/razorpay';
import { activateSubscriptionFromPayment } from '../lib/billing-activation';
import { activateFeePaymentFromRazorpay } from '../lib/fee-payment';
import { getAuthUser } from '../lib/auth';

export const webhooksApp = new Hono<{ Bindings: any }>();

// Razorpay webhook — source of truth for payment tracking.
// Razorpay POSTs signed JSON events here after a payment is captured/failed.
// Register this URL in the Razorpay dashboard: https://pragnya.nasven.com/api/webhooks/razorpay
// with events: payment.captured, payment.failed, order.paid.
// Secret: RAZORPAY_WEBHOOK_SECRET (set separately from RAZORPAY_KEY_SECRET).
webhooksApp.post('/razorpay', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);

  const webhookSecret = await getRazorpayWebhookSecret(c.env);
  if (!webhookSecret) {
    console.error('[webhook/razorpay] RAZORPAY_WEBHOOK_SECRET कॉन्फ़िगर नहीं है।');
    return c.json({ success: false, message: 'वेबहुक सीक्रेट कॉन्फ़िगर नहीं है।' }, 500);
  }

  const signature = c.req.header('X-Razorpay-Signature') || '';
  let rawBody = '';
  try {
    rawBody = await c.req.text();
  } catch (bodyErr: any) {
    console.error('[webhook/razorpay] body read failed:', bodyErr && bodyErr.message);
    return c.json({ success: false, message: 'बॉडी पढ़ने में त्रुटि।' }, 400);
  }

  // 1. Verify signature BEFORE trusting any payload.
  let ok = false;
  try {
    ok = await verifyRazorpayWebhookSignature(rawBody, signature, webhookSecret);
  } catch (sigErr: any) {
    console.error('[webhook/razorpay] signature verify threw:', sigErr && sigErr.message);
    return c.json({ success: false, message: 'सिग्नेचर वेरिफिकेशन त्रुटि।' }, 500);
  }
  if (!ok) {
    console.error('[webhook/razorpay] सिग्नेचर वेरिफिकेशन विफल।');
    return c.json({ success: false, message: 'अमान्य वेबहुक सिग्नेचर।' }, 400);
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch (e) {
    return c.json({ success: false, message: 'अमान्य JSON पेलोड।' }, 400);
  }

  const eventType = payload.event || '';
  const eventId = (payload.entity_id) || (payload.id) || '';
  const nowIso = new Date().toISOString();

  // Extract the inner entity (payment / order) from the webhook payload.
  // Razorpay wraps the actual entity under a nested "entity" key:
  //   payload.payment.entity.{id, notes, amount, order_id, payment_link_id}
  //   payload.order.entity.{id, notes, ...}
  const rawPayment = (payload.payload && payload.payload.payment) || null;
  const rawOrder = (payload.payload && payload.payload.order) || null;
  const rawPaymentLink = (payload.payload && payload.payload.payment_link) || null;
  const rawSubscriptionWrapper = (payload.payload && payload.payload.subscription) || null;
  const paymentEntity = rawPayment;
  const orderEntity = rawOrder;
  // inner = the actual entity object (one level deeper than the wrapper)
  const inner = (rawPayment && rawPayment.entity) || (rawOrder && rawOrder.entity) || (rawPaymentLink && rawPaymentLink.entity) || (rawSubscriptionWrapper && rawSubscriptionWrapper.entity) || {};

  // School id is resolved from the invoice/notes we stored when the order/link was created.
  // Razorpay returns our notes back in the webhook, so we can trust notes.school_id.
  const notes = inner.notes || {};
  let schoolId = String(notes.school_id || '');
  let planId = String(notes.plan_id || '');
  let billingCycle = String(notes.billing_cycle || '');
  let paymentType = String(notes.type || 'subscription');
  let pluginId = String(notes.plugin_id || '');
  let feeInvoiceId = String(notes.invoice_id || '');
  let razorpay_order_id = inner.order_id || (orderEntity && orderEntity.id) || '';
  let razorpay_payment_id = inner.id || (paymentEntity && paymentEntity.id) || '';
  let razorpay_payment_link_id = inner.payment_link_id || notes.payment_link_id || '';
  const paidAmountPaise = inner.amount || (paymentEntity && paymentEntity.amount) || 0;
  const paidAmountINR = paidAmountPaise ? (paidAmountPaise / 100) : 0;

  // If school_id is not in notes, try to resolve it from the stored invoice or subscription.
  if (!schoolId) {
    let inv: any = null;
    if (razorpay_order_id) {
      inv = await db.prepare('SELECT school_id FROM billing_invoices WHERE razorpay_order_id = ?').bind(razorpay_order_id).first();
    }
    if (!inv && razorpay_payment_link_id) {
      inv = await db.prepare('SELECT school_id FROM billing_invoices WHERE razorpay_payment_link_id = ?').bind(razorpay_payment_link_id).first();
    }
    if (inv) schoolId = String(inv.school_id || '');
    // For subscription events, resolve from school_subscriptions
    if (!schoolId) {
      const subId = (inner && inner.id) || '';
      if (subId && subId.startsWith('sub_')) {
        const subRow = await db.prepare('SELECT school_id FROM school_subscriptions WHERE razorpay_subscription_id = ?').bind(subId).first();
        if (subRow) schoolId = String(subRow.school_id || '');
      }
    }
  }

  // 2. Log the event for audit + idempotency.
  const logId = 'wh-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  try {
    await db.prepare(
      'INSERT INTO razorpay_webhook_events (id, event_id, event_type, entity_id, school_id, payload, processed, received_at) VALUES (?,?,?,?,?,?,0,?)'
    ).bind(logId, eventId || (eventType + '-' + razorpay_payment_id), eventType, razorpay_payment_id || razorpay_order_id, schoolId || '', rawBody.slice(0, 16000), nowIso).run();
  } catch (logErr) {
    // If event_id already exists (UNIQUE), this is a duplicate webhook — idempotent no-op.
    console.error('[webhook/razorpay] event log insert failed (likely duplicate):', (logErr as any) && (logErr as any).message);
    return c.json({ success: true, message: 'duplicate event — already processed' });
  }

  // 3. Handle events.
  if (eventType === 'payment.captured' || eventType === 'order.paid') {
    if (!schoolId) {
      console.error('[webhook/razorpay] school_id resolve नहीं हुआ — payment_id:', razorpay_payment_id, 'order_id:', razorpay_order_id);
      return c.json({ success: true, message: 'event logged; school_id unresolved' });
    }

    // Plugin payment — activate the plugin in school_plugins.
    if (paymentType === 'plugin' && pluginId) {
      try {
        const cycleEnd = billingCycle === 'annual'
          ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        await db.prepare(`
          UPDATE school_plugins
          SET status = 'active', payment_status = 'active',
              valid_until = ?, next_billing_date = ?,
              trial_ends_at = NULL, trial_reminder_sent_at = NULL,
              razorpay_payment_link_id = NULL, updated_at = CURRENT_TIMESTAMP
          WHERE school_id = ? AND plugin_id = ?
        `).bind(cycleEnd, cycleEnd, schoolId, pluginId).run();

        try {
          await db.prepare('UPDATE razorpay_webhook_events SET processed=1, processed_at=? WHERE id=?').bind(nowIso, logId).run();
        } catch (_) {}
        return c.json({ success: true, message: 'प्लगइन सक्रिय हो गया।', schoolId, pluginId });
      } catch (e: any) {
        return c.json({ success: false, message: 'प्लगइन एक्टिवेशन विफल: ' + (e?.message || ''), schoolId, pluginId }, 500);
      }
    }

    // Student fee payment — mark the fee invoice paid.
    if (paymentType === 'student_fee') {
      const feeResult = await activateFeePaymentFromRazorpay({
        db,
        env: c.env,
        schoolId,
        invoiceId: feeInvoiceId,
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_payment_link_id,
        paidAmountINR,
        webhookReceivedAt: nowIso,
      });
      try {
        await db.prepare('UPDATE razorpay_webhook_events SET processed=1, processed_at=? WHERE id=?').bind(nowIso, logId).run();
      } catch (_) {}
      if (feeResult.success) {
        return c.json({ success: true, message: feeResult.alreadyPaid ? 'duplicate (already paid)' : feeResult.message, schoolId, invoiceId: feeInvoiceId });
      }
      return c.json({ success: false, message: feeResult.error || 'फीस भुगतान दर्ज करने में विफल।', schoolId }, 500);
    }

    // Subscription payment — activate the school subscription.
    const result = await activateSubscriptionFromPayment({
      db,
      env: c.env,
      schoolId,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_payment_link_id,
      planId,
      billingCycle,
      paidAmountINR,
      webhookReceivedAt: nowIso,
    });

    if (result.success) {
      try {
        await db.prepare('UPDATE razorpay_webhook_events SET processed=1, processed_at=? WHERE id=?').bind(nowIso, logId).run();
      } catch (_) {}
      return c.json({ success: true, message: result.alreadyPaid ? 'duplicate (already paid)' : result.message, schoolId, planId: (result.plan && result.plan.id) || planId });
    }
    return c.json({ success: false, message: result.error || 'एक्टिवेशन विफल।', schoolId }, 500);
  }

  if (eventType === 'payment.failed') {
    // Mark the matching invoice as Failed (best-effort).
    try {
      if (razorpay_order_id) {
        await db.prepare('UPDATE billing_invoices SET payment_status=? WHERE razorpay_order_id=?').bind('Failed', razorpay_order_id).run();
      }
      if (razorpay_payment_link_id) {
        await db.prepare('UPDATE billing_invoices SET payment_status=? WHERE razorpay_payment_link_id=?').bind('Failed', razorpay_payment_link_id).run();
      }
    } catch (_) {}
    try {
      await db.prepare('UPDATE razorpay_webhook_events SET processed=1, processed_at=? WHERE id=?').bind(nowIso, logId).run();
    } catch (_) {}
    return c.json({ success: true, message: 'payment.failed logged', schoolId });
  }

  // ==========================================
  // Subscription Events (recurring billing)
  // ==========================================
  const rawSubscription = rawSubscriptionWrapper ? rawSubscriptionWrapper.entity : null;
  const razorpaySubscriptionId = rawSubscription ? rawSubscription.id : (notes.subscription_id || '');

  if (eventType === 'subscription.activated') {
    if (schoolId && razorpaySubscriptionId) {
      const mandateId = rawSubscription ? rawSubscription.mandate_id : '';
      const status = rawSubscription ? rawSubscription.status : 'active';
      try {
        await db.prepare(`
          UPDATE school_subscriptions SET
            mandate_status = 'active',
            status = 'Active',
            current_cycle_start = ?,
            current_cycle_end = ?,
            updated_at = ?
          WHERE school_id = ? AND razorpay_subscription_id = ?
        `).bind(rawSubscription?.current_start || nowIso, rawSubscription?.current_end || '', nowIso, schoolId, razorpaySubscriptionId).run();

        if (mandateId) {
          await db.prepare('UPDATE school_subscriptions SET mandate_id = ? WHERE school_id = ?').bind(mandateId, schoolId).run().catch(() => {});
        }
        // Activate school tenant
        await db.prepare("UPDATE school_tenants SET status = 'Active', registration_status = 'Active' WHERE id = ?").bind(schoolId).run().catch(() => {});
      } catch (e: any) {
        console.error('[webhook] subscription.activated update failed:', e?.message);
      }
    }
    try { await db.prepare('UPDATE razorpay_webhook_events SET processed=1, processed_at=? WHERE id=?').bind(nowIso, logId).run(); } catch (_) {}
    return c.json({ success: true, message: 'subscription.activated', schoolId, razorpaySubscriptionId });
  }

  if (eventType === 'subscription.charged') {
    if (schoolId && rawSubscription) {
      const paidCount = rawSubscription.paid_count || 0;
      const remainingCount = rawSubscription.remaining_count || 0;
      const cycleStart = rawSubscription.current_start || '';
      const cycleEnd = rawSubscription.current_end || '';
      try {
        await db.prepare(`
          UPDATE school_subscriptions SET
            status = 'Active',
            remaining_cycles = ?,
            current_cycle_start = ?,
            current_cycle_end = ?,
            next_billing_date = ?,
            mandate_status = 'active',
            updated_at = ?
          WHERE school_id = ? AND razorpay_subscription_id = ?
        `).bind(remainingCount, cycleStart, cycleEnd, cycleEnd, nowIso, schoolId, razorpaySubscriptionId).run();

        await db.prepare("UPDATE school_tenants SET status = 'Active', registration_status = 'Active' WHERE id = ?").bind(schoolId).run().catch(() => {});

        // Create an invoice for this cycle
        const invoiceId = 'binv-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
        const invoiceNumber = 'PM-INV-REC-' + Date.now();
        const amountINR = (rawSubscription.amount || 0) / 100;
        const gst = +(amountINR * 0.18).toFixed(2);
        const total = +(amountINR + gst).toFixed(2);
        // Resolve plan name from plan_id (avoid storing raw id in plan_name column)
        const chargedPlanId = rawSubscription.notes?.plan_id || '';
        let chargedPlanName = chargedPlanId;
        let chargedBillingCycle = rawSubscription.notes?.billing_cycle || 'recurring';
        try {
          const subRow = await db.prepare('SELECT plan_name, billing_cycle FROM school_subscriptions WHERE school_id = ?').bind(schoolId).first();
          if (subRow && subRow.plan_name) chargedPlanName = subRow.plan_name;
          if (subRow && subRow.billing_cycle) chargedBillingCycle = subRow.billing_cycle;
        } catch (_) {}
        try {
          await db.prepare(
            'INSERT INTO billing_invoices (id, school_id, invoice_number, description, plan_name, billing_cycle, subtotal, gst_percent, gst_amount, total_amount, payment_status, payment_method, transaction_id, invoice_date, due_date, paid_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
          ).bind(invoiceId, schoolId, invoiceNumber, chargedPlanName + ' (Recurring)', chargedPlanName, chargedBillingCycle, amountINR, 18, gst, total, 'Paid', 'Razorpay Auto-Debit', rawSubscription.id || '', nowIso.split('T')[0], nowIso.split('T')[0], nowIso).run();
        } catch (_) {}
      } catch (e: any) {
        console.error('[webhook] subscription.charged update failed:', e?.message);
      }
    }
    try { await db.prepare('UPDATE razorpay_webhook_events SET processed=1, processed_at=? WHERE id=?').bind(nowIso, logId).run(); } catch (_) {}
    return c.json({ success: true, message: 'subscription.charged', schoolId, razorpaySubscriptionId });
  }

  if (eventType === 'subscription.pending') {
    // Payment pending for current cycle — school stays active, flag as Past_Due
    if (schoolId) {
      try {
        await db.prepare("UPDATE school_subscriptions SET status = 'Past_Due', updated_at = ? WHERE school_id = ?").bind(nowIso, schoolId).run();
      } catch (_) {}
    }
    try { await db.prepare('UPDATE razorpay_webhook_events SET processed=1, processed_at=? WHERE id=?').bind(nowIso, logId).run(); } catch (_) {}
    return c.json({ success: true, message: 'subscription.pending', schoolId });
  }

  if (eventType === 'subscription.failed') {
    // Auto-debit failed — mark as Past_Due, school stays active for grace period
    if (schoolId) {
      try {
        await db.prepare("UPDATE school_subscriptions SET status = 'Past_Due', updated_at = ? WHERE school_id = ?").bind(nowIso, schoolId).run();
      } catch (_) {}
    }
    try { await db.prepare('UPDATE razorpay_webhook_events SET processed=1, processed_at=? WHERE id=?').bind(nowIso, logId).run(); } catch (_) {}
    return c.json({ success: true, message: 'subscription.failed', schoolId });
  }

  if (eventType === 'subscription.paused') {
    if (schoolId) {
      try {
        await db.prepare("UPDATE school_subscriptions SET paused_at = ?, updated_at = ? WHERE school_id = ?").bind(nowIso, nowIso, schoolId).run();
      } catch (_) {}
    }
    try { await db.prepare('UPDATE razorpay_webhook_events SET processed=1, processed_at=? WHERE id=?').bind(nowIso, logId).run(); } catch (_) {}
    return c.json({ success: true, message: 'subscription.paused', schoolId });
  }

  if (eventType === 'subscription.resumed') {
    if (schoolId) {
      try {
        await db.prepare("UPDATE school_subscriptions SET paused_at = NULL, status = 'Active', updated_at = ? WHERE school_id = ?").bind(nowIso, schoolId).run();
      } catch (_) {}
    }
    try { await db.prepare('UPDATE razorpay_webhook_events SET processed=1, processed_at=? WHERE id=?').bind(nowIso, logId).run(); } catch (_) {}
    return c.json({ success: true, message: 'subscription.resumed', schoolId });
  }

  if (eventType === 'subscription.cancelled') {
    if (schoolId) {
      try {
        await db.prepare("UPDATE school_subscriptions SET status = 'Canceled', mandate_status = 'revoked', updated_at = ? WHERE school_id = ?").bind(nowIso, schoolId).run();
      } catch (_) {}
    }
    try { await db.prepare('UPDATE razorpay_webhook_events SET processed=1, processed_at=? WHERE id=?').bind(nowIso, logId).run(); } catch (_) {}
    return c.json({ success: true, message: 'subscription.cancelled', schoolId });
  }

  if (eventType === 'subscription.expired') {
    // All cycles completed
    if (schoolId) {
      try {
        await db.prepare("UPDATE school_subscriptions SET status = 'Past_Due', remaining_cycles = 0, updated_at = ? WHERE school_id = ?").bind(nowIso, schoolId).run();
      } catch (_) {}
    }
    try { await db.prepare('UPDATE razorpay_webhook_events SET processed=1, processed_at=? WHERE id=?').bind(nowIso, logId).run(); } catch (_) {}
    return c.json({ success: true, message: 'subscription.expired', schoolId });
  }

  // Unhandled event type — still acknowledge 200 so Razorpay doesn't retry forever.
  try {
    await db.prepare('UPDATE razorpay_webhook_events SET processed=1, processed_at=? WHERE id=?').bind(nowIso, logId).run();
  } catch (_) {}
  return c.json({ success: true, message: 'event acknowledged', eventType });
});

// GET /api/webhooks/razorpay/events — Super Admin audit view of recent webhook events.
webhooksApp.get('/razorpay/events', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser || authUser.role !== 'SuperAdmin') {
    return c.json({ success: false, message: 'केवल Super Admin वेबहुक इवेंट देख सकते हैं।' }, 403);
  }
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  try {
    const rows = await db.prepare('SELECT id, event_id, event_type, entity_id, school_id, processed, processed_at, received_at FROM razorpay_webhook_events ORDER BY received_at DESC LIMIT 100').all();
    return c.json({ success: true, events: rows.results || [] });
  } catch (e: any) {
    return c.json({ success: true, events: [] });
  }
});

export default webhooksApp;
