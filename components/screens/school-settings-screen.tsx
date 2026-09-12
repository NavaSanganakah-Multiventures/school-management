'use client';

import React, { useState, useEffect } from 'react';
import { Settings, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

export function SchoolSettingsScreen({ userRole }: { userRole: string }) {
  const [form, setForm] = useState({
    schoolName: '',
    affiliationNumber: '',
    boardName: '',
    schoolCode: '',
    email: '',
    phone: '',
    alternatePhone: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    academicSession: '',
    directorName: '',
    principalName: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/school-profile')
      .then((res) => res.json())
      .then((data) => {
        if (active && data.success && data.profile) {
          setForm({
            schoolName: data.profile.schoolName || '',
            affiliationNumber: data.profile.affiliationNumber || '',
            boardName: data.profile.boardName || '',
            schoolCode: data.profile.schoolCode || '',
            email: data.profile.email || '',
            phone: data.profile.phone || '',
            alternatePhone: data.profile.alternatePhone || '',
            address: data.profile.address || '',
            city: data.profile.city || '',
            state: data.profile.state || '',
            pincode: data.profile.pincode || '',
            academicSession: data.profile.academicSession || '',
            directorName: data.profile.directorName || '',
            principalName: data.profile.principalName || '',
          });
        } else if (active && data.message) {
          setMessage({ type: 'error', text: data.message });
        }
      })
      .catch(() => setMessage({ type: 'error', text: 'स्कूल प्रोफ़ाइल लोड करने में समस्या हुई।' }))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const update = (key: string, value: string) => setForm((prev) => Object.assign({}, prev, { [key]: value }));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/school-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMessage({ type: 'success', text: data.message });
        if (data.profile) {
          setForm({
            schoolName: data.profile.schoolName || '', affiliationNumber: data.profile.affiliationNumber || '', boardName: data.profile.boardName || '', schoolCode: data.profile.schoolCode || '',
            email: data.profile.email || '', phone: data.profile.phone || '', alternatePhone: data.profile.alternatePhone || '', address: data.profile.address || '', city: data.profile.city || '', state: data.profile.state || '', pincode: data.profile.pincode || '',
            academicSession: data.profile.academicSession || '', directorName: data.profile.directorName || '', principalName: data.profile.principalName || '',
          });
        }
      } else {
        setMessage({ type: 'error', text: data.message || 'अपडेट विफल।' });
      }
    } catch (e) {
      setMessage({ type: 'error', text: 'सर्वर से संपर्क करने में समस्या हुई।' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-16 text-slate-400 gap-2"><Loader2 className="w-5 h-5 animate-spin" /> लोड हो रहा है...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-black text-slate-900 flex items-center gap-2"><Settings className="w-6 h-6 text-blue-700" /> स्कूल प्रोफ़ाइल व सेटिंग्स</h2>
        <p className="text-sm text-slate-500">यह जानकारी सीधे आपके स्कूल के D1 रिकॉर्ड में सहेजी जाती है।</p>
      </div>

      {message && (
        <div className={'p-3 rounded-xl border text-xs flex items-center gap-2 ' + (message.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-700')}>
          {message.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{message.text}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">स्कूल का नाम</label>
            <input value={form.schoolName} onChange={(e) => update('schoolName', e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">एफिलिएशन सं.</label>
            <input value={form.affiliationNumber} onChange={(e) => update('affiliationNumber', e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">बोर्ड</label>
            <input value={form.boardName} onChange={(e) => update('boardName', e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">स्कूल कोड</label>
            <input value={form.schoolCode} onChange={(e) => update('schoolCode', e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">ईमेल</label>
            <input value={form.email} onChange={(e) => update('email', e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">फोन</label>
            <input value={form.phone} onChange={(e) => update('phone', e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">वैकल्पिक फोन</label>
            <input value={form.alternatePhone} onChange={(e) => update('alternatePhone', e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">शैक्षणिक सत्र</label>
            <input value={form.academicSession} onChange={(e) => update('academicSession', e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">डायरेक्टर का नाम</label>
            <input value={form.directorName} onChange={(e) => update('directorName', e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">प्रधानाचार्य का नाम</label>
            <input value={form.principalName} onChange={(e) => update('principalName', e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">पता</label>
            <input value={form.address} onChange={(e) => update('address', e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">शहर</label>
            <input value={form.city} onChange={(e) => update('city', e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">राज्य</label>
            <input value={form.state} onChange={(e) => update('state', e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">पिनकोड</label>
            <input value={form.pincode} onChange={(e) => update('pincode', e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600" />
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button type="submit" disabled={saving} className="px-5 py-2.5 bg-blue-700 hover:bg-blue-800 text-white text-sm font-bold rounded-xl transition cursor-pointer disabled:opacity-50 flex items-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {saving ? 'सहेजा जा रहा है...' : 'सेटिंग्स सहेजें'}
          </button>
        </div>
      </form>
    </div>
  );
}
