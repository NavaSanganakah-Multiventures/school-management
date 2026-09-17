'use client';

import React, { useState, useEffect } from 'react';
import { X, GraduationCap, Award, Plus, Trash2, CheckCircle2, AlertCircle, Save } from 'lucide-react';

interface MarksEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  preselectedStudentId?: string;
  preselectedStudentName?: string;
}

interface SubjectMark {
  subject: string;
  maxMarks: number;
  marksObtained: number | '';
  remarks: string;
}

const DEFAULT_SUBJECTS: SubjectMark[] = [
  { subject: 'हिंदी (Hindi)', maxMarks: 100, marksObtained: '', remarks: '' },
  { subject: 'अंग्रेजी (English)', maxMarks: 100, marksObtained: '', remarks: '' },
  { subject: 'गणित (Mathematics)', maxMarks: 100, marksObtained: '', remarks: '' },
  { subject: 'विज्ञान (Science)', maxMarks: 100, marksObtained: '', remarks: '' },
  { subject: 'सामाजिक विज्ञान (Social Science)', maxMarks: 100, marksObtained: '', remarks: '' },
  { subject: 'संस्कृत / कंप्यूटर (Sanskrit/IT)', maxMarks: 100, marksObtained: '', remarks: '' },
];

function calcGrade(p: number) {
  if (p >= 90) return { grade: 'A+', label: 'उत्कृष्ट (Outstanding)' };
  if (p >= 75) return { grade: 'A', label: 'अति उत्तम (Very Good)' };
  if (p >= 60) return { grade: 'B+', label: 'उत्तम (Good)' };
  if (p >= 45) return { grade: 'B', label: 'संतोषजनक (Satisfactory)' };
  if (p >= 33) return { grade: 'C', label: 'उत्तीर्ण (Pass)' };
  return { grade: 'D', label: 'अनुत्तीर्ण (Needs Improvement)' };
}

