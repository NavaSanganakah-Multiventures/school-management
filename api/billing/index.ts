import { Hono } from 'hono';
import { getDB, SUBSCRIPTION_PLANS, loadSubscriptionPlans, loadSubscriptionPlanById, BillingCycle } from '../db';
import { getAuthUser, getRequestSchoolId } from '../lib/auth';
import { provisionDedicatedWorker } from '../lib/provisioning';
import { createRazorpayOrder, verifyRazorpaySignature, createRazorpayPlan, createRazorpaySubscription, createRazorpayCustomer, fetchRazorpaySubscription, cancelRazorpaySubscription, pauseRazorpaySubscription, resumeRazorpaySubscription, getRazorpayKeyId, getRazorpayKeySecret } from '../lib/razorpay';
import { checkSingleSchoolTrialStatus } from '../lib/trial-expiration';
import { activateSubscriptionFromPayment } from '../lib/billing-activation';

const billingApp = new Hono<{ Bindings: any }>();

function priceForPlan(plan: any, cycle: any) {
  const c = cycle || 'annual';
  if (c === 'quarterly') return plan.quarterlyPrice;
  if (c === 'annual') return plan.annualPrice;
  return plan.monthlyPrice;
}

function subToJson(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    schoolId: row.school_id,
    planId: row.plan_id,
    planName: row.plan_name,
    billingCycle: row.billing_cycle,
    pricePerCycle: row.price_per_cycle,
    discountPercent: row.discount_percent,
    status: row.status,
    autoPayEnabled: !!row.auto_pay_enabled,
    paymentMethod: row.payment_method,
    mandateId: row.mandate_id,
    mandateBank: row.mandate_bank,
    nextBillingDate: row.next_billing_date,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    trialEndsAt: row.trial_ends_at || '',
    updatedAt: row.updated_at,
  };
}

// GET /api/billing/plans - subscription plans (real pricing matrix, DB-backed)
billingApp.get('/plans', async (c) => {
  const db = getDB(c);
  const all = await loadSubscriptionPlans(db);
  const plans = all.filter((p) => !p.isTrial && p.active !== false);
  return c.json({
    success: true,
    plans,
    billingCycles: [
      { id: 'monthly', label: 'मासिक (Monthly)', discount: 0, tag: 'मानक बिलिंग' },
      { id: 'quarterly', label: 'त्रैमासिक (Quarterly)', discount: 5, tag: '5% बचत' },
      { id: 'annual', label: 'वार्षिक (Annual)', discount: 20, tag: '20% महाबचत (अनुशंसित)' },
    ],
    currency: 'INR (₹)',
  });
});

// GET /api/billing/razorpay/config - client-safe Razorpay key id
billingApp.get('/razorpay/config', async (c) => {
  return c.json({ success: true, keyId: await getRazorpayKeyId(c.env) });
});

