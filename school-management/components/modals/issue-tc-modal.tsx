'use client';

import React, { useState } from 'react';
import { X, FileText, Printer, CheckCircle2, AlertTriangle, School, Award, ShieldCheck } from 'lucide-react';

interface IssueTcModalProps {
  isOpen: boolean;
  student: any | null;
  onClose: () => void;
  onSuccess?: (student: any) => void;
  userRole?: string;
}

export function IssueTcModal({ isOpen, student, onClose, onSuccess, userRole }: IssueTcModalProps) {
  const [tcNumber, setTcNumber] = useState(`TC/2026/${Math.floor(100 + Math.random() * 900)}`);
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [applicationDate, setApplicationDate] = useState(new Date().toISOString().split('T')[0]);
  const [reason, setReason] = useState('माता-पिता के स्थानांतरण के कारण (Parents Transfer)');
  const [promotionStatus, setPromotionStatus] = useState('हां, उच्च कक्षा में पदोन्नति हेतु पात्र (Promoted)');
  const [feesDues, setFeesDues] = useState('मार्च 2026 तक समस्त शुल्क चुकता (All Dues Cleared)');
  const [conduct, setConduct] = useState('उत्कृष्ट एवं चरित्रवान (Good & Exemplary)');
  const [workingDays, setWorkingDays] = useState('210');
  const [presentDays, setPresentDays] = useState('194');
  const [remarks, setRemarks] = useState('उज्ज्वल भविष्य की शुभकामनाएं।');
  const [annualResult, setAnnualResult] = useState('उत्तीर्ण (Passed & Qualified)');
  const [issuing, setIssuing] = useState(false);
  const [issued, setIssued] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen || !student) return null;

  const isAlreadyIssued = student.status === 'TC_Issued' || student.status === 'tc_issued' || issued;
  const canIssue = userRole === 'Director' || userRole === 'Principal';

  const handleIssueTc = async (e: React.FormEvent) => {
    e.preventDefault();
    setIssuing(true);
    setError('');
    try {
      const res = await fetch(`/api/students/${student.id}/issue-tc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason,
          tcNumber,
          issueDate,
          applicationDate,
          promotionStatus,
          conduct,
          annualResult,
          feesDues,
          workingDays,
          presentDays,
          remarks,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIssued(true);
        if (onSuccess) {
          onSuccess({ ...student, status: 'TC_Issued', tcIssueDate: issueDate });
        }
      } else {
        setError(data.message || 'टीसी निर्गत करने में त्रुटि हुई।');
      }
    } catch {
      setError('सर्वर से संपर्क करने में असमर्थ।');
    } finally {
      setIssuing(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs overflow-y-auto">
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] my-auto">
        {/* Modal Top Bar (Hidden in Print) */}
        <div className="bg-gradient-to-r from-amber-700 to-amber-900 p-4 text-white flex items-center justify-between shrink-0 print:hidden">
          <div className="flex items-center gap-2.5">
            <FileText className="h-5 w-5 text-amber-300" />
            <div>
              <h2 className="text-sm font-bold">
                {isAlreadyIssued
                  ? 'स्थानांतरण प्रमाण पत्र (Transfer Certificate View & Print)'
                  : 'स्थानांतरण प्रमाण पत्र निर्गमन (Issue TC)'}
              </h2>
              <p className="text-[11px] text-amber-200">
                {student.fullName} • स्कॉलर क्रमांक: {student.scholarNumber || student.rollNumber}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-slate-900 hover:bg-slate-100 rounded-lg text-xs font-bold shadow-xs cursor-pointer"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>प्रिंट करें (Print)</span>
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 hover:bg-white/10 text-white transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto grow space-y-6">
          {/* If NOT yet issued, show Quick Parameter Form (Hidden in Print) */}
          {!isAlreadyIssued && canIssue && (
            <form onSubmit={handleIssueTc} className="p-4 bg-amber-50/70 border border-amber-200 rounded-xl space-y-3 print:hidden text-xs">
              <div className="flex items-center gap-2 text-amber-900 font-bold">
                <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0" />
                <span>टी.सी. विवरण प्रविष्टि (प्रमाण पत्र जारी करने हेतु पुष्टि करें):</span>
              </div>

              {error && <div className="text-rose-600 font-semibold">{error}</div>}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">टी.सी. क्रमांक (TC No.)</label>
                  <input
                    type="text"
                    value={tcNumber}
                    onChange={(e) => setTcNumber(e.target.value)}
                    className="w-full bg-white border border-amber-300 rounded p-1.5 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">आवेदन दिनांक</label>
                  <input
                    type="date"
                    value={applicationDate}
                    onChange={(e) => setApplicationDate(e.target.value)}
                    className="w-full bg-white border border-amber-300 rounded p-1.5"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">निर्गमन दिनांक</label>
                  <input
                    type="date"
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                    className="w-full bg-white border border-amber-300 rounded p-1.5"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">विद्यालय छोड़ने का कारण (Reason)</label>
                  <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full bg-white border border-amber-300 rounded p-1.5"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">आचरण व चरित्र (Conduct)</label>
                  <input
                    type="text"
                    value={conduct}
                    onChange={(e) => setConduct(e.target.value)}
                    className="w-full bg-white border border-amber-300 rounded p-1.5"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">वार्षिक परीक्षा परिणाम (Annual Result)</label>
                  <input
                    type="text"
                    value={annualResult}
                    onChange={(e) => setAnnualResult(e.target.value)}
                    className="w-full bg-white border border-amber-300 rounded p-1.5"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">पदोन्नति स्थिति (Promotion)</label>
                  <input
                    type="text"
                    value={promotionStatus}
                    onChange={(e) => setPromotionStatus(e.target.value)}
                    className="w-full bg-white border border-amber-300 rounded p-1.5"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">शुल्क चुकता (Fees Dues)</label>
                  <input
                    type="text"
                    value={feesDues}
                    onChange={(e) => setFeesDues(e.target.value)}
                    className="w-full bg-white border border-amber-300 rounded p-1.5"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-700 font-medium mb-1">कार्य दिवस</label>
                    <input
                      type="number"
                      value={workingDays}
                      onChange={(e) => setWorkingDays(e.target.value)}
                      className="w-full bg-white border border-amber-300 rounded p-1.5"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-medium mb-1">उपस्थित दिवस</label>
                    <input
                      type="number"
                      value={presentDays}
                      onChange={(e) => setPresentDays(e.target.value)}
                      className="w-full bg-white border border-amber-300 rounded p-1.5"
                    />
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-slate-700 font-medium mb-1">अन्य टिप्पणी (Remarks)</label>
                  <input
                    type="text"
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    className="w-full bg-white border border-amber-300 rounded p-1.5"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-amber-200">
                <button
                  type="submit"
                  disabled={issuing}
                  className="px-5 py-2 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-bold shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {issuing ? 'निर्गत हो रही है...' : 'हां, टी.सी. निर्गत करें (Issue TC Now)'}
                </button>
              </div>
            </form>
          )}

          {!isAlreadyIssued && !canIssue && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-semibold print:hidden">
              <AlertTriangle className="h-4 w-4 inline mr-2" />
              केवल निदेशक (Director) या प्राचार्य (Principal) ही टी.सी. निर्गत कर सकते हैं।
            </div>
          )}

          {/* Official Printable 18-Point Bilingual TC Layout */}
          <div className="border-4 border-double border-slate-800 p-6 sm:p-8 bg-white text-slate-900 shadow-sm print:border-2 print:p-2 print:shadow-none space-y-5">
            {/* Header */}
            <div className="text-center border-b-2 border-slate-900 pb-4 relative">
              <div className="flex items-center justify-center gap-2 text-slate-800 font-bold text-xs uppercase tracking-wider mb-1">
                <School className="h-4 w-4" />
                <span>शिक्षा विभाग • मध्य प्रदेश शासन मान्यता प्राप्त</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-950 uppercase">
                प्रज्ञा मित्र उच्चतर माध्यमिक विद्यालय
              </h1>
              <h2 className="text-xs font-extrabold tracking-widest text-slate-700 uppercase">
                PRAGNYA MITRA HIGHER SECONDARY SCHOOL
              </h2>
              <p className="text-[11px] text-slate-600 mt-1">
                संस्था मान्यता कोड: 231405098 • डी.आई.एस.ई. (DISE) कोड: 23200109923
              </p>
              <div className="mt-3 inline-block border-2 border-slate-900 bg-slate-100 px-6 py-1 text-sm font-black uppercase tracking-wider">
                स्थानांतरण प्रमाण पत्र / TRANSFER CERTIFICATE
              </div>
            </div>

            {/* TC Meta Numbers */}
            <div className="flex justify-between items-center text-xs font-bold border-b border-slate-300 pb-2">
              <span>
                टी.सी. क्रमांक (TC No.): <span className="font-mono text-blue-900">{tcNumber}</span>
              </span>
              <span>
                स्कॉलर / एस.आर. क्रमांक (SR No.):{' '}
                <span className="font-mono text-blue-900">{student.scholarNumber || student.rollNumber}</span>
              </span>
              <span>
                दिनांक (Date): <span className="font-mono">{issueDate}</span>
              </span>
            </div>

            {/* 18-point Numbered Rows */}
            <div className="space-y-2 text-xs font-medium text-slate-800">
              <div className="flex items-baseline justify-between border-b border-dashed border-slate-200 pb-1">
                <span className="w-3/5">1. विद्यार्थी का पूरा नाम (Name of Pupil):</span>
                <span className="w-2/5 font-bold text-slate-950 uppercase text-right">{student.fullName}</span>
              </div>

              <div className="flex items-baseline justify-between border-b border-dashed border-slate-200 pb-1">
                <span className="w-3/5">2. माता का नाम (Mother&apos;s Name):</span>
                <span className="w-2/5 font-semibold text-right">{student.motherName || 'श्रीमती ' + (student.fatherName ? student.fatherName.split(' ')[0] + ' देवी' : 'रिकॉर्ड में नहीं')}</span>
              </div>

              <div className="flex items-baseline justify-between border-b border-dashed border-slate-200 pb-1">
                <span className="w-3/5">3. पिता / अभिभावक का नाम (Father&apos;s / Guardian&apos;s Name):</span>
                <span className="w-2/5 font-semibold text-right">{student.fatherName || student.parentName || '—'}</span>
              </div>

              <div className="flex items-baseline justify-between border-b border-dashed border-slate-200 pb-1">
                <span className="w-3/5">4. राष्ट्रीयता एवं सामाजिक श्रेणी (Nationality & Category):</span>
                <span className="w-2/5 text-right font-semibold">भारतीय (Indian) • {student.category || 'General'}</span>
              </div>

              <div className="flex items-baseline justify-between border-b border-dashed border-slate-200 pb-1">
                <span className="w-3/5">5. विद्यालय में प्रथम प्रवेश दिनांक व कक्षा (Date of first admission with class):</span>
                <span className="w-2/5 text-right font-semibold">{student.admissionDate || '01-07-2024'} (कक्षा {student.className})</span>
              </div>

              <div className="flex items-baseline justify-between border-b border-dashed border-slate-200 pb-1">
                <span className="w-3/5">6. जन्म तिथि (Date of Birth in figures & words):</span>
                <span className="w-2/5 text-right font-bold text-slate-900">{student.dob || '—'}</span>
              </div>

              <div className="flex items-baseline justify-between border-b border-dashed border-slate-200 pb-1">
                <span className="w-3/5">7. अंतिम अध्ययनरत कक्षा (Class in which pupil last studied):</span>
                <span className="w-2/5 text-right font-bold text-slate-900">कक्षा {student.className} - वर्ग {student.section}</span>
              </div>

              <div className="flex items-baseline justify-between border-b border-dashed border-slate-200 pb-1">
                <span className="w-3/5">8. विद्यालय / बोर्ड वार्षिक परीक्षा परिणाम (Annual Exam Result):</span>
                <span className="w-2/5 text-right font-semibold text-emerald-800">{annualResult}</span>
              </div>

              <div className="flex items-baseline justify-between border-b border-dashed border-slate-200 pb-1">
                <span className="w-3/5">9. क्या उच्च कक्षा में पदोन्नति हेतु पात्र हैं (Whether qualified for promotion):</span>
                <span className="w-2/5 text-right font-semibold text-emerald-800">{promotionStatus}</span>
              </div>

              <div className="flex items-baseline justify-between border-b border-dashed border-slate-200 pb-1">
                <span className="w-3/5">10. विद्यालय शुल्क चुकता माह (Month up to which school dues paid):</span>
                <span className="w-2/5 text-right font-semibold">{feesDues}</span>
              </div>

              <div className="flex items-baseline justify-between border-b border-dashed border-slate-200 pb-1">
                <span className="w-3/5">11. कुल शैक्षणिक कार्य दिवस एवं उपस्थिति (Total working days & presence):</span>
                <span className="w-2/5 text-right font-mono font-semibold">{presentDays} / {workingDays} दिवस</span>
              </div>

              <div className="flex items-baseline justify-between border-b border-dashed border-slate-200 pb-1">
                <span className="w-3/5">12. सामान्य आचरण एवं चरित्र (General Conduct & Character):</span>
                <span className="w-2/5 text-right font-bold text-slate-900">{conduct}</span>
              </div>

              <div className="flex items-baseline justify-between border-b border-dashed border-slate-200 pb-1">
                <span className="w-3/5">13. प्रमाण पत्र हेतु आवेदन दिनांक (Date of application for certificate):</span>
                <span className="w-2/5 text-right font-mono">{applicationDate}</span>
              </div>

              <div className="flex items-baseline justify-between border-b border-dashed border-slate-200 pb-1">
                <span className="w-3/5">14. प्रमाण पत्र निर्गमन दिनांक (Date of issue of certificate):</span>
                <span className="w-2/5 text-right font-mono font-bold text-blue-900">{issueDate}</span>
              </div>

              <div className="flex items-baseline justify-between border-b border-dashed border-slate-200 pb-1">
                <span className="w-3/5">15. विद्यालय छोड़ने का कारण (Reason for leaving the school):</span>
                <span className="w-2/5 text-right font-bold text-slate-900">{reason}</span>
              </div>

              <div className="flex items-baseline justify-between border-b border-dashed border-slate-200 pb-1">
                <span className="w-3/5">16. अन्य विशेष टिप्पणी (Any other remarks):</span>
                <span className="w-2/5 text-right font-semibold text-slate-700">{remarks}</span>
              </div>
            </div>

            {/* Certification Statement */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-700 text-center italic">
              प्रमाणित किया जाता है कि उपरोक्त विवरण विद्यालय के अधिकृत स्कॉलर रजिस्टर (दाखिला-खारिज पंजिका) के अनुसार पूर्णतः सत्य एवं सत्यापित है।
            </div>

            {/* Signatures */}
            <div className="pt-12 grid grid-cols-3 gap-4 text-center text-xs text-slate-800">
              <div>
                <div className="h-10 border-b border-dashed border-slate-400 mb-2"></div>
                <p className="font-bold">कक्षा अध्यापक</p>
                <span className="text-[10px] text-slate-500">Class Teacher</span>
              </div>
              <div>
                <div className="h-10 border-b border-dashed border-slate-400 mb-2"></div>
                <p className="font-bold">जांचकर्ता / मुख्य लिपिक</p>
                <span className="text-[10px] text-slate-500">Checked by Clerk</span>
              </div>
              <div>
                <div className="h-10 border-b border-dashed border-slate-400 mb-2"></div>
                <p className="font-bold">प्राचार्य (मुद्रा सहित)</p>
                <span className="text-[10px] text-slate-500">Principal & Seal</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer (Hidden in Print) */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0 print:hidden text-xs">
          <span className="text-slate-500">प्रज्ञा मित्र शासकीय मान्यता प्राप्त टी.सी. मॉड्यूल</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 font-bold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100"
          >
            बंद करें
          </button>
        </div>
      </div>
    </div>
  );
}
