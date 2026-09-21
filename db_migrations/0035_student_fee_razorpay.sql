-- 0035_student_fee_razorpay.sql
-- Student fee online payment (Razorpay) integration for fee_invoices.

ALTER TABLE fee_invoices ADD COLUMN razorpay_order_id TEXT;
ALTER TABLE fee_invoices ADD COLUMN razorpay_payment_id TEXT;
ALTER TABLE fee_invoices ADD COLUMN razorpay_payment_link_id TEXT;
ALTER TABLE fee_invoices ADD COLUMN razorpay_payment_link_url TEXT;

CREATE INDEX IF NOT EXISTS idx_fee_invoices_razorpay_order ON fee_invoices(razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_fee_invoices_razorpay_link ON fee_invoices(razorpay_payment_link_id);