export function MarksEntryModal({
  isOpen,
  onClose,
  onSuccess,
  preselectedStudentId,
  preselectedStudentName,
}: MarksEntryModalProps) {
  const [exams, setExams] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [selectedExamId, setSelectedExamId] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState(preselectedStudentId || '');
  const [subjects, setSubjects] = useState<SubjectMark[]>(DEFAULT_SUBJECTS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    setSuccessMsg('');

    // Fetch exams
    fetch('/api/exams')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.exams.length > 0) {
          setExams(data.exams);
          setSelectedExamId(data.exams[0].id);
        }
      })
      .catch(() => {});

    // Fetch students
    fetch('/api/students')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.students) {
          setStudents(data.students);
          if (!preselectedStudentId && data.students.length > 0) {
            setSelectedStudentId(data.students[0].id);
          }
        }
      })
      .catch(() => {});
  }, [isOpen, preselectedStudentId]);

  // Load existing marks when student or exam changes
  useEffect(() => {
    if (!selectedStudentId || !selectedExamId) return;
    fetch(`/api/exams/marks?studentId=${selectedStudentId}&examId=${selectedExamId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.marks && data.marks.length > 0) {
          setSubjects(
            data.marks.map((m: any) => ({
              subject: m.subject,
              maxMarks: Number(m.max_marks) || 100,
              marksObtained: Number(m.marks_obtained) || 0,
              remarks: m.remarks || '',
            }))
          );
        } else {
          setSubjects(DEFAULT_SUBJECTS);
        }
      })
      .catch(() => {});
  }, [selectedStudentId, selectedExamId]);

  if (!isOpen) return null;

  const handleMarkChange = (idx: number, field: keyof SubjectMark, val: any) => {
    setSubjects((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: val };
      return next;
    });
  };

  const handleAddSubject = () => {
    setSubjects((prev) => [
      ...prev,
      { subject: '', maxMarks: 100, marksObtained: '', remarks: '' },
    ]);
  };

  const handleRemoveSubject = (idx: number) => {
    setSubjects((prev) => prev.filter((_, i) => i !== idx));
  };

  // Computations
  const totalMax = subjects.reduce((sum, s) => sum + (Number(s.maxMarks) || 0), 0);
  const totalObtained = subjects.reduce((sum, s) => sum + (Number(s.marksObtained) || 0), 0);
  const percentage = totalMax > 0 ? +((totalObtained / totalMax) * 100).toFixed(1) : 0;
  const overallGrade = calcGrade(percentage);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExamId) {
      setError('कृपया परीक्षा का चयन करें।');
      return;
    }
    if (!selectedStudentId) {
      setError('कृपया छात्र का चयन करें।');
      return;
    }

    setSaving(true);
    setError('');
    setSuccessMsg('');

    try {
      const payload = {
        examId: selectedExamId,
        studentId: selectedStudentId,
        marks: subjects.filter((s) => s.subject.trim() !== '').map((s) => ({
          subject: s.subject.trim(),
          maxMarks: Number(s.maxMarks) || 100,
          marksObtained: Number(s.marksObtained) || 0,
          remarks: s.remarks,
        })),
      };

      const res = await fetch('/api/exams/marks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        setSuccessMsg(data.message || 'अंक सफलतापूर्वक सुरक्षित किए गए।');
        if (onSuccess) onSuccess();
        setTimeout(() => {
          onClose();
        }, 1200);
      } else {
        setError(data.message || 'अंक सुरक्षित करने में त्रुटि हुई।');
      }
    } catch (err: any) {
      setError('सर्वर से संपर्क करने में त्रुटि हुई।');
    } finally {
      setSaving(false);
    }
  };

  const currentStudent = students.find((s) => s.id === selectedStudentId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-900 to-indigo-900 p-5 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-xs border border-white/20">
              <GraduationCap className="h-6 w-6 text-amber-300" />
            </div>
            <div>
              <h2 className="text-base font-bold">विद्यार्थी परीक्षा अंक प्रविष्टि (Marks Entry)</h2>
              <p className="text-xs text-blue-200">विषयवार प्राप्तांक एवं ग्रेडिंग निर्धारण पोर्टल</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-col grow overflow-hidden">
          <div className="p-5 space-y-4 overflow-y-auto grow">
            {error && (
              <div className="flex items-center gap-2 rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {successMsg && (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-700">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* Exam & Student Selectors */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  परीक्षा का नाम (Examination) <span className="text-rose-500">*</span>
                </label>
                <select
                  value={selectedExamId}
                  onChange={(e) => setSelectedExamId(e.target.value)}
                  className="w-full text-xs rounded-lg border border-slate-300 bg-white p-2.5 focus:border-blue-500 focus:outline-hidden font-medium"
                >
                  {exams.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.name} ({ex.academicYear || '2026-27'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  विद्यार्थी का नाम (Student) <span className="text-rose-500">*</span>
                </label>
                {preselectedStudentId ? (
                  <div className="p-2.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800">
                    {preselectedStudentName || currentStudent?.fullName || 'चयनित छात्र'}
                  </div>
                ) : (
                  <select
                    value={selectedStudentId}
                    onChange={(e) => setSelectedStudentId(e.target.value)}
                    className="w-full text-xs rounded-lg border border-slate-300 bg-white p-2.5 focus:border-blue-500 focus:outline-hidden font-medium"
                  >
                    {students.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.fullName} ({st.className} - रोल: {st.rollNumber})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* Subject Marks Table */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">विषयवार प्राप्तांक विवरण</span>
                <button
                  type="button"
                  onClick={handleAddSubject}
                  className="flex items-center gap-1 text-[11px] font-bold text-blue-700 hover:text-blue-800 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200 transition-colors cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>नया विषय जोड़ें</span>
                </button>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs divide-y divide-slate-100">
                <div className="grid grid-cols-12 bg-slate-100/80 px-3 py-2 text-[11px] font-bold text-slate-600">
                  <div className="col-span-5">विषय (Subject)</div>
                  <div className="col-span-2 text-center">पूर्णांक (Max)</div>
                  <div className="col-span-2 text-center">प्राप्तांक (Obtained)</div>
                  <div className="col-span-2 text-center">ग्रेड (Grade)</div>
                  <div className="col-span-1 text-center">हटाएं</div>
                </div>

                {subjects.map((sub, idx) => {
                  const sObt = Number(sub.marksObtained) || 0;
                  const sMax = Number(sub.maxMarks) || 100;
                  const sPct = sMax > 0 ? (sObt / sMax) * 100 : 0;
                  const sGrade = sub.marksObtained !== '' ? calcGrade(sPct).grade : '—';

                  return (
                    <div key={idx} className="grid grid-cols-12 gap-2 px-3 py-2 items-center bg-white text-xs">
                      <div className="col-span-5">
                        <input
                          type="text"
                          value={sub.subject}
                          onChange={(e) => handleMarkChange(idx, 'subject', e.target.value)}
                          placeholder="उदा. गणित / विज्ञान"
                          className="w-full text-xs rounded border border-slate-200 px-2 py-1 focus:border-blue-500 focus:outline-hidden"
                        />
                      </div>
                      <div className="col-span-2">
                        <input
                          type="number"
                          value={sub.maxMarks}
                          onChange={(e) => handleMarkChange(idx, 'maxMarks', Number(e.target.value))}
                          className="w-full text-center text-xs rounded border border-slate-200 px-1 py-1 focus:border-blue-500 focus:outline-hidden font-mono"
                        />
                      </div>
                      <div className="col-span-2">
                        <input
                          type="number"
                          min="0"
                          max={sub.maxMarks}
                          value={sub.marksObtained}
                          onChange={(e) =>
                            handleMarkChange(
                              idx,
                              'marksObtained',
                              e.target.value === '' ? '' : Number(e.target.value)
                            )
                          }
                          placeholder="अंक"
                          className="w-full text-center text-xs rounded border border-blue-200 bg-blue-50/40 px-1 py-1 focus:border-blue-500 focus:outline-hidden font-bold font-mono text-blue-900"
                        />
                      </div>
                      <div className="col-span-2 text-center">
                        <span className="inline-block w-8 py-0.5 text-center font-bold text-[11px] rounded bg-slate-100 text-slate-800">
                          {sGrade}
                        </span>
                      </div>
                      <div className="col-span-1 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveSubject(idx)}
                          className="text-slate-400 hover:text-rose-600 p-1 transition-colors cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Live Summary Bar */}
            <div className="grid grid-cols-3 gap-2 bg-gradient-to-r from-slate-50 to-blue-50/50 p-3.5 rounded-xl border border-slate-200 text-xs">
              <div>
                <span className="text-slate-500 text-[11px]">कुल प्राप्तांक:</span>
                <p className="font-bold text-slate-900 text-sm">
                  {totalObtained} / {totalMax}
                </p>
              </div>
              <div className="text-center">
                <span className="text-slate-500 text-[11px]">प्रतिशत (Percentage):</span>
                <p className="font-bold text-blue-900 text-sm">{percentage}%</p>
              </div>
              <div className="text-right">
                <span className="text-slate-500 text-[11px]">समग्र परिणाम:</span>
                <p className={`font-bold text-xs ${percentage >= 33 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  ग्रेड {overallGrade.grade} ({percentage >= 33 ? 'PASS' : 'FAIL'})
                </p>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
            <span className="text-xs text-slate-500">विद्या सेतु परीक्षा मूल्यांकन मॉड्यूल</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                रद्द करें
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-blue-900 hover:bg-blue-800 rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                <span>{saving ? 'सुरक्षित हो रहा है...' : 'अंक सुरक्षित करें (Save Marks)'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
