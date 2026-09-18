'use client';

import React, { useState } from 'react';
import { BarChart3, X, Loader2, Sparkles, ChevronRight } from 'lucide-react';

interface QuickSummary {
  overallPercentage: number;
  passRate: number;
  insights: string;
}

export function AIReportAnalyzerWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [examCount, setExamCount] = useState(0);
  const [latestExam, setLatestExam] = useState('');
  const [loadingExams, setLoadingExams] = useState(false);
  const [summary, setSummary] = useState<QuickSummary | null>(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [error, setError] = useState('');

  const openFlyout = async () => {
    setIsOpen(true);
    if (examCount > 0) return;
    setLoadingExams(true);
    try {
      const res = await fetch('/api/exams');
      const data = await res.json();
      if (data.success && Array.isArray(data.exams)) {
        setExamCount(data.exams.length);
        if (data.exams.length > 0) setLatestExam(data.exams[0].name);
      }
    } catch (e) {
      setError('परीक्षा सूची लोड नहीं हो सकी।');
    } finally {
      setLoadingExams(false);
    }
  };

  const runQuickAnalysis = async () => {
    setLoadingAnalysis(true);
    setError('');
    setSummary(null);
    try {
      const res = await fetch('/api/ai/report-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success && data.analysis) {
        setSummary({
          overallPercentage: data.analysis.overallPercentage,
          passRate: data.analysis.passRate,
          insights: data.analysis.insights,
        });
      } else {
        setError(data.message || 'विश्लेषण उपलब्ध नहीं हो सका।');
      }
    } catch (e) {
      setError('नेटवर्क त्रुटि। कृपया पुनः प्रयास करें।');
    } finally {
      setLoadingAnalysis(false);
    }
  };

  const preview = summary ? summary.insights.split('\n').filter((l) => l.trim()).slice(0, 3).join('\n') : '';

  return (
    <div className="fixed bottom-24 right-6 z-40">
      {!isOpen && (
        <button
          onClick={openFlyout}
          className="flex items-center gap-2 px-4 py-3 rounded-full bg-gradient-to-tr from-violet-700 to-indigo-600 text-white shadow-xl hover:shadow-2xl hover:scale-105 transition-all duration-300 cursor-pointer border-2 border-white/30"
          title="AI रिपोर्ट विश्लेषक"
        >
          <BarChart3 className="h-5 w-5" />
          <span className="text-xs font-bold">AI रिपोर्ट</span>
        </button>
      )}

      {isOpen && (
        <div className="w-80 bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="bg-gradient-to-r from-violet-700 to-indigo-700 p-4 text-white flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-white/20 flex items-center justify-center">
                <BarChart3 className="h-4 w-4" />
              </div>
              <div>
                <h4 className="text-xs font-black tracking-tight">AI रिपोर्ट विश्लेषक</h4>
                <p className="text-[10px] text-indigo-100">परीक्षा प्रदर्शन का त्वरित विश्लेषण</p>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 cursor-pointer">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-4 space-y-3">
            {loadingExams ? (
              <div className="flex items-center gap-2 text-xs text-slate-500 py-3">
                <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
                <span>परीक्षाएँ लोड हो रही हैं...</span>
              </div>
            ) : (
              <div className="flex items-center justify-between text-xs bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5">
                <div>
                  <div className="font-bold text-slate-800">{examCount} परीक्षाएँ उपलब्ध</div>
                  {latestExam && <div className="text-[10px] text-slate-500 mt-0.5">{latestExam}</div>}
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">तैयार</span>
              </div>
            )}

            {!summary && (
              <button
                onClick={runQuickAnalysis}
                disabled={loadingAnalysis}
                className="w-full px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
              >
                {loadingAnalysis ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                <span>{loadingAnalysis ? 'विश्लेषण जारी है...' : 'त्वरित AI विश्लेषण चलाएँ'}</span>
              </button>
            )}

            {error && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-xs font-medium">{error}</div>
            )}

            {summary && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-100">
                    <div className="text-base font-black text-emerald-900">{summary.overallPercentage}%</div>
                    <div className="text-[10px] text-emerald-600 font-semibold">औसत प्रतिशत</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-100">
                    <div className="text-base font-black text-blue-900">{summary.passRate}%</div>
                    <div className="text-[10px] text-blue-600 font-semibold">उत्तीर्ण दर</div>
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-violet-50/70 border border-violet-100 text-xs text-slate-700 whitespace-pre-wrap leading-relaxed max-h-28 overflow-y-auto">
                  {preview || summary.insights}
                </div>
              </div>
            )}

            <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-medium pt-1 border-t border-slate-100">
              <span>विस्तृत रिपोर्ट के लिए मेनू खोलें</span>
              <ChevronRight className="h-3 w-3" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