// GET /api/billing/subscription - current school subscription
billingApp.get('/subscription', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);
  const schoolId = getRequestSchoolId(c, authUser);
  const subRow = await db.prepare('SELECT * FROM school_subscriptions WHERE school_id = ?').bind(schoolId).first();
  const tenant = await db.prepare('SELECT * FROM school_tenants WHERE id = ?').bind(schoolId).first();
  const subscription = subToJson(subRow);
  const isDedicated = !!(c.env && (c.env.IS_DEDICATED_WORKER === 'true' || c.env.SCHOOL_ID));

  // Verify trial status dynamically
  const trialCheck = await checkSingleSchoolTrialStatus(db, c.env, tenant);
  const isExpired = trialCheck.isExpired && !isDedicated;

  const planId = isDedicated ? 'enterprise' : (subscription && subscription.status === 'Trial' ? 'trial' : (subscription ? subscription.planId : (tenant ? tenant.plan_id : 'trial')));
  let planDetails = await loadSubscriptionPlanById(db, planId) || SUBSCRIPTION_PLANS[0];

  if (planId === 'enterprise' || isDedicated) {
    planDetails = Object.assign({}, planDetails, {
      modules: [
        'dashboard', 'students', 'attendance', 'staff', 'notices', 'fees',
        'exams', 'principal', 'settings', 'billing', 'classes', 'activity-logs',
        'plugins', 'lms', 'ai', 'ai-reports'
      ],
      maxStudentsLimit: null,
      maxStaffLimit: null,
      emailQuotaLimit: null,
      featureFlags: Object.assign({}, planDetails.featureFlags, {
        reportCards: true,
        principalHistory: true,
        autopay: true,
        domainEmail: true,
        multiSchool: true,
        prioritySupport: true,
        customDomainIncluded: true,
        dedicatedWorker: true,
      }),
    });
  } else if (isExpired) {
    // If trial is expired, restrict modules to ONLY billing to prompt renewal
    planDetails = Object.assign({}, planDetails, {
      modules: ['billing'],
    });
    if (subscription) {
      subscription.status = 'Expired';
    }
  }

  return c.json({
    success: true,
    school: tenant
      ? Object.assign({}, tenant, { status: isExpired ? 'Suspended' : tenant.status })
      : { id: schoolId, schoolName: '', status: isDedicated ? 'Active' : (isExpired ? 'Suspended' : 'Trial') },
    subscription,
    planId: isExpired ? 'trial' : planId,
    planDetails,
    trialEndsAt: trialCheck.trialEndsAt || (subscription ? subscription.trialEndsAt : ''),
    isTrialExpired: isExpired,
  });
});

// POST /api/billing/subscribe - create a real Razorpay order (no fake payment)
billingApp.post('/subscribe', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);
  if (authUser.role !== 'Director' && authUser.role !== 'SuperAdmin') {
    return c.json({ success: false, message: 'केवल निदेशक या Super Admin प्लान खरीद सकते हैं।' }, 403);
  }
  const schoolId = authUser.role === 'SuperAdmin' ? getRequestSchoolId(c, authUser) : authUser.schoolId;
  const body = await c.req.json().catch(() => ({}));
  const planId = body.planId;
  const billingCycle = body.billingCycle || 'annual';
  const allPlans = await loadSubscriptionPlans(db);
  const plan = allPlans.find((p) => p.id === planId && !p.isTrial);
  if (!plan) return c.json({ success: false, message: 'अमान्य प्लान चयन।' }, 400);

  const amount = priceForPlan(plan, billingCycle);
  if (amount <= 0) return c.json({ success: false, message: 'प्लान की राशि अमान्य है।' }, 400);

  const gst = +(amount * 0.18).toFixed(2);
  const total = +(amount + gst).toFixed(2);
  const receipt = 'PM-' + schoolId + '-' + Date.now();
  const order = await createRazorpayOrder(c, total, receipt);
  if (order.error) return c.json({ success: false, message: order.error }, 400);

  const invoiceNumber = 'PM-INV-' + Date.now() + '-' + (crypto.randomUUID().split('-').join('').slice(0, 8));
  const now = new Date().toISOString();

  try {
    await db.batch([
      db.prepare('UPDATE school_subscriptions SET razorpay_order_id = ?, updated_at = ? WHERE school_id = ?').bind(order.id, now, schoolId),
      db.prepare('INSERT INTO billing_invoices (id, school_id, invoice_number, description, plan_name, billing_cycle, subtotal, gst_percent, gst_amount, total_amount, payment_status, payment_method, transaction_id, invoice_date, due_date, paid_at, razorpay_order_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .bind('binv-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6), schoolId, invoiceNumber, plan.name + ' सदस्यता', plan.name, billingCycle, amount, 18, gst, total, 'Processing', 'Razorpay', '', now.split('T')[0], now.split('T')[0], '', order.id),
    ]);
  } catch (invErr: any) {
    return c.json({ success: false, message: 'चालान बनाते समय त्रुटि। कृपया पुनः प्रयास करें।' }, 500);
  }

  return c.json({
    success: true,
    message: 'Razorpay ऑर्डर बन गया। पेमेंट पूरा करें।',
    order: { id: order.id, amount: total, currency: 'INR', keyId: await getRazorpayKeyId(c.env) },
    plan: { id: plan.id, name: plan.name },
    billingCycle,
    amount: total,
  });
});

