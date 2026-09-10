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
import { LoginScreen } from './screens/login-screen';

import { AddScholarModal } from './modals/add-scholar-modal';
import { FcmBroadcastModal } from './modals/fcm-broadcast-modal';

type UserRole = 'Director' | 'Principal' | 'Staff';

interface CurrentUser {
  id: string;
  fullName: string;
  role: UserRole;
  designation: string;
  department?: string;
  email: string;
  phone?: string;
}

const PRESET_USERS: Record<UserRole, CurrentUser> = {
  Director: {
    id: 'usr-director',
    fullName: 'श्री सत्यप्रकाश शर्मा',
    role: 'Director',
    designation: 'स्कूल निदेशक एवं प्रबंधक (Director)',
    department: 'प्रशासन एवं प्रबंधन (Management)',
    email: 'director@vidyasetuschool.edu.in',
    phone: '+91 98111 22334',
  },
  Principal: {
    id: 'usr-principal',
    fullName: 'डॉ. आनंद मोहन त्रिवेदी',
    role: 'Principal',
    designation: 'प्रधानाचार्य (Principal & Academic Head)',
    department: 'शैक्षणिक एवं विद्यालय प्रशासन (Academics)',
    email: 'principal@vidyasetuschool.edu.in',
    phone: '+91 98222 34567',
  },
  Staff: {
    id: 'usr-staff',
    fullName: 'श्रीमती रेखा वर्मा',
    role: 'Staff',
    designation: 'वरिष्ठ शिक्षिका (PGT Mathematics)',
    department: 'गणित संकाय (Mathematics)',
    email: 'staff@vidyasetuschool.edu.in',
    phone: '+91 94123 45678',
  },
};

