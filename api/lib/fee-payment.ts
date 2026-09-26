// Shared student-fee payment activation logic used by both the client-side verify
// endpoint (api/fees/verify) and the Razorpay webhook (api/webhooks/razorpay).
// Keeps activation idempotent so a duplicate webhook or a verify-after-webhook
// never double-marks a fee invoice paid.

export interface FeePaymentInput {
  db: any;
  env?: any;
  schoolId: string;
  invoiceId?: string;
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  razorpay_payment_link_id?: string;
  paidAmountINR?: number;
  webhookReceivedAt?: string;
}

export interface FeePaymentResult {
  success: boolean;
  alreadyPaid?: boolean;
  invoice?: any;
  message?: string;
  error?: string;
}

function mapFee(r: any): any {
  if (!r) return null;
  return {
    id: r.id,
    invoiceNumber: r.invoice_number,
    studentId: r.student_id,
    studentName: r.student_name,
    scholarNumber: r.scholar_number || '',
    className: r.class_name,
    section: r.section || '',
    title: r.title,
    totalAmount: r.total_amount,
    paidAmount: r.paid_amount,
    dueDate: r.due_date,
    status: r.status,
    paymentMethod: r.payment_method || '',
    transactionId: r.transaction_id || '',
    paidAt: r.paid_at || '',
  };
}

export async function activateFeePaymentFromRazorpay(input: FeePaymentInput): Promise<FeePaymentResult> {
  const db = input.db;
  const schoolId = input.schoolId;
  if (!db || !schoolId) return { success: false, error: 'डेटाबेस या schoolId अनुपलब्ध।' };

  // 1. Resolve the fee invoice by direct id, then order_id (checkout), then payment link id.
  let invoice: any = null;
  if (input.invoiceId) {
    invoice = await db.prepare('SELECT * FROM fee_invoices WHERE id = ? AND school_id = ?')
      .bind(input.invoiceId, schoolId).first();
  }
  if (!invoice && input.razorpay_order_id) {
    invoice = await db.prepare('SELECT * FROM fee_invoices WHERE razorpay_order_id = ? AND school_id = ?')
      .bind(input.razorpay_order_id, schoolId).first();
  }
  if (!invoice && input.razorpay_payment_link_id) {
    invoice = await db.prepare('SELECT * FROM fee_invoices WHERE razorpay_payment_link_id = ? AND school_id = ?')
      .bind(input.razorpay_payment_link_id, schoolId).first();
  }
  if (!invoice) return { success: false, error: 'चालान नहीं मिला।' };

  // 2. Idempotency: a paid invoice must not be re-activated.
  if (invoice.status === 'Paid') {
    return { success: true, alreadyPaid: true, invoice: mapFee(invoice), message: 'यह भुगतान पहले ही दर्ज हो चुका है।' };
  }

  // 3. Apply the payment amount (full remaining by default when amount unknown).
  const paidINR = Number(input.paidAmountINR) || 0;
  const addAmount = paidINR > 0 ? paidINR : Math.max(0, Number(invoice.total_amount) - Number(invoice.paid_amount));
  const newPaid = Math.min(Number(invoice.total_amount), Number(invoice.paid_amount) + addAmount);
  const newStatus = newPaid >= Number(invoice.total_amount) ? 'Paid' : 'Partial';
  const now = new Date().toISOString();

  // Compare-and-swap: the WHERE re-asserts the paid_amount we read, so two
  // concurrent activations cannot both compute from the same starting value and
  // silently discard one of the payments. `payment.captured` and `order.paid` for
  // one payment arrive as two separate requests, and the client-side
  // `/api/fees/verify` can also race the webhook.
  const upd = await db.prepare(
    'UPDATE fee_invoices SET paid_amount = ?, status = ?, payment_method = ?, transaction_id = ?, paid_at = ?, razorpay_payment_id = ? '
    + 'WHERE id = ? AND school_id = ? AND paid_amount = ?'
  ).bind(
    newPaid, newStatus, 'Razorpay', input.razorpay_payment_id || '', now.split('T')[0],
    input.razorpay_payment_id || '', invoice.id, schoolId, invoice.paid_amount
  ).run();

  if ((upd as any)?.meta?.changes === 0) {
    // The invoice moved between our read and our write. Re-read and report the
    // real state rather than overwriting it.
    const current = await db.prepare('SELECT * FROM fee_invoices WHERE id = ? AND school_id = ?')
      .bind(invoice.id, schoolId).first();
    if (current && current.status === 'Paid') {
      return { success: true, alreadyPaid: true, invoice: mapFee(current), message: 'यह भुगतान पहले ही दर्ज हो चुका है।' };
    }
    return { success: false, error: 'इस चालान पर एक साथ दूसरा भुगतान दर्ज हो रहा है।' };
  }

  const updated = await db.prepare('SELECT * FROM fee_invoices WHERE id = ? AND school_id = ?').bind(invoice.id, schoolId).first();
  const mapped = mapFee(updated);

  // 4. Fire payment-success notifications (email receipt + in-app notice).
  if (input.env) {
    try {
      const { notifyFeePayment } = await import('./fee-notify');
      await notifyFeePayment(db, input.env, updated, schoolId);
    } catch (e: any) {
      console.error('[fee-payment] notification failed:', e && e.message);
    }
  }

  return { success: true, invoice: mapped, message: '₹' + addAmount.toLocaleString('en-IN') + ' का भुगतान सफलतापूर्वक दर्ज किया गया।' };
}