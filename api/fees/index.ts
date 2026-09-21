import { Hono } from 'hono';
import { getDB } from '../db';
import { getAuthUser, getRequestSchoolId } from '../lib/auth';
import { createRazorpayOrder, createRazorpayPaymentLink, verifyRazorpaySignature, getRazorpayKeyId, getRazorpayKeySecret } from '../lib/razorpay';
import { activateFeePaymentFromRazorpay } from '../lib/fee-payment';

const feesApp = new Hono<{ Bindings: any }>();

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

// GET /api/fees
feesApp.get('/', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);
  const schoolId = getRequestSchoolId(c, authUser);
  const status = c.req.query('status');
  const search = (c.req.query('q') || '').toLowerCase();

  const rows = await db.prepare('SELECT * FROM fee_invoices WHERE school_id = ? ORDER BY created_at DESC').bind(schoolId).all();
  const all = (rows.results || []).map(mapFee);
  let list = all;

  if (status && status !== 'All') {
    list = list.filter((f) => f.status.toLowerCase() === status.toLowerCase());
  }
  if (search) {
    list = list.filter((f) =>
      f.studentName.toLowerCase().includes(search) ||
      f.invoiceNumber.toLowerCase().includes(search) ||
      f.scholarNumber.toLowerCase().includes(search)
    );
  }

  const totalCollected = all.reduce((acc, f) => acc + (f.paidAmount || 0), 0);
  const totalReceivable = all.reduce((acc, f) => acc + (f.totalAmount || 0), 0);
  const totalPending = totalReceivable - totalCollected;

  return c.json({
    success: true,
    summary: { totalReceivable, totalCollected, totalPending, invoiceCount: all.length },
    invoices: list,
  });
});

// POST /api/fees/pay
feesApp.post('/pay', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);
  const schoolId = getRequestSchoolId(c, authUser);
  const body = await c.req.json().catch(() => ({}));
  const invoiceId = body.invoiceId;
  const row = await db.prepare('SELECT * FROM fee_invoices WHERE school_id = ? AND id = ?').bind(schoolId, invoiceId).first();
  if (!row) return c.json({ success: false, message: 'चालान नहीं मिला।' }, 404);

  const remaining = row.total_amount - row.paid_amount;
  let payAmt: number;
  if (body.amount === undefined || body.amount === null || body.amount === '') {
    payAmt = remaining;
  } else {
    payAmt = Number(body.amount);
  }
  if (!Number.isFinite(payAmt) || payAmt <= 0) {
    return c.json({ success: false, message: 'भुगतान राशि धनात्मक संख्या होनी चाहिए।' }, 400);
  }
  if (payAmt > remaining + 1e-9) {
    return c.json({ success: false, message: 'भुगतान राशि शेष राशि से अधिक नहीं हो सकती (शेष: ₹' + remaining.toLocaleString('en-IN') + ')।' }, 400);
  }
  const newPaid = Math.min(row.total_amount, row.paid_amount + payAmt);
  const newStatus = newPaid >= row.total_amount ? 'Paid' : 'Partial';
  const method = body.paymentMethod || 'Cash';
  const txn = body.transactionId || ('TXN-' + Date.now().toString().slice(-8));

  await db.prepare('UPDATE fee_invoices SET paid_amount = ?, status = ?, payment_method = ?, transaction_id = ?, paid_at = ? WHERE id = ? AND school_id = ?')
    .bind(newPaid, newStatus, method, txn, new Date().toISOString().split('T')[0], invoiceId, schoolId).run();

  const updated = await db.prepare('SELECT * FROM fee_invoices WHERE id = ?').bind(invoiceId).first();
  const invoice = mapFee(updated);
  return c.json({ success: true, message: '₹' + payAmt.toLocaleString('en-IN') + ' का भुगतान सफलतापूर्वक दर्ज किया गया। रसीद सं: ' + invoice.invoiceNumber, invoice });
});

