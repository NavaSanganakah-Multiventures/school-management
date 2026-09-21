'use client';

import React from 'react';
import { X, Printer, IndianRupee, School, CheckCircle2 } from 'lucide-react';

interface FeeReceiptModalProps {
  invoice: any | null;
  onClose: () => void;
}

export function FeeReceiptModal({ invoice, onClose }: FeeReceiptModalProps) {
  if (!invoice) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto print:p-0 print:bg-white">
      <div className="relative w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-8 print:shadow-none print:border-none print:m-0 animate-in fade-in zoom-in-95 duration-200">
        {/* Top Controls (Hidden when printing) */}
        <div className="bg-slate-900 p-4 text-white flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm">फीस भुगतान रसीद (Fee Receipt)</span>
            <span className="text-xs bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/30">
              अधिकृत
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
            >
              <Printer className="h-4 w-4" />
              <span>प्रिंट करें</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-white/10 text-white/80 hover:text-white transition cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Printable Receipt Body */}
        <div className="p-8 space-y-6 text-slate-800 bg-white">
          {/* Header */}
          <div className="text-center pb-4 border-b-2 border-slate-900 space-y-1">
            <div className="inline-flex items-center justify-center p-2.5 bg-blue-900 text-white rounded-2xl mb-2">
              <School className="h-6 w-6" />
            </div>
            <h2 className="text-xl font-black tracking-tight text-slate-900">
              Pragnya Mitra सीनियर सेकेंडरी स्कूल
            </h2>
            <p className="text-xs text-slate-600 font-medium">
              मान्यता प्राप्त (Affiliated to CBSE/State Board) • स्कूल कोड: 26109 • सत्र: 2026-2027
            </p>
            <p className="text-[11px] text-slate-500">
              प्रशासनिक कार्यालय • संपर्क: 9876543210 • ईमेल: info@vidyasetu.edu.in
            </p>
            <div className="pt-2">
              <span className="inline-block px-4 py-1 rounded-full bg-slate-100 text-slate-900 text-xs font-black uppercase tracking-wider border border-slate-300">
                फीस पावती / रसीद (FEE RECEIPT)
              </span>
            </div>
          </div>

          {/* Receipt Meta Details */}
          <div className="grid grid-cols-2 gap-4 text-xs bg-slate-50 p-4 rounded-2xl border border-slate-200">
            <div>
              <p className="text-slate-500">रसीद / चालान सं.:</p>
              <p className="font-mono font-bold text-slate-900">{invoice.invoiceNumber}</p>
            </div>
            <div className="text-right">
              <p className="text-slate-500">दिनांक (Date):</p>
              <p className="font-bold text-slate-900">{invoice.paidAt || new Date().toISOString().split('T')[0]}</p>
            </div>
            <div>
              <p className="text-slate-500">छात्र का नाम (Student Name):</p>
              <p className="font-bold text-base text-slate-900">{invoice.studentName}</p>
            </div>
            <div className="text-right">
              <p className="text-slate-500">स्कॉलर नं. / कक्षा:</p>
              <p className="font-bold text-slate-900">
                {invoice.scholarNumber || 'N/A'} • {invoice.className} {invoice.section}
              </p>
            </div>
          </div>

          {/* Fee Item Table */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3">क्र.</th>
                  <th className="p-3">शुल्क विवरण (Description / Fee Head)</th>
                  <th className="p-3 text-right">कुल देय</th>
                  <th className="p-3 text-right">प्राप्त राशि</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="p-3 text-slate-500">1</td>
                  <td className="p-3 font-semibold text-slate-900">{invoice.title}</td>
                  <td className="p-3 text-right font-medium">₹{Number(invoice.totalAmount).toLocaleString('en-IN')}</td>
                  <td className="p-3 text-right font-bold text-emerald-700">₹{Number(invoice.paidAmount).toLocaleString('en-IN')}</td>
                </tr>
              </tbody>
              <tfoot className="bg-slate-50 font-bold border-t border-slate-200">
                <tr>
                  <td colSpan={3} className="p-3 text-right text-slate-700">कुल संकलित राशि (Total Paid):</td>
                  <td className="p-3 text-right text-emerald-800 text-sm">₹{Number(invoice.paidAmount).toLocaleString('en-IN')}</td>
                </tr>
                {invoice.totalAmount > invoice.paidAmount && (
                  <tr>
                    <td colSpan={3} className="p-2.5 text-right text-rose-600 text-xs">शेष बकाया राशि (Balance Due):</td>
                    <td className="p-2.5 text-right text-rose-700 text-xs">₹{(invoice.totalAmount - invoice.paidAmount).toLocaleString('en-IN')}</td>
                  </tr>
                )}
              </tfoot>
            </table>
          </div>

          {/* Payment Method & Transaction Info */}
          <div className="grid grid-cols-2 gap-4 text-xs text-slate-600 pt-1">
            <div>
              <p>भुगतान विधि: <strong className="text-slate-900">{invoice.paymentMethod || 'Cash / नकद'}</strong></p>
              {invoice.transactionId && <p>लेनदेन सं. (Txn ID): <strong className="font-mono text-slate-900">{invoice.transactionId}</strong></p>}
            </div>
            <div className="text-right flex items-center justify-end gap-1.5 text-emerald-700 font-bold">
              <CheckCircle2 className="h-4 w-4" />
              <span>भुगतान सत्यापित (Verified)</span>
            </div>
          </div>

          {/* Signatures */}
          <div className="pt-12 grid grid-cols-2 gap-8 text-xs border-t border-slate-200">
            <div className="text-center">
              <div className="border-t border-slate-400 w-32 mx-auto mb-1"></div>
              <p className="text-slate-500">अभिभावक / जमाकर्ता के हस्ताक्षर</p>
            </div>
            <div className="text-center">
              <div className="border-t border-slate-400 w-32 mx-auto mb-1"></div>
              <p className="text-slate-900 font-bold">अधिकृत हस्ताक्षरकर्ता (Cashier / Accountant)</p>
              <p className="text-[10px] text-slate-400">Pragnya Mitra विद्यालय</p>
            </div>
          </div>

          <div className="text-center text-[10px] text-slate-400 pt-2 border-t border-slate-100">
            * यह एक कंप्यूटर जनित अधिकृत रसीद है। किसी भी त्रुटि की स्थिति में 7 दिनों के भीतर कार्यालय से संपर्क करें।
          </div>
        </div>
      </div>
    </div>
  );
}
