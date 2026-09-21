'use client';

import React, { useState } from 'react';
import {
  School,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Shield,
  ArrowRight,
  UserCheck,
  AlertCircle,
  GraduationCap,
  Sparkles,
} from 'lucide-react';

interface LoginScreenProps {
  onLoginSuccess: (userData: any) => void;
}

export function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!email || !password) {
      setErrorMsg('कृपया ईमेल और पासवर्ड दोनों दर्ज करें।');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password: password.trim() }),
      });

      const data = await res.json();

      if (data.success && data.user) {
        // Save auth state
        localStorage.setItem('vidyasetu_auth_user', JSON.stringify(data.user));
        if (data.schoolProfile) {
          localStorage.setItem('vidyasetu_school_profile', JSON.stringify(data.schoolProfile));
        }
        onLoginSuccess(data.user);
      } else {
        setErrorMsg(data.message || 'अमान्य ईमेल या पासवर्ड। कृपया पुनः प्रयास करें।');
      }
    } catch {
      setErrorMsg('सर्वर से कनेक्ट करने में त्रुटि। कृपया इंटरनेट जांचें।');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickSelect = (userEmail: string, userPass: string) => {
    setEmail(userEmail);
    setPassword(userPass);
    setErrorMsg(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-3">
        {/* School Crest Logo */}
        <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-gradient-to-tr from-blue-700 to-indigo-600 text-white shadow-xl shadow-blue-500/20 ring-4 ring-white/10">
          <School className="h-8 w-8" />
        </div>

        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            Pragnya Mitra पब्लिक स्कूल
          </h1>
          <p className="text-xs text-blue-200/90 font-medium mt-1">
            केंद्रीय माध्यमिक शिक्षा बोर्ड (CBSE) संबद्ध • प्रशासनिक व शैक्षणिक पोर्टल
          </p>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-2xl rounded-3xl sm:px-10 border border-slate-100">
          <div className="mb-6 border-b border-slate-100 pb-4 text-center">
            <h2 className="text-base font-bold text-slate-900">
              सुरक्षित पोर्टल लॉगिन (Admin Sign In)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              अपनी अधिकृत ईमेल आईडी व पासवर्ड दर्ज करें
            </p>
          </div>

          {errorMsg && (
            <div className="mb-5 p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-800 animate-in fade-in">
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                ईमेल पता (Email Address)
              </label>
              <div className="relative rounded-xl shadow-2xs">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Mail className="h-4 w-4" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="उदा. director@vidyasetuschool.edu.in"
                  required
                  className="block w-full pl-10 pr-3.5 py-2.5 text-xs sm:text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all placeholder:text-slate-400"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  पासवर्ड (Password)
                </label>
              </div>
              <div className="relative rounded-xl shadow-2xs">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="अपना पासवर्ड दर्ज करें"
                  required
                  className="block w-full pl-10 pr-10 py-2.5 text-xs sm:text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all placeholder:text-slate-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl shadow-md text-xs sm:text-sm font-bold text-white bg-blue-900 hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-900 transition-all active:scale-[0.99] disabled:opacity-50 cursor-pointer mt-2"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>सत्यापित हो रहा है...</span>
                </div>
              ) : (
                <>
                  <span>लॉगिन करें</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Access Credentials Selector */}
          <div className="mt-6 pt-5 border-t border-slate-100">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                त्वरित लॉगिन क्रेडेंशियल्स (Quick Select)
              </span>
              <span className="text-[10px] text-slate-400">1-क्लिक में भरें</span>
            </div>

            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={() => handleQuickSelect('director@vidyasetuschool.edu.in', 'director123')}
                className="flex items-center justify-between p-2.5 rounded-xl border border-amber-200 bg-amber-50/50 hover:bg-amber-100/70 transition-all text-left group cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-lg bg-amber-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                    नि
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 group-hover:text-amber-900">
                      निदेशक (Director - Super Admin)
                    </h4>
                    <p className="text-[10px] text-slate-500 font-mono">director@vidyasetuschool.edu.in</p>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-amber-700 bg-white px-2 py-0.5 rounded-md border border-amber-200">
                  चुनें
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickSelect('principal@vidyasetuschool.edu.in', 'principal123')}
                className="flex items-center justify-between p-2.5 rounded-xl border border-indigo-200 bg-indigo-50/50 hover:bg-indigo-100/70 transition-all text-left group cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                    प्र
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 group-hover:text-indigo-900">
                      प्रधानाचार्य (Principal - Academic Head)
                    </h4>
                    <p className="text-[10px] text-slate-500 font-mono">principal@vidyasetuschool.edu.in</p>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-indigo-700 bg-white px-2 py-0.5 rounded-md border border-indigo-200">
                  चुनें
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickSelect('staff@vidyasetuschool.edu.in', 'staff123')}
                className="flex items-center justify-between p-2.5 rounded-xl border border-emerald-200 bg-emerald-50/50 hover:bg-emerald-100/70 transition-all text-left group cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                    शि
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 group-hover:text-emerald-900">
                      स्टाफ शिक्षिका (Staff - Teacher)
                    </h4>
                    <p className="text-[10px] text-slate-500 font-mono">staff@vidyasetuschool.edu.in</p>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-emerald-700 bg-white px-2 py-0.5 rounded-md border border-emerald-200">
                  चुनें
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Security and role permissions note */}
        <div className="mt-6 text-center text-[11px] text-slate-400 space-y-1">
          <p className="flex items-center justify-center gap-1 text-slate-300">
            <Shield className="h-3.5 w-3.5 text-emerald-400" />
            <span>रोल-आधारित एक्सेस कंट्रोल (RBAC) द्वारा पूर्णतः सुरक्षित</span>
          </p>
          <p>© 2026 Pragnya Mitra स्कूल प्रबंधन एवं प्रशासनिक सीआरएम</p>
        </div>
      </div>
    </div>
  );
}