// POST /api/billing/razorpay/verify - verify signature and activate the plan
billingApp.post('/razorpay/verify', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);
  const body = await c.req.json().catch(() => ({}));
  const razorpay_order_id = body.razorpay_order_id;
  const razorpay_payment_id = body.razorpay_payment_id;
  const razorpay_signature = body.razorpay_signature;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return c.json({ success: false, message: 'पेमेंट विवरण अधूरा है।' }, 400);
  }

  const secret = await getRazorpayKeySecret(c.env);
  const ok = await verifyRazorpaySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature, secret);
  if (!ok) return c.json({ success: false, message: 'पेमेंट सिग्नेचर वेरिफिकेशन विफल।' }, 400);

  const schoolId = authUser.role === 'SuperAdmin' ? getRequestSchoolId(c, authUser) : authUser.schoolId;
  if (!schoolId) return c.json({ success: false, message: 'स्कूल पहचान नहीं हो सकी।' }, 400);

  // Bind the activation to the order actually created for this school (not a body-supplied plan).
  const invoice = await db.prepare('SELECT * FROM billing_invoices WHERE razorpay_order_id = ? AND school_id = ?').bind(razorpay_order_id, schoolId).first();
  if (!invoice) {
    return c.json({ success: false, message: 'यह ऑर्डर इस स्कूल से संबंधित नहीं है।' }, 400);
  }
  // Idempotency: a paid order must not be re-activated (prevents replays).
  if (invoice.payment_status === 'Paid') {
    return c.json({ success: true, message: 'यह भुगतान पहले ही सत्यापित हो चुका है।' });
  }

  const result = await activateSubscriptionFromPayment({
    db,
    env: c.env,
    schoolId,
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
  });

  if (!result.success) {
    return c.json({ success: false, message: result.error || 'प्लान सक्रिय करते समय त्रुटि। कृपया सहायता से संपर्क करें।' }, 500);
  }

  const plan = result.plan;
  const provisioning = result.provisioning;
  const provisionMessage = provisioning && provisioning.status === 'started'
    ? ' Dedicated worker provisioning शुरू हो गई: ' + (provisioning.domain || '')
    : (provisioning && provisioning.status === 'error'
      ? ' (ध्यान दें: dedicated worker provisioning विफल — ' + (provisioning.error || '') + ')'
      : '');
  return c.json({ success: true, message: 'पेमेंट सफल। ' + (plan ? plan.name : '') + ' सक्रिय हो गया।' + provisionMessage, provisioning });
});

// GET /api/billing/invoices - real invoices from D1
billingApp.get('/invoices', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);
  const schoolId = getRequestSchoolId(c, authUser);
  const rows = await db.prepare('SELECT * FROM billing_invoices WHERE school_id = ? ORDER BY invoice_date DESC').bind(schoolId).all();
  return c.json({ success: true, invoices: rows.results || [] });
});

// GET /api/billing/schools - current school summary (multi-school console lives in /api/admin)
billingApp.get('/schools', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);
  if (authUser && authUser.role === 'SuperAdmin') {
    const rows = await db.prepare('SELECT id, school_name, status, plan_id, trial_ends_at FROM school_tenants ORDER BY created_at DESC').all();
    return c.json({ success: true, schools: rows.results || [], currentSchoolId: '' });
  }
  const schoolId = getRequestSchoolId(c, authUser);
  const tenant = await db.prepare('SELECT * FROM school_tenants WHERE id = ?').bind(schoolId).first();
  return c.json({ success: true, schools: tenant ? [tenant] : [], currentSchoolId: schoolId });
});

// ==========================================
// Recurring Subscriptions (auto-debit via Razorpay mandates)
// ==========================================

