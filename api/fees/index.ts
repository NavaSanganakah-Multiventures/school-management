import { Hono } from 'hono';
import { getDB } from '../db';
import { getAuthUser, getRequestSchoolId } from '../lib/auth';

const feesApp = new Hono();

function mapFee(r) {
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

  const payAmt = Number(body.amount) || (row.total_amount - row.paid_amount);
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

  if (!body.studentName || !body.totalAmount || !body.title) {
    return c.json({ success: false, message: 'छात्र का नाम, शीर्षक और कुल राशि अनिवार्य हैं।' }, 400);
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

export default feesApp;
