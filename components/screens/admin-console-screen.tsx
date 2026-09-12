'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, RefreshCw, CheckCircle2, XCircle, School, IndianRupee, Loader2 } from 'lucide-react';

interface SchoolRow {
  id: string;
  schoolName: string;
  subdomain: string;
  contactEmail: string;
  contactPhone: string;
  status: string;
  registrationStatus: string;
  planId: string;
  planName: string;
  trialEndsAt: string;
  createdAt: string;
}

const PLAN_OPTIONS = [
  { id: 'starter', label: 'स्टार्टर' },
  { id: 'pro', label: 'प्रोफेशनल' },
  { id: 'enterprise', label: 'एंटरप्राइज' },
];

export function AdminConsoleScreen() {
  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [registrations, setRegistrations] = useState<SchoolRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ schoolName: '', email: '', phone: '' });

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [sRes, rRes] = await Promise.all([
        fetch('/api/admin/schools').then((r) => r.json()),
        fetch('/api/admin/registrations').then((r) => r.json()),
      ]);
      if (sRes.success) setSchools(sRes.schools || []);
      if (rRes.success) setRegistrations(rRes.registrations || []);
      else if (sRes.message) setErrorMsg(sRes.message);
    } catch (e) {
      setErrorMsg('सर्वर से संपर्क करने में समस्या हुई।');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const approve = async (schoolId: string) => {
    setBusyId(schoolId);
    try {
      const res = await fetch('/api/admin/registrations/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ schoolId }) });
      const data = await res.json();
      if (data.success) await loadData();
      else setErrorMsg(data.message || 'अप्रूवल विफल।');
    } catch (e) {
      setErrorMsg('नेटवर्क त्रुटि।');
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (schoolId: string) => {
    setBusyId(schoolId);
    try {
      const res = await fetch('/api/admin/registrations/reject', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ schoolId }) });
      const data = await res.json();
      if (data.success) await loadData();
      else setErrorMsg(data.message || 'अस्वीकृति विफल।');
    } catch (e) {
      setErrorMsg('नेटवर्क त्रुटि।');
    } finally {
      setBusyId(null);
    }
  };

  const setPlan = async (schoolId: string, planId: string) => {
    setBusyId(schoolId);
    try {
      const res = await fetch('/api/admin/schools/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ schoolId, planId }) });
      const data = await res.json();
      if (data.success) await loadData();
      else setErrorMsg(data.message || 'प्लान बदलने में त्रुटि।');
    } catch (e) {
      setErrorMsg('नेटवर्क त्रुटि।');
    } finally {
      setBusyId(null);
    }
  };

  const startEdit = (s: SchoolRow) => {
    setEditId(s.id);
    setEditForm({ schoolName: s.schoolName, email: s.contactEmail, phone: s.contactPhone });
  };

  const saveEdit = async (schoolId: string) => {
    setBusyId(schoolId);
    try {
      const res = await fetch('/api/admin/schools/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ schoolId, schoolName: editForm.schoolName, email: editForm.email, phone: editForm.phone }) });
      const data = await res.json();
      if (data.success) { setEditId(null); await loadData(); }
      else setErrorMsg(data.message || 'अपडेट विफल।');
    } catch (e) {
      setErrorMsg('नेटवर्क त्रुटि।');
    } finally {
      setBusyId(null);
    }
  };

  const totalActive = schools.filter((s) => s.status === 'Active').length;
  const totalTrial = schools.filter((s) => s.status === 'Trial').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2"><ShieldCheck className="w-6 h-6 text-rose-600" /> Super Admin कंसोल</h2>
          <p className="text-sm text-slate-500">सभी विद्यालय, उनके प्लान, ट्रायल और रजिस्ट्रेशन अप्रूवल का प्रबंधन</p>
        </div>
        <button onClick={loadData} className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer">
          <RefreshCw className="w-4 h-4" /> रिफ्रेश
        </button>
      </div>

      {errorMsg && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">{errorMsg}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
          <div className="text-2xl font-black text-slate-900">{schools.length}</div>
          <div className="text-xs font-semibold text-slate-500">कुल विद्यालय</div>
        </div>
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
          <div className="text-2xl font-black text-amber-600">{registrations.length}</div>
          <div className="text-xs font-semibold text-slate-500">लंबित अप्रूवल</div>
        </div>
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
          <div className="text-2xl font-black text-blue-700">{totalActive}</div>
          <div className="text-xs font-semibold text-slate-500">सक्रिय (पेड प्लान)</div>
        </div>
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
          <div className="text-2xl font-black text-emerald-600">{totalTrial}</div>
          <div className="text-xs font-semibold text-slate-500">ट्रायल पर</div>
        </div>
      </div>

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
                  <th className="py-2 px-3 font-bold">स्थिति</th>
                  <th className="py-2 px-3 font-bold">वर्तमान प्लान</th>
                  <th className="py-2 px-3 font-bold">ट्रायल समाप्ति</th>
                  <th className="py-2 px-3 font-bold">कार्रवाई</th>
                </tr>
              </thead>
              <tbody>
                {schools.length === 0 && (
                  <tr><td colSpan={5} className="py-8 text-center text-slate-400">अभी कोई विद्यालय नहीं है।</td></tr>
                )}
                {schools.map((s) => (
                  <tr key={s.id} className="border-b border-slate-50">
                    <td className="py-3 pr-3">
                      {editId === s.id ? (
                        <div className="space-y-1.5">
                          <input value={editForm.schoolName} onChange={(e) => setEditForm(Object.assign({}, editForm, { schoolName: e.target.value }))} className="w-full px-2 py-1 border border-slate-200 rounded-lg text-xs" />
                          <input value={editForm.email} onChange={(e) => setEditForm(Object.assign({}, editForm, { email: e.target.value }))} className="w-full px-2 py-1 border border-slate-200 rounded-lg text-xs" />
                          <input value={editForm.phone} onChange={(e) => setEditForm(Object.assign({}, editForm, { phone: e.target.value }))} className="w-full px-2 py-1 border border-slate-200 rounded-lg text-xs" />
                        </div>
                      ) : (
                        <>
                          <div className="font-bold text-slate-900">{s.schoolName}</div>
                          <div className="text-[10px] text-slate-400">{s.contactEmail} • {s.contactPhone}</div>
                        </>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <span className={'px-2 py-0.5 rounded-full text-[10px] font-bold ' + (s.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : s.status === 'Trial' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600')}>{s.status}</span>
                    </td>
                    <td className="py-3 px-3">
                      <select value={s.planId} onChange={(e) => setPlan(s.id, e.target.value)} className="px-2 py-1 border border-slate-200 rounded-lg text-xs bg-white">
                        {PLAN_OPTIONS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                      </select>
                    </td>
                    <td className="py-3 px-3 text-slate-600">{s.trialEndsAt || '—'}</td>
                    <td className="py-3 px-3">
                      {editId === s.id ? (
                        <div className="flex items-center gap-1">
                          <button onClick={() => saveEdit(s.id)} className="px-2 py-1 bg-blue-600 text-white rounded-lg text-[10px] font-bold cursor-pointer">सहेजें</button>
                          <button onClick={() => setEditId(null)} className="px-2 py-1 border border-slate-200 rounded-lg text-[10px] font-bold cursor-pointer">रद्द</button>
                        </div>
                      ) : (
                        <button onClick={() => startEdit(s)} className="px-2 py-1 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-[10px] font-bold cursor-pointer">संपादित करें</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
