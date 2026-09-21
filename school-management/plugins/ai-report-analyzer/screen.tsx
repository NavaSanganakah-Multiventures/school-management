'use client';

import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  Sparkles,
  AlertTriangle,
  Award,
  TrendingUp,
  CheckCircle2,
  Users,
  FileText,
  Loader2,
  GraduationCap,
  Target,
} from 'lucide-react';

interface ExamOption {
  id: string;
  name: string;
  academicYear: string;
  classes: string;
  startDate: string;
  status: string;
}

interface SubjectStat {
  subject: string;
  avgPercentage: number;
  avgMarks: number;
  minPercentage: number;
  maxPercentage: number;
  passRate: number;
  entries: number;
}

interface ClassStat {
  className: string;
  studentCount: number;
  avgPercentage: number;
  passRate: number;
}

interface StudentStat {
  name: string;
  className: string;
  section: string;
  avgPercentage: number;
  totalMarks: number;
  maxTotal: number;
  subjects: number;
}

interface Analysis {
  generatedAt: string;
  exam: { id: string; name: string; academicYear: string; term: string } | null;
  studentCount: number;
  marksCount: number;
  overallPercentage: number;
  passRate: number;
  subjectBreakdown: SubjectStat[];
  classBreakdown: ClassStat[];
  toppers: StudentStat[];
  needsAttention: StudentStat[];
  insights: string;
}

function pctColor(p: number) {
  if (p >= 75) return 'bg-emerald-500';
  if (p >= 45) return 'bg-amber-500';
  return 'bg-rose-500';
}

function InsightText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <div className="whitespace-pre-wrap leading-relaxed">
      {parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**') ? (
          <strong key={i} className="font-bold text-slate-900">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </div>
  );
}