// POST /api/fees/create-invoice
feesApp.post('/create-invoice', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);
  const schoolId = getRequestSchoolId(c, authUser);
  const body = await c.req.json().catch(() => ({}));

  if (!body.studentName || !body.title) {
    return c.json({ success: false, message: 'छात्र का नाम और शीर्षक अनिवार्यक हैं।' }, 400);
  }
  const totalAmount = Number(body.totalAmount);
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    return c.json({ success: false, message: 'कुल राशि धनात्मक संख्या होनी चाहिए।' }, 400);
  }

  let scholarNumber = body.scholarNumber || '';
  let className = body.className || '';
  let section = body.section || '';
  if (body.studentId) {
    const st = await db.prepare('SELECT scholar_number, class_name, section FROM students WHERE id = ? AND school_id = ?').bind(body.studentId, schoolId).first();
    if (st) {
      scholarNumber = scholarNumber || st.scholar_number || '';
      className = className || st.class_name || '';
      section = section || st.section || '';
    }
  }

  const cnt = await db.prepare('SELECT COUNT(*) AS n FROM fee_invoices WHERE school_id = ?').bind(schoolId).first();
  const invoiceNumber = 'INV-' + new Date().getFullYear() + '/' + String((cnt ? cnt.n : 0) + 1).padStart(3, '0');
  const id = 'fee-' + Date.now();

  await db.prepare('INSERT INTO fee_invoices (id, invoice_number, student_id, student_name, class_name, title, total_amount, paid_amount, due_date, status, school_id, scholar_number, section) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(id, invoiceNumber, body.studentId || ('std-' + Date.now()), body.studentName, className, body.title, Number(body.totalAmount), 0, body.dueDate || new Date().toISOString().split('T')[0], 'Unpaid', schoolId, scholarNumber, section).run();

  const row = await db.prepare('SELECT * FROM fee_invoices WHERE id = ?').bind(id).first();
  const invoice = mapFee(row);
  return c.json({ success: true, message: 'चालान ' + invoiceNumber + ' जारी किया गया।', invoice }, 201);
});

// POST /api/fees/create-bulk
feesApp.post('/create-bulk', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);
  const schoolId = getRequestSchoolId(c, authUser);
  const body = await c.req.json().catch(() => ({}));

  const className = body.className;
  const title = body.title;
  const totalAmount = Number(body.totalAmount);
  const dueDate = body.dueDate || new Date().toISOString().split('T')[0];

  if (!className || !title) {
    return c.json({ success: false, message: 'कक्षा और शीर्षक अनिवार्यक हैं।' }, 400);
  }
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    return c.json({ success: false, message: 'राशि धनात्मक संख्या होनी चाहिए।' }, 400);
  }

  const studentsResult = await db.prepare(
    'SELECT id, full_name, scholar_number, class_name, section FROM students WHERE school_id = ? AND class_name = ? AND status = "Active"'
  ).bind(schoolId, className).all();

  const students = studentsResult.results || [];
  if (students.length === 0) {
    return c.json({ success: false, message: className + ' में कोई सक्रिय छात्र नहीं मिला।' }, 404);
  }

  const cntRow = await db.prepare('SELECT COUNT(*) AS n FROM fee_invoices WHERE school_id = ?').bind(schoolId).first();
  let baseCnt = Number(cntRow ? cntRow.n : 0);
  const year = new Date().getFullYear();

  let createdCount = 0;
  for (const st of students as any[]) {
    baseCnt++;
    const invNum = 'INV-' + year + '/' + String(baseCnt).padStart(3, '0');
    const invId = 'fee-' + Date.now() + '-' + createdCount;

    await db.prepare(
      'INSERT INTO fee_invoices (id, invoice_number, student_id, student_name, class_name, title, total_amount, paid_amount, due_date, status, school_id, scholar_number, section) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)'
    ).bind(
      invId,
      invNum,
      st.id,
      st.full_name,
      st.class_name,
      title,
      totalAmount,
      0,
      dueDate,
      'Unpaid',
      schoolId,
      st.scholar_number || '',
      st.section || ''
    ).run();

    createdCount++;
  }

  return c.json({
    success: true,
    message: className + ' के ' + createdCount + ' छात्रों के लिए फीस चालान सफलतापूर्वक जारी किए गए।',
    count: createdCount,
  }, 201);
});

// GET /api/fees/heads - List fee heads
feesApp.get('/heads', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);
  const schoolId = getRequestSchoolId(c, authUser);

  const heads = await db.prepare('SELECT * FROM fee_heads WHERE school_id = ? ORDER BY head_name').bind(schoolId).all();
  return c.json({ success: true, feeHeads: heads.results || [] });
});

