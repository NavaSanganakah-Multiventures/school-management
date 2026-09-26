'use client';

import React, {useState} from 'react';
import Link from 'next/link';
import {
  GraduationCap,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Rocket,
  School,
} from 'lucide-react';

const PLANS = [
  {id: 'trial', name: '7-दिन ट्रायल'},
  {id: 'starter', name: 'Starter'},
  {id: 'pro', name: 'Pro'},
  {id: 'enterprise', name: 'Enterprise'},
];

interface RegisterResult {
  success?: boolean;
  message?: string;
  schoolId?: string;
  /**
   * The subdomain the school WILL have. Present even while provisioning, so the
   * director can see the address their portal is being prepared at.
   */
  portalDomain?: string;
  /** 'live' once the dedicated worker is serving this school, else 'provisioning'. */
  portalStatus?: 'live' | 'provisioning';
  /**
   * The portal URL. Null while `portalStatus` is 'provisioning' — at
   * registration the dedicated worker does not exist yet, and the subdomain
   * resolves to the platform's public website rather than a school portal.
   */
  dedicatedDomain?: string | null;
  dedicatedUrl?: string | null;
  /** Something the customer can actually open right now. */
  platformUrl?: string;
  trialEndsAt?: string;
}

export function RegisterForm() {
  const [form, setForm] = useState({
    schoolName: '',
    directorName: '',
    email: '',
    phone: '',
    password: '',
    subdomain: '',
    boardName: 'CBSE',
    city: '',
    state: '',
    estimatedStudents: '',
    estimatedStaff: '',
    preferredPlanId: 'trial',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<RegisterResult | null>(null);

  const update = (key: string, value: string) => setForm((prev) => ({...prev, [key]: value}));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setResult(null);

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
      const sanitizedSubdomain = form.subdomain
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '')
        .replace(/--+/g, '-')
        .replace(/^-+|-+$/g, '');
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          ...form,
          subdomain: sanitizedSubdomain,
          estimatedStudents: Number(form.estimatedStudents) || 0,
          estimatedStaff: Number(form.estimatedStaff) || 0,
        }),
      });
      const data: RegisterResult = await res.json();
      if (res.ok && data.success) {
        setResult(data);
      } else {
        setErrorMsg(data.message || 'पंजीकरण विफल रहा। कृपया पुनः प्रयास करें।');
      }
    } catch (e) {
      setErrorMsg('सर्वर से संपर्क करने में समस्या हुई। कृपया पुनः प्रयास करें।');
    } finally {
      setIsLoading(false);
    }
  };

  // ── Success state — instant trial started ───────────────────
  if (result && result.success) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 py-10 text-slate-100">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/70 p-8 text-center shadow-2xl">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400">
            <CheckCircle2 className="h-9 w-9" />
          </span>
          <h1 className="mt-5 text-xl font-bold">पंजीकरण सफल — FREE TRIAL सक्रिय! 🎉</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">{result.message}</p>
          {/*
            The portal block only becomes a link once the dedicated worker is
            actually serving this school.

            While provisioning, the subdomain resolves to the platform's public
            website, not to a school portal — so rendering it as an anchor, even
            with a "portal तैयार होने पर लॉगिन करें" label, sent the director to
            the marketing landing page and implied the link worked. The address
            is still shown, as plain text, so they know what to expect.
          */}
          {result.portalStatus === 'live' && result.dedicatedUrl ? (
            <div className="mt-6 rounded-xl border border-indigo-500/40 bg-indigo-950/40 p-4">
              <p className="text-xs font-semibold tracking-wide text-indigo-300">आपका स्कूल पोर्टल</p>
              <a
                href={result.dedicatedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-2 font-bold text-indigo-300 underline decoration-indigo-500 underline-offset-4 hover:text-white"
              >
                <Rocket className="h-4 w-4" /> {result.dedicatedDomain}
              </a>
            </div>
          ) : result.portalDomain ? (
            <div className="mt-6 rounded-xl border border-amber-500/40 bg-amber-950/30 p-4">
              <p className="text-xs font-semibold tracking-wide text-amber-300">आपका स्कूल पोर्टल — तैयार हो रहा है</p>
              <p className="mt-1 font-bold text-amber-200/90">{result.portalDomain}</p>
              <p className="mt-2 text-xs leading-relaxed text-amber-200/70">
                पोर्टल कुछ ही मिनटों में तैयार हो जाएगा। तैयार होने पर हम आपको ईमेल करेंगे — तब तक नीचे दिए गए लिंक से प्लेटफ़ॉर्म देख सकते हैं।
              </p>
            </div>
          ) : null}
          {result.trialEndsAt && (
            <p className="mt-4 text-xs text-slate-500">Trial समाप्ति: {result.trialEndsAt} · उसके बाद आप योजना चुन सकते हैं</p>
          )}
          <div className="mt-7 flex flex-col gap-2.5">
            {/*
              The single call to action follows portalStatus. When there is no live
              portal there is nothing to log into yet, so the button goes to the
              platform instead. Previously this href fell back to
              'https://' + result.dedicatedDomain, which with a null
              dedicatedDomain produced the literal string "https://null".
            */}
            {result.portalStatus === 'live' && result.dedicatedUrl ? (
              <a
                href={result.dedicatedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-900/40 transition hover:from-indigo-500 hover:to-violet-500"
              >
                अपने स्कूल पोर्टल में लॉगिन करें
              </a>
            ) : (
              <a
                href={result.platformUrl || '/'}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-900/40 transition hover:from-indigo-500 hover:to-violet-500"
              >
                प्लेटफ़ॉर्म देखें
              </a>
            )}
            <Link href="/" className="rounded-xl border border-slate-700 py-3 text-sm font-semibold text-slate-300 transition hover:border-slate-500 hover:bg-slate-900">
              होम पेज पर वापस
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Form ────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800/70 bg-slate-950/85">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3.5 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-700">
              <GraduationCap className="h-5 w-5 text-white" />
            </span>
            <span className="text-lg font-bold tracking-tight">Pragnya Mitra</span>
          </Link>
          <Link href="/" className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> होम
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <div className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-4 py-1.5 text-xs font-semibold text-emerald-300">
            <School className="h-3.5 w-3.5" /> 7-दिन FREE TRIAL · कोई approval नहीं · तुरंत सक्रिय
          </span>
          <h1 className="mt-5 text-3xl font-extrabold tracking-tight sm:text-4xl">नया स्कूल पंजीकरण</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-slate-400">
            फॉर्म भरते ही आपके स्कूल का खाता सक्रिय हो जाएगा और आपका निजी पोर्टल
            (<span className="text-slate-300">slug.pragnya.nasven.com</span>) कुछ ही मिनटों में तैयार हो जाएगा।
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="mt-10 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 sm:p-8"
        >
          {errorMsg && (
            <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-sm text-red-300">
              <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold text-slate-300">स्कूल का नाम *</label>
              <input
                value={form.schoolName}
                onChange={(e) => update('schoolName', e.target.value)}
                placeholder="उदा. Pragnya Mitra पब्लिक स्कूल"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-600/40"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-300">डायरेक्टर का नाम *</label>
              <input
                value={form.directorName}
                onChange={(e) => update('directorName', e.target.value)}
                placeholder="निदेशक का पूरा नाम"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-600/40"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-300">ईमेल * (लॉगिन)</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => update('email', e.target.value)}
                placeholder="director@school.in"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-600/40"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-300">फोन नंबर *</label>
              <input
                value={form.phone}
                onChange={(e) => update('phone', e.target.value)}
                placeholder="+91 XXXXX XXXXX"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-600/40"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-300">पासवर्ड * (कम से कम 6 अक्षर)</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => update('password', e.target.value)}
                placeholder="पासवर्ड सेट करें"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-600/40"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-300">पसंदीदा सबडोमेन (वैकल्पिक)</label>
              <div className="flex items-stretch">
                <input
                  value={form.subdomain}
                  onChange={(e) => update('subdomain', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/--+/g, '-'))}
                  placeholder="उदा. dps-jaipur"
                  className="w-full rounded-l-xl border border-r-0 border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-600/40"
                />
                <span className="flex items-center rounded-r-xl border border-l-0 border-slate-700 bg-slate-900 px-3 text-[11px] text-slate-500">
                  .pragnya.nasven.com
                </span>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-300">बोर्ड</label>
              <input
                value={form.boardName}
                onChange={(e) => update('boardName', e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-600/40"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-300">शहर</label>
              <input
                value={form.city}
                onChange={(e) => update('city', e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-600/40"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-300">राज्य</label>
              <input
                value={form.state}
                onChange={(e) => update('state', e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-600/40"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-300">अनुमानित छात्र</label>
              <input
                type="number"
                value={form.estimatedStudents}
                onChange={(e) => update('estimatedStudents', e.target.value)}
                placeholder="उदा. 450"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-600/40"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-300">अनुमानित स्टाफ</label>
              <input
                type="number"
                value={form.estimatedStaff}
                onChange={(e) => update('estimatedStaff', e.target.value)}
                placeholder="उदा. 25"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-600/40"
              />
            </div>
          </div>

          <div className="mt-5">
            <label className="mb-2 block text-xs font-semibold text-slate-300">इच्छित योजना (वैकल्पिक)</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PLANS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => update('preferredPlanId', p.id)}
                  className={
                    'rounded-xl border py-2.5 text-sm font-semibold transition ' +
                    (form.preferredPlanId === p.id
                      ? 'border-indigo-500 bg-indigo-600/20 text-white ring-1 ring-indigo-500'
                      : 'border-slate-700 bg-slate-950 text-slate-400 hover:border-slate-500 hover:text-slate-200')
                  }
                >
                  {p.name}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-slate-500">हर नए स्कूल को पहले 7-दिन FREE TRIAL मिलता है — चुनी गई योजना ट्रायल के बाद लागू होगी।</p>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 py-3.5 text-base font-bold text-white shadow-lg shadow-indigo-900/40 transition hover:from-indigo-500 hover:to-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Rocket className="h-5 w-5" />}
            {isLoading ? 'पंजीकरण हो रहा है...' : 'रजिस्टर करें और FREE TRIAL शुरू करें'}
          </button>

          <p className="mt-4 text-center text-xs text-slate-500">
            पंजीकरण करके आप हमारी सेवा शर्तों से सहमत होते हैं। किसी भी सहायता के लिए: pragnya@navasanganakah.com
          </p>
        </form>
      </main>
    </div>
  );
}