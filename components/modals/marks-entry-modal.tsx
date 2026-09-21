'use client';

import React, { useState, useEffect } from 'react';
import { 
  X, GraduationCap, Award, Plus, Trash2, CheckCircle2, AlertCircle, Save, 
  AlertTriangle, Sparkles, Percent, Calculator, Target, Users 
} from 'lucide-react';

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
  subjectId?: string;
  passingMarks?: number;
}

interface ExamSubject {
  id: string;
  subject_name: string;
  max_marks: number;
  passing_marks: number;
  subject_type: string;
  is_optional: number;
}

const DEFAULT_SUBJECTS: SubjectMark[] = [
  { subject: 'हिंदी (Hindi)', maxMarks: 100, marksObtained: '', remarks: '', passingMarks: 33 },
  { subject: 'अंग्रेजी (English)', maxMarks: 100, marksObtained: '', remarks: '', passingMarks: 33 },
  { subject: 'गणित (Mathematics)', maxMarks: 100, marksObtained: '', remarks: '', passingMarks: 33 },
  { subject: 'विज्ञान (Science)', maxMarks: 100, marksObtained: '', remarks: '', passingMarks: 33 },
  { subject: 'सामाजिक विज्ञान (Social Science)', maxMarks: 100, marksObtained: '', remarks: '', passingMarks: 33 },
  { subject: 'संस्कृत / कंप्यूटर (Sanskrit/IT)', maxMarks: 100, marksObtained: '', remarks: '', passingMarks: 33 },
];

function calcGrade(p: number) {
  if (p >= 90) return { grade: 'A+', label: 'उत्कृष्ट (Outstanding)' };
  if (p >= 75) return { grade: 'A', label: 'अति उत्तम (Very Good)' };
  if (p >= 60) return { grade: 'B+', label: 'उत्तम (Good)' };
  if (p >= 45) return { grade: 'B', label: 'संतोषजनक (Satisfactory)' };
  if (p >= 33) return { grade: 'C', label: 'उत्तीर्ण (Pass)' };
  return { grade: 'D', label: 'अनुत्तीर्ण (Needs Improvement)' };
}

function getSubjectColor(percentage: number) {
  if (percentage >= 90) return 'bg-gradient-to-r from-purple-50 to-purple-100 border-purple-200';
  if (percentage >= 75) return 'bg-gradient-to-r from-blue-50 to-blue-100 border-blue-200';
  if (percentage >= 60) return 'bg-gradient-to-r from-emerald-50 to-emerald-100 border-emerald-200';
  if (percentage >= 33) return 'bg-gradient-to-r from-amber-50 to-amber-100 border-amber-200';
  return 'bg-gradient-to-r from-rose-50 to-rose-100 border-rose-200';
}

