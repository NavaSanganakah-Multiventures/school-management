import { Hono } from 'hono';
import { getDB, SUBSCRIPTION_PLANS, BillingCycle, SubscriptionPlanId } from '../db';
import { getAuthUser, getRequestSchoolId } from '../lib/auth';
import { createRazorpayOrder, verifyRazorpaySignature } from '../lib/razorpay';

const billingApp = new Hono();

function priceForPlan(plan, cycle) {
  const c = cycle || 'annual';
  if (c === 'quarterly') return plan.quarterlyPrice;
  if (c === 'annual') return plan.annualPrice;
  return plan.monthlyPrice;
}

function subToJson(row) {
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

// GET /api/billing/plans - subscription plans (real pricing matrix)
billingApp.get('/plans', (c) => {
  return c.json({
    success: true,
    plans: SUBSCRIPTION_PLANS,
    billingCycles: [
      { id: 'monthly', label: 'मासिक (Monthly)', discount: 0, tag: 'मानक बिलिंग' },
      { id: 'quarterly', label: 'त्रैमासिक (Quarterly)', discount: 5, tag: '5% बचत' },
      { id: 'annual', label: 'वार्षिक (Annual)', discount: 20, tag: '20% महाबचत (अनुशंसित)' },
    ],
    currency: 'INR (₹)',
  });
});

// GET /api/billing/razorpay/config - client-safe Razorpay key id
billingApp.get('/razorpay/config', (c) => {
  return c.json({ success: true, keyId: (c.env && c.env.RAZORPAY_KEY_ID) || '' });
});

// GET /api/billing/subscription - current school subscription
billingApp.get('/subscription', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  const schoolId = getRequestSchoolId(c, authUser);
  const subRow = await db.prepare('SELECT * FROM school_subscriptions WHERE school_id = ?').bind(schoolId).first();
  const tenant = await db.prepare('SELECT * FROM school_tenants WHERE id = ?').bind(schoolId).first();
  const subscription = subToJson(subRow);
  const planId = subscription && subscription.status === 'Trial' ? 'trial' : (subscription ? subscription.planId : 'trial');
  const planDetails = SUBSCRIPTION_PLANS.find((p) => p.id === planId) || SUBSCRIPTION_PLANS[0];
  return c.json({
    success: true,
    school: tenant || { id: schoolId, schoolName: '', status: 'Trial' },
    subscription,
    planId,
    planDetails,
    trialEndsAt: subscription ? subscription.trialEndsAt : '',
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
  const plan = SUBSCRIPTION_PLANS.find((p) => p.id === planId && p.id !== 'trial');
  if (!plan) return c.json({ success: false, message: 'अमान्य प्लान चयन।' }, 400);

  const amount = priceForPlan(plan, billingCycle);
  if (amount <= 0) return c.json({ success: false, message: 'प्लान की राशि अमान्य है।' }, 400);

  const receipt = 'VS-' + schoolId + '-' + Date.now();
  const order = await createRazorpayOrder(c, amount, receipt);
  if (order.error) return c.json({ success: false, message: order.error }, 400);

  const gst = +(amount * 0.18).toFixed(2);
  const total = +(amount + gst).toFixed(2);
  const invoiceNumber = 'VS-INV-' + Date.now().toString().slice(-6);
  const now = new Date().toISOString();

  await db.prepare('UPDATE school_subscriptions SET razorpay_order_id = ?, updated_at = ? WHERE school_id = ?').bind(order.id, now, schoolId).run();

  await db.prepare('INSERT INTO billing_invoices (id, school_id, invoice_number, description, plan_name, billing_cycle, subtotal, gst_percent, gst_amount, total_amount, payment_status, payment_method, transaction_id, invoice_date, due_date, paid_at, razorpay_order_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind('binv-' + Date.now(), schoolId, invoiceNumber, plan.name + ' सदस्यता', plan.name, billingCycle, amount, 18, gst, total, 'Processing', 'Razorpay', '', now.split('T')[0], now.split('T')[0], '', order.id).run();

  return c.json({
    success: true,
    message: 'Razorpay ऑर्डर बन गया। पेमेंट पूरा करें।',
    order: { id: order.id, amount: amount, currency: 'INR', keyId: (c.env && c.env.RAZORPAY_KEY_ID) || '' },
    plan: { id: plan.id, name: plan.name },
    billingCycle,
    amount,
  });
});

// POST /api/billing/razorpay/verify - verify signature and activate the plan
billingApp.post('/razorpay/verify', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  const body = await c.req.json().catch(() => ({}));
  const razorpay_order_id = body.razorpay_order_id;
  const razorpay_payment_id = body.razorpay_payment_id;
  const razorpay_signature = body.razorpay_signature;
  const planId = body.planId;
  const billingCycle = body.billingCycle || 'annual';

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return c.json({ success: false, message: 'पेमेंट विवरण अधूरा है।' }, 400);
  }

  const secret = (c.env && c.env.RAZORPAY_KEY_SECRET) || '';
  const ok = await verifyRazorpaySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature, secret);
  if (!ok) return c.json({ success: false, message: 'पेमेंट सिग्नेचर वेरिफिकेशन विफल।' }, 400);

  const schoolId = authUser ? (authUser.role === 'SuperAdmin' ? getRequestSchoolId(c, authUser) : authUser.schoolId) : getRequestSchoolId(c, null);
  const subRow = await db.prepare('SELECT * FROM school_subscriptions WHERE school_id = ?').bind(schoolId).first();
  const plan = SUBSCRIPTION_PLANS.find((p) => p.id === planId && p.id !== 'trial') || SUBSCRIPTION_PLANS.find((p) => p.id === (subRow ? subRow.plan_id : 'starter')) || SUBSCRIPTION_PLANS[1];
  const amount = priceForPlan(plan, billingCycle);
  const now = new Date().toISOString();

  await db.prepare('UPDATE school_subscriptions SET plan_id=?, plan_name=?, billing_cycle=?, price_per_cycle=?, status=?, razorpay_order_id=?, razorpay_payment_id=?, razorpay_signature=?, trial_ends_at=?, updated_at=? WHERE school_id=?')
    .bind(plan.id, plan.name, billingCycle, amount, 'Active', razorpay_order_id, razorpay_payment_id, razorpay_signature, '', now, schoolId).run();

  await db.prepare('UPDATE school_tenants SET plan_id=?, status=?, registration_status=?, trial_ends_at=? WHERE id=?')
    .bind(plan.id, 'Active', 'Approved', '', schoolId).run();

  await db.prepare('UPDATE billing_invoices SET payment_status=?, razorpay_payment_id=?, transaction_id=?, paid_at=? WHERE razorpay_order_id=?')
    .bind('Paid', razorpay_payment_id, razorpay_payment_id, now.split('T')[0] + ' ' + now.split('T')[1].slice(0, 8), razorpay_order_id).run();

  return c.json({ success: true, message: 'पेमेंट सफल। ' + plan.name + ' सक्रिय हो गया।' });
});

// GET /api/billing/invoices - real invoices from D1
billingApp.get('/invoices', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  const schoolId = getRequestSchoolId(c, authUser);
  const rows = await db.prepare('SELECT * FROM billing_invoices WHERE school_id = ? ORDER BY created_at DESC').bind(schoolId).all();
  return c.json({ success: true, invoices: rows.results || [] });
});

// GET /api/billing/schools - current school summary (multi-school console lives in /api/admin)
billingApp.get('/schools', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (authUser && authUser.role === 'SuperAdmin') {
    const rows = await db.prepare('SELECT id, school_name, status, plan_id, trial_ends_at FROM school_tenants ORDER BY created_at DESC').all();
    return c.json({ success: true, schools: rows.results || [], currentSchoolId: '' });
  }
  const schoolId = getRequestSchoolId(c, authUser);
  const tenant = await db.prepare('SELECT * FROM school_tenants WHERE id = ?').bind(schoolId).first();
  return c.json({ success: true, schools: tenant ? [tenant] : [], currentSchoolId: schoolId });
});

export default billingApp;
