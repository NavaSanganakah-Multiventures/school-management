// Shared subscription-activation logic used by both the client-side verify endpoint
// (api/billing/razorpay/verify) and the Razorpay webhook (api/webhooks/razorpay).
// Keeps the activation atomic + idempotent so a duplicate webhook or a verify-after-webhook
// never double-activates or leaves a paid school suspended.

import { loadSubscriptionPlans, SUBSCRIPTION_PLANS } from '../db';
import { provisionDedicatedWorker } from './provisioning';

function priceForPlan(plan: any, cycle: any) {
  const c = cycle || 'annual';
  if (c === 'quarterly') return plan.quarterlyPrice;
  if (c === 'annual') return plan.annualPrice;
  return plan.monthlyPrice;
}

export interface ActivateFromPaymentInput {
  db: any;
  env: any;
  schoolId: string;
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  razorpay_signature?: string;
  // When the webhook arrives without a pre-existing invoice (e.g. payment link), we need
  // enough info to resolve the plan + cycle from the notes/reference_id.
  planId?: string;
  billingCycle?: string;
  paidAmountINR?: number;
  // payment link references (optional)
  razorpay_payment_link_id?: string;
  webhookReceivedAt?: string;
}

export interface ActivateResult {
  success: boolean;
  alreadyPaid?: boolean;
  plan?: any;
  invoiceId?: string;
  provisioning?: any;
  message?: string;
  error?: string;
}

/**
 * Activates a school subscription from a successful Razorpay payment.
 * Resolves the invoice by razorpay_order_id (checkout) or razorpay_payment_link_id (link).
 * If no invoice exists yet (direct payment-link payment), creates one.
 * Idempotent: a second call for an already-paid invoice returns alreadyPaid.
 */
