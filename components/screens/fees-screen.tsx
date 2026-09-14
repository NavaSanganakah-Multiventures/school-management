'use client';

import React, { useState, useEffect } from 'react';
import { IndianRupee, CheckCircle2, Clock, AlertCircle, Plus, Printer } from 'lucide-react';
import { PayFeeModal } from '../modals/pay-fee-modal';
import { CreateFeeModal } from '../modals/create-fee-modal';
import { FeeReceiptModal } from '../modals/fee-receipt-modal';

export function FeesScreen() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [summary, setSummary] = useState({ totalReceivable: 0, totalCollected: 0, totalPending: 0 });
  const [filter, setFilter] = useState('All');
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activePayInvoice, setActivePayInvoice] = useState<any | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [receiptInvoice, setReceiptInvoice] = useState<any | null>(null);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/fees?status=${filter}`);
        const data = await res.json();
        if (isMounted && data.success) {
          setInvoices(data.invoices);
          setSummary(data.summary);
        }
      } catch {
        //
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    load();
    return () => {
      isMounted = false;
    };
  }, [filter, refreshKey]);

  return (
    <div className="space-y-4 pb-12">
      {/* Fees Summary Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
          <span className="text-xs text-blue-700 font-medium">कुल देय फीस (Total Dues)</span>
          <h3 className="text-xl font-bold text-blue-950 mt-1">₹{summary.totalReceivable?.toLocaleString('en-IN')}</h3>
          <p className="text-[11px] text-blue-600 mt-0.5">सत्र 2026-27</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <span className="text-xs text-emerald-700 font-medium">प्राप्त फीस (Collected)</span>
          <h3 className="text-xl font-bold text-emerald-950 mt-1">₹{summary.totalCollected?.toLocaleString('en-IN')}</h3>
          <p className="text-[11px] text-emerald-600 mt-0.5">सफलतापूर्वक संकलित</p>
        </div>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <span className="text-xs text-rose-700 font-medium">लंबित फीस (Pending)</span>
          <h3 className="text-xl font-bold text-rose-950 mt-1">₹{summary.totalPending?.toLocaleString('en-IN')}</h3>
          <p className="text-[11px] text-rose-600 mt-0.5">देय तिथि निकट</p>
        </div>
      </div>

      {/* Filter Chips & Action Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {['All', 'Paid', 'Partial', 'Unpaid'].map((st) => (
            <button
              key={st}
              onClick={() => setFilter(st)}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-all shrink-0 cursor-pointer ${
                filter === st
                  ? 'bg-blue-900 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {st === 'All' ? 'सभी चालान' : st === 'Paid' ? 'भुगतान पूर्ण' : st === 'Partial' ? 'आंशिक' : 'बकाया'}
            </button>
          ))}
        </div>

        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-bold shadow-sm transition active:scale-95 cursor-pointer shrink-0"
        >
          <Plus className="h-4 w-4" />
          <span>+ नया फीस चालान जारी करें</span>
        </button>
      </div>

      {/* Invoices List */}
      <div className="space-y-3">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">फीस चालान लोड हो रहे हैं...</div>
        ) : invoices.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-xs">
            <IndianRupee className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-700">वर्तमान में कोई फीस चालान नहीं है</p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              सत्र में अभी कोई बकाया या भुगतान चालान दर्ज नहीं है। नया चालान बनाने के लिए ऊपर <strong>&quot;+ नया फीस चालान जारी करें&quot;</strong> बटन का उपयोग करें।
            </p>
          </div>
        ) : (
          invoices.map((inv) => {
            const dueAmt = inv.totalAmount - inv.paidAmount;
            return (
              <div
                key={inv.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs hover:shadow-xs transition-all space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-slate-700">{inv.invoiceNumber}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          inv.status === 'Paid'
                            ? 'bg-emerald-100 text-emerald-800'
                            : inv.status === 'Partial'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {inv.status === 'Paid' ? 'भुगतान पूर्ण' : inv.status === 'Partial' ? 'आंशिक भुगतान' : 'बकाया'}
                      </span>
                    </div>
                    <h3 className="font-semibold text-sm text-slate-900 mt-1">{inv.title}</h3>
                    <p className="text-xs text-slate-500">{inv.studentName} • {inv.className} {inv.section ? `(${inv.section})` : ''}</p>
                  </div>

                  <div className="text-right">
                    <span className="text-xs text-slate-500">कुल राशि</span>
                    <h4 className="text-base font-bold text-slate-900">₹{inv.totalAmount.toLocaleString('en-IN')}</h4>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-600">
                  <div>
                    <span>अंतिम तिथि: <strong>{inv.dueDate}</strong></span>
                    {inv.paidAt && <span className="ml-3 text-emerald-600">भुगतान तिथि: {inv.paidAt}</span>}
                  </div>

                  <div className="flex items-center gap-2">
                    {inv.paidAmount > 0 && (
                      <button
                        onClick={() => setReceiptInvoice(inv)}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition cursor-pointer"
                        title="रसीद प्रिंट करें"
                      >
                        <Printer className="h-3.5 w-3.5 text-slate-600" />
                        <span>रसीद प्रिंट</span>
                      </button>
                    )}

                    {inv.status !== 'Paid' ? (
                      <button
                        onClick={() => setActivePayInvoice(inv)}
                        className="px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-lg shadow-xs active:scale-95 transition-all cursor-pointer"
                      >
                        ₹{dueAmt.toLocaleString('en-IN')} जमा करें
                      </button>
                    ) : (
                      <span className="flex items-center gap-1 text-emerald-700 font-semibold text-xs py-1">
                        <CheckCircle2 className="h-4 w-4" /> भुगतान पूर्ण
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pay Modal */}
      <PayFeeModal
        invoice={activePayInvoice}
        onClose={() => setActivePayInvoice(null)}
        onPaymentSuccess={() => {
          setRefreshKey((k) => k + 1);
        }}
      />

      {/* Create Fee Modal */}
      <CreateFeeModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => {
          setRefreshKey((k) => k + 1);
        }}
      />

      {/* Printable Fee Receipt Modal */}
      <FeeReceiptModal
        invoice={receiptInvoice}
        onClose={() => setReceiptInvoice(null)}
      />
    </div>
  );
}
