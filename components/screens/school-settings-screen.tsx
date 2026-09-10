'use client';

import React, { useState, useEffect } from 'react';
import { School, Save, CheckCircle, Shield, Building, Mail, Phone, MapPin } from 'lucide-react';

interface SchoolSettingsProps {
  userRole: string;
}

export function SchoolSettingsScreen({ userRole }: SchoolSettingsProps) {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/school-profile');
        const data = await res.json();
        if (data.success) {
          setProfile(data.profile);
        }
      } catch {
        //
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      setMessage('');
      const res = await fetch('/api/school-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
      const data = await res.json();
      if (data.success) {
        setMessage('स्कूल प्रोफ़ाइल व सेटिंग्स सफलतापूर्वक सहेजी गईं।');
        setTimeout(() => setMessage(''), 4000);
      }
    } catch {
      //
    } finally {
      setSaving(false);
    }
  };

  if (userRole !== 'Director') {
    return (
      <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200 text-slate-600">
        <Shield className="h-10 w-10 text-slate-400 mx-auto mb-2" />
        <h3 className="text-base font-bold text-slate-800">स्कूल सेटिंग्स केवल निदेशक के लिए उपलब्ध हैं</h3>
        <p className="text-xs text-slate-500 mt-1">स्कूल नाम, एफिलिएशन और आधिकारिक पते को बदलने का अधिकार केवल डायरेक्टर के पास है।</p>
      </div>
    );
  }

  if (loading || !profile) {
    return <div className="p-12 text-center text-sm text-slate-500">डेटा लोड हो रहा है...</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <School className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900">स्कूल प्रोफ़ाइल एवं संस्थानिक सेटिंग्स</h1>
            <p className="text-xs text-slate-500 mt-0.5">संस्थान का नाम, मान्यता/बोर्ड संबद्धता क्रमांक एवं आधिकारिक संपर्क सूत्र।</p>
          </div>
        </div>
      </div>

      {message && (
        <div className="p-4 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6">
        <div>
          <h2 className="text-sm font-bold text-slate-900 mb-4 pb-2 border-b border-slate-100">मूल विद्यालय पहचान</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-semibold text-slate-700">विद्यालय का पूरा नाम *</label>
              <input
                type="text"
                required
                value={profile.schoolName}
                onChange={(e) => setProfile({ ...profile, schoolName: e.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-semibold focus:outline-hidden focus:border-blue-600"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">बोर्ड का नाम (Board Affiliation)</label>
              <input
                type="text"
                value={profile.boardName}
                onChange={(e) => setProfile({ ...profile, boardName: e.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs focus:outline-hidden focus:border-blue-600"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">संबद्धता / एफिलिएशन क्रमांक (Affiliation No.)</label>
              <input
                type="text"
                value={profile.affiliationNumber}
                onChange={(e) => setProfile({ ...profile, affiliationNumber: e.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs focus:outline-hidden focus:border-blue-600"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">स्कूल कोड (School Code)</label>
              <input
                type="text"
                value={profile.schoolCode}
                onChange={(e) => setProfile({ ...profile, schoolCode: e.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs focus:outline-hidden focus:border-blue-600"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">शैक्षणिक सत्र (Academic Session)</label>
              <input
                type="text"
                value={profile.academicSession}
                onChange={(e) => setProfile({ ...profile, academicSession: e.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs focus:outline-hidden focus:border-blue-600"
              />
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-sm font-bold text-slate-900 mb-4 pb-2 border-b border-slate-100">आधिकारिक संपर्क एवं पता</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">आधिकारिक ईमेल *</label>
              <input
                type="email"
                required
                value={profile.email}
                onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs focus:outline-hidden focus:border-blue-600"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">हेल्पलाइन फोन नंबर *</label>
              <input
                type="tel"
                required
                value={profile.phone}
                onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs focus:outline-hidden focus:border-blue-600"
              />
            </div>

            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-semibold text-slate-700">परिसर का पता (Campus Address)</label>
              <textarea
                rows={2}
                value={profile.address}
                onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs focus:outline-hidden focus:border-blue-600"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">शहर (City)</label>
              <input
                type="text"
                value={profile.city}
                onChange={(e) => setProfile({ ...profile, city: e.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs focus:outline-hidden focus:border-blue-600"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">राज्य व पिनकोड</label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="राज्य"
                  value={profile.state}
                  onChange={(e) => setProfile({ ...profile, state: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:outline-hidden focus:border-blue-600"
                />
                <input
                  type="text"
                  placeholder="पिनकोड"
                  value={profile.pincode}
                  onChange={(e) => setProfile({ ...profile, pincode: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:outline-hidden focus:border-blue-600"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="pt-4 flex items-center justify-end border-t border-slate-100">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl shadow-md transition-all flex items-center gap-2"
          >
            <Save className="h-4 w-4" />
            <span>{saving ? 'सहेजा जा रहा है...' : 'सेटिंग्स सुरक्षित करें'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
