'use client';

import React from 'react';
import { Award, TrendingUp, Hash, Smartphone, QrCode } from 'lucide-react';

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

interface ModernTemplateProps {
  data: ReportCardData;
  schoolName?: string;
  qrCodeUrl?: string;
  showAnalytics?: boolean;
}

export function ModernTemplate({ 
  data, 
  schoolName = "VidyaSetu Higher Secondary School",
  qrCodeUrl,
  showAnalytics = true 
}: ModernTemplateProps) {
  // Calculate performance data
  const bestSubject = [...data.subjects].sort((a, b) => b.percentage - a.percentage)[0];
  const lowestSubject = [...data.subjects].sort((a, b) => a.percentage - b.percentage)[0];
  const above80Subjects = data.subjects.filter(s => s.percentage >= 80).length;
  const totalSubjects = data.subjects.length;

  return (
    <div className="bg-white p-8 print:p-6" style={{ minHeight: '297mm', width: '210mm' }}>
      {/* Modern Gradient Header */}
      <div className="mb-8">
        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 rounded-2xl p-6 shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight">
                {schoolName}
              </h1>
              <p className="text-sm text-blue-100 mt-1">Digital Academic Transcript • {data.academicYear}</p>
            </div>
            <div className="text-right">
              <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 inline-block">
                <div className="text-xs font-bold text-white uppercase tracking-wider">Result ID</div>
                <div className="font-mono text-sm font-black text-white">
                  {data.scholarNumber.slice(-8).toUpperCase()}
                </div>
              </div>
            </div>
          </div>
          
          <div className="mt-4 flex items-center justify-center gap-4">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 flex items-center gap-3">
              <div className="bg-white rounded-lg p-2">
                <Hash className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <div className="text-xs text-blue-100">Student</div>
                <div className="font-black text-lg text-white">{data.studentName}</div>
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 flex items-center gap-3">
              <div className="bg-white rounded-lg p-2">
                <Award className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <div className="text-xs text-blue-100">Class</div>
                <div className="font-black text-lg text-white">{data.className} • {data.section}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Student Info Grid */}
      <div className="grid grid-cols-4 gap-3 mb-8">
        <div className="bg-slate-50 rounded-xl p-4">
          <div className="text-xs font-bold text-slate-500 mb-1">Scholarship No.</div>
          <div className="font-mono font-black text-slate-900">{data.scholarNumber}</div>
        </div>
        <div className="bg-slate-50 rounded-xl p-4">
          <div className="text-xs font-bold text-slate-500 mb-1">Roll No.</div>
          <div className="font-mono font-black text-slate-900">{data.rollNumber}</div>
        </div>
        <div className="bg-slate-50 rounded-xl p-4">
          <div className="text-xs font-bold text-slate-500 mb-1">Exam Term</div>
          <div className="font-bold text-slate-900">{data.term}</div>
        </div>
        <div className="bg-slate-50 rounded-xl p-4">
          <div className="text-xs font-bold text-slate-500 mb-1">Status</div>
          <div className={`font-black ${data.percentage >= 33 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {data.result}
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-3 gap-6 mb-8">
        {/* Marks Table */}
        <div className="col-span-2">
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="bg-slate-900 p-3">
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Subject-wise Performance
              </h3>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="p-3 text-left font-bold text-slate-700">Subject</th>
                  <th className="p-3 text-center font-bold text-slate-700">Marks</th>
                  <th className="p-3 text-center font-bold text-slate-700">Grade</th>
                  <th className="p-3 text-center font-bold text-slate-700">%</th>
                  <th className="p-3 text-right font-bold text-slate-700">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.subjects.map((sub, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="p-3 font-medium text-slate-900">{sub.subject}</td>
                    <td className="p-3 text-center font-mono">
                      <span className="font-black text-slate-900">{sub.marks}</span>
                      <span className="text-slate-500">/{sub.maxMarks}</span>
                    </td>
                    <td className="p-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-black ${
                        sub.percentage >= 90 ? 'bg-purple-100 text-purple-900' :
                        sub.percentage >= 75 ? 'bg-blue-100 text-blue-900' :
                        sub.percentage >= 60 ? 'bg-emerald-100 text-emerald-900' :
                        sub.percentage >= 33 ? 'bg-amber-100 text-amber-900' :
                        'bg-rose-100 text-rose-900'
                      }`}>
                        {sub.grade}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <div className="w-16 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div 
                            className={`h-full rounded-full ${
                              sub.percentage >= 90 ? 'bg-purple-500' :
                              sub.percentage >= 75 ? 'bg-blue-500' :
                              sub.percentage >= 60 ? 'bg-emerald-500' :
                              sub.percentage >= 33 ? 'bg-amber-500' :
                              'bg-rose-500'
                            }`}
                            style={{ width: `${Math.min(sub.percentage, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs font-bold text-slate-700">
                          {sub.percentage.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td className="p-3 text-right">
                      <span className={`text-xs font-bold px-2 py-1 rounded ${
                        sub.percentage >= 33 
                          ? 'bg-emerald-100 text-emerald-800' 
                          : 'bg-rose-100 text-rose-800'
                      }`}>
                        {sub.percentage >= 33 ? 'PASS' : 'FAIL'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-900 text-white">
                <tr>
                  <td colSpan={2} className="p-3 text-left font-bold">
                    <div className="flex items-center gap-2">
                      <Award className="h-4 w-4 text-blue-300" />
                      <span>TOTAL</span>
                    </div>
                  </td>
                  <td className="p-3 text-center font-black text-lg">
                    {data.finalGrade}
                  </td>
                  <td className="p-3 text-center font-black text-lg">
                    {data.percentage.toFixed(1)}%
                  </td>
                  <td className="p-3 text-right font-black">
                    {data.division}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Stats Sidebar */}
        <div className="space-y-4">
          {/* Overall Score */}
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-5 text-white shadow-lg">
            <div className="text-xs font-bold text-blue-100 mb-2">OVERALL SCORE</div>
            <div className="text-4xl font-black">{data.percentage.toFixed(1)}%</div>
            <div className="text-sm font-semibold mt-2">{data.result}</div>
            <div className="text-xs text-blue-200 mt-1">
              {data.totalMarks}/{data.maxTotal} marks
            </div>
          </div>

          {/* Performance Stats */}
          {showAnalytics && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <h4 className="text-xs font-bold text-slate-700 mb-3">PERFORMANCE INSIGHTS</h4>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600">Best Subject</span>
                  <span className="font-bold text-slate-900">{bestSubject.subject}</span>
                  <span className="text-xs font-black text-emerald-600">{bestSubject.percentage.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600">Subjects Above 80%</span>
                  <span className="font-bold text-slate-900">{above80Subjects}</span>
                  <span className="text-xs text-slate-500">out of {totalSubjects}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600">Overall Grade</span>
                  <span className="font-bold text-slate-900">{data.finalGrade}</span>
                  <span className="text-xs font-black text-indigo-600">{data.division}</span>
                </div>
              </div>
            </div>
          )}

          {/* QR Code / Verification */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <QrCode className="h-4 w-4 text-slate-600" />
                  <span className="text-xs font-bold text-slate-700">DIGITAL VERIFICATION</span>
                </div>
                <p className="text-xs text-slate-500">
                  Scan to verify authenticity online
                </p>
              </div>
              {qrCodeUrl ? (
                <img src={qrCodeUrl} alt="QR Code" className="h-20 w-20" />
              ) : (
                <div className="h-20 w-20 bg-white border border-slate-300 rounded flex items-center justify-center">
                  <div className="text-center">
                    <QrCode className="h-10 w-10 text-slate-400 mx-auto mb-1" />
                    <span className="text-xs text-slate-500">QR Code</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Mobile App */}
          <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="bg-white rounded-lg p-2">
                <Smartphone className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-emerald-800">DIGITAL APP</h4>
                <p className="text-xs text-emerald-700">
                  Download marksheet via school app
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Signatures */}
      <div className="border-t border-slate-200 pt-6">
        <div className="grid grid-cols-3 gap-6">
          <div className="text-center">
            <div className="mb-2">
              <div className="h-12 bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg mx-auto"></div>
            </div>
            <div className="text-sm font-bold text-slate-900">CLASS TEACHER</div>
            <div className="text-xs text-slate-500">Digitally Approved</div>
          </div>
          <div className="text-center">
            <div className="mb-2">
              <div className="h-12 bg-gradient-to-r from-indigo-50 to-indigo-100 rounded-lg mx-auto"></div>
            </div>
            <div className="text-sm font-bold text-slate-900">EXAM CONTROLLER</div>
            <div className="text-xs text-slate-500">Digital Signature</div>
          </div>
          <div className="text-center">
            <div className="mb-2">
              <div className="h-12 bg-gradient-to-r from-purple-50 to-purple-100 rounded-lg mx-auto"></div>
            </div>
            <div className="text-sm font-bold text-slate-900">PRINCIPAL</div>
            <div className="text-xs text-slate-500">School Seal & Signature</div>
          </div>
        </div>
      </div>

      {/* Footer Note */}
      <div className="mt-8 pt-4 border-t border-slate-200">
        <div className="flex justify-between items-center text-xs text-slate-500">
          <div>
            <div className="font-semibold">Digital Transcript ID: {data.scholarNumber}-{data.term}</div>
            <div>Generated on: {new Date().toLocaleDateString('en-US', { 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}</div>
          </div>
          <div className="text-right">
            <div>© {new Date().getFullYear()} {schoolName}</div>
            <div>Official School Software v2.0</div>
          </div>
        </div>
      </div>
    </div>
  );
}