// POST /api/billing/subscribe-recurring - create a Razorpay subscription for auto-debit
billingApp.post('/subscribe-recurring', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);
  if (authUser.role !== 'Director' && authUser.role !== 'SuperAdmin') {
    return c.json({ success: false, message: 'केवल निदेशक या Super Admin सदस्यता ले सकते हैं।' }, 403);
  }
  const schoolId = authUser.role === 'SuperAdmin' ? getRequestSchoolId(c, authUser) : authUser.schoolId;
  if (!schoolId) return c.json({ success: false, message: 'स्कूल पहचान नहीं हो सकी।' }, 400);

  const body = await c.req.json().catch(() => ({}));
  const planId = body.planId;
  const billingCycle: BillingCycle = (body.billingCycle === 'monthly' || body.billingCycle === 'quarterly') ? body.billingCycle : 'annual';
  const allPlans = await loadSubscriptionPlans(db);
  const plan = allPlans.find((p) => p.id === planId && !p.isTrial);
  if (!plan) return c.json({ success: false, message: 'अमान्य प्लान चयन।' }, 400);

  const baseAmount = priceForPlan(plan, billingCycle);
  if (baseAmount <= 0) return c.json({ success: false, message: 'प्लान की राशि अमान्य है।' }, 400);

  const school = await db.prepare('SELECT * FROM school_tenants WHERE id = ?').bind(schoolId).first();
  if (!school) return c.json({ success: false, message: 'स्कूल नहीं मिला।' }, 404);

  // 1. Create or fetch cached Razorpay Plan
  const period = billingCycle === 'annual' ? 'yearly' : 'monthly';
  const interval = billingCycle === 'quarterly' ? 3 : 1;
  const cyclesPerYear = billingCycle === 'monthly' ? 12 : (billingCycle === 'quarterly' ? 4 : 1);
  // Cap the caller-supplied cycle count. Previously `body.totalCycles` was used
  // verbatim, so a client could create a Razorpay subscription that auto-debits
  // for an unbounded number of cycles. Clamp to one year of the chosen cycle.
  const requestedCycles = Number(body.totalCycles || cyclesPerYear);
  const totalCycles = Math.min(
    Math.max(1, Number.isFinite(requestedCycles) ? Math.round(requestedCycles) : cyclesPerYear),
    cyclesPerYear,
  );

  // Idempotency: refuse to create a second live auto-debit mandate while one is
  // already in progress. Every call previously created a NEW Razorpay
  // subscription, so a retry or a double-tap left the school with duplicate
  // auto-debit obligations against one card.
  const liveSub = await db.prepare(
    "SELECT razorpay_subscription_id, status FROM school_subscriptions WHERE school_id = ? AND razorpay_subscription_id IS NOT NULL AND razorpay_subscription_id != '' AND status IN ('Active','Trial','Pending')"
  ).bind(schoolId).first().catch(() => null);
  if (liveSub) {
    return c.json({
      success: false,
      code: 'ALREADY_SUBSCRIBED',
      razorpaySubscriptionId: liveSub.razorpay_subscription_id,
      message: 'इस स्कूल की एक सक्रिय ऑटो-डेबिट सदस्यता पहले से मौजूद है। नई सदस्यता बनाने से पहले मौजूदा सदस्यता रद्द करें।',
    }, 409);
  }

  let razorpayPlanId = '';
  let razorpayItemId = '';
  try {
    const cached = await db.prepare('SELECT razorpay_plan_id, razorpay_item_id FROM razorpay_plans_cache WHERE platform_plan_id = ? AND period = ? AND amount = ?')
      .bind(plan.id, period, Math.round(baseAmount * 100)).first();
    if (cached) {
      razorpayPlanId = cached.razorpay_plan_id;
      razorpayItemId = cached.razorpay_item_id;
    }
  } catch (_) {}

  if (!razorpayPlanId) {
    const planResult = await createRazorpayPlan(c.env, {
      period: period as 'monthly' | 'yearly',
      interval,
      amountINR: baseAmount,
      name: plan.name + ' (' + billingCycle + ')',
      description: plan.name + ' सदस्यता — Pragnya Mitra',
      notes: { platform_plan_id: plan.id, billing_cycle: billingCycle },
    });
    if (planResult.error) return c.json({ success: false, message: planResult.error }, 400);
    razorpayPlanId = planResult.id || '';
    razorpayItemId = planResult.itemId || '';

    // Cache the plan
    try {
      const cacheId = 'rpc-' + Date.now();
      await db.prepare('INSERT INTO razorpay_plans_cache (id, platform_plan_id, razorpay_plan_id, period, amount, razorpay_item_id, created_at) VALUES (?,?,?,?,?,?,?)')
        .bind(cacheId, plan.id, razorpayPlanId, period, Math.round(baseAmount * 100), razorpayItemId, new Date().toISOString()).run();
    } catch (_) {}
  }

  // 2. Create or reuse a Razorpay Customer
  let customerId = '';
  try {
    const existingCustomer = await db.prepare('SELECT razorpay_customer_id FROM school_subscriptions WHERE school_id = ?').bind(schoolId).first();
    if (existingCustomer && existingCustomer.razorpay_customer_id) {
      customerId = existingCustomer.razorpay_customer_id;
    }
  } catch (_) {}

  if (!customerId && school.contact_email) {
    const custResult = await createRazorpayCustomer(c.env, {
      name: school.school_name,
      email: school.contact_email,
      contact: school.contact_phone,
      notes: { school_id: schoolId },
    });
    if (!custResult.error && custResult.id) customerId = custResult.id;
  }

  // 3. Create Razorpay Subscription
  const subResult = await createRazorpaySubscription(c.env, {
    planId: razorpayPlanId,
    totalCycles,
    customerId: customerId || undefined,
    notes: { school_id: schoolId, plan_id: plan.id, billing_cycle: billingCycle, type: 'subscription' },
  });
  if (subResult.error) return c.json({ success: false, message: subResult.error }, 400);

  // 4. Store subscription reference in DB
  //
  // Both branches previously swallowed their errors and still returned
  // success:true, so a school could be handed a live Razorpay mandate that the
  // platform had no record of — it would auto-debit with no way to cancel or
  // reconcile from our side. A failed local write must now surface, and the
  // caller should not be told the setup succeeded.
  const now = new Date().toISOString();
  let persisted = false;
  try {
    const upd = await db.prepare(`
      UPDATE school_subscriptions SET
        razorpay_plan_id = ?,
        razorpay_subscription_id = ?,
        razorpay_customer_id = ?,
        total_cycles = ?,
        remaining_cycles = ?,
        mandate_status = 'pending',
        auto_pay_enabled = 1,
        updated_at = ?
      WHERE school_id = ?
    `).bind(razorpayPlanId, subResult.id, customerId, totalCycles, totalCycles, now, schoolId).run();
    persisted = ((upd as any)?.meta?.changes ?? 0) > 0;
  } catch (updErr: any) {
    console.error('[billing/subscribe-recurring] subscription UPDATE failed:', updErr && updErr.message);
  }

  if (!persisted) {
    // No row for this school yet — create one.
    try {
      const subId = 'sub-' + Date.now();
      await db.prepare(`
        INSERT INTO school_subscriptions (id, school_id, plan_id, plan_name, billing_cycle, price_per_cycle, status, auto_pay_enabled, razorpay_plan_id, razorpay_subscription_id, total_cycles, remaining_cycles, mandate_status, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).bind(subId, schoolId, plan.id, plan.name, billingCycle, baseAmount, 'Active', 1, razorpayPlanId, subResult.id, totalCycles, totalCycles, 'pending', now).run();
      persisted = true;
    } catch (insErr: any) {
      console.error('[billing/subscribe-recurring] subscription INSERT failed:', insErr && insErr.message);
    }
  }

  if (!persisted) {
    // The mandate exists at Razorpay but not here. Tell the operator explicitly
    // so it can be cancelled, instead of silently losing a recurring charge.
    return c.json({
      success: false,
      code: 'LOCAL_PERSIST_FAILED',
      razorpaySubscriptionId: subResult.id,
      message: 'सदस्यता Razorpay पर बन गई लेकिन यहाँ सहेजी नहीं जा सकी। कृपया Super Admin से तुरंत संपर्क करें — '
        + 'Razorpay से इस सदस्यता को रद्द करवाएँ ताकि ऑटो-डेबिट न हो।',
    }, 502);
  }

  return c.json({
    success: true,
    message: 'Razorpay सदस्यता बन गई। कृपया मैंडेट अधिकृत करें (mandate authorization)।',
    subscriptionId: subResult.id,
    authUrl: subResult.shortUrl || subResult.paymentLinkUrl || '',
    plan: { id: plan.id, name: plan.name },
    billingCycle,
    totalCycles,
    amountPerCycle: baseAmount,
  });
});

// GET /api/billing/subscription-status - check recurring subscription + mandate status
billingApp.get('/subscription-status', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);
  if (authUser.role !== 'Director' && authUser.role !== 'SuperAdmin') {
    return c.json({ success: false, message: 'केवल निदेशक या Super Admin सदस्यता विवरण देख सकते हैं।' }, 403);
  }
  const schoolId = getRequestSchoolId(c, authUser);

  const sub = await db.prepare('SELECT * FROM school_subscriptions WHERE school_id = ?').bind(schoolId).first();
  if (!sub) return c.json({ success: true, recurring: false });

  // If we have a Razorpay subscription ID, fetch live status
  let razorpayStatus: any = null;
  if (sub.razorpay_subscription_id) {
    razorpayStatus = await fetchRazorpaySubscription(c.env, sub.razorpay_subscription_id);
  }

  return c.json({
    success: true,
    recurring: !!(sub.razorpay_subscription_id),
    subscription: {
      planId: sub.plan_id,
      planName: sub.plan_name,
      billingCycle: sub.billing_cycle,
      status: sub.status,
      autoPayEnabled: !!sub.auto_pay_enabled,
      mandateStatus: sub.mandate_status || 'none',
      razorpaySubscriptionId: sub.razorpay_subscription_id || '',
      totalCycles: sub.total_cycles,
      remainingCycles: sub.remaining_cycles,
      currentCycleStart: sub.current_cycle_start,
      currentCycleEnd: sub.current_cycle_end,
      nextBillingDate: sub.next_billing_date,
    },
    razorpayStatus: razorpayStatus && !razorpayStatus.error ? {
      status: razorpayStatus.status,
      currentStart: razorpayStatus.current_start,
      currentEnd: razorpayStatus.current_end,
      paidCount: razorpayStatus.paid_count,
      remainingCount: razorpayStatus.remaining_count,
      mandateId: razorpayStatus.mandate_id,
      shortUrl: razorpayStatus.short_url,
    } : null,
  });
});

// POST /api/billing/subscription/cancel - cancel recurring subscription
billingApp.post('/subscription/cancel', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);
  if (authUser.role !== 'Director' && authUser.role !== 'SuperAdmin') {
    return c.json({ success: false, message: 'केवल निदेशक या Super Admin रद्द कर सकते हैं।' }, 403);
  }
  const schoolId = getRequestSchoolId(c, authUser);
  const body = await c.req.json().catch(() => ({}));
  const cancelAtCycleEnd = !!body.cancelAtCycleEnd;

  const sub = await db.prepare('SELECT razorpay_subscription_id FROM school_subscriptions WHERE school_id = ?').bind(schoolId).first();
  if (!sub || !sub.razorpay_subscription_id) {
    return c.json({ success: false, message: 'कोई recurring सदस्यता नहीं है।' }, 400);
  }

  const result = await cancelRazorpaySubscription(c.env, sub.razorpay_subscription_id, cancelAtCycleEnd);
  if (result.error) return c.json({ success: false, message: result.error }, 400);

  const now = new Date().toISOString();
  // Local state must reflect what Razorpay actually did. `cancel_at_cycle_end`
  // leaves the subscription ACTIVE until the cycle ends, but the old code
  // unconditionally wrote status='Canceled' + mandate_status='revoked', so the
  // platform claimed the mandate was dead while Razorpay could still debit.
  //
  // mandate_status stays inside its documented domain
  // (none / pending / active / revoked, see migration 0032). A cancel-at-cycle-end
  // keeps the mandate 'active' — it is still authorized and still chargeable —
  // and `cancel_at_cycle_end = 1` records the intent. The terminal
  // Canceled/revoked state is reconciled by the subscription.cancelled webhook,
  // which now matches on razorpay_subscription_id.
  const upd = await db.prepare(`
    UPDATE school_subscriptions
    SET status = ?, mandate_status = ?, cancel_at_cycle_end = ?, updated_at = ?
    WHERE school_id = ?
  `).bind(
    cancelAtCycleEnd ? 'Active' : 'Canceled',
    cancelAtCycleEnd ? 'active' : 'revoked',
    cancelAtCycleEnd ? 1 : 0,
    now,
    schoolId,
  ).run();

  if (((upd as any)?.meta?.changes ?? 0) === 0) {
    console.error('[billing/subscription/cancel] Razorpay cancelled but no local subscription row was updated for', schoolId);
    return c.json({
      success: false,
      code: 'LOCAL_PERSIST_FAILED',
      message: 'Razorpay पर रद्दीकरण हो गया लेकिन स्थानीय रिकॉर्ड अपडेट नहीं हुआ। कृपया Super Admin से संपर्क करें।',
    }, 502);
  }

  return c.json({
    success: true,
    message: cancelAtCycleEnd
      ? 'सदस्यता वर्तमान चक्र के अंत में रद्द हो जाएगी (अभी सक्रिय)।'
      : 'सदस्यता तुरंत रद्द कर दी गई।',
    razorpayStatus: result.status,
  });
});

// POST /api/billing/subscription/pause - pause recurring subscription
billingApp.post('/subscription/pause', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);
  if (authUser.role !== 'Director' && authUser.role !== 'SuperAdmin') {
    return c.json({ success: false, message: 'केवल निदेशक या Super Admin रोक सकते हैं।' }, 403);
  }
  const schoolId = getRequestSchoolId(c, authUser);
  const sub = await db.prepare('SELECT razorpay_subscription_id FROM school_subscriptions WHERE school_id = ?').bind(schoolId).first();
  if (!sub || !sub.razorpay_subscription_id) return c.json({ success: false, message: 'कोई recurring सदस्यता नहीं है।' }, 400);

  const result = await pauseRazorpaySubscription(c.env, sub.razorpay_subscription_id);
  if (result.error) return c.json({ success: false, message: result.error }, 400);

  // paused_at records the pause; the mandate itself is still authorized, so
  // mandate_status correctly stays 'active' (migration 0032 domain).
  const upd = await db.prepare(
    "UPDATE school_subscriptions SET paused_at = ?, updated_at = ? WHERE school_id = ?"
  ).bind(new Date().toISOString(), new Date().toISOString(), schoolId).run();
  if (((upd as any)?.meta?.changes ?? 0) === 0) {
    return c.json({ success: false, code: 'LOCAL_PERSIST_FAILED', message: 'स्थानीय रिकॉर्ड अपडेट नहीं हुआ।' }, 502);
  }
  return c.json({ success: true, message: 'सदस्यता रोक दी गई (paused)।' });
});

// POST /api/billing/subscription/resume - resume paused subscription
billingApp.post('/subscription/resume', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);
  if (authUser.role !== 'Director' && authUser.role !== 'SuperAdmin') {
    return c.json({ success: false, message: 'केवल निदेशक या Super Admin फिर से शुरू कर सकते हैं।' }, 403);
  }
  const schoolId = getRequestSchoolId(c, authUser);
  const sub = await db.prepare('SELECT razorpay_subscription_id FROM school_subscriptions WHERE school_id = ?').bind(schoolId).first();
  if (!sub || !sub.razorpay_subscription_id) return c.json({ success: false, message: 'कोई recurring सदस्यता नहीं है।' }, 400);

  const result = await resumeRazorpaySubscription(c.env, sub.razorpay_subscription_id);
  if (result.error) return c.json({ success: false, message: result.error }, 400);

  const upd = await db.prepare(
    "UPDATE school_subscriptions SET paused_at = NULL, status = 'Active', updated_at = ? WHERE school_id = ?"
  ).bind(new Date().toISOString(), schoolId).run();
  if (((upd as any)?.meta?.changes ?? 0) === 0) {
    return c.json({ success: false, code: 'LOCAL_PERSIST_FAILED', message: 'स्थानीय रिकॉर्ड अपडेट नहीं हुआ।' }, 502);
  }
  return c.json({ success: true, message: 'सदस्यता फिर से शुरू हो गई (resumed)।' });
});

export default billingApp;