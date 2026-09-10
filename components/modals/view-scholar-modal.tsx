'use client';

import React, { useState } from 'react';
import { X, Award, Phone, Mail, MapPin, Calendar, FileBadge, Building, CreditCard, AlertCircle } from 'lucide-react';

interface ViewScholarModalProps {
  student: any | null;
  onClose: () => void;
  onIssueTc: (studentId: string) => void;
  canManage: boolean; // Director or Principal
}

export function ViewScholarModal({ student, onClose, onIssueTc, canManage }: ViewScholarModalProps) {
  const [confirmTc, setConfirmTc] = useState(false);
  const [tcReason, setTcReason] = useState('माता-पिता के स्थानांतरण के कारण');
  const [issuing, setIssuing] = useState(false);

  if (!student) return null;

  const handleTcSubmit = async () => {
    try {
      setIssuing(true);
      const res = await fetch(`/api/students/${student.id}/issue-tc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: tcReason }),
      });
      const data = await res.json();
      if (data.success) {
        onIssueTc(student.id);
        setConfirmTc(false);
        onClose();
      }
    } catch {
      //
    } finally {
      setIssuing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-6 text-white flex items-start justify-between shrink-0">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center text-xl font-black shadow-inner">
              {student.fullName?.slice(0, 1) || 'छ'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold">{student.fullName}</h2>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                  student.status === 'Active' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                  student.status === 'TC_Issued' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                  'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                }`}>
                  {student.status === 'Active' ? 'सक्रिय (Active)' : student.status === 'TC_Issued' ? 'टी.सी. निर्गत (TC Issued)' : student.status}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1 flex items-center gap-2">
                <span>कक्षा: <strong className="text-white">{student.className} - वर्ग {student.section}</strong></span>
                <span>•</span>
                <span>रोल नंबर: <strong className="text-white">{student.rollNumber}</strong></span>
              </p>
              <div className="inline-block mt-2 px-3 py-1 bg-blue-500/20 text-blue-200 border border-blue-400/30 rounded-lg text-xs font-bold">
                स्कॉलर क्रमांक (SR No.): {student.scholarNumber}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 overflow-y-auto grow">
          {/* Guardian & Contacts */}
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">माता-पिता एवं पारिवारिक विवरण</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
              <div>
                <span className="text-slate-500">पिता का नाम:</span>
                <p className="font-semibold text-slate-800 text-sm mt-0.5">{student.fatherName} {student.fatherOccupation ? `(${student.fatherOccupation})` : ''}</p>
              </div>
              <div>
                <span className="text-slate-500">माता का नाम:</span>
                <p className="font-semibold text-slate-800 text-sm mt-0.5">{student.motherName || 'रिकॉर्ड में नहीं'}</p>
              </div>
              <div className="flex items-center gap-2 pt-2 border-t border-slate-200/60 sm:col-span-2">
                <Phone className="h-4 w-4 text-emerald-600 shrink-0" />
                <span className="text-slate-600">फोन: <strong className="text-slate-900">{student.parentPhone}</strong></span>
                {student.whatsappNumber && (
                  <span className="text-slate-500 ml-3">व्हाट्सएप: {student.whatsappNumber}</span>
                )}
              </div>
              {student.email && (
                <div className="flex items-center gap-2 sm:col-span-2">
                  <Mail className="h-4 w-4 text-blue-600 shrink-0" />
                  <span className="text-slate-600">ईमेल: <strong className="text-slate-900">{student.email}</strong></span>
                </div>
              )}
            </div>
          </div>

          {/* Personal & Government Identity */}
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">व्यक्तिगत व सरकारी पहचान</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
              <div>
                <span className="text-slate-500">जन्म तिथि:</span>
                <p className="font-semibold text-slate-800 mt-0.5">{student.dob}</p>
              </div>
              <div>
                <span className="text-slate-500">लिंग:</span>
                <p className="font-semibold text-slate-800 mt-0.5">{student.gender === 'Male' ? 'छात्र' : student.gender === 'Female' ? 'छात्रा' : student.gender}</p>
              </div>
              <div>
                <span className="text-slate-500">श्रेणी:</span>
                <p className="font-semibold text-slate-800 mt-0.5">{student.category}</p>
              </div>
              <div>
                <span className="text-slate-500">रक्त समूह:</span>
                <p className="font-semibold text-rose-600 mt-0.5">{student.bloodGroup}</p>
              </div>
              <div className="sm:col-span-2 pt-2 border-t border-slate-200/60">
                <span className="text-slate-500">आधार कार्ड नंबर:</span>
                <p className="font-semibold text-slate-800 mt-0.5 tracking-wider">{student.aadhaarNumber || 'उपलब्ध नहीं'}</p>
              </div>
              <div className="sm:col-span-2 pt-2 border-t border-slate-200/60">
                <span className="text-slate-500">समग्र / परिवार आईडी:</span>
                <p className="font-semibold text-slate-800 mt-0.5">{student.samagraId || 'उपलब्ध नहीं'}</p>
              </div>
            </div>
          </div>

          {/* Addresses */}
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">आवासीय पता</h3>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs space-y-2">
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <span className="text-slate-500">वर्तमान पता:</span>
                  <p className="font-semibold text-slate-800 mt-0.5">{student.currentAddress || 'रिकॉर्ड में दर्ज नहीं'}</p>
                </div>
              </div>
              {student.permanentAddress && student.permanentAddress !== student.currentAddress && (
                <div className="pt-2 border-t border-slate-200/60">
                  <span className="text-slate-500">स्थायी पता:</span>
                  <p className="font-semibold text-slate-800 mt-0.5">{student.permanentAddress}</p>
                </div>
              )}
            </div>
          </div>

          {/* Academic & Bank */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">पूर्व विद्यालय रिकॉर्ड</h3>
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs space-y-1">
                <p className="text-slate-500">पूर्व स्कूल: <strong className="text-slate-800">{student.previousSchool || 'लागू नहीं (प्रथम प्रवेश)'}</strong></p>
                <p className="text-slate-500">पूर्व टी.सी.: <strong className="text-slate-800">{student.previousTcNo || 'उपलब्ध नहीं'}</strong></p>
                <p className="text-slate-500">प्रवेश दिनांक: <strong className="text-slate-800">{student.admissionDate}</strong></p>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">बैंक खाता विवरण (DBT)</h3>
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs space-y-1">
                <p className="text-slate-500">खाता सं.: <strong className="text-slate-800">{student.bankAccountNo || 'खाता लिंक नहीं है'}</strong></p>
                <p className="text-slate-500">बैंक: <strong className="text-slate-800">{student.bankName || '—'}</strong></p>
                <p className="text-slate-500">IFSC: <strong className="text-slate-800">{student.ifscCode || '—'}</strong></p>
              </div>
            </div>
          </div>

          {/* TC Issue Section */}
          {canManage && student.status === 'Active' && (
            <div className="pt-4 border-t border-slate-200">
              {!confirmTc ? (
                <div className="flex items-center justify-between p-3 bg-amber-50 rounded-xl border border-amber-200">
                  <div className="text-xs text-amber-900">
                    <strong>स्थानांतरण प्रमाण पत्र (TC):</strong> यदि छात्र विद्यालय छोड़ रहा है, तो यहां से टीसी जारी करें।
                  </div>
                  <button
                    onClick={() => setConfirmTc(true)}
                    className="px-3.5 py-1.5 text-xs font-bold text-amber-900 bg-amber-200 hover:bg-amber-300 rounded-lg transition-colors shrink-0"
                  >
                    टी.सी. जारी करें
                  </button>
                </div>
              ) : (
                <div className="p-4 bg-amber-50 rounded-xl border border-amber-300 space-y-3">
                  <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
                    <AlertCircle className="h-4 w-4 text-amber-700" />
                    <span>क्या आप निश्चित रूप से {student.fullName} के लिए टी.सी. जारी करना चाहते हैं?</span>
                  </div>
                  <input
                    type="text"
                    value={tcReason}
                    onChange={(e) => setTcReason(e.target.value)}
                    placeholder="टीसी जारी करने का कारण..."
                    className="w-full text-xs rounded-lg border border-amber-300 bg-white p-2 focus:outline-hidden"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => setConfirmTc(false)}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-lg"
                    >
                      रद्द करें
                    </button>
                    <button
                      onClick={handleTcSubmit}
                      disabled={issuing}
                      className="px-4 py-1.5 text-xs font-bold text-white bg-amber-700 hover:bg-amber-800 rounded-lg shadow-xs"
                    >
                      {issuing ? 'जारी हो रही है...' : 'हां, टी.सी. निर्गत करें'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <span className="text-xs text-slate-500">विद्या सेतु स्कूल प्रबंधन प्रणाली • स्कॉलर रजिस्टर</span>
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-xl transition-colors shadow-xs"
          >
            बंद करें
          </button>
        </div>
      </div>
    </div>
  );
}
