'use client';

import React, { useState, useEffect } from 'react';
import {
  Award,
  Calendar,
  ChevronRight,
  CheckCircle,
  GraduationCap,
  Printer,
  Plus,
  Edit3,
  Search,
  School,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { MarksEntryModal } from '../modals/marks-entry-modal';
import { AcademicSetupPanel } from './academic-setup-panel';

export function ExamsScreen() {
  const [activeMainTab, setActiveMainTab] = useState<'exams' | 'setup'>('exams');
  const [exams, setExams] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [reportCard, setReportCard] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);
  const [isMarksModalOpen, setIsMarksModalOpen] = useState(false);
  const [isNewExamModalOpen, setIsNewExamModalOpen] = useState(false);

  // New exam form state
  const [newExamName, setNewExamName] = useState('');
  const [newExamTerm, setNewExamTerm] = useState('कक्षा 1 से 12');
  const [newExamStartDate, setNewExamStartDate] = useState('');
  const [newExamEndDate, setNewExamEndDate] = useState('');
  const [savingExam, setSavingExam] = useState(false);

  // Initial load
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        const [examsRes, studentsRes] = await Promise.all([
          fetch('/api/exams'),
          fetch('/api/students'),
        ]);
        const examsData = await examsRes.json();
        const studentsData = await studentsRes.json();

        if (isMounted) {
          if (examsData.success && examsData.exams) {
            setExams(examsData.exams);
          }
          if (studentsData.success && studentsData.students && studentsData.students.length > 0) {
            setStudents(studentsData.students);
            setSelectedStudentId(studentsData.students[0].id);
          }
        }
      } catch {
        //
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadData();
    return () => {
      isMounted = false;
    };
  }, []);

  // Fetch report card whenever selected student changes
  const fetchReportCard = async (studentId: string) => {
    if (!studentId) return;
    setLoadingReport(true);
    try {
      const res = await fetch(`/api/exams/report-card/${studentId}`);
      const data = await res.json();
      if (data.success) {
        setReportCard(data.reportCard);
      } else {
        setReportCard(null);
      }
    } catch {
      setReportCard(null);
    } finally {
      setLoadingReport(false);
    }
  };

  useEffect(() => {
    if (selectedStudentId) {
      fetchReportCard(selectedStudentId);
    }
  }, [selectedStudentId]);

  const handleCreateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExamName.trim()) return;
    setSavingExam(true);
    try {
      const res = await fetch('/api/exams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          examName: newExamName,
          classes: newExamTerm,
          startDate: newExamStartDate || new Date().toISOString().split('T')[0],
          endDate: newExamEndDate || new Date().toISOString().split('T')[0],
        }),
      });
      const data = await res.json();
      if (data.success && data.exam) {
        setExams((prev) => [...prev, data.exam]);
        setIsNewExamModalOpen(false);
        setNewExamName('');
      }
    } catch {
      //
    } finally {
      setSavingExam(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        <span>परीक्षा डेटा लोड हो रहा है...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="flex bg-slate-100 p-1 rounded-xl w-max mb-2">
        <button
          onClick={() => setActiveMainTab('exams')}
          className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
            activeMainTab === 'exams' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          परीक्षा व मार्कशीट (Exams & Results)
        </button>
        <button
          onClick={() => setActiveMainTab('setup')}
          className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
            activeMainTab === 'setup' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          अकादमिक सेटअप (Subjects & Terms)
        </button>
      </div>

      {activeMainTab === 'setup' ? (
        <AcademicSetupPanel />
      ) : (
        <>
          {/* Header & Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-blue-900 to-indigo-900 p-6 text-white shadow-md print:hidden">
            <div className="flex items-center gap-3.5">
              <div className="p-3 bg-white/10 rounded-2xl backdrop-blur-xs border border-white/20 shrink-0">
                <GraduationCap className="h-7 w-7 text-amber-300" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-black">परीक्षा एवं परिणाम पोर्टल</h1>
                  <span className="bg-amber-400/20 text-amber-300 border border-amber-400/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
                    सत्र 2026-27
                  </span>
                </div>
                <p className="text-xs text-blue-200 mt-0.5">
                  परीक्षा समय सारिणी, अंक प्रविष्टि एवं सीबीएसई/स्टेट बोर्ड मानक डिजिटल रिपोर्ट कार्ड।
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setIsNewExamModalOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold border border-white/20 transition-all cursor-pointer"
              >
                <Plus className="h-4 w-4 text-amber-300" />
                <span>+ नई परीक्षा जोड़ें</span>
              </button>
              <button
                onClick={() => setIsMarksModalOpen(true)}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-black shadow-md transition-all active:scale-95 cursor-pointer"
              >
                <Edit3 className="h-4 w-4" />
                <span>अंक प्रविष्टि करें</span>
              </button>
            </div>
          </div>

          {/* Examination Schedule Cards */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-3 print:hidden">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-xs text-slate-600 uppercase tracking-wider">
                परीक्षा समय-सारणी एवं सत्र कैलेंडर
              </h2>
              <span className="text-xs text-blue-900 font-semibold">{exams.length} परीक्षाएं सूचीबद्ध</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {exams.map((ex) => (
                <div
                  key={ex.id}
                  className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between hover:bg-slate-100/70 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-lg bg-blue-100 text-blue-800">
                      <Calendar className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-xs text-slate-900">{ex.name}</h3>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {ex.startDate} से {ex.endDate} • {ex.classes || 'समस्त कक्षाएं'}
                      </p>
                    </div>
                  </div>
                  <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0">
                    {ex.status === 'Completed' ? 'सम्पन्न' : 'सक्रिय'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Student Selector Bar */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
            <div className="flex items-center gap-3">
              <label className="text-xs font-bold text-slate-700 whitespace-nowrap">
                विद्यार्थी चुनें:
              </label>
              <select
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                className="text-xs rounded-xl border border-slate-300 bg-white px-3 py-2 font-medium text-slate-800 focus:border-blue-500 focus:outline-hidden min-w-[240px]"
              >
                {students.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.fullName} ({st.className} - रोल: {st.rollNumber})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsMarksModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-blue-900 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl transition-colors cursor-pointer"
              >
                <Edit3 className="h-3.5 w-3.5" />
                <span>इस छात्र के अंक बदलें</span>
              </button>
              <button
                onClick={handlePrint}
                disabled={!reportCard}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-40"
              >
                <Printer className="h-3.5 w-3.5" />
                <span>मार्कशीट प्रिंट करें</span>
              </button>
            </div>
          </div>

          {/* Report Card Viewer (Screen + Printable Layout) */}
          {loadingReport ? (
            <div className="p-12 text-center text-xs text-slate-500 bg-white rounded-2xl border border-slate-200">
              मार्कशीट डेटा लोड हो रहा है...
            </div>
          ) : reportCard ? (
            <div className="rounded-3xl border-2 border-slate-300 bg-white p-6 sm:p-8 shadow-md space-y-6 print:border-none print:shadow-none print:p-2 print:m-0">
              {/* Institutional Header */}
              <div className="border-b-2 border-slate-900 pb-5 text-center relative">
                <div className="flex items-center justify-center gap-2 text-blue-900 font-extrabold text-xs tracking-widest uppercase mb-1">
                  <School className="h-4 w-4" />
                  <span>शिक्षा संवर्धन संस्थान • मान्यता प्राप्त</span>
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-slate-950 tracking-tight">
                  विद्या सेतु उच्चतर माध्यमिक विद्यालय
                </h2>
                <p className="text-xs font-bold text-slate-700 mt-0.5">
                  VIDYASETU HIGHER SECONDARY SCHOOL
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  सीबीएसई / राज्य शिक्षा मंडल संबद्धता क्रमांक: 1030894 • स्कूल कोड: 50812
                </p>
                <div className="inline-block mt-3 px-4 py-1 rounded-full bg-slate-900 text-white text-xs font-black tracking-wider uppercase">
                  शैक्षणिक प्रगति पत्रक / CUMULATIVE PROGRESS REPORT ({reportCard.academicYear || '2026-27'})
                </div>
              </div>

              {/* Student Profile Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 font-semibold uppercase">विद्यार्थी का नाम:</span>
                  <p className="font-bold text-slate-900 text-sm mt-0.5">{reportCard.studentName}</p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-semibold uppercase">स्कॉलर / अनुक्रमांक:</span>
                  <p className="font-bold text-slate-900 text-sm mt-0.5">
                    SR: {reportCard.scholarNumber} | रोल: {reportCard.rollNumber}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-semibold uppercase">कक्षा व वर्ग:</span>
                  <p className="font-bold text-slate-900 text-sm mt-0.5">
                    {reportCard.className} - सेक्शन {reportCard.section}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-semibold uppercase">परीक्षा सत्र:</span>
                  <p className="font-bold text-blue-900 text-sm mt-0.5">{reportCard.term}</p>
                </div>
                {reportCard.fatherName && (
                  <div>
                    <span className="text-[10px] text-slate-400 font-semibold uppercase">पिता का नाम:</span>
                    <p className="font-semibold text-slate-800 mt-0.5">{reportCard.fatherName}</p>
                  </div>
                )}
                {reportCard.motherName && (
                  <div>
                    <span className="text-[10px] text-slate-400 font-semibold uppercase">माता का नाम:</span>
                    <p className="font-semibold text-slate-800 mt-0.5">{reportCard.motherName}</p>
                  </div>
                )}
                {reportCard.dob && (
                  <div>
                    <span className="text-[10px] text-slate-400 font-semibold uppercase">जन्म दिनांक:</span>
                    <p className="font-semibold text-slate-800 mt-0.5">{reportCard.dob}</p>
                  </div>
                )}
                <div>
                  <span className="text-[10px] text-slate-400 font-semibold uppercase">परिणाम स्थिति:</span>
                  <p className={`font-black mt-0.5 ${reportCard.percentage >= 33 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {reportCard.result}
                  </p>
                </div>
              </div>

              {/* Subject Marks Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border border-slate-300 rounded-xl overflow-hidden">
                  <thead className="bg-slate-900 text-white font-bold text-[11px]">
                    <tr>
                      <th className="p-3 w-12 text-center">क्र.सं.</th>
                      <th className="p-3">विषय का नाम</th>
                      <th className="p-3 text-center w-24">पूर्णांक</th>
                      <th className="p-3 text-center w-24">उत्तीर्णांक</th>
                      <th className="p-3 text-center w-24">प्राप्तांक</th>
                      <th className="p-3 text-center w-20">ग्रेड</th>
                      <th className="p-3 w-36">टिप्पणी</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-medium">
                    {reportCard.subjects.map((sub: any, idx: number) => (
                      <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                        <td className="p-2.5 text-center font-mono text-slate-400">{idx + 1}</td>
                        <td className="p-2.5 font-bold text-slate-900">{sub.subject}</td>
                        <td className="p-2.5 text-center font-mono text-slate-600">{sub.maxMarks}</td>
                        <td className="p-2.5 text-center font-mono text-slate-400">33</td>
                        <td className="p-2.5 text-center font-mono font-bold text-blue-900 text-sm">
                          {sub.marks}
                        </td>
                        <td className="p-2.5 text-center font-bold">
                          <span className="inline-block px-2 py-0.5 rounded bg-blue-50 text-blue-900 font-bold text-[11px]">
                            {sub.grade}
                          </span>
                        </td>
                        <td className="p-2.5 text-slate-500 text-[11px]">{sub.remarks || 'उत्तीर्ण'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300">
                    <tr>
                      <td colSpan={2} className="p-3 text-right text-slate-900 font-bold">
                        महायोग:
                      </td>
                      <td className="p-3 text-center font-mono text-slate-900 font-bold">
                        {reportCard.maxTotal}
                      </td>
                      <td className="p-3 text-center font-mono text-slate-500">—</td>
                      <td className="p-3 text-center font-mono font-black text-blue-900 text-base">
                        {reportCard.totalMarks}
                      </td>
                      <td className="p-3 text-center font-black text-blue-900">
                        {reportCard.finalGrade}
                      </td>
                      <td className="p-3 text-[11px] text-emerald-800 font-bold">
                        {reportCard.percentage}% ({reportCard.division})
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Performance & Grading Scale Footer */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] space-y-1">
                  <span className="font-bold text-slate-700 block mb-1">ग्रेडिंग पैमाना:</span>
                  <p className="text-slate-600">A+ (90%-100%): असाधारण • A (75%-89%): अति उत्तम</p>
                  <p className="text-slate-600">B+ (60%-74%): उत्तम • B (45%-59%): संतोषजनक • C (33%-44%): उत्तीर्ण</p>
                </div>

                <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200 text-xs flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">
                      अंतिम परिणाम सारांश
                    </span>
                    <h4 className="font-black text-emerald-950 text-base mt-0.5">
                      {reportCard.result} — {reportCard.division}
                    </h4>
                    <p className="text-[11px] text-emerald-700 mt-0.5">प्राप्तांक प्रतिशत: {reportCard.percentage}%</p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-emerald-600 text-white flex items-center justify-center font-black text-lg shadow-sm">
                    {reportCard.finalGrade}
                  </div>
                </div>
              </div>

              {/* Signatures */}
              <div className="pt-8 grid grid-cols-3 gap-4 text-center text-xs text-slate-700">
                <div>
                  <div className="h-12 border-b border-dashed border-slate-400 mb-2"></div>
                  <p className="font-bold">कक्षा अध्यापक हस्ताक्षर</p>
                  <span className="text-[10px] text-slate-400">Class Teacher</span>
                </div>
                <div>
                  <div className="h-12 border-b border-dashed border-slate-400 mb-2"></div>
                  <p className="font-bold">परीक्षा प्रभारी हस्ताक्षर</p>
                  <span className="text-[10px] text-slate-400">Exam Controller</span>
                </div>
                <div>
                  <div className="h-12 border-b border-dashed border-slate-400 mb-2"></div>
                  <p className="font-bold">प्राचार्य हस्ताक्षर व मुद्रा</p>
                  <span className="text-[10px] text-slate-400">Principal & Seal</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center space-y-2">
              <p className="text-sm font-semibold text-slate-700">इस छात्र के लिए कोई रिपोर्ट कार्ड उपलब्ध नहीं है</p>
              <button
                onClick={() => setIsMarksModalOpen(true)}
                className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 bg-blue-900 text-white text-xs font-bold rounded-xl shadow-xs"
              >
                <Plus className="h-4 w-4" />
                <span>अभी अंक प्रविष्ट करें</span>
              </button>
            </div>
          )}
        </>
      )}

      {/* Marks Entry Modal */}
      <MarksEntryModal
        isOpen={isMarksModalOpen}
        onClose={() => setIsMarksModalOpen(false)}
        preselectedStudentId={selectedStudentId}
        onSuccess={() => {
          if (selectedStudentId) fetchReportCard(selectedStudentId);
        }}
      />

      {/* Schedule Exam Modal */}
      {isNewExamModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-900 p-5 text-white flex items-center justify-between">
              <h3 className="text-sm font-bold">नई परीक्षा अनुसूची जोड़ें</h3>
              <button
                onClick={() => setIsNewExamModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateExam} className="p-5 space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">परीक्षा का नाम *</label>
                <input
                  type="text"
                  required
                  placeholder="उदा. प्रथम इकाई परीक्षा / Pre-Board 2027"
                  value={newExamName}
                  onChange={(e) => setNewExamName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-2.5 focus:border-blue-500 focus:outline-hidden"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">कक्षाएं</label>
                <input
                  type="text"
                  value={newExamTerm}
                  onChange={(e) => setNewExamTerm(e.target.value)}
                  placeholder="कक्षा 9वीं व 10वीं"
                  className="w-full rounded-lg border border-slate-300 p-2.5 focus:border-blue-500 focus:outline-hidden"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">प्रारंभ दिनांक</label>
                  <input
                    type="date"
                    value={newExamStartDate}
                    onChange={(e) => setNewExamStartDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 p-2 focus:border-blue-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">समापन दिनांक</label>
                  <input
                    type="date"
                    value={newExamEndDate}
                    onChange={(e) => setNewExamEndDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 p-2 focus:border-blue-500 focus:outline-hidden"
                  />
                </div>
              </div>
              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsNewExamModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-100 text-slate-600 font-semibold"
                >
                  रद्द करें
                </button>
                <button
                  type="submit"
                  disabled={savingExam}
                  className="px-4 py-2 rounded-lg bg-blue-900 text-white font-bold"
                >
                  {savingExam ? 'सहेजा जा रहा है...' : 'परीक्षा जोड़ें'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

