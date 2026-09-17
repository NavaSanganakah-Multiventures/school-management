'use client';

import React, { useState, useEffect } from 'react';
import {
  School,
  Server,
  Database,
  HardDrive,
  GitBranch,
  Zap,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Phone,
  Mail,
  Calendar,
  Layers,
  Save
} from 'lucide-react';

interface DirectorPortalProps {
  initialSchoolId?: string;
  onBack?: () => void;
}

export function DirectorCentralPortalScreen({ initialSchoolId = 'sch_dps_delhi_01', onBack }: DirectorPortalProps) {
  const [schoolId, setSchoolId] = useState(initialSchoolId);
  const [schoolData, setSchoolData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Form inputs
  const [schoolName, setSchoolName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [boardName, setBoardName] = useState('CBSE');
  const [academicSession, setAcademicSession] = useState('2026-2027');
  const [logoUrl, setLogoUrl] = useState('');

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 4000);
  };

  useEffect(() => {
    loadSchoolData();
  }, [schoolId]);

  const loadSchoolData = async () => {
    setIsLoading(true);
    try {
      // First try master registry
      const res = await fetch('/api/master/schools');
      const data = await res.json();
      if (data.success && Array.isArray(data.schools)) {
        const found = data.schools.find((s: any) => s.id === schoolId || s.school_slug === schoolId) || data.schools[0];
        if (found) {
          setSchoolData(found);
          setSchoolName(found.school_name || '');
          setContactPhone(found.contact_phone || '');
          setContactEmail(found.contact_email || '');
          setBoardName(found.board_name || 'CBSE');
          setAcademicSession(found.academic_session || '2026-2027');
        }
      }
    } catch (err: any) {
      showToast('डेटा लोड त्रुटि: ' + err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolName.trim()) {
      showToast('कृपया विद्यालय का नाम दर्ज करें', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch('/api/master/director-update-school', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolId: schoolData?.id || schoolId,
          schoolName: schoolName.trim(),
          contactPhone: contactPhone.trim(),
          contactEmail: contactEmail.trim(),
          boardName,
          academicSession,
          logoUrl,
        }),
      });

      const data = await res.json();
      if (data.success) {
        showToast(data.message || 'सफलतापूर्वक सहेजा गया!', 'success');
        loadSchoolData();
      } else {
        showToast(data.error || data.message || 'अपडेट विफल', 'error');
      }
    } catch (err: any) {
      showToast('त्रुटि: ' + err.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Toast */}
      {toastMsg && (
        <div
          className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 text-sm font-medium border ${
            toastMsg.type === 'success'
              ? 'bg-emerald-900/95 text-emerald-100 border-emerald-700'
              : 'bg-rose-900/95 text-rose-100 border-rose-700'
          }`}
        >
          {toastMsg.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <AlertCircle className="w-5 h-5 text-rose-400" />}
          <span>{toastMsg.text}</span>
        </div>
      )}

      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-800/40 p-6 md:p-8 shadow-xl text-white">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-1.5">
                <School className="w-3.5 h-3.5 text-indigo-400" />
                प्रज्ञा मित्र • केंद्रीय निदेशक पोर्टल (Director Hub)
              </span>
              <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                विकल्प 2: मुख्य वेबसाइट एक्सेस
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
              {schoolData?.school_name || 'विद्यालय प्रबंधन एवं सेटिंग्स'}
            </h1>
            <p className="text-slate-300 text-xs md:text-sm mt-1">
              यहाँ से किए गए सभी बदलाव सीधे D1 डेटाबेस में सुरक्षित होंगे और स्वचालित रूप से वर्कर ENV में सिंक हो जाएंगे (ज़ीरो DB लागत व तुरंत प्रभाव)।
            </p>
          </div>

          {onBack && (
            <button
              onClick={onBack}
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition"
            >
              ← वापस जाएं
            </button>
          )}
        </div>
      </div>

      {/* Cloud Infrastructure Badges */}
      {schoolData && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-2xs flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600 shrink-0">
              <Server className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase">समर्पित वर्कर</span>
              <a
                href={schoolData.cf_worker_url}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-bold text-indigo-600 hover:underline truncate block"
              >
                {schoolData.cf_worker_name || 'pm-school-worker'}
              </a>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-2xs flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 shrink-0">
              <Database className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase">समर्पित D1 DB</span>
              <p className="text-xs font-mono font-semibold text-slate-800 truncate" title={schoolData.cf_d1_database_uuid}>
                {schoolData.cf_d1_database_uuid ? schoolData.cf_d1_database_uuid.slice(0, 12) + '...' : 'D1 Assigned'}
              </p>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-2xs flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600 shrink-0">
              <HardDrive className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase">मीडिया R2 बकेट</span>
              <p className="text-xs font-mono font-semibold text-slate-800 truncate">
                {schoolData.cf_r2_bucket_name || 'r2-school-media'}
              </p>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-2xs flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 shrink-0">
              <Zap className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase">एज लेटेंसी</span>
              <p className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                <span>0ms ENV कैश्ड</span>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main Settings Form */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 md:p-8">
        <div className="flex items-center justify-between pb-5 border-b border-slate-100 mb-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Layers className="w-5 h-5 text-indigo-600" />
              विद्यालय प्रोफाइल एवं बुनियादी जानकारी
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              यह जानकारी आपके वर्कर के Environment Variables में सुरक्षित होकर सभी छात्रों व शिक्षकों को बिना DB लोड के तुरंत दिखाई देगी।
            </p>
          </div>
          <span className="text-xs font-mono px-3 py-1 bg-slate-100 text-slate-700 rounded-lg border border-slate-200">
            School ID: {schoolData?.id || schoolId}
          </span>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-slate-400 text-sm">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
            जानकारी लोड हो रही है...
          </div>
        ) : (
          <form onSubmit={handleSaveChanges} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1.5">विद्यालय का आधिकारिक नाम *</label>
                <input
                  type="text"
                  required
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  placeholder="उदा. दिल्ली पब्लिक स्कूल, द्वारका"
                  className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-slate-500" />
                  आधिकारिक संपर्क / मोबाइल नंबर *
                </label>
                <input
                  type="text"
                  required
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="उदा. +91 9876543210"
                  className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-slate-500" />
                  आधिकारिक ईमेल आईडी *
                </label>
                <input
                  type="email"
                  required
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="उदा. info@dpsdelhi.edu.in"
                  className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">संबद्धता बोर्ड (Board Name)</label>
                <input
                  type="text"
                  value={boardName}
                  onChange={(e) => setBoardName(e.target.value)}
                  placeholder="उदा. CBSE / ICSE / State Board"
                  className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                  वर्तमान शैक्षणिक सत्र (Academic Session)
                </label>
                <input
                  type="text"
                  value={academicSession}
                  onChange={(e) => setAcademicSession(e.target.value)}
                  placeholder="उदा. 2026-2027"
                  className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1.5">स्कूल लोगो URL (ऐच्छिक)</label>
                <input
                  type="url"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="उदा. https://.../logo.png"
                  className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Zero-DB-Cost Guarantee Callout */}
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-3">
              <Zap className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
              <div className="text-xs text-emerald-900 leading-relaxed">
                <strong>ज़ीरो-DB-लागत गारंटी:</strong> जब आप यहाँ से बदलाव सहेजते हैं, तो यह सीधे क्लाउडफ्लेयर वर्कर के <code>Environment Variables</code> में सिंक हो जाता है। अगली बार कोई भी अभिभावक या शिक्षक ऐप खोलेगा, तो डेटाबेस से क्वेरी नहीं होगी, बल्कि सीधे एज से 0ms में लोड होगा!
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <button
                type="submit"
                disabled={isSaving}
                className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-bold rounded-xl text-sm shadow-lg shadow-indigo-600/30 flex items-center gap-2 disabled:opacity-50 transition"
              >
                {isSaving ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    सहेजा जा रहा है व वर्कर में सिंक हो रहा है...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    बदलाव सहेजें और वर्कर में सिंक करें
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
