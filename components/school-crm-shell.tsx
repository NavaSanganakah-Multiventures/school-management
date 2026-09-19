'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  LayoutDashboard,
  Users,
  CalendarCheck,
  IndianRupee,
  FileSpreadsheet,
  Bell,
  Settings,
  Menu,
  X,
  School,
  GraduationCap,
  UserCheck,
  CheckCircle2,
  LogOut,
  CreditCard,
  ShieldCheck,
  AlertTriangle,
  Building2,
  History,
  Store,
  Sparkles,
  Lock,
} from 'lucide-react';

import { DashboardScreen } from './screens/dashboard-screen';
import { StudentsScreen } from './screens/students-screen';
import { AttendanceScreen } from './screens/attendance-screen';
import { FeesScreen } from './screens/fees-screen';
import { ExamsScreen } from './screens/exams-screen';
import { NoticesScreen } from './screens/notices-screen';
import { PrincipalManagementScreen } from './screens/principal-management-screen';
import { StaffScreen } from './screens/staff-screen';
import { SchoolSettingsScreen } from './screens/school-settings-screen';
import { BillingPlansScreen } from './screens/billing-plans-screen';
import { LoginScreen } from './screens/login-screen';
import { RegisterScreen } from './screens/register-screen';
import { ResetPasswordScreen } from './screens/reset-password-screen';
import { AdminConsoleScreen } from './screens/admin-console-screen';
import { ClassesScreen } from './screens/classes-screen';
import { ActivityLogsScreen } from './screens/activity-logs-screen';
import { PluginMarketplaceScreen } from './screens/plugin-marketplace-screen';

import { PLUGINS_REGISTRY } from '../plugins';

import { AddScholarModal } from './modals/add-scholar-modal';
import { FcmBroadcastModal } from './modals/fcm-broadcast-modal';
import { RequestFeatureModal } from './modals/request-feature-modal';
import { UpgradeGateScreen } from './ui/upgrade-gate-modal';
import { registerFcmWebToken, onForegroundFcmMessage, getWebPushDiagnostic } from '../lib/firebase-web-push';


type UserRole = 'Director' | 'Principal' | 'Staff' | 'SuperAdmin';

interface CurrentUser {
  id: string;
  fullName: string;
  role: UserRole;
  designation: string;
  department?: string;
  email: string;
  phone?: string;
  schoolId?: string;
}

function roleEmoji(role: UserRole) {
  if (role === 'Director') return '👑 निदेशक';
  if (role === 'Principal') return '🏛️ प्रधानाचार्य';
  if (role === 'SuperAdmin') return '🛡️ सुपर एडमिन';
  return '👨‍🏫 शिक्षक/स्टाफ';
}
function roleShort(role: UserRole) {
  if (role === 'Director') return 'नि';
  if (role === 'Principal') return 'प्र';
  if (role === 'SuperAdmin') return 'SA';
  return 'शि';
}
function roleColor(role: UserRole) {
  if (role === 'Director') return 'bg-amber-600';
  if (role === 'Principal') return 'bg-indigo-600';
  if (role === 'SuperAdmin') return 'bg-rose-600';
  return 'bg-emerald-600';
}

function readStoredUser(): CurrentUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const saved = localStorage.getItem('vidyasetu_user');
    const token = localStorage.getItem('vidyasetu_token');
    if (!token) return null;

    // Validate JWT expiration timestamp on load
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(
          atob(base64)
            .split('')
            .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
            .join('')
        );
        const payload = JSON.parse(jsonPayload);
        if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
          localStorage.removeItem('vidyasetu_user');
          localStorage.removeItem('vidyasetu_token');
          return null;
        }
      }
    } catch (_) {}

    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && parsed.email && parsed.role) return parsed as CurrentUser;
    }
  } catch (e) {}
  return null;
}

function readResetToken(): string {
  if (typeof window === 'undefined') return '';
  try {
    return new URLSearchParams(window.location.search).get('reset') || '';
  } catch (e) { return ''; }
}

interface NavItem {
  id: string;
  label: string;
  icon: any;
  superAdminOnly?: boolean;
  allowedRoles?: UserRole[];
  requiredModule?: string;
  badge?: string;
}

