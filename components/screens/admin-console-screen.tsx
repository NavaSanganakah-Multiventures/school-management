'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck, RefreshCw, CheckCircle2, XCircle, School, IndianRupee,
  Loader2, Plus, Trash2, RotateCcw, Pencil, Tag, Boxes, Eye, EyeOff,
  Search, ToggleLeft, ToggleRight, Sparkles, Globe, Lock, Check, Store, Mail,
  MessageSquarePlus, Clock, ExternalLink, Calendar, CreditCard, Bell, Send
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
  emailQuotaLimit: number | null;
  emailQuotaUsed: number;
  emailQuotaResetAt: string;
  emailFromName: string;
  emailFromEmail: string;
  emailReplyTo: string;
  emailConfigActive: boolean;
  estimatedStudents?: number;
  estimatedStaff?: number;
  preferredPlanId?: string;
  customRequirements?: string;
  trialReminderSentAt?: string;
  trialExpiredSentAt?: string;
}

interface FeatureRequestRow {
  id: string;
  school_id: string;
  school_name: string;
  contact_email: string;
  contact_phone: string;
  subdomain: string;
  plan_id: string;
  title: string;
  description: string;
  category: string;
  status: 'Pending' | 'In_Review' | 'Approved' | 'Delivered' | 'Rejected';
  admin_notes?: string;
  created_at: string;
  updated_at: string;
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
  dedicatedWorker?: boolean;
  sortOrder: number;
}

