'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, RefreshCw, CheckCircle2, XCircle, School, IndianRupee, Loader2, Plus, Trash2, RotateCcw, Pencil, Tag, Boxes, Eye, EyeOff } from 'lucide-react';

interface SchoolRow {
  id: string;
  schoolName: string;
  subdomain: string;
  customDomain: string;
  contactEmail: string;
  contactPhone: string;
  status: string;
  registrationStatus: string;
  planId: string;
  planName: string;
  trialEndsAt: string;
  deletedAt: string;
  createdAt: string;
}

interface PlanRow {
  id: string;
  name: string;
  tagline: string;
  badge: string;
  monthlyPrice: number;
  quarterlyPrice: number;
  annualPrice: number;
  maxStudents: string;
  maxStudentsLimit: number | null;
  maxStaffLimit: number | null;
  features: string[];
  modules: string[];
  featureFlags: Record<string, boolean>;
  recommended: boolean;
  active: boolean;
  isTrial: boolean;
  sortOrder: number;
}

const MODULE_OPTIONS = ['dashboard', 'students', 'attendance', 'staff', 'notices', 'fees', 'exams', 'principal', 'settings', 'billing'];
const FLAG_OPTIONS = [
  { key: 'reportCards', label: 'रिपोर्ट कार्ड' },
  { key: 'principalHistory', label: 'प्रधानाचार्य इतिहास' },
  { key: 'autopay', label: 'ऑटो-पे बिलिंग' },
  { key: 'domainEmail', label: 'डोमेन ईमेल' },
  { key: 'multiSchool', label: 'मल्टी-स्कूल टेनेंसी' },
  { key: 'prioritySupport', label: 'प्राथमिकता सहायता' },
  { key: 'customDomainIncluded', label: 'कस्टम डोमेन शामिल' },
];

const emptyAddForm = { schoolName: '', directorName: '', email: '', phone: '', password: '', subdomain: '', customDomain: '', planId: 'starter', billingCycle: 'annual' };
const emptyPlanForm = { name: '', tagline: '', badge: '', monthlyPrice: '', quarterlyPrice: '', annualPrice: '', maxStudents: '', maxStaff: '', maxStudentsLabel: '', recommended: false, active: true, isTrial: false, sortOrder: '0', modules: ['dashboard', 'students', 'attendance', 'staff', 'notices', 'fees', 'settings', 'billing'], features: '', reportCards: false, principalHistory: false, autopay: false, domainEmail: false, multiSchool: false, prioritySupport: false, customDomainIncluded: false };

