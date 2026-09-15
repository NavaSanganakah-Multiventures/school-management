'use client';

import React, { useState, useEffect } from 'react';
import { Check, Sparkles, CalendarCheck, AlertTriangle } from 'lucide-react';

interface AttendanceScreenProps {
  userRole: 'Director' | 'Principal' | 'Staff';
  currentUserId: string;
  onOpenFcmModal: () => void;
}

const ALL_CLASS_TABS = ['Class 8', 'Class 9', 'Class 10', 'Class 11', 'Class 12'];

export function AttendanceScreen({ userRole, currentUserId, onOpenFcmModal }: AttendanceScreenProps) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedClass, setSelectedClass] = useState('Class 10');
  const [records, setRecords] = useState<any[]>([]);
  const [stats, setStats] = useState({ total: 0, present: 0, absent: 0, leave: 0, rate: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [allowedClasses, setAllowedClasses] = useState<string[] | null>(null);

  const isAdmin = userRole === 'Director' || userRole === 'Principal';

  useEffect(() => {
    let active = true;
    const loadPermissions = async () => {
      try {
        const res = await fetch('/api/classes/my-classes');
        const data = await res.json();
        if (active && data.success) setAllowedClasses(data.classes || []);
        else if (active) setAllowedClasses([]);
      } catch {
        if (active) setAllowedClasses([]);
      }
    };
    loadPermissions();
    return () => { active = false; };
  }, [currentUserId]);

  useEffect(() => {
    if (allowedClasses === null) return;
    const tabs = isAdmin ? ALL_CLASS_TABS : allowedClasses.filter(c => ALL_CLASS_TABS.indexOf(c) !== -1);
    if (tabs.length > 0 && tabs.indexOf(selectedClass) === -1) {
      setSelectedClass(tabs[0]);
    }
  }, [allowedClasses, isAdmin, selectedClass]);

  useEffect(() => {
    if (allowedClasses === null) return;
    setLoading(true);
    setErrorMessage(null);
    let active = true;
    const load = async () => {
      try {
        const res = await fetch('/api/attendance?date=' + date + '&class=' + selectedClass);
        const data = await res.json();
        if (active && data.success) {
          setRecords(data.records || []);
          setStats(data.stats || { total: 0, present: 0, absent: 0, leave: 0, rate: 0 });
          if (data.message) setErrorMessage(data.message);
        }
      } catch {
        if (active) setErrorMessage('Failed to load attendance.');
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [date, selectedClass, allowedClasses]);

  const canMark = isAdmin || (allowedClasses !== null && allowedClasses.indexOf(selectedClass) !== -1);

  const updateStatus = async (studentId: string, newStatus: 'Present' | 'Absent' | 'Leave') => {
    setErrorMessage(null);
    setRecords((prev) => prev.map((r) => (r.studentId === studentId ? { ...r, status: newStatus } : r)));

    try {
      const res = await fetch('/api/attendance/mark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, status: newStatus, date }),
      });
      const data = await res.json();
      if (!data.success) setErrorMessage(data.message || 'Attendance update failed.');
    } catch {
      setErrorMessage('Network error.');
    }
  };

  const markAllPresent = async () => {
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
        setErrorMessage(data.message || 'Mark all present failed.');
      }
    } catch {
      setErrorMessage('Network error.');
    } finally {
      setSaving(false);
    }
  };

  const visibleTabs = isAdmin ? ALL_CLASS_TABS : allowedClasses?.filter(c => ALL_CLASS_TABS.indexOf(c) !== -1) || [];

  if (allowedClasses !== null && !isAdmin && visibleTabs.length === 0) {
    return (
      <div className={'p-12 text-center bg-amber-50 rounded-2xl border border-amber-200 text-amber-800'}>
        <CalendarCheck className={'h-10 w-10 text-amber-600 mx-auto mb-3'} />
        <h3 className={'text-sm font-bold text-slate-800'}>No class assigned</h3>
        <p className={'text-xs text-slate-600 mt-1 max-w-sm mx-auto'}>
          You are not assigned as class teacher for any class. Please contact the Principal or Director.
        </p>
      </div>
    );
  }

  return (
    <div className={'space-y-4 pb-12'}>
      <div className={'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'}>
        <div>
          <h2 className={'text-lg font-bold text-slate-800'}>Daily Attendance Register</h2>
          <p className={'text-xs text-slate-500'}>Class-wise roll call and absentee alerts</p>
        </div>

        <div className={'flex items-center gap-2'}>
          <input
            type={'date'}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={'px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-800'}
          />
          <button
            onClick={markAllPresent}
            disabled={saving || !canMark}
            className={'flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl shadow-xs transition-all active:scale-95 disabled:opacity-50 cursor-pointer'}
          >
            <Check className={'h-3.5 w-3.5'} />
            Mark all present
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className={'p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2'}>
          <AlertTriangle className={'h-4 w-4 shrink-0'} /> {errorMessage}
        </div>
      )}

      <div className={'grid grid-cols-4 gap-2 text-center'}>
        <div className={'rounded-xl border border-slate-200 bg-white p-2.5'}>
          <span className={'text-[10px] text-slate-500'}>Total</span>
          <p className={'text-base font-bold text-slate-800'}>{records.length}</p>
        </div>
        <div className={'rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 text-emerald-800'}>
          <span className={'text-[10px] font-semibold'}>Present</span>
          <p className={'text-base font-bold'}>{records.filter((r) => r.status === 'Present').length}</p>
        </div>
        <div className={'rounded-xl border border-red-200 bg-red-50 p-2.5 text-red-800'}>
          <span className={'text-[10px] font-semibold'}>Absent</span>
          <p className={'text-base font-bold'}>{records.filter((r) => r.status === 'Absent').length}</p>
        </div>
        <div className={'rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-amber-800'}>
          <span className={'text-[10px] font-semibold'}>Leave</span>
          <p className={'text-base font-bold'}>{records.filter((r) => r.status === 'Leave').length}</p>
        </div>
      </div>

      <div className={'flex items-center gap-2 overflow-x-auto pb-1'}>
        {visibleTabs.map((cls) => (
          <button
            key={cls}
            onClick={() => setSelectedClass(cls)}
            className={'px-3 py-1 text-xs font-medium rounded-full transition-all shrink-0 ' + (selectedClass === cls ? 'bg-blue-900 text-white' : 'bg-white border border-slate-200 text-slate-600')}
          >
            {cls}
          </button>
        ))}
      </div>

      <div className={'space-y-2'}>
        {loading ? (
          <div className={'p-8 text-center text-xs text-slate-500'}>Loading data...</div>
        ) : records.length === 0 ? (
          <div className={'p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-xs'}>
            <CalendarCheck className={'h-10 w-10 text-slate-300 mx-auto mb-3'} />
            <p className={'text-sm font-bold text-slate-700'}>No students enrolled in {selectedClass}</p>
            <p className={'text-xs text-slate-500 mt-1 max-w-sm mx-auto'}>
              Please register students first to mark attendance.
            </p>
          </div>
        ) : (
          records.map((rec) => (
            <div
              key={rec.id}
              className={'flex items-center justify-between p-3 rounded-2xl border border-slate-200 bg-white shadow-2xs hover:shadow-xs transition-all'}
            >
              <div className={'flex items-center gap-3'}>
                <div
                  className={'flex h-9 w-9 items-center justify-center rounded-xl text-xs font-bold ' + (rec.status === 'Present' ? 'bg-emerald-100 text-emerald-800' : rec.status === 'Absent' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800')}
                >
                  {rec.status === 'Present' ? 'P' : rec.status === 'Absent' ? 'A' : 'L'}
                </div>
                <div>
                  <h4 className={'font-semibold text-xs text-slate-800'}>{rec.studentName}</h4>
                  <p className={'text-[11px] text-slate-500'}>{rec.className}</p>
                </div>
              </div>

              <div className={'flex items-center gap-1 bg-slate-100 p-1 rounded-xl'}>
                <button
                  onClick={() => updateStatus(rec.studentId, 'Present')}
                  disabled={!canMark}
                  className={'px-2.5 py-1 text-xs font-medium rounded-lg transition-all ' + (rec.status === 'Present' ? 'bg-emerald-600 text-white shadow-xs' : canMark ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 cursor-not-allowed')}
                >
                  Present
                </button>
                <button
                  onClick={() => updateStatus(rec.studentId, 'Absent')}
                  disabled={!canMark}
                  className={'px-2.5 py-1 text-xs font-medium rounded-lg transition-all ' + (rec.status === 'Absent' ? 'bg-red-600 text-white shadow-xs' : canMark ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 cursor-not-allowed')}
                >
                  Absent
                </button>
                <button
                  onClick={() => updateStatus(rec.studentId, 'Leave')}
                  disabled={!canMark}
                  className={'px-2.5 py-1 text-xs font-medium rounded-lg transition-all ' + (rec.status === 'Leave' ? 'bg-amber-600 text-white shadow-xs' : canMark ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 cursor-not-allowed')}
                >
                  Leave
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className={'rounded-2xl border border-amber-200 bg-amber-50/70 p-4 flex items-center justify-between gap-3'}>
        <div className={'space-y-0.5'}>
          <h4 className={'font-semibold text-xs text-amber-900'}>Absentee Parent Alert</h4>
          <p className={'text-[11px] text-amber-700'}>
            Send instant mobile alerts to parents of absent students.
          </p>
        </div>
        <button
          onClick={onOpenFcmModal}
          className={'shrink-0 flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-xs'}
        >
          <Sparkles className={'h-3.5 w-3.5'} />
          Send parent alert
        </button>
      </div>
    </div>
  );
}