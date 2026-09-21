'use client';

import React from 'react';
import { School, Shield, BookOpen } from 'lucide-react';

interface ReportCardData {
  studentName: string;
  scholarNumber: string;
  rollNumber: string;
  className: string;
  section: string;
  fatherName: string;
  motherName: string;
  dob: string;
  term: string;
  academicYear: string;
  subjects: Array<{
    subject: string;
    marks: number;
    maxMarks: number;
    passingMarks?: number;
    grade: string;
    percentage: number;
    remarks?: string;
    isPassed?: boolean;
  }>;
  totalMarks: number;
  maxTotal: number;
  percentage: number;
  finalGrade: string;
  result: string;
  division: string;
}

interface StateBoardTemplateProps {
  data: ReportCardData;
  schoolName?: string;
  boardName?: string;
  schoolLogo?: string;
  showSeal?: boolean;
}

export function StateBoardTemplate({ 
  data, 
  schoolName, 
  boardName = "राज्य शिक्षा मंडल, उत्तर प्रदेश",
  schoolLogo,
  showSeal = true 
}: StateBoardTemplateProps) {
  return (
    <div className="bg-white p-8 print:p-6" style={{ minHeight: '297mm', width: '210mm' }}>
      {/* Traditional Header */}
      <div className="border-2 border-emerald-900 rounded-lg p-5 mb-6 bg-gradient-to-r from-emerald-50 to-white">
        <div className="flex flex-col items-center mb-3">
          {schoolLogo ? (
            <div className="flex items-center justify-center gap-6 mb-4">
              <img src={schoolLogo} alt="School Logo" className="h-16 w-16 object-contain" />
              <div className="text-center">
              <h1 className="text-3xl font-serif font-black text-emerald-950 tracking-tight">
                {schoolName || 'प्रज्ञा मित्र उच्चतर माध्यमिक विद्यालय'}
              </h1>
              <p className="text-sm font-bold text-slate-700 mt-1">
                {boardName} द्वारा मान्यता प्राप्त
              </p>
            </div>
            <img src={schoolLogo} alt="School Logo" className="h-16 w-16 object-contain" />
          </div>
        ) : (
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <School className="h-10 w-10 text-emerald-900" />
              <Shield className="h-10 w-10 text-emerald-900" />
            </div>
            <h1 className="text-3xl font-serif font-black text-emerald-950 tracking-tight">
              {schoolName || 'प्रज्ञा मित्र उच्चतर माध्यमिक विद्यालय'}
            </h1>
              <p className="text-sm font-bold text-slate-700 mt-1">
                {boardName} द्वारा मान्यता प्राप्त
              </p>
            </div>
          )}
        </div>
        <div className="text-center py-2 bg-emerald-900 rounded">
          <h2 className="text-sm font-black text-white tracking-wide">
            सत्र {data.academicYear} का परीक्षा परिणाम विवरण
          </h2>
        </div>
      </div>

      {/* Student Details */}
      <div className="mb-6 border border-slate-300 rounded-lg p-4 bg-slate-50">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <div className="flex justify-between border-b pb-1">
            <span className="text-xs font-bold text-slate-700">विद्यार्थी का नाम:</span>
            <span className="text-sm font-black text-slate-900">{data.studentName}</span>
          </div>
          <div className="flex justify-between border-b pb-1">
            <span className="text-xs font-bold text-slate-700">पिता/अभिभावक का नाम:</span>
            <span className="text-sm font-semibold text-slate-800">{data.fatherName}</span>
          </div>
          <div className="flex justify-between border-b pb-1">
            <span className="text-xs font-bold text-slate-700">कक्षा/वर्ग:</span>
            <span className="text-sm font-bold text-slate-900">{data.className} ({data.section})</span>
          </div>
          <div className="flex justify-between border-b pb-1">
            <span className="text-xs font-bold text-slate-700">पंजीकरण संख्या:</span>
            <span className="text-sm font-bold text-slate-900">{data.scholarNumber}</span>
          </div>
          <div className="flex justify-between border-b pb-1">
            <span className="text-xs font-bold text-slate-700">रोल नंबर:</span>
            <span className="text-sm font-bold text-slate-900">{data.rollNumber}</span>
          </div>
          <div className="flex justify-between border-b pb-1">
            <span className="text-xs font-bold text-slate-700">परीक्षा/सत्र:</span>
            <span className="text-sm font-bold text-emerald-900">{data.term}</span>
          </div>
          <div className="flex justify-between border-b pb-1">
            <span className="text-xs font-bold text-slate-700">जन्म तिथि:</span>
            <span className="text-sm font-semibold text-slate-800">{data.dob}</span>
          </div>
          <div className="flex justify-between border-b pb-1">
            <span className="text-xs font-bold text-slate-700">माता का नाम:</span>
            <span className="text-sm font-semibold text-slate-800">{data.motherName}</span>
          </div>
        </div>
      </div>

      {/* Marks Table */}
      <div className="mb-6">
        <div className="text-center py-2 bg-slate-800 text-white text-sm font-bold rounded-t-lg">
          विषयवार प्राप्तांक तालिका
        </div>
        <table className="w-full border border-slate-800">
          <thead>
            <tr className="bg-slate-800 text-white">
              <th className="border border-slate-700 p-2 text-xs font-bold text-center w-10">क्र.</th>
              <th className="border border-slate-700 p-2 text-xs font-bold text-left">विषय का नाम</th>
              <th className="border border-slate-700 p-2 text-xs font-bold text-center w-20">पूर्णांक</th>
              <th className="border border-slate-700 p-2 text-xs font-bold text-center w-20">प्राप्तांक</th>
              <th className="border border-slate-700 p-2 text-xs font-bold text-center w-16">प्रतिशत</th>
              <th className="border border-slate-700 p-2 text-xs font-bold text-center w-16">ग्रेड</th>
            </tr>
          </thead>
          <tbody>
            {data.subjects.map((sub, idx) => (
              <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                <td className="border border-slate-300 p-2 text-center text-sm font-semibold text-slate-600">
                  {idx + 1}
                </td>
                <td className="border border-slate-300 p-2 text-sm font-bold text-slate-900">
                  {sub.subject}
                </td>
                <td className="border border-slate-300 p-2 text-center font-mono text-sm text-slate-700">
                  {sub.maxMarks}
                </td>
                <td className="border border-slate-300 p-2 text-center font-mono font-bold text-lg text-emerald-900">
                  {sub.marks}
                </td>
                <td className="border border-slate-300 p-2 text-center text-sm font-bold text-blue-900">
                  {sub.percentage.toFixed(1)}%
                </td>
                <td className="border border-slate-300 p-2 text-center">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-black ${
                    sub.percentage >= 75 ? 'bg-amber-100 text-amber-900' :
                    sub.percentage >= 33 ? 'bg-green-100 text-green-900' :
                    'bg-red-100 text-red-900'
                  }`}>
                    {sub.grade}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-800 text-white font-bold border-t-2 border-slate-700">
              <td colSpan={2} className="border border-slate-700 p-3 text-right">
                कुल योग
              </td>
              <td className="border border-slate-700 p-3 text-center font-mono">
                {data.maxTotal}
              </td>
              <td className="border border-slate-700 p-3 text-center font-mono text-lg">
                {data.totalMarks}
              </td>
              <td className="border border-slate-700 p-3 text-center font-bold text-lg">
                {data.percentage.toFixed(1)}%
              </td>
              <td className="border border-slate-700 p-3 text-center font-bold text-lg">
                {data.finalGrade}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Result Boxes */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-emerald-50 border-2 border-emerald-200 rounded-lg p-4 text-center">
          <div className="text-xs font-bold text-emerald-800 uppercase tracking-wider mb-1">
            कुल प्राप्तांक
          </div>
          <div className="text-3xl font-black text-emerald-900">
            {data.totalMarks}
          </div>
          <div className="text-xs text-emerald-700 mt-1">
            / {data.maxTotal} अंक
          </div>
        </div>
        <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4 text-center">
          <div className="text-xs font-bold text-blue-800 uppercase tracking-wider mb-1">
            प्रतिशत
          </div>
          <div className="text-3xl font-black text-blue-900">
            {data.percentage.toFixed(1)}%
          </div>
          <div className="text-xs text-blue-700 mt-1">
            {data.result}
          </div>
        </div>
        <div className="bg-amber-50 border-2 border-amber-200 rounded-lg p-4 text-center">
          <div className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-1">
            श्रेणी
          </div>
          <div className="text-3xl font-black text-amber-900">
            {data.finalGrade}
          </div>
          <div className="text-xs text-amber-700 mt-1">
            {data.division}
          </div>
        </div>
      </div>

      {/* Remarks */}
      <div className="mb-6 p-4 border border-slate-300 rounded-lg bg-amber-50/50">
        <h3 className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-amber-700" />
          विशेष टिप्पणी
        </h3>
        <p className="text-sm text-slate-800">
          {data.percentage >= 33 ? (
            `विद्यार्थी ${data.studentName} ने ${data.term} परीक्षा उत्तीर्ण की है। कुल प्राप्तांक ${data.totalMarks} (${data.percentage}%) के साथ ${data.division} प्राप्त की है।`
          ) : (
            `विद्यार्थी ${data.studentName} को पुनः परीक्षा देनी चाहिए। कुल प्राप्तांक ${data.totalMarks} (${data.percentage}%) के साथ अनुत्तीर्ण घोषित किया जाता है।`
          )}
        </p>
      </div>

      {/* Signatures Section */}
      <div className="pt-8 border-t-2 border-slate-300">
        <div className="flex justify-between">
          <div className="text-center w-1/4">
            <div className="h-16 mb-2 border-b-2 border-dashed border-slate-400"></div>
            <p className="font-bold text-sm text-slate-900">कक्षा अध्यापक</p>
            <p className="text-xs text-slate-600">(Class Teacher)</p>
          </div>
          <div className="text-center w-1/4">
            <div className="h-16 mb-2 border-b-2 border-dashed border-slate-400"></div>
            <p className="font-bold text-sm text-slate-900">परीक्षा नियंत्रक</p>
            <p className="text-xs text-slate-600">(Exam Controller)</p>
          </div>
          <div className="text-center w-1/4">
            <div className="h-16 mb-2 border-b-2 border-dashed border-slate-400"></div>
            <p className="font-bold text-sm text-slate-900">प्राचार्य</p>
            <p className="text-xs text-slate-600">(Principal)</p>
          </div>
          {showSeal && (
            <div className="text-center w-1/4">
              <div className="h-16 w-16 mx-auto mb-2 border-2 border-red-400 rounded-full flex items-center justify-center">
                <span className="text-xs font-bold text-red-700 text-center">
                  SCHOOL SEAL
                </span>
              </div>
              <p className="font-bold text-sm text-slate-900">मुहर (Seal)</p>
              <p className="text-xs text-slate-600">और हस्ताक्षर</p>
            </div>
          )}
        </div>
      </div>

      {/* Footer Note */}
      <div className="mt-6 pt-4 border-t border-slate-200 text-xs text-slate-500 text-center">
        <p>
          यह एक प्रमाणित डिजिटल मार्कशीट है। आधिकारिक सत्यापन के लिए स्कूल प्रशासन से संपर्क करें।
        </p>
        <p className="mt-1 font-semibold">
          प्रिंट की तिथि: {new Date().toLocaleDateString('hi-IN')}
        </p>
      </div>
    </div>
  );
}
