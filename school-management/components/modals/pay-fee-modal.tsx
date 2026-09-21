'use client';

import React, { useState } from 'react';
import { X, CreditCard, CheckCircle2, Receipt, Smartphone } from 'lucide-react';

interface PayFeeModalProps {
  invoice: any | null;
  onClose: () => void;
  onPaymentSuccess: (updatedInvoice: any) => void;
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('स्क्रिप्ट लोड नहीं हुई'));
    document.body.appendChild(s);
  });
}

export function PayFeeModal({ invoice, onClose, onPaymentSuccess }: PayFeeModalProps) {
  const [method, setMethod] = useState('UPI');
  const [isProcessing, setIsProcessing] = useState(false);
  const [receiptData, setReceiptData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  if (!invoice) return null;

  const dueAmount = invoice.totalAmount - invoice.paidAmount;

  const handlePayment = async () => {
    setIsProcessing(true);
    setError(null);
    try {
      // Cash / counter — record manually (no gateway).
      if (method === 'Cash') {
        const res = await fetch('/api/fees/pay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invoiceId: invoice.id, amount: dueAmount, paymentMethod: 'Cash' }),
        });
        const data = await res.json();
        if (data.success) {
          setReceiptData({
            ...data.invoice,
            txId: data.invoice?.transactionId || '',
            paymentMethod: data.invoice?.paymentMethod || 'Cash',
          });
          onPaymentSuccess(data.invoice);
        } else {
          setError(data.message || 'भुगतान दर्ज करने में त्रुटि हुई।');
        }
        return;
      }

      // Online (UPI / Card) — real Razorpay checkout.
      const res = await fetch('/api/fees/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: invoice.id, amount: dueAmount }),
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.order) {
        setError(data.message || 'ऑर्डर बनाने में समस्या हुई।');
        return;
      }
      const order = data.order;
      if (!order.keyId) {
        setError('Razorpay Key ID कॉन्फ़िगर नहीं है। व्यवस्थापक से संपर्क करें।');
        return;
      }
      if (!(window as any).Razorpay) {
        await loadScript('https://checkout.razorpay.com/v1/checkout.js');
      }

      await new Promise<void>((resolve, reject) => {
        const rzp = new (window as any).Razorpay({
          key: order.keyId,
          amount: Math.round(order.amount * 100),
          currency: 'INR',
          name: 'Pragnya Mitra',
          description: invoice.title,
          order_id: order.id,
          theme: { color: '#1e3a8a' },
          handler: async (response: any) => {
            try {
              const vRes = await fetch('/api/fees/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                }),
              });
              const vData = await vRes.json();
              if (vData.success) {
                setReceiptData({
                  ...vData.invoice,
                  txId: vData.invoice?.transactionId || response.razorpay_payment_id,
                  paymentMethod: method,
                });
                onPaymentSuccess(vData.invoice);
                resolve();
              } else {
                setError(vData.message || 'पेमेंट वेरिफिकेशन विफल।');
                reject(new Error(vData.message || 'verification failed'));
              }
            } catch (e) {
              setError('पेमेंट सत्यापन में समस्या हुई।');
              reject(e);
            }
          },
          modal: {
            ondismiss: () => {
              setError('भुगतान रद्द कर दिया गया।');
              reject(new Error('cancelled'));
            },
          },
        });
        rzp.open();
      });
    } catch (e: any) {
      if (e && e.message !== 'cancelled') {
        setError('चेकआउट खोलने में समस्या हुई। कृपया पुनः प्रयास करें।');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-5 py-3.5 bg-gradient-to-r from-emerald-700 to-teal-800 text-white">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            <h3 className="font-semibold text-base">फीस भुगतान पोर्टल (Fee Payment)</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-white/20">
            <X className="h-5 w-5" />
          </button>
        </div>

        {receiptData ? (
          <div className="p-6 space-y-4">
            <div className="text-center space-y-1">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <h4 className="text-base font-bold text-slate-800">भुगतान सफल रहा!</h4>
              <p className="text-xs text-slate-500">रसीद जनरेट हो गई है एवं ईमेल रसीद भेजी गई है।</p>
            </div>

            <div className="p-4 bg-slate-50 border border-dashed border-slate-300 rounded-xl space-y-2 text-xs">
              <div className="flex justify-between border-b pb-1.5 font-mono">
                <span className="text-slate-500">रसीद नं:</span>
                <span className="font-semibold text-slate-800">{receiptData.invoiceNumber}</span>
              </div>
              <div className="flex justify-between border-b pb-1.5">
                <span className="text-slate-500">विद्यार्थी:</span>
                <span className="font-medium text-slate-800">{receiptData.studentName} ({receiptData.className})</span>
              </div>
              <div className="flex justify-between border-b pb-1.5">
                <span className="text-slate-500">भुगतान माध्यम:</span>
                <span className="font-medium text-slate-800">{receiptData.paymentMethod}</span>
              </div>
              <div className="flex justify-between border-b pb-1.5">
                <span className="text-slate-500">लेन-देन ID:</span>
                <span className="font-mono text-slate-800">{receiptData.txId}</span>
              </div>
              <div className="flex justify-between pt-1 text-sm font-bold text-emerald-800">
                <span>कुल भुगतान राशि:</span>
                <span>₹{dueAmount.toLocaleString('en-IN')}</span>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-full py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-lg shadow-sm"
            >
              समाप्त करें (Done)
            </button>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl">
              <p className="text-xs text-emerald-900 font-medium">{invoice.title}</p>
              <p className="text-xs text-slate-600 mt-1">छात्र: <strong className="text-slate-800">{invoice.studentName}</strong> | {invoice.className}</p>
              <div className="flex items-baseline justify-between mt-2 pt-2 border-t border-emerald-200/60">
                <span className="text-xs text-slate-600">देय बकाया राशि:</span>
                <span className="text-xl font-bold text-emerald-800">₹{dueAmount.toLocaleString('en-IN')}</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">भुगतान विधि चुनें</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'UPI', label: 'UPI / QR', icon: Smartphone },
                  { id: 'Card', label: 'डेबिट / क्रेडिट कार्ड', icon: CreditCard },
                  { id: 'Cash', label: 'कैश / काउंटर', icon: Receipt },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMethod(m.id)}
                    className={`p-2.5 rounded-xl border text-center flex flex-col items-center gap-1 transition-all ${
                      method === m.id
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-800 ring-1 ring-emerald-600'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <m.icon className="h-4 w-4" />
                    <span className="text-[11px] font-medium leading-tight">{m.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
                {error}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                रद्द करें
              </button>
              <button
                type="button"
                onClick={handlePayment}
                disabled={isProcessing}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg shadow-sm disabled:opacity-50"
              >
                <CreditCard className="h-3.5 w-3.5" />
                {isProcessing ? 'प्रोसेसिंग...' : `₹${dueAmount.toLocaleString('en-IN')} भुगतान करें`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
