'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck, RefreshCw, CheckCircle2, XCircle, School, IndianRupee,
  Loader2, Plus, Trash2, RotateCcw, Pencil, Tag, Boxes, Eye, EyeOff,
  Search, ToggleLeft, ToggleRight, Sparkles, Globe, Lock, Check, Store
} from 'lucide-react';

interface SchoolRow {
  id: string;
  schoolName: string;
  subdomain: string;
  customDomain: string;
  contactEmail: string;
  contactPhone: string;
  status: string;
  registrationStatus: string;
  planId: string;
  planName: string;
  trialEndsAt: string;
  deletedAt: string;
  createdAt: string;
  provisioningStatus: string;
  dedicatedSlug: string;
  dedicatedDomain: string;
  d1DatabaseId: string;
  r2BucketName: string;
  kvNamespaceId: string;
  provisionedAt: string;
  provisioningError: string;
}

interface PlanRow {
  id: string;
  name: string;
  tagline: string;
  badge: string;
  monthlyPrice: number;
  quarterlyPrice: number;
  annualPrice: number;
  maxStudents: string;
  maxStudentsLimit: number | null;
  maxStaffLimit: number | null;
  features: string[];
  modules: string[];
  featureFlags: Record<string, boolean>;
  recommended: boolean;
  active: boolean;
  isTrial: boolean;
  sortOrder: number;
}

interface PluginItem {
  id: string;
  name: string;
  description: string;
  type: 'global' | 'private';
  price: number;
  is_active: number | boolean;
  target_school_id?: string | null;
  active_subscribers_count?: number;
  created_at?: string;
  updated_at?: string;
}

interface PluginSubscription {
  id: string;
  school_id: string;
  plugin_id: string;
  status: 'active' | 'inactive' | 'expired';
  valid_until?: string | null;
  created_at: string;
  updated_at: string;
  school_name: string;
  plugin_name: string;
  plugin_price: number;
}

const MODULE_OPTIONS = ['dashboard', 'students', 'attendance', 'staff', 'notices', 'fees', 'exams', 'principal', 'settings', 'billing'];
const FLAG_OPTIONS = [
  { key: 'reportCards', label: 'रिपोर्ट कार्ड' },
  { key: 'principalHistory', label: 'प्रधानाचार्य इतिहास' },
  { key: 'autopay', label: 'ऑटो-पे बिलिंग' },
  { key: 'domainEmail', label: 'डोमेन ईमेल' },
  { key: 'multiSchool', label: 'मल्टी-स्कूल टेनेंसी' },
  { key: 'prioritySupport', label: 'प्राथमिकता सहायता' },
  { key: 'customDomainIncluded', label: 'कस्टम डोमेन शामिल' },
];

const emptyAddForm = { schoolName: '', directorName: '', email: '', phone: '', password: '', subdomain: '', customDomain: '', planId: 'starter', billingCycle: 'annual' };
const emptyPlanForm = { name: '', tagline: '', badge: '', monthlyPrice: '', quarterlyPrice: '', annualPrice: '', maxStudents: '', maxStaff: '', maxStudentsLabel: '', recommended: false, active: true, isTrial: false, sortOrder: '0', modules: ['dashboard', 'students', 'attendance', 'staff', 'notices', 'fees', 'settings', 'billing'], features: '', reportCards: false, principalHistory: false, autopay: false, domainEmail: false, multiSchool: false, prioritySupport: false, customDomainIncluded: false };
const emptyPluginForm = { id: '', name: '', description: '', type: 'global' as 'global' | 'private', price: '0', isActive: true, targetSchoolId: '' };
const emptyAssignForm = { schoolId: '', pluginId: '', status: 'active' as 'active' | 'inactive' };