export function AIReportAnalyzerScreen() {
  const [exams, setExams] = useState<ExamOption[]>([]);
  const [selectedExamId, setSelectedExamId] = useState('');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchExams = async () => {
    try {
      const res = await fetch('/api/exams');
      const data = await res.json();
      if (data.success && Array.isArray(data.exams)) {
        setExams(data.exams);
        if (data.exams.length > 0) {
          setSelectedExamId((prev) => (prev ? prev : data.exams[0].id));
        }
      }
    } catch (e) {
      setError('परीक्षा सूची लोड करने में त्रुटि हुई।');
    }
  };

  useEffect(() => {
    fetchExams();
  }, []);

  const runAnalysis = async () => {
    if (!selectedExamId) return;
    setLoading(true);
    setError('');
    setAnalysis(null);
    try {
      const res = await fetch('/api/ai/report-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ examId: selectedExamId }),
      });
      const data = await res.json();
      if (data.success && data.analysis) {
        setAnalysis(data.analysis);
      } else {
        setError(data.message || 'विश्लेषण उपलब्ध नहीं हो सका।');
      }
    } catch (e) {
      setError('नेटवर्क त्रुटि। कृपया पुनः प्रयास करें।');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-violet-700 via-indigo-700 to-blue-700 rounded-3xl p-6 lg:p-8 text-white shadow-xl">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/15 rounded-full text-xs font-semibold text-indigo-100 mb-3 border border-white/20">
          <Sparkles className="h-3.5 w-3.5" />
          <span>AI रिपोर्ट विश्लेषक प्लगइन</span>
        </div>
        <h1 className="text-2xl lg:text-3xl font-black tracking-tight">परीक्षा परिणामों का AI विश्लेषण</h1>
        <p className="text-sm text-indigo-100 mt-1 max-w-2xl leading-relaxed">
          विषयवार, कक्षावार एवं छात्रवार प्रदर्शन की गहरी समझ पाएँ और सुधार हेतु कार्यान्वयन-योग्य सुझाव प्राप्त करें।
        </p>
      </div>

      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
        <div className="flex-1">
          <label className="text-xs font-semibold text-slate-600 block mb-1">परीक्षा चुनें</label>
          <select
            value={selectedExamId}
            onChange={(e) => setSelectedExamId(e.target.value)}
            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {exams.length === 0 && <option value="">कोई परीक्षा उपलब्ध नहीं</option>}
            {exams.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} — {e.academicYear}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={runAnalysis}
          disabled={loading || !selectedExamId}
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-md transition cursor-pointer flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
          <span>{loading ? 'AI विश्लेषण जारी है...' : 'विश्लेषण चलाएँ'}</span>
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-sm">
          <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold">विश्लेषण में समस्या आई</div>
            <p className="text-xs mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {loading && (
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-2xs p-10 text-center">
          <div className="inline-flex items-center gap-2 text-indigo-600 font-bold">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>परीक्षा परिणामों का विश्लेषण किया जा रहा है...</span>
          </div>
          <p className="text-xs text-slate-500 mt-2">AI विषयवार रुझान और सुधार सुझाव तैयार कर रहा है।</p>
        </div>
      )}

      {analysis && !loading && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs flex items-center gap-3">
              <div className="h-11 w-11 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xl font-black text-slate-900">{analysis.studentCount}</div>
                <div className="text-xs text-slate-500 font-medium">छात्र विश्लेषित</div>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs flex items-center gap-3">
              <div className="h-11 w-11 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                <TrendingUp className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xl font-black text-slate-900">{analysis.overallPercentage}%</div>
                <div className="text-xs text-slate-500 font-medium">औसत प्रतिशत</div>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs flex items-center gap-3">
              <div className="h-11 w-11 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xl font-black text-slate-900">{analysis.passRate}%</div>
                <div className="text-xs text-slate-500 font-medium">उत्तीर्ण दर</div>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs flex items-center gap-3">
              <div className="h-11 w-11 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xl font-black text-slate-900">{analysis.marksCount}</div>
                <div className="text-xs text-slate-500 font-medium">अंक प्रविष्टियाँ</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-2xs">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-4">
                <Target className="h-4 w-4 text-indigo-600" />
                <span>विषयवार प्रदर्शन</span>
              </h3>
              <div className="space-y-3">
                {analysis.subjectBreakdown.map((s) => (
                  <div key={s.subject} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-800">{s.subject}</span>
                      <span className="text-slate-500 font-medium">
                        औसत {s.avgPercentage}% • उत्तीर्ण {s.passRate}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div className={'h-2 rounded-full ' + pctColor(s.avgPercentage)} style={{ width: Math.min(100, s.avgPercentage) + '%' }} />
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span>{s.entries} प्रविष्टियाँ</span>
                      <span>सीमा {s.minPercentage}% – {s.maxPercentage}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-2xs">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-4">
                <GraduationCap className="h-4 w-4 text-indigo-600" />
                <span>कक्षावार प्रदर्शन</span>
              </h3>
              <div className="space-y-3">
                {analysis.classBreakdown.map((c) => (
                  <div key={c.className} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-800">{c.className}</span>
                      <span className="text-slate-500 font-medium">
                        {c.studentCount} छात्र • औसत {c.avgPercentage}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div className={'h-2 rounded-full ' + pctColor(c.avgPercentage)} style={{ width: Math.min(100, c.avgPercentage) + '%' }} />
                    </div>
                    <div className="text-[10px] text-slate-400">उत्तीर्ण दर {c.passRate}%</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-2xs">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-4">
                <Award className="h-4 w-4 text-emerald-600" />
                <span>शीर्ष प्रदर्शन करने वाले छात्र</span>
              </h3>
              <div className="space-y-2">
                {analysis.toppers.map((s, i) => (
                  <div key={i} className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-100">
                    <div className="flex items-center gap-2.5">
                      <span className="text-lg">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '⭐'}</span>
                      <div>
                        <div className="text-xs font-bold text-slate-900">{s.name}</div>
                        <div className="text-[10px] text-slate-500">{s.className} • सेक्शन {s.section}</div>
                      </div>
                    </div>
                    <span className="text-sm font-black text-emerald-700">{s.avgPercentage}%</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-2xs">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-4">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <span>ध्यान देने योग्य छात्र (33% से कम)</span>
              </h3>
              {analysis.needsAttention.length === 0 ? (
                <div className="p-6 text-center bg-emerald-50 rounded-2xl text-emerald-800 text-xs font-bold">
                  सभी छात्रों का प्रदर्शन न्यूनतम स्तर से ऊपर है।
                </div>
              ) : (
                <div className="space-y-2">
                  {analysis.needsAttention.map((s, i) => (
                    <div key={i} className="flex items-center justify-between p-2.5 rounded-xl bg-rose-50/60 border border-rose-100">
                      <div>
                        <div className="text-xs font-bold text-slate-900">{s.name}</div>
                        <div className="text-[10px] text-slate-500">{s.className} • सेक्शन {s.section}</div>
                      </div>
                      <span className="text-sm font-black text-rose-700">{s.avgPercentage}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-2xs">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-4">
              <Sparkles className="h-4 w-4 text-violet-600" />
              <span>AI विश्लेषण एवं सुझाव</span>
            </h3>
            <div className="p-4 rounded-2xl bg-violet-50/50 border border-violet-100 text-sm text-slate-700">
              <InsightText text={analysis.insights} />
            </div>
            <p className="text-[10px] text-slate-400 mt-3">
              यह विश्लेषण उपलब्ध परीक्षा अंकों पर आधारित है। निर्णय लेने से पहले मानवीय समीक्षा अवश्य करें।
            </p>
          </div>
        </>
      )}

      {!analysis && !loading && !error && (
        <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-12 text-center text-slate-500">
          <BarChart3 className="h-10 w-10 mx-auto text-indigo-300 mb-3" />
          <p className="text-sm font-semibold">परीक्षा चुनें और विश्लेषण चलाएँ</p>
          <p className="text-xs mt-1">विषयवार प्रदर्शन, शीर्ष छात्र और AI सुझाव यहाँ दिखाई देंगे।</p>
        </div>
      )}
    </div>
  );
}
