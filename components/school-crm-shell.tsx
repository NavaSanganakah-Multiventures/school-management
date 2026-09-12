'use client';

import React, { useState, useEffect } from 'react';
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
import { AdminConsoleScreen } from './screens/admin-console-screen';

import { AddScholarModal } from './modals/add-scholar-modal';
import { FcmBroadcastModal } from './modals/fcm-broadcast-modal';
import { registerFcmWebToken, onForegroundFcmMessage, onFcmTokenRefresh } from '../lib/firebase-web-push';

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
  if (role === 'SuperAdmin') return '🛡️ Super Admin';
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
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && parsed.email && parsed.role) return parsed as CurrentUser;
    }
  } catch (e) {}
  return null;
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
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(() => readStoredUser());
  const [planId, setPlanId] = useState('trial');
  const [planModules, setPlanModules] = useState<string[]>(['dashboard', 'students', 'attendance', 'staff', 'notices', 'fees', 'settings', 'billing']);
  const [trialInfo, setTrialInfo] = useState<{ trialEndsAt: string; status: string } | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAddScholarOpen, setIsAddScholarOpen] = useState(false);
  const [isBroadcastOpen, setIsBroadcastOpen] = useState(false);
  const [pushToast, setPushToast] = useState<{ title: string; body: string } | null>(null);

  const [schoolProfile, setSchoolProfile] = useState<any>({
    schoolName: 'विद्या सेतु स्कूल प्रबंधन',
    affiliationNumber: '',
    boardName: '',
    academicSession: '2026-2027',
    principalName: '',
    directorName: '',
  });

  // Attach auth token + school id to every outgoing request (no per-screen changes needed)
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
      return originalFetch(input, newInit);
    };
    return () => { (window as any).fetch = originalFetch; };
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
    if (!currentUser) return;
    let disposeForeground: (() => void) | null = null;
    let disposeRefresh: (() => void) | null = null;

    const sendTokenToServer = async (token: string) => {
      try {
        await fetch('/api/notifications/register-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: token, deviceType: 'web', role: currentUser.role, schoolId: currentUser.schoolId, platform: 'web' }),
        });
      } catch (e) {}
    };

    registerFcmWebToken().then((token) => {
      if (token) sendTokenToServer(token);
    }).catch(() => {});

    onForegroundFcmMessage((payload) => {
      const n = payload && payload.notification;
      if (n && n.title) {
        setPushToast({ title: n.title, body: n.body || '' });
        setTimeout(() => setPushToast(null), 6000);
      }
    }).then((dispose) => { disposeForeground = dispose; }).catch(() => {});

    onFcmTokenRefresh((token) => { sendTokenToServer(token); }).then((dispose) => { disposeRefresh = dispose; }).catch(() => {});

    return () => {
      if (disposeForeground) disposeForeground();
      if (disposeRefresh) disposeRefresh();
    };
  }, [currentUser]);

