'use client';

import {useEffect, useState} from 'react';
import Link from 'next/link';
import {ResetPasswordScreen} from '@/components/screens/reset-password-screen';

// Password reset page — reads ?token= (or legacy ?reset=) from the URL and
// delegates to the existing reset form. Used by reset links sent from the
// platform (pragnya.nasven.com/reset?token=...).
export default function ResetPage() {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get('token') || params.get('reset'));
  }, []);

  if (token === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-indigo-500" />
      </div>
    );
  }

  if (!token) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 text-center text-slate-100">
        <p className="text-base font-semibold">अमान्य या समाप्त रीसेट लिंक।</p>
        <p className="mt-2 text-sm text-slate-400">कृपया पुनः पासवर्ड भूल गए विकल्प से नया लिंक माँगें।</p>
        <Link href="/" className="mt-6 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500">
          होम पेज पर जाएं
        </Link>
      </div>
    );
  }

  return (
    <ResetPasswordScreen
      token={token}
      onDone={() => {
        window.location.href = '/';
      }}
      onBackToLogin={() => {
        window.location.href = '/';
      }}
    />
  );
}