export async function activateSubscriptionFromPayment(input: ActivateFromPaymentInput): Promise<ActivateResult> {
  const db = input.db;
  const env = input.env;
  const schoolId = input.schoolId;
  if (!db || !schoolId) return { success: false, error: 'डेटाबेस या schoolId अनुपलब्ध।' };

  const allPlans = await loadSubscriptionPlans(db);

  // 1. Try to resolve an existing invoice by order_id (checkout flow).
  let invoice: any = null;
  if (input.razorpay_order_id) {
    invoice = await db.prepare('SELECT * FROM billing_invoices WHERE razorpay_order_id = ? AND school_id = ?')
      .bind(input.razorpay_order_id, schoolId).first();
  }
  // 2. Fallback: resolve by payment link id (payment-link flow).
  if (!invoice && input.razorpay_payment_link_id) {
    invoice = await db.prepare('SELECT * FROM billing_invoices WHERE razorpay_payment_link_id = ? AND school_id = ?')
      .bind(input.razorpay_payment_link_id, schoolId).first();
  }

  let planId = input.planId || '';
  let billingCycle = input.billingCycle || 'annual';
  let planName = '';
  let subtotal = input.paidAmountINR || 0;

  if (invoice) {
    // Idempotency: already paid -> no-op success.
    if (invoice.payment_status === 'Paid') {
      return { success: true, alreadyPaid: true, invoiceId: invoice.id, message: 'यह भुगतान पहले ही सत्यापित हो चुका है।' };
    }
    const VALID_CYCLES = ['monthly', 'quarterly', 'annual'];
    billingCycle = VALID_CYCLES.indexOf(invoice.billing_cycle) !== -1 ? invoice.billing_cycle : billingCycle;
    let plan = allPlans.find((p) => p.name === invoice.plan_name && !p.isTrial);
    if (!plan) plan = allPlans.find((p) => planId && p.id === planId && !p.isTrial);
    if (!plan) plan = allPlans.find((p) => !p.isTrial);
    if (!plan) plan = SUBSCRIPTION_PLANS[1] || allPlans[0];
    planId = plan.id;
    planName = plan.name;
    subtotal = (Number.isFinite(invoice.subtotal) && invoice.subtotal > 0) ? invoice.subtotal : subtotal;
  } else {
    // No invoice yet — synthesize one from the payment-link notes.
    let plan = allPlans.find((p) => p.id === planId && !p.isTrial);
    if (!plan) plan = allPlans.find((p) => !p.isTrial);
    if (!plan) plan = SUBSCRIPTION_PLANS[1] || allPlans[0];
    planId = plan.id;
    planName = plan.name;

    // GST must be derived from the plan PRICE, never from the amount actually
    // charged. `paidAmountINR` is what Razorpay collected and is already
    // GST-inclusive, so using it as the pre-tax subtotal and then adding 18% on
    // top overstated every fallback invoice by 18%.
    const price = priceForPlan(plan, billingCycle);
    subtotal = price;
    const gst = +(price * 0.18).toFixed(2);
    const total = +(price + gst).toFixed(2);
    const invoiceNumber = 'PM-INV-' + Date.now() + '-' + (crypto.randomUUID().split('-').join('').slice(0, 8));
    const now = new Date().toISOString();
    const invoiceId = 'binv-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    // Inserted as 'Processing', NOT 'Paid'.
    //
    // This was the bug that charged schools without activating them: the
    // fallback insert used to write payment_status='Paid', and the very next
    // conditional update (`... WHERE payment_status != 'Paid'`) then matched
    // zero rows, so the function returned `alreadyPaid: true` and returned
    // BEFORE the subscription update ever ran. The school was invoiced, the
    // gateway took the money, and the plan stayed inactive. Inserting as
    // 'Processing' lets that same conditional update do the real transition.
    try {
      await db.prepare(
        'INSERT INTO billing_invoices (id, school_id, invoice_number, description, plan_name, billing_cycle, subtotal, gst_percent, gst_amount, total_amount, payment_status, payment_method, transaction_id, invoice_date, due_date, paid_at, razorpay_order_id, razorpay_payment_id, razorpay_payment_link_id, razorpay_payment_link_url, webhook_received_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
      ).bind(
        invoiceId, schoolId, invoiceNumber, planName + ' सदस्यता', planName, billingCycle,
        price, 18, gst, total, 'Processing', 'Razorpay', input.razorpay_payment_id || '',
        now.split('T')[0], now.split('T')[0], now.split('T')[0] + ' ' + now.split('T')[1].slice(0, 8),
        input.razorpay_order_id || '', input.razorpay_payment_id || '',
        input.razorpay_payment_link_id || '', '', input.webhookReceivedAt || ''
      ).run();
      invoice = { id: invoiceId, payment_status: 'Processing', subtotal: price, plan_name: planName, billing_cycle: billingCycle };
    } catch (e) {
      // Older deployments may lack the payment-link columns on billing_invoices.
      await db.prepare(
        'INSERT INTO billing_invoices (id, school_id, invoice_number, description, plan_name, billing_cycle, subtotal, gst_percent, gst_amount, total_amount, payment_status, payment_method, transaction_id, invoice_date, due_date, paid_at, razorpay_order_id, razorpay_payment_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
      ).bind(
        invoiceId, schoolId, invoiceNumber, planName + ' सदस्यता', planName, billingCycle,
        price, 18, gst, total, 'Processing', 'Razorpay', input.razorpay_payment_id || '',
        now.split('T')[0], now.split('T')[0], now.split('T')[0] + ' ' + now.split('T')[1].slice(0, 8),
        input.razorpay_order_id || '', input.razorpay_payment_id || ''
      ).run().catch(() => {});
      invoice = { id: invoiceId, payment_status: 'Processing', subtotal: price, plan_name: planName, billing_cycle: billingCycle };
    }
  }

  const now = new Date().toISOString();
  const plan = allPlans.find((p) => p.id === planId && !p.isTrial) || SUBSCRIPTION_PLANS[1] || allPlans[0];

  // The paid service period. Nothing previously wrote these on activation, so
  // renewal scheduling operated on stale dates.
  const cycleMonths = billingCycle === 'monthly' ? 1 : billingCycle === 'quarterly' ? 3 : 12;
  const periodStart = now.split('T')[0];
  const periodEnd = new Date(Date.now() + cycleMonths * 30.44 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Conditional invoice update — prevents the TOCTOU race between a concurrent
  // verify call and the webhook.
  //
  // The `meta.changes === 0` branch returns "already paid" and stops. That is
  // only correct BECAUSE the fallback insert above writes 'Processing'. If that
  // insert ever goes back to 'Paid', a payment-link purchase will charge the
  // school and skip activation entirely — do not change it.
  try {
    const invUpdate = await db.prepare('UPDATE billing_invoices SET payment_status=?, razorpay_payment_id=?, transaction_id=?, paid_at=?, webhook_received_at=? WHERE id=? AND payment_status != ?')
      .bind('Paid', input.razorpay_payment_id || '', input.razorpay_payment_id || '', now.split('T')[0] + ' ' + now.split('T')[1].slice(0, 8), input.webhookReceivedAt || '', invoice.id, 'Paid').run();
    if (invUpdate.meta && invUpdate.meta.changes === 0) {
      return { success: true, alreadyPaid: true, invoiceId: invoice.id, message: 'यह भुगतान पहले ही सत्यापित हो चुका है।' };
    }
  } catch (e: any) {
    // Previously swallowed, which let the function continue to "success" even
    // when the invoice was never marked paid.
    console.error('[activateSubscriptionFromPayment] invoice update failed:', e && e.message);
    return { success: false, error: 'चालान अपडेट नहीं हो सका।', invoiceId: invoice.id };
  }

  // Invoice, subscription and tenant move together. D1 `batch` is atomic, so a
  // failure cannot leave a paid invoice with an inactive plan.
  try {
    await db.batch([
      db.prepare('UPDATE school_subscriptions SET plan_id=?, plan_name=?, billing_cycle=?, price_per_cycle=?, status=?, razorpay_order_id=?, razorpay_payment_id=?, razorpay_signature=?, trial_ends_at=?, period_start=?, period_end=?, next_billing_date=?, updated_at=? WHERE school_id=?')
        .bind(plan.id, plan.name, billingCycle, subtotal, 'Active', input.razorpay_order_id || '', input.razorpay_payment_id || '', input.razorpay_signature || '', '', periodStart, periodEnd, periodEnd, now, schoolId),
      db.prepare('UPDATE school_tenants SET plan_id=?, status=?, registration_status=?, trial_ends_at=? WHERE id=?')
        .bind(plan.id, 'Active', 'Approved', '', schoolId),
    ]);
  } catch (batchErr: any) {
    console.error('[activateSubscriptionFromPayment] batch failed:', batchErr);
    return { success: false, error: 'प्लान सक्रिय करते समय त्रुटि।', invoiceId: invoice.id };
  }

  // Every school gets its own dedicated worker — provision regardless of plan.
  let provisioning: any = null;
  try {
    const school = await db.prepare('SELECT * FROM school_tenants WHERE id = ?').bind(schoolId).first();
    if (school) provisioning = await provisionDedicatedWorker(env, db, school, {});
  } catch (e) {
    console.error('[activateSubscriptionFromPayment] provisioning failed:', e);
  }

  return {
    success: true,
    plan,
    invoiceId: invoice.id,
    provisioning,
    message: plan.name + ' सक्रिय हो गया।',
  };
}
