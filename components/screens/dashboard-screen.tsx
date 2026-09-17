'use client';

import React, { useState, useEffect } from 'react';
import {
  Users,
  CheckCircle,
  IndianRupee,
  Calendar,
  Sparkles,
  School,
  GraduationCap,
  ShieldCheck,
  PlusCircle,
  Bell,
  ArrowRight,
  History,
  Clock,
} from 'lucide-react';

interface DashboardScreenProps {
  onNavigate: (tabId: string) => void;
  onOpenAddStudent: () => void;
  onOpenFcmModal: () => void;
  userRole: 'Director' | 'Principal' | 'Staff';
  currentUser: any;
  schoolProfile: any;
}

export function DashboardScreen({
  onNavigate,
  onOpenAddStudent,
  onOpenFcmModal,
  userRole,
  currentUser,
  schoolProfile,
}: DashboardScreenProps) {
  const isDirector = userRole === 'Director';
  const isPrincipal = userRole === 'Principal';
  const isStaff = userRole === 'Staff';

  const [dbStats, setDbStats] = useState<{
    totalStudents: number;
    activeStudents: number;
    totalStaff: number;
    attendanceRate: number;
    todayPresent: number;
    todayAbsent: number;
    attendanceRecordedToday: boolean;
    totalFeeCollected: number;
    totalFeeDue: number;
    activeNoticesCount: number;
  }>({
    totalStudents: 0,
    activeStudents: 0,
    totalStaff: 0,
    attendanceRate: 0,
    todayPresent: 0,
    todayAbsent: 0,
    attendanceRecordedToday: false,
    totalFeeCollected: 0,
    totalFeeDue: 0,
    activeNoticesCount: 0,
  });

  const [recentNotices, setRecentNotices] = useState<any[]>([]);
  const [recentActivities, setRecentActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const loadDashboardData = async () => {
      try {
        const [statsRes, noticesRes, actRes] = await Promise.all([
          fetch('/api/dashboard-stats'),
          fetch('/api/notices?limit=3'),
          fetch('/api/activity-logs?limit=4'),
        ]);

        const statsData = await statsRes.json();
        const noticesData = await noticesRes.json();
        const actData = await actRes.json().catch(() => ({}));

        if (isMounted) {
          if (statsData.success) {
            setDbStats(statsData.stats);
          }
          if (noticesData.success && Array.isArray(noticesData.notices)) {
            setRecentNotices(noticesData.notices.slice(0, 3));
          }
          if (actData.success && Array.isArray(actData.logs)) {
            setRecentActivities(actData.logs.slice(0, 4));
          }
        }
      } catch (err) {
        console.error('Error fetching dashboard stats:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadDashboardData();
    return () => {
      isMounted = false;
    };
  }, []);

  const stats = [
    {
      title: 'स्कॉलर छात्र संख्या',
      value: `${dbStats.totalStudents} छात्र`,
      change:
        dbStats.totalStudents > 0
          ? `${dbStats.activeStudents} सक्रिय छात्र नामांकित`
          : 'कोई छात्र पंजीकृत नहीं है',
      icon: Users,
      bgColor: 'bg-blue-50',
      textColor: 'text-blue-700',
      borderColor: 'border-blue-200',
      tab: 'students',
      visible: true,
    },
    {
      title: 'आज की उपस्थिति',
      value: dbStats.attendanceRecordedToday ? `${dbStats.attendanceRate}%` : 'दर्ज नहीं',
      change: dbStats.attendanceRecordedToday
        ? `${dbStats.todayPresent} उपस्थित • ${dbStats.todayAbsent} अनुपस्थित`
        : 'आज की उपस्थिति अभी दर्ज नहीं हुई',
      icon: CheckCircle,
      bgColor: 'bg-emerald-50',
      textColor: 'text-emerald-700',
      borderColor: 'border-emerald-200',
      tab: 'attendance',
      visible: true,
    },
    {
      title: 'सत्र फीस संकलन',
      value: `₹${(dbStats.totalFeeCollected || 0).toLocaleString('en-IN')}`,
      change:
        dbStats.totalFeeDue > 0
          ? `कुल देय: ₹${dbStats.totalFeeDue.toLocaleString('en-IN')}`
          : 'कोई लंबित चालान नहीं',
      icon: IndianRupee,
      bgColor: 'bg-indigo-50',
      textColor: 'text-indigo-700',
      borderColor: 'border-indigo-200',
      tab: 'fees',
      visible: isDirector || isPrincipal,
    },
    {
      title: 'शिक्षक एवं स्टाफ संख्या',
      value: `${dbStats.totalStaff} सदस्य`,
      change: dbStats.totalStaff > 0 ? 'सक्रिय स्टाफ सदस्य' : 'स्टाफ रजिस्टर खाली है',
      icon: GraduationCap,
      bgColor: 'bg-purple-50',
      textColor: 'text-purple-700',
      borderColor: 'border-purple-200',
      tab: 'staff',
      visible: true,
    },
  ].filter((s) => s.visible);

  return (
    <div className="space-y-6">
      {/* CRM Welcome Header */}
      <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 p-6 text-white shadow-xl border border-slate-700/60">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-500/20 text-blue-200 border border-blue-400/30 flex items-center gap-1.5">
                <School className="h-3.5 w-3.5" />
                {schoolProfile?.academicSession || 'सत्र 2026-2027'} • {schoolProfile?.boardName || 'CBSE'}
              </span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                  isDirector
                    ? 'bg-amber-500/30 text-amber-200 border border-amber-400/30'
                    : isPrincipal
                    ? 'bg-indigo-500/30 text-indigo-200 border border-indigo-400/30'
                    : 'bg-emerald-500/30 text-emerald-200 border border-emerald-400/30'
                }`}
              >
                भूमिका: {isDirector ? 'निदेशक' : isPrincipal ? 'प्रधानाचार्य' : 'स्टाफ शिक्षक'}
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
              {schoolProfile?.schoolName || 'प्रज्ञा मित्र सीनियर सेकेंडरी स्कूल'}
            </h1>
            <p className="text-xs text-slate-300 mt-1">
              नमस्ते, <strong className="text-white font-semibold">{currentUser?.fullName}</strong> ({currentUser?.designation}) • प्रशासनिक पोर्टल
            </p>
          </div>

          {/* Quick role-based action buttons */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {(isDirector || isPrincipal) && (
              <button
                onClick={onOpenAddStudent}
                className="flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 px-4 py-2.5 text-xs font-bold text-white shadow-md transition-all active:scale-95 cursor-pointer"
              >
                + नया स्कॉलर प्रवेश
              </button>
            )}

            {(isDirector || isPrincipal) && (
              <button
                onClick={onOpenFcmModal}
                className="flex items-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 px-4 py-2.5 text-xs font-bold text-slate-950 shadow-md transition-all active:scale-95 cursor-pointer"
              >
                <Sparkles className="h-3.5 w-3.5" />
                त्वरित अलर्ट भेजें
              </button>
            )}

            {isDirector && (
              <button
                onClick={() => onNavigate('principal')}
                className="flex items-center gap-1.5 rounded-xl bg-white/15 hover:bg-white/25 px-4 py-2.5 text-xs font-bold text-white border border-white/20 transition-all active:scale-95 cursor-pointer"
              >
                प्रधानाचार्य प्रबंधन
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Role-Specific Alert Banner */}
      {isDirector && (
        <div className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-4 shadow-xs flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-amber-950">सर्वोच्च प्रशासनिक अधिकार (निदेशक मोड)</h3>
              <p className="text-xs text-amber-800">
                आपके पास स्कूल प्रोफाइल, प्रधानाचार्य नियुक्ति/इतिहास, वित्तीय लेखा-जोखा और संपूर्ण दाखिला-खारिज रजिस्टर का पूर्ण नियंत्रण है।
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigate('principal')}
            className="shrink-0 px-3.5 py-1.5 bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer"
          >
            प्रधानाचार्य इतिहास देखें
          </button>
        </div>
      )}

      {/* Dynamic Key Performance Indicators Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s, idx) => {
          const Icon = s.icon;
          return (
            <div
              key={idx}
              onClick={() => onNavigate(s.tab)}
              className={`rounded-2xl border ${s.borderColor} ${s.bgColor} p-4.5 shadow-2xs hover:shadow-md transition-all cursor-pointer`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600">{s.title}</span>
                <div className={`p-2 rounded-xl bg-white/80 shadow-2xs ${s.textColor}`}>
                  <Icon className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3">
                <h3 className={`text-2xl font-black ${s.textColor}`}>{s.value}</h3>
                <p className="text-xs text-slate-500 font-medium mt-1">{s.change}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Administrative Action Center & Quick Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: School Quick Workflows */}
        <div className="lg:col-span-2 space-y-6">
          {/* Quick Action Modules */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <h3 className="font-bold text-base text-slate-900 mb-3 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-blue-900" />
              दैनिक प्रशासनिक कार्य एवं त्वरित नेविगेशन
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={() => onNavigate('students')}
                className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50/50 transition-all text-left group cursor-pointer"
              >
                <div>
                  <h4 className="text-xs font-bold text-slate-800 group-hover:text-blue-900">
                    दाखिला-खारिज (स्कॉलर रजिस्टर)
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    विद्यार्थियों का समग्र, आधार, टीसी एवं प्रवेश विवरण
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-blue-900 group-hover:translate-x-0.5 transition-all shrink-0" />
              </button>

              <button
                onClick={() => onNavigate('attendance')}
                className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/50 transition-all text-left group cursor-pointer"
              >
                <div>
                  <h4 className="text-xs font-bold text-slate-800 group-hover:text-emerald-900">
                    कक्षावार दैनिक उपस्थिति
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    उपस्थिति दर्ज करें व अनुपस्थित अभिभावकों को त्वरित संदेश भेजें
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-emerald-900 group-hover:translate-x-0.5 transition-all shrink-0" />
              </button>

              {(isDirector || isPrincipal) && (
                <button
                  onClick={() => onNavigate('fees')}
                  className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/50 transition-all text-left group cursor-pointer"
                >
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 group-hover:text-indigo-900">
                      फीस एवं चालान प्रबंधन
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      त्रैमासिक शुल्क, रसीद संकलन एवं बकाया रिपोर्ट
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-indigo-900 group-hover:translate-x-0.5 transition-all shrink-0" />
                </button>
              )}

              <button
                onClick={() => onNavigate('exams')}
                className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 hover:border-purple-400 hover:bg-purple-50/50 transition-all text-left group cursor-pointer"
              >
                <div>
                  <h4 className="text-xs font-bold text-slate-800 group-hover:text-purple-900">
                    परीक्षा परिणाम व अंक प्रविष्टि
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    इकाई परीक्षा, छमाही व वार्षिक अंक सूची रिकॉर्ड्स
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-purple-900 group-hover:translate-x-0.5 transition-all shrink-0" />
              </button>
            </div>
          </div>

          {/* Quick Getting Started Box if database is fresh */}
          {dbStats.totalStudents === 0 && (
            <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-5 space-y-3">
              <div className="flex items-center gap-2 text-blue-900 font-bold text-sm">
                <PlusCircle className="h-4 w-4 text-blue-600" />
                <span>नया शैक्षणिक सत्र 2026-27 प्रारंभ करें</span>
              </div>
              <p className="text-xs text-blue-800 leading-relaxed">
                स्कॉलर रजिस्टर पूर्णतया स्वच्छ है। आप अपने स्कूल के वास्तविक विद्यार्थियों का नया दाखिला दर्ज करके, उपस्थिति अंकित करके और फीस चालान जारी करके कार्य प्रारंभ कर सकते हैं।
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  onClick={onOpenAddStudent}
                  className="px-3.5 py-1.5 bg-blue-900 text-white rounded-lg text-xs font-semibold hover:bg-blue-800 transition-all cursor-pointer"
                >
                  + पहला छात्र नामांकित करें
                </button>
                <button
                  onClick={() => onNavigate('staff')}
                  className="px-3.5 py-1.5 bg-white border border-blue-300 text-blue-900 rounded-lg text-xs font-semibold hover:bg-blue-50 transition-all cursor-pointer"
                >
                  शिक्षक व स्टाफ सूची देखें
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Col: Recent Notices & Live Status */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Bell className="h-4 w-4 text-amber-600" />
                सक्रिय सूचनाएं एवं अलर्ट
              </h3>
              <button
                onClick={() => onNavigate('notices')}
                className="text-xs text-blue-600 font-bold hover:underline cursor-pointer"
              >
                सभी देखें
              </button>
            </div>

            {recentNotices.length === 0 ? (
              <div className="p-6 text-center border border-dashed border-slate-200 rounded-xl space-y-2">
                <p className="text-xs font-semibold text-slate-600">वर्तमान में कोई नोटिस प्रकाशित नहीं है</p>
                <button
                  onClick={onOpenFcmModal}
                  className="text-xs text-amber-700 font-bold hover:underline cursor-pointer"
                >
                  + नया सूचना अलर्ट प्रसारित करें
                </button>
              </div>
            ) : (
              recentNotices.map((n) => (
                <div
                  key={n.id}
                  className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1 text-xs"
                >
                  <div className="flex items-center justify-between font-bold text-slate-900">
                    <span className="truncate pr-2">{n.title}</span>
                    <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded shrink-0">
                      {n.category}
                    </span>
                  </div>
                  <p className="text-slate-600 text-[11px] line-clamp-2 leading-relaxed">
                    {n.content}
                  </p>
                </div>
              ))
            )}

            {/* System Status Banner */}
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1 text-xs">
              <div className="flex items-center justify-between font-bold text-emerald-950">
                <span>सिस्टम स्थिति</span>
                <span className="text-[10px] bg-emerald-200 px-1.5 py-0.5 rounded text-emerald-900">
                  सक्रिय व सुरक्षित
                </span>
              </div>
              <p className="text-emerald-800 text-[11px] leading-relaxed">
                स्कॉलर रजिस्टर, उपस्थिति, परीक्षा परिणाम एवं अलर्ट प्रणाली पूर्णतया कार्यरत है।
              </p>
            </div>
          </div>

          {/* Recent Activity Audit Stream Widget */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <History className="h-4 w-4 text-indigo-600" />
                हालिया कार्यकलाप एवं ऑडिट
              </h3>
              <button
                onClick={() => onNavigate('activity-logs')}
                className="text-xs text-indigo-600 font-bold hover:underline cursor-pointer"
              >
                सभी देखें →
              </button>
            </div>

            {recentActivities.length === 0 ? (
              <p className="text-xs text-slate-500 py-3 text-center">आज कोई नई गतिविधि दर्ज नहीं हुई है।</p>
            ) : (
              <div className="space-y-2.5">
                {recentActivities.map((act) => (
                  <div
                    key={act.id}
                    onClick={() => onNavigate('activity-logs')}
                    className="p-3 bg-slate-50 hover:bg-slate-100/80 border border-slate-200/70 rounded-xl transition-colors cursor-pointer text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between font-bold text-slate-800">
                      <span className="truncate pr-2">{act.userName}</span>
                      <span className="text-[10px] text-slate-400 font-normal shrink-0">
                        {act.createdAt ? new Date(act.createdAt).toLocaleTimeString('hi-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : ''}
                      </span>
                    </div>
                    <p className="text-slate-600 text-[11px] line-clamp-1">
                      {act.description}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
