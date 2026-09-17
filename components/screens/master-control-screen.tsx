'use client';

import React, { useState, useEffect } from 'react';
import {
  Server,
  Database,
  HardDrive,
  GitBranch,
  RefreshCw,
  PlusCircle,
  ExternalLink,
  Zap,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Play,
  Copy,
  Layers,
  Sparkles,
  AlertCircle
} from 'lucide-react';

interface MasterSchool {
  id: string;
  school_slug: string;
  school_name: string;
  custom_domain?: string;
  cf_worker_name: string;
  cf_worker_url: string;
  cf_d1_database_uuid: string;
  cf_d1_database_name: string;
  cf_r2_bucket_name: string;
  github_branch: string;
  deployment_status: string;
  config_sync_status: string;
  subscription_plan: string;
  created_at: string;
  last_deployed_at?: string;
}

export function MasterControlScreen() {
  const [schools, setSchools] = useState<MasterSchool[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [showProvisionModal, setShowProvisionModal] = useState(false);
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [selectedSchool, setSelectedSchool] = useState<MasterSchool | null>(null);
  const [newBranchName, setNewBranchName] = useState('');
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // New School Form State
  const [newSchoolName, setNewSchoolName] = useState('');
  const [newSchoolSlug, setNewSchoolSlug] = useState('');
  const [newBoardName, setNewBoardName] = useState('CBSE');
  const [newAcademicSession, setNewAcademicSession] = useState('2026-2027');
  const [newPlan, setNewPlan] = useState('pro');
  const [newCustomDomain, setNewCustomDomain] = useState('');

  useEffect(() => {
    fetchSchools();
  }, []);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 4000);
  };

  const fetchSchools = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/master/schools');
      const data = await res.json();
      if (data.success) {
        setSchools(data.schools || []);
      } else {
        showToast(data.error || 'डेटा लोड करने में विफल', 'error');
      }
    } catch (err: any) {
      showToast('नेटवर्क त्रुटि: ' + err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleProvisionSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSchoolName.trim()) return;

    setIsProvisioning(true);
    try {
      const res = await fetch('/api/master/provision-school', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolName: newSchoolName.trim(),
          schoolSlug: newSchoolSlug.trim() || undefined,
          boardName: newBoardName,
          academicSession: newAcademicSession,
          plan: newPlan,
          customDomain: newCustomDomain.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        setShowProvisionModal(false);
        setNewSchoolName('');
        setNewSchoolSlug('');
        setNewCustomDomain('');
        fetchSchools();
      } else {
        showToast(data.error || data.message || 'प्रोविज़निंग विफल', 'error');
      }
    } catch (err: any) {
      showToast('त्रुटि: ' + err.message, 'error');
    } finally {
      setIsProvisioning(false);
    }
  };

  const handleSyncEnv = async (schoolId: string) => {
    try {
      const res = await fetch('/api/master/sync-worker-env', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schoolId }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        fetchSchools();
      } else {
        showToast(data.error || data.message, 'error');
      }
    } catch (err: any) {
      showToast('त्रुटि: ' + err.message, 'error');
    }
  };

  const handleCreateBranch = async () => {
    if (!selectedSchool || !newBranchName.trim()) return;
    try {
      const res = await fetch('/api/master/create-custom-branch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schoolId: selectedSchool.id, branchName: newBranchName.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        setShowBranchModal(false);
        setNewBranchName('');
        fetchSchools();
      } else {
        showToast(data.error || data.message, 'error');
      }
    } catch (err: any) {
      showToast('त्रुटि: ' + err.message, 'error');
    }
  };

  const handleDeployWorker = async (schoolId: string) => {
    try {
      const res = await fetch('/api/master/deploy-school', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schoolId }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        fetchSchools();
      } else {
        showToast(data.error || data.message, 'error');
      }
    } catch (err: any) {
      showToast('त्रुटि: ' + err.message, 'error');
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    showToast(`${label} कॉपी हो गया!`, 'success');
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Toast Notification */}
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

      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-900 border border-indigo-800/40 p-6 md:p-8 shadow-2xl">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                प्रज्ञा मित्र • मास्टर कंट्रोल प्लेन
              </span>
              <span className="px-2 py-0.5 rounded-md text-[11px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Multi-Worker Edge Grid
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
              समर्पित विद्यालय क्लाउड इंफ्रास्ट्रक्चर
            </h1>
            <p className="text-slate-300 text-sm mt-1 max-w-2xl">
              प्रत्येक विद्यालय का अपना पृथक Cloudflare Worker, स्वतंत्र D1 डेटाबेस, R2 बकेट एवं गिटहब कस्टमाइज़ेशन शाखा। शून्य डेटा टकराव व न्यूनतम डेटाबेस लागत।
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchSchools}
              disabled={isLoading}
              className="px-4 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 text-sm font-medium flex items-center gap-2 transition disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              ताज़ा करें
            </button>
            <button
              onClick={() => setShowProvisionModal(true)}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-medium text-sm shadow-lg shadow-indigo-600/30 flex items-center gap-2 transition"
            >
              <PlusCircle className="w-4 h-4" />
              नया स्कूल प्रोविज़न करें
            </button>
          </div>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">कुल समर्पित वर्कर</span>
            <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
              <Server className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">{schools.length}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">स्वतंत्र Edge वर्कर सक्रिय</p>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">समर्पित D1 डेटाबेस</span>
            <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
              <Database className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">{schools.length}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">100% डेटा पृथक्करण</p>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">मीडिया बकेट्स (R2)</span>
            <div className="p-2 bg-amber-50 rounded-lg text-amber-600">
              <HardDrive className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">{schools.length}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">दस्तावेज़ एवं फोटो स्टोरेज</p>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">ज़ीरो-DB लागत एज कैश्ड</span>
            <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
              <Zap className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-emerald-600 mt-2">
            {schools.filter((s) => s.config_sync_status === 'Synced').length} / {schools.length}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">D1 क्वेरी लागत शून्य</p>
        </div>
      </div>

      {/* Schools Orchestration Grid */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-600" />
              सक्रिय विद्यालय इंफ्रास्ट्रक्चर ग्रिड
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              प्रत्येक विद्यालय के क्लाउड संसाधन, गिटहब शाखाएं एवं एनवायरनमेंट हॉट-सिंक स्थिति
            </p>
          </div>
          <span className="text-xs font-mono bg-slate-100 px-2.5 py-1 rounded-md text-slate-600">
            {schools.length} विद्यालय लिंक्ड
          </span>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-slate-400 text-sm">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
            मास्टर रजिस्ट्री लोड हो रही है...
          </div>
        ) : schools.length === 0 ? (
          <div className="p-12 text-center">
            <Server className="w-10 h-10 mx-auto text-slate-300 mb-3" />
            <h3 className="text-sm font-bold text-slate-700">कोई समर्पित विद्यालय वर्कर पंजीकृत नहीं है</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              ऊपर &quot;नया स्कूल प्रोविज़न करें&quot; बटन पर क्लिक करके किसी विद्यालय को समर्पित Cloudflare Worker, D1 DB व R2 बकेट के साथ ऑनबोर्ड करें।
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {schools.map((item) => (
              <div key={item.id} className="p-5 hover:bg-slate-50/60 transition flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-2 flex-1">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h3 className="text-base font-bold text-slate-900">{item.school_name}</h3>
                    <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-100 text-slate-600 border border-slate-200">
                      {item.school_slug}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase">
                      {item.subscription_plan}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold border flex items-center gap-1 ${
                        item.config_sync_status === 'Synced'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}
                    >
                      <Zap className="w-3 h-3" />
                      {item.config_sync_status === 'Synced' ? '0-DB लागत सिंक' : 'सिंक लंबित'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-xs text-slate-600">
                    <div className="flex items-center gap-1.5 font-mono">
                      <Server className="w-3.5 h-3.5 text-slate-400" />
                      <a
                        href={item.cf_worker_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-indigo-600 hover:underline flex items-center gap-1 truncate"
                        title={item.cf_worker_url}
                      >
                        {item.cf_worker_name}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>

                    <div className="flex items-center gap-1.5 font-mono">
                      <Database className="w-3.5 h-3.5 text-slate-400" />
                      <span className="truncate" title={item.cf_d1_database_uuid}>
                        D1: {item.cf_d1_database_uuid.slice(0, 10)}...
                      </span>
                      <button
                        onClick={() => copyToClipboard(item.cf_d1_database_uuid, 'D1 UUID')}
                        className="text-slate-400 hover:text-slate-600 p-0.5"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5 font-mono">
                      <HardDrive className="w-3.5 h-3.5 text-slate-400" />
                      <span className="truncate" title={item.cf_r2_bucket_name}>
                        {item.cf_r2_bucket_name}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 font-mono">
                      <GitBranch className="w-3.5 h-3.5 text-slate-400" />
                      <span className="font-semibold text-slate-800">{item.github_branch || 'main'}</span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => handleSyncEnv(item.id)}
                    title="स्कूल की सेटिंग्स को वर्कर एनवायरनमेंट में इंजेक्ट करें (0-DB Cost)"
                    className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-medium flex items-center gap-1.5 transition"
                  >
                    <Zap className="w-3.5 h-3.5 text-emerald-600" />
                    हॉट-सिंक
                  </button>

                  <button
                    onClick={() => {
                      setSelectedSchool(item);
                      setNewBranchName(`school/${item.school_slug}-custom`);
                      setShowBranchModal(true);
                    }}
                    title="इस स्कूल के लिए स्वतंत्र कस्टमाइज़ेशन शाखा बनाएं"
                    className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-xs font-medium flex items-center gap-1.5 transition"
                  >
                    <GitBranch className="w-3.5 h-3.5 text-slate-500" />
                    कस्टम शाखा
                  </button>

                  <button
                    onClick={() => handleDeployWorker(item.id)}
                    title="इस स्कूल के लिए समर्पित वर्कर डिप्लॉयमेंट ट्रिगर करें"
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium flex items-center gap-1.5 shadow-sm transition"
                  >
                    <Play className="w-3.5 h-3.5" />
                    डिप्लॉय करें
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Provision School Modal */}
      {showProvisionModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                  <Server className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">नया विद्यालय प्रोविज़न करें</h3>
                  <p className="text-xs text-slate-500">स्वतंत्र Worker, D1 Database एवं R2 Media Bucket</p>
                </div>
              </div>
              <button onClick={() => setShowProvisionModal(false)} className="text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>

            <form onSubmit={handleProvisionSchool} className="space-y-4 pt-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">विद्यालय का पूरा नाम *</label>
                <input
                  type="text"
                  required
                  placeholder="उदा. दिल्ली पब्लिक स्कूल, द्वारका"
                  value={newSchoolName}
                  onChange={(e) => {
                    setNewSchoolName(e.target.value);
                    if (!newSchoolSlug) {
                      setNewSchoolSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-'));
                    }
                  }}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">पहचान स्लग (Slug) *</label>
                  <input
                    type="text"
                    required
                    placeholder="उदा. dps-dwarka"
                    value={newSchoolSlug}
                    onChange={(e) => setNewSchoolSlug(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">सदस्यता प्लान</label>
                  <select
                    value={newPlan}
                    onChange={(e) => setNewPlan(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="starter">स्टार्टर (Starter)</option>
                    <option value="pro">प्रो (Pro)</option>
                    <option value="enterprise">एंटरप्राइज (Enterprise)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">बोर्ड का नाम</label>
                  <input
                    type="text"
                    value={newBoardName}
                    onChange={(e) => setNewBoardName(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">शैक्षणिक सत्र</label>
                  <input
                    type="text"
                    value={newAcademicSession}
                    onChange={(e) => setNewAcademicSession(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">कस्टम डोमेन (ऐच्छिक)</label>
                <input
                  type="text"
                  placeholder="उदा. erp.dpsdwarka.edu.in"
                  value={newCustomDomain}
                  onChange={(e) => setNewCustomDomain(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="p-3.5 bg-indigo-50/70 border border-indigo-100 rounded-xl text-xs text-indigo-900 space-y-1">
                <p className="font-bold flex items-center gap-1.5 text-indigo-950">
                  <ShieldCheck className="w-4 h-4 text-indigo-600" />
                  ऑटोमेटेड प्रोविज़निंग विवरण:
                </p>
                <p>• Worker: <code className="bg-white px-1 rounded">pm-school-{newSchoolSlug || 'slug'}</code></p>
                <p>• D1 DB: <code className="bg-white px-1 rounded">d1-pm-{newSchoolSlug || 'slug'}</code> (Dedicated UUID)</p>
                <p>• R2 Bucket: <code className="bg-white px-1 rounded">r2-pm-{newSchoolSlug || 'slug'}-media</code></p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowProvisionModal(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800"
                >
                  रद्द करें
                </button>
                <button
                  type="submit"
                  disabled={isProvisioning}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow-lg shadow-indigo-600/30 flex items-center gap-2 disabled:opacity-50"
                >
                  {isProvisioning ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      प्रोविज़निंग जारी है...
                    </>
                  ) : (
                    'प्रोविज़न पूर्ण करें'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Custom Git Branch Modal */}
      {showBranchModal && selectedSchool && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100">
            <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
              <div className="p-2 rounded-xl bg-slate-100 text-slate-700">
                <GitBranch className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">कस्टम गिटहब शाखा लिंक करें</h3>
                <p className="text-xs text-slate-500">{selectedSchool.school_name}</p>
              </div>
            </div>

            <div className="space-y-3 pt-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                यदि <strong>{selectedSchool.school_name}</strong> को अपने लिए कोई विशेष कस्टमाइज़ेशन चाहिए, तो बेस रिपॉजिटरी से एक स्वतंत्र शाखा बनाई जाएगी। इससे अन्य किसी स्कूल का कोड प्रभावित नहीं होगा।
              </p>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">शाखा का नाम (Branch Name) *</label>
                <input
                  type="text"
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => setShowBranchModal(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800"
                >
                  रद्द करें
                </button>
                <button
                  type="button"
                  onClick={handleCreateBranch}
                  className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-semibold flex items-center gap-2"
                >
                  <GitBranch className="w-4 h-4" />
                  शाखा बनाएं व लिंक करें
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
