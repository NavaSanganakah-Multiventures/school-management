'use client';

import React, { useState, useEffect } from 'react';
import { Award, Calendar, ChevronRight, CheckCircle, GraduationCap } from 'lucide-react';

export function ExamsScreen() {
  const [reportCard, setReportCard] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function loadReportCard() {
      try {
        const res = await fetch('/api/exams/report-card/std-101');
        const data = await res.json();
        if (isMounted && data.success) {
          setReportCard(data.reportCard);
        }
      } catch {
        //
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }
    loadReportCard();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="space-y-4 pb-12">
      {/* Exam Header */}
      <div className="rounded-2xl bg-gradient-to-r from-blue-900 to-indigo-900 p-5 text-white shadow-md">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-white/10 rounded-xl backdrop-blur-xs border border-white/20">
            <GraduationCap className="h-6 w-6 text-amber-300" />
          </div>
          <div>
            <h2 className="text-base font-bold">परीक्षा एवं परिणाम पोर्टल (Exams & Results)</h2>
            <p className="text-xs text-blue-200">सत्र 2026-27 शैक्षणिक प्रगति रिपोर्ट</p>
          </div>
        </div>
      </div>

      {/* Upcoming Exams Notice */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-2">
        <h3 className="font-semibold text-xs text-slate-500 uppercase tracking-wider">
          आगामी परीक्षाएं (Upcoming Examinations)
        </h3>
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2.5">
            <Calendar className="h-4 w-4 text-blue-700" />
            <div>
              <h4 className="font-semibold text-slate-800">अर्धवार्षिक परीक्षा (Mid-Term 2026)</h4>
              <p className="text-[11px] text-slate-500">25 सितंबर से 05 अक्टूबर • कक्षा 9वीं से 12वीं</p>
            </div>
          </div>
          <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
            डेटशीट जारी
          </span>
        </div>
      </div>

      {/* Interactive Report Card View */}
      {loading ? (
        <div className="p-8 text-center text-xs text-slate-500">मार्कशीट लोड हो रही है...</div>
      ) : reportCard ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <span className="text-[10px] font-mono text-slate-400">रोल नं: {reportCard.rollNumber}</span>
              <h3 className="text-base font-bold text-slate-900">{reportCard.studentName}</h3>
              <p className="text-xs text-slate-500">{reportCard.className} • {reportCard.term}</p>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-slate-500">समग्र ग्रेड</span>
              <div className="text-xl font-black text-blue-900">{reportCard.finalGrade}</div>
              <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                {reportCard.percentage}%
              </span>
            </div>
          </div>

          {/* Subject Marks Table */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-slate-700">विषयवार प्राप्तांक</h4>
            <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
              {reportCard.subjects.map((sub: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between p-2.5 bg-white text-xs">
                  <span className="font-medium text-slate-800">{sub.subject}</span>
                  <div className="flex items-center gap-3">
                    <div className="w-24 bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-blue-800 h-2 rounded-full"
                        style={{ width: `${(sub.marks / sub.maxMarks) * 100}%` }}
                      />
                    </div>
                    <span className="font-bold text-slate-900 w-12 text-right">
                      {sub.marks}/{sub.maxMarks}
                    </span>
                    <span className="w-8 text-center font-bold text-blue-900 bg-blue-50 py-0.5 rounded text-[10px]">
                      {sub.grade}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Result Footer */}
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between text-xs text-emerald-900">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-emerald-600" />
              <span>परीक्षा परिणाम: <strong>उत्तीर्ण (PASS)</strong></span>
            </div>
            <span>कुल अंक: <strong>{reportCard.totalMarks} / {reportCard.maxTotal}</strong></span>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center space-y-2">
          <p className="text-sm font-semibold text-slate-700">अभी कोई परीक्षा अंक सूची दर्ज नहीं है</p>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            अर्धवार्षिक अथवा वार्षिक परीक्षा उपरांत विद्यार्थियों के अंक प्रविष्ट किए जाने पर यहां डिजिटल रिपोर्ट कार्ड प्रदर्शित होगा।
          </p>
        </div>
      )}
    </div>
  );
}