export function SchoolCrmShell() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isLoginMode, setIsLoginMode] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('vidyasetu_user');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && parsed.email) {
            return parsed;
          }
        }
      } catch {}
    }
    return PRESET_USERS.Director;
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAddScholarOpen, setIsAddScholarOpen] = useState(false);
  const [isBroadcastOpen, setIsBroadcastOpen] = useState(false);

  // School profile state from API
  const [schoolProfile, setSchoolProfile] = useState<any>({
    schoolName: 'विद्या सेतु सीनियर सेकेंडरी स्कूल',
    affiliationNumber: 'CBSE-AFF/2026/8934',
    boardName: 'केंद्रीय माध्यमिक शिक्षा बोर्ड (CBSE)',
    academicSession: '2026-2027',
    principalName: 'डॉ. आनंद मोहन त्रिवेदी',
    directorName: 'श्री सत्यप्रकाश शर्मा',
  });

  // Fetch school profile
  useEffect(() => {
    let active = true;
    fetch('/api/school-profile')
      .then((res) => res.json())
      .then((data) => {
        if (active && data.success && data.profile) {
          setSchoolProfile(data.profile);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    localStorage.removeItem('vidyasetu_user');
    localStorage.removeItem('vidyasetu_token');
    setIsLoginMode(true);
  };

  const switchRole = (newRole: UserRole) => {
    const selectedUser = PRESET_USERS[newRole];
    setCurrentUser(selectedUser);
    if (typeof window !== 'undefined') {
      localStorage.setItem('vidyasetu_user', JSON.stringify(selectedUser));
    }
    // If on a tab restricted to higher roles, redirect to dashboard
    if (newRole === 'Staff' && (activeTab === 'principal' || activeTab === 'settings' || activeTab === 'fees')) {
      setActiveTab('dashboard');
    } else if (newRole === 'Principal' && (activeTab === 'principal' || activeTab === 'settings')) {
      setActiveTab('dashboard');
    }
  };

  // If user explicitly navigated to Login Mode
  if (isLoginMode) {
    return (
      <LoginScreen
        onLoginSuccess={(user) => {
          setCurrentUser(user);
          setIsLoginMode(false);
          setActiveTab('dashboard');
        }}
        onContinueAsGuest={() => {
          setCurrentUser(PRESET_USERS.Director);
          setIsLoginMode(false);
          setActiveTab('dashboard');
        }}
      />
    );
  }

  const userRole: UserRole = currentUser.role || 'Staff';

  // Navigation Items with RBAC permissions
  const navItems = [
    {
      id: 'dashboard',
      label: 'डैशबोर्ड (Overview)',
      icon: LayoutDashboard,
      allowedRoles: ['Director', 'Principal', 'Staff'],
    },
    {
      id: 'students',
      label: 'स्कॉलर रजिस्टर (दाखिला-खारिज)',
      icon: Users,
      allowedRoles: ['Director', 'Principal', 'Staff'],
    },
    {
      id: 'principal',
      label: 'प्रधानाचार्य प्रबंधन (Principal)',
      icon: UserCheck,
      allowedRoles: ['Director'], // Only Director can access!
      badge: 'निदेशक विशेष',
    },
    {
      id: 'staff',
      label: 'स्टाफ एवं शिक्षक निर्देशिका',
      icon: GraduationCap,
      allowedRoles: ['Director', 'Principal', 'Staff'],
    },
    {
      id: 'attendance',
      label: 'दैनिक छात्र उपस्थिति',
      icon: CalendarCheck,
      allowedRoles: ['Director', 'Principal', 'Staff'],
    },
    {
      id: 'fees',
      label: 'फीस पोर्टल एवं चालान',
      icon: IndianRupee,
      allowedRoles: ['Director', 'Principal'],
    },
    {
      id: 'exams',
      label: 'परीक्षा एवं अंक प्रविष्टि',
      icon: FileSpreadsheet,
      allowedRoles: ['Director', 'Principal', 'Staff'],
    },
    {
      id: 'notices',
      label: 'सूचना पट्ट एवं अलर्ट',
      icon: Bell,
      allowedRoles: ['Director', 'Principal', 'Staff'],
    },
    {
      id: 'settings',
      label: 'स्कूल प्रोफ़ाइल व सेटिंग्स',
      icon: Settings,
      allowedRoles: ['Director'], // Only Director can configure school
    },
  ];

  const filteredNavItems = navItems.filter((item) =>
    item.allowedRoles.includes(userRole)
  );

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans antialiased text-slate-900">
      {/* Top Bar */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 px-4 lg:px-8 py-2.5 flex items-center justify-between shadow-2xs">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="lg:hidden p-2 rounded-xl text-slate-600 hover:bg-slate-100"
          >
            {isSidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-blue-700 to-indigo-600 text-white flex items-center justify-center shadow-md shrink-0">
              <School className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-black tracking-tight text-slate-900 line-clamp-1">
                  {schoolProfile.schoolName}
                </h1>
                <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                  {schoolProfile.boardName?.slice(0, 10)}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 hidden sm:block">
                एफिलिएशन सं: {schoolProfile.affiliationNumber} • सत्र: {schoolProfile.academicSession}
              </p>
            </div>
          </div>
        </div>

        {/* Right Controls: User Profile & Quick Action */}
        <div className="flex items-center gap-2">
          {/* Quick Role Switcher Pills */}
          <div className="hidden xl:flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
            <span className="px-2 text-[11px] font-bold text-slate-500">भूमिका:</span>
            <button
              onClick={() => switchRole('Director')}
              className={`px-2.5 py-1 rounded-lg font-bold text-xs transition cursor-pointer flex items-center gap-1 ${
                userRole === 'Director'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-white hover:text-slate-900'
              }`}
            >
              <span>👑 निदेशक</span>
            </button>
            <button
              onClick={() => switchRole('Principal')}
              className={`px-2.5 py-1 rounded-lg font-bold text-xs transition cursor-pointer flex items-center gap-1 ${
                userRole === 'Principal'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-white hover:text-slate-900'
              }`}
            >
              <span>🏛️ प्रधानाचार्य</span>
            </button>
            <button
              onClick={() => switchRole('Staff')}
              className={`px-2.5 py-1 rounded-lg font-bold text-xs transition cursor-pointer flex items-center gap-1 ${
                userRole === 'Staff'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-white hover:text-slate-900'
              }`}
            >
              <span>👨‍🏫 शिक्षक</span>
            </button>
          </div>

          {/* Status Pill */}
          <div className="hidden md:flex items-center gap-1.5 px-3 py-1 bg-emerald-50 border border-emerald-200 rounded-full text-[11px] text-emerald-800 font-medium">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>सिस्टम सक्रिय</span>
          </div>

          {/* Quick Action: New Admission */}
          {(userRole === 'Director' || userRole === 'Principal') && (
            <button
              onClick={() => setIsAddScholarOpen(true)}
              className="hidden lg:flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
            >
              <span>+ स्कॉलर प्रवेश</span>
            </button>
          )}

          {/* Open Login Portal Button */}
          <button
            onClick={() => setIsLoginMode(true)}
            title="पासवर्ड आधारित अधिकृत लॉगिन पोर्टल खोलें"
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl border border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100 text-indigo-800 text-xs font-bold transition shadow-2xs cursor-pointer"
          >
            <Lock className="h-3.5 w-3.5 text-indigo-700" />
            <span className="hidden sm:inline">लॉगिन पोर्टल</span>
          </button>

          {/* Authenticated User info & Logout */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="hidden sm:flex items-center gap-2 pl-3 pr-2 py-1 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="text-right">
                <div className="text-xs font-bold text-slate-800 leading-tight line-clamp-1">
                  {currentUser.fullName}
                </div>
                <div className="text-[10px] text-slate-500 font-medium">
                  {userRole === 'Director'
                    ? '👑 निदेशक'
                    : userRole === 'Principal'
                    ? '🏛️ प्रधानाचार्य'
                    : '👨‍🏫 शिक्षक/स्टाफ'}
                </div>
              </div>
              <div
                className={`h-7 w-7 rounded-lg text-white font-bold text-xs flex items-center justify-center shadow-xs ${
                  userRole === 'Director'
                    ? 'bg-amber-600'
                    : userRole === 'Principal'
                    ? 'bg-indigo-600'
                    : 'bg-emerald-600'
                }`}
              >
                {userRole === 'Director' ? 'नि' : userRole === 'Principal' ? 'प्र' : 'शि'}
              </div>
            </div>

            <button
              onClick={handleLogout}
              title="लॉगआउट करें"
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 text-slate-600 text-xs font-semibold transition shadow-2xs cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden md:inline">लॉगआउट</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex grow">
        {/* Sidebar */}
        <aside
          className={`fixed inset-y-0 left-0 z-30 w-64 bg-white border-r border-slate-200 pt-16 lg:pt-0 transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static flex flex-col justify-between shrink-0 shadow-sm ${
            isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="p-4 space-y-4 overflow-y-auto grow">
            {/* Current User Card */}
            <div
              className={`p-3.5 rounded-2xl border ${
                userRole === 'Director'
                  ? 'bg-amber-50/70 border-amber-200'
                  : userRole === 'Principal'
                  ? 'bg-indigo-50/70 border-indigo-200'
                  : 'bg-emerald-50/70 border-emerald-200'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className={`h-9 w-9 rounded-xl flex items-center justify-center text-white font-bold text-xs shadow-xs ${
                    userRole === 'Director'
                      ? 'bg-amber-600'
                      : userRole === 'Principal'
                      ? 'bg-indigo-600'
                      : 'bg-emerald-600'
                  }`}
                >
                  {userRole === 'Director' ? 'नि' : userRole === 'Principal' ? 'प्र' : 'शि'}
                </div>
                <div className="overflow-hidden">
                  <h3 className="text-xs font-bold text-slate-900 truncate">
                    {currentUser.fullName}
                  </h3>
                  <p className="text-[10px] text-slate-600 truncate">{currentUser.designation}</p>
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[10px]">
                <span className="font-bold text-slate-500">प्रमाणीकृत खाता:</span>
                <span className="font-semibold text-emerald-700 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> सक्रिय
                </span>
              </div>

              {/* Mobile/Sidebar Quick Role Switching */}
              <div className="mt-3 pt-2 border-t border-slate-200/60">
                <div className="text-[10px] font-bold text-slate-500 mb-1.5">भूमिका बदलें (Switch Role):</div>
                <div className="grid grid-cols-3 gap-1">
                  <button
                    type="button"
                    onClick={() => switchRole('Director')}
                    className={`py-1 px-1.5 rounded-lg text-[10px] font-bold text-center transition cursor-pointer ${
                      userRole === 'Director' ? 'bg-amber-600 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    निदेशक
                  </button>
                  <button
                    type="button"
                    onClick={() => switchRole('Principal')}
                    className={`py-1 px-1.5 rounded-lg text-[10px] font-bold text-center transition cursor-pointer ${
                      userRole === 'Principal' ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    प्रधानाचार्य
                  </button>
                  <button
                    type="button"
                    onClick={() => switchRole('Staff')}
                    className={`py-1 px-1.5 rounded-lg text-[10px] font-bold text-center transition cursor-pointer ${
                      userRole === 'Staff' ? 'bg-emerald-600 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    शिक्षक
                  </button>
                </div>
              </div>
            </div>

            {/* Navigation Links */}
            <nav className="space-y-1">
              <div className="px-2 py-1 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                प्रशासनिक मॉड्यूल (CRM Modules)
              </div>
              {filteredNavItems.map((item) => {
                const isActive = activeTab === item.id;
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      setIsSidebarOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={`h-4 w-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                      <span>{item.label}</span>
                    </div>
                    {item.badge && (
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                          isActive ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Footer Info */}
          <div className="p-4 border-t border-slate-100 text-slate-500 text-[11px] space-y-1 bg-slate-50/50">
            <p className="font-bold text-slate-700">विद्या सेतु स्कूल प्रबंधन</p>
            <p className="text-[10px] text-slate-500">सुरक्षित एवं अधिकृत पोर्टल</p>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="grow p-4 lg:p-8 overflow-y-auto max-w-7xl mx-auto w-full">
          {activeTab === 'dashboard' && (
            <DashboardScreen
              onNavigate={(tab) => setActiveTab(tab)}
              onOpenAddStudent={() => setIsAddScholarOpen(true)}
              onOpenFcmModal={() => setIsBroadcastOpen(true)}
              userRole={userRole}
              currentUser={currentUser}
              schoolProfile={schoolProfile}
            />
          )}

          {activeTab === 'students' && <StudentsScreen userRole={userRole} />}

          {activeTab === 'principal' && <PrincipalManagementScreen userRole={userRole} />}

          {activeTab === 'staff' && <StaffScreen userRole={userRole} />}

          {activeTab === 'attendance' && (
            <AttendanceScreen onOpenFcmModal={() => setIsBroadcastOpen(true)} />
          )}

          {activeTab === 'fees' && <FeesScreen />}

          {activeTab === 'exams' && <ExamsScreen />}

          {activeTab === 'notices' && (
            <NoticesScreen onOpenFcmModal={() => setIsBroadcastOpen(true)} />
          )}

          {activeTab === 'settings' && <SchoolSettingsScreen userRole={userRole} />}
        </main>
      </div>

      {/* Global Modals */}
      <AddScholarModal
        isOpen={isAddScholarOpen}
        onClose={() => setIsAddScholarOpen(false)}
        onSuccess={() => {
          setActiveTab('students');
        }}
      />

      <FcmBroadcastModal
        isOpen={isBroadcastOpen}
        onClose={() => setIsBroadcastOpen(false)}
      />
    </div>
  );
}
