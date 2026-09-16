'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Check, Sparkles, CalendarCheck, AlertTriangle, ShieldCheck, CheckCircle2, Lock, Loader2 } from 'lucide-react';

interface AttendanceScreenProps {
  userRole: 'Director' | 'Principal' | 'Staff';
  currentUserId: string;
  onOpenFcmModal: () => void;
}

export function AttendanceScreen({ userRole, currentUserId, onOpenFcmModal }: AttendanceScreenProps) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [availableClasses, setAvailableClasses] = useState<string[]>([]);
  const [assignedClasses, setAssignedClasses] = useState<string[]>([]);
  const [records, setRecords] = useState<any[]>([]);
  const [stats, setStats] = useState({ total: 0, present: 0, absent: 0, leave: 0, rate: 0 });
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isAdmin = userRole === 'Director' || userRole === 'Principal';

  // 1. Load classes and teacher permissions
  useEffect(() => {
    let active = true;
    const fetchClasses = async () => {
      setLoadingClasses(true);
      try {
        const res = await fetch('/api/classes/my-classes');
        const data = await res.json();
        if (active && data.success) {
          const classes: string[] = data.classes || [];
          const assigned: string[] = data.assignedClasses || [];
          setAvailableClasses(classes);
          setAssignedClasses(assigned);

          // Default selected class:
          if (classes.length > 0) {
            // Prioritize assigned class if available, else first class
            const defaultClass = assigned.length > 0 ? assigned[0] : classes[0];
            setSelectedClass(defaultClass);
          }
        }
      } catch {
        if (active) setErrorMessage('कक्षाओं की सूची लोड करने में त्रुटि हुई।');
      } finally {
        if (active) setLoadingClasses(false);
      }
    };

    fetchClasses();
    return () => { active = false; };
  }, [currentUserId]);

  // 2. Load attendance records whenever date or selectedClass changes
  const loadAttendance = useCallback(async (targetDate: string, targetClass: string) => {
    if (!targetClass) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/attendance?date=${encodeURIComponent(targetDate)}&class=${encodeURIComponent(targetClass)}`);
      const data = await res.json();
      if (data.success) {
        setRecords(data.records || []);
        setStats(data.stats || { total: 0, present: 0, absent: 0, leave: 0, rate: 0 });
        if (data.message) {
          // Non-blocking informational message
          setErrorMessage(data.message);
        }
      } else {
        setErrorMessage(data.message || 'उपस्थिति डेटा लोड करने में त्रुटि हुई।');
      }
    } catch {
      setErrorMessage('सर्वर से संपर्क करने में असमर्थ।');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedClass) {
      loadAttendance(date, selectedClass);
    }
  }, [date, selectedClass, loadAttendance]);

  // Permission check: Can current user mark attendance for the selected class?
  const canMark = isAdmin || (assignedClasses.length > 0 && assignedClasses.includes(selectedClass));
  const isClassTeacher = assignedClasses.length > 0;

  const updateStatus = async (studentId: string, newStatus: 'Present' | 'Absent' | 'Leave') => {
    if (!canMark) {
      setErrorMessage('अनुमति अस्वीकृत: आप इस कक्षा के कक्षा अध्यापक नहीं हैं। केवल पठन अधिकार उपलब्ध है।');
      return;
    }

    setErrorMessage(null);
    setRecords((prev) => prev.map((r) => (r.studentId === studentId ? { ...r, status: newStatus } : r)));

    try {
      const res = await fetch('/api/attendance/mark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, status: newStatus, date }),
      });
      const data = await res.json();
      if (!data.success) {
        setErrorMessage(data.message || 'उपस्थिति अद्यतन असफल रहा।');
        // Reload to revert optimistic update on failure
        loadAttendance(date, selectedClass);
      }
    } catch {
      setErrorMessage('नेटवर्क त्रुटि: उपस्थिति सहेजी नहीं जा सकी।');
      loadAttendance(date, selectedClass);
    }
  };

  const markAllPresent = async () => {
    if (!canMark) {
      setErrorMessage('अनुमति अस्वीकृत: आप इस कक्षा के कक्षा अध्यापक नहीं हैं।');
      return;
    }

    setSaving(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/attendance/mark-all-present', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, className: selectedClass }),
      });
      const data = await res.json();
      if (data.success) {
        setRecords((prev) => prev.map((r) => ({ ...r, status: 'Present' })));
        setStats((prev) => ({ ...prev, present: prev.total, absent: 0, leave: 0, rate: 100 }));
      } else {
        setErrorMessage(data.message || 'सभी को उपस्थित करने में त्रुटि हुई।');
      }
    } catch {
      setErrorMessage('नेटवर्क त्रुटि।');
    } finally {
      setSaving(false);
    }
  };

  if (loadingClasses) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-slate-500 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-blue-800" />
        <p className="text-xs font-medium">कक्षाएं एवं अधिकार लोड हो रहे हैं...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-12">
      {/* Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">दैनिक छात्र उपस्थिति पंजिका (Daily Attendance)</h2>
          <p className="text-xs text-slate-500">कक्षा-वार हाजिरी रजिस्टर, अनुपस्थिति ट्रैकर व त्वरित अभिभावक अलर्ट</p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-800 shadow-2xs font-medium"
          />
          <button
            onClick={markAllPresent}
            disabled={saving || !canMark}
            title={canMark ? 'कक्षा के सभी छात्रों को उपस्थित दर्ज करें' : 'केवल अधिकृत कक्षा अध्यापक या प्रधानाचार्य द्वारा देय'}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 disabled:text-slate-500 rounded-xl shadow-xs transition-all active:scale-95 disabled:cursor-not-allowed cursor-pointer"
          >
            {canMark ? <Check className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
            <span>सभी को उपस्थित करें</span>
          </button>
        </div>
      </div>

      {/* Role & Permission Status Banner */}
      {isAdmin ? (
        <div className="flex items-center gap-2.5 p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-900 shadow-2xs">
          <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
          <div>
            <strong>प्रशासकीय अधिकार (Admin Access):</strong> आप प्रधानाचार्य/निदेशक के रूप में स्कूल की <strong>समस्त कक्षाओं</strong> की उपस्थिति दर्ज व संशोधित करने हेतु अधिकृत हैं।
          </div>
        </div>
      ) : isClassTeacher && assignedClasses.includes(selectedClass) ? (
        <div className="flex items-center gap-2.5 p-3 bg-blue-50 border border-blue-200 rounded-2xl text-xs text-blue-900 shadow-2xs">
          <CheckCircle2 className="h-4 w-4 text-blue-600 shrink-0" />
          <div>
            <strong>अधिकृत कक्षा अध्यापक:</strong> आप <strong>{selectedClass}</strong> के कक्षा अध्यापक हैं और इसकी दैनिक उपस्थिति दर्ज करने हेतु अधिकृत हैं।
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2.5 p-3.5 bg-amber-50 border border-amber-300 rounded-2xl text-xs text-amber-950 shadow-2xs">
          <Lock className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <div className="font-bold text-amber-900 flex items-center gap-1.5">
              <span>केवल पठन अधिकार (Read-Only Mode)</span>
              <span className="px-1.5 py-0.5 bg-amber-200/80 rounded-md text-[10px] font-semibold text-amber-900">गैर-कक्षा अध्यापक</span>
            </div>
            <p className="text-[11px] text-amber-800 leading-relaxed">
              {isClassTeacher
                ? `आप इस कक्षा (${selectedClass}) के कक्षा अध्यापक नहीं हैं। आपकी आवंटित कक्षाएं: ${assignedClasses.join(', ')}। उपस्थिति केवल कक्षा अध्यापक, प्रधानाचार्य या निदेशक ही दर्ज कर सकते हैं।`
                : 'आप वर्तमान में किसी भी कक्षा के कक्षा अध्यापक नहीं हैं। उपस्थिति दर्ज करने का अधिकार केवल अधिकृत कक्षा अध्यापक, प्रधानाचार्य या निदेशक के पास है।'}
            </p>
          </div>
        </div>
      )}

      {/* Warning/Error Banner */}
      {errorMessage && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-700 flex items-center gap-2 shadow-2xs">
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-4 gap-2 text-center">
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-2xs">
          <span className="text-[11px] text-slate-500 font-medium">कुल नामांकित</span>
          <p className="text-lg font-black text-slate-900 mt-0.5">{records.length}</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3 text-emerald-900 shadow-2xs">
          <span className="text-[11px] font-semibold text-emerald-700">उपस्थित (Present)</span>
          <p className="text-lg font-black text-emerald-800 mt-0.5">{records.filter((r) => r.status === 'Present').length}</p>
        </div>
        <div className="rounded-2xl border border-red-200 bg-red-50/70 p-3 text-red-900 shadow-2xs">
          <span className="text-[11px] font-semibold text-red-700">अनुपस्थित (Absent)</span>
          <p className="text-lg font-black text-red-800 mt-0.5">{records.filter((r) => r.status === 'Absent').length}</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3 text-amber-900 shadow-2xs">
          <span className="text-[11px] font-semibold text-amber-700">अवकाश (Leave)</span>
          <p className="text-lg font-black text-amber-800 mt-0.5">{records.filter((r) => r.status === 'Leave').length}</p>
        </div>
      </div>

      {/* Class Selection Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
        {availableClasses.map((cls) => {
          const isSelected = selectedClass === cls;
          const isAssignedToThis = assignedClasses.includes(cls);
          return (
            <button
              key={cls}
              onClick={() => setSelectedClass(cls)}
              className={
                'flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-full transition-all shrink-0 cursor-pointer ' +
                (isSelected
                  ? 'bg-blue-900 text-white shadow-xs'
                  : isAssignedToThis
                  ? 'bg-blue-50 border border-blue-300 text-blue-900 hover:bg-blue-100'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50')
              }
            >
              <span>{cls}</span>
              {isAssignedToThis && (
                <span className={`text-[10px] px-1 py-0.2 rounded-full font-bold ${isSelected ? 'bg-white/20 text-white' : 'bg-blue-200 text-blue-900'}`}>
                  मेरी कक्षा
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Student Attendance List */}
      <div className="space-y-2">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-12 text-slate-500 bg-white rounded-2xl border border-slate-200 shadow-2xs gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-blue-800" />
            <span className="text-xs">उपस्थिति रजिस्टर लोड हो रहा है...</span>
          </div>
        ) : records.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-2xs">
            <CalendarCheck className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-800">{selectedClass} में कोई छात्र नामांकित नहीं है</p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              उपस्थिति दर्ज करने के लिए कृपया पहले स्कॉलर रजिस्टर में छात्र का प्रवेश दर्ज करें।
            </p>
          </div>
        ) : (
          records.map((rec) => (
            <div
              key={rec.id}
              className="flex items-center justify-between p-3.5 rounded-2xl border border-slate-200 bg-white shadow-2xs hover:shadow-xs transition-all"
            >
              <div className="flex items-center gap-3">
                <div
                  className={
                    'flex h-10 w-10 items-center justify-center rounded-xl text-xs font-black shrink-0 ' +
                    (rec.status === 'Present'
                      ? 'bg-emerald-100 text-emerald-800'
                      : rec.status === 'Absent'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-amber-100 text-amber-800')
                  }
                >
                  {rec.status === 'Present' ? 'P' : rec.status === 'Absent' ? 'A' : 'L'}
                </div>
                <div>
                  <h4 className="font-bold text-xs text-slate-900">{rec.studentName}</h4>
                  <p className="text-[11px] text-slate-500">
                    {rec.className} • स्कॉलर क्र.: {rec.scholarNumber || '—'}
                  </p>
                </div>
              </div>

              {/* Attendance Status Action Buttons */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                <button
                  onClick={() => updateStatus(rec.studentId, 'Present')}
                  disabled={!canMark}
                  title={canMark ? 'उपस्थित (Present) मार्क करें' : 'उपस्थिति दर्ज करने का अधिकार केवल कक्षा अध्यापक को है'}
                  className={
                    'px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ' +
                    (rec.status === 'Present'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : canMark
                      ? 'text-slate-600 hover:text-slate-900 cursor-pointer'
                      : 'text-slate-400 opacity-60 cursor-not-allowed')
                  }
                >
                  P (उपस्थित)
                </button>
                <button
                  onClick={() => updateStatus(rec.studentId, 'Absent')}
                  disabled={!canMark}
                  title={canMark ? 'अनुपस्थित (Absent) मार्क करें' : 'उपस्थिति दर्ज करने का अधिकार केवल कक्षा अध्यापक को है'}
                  className={
                    'px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ' +
                    (rec.status === 'Absent'
                      ? 'bg-red-600 text-white shadow-xs'
                      : canMark
                      ? 'text-slate-600 hover:text-slate-900 cursor-pointer'
                      : 'text-slate-400 opacity-60 cursor-not-allowed')
                  }
                >
                  A (अनुपस्थित)
                </button>
                <button
                  onClick={() => updateStatus(rec.studentId, 'Leave')}
                  disabled={!canMark}
                  title={canMark ? 'अवकाश (Leave) मार्क करें' : 'उपस्थिति दर्ज करने का अधिकार केवल कक्षा अध्यापक को है'}
                  className={
                    'px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ' +
                    (rec.status === 'Leave'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : canMark
                      ? 'text-slate-600 hover:text-slate-900 cursor-pointer'
                      : 'text-slate-400 opacity-60 cursor-not-allowed')
                  }
                >
                  L (अवकाश)
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Absentee Alert Box */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 flex items-center justify-between gap-3 shadow-2xs">
        <div className="space-y-0.5">
          <h4 className="font-bold text-xs text-amber-950">अनुपस्थित छात्र अभिभावक सूचना अलर्ट</h4>
          <p className="text-[11px] text-amber-800">
            आज अनुपस्थित छात्रों के अभिभावकों के पंजीकृत मोबाइल पर त्वरित पुश अलर्ट व SMS भेजें।
          </p>
        </div>
        <button
          onClick={onOpenFcmModal}
          className="shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-xs transition-colors cursor-pointer"
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span>अभिभावक अलर्ट भेजें</span>
        </button>
      </div>
    </div>
  );
}