// POST /api/fees/heads - Add a new fee head
feesApp.post('/heads', async (c) => {
  const db = getDB(c);
  const authUser = await getAuthUser(c);
  if (!authUser || (authUser.role !== 'Director' && authUser.role !== 'Principal')) {
    return c.json({ success: false, message: 'अनधिकृत पहुँच।' }, 403);
  }
  const schoolId = getRequestSchoolId(c, authUser);
  const body = await c.req.json().catch(() => ({}));

  if (!body.headName) return c.json({ success: false, message: 'फीस का नाम (Head Name) आवश्यक है।' }, 400);

  const id = `fh-${crypto.randomUUID()}`;
  await db.prepare('INSERT INTO fee_heads (id, school_id, head_name, description) VALUES (?, ?, ?, ?)')
    .bind(id, schoolId, body.headName.trim(), body.description?.trim() || null).run();

  return c.json({ success: true, message: 'फीस हेड सफलतापूर्वक जोड़ा गया।', id });
});

// GET /api/fees/structure - List class fee structure
feesApp.get('/structure', async (c) => {
  const db = getDB(c);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);
  const schoolId = getRequestSchoolId(c, authUser);

  const structure = await db.prepare(
    `SELECT cfs.*, fh.head_name 
     FROM class_fee_structure cfs 
     JOIN fee_heads fh ON cfs.fee_head_id = fh.id 
     WHERE cfs.school_id = ? 
     ORDER BY cfs.class_name, fh.head_name`
  ).bind(schoolId).all();

  return c.json({ success: true, feeStructure: structure.results || [] });
});