interface TransactionRow {
  id: string;
  invoiceNumber: string;
  schoolId: string;
  schoolName: string;
  subdomain: string;
  contactEmail: string;
  description: string;
  planName: string;
  billingCycle: string;
  subtotal: number;
  gstPercent: number;
  gstAmount: number;
  totalAmount: number;
  paymentStatus: string;
  paymentMethod: string;
  transactionId: string;
  invoiceDate: string;
  paidAt: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpayPaymentLinkId: string;
  razorpayPaymentLinkUrl: string;
  webhookReceivedAt: string;
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

interface PluginTrialItem {
  id: string;
  school_id: string;
  plugin_id: string;
  status: string;
  valid_until?: string | null;
  trial_ends_at?: string | null;
  trial_granted_by?: string | null;
  trial_granted_at?: string | null;
  payment_status: string;
  price_per_cycle?: number | null;
  billing_cycle?: string | null;
  next_billing_date?: string | null;
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
  { key: 'dedicatedWorker', label: 'डेडिकेटेड वर्कर' },
];

const default7Days = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
const emptyAddForm = { schoolName: '', directorName: '', email: '', phone: '', password: '', subdomain: '', customDomain: '', planId: 'trial', trialEndsAt: default7Days(), billingCycle: 'monthly' };
const emptyPlanForm = { name: '', tagline: '', badge: '', monthlyPrice: '', quarterlyPrice: '', annualPrice: '', maxStudents: '', maxStaff: '', maxStudentsLabel: '', recommended: false, active: true, isTrial: false, sortOrder: '0', modules: ['dashboard', 'students', 'attendance', 'staff', 'notices', 'fees', 'settings', 'billing'], features: '', reportCards: false, principalHistory: false, autopay: false, domainEmail: false, multiSchool: false, prioritySupport: false, customDomainIncluded: false, dedicatedWorker: false };
const emptyPluginForm = { id: '', name: '', description: '', type: 'global' as 'global' | 'private', price: '0', isActive: true, targetSchoolId: '' };
const emptyAssignForm = { schoolId: '', pluginId: '', status: 'active' as 'active' | 'inactive' };

export function AdminConsoleScreen() {
  const [activeTab, setActiveTab] = useState<'schools' | 'transactions' | 'plugins' | 'plans' | 'requests' | 'subscriptions'>('schools');
  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [txnSummary, setTxnSummary] = useState<any>(null);
  const [txnLoading, setTxnLoading] = useState(false);
  const [txnStatusFilter, setTxnStatusFilter] = useState('All');
  const [payLinkSchool, setPayLinkSchool] = useState<SchoolRow | null>(null);
  const [payLinkPlanId, setPayLinkPlanId] = useState('starter');
  const [payLinkCycle, setPayLinkCycle] = useState('annual');
  const [payLinkBusy, setPayLinkBusy] = useState(false);
  const [notifySchool, setNotifySchool] = useState<SchoolRow | null>(null);
  const [notifyForm, setNotifyForm] = useState({ title: '', body: '', targetRole: 'Director', priority: 'high' });
  const [notifyBusy, setNotifyBusy] = useState(false);
  const [registrations, setRegistrations] = useState<SchoolRow[]>([]);
  const [featureRequests, setFeatureRequests] = useState<FeatureRequestRow[]>([]);
  const [approvalPlans, setApprovalPlans] = useState<Record<string, string>>({});
  const [approvalExpiryDates, setApprovalExpiryDates] = useState<Record<string, string>>({});
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [plugins, setPlugins] = useState<PluginItem[]>([]);
  const [subscriptions, setSubscriptions] = useState<PluginSubscription[]>([]);
  const [pluginTrials, setPluginTrials] = useState<PluginTrialItem[]>([]);
  const [pluginTrialsLoading, setPluginTrialsLoading] = useState(false);
  const [recurringSubs, setRecurringSubs] = useState<any[]>([]);
  const [recurringSubsLoading, setRecurringSubsLoading] = useState(false);
  const [trialModal, setTrialModal] = useState<{ schoolId: string; schoolName: string } | null>(null);
  const [trialForm, setTrialForm] = useState({ pluginId: '', trialDays: '7' });
  const [pluginPaymentModal, setPluginPaymentModal] = useState<{ schoolId: string; schoolName: string; pluginId: string; pluginName: string } | null>(null);
  const [pluginPaymentForm, setPluginPaymentForm] = useState({ billingCycle: 'monthly' });
  const [deletedSchools, setDeletedSchools] = useState<SchoolRow[]>([]);

  // Expiry Date Modal State
  const [expiryModalSchool, setExpiryModalSchool] = useState<SchoolRow | null>(null);
  const [expiryModalDate, setExpiryModalDate] = useState('');
  const [expiryModalBusy, setExpiryModalBusy] = useState(false);

  const [showDeleted, setShowDeleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deletedLoading, setDeletedLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmProvisionId, setConfirmProvisionId] = useState<string | null>(null);
  const [provisionSlug, setProvisionSlug] = useState('');
  const [emailQuotaId, setEmailQuotaId] = useState<string | null>(null);
  const [emailQuotaForm, setEmailQuotaForm] = useState<any>({ limit: '', fromName: '', fromEmail: '', replyTo: '' });

  // School Search & Filter
  const [schoolSearch, setSchoolSearch] = useState('');
  const [schoolStatusFilter, setSchoolStatusFilter] = useState<'all' | 'Active' | 'Trial' | 'Suspended' | 'Expired'>('all');
  const [schoolDeliveryFilter, setSchoolDeliveryFilter] = useState<'all' | 'shared' | 'dedicated'>('all');

  // School Add & Edit Forms
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState<any>(emptyAddForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({ schoolName: '', email: '', phone: '', subdomain: '', customDomain: '', status: 'Active', planId: 'trial', trialEndsAt: '' });

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
      const [sRes, rRes, pRes, plRes, subRes, frRes] = await Promise.all([
        fetch('/api/admin/schools').then((r) => r.json()).catch(() => ({})),
        fetch('/api/admin/registrations').then((r) => r.json()).catch(() => ({})),
        fetch('/api/admin/plans').then((r) => r.json()).catch(() => ({})),
        fetch('/api/admin/plugins').then((r) => r.json()).catch(() => ({})),
        fetch('/api/admin/plugins/subscriptions').then((r) => r.json()).catch(() => ({})),
        fetch('/api/admin/feature-requests').then((r) => r.json()).catch(() => ({})),
      ]);
      if (sRes.success) setSchools(sRes.schools || []);
      if (rRes.success) setRegistrations(rRes.registrations || []);
      if (pRes.success) setPlans(pRes.plans || []);
      if (plRes.success) setPlugins(plRes.plugins || []);
      if (subRes.success) setSubscriptions(subRes.subscriptions || []);
      if (frRes.success) setFeatureRequests(frRes.requests || []);

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

  // Transactions (all-schools payment history)
  const loadTransactions = useCallback(async (statusFilter?: string) => {
    setTxnLoading(true);
    try {
      const q = statusFilter && statusFilter !== 'All' ? `?status=${encodeURIComponent(statusFilter)}` : '';
      const res = await fetch(`/api/admin/transactions${q}`).then((r) => r.json()).catch(() => ({}));
      if (res.success) {
        setTransactions(res.transactions || []);
        setTxnSummary(res.summary || null);
      } else {
        setTransactions([]);
        setTxnSummary(null);
        if (res.message) setErrorMsg(res.message);
      }
    } catch (e) {
      setErrorMsg('ट्रांज़ैक्शन लोड करने में त्रुटि।');
    } finally {
      setTxnLoading(false);
    }
  }, []);

  // Plugin Trial Actions
  const loadPluginTrials = useCallback(async () => {
    setPluginTrialsLoading(true);
    try {
      const res = await fetch('/api/admin/plugins/trials').then((r) => r.json()).catch(() => ({}));
      if (res.success) setPluginTrials(res.trials || []);
    } catch (_) {} finally { setPluginTrialsLoading(false); }
  }, []);

  const loadRecurringSubs = useCallback(async () => {
    setRecurringSubsLoading(true);
    try {
      const res = await fetch('/api/admin/subscriptions').then((r) => r.json()).catch(() => ({}));
      if (res.success) setRecurringSubs(res.subscriptions || []);
    } catch (_) {} finally { setRecurringSubsLoading(false); }
  }, []);

  useEffect(() => {
    if (activeTab === 'transactions') loadTransactions(txnStatusFilter);
    if (activeTab === 'plugins') loadPluginTrials();
    if (activeTab === 'subscriptions') loadRecurringSubs();
  }, [activeTab, txnStatusFilter, loadTransactions, loadPluginTrials, loadRecurringSubs]);

  // Send Razorpay payment link to a school (email + FCM)
  const sendPaymentLink = async () => {
    if (!payLinkSchool) return;
    setPayLinkBusy(true);
    try {
      const data = await post('/api/admin/schools/send-payment-link', {
        schoolId: payLinkSchool.id,
        planId: payLinkPlanId,
        billingCycle: payLinkCycle,
      });
      if (data.success) {
        flashSuccess(data.message || 'पेमेंट लिंक भेज दिया गया।' + (data.paymentLink ? `\n🔗 ${data.paymentLink}` : ''));
        setPayLinkSchool(null);
      } else setErrorMsg(data.message || 'पेमेंट लिंक भेजने में त्रुटि।');
    } catch (e) { setErrorMsg('नेटवर्क त्रुटि।'); }
    finally { setPayLinkBusy(false); }
  };

  // Send manual FCM push notification to a school
  const sendNotify = async () => {
    if (!notifySchool) return;
    setNotifyBusy(true);
    try {
      const data = await post('/api/admin/schools/notify', {
        schoolId: notifySchool.id,
        title: notifyForm.title,
        body: notifyForm.body,
        targetRole: notifyForm.targetRole,
        priority: notifyForm.priority,
      });
      if (data.success) {
        flashSuccess(data.message || 'नोटिफिकेशन भेजा गया।');
        setNotifySchool(null);
        setNotifyForm({ title: '', body: '', targetRole: 'Director', priority: 'high' });
      } else setErrorMsg(data.message || 'नोटिफिकेशन भेजने में त्रुटि।');
    } catch (e) { setErrorMsg('नेटवर्क त्रुटि।'); }
    finally { setNotifyBusy(false); }
  };

  // School actions
  const approve = async (schoolId: string, planId?: string, trialEndsAt?: string) => {
    setBusyId(schoolId);
    try {
      const data = await post('/api/admin/registrations/approve', { schoolId, planId, trialEndsAt });
      if (data.success) {
        flashSuccess(data.message || 'स्कूल अप्रूव्ड!');
        await loadData();
      } else setErrorMsg(data.message || 'अप्रूवल विफल।');
    } catch (e) { setErrorMsg('नेटवर्क त्रुटि।'); }
    finally { setBusyId(null); }
  };

  const updateFeatureRequestStatus = async (id: string, status: string, notes: string) => {
    setBusyId('freq-' + id);
    try {
      const data = await post('/api/admin/feature-requests/status', { id, status, adminNotes: notes });
      if (data.success) {
        flashSuccess(data.message || 'अनुरोध स्थिति अपडेट हुई।');
        await loadData();
      } else setErrorMsg(data.message || 'स्थिति अपडेट विफल।');
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

  const setPlan = async (schoolId: string, planId: string, trialEndsAt?: string) => {
    setBusyId(schoolId);
    try {
      const data = await post('/api/admin/schools/plan', { schoolId, planId, trialEndsAt });
      if (data.success) { flashSuccess(data.message || 'स्कूल का प्लान सफलतापूर्वक बदल दिया गया।'); await loadData(); }
      else setErrorMsg(data.message || 'प्लान बदलने में त्रुटि।');
    } catch (e) { setErrorMsg('नेटवर्क त्रुटि।'); }
    finally { setBusyId(null); }
  };

  const saveExpiryDate = async (schoolId: string, expiryDate: string) => {
    if (!expiryDate) { setErrorMsg('कृपया समाप्ति तिथि चुनें।'); return; }
    setExpiryModalBusy(true);
    try {
      const data = await post('/api/admin/schools/expiry-date', { schoolId, expiryDate });
      if (data.success) {
        flashSuccess(data.message || 'समाप्ति तिथि अपडेट हो गई।');
        setExpiryModalSchool(null);
        await loadData();
      } else {
        setErrorMsg(data.message || 'समाप्ति तिथि सेट करने में त्रुटि।');
      }
    } catch (e) {
      setErrorMsg('नेटवर्क त्रुटि।');
    } finally {
      setExpiryModalBusy(false);
    }
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
    setEditForm({
      schoolName: s.schoolName,
      email: s.contactEmail,
      phone: s.contactPhone,
      subdomain: s.subdomain || '',
      customDomain: s.customDomain || '',
      status: s.status,
      planId: s.planId || 'trial',
      trialEndsAt: s.trialEndsAt || '',
    });
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

  // Dedicated Worker provisioning actions
  const runTrialProcess = async () => {
    setBusyId('trial-process');
    try {
      const data = await post('/api/admin/trial/process', {});
      if (data.success) {
        flashSuccess(data.message || 'ट्रायल प्रोसेसिंग सफलतापूर्वक पूर्ण हुई।');
        await loadData();
      } else setErrorMsg(data.message || 'ट्रायल प्रोसेसिंग विफल।');
    } catch (e) { setErrorMsg('नेटवर्क त्रुटि।'); }
    finally { setBusyId(null); }
  };

  const extendTrial = async (schoolId: string, days: number = 7) => {
    setBusyId('extend-' + schoolId);
    try {
      const data = await post('/api/admin/trial/extend', { schoolId, days });
      if (data.success) {
        flashSuccess(data.message || 'ट्रायल सफलतापूर्वक बढ़ा दिया गया।');
        await loadData();
      } else setErrorMsg(data.message || 'ट्रायल विस्तार विफल।');
    } catch (e) { setErrorMsg('नेटवर्क त्रुटि।'); }
    finally { setBusyId(null); }
  };

  const startProvision = (s: SchoolRow) => {
    if (s.planId !== 'enterprise') {
      setErrorMsg(`"${s.schoolName}" वर्तमान में ${s.planName || s.planId} पर है। डेडीकेटेड वर्कर केवल एंटरप्राइज (Enterprise) प्लान के लिए उपलब्ध है। कृपया पहले स्कूल का प्लान 'एंटरप्राइज' में बदलें।`);
      return;
    }
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

  const deprovisionDedicated = async (s: SchoolRow) => {
    if (!confirm(`क्या आप निश्चित रूप से "${s.schoolName}" को शेयर्ड वर्कर मोड में वापस बदलना चाहते हैं? इससे यह स्कूल pragnya.nasven.com पर कार्य करेगा।`)) return;
    setBusyId('deprovision-' + s.id);
    try {
      const data = await post('/api/admin/schools/provision/deprovision', { schoolId: s.id });
      if (data.success) {
        flashSuccess(data.message || 'स्कूल को शेयर्ड वर्कर मोड में बदल दिया गया।');
        await loadData();
      } else setErrorMsg(data.message || 'डी-प्रोविजनिंग विफल।');
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

  // Email quota + business-domain sender config
  const startEmailConfig = (s: SchoolRow) => {
    setEmailQuotaId(s.id);
    setEmailQuotaForm({
      limit: s.emailQuotaLimit === null || s.emailQuotaLimit === undefined ? '' : String(s.emailQuotaLimit),
      fromName: s.emailFromName || '',
      fromEmail: s.emailFromEmail || '',
      replyTo: s.emailReplyTo || '',
    });
  };

  const saveEmailConfig = async (schoolId: string) => {
    setBusyId('email-' + schoolId);
    setErrorMsg('');
    try {
      const res = await fetch('/api/admin/schools/email-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolId: schoolId,
          limit: emailQuotaForm.limit === '' ? null : Number(emailQuotaForm.limit),
          fromName: emailQuotaForm.fromName,
          fromEmail: emailQuotaForm.fromEmail,
          replyTo: emailQuotaForm.replyTo,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setEmailQuotaId(null);
        loadData();
      } else setErrorMsg(data.message || 'ईमेल कॉन्फ़िगरेशन सहेजा नहीं जा सका।');
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
      dedicatedWorker: !!p.featureFlags.dedicatedWorker,
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
        dedicatedWorker: planForm.dedicatedWorker,
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

  // Plugin Trial Actions
  const grantPluginTrial = async () => {
    if (!trialModal || !trialForm.pluginId) return;
    setBusyId('grant-trial');
    try {
      const data = await post('/api/admin/plugins/grant-trial', {
        schoolId: trialModal.schoolId,
        pluginId: trialForm.pluginId,
        trialDays: Number(trialForm.trialDays) || 7,
      });
      if (data.success) {
        flashSuccess(data.message || 'ट्रायल दे दिया गया।');
        setTrialModal(null);
        setTrialForm({ pluginId: '', trialDays: '7' });
        await loadPluginTrials();
      } else setErrorMsg(data.message || 'ट्रायल विफल।');
    } catch (e) { setErrorMsg('नेटवर्क त्रुटि।'); }
    finally { setBusyId(null); }
  };

  const revokePluginTrial = async (schoolId: string, pluginId: string) => {
    setBusyId(`revoke-trial-${schoolId}-${pluginId}`);
    try {
      const data = await post('/api/admin/plugins/revoke-trial', { schoolId, pluginId });
      if (data.success) { flashSuccess(data.message || 'ट्रायल रद्द।'); await loadPluginTrials(); }
      else setErrorMsg(data.message || 'रद्दीकरण विफल।');
    } catch (e) { setErrorMsg('नेटवर्क त्रुटि।'); }
    finally { setBusyId(null); }
  };

  const sendPluginPaymentLink = async () => {
    if (!pluginPaymentModal) return;
    setBusyId('send-plugin-link');
    try {
      const data = await post('/api/admin/plugins/send-payment-link', {
        schoolId: pluginPaymentModal.schoolId,
        pluginId: pluginPaymentModal.pluginId,
        billingCycle: pluginPaymentForm.billingCycle,
      });
      if (data.success) {
        flashSuccess(data.message || 'पेमेंट लिंक भेजा गया।' + (data.paymentLink ? ` लिंक: ${data.paymentLink}` : ''));
        setPluginPaymentModal(null);
        await loadPluginTrials();
      } else setErrorMsg(data.message || 'लिंक भेजने में विफल।');
    } catch (e) { setErrorMsg('नेटवर्क त्रुटि।'); }
    finally { setBusyId(null); }
  };

  const processPluginTrials = async () => {
    setBusyId('process-plugin-trials');
    try {
      const data = await post('/api/admin/plugins/process-trials', {});
      if (data.success) { flashSuccess(data.message || 'प्लगइन ट्रायल प्रोसेसिंग पूर्ण।'); await loadPluginTrials(); }
      else setErrorMsg(data.message || 'प्रोसेसिंग विफल।');
    } catch (e) { setErrorMsg('नेटवर्क त्रुटि।'); }
    finally { setBusyId(null); }
  };

  // Recurring Subscription Actions (admin)
  const adminCancelSub = async (schoolId: string, cancelAtCycleEnd: boolean) => {
    setBusyId(`cancel-sub-${schoolId}`);
    try {
      const data = await post('/api/admin/subscriptions/cancel', { schoolId, cancelAtCycleEnd });
      if (data.success) { flashSuccess(data.message || 'सदस्यता रद्द।'); await loadRecurringSubs(); }
      else setErrorMsg(data.message || 'रद्दीकरण विफल।');
    } catch (e) { setErrorMsg('नेटवर्क त्रुटि।'); }
    finally { setBusyId(null); }
  };

  const adminPauseSub = async (schoolId: string) => {
    setBusyId(`pause-sub-${schoolId}`);
    try {
      const data = await post('/api/admin/subscriptions/pause', { schoolId });
      if (data.success) { flashSuccess(data.message || 'सदस्यता रोक दी गई।'); await loadRecurringSubs(); }
      else setErrorMsg(data.message || 'विफल।');
    } catch (e) { setErrorMsg('नेटवर्क त्रुटि।'); }
    finally { setBusyId(null); }
  };

  const adminResumeSub = async (schoolId: string) => {
    setBusyId(`resume-sub-${schoolId}`);
    try {
      const data = await post('/api/admin/subscriptions/resume', { schoolId });
      if (data.success) { flashSuccess(data.message || 'सदस्यता फिर से शुरू।'); await loadRecurringSubs(); }
      else setErrorMsg(data.message || 'विफल।');
    } catch (e) { setErrorMsg('नेटवर्क त्रुटि।'); }
    finally { setBusyId(null); }
  };

  const todayStr = new Date().toISOString().split('T')[0];
  const isSchoolExpired = (s: SchoolRow) => {
    return (s.planId === 'trial' || s.status === 'Trial' || s.registrationStatus === 'Trial_Expired') &&
      Boolean(s.trialEndsAt && s.trialEndsAt < todayStr);
  };

  // Filtered Schools
  const filteredSchools = schools.filter((s) => {
    const matchesSearch = !schoolSearch.trim() ||
      s.schoolName.toLowerCase().includes(schoolSearch.toLowerCase()) ||
      s.contactEmail.toLowerCase().includes(schoolSearch.toLowerCase()) ||
      s.contactPhone.includes(schoolSearch) ||
      (s.subdomain && s.subdomain.toLowerCase().includes(schoolSearch.toLowerCase())) ||
      (s.dedicatedSlug && s.dedicatedSlug.toLowerCase().includes(schoolSearch.toLowerCase()));

    const expired = isSchoolExpired(s);
    const matchesStatus = schoolStatusFilter === 'all'
      ? true
      : schoolStatusFilter === 'Expired'
      ? expired
      : s.status === schoolStatusFilter;

    const isDedicated = s.planId === 'enterprise' || (s.provisioningStatus && s.provisioningStatus !== 'none');
    const matchesDelivery = schoolDeliveryFilter === 'all' ||
      (schoolDeliveryFilter === 'dedicated' && isDedicated) ||
      (schoolDeliveryFilter === 'shared' && !isDedicated);

    return matchesSearch && matchesStatus && matchesDelivery;
  });

  const totalDedicated = schools.filter((s) => s.planId === 'enterprise' || (s.provisioningStatus && s.provisioningStatus !== 'none')).length;
  const totalShared = schools.length - totalDedicated;
  const totalActive = schools.filter((s) => s.status === 'Active').length;
  const totalTrial = schools.filter((s) => s.status === 'Trial').length;
  const totalExpired = schools.filter(isSchoolExpired).length;
  const totalActivePlugins = plugins.filter((p) => !!p.is_active).length;
  const totalActiveSubs = subscriptions.filter((s) => s.status === 'active').length;

  const statusBadge = (status: string, school?: SchoolRow) => {
    if (school && isSchoolExpired(school)) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200 whitespace-nowrap">
          ⚠️ ट्रायल समाप्त (Expired)
        </span>
      );
    }
    return (
      <span className={'px-2 py-0.5 rounded-full text-[10px] font-bold ' + (status === 'Active' ? 'bg-emerald-100 text-emerald-700' : status === 'Trial' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600')}>
        {status === 'Active' ? 'सक्रिय' : status === 'Trial' ? 'ट्रायल' : status}
      </span>
    );
  };

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
          onClick={() => setActiveTab('transactions')}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
            activeTab === 'transactions' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>लेन-देन (Transactions)</span>
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

        <button
          onClick={() => setActiveTab('subscriptions')}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
            activeTab === 'subscriptions' ? 'bg-violet-600 text-white shadow-xs' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <RefreshCw className="w-4 h-4" />
          <span>Recurring सदस्यता ({recurringSubs.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('requests')}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
            activeTab === 'requests' ? 'bg-amber-600 text-white shadow-xs' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <MessageSquarePlus className="w-4 h-4" />
          <span>फ़ीचर व आवश्यकता अनुरोध ({featureRequests.length})</span>
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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs">
              <div className="text-2xl font-black text-slate-900">{schools.length}</div>
              <div className="text-xs font-semibold text-slate-500">कुल पंजीकृत विद्यालय</div>
            </div>
            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs bg-slate-50/40">
              <div className="text-2xl font-black text-slate-700">{totalShared}</div>
              <div className="text-xs font-semibold text-slate-600">☁️ शेयर्ड वर्कर (Shared)</div>
            </div>
            <div className="p-4 rounded-2xl bg-white border border-indigo-200 shadow-2xs bg-indigo-50/30">
              <div className="text-2xl font-black text-indigo-700">{totalDedicated}</div>
              <div className="text-xs font-semibold text-indigo-800">⚡ डेडीकेटेड वर्कर (Enterprise)</div>
            </div>
            <div className="p-4 rounded-2xl bg-white border border-rose-200 shadow-2xs bg-rose-50/30">
              <div className="text-2xl font-black text-rose-700">{totalExpired}</div>
              <div className="text-xs font-semibold text-rose-800">⚠️ समाप्त ट्रायल (Expired)</div>
            </div>
            <div className="p-4 rounded-2xl bg-white border border-amber-200 shadow-2xs bg-amber-50/20">
              <div className="text-2xl font-black text-amber-600">{registrations.length}</div>
              <div className="text-xs font-semibold text-amber-800">लंबित पंजीकरण अप्रूवल</div>
            </div>
          </div>

          {/* Action Header & Search */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
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
              <button
                onClick={runTrialProcess}
                disabled={busyId === 'trial-process'}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition cursor-pointer disabled:opacity-50 shadow-xs"
                title="सभी स्कूलों के 2-दिन रिमाइंडर व समाप्त ट्रायल ईमेल तुरंत जांचें व भेजें"
              >
                <Clock className="w-3.5 h-3.5" />
                <span>{busyId === 'trial-process' ? 'जांच जारी...' : '⚡ ट्रायल समाप्ति जांचें व अलर्ट भेजें'}</span>
              </button>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
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
                className="px-2.5 py-1.5 border border-slate-200 rounded-xl text-xs bg-white text-slate-700 cursor-pointer font-medium"
              >
                <option value="all">सभी स्थितियाँ</option>
                <option value="Active">सक्रिय (Active)</option>
                <option value="Trial">ट्रायल (Trial)</option>
                <option value="Expired">⚠️ ट्रायल समाप्त ({totalExpired})</option>
                <option value="Suspended">निलंबित (Suspended)</option>
              </select>
              <select
                value={schoolDeliveryFilter}
                onChange={(e) => setSchoolDeliveryFilter(e.target.value as any)}
                className="px-2.5 py-1.5 border border-indigo-200 rounded-xl text-xs bg-indigo-50/50 text-indigo-900 cursor-pointer font-bold"
              >
                <option value="all">सभी मॉडल ({schools.length})</option>
                <option value="shared">☁️ शेयर्ड ({totalShared})</option>
                <option value="dedicated">⚡ डेडीकेटेड ({totalDedicated})</option>
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
                
                {/* Plan Selector with Trial Included */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-600">सदस्यता प्लान (Subscription Plan) *</label>
                  <select
                    value={addForm.planId}
                    onChange={(e) => {
                      const pId = e.target.value;
                      const isTrial = pId === 'trial';
                      setAddForm(Object.assign({}, addForm, {
                        planId: pId,
                        billingCycle: isTrial ? 'monthly' : 'annual',
                        trialEndsAt: isTrial ? (addForm.trialEndsAt || default7Days()) : addForm.trialEndsAt,
                      }));
                    }}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white font-medium"
                  >
                    <option value="trial">7-दिन फ्री ट्रायल (Trial - ☁️ शेयर्ड)</option>
                    {nonTrialPlans.map((p) => {
                      const isEnt = p.id === 'enterprise' || (p.featureFlags && p.featureFlags.dedicatedWorker);
                      return <option key={p.id} value={p.id}>{p.name} ({isEnt ? '⚡ डेडीकेटेड' : '☁️ शेयर्ड'})</option>;
                    })}
                  </select>
                </div>

                {/* Expiry Date input */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-600">
                    {addForm.planId === 'trial' ? 'ट्रायल समाप्ति तिथि (Trial Expiry Date) *' : 'प्लान समाप्ति तिथि (Expiry Date - Optional)'}
                  </label>
                  <input
                    type="date"
                    value={addForm.trialEndsAt || ''}
                    onChange={(e) => setAddForm(Object.assign({}, addForm, { trialEndsAt: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white font-medium"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-600">बिलिंग चक्र (Billing Cycle)</label>
                  <select value={addForm.billingCycle} onChange={(e) => setAddForm(Object.assign({}, addForm, { billingCycle: e.target.value }))} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white">
                    <option value="monthly">मासिक बिलिंग</option>
                    <option value="quarterly">त्रैमासिक बिलिंग</option>
                    <option value="annual">वार्षिक बिलिंग</option>
                  </select>
                </div>
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
                  <div key={s.id} className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-xl border border-amber-200 bg-amber-50/60">
                    <div className="space-y-1">
                      <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <School className="w-4 h-4 text-amber-600" />
                        <span>{s.schoolName}</span>
                        {s.preferredPlanId && s.preferredPlanId !== 'trial' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
                            इच्छित: {s.preferredPlanId}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500">
                        {s.contactEmail} • {s.contactPhone} {s.subdomain ? `• सबडोमेन: ${s.subdomain}` : ''}
                      </div>
                      {(!!s.estimatedStudents || !!s.estimatedStaff) && (
                        <div className="text-[11px] text-slate-600 font-medium">
                          👥 क्षमता: {s.estimatedStudents ? `${s.estimatedStudents} छात्र` : ''} {s.estimatedStaff ? `• ${s.estimatedStaff} स्टाफ` : ''}
                        </div>
                      )}
                      {s.customRequirements && (
                        <div className="mt-1.5 p-2 rounded-lg bg-amber-100/80 border border-amber-200 text-xs text-amber-950">
                          <strong>💡 विशेष आवश्यकताएं / फीचर्स:</strong> {s.customRequirements}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2 shrink-0">
                      <select
                        value={approvalPlans[s.id] || s.preferredPlanId || 'trial'}
                        onChange={(e) => setApprovalPlans(Object.assign({}, approvalPlans, { [s.id]: e.target.value }))}
                        className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-700 cursor-pointer shadow-2xs"
                      >
                        <option value="trial">7-दिन फ्री ट्रायल (Trial)</option>
                        {nonTrialPlans.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} {p.featureFlags && p.featureFlags.dedicatedWorker ? '⚡ (Dedicated)' : '☁️ (Shared)'}
                          </option>
                        ))}
                      </select>
                      <input
                        type="date"
                        value={approvalExpiryDates[s.id] || ((approvalPlans[s.id] || s.preferredPlanId || 'trial') === 'trial' ? default7Days() : '')}
                        onChange={(e) => setApprovalExpiryDates(Object.assign({}, approvalExpiryDates, { [s.id]: e.target.value }))}
                        title="ट्रायल / सदस्यता समाप्ति तिथि"
                        className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-700 shadow-2xs w-32"
                      />
                      <button onClick={() => approve(s.id, approvalPlans[s.id] || s.preferredPlanId || 'trial', approvalExpiryDates[s.id])} disabled={busyId === s.id} className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-xs transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>स्वीकृत करें</span>
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
                        <div className="space-y-1">
                          {/* Main domain display with clickable link */}
                          <div className="flex items-center gap-1">
                            {s.dedicatedDomain ? (
                              <a
                                href={`https://${s.dedicatedDomain}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-indigo-600 hover:text-indigo-800 font-semibold inline-flex items-center gap-1 hover:underline"
                                title="डेडीकेटेड वर्कर URL"
                              >
                                <span>{s.dedicatedDomain}</span>
                                <ExternalLink className="w-3 h-3 shrink-0 text-indigo-400" />
                              </a>
                            ) : (
                              <a
                                href={`https://${s.subdomain ? `${s.subdomain}.pragnya.nasven.com` : 'pragnya.nasven.com'}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-slate-700 hover:text-blue-600 font-medium inline-flex items-center gap-1 hover:underline"
                                title="शेयर्ड वर्कर URL"
                              >
                                <span>{s.subdomain ? `${s.subdomain}.pragnya.nasven.com` : 'pragnya.nasven.com'}</span>
                                <ExternalLink className="w-3 h-3 shrink-0 text-slate-400" />
                              </a>
                            )}
                          </div>

                          {s.customDomain && (
                            <a
                              href={`https://${s.customDomain}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[10px] text-blue-600 font-semibold inline-flex items-center gap-1 hover:underline"
                            >
                              <span>🌐 {s.customDomain}</span>
                              <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                            </a>
                          )}

                          {/* Delivery Mode & Provisioning Badge */}
                          <div>
                            {s.planId === 'enterprise' && s.provisioningStatus === 'live' ? (
                              <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                ⚡ डेडीकेटेड लाइव
                              </span>
                            ) : s.planId === 'enterprise' && (s.provisioningStatus === 'pending' || s.provisioningStatus === 'provisioning') ? (
                              <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                ⏳ डेडीकेटेड प्रोविजनिंग...
                              </span>
                            ) : s.planId === 'enterprise' && s.provisioningStatus === 'failed' ? (
                              <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                ⚠️ प्रोविजनिंग विफल
                              </span>
                            ) : (
                              <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                                ☁️ शेयर्ड वर्कर
                              </span>
                            )}
                          </div>

                          {s.provisioningError && s.provisioningStatus === 'failed' && (
                            <div className="text-[9px] text-rose-600 leading-tight">{s.provisioningError}</div>
                          )}

                          <div className="text-[9px] text-slate-500">
                            ईमेल: {s.emailQuotaUsed || 0}/{s.emailQuotaLimit === null || s.emailQuotaLimit === undefined ? '∞' : s.emailQuotaLimit}
                            {s.emailFromEmail && <span className="text-slate-400"> · {s.emailFromEmail}</span>}
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3">{statusBadge(s.status, s)}</td>
                    <td className="py-3 px-3">
                      {editId === s.id ? (
                        <select
                          value={editForm.planId}
                          onChange={(e) => setEditForm(Object.assign({}, editForm, { planId: e.target.value }))}
                          className="px-2 py-1 border border-slate-200 rounded-lg text-xs bg-white font-medium text-slate-800 w-full"
                        >
                          <option value="trial">7-दिन ट्रायल (☁️ शेयर्ड)</option>
                          {nonTrialPlans.map((p) => {
                            const isEnt = p.id === 'enterprise' || p.dedicatedWorker;
                            const label = `${p.name} (${isEnt ? '⚡ डेडीकेटेड' : '☁️ शेयर्ड'})`;
                            return <option key={p.id} value={p.id}>{label}</option>;
                          })}
                        </select>
                      ) : (
                        <select
                          value={s.planId}
                          onChange={(e) => setPlan(s.id, e.target.value)}
                          className="px-2.5 py-1 border border-slate-200 rounded-lg text-xs bg-white font-medium text-slate-800 max-w-48 cursor-pointer"
                        >
                          {s.planId && nonTrialPlans.findIndex((p) => p.id === s.planId) === -1 && s.planId !== 'trial' && (
                            <option value={s.planId}>{s.planName || s.planId}</option>
                          )}
                          <option value="trial">7-दिन ट्रायल (☁️ शेयर्ड)</option>
                          {nonTrialPlans.map((p) => {
                            const isEnt = p.id === 'enterprise' || p.dedicatedWorker;
                            const label = `${p.name} (${isEnt ? '⚡ डेडीकेटेड' : '☁️ शेयर्ड'})`;
                            return <option key={p.id} value={p.id}>{label}</option>;
                          })}
                        </select>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      {editId === s.id ? (
                        <input
                          type="date"
                          value={editForm.trialEndsAt || ''}
                          onChange={(e) => setEditForm(Object.assign({}, editForm, { trialEndsAt: e.target.value }))}
                          className="px-2 py-1 border border-slate-200 rounded-lg text-xs bg-white font-medium w-36"
                        />
                      ) : (
                        <div className="flex items-center gap-1.5 flex-nowrap">
                          <span className={s.trialEndsAt ? 'font-medium text-slate-700' : 'text-slate-400'}>
                            {s.trialEndsAt || '—'}
                          </span>
                          <button
                            onClick={() => {
                              setExpiryModalSchool(s);
                              setExpiryModalDate(s.trialEndsAt || default7Days());
                            }}
                            className="p-1 rounded-md hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition cursor-pointer"
                            title="समाप्ति तिथि (Expiry Date) बदलें"
                          >
                            <Calendar className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
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
                            {/* Provisioning controls - ONLY for Enterprise schools */}
                            {s.planId === 'enterprise' ? (
                              confirmProvisionId === s.id ? (
                                <>
                                  <button onClick={() => provisionDedicated(s.id)} disabled={busyId === 'provision-' + s.id} className="px-2.5 py-1 bg-indigo-600 text-white rounded-lg text-[11px] font-bold cursor-pointer disabled:opacity-50">
                                    पक्का प्रोविजन?
                                  </button>
                                  <button onClick={() => setConfirmProvisionId(null)} className="px-2 py-1 border border-slate-200 rounded-lg text-[11px] font-bold cursor-pointer">
                                    रद्द
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    onClick={() => startProvision(s)}
                                    disabled={busyId === 'provision-' + s.id || busyId === 'provision-check-' + s.id}
                                    className="px-2.5 py-1 border border-indigo-200 text-indigo-700 hover:bg-indigo-50 rounded-lg text-[11px] font-bold cursor-pointer disabled:opacity-50 flex items-center gap-1"
                                    title="Enterprise स्कूल के लिए Dedicated Cloudflare Worker तैनात करें"
                                  >
                                    <Globe className="w-3 h-3" />
                                    <span>{s.provisioningStatus && s.provisioningStatus !== 'none' ? 'री-डिप्लॉय' : 'प्रोविजन'}</span>
                                  </button>
                                  {s.provisioningStatus === 'live' && (
                                    <button
                                      onClick={() => deprovisionDedicated(s)}
                                      disabled={busyId === 'deprovision-' + s.id}
                                      className="px-2 py-1 border border-amber-200 text-amber-700 hover:bg-amber-50 rounded-lg text-[11px] font-semibold cursor-pointer disabled:opacity-50"
                                      title="डेडिकेटेड वर्कर हटाकर शेयर्ड मोड पर वापस लाएं"
                                    >
                                      शेयर्ड में बदलें
                                    </button>
                                  )}
                                </>
                              )
                            ) : null}

                            {(s.provisioningStatus === 'pending' || s.provisioningStatus === 'provisioning') && (
                              <button onClick={() => checkProvision(s.id)} disabled={busyId === 'provision-check-' + s.id} className="px-2 py-1 border border-amber-200 text-amber-700 hover:bg-amber-50 rounded-lg text-[11px] font-bold cursor-pointer disabled:opacity-50">
                                स्टेटस जाँचें
                              </button>
                            )}

                            {/* Extend trial button for trial or expired schools */}
                            {(s.planId === 'trial' || s.status === 'Trial' || s.registrationStatus === 'Trial_Expired') && (
                              <button
                                onClick={() => extendTrial(s.id, 7)}
                                disabled={busyId === 'extend-' + s.id}
                                className="px-2.5 py-1 border border-emerald-200 text-emerald-700 hover:bg-emerald-50 rounded-lg text-[11px] font-bold cursor-pointer disabled:opacity-50 flex items-center gap-1"
                                title="स्कूल का ट्रायल 7 दिन और आगे बढ़ाएं"
                              >
                                <Clock className="w-3 h-3" />
                                <span>+7 दिन ट्रायल</span>
                              </button>
                            )}

                            {/* Direct Set Expiry Date Button for Any School */}
                            <button
                              onClick={() => {
                                setExpiryModalSchool(s);
                                setExpiryModalDate(s.trialEndsAt || default7Days());
                              }}
                              className="px-2.5 py-1 border border-blue-200 text-blue-700 hover:bg-blue-50 rounded-lg text-[11px] font-bold cursor-pointer flex items-center gap-1"
                              title="समाप्ति तिथि (Expiry Date) बदलें / सेट करें"
                            >
                              <Calendar className="w-3 h-3" />
                              <span>एक्सपायरी</span>
                            </button>

                            <button onClick={() => startEmailConfig(s)} className="px-2.5 py-1 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-[11px] font-bold cursor-pointer flex items-center gap-1">
                              <Mail className="w-3 h-3" />
                              <span>ईमेल</span>
                            </button>
                            <button
                              onClick={() => { setPayLinkSchool(s); setPayLinkPlanId(s.preferredPlanId && s.preferredPlanId !== 'trial' ? s.preferredPlanId : 'starter'); setPayLinkCycle('annual'); }}
                              className="px-2.5 py-1 border border-emerald-200 text-emerald-700 hover:bg-emerald-50 rounded-lg text-[11px] font-bold cursor-pointer flex items-center gap-1"
                              title="स्कूल को Razorpay पेमेंट लिंक भेजें (ईमेल + FCM)"
                            >
                              <CreditCard className="w-3 h-3" />
                              <span>पेमेंट लिंक</span>
                            </button>
                            <button
                              onClick={() => { setNotifySchool(s); setNotifyForm({ title: '', body: '', targetRole: 'Director', priority: 'high' }); }}
                              className="px-2.5 py-1 border border-blue-200 text-blue-700 hover:bg-blue-50 rounded-lg text-[11px] font-bold cursor-pointer flex items-center gap-1"
                              title="स्कूल को FCM पुश नोटिफिकेशन भेजें"
                            >
                              <Bell className="w-3 h-3" />
                              <span>नोटिफिकेशन</span>
                            </button>
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
                          {emailQuotaId === s.id && (
                            <div className="mt-1.5 p-2 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[9px] font-bold text-slate-500 w-24 shrink-0">मासिक ईमेल सीमा</span>
                                <input value={emailQuotaForm.limit} onChange={(e) => setEmailQuotaForm(Object.assign({}, emailQuotaForm, { limit: e.target.value }))} placeholder="खाली = असीमित" className="w-32 px-2 py-0.5 border border-slate-200 rounded text-[10px] font-mono" />
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[9px] font-bold text-slate-500 w-24 shrink-0">भेजने वाला नाम</span>
                                <input value={emailQuotaForm.fromName} onChange={(e) => setEmailQuotaForm(Object.assign({}, emailQuotaForm, { fromName: e.target.value }))} placeholder="उदा. DPS भोपाल" className="flex-1 px-2 py-0.5 border border-slate-200 rounded text-[10px]" />
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[9px] font-bold text-slate-500 w-24 shrink-0">भेजने वाला ईमेल</span>
                                <input value={emailQuotaForm.fromEmail} onChange={(e) => setEmailQuotaForm(Object.assign({}, emailQuotaForm, { fromEmail: e.target.value }))} placeholder="no-reply@school.in" className="flex-1 px-2 py-0.5 border border-slate-200 rounded text-[10px] font-mono" />
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[9px] font-bold text-slate-500 w-24 shrink-0">Reply-to</span>
                                <input value={emailQuotaForm.replyTo} onChange={(e) => setEmailQuotaForm(Object.assign({}, emailQuotaForm, { replyTo: e.target.value }))} placeholder="वैकल्पिक" className="flex-1 px-2 py-0.5 border border-slate-200 rounded text-[10px] font-mono" />
                              </div>
                              <div className="flex items-center gap-1.5 pt-0.5">
                                <button onClick={() => saveEmailConfig(s.id)} disabled={busyId === 'email-' + s.id} className="px-2.5 py-1 bg-indigo-600 text-white rounded text-[10px] font-bold cursor-pointer disabled:opacity-50">सहेजें</button>
                                <button onClick={() => setEmailQuotaId(null)} className="px-2 py-1 border border-slate-200 rounded text-[10px] font-bold cursor-pointer">रद्द</button>
                              </div>
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
      {/* 1b. TRANSACTIONS (लेन-देन) TAB                                            */}
      {/* ========================================================================= */}
      {activeTab === 'transactions' && (
        <div className="space-y-5">
          {/* Summary Metrics */}
          {txnSummary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs">
                <div className="text-2xl font-black text-slate-900">{txnSummary.count || 0}</div>
                <div className="text-xs font-semibold text-slate-500">कुल चालान</div>
              </div>
              <div className="p-4 rounded-2xl bg-white border border-emerald-200 shadow-2xs bg-emerald-50/30">
                <div className="text-2xl font-black text-emerald-700">₹{(txnSummary.collected || 0).toLocaleString('en-IN')}</div>
                <div className="text-xs font-semibold text-emerald-800">वसूल ({txnSummary.paidCount || 0})</div>
              </div>
              <div className="p-4 rounded-2xl bg-white border border-amber-200 shadow-2xs bg-amber-50/20">
                <div className="text-2xl font-black text-amber-700">₹{(txnSummary.pending || 0).toLocaleString('en-IN')}</div>
                <div className="text-xs font-semibold text-amber-800">लंबित (Processing)</div>
              </div>
              <div className="p-4 rounded-2xl bg-white border border-rose-200 shadow-2xs bg-rose-50/30">
                <div className="text-2xl font-black text-rose-700">{txnSummary.failedCount || 0}</div>
                <div className="text-xs font-semibold text-rose-800">विफल भुगतान</div>
              </div>
            </div>
          )}

          {/* Filter Bar */}
          <div className="flex items-center gap-2 flex-wrap">
            {['All', 'Paid', 'Processing', 'Failed'].map((st) => (
              <button
                key={st}
                onClick={() => setTxnStatusFilter(st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  txnStatusFilter === st ? 'bg-emerald-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {st === 'All' ? 'सभी' : st === 'Paid' ? 'भुगतान हुए' : st === 'Processing' ? 'लंबित' : 'विफल'}
              </button>
            ))}
            <button
              onClick={() => loadTransactions(txnStatusFilter)}
              disabled={txnLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${txnLoading ? 'animate-spin text-emerald-600' : ''}`} />
              <span>रिफ्रेश</span>
            </button>
          </div>

          {/* Transactions Table */}
          {txnLoading ? (
            <div className="flex items-center justify-center py-12 text-slate-400 gap-2">
              <Loader2 className="w-5 h-5 animate-spin" /> लोड हो रहा है...
            </div>
          ) : transactions.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm bg-white rounded-2xl border border-slate-200">
              कोई लेन-देन रिकॉर्ड नहीं मिला।
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl bg-white border border-slate-200 shadow-2xs">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-500">
                    <th className="py-2.5 px-3">चालान #</th>
                    <th className="py-2.5 px-3">स्कूल</th>
                    <th className="py-2.5 px-3">प्लान</th>
                    <th className="py-2.5 px-3">राशि (₹)</th>
                    <th className="py-2.5 px-3">स्थिति</th>
                    <th className="py-2.5 px-3">पेमेंट आईडी</th>
                    <th className="py-2.5 px-3">तारीख</th>
                    <th className="py-2.5 px-3">लिंक</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {transactions.map((t) => (
                    <tr key={t.id} className="text-xs hover:bg-slate-50/50">
                      <td className="py-3 px-3 font-mono text-slate-600">{t.invoiceNumber || '—'}</td>
                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-900">{t.schoolName || '—'}</div>
                        {t.subdomain && <div className="text-[10px] text-slate-400">{t.subdomain}</div>}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-medium text-slate-700">{t.planName || '—'}</div>
                        <div className="text-[10px] text-slate-400">{t.billingCycle || ''}</div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-900">₹{(t.totalAmount || 0).toLocaleString('en-IN')}</div>
                        <div className="text-[10px] text-slate-400">+{t.gstPercent}% GST</div>
                      </td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          t.paymentStatus === 'Paid' ? 'bg-emerald-100 text-emerald-700'
                          : t.paymentStatus === 'Failed' ? 'bg-rose-100 text-rose-700'
                          : 'bg-amber-100 text-amber-700'
                        }`}>
                          {t.paymentStatus === 'Paid' ? '✅ भुगतान हुआ' : t.paymentStatus === 'Failed' ? '❌ विफल' : '⏳ ' + t.paymentStatus}
                        </span>
                        {t.webhookReceivedAt && <div className="text-[9px] text-emerald-600 mt-0.5">webhook ✓</div>}
                      </td>
                      <td className="py-3 px-3 font-mono text-[10px] text-slate-500">{t.razorpayPaymentId || t.transactionId || '—'}</td>
                      <td className="py-3 px-3 text-slate-600">{t.invoiceDate || '—'}</td>
                      <td className="py-3 px-3">
                        {t.razorpayPaymentLinkUrl ? (
                          <a href={t.razorpayPaymentLinkUrl} target="_blank" rel="noreferrer" className="text-emerald-600 hover:underline inline-flex items-center gap-0.5 font-semibold">
                            <span>लिंक</span><ExternalLink className="w-3 h-3" />
                          </a>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
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

          {/* Plugin Trials Section */}
          <div className="mt-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-600" />
                प्लगइन ट्रायल प्रबंधन
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={processPluginTrials}
                  disabled={busyId === 'process-plugin-trials'}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-2xs transition cursor-pointer disabled:opacity-50"
                >
                  {busyId === 'process-plugin-trials' ? 'प्रोसेसिंग...' : '🔄 ट्रायल प्रोसेस करें'}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto bg-white rounded-xl border border-slate-200 shadow-xs">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                    <th className="py-2.5 px-3 font-bold">स्कूल</th>
                    <th className="py-2.5 px-3 font-bold">प्लगइन</th>
                    <th className="py-2.5 px-3 font-bold">स्थिति</th>
                    <th className="py-2.5 px-3 font-bold">ट्रायल समाप्ति</th>
                    <th className="py-2.5 px-3 font-bold">भुगतान</th>
                    <th className="py-2.5 px-3 font-bold">कार्रवाई</th>
                  </tr>
                </thead>
                <tbody>
                  {pluginTrialsLoading && (
                    <tr><td colSpan={6} className="py-8 text-center text-slate-400">लोड हो रहा है...</td></tr>
                  )}
                  {!pluginTrialsLoading && pluginTrials.length === 0 && (
                    <tr><td colSpan={6} className="py-8 text-center text-slate-400">कोई प्लगइन ट्रायल नहीं मिला।</td></tr>
                  )}
                  {pluginTrials.map((t) => {
                    const isTrial = t.payment_status === 'trial';
                    const isExpired = t.payment_status === 'expired' || (t.trial_ends_at && t.trial_ends_at < todayStr);
                    const isPaid = t.payment_status === 'active';
                    return (
                      <tr key={t.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition">
                        <td className="py-3 pr-3 font-bold text-slate-900 text-xs">{t.school_name}</td>
                        <td className="py-3 px-3">
                          <span className="font-semibold text-indigo-900 text-xs">{t.plugin_name}</span>
                        </td>
                        <td className="py-3 px-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isPaid ? 'bg-emerald-100 text-emerald-800' :
                            isExpired ? 'bg-rose-100 text-rose-700' :
                            isTrial ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {isPaid ? 'भुगतान सक्रिय' : isExpired ? 'समाप्त' : isTrial ? 'ट्रायल' : t.payment_status}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-slate-600 text-[11px]">{t.trial_ends_at || '—'}</td>
                        <td className="py-3 px-3 text-slate-600 text-[11px]">
                          {t.price_per_cycle ? `₹${t.price_per_cycle}/${t.billing_cycle || 'mo'}` : '—'}
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex gap-1 flex-wrap">
                            {!isPaid && (
                              <button
                                onClick={() => setPluginPaymentModal({ schoolId: t.school_id, schoolName: t.school_name, pluginId: t.plugin_id, pluginName: t.plugin_name })}
                                className="px-2 py-1 rounded-lg text-[10px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition cursor-pointer"
                              >💳 लिंक</button>
                            )}
                            {isTrial && (
                              <button
                                onClick={() => revokePluginTrial(t.school_id, t.plugin_id)}
                                disabled={busyId === `revoke-trial-${t.school_id}-${t.plugin_id}`}
                                className="px-2 py-1 rounded-lg text-[10px] font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition cursor-pointer disabled:opacity-50"
                              >रद्द</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Grant Trial Quick Button - pick from schools list */}
            <div className="mt-3">
              <select
                onChange={(e) => {
                  const school = schools.find((s) => s.id === e.target.value);
                  if (school) { setTrialModal({ schoolId: school.id, schoolName: school.schoolName }); setTrialForm({ pluginId: '', trialDays: '7' }); }
                  e.target.value = '';
                }}
                value=""
                className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 bg-white cursor-pointer hover:bg-slate-50"
              >
                <option value="">➕ स्कूल को ट्रायल दें...</option>
                {schools.map((s) => <option key={s.id} value={s.id}>{s.schoolName}</option>)}
              </select>
            </div>
          </div>

          {/* Trial Grant Modal */}
          {trialModal && (
            <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                  <h3 className="text-base font-black text-slate-900">प्लगइन ट्रायल दें — {trialModal.schoolName}</h3>
                  <button onClick={() => setTrialModal(null)} className="text-slate-400 hover:text-slate-600 font-bold p-1">✕</button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1 text-sm">प्लगइन चुनें *</label>
                    <select
                      value={trialForm.pluginId}
                      onChange={(e) => setTrialForm(Object.assign({}, trialForm, { pluginId: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                    >
                      <option value="">प्लगइन चुनें...</option>
                      {plugins.filter((p) => p.price > 0).map((p) => <option key={p.id} value={p.id}>{p.name} (₹{p.price}/वर्ष)</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1 text-sm">ट्रायल अवधि (दिन)</label>
                    <input type="number" min={1} max={365} value={trialForm.trialDays}
                      onChange={(e) => setTrialForm(Object.assign({}, trialForm, { trialDays: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
                  </div>
                  <button onClick={grantPluginTrial} disabled={busyId === 'grant-trial' || !trialForm.pluginId}
                    className="w-full px-4 py-2.5 rounded-xl font-bold text-sm bg-indigo-600 hover:bg-indigo-700 text-white transition cursor-pointer disabled:opacity-50">
                    {busyId === 'grant-trial' ? 'दे रहा है...' : '✅ ट्रायल दें'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Plugin Payment Link Modal */}
          {pluginPaymentModal && (
            <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                  <h3 className="text-base font-black text-slate-900">प्लगइन पेमेंट लिंक — {pluginPaymentModal.schoolName}</h3>
                  <button onClick={() => setPluginPaymentModal(null)} className="text-slate-400 hover:text-slate-600 font-bold p-1">✕</button>
                </div>
                <div className="space-y-4">
                  <p className="text-sm text-slate-600">प्लगइन: <b>{pluginPaymentModal.pluginName}</b></p>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1 text-sm">बिलिंग चक्र</label>
                    <select value={pluginPaymentForm.billingCycle}
                      onChange={(e) => setPluginPaymentForm({ billingCycle: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm">
                      <option value="monthly">मासिक (Monthly)</option>
                      <option value="annual">वार्षिक (Annual — 20% छूट)</option>
                    </select>
                  </div>
                  <button onClick={sendPluginPaymentLink} disabled={busyId === 'send-plugin-link'}
                    className="w-full px-4 py-2.5 rounded-xl font-bold text-sm bg-emerald-600 hover:bg-emerald-700 text-white transition cursor-pointer disabled:opacity-50">
                    {busyId === 'send-plugin-link' ? 'भेज रहा है...' : '💳 पेमेंट लिंक भेजें'}
                  </button>
                </div>
              </div>
            </div>
          )}

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

      {/* ========================================================================= */}
      {/* 4. FEATURE & SPECIAL REQUIREMENTS TAB                                     */}
      {/* ========================================================================= */}
      {activeTab === 'requests' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <MessageSquarePlus className="w-4 h-4 text-amber-600" />
                <span>विशेष आवश्यकताएं एवं कस्टम फीचर अनुरोध ({featureRequests.length})</span>
              </h3>
              <p className="text-xs text-slate-500">स्कूलों और निदेशकों द्वारा साइन अप या पोर्टल से सबमिट की गई कस्टम आवश्यकताएं</p>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-slate-400 border-b border-slate-100">
                  <th className="py-2.5 pr-3 font-bold">विद्यालय</th>
                  <th className="py-2.5 px-3 font-bold">अनुरोध शीर्षक व विवरण</th>
                  <th className="py-2.5 px-3 font-bold">श्रेणी</th>
                  <th className="py-2.5 px-3 font-bold">स्थिति</th>
                  <th className="py-2.5 px-3 font-bold">दिनांक</th>
                  <th className="py-2.5 px-3 font-bold">कार्रवाई / स्थिति बदलें</th>
                </tr>
              </thead>
              <tbody>
                {featureRequests.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      अभी तक कोई विशेष आवश्यकता या कस्टम फीचर अनुरोध प्राप्त नहीं हुआ है।
                    </td>
                  </tr>
                )}
                {featureRequests.map((r) => {
                  const statusColors: Record<string, string> = {
                    Pending: 'bg-amber-100 text-amber-800 border-amber-200',
                    In_Review: 'bg-blue-100 text-blue-800 border-blue-200',
                    Approved: 'bg-indigo-100 text-indigo-800 border-indigo-200',
                    Delivered: 'bg-emerald-100 text-emerald-800 border-emerald-200',
                    Rejected: 'bg-rose-100 text-rose-800 border-rose-200',
                  };
                  return (
                    <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition">
                      <td className="py-3 pr-3 align-top">
                        <div className="font-bold text-slate-900">{r.school_name || r.school_id}</div>
                        <div className="text-[10px] text-slate-500">{r.contact_email} • {r.contact_phone}</div>
                        {r.subdomain && <div className="text-[9px] text-indigo-600 font-mono">{r.subdomain}</div>}
                      </td>
                      <td className="py-3 px-3 align-top max-w-xs">
                        <div className="font-bold text-slate-900">{r.title}</div>
                        <div className="text-[11px] text-slate-600 mt-1 whitespace-pre-wrap leading-relaxed">{r.description}</div>
                        {r.admin_notes && (
                          <div className="mt-2 p-1.5 rounded bg-slate-100 text-[10px] text-slate-700">
                            <strong>एडमिन नोट:</strong> {r.admin_notes}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 align-top">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                          {r.category}
                        </span>
                      </td>
                      <td className="py-3 px-3 align-top">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusColors[r.status] || 'bg-slate-100 text-slate-700'}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 align-top text-slate-500 text-[10px] whitespace-nowrap">
                        {r.created_at ? r.created_at.split('T')[0] : '—'}
                      </td>
                      <td className="py-3 px-3 align-top">
                        <div className="flex flex-col gap-1.5 min-w-[140px]">
                          <select
                            defaultValue={r.status}
                            onChange={(e) => updateFeatureRequestStatus(r.id, e.target.value, r.admin_notes || '')}
                            disabled={busyId === 'freq-' + r.id}
                            className="px-2 py-1 border border-slate-200 rounded-lg text-xs bg-white cursor-pointer shadow-2xs"
                          >
                            <option value="Pending">लंबित (Pending)</option>
                            <option value="In_Review">समीक्षाधीन (In Review)</option>
                            <option value="Approved">स्वीकृत (Approved)</option>
                            <option value="Delivered">लागू किया गया (Delivered)</option>
                            <option value="Rejected">अस्वीकृत (Rejected)</option>
                          </select>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'subscriptions' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-violet-600" />
              <span>Recurring सदस्यता (Auto-Debit) — {recurringSubs.length}</span>
            </h3>
            <button onClick={loadRecurringSubs} disabled={recurringSubsLoading}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-200 transition cursor-pointer disabled:opacity-50">
              {recurringSubsLoading ? 'लोड...' : '🔄 ताज़ा करें'}
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-violet-50 border border-violet-100">
              <div className="text-xs font-bold text-violet-700">कुल सदस्यता</div>
              <div className="text-xl font-black text-violet-900">{recurringSubs.length}</div>
            </div>
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100">
              <div className="text-xs font-bold text-emerald-700">सक्रिय (Active)</div>
              <div className="text-xl font-black text-emerald-900">{recurringSubs.filter((s) => s.status === 'Active').length}</div>
            </div>
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-100">
              <div className="text-xs font-bold text-rose-700">Past_Due / Canceled</div>
              <div className="text-xl font-black text-rose-900">{recurringSubs.filter((s) => s.status === 'Past_Due' || s.status === 'Canceled').length}</div>
            </div>
          </div>

          <div className="overflow-x-auto bg-white rounded-xl border border-slate-200 shadow-xs">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="py-2.5 px-3 font-bold">स्कूल</th>
                  <th className="py-2.5 px-3 font-bold">प्लान</th>
                  <th className="py-2.5 px-3 font-bold">स्थिति</th>
                  <th className="py-2.5 px-3 font-bold">मैंडेट</th>
                  <th className="py-2.5 px-3 font-bold">चक्र</th>
                  <th className="py-2.5 px-3 font-bold">अगली बिलिंग</th>
                  <th className="py-2.5 px-3 font-bold">कार्रवाई</th>
                </tr>
              </thead>
              <tbody>
                {recurringSubsLoading && (
                  <tr><td colSpan={7} className="py-8 text-center text-slate-400">लोड हो रहा है...</td></tr>
                )}
                {!recurringSubsLoading && recurringSubs.length === 0 && (
                  <tr><td colSpan={7} className="py-8 text-center text-slate-400">कोई recurring सदस्यता नहीं है।</td></tr>
                )}
                {recurringSubs.map((s) => {
                  const isActive = s.status === 'Active';
                  const isPaused = !!s.paused_at;
                  const isCanceled = s.status === 'Canceled';
                  return (
                    <tr key={s.school_id} className="border-b border-slate-50 hover:bg-slate-50/50 transition">
                      <td className="py-3 pr-3 font-bold text-slate-900 text-xs">{s.school_name}</td>
                      <td className="py-3 px-3 text-xs">
                        <div className="font-semibold text-slate-800">{s.plan_name}</div>
                        <div className="text-[10px] text-slate-400">{s.billing_cycle}</div>
                      </td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          isActive ? 'bg-emerald-100 text-emerald-800' :
                          isCanceled ? 'bg-slate-100 text-slate-500' :
                          'bg-rose-100 text-rose-700'
                        }`}>{s.status}</span>
                      </td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          s.mandate_status === 'active' ? 'bg-emerald-100 text-emerald-800' :
                          s.mandate_status === 'pending' ? 'bg-amber-100 text-amber-700' :
                          'bg-slate-100 text-slate-500'
                        }`}>{s.mandate_status || 'none'}</span>
                      </td>
                      <td className="py-3 px-3 text-xs text-slate-600">
                        {s.remaining_cycles ?? '—'} / {s.total_cycles ?? '—'}
                      </td>
                      <td className="py-3 px-3 text-xs text-slate-500">{s.next_billing_date || '—'}</td>
                      <td className="py-3 px-3">
                        <div className="flex gap-1">
                          {!isCanceled && (
                            <>
                              {isActive && !isPaused && (
                                <button onClick={() => adminPauseSub(s.school_id)} disabled={busyId === `pause-sub-${s.school_id}`}
                                  className="px-2 py-1 rounded-lg text-[10px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 transition cursor-pointer disabled:opacity-50">
                                  रोक
                                </button>
                              )}
                              {isPaused && (
                                <button onClick={() => adminResumeSub(s.school_id)} disabled={busyId === `resume-sub-${s.school_id}`}
                                  className="px-2 py-1 rounded-lg text-[10px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition cursor-pointer disabled:opacity-50">
                                  फिर शुरू
                                </button>
                              )}
                              <button onClick={() => adminCancelSub(s.school_id, true)} disabled={busyId === `cancel-sub-${s.school_id}`}
                                className="px-2 py-1 rounded-lg text-[10px] font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition cursor-pointer disabled:opacity-50">
                                रद्द
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Quick Expiry Date Modal for Any School */}
      {expiryModalSchool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">समाप्ति तिथि (Expiry Date) निर्धारित करें</h3>
                  <p className="text-[11px] text-slate-500 font-medium">{expiryModalSchool.schoolName}</p>
                </div>
              </div>
              <button
                onClick={() => setExpiryModalSchool(null)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg cursor-pointer"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-500 font-medium">वर्तमान प्लान:</span>
                <span className="font-bold text-slate-800">{expiryModalSchool.planName || expiryModalSchool.planId}</span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  नई समाप्ति तिथि (New Expiry Date)
                </label>
                <input
                  type="date"
                  value={expiryModalDate}
                  onChange={(e) => setExpiryModalDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-white font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              {/* Quick presets */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">त्वरित विकल्प (Quick Presets):</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { label: '+7 दिन', days: 7 },
                    { label: '+14 दिन', days: 14 },
                    { label: '+1 महीना', days: 30 },
                    { label: '+3 महीने', days: 90 },
                  ].map((preset) => (
                    <button
                      key={preset.days}
                      type="button"
                      onClick={() => {
                        const d = new Date(Date.now() + preset.days * 86400000).toISOString().split('T')[0];
                        setExpiryModalDate(d);
                      }}
                      className="px-2 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-bold text-slate-700 transition cursor-pointer"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="text-[11px] text-slate-500 bg-blue-50/60 p-2.5 rounded-xl border border-blue-100">
                💡 <strong>ध्यान दें:</strong> भविष्य की तारीख सेट करने पर यदि स्कूल का ट्रायल समाप्त था तो वह पुनः सक्रिय हो जाएगा और स्मरण ईमेल टाइमस्टैम्प रीसेट हो जाएंगे।
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setExpiryModalSchool(null)}
                className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                रद्द
              </button>
              <button
                type="button"
                onClick={() => saveExpiryDate(expiryModalSchool.id, expiryModalDate)}
                disabled={expiryModalBusy || !expiryModalDate}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {expiryModalBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>{expiryModalBusy ? 'सहेजा जा रहा है...' : 'तिथि सहेजें'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Link Modal */}
      {payLinkSchool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-emerald-600" />
                <span>पेमेंट लिंक भेजें</span>
              </h3>
              <button onClick={() => setPayLinkSchool(null)} className="text-slate-400 hover:text-slate-600 font-bold">×</button>
            </div>
            <div className="text-xs text-slate-600">
              स्कूल: <span className="font-bold">{payLinkSchool.schoolName}</span>
              {payLinkSchool.contactEmail && <div className="text-[10px] text-slate-400">{payLinkSchool.contactEmail}</div>}
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">प्लान</label>
                <select
                  value={payLinkPlanId}
                  onChange={(e) => setPayLinkPlanId(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium bg-white"
                >
                  {nonTrialPlans.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} — ₹{p.annualPrice || p.monthlyPrice || 0}/वर्ष</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">बिलिंग चक्र</label>
                <select
                  value={payLinkCycle}
                  onChange={(e) => setPayLinkCycle(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium bg-white"
                >
                  <option value="monthly">मासिक (Monthly)</option>
                  <option value="quarterly">त्रैमासिक (Quarterly)</option>
                  <option value="annual">वार्षिक (Annual)</option>
                </select>
              </div>
              <div className="text-[10px] text-slate-400 bg-slate-50 p-2 rounded-lg">
                ईमेल + FCM पुश नोटिफिकेशन स्कूल को भेजा जाएगा। भुगतान होते ही प्लान स्वचालित सक्रिय (webhook द्वारा)।
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button onClick={() => setPayLinkSchool(null)} className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer">रद्द</button>
              <button
                onClick={sendPaymentLink}
                disabled={payLinkBusy}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {payLinkBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                <span>{payLinkBusy ? 'भेजा जा रहा है...' : 'लिंक भेजें'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notify (FCM) Modal */}
      {notifySchool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Bell className="w-4 h-4 text-blue-600" />
                <span>FCM नोटिफिकेशन भेजें</span>
              </h3>
              <button onClick={() => setNotifySchool(null)} className="text-slate-400 hover:text-slate-600 font-bold">×</button>
            </div>
            <div className="text-xs text-slate-600">
              स्कूल: <span className="font-bold">{notifySchool.schoolName}</span>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">शीर्षक (Title)</label>
                <input
                  value={notifyForm.title}
                  onChange={(e) => setNotifyForm(Object.assign({}, notifyForm, { title: e.target.value }))}
                  placeholder="उदा. 🔔 महत्वपूर्ण सूचना"
                  className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">संदेश (Body)</label>
                <textarea
                  value={notifyForm.body}
                  onChange={(e) => setNotifyForm(Object.assign({}, notifyForm, { body: e.target.value }))}
                  placeholder="नोटिफिकेशन का विवरण..."
                  rows={3}
                  className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-xs resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase">श्रोता</label>
                  <select
                    value={notifyForm.targetRole}
                    onChange={(e) => setNotifyForm(Object.assign({}, notifyForm, { targetRole: e.target.value }))}
                    className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium bg-white"
                  >
                    <option value="Director">निदेशक (Director)</option>
                    <option value="Principal">प्रधानाचार्य (Principal)</option>
                    <option value="Staff">स्टाफ</option>
                    <option value="All">सभी</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase">प्राथमिकता</label>
                  <select
                    value={notifyForm.priority}
                    onChange={(e) => setNotifyForm(Object.assign({}, notifyForm, { priority: e.target.value }))}
                    className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium bg-white"
                  >
                    <option value="high">उच्च (High)</option>
                    <option value="normal">सामान्य (Normal)</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button onClick={() => setNotifySchool(null)} className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer">रद्द</button>
              <button
                onClick={sendNotify}
                disabled={notifyBusy || !notifyForm.title || !notifyForm.body}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {notifyBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                <span>{notifyBusy ? 'भेजा जा रहा है...' : 'नोटिफिकेशन भेजें'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

