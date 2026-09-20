'use client';

import React from 'react';
import { School, Award, CheckCircle2 } from 'lucide-react';

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
    grade: string;
    percentage: number;
    remarks?: string;
  }>;
  totalMarks: number;
  maxTotal: number;
  percentage: number;
  finalGrade: string;
  result: string;
  division: string;
}

interface CBSETemplateProps {
  data: ReportCardData;
  schoolName?: string;
  schoolCode?: string;
  affiliationNo?: string;
  schoolLogo?: string;
}

export function CBSETemplate({ data, schoolName, schoolCode, affiliationNo, schoolLogo }: CBSETemplateProps) {
  return (
    <div className="bg-white p-8 print:p-6" style={{ minHeight: '297mm', width: '210mm' }}>
      {/* Header */}
      <div className="border-4 border-blue-900 rounded-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          {schoolLogo ? (
            <img src={schoolLogo} alt="School Logo" className="h-16 w-16 object-contain" />
          ) : (
            <div className="h-16 w-16 rounded-full bg-blue-100 flex items-center justify-center">
              <School className="h-8 w-8 text-blue-900" />
            </div>
          )}
          <div className="flex-1 text-center mx-4">
            <div className="text-xs font-bold text-blue-900 tracking-widest uppercase mb-1">CBSE AFFILIATED SCHOOL</div>
            <h1 className="text-2xl font-black text-blue-950 tracking-tight">
              {schoolName || 'विद्या सेतु उच्चतर माध्यमिक विद्यालय'}
            </h1>
            <p className="text-sm font-bold text-slate-700 mt-1">VIDYASETU HIGHER SECONDARY SCHOOL</p>
            <div className="flex items-center justify-center gap-4 mt-2 text-xs text-slate-600">
              <span>CBSE Affiliation: {affiliationNo || '1030894'}</span>
              <span>•</span>
              <span>School Code: {schoolCode || '50812'}</span>
            </div>
          </div>
          {schoolLogo ? (
            <img src={schoolLogo} alt="School Logo" className="h-16 w-16 object-contain" />
          ) : (
            <div className="h-16 w-16 rounded-full bg-blue-100 flex items-center justify-center">
              <Award className="h-8 w-8 text-blue-900" />
            </div>
          )}
        </div>
        <div className="bg-blue-900 text-white text-center py-2 rounded-lg">
          <h2 className="text-sm font-black tracking-wider uppercase">
            शैक्षणिक प्रगति पत्रक / Academic Progress Report
          </h2>
          <p className="text-xs font-semibold mt-1">{data.academicYear}</p>
        </div>
      </div>

      {/* Student Information */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-3 mb-6 bg-blue-50 p-5 rounded-xl border-2 border-blue-200">
        <div className="flex items-start">
          <span className="text-xs font-bold text-blue-900 w-32">Student Name:</span>
          <span className="text-sm font-black text-slate-900">{data.studentName}</span>
        </div>
        <div className="flex items-start">
          <span className="text-xs font-bold text-blue-900 w-32">Scholar No.:</span>
          <span className="text-sm font-black text-slate-900">{data.scholarNumber}</span>
        </div>
        <div className="flex items-start">
          <span className="text-xs font-bold text-blue-900 w-32">Class / Section:</span>
          <span className="text-sm font-bold text-slate-900">{data.className} - {data.section}</span>
        </div>
        <div className="flex items-start">
          <span className="text-xs font-bold text-blue-900 w-32">Roll Number:</span>
          <span className="text-sm font-bold text-slate-900">{data.rollNumber}</span>
        </div>
        <div className="flex items-start">
          <span className="text-xs font-bold text-blue-900 w-32">Father&apos;s Name:</span>
          <span className="text-sm font-semibold text-slate-800">{data.fatherName}</span>
        </div>
        <div className="flex items-start">
          <span className="text-xs font-bold text-blue-900 w-32">Date of Birth:</span>
          <span className="text-sm font-semibold text-slate-800">{data.dob}</span>
        </div>
        <div className="flex items-start">
          <span className="text-xs font-bold text-blue-900 w-32">Mother&apos;s Name:</span>
          <span className="text-sm font-semibold text-slate-800">{data.motherName}</span>
        </div>
        <div className="flex items-start">
          <span className="text-xs font-bold text-blue-900 w-32">Examination:</span>
          <span className="text-sm font-bold text-blue-900">{data.term}</span>
        </div>
      </div>

      {/* Marks Table */}
      <div className="mb-6">
        <table className="w-full border-2 border-blue-900">
          <thead>
            <tr className="bg-blue-900 text-white">
              <th className="border border-blue-800 p-2 text-xs font-bold text-center w-12">S.No.</th>
              <th className="border border-blue-800 p-2 text-xs font-bold text-left">Subject</th>
              <th className="border border-blue-800 p-2 text-xs font-bold text-center w-24">Max Marks</th>
              <th className="border border-blue-800 p-2 text-xs font-bold text-center w-24">Marks Obtained</th>
              <th className="border border-blue-800 p-2 text-xs font-bold text-center w-20">Grade</th>
              <th className="border border-blue-800 p-2 text-xs font-bold text-left w-32">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {data.subjects.map((sub, idx) => (
              <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-blue-50/50'}>
                <td className="border border-slate-300 p-2 text-center text-xs font-semibold text-slate-600">
                  {idx + 1}
                </td>
                <td className="border border-slate-300 p-2 text-sm font-bold text-slate-900">
                  {sub.subject}
                </td>
                <td className="border border-slate-300 p-2 text-center text-sm font-mono text-slate-700">
                  {sub.maxMarks}
                </td>
                <td className="border border-slate-300 p-2 text-center text-base font-black text-blue-900">
                  {sub.marks}
                </td>
                <td className="border border-slate-300 p-2 text-center">
                  <span className="inline-block px-2 py-1 bg-blue-100 text-blue-900 font-black text-sm rounded">
                    {sub.grade}
                  </span>
                </td>
                <td className="border border-slate-300 p-2 text-xs text-slate-600">
                  {sub.remarks || 'Good'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-blue-100 border-t-2 border-blue-900">
              <td colSpan={2} className="border border-slate-300 p-3 text-right font-bold text-slate-900">
                Grand Total:
              </td>
              <td className="border border-slate-300 p-3 text-center font-black text-slate-900">
                {data.maxTotal}
              </td>
              <td className="border border-slate-300 p-3 text-center font-black text-blue-900 text-lg">
                {data.totalMarks}
              </td>
              <td className="border border-slate-300 p-3 text-center font-black text-blue-900 text-lg">
                {data.finalGrade}
              </td>
              <td className="border border-slate-300 p-3 text-xs font-bold text-emerald-800">
                {data.percentage}% ({data.division})
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Grading Scale */}
      <div className="mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
        <h3 className="text-xs font-bold text-slate-700 mb-2">CBSE Grading Scale:</h3>
        <div className="grid grid-cols-5 gap-2 text-xs">
          <div className="text-center">
            <div className="font-bold text-slate-900">A+ (90-100%)</div>
            <div className="text-slate-600">Outstanding</div>
          </div>
          <div className="text-center">
            <div className="font-bold text-slate-900">A (75-89%)</div>
            <div className="text-slate-600">Excellent</div>
          </div>
          <div className="text-center">
            <div className="font-bold text-slate-900">B+ (60-74%)</div>
            <div className="text-slate-600">Very Good</div>
          </div>
          <div className="text-center">
            <div className="font-bold text-slate-900">B (45-59%)</div>
            <div className="text-slate-600">Good</div>
          </div>
          <div className="text-center">
            <div className="font-bold text-slate-900">C (33-44%)</div>
            <div className="text-slate-600">Satisfactory</div>
          </div>
        </div>
      </div>

      {/* Result Summary */}
      <div className={`mb-6 p-5 rounded-xl border-2 flex items-center justify-between ${
        data.percentage >= 33 
          ? 'bg-emerald-50 border-emerald-500' 
          : 'bg-rose-50 border-rose-500'
      }`}>
        <div>
          <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Final Result</h3>
          <p className={`text-2xl font-black ${data.percentage >= 33 ? 'text-emerald-900' : 'text-rose-900'}`}>
            {data.result}
          </p>
          <p className="text-sm font-bold text-slate-700 mt-1">{data.division}</p>
        </div>
        <div className={`h-20 w-20 rounded-full flex items-center justify-center border-4 ${
          data.percentage >= 33 
            ? 'bg-emerald-600 border-emerald-700' 
            : 'bg-rose-600 border-rose-700'
        }`}>
          {data.percentage >= 33 ? (
            <CheckCircle2 className="h-10 w-10 text-white" />
          ) : (
            <span className="text-3xl font-black text-white">{data.finalGrade}</span>
          )}
        </div>
      </div>

      {/* Signatures */}
      <div className="grid grid-cols-3 gap-8 pt-6 border-t-2 border-slate-200">
        <div className="text-center">
          <div className="h-16 mb-2"></div>
          <div className="border-t-2 border-slate-400 pt-2">
            <p className="font-bold text-sm text-slate-900">Class Teacher</p>
            <p className="text-xs text-slate-600">कक्षा अध्यापक</p>
          </div>
        </div>
        <div className="text-center">
          <div className="h-16 mb-2"></div>
          <div className="border-t-2 border-slate-400 pt-2">
            <p className="font-bold text-sm text-slate-900">Exam Controller</p>
            <p className="text-xs text-slate-600">परीक्षा नियंत्रक</p>
          </div>
        </div>
        <div className="text-center">
          <div className="h-16 mb-2"></div>
          <div className="border-t-2 border-slate-400 pt-2">
            <p className="font-bold text-sm text-slate-900">Principal</p>
            <p className="text-xs text-slate-600">प्राचार्य (मुहर सहित)</p>
          </div>
        </div>
      </div>
    </div>
  );
}