export function SchoolCrmShell() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [authScreen, setAuthScreen] = useState<'login' | 'register'>('login');
  const [resetToken, setResetToken] = useState<string>('');
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [planId, setPlanId] = useState('trial');
  const [planModules, setPlanModules] = useState<string[]>(['dashboard', 'students', 'attendance', 'staff', 'notices', 'fees', 'settings', 'billing']);
  const [trialInfo, setTrialInfo] = useState<{ trialEndsAt: string; status: string } | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAddScholarOpen, setIsAddScholarOpen] = useState(false);
  const [isBroadcastOpen, setIsBroadcastOpen] = useState(false);
  const [isRequestFeatureOpen, setIsRequestFeatureOpen] = useState(false);
  const [pushToast, setPushToast] = useState<{ title: string; body: string } | null>(null);
  const [webPushStatus, setWebPushStatus] = useState<string | null>(null);
  const [assignedClasses, setAssignedClasses] = useState<string[]>([]);
  const [isClassTeacher, setIsClassTeacher] = useState(false);
  const [activePlugins, setActivePlugins] = useState<string[]>([]);
  const lastRegisteredUserIdRef = useRef<string | null>(null);

  // Sync client-side authentication and URL params after initial mount (avoids React hydration mismatch #418)
  useEffect(() => {
    setIsMounted(true);
    const user = readStoredUser();
    if (user) setCurrentUser(user);
    const token = readResetToken();
    if (token) setResetToken(token);
  }, []);

  // Fetch teacher's assigned classes
  useEffect(() => {
    if (!currentUser) return;
    fetch('/api/classes/my-classes')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.assignedClasses)) {
          setAssignedClasses(data.assignedClasses);
          setIsClassTeacher(data.assignedClasses.length > 0);
        }
      })
      .catch(() => {});

    // Fetch active plugins (only for school roles, SuperAdmin manages catalog directly)
    if (currentUser.role !== 'SuperAdmin') {
      fetch('/api/plugins/active')
        .then((res) => res.json())
        .then((data) => {
          if (data.success && Array.isArray(data.activePlugins)) {
            setActivePlugins(data.activePlugins);
          }
        })
        .catch(() => {});
    } else {
      setActivePlugins([]);
    }
  }, [currentUser]);

  const [schoolProfile, setSchoolProfile] = useState<any>({
    schoolName: 'विद्या सेतु स्कूल प्रबंधन',
    affiliationNumber: '',
    boardName: '',
    academicSession: '2026-2027',
    principalName: '',
    directorName: '',
  });

  // Attach auth token + school id to every outgoing request & intercept 401s for automatic session expiry
  useEffect(() => {
    const originalFetch = (window as any).fetch;
    (window as any).fetch = function (input: any, init: any) {
      const headers = new Headers(init && init.headers ? init.headers : {});
      const token = localStorage.getItem('vidyasetu_token');
      if (token) headers.set('Authorization', 'Bearer ' + token);
      try {
        const user = JSON.parse(localStorage.getItem('vidyasetu_user') || 'null');
        if (user && user.schoolId) headers.set('X-School-Id', user.schoolId);
      } catch (e) {}
      const newInit = Object.assign({}, init, { headers });
      return originalFetch(input, newInit).then((res: Response) => {
        if (res.status === 401) {
          const url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
          if (!url.includes('/api/auth/login') && !url.includes('/api/auth/register') && !url.includes('/api/auth/reset')) {
            window.dispatchEvent(new CustomEvent('vidyasetu-auth-expired', {
              detail: { message: 'आपका लॉगिन सत्र समाप्त हो गया है। कृपया पुनः लॉगिन करें।' }
            }));
          }
        }
        return res;
      });
    };

    const handleSessionExpired = (e: any) => {
      const msg = (e && e.detail && e.detail.message) || 'आपका लॉगिन सत्र समाप्त हो गया है। कृपया पुनः लॉगिन करें।';
      handleLogout(msg);
    };

    window.addEventListener('vidyasetu-auth-expired', handleSessionExpired);

    return () => {
      (window as any).fetch = originalFetch;
      window.removeEventListener('vidyasetu-auth-expired', handleSessionExpired);
    };
  }, []);

  // Load school profile
  useEffect(() => {
    let active = true;
    fetch('/api/school-profile')
      .then((res) => res.json())
      .then((data) => {
        if (active && data.success && data.profile) setSchoolProfile(data.profile);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [currentUser]);

  // Load subscription / plan gating info
  useEffect(() => {
    let active = true;
    fetch('/api/billing/subscription')
      .then((res) => res.json())
      .then((data) => {
        if (!active || !data || !data.success) return;
        setPlanId(data.planId || 'trial');
        setPlanModules((data.planDetails && Array.isArray(data.planDetails.modules) && data.planDetails.modules.length) ? data.planDetails.modules : ['dashboard', 'students', 'attendance', 'staff', 'notices', 'fees', 'settings', 'billing']);
        setTrialInfo(data.subscription ? { trialEndsAt: data.trialEndsAt || '', status: data.subscription.status } : null);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [currentUser]);

  
  // Website (web push) registration for the logged-in staff user.
  useEffect(() => {
    if (!currentUser || !currentUser.id) return;
    if (typeof window === 'undefined') return;

    const currentUserId = String(currentUser.id || currentUser.email || '');
    if (lastRegisteredUserIdRef.current === currentUserId) return;
    lastRegisteredUserIdRef.current = currentUserId;

    let disposeForeground: (() => void) | null = null;

    const schoolId = currentUser.schoolId || 'school-01';
    const role: string = currentUser.role || 'Staff';
    const roleTopic = role === 'Students'
      ? 'school_' + schoolId + '_students'
      : (role === 'Parents' ? 'school_' + schoolId + '_parents' : 'school_' + schoolId + '_teachers');
    const webTopics = ['school_' + schoolId + '_all', roleTopic];

    registerFcmWebToken(currentUser.id, {
      schoolId: currentUser.schoolId || 'school-01',
      role: currentUser.role || 'Staff',
      topics: webTopics,
    }).then((token) => {
      if (token) {
        setWebPushStatus('granted');
      } else {
        const d = getWebPushDiagnostic();
        if (d && (d.permission === 'denied' || (d.error && d.error.includes('denied')))) {
          setWebPushStatus('ब्राउज़र में नोटिफिकेशन की अनुमति ब्लॉक है। अलर्ट पाने के लिए ब्राउज़र सेटिंग्स में नोटिफिकेशन चालू करें।');
        } else if (d && !d.supported) {
          setWebPushStatus('इस वेब ब्राउज़र में पुश नोटिफिकेशन समर्थित नहीं है।');
        } else if (d && d.error && !d.error.includes('default')) {
          setWebPushStatus('पुश नोटिफिकेशन सेवा कनेक्ट हो रही है...');
        }
      }
    }).catch((err) => {
      console.warn('[FCM] registerFcmWebToken catch:', err);
    });

    const triggerIncomingToast = (title: string, body: string) => {
      setPushToast({ title, body });
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(587.33, ctx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
          gain.gain.setValueAtTime(0.25, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.45);
        }
      } catch (_) {}

      try {
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(title, {
            body: body,
            icon: '/icon.svg',
            badge: '/icon.svg',
            tag: 'vidyasetu-' + Date.now(),
          });
        }
      } catch (_) {}

      setTimeout(() => setPushToast(null), 8000);
    };

    onForegroundFcmMessage((payload) => {
      const n = payload && (payload.notification || payload);
      if (n && n.title) {
        triggerIncomingToast(n.title, n.body || '');
      }
    }).then((dispose) => { disposeForeground = dispose; }).catch(() => {});

    // Periodic poll for alerts sent by other administrators
    let lastKnownNotifId = '';
    const pollTimer = setInterval(async () => {
      try {
        const res = await fetch('/api/notifications/history?schoolId=' + schoolId);
        const data = await res.json().catch(() => ({}));
        if (data && data.success && Array.isArray(data.history) && data.history.length > 0) {
          const latest = data.history[0];
          if (!lastKnownNotifId) {
            lastKnownNotifId = latest.id;
          } else if (latest.id !== lastKnownNotifId) {
            lastKnownNotifId = latest.id;
            triggerIncomingToast(latest.title, latest.body || '');
          }
        }
      } catch (_) {}
    }, 8000);

    return () => {
      clearInterval(pollTimer);
      if (disposeForeground) disposeForeground();
    };
  }, [currentUser]);

  const handleLogout = async (reason?: string | React.MouseEvent) => {
    lastRegisteredUserIdRef.current = null;
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch (e) {}
    localStorage.removeItem('vidyasetu_user');
    localStorage.removeItem('vidyasetu_token');
    setCurrentUser(null);
    setActivePlugins([]);
    setAuthScreen('login');
    setActiveTab('dashboard');
    if (typeof reason === 'string' && reason) {
      setPushToast({ title: 'सत्र समाप्त (Session Expired)', body: reason });
    }
  };

  const handleLoginSuccess = (user: any, token: string) => {
    const normalized: CurrentUser = {
      id: user.id,
      fullName: user.fullName,
      role: user.role,
      designation: user.designation || roleEmoji(user.role),
      department: user.department,
      email: user.email,
      phone: user.phone,
      schoolId: user.schoolId,
    };
    localStorage.setItem('vidyasetu_user', JSON.stringify(normalized));
    localStorage.setItem('vidyasetu_token', token);
    setCurrentUser(normalized);
    setActiveTab(normalized.role === 'SuperAdmin' ? 'admin' : 'dashboard');
  };

  // Prevent hydration mismatch between SSR/static build HTML and client DOM
  if (!isMounted) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
        <div className="flex items-center gap-3 text-white">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg">
            <School className="h-5 w-5 text-white animate-pulse" />
          </div>
          <span className="text-lg font-bold tracking-tight">विद्या सेतु स्कूल प्रबंधन</span>
        </div>
        <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
          <span className="h-2 w-2 rounded-full bg-blue-500 animate-ping" />
          <span>सत्र लोड हो रहा है...</span>
        </div>
      </div>
    );
  }

  // Password reset (magic link) screen — shows before auth gate.
  if (resetToken) {
    const clearReset = () => {
      if (typeof window !== 'undefined') window.history.replaceState({}, '', window.location.pathname);
      setResetToken('');
      setAuthScreen('login');
    };
    return <ResetPasswordScreen token={resetToken} onDone={clearReset} onBackToLogin={clearReset} />;
  }

  // Auth gate
  if (!currentUser) {
    if (authScreen === 'register') {
      return <RegisterScreen onBackToLogin={() => setAuthScreen('login')} onRegistered={() => setAuthScreen('login')} />;
    }
    return <LoginScreen onLoginSuccess={handleLoginSuccess} onRegister={() => setAuthScreen('register')} />;
  }

  const userRole: UserRole = currentUser.role || 'Staff';
  const screenRole: 'Director' | 'Principal' | 'Staff' = userRole === 'SuperAdmin' ? 'Director' : userRole;

  const navItems: NavItem[] = [
    { id: 'admin', label: 'सुपर एडमिन कंसोल', icon: ShieldCheck, superAdminOnly: true },
    { id: 'dashboard', label: 'डैशबोर्ड', icon: LayoutDashboard, allowedRoles: ['Director', 'Principal', 'Staff'] },
    { id: 'students', label: 'स्कॉलर रजिस्टर', icon: Users, allowedRoles: ['Director', 'Principal', 'Staff'] },
    { id: 'staff', label: 'स्टाफ एवं शिक्षक निर्देशिका', icon: GraduationCap, allowedRoles: ['Director', 'Principal', 'Staff'] },
    { id: 'attendance', label: 'दैनिक छात्र उपस्थिति', icon: CalendarCheck, allowedRoles: ['Director', 'Principal', 'Staff'] },
    {
      id: 'activity-logs',
      label: userRole === 'Staff' ? 'मेरी कार्यकलाप हिस्ट्री' : userRole === 'Principal' ? 'स्टाफ कार्यकलाप व ऑडिट' : 'स्कूल कार्यकलाप ऑडिट',
      icon: History,
      allowedRoles: ['Director', 'Principal', 'Staff', 'SuperAdmin'],
    },
    { id: 'classes', label: 'कक्षा एवं अध्यापक आवंटन', icon: Building2, allowedRoles: ['Director', 'Principal'] },
    { id: 'fees', label: 'फीस पोर्टल एवं चालान', icon: IndianRupee, allowedRoles: ['Director', 'Principal'] },
    { id: 'exams', label: 'परीक्षा एवं अंक प्रविष्टि', icon: FileSpreadsheet, allowedRoles: ['Director', 'Principal', 'Staff'], requiredModule: 'exams' },
    { id: 'notices', label: 'सूचना पट्ट एवं पुश अलर्ट', icon: Bell, allowedRoles: ['Director', 'Principal', 'Staff'] },
    { id: 'principal', label: 'प्रधानाचार्य प्रबंधन', icon: UserCheck, allowedRoles: ['Director'], requiredModule: 'principal', badge: 'प्रो' },
    { id: 'settings', label: 'स्कूल प्रोफ़ाइल व सेटिंग्स', icon: Settings, allowedRoles: ['Director'] },
    { id: 'plugins', label: 'प्लगइन मार्केटप्लेस', icon: Store, allowedRoles: ['Director'], badge: 'नया' },
    { id: 'billing', label: 'प्लान व बिलिंग', icon: CreditCard, allowedRoles: ['Director'], badge: 'अपग्रेड' },
  ];

  const filteredNavItems = navItems.filter((item) => {
    if (item.superAdminOnly) return userRole === 'SuperAdmin';
    if (!item.allowedRoles || item.allowedRoles.indexOf(userRole) === -1) return false;
    return true;
  });

  const activeFrontendPlugins = (userRole === 'SuperAdmin') ? [] : PLUGINS_REGISTRY.filter(p => activePlugins.includes(p.id));
  
  const dynamicNavItems = (userRole === 'SuperAdmin') ? [] : activeFrontendPlugins.flatMap(p => p.navItems || []).filter(item => {
    if (item.superAdminOnly) return false;
    if (!item.allowedRoles || item.allowedRoles.indexOf(userRole) === -1) return false;
    return true;
  });

  const allNavItems = [...filteredNavItems, ...dynamicNavItems];

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans antialiased text-slate-900">
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 px-4 lg:px-8 py-2.5 flex items-center justify-between shadow-2xs">
        <div className="flex items-center gap-3">
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="lg:hidden p-2 rounded-xl text-slate-600 hover:bg-slate-100">
            {isSidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-blue-700 to-indigo-600 text-white flex items-center justify-center shadow-md shrink-0">
              <School className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-black tracking-tight text-slate-900 line-clamp-1">{schoolProfile.schoolName || 'विद्या सेतु स्कूल प्रबंधन'}</h1>
              <p className="text-[11px] text-slate-500 hidden sm:block">सत्र: {schoolProfile.academicSession || '2026-2027'} • भूमिका: {roleEmoji(userRole)}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden md:flex items-center gap-1.5 px-3 py-1 bg-emerald-50 border border-emerald-200 rounded-full text-[11px] text-emerald-800 font-medium">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>अधिकृत सत्र सक्रिय</span>
          </div>

          {(userRole === 'Director' || userRole === 'Principal' || (userRole === 'Staff' && isClassTeacher)) && (
            <>
              <button onClick={() => setIsAddScholarOpen(true)} className="hidden lg:flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer">
                <span>+ स्कॉलर प्रवेश</span>
              </button>
              <button onClick={() => setIsBroadcastOpen(true)} className="hidden sm:flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer" title="पुश सूचना / त्वरित अलर्ट भेजें">
                <Bell className="h-3.5 w-3.5" />
                <span>त्वरित पुश अलर्ट</span>
              </button>
              {(userRole === 'Director' || userRole === 'Principal') && (
                <button onClick={() => setIsRequestFeatureOpen(true)} className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition-colors cursor-pointer" title="विशेष आवश्यकता या फीचर का अनुरोध करें">
                  <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
                  <span>कस्टम आवश्यकता</span>
                </button>
              )}
            </>
          )}

          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="hidden sm:flex items-center gap-2 pl-3 pr-2 py-1 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="text-right">
                <div className="text-xs font-bold text-slate-800 leading-tight line-clamp-1">{currentUser.fullName}</div>
                <div className="text-[10px] text-slate-500 font-medium">{roleEmoji(userRole)}</div>
              </div>
              <div className={'h-7 w-7 rounded-lg text-white font-bold text-xs flex items-center justify-center shadow-xs ' + roleColor(userRole)}>
                {roleShort(userRole)}
              </div>
            </div>

            <button onClick={handleLogout} title="लॉगआउट करें" className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 text-slate-600 text-xs font-semibold transition shadow-2xs cursor-pointer">
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden md:inline">लॉगआउट</span>
            </button>
          </div>
        </div>
      </header>
      {webPushStatus && webPushStatus !== 'granted' && (
        <div className="flex items-start gap-2 mx-4 mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs text-amber-900 shadow-2xs">
          <Bell className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="min-w-0 break-words leading-relaxed">
            <strong>🔔 सूचना अलर्ट स्थिति:</strong> {webPushStatus}
          </div>
          <button onClick={() => setWebPushStatus(null)} className="ml-auto text-amber-700 hover:text-amber-900 cursor-pointer shrink-0"><X className="h-4 w-4" /></button>
        </div>
      )}


      <div className="flex grow">
        <aside className={'fixed inset-y-0 left-0 z-30 w-64 bg-white border-r border-slate-200 pt-16 lg:pt-0 transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static flex flex-col justify-between shrink-0 shadow-sm ' + (isSidebarOpen ? 'translate-x-0' : '-translate-x-full')}>
          <div className="p-4 space-y-4 overflow-y-auto grow">
            <div className={'p-3.5 rounded-2xl border ' + (userRole === 'SuperAdmin' ? 'bg-rose-50/70 border-rose-200' : 'bg-slate-50/70 border-slate-200')}>
              <div className="flex items-center gap-2.5">
                <div className={'h-9 w-9 rounded-xl flex items-center justify-center text-white font-bold text-xs shadow-xs ' + roleColor(userRole)}>
                  {roleShort(userRole)}
                </div>
                <div className="overflow-hidden">
                  <h3 className="text-xs font-bold text-slate-900 truncate">{currentUser.fullName}</h3>
                  <p className="text-[10px] text-slate-600 truncate">{currentUser.designation}</p>
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[10px]">
                <span className="font-bold text-slate-500">प्रमाणीकृत खाता:</span>
                <span className="font-semibold text-emerald-700 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> सक्रिय</span>
              </div>
            </div>

            <nav className="space-y-1">
              <div className="px-2 py-1 text-[10px] font-bold tracking-wider text-slate-400 uppercase">प्रशासनिक मॉड्यूल</div>
              {allNavItems.map((item) => {
                const isActive = activeTab === item.id;
                const Icon = item.icon;
                const isLocked = userRole !== 'SuperAdmin' && !!item.requiredModule && planModules.indexOf(item.requiredModule) === -1;
                return (
                  <button
                    key={item.id}
                    onClick={() => { setActiveTab(item.id); setIsSidebarOpen(false); }}
                    className={'w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ' + (isActive ? 'bg-blue-600 text-white shadow-xs' : isLocked ? 'text-slate-500 hover:bg-slate-50 hover:text-slate-800' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900')}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={'h-4 w-4 ' + (isActive ? 'text-white' : isLocked ? 'text-amber-500' : 'text-slate-400')} />
                      <span>{item.label}</span>
                    </div>
                    {isLocked ? (
                      <span className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded font-bold bg-amber-50 text-amber-800 border border-amber-300">
                        <Lock className="h-2.5 w-2.5 text-amber-600" /> अपग्रेड
                      </span>
                    ) : item.badge && (
                      <span className={'text-[9px] px-1.5 py-0.5 rounded font-bold ' + (isActive ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800')}>{item.badge}</span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="p-4 border-t border-slate-100 text-slate-500 text-[11px] space-y-1 bg-slate-50/50">
            <p className="font-bold text-slate-700">विद्या सेतु स्कूल प्रबंधन</p>
            <p className="text-[10px] text-slate-500">सुरक्षित एवं अधिकृत पोर्टल</p>
          </div>
        </aside>

        <main className="grow p-4 lg:p-8 overflow-y-auto max-w-7xl mx-auto w-full">
          {planId === 'trial' && userRole !== 'SuperAdmin' && (
            <div className="mb-4 p-4 rounded-2xl bg-amber-50 border border-amber-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
                <div>
                  <div className="text-sm font-bold text-amber-900">7-दिन का फ्री ट्रायल जारी है</div>
                  <div className="text-xs text-amber-800">सीमित एक्सेस (अधिकतम 50 छात्र / 10 स्टाफ)। {trialInfo && trialInfo.trialEndsAt ? 'ट्रायल ' + trialInfo.trialEndsAt + ' तक वैध है।' : ''} समाप्ति के बाद प्लान सक्रिय करना आवश्यक है।</div>
                </div>
              </div>
              <button onClick={() => setActiveTab('billing')} className="shrink-0 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition cursor-pointer">प्लान देखें व खरीदें →</button>
            </div>
          )}

          {activeTab === 'admin' && <AdminConsoleScreen />}
          {activeTab === 'dashboard' && (
            <DashboardScreen onNavigate={(tab) => setActiveTab(tab)} onOpenAddStudent={() => setIsAddScholarOpen(true)} onOpenFcmModal={() => setIsBroadcastOpen(true)} userRole={screenRole} currentUser={currentUser} schoolProfile={schoolProfile} />
          )}
          {activeTab === 'students' && <StudentsScreen userRole={screenRole} currentUser={currentUser} />}
          {activeTab === 'activity-logs' && <ActivityLogsScreen userRole={userRole} currentUser={currentUser} />}
          {activeTab === 'principal' && (
            userRole !== 'SuperAdmin' && planModules.indexOf('principal') === -1 ? (
              <UpgradeGateScreen
                moduleName="प्रधानाचार्य प्रबंधन (Principal Management)"
                requiredPlanName="Pro / Enterprise"
                moduleDescription="प्रधानाचार्य का विशेष खाता, शैक्षणिक सुपरविजन और स्टाफ मूल्यांकन मॉड्यूल वर्तमान प्लान में शामिल नहीं है।"
                onUpgradeClick={() => setActiveTab('billing')}
                onRequestFeatureClick={() => setIsRequestFeatureOpen(true)}
              />
            ) : (
              <PrincipalManagementScreen userRole={userRole} />
            )
          )}
          {activeTab === 'staff' && <StaffScreen userRole={screenRole} />}
          {activeTab === 'attendance' && <AttendanceScreen userRole={screenRole} currentUserId={currentUser.id} onOpenFcmModal={() => setIsBroadcastOpen(true)} />}
          {activeTab === 'classes' && <ClassesScreen userRole={screenRole} />}
          {activeTab === 'fees' && <FeesScreen />}
          {activeTab === 'exams' && (
            userRole !== 'SuperAdmin' && planModules.indexOf('exams') === -1 ? (
              <UpgradeGateScreen
                moduleName="परीक्षा एवं रिपोर्ट कार्ड (Examinations & Marks)"
                requiredPlanName="Pro / Enterprise"
                moduleDescription="ऑनलाइन अंक प्रविष्टि, परीक्षा रोस्टर और ऑटो-मार्कशीट जनरेशन मॉड्यूल वर्तमान प्लान में शामिल नहीं है।"
                onUpgradeClick={() => setActiveTab('billing')}
                onRequestFeatureClick={() => setIsRequestFeatureOpen(true)}
              />
            ) : (
              <ExamsScreen />
            )
          )}
          { activeTab === 'notices' && <NoticesScreen onOpenFcmModal={() => setIsBroadcastOpen(true)} /> }
          { activeTab === 'settings' && <SchoolSettingsScreen userRole={userRole} /> }
          { activeTab === 'plugins' && <PluginMarketplaceScreen /> }
          { activeTab === 'billing' && <BillingPlansScreen userRole={userRole} onOpenFcmModal={() => setIsBroadcastOpen(true)} /> }
          
          {/* Dynamic Plugin Routes */}
          {activeFrontendPlugins.flatMap(p => p.routes || []).map(route => {
            if (activeTab === route.id) {
              const Component = route.component;
              return <Component key={route.id} />;
            }
            return null;
          })}
        </main>
      </div>

      <AddScholarModal
        isOpen={isAddScholarOpen}
        onClose={() => setIsAddScholarOpen(false)}
        assignedClasses={assignedClasses}
        isClassTeacher={isClassTeacher && userRole === 'Staff'}
        onSuccess={() => { setActiveTab('students'); }}
      />
      <FcmBroadcastModal isOpen={isBroadcastOpen} onClose={() => setIsBroadcastOpen(false)} schoolId={currentUser.schoolId || 'school-01'} />
      <RequestFeatureModal isOpen={isRequestFeatureOpen} onClose={() => setIsRequestFeatureOpen(false)} />

      {pushToast && (
        <div className="fixed top-5 right-5 z-[9999] max-w-sm w-full bg-white border-2 border-amber-400 rounded-2xl shadow-2xl p-4 flex items-start gap-3 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="p-2.5 bg-amber-100 text-amber-800 rounded-xl shrink-0">
            <Bell className="h-6 w-6 animate-bounce" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-bold text-slate-900 truncate">{pushToast.title}</h4>
              <button
                type="button"
                onClick={() => setPushToast(null)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-slate-600 mt-1 line-clamp-3 leading-relaxed">{pushToast.body}</p>
            <div className="text-[10px] text-emerald-700 font-medium mt-2 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
              <span>पुश सूचना प्राप्त हुई • अभी-अभी</span>
            </div>
          </div>
        </div>
      )}

      {/* Dynamic Plugin Widgets */}
      {activeFrontendPlugins.flatMap(p => p.widgets || []).map((widget) => {
        const Widget = widget.component;
        return <Widget key={widget.id} />;
      })}
    </div>
  );
}
