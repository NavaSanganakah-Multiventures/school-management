'use client';

import React, { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, Clock, Check, Sparkles, CalendarCheck } from 'lucide-react';

interface AttendanceScreenProps {
  onOpenFcmModal: () => void;
}

export function AttendanceScreen({ onOpenFcmModal }: AttendanceScreenProps) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedClass, setSelectedClass] = useState('Class 10');
  const [records, setRecords] = useState<any[]>([]);
  const [stats, setStats] = useState({ total: 0, present: 0, absent: 0, leave: 0, rate: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/attendance?date=${date}&class=${selectedClass}`);
        const data = await res.json();
        if (isMounted && data.success) {
          setRecords(data.records);
          setStats(data.stats);
        }
      } catch {
        //
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    load();
    return () => {
      isMounted = false;
    };
  }, [date, selectedClass]);

  const updateStatus = async (studentId: string, newStatus: 'Present' | 'Absent' | 'Leave') => {
    // optimistic update
    setRecords((prev) =>
      prev.map((r) => (r.studentId === studentId ? { ...r, status: newStatus } : r))
    );

    try {
      await fetch('/api/attendance/mark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, status: newStatus, date }),
      });
    } catch {
      //
    }
  };

  const markAllPresent = async () => {
    setSaving(true);
    try {
      await fetch('/api/attendance/mark-all-present', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, className: selectedClass }),
      });
      setRecords((prev) => prev.map((r) => ({ ...r, status: 'Present' })));
      setStats((prev) => ({
        ...prev,
        present: prev.total,
        absent: 0,
        leave: 0,
        rate: 100,
      }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 pb-12">
      {/* Header Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800">दैनिक उपस्थिति रजिस्टर (Smart Attendance)</h2>
          <p className="text-xs text-slate-500">कक्षा अनुसार रोल कॉल और अनुपस्थिति अलर्ट</p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-800"
          />
          <button
            onClick={markAllPresent}
            disabled={saving}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl shadow-xs transition-all active:scale-95 disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" />
            सभी उपस्थित (All Present)
          </button>
        </div>
      </div>

      {/* Stats Ribbon */}
      <div className="grid grid-cols-4 gap-2 text-center">
        <div className="rounded-xl border border-slate-200 bg-white p-2.5">
          <span className="text-[10px] text-slate-500">कुल छात्र</span>
          <p className="text-base font-bold text-slate-800">{records.length}</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 text-emerald-800">
          <span className="text-[10px]">उपस्थित (Present)</span>
          <p className="text-base font-bold">{records.filter((r) => r.status === 'Present').length}</p>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-2.5 text-red-800">
          <span className="text-[10px]">अनुपस्थित (Absent)</span>
          <p className="text-base font-bold">{records.filter((r) => r.status === 'Absent').length}</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-amber-800">
          <span className="text-[10px]">अवकाश (Leave)</span>
          <p className="text-base font-bold">{records.filter((r) => r.status === 'Leave').length}</p>
        </div>
      </div>

      {/* Class Selector Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {['Class 8', 'Class 9', 'Class 10', 'Class 11', 'Class 12'].map((cls) => (
          <button
            key={cls}
            onClick={() => setSelectedClass(cls)}
            className={`px-3 py-1 text-xs font-medium rounded-full transition-all shrink-0 ${
              selectedClass === cls
                ? 'bg-blue-900 text-white'
                : 'bg-white border border-slate-200 text-slate-600'
            }`}
          >
            {cls}
          </button>
        ))}
      </div>

      {/* Roll Call Students List */}
      <div className="space-y-2">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">हाजिरी लोड हो रही है...</div>
        ) : records.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-xs">
            <CalendarCheck className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-700">{selectedClass} में अभी कोई छात्र नामांकित नहीं है</p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              दैनिक उपस्थिति दर्ज करने के लिए पहले स्कॉलर रजिस्टर में विद्यार्थियों का प्रवेश दर्ज करें।
            </p>
          </div>
        ) : (
          records.map((rec) => (
            <div
              key={rec.id}
              className="flex items-center justify-between p-3 rounded-2xl border border-slate-200 bg-white shadow-2xs hover:shadow-xs transition-all"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-xl text-xs font-bold ${
                    rec.status === 'Present'
                      ? 'bg-emerald-100 text-emerald-800'
                      : rec.status === 'Absent'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {rec.status === 'Present' ? 'P' : rec.status === 'Absent' ? 'A' : 'L'}
                </div>
                <div>
                  <h4 className="font-semibold text-xs text-slate-800">{rec.studentName}</h4>
                  <p className="text-[11px] text-slate-500">{rec.className}</p>
                </div>
              </div>

              {/* Status Toggle Buttons (Material 3 Segmented Control) */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                <button
                  onClick={() => updateStatus(rec.studentId, 'Present')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-all ${
                    rec.status === 'Present'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  उपस्थित
                </button>
                <button
                  onClick={() => updateStatus(rec.studentId, 'Absent')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-all ${
                    rec.status === 'Absent'
                      ? 'bg-red-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  अनुपस्थित
                </button>
                <button
                  onClick={() => updateStatus(rec.studentId, 'Leave')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-all ${
                    rec.status === 'Leave'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  अवकाश
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Absentee Alert Trigger */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 flex items-center justify-between gap-3">
        <div className="space-y-0.5">
          <h4 className="font-semibold text-xs text-amber-900">अनुपस्थित विद्यार्थी अभिभावक अलर्ट</h4>
          <p className="text-[11px] text-amber-700">
            आज अनुपस्थित रहने वाले विद्यार्थियों के अभिभावकों को तुरंत मोबाइल अलर्ट व एसएमएस भेजें।
          </p>
        </div>
        <button
          onClick={onOpenFcmModal}
          className="shrink-0 flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-xs"
        >
          <Sparkles className="h-3.5 w-3.5" />
          अभिभावक अलर्ट भेजें
        </button>
      </div>
    </div>
  );
}
