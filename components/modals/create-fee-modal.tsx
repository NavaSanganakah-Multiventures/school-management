'use client';

import React, { useState, useEffect } from 'react';
import { X, IndianRupee, Users, User, Calendar, CheckCircle2, AlertCircle } from 'lucide-react';

interface CreateFeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const CLASSES = [
  'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5',
  'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10',
  'Class 11 (Science)', 'Class 11 (Commerce)', 'Class 12 (Science)', 'Class 12 (Commerce)'
];

const FEE_HEADS = [
  'मासिक शिक्षण शुल्क (Tuition Fee)',
  'परीक्षा शुल्क (Examination Fee)',
  'वाहन/बस शुल्क (Transport Fee)',
  'कंप्यूटर एवं प्रयोगशाला शुल्क (Lab Fee)',
  'वार्षिक प्रवेश/विकास शुल्क (Annual Fee)',
  'पुस्तकालय एवं खेलकूद शुल्क (Sports/Library Fee)',
];

export function CreateFeeModal({ isOpen, onClose, onSuccess }: CreateFeeModalProps) {
  const [mode, setMode] = useState<'single' | 'bulk'>('bulk');
  const [selectedClass, setSelectedClass] = useState('Class 10');
  const [students, setStudents] = useState<any[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [feeHead, setFeeHead] = useState(FEE_HEADS[0]);
  const [customTitle, setCustomTitle] = useState('');
  const [amount, setAmount] = useState('2500');
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 15);
    return d.toISOString().split('T')[0];
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    fetch(`/api/students?class=${selectedClass}&status=Active`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.students)) {
          setStudents(data.students);
          if (data.students.length > 0) {
            setSelectedStudentId(data.students[0].id);
          } else {
            setSelectedStudentId('');
          }
        }
      })
      .catch(() => {});
  }, [isOpen, selectedClass]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    const title = customTitle.trim() || feeHead;
    const numAmount = Number(amount);

    if (!numAmount || numAmount <= 0) {
      setError('कृपया मान्य फीस राशि दर्ज करें।');
      setLoading(false);
      return;
    }

    try {
      if (mode === 'bulk') {
        const res = await fetch('/api/fees/create-bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            className: selectedClass,
            title,
            totalAmount: numAmount,
            dueDate,
          }),
        });
        const data = await res.json();
        if (data.success) {
          setSuccessMsg(data.message || 'चालान सफलतापूर्वक जारी किए गए।');
          setTimeout(() => {
            onSuccess();
            onClose();
          }, 1200);
        } else {
          setError(data.message || 'चालान जारी करने में त्रुटि आई।');
        }
      } else {
        const st = students.find((s) => s.id === selectedStudentId);
        if (!st) {
          setError('कृपया छात्र का चयन करें।');
          setLoading(false);
          return;
        }

        const res = await fetch('/api/fees/create-invoice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            studentId: st.id,
            studentName: st.fullName,
            scholarNumber: st.scholarNumber,
            className: st.className,
            section: st.section,
            title,
            totalAmount: numAmount,
            dueDate,
          }),
        });
        const data = await res.json();
        if (data.success) {
          setSuccessMsg(data.message || 'चालान सफलतापूर्वक जारी किया गया।');
          setTimeout(() => {
            onSuccess();
            onClose();
          }, 1200);
        } else {
          setError(data.message || 'चालान जारी करने में त्रुटि आई।');
        }
      }
    } catch (err: any) {
      setError(err.message || 'सर्वर से कनेक्ट नहीं हो सका।');
    } finally {
      setLoading(false);
    }
  };

  const filteredStudents = students.filter(
    (s) =>
      s.fullName.toLowerCase().includes(studentSearch.toLowerCase()) ||
      (s.scholarNumber && s.scholarNumber.toLowerCase().includes(studentSearch.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-white/10 flex items-center justify-center border border-white/20">
              <IndianRupee className="h-5 w-5 text-amber-300" />
            </div>
            <div>
              <h3 className="font-bold text-base">नया फीस चालान जारी करें</h3>
              <p className="text-xs text-blue-200">सत्र 2026-27 शुल्क मांग पत्र (Demand Bill)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-white/10 text-white/80 hover:text-white transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Mode Switcher */}
          <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-2xl">
            <button
              type="button"
              onClick={() => setMode('bulk')}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition cursor-pointer ${
                mode === 'bulk' ? 'bg-white text-blue-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="h-4 w-4" />
              <span>पूरी कक्षा के लिए (Bulk)</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('single')}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition cursor-pointer ${
                mode === 'single' ? 'bg-white text-blue-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <User className="h-4 w-4" />
              <span>एकल छात्र के लिए</span>
            </button>
          </div>

          {/* Class Picker */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">कक्षा (Class)</label>
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-800"
            >
              {CLASSES.map((cls) => (
                <option key={cls} value={cls}>
                  {cls} ({students.length > 0 && selectedClass === cls ? `${students.length} छात्र` : 'चयन करें'})
                </option>
              ))}
            </select>
            {mode === 'bulk' && (
              <p className="text-[11px] text-slate-500 mt-1">
                👉 इस कक्षा के सभी <strong>{students.length} सक्रिय छात्रों</strong> के नाम से अलग-अलग चालान स्वतः सृजित होंगे।
              </p>
            )}
          </div>

          {/* Student Picker (Single Mode) */}
          {mode === 'single' && (
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700">छात्र चुनें (Select Student)</label>
              <input
                type="text"
                placeholder="नाम या स्कॉलर नं. से खोजें..."
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
              />
              <select
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-800"
              >
                {filteredStudents.length === 0 ? (
                  <option value="">कोई छात्र नहीं मिला</option>
                ) : (
                  filteredStudents.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.fullName} (SR: {st.scholarNumber || 'N/A'}) - {st.className} {st.section}
                    </option>
                  ))
                )}
              </select>
            </div>
          )}

          {/* Fee Head */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">फीस शीर्षक (Fee Head)</label>
            <select
              value={feeHead}
              onChange={(e) => setFeeHead(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-800"
            >
              {FEE_HEADS.map((head) => (
                <option key={head} value={head}>
                  {head}
                </option>
              ))}
            </select>
          </div>

          {/* Custom Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              अतिरिक्त विवरण / महीना (वैकल्पिक)
            </label>
            <input
              type="text"
              placeholder="उदा. माह अक्टूबर 2026 या द्वितीय सत्र"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
            />
          </div>

          {/* Amount & Due Date Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">फीस राशि (₹ Amount)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">₹</span>
                <input
                  type="number"
                  min="1"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full pl-7 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-800"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">देय तिथि (Due Date)</label>
              <div className="relative">
                <input
                  type="date"
                  required
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-800"
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
            >
              रद्द करें
            </button>
            <button
              type="submit"
              disabled={loading || (mode === 'bulk' && students.length === 0)}
              className="px-5 py-2.5 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-bold shadow-md transition disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
            >
              {loading ? (
                <span>चालान जारी हो रहे हैं...</span>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>
                    {mode === 'bulk' ? `${students.length} चालान जारी करें` : 'चालान जारी करें'}
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
