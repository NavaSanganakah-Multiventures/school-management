'use client';

import React, { useState, useEffect } from 'react';
import {
  Zap,
  CheckCircle2,
  ShieldCheck,
  CreditCard,
  RefreshCw,
  Mail,
  Globe,
  Radio,
  FileText,
  AlertCircle,
  Clock,
  Sparkles,
  Building2,
  Lock,
  Send,
  Plus,
  ArrowRight,
  Receipt,
  Download,
  Check,
} from 'lucide-react';

interface BillingPlansScreenProps {
  userRole: string;
  onOpenFcmModal?: () => void;
}

export function BillingPlansScreen({ userRole, onOpenFcmModal }: BillingPlansScreenProps) {
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<any[]>([]);
  const [selectedCycle, setSelectedCycle] = useState<'monthly' | 'quarterly' | 'annual'>('annual');
  const [subscription, setSubscription] = useState<any>(null);
  const [emailServices, setEmailServices] = useState<any>(null);
  const [customDomain, setCustomDomain] = useState<any>(null);
  const [dnsRecords, setDnsRecords] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [schoolTopics, setSchoolTopics] = useState<any[]>([]);
  const [schools, setSchools] = useState<any[]>([]);
  const [currentSchoolId, setCurrentSchoolId] = useState('school-01');

  // Modals & Action States
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [isAutoPayModalOpen, setIsAutoPayModalOpen] = useState(false);
  const [newMailboxPrefix, setNewMailboxPrefix] = useState('');
  const [isAddingMailbox, setIsAddingMailbox] = useState(false);
  const [purchasingAddon, setPurchasingAddon] = useState(false);
  const [switchingPlan, setSwitchingPlan] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);

  // Auto-Pay form
  const [autoPayMethod, setAutoPayMethod] = useState('UPI AutoPay');
  const [autoPayBank, setAutoPayBank] = useState('State Bank of India (SBI)');

  const fetchAllBillingData = async () => {
    try {
      const [plansRes, subRes, addonsRes, domainRes, invRes, topicsRes, schoolsRes] = await Promise.all([
        fetch('/api/billing/plans').then((r) => r.json()),
        fetch('/api/billing/subscription').then((r) => r.json()),
        fetch('/api/billing/addons').then((r) => r.json()),
        fetch('/api/billing/domain').then((r) => r.json()),
        fetch('/api/billing/invoices').then((r) => r.json()),
        fetch('/api/notifications/topics').then((r) => r.json()),
        fetch('/api/billing/schools').then((r) => r.json()),
      ]);

      if (plansRes.success) setPlans(plansRes.plans);
      if (subRes.success) {
        setSubscription(subRes.subscription);
        if (subRes.subscription.billingCycle) {
          setSelectedCycle(subRes.subscription.billingCycle);
        }
      }
      if (addonsRes.success) setEmailServices(addonsRes.emailServices);
      if (domainRes.success) {
        setCustomDomain(domainRes.domain);
        setDnsRecords(domainRes.dnsVerificationRecords || []);
      }
      if (invRes.success) setInvoices(invRes.invoices);
      if (topicsRes.success) setSchoolTopics(topicsRes.topics);
      if (schoolsRes.success) {
        setSchools(schoolsRes.schools);
        setCurrentSchoolId(schoolsRes.currentSchoolId);
      }
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const [plansRes, subRes, addonsRes, domainRes, invRes, topicsRes, schoolsRes] = await Promise.all([
          fetch('/api/billing/plans').then((r) => r.json()),
          fetch('/api/billing/subscription').then((r) => r.json()),
          fetch('/api/billing/addons').then((r) => r.json()),
          fetch('/api/billing/domain').then((r) => r.json()),
          fetch('/api/billing/invoices').then((r) => r.json()),
          fetch('/api/notifications/topics').then((r) => r.json()),
          fetch('/api/billing/schools').then((r) => r.json()),
        ]);

        if (!isMounted) return;
        if (plansRes.success) setPlans(plansRes.plans);
        if (subRes.success) {
          setSubscription(subRes.subscription);
          if (subRes.subscription.billingCycle) {
            setSelectedCycle(subRes.subscription.billingCycle);
          }
        }
        if (addonsRes.success) setEmailServices(addonsRes.emailServices);
        if (domainRes.success) {
          setCustomDomain(domainRes.domain);
          setDnsRecords(domainRes.dnsVerificationRecords || []);
        }
        if (invRes.success) setInvoices(invRes.invoices);
        if (topicsRes.success) setSchoolTopics(topicsRes.topics);
        if (schoolsRes.success) {
          setSchools(schoolsRes.schools);
          setCurrentSchoolId(schoolsRes.currentSchoolId);
        }
      } catch {
        // Fallback
      } finally {
        if (isMounted) setLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  const handlePlanChange = async (planId: string) => {
    setSwitchingPlan(true);
    try {
      const res = await fetch('/api/billing/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId,
          billingCycle: selectedCycle,
          autoPayEnabled: subscription?.autoPayEnabled ?? true,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setActionMessage({ text: data.message, type: 'success' });
        setSubscription(data.currentSubscription);
        if (data.invoice) {
          setInvoices((prev) => [data.invoice, ...prev]);
        }
      } else {
        setActionMessage({ text: data.message || 'त्रुटि हुई।', type: 'error' });
      }
    } catch {
      setActionMessage({ text: 'नेटवर्क अनुरोध में त्रुटि हुई।', type: 'error' });
    } finally {
      setSwitchingPlan(false);
      setTimeout(() => setActionMessage(null), 5000);
    }
  };

  const handleToggleAutoPay = async (newStatus: boolean) => {
    try {
      const res = await fetch('/api/billing/autopay/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enable: newStatus,
          paymentMethod: autoPayMethod,
          bankName: autoPayBank,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setActionMessage({ text: data.message, type: 'success' });
        setSubscription((prev: any) => ({
          ...prev,
          autoPayEnabled: newStatus,
          paymentMethod: autoPayMethod,
          mandateBank: autoPayBank,
        }));
        setIsAutoPayModalOpen(false);
      }
    } catch {
      setActionMessage({ text: 'ऑटो-पे स्थिति अपडेट करने में त्रुटि हुई।', type: 'error' });
    } finally {
      setTimeout(() => setActionMessage(null), 5000);
    }
  };

  const handleAddMailbox = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMailboxPrefix) return;
    setIsAddingMailbox(true);
    try {
      const res = await fetch('/api/billing/domain/add-mailbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix: newMailboxPrefix }),
      });
      const data = await res.json();
      if (data.success) {
        setActionMessage({ text: data.message, type: 'success' });
        setCustomDomain((prev: any) => ({
          ...prev,
          configuredMailboxes: data.mailboxes,
        }));
        setNewMailboxPrefix('');
      } else {
        setActionMessage({ text: data.message || 'त्रुटि हुई।', type: 'error' });
      }
    } catch {
      setActionMessage({ text: 'मेलबॉक्स जोड़ने में त्रुटि।', type: 'error' });
    } finally {
      setIsAddingMailbox(false);
      setTimeout(() => setActionMessage(null), 4000);
    }
  };

  const handlePurchaseQuota = async () => {
    setPurchasingAddon(true);
    try {
      const res = await fetch('/api/billing/addons/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addonType: 'custom_domain_email', quantity: 1 }),
      });
      const data = await res.json();
      if (data.success) {
        setActionMessage({ text: data.message, type: 'success' });
        setCustomDomain((prev: any) => ({
          ...prev,
          monthlySendingQuota: data.quota.monthlyLimit,
        }));
      }
    } catch {
      setActionMessage({ text: 'ऐड-ऑन जोड़ने में त्रुटि।', type: 'error' });
    } finally {
      setPurchasingAddon(false);
      setTimeout(() => setActionMessage(null), 4000);
    }
  };

  const handleSwitchSchool = async (schoolId: string) => {
    try {
      const res = await fetch('/api/billing/schools/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schoolId }),
      });
      const data = await res.json();
      if (data.success) {
        setCurrentSchoolId(schoolId);
        setActionMessage({ text: data.message, type: 'success' });
        // Refetch topics for new school
        const tRes = await fetch(`/api/notifications/topics?schoolId=${schoolId}`).then((r) => r.json());
        if (tRes.success) setSchoolTopics(tRes.topics);
      }
    } catch {}
    setTimeout(() => setActionMessage(null), 4000);
  };

  if (userRole !== 'Director') {
    return (
      <div className="p-8 text-center bg-white border border-slate-200 rounded-2xl shadow-xs">
        <Lock className="h-10 w-10 text-amber-500 mx-auto mb-3" />
        <h3 className="text-base font-bold text-slate-800">निदेशक अनुमतियाँ आवश्यक</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
          एंटरप्राइज प्लान अपग्रेड/डाउनग्रेड, ऑटो-पे प्रबंधन एवं ऑफिशियल डोमेन ईमेल केवल स्कूल निदेशक (Director) के अधिकार क्षेत्र में है।
        </p>
      </div>
    );
  }

  const currentPlan = plans.find((p) => p.id === subscription?.planId) || plans[2];
  const currentSchool = schools.find((s) => s.id === currentSchoolId) || schools[0];

  return (
    <div className="space-y-6 pb-12">
      {/* Action Notification Toast */}
      {actionMessage && (
        <div
          className={`fixed top-5 right-5 z-50 p-4 rounded-xl shadow-lg border flex items-center gap-3 transition-all animate-in slide-in-from-top-4 ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          {actionMessage.type === 'success' ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
          )}
          <span className="text-xs font-semibold">{actionMessage.text}</span>
        </div>
      )}

      {/* Top Banner: Multi-Tenancy School Isolation Context */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-5 text-white shadow-md border border-slate-800 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 text-[10px] font-bold border border-amber-500/30 flex items-center gap-1">
              <ShieldCheck className="h-3 w-3" /> मल्टी-स्कूल टेनेंट अलगाव (100% डेटा पृथक्करण)
            </span>
            <span className="text-[11px] text-slate-400">ID: {currentSchoolId}</span>
          </div>
          <h2 className="text-lg lg:text-xl font-bold flex items-center gap-2">
            <Building2 className="h-5 w-5 text-amber-400" />
            {currentSchool?.schoolName || 'विद्या सेतु पब्लिक सीनियर सेकेंडरी स्कूल'}
          </h2>
          <p className="text-xs text-slate-300 mt-1 max-w-xl">
            एंटरप्राइज बिलिंग, रिकरिंग ऑटो-पे, डोमेन-विशिष्ट ईमेल सेवा एवं पृथक स्कूल FCM टॉपिक्स कंट्रोल कंसोल।
          </p>
        </div>

        {/* School Switcher to prove data isolation */}
        <div className="bg-white/10 p-2.5 rounded-xl border border-white/15 shrink-0">
          <label className="block text-[10px] font-bold text-slate-300 mb-1">
            वर्तमान विद्यालय बदलें (Multi-School Switch):
          </label>
          <select
            value={currentSchoolId}
            onChange={(e) => handleSwitchSchool(e.target.value)}
            className="bg-slate-900 border border-slate-700 text-white text-xs px-2.5 py-1.5 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-400 cursor-pointer"
          >
            {schools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.schoolName} ({s.id})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Current Subscription & Auto-Pay Status Card */}
      {subscription && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Active Plan Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-amber-100 rounded-bl-full opacity-40 pointer-events-none" />
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">वर्तमान सक्रिय प्लान</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> सक्रिय (Active)
              </span>
            </div>
            <h3 className="text-base font-extrabold text-slate-900">{subscription.planName}</h3>
            <p className="text-xs text-slate-500 mt-1">
              बिलिंग चक्र:{' '}
              <span className="font-bold text-slate-700">
                {subscription.billingCycle === 'annual'
                  ? 'वार्षिक (20% महाबचत)'
                  : subscription.billingCycle === 'quarterly'
                  ? 'त्रैमासिक (5% छूट)'
                  : 'मासिक (Monthly)'}
              </span>
            </p>
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-slate-900">
                ₹{subscription.pricePerCycle.toLocaleString('en-IN')}
              </span>
              <span className="text-xs text-slate-500">/{subscription.billingCycle}</span>
            </div>
          </div>

          {/* Auto-Pay Status Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">ऑटो-पे मैंडेट स्थिति</span>
              <button
                onClick={() => setIsAutoPayModalOpen(true)}
                className="text-[11px] font-bold text-amber-700 hover:text-amber-800 underline cursor-pointer"
              >
                सेटिंग्स बदलें
              </button>
            </div>
            <div className="flex items-center gap-2.5">
              <div
                className={`h-9 w-9 rounded-xl flex items-center justify-center ${
                  subscription.autoPayEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                }`}
              >
                <CreditCard className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">
                  {subscription.autoPayEnabled ? 'ऑटो-पे सक्रिय (Auto-Pay Active)' : 'मैन्युअल भुगतान (Manual)'}
                </h4>
                <p className="text-xs text-slate-500">{subscription.paymentMethod}</p>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-slate-500">मैंडेट बैंक:</span>
              <span className="font-bold text-slate-800">{subscription.mandateBank}</span>
            </div>
          </div>

          {/* Next Deduction & Renewal */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">आगामी कटौती एवं नवीनीकरण</span>
              <Clock className="h-4 w-4 text-slate-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900">{subscription.nextBillingDate}</span>
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                स्वतः नवीनीकरण
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              कटौती राशि: <span className="font-bold text-slate-800">₹{subscription.pricePerCycle.toLocaleString('en-IN')}</span> (+ 18% GST)
            </p>
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-slate-500">मैंडेट आईडी:</span>
              <span className="font-mono text-[11px] font-bold text-slate-700">{subscription.mandateId}</span>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 2: PLAN SELECTION & UPGRADE/DOWNGRADE WITH AUTO-PAY               */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div>
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-600" />
              स्कूल प्लान अपग्रेड / डाउनग्रेड इंजन (Upgrade / Downgrade Anytime)
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              अपनी विद्यालयी छात्र संख्या व सुविधाओं के अनुसार किसी भी समय प्लान बदलें। आनुपातिक (Pro-rata) समायोजन स्वतः लागू होगा।
            </p>
          </div>

          {/* Billing Frequency Tabs */}
          <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200 self-start">
            <button
              onClick={() => setSelectedCycle('monthly')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                selectedCycle === 'monthly'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              मासिक (Monthly)
            </button>
            <button
              onClick={() => setSelectedCycle('quarterly')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                selectedCycle === 'quarterly'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              त्रैमासिक
              <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded font-bold">5% छूट</span>
            </button>
            <button
              onClick={() => setSelectedCycle('annual')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                selectedCycle === 'annual'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              वार्षिक (Annual)
              <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                selectedCycle === 'annual' ? 'bg-amber-800 text-white' : 'bg-emerald-100 text-emerald-800'
              }`}>
                20% महाबचत
              </span>
            </button>
          </div>
        </div>

        {/* 3 Plans Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {plans.map((plan) => {
            const isCurrent = subscription?.planId === plan.id;
            let displayPrice = plan.monthlyPrice;
            let cycleSubtext = 'प्रति माह';

            if (selectedCycle === 'quarterly') {
              displayPrice = Math.round(plan.quarterlyPrice / 3);
              cycleSubtext = `प्रति माह (त्रैमासिक बिल ₹${plan.quarterlyPrice.toLocaleString('en-IN')})`;
            } else if (selectedCycle === 'annual') {
              displayPrice = Math.round(plan.annualPrice / 12);
              cycleSubtext = `प्रति माह (वार्षिक बिल ₹${plan.annualPrice.toLocaleString('en-IN')})`;
            }

            return (
              <div
                key={plan.id}
                className={`rounded-2xl p-5 flex flex-col justify-between transition-all border ${
                  isCurrent
                    ? 'border-amber-500 ring-2 ring-amber-500/20 bg-amber-50/20 shadow-md'
                    : plan.recommended
                    ? 'border-indigo-300 bg-indigo-50/10 hover:border-indigo-400 shadow-xs'
                    : 'border-slate-200 bg-white hover:border-slate-300 shadow-xs'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-extrabold text-base text-slate-900">{plan.name}</h4>
                    {plan.badge && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                        {plan.badge}
                      </span>
                    )}
                    {isCurrent && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600 text-white">
                        सक्रिय
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 min-h-[32px]">{plan.tagline}</p>

                  <div className="mt-4 p-3 bg-white rounded-xl border border-slate-100">
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-black text-slate-900">
                        ₹{displayPrice.toLocaleString('en-IN')}
                      </span>
                      <span className="text-xs text-slate-500">/माह</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">{cycleSubtext}</p>
                    <div className="mt-2 text-[11px] font-bold text-amber-700 flex items-center gap-1">
                      <Building2 className="h-3 w-3" /> क्षमता: {plan.maxStudents}
                    </div>
                  </div>

                  {/* Feature Checklist */}
                  <div className="mt-4 space-y-2">
                    <p className="text-xs font-bold text-slate-700">सुविधाएं एवं क्षमताएं:</p>
                    {plan.features.map((feat: string, idx: number) => (
                      <div key={idx} className="flex items-start gap-2 text-xs text-slate-600">
                        <Check className="h-3.5 w-3.5 text-emerald-600 mt-0.5 shrink-0" />
                        <span>{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Plan Action Button */}
                <div className="mt-6 pt-4 border-t border-slate-100">
                  {isCurrent ? (
                    <button
                      disabled
                      className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-slate-100 text-slate-500 cursor-not-allowed flex items-center justify-center gap-1.5"
                    >
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      वर्तमान सक्रिय प्लान (Active)
                    </button>
                  ) : (
                    <button
                      onClick={() => handlePlanChange(plan.id)}
                      disabled={switchingPlan}
                      className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white transition flex items-center justify-center gap-1.5 shadow-sm cursor-pointer ${
                        plan.id === 'enterprise'
                          ? 'bg-slate-900 hover:bg-slate-800'
                          : 'bg-amber-600 hover:bg-amber-700'
                      }`}
                    >
                      <Zap className="h-4 w-4" />
                      {plan.id === 'enterprise'
                        ? 'एंटरप्राइज में अपग्रेड करें'
                        : subscription?.planId === 'enterprise'
                        ? 'इस प्लान पर डाउनग्रेड करें'
                        : 'इस प्लान पर अपग्रेड करें'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 3: DUAL EMAIL ARCHITECTURE & ADD-ONS (सामान्य vs डोमेन ईमेल)       */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
        <div className="mb-6">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Mail className="h-5 w-5 text-indigo-600" />
            दोहरी ईमेल प्रणाली एवं ऐड-ऑन आर्किटेक्चर (Dual Email Services)
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            विद्यार्थियों व अभिभावकों को सामान्य सूचनाएं नॉर्मल जीमेल से जाती हैं, जबकि सीबीएसई/बोर्ड पत्राचार के लिए आधिकारिक कस्टम डोमेन ईमेल का उपयोग होता है।
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 1. Normal Gmail Service Card */}
          <div className="border border-slate-200 rounded-2xl p-5 bg-slate-50/50 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-200 text-slate-800">
                  प्रकार 1: सामान्य ईमेल
                </span>
                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  शामिल (निःशुल्क)
                </span>
              </div>
              <h4 className="text-base font-bold text-slate-900">सामान्य जीमेल / सिस्टम ईमेल सेवा</h4>
              <p className="text-xs text-slate-500 mt-1">
                दैनिक उपस्थिति, नियमित स्कूल नोटिस एवं अवकाश सूचनाओं के लिए मानक ईमेल रूटिंग।
              </p>

              <div className="mt-4 p-3 bg-white rounded-xl border border-slate-200 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">लागत:</span>
                  <span className="font-bold text-emerald-700">₹0 / निःशुल्क (प्लान में शामिल)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">प्रेषक पता:</span>
                  <span className="font-mono text-slate-700">notifications@vidyasetuschool-system.com</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">मासिक सीमा:</span>
                  <span className="font-bold text-slate-800">असीमित (सामान्य उपयोग हेतु)</span>
                </div>
              </div>

              <div className="mt-4 space-y-1.5 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                  <span>दैनिक उपस्थिति अनुपस्थिति ईमेल अलर्ट्स</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                  <span>साप्ताहिक गृहकार्य एवं परिपत्र वितरण</span>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-200 text-xs text-slate-500 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>सभी विद्यार्थियों एवं अभिभावकों के लिए हमेशा चालू है।</span>
            </div>
          </div>

          {/* 2. Official Domain Email Add-on Card */}
          <div className="border border-indigo-200 rounded-2xl p-5 bg-gradient-to-br from-indigo-50/40 via-white to-indigo-50/20 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-600 text-white flex items-center gap-1">
                  <Globe className="h-3.5 w-3.5" /> प्रकार 2: आधिकारिक डोमेन ईमेल
                </span>
                <span className="text-xs font-bold text-indigo-700 bg-indigo-100 px-2.5 py-0.5 rounded-full border border-indigo-200">
                  ऐड-ऑन (Add-on)
                </span>
              </div>
              <h4 className="text-base font-bold text-slate-900">
                कस्टम डोमेन ऑफिशियल ईमेल (@{customDomain?.domainName || 'vidyasetuschool.edu.in'})
              </h4>
              <p className="text-xs text-slate-600 mt-1">
                सीबीएसई, शिक्षा विभाग, बैंकों एवं आधिकारिक बोर्ड पत्राचार के लिए विद्यालय के अपने रजिस्टर्ड डोमेन से ईमेल।
              </p>

              <div className="mt-4 p-3 bg-white rounded-xl border border-indigo-100 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">ऐड-ऑन प्राइस:</span>
                  <span className="font-bold text-slate-900">₹499 / माह (प्रति 10,000 ऑफिशियल ईमेल)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">क्लाउडफ्लेयर सुरक्षा:</span>
                  <span className="font-semibold text-emerald-700 flex items-center gap-1">
                    <ShieldCheck className="h-3.5 w-3.5" /> SPF + DKIM + DMARC सत्यापित
                  </span>
                </div>
                <div>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-slate-500">मासिक प्रेषण कोटा (Sending Quota):</span>
                    <span className="font-bold text-slate-800">
                      {customDomain?.monthlySentCount} / {customDomain?.monthlySendingQuota?.toLocaleString('en-IN')} मेल्स
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-indigo-600 h-2 rounded-full"
                      style={{
                        width: `${Math.min(
                          100,
                          ((customDomain?.monthlySentCount || 0) / (customDomain?.monthlySendingQuota || 10000)) * 100
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Mailboxes list */}
              <div className="mt-4">
                <p className="text-xs font-bold text-slate-700 mb-1.5">सक्रिय आधिकारिक मेलबॉक्स:</p>
                <div className="flex flex-wrap gap-1.5">
                  {customDomain?.configuredMailboxes?.map((m: string) => (
                    <span
                      key={m}
                      className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-700 text-[11px] font-mono"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Quota Purchase Action */}
            <div className="mt-6 pt-4 border-t border-indigo-100 flex items-center justify-between gap-3">
              <span className="text-[11px] text-slate-500">अतिरिक्त कोटा चाहिए?</span>
              <button
                onClick={handlePurchaseQuota}
                disabled={purchasingAddon}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition cursor-pointer disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
                {purchasingAddon ? 'जोड़ा जा रहा है...' : '+10,000 कोटा जोड़ें (₹499)'}
              </button>
            </div>
          </div>
        </div>

        {/* Cloudflare DNS Verification Records Table */}
        <div className="mt-6 border-t border-slate-100 pt-5">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              क्लाउडफ्लेयर डीएनएस (DNS / SPF / DKIM) वेरिफिकेशन स्थिति
            </h4>
            <span className="text-[11px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
              100% इनबॉक्स डिलीवरी प्रमाणित ✅
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border border-slate-200 rounded-xl overflow-hidden">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-2.5">रिकॉर्ड प्रकार</th>
                  <th className="p-2.5">होस्ट / नाम</th>
                  <th className="p-2.5">मान (Value / Target)</th>
                  <th className="p-2.5">सुरक्षा उद्देश्य</th>
                  <th className="p-2.5 text-center">स्थिति</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-mono">
                {dnsRecords.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50/60">
                    <td className="p-2.5 font-bold text-indigo-700">{r.type}</td>
                    <td className="p-2.5 text-slate-800">{r.host}</td>
                    <td className="p-2.5 text-slate-600 max-w-xs truncate">{r.value}</td>
                    <td className="p-2.5 font-sans text-slate-500">{r.requiredFor}</td>
                    <td className="p-2.5 text-center font-sans">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Add New Mailbox Form */}
          <form onSubmit={handleAddMailbox} className="mt-4 flex flex-col sm:flex-row items-center gap-2">
            <div className="relative grow w-full">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 text-xs font-mono">
                नया मेल प्रिफिक्स:
              </span>
              <input
                type="text"
                value={newMailboxPrefix}
                onChange={(e) => setNewMailboxPrefix(e.target.value)}
                placeholder="उदा. viceprincipal, accounts, admission"
                className="w-full pl-32 pr-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono"
              />
            </div>
            <span className="text-xs font-mono text-slate-600 shrink-0">
              @{customDomain?.domainName || 'vidyasetuschool.edu.in'}
            </span>
            <button
              type="submit"
              disabled={isAddingMailbox || !newMailboxPrefix}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shrink-0 transition cursor-pointer disabled:opacity-50"
            >
              {isAddingMailbox ? 'सक्रिय हो रहा है...' : '+ नया मेलबॉक्स जोड़ें'}
            </button>
          </form>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 4: SCHOOL-ISOLATED FCM TOPICS (मल्टी-स्कूल FCM विषय पृथक्करण)      */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Radio className="h-5 w-5 text-amber-600" />
              स्कूल-विशिष्ट पृथक FCM टॉपिक्स (Data Isolation Guaranteed)
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              प्रत्येक विद्यालय के टॉपिक्स स्वतः <span className="font-mono font-bold text-slate-700">school_{currentSchoolId}_*</span> प्रिफिक्स से सुरक्षित हैं ताकि किसी भी स्कूल का नोटिस/अलर्ट दूसरे स्कूल में न जा सके।
            </p>
          </div>

          <button
            onClick={onOpenFcmModal}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition shadow-xs cursor-pointer shrink-0"
          >
            <Send className="h-3.5 w-3.5" />
            त्वरित अलर्ट ब्रॉडकास्ट करें
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {schoolTopics.map((top) => (
            <div
              key={top.id}
              className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:border-amber-300 transition"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-[11px] font-bold text-amber-800 bg-amber-100/70 px-2 py-0.5 rounded-md">
                  {top.topicKey}
                </span>
                <span className="text-[10px] font-bold text-slate-500">{top.subscriberCount} ग्राहक</span>
              </div>
              <h5 className="text-xs font-bold text-slate-800 mt-1.5">{top.displayName}</h5>
              <p className="text-[11px] text-slate-500 mt-0.5">{top.description}</p>
              <div className="mt-2 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[10px]">
                <span className="text-slate-500">लक्षित वर्ग:</span>
                <span className="font-semibold text-slate-700">{top.targetRole}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 5: BILLING INVOICES & AUTO-PAY RECEIPTS (जीएसटी चालान)            */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Receipt className="h-5 w-5 text-slate-700" />
              ऑटो-पे एवं बिलिंग रसीदें (GST Tax Invoices)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              सभी स्वचालित भुगतान एवं प्लान अपग्रेड के 100% अनुपालन युक्त जीएसटी चालान।
            </p>
          </div>
          <span className="text-xs font-bold text-slate-500">{invoices.length} चालान उपलब्ध</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border border-slate-200 rounded-xl overflow-hidden">
            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
              <tr>
                <th className="p-3">चालान संख्या</th>
                <th className="p-3">विवरण एवं प्लान</th>
                <th className="p-3">दिनांक</th>
                <th className="p-3">मूल राशि</th>
                <th className="p-3">जीएसटी (18%)</th>
                <th className="p-3">कुल राशि</th>
                <th className="p-3">भुगतान विधि</th>
                <th className="p-3 text-center">स्थिति</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50/60">
                  <td className="p-3 font-mono font-bold text-slate-900">{inv.invoiceNumber}</td>
                  <td className="p-3">
                    <p className="font-semibold text-slate-800">{inv.planName}</p>
                    <p className="text-[11px] text-slate-500">{inv.billingCycle}</p>
                  </td>
                  <td className="p-3 text-slate-600">{inv.invoiceDate}</td>
                  <td className="p-3 font-medium text-slate-700">₹{inv.subtotal.toLocaleString('en-IN')}</td>
                  <td className="p-3 text-slate-500">₹{inv.gstAmount.toLocaleString('en-IN')}</td>
                  <td className="p-3 font-bold text-slate-900">₹{inv.totalAmount.toLocaleString('en-IN')}</td>
                  <td className="p-3 text-slate-600">{inv.paymentMethod}</td>
                  <td className="p-3 text-center">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                      {inv.paymentStatus}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL: AUTO-PAY MANDATE SETTINGS                                          */}
      {/* ========================================================================= */}
      {isAutoPayModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-5 py-4 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-amber-400" />
                <h4 className="font-bold text-base">ऑटो-पे मैंडेट कॉन्फ़िगरेशन</h4>
              </div>
              <button
                onClick={() => setIsAutoPayModalOpen(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-600">
                ऑटो-पे सक्रिय करने पर नियत तिथि पर विद्यालयी सेवा शुल्क आपके लिंक्ड बैंक/यूपीआई खाते से स्वतः कट जाएगा और रसीद ईमेल पर आ जाएगी।
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  भुगतान माध्यम (Payment Method)
                </label>
                <select
                  value={autoPayMethod}
                  onChange={(e) => setAutoPayMethod(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none"
                >
                  <option value="UPI AutoPay">UPI AutoPay (Google Pay / PhonePe / Paytm)</option>
                  <option value="e-NACH Mandate">e-NACH NetBanking Mandate</option>
                  <option value="Corporate Card">Corporate / Institutional Credit Card</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  बैंक का नाम (Designated Bank)
                </label>
                <input
                  type="text"
                  value={autoPayBank}
                  onChange={(e) => setAutoPayBank(e.target.value)}
                  placeholder="उदा. State Bank of India, HDFC Bank"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2">
                <ShieldCheck className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <span>
                  भारतीय रिज़र्व बैंक (RBI e-Mandate) दिशा-निर्देशों के तहत कटौती से 24 घंटे पहले आपको एसएमएस एवं ईमेल अलर्ट प्राप्त होगा।
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                {subscription?.autoPayEnabled && (
                  <button
                    type="button"
                    onClick={() => handleToggleAutoPay(false)}
                    className="px-3.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 rounded-lg"
                  >
                    ऑटो-पे बंद करें
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleToggleAutoPay(true)}
                  className="px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-xs"
                >
                  मैंडेट सहेजें एवं चालू करें
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
