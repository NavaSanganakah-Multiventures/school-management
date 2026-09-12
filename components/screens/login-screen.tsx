'use client';

import React, { useState } from 'react';
import { Lock, Mail, Eye, EyeOff, School, AlertCircle, ArrowRight, UserPlus } from 'lucide-react';

interface LoginScreenProps {
  onLoginSuccess: (user: any, token: string) => void;
  onRegister: () => void;
}

export function LoginScreen({ onLoginSuccess, onRegister }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!email.trim() || !password.trim()) {
      setErrorMsg('कृपया ईमेल पता और पासवर्ड दोनों प्रविष्ट करें।');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password: password.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.token) {
        onLoginSuccess(data.user, data.token);
      } else {
        setErrorMsg(data.message || 'लॉगिन विफल। कृपया क्रेडेंशियल जांचें।');
      }
    } catch (e) {
      setErrorMsg('सर्वर से संपर्क करने में समस्या हुई। कृपया पुनः प्रयास करें।');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 flex flex-col justify-center items-center px-4 py-8">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
        <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white p-6 text-center relative">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 mb-3 shadow-inner">
            <School className="w-8 h-8 text-amber-300" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">विद्या सेतु स्कूल प्रबंधन</h1>
          <p className="text-xs text-blue-200 mt-1">अधिकृत लॉगिन — भूमिका क्रेडेंशियल्स से स्वतः पहचानी जाती है</p>
          <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[11px] font-medium border border-emerald-400/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            सुरक्षित एवं एन्क्रिप्टेड प्रमाणीकरण
          </div>
        </div>

        <form onSubmit={handleLogin} className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">पंजीकृत ईमेल आईडी</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="आपका पंजीकृत ईमेल" className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white transition" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">पासवर्ड</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input type={showPassword ? 'text' : 'password'} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="पासवर्ड प्रविष्ट करें" className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white transition" />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1" aria-label="पासवर्ड देखें">
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button type="submit" disabled={isLoading} className="w-full py-2.5 px-4 bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-800 hover:to-indigo-800 text-white font-medium text-sm rounded-xl shadow-md hover:shadow-lg transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
            {isLoading ? (
              <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /><span>सत्यापन हो रहा है...</span></span>
            ) : (
              <span className="flex items-center gap-2"><span>पोर्टल में सुरक्षित प्रवेश करें</span><ArrowRight className="w-4 h-4" /></span>
            )}
          </button>
        </form>

        <div className="bg-slate-50 p-5 border-t border-slate-100">
          <p className="text-xs text-slate-600 mb-3">नया विद्यालय पंजीकृत करना चाहते हैं? Super Admin अप्रूवल के बाद 7-दिन का फ्री ट्रायल मिलेगा।</p>
          <button type="button" onClick={onRegister} className="w-full py-2.5 px-4 border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-800 font-semibold text-sm rounded-xl transition flex items-center justify-center gap-2 cursor-pointer">
            <UserPlus className="w-4 h-4" />
            <span>नया स्कूल रजिस्टर करें</span>
          </button>
        </div>
      </div>

      <div className="mt-6 text-center text-xs text-slate-400">
        <p>विद्या सेतु विद्यालय प्रबंधन प्रणाली • सत्र 2026-27</p>
        <p className="text-[10px] text-slate-500 mt-0.5">अधिकृत एवं सुरक्षित पोर्टल</p>
      </div>
    </div>
  );
}