function getSubjectStatusColor(marks: number, max: number, passing: number = 33) {
  const percentage = max > 0 ? (marks / max) * 100 : 0;
  if (percentage >= 90) return 'text-purple-800 bg-purple-100';
  if (percentage >= 75) return 'text-blue-800 bg-blue-100';
  if (percentage >= 60) return 'text-emerald-800 bg-emerald-100';
  if (percentage >= passing) return 'text-amber-800 bg-amber-100';
  return 'text-rose-800 bg-rose-100';
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
  const [examSubjects, setExamSubjects] = useState<ExamSubject[]>([]);
  const [subjects, setSubjects] = useState<SubjectMark[]>(DEFAULT_SUBJECTS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [bulkOperation, setBulkOperation] = useState<'clear' | 'defaults' | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    setSuccessMsg('');
    setValidationErrors([]);

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

  // Load exam subjects when exam changes
  useEffect(() => {
    if (!selectedExamId) return;
    
    fetch(`/api/exams/${selectedExamId}/subjects`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.subjects && data.subjects.length > 0) {
          setExamSubjects(data.subjects);
          // Auto-populate subjects from exam configuration
          setSubjects(data.subjects.map((s: ExamSubject) => ({
            subject: s.subject_name,
            maxMarks: s.max_marks,
            marksObtained: '',
            remarks: '',
            subjectId: s.id,
            passingMarks: s.passing_marks,
          })));
        } else {
          setExamSubjects([]);
          setSubjects(DEFAULT_SUBJECTS);
        }
      })
      .catch(() => {});
  }, [selectedExamId]);

  // Load existing marks when student or exam changes
  useEffect(() => {
    if (!selectedStudentId || !selectedExamId) return;
    
    Promise.all([
      fetch(`/api/exams/marks?studentId=${selectedStudentId}&examId=${selectedExamId}`),
      fetch(`/api/exams/${selectedExamId}/subjects`)
    ])
      .then(async ([marksRes, subjectsRes]) => {
        const marksData = await marksRes.json();
        const subjectsData = await subjectsRes.json();
        
        if (subjectsData.success && subjectsData.subjects && subjectsData.subjects.length > 0) {
          setExamSubjects(subjectsData.subjects);
          
          if (marksData.success && marksData.marks && marksData.marks.length > 0) {
            // Merge existing marks with exam subjects
            const mergedSubjects = subjectsData.subjects.map((es: ExamSubject) => {
              const existingMark = marksData.marks.find((m: any) => 
                m.subject.toLowerCase() === es.subject_name.toLowerCase() ||
                (m.subject_id && m.subject_id === es.id)
              );
              
              return {
                subject: es.subject_name,
                maxMarks: es.max_marks,
                marksObtained: existingMark ? Number(existingMark.marks_obtained) : '',
                remarks: existingMark?.remarks || '',
                subjectId: es.id,
                passingMarks: es.passing_marks,
              };
            });
            
            setSubjects(mergedSubjects);
          } else {
            // No existing marks, use exam subjects
            setSubjects(subjectsData.subjects.map((s: ExamSubject) => ({
              subject: s.subject_name,
              maxMarks: s.max_marks,
              marksObtained: '',
              remarks: '',
              subjectId: s.id,
              passingMarks: s.passing_marks,
            })));
          }
        }
      })
      .catch(() => {});
  }, [selectedStudentId, selectedExamId]);

  if (!isOpen) return null;

  const handleMarkChange = (idx: number, field: keyof SubjectMark, val: any) => {
    setSubjects((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: val };
      
      // Auto-calculate remarks based on percentage
      if (field === 'marksObtained' && val !== '') {
        const marksObtained = Number(val) || 0;
        const maxMarks = next[idx].maxMarks || 100;
        const passingMarks = next[idx].passingMarks || 33;
        const percentage = maxMarks > 0 ? (marksObtained / maxMarks) * 100 : 0;
        
        let remarks = '';
        if (percentage >= 90) remarks = 'उत्कृष्ट प्रदर्शन';
        else if (percentage >= 75) remarks = 'उत्तम प्रदर्शन';
        else if (percentage >= 60) remarks = 'अच्छा प्रदर्शन';
        else if (percentage >= passingMarks) remarks = 'संतोषजनक';
        else remarks = 'सुधार आवश्यक';
        
        next[idx].remarks = remarks;
      }
      
      return next;
    });
    
    // Clear validation errors when user edits
    setValidationErrors(prev => prev.filter(e => !e.includes(`subject ${idx + 1}`)));
  };

  const handleAddSubject = () => {
    setSubjects((prev) => [
      ...prev,
      { subject: '', maxMarks: 100, marksObtained: '', remarks: '', passingMarks: 33 },
    ]);
  };

  const handleRemoveSubject = (idx: number) => {
    if (subjects[idx].subjectId) {
      // This is a predefined exam subject - show warning
      if (!confirm('यह विषय परीक्षा सेटिंग से संबंधित है। क्या आप सुनिश्चित हैं कि आप इसे हटाना चाहते हैं?')) {
        return;
      }
    }
    setSubjects((prev) => prev.filter((_, i) => i !== idx));
  };

  // Bulk operations
  const handleBulkOperation = (operation: 'clear' | 'defaults') => {
    if (operation === 'clear') {
      setSubjects(prev => prev.map(s => ({ ...s, marksObtained: '', remarks: '' })));
    } else if (operation === 'defaults') {
      setSubjects(prev => prev.map(s => ({ 
        ...s, 
        marksObtained: Math.floor(s.maxMarks * 0.75), // Fixed 75% without randomness
        remarks: 'उत्तम प्रदर्शन' 
      })));
    }
  };

  // Validate subjects before submission
  const validateSubjects = (): boolean => {
    const errors: string[] = [];
    
    subjects.forEach((subject, idx) => {
      if (!subject.subject?.trim()) {
        errors.push(`Subject ${idx + 1}: विषय का नाम खाली नहीं हो सकता।`);
      }
      
      const marksObtained = Number(subject.marksObtained) || 0;
      const maxMarks = Number(subject.maxMarks) || 100;
      
      if (marksObtained > maxMarks) {
        errors.push(`Subject ${idx + 1}: प्राप्तांक पूर्णांक से अधिक नहीं हो सकते।`);
      }
      
      if (marksObtained < 0) {
        errors.push(`Subject ${idx + 1}: अंक ऋणात्मक नहीं हो सकते।`);
      }
      
      if (maxMarks <= 0) {
        errors.push(`Subject ${idx + 1}: पूर्णांक शून्य या ऋणात्मक नहीं हो सकता।`);
      }
    });
    
    setValidationErrors(errors);
    return errors.length === 0;
  };

  // Computations
  const totalMax = subjects.reduce((sum, s) => sum + (Number(s.maxMarks) || 0), 0);
  const totalObtained = subjects.reduce((sum, s) => sum + (Number(s.marksObtained) || 0), 0);
  const percentage = totalMax > 0 ? +((totalObtained / totalMax) * 100).toFixed(1) : 0;
  const overallGrade = calcGrade(percentage);
  
  // Calculate passed subjects
  const passedSubjects = subjects.filter(s => {
    const marks = Number(s.marksObtained) || 0;
    const max = Number(s.maxMarks) || 100;
    const passing = s.passingMarks || 33;
    return max > 0 && (marks / max) * 100 >= passing;
  }).length;
  
  const totalSubjects = subjects.length;
  const passPercentage = totalSubjects > 0 ? ((passedSubjects / totalSubjects) * 100).toFixed(1) : '0.0';

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
    
    // Validate subjects
    if (!validateSubjects()) {
      setError('कृपया सभी विषयों की जानकारी सही भरें।');
      return;
    }

    setSaving(true);
    setError('');
    setSuccessMsg('');

    try {
      const payload = {
        examId: selectedExamId,
        studentId: selectedStudentId,
        marks: subjects
          .filter((s) => s.subject.trim() !== '')
          .map((s) => ({
            subject: s.subject.trim(),
            maxMarks: Number(s.maxMarks) || 100,
            marksObtained: Number(s.marksObtained) || 0,
            remarks: s.remarks,
            subjectId: s.subjectId,
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
        }, 1500);
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
            {/* Notifications */}
            {error && (
              <div className="flex items-start gap-2 rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700 animate-pulse">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <strong className="font-bold">त्रुटि:</strong>
                  <span className="ml-1">{error}</span>
                </div>
              </div>
            )}

            {validationErrors.length > 0 && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
                <div className="flex items-start gap-2 text-xs text-amber-700 mb-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <strong className="font-bold">सत्यापन त्रुटियाँ:</strong>
                </div>
                <ul className="text-xs text-amber-800 space-y-1 ml-6 list-disc">
                  {validationErrors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            {successMsg && (
              <div className="flex items-start gap-2 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-700 animate-pulse">
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <strong className="font-bold">सफलता:</strong>
                  <span className="ml-1">{successMsg}</span>
                </div>
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
            <span className="text-xs text-slate-500">Pragnya Mitra परीक्षा मूल्यांकन मॉड्यूल</span>
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
