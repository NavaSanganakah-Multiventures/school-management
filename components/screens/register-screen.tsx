'use client';

import React, { useState } from 'react';
import { School, UserPlus, ArrowLeft, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

interface RegisterScreenProps {
  onBackToLogin: () => void;
  onRegistered: () => void;
}

export function RegisterScreen({ onBackToLogin, onRegistered }: RegisterScreenProps) {
  const [form, setForm] = useState({
    schoolName: '',
    directorName: '',
    email: '',
    phone: '',
    password: '',
    affiliationNumber: '',
    boardName: 'CBSE',
    schoolCode: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    principalName: '',
    alternatePhone: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const update = (key: string, value: string) => setForm((prev) => Object.assign({}, prev, { [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccess(null);

    if (!form.schoolName.trim() || !form.directorName.trim() || !form.email.trim() || !form.phone.trim() || !form.password.trim()) {
      setErrorMsg('स्कूल का नाम, डायरेक्टर का नाम, ईमेल, फोन और पासवर्ड अनिवार्य हैं।');
      return;
    }
    if (form.password.length < 6) {
      setErrorMsg('पासवर्ड कम से कम 6 अक्षरों का होना चाहिए।');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccess(data.message);
      } else {
        setErrorMsg(data.message || 'पंजीकरण विफल रहा।');
      }
    } catch (e) {
      setErrorMsg('सर्वर से संपर्क करने में समस्या हुई।');
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 flex flex-col justify-center items-center px-4 py-8">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
          <div className="p-8 text-center space-y-4">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">पंजीकरण अनुरोध प्राप्त हुआ</h2>
            <p className="text-sm text-slate-600">{success}</p>
            <p className="text-xs text-slate-500">अप्रूवल के बाद आप अपने ईमेल और पासवर्ड से लॉगिन कर पाएंगे।</p>
            <button onClick={onRegistered} className="w-full py-2.5 px-4 bg-blue-700 hover:bg-blue-800 text-white font-semibold text-sm rounded-xl transition cursor-pointer flex items-center justify-center gap-2">
              <ArrowLeft className="w-4 h-4" /> लॉगिन पोर्टल पर वापस जाएं
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 flex flex-col justify-center items-center px-4 py-8">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
        <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white p-6 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/10 border border-white/20 mb-2">
            <School className="w-7 h-7 text-amber-300" />
          </div>
          <h1 className="text-lg font-bold">प्रज्ञा मित्र — नया विद्यालय पंजीकरण</h1>
          <p className="text-xs text-blue-200 mt-1">अप्रूवल के बाद 7-दिन का फ्री ट्रायल स्वतः शुरू होगा</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">स्कूल का नाम *</label>
              <input value={form.schoolName} onChange={(e) => update('schoolName', e.target.value)} placeholder="उदा. प्रज्ञा मित्र आदर्श पब्लिक स्कूल" className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">डायरेक्टर का नाम *</label>
              <input value={form.directorName} onChange={(e) => update('directorName', e.target.value)} placeholder="निदेशक का पूरा नाम" className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">ईमेल *</label>
              <input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="director@school.in" className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">फोन नंबर *</label>
              <input value={form.phone} onChange={(e) => update('phone', e.target.value)} placeholder="+91 XXXXX XXXXX" className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">पासवर्ड * (कम से कम 6 अक्षर)</label>
              <input type="password" value={form.password} onChange={(e) => update('password', e.target.value)} placeholder="पासवर्ड सेट करें" className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">बोर्ड</label>
              <input value={form.boardName} onChange={(e) => update('boardName', e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">एफिलिएशन सं.</label>
              <input value={form.affiliationNumber} onChange={(e) => update('affiliationNumber', e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">स्कूल कोड</label>
              <input value={form.schoolCode} onChange={(e) => update('schoolCode', e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">प्रधानाचार्य का नाम</label>
              <input value={form.principalName} onChange={(e) => update('principalName', e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">वैकल्पिक फोन</label>
              <input value={form.alternatePhone} onChange={(e) => update('alternatePhone', e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600" />
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
            <button type="submit" disabled={isLoading} className="flex-1 py-2.5 px-4 bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-800 hover:to-indigo-800 text-white font-semibold text-sm rounded-xl shadow-md transition flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer">
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              <span>{isLoading ? 'सबमिट हो रहा है...' : 'रजिस्ट्रेशन अनुरोध सबमिट करें'}</span>
            </button>
            <button type="button" onClick={onBackToLogin} className="px-4 py-2.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-sm rounded-xl transition cursor-pointer flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" /> वापस
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