// POST /api/fees/structure - Assign fee to a class
feesApp.post('/structure', async (c) => {
  const db = getDB(c);
  const authUser = await getAuthUser(c);
  if (!authUser || (authUser.role !== 'Director' && authUser.role !== 'Principal')) {
    return c.json({ success: false, message: 'अनधिकृत पहुँच।' }, 403);
  }
  const schoolId = getRequestSchoolId(c, authUser);
  const body = await c.req.json().catch(() => ({}));

  if (!body.className || !body.feeHeadId || !body.amount) {
    return c.json({ success: false, message: 'कक्षा, फीस हेड और राशि (Amount) आवश्यक हैं।' }, 400);
  }

  const id = `cfs-${crypto.randomUUID()}`;
  await db.prepare(
    `INSERT INTO class_fee_structure (id, school_id, class_name, fee_head_id, amount, billing_cycle) 
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(
    id, schoolId, body.className, body.feeHeadId, 
    parseFloat(body.amount), body.billingCycle || 'Monthly'
  ).run();

  return c.json({ success: true, message: 'कक्षा के लिए फीस स्ट्रक्चर सफलतापूर्वक सेट किया गया।' });
});

// POST /api/fees/create-order - real Razorpay order for online fee payment
feesApp.post('/create-order', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);
  const schoolId = getRequestSchoolId(c, authUser);
  const body = await c.req.json().catch(() => ({}));
  const invoiceId = body.invoiceId;

  const row = await db.prepare('SELECT * FROM fee_invoices WHERE school_id = ? AND id = ?').bind(schoolId, invoiceId).first();
  if (!row) return c.json({ success: false, message: 'चालान नहीं मिला।' }, 404);
  if (row.status === 'Paid') return c.json({ success: false, message: 'यह चालान पहले ही भुगतान हो चुका है।' }, 400);

  const remaining = Number(row.total_amount) - Number(row.paid_amount);
  let payAmt: number;
  if (body.amount === undefined || body.amount === null || body.amount === '') {
    payAmt = remaining;
  } else {
    payAmt = Number(body.amount);
  }
  if (!Number.isFinite(payAmt) || payAmt <= 0) {
    return c.json({ success: false, message: 'भुगतान राशि धनात्मक संख्या होनी चाहिए।' }, 400);
  }
  if (payAmt > remaining + 1e-9) {
    return c.json({ success: false, message: 'भुगतान राशि शेष राशि से अधिक नहीं हो सकती (शेष: ₹' + remaining.toLocaleString('en-IN') + ')।' }, 400);
  }

  const receipt = 'PM-FEE-' + String(row.invoice_number).replace(/[^a-zA-Z0-9]/g, '') + '-' + Date.now();
  const order = await createRazorpayOrder(c, payAmt, receipt);
  if (order.error) return c.json({ success: false, message: order.error }, 400);

  await db.prepare('UPDATE fee_invoices SET razorpay_order_id = ? WHERE id = ? AND school_id = ?')
    .bind(order.id, invoiceId, schoolId).run();

  return c.json({
    success: true,
    message: 'Razorpay ऑर्डर बन गया। पेमेंट पूरा करें।',
    order: { id: order.id, amount: payAmt, currency: 'INR', keyId: await getRazorpayKeyId(c.env) },
    invoiceId,
  });
});

// POST /api/fees/verify - verify Razorpay signature and mark the invoice paid
feesApp.post('/verify', async (c) => {
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

  const schoolId = getRequestSchoolId(c, authUser);
  const result = await activateFeePaymentFromRazorpay({
    db,
    env: c.env,
    schoolId,
    razorpay_order_id,
    razorpay_payment_id,
  });

  if (!result.success) {
    return c.json({ success: false, message: result.error || 'भुगतान दर्ज करने में त्रुटि।' }, 500);
  }
  if (result.alreadyPaid) {
    return c.json({ success: true, message: result.message });
  }
  return c.json({
    success: true,
    message: result.message,
    invoice: result.invoice,
  });
});

// POST /api/fees/payment-link - create a Razorpay payment link for a parent
feesApp.post('/payment-link', async (c) => {
  const db = getDB(c);
  if (!db) return c.json({ success: false, message: 'डेटाबेस उपलब्ध नहीं है।' }, 500);
  const authUser = await getAuthUser(c);
  if (!authUser) return c.json({ success: false, message: 'लॉगिन आवश्यक है।' }, 401);
  const schoolId = getRequestSchoolId(c, authUser);
  const body = await c.req.json().catch(() => ({}));
  const invoiceId = body.invoiceId;

  const row = await db.prepare('SELECT * FROM fee_invoices WHERE school_id = ? AND id = ?').bind(schoolId, invoiceId).first();
  if (!row) return c.json({ success: false, message: 'चालान नहीं मिला।' }, 404);
  if (row.status === 'Paid') return c.json({ success: false, message: 'यह चालान पहले ही भुगतान हो चुका है।' }, 400);

  const remaining = Number(row.total_amount) - Number(row.paid_amount);
  let payAmt: number;
  if (body.amount === undefined || body.amount === null || body.amount === '') {
    payAmt = remaining;
  } else {
    payAmt = Number(body.amount);
  }
  if (!Number.isFinite(payAmt) || payAmt <= 0) {
    return c.json({ success: false, message: 'भुगतान राशि धनात्मक संख्या होनी चाहिए।' }, 400);
  }
  if (payAmt > remaining + 1e-9) {
    return c.json({ success: false, message: 'भुगतान राशि शेष राशि से अधिक नहीं हो सकती (शेष: ₹' + remaining.toLocaleString('en-IN') + ')।' }, 400);
  }

  const referenceId = 'VSFEE' + Date.now().toString(36) + crypto.randomUUID().split('-').join('').slice(0, 6);
  const link = await createRazorpayPaymentLink(c, {
    amountINR: payAmt,
    description: row.title + ' — ' + row.student_name + ' (' + row.invoice_number + ')',
    referenceId,
    customerName: row.student_name,
    customerEmail: body.studentEmail || '',
    customerContact: body.studentPhone || '',
    notes: { school_id: schoolId, invoice_id: invoiceId, type: 'student_fee' },
  });
  if (link.error || !link.shortUrl) {
    return c.json({ success: false, message: link.error || 'पेमेंट लिंक बनाने में त्रुटि।' }, 400);
  }

  await db.prepare('UPDATE fee_invoices SET razorpay_payment_link_id = ?, razorpay_payment_link_url = ? WHERE id = ? AND school_id = ?')
    .bind(link.id || '', link.shortUrl, invoiceId, schoolId).run();

  return c.json({
    success: true,
    message: 'पेमेंट लिंक बन गया।',
    shortUrl: link.shortUrl,
    linkId: link.id || '',
    invoiceId,
  });
});

export default feesApp;