const handleLogout = async () => {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch (e) {}
    localStorage.removeItem('vidyasetu_user');
    localStorage.removeItem('vidyasetu_token');
    setCurrentUser(null);
    setAuthScreen('login');
    setActiveTab('dashboard');
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
    { id: 'admin', label: 'Super Admin कंसोल', icon: ShieldCheck, superAdminOnly: true },
    { id: 'dashboard', label: 'डैशबोर्ड (Overview)', icon: LayoutDashboard, allowedRoles: ['Director', 'Principal', 'Staff'] },
    { id: 'students', label: 'स्कॉलर रजिस्टर', icon: Users, allowedRoles: ['Director', 'Principal', 'Staff'] },
    { id: 'staff', label: 'स्टाफ एवं शिक्षक निर्देशिका', icon: GraduationCap, allowedRoles: ['Director', 'Principal', 'Staff'] },
    { id: 'attendance', label: 'दैनिक छात्र उपस्थिति', icon: CalendarCheck, allowedRoles: ['Director', 'Principal', 'Staff'] },
    { id: 'fees', label: 'फीस पोर्टल एवं चालान', icon: IndianRupee, allowedRoles: ['Director', 'Principal'] },
    { id: 'exams', label: 'परीक्षा एवं अंक प्रविष्टि', icon: FileSpreadsheet, allowedRoles: ['Director', 'Principal', 'Staff'], requiredModule: 'exams' },
    { id: 'notices', label: 'सूचना पट्ट एवं अलर्ट', icon: Bell, allowedRoles: ['Director', 'Principal', 'Staff'] },
    { id: 'principal', label: 'प्रधानाचार्य प्रबंधन', icon: UserCheck, allowedRoles: ['Director'], requiredModule: 'principal', badge: 'प्रो' },
    { id: 'settings', label: 'स्कूल प्रोफ़ाइल व सेटिंग्स', icon: Settings, allowedRoles: ['Director'] },
    { id: 'billing', label: 'प्लान व बिलिंग', icon: CreditCard, allowedRoles: ['Director'], badge: 'अपग्रेड' },
  ];

  const filteredNavItems = navItems.filter((item) => {
    if (item.superAdminOnly) return userRole === 'SuperAdmin';
    if (!item.allowedRoles || item.allowedRoles.indexOf(userRole) === -1) return false;
    if (item.requiredModule && planModules.indexOf(item.requiredModule) === -1) return false;
    return true;
  });

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

          {(userRole === 'Director' || userRole === 'Principal') && (
            <button onClick={() => setIsAddScholarOpen(true)} className="hidden lg:flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer">
              <span>+ स्कॉलर प्रवेश</span>
            </button>
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
      {pushToast && (
        <div className="fixed top-16 right-4 z-50 max-w-sm rounded-2xl bg-slate-900 text-white shadow-xl p-4">
          <div className="flex items-start gap-3">
            <Bell className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-bold">{pushToast.title}</p>
              {pushToast.body ? <p className="text-xs text-slate-300 mt-1">{pushToast.body}</p> : null}
            </div>
            <button onClick={() => setPushToast(null)} className="ml-2 text-slate-400 hover:text-white cursor-pointer"><X className="h-4 w-4" /></button>
          </div>
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
              {filteredNavItems.map((item) => {
                const isActive = activeTab === item.id;
                const Icon = item.icon;
                return (
                  <button key={item.id} onClick={() => { setActiveTab(item.id); setIsSidebarOpen(false); }} className={'w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ' + (isActive ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900')}>
                    <div className="flex items-center gap-3">
                      <Icon className={'h-4 w-4 ' + (isActive ? 'text-white' : 'text-slate-400')} />
                      <span>{item.label}</span>
                    </div>
                    {item.badge && (
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
          {activeTab === 'students' && <StudentsScreen userRole={screenRole} />}
          {activeTab === 'principal' && <PrincipalManagementScreen userRole={userRole} />}
          {activeTab === 'staff' && <StaffScreen userRole={screenRole} />}
          {activeTab === 'attendance' && <AttendanceScreen onOpenFcmModal={() => setIsBroadcastOpen(true)} />}
          {activeTab === 'fees' && <FeesScreen />}
          {activeTab === 'exams' && <ExamsScreen />}
          {activeTab === 'notices' && <NoticesScreen onOpenFcmModal={() => setIsBroadcastOpen(true)} />}
          {activeTab === 'settings' && <SchoolSettingsScreen userRole={userRole} />}
          {activeTab === 'billing' && <BillingPlansScreen userRole={userRole} onOpenFcmModal={() => setIsBroadcastOpen(true)} />}
        </main>
      </div>

      <AddScholarModal isOpen={isAddScholarOpen} onClose={() => setIsAddScholarOpen(false)} onSuccess={() => { setActiveTab('students'); }} />
      <FcmBroadcastModal isOpen={isBroadcastOpen} onClose={() => setIsBroadcastOpen(false)} />
    </div>
  );
}
