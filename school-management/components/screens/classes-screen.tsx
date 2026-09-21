'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Building2, X, AlertTriangle, Loader2 } from 'lucide-react';

interface ClassesScreenProps {
  userRole: 'Director' | 'Principal' | 'Staff';
}

interface ClassAssignment {
  className: string;
  classTeacherUserId: string | null;
  classTeacherName: string | null;
  classTeacherEmail: string | null;
}

interface StaffOption {
  id: string;
  name: string;
  designation: string;
  email: string;
}

export function ClassesScreen({ userRole }: ClassesScreenProps) {
  const [classes, setClasses] = useState<ClassAssignment[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingMap, setSavingMap] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canManage = userRole === 'Director' || userRole === 'Principal';

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cRes, sRes] = await Promise.all([
        fetch('/api/classes').then(r => r.json()),
        fetch('/api/staff').then(r => r.json()),
      ]);
      if (cRes.success) setClasses(cRes.classes || []);
      if (sRes.success) setStaff((sRes.staff || []).map((s: any) => ({ id: s.loginUserId || s.id, name: s.name, designation: s.designation, email: s.email })));
    } catch {
      setError('Data load failed.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const assignTeacher = async (className: string, teacherUserId: string) => {
    setSavingMap(prev => ({ ...prev, [className]: true }));
    setMessage(null);
    setError(null);
    try {
      const res = await fetch('/api/classes/assign-teacher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ className, teacherUserId }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage(data.message);
        setClasses(prev => prev.map(c => c.className === className ? { ...c, classTeacherUserId: data.teacherUserId, classTeacherName: data.teacherName, classTeacherEmail: staff.find(s => s.id === data.teacherUserId)?.email || null } : c));
      } else {
        setError(data.message || 'Assignment failed.');
      }
    } catch {
      setError('Network error.');
    } finally {
      setSavingMap(prev => ({ ...prev, [className]: false }));
    }
  };

  const removeTeacher = async (className: string) => {
    if (!confirm('Remove class teacher from ' + className + '?')) return;
    setSavingMap(prev => ({ ...prev, [className]: true }));
    try {
      const res = await fetch('/api/classes/remove-teacher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ className }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage(data.message);
        setClasses(prev => prev.map(c => c.className === className ? { ...c, classTeacherUserId: null, classTeacherName: null, classTeacherEmail: null } : c));
      } else {
        setError(data.message || 'Remove failed.');
      }
    } catch {
      setError('Network error.');
    } finally {
      setSavingMap(prev => ({ ...prev, [className]: false }));
    }
  };

  if (!canManage) {
    return (
      <div className={'p-8 text-center bg-rose-50 rounded-2xl border border-rose-200 text-rose-800'}>
        <AlertTriangle className={'h-10 w-10 text-rose-600 mx-auto mb-3'} />
        <h3 className={'text-lg font-bold'}>Access Restricted</h3>
        <p className={'text-sm text-rose-700 mt-1 max-w-md mx-auto'}>
          Only Director and Principal can assign class teachers.
        </p>
      </div>
    );
  }

  return (
    <div className={'space-y-6'}>
      <div className={'flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs'}>
        <div>
          <div className={'flex items-center gap-2'}>
            <Building2 className={'h-6 w-6 text-indigo-600'} />
            <h1 className={'text-2xl font-black text-slate-900'}>Class Assignments</h1>
          </div>
          <p className={'text-xs text-slate-500 mt-1'}>
            Assign a class teacher for each class. Only the assigned teacher can mark attendance for that class.
          </p>
        </div>
      </div>

      {message && <div className={'p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700'}>{message}</div>}
      {error && <div className={'p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700'}>{error}</div>}

      {loading ? (
        <div className={'p-12 text-center text-xs text-slate-500 flex items-center justify-center gap-2'}><Loader2 className={'h-4 w-4 animate-spin'} /> Loading...</div>
      ) : (
        <div className={'bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden'}>
          <div className={'overflow-x-auto'}>
            <table className={'w-full text-left text-xs text-slate-600'}>
              <thead className={'bg-slate-50 uppercase font-bold border-b border-slate-200'}>
                <tr>
                  <th className={'px-4 py-3'}>Class</th>
                  <th className={'px-4 py-3'}>Class Teacher</th>
                  <th className={'px-4 py-3'}>Action</th>
                </tr>
              </thead>
              <tbody className={'divide-y divide-slate-100'}>
                {classes.map((cls) => (
                  <tr key={cls.className} className={'hover:bg-slate-50/80'}>
                    <td className={'px-4 py-3 font-bold text-slate-900'}>{cls.className}</td>
                    <td className={'px-4 py-3'}>
                      {cls.classTeacherName ? (
                        <div>
                          <div className={'font-semibold text-slate-800'}>{cls.classTeacherName}</div>
                          <div className={'text-[11px] text-slate-500'}>{cls.classTeacherEmail || ''}</div>
                        </div>
                      ) : (
                        <span className={'text-amber-600 text-[11px]'}>Not assigned</span>
                      )}
                    </td>
                    <td className={'px-4 py-3'}>
                      <div className={'flex items-center gap-2'}>
                        <select
                          value={cls.classTeacherUserId || ''}
                          onChange={(e) => e.target.value && assignTeacher(cls.className, e.target.value)}
                          disabled={savingMap[cls.className]}
                          className={'px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white max-w-48'}
                        >
                          <option value={''}>-- Select teacher --</option>
                          {staff.map((s) => (
                            <option key={s.id} value={s.id}>{s.name} ({s.designation})</option>
                          ))}
                        </select>
                        {cls.classTeacherUserId && (
                          <button
                            onClick={() => removeTeacher(cls.className)}
                            disabled={savingMap[cls.className]}
                            className={'p-1.5 border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-lg transition'}
                            title={'Remove'}
                          >
                            <X className={'h-3.5 w-3.5'} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}