export function AdminConsoleScreen() {
  const [activeTab, setActiveTab] = useState<'schools' | 'plugins' | 'plans'>('schools');
  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [registrations, setRegistrations] = useState<SchoolRow[]>([]);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [plugins, setPlugins] = useState<PluginItem[]>([]);
  const [subscriptions, setSubscriptions] = useState<PluginSubscription[]>([]);
  const [deletedSchools, setDeletedSchools] = useState<SchoolRow[]>([]);
  const [showDeleted, setShowDeleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deletedLoading, setDeletedLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmProvisionId, setConfirmProvisionId] = useState<string | null>(null);
  const [provisionSlug, setProvisionSlug] = useState('');

  // School Search & Filter
  const [schoolSearch, setSchoolSearch] = useState('');
  const [schoolStatusFilter, setSchoolStatusFilter] = useState<'all' | 'Active' | 'Trial' | 'Suspended'>('all');

  // School Add & Edit Forms
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState<any>(emptyAddForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({ schoolName: '', email: '', phone: '', subdomain: '', customDomain: '', status: 'Active' });

  // Plan Form
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [planEditId, setPlanEditId] = useState<string | null>(null);
  const [planForm, setPlanForm] = useState<any>(emptyPlanForm);

  // Plugin Form & Modals
  const [showPluginModal, setShowPluginModal] = useState(false);
  const [pluginEditId, setPluginEditId] = useState<string | null>(null);
  const [pluginForm, setPluginForm] = useState<any>(emptyPluginForm);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignForm, setAssignForm] = useState<any>(emptyAssignForm);

  const nonTrialPlans = plans.filter((p) => !p.isTrial && p.active !== false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [sRes, rRes, pRes, plRes, subRes] = await Promise.all([
        fetch('/api/admin/schools').then((r) => r.json()).catch(() => ({})),
        fetch('/api/admin/registrations').then((r) => r.json()).catch(() => ({})),
        fetch('/api/admin/plans').then((r) => r.json()).catch(() => ({})),
        fetch('/api/admin/plugins').then((r) => r.json()).catch(() => ({})),
        fetch('/api/admin/plugins/subscriptions').then((r) => r.json()).catch(() => ({})),
      ]);
      if (sRes.success) setSchools(sRes.schools || []);
      if (rRes.success) setRegistrations(rRes.registrations || []);
      if (pRes.success) setPlans(pRes.plans || []);
      if (plRes.success) setPlugins(plRes.plugins || []);
      if (subRes.success) setSubscriptions(subRes.subscriptions || []);

      if (!sRes.success && sRes.message) setErrorMsg(sRes.message);
      else if (!pRes.success && pRes.message) setErrorMsg(pRes.message);
    } catch (e) {
      setErrorMsg('सर्वर से संपर्क करने में समस्या हुई।');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDeleted = useCallback(async () => {
    setDeletedLoading(true);
    try {
      const res = await fetch('/api/admin/schools/deleted').then((r) => r.json());
      if (res.success) setDeletedSchools(res.schools || []);
      else setErrorMsg(res.message || 'हटाए गए स्कूल लोड नहीं हुए।');
    } catch (e) {
      setErrorMsg('नेटवर्क त्रुटि।');
    } finally {
      setDeletedLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Flash message helper
  const flashSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  const post = async (url: string, body: any) => {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return await res.json();
  };

  // School actions
  const approve = async (schoolId: string) => {
    setBusyId(schoolId);
    try {
      const data = await post('/api/admin/registrations/approve', { schoolId });
      if (data.success) { flashSuccess('स्कूल अप्रूव्ड! 7-दिन का ट्रायल शुरू हुआ।'); await loadData(); }
      else setErrorMsg(data.message || 'अप्रूवल विफल।');
    } catch (e) { setErrorMsg('नेटवर्क त्रुटि।'); }
    finally { setBusyId(null); }
  };

  const reject = async (schoolId: string) => {
    setBusyId(schoolId);
    try {
      const data = await post('/api/admin/registrations/reject', { schoolId });
      if (data.success) { flashSuccess('स्कूल रजिस्ट्रेशन अस्वीकृत कर दिया गया।'); await loadData(); }
      else setErrorMsg(data.message || 'अस्वीकृति विफल।');
    } catch (e) { setErrorMsg('नेटवर्क त्रुटि।'); }
    finally { setBusyId(null); }
  };

  const setPlan = async (schoolId: string, planId: string) => {
    if (planId === 'trial') return;
    setBusyId(schoolId);
    try {
      const data = await post('/api/admin/schools/plan', { schoolId, planId });
      if (data.success) { flashSuccess('स्कूल का प्लान सफलतापूर्वक बदल दिया गया।'); await loadData(); }
      else setErrorMsg(data.message || 'प्लान बदलने में त्रुटि।');
    } catch (e) { setErrorMsg('नेटवर्क त्रुटि।'); }
    finally { setBusyId(null); }
  };

  const createSchool = async () => {
    setBusyId('add');
    try {
      const data = await post('/api/admin/schools/create', addForm);
      if (data.success) {
        setShowAddForm(false);
        setAddForm(emptyAddForm);
        flashSuccess('नया विद्यालय सफलतापूर्वक पंजीकृत हो गया!');
        await loadData();
      } else setErrorMsg(data.message || 'विद्यालय बनाने में त्रुटि।');
    } catch (e) { setErrorMsg('नेटवर्क त्रुटि।'); }
    finally { setBusyId(null); }
  };

  const startEdit = (s: SchoolRow) => {
    setEditId(s.id);
    setEditForm({ schoolName: s.schoolName, email: s.contactEmail, phone: s.contactPhone, subdomain: s.subdomain || '', customDomain: s.customDomain || '', status: s.status });
  };

  const saveEdit = async (schoolId: string) => {
    setBusyId(schoolId);
    try {
      const data = await post('/api/admin/schools/update', Object.assign({ schoolId }, editForm));
      if (data.success) { setEditId(null); flashSuccess('स्कूल विवरण अपडेट हो गया।'); await loadData(); }
      else setErrorMsg(data.message || 'अपडेट विफल।');
    } catch (e) { setErrorMsg('नेटवर्क त्रुटि।'); }
    finally { setBusyId(null); }
  };

  const deleteSchool = async (schoolId: string) => {
    setBusyId(schoolId);
    try {
      const data = await post('/api/admin/schools/delete', { schoolId });
      if (data.success) { setConfirmDeleteId(null); flashSuccess('स्कूल हटा दिया गया।'); await loadData(); }
      else setErrorMsg(data.message || 'हटाने में त्रुटि।');
    } catch (e) { setErrorMsg('नेटवर्क त्रुटि।'); }
    finally { setBusyId(null); }
  };

  const restoreSchool = async (schoolId: string) => {
    setBusyId(schoolId);
    try {
      const data = await post('/api/admin/schools/restore', { schoolId });
      if (data.success) { flashSuccess('स्कूल सफलतापूर्वक रिस्टोर हो गया।'); await loadData(); await loadDeleted(); }
      else setErrorMsg(data.message || 'रिस्टोर विफल।');
    } catch (e) { setErrorMsg('नेटवर्क त्रुटि।'); }
    finally { setBusyId(null); }
  };

  // Dedicated Worker (WfP) provisioning actions
  const startProvision = (s: SchoolRow) => {
    setConfirmProvisionId(s.id);
    setProvisionSlug(s.subdomain || '');
  };

  const provisionDedicated = async (schoolId: string) => {
    const slug = provisionSlug.trim();
    if (!slug) { setErrorMsg('डेडिकेटेड वर्कर के लिए slug आवश्यक है।'); return; }
    setBusyId('provision-' + schoolId);
    try {
      const data = await post('/api/admin/schools/provision', { schoolId, slug });
      if (data.success) {
        setConfirmProvisionId(null);
        flashSuccess(data.message || 'डेडिकेटेड वर्कर provisioning शुरू हो गया।');
        await loadData();
      } else setErrorMsg(data.message || 'प्रोविजनिंग विफल।');
    } catch (e) { setErrorMsg('नेटवर्क त्रुटि।'); }
    finally { setBusyId(null); }
  };

  const checkProvision = async (schoolId: string) => {
    setBusyId('provision-check-' + schoolId);
    try {
      const data = await post('/api/admin/schools/provision/check', { schoolId });
      if (data.success) {
        if (data.live) { flashSuccess('डेडिकेटेड वर्कर अब live है!'); await loadData(); }
        else flashSuccess('अभी deploy चल रहा है, कृपया थोड़ी देर बाद दोबारा जाँचें।');
      } else setErrorMsg(data.message || 'स्थिति जाँच विफल।');
    } catch (e) { setErrorMsg('नेटवर्क त्रुटि।'); }
    finally { setBusyId(null); }
  };

  // Plan actions
  const toggleModule = (m: string) => {
    const list = planForm.modules.slice();
    const i = list.indexOf(m);
    if (i === -1) list.push(m); else list.splice(i, 1);
    setPlanForm(Object.assign({}, planForm, { modules: list }));
  };

  const toggleFlag = (k: string) => {
    setPlanForm(Object.assign({}, planForm, { [k]: !(planForm as any)[k] }));
  };

  const startPlanCreate = () => {
    setPlanEditId(null);
    setPlanForm(emptyPlanForm);
    setShowPlanForm(true);
  };

  const startPlanEdit = (p: PlanRow) => {
    setPlanEditId(p.id);
    setPlanForm({
      name: p.name || '',
      tagline: p.tagline || '',
      badge: p.badge || '',
      monthlyPrice: String(p.monthlyPrice || 0),
      quarterlyPrice: String(p.quarterlyPrice || 0),
      annualPrice: String(p.annualPrice || 0),
      maxStudents: p.maxStudentsLimit === null || p.maxStudentsLimit === undefined ? '' : String(p.maxStudentsLimit),
      maxStaff: p.maxStaffLimit === null || p.maxStaffLimit === undefined ? '' : String(p.maxStaffLimit),
      maxStudentsLabel: p.maxStudents || '',
      recommended: !!p.recommended,
      active: p.active !== false,
      isTrial: !!p.isTrial,
      sortOrder: String(p.sortOrder || 0),
      modules: Array.isArray(p.modules) ? p.modules.slice() : [],
      features: (p.features || []).join('\n'),
      reportCards: !!p.featureFlags.reportCards,
      principalHistory: !!p.featureFlags.principalHistory,
      autopay: !!p.featureFlags.autopay,
      domainEmail: !!p.featureFlags.domainEmail,
      multiSchool: !!p.featureFlags.multiSchool,
      prioritySupport: !!p.featureFlags.prioritySupport,
      customDomainIncluded: !!p.featureFlags.customDomainIncluded,
    });
    setShowPlanForm(true);
  };

  const buildPlanBody = () => {
    const num = (v: string) => (String(v).trim() === '' ? null : Number(v));
    return {
      name: planForm.name.trim(),
      tagline: planForm.tagline,
      badge: planForm.badge,
      monthlyPrice: Number(planForm.monthlyPrice) || 0,
      quarterlyPrice: Number(planForm.quarterlyPrice) || 0,
      annualPrice: Number(planForm.annualPrice) || 0,
      maxStudents: num(planForm.maxStudents),
      maxStaff: num(planForm.maxStaff),
      maxStudentsLabel: planForm.maxStudentsLabel,
      recommended: planForm.recommended,
      active: planForm.active,
      isTrial: planForm.isTrial,
      sortOrder: Number(planForm.sortOrder) || 0,
      modules: planForm.modules,
      features: String(planForm.features).split('\n').map((t: string) => t.trim()).filter((t: string) => t.length > 0),
      featureFlags: {
        reportCards: planForm.reportCards,
        principalHistory: planForm.principalHistory,
        autopay: planForm.autopay,
        domainEmail: planForm.domainEmail,
        multiSchool: planForm.multiSchool,
        prioritySupport: planForm.prioritySupport,
        customDomainIncluded: planForm.customDomainIncluded,
      },
    };
  };

  const savePlan = async () => {
    setBusyId('plan-save');
    try {
      const url = planEditId ? '/api/admin/plans/update' : '/api/admin/plans';
      const body = Object.assign({}, buildPlanBody(), planEditId ? { id: planEditId } : {});
      const data = await post(url, body);
      if (data.success) { setShowPlanForm(false); flashSuccess('प्लान सफलतापूर्वक सहेजा गया।'); await loadData(); }
      else setErrorMsg(data.message || 'प्लान सेव करने में त्रुटि।');
    } catch (e) { setErrorMsg('नेटवर्क त्रुटि।'); }
    finally { setBusyId(null); }
  };

  const deactivatePlan = async (id: string) => {
    setBusyId(id);
    try {
      const data = await post('/api/admin/plans/delete', { id });
      if (data.success) { flashSuccess('प्लान निष्क्रिय कर दिया गया।'); await loadData(); }
      else setErrorMsg(data.message || 'प्लान निष्क्रिय करने में त्रुटि।');
    } catch (e) { setErrorMsg('नेटवर्क त्रुटि।'); }
    finally { setBusyId(null); }
  };

  // ==========================================
  // Plugin Management Actions
  // ==========================================

  const togglePluginGlobalStatus = async (pluginId: string) => {
    setBusyId('plugin-toggle-' + pluginId);
    try {
      const data = await post('/api/admin/plugins/toggle', { id: pluginId });
      if (data.success) {
        flashSuccess(data.message);
        await loadData();
      } else setErrorMsg(data.message || 'प्लगइन टॉगल विफल।');
    } catch (e) { setErrorMsg('नेटवर्क त्रुटि।'); }
    finally { setBusyId(null); }
  };

  const startPluginCreate = () => {
    setPluginEditId(null);
    setPluginForm(emptyPluginForm);
    setShowPluginModal(true);
  };

  const startPluginEdit = (p: PluginItem) => {
    setPluginEditId(p.id);
    setPluginForm({
      id: p.id,
      name: p.name || '',
      description: p.description || '',
      type: p.type || 'global',
      price: String(p.price || 0),
      isActive: !!p.is_active,
      targetSchoolId: p.target_school_id || '',
    });
    setShowPluginModal(true);
  };

  const savePlugin = async () => {
    setBusyId('plugin-save');
    try {
      const url = pluginEditId ? '/api/admin/plugins/update' : '/api/admin/plugins/create';
      const body = {
        id: pluginForm.id.trim(),
        name: pluginForm.name.trim(),
        description: pluginForm.description.trim(),
        type: pluginForm.type,
        price: Number(pluginForm.price) || 0,
        isActive: pluginForm.isActive,
        targetSchoolId: pluginForm.targetSchoolId ? pluginForm.targetSchoolId.trim() : null,
      };
      const data = await post(url, body);
      if (data.success) {
        setShowPluginModal(false);
        flashSuccess(data.message || 'प्लगइन सहेज दिया गया।');
        await loadData();
      } else {
        setErrorMsg(data.message || 'प्लगइन सेव विफल।');
      }
    } catch (e) { setErrorMsg('नेटवर्क त्रुटि।'); }
    finally { setBusyId(null); }
  };

  const toggleSubscriptionStatus = async (schoolId: string, pluginId: string, currentStatus: string) => {
    const actionKey = `sub-toggle-${schoolId}-${pluginId}`;
    setBusyId(actionKey);
    try {
      const isCurrentlyActive = currentStatus === 'active';
      const url = isCurrentlyActive ? '/api/admin/plugins/revoke' : '/api/admin/plugins/assign';
      const body = isCurrentlyActive ? { schoolId, pluginId } : { schoolId, pluginId, status: 'active' };
      const data = await post(url, body);
      if (data.success) {
        flashSuccess(data.message || 'सब्सक्रिप्शन स्थिति बदली गई।');
        await loadData();
      } else setErrorMsg(data.message || 'कार्रवाई विफल।');
    } catch (e) { setErrorMsg('नेटवर्क त्रुटि।'); }
    finally { setBusyId(null); }
  };

  const assignPluginToSchool = async () => {
    setBusyId('assign-save');
    try {
      const data = await post('/api/admin/plugins/assign', assignForm);
      if (data.success) {
        setShowAssignModal(false);
        setAssignForm(emptyAssignForm);
        flashSuccess(data.message || 'स्कूल को प्लगइन सफलतापूर्वक आवंटित हुआ!');
        await loadData();
      } else setErrorMsg(data.message || 'आवंटन विफल।');
    } catch (e) { setErrorMsg('नेटवर्क त्रुटि।'); }
    finally { setBusyId(null); }
  };

  // Filtered Schools
  const filteredSchools = schools.filter((s) => {
    const matchesSearch = !schoolSearch.trim() ||
      s.schoolName.toLowerCase().includes(schoolSearch.toLowerCase()) ||
      s.contactEmail.toLowerCase().includes(schoolSearch.toLowerCase()) ||
      s.contactPhone.includes(schoolSearch) ||
      (s.subdomain && s.subdomain.toLowerCase().includes(schoolSearch.toLowerCase()));

    const matchesStatus = schoolStatusFilter === 'all' || s.status === schoolStatusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalActive = schools.filter((s) => s.status === 'Active').length;
  const totalTrial = schools.filter((s) => s.status === 'Trial').length;
  const totalActivePlugins = plugins.filter((p) => !!p.is_active).length;
  const totalActiveSubs = subscriptions.filter((s) => s.status === 'active').length;

  const statusBadge = (status: string) => (
    <span className={'px-2 py-0.5 rounded-full text-[10px] font-bold ' + (status === 'Active' ? 'bg-emerald-100 text-emerald-700' : status === 'Trial' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600')}>
      {status === 'Active' ? 'सक्रिय' : status === 'Trial' ? 'ट्रायल' : status}
    </span>
  );

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-rose-600" />
            <span>Super Admin कंसोल (Control Plane)</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            समग्र स्कूल प्रबंधन, ग्लोबल प्लगइन कैटलॉग व नियंत्रण, और टियर सदस्यता योजनाएं
          </p>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-2xs transition cursor-pointer disabled:opacity-50 self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-600' : ''}`} />
          <span>रिफ्रेश</span>
        </button>
      </div>

      {/* Primary Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('schools')}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
            activeTab === 'schools' ? 'bg-blue-600 text-white shadow-xs' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <School className="w-4 h-4" />
          <span>स्कूल प्रबंधन ({schools.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('plugins')}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
            activeTab === 'plugins' ? 'bg-indigo-600 text-white shadow-xs' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Boxes className="w-4 h-4" />
          <span>प्लगइन प्रबंधन ({plugins.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('plans')}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
            activeTab === 'plans' ? 'bg-slate-800 text-white shadow-xs' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Tag className="w-4 h-4" />
          <span>प्लान एवं मूल्य निर्धारण ({plans.length})</span>
        </button>
      </div>

      {/* Alert Banners */}
      {errorMsg && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center justify-between">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="text-red-500 hover:text-red-700 font-bold ml-2">×</button>
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2 animate-in fade-in duration-200">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. SCHOOLS MANAGEMENT TAB                                                 */}
      {/* ========================================================================= */}
      {activeTab === 'schools' && (
        <>
          {/* Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs">
              <div className="text-2xl font-black text-slate-900">{schools.length}</div>
              <div className="text-xs font-semibold text-slate-500">कुल विद्यालय</div>
            </div>
            <div className="p-4 rounded-2xl bg-white border border-amber-200 shadow-2xs bg-amber-50/20">
              <div className="text-2xl font-black text-amber-600">{registrations.length}</div>
              <div className="text-xs font-semibold text-amber-800">लंबित पंजीकरण अप्रूवल</div>
            </div>
            <div className="p-4 rounded-2xl bg-white border border-blue-200 shadow-2xs bg-blue-50/20">
              <div className="text-2xl font-black text-blue-700">{totalActive}</div>
              <div className="text-xs font-semibold text-blue-800">सक्रिय (पेड प्लान)</div>
            </div>
            <div className="p-4 rounded-2xl bg-white border border-emerald-200 shadow-2xs bg-emerald-50/20">
              <div className="text-2xl font-black text-emerald-600">{totalTrial}</div>
              <div className="text-xs font-semibold text-emerald-800">फ्री ट्रायल पर</div>
            </div>
          </div>

          {/* Action Header & Search */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setShowAddForm(!showAddForm); setEditId(null); }}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>+ नया विद्यालय जोड़ें</span>
              </button>
              <button
                onClick={() => { if (!showDeleted) loadDeleted(); setShowDeleted(!showDeleted); }}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
              >
                {showDeleted ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                <span>{showDeleted ? 'हटाए गए छिपाएं' : 'हटाए गए देखें'}</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="विद्यालय, ईमेल, फोन या सबडोमेन खोजें..."
                  value={schoolSearch}
                  onChange={(e) => setSchoolSearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-xl text-xs bg-white w-64 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <select
                value={schoolStatusFilter}
                onChange={(e) => setSchoolStatusFilter(e.target.value as any)}
                className="px-2.5 py-1.5 border border-slate-200 rounded-xl text-xs bg-white text-slate-700 cursor-pointer"
              >
                <option value="all">सभी स्थितियाँ</option>
                <option value="Active">सक्रिय (Active)</option>
                <option value="Trial">ट्रायल (Trial)</option>
                <option value="Suspended">निलंबित (Suspended)</option>
              </select>
            </div>
          </div>

          {/* Add School Form */}
          {showAddForm && (
            <div className="p-5 rounded-2xl bg-white border-2 border-blue-200 shadow-sm animate-in fade-in duration-200">
              <h3 className="text-sm font-black text-slate-900 mb-3 flex items-center gap-2">
                <School className="w-4 h-4 text-blue-600" />
                <span>नया विद्यालय पंजीकृत करें</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <input placeholder="विद्यालय का नाम *" value={addForm.schoolName} onChange={(e) => setAddForm(Object.assign({}, addForm, { schoolName: e.target.value }))} className="px-3 py-2 border border-slate-200 rounded-lg text-xs" />
                <input placeholder="निदेशक (Director) का नाम *" value={addForm.directorName} onChange={(e) => setAddForm(Object.assign({}, addForm, { directorName: e.target.value }))} className="px-3 py-2 border border-slate-200 rounded-lg text-xs" />
                <input placeholder="संपर्क ईमेल *" value={addForm.email} onChange={(e) => setAddForm(Object.assign({}, addForm, { email: e.target.value }))} className="px-3 py-2 border border-slate-200 rounded-lg text-xs" />
                <input placeholder="संपर्क फोन *" value={addForm.phone} onChange={(e) => setAddForm(Object.assign({}, addForm, { phone: e.target.value }))} className="px-3 py-2 border border-slate-200 rounded-lg text-xs" />
                <input placeholder="लॉगिन पासवर्ड * (न्यूनतम 6 अक्षर)" type="password" value={addForm.password} onChange={(e) => setAddForm(Object.assign({}, addForm, { password: e.target.value }))} className="px-3 py-2 border border-slate-200 rounded-lg text-xs" />
                <input placeholder="सबडोमेन (उदा. dps-bhopal)" value={addForm.subdomain} onChange={(e) => setAddForm(Object.assign({}, addForm, { subdomain: e.target.value }))} className="px-3 py-2 border border-slate-200 rounded-lg text-xs" />
                <input placeholder="कस्टम डोमेन (उदा. portal.dps.edu.in)" value={addForm.customDomain} onChange={(e) => setAddForm(Object.assign({}, addForm, { customDomain: e.target.value }))} className="px-3 py-2 border border-slate-200 rounded-lg text-xs" />
                <select value={addForm.planId} onChange={(e) => setAddForm(Object.assign({}, addForm, { planId: e.target.value }))} className="px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white">
                  {nonTrialPlans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <select value={addForm.billingCycle} onChange={(e) => setAddForm(Object.assign({}, addForm, { billingCycle: e.target.value }))} className="px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white">
                  <option value="monthly">मासिक बिलिंग</option>
                  <option value="quarterly">त्रैमासिक बिलिंग</option>
                  <option value="annual">वार्षिक बिलिंग</option>
                </select>
              </div>
              <div className="mt-4 flex items-center gap-2">
                <button onClick={createSchool} disabled={busyId === 'add'} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer disabled:opacity-50">
                  {busyId === 'add' ? 'पंजीकृत हो रहा है...' : 'पंजीकृत करें'}
                </button>
                <button onClick={() => setShowAddForm(false)} className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold rounded-xl transition cursor-pointer">
                  रद्द
                </button>
              </div>
            </div>
          )}

          {/* Pending Approvals */}
          {registrations.length > 0 && (
            <div className="p-5 rounded-2xl bg-white border border-amber-300 shadow-xs bg-amber-50/10">
              <h3 className="text-sm font-black text-amber-900 mb-3 flex items-center gap-2">
                <span>⏳ लंबित पंजीकरण अनुरोध ({registrations.length})</span>
              </h3>
              <div className="space-y-2.5">
                {registrations.map((s) => (
                  <div key={s.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-amber-200 bg-amber-50/60">
                    <div>
                      <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <School className="w-4 h-4 text-amber-600" />
                        <span>{s.schoolName}</span>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {s.contactEmail} • {s.contactPhone} {s.subdomain ? `• सबडोमेन: ${s.subdomain}` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => approve(s.id)} disabled={busyId === s.id} className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-xs transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>स्वीकृत करें (7-दिन ट्रायल)</span>
                      </button>
                      <button onClick={() => reject(s.id)} disabled={busyId === s.id} className="px-3.5 py-1.5 bg-white border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-bold rounded-lg transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5">
                        <XCircle className="w-3.5 h-3.5" />
                        <span>अस्वीकृत</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Schools Table */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs overflow-x-auto">
            <h3 className="text-sm font-black text-slate-900 mb-3 flex items-center gap-2">
              <School className="w-4 h-4 text-slate-500" />
              <span>पंजीकृत विद्यालय सूची ({filteredSchools.length})</span>
            </h3>

            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-slate-400 border-b border-slate-100">
                  <th className="py-2 pr-3 font-bold">विद्यालय विवरण</th>
                  <th className="py-2 px-3 font-bold">डोमेन / सबडोमेन</th>
                  <th className="py-2 px-3 font-bold">स्थिति</th>
                  <th className="py-2 px-3 font-bold">सब्सक्रिप्शन प्लान</th>
                  <th className="py-2 px-3 font-bold">ट्रायल समाप्ति</th>
                  <th className="py-2 px-3 font-bold">कार्रवाई</th>
                </tr>
              </thead>
              <tbody>
                {filteredSchools.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      {schoolSearch ? 'खोज के अनुसार कोई विद्यालय नहीं मिला।' : 'अभी कोई विद्यालय पंजीकृत नहीं है।'}
                    </td>
                  </tr>
                )}
                {filteredSchools.map((s) => (
                  <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition">
                    <td className="py-3 pr-3">
                      {editId === s.id ? (
                        <div className="space-y-1.5 min-w-52">
                          <input value={editForm.schoolName} onChange={(e) => setEditForm(Object.assign({}, editForm, { schoolName: e.target.value }))} placeholder="विद्यालय नाम" className="w-full px-2 py-1 border border-slate-200 rounded-lg text-xs" />
                          <input value={editForm.email} onChange={(e) => setEditForm(Object.assign({}, editForm, { email: e.target.value }))} placeholder="ईमेल" className="w-full px-2 py-1 border border-slate-200 rounded-lg text-xs" />
                          <input value={editForm.phone} onChange={(e) => setEditForm(Object.assign({}, editForm, { phone: e.target.value }))} placeholder="फोन" className="w-full px-2 py-1 border border-slate-200 rounded-lg text-xs" />
                        </div>
                      ) : (
                        <>
                          <div className="font-bold text-slate-900">{s.schoolName}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">{s.contactEmail} • {s.contactPhone}</div>
                          <div className="text-[9px] text-slate-400 font-mono">ID: {s.id}</div>
                        </>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      {editId === s.id ? (
                        <div className="space-y-1.5 min-w-40">
                          <input value={editForm.subdomain} onChange={(e) => setEditForm(Object.assign({}, editForm, { subdomain: e.target.value }))} placeholder="सबडोमेन" className="w-full px-2 py-1 border border-slate-200 rounded-lg text-xs" />
                          <input value={editForm.customDomain} onChange={(e) => setEditForm(Object.assign({}, editForm, { customDomain: e.target.value }))} placeholder="कस्टम डोमेन" className="w-full px-2 py-1 border border-slate-200 rounded-lg text-xs" />
                          <select value={editForm.status} onChange={(e) => setEditForm(Object.assign({}, editForm, { status: e.target.value }))} className="w-full px-2 py-1 border border-slate-200 rounded-lg text-xs bg-white">
                            <option value="Active">Active</option>
                            <option value="Trial">Trial</option>
                            <option value="Suspended">Suspended</option>
                          </select>
                        </div>
                      ) : (
                        <div className="space-y-0.5">
                          <div className="text-slate-700 font-medium">{s.subdomain ? `${s.subdomain}.nasven.com` : '—'}</div>
                          {s.customDomain && <div className="text-[10px] text-blue-600 font-semibold">{s.customDomain}</div>}
                          {s.provisioningStatus && s.provisioningStatus !== 'none' && (
                            <div className="mt-1 space-y-0.5">
                              <span className={'inline-block px-1.5 py-0.5 rounded-full text-[9px] font-bold ' + (s.provisioningStatus === 'live' ? 'bg-emerald-100 text-emerald-700' : (s.provisioningStatus === 'pending' || s.provisioningStatus === 'provisioning') ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700')}>
                                {'⚡ ' + (s.provisioningStatus === 'live' ? 'डेडिकेटेड लाइव' : (s.provisioningStatus === 'pending' || s.provisioningStatus === 'provisioning') ? 'प्रोविजनिंग...' : s.provisioningStatus)}
                              </span>
                              {s.dedicatedDomain && <div className="text-[9px] text-slate-400 font-mono break-all">{s.dedicatedDomain}</div>}
                              {s.provisioningError && s.provisioningStatus === 'failed' && (
                                <div className="text-[9px] text-rose-600">{s.provisioningError}</div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3">{statusBadge(s.status)}</td>
                    <td className="py-3 px-3">
                      {editId === s.id ? null : (
                        <select
                          value={s.planId}
                          onChange={(e) => setPlan(s.id, e.target.value)}
                          className="px-2.5 py-1 border border-slate-200 rounded-lg text-xs bg-white font-medium text-slate-800 max-w-44 cursor-pointer"
                        >
                          {s.planId && nonTrialPlans.findIndex((p) => p.id === s.planId) === -1 && s.planId !== 'trial' && (
                            <option value={s.planId}>{s.planName || s.planId}</option>
                          )}
                          {s.planId === 'trial' && <option value="trial">7-दिन फ्री ट्रायल</option>}
                          {nonTrialPlans.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="py-3 px-3 text-slate-600">{s.trialEndsAt || '—'}</td>
                    <td className="py-3 px-3">
                      {editId === s.id ? (
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => saveEdit(s.id)} disabled={busyId === s.id} className="px-2.5 py-1 bg-blue-600 text-white rounded-lg text-xs font-bold cursor-pointer disabled:opacity-50">
                            सहेजें
                          </button>
                          <button onClick={() => setEditId(null)} className="px-2 py-1 border border-slate-200 rounded-lg text-xs font-bold cursor-pointer">
                            रद्द
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {confirmProvisionId === s.id ? (
                              <>
                                <button onClick={() => provisionDedicated(s.id)} disabled={busyId === 'provision-' + s.id} className="px-2.5 py-1 bg-indigo-600 text-white rounded-lg text-[11px] font-bold cursor-pointer disabled:opacity-50">
                                  पक्का प्रोविजन?
                                </button>
                                <button onClick={() => setConfirmProvisionId(null)} className="px-2 py-1 border border-slate-200 rounded-lg text-[11px] font-bold cursor-pointer">
                                  रद्द
                                </button>
                              </>
                            ) : (
                              <button onClick={() => startProvision(s)} disabled={busyId === 'provision-' + s.id || busyId === 'provision-check-' + s.id} className="px-2.5 py-1 border border-indigo-200 text-indigo-700 hover:bg-indigo-50 rounded-lg text-[11px] font-bold cursor-pointer disabled:opacity-50 flex items-center gap-1">
                                <Globe className="w-3 h-3" />
                                <span>{s.provisioningStatus && s.provisioningStatus !== 'none' ? 'री-डिप्लॉय' : 'प्रोविजन'}</span>
                              </button>
                            )}
                            {(s.provisioningStatus === 'pending' || s.provisioningStatus === 'provisioning') && (
                              <button onClick={() => checkProvision(s.id)} disabled={busyId === 'provision-check-' + s.id} className="px-2 py-1 border border-amber-200 text-amber-700 hover:bg-amber-50 rounded-lg text-[11px] font-bold cursor-pointer disabled:opacity-50">
                                स्टेटस जाँचें
                              </button>
                            )}
                            <button onClick={() => startEdit(s)} className="px-2.5 py-1 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-[11px] font-bold cursor-pointer flex items-center gap-1">
                              <Pencil className="w-3 h-3" />
                              <span>एडिट</span>
                            </button>
                            {confirmDeleteId === s.id ? (
                              <button onClick={() => deleteSchool(s.id)} disabled={busyId === s.id} className="px-2.5 py-1 bg-rose-600 text-white rounded-lg text-[11px] font-bold cursor-pointer disabled:opacity-50">
                                पक्का हटाएं?
                              </button>
                            ) : (
                              <button onClick={() => setConfirmDeleteId(s.id)} className="px-2 py-1 border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-lg text-[11px] font-bold cursor-pointer flex items-center gap-1">
                                <Trash2 className="w-3 h-3" />
                                <span>हटाएं</span>
                              </button>
                            )}
                          </div>
                          {confirmProvisionId === s.id && (
                            <div className="flex items-center gap-1.5">
                              <input
                                value={provisionSlug}
                                onChange={(e) => setProvisionSlug(e.target.value)}
                                placeholder="slug (उदा. dps-bhopal)"
                                className="w-36 px-2 py-1 border border-indigo-200 rounded-lg text-[11px] font-mono"
                              />
                              <span className="text-[9px] text-slate-400 font-mono whitespace-nowrap">{provisionSlug ? provisionSlug + '.pragnya.nasven.com' : ''}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Soft-Deleted Schools */}
          {showDeleted && (
            <div className="p-5 rounded-2xl bg-white border border-rose-200 shadow-xs">
              <h3 className="text-sm font-black text-slate-900 mb-3 flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-rose-500" />
                <span>हटाए गए विद्यालय (सॉफ्ट-डिलीट)</span>
              </h3>
              {deletedLoading ? (
                <div className="flex items-center justify-center py-8 text-slate-400 gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> लोड हो रहा है...
                </div>
              ) : deletedSchools.length === 0 ? (
                <div className="py-6 text-center text-slate-400 text-xs">कोई हटाया गया विद्यालय नहीं है।</div>
              ) : (
                <div className="space-y-2.5">
                  {deletedSchools.map((s) => (
                    <div key={s.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-slate-100 bg-rose-50/40">
                      <div>
                        <div className="text-sm font-bold text-slate-900">{s.schoolName}</div>
                        <div className="text-xs text-slate-500">{s.contactEmail} • {s.contactPhone} • हटाया गया: {s.deletedAt || '—'}</div>
                      </div>
                      <button onClick={() => restoreSchool(s.id)} disabled={busyId === s.id} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition cursor-pointer disabled:opacity-50 flex items-center gap-1">
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>रिस्टोर करें</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ========================================================================= */}
      {/* 2. PLUGIN CATALOG & SUBSCRIPTIONS TAB                                     */}
      {/* ========================================================================= */}
      {activeTab === 'plugins' && (
        <div className="space-y-6">
          {/* Plugin Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs">
              <div className="text-2xl font-black text-slate-900">{plugins.length}</div>
              <div className="text-xs font-semibold text-slate-500">कैटलॉग में कुल प्लगइन्स</div>
            </div>
            <div className="p-4 rounded-2xl bg-white border border-emerald-200 shadow-2xs bg-emerald-50/20">
              <div className="text-2xl font-black text-emerald-600">{totalActivePlugins}</div>
              <div className="text-xs font-semibold text-emerald-800">प्लेटफॉर्म पर सक्रिय प्लगइन्स</div>
            </div>
            <div className="p-4 rounded-2xl bg-white border border-indigo-200 shadow-2xs bg-indigo-50/20">
              <div className="text-2xl font-black text-indigo-700">{totalActiveSubs}</div>
              <div className="text-xs font-semibold text-indigo-800">सक्रिय स्कूल सब्सक्रिप्शन्स</div>
            </div>
          </div>

          {/* Action Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Boxes className="w-5 h-5 text-indigo-600" />
                <span>ग्लोबल प्लगइन कैटलॉग एवं नियंत्रण</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                प्लगइन्स को पूरे प्लेटफ़ॉर्म पर सक्रिय/निष्क्रिय करें, नई सेवा जोड़ें, या सीधे किसी स्कूल को आवंटित करें
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAssignModal(true)}
                className="px-3.5 py-2 bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 text-xs font-bold rounded-xl shadow-2xs transition cursor-pointer flex items-center gap-1.5"
              >
                <Store className="w-4 h-4" />
                <span>+ स्कूल को प्लगइन दें</span>
              </button>

              <button
                onClick={startPluginCreate}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>+ नया प्लगइन रजिस्टर करें</span>
              </button>
            </div>
          </div>

          {/* Plugins Catalog Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {plugins.map((plugin) => {
              const isGloballyActive = !!plugin.is_active;
              const isBusy = busyId === `plugin-toggle-${plugin.id}`;

              return (
                <div
                  key={plugin.id}
                  className={`rounded-3xl border p-5 transition-all duration-200 flex flex-col justify-between ${
                    isGloballyActive
                      ? 'bg-white border-indigo-100 shadow-sm hover:shadow-md'
                      : 'bg-slate-50/70 border-slate-200 opacity-80'
                  }`}
                >
                  <div>
                    {/* Badge & Status Toggle */}
                    <div className="flex items-center justify-between mb-3">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1 ${
                        isGloballyActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                      }`}>
                        {isGloballyActive ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        <span>{isGloballyActive ? 'सक्रिय (Active)' : 'निष्क्रिय (Disabled)'}</span>
                      </span>

                      <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                        {plugin.type === 'global' ? '🌍 ग्लोबल' : '🔒 प्राइवेट'}
                      </span>
                    </div>

                    <h4 className="text-base font-black text-slate-900 leading-snug">{plugin.name}</h4>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed min-h-[36px]">
                      {plugin.description || 'कोई विवरण उपलब्ध नहीं है।'}
                    </p>
                    <div className="text-[10px] font-mono text-slate-400 mt-1">ID: {plugin.id}</div>

                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 block font-semibold">वार्षिक दर</span>
                        <span className="font-black text-slate-900 text-sm">₹{plugin.price} / वर्ष</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block font-semibold">सक्रिय स्कूल</span>
                        <span className="font-black text-indigo-700 text-sm">{plugin.active_subscribers_count || 0} स्कूल</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <button
                      onClick={() => togglePluginGlobalStatus(plugin.id)}
                      disabled={isBusy}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 ${
                        isGloballyActive
                          ? 'bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-200'
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                      }`}
                      title={isGloballyActive ? 'प्लेटफॉर्म से निष्क्रिय करें' : 'प्लेटफॉर्म पर सक्रिय करें'}
                    >
                      {isBusy ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : isGloballyActive ? (
                        <ToggleRight className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <ToggleLeft className="w-4 h-4 text-white" />
                      )}
                      <span>{isGloballyActive ? 'बंद करें' : 'सक्रिय करें'}</span>
                    </button>

                    <button
                      onClick={() => startPluginEdit(plugin)}
                      className="px-3 py-1.5 border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>एडिट</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* School Subscriptions Oversight */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs overflow-x-auto">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <Store className="w-4 h-4 text-indigo-600" />
                  <span>स्कूल-वाइज प्लगइन सब्सक्रिप्शन्स एवं ऑडिट ({subscriptions.length})</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  देखें किस स्कूल ने कौन-सा प्लगइन सक्रिय किया हुआ है, तथा सीधे एक्सेस नियंत्रित करें
                </p>
              </div>
            </div>

            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-slate-400 border-b border-slate-100">
                  <th className="py-2.5 pr-3 font-bold">विद्यालय का नाम</th>
                  <th className="py-2.5 px-3 font-bold">प्लगइन सेवा</th>
                  <th className="py-2.5 px-3 font-bold">स्थिति</th>
                  <th className="py-2.5 px-3 font-bold">वार्षिक दर</th>
                  <th className="py-2.5 px-3 font-bold">अंतिम अपडेट</th>
                  <th className="py-2.5 px-3 font-bold">नियंत्रण कार्रवाई</th>
                </tr>
              </thead>
              <tbody>
                {subscriptions.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      अभी तक किसी विद्यालय ने कोई प्लगइन सक्रिय नहीं किया है।
                    </td>
                  </tr>
                )}
                {subscriptions.map((sub) => {
                  const isActive = sub.status === 'active';
                  const isBusy = busyId === `sub-toggle-${sub.school_id}-${sub.plugin_id}`;

                  return (
                    <tr key={sub.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition">
                      <td className="py-3 pr-3 font-bold text-slate-900">{sub.school_name}</td>
                      <td className="py-3 px-3">
                        <span className="font-semibold text-indigo-900">{sub.plugin_name}</span>
                        <span className="text-[10px] text-slate-400 block font-mono">{sub.plugin_id}</span>
                      </td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {isActive ? 'सक्रिय (Active)' : 'निष्क्रिय (Revoked)'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-700 font-semibold">
                        ₹{sub.plugin_price}
                      </td>
                      <td className="py-3 px-3 text-slate-500 text-[11px]">
                        {sub.updated_at ? new Date(sub.updated_at).toLocaleDateString('hi-IN') : '—'}
                      </td>
                      <td className="py-3 px-3">
                        <button
                          onClick={() => toggleSubscriptionStatus(sub.school_id, sub.plugin_id, sub.status)}
                          disabled={isBusy}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer disabled:opacity-50 ${
                            isActive
                              ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200'
                              : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs'
                          }`}
                        >
                          {isBusy ? 'बदल रहा है...' : isActive ? 'एक्सेस रद्द करें' : 'सक्रिय करें'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Plugin Add/Edit Modal */}
          {showPluginModal && (
            <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                  <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                    <Boxes className="w-5 h-5 text-indigo-600" />
                    <span>{pluginEditId ? 'प्लगइन संपादित करें' : 'नया प्लगइन रजिस्टर करें'}</span>
                  </h3>
                  <button onClick={() => setShowPluginModal(false)} className="text-slate-400 hover:text-slate-600 font-bold p-1">✕</button>
                </div>

                <div className="space-y-3.5 text-xs">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">प्लगइन ID * (अद्वितीय कोड, उदा. plugin-transport)</label>
                    <input
                      disabled={!!pluginEditId}
                      value={pluginForm.id}
                      onChange={(e) => setPluginForm(Object.assign({}, pluginForm, { id: e.target.value }))}
                      placeholder="plugin-xyz"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono disabled:bg-slate-100"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">प्लगइन का नाम *</label>
                    <input
                      value={pluginForm.name}
                      onChange={(e) => setPluginForm(Object.assign({}, pluginForm, { name: e.target.value }))}
                      placeholder="उदा. डिजिटल LMS पोर्टल"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">संक्षिप्त विवरण</label>
                    <textarea
                      rows={3}
                      value={pluginForm.description}
                      onChange={(e) => setPluginForm(Object.assign({}, pluginForm, { description: e.target.value }))}
                      placeholder="इस प्लगइन के फीचर्स व उपयोग का विवरण..."
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">प्रकार (Type)</label>
                      <select
                        value={pluginForm.type}
                        onChange={(e) => setPluginForm(Object.assign({}, pluginForm, { type: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white cursor-pointer"
                      >
                        <option value="global">ग्लोबल (सभी स्कूलों के लिए)</option>
                        <option value="private">प्राइवेट (विशिष्ट स्कूल हेतु)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">वार्षिक दर (₹/वर्ष)</label>
                      <input
                        type="number"
                        value={pluginForm.price}
                        onChange={(e) => setPluginForm(Object.assign({}, pluginForm, { price: e.target.value }))}
                        placeholder="499"
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                      />
                    </div>
                  </div>

                  {pluginForm.type === 'private' && (
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">लक्षित स्कूल (Target School)</label>
                      <select
                        value={pluginForm.targetSchoolId}
                        onChange={(e) => setPluginForm(Object.assign({}, pluginForm, { targetSchoolId: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white cursor-pointer"
                      >
                        <option value="">-- स्कूल चुनें --</option>
                        {schools.map((s) => (
                          <option key={s.id} value={s.id}>{s.schoolName} ({s.id})</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="pt-2">
                    <label className="flex items-center gap-2 font-bold text-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={pluginForm.isActive}
                        onChange={(e) => setPluginForm(Object.assign({}, pluginForm, { isActive: e.target.checked }))}
                        className="w-4 h-4 accent-indigo-600 rounded"
                      />
                      <span>प्लेटफॉर्म पर तुरंत सक्रिय (Active) रखें</span>
                    </label>
                    <p className="text-[11px] text-slate-400 ml-6 mt-0.5">
                      निष्क्रिय करने पर स्कूल इसे मार्केटप्लेस में नहीं देख पाएंगे।
                    </p>
                  </div>
                </div>

                <div className="mt-6 flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    onClick={() => setShowPluginModal(false)}
                    className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 cursor-pointer"
                  >
                    रद्द करें
                  </button>
                  <button
                    onClick={savePlugin}
                    disabled={busyId === 'plugin-save'}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {busyId === 'plugin-save' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>सहेजें</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Assign Plugin to School Modal */}
          {showAssignModal && (
            <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                  <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                    <Store className="w-5 h-5 text-indigo-600" />
                    <span>विद्यालय को प्लगइन सेवा आवंटित करें</span>
                  </h3>
                  <button onClick={() => setShowAssignModal(false)} className="text-slate-400 hover:text-slate-600 font-bold p-1">✕</button>
                </div>

                <div className="space-y-3.5 text-xs">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">विद्यालय चुनें *</label>
                    <select
                      value={assignForm.schoolId}
                      onChange={(e) => setAssignForm(Object.assign({}, assignForm, { schoolId: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white cursor-pointer"
                    >
                      <option value="">-- विद्यालय चुनें --</option>
                      {schools.map((s) => (
                        <option key={s.id} value={s.id}>{s.schoolName} ({s.status})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">प्लगइन सेवा चुनें *</label>
                    <select
                      value={assignForm.pluginId}
                      onChange={(e) => setAssignForm(Object.assign({}, assignForm, { pluginId: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white cursor-pointer"
                    >
                      <option value="">-- प्लगइन चुनें --</option>
                      {plugins.map((p) => (
                        <option key={p.id} value={p.id}>{p.name} (₹{p.price}/yr)</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">प्रारंभिक स्थिति</label>
                    <select
                      value={assignForm.status}
                      onChange={(e) => setAssignForm(Object.assign({}, assignForm, { status: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white cursor-pointer"
                    >
                      <option value="active">तुरंत सक्रिय करें (Active)</option>
                      <option value="inactive">निष्क्रिय रखें (Inactive)</option>
                    </select>
                  </div>
                </div>

                <div className="mt-6 flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    onClick={() => setShowAssignModal(false)}
                    className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 cursor-pointer"
                  >
                    रद्द करें
                  </button>
                  <button
                    onClick={assignPluginToSchool}
                    disabled={busyId === 'assign-save'}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {busyId === 'assign-save' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>आवंटित करें</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. SUBSCRIPTION PLANS & TIERS TAB                                         */}
      {/* ========================================================================= */}
      {activeTab === 'plans' && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Boxes className="w-4 h-4 text-slate-500" />
                <span>सदस्यता प्लान (Tier Plans)</span>
              </h3>
              <p className="text-xs text-slate-500">नए प्लान बनाएं, कीमत/मॉड्यूल बदलें, या प्लान निष्क्रिय करें</p>
            </div>
            <button onClick={startPlanCreate} className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition cursor-pointer">
              <Plus className="w-4 h-4" /> नया प्लान
            </button>
          </div>

          {showPlanForm && (
            <div className="p-5 rounded-2xl bg-white border border-blue-200 shadow-xs">
              <h3 className="text-sm font-black text-slate-900 mb-3">{planEditId ? 'प्लान संपादित करें' : 'नया प्लान बनाएं'}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <input placeholder="प्लान का नाम *" value={planForm.name} onChange={(e) => setPlanForm(Object.assign({}, planForm, { name: e.target.value }))} className="px-3 py-2 border border-slate-200 rounded-lg text-xs" />
                <input placeholder="टैगलाइन" value={planForm.tagline} onChange={(e) => setPlanForm(Object.assign({}, planForm, { tagline: e.target.value }))} className="px-3 py-2 border border-slate-200 rounded-lg text-xs" />
                <input placeholder="बैज (वैकल्पिक)" value={planForm.badge} onChange={(e) => setPlanForm(Object.assign({}, planForm, { badge: e.target.value }))} className="px-3 py-2 border border-slate-200 rounded-lg text-xs" />
                <input placeholder="मासिक मूल्य (₹)" type="number" value={planForm.monthlyPrice} onChange={(e) => setPlanForm(Object.assign({}, planForm, { monthlyPrice: e.target.value }))} className="px-3 py-2 border border-slate-200 rounded-lg text-xs" />
                <input placeholder="त्रैमासिक मूल्य (₹)" type="number" value={planForm.quarterlyPrice} onChange={(e) => setPlanForm(Object.assign({}, planForm, { quarterlyPrice: e.target.value }))} className="px-3 py-2 border border-slate-200 rounded-lg text-xs" />
                <input placeholder="वार्षिक मूल्य (₹)" type="number" value={planForm.annualPrice} onChange={(e) => setPlanForm(Object.assign({}, planForm, { annualPrice: e.target.value }))} className="px-3 py-2 border border-slate-200 rounded-lg text-xs" />
                <input placeholder="अधिकतम छात्र (खाली = असीमित)" type="number" value={planForm.maxStudents} onChange={(e) => setPlanForm(Object.assign({}, planForm, { maxStudents: e.target.value }))} className="px-3 py-2 border border-slate-200 rounded-lg text-xs" />
                <input placeholder="अधिकतम स्टाफ (खाली = असीमित)" type="number" value={planForm.maxStaff} onChange={(e) => setPlanForm(Object.assign({}, planForm, { maxStaff: e.target.value }))} className="px-3 py-2 border border-slate-200 rounded-lg text-xs" />
                <input placeholder="छात्र सीमा लेबल (जैसे: 500 विद्यार्थी)" value={planForm.maxStudentsLabel} onChange={(e) => setPlanForm(Object.assign({}, planForm, { maxStudentsLabel: e.target.value }))} className="px-3 py-2 border border-slate-200 rounded-lg text-xs" />
                <input placeholder="क्रम (sort order)" type="number" value={planForm.sortOrder} onChange={(e) => setPlanForm(Object.assign({}, planForm, { sortOrder: e.target.value }))} className="px-3 py-2 border border-slate-200 rounded-lg text-xs" />
                <textarea placeholder="फीचर्स (हर पंक्ति एक फीचर)" value={planForm.features} onChange={(e) => setPlanForm(Object.assign({}, planForm, { features: e.target.value }))} className="px-3 py-2 border border-slate-200 rounded-lg text-xs h-20 col-span-1 sm:col-span-2 lg:col-span-3" />
              </div>

              <div className="mt-4">
                <div className="text-xs font-bold text-slate-600 mb-2">मॉड्यूल एक्सेस</div>
                <div className="flex flex-wrap gap-2">
                  {MODULE_OPTIONS.map((m) => (
                    <button key={m} onClick={() => toggleModule(m)} className={'px-2.5 py-1 rounded-full text-[11px] font-bold border transition cursor-pointer ' + (planForm.modules.indexOf(m) !== -1 ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50')}>{m}</button>
                  ))}
                </div>
              </div>

              <div className="mt-4">
                <div className="text-xs font-bold text-slate-600 mb-2">फीचर फ्लैग्स</div>
                <div className="flex flex-wrap gap-3">
                  {FLAG_OPTIONS.map((f) => (
                    <label key={f.key} className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                      <input type="checkbox" checked={!!(planForm as any)[f.key]} onChange={() => toggleFlag(f.key)} className="accent-blue-600" /> {f.label}
                    </label>
                  ))}
                  <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer"><input type="checkbox" checked={planForm.recommended} onChange={(e) => setPlanForm(Object.assign({}, planForm, { recommended: e.target.checked }))} className="accent-blue-600" /> अनुशंसित</label>
                  <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer"><input type="checkbox" checked={planForm.active} onChange={(e) => setPlanForm(Object.assign({}, planForm, { active: e.target.checked }))} className="accent-blue-600" /> सक्रिय</label>
                  <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer"><input type="checkbox" checked={planForm.isTrial} onChange={(e) => setPlanForm(Object.assign({}, planForm, { isTrial: e.target.checked }))} className="accent-blue-600" /> ट्रायल प्लान</label>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2">
                <button onClick={savePlan} disabled={busyId === 'plan-save'} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition cursor-pointer disabled:opacity-50">सेव करें</button>
                <button onClick={() => setShowPlanForm(false)} className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold rounded-xl transition cursor-pointer">रद्द</button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400 gap-2"><Loader2 className="w-5 h-5 animate-spin" /> लोड हो रहा है...</div>
          ) : (
            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-100">
                    <th className="py-2 pr-3 font-bold">प्लान</th>
                    <th className="py-2 px-3 font-bold">कीमत (₹)</th>
                    <th className="py-2 px-3 font-bold">सीमा</th>
                    <th className="py-2 px-3 font-bold">मॉड्यूल</th>
                    <th className="py-2 px-3 font-bold">स्थिति</th>
                    <th className="py-2 px-3 font-bold">कार्रवाई</th>
                  </tr>
                </thead>
                <tbody>
                  {plans.length === 0 && (
                    <tr><td colSpan={6} className="py-8 text-center text-slate-400">कोई प्लान नहीं मिला।</td></tr>
                  )}
                  {plans.map((p) => (
                    <tr key={p.id} className="border-b border-slate-50">
                      <td className="py-3 pr-3">
                        <div className="font-bold text-slate-900">{p.name} {p.recommended && <span className="ml-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[9px] font-bold">अनुशंसित</span>}</div>
                        <div className="text-[10px] text-slate-400">{p.tagline}</div>
                        <div className="text-[10px] text-slate-300 font-mono">ID: {p.id}</div>
                      </td>
                      <td className="py-3 px-3 text-slate-600">मासिक {p.monthlyPrice}<br />त्रैमासिक {p.quarterlyPrice}<br />वार्षिक {p.annualPrice}</td>
                      <td className="py-3 px-3 text-slate-600">{p.maxStudents || '—'}<br />स्टाफ: {p.maxStaffLimit === null || p.maxStaffLimit === undefined ? 'असीमित' : p.maxStaffLimit}</td>
                      <td className="py-3 px-3 text-slate-600">{(p.modules || []).length} मॉड्यूल<br />{(p.features || []).length} फीचर्स</td>
                      <td className="py-3 px-3">
                        <span className={'px-2 py-0.5 rounded-full text-[10px] font-bold ' + (p.active !== false ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500')}>{p.active !== false ? 'सक्रिय' : 'निष्क्रिय'}</span>
                        {p.isTrial && <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">ट्रायल</span>}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => startPlanEdit(p)} className="px-2 py-1 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-[10px] font-bold cursor-pointer flex items-center gap-1"><Pencil className="w-3 h-3" /> एडिट</button>
                          {!p.isTrial && p.active !== false && (
                            <button onClick={() => deactivatePlan(p.id)} disabled={busyId === p.id} className="px-2 py-1 border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-lg text-[10px] font-bold cursor-pointer disabled:opacity-50 flex items-center gap-1"><Trash2 className="w-3 h-3" /> निष्क्रिय</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
