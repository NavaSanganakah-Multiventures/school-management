'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { CreditCard, AlertTriangle, CheckCircle2, Loader2, ReceiptText, ShieldCheck } from 'lucide-react';

interface Plan {
  id: string;
  name: string;
  tagline: string;
  badge?: string;
  recommended?: boolean;
  monthlyPrice: number;
  quarterlyPrice: number;
  annualPrice: number;
  maxStudents: string;
  features: string[];
}

interface Invoice {
  id: string;
  invoice_number: string;
  plan_name: string;
  billing_cycle: string;
  total_amount: number;
  payment_status: string;
  invoice_date: string;
  paid_at: string;
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

export function BillingPlansScreen(_props: { userRole: string; onOpenFcmModal?: () => void }) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [cycles, setCycles] = useState<{ id: string; label: string; discount: number; tag: string }[]>([]);
  const [cycle, setCycle] = useState('annual');
  const [subscription, setSubscription] = useState<any>(null);
  const [planId, setPlanId] = useState('trial');
  const [trialEndsAt, setTrialEndsAt] = useState('');
  const [isTrialExpired, setIsTrialExpired] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [emailQuota, setEmailQuota] = useState<{ limit: number | null; used: number; remaining: number | null; resetAt: string } | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [subRes, plansRes, invRes, quotaRes] = await Promise.all([
        fetch('/api/billing/subscription').then((r) => r.json()),
        fetch('/api/billing/plans').then((r) => r.json()),
        fetch('/api/billing/invoices').then((r) => r.json()),
        fetch('/api/email/quota').then((r) => r.json()).catch(() => ({})),
      ]);
      if (subRes.success) {
        setSubscription(subRes.subscription || null);
        setPlanId(subRes.planId || 'trial');
        setTrialEndsAt(subRes.trialEndsAt || '');
        setIsTrialExpired(!!subRes.isTrialExpired);
      }
      if (plansRes.success) {
        setPlans((plansRes.plans || []).filter((p: Plan) => p.id !== 'trial'));
        setCycles(plansRes.billingCycles || []);
      }
      if (invRes.success) setInvoices(invRes.invoices || []);
      if (quotaRes && quotaRes.success) setEmailQuota(quotaRes.quota || null);
    } catch (e) {
      setMessage({ type: 'error', text: 'बिलिंग डेटा लोड करने में समस्या हुई।' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const priceFor = (plan: Plan) => {
    if (cycle === 'quarterly') return plan.quarterlyPrice;
    if (cycle === 'monthly') return plan.monthlyPrice;
    return plan.annualPrice;
  };

  const startCheckout = async (plan: Plan) => {
    setBuying(true);
    setMessage(null);
    try {
      const res = await fetch('/api/billing/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: plan.id, billingCycle: cycle }),
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.order) {
        setMessage({ type: 'error', text: data.message || 'ऑर्डर बनाने में समस्या हुई।' });
        return;
      }
      const order = data.order;
      if (!order.keyId) {
        setMessage({ type: 'error', text: 'Razorpay Key ID कॉन्फ़िगर नहीं है। व्यवस्थापक से संपर्क करें।' });
        return;
      }
      if (!(window as any).Razorpay) {
        await loadScript('https://checkout.razorpay.com/v1/checkout.js');
      }
      const options = {
        key: order.keyId,
        amount: Math.round(order.amount * 100),
        currency: 'INR',
        name: 'VidyaSetu',
        description: plan.name + ' (' + cycle + ')',
        order_id: order.id,
        theme: { color: '#1e3a8a' },
        handler: async function (response: any) {
          try {
            const vRes = await fetch('/api/billing/razorpay/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                planId: plan.id,
                billingCycle: cycle,
              }),
            });
            const vData = await vRes.json();
            if (vData.success) {
              setMessage({ type: 'success', text: vData.message });
              await loadData();
            } else {
              setMessage({ type: 'error', text: vData.message || 'पेमेंट वेरिफिकेशन विफल।' });
            }
          } catch (e) {
            setMessage({ type: 'error', text: 'पेमेंट सत्यापन में समस्या हुई।' });
          }
        },
      };
      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    } catch (e) {
      setMessage({ type: 'error', text: 'चेकआउट खोलने में समस्या हुई।' });
    } finally {
      setBuying(false);
    }
  };

  const isExpired = isTrialExpired || (subscription && subscription.status === 'Expired');
  const statusLabel = subscription && subscription.status === 'Active'
    ? 'सक्रिय (पेड प्लान)'
    : isExpired
    ? '⚠️ ट्रायल समाप्त (Expired)'
    : 'ट्रायल';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-black text-slate-900 flex items-center gap-2"><CreditCard className="w-6 h-6 text-blue-700" /> प्लान व बिलिंग</h2>
        <p className="text-sm text-slate-500">असली Razorpay भुगतान से प्लान खरीदें व अपग्रेड करें</p>
      </div>

      {message && (
        <div className={'p-3 rounded-xl border text-xs ' + (message.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-700')}>{message.text}</div>
      )}

      {isExpired && (
        <div className="p-4 rounded-2xl bg-rose-50 border-2 border-rose-300 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-rose-100 text-rose-700 shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-rose-950">
                ⚠️ आपके स्कूल का 7-दिन का फ्री ट्रायल समाप्त हो गया है!
              </div>
              <div className="text-xs text-rose-800 mt-0.5 leading-relaxed">
                छात्र, उपस्थिति, फीस और अन्य सभी शैक्षणिक सेवाएं अस्थायी रूप से रुकी हुई हैं। आपका समस्त स्कूल डेटा पूरी तरह सुरक्षित है। स्कूल का संचालन तुरंत बहाल करने के लिए कृपया नीचे दिया गया कोई एक प्लान चुनें और भुगतान पूरा करें।
              </div>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400 gap-2"><Loader2 className="w-5 h-5 animate-spin" /> लोड हो रहा है...</div>
      ) : (
        <>
          {/* Current subscription card */}
          <div className={'p-5 rounded-2xl bg-white border shadow-xs ' + (isExpired ? 'border-rose-300 ring-1 ring-rose-300' : 'border-slate-200')}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-slate-500 uppercase">वर्तमान सदस्यता</div>
                <div className="text-lg font-black text-slate-900">{subscription ? subscription.planName : '7-दिन फ्री ट्रायल'}</div>
                <div className="text-xs text-slate-500">स्थिति: <span className={'font-bold ' + (subscription && subscription.status === 'Active' ? 'text-emerald-700' : 'text-amber-700')}>{statusLabel}</span></div>
                {trialEndsAt && <div className="text-xs text-amber-700 font-semibold mt-1">ट्रायल समाप्ति: {trialEndsAt}</div>}
                {emailQuota && (
                  <div className="mt-3">
                    <div className="text-[11px] font-bold text-slate-500">ईमेल कोटा (इस माह): {emailQuota.used}{emailQuota.limit === null ? ' / असीमित' : ' / ' + emailQuota.limit}</div>
                    <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                      {emailQuota.limit === null ? (
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: '100%' }} />
                      ) : (
                        <div className="h-full bg-blue-600 rounded-full" style={{ width: Math.min(100, Math.round((emailQuota.used / Math.max(1, emailQuota.limit)) * 100)) + '%' }} />
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">{emailQuota.limit === null ? 'असीमित ईमेल भेज सकते हैं' : (emailQuota.remaining === null ? '' : emailQuota.remaining + ' ईमेल शेष')}</div>
                  </div>
                )}
              </div>
              {planId === 'trial' && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                  <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5" />
                  <span>अभी सीमित ट्रायल एक्सेस है। पूर्ण सुविधाओं के लिए नीचे से प्लान खरीदें।</span>
                </div>
              )}
            </div>
          </div>

          {/* Billing cycle selector */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-500 mr-1">बिलिंग अवधि:</span>
            {cycles.map((c) => (
              <button key={c.id} onClick={() => setCycle(c.id)} className={'px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ' + (cycle === c.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50')}>
                {c.label} {c.tag ? '(' + c.tag + ')' : ''}
              </button>
            ))}
          </div>

          {/* Plans */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {plans.map((plan) => {
              const price = priceFor(plan);
              const isCurrent = subscription && subscription.planId === plan.id && subscription.status !== 'Trial';
              return (
                <div key={plan.id} className={'p-5 rounded-2xl border shadow-xs flex flex-col ' + (plan.recommended ? 'border-blue-300 bg-blue-50/40 ring-2 ring-blue-200' : 'bg-white border-slate-200')}>
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-black text-slate-900">{plan.name}</h3>
                    {plan.badge && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">{plan.badge}</span>}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{plan.tagline}</p>
                  <div className="mt-4 text-2xl font-black text-slate-900">₹{price.toLocaleString('en-IN')}</div>
                  <div className="text-[11px] text-slate-500">{cycle === 'annual' ? 'प्रति वर्ष' : cycle === 'quarterly' ? 'प्रति तिमाही' : 'प्रति माह'} • {plan.maxStudents}</div>
                  <ul className="mt-4 space-y-1.5 text-xs text-slate-600 grow">
                    {plan.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />{f}</li>
                    ))}
                  </ul>
                  <button onClick={() => startCheckout(plan)} disabled={buying || isCurrent} className={'mt-4 w-full py-2.5 rounded-xl text-sm font-bold transition cursor-pointer disabled:opacity-50 ' + (plan.recommended ? 'bg-blue-700 hover:bg-blue-800 text-white' : 'bg-white border border-slate-300 hover:bg-slate-50 text-slate-800')}>
                    {isCurrent ? 'वर्तमान प्लान' : buying ? 'प्रोसेस हो रहा है...' : 'खरीदें / अपग्रेड करें'}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Invoices */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs">
            <h3 className="text-sm font-black text-slate-900 mb-3 flex items-center gap-2"><ReceiptText className="w-4 h-4 text-slate-500" /> भुगतान इनवॉइस</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-100">
                    <th className="py-2 pr-3 font-bold">इनवॉइस सं.</th>
                    <th className="py-2 px-3 font-bold">प्लान</th>
                    <th className="py-2 px-3 font-bold">अवधि</th>
                    <th className="py-2 px-3 font-bold">राशि</th>
                    <th className="py-2 px-3 font-bold">स्थिति</th>
                    <th className="py-2 px-3 font-bold">तारीख</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-slate-400">अभी कोई इनवॉइस नहीं है।</td></tr>}
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="border-b border-slate-50">
                      <td className="py-3 pr-3 font-mono text-slate-700">{inv.invoice_number}</td>
                      <td className="py-3 px-3 text-slate-700">{inv.plan_name}</td>
                      <td className="py-3 px-3 text-slate-500">{inv.billing_cycle}</td>
                      <td className="py-3 px-3 font-bold text-slate-900">₹{(inv.total_amount || 0).toLocaleString('en-IN')}</td>
                      <td className="py-3 px-3"><span className={'px-2 py-0.5 rounded-full text-[10px] font-bold ' + (inv.payment_status === 'Paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>{inv.payment_status === 'Paid' ? 'भुगतान हो गया' : 'प्रोसेसिंग'}</span></td>
                      <td className="py-3 px-3 text-slate-500">{inv.invoice_date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[11px] text-slate-400 flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> भुगतान Razorpay सुरक्षित गेटवे द्वारा संसाधित होते हैं।</p>
          </div>
        </>
      )}
    </div>
  );
}
