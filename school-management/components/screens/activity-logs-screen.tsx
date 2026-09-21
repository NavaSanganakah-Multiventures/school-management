'use client';

import React, { useState, useEffect } from 'react';
import {
  History,
  Search,
  Filter,
  Calendar,
  User,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
  UserCheck,
  CalendarCheck,
  Award,
  Bell,
  Building2,
  RefreshCw,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';

interface ActivityLogsScreenProps {
  userRole: 'Director' | 'Principal' | 'Staff' | 'SuperAdmin';
  currentUser?: any;
}

export function ActivityLogsScreen({ userRole, currentUser }: ActivityLogsScreenProps) {
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [selectedAction, setSelectedAction] = useState('All');
  const [selectedClass, setSelectedClass] = useState('All');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTeacher, setSelectedTeacher] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Staff list for filter (for Principal/Director)
  const [staffList, setStaffList] = useState<any[]>([]);
  const [summaryStats, setSummaryStats] = useState<{ todayTotal: number; byAction: Record<string, number> }>({
    todayTotal: 0,
    byAction: {},
  });

  const isPrincipal = userRole === 'Principal';
  const isDirector = userRole === 'Director' || userRole === 'SuperAdmin';
  const isStaff = userRole === 'Staff';

  const title = isStaff
    ? 'मेरी कार्यकलाप हिस्ट्री (My Activity History)'
    : isPrincipal
    ? 'स्टाफ कार्यकलाप व स्कूल ऑडिट लॉग (Staff Activity & School Audit Log)'
    : 'समस्त स्कूल कार्यकलाप ऑडिट (Comprehensive School Audit Log)';

  const subtitle = isStaff
    ? 'आपके द्वारा दर्ज की गई उपस्थिति, छात्र प्रवेश, परीक्षा अंक व अन्य प्रशासनिक कार्यकलापों का समयबद्ध इतिहास।'
    : isPrincipal
    ? 'विद्यालय के समस्त शिक्षकों व स्टाफ द्वारा संपन्न दैनिक उपस्थिति, दाखिला, टी.सी., एवं परीक्षा गतिविधियों का रियल-टाइम ऑडिट।'
    : 'विद्यालय के निदेशक मंडल हेतु समस्त प्रशासनिक, शैक्षणिक एवं वित्तीय गतिविधियों का संपूर्ण पारदर्शी टाइमस्टैम्प ऑडिट ट्रेल।';

  // Load teachers list for filtering if admin
  useEffect(() => {
    if (!isStaff) {
      fetch('/api/staff')
        .then((r) => r.json())
        .then((data) => {
          if (data.success && Array.isArray(data.staff)) {
            setStaffList(data.staff);
          }
        })
        .catch(() => {});
    }

    fetch('/api/activity-logs/summary')
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setSummaryStats({
            todayTotal: data.todayTotal || 0,
            byAction: data.byAction || {},
          });
        }
      })
      .catch(() => {});
  }, [isStaff]);

  const loadLogs = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const params = new URLSearchParams();
      if (selectedAction !== 'All') params.set('actionType', selectedAction);
      if (selectedClass !== 'All') params.set('class', selectedClass);
      if (selectedDate) params.set('date', selectedDate);
      if (selectedTeacher !== 'All') params.set('userId', selectedTeacher);
      if (searchQuery) params.set('q', searchQuery);
      params.set('limit', '100');

      const res = await fetch(`/api/activity-logs?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setLogs(data.logs || []);
        setTotal(data.total || 0);
      }
    } catch (_) {
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [selectedAction, selectedClass, selectedDate, selectedTeacher, searchQuery]);

  const classesList = [
    'All',
    'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5',
    'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10',
    'Class 11 (Science)', 'Class 11 (Commerce)', 'Class 12 (Science)', 'Class 12 (Commerce)',
  ];

  const actionCategories = [
    { id: 'All', label: 'सभी गतिविधियां' },
    { id: 'ATTENDANCE_MARK', label: 'उपस्थिति दर्ज' },
    { id: 'STUDENT_ADD', label: 'नवीन स्कॉलर प्रवेश' },
    { id: 'STUDENT_READMIT', label: 'पुनः प्रवेश (Re-Admission)' },
    { id: 'TC_ISSUE', label: 'टी.सी. निर्गमन' },
    { id: 'MARKS_ENTRY', label: 'अंक प्रविष्टि' },
    { id: 'NOTICE_PUBLISH', label: 'सूचना पट्ट' },
    { id: 'CLASS_TEACHER_ASSIGN', label: 'कक्षा अध्यापक नियुक्ति' },
  ];

  function formatTime(isoStr: string) {
    if (!isoStr) return '';
    try {
      const d = new Date(isoStr);
      return d.toLocaleTimeString('hi-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch (_) {
      return '';
    }
  }

  function formatDate(isoStr: string) {
    if (!isoStr) return '';
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString('hi-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch (_) {
      return isoStr.split('T')[0];
    }
  }

  function getActionBadge(actionType: string) {
    switch (actionType) {
      case 'STUDENT_ADD':
        return {
          bg: 'bg-blue-100 text-blue-800 border-blue-200',
          icon: UserCheck,
          label: 'नवीन प्रवेश',
        };
      case 'STUDENT_READMIT':
        return {
          bg: 'bg-emerald-100 text-emerald-800 border-emerald-300',
          icon: Sparkles,
          label: 'पुनः प्रवेश',
        };
      case 'TC_ISSUE':
        return {
          bg: 'bg-amber-100 text-amber-800 border-amber-300',
          icon: FileText,
          label: 'टी.सी. निर्गत',
        };
      case 'ATTENDANCE_MARK':
        return {
          bg: 'bg-indigo-100 text-indigo-800 border-indigo-200',
          icon: CalendarCheck,
          label: 'उपस्थिति दर्ज',
        };
      case 'MARKS_ENTRY':
        return {
          bg: 'bg-purple-100 text-purple-800 border-purple-200',
          icon: Award,
          label: 'परीक्षा अंक',
        };
      case 'NOTICE_PUBLISH':
        return {
          bg: 'bg-sky-100 text-sky-800 border-sky-200',
          icon: Bell,
          label: 'सूचना जारी',
        };
      case 'CLASS_TEACHER_ASSIGN':
      case 'CLASS_TEACHER_REMOVE':
        return {
          bg: 'bg-rose-100 text-rose-800 border-rose-200',
          icon: Building2,
          label: 'कक्षा आवंटन',
        };
      default:
        return {
          bg: 'bg-slate-100 text-slate-800 border-slate-200',
          icon: History,
          label: actionType,
        };
    }
  }

  function getRoleBadge(role: string) {
    if (role === 'Director') return 'bg-amber-100 text-amber-900 border-amber-300';
    if (role === 'Principal') return 'bg-indigo-100 text-indigo-900 border-indigo-300';
    if (role === 'SuperAdmin') return 'bg-rose-100 text-rose-900 border-rose-300';
    return 'bg-emerald-100 text-emerald-900 border-emerald-300';
  }

  return (
    <div className="space-y-6">
      {/* Header & Stats Banner */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-blue-600 text-white flex items-center justify-center shadow-md">
                <History className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-xl font-black text-slate-900">{title}</h1>
                <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => loadLogs(true)}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>ताज़ा करें (Refresh)</span>
            </button>
          </div>
        </div>

        {/* Quick Summary Counter Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-slate-100">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">आज कुल गतिविधियां</span>
            <p className="text-xl font-black text-slate-900 mt-1">{summaryStats.todayTotal} कार्य</p>
          </div>

          <div className="p-3 bg-blue-50/70 rounded-xl border border-blue-200/80">
            <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider">आज छात्र प्रवेश</span>
            <p className="text-xl font-black text-blue-900 mt-1">
              {(summaryStats.byAction['STUDENT_ADD'] || 0) + (summaryStats.byAction['STUDENT_READMIT'] || 0)} छात्र
            </p>
          </div>

          <div className="p-3 bg-indigo-50/70 rounded-xl border border-indigo-200/80">
            <span className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider">उपस्थिति सत्र</span>
            <p className="text-xl font-black text-indigo-900 mt-1">
              {summaryStats.byAction['ATTENDANCE_MARK'] || 0} सत्र
            </p>
          </div>

          <div className="p-3 bg-amber-50/70 rounded-xl border border-amber-200/80">
            <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">टी.सी. निर्गमन</span>
            <p className="text-xl font-black text-amber-900 mt-1">
              {summaryStats.byAction['TC_ISSUE'] || 0} टी.सी.
            </p>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-center gap-3">
          {/* Search Box */}
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="गतिविधि, शिक्षक का नाम, विवरण..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-xs font-medium rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 bg-slate-50"
            />
          </div>

          {/* Teacher selector (visible to Principal / Director) */}
          {!isStaff && (
            <div className="w-full md:w-56">
              <select
                value={selectedTeacher}
                onChange={(e) => setSelectedTeacher(e.target.value)}
                className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-slate-50 text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              >
                <option value="All">समस्त शिक्षक एवं स्टाफ</option>
                {staffList.map((st) => (
                  <option key={st.id} value={st.loginUserId || st.id}>
                    {st.name} ({st.designation || 'शिक्षक'})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Class Filter */}
          <div className="w-full md:w-44">
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-slate-50 text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            >
              {classesList.map((c) => (
                <option key={c} value={c}>
                  {c === 'All' ? 'सभी कक्षाएं' : c}
                </option>
              ))}
            </select>
          </div>

          {/* Date Picker */}
          <div className="flex items-center gap-2 w-full md:w-auto">
            <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full md:w-auto px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 bg-slate-50 text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />
            {selectedDate && (
              <button
                onClick={() => setSelectedDate('')}
                className="text-[11px] text-rose-600 font-bold hover:underline cursor-pointer"
              >
                साफ़ करें
              </button>
            )}
          </div>
        </div>

        {/* Action Category Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-1 pb-1">
          {actionCategories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedAction(cat.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                selectedAction === cat.id
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Activity Logs Stream */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between text-xs font-bold text-slate-700">
          <span>समयबद्ध कार्यकलाप ऑडिट सूची</span>
          <span>कुल रिकॉर्ड: {total}</span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-xs text-slate-500">ऑडिट लॉग लोड हो रहे हैं...</div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center">
            <History className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-slate-800">कोई गतिविधि रिकॉर्ड नहीं मिली</h3>
            <p className="text-xs text-slate-500 mt-1">चयनित तिथि व फ़िल्टर में कोई कार्यकलाप दर्ज नहीं हुआ है।</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {logs.map((log) => {
              const badge = getActionBadge(log.actionType);
              const Icon = badge.icon;
              const roleBadge = getRoleBadge(log.userRole);

              return (
                <div
                  key={log.id}
                  className="p-4 sm:p-5 hover:bg-slate-50/80 transition-colors flex flex-col sm:flex-row sm:items-start justify-between gap-4"
                >
                  <div className="flex items-start gap-3.5">
                    {/* Actor Initial Avatar */}
                    <div className="h-10 w-10 rounded-2xl bg-gradient-to-tr from-slate-800 to-slate-700 text-white font-black text-sm flex items-center justify-center shrink-0 shadow-xs">
                      {log.userName?.slice(0, 1) || 'अ'}
                    </div>

                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">{log.userName}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${roleBadge}`}>
                          {log.userRole === 'Staff' ? '👨‍🏫 शिक्षक/स्टाफ' : log.userRole === 'Principal' ? '🏛️ प्रधानाचार्य' : '👑 निदेशक'}
                        </span>
                        <span className={`flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[10px] font-black border ${badge.bg}`}>
                          <Icon className="h-3 w-3" />
                          <span>{log.actionTitle || badge.label}</span>
                        </span>
                        {log.className && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700">
                            कक्षा: {log.className}
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-700 leading-relaxed font-medium">
                        {log.description}
                      </p>

                      {log.metadata && (
                        <div className="text-[11px] text-slate-500 pt-1 flex flex-wrap gap-2">
                          {log.metadata.scholarNumber && (
                            <span className="font-mono bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                              SR: {log.metadata.scholarNumber}
                            </span>
                          )}
                          {log.metadata.intermediateSchool && (
                            <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded">
                              मध्यवर्ती स्कूल: {log.metadata.intermediateSchool}
                            </span>
                          )}
                          {log.metadata.tcNumber && (
                            <span className="bg-amber-50 text-amber-800 px-2 py-0.5 rounded">
                              TC No: {log.metadata.tcNumber}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Timestamp */}
                  <div className="text-right shrink-0 flex sm:flex-col items-center sm:items-end justify-between text-xs text-slate-500">
                    <div className="flex items-center gap-1 font-bold text-slate-700">
                      <Clock className="h-3.5 w-3.5 text-slate-400" />
                      <span>{formatTime(log.createdAt)}</span>
                    </div>
                    <span className="text-[11px] text-slate-400 mt-0.5">{formatDate(log.createdAt)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
