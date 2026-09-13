'use client';

import React, { useState } from 'react';
import { Lock, Eye, EyeOff, AlertCircle, CheckCircle2, KeyRound } from 'lucide-react';

interface ResetPasswordScreenProps {
  token: string;
  onDone: () => void;
  onBackToLogin: () => void;
}

export function ResetPasswordScreen({ token, onDone, onBackToLogin }: ResetPasswordScreenProps) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!password || password.length < 6) {
      setError('पासवर्ड कम से कम 6 अक्षरों का होना चाहिए।');
      return;
    }
    if (password !== confirm) {
      setError('दोनों पासवर्ड मेल नहीं खाते। कृपया दोबारा जाँचें।');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token, password: password }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setDone(true);
      } else {
        setError(data.message || 'पासवर्ड सेट करने में त्रुटि हुई।');
      }
    } catch (e) {
      setError('सर्वर से संपर्क करने में समस्या हुई। कृपया पुनः प्रयास करें।');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 flex flex-col justify-center items-center px-4 py-8">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-700 to-indigo-900 text-white p-6 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 mb-3 shadow-inner">
            <KeyRound className="w-8 h-8 text-amber-300" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Pragnya Mitra</h1>
          <p className="text-xs text-indigo-200 mt-1">नया पासवर्ड सेट करें</p>
        </div>

        {done ? (
          <div className="p-6 space-y-4 text-center">
            <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
            <h2 className="text-sm font-bold text-slate-800">पासवर्ड सफलतापूर्वक सेट हो गया।</h2>
            <p className="text-xs text-slate-500">अब आप अपने नए पासवर्ड से लॉगिन कर सकते हैं।</p>
            <button onClick={onDone} className="w-full py-2.5 px-4 bg-gradient-to-r from-indigo-700 to-indigo-800 text-white font-medium text-sm rounded-xl shadow-md hover:shadow-lg transition cursor-pointer">
              लॉगिन पर जाएं
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-xs text-red-700">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">नया पासवर्ड</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input type={showPassword ? 'text' : 'password'} required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="कम से कम 6 अक्षर" className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white transition" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1" aria-label="पासवर्ड देखें">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">पासवर्ड दोबारा लिखें</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input type={showPassword ? 'text' : 'password'} required minLength={6} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="पासवर्ड की पुष्टि करें" className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white transition" />
              </div>
            </div>

            <button type="submit" disabled={loading} className="w-full py-2.5 px-4 bg-gradient-to-r from-indigo-700 to-indigo-800 hover:from-indigo-800 hover:to-indigo-900 text-white font-medium text-sm rounded-xl shadow-md hover:shadow-lg transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
              {loading ? <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /><span>पासवर्ड सेट हो रहा है...</span></span> : <span>पासवर्ड सेट करें</span>}
            </button>

            <button type="button" onClick={onBackToLogin} className="w-full py-2 text-xs text-slate-500 hover:text-slate-700 cursor-pointer">
              ← लॉगिन पर वापस जाएं
            </button>
          </form>
        )}
      </div>

      <div className="mt-6 text-center text-xs text-slate-400">
        <p>Pragnya Mitra • सुरक्षित पासवर्ड प्रबंधन</p>
      </div>
    </div>
  );
}