export function AdminConsoleScreen() {
  const [activeTab, setActiveTab] = useState<'schools' | 'plans'>('schools');
  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [registrations, setRegistrations] = useState<SchoolRow[]>([]);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [deletedSchools, setDeletedSchools] = useState<SchoolRow[]>([]);
  const [showDeleted, setShowDeleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deletedLoading, setDeletedLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState<any>(emptyAddForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({ schoolName: '', email: '', phone: '', subdomain: '', customDomain: '', status: 'Active' });

  const [showPlanForm, setShowPlanForm] = useState(false);
  const [planEditId, setPlanEditId] = useState<string | null>(null);
  const [planForm, setPlanForm] = useState<any>(emptyPlanForm);

  const nonTrialPlans = plans.filter((p) => !p.isTrial && p.active !== false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [sRes, rRes, pRes] = await Promise.all([
        fetch('/api/admin/schools').then((r) => r.json()),
        fetch('/api/admin/registrations').then((r) => r.json()),
        fetch('/api/admin/plans').then((r) => r.json()),
      ]);
      if (sRes.success) setSchools(sRes.schools || []);
      if (rRes.success) setRegistrations(rRes.registrations || []);
      if (pRes.success) setPlans(pRes.plans || []);
      if (!sRes.success && sRes.message) setErrorMsg(sRes.message);
      else if (!pRes.success && pRes.message) setErrorMsg(pRes.message);
    } catch (e) {
      setErrorMsg('सर्वर से संपर्क करने में समस्या हुई।');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDeleted = useCallback(async () => {
    setDeletedLoading(true);
    try {
      const res = await fetch('/api/admin/schools/deleted').then((r) => r.json());
      if (res.success) setDeletedSchools(res.schools || []);
      else setErrorMsg(res.message || 'हटाए गए स्कूल लोड नहीं हुए।');
    } catch (e) {
      setErrorMsg('नेटवर्क त्रुटि।');
    } finally {
      setDeletedLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const post = async (url: string, body: any) => {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return await res.json();
  };

  const approve = async (schoolId: string) => {
    setBusyId(schoolId);
    try {
      const data = await post('/api/admin/registrations/approve', { schoolId });
      if (data.success) await loadData();
      else setErrorMsg(data.message || 'अप्रूवल विफल।');
    } catch (e) { setErrorMsg('नेटवर्क त्रुटि।'); }
    finally { setBusyId(null); }
  };

  const reject = async (schoolId: string) => {
    setBusyId(schoolId);
    try {
      const data = await post('/api/admin/registrations/reject', { schoolId });
      if (data.success) await loadData();
      else setErrorMsg(data.message || 'अस्वीकृति विफल।');
    } catch (e) { setErrorMsg('नेटवर्क त्रुटि।'); }
    finally { setBusyId(null); }
  };

  const setPlan = async (schoolId: string, planId: string) => {
    if (planId === 'trial') return;
    setBusyId(schoolId);
    try {
      const data = await post('/api/admin/schools/plan', { schoolId, planId });
      if (data.success) await loadData();
      else setErrorMsg(data.message || 'प्लान बदलने में त्रुटि।');
    } catch (e) { setErrorMsg('नेटवर्क त्रुटि।'); }
    finally { setBusyId(null); }
  };

  const createSchool = async () => {
    setBusyId('add');
    try {
      const data = await post('/api/admin/schools/create', addForm);
      if (data.success) { setShowAddForm(false); setAddForm(emptyAddForm); await loadData(); }
      else setErrorMsg(data.message || 'विद्यालय बनाने में त्रुटि।');
    } catch (e) { setErrorMsg('नेटवर्क त्रुटि।'); }
    finally { setBusyId(null); }
  };

  const startEdit = (s: SchoolRow) => {
    setEditId(s.id);
    setEditForm({ schoolName: s.schoolName, email: s.contactEmail, phone: s.contactPhone, subdomain: s.subdomain || '', customDomain: s.customDomain || '', status: s.status });
  };

  const saveEdit = async (schoolId: string) => {
    setBusyId(schoolId);
    try {
      const data = await post('/api/admin/schools/update', Object.assign({ schoolId }, editForm));
      if (data.success) { setEditId(null); await loadData(); }
      else setErrorMsg(data.message || 'अपडेट विफल।');
    } catch (e) { setErrorMsg('नेटवर्क त्रुटि।'); }
    finally { setBusyId(null); }
  };

  const deleteSchool = async (schoolId: string) => {
    setBusyId(schoolId);
    try {
      const data = await post('/api/admin/schools/delete', { schoolId });
      if (data.success) { setConfirmDeleteId(null); await loadData(); }
      else setErrorMsg(data.message || 'हटाने में त्रुटि।');
    } catch (e) { setErrorMsg('नेटवर्क त्रुटि।'); }
    finally { setBusyId(null); }
  };

  const restoreSchool = async (schoolId: string) => {
    setBusyId(schoolId);
    try {
      const data = await post('/api/admin/schools/restore', { schoolId });
      if (data.success) { await loadData(); await loadDeleted(); }
      else setErrorMsg(data.message || 'रिस्टोर विफल।');
    } catch (e) { setErrorMsg('नेटवर्क त्रुटि।'); }
    finally { setBusyId(null); }
  };

  const toggleModule = (m: string) => {
    const list = planForm.modules.slice();
    const i = list.indexOf(m);
    if (i === -1) list.push(m); else list.splice(i, 1);
    setPlanForm(Object.assign({}, planForm, { modules: list }));
  };

  const toggleFlag = (k: string) => {
    setPlanForm(Object.assign({}, planForm, { [k]: !(planForm as any)[k] }));
  };

  const startPlanCreate = () => {
    setPlanEditId(null);
    setPlanForm(emptyPlanForm);
    setShowPlanForm(true);
  };

  const startPlanEdit = (p: PlanRow) => {
    setPlanEditId(p.id);
    setPlanForm({
      name: p.name || '',
      tagline: p.tagline || '',
      badge: p.badge || '',
      monthlyPrice: String(p.monthlyPrice || 0),
      quarterlyPrice: String(p.quarterlyPrice || 0),
      annualPrice: String(p.annualPrice || 0),
      maxStudents: p.maxStudentsLimit === null || p.maxStudentsLimit === undefined ? '' : String(p.maxStudentsLimit),
      maxStaff: p.maxStaffLimit === null || p.maxStaffLimit === undefined ? '' : String(p.maxStaffLimit),
      maxStudentsLabel: p.maxStudents || '',
      recommended: !!p.recommended,
      active: p.active !== false,
      isTrial: !!p.isTrial,
      sortOrder: String(p.sortOrder || 0),
      modules: Array.isArray(p.modules) ? p.modules.slice() : [],
      features: (p.features || []).join('\n'),
      reportCards: !!p.featureFlags.reportCards,
      principalHistory: !!p.featureFlags.principalHistory,
      autopay: !!p.featureFlags.autopay,
      domainEmail: !!p.featureFlags.domainEmail,
      multiSchool: !!p.featureFlags.multiSchool,
      prioritySupport: !!p.featureFlags.prioritySupport,
      customDomainIncluded: !!p.featureFlags.customDomainIncluded,
    });
    setShowPlanForm(true);
  };

  const buildPlanBody = () => {
    const num = (v: string) => (String(v).trim() === '' ? null : Number(v));
    return {
      name: planForm.name.trim(),
      tagline: planForm.tagline,
      badge: planForm.badge,
      monthlyPrice: Number(planForm.monthlyPrice) || 0,
      quarterlyPrice: Number(planForm.quarterlyPrice) || 0,
      annualPrice: Number(planForm.annualPrice) || 0,
      maxStudents: num(planForm.maxStudents),
      maxStaff: num(planForm.maxStaff),
      maxStudentsLabel: planForm.maxStudentsLabel,
      recommended: planForm.recommended,
      active: planForm.active,
      isTrial: planForm.isTrial,
      sortOrder: Number(planForm.sortOrder) || 0,
      modules: planForm.modules,
      features: String(planForm.features).split('\n').map((t: string) => t.trim()).filter((t: string) => t.length > 0),
      featureFlags: {
        reportCards: planForm.reportCards,
        principalHistory: planForm.principalHistory,
        autopay: planForm.autopay,
        domainEmail: planForm.domainEmail,
        multiSchool: planForm.multiSchool,
        prioritySupport: planForm.prioritySupport,
        customDomainIncluded: planForm.customDomainIncluded,
      },
    };
  };

  const savePlan = async () => {
    setBusyId('plan-save');
    try {
      const url = planEditId ? '/api/admin/plans/update' : '/api/admin/plans';
      const body = Object.assign({}, buildPlanBody(), planEditId ? { id: planEditId } : {});
      const data = await post(url, body);
      if (data.success) { setShowPlanForm(false); await loadData(); }
      else setErrorMsg(data.message || 'प्लान सेव करने में त्रुटि।');
    } catch (e) { setErrorMsg('नेटवर्क त्रुटि।'); }
    finally { setBusyId(null); }
  };

  const deactivatePlan = async (id: string) => {
    setBusyId(id);
    try {
      const data = await post('/api/admin/plans/delete', { id });
      if (data.success) await loadData();
      else setErrorMsg(data.message || 'प्लान निष्क्रिय करने में त्रुटि।');
    } catch (e) { setErrorMsg('नेटवर्क त्रुटि।'); }
    finally { setBusyId(null); }
  };

  const totalActive = schools.filter((s) => s.status === 'Active').length;
  const totalTrial = schools.filter((s) => s.status === 'Trial').length;

  const statusBadge = (status: string) => (
    <span className={'px-2 py-0.5 rounded-full text-[10px] font-bold ' + (status === 'Active' ? 'bg-emerald-100 text-emerald-700' : status === 'Trial' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600')}>{status === 'Active' ? 'सक्रिय' : status === 'Trial' ? 'ट्रायल' : status}</span>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2"><ShieldCheck className="w-6 h-6 text-rose-600" /> Super Admin कंसोल</h2>
          <p className="text-sm text-slate-500">विद्यालयों, उनके प्लान, ट्रायल, रजिस्ट्रेशन अप्रूवल और डायनामिक प्लान का प्रबंधन</p>
        </div>
        <button onClick={loadData} className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer">
          <RefreshCw className="w-4 h-4" /> रिफ्रेश
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={() => setActiveTab('schools')} className={'px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ' + (activeTab === 'schools' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50')}><School className="w-3.5 h-3.5 inline mr-1" /> विद्यालय</button>
        <button onClick={() => setActiveTab('plans')} className={'px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ' + (activeTab === 'plans' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50')}><Tag className="w-3.5 h-3.5 inline mr-1" /> प्लान</button>
      </div>

      {errorMsg && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">{errorMsg}</div>}

      {activeTab === 'schools' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs"><div className="text-2xl font-black text-slate-900">{schools.length}</div><div className="text-xs font-semibold text-slate-500">कुल विद्यालय</div></div>
            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs"><div className="text-2xl font-black text-amber-600">{registrations.length}</div><div className="text-xs font-semibold text-slate-500">लंबित अप्रूवल</div></div>
            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs"><div className="text-2xl font-black text-blue-700">{totalActive}</div><div className="text-xs font-semibold text-slate-500">सक्रिय (पेड प्लान)</div></div>
            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs"><div className="text-2xl font-black text-emerald-600">{totalTrial}</div><div className="text-xs font-semibold text-slate-500">ट्रायल पर</div></div>
          </div>

          <div className="flex items-center justify-between">
            <button onClick={() => { setShowAddForm(!showAddForm); setEditId(null); }} className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition cursor-pointer">
              <Plus className="w-4 h-4" /> नया विद्यालय जोड़ें
            </button>
            <button onClick={() => { if (!showDeleted) loadDeleted(); setShowDeleted(!showDeleted); }} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition cursor-pointer">
              {showDeleted ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />} {showDeleted ? 'हटाए गए छिपाएं' : 'हटाए गए देखें'}
            </button>
          </div>

          {showAddForm && (
            <div className="p-5 rounded-2xl bg-white border border-blue-200 shadow-xs">
              <h3 className="text-sm font-black text-slate-900 mb-3">नया विद्यालय पंजीकृत करें</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <input placeholder="विद्यालय का नाम *" value={addForm.schoolName} onChange={(e) => setAddForm(Object.assign({}, addForm, { schoolName: e.target.value }))} className="px-3 py-2 border border-slate-200 rounded-lg text-xs" />
                <input placeholder="निदेशक (Director) का नाम *" value={addForm.directorName} onChange={(e) => setAddForm(Object.assign({}, addForm, { directorName: e.target.value }))} className="px-3 py-2 border border-slate-200 rounded-lg text-xs" />
                <input placeholder="संपर्क ईमेल *" value={addForm.email} onChange={(e) => setAddForm(Object.assign({}, addForm, { email: e.target.value }))} className="px-3 py-2 border border-slate-200 rounded-lg text-xs" />
                <input placeholder="संपर्क फोन *" value={addForm.phone} onChange={(e) => setAddForm(Object.assign({}, addForm, { phone: e.target.value }))} className="px-3 py-2 border border-slate-200 rounded-lg text-xs" />
                <input placeholder="लॉगिन पासवर्ड * (न्यूनतम 6 अक्षर)" type="password" value={addForm.password} onChange={(e) => setAddForm(Object.assign({}, addForm, { password: e.target.value }))} className="px-3 py-2 border border-slate-200 rounded-lg text-xs" />
                <input placeholder="सबडोमेन (वैकल्पिक)" value={addForm.subdomain} onChange={(e) => setAddForm(Object.assign({}, addForm, { subdomain: e.target.value }))} className="px-3 py-2 border border-slate-200 rounded-lg text-xs" />
                <input placeholder="कस्टम डोमेन (वैकल्पिक)" value={addForm.customDomain} onChange={(e) => setAddForm(Object.assign({}, addForm, { customDomain: e.target.value }))} className="px-3 py-2 border border-slate-200 rounded-lg text-xs" />
                <select value={addForm.planId} onChange={(e) => setAddForm(Object.assign({}, addForm, { planId: e.target.value }))} className="px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white">
                  {nonTrialPlans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <select value={addForm.billingCycle} onChange={(e) => setAddForm(Object.assign({}, addForm, { billingCycle: e.target.value }))} className="px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white">
                  <option value="monthly">मासिक</option>
                  <option value="quarterly">त्रैमासिक</option>
                  <option value="annual">वार्षिक</option>
                </select>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button onClick={createSchool} disabled={busyId === 'add'} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition cursor-pointer disabled:opacity-50">पंजीकृत करें</button>
                <button onClick={() => setShowAddForm(false)} className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold rounded-xl transition cursor-pointer">रद्द</button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400 gap-2"><Loader2 className="w-5 h-5 animate-spin" /> लोड हो रहा है...</div>
          ) : (
            <>
              {registrations.length > 0 && (
                <div className="p-5 rounded-2xl bg-white border border-amber-200 shadow-xs">
                  <h3 className="text-sm font-black text-slate-900 mb-3">⏳ लंबित रजिस्ट्रेशन अनुरोध</h3>
                  <div className="space-y-3">
                    {registrations.map((s) => (
                      <div key={s.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-slate-100 bg-amber-50/50">
                        <div>
                          <div className="text-sm font-bold text-slate-900 flex items-center gap-2"><School className="w-4 h-4 text-amber-600" /> {s.schoolName}</div>
                          <div className="text-xs text-slate-500">{s.contactEmail} • {s.contactPhone}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => approve(s.id)} disabled={busyId === s.id} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition cursor-pointer disabled:opacity-50 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> अप्रूव करें (7-दिन ट्रायल)</button>
                          <button onClick={() => reject(s.id)} disabled={busyId === s.id} className="px-3 py-1.5 bg-white border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-bold rounded-lg transition cursor-pointer disabled:opacity-50 flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> अस्वीकृत</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs overflow-x-auto">
                <h3 className="text-sm font-black text-slate-900 mb-3 flex items-center gap-2"><IndianRupee className="w-4 h-4 text-slate-500" /> सभी विद्यालय — प्लान व स्थिति</h3>
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-100">
                      <th className="py-2 pr-3 font-bold">विद्यालय</th>
                      <th className="py-2 px-3 font-bold">सबडोमेन</th>
                      <th className="py-2 px-3 font-bold">स्थिति</th>
                      <th className="py-2 px-3 font-bold">वर्तमान प्लान</th>
                      <th className="py-2 px-3 font-bold">ट्रायल समाप्ति</th>
                      <th className="py-2 px-3 font-bold">कार्रवाई</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schools.length === 0 && (
                      <tr><td colSpan={6} className="py-8 text-center text-slate-400">अभी कोई विद्यालय नहीं है।</td></tr>
                    )}
                    {schools.map((s) => (
                      <tr key={s.id} className="border-b border-slate-50">
                        <td className="py-3 pr-3">
                          {editId === s.id ? (
                            <div className="space-y-1.5 min-w-52">
                              <input value={editForm.schoolName} onChange={(e) => setEditForm(Object.assign({}, editForm, { schoolName: e.target.value }))} placeholder="नाम" className="w-full px-2 py-1 border border-slate-200 rounded-lg text-xs" />
                              <input value={editForm.email} onChange={(e) => setEditForm(Object.assign({}, editForm, { email: e.target.value }))} placeholder="ईमेल" className="w-full px-2 py-1 border border-slate-200 rounded-lg text-xs" />
                              <input value={editForm.phone} onChange={(e) => setEditForm(Object.assign({}, editForm, { phone: e.target.value }))} placeholder="फोन" className="w-full px-2 py-1 border border-slate-200 rounded-lg text-xs" />
                            </div>
                          ) : (
                            <>
                              <div className="font-bold text-slate-900">{s.schoolName}</div>
                              <div className="text-[10px] text-slate-400">{s.contactEmail} • {s.contactPhone}</div>
                            </>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          {editId === s.id ? (
                            <div className="space-y-1.5 min-w-40">
                              <input value={editForm.subdomain} onChange={(e) => setEditForm(Object.assign({}, editForm, { subdomain: e.target.value }))} placeholder="सबडोमेन" className="w-full px-2 py-1 border border-slate-200 rounded-lg text-xs" />
                              <input value={editForm.customDomain} onChange={(e) => setEditForm(Object.assign({}, editForm, { customDomain: e.target.value }))} placeholder="कस्टम डोमेन" className="w-full px-2 py-1 border border-slate-200 rounded-lg text-xs" />
                              <select value={editForm.status} onChange={(e) => setEditForm(Object.assign({}, editForm, { status: e.target.value }))} className="w-full px-2 py-1 border border-slate-200 rounded-lg text-xs bg-white">
                                <option value="Active">Active</option>
                                <option value="Trial">Trial</option>
                                <option value="Suspended">Suspended</option>
                              </select>
                            </div>
                          ) : (
                            <div className="text-slate-600">{s.subdomain || '—'}</div>
                          )}
                        </td>
                        <td className="py-3 px-3">{statusBadge(s.status)}</td>
                        <td className="py-3 px-3">
                          {editId === s.id ? null : (
                            <select value={s.planId} onChange={(e) => setPlan(s.id, e.target.value)} className="px-2 py-1 border border-slate-200 rounded-lg text-xs bg-white max-w-44">
                              {s.planId && nonTrialPlans.findIndex((p) => p.id === s.planId) === -1 && s.planId !== 'trial' && <option value={s.planId}>{s.planName || s.planId}</option>}
                              {s.planId === 'trial' && <option value="trial">ट्रायल</option>}
                              {nonTrialPlans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                          )}
                        </td>
                        <td className="py-3 px-3 text-slate-600">{s.trialEndsAt || '—'}</td>
                        <td className="py-3 px-3">
                          {editId === s.id ? (
                            <div className="flex items-center gap-1">
                              <button onClick={() => saveEdit(s.id)} disabled={busyId === s.id} className="px-2 py-1 bg-blue-600 text-white rounded-lg text-[10px] font-bold cursor-pointer disabled:opacity-50">सहेजें</button>
                              <button onClick={() => setEditId(null)} className="px-2 py-1 border border-slate-200 rounded-lg text-[10px] font-bold cursor-pointer">रद्द</button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <button onClick={() => startEdit(s)} className="px-2 py-1 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-[10px] font-bold cursor-pointer flex items-center gap-1"><Pencil className="w-3 h-3" /> एडिट</button>
                              {confirmDeleteId === s.id ? (
                                <button onClick={() => deleteSchool(s.id)} disabled={busyId === s.id} className="px-2 py-1 bg-rose-600 text-white rounded-lg text-[10px] font-bold cursor-pointer disabled:opacity-50">पक्का हटाएं?</button>
                              ) : (
                                <button onClick={() => setConfirmDeleteId(s.id)} className="px-2 py-1 border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-lg text-[10px] font-bold cursor-pointer flex items-center gap-1"><Trash2 className="w-3 h-3" /> हटाएं</button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {showDeleted && (
                <div className="p-5 rounded-2xl bg-white border border-rose-200 shadow-xs">
                  <h3 className="text-sm font-black text-slate-900 mb-3 flex items-center gap-2"><Trash2 className="w-4 h-4 text-rose-500" /> हटाए गए विद्यालय (सॉफ्ट-डिलीट)</h3>
                  {deletedLoading ? (
                    <div className="flex items-center justify-center py-8 text-slate-400 gap-2"><Loader2 className="w-4 h-4 animate-spin" /> लोड हो रहा है...</div>
                  ) : deletedSchools.length === 0 ? (
                    <div className="py-6 text-center text-slate-400 text-xs">कोई हटाया गया विद्यालय नहीं है।</div>
                  ) : (
                    <div className="space-y-3">
                      {deletedSchools.map((s) => (
                        <div key={s.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-slate-100 bg-rose-50/40">
                          <div>
                            <div className="text-sm font-bold text-slate-900">{s.schoolName}</div>
                            <div className="text-xs text-slate-500">{s.contactEmail} • {s.contactPhone} • हटाया गया: {s.deletedAt || '—'}</div>
                          </div>
                          <button onClick={() => restoreSchool(s.id)} disabled={busyId === s.id} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition cursor-pointer disabled:opacity-50 flex items-center gap-1"><RotateCcw className="w-3.5 h-3.5" /> रिस्टोर करें</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}

      {activeTab === 'plans' && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2"><Boxes className="w-4 h-4 text-slate-500" /> सदस्यता प्लान</h3>
              <p className="text-xs text-slate-500">नए प्लान बनाएं, कीमत/मॉड्यूल बदलें, या प्लान निष्क्रिय करें</p>
            </div>
            <button onClick={startPlanCreate} className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition cursor-pointer"><Plus className="w-4 h-4" /> नया प्लान</button>
          </div>

          {showPlanForm && (
            <div className="p-5 rounded-2xl bg-white border border-blue-200 shadow-xs">
              <h3 className="text-sm font-black text-slate-900 mb-3">{planEditId ? 'प्लान संपादित करें' : 'नया प्लान बनाएं'}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <input placeholder="प्लान का नाम *" value={planForm.name} onChange={(e) => setPlanForm(Object.assign({}, planForm, { name: e.target.value }))} className="px-3 py-2 border border-slate-200 rounded-lg text-xs" />
                <input placeholder="टैगलाइन" value={planForm.tagline} onChange={(e) => setPlanForm(Object.assign({}, planForm, { tagline: e.target.value }))} className="px-3 py-2 border border-slate-200 rounded-lg text-xs" />
                <input placeholder="बैज (वैकल्पिक)" value={planForm.badge} onChange={(e) => setPlanForm(Object.assign({}, planForm, { badge: e.target.value }))} className="px-3 py-2 border border-slate-200 rounded-lg text-xs" />
                <input placeholder="मासिक मूल्य (₹)" type="number" value={planForm.monthlyPrice} onChange={(e) => setPlanForm(Object.assign({}, planForm, { monthlyPrice: e.target.value }))} className="px-3 py-2 border border-slate-200 rounded-lg text-xs" />
                <input placeholder="त्रैमासिक मूल्य (₹)" type="number" value={planForm.quarterlyPrice} onChange={(e) => setPlanForm(Object.assign({}, planForm, { quarterlyPrice: e.target.value }))} className="px-3 py-2 border border-slate-200 rounded-lg text-xs" />
                <input placeholder="वार्षिक मूल्य (₹)" type="number" value={planForm.annualPrice} onChange={(e) => setPlanForm(Object.assign({}, planForm, { annualPrice: e.target.value }))} className="px-3 py-2 border border-slate-200 rounded-lg text-xs" />
                <input placeholder="अधिकतम छात्र (खाली = असीमित)" type="number" value={planForm.maxStudents} onChange={(e) => setPlanForm(Object.assign({}, planForm, { maxStudents: e.target.value }))} className="px-3 py-2 border border-slate-200 rounded-lg text-xs" />
                <input placeholder="अधिकतम स्टाफ (खाली = असीमित)" type="number" value={planForm.maxStaff} onChange={(e) => setPlanForm(Object.assign({}, planForm, { maxStaff: e.target.value }))} className="px-3 py-2 border border-slate-200 rounded-lg text-xs" />
                <input placeholder="छात्र सीमा लेबल (जैसे: 500 विद्यार्थी)" value={planForm.maxStudentsLabel} onChange={(e) => setPlanForm(Object.assign({}, planForm, { maxStudentsLabel: e.target.value }))} className="px-3 py-2 border border-slate-200 rounded-lg text-xs" />
                <input placeholder="क्रम (sort order)" type="number" value={planForm.sortOrder} onChange={(e) => setPlanForm(Object.assign({}, planForm, { sortOrder: e.target.value }))} className="px-3 py-2 border border-slate-200 rounded-lg text-xs" />
                <textarea placeholder="फीचर्स (हर पंक्ति एक फीचर)" value={planForm.features} onChange={(e) => setPlanForm(Object.assign({}, planForm, { features: e.target.value }))} className="px-3 py-2 border border-slate-200 rounded-lg text-xs h-20 col-span-1 sm:col-span-2 lg:col-span-3" />
              </div>

              <div className="mt-4">
                <div className="text-xs font-bold text-slate-600 mb-2">मॉड्यूल एक्सेस</div>
                <div className="flex flex-wrap gap-2">
                  {MODULE_OPTIONS.map((m) => (
                    <button key={m} onClick={() => toggleModule(m)} className={'px-2.5 py-1 rounded-full text-[11px] font-bold border transition cursor-pointer ' + (planForm.modules.indexOf(m) !== -1 ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50')}>{m}</button>
                  ))}
                </div>
              </div>

              <div className="mt-4">
                <div className="text-xs font-bold text-slate-600 mb-2">फीचर फ्लैग्स</div>
                <div className="flex flex-wrap gap-3">
                  {FLAG_OPTIONS.map((f) => (
                    <label key={f.key} className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                      <input type="checkbox" checked={!!(planForm as any)[f.key]} onChange={() => toggleFlag(f.key)} className="accent-blue-600" /> {f.label}
                    </label>
                  ))}
                  <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer"><input type="checkbox" checked={planForm.recommended} onChange={(e) => setPlanForm(Object.assign({}, planForm, { recommended: e.target.checked }))} className="accent-blue-600" /> अनुशंसित</label>
                  <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer"><input type="checkbox" checked={planForm.active} onChange={(e) => setPlanForm(Object.assign({}, planForm, { active: e.target.checked }))} className="accent-blue-600" /> सक्रिय</label>
                  <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer"><input type="checkbox" checked={planForm.isTrial} onChange={(e) => setPlanForm(Object.assign({}, planForm, { isTrial: e.target.checked }))} className="accent-blue-600" /> ट्रायल प्लान</label>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2">
                <button onClick={savePlan} disabled={busyId === 'plan-save'} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition cursor-pointer disabled:opacity-50">सेव करें</button>
                <button onClick={() => setShowPlanForm(false)} className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold rounded-xl transition cursor-pointer">रद्द</button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400 gap-2"><Loader2 className="w-5 h-5 animate-spin" /> लोड हो रहा है...</div>
          ) : (
            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-100">
                    <th className="py-2 pr-3 font-bold">प्लान</th>
                    <th className="py-2 px-3 font-bold">कीमत (₹)</th>
                    <th className="py-2 px-3 font-bold">सीमा</th>
                    <th className="py-2 px-3 font-bold">मॉड्यूल</th>
                    <th className="py-2 px-3 font-bold">स्थिति</th>
                    <th className="py-2 px-3 font-bold">कार्रवाई</th>
                  </tr>
                </thead>
                <tbody>
                  {plans.length === 0 && (
                    <tr><td colSpan={6} className="py-8 text-center text-slate-400">कोई प्लान नहीं मिला।</td></tr>
                  )}
                  {plans.map((p) => (
                    <tr key={p.id} className="border-b border-slate-50">
                      <td className="py-3 pr-3">
                        <div className="font-bold text-slate-900">{p.name} {p.recommended && <span className="ml-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[9px] font-bold">अनुशंसित</span>}</div>
                        <div className="text-[10px] text-slate-400">{p.tagline}</div>
                        <div className="text-[10px] text-slate-300">ID: {p.id}</div>
                      </td>
                      <td className="py-3 px-3 text-slate-600">मासिक {p.monthlyPrice}<br />त्रैमासिक {p.quarterlyPrice}<br />वार्षिक {p.annualPrice}</td>
                      <td className="py-3 px-3 text-slate-600">{p.maxStudents || '—'}<br />स्टाफ: {p.maxStaffLimit === null || p.maxStaffLimit === undefined ? 'असीमित' : p.maxStaffLimit}</td>
                      <td className="py-3 px-3 text-slate-600">{(p.modules || []).length} मॉड्यूल<br />{(p.features || []).length} फीचर्स</td>
                      <td className="py-3 px-3">
                        <span className={'px-2 py-0.5 rounded-full text-[10px] font-bold ' + (p.active !== false ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500')}>{p.active !== false ? 'सक्रिय' : 'निष्क्रिय'}</span>
                        {p.isTrial && <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">ट्रायल</span>}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => startPlanEdit(p)} className="px-2 py-1 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-[10px] font-bold cursor-pointer flex items-center gap-1"><Pencil className="w-3 h-3" /> एडिट</button>
                          {!p.isTrial && p.active !== false && (
                            <button onClick={() => deactivatePlan(p.id)} disabled={busyId === p.id} className="px-2 py-1 border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-lg text-[10px] font-bold cursor-pointer disabled:opacity-50 flex items-center gap-1"><Trash2 className="w-3 h-3" /> निष्क्रिय</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
