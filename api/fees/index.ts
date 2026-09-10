import { Hono } from 'hono';
import { feeInvoices, FeeInvoice, studentScholars } from '../db';

const feesApp = new Hono();

// GET /api/fees - फीस चालान और संकलन सारांश
feesApp.get('/', (c) => {
  const status = c.req.query('status');
  const search = c.req.query('q')?.toLowerCase();

  let list = [...feeInvoices];

  if (status && status !== 'All') {
    list = list.filter((f) => f.status.toLowerCase() === status.toLowerCase());
  }

  if (search) {
    list = list.filter(
      (f) =>
        f.studentName.toLowerCase().includes(search) ||
        f.invoiceNumber.toLowerCase().includes(search) ||
        f.scholarNumber.toLowerCase().includes(search)
    );
  }

  const totalCollected = feeInvoices.reduce((acc, curr) => acc + curr.paidAmount, 0);
  const totalReceivable = feeInvoices.reduce((acc, curr) => acc + curr.totalAmount, 0);
  const totalPending = totalReceivable - totalCollected;

  return c.json({
    success: true,
    summary: {
      totalReceivable,
      totalCollected,
      totalPending,
      invoiceCount: feeInvoices.length,
    },
    invoices: list,
  });
});

// POST /api/fees/pay - फीस भुगतान दर्ज करना
feesApp.post('/pay', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { invoiceId, amount, paymentMethod, transactionId } = body;

  const invoice = feeInvoices.find((f) => f.id === invoiceId);
  if (!invoice) {
    return c.json({ success: false, message: 'चालान नहीं मिला।' }, 404);
  }

  const payAmt = Number(amount) || invoice.totalAmount - invoice.paidAmount;
  invoice.paidAmount = Math.min(invoice.totalAmount, invoice.paidAmount + payAmt);
  invoice.status = invoice.paidAmount >= invoice.totalAmount ? 'Paid' : 'Partial';
  invoice.paymentMethod = paymentMethod || 'Cash';
  invoice.transactionId = transactionId || `TXN-${Date.now().toString().slice(-8)}`;
  invoice.paidAt = new Date().toISOString().split('T')[0];

  return c.json({
    success: true,
    message: `₹${payAmt.toLocaleString('en-IN')} का भुगतान सफलतापूर्वक दर्ज किया गया। रसीद सं: ${invoice.invoiceNumber}`,
    invoice,
  });
});

// POST /api/fees/create-invoice - नया चालान जारी करना
feesApp.post('/create-invoice', async (c) => {
  const body = await c.req.json().catch(() => ({}));

  if (!body.studentName || !body.totalAmount || !body.title) {
    return c.json({ success: false, message: 'छात्र का नाम, शीर्षक और कुल राशि अनिवार्य हैं।' }, 400);
  }

  const student = studentScholars.find((s) => s.id === body.studentId);

  const newInvoice: FeeInvoice = {
    id: `fee-${Date.now()}`,
    invoiceNumber: `INV-${new Date().getFullYear()}/${String(feeInvoices.length + 1).padStart(3, '0')}`,
    studentId: body.studentId || (student ? student.id : `std-${Date.now()}`),
    studentName: body.studentName,
    scholarNumber: body.scholarNumber || student?.scholarNumber || 'SR-2026/NEW',
    className: body.className || student?.className || 'Class 10',
    section: body.section || student?.section || 'A',
    title: body.title,
    totalAmount: Number(body.totalAmount),
    paidAmount: 0,
    dueDate: body.dueDate || '2026-10-15',
    status: 'Unpaid',
  };

  feeInvoices.unshift(newInvoice);

  return c.json({
    success: true,
    message: `चालान ${newInvoice.invoiceNumber} जारी किया गया।`,
    invoice: newInvoice,
  }, 201);
});

export default feesApp;
