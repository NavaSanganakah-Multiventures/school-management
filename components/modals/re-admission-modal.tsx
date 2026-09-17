'use client';

import React, { useState } from 'react';
import { UserCheck, X, FileText, Calendar, Building2, AlertCircle, Sparkles, CheckCircle2 } from 'lucide-react';

interface ReAdmissionModalProps {
  isOpen: boolean;
  student: any | null;
  onClose: () => void;
  onSuccess: (updatedStudent: any) => void;
  assignedClasses?: string[];
  userRole?: 'Director' | 'Principal' | 'Staff';
}

export function ReAdmissionModal({
  isOpen,
  student,
  onClose,
  onSuccess,
  assignedClasses = [],
  userRole = 'Director',
}: ReAdmissionModalProps) {
  const [className, setClassName] = useState(student?.className || 'Class 11 (Science)');
  const [section, setSection] = useState(student?.section || 'A');
  const [rollNumber, setRollNumber] = useState(student?.rollNumber || '');
  const [readmissionDate, setReadmissionDate] = useState(new Date().toISOString().split('T')[0]);
  const [academicSession, setAcademicSession] = useState('2026-2027');
  const [intermediateSchool, setIntermediateSchool] = useState('');
  const [intermediateTcNo, setIntermediateTcNo] = useState('');
  const [remarks, setRemarks] = useState('अन्य विद्यालय में 1 वर्ष अध्ययनोपरांत पुनः प्रवेश (Re-Admission)');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  if (!isOpen || !student) return null;

  const allClassesList = [
    'Nursery', 'LKG', 'UKG',
    'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5',
    'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10',
    'Class 11 (Science)', 'Class 11 (Commerce)', 'Class 11 (Arts)',
    'Class 12 (Science)', 'Class 12 (Commerce)', 'Class 12 (Arts)'
  ];

  const availableClasses = (userRole === 'Staff' && assignedClasses.length > 0)
    ? assignedClasses
    : allClassesList;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!className) {
      setError('कृपया पुनः प्रवेश कक्षा चुनें।');
      return;
    }

    try {
      setLoading(true);
      setError('');
      setSuccessMsg('');

      const res = await fetch(`/api/students/${student.id}/readmit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          className,
          section,
          rollNumber,
          readmissionDate,
          academicSession,
          intermediateSchool,
          intermediateTcNo,
          remarks,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSuccessMsg(data.message || 'छात्र का पुनः प्रवेश सफलतापूर्वक दर्ज हुआ!');
        setTimeout(() => {
          onSuccess(data.student);
          onClose();
        }, 1200);
      } else {
        setError(data.message || 'पुनः प्रवेश दर्ज करने में त्रुटि आई।');
      }
    } catch {
      setError('सर्वर से संपर्क करने में समस्या आई।');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs overflow-y-auto">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] my-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-800 to-teal-900 px-6 py-4 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-emerald-500/30 border border-emerald-400/40 p-2 text-white shadow-inner">
              <UserCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                <span>छात्र पुनः प्रवेश (Student Re-Admission)</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-400 text-emerald-950 uppercase tracking-wider">
                  पूर्व छात्र
                </span>
              </h2>
              <p className="text-xs text-emerald-200 mt-0.5">
                {student.fullName} • मूल स्कॉलर सं.: <strong>{student.scholarNumber || student.rollNumber}</strong>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 hover:bg-white/10 text-emerald-200 hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Existing Student Past Context Box */}
        <div className="bg-amber-50/80 border-b border-amber-200/80 px-6 py-3 text-xs text-amber-900 flex items-start gap-2.5 shrink-0">
          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            यह विद्यार्थी पूर्व में <strong>{student.className} (वर्ग {student.section})</strong> में अध्ययनरत था तथा{' '}
            <strong>{student.tcIssueDate || 'सत्र 2025-26'}</strong> को टी.सी. लेकर गया था। पुनः प्रवेश के उपरांत मूल
            स्कॉलर क्रमांक सुरक्षित रहेगा एवं मध्यवर्ती अवधि का इतिहास टाइमलाइन में जुड़ेगा।
          </div>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-3 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs font-medium shrink-0 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mx-6 mt-4 p-3 bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold shrink-0 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto grow">
          {/* Re-Admission Academic Target */}
          <div>
            <div className="flex items-center gap-2 pb-1.5 border-b border-slate-200 mb-3 text-slate-900 font-bold text-xs uppercase tracking-wider">
              <Sparkles className="h-4 w-4 text-emerald-600" />
              <span>1. नवीन कक्षा व शैक्षणिक सत्र (New Class & Session)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  प्रवेश कक्षा <span className="text-rose-500">*</span>
                </label>
                <select
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-900 bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                >
                  {availableClasses.map((cls) => (
                    <option key={cls} value={cls}>
                      {cls}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">वर्ग (Section)</label>
                <select
                  value={section}
                  onChange={(e) => setSection(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-900 bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                >
                  {['A', 'B', 'C', 'D'].map((sec) => (
                    <option key={sec} value={sec}>
                      वर्ग {sec}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">नया रोल नंबर (New Roll No.)</label>
                <input
                  type="text"
                  value={rollNumber}
                  onChange={(e) => setRollNumber(e.target.value)}
                  placeholder="उदा. 24"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* Gap / Intermediate School Details */}
          <div>
            <div className="flex items-center gap-2 pb-1.5 border-b border-slate-200 mb-3 text-slate-900 font-bold text-xs uppercase tracking-wider">
              <Building2 className="h-4 w-4 text-emerald-600" />
              <span>2. मध्यवर्ती अंतराल विद्यालय विवरण (Gap Period School Details)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  अन्य विद्यालय का नाम (जहां छात्र गया था)
                </label>
                <input
                  type="text"
                  value={intermediateSchool}
                  onChange={(e) => setIntermediateSchool(e.target.value)}
                  placeholder="उदा. केंद्रीय विद्यालय क्रमांक 1, भोपाल"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
                <p className="text-[10px] text-slate-500 mt-1">छात्र ने अंतराल वर्ष में जिस विद्यालय में अध्ययन किया</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  उस विद्यालय का टी.सी. क्रमांक (Return TC No.)
                </label>
                <input
                  type="text"
                  value={intermediateTcNo}
                  onChange={(e) => setIntermediateTcNo(e.target.value)}
                  placeholder="उदा. KV/TC/2025/104"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
                <p className="text-[10px] text-slate-500 mt-1">अन्य विद्यालय द्वारा जारी वापसी टीसी क्रमांक</p>
              </div>
            </div>
          </div>

          {/* Re-Admission Dates & Remarks */}
          <div>
            <div className="flex items-center gap-2 pb-1.5 border-b border-slate-200 mb-3 text-slate-900 font-bold text-xs uppercase tracking-wider">
              <Calendar className="h-4 w-4 text-emerald-600" />
              <span>3. पुनः प्रवेश दिनांक एवं विवरण (Dates & Administrative Remarks)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">पुनः प्रवेश दिनांक (Date)</label>
                <input
                  type="date"
                  value={readmissionDate}
                  onChange={(e) => setReadmissionDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">शैक्षणिक सत्र (Session)</label>
                <input
                  type="text"
                  value={academicSession}
                  onChange={(e) => setAcademicSession(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">प्रशासनिक टिप्पणी / विशेष विवरण</label>
                <textarea
                  rows={2}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* Footer actions */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
            >
              रद्द करें
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md transition disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <span>प्रक्रिया जारी है...</span>
              ) : (
                <>
                  <UserCheck className="h-4 w-4" />
                  <span>पुनः प्रवेश पूर्ण करें (Confirm Re-Admission)</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
