'use client';

import React, { useState } from 'react';
import {
  Lock,
  Mail,
  Eye,
  EyeOff,
  ShieldCheck,
  GraduationCap,
  School,
  UserCheck,
  AlertCircle,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

interface LoginScreenProps {
  onLoginSuccess: (user: any) => void;
}

export function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
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
        body: JSON.stringify({
          email: email.trim(),
          password: password.trim(),
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        // Store in localStorage for session persistence
        localStorage.setItem('vidyasetu_user', JSON.stringify(data.user));
        localStorage.setItem('vidyasetu_token', data.user.token);
        onLoginSuccess(data.user);
      } else {
        setErrorMsg(data.message || 'लॉगिन विफल। कृपया क्रेडेंशियल जांचें।');
      }
    } catch {
      setErrorMsg('सर्वर से संपर्क करने में समस्या हुई। कृपया पुनः प्रयास करें।');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickFill = (demoEmail: string, demoPass: string) => {
    setEmail(demoEmail);
    setPassword(demoPass);
    setErrorMsg(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 flex flex-col justify-center items-center px-4 py-8">
      {/* Container Box */}
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
        {/* Header Branding */}
        <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white p-6 text-center relative">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 mb-3 shadow-inner">
            <School className="w-8 h-8 text-amber-300" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">विद्या सेतु सीनियर सेकेंडरी स्कूल</h1>
          <p className="text-xs text-blue-200 mt-1">स्कूल प्रबंधन एवं प्रशासनिक पोर्टल - अधिकृत लॉगिन</p>
          <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[11px] font-medium border border-emerald-400/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            सुरक्षित एवं एन्क्रिप्टेड प्रमाणीकरण
          </div>
        </div>

        {/* Login Form */}
        <form onSubmit={handleLogin} className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              पंजीकृत ईमेल आईडी (Email Address)
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="उदा. director@vidyasetuschool.edu.in"
                className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              पासवर्ड (Password)
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="पासवर्ड प्रविष्ट करें"
                className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-white transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                aria-label="पासवर्ड देखें"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 px-4 bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-800 hover:to-indigo-800 text-white font-medium text-sm rounded-xl shadow-md hover:shadow-lg transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>सत्यापन हो रहा है...</span>
              </>
            ) : (
              <>
                <span>पोर्टल में सुरक्षित प्रवेश करें</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Quick Accounts Helper for effortless test access */}
        <div className="bg-slate-50 p-5 border-t border-slate-100">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              त्वरित लॉगिन क्रेडेंशियल्स (अधिकृत भूमिकाएं)
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mb-3">
            नीचे दिए गए किसी भी कार्ड पर क्लिक करके ईमेल और पासवर्ड सीधे फॉर्म में भरें:
          </p>

          <div className="space-y-2">
            {/* Director Account */}
            <button
              type="button"
              onClick={() => handleQuickFill('director@vidyasetuschool.edu.in', 'director123')}
              className="w-full p-2.5 bg-white hover:bg-indigo-50/50 border border-slate-200 hover:border-indigo-300 rounded-xl text-left transition flex items-center justify-between group cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                    <span>निदेशक (Director)</span>
                    <span className="text-[10px] px-1.5 py-0.2 bg-indigo-100 text-indigo-700 rounded font-normal">
                      सुपर एडमिन
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500">director@vidyasetuschool.edu.in</div>
                </div>
              </div>
              <span className="text-[11px] font-mono text-slate-400 group-hover:text-indigo-600">
                director123
              </span>
            </button>

            {/* Principal Account */}
            <button
              type="button"
              onClick={() => handleQuickFill('principal@vidyasetuschool.edu.in', 'principal123')}
              className="w-full p-2.5 bg-white hover:bg-blue-50/50 border border-slate-200 hover:border-blue-300 rounded-xl text-left transition flex items-center justify-between group cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
                  <GraduationCap className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                    <span>प्रधानाचार्य (Principal)</span>
                    <span className="text-[10px] px-1.5 py-0.2 bg-blue-100 text-blue-700 rounded font-normal">
                      अकादमिक हेड
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500">principal@vidyasetuschool.edu.in</div>
                </div>
              </div>
              <span className="text-[11px] font-mono text-slate-400 group-hover:text-blue-600">
                principal123
              </span>
            </button>

            {/* Staff Account */}
            <button
              type="button"
              onClick={() => handleQuickFill('staff@vidyasetuschool.edu.in', 'staff123')}
              className="w-full p-2.5 bg-white hover:bg-emerald-50/50 border border-slate-200 hover:border-emerald-300 rounded-xl text-left transition flex items-center justify-between group cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
                  <UserCheck className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                    <span>स्टाफ / शिक्षक (Staff)</span>
                    <span className="text-[10px] px-1.5 py-0.2 bg-emerald-100 text-emerald-700 rounded font-normal">
                      कक्षा अध्यापक
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500">staff@vidyasetuschool.edu.in</div>
                </div>
              </div>
              <span className="text-[11px] font-mono text-slate-400 group-hover:text-emerald-600">
                staff123
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="mt-6 text-center text-xs text-slate-400">
        <p>विद्या सेतु विद्यालय प्रबंधन प्रणाली • सत्र 2026-27</p>
        <p className="text-[10px] text-slate-500 mt-0.5">अधिकृत एवं सुरक्षित पोर्टल</p>
      </div>
    </div>
  );
}
