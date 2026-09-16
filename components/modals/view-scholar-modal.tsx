import React, { useState, useEffect } from 'react';
import {
  X,
  Award,
  Phone,
  Mail,
  MapPin,
  Calendar,
  FileBadge,
  Building,
  CreditCard,
  AlertCircle,
  FileText,
  Printer,
  History,
  UserCheck,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  School,
} from 'lucide-react';
import { IssueTcModal } from './issue-tc-modal';
import { ReAdmissionModal } from './re-admission-modal';

interface ViewScholarModalProps {
  student: any | null;
  onClose: () => void;
  onIssueTc: (studentId: string) => void;
  canManage: boolean; // Director or Principal or assigned Class Teacher
  onStudentUpdated?: (updatedStudent: any) => void;
  assignedClasses?: string[];
  userRole?: 'Director' | 'Principal' | 'Staff';
}

export function ViewScholarModal({
  student,
  onClose,
  onIssueTc,
  canManage,
  onStudentUpdated,
  assignedClasses = [],
  userRole = 'Director',
}: ViewScholarModalProps) {
  const [isTcModalOpen, setIsTcModalOpen] = useState(false);
  const [isReAdmitOpen, setIsReAdmitOpen] = useState(false);
  const [historyList, setHistoryList] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    if (!student || !student.id) return;
    let active = true;
    setHistoryLoading(true);

    fetch(`/api/students/${student.id}/history`)
      .then((res) => res.json())
      .then((data) => {
        if (active && data.success && Array.isArray(data.history)) {
          setHistoryList(data.history);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setHistoryLoading(false);
      });

    return () => {
      active = false;
    };
  }, [student?.id, student?.status]);

  if (!student) return null;

  const isTcIssued = student.status === 'TC_Issued';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs overflow-y-auto">
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] my-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 p-6 text-white flex items-start justify-between shrink-0">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center text-xl font-black shadow-inner shrink-0">
              {student.fullName?.slice(0, 1) || 'छ'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold">{student.fullName}</h2>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    student.status === 'Active'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : isTcIssued
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                  }`}
                >
                  {student.status === 'Active'
                    ? 'सक्रिय (Active)'
                    : isTcIssued
                    ? 'टी.सी. निर्गत (TC Issued)'
                    : student.status}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1 flex items-center gap-2">
                <span>
                  कक्षा: <strong className="text-white">{student.className} - वर्ग {student.section}</strong>
                </span>
                <span>•</span>
                <span>
                  रोल नंबर: <strong className="text-white">{student.rollNumber || '—'}</strong>
                </span>
              </p>
              <div className="inline-block mt-2 px-3 py-1 bg-blue-500/20 text-blue-200 border border-blue-400/30 rounded-lg text-xs font-bold">
                स्कॉलर क्रमांक (SR No.): {student.scholarNumber}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 overflow-y-auto grow">
          {/* TC & Re-Admission Action Banner */}
          {isTcIssued ? (
            <div className="p-4 bg-gradient-to-r from-amber-50 to-emerald-50 rounded-2xl border-2 border-amber-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
              <div className="flex items-start gap-3 text-amber-950">
                <FileBadge className="h-6 w-6 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-black text-sm flex items-center gap-2 text-amber-900">
                    <span>स्थानांतरण प्रमाण पत्र (TC) निर्गत है</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 font-bold">
                      पूर्व छात्र
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5">
                    निर्गमन दिनांक: <strong>{student.tcIssueDate || 'सत्र 2025-26'}</strong> • क्या छात्र 1 वर्ष या कुछ
                    समय बाद पुनः वापस आया है?
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setIsTcModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-amber-950 bg-amber-200 hover:bg-amber-300 rounded-xl transition cursor-pointer"
                  title="पुरानी टीसी देखें"
                >
                  <Printer className="h-3.5 w-3.5" />
                  <span>टीसी देखें</span>
                </button>
                <button
                  onClick={() => setIsReAdmitOpen(true)}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md transition hover:scale-102 cursor-pointer"
                >
                  <UserCheck className="h-4 w-4" />
                  <span>पुनः प्रवेश दर्ज करें (Re-Admit)</span>
                </button>
              </div>
            </div>
          ) : (
            canManage && (
              <div className="flex items-center justify-between p-3.5 bg-amber-50/70 rounded-xl border border-amber-200 text-xs">
                <div className="text-amber-900">
                  <strong>स्थानांतरण प्रमाण पत्र (TC):</strong> विद्यार्थी द्वारा स्कूल छोड़ने पर अधिकृत टी.सी. जारी करें।
                </div>
                <button
                  onClick={() => setIsTcModalOpen(true)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-amber-950 bg-amber-200 hover:bg-amber-300 rounded-lg transition-colors shrink-0 cursor-pointer"
                >
                  <FileText className="h-4 w-4" />
                  <span>टी.सी. जारी करें (Issue TC)</span>
                </button>
              </div>
            )
          )}

          {/* Academic History Timeline */}
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 mb-4">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                <History className="h-4 w-4 text-blue-600" />
                <span>विद्यार्थी शैक्षणिक इतिहास एवं प्रवेश/टीसी टाइमलाइन (Academic Journey)</span>
              </div>
              <span className="text-[11px] text-slate-500 font-medium">
                कुल घटनाएं: {historyList.length}
              </span>
            </div>

            {historyLoading ? (
              <div className="p-6 text-center text-xs text-slate-500">इतिहास लोड हो रहा है...</div>
            ) : historyList.length === 0 ? (
              <div className="p-4 bg-slate-50 rounded-xl text-center text-xs text-slate-500">
                कोई पूर्व इतिहास उपलब्ध नहीं है।
              </div>
            ) : (
              <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                {historyList.map((item, idx) => {
                  const isInit = item.eventType === 'Initial_Admission';
                  const isTc = item.eventType === 'TC_Issued';
                  const isReadmit = item.eventType === 'Re_Admission';

                  return (
                    <div key={item.id || idx} className="relative group">
                      {/* Timeline dot */}
                      <div
                        className={`absolute -left-6 top-1 h-5 w-5 rounded-full border-2 flex items-center justify-center text-[9px] font-bold ${
                          isInit
                            ? 'bg-blue-600 border-blue-200 text-white'
                            : isTc
                            ? 'bg-amber-500 border-amber-200 text-white'
                            : isReadmit
                            ? 'bg-emerald-600 border-emerald-200 text-white'
                            : 'bg-indigo-600 border-indigo-200 text-white'
                        }`}
                      >
                        {isInit ? '1' : isTc ? '2' : isReadmit ? '3' : '•'}
                      </div>

                      <div className="bg-slate-50 hover:bg-slate-100/80 p-3.5 rounded-xl border border-slate-200 transition-colors">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                                isInit
                                  ? 'bg-blue-100 text-blue-800'
                                  : isTc
                                  ? 'bg-amber-100 text-amber-800'
                                  : isReadmit
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-slate-200 text-slate-700'
                              }`}
                            >
                              {isInit
                                ? '🟢 प्रथम प्रवेश (Initial Admission)'
                                : isTc
                                ? '🟠 टी.सी. निर्गमन (TC Issued)'
                                : isReadmit
                                ? '🎉 पुनः प्रवेश (Re-Admission)'
                                : item.eventType}
                            </span>
                            <span className="text-xs font-bold text-slate-800">
                              कक्षा {item.className} {item.section ? `(वर्ग ${item.section})` : ''}
                            </span>
                          </div>
                          <span className="text-[11px] font-bold text-slate-500">
                            दिनांक: {item.eventDate}
                          </span>
                        </div>

                        {/* Event Specific Meta */}
                        {isTc && (
                          <div className="text-xs text-amber-900 mt-1 bg-amber-50/90 p-2 rounded-lg border border-amber-200/60">
                            <p>
                              <strong>टी.सी. क्रमांक:</strong> {item.tcNumber || 'TC/2026/01'}
                            </p>
                            <p className="mt-0.5">
                              <strong>कारण:</strong> {item.reason || 'अभिभावक अनुरोध पर स्थानांतरण'}
                            </p>
                          </div>
                        )}

                        {isReadmit && (
                          <div className="text-xs text-emerald-950 mt-1 bg-emerald-50/90 p-2.5 rounded-lg border border-emerald-200/60 space-y-1">
                            {item.intermediateSchoolName && (
                              <p>
                                <strong>मध्यवर्ती विद्यालय (Gap School):</strong> {item.intermediateSchoolName}
                              </p>
                            )}
                            {item.intermediateTcNo && (
                              <p>
                                <strong>वहां का टी.सी. क्रमांक:</strong> {item.intermediateTcNo}
                              </p>
                            )}
                            <p className="text-emerald-800 text-[11px]">
                              1 वर्ष/अंतराल बाद विद्यालय में पुनः आगमन एवं अध्ययन निरंतर।
                            </p>
                          </div>
                        )}

                        {item.remarks && !isTc && (
                          <p className="text-xs text-slate-600 mt-1 italic">विवरण: {item.remarks}</p>
                        )}

                        {item.recordedByName && (
                          <div className="mt-2 pt-1.5 border-t border-slate-200/60 text-[10px] text-slate-400 flex items-center justify-between">
                            <span>दर्जकर्ता: {item.recordedByName} ({item.recordedByRole || 'स्टाफ'})</span>
                            {item.academicSession && <span>सत्र: {item.academicSession}</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Guardian & Contacts */}
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
              माता-पिता एवं पारिवारिक विवरण
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
              <div>
                <span className="text-slate-500">पिता का नाम:</span>
                <p className="font-semibold text-slate-800 text-sm mt-0.5">
                  {student.fatherName} {student.fatherOccupation ? `(${student.fatherOccupation})` : ''}
                </p>
              </div>
              <div>
                <span className="text-slate-500">माता का नाम:</span>
                <p className="font-semibold text-slate-800 text-sm mt-0.5">
                  {student.motherName || 'रिकॉर्ड में नहीं'}
                </p>
              </div>
              <div className="flex items-center gap-2 pt-2 border-t border-slate-200/60 sm:col-span-2">
                <Phone className="h-4 w-4 text-emerald-600 shrink-0" />
                <span className="text-slate-600">
                  फोन: <strong className="text-slate-900">{student.parentPhone}</strong>
                </span>
                {student.whatsappNumber && (
                  <span className="text-slate-500 ml-3">व्हाट्सएप: {student.whatsappNumber}</span>
                )}
              </div>
              {student.email && (
                <div className="flex items-center gap-2 sm:col-span-2">
                  <Mail className="h-4 w-4 text-blue-600 shrink-0" />
                  <span className="text-slate-600">
                    ईमेल: <strong className="text-slate-900">{student.email}</strong>
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Personal & Government Identity */}
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
              व्यक्तिगत व सरकारी पहचान
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
              <div>
                <span className="text-slate-500">जन्म तिथि:</span>
                <p className="font-semibold text-slate-800 mt-0.5">{student.dob || '—'}</p>
              </div>
              <div>
                <span className="text-slate-500">लिंग:</span>
                <p className="font-semibold text-slate-800 mt-0.5">
                  {student.gender === 'Male' ? 'छात्र' : student.gender === 'Female' ? 'छात्रा' : student.gender}
                </p>
              </div>
              <div>
                <span className="text-slate-500">श्रेणी:</span>
                <p className="font-semibold text-slate-800 mt-0.5">{student.category || 'General'}</p>
              </div>
              <div>
                <span className="text-slate-500">रक्त समूह:</span>
                <p className="font-semibold text-rose-600 mt-0.5">{student.bloodGroup || '—'}</p>
              </div>
              <div className="sm:col-span-2 pt-2 border-t border-slate-200/60">
                <span className="text-slate-500">आधार कार्ड नंबर:</span>
                <p className="font-semibold text-slate-800 mt-0.5 tracking-wider">
                  {student.aadhaarNumber || 'उपलब्ध नहीं'}
                </p>
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
                  <p className="font-semibold text-slate-800 mt-0.5">
                    {student.currentAddress || 'रिकॉर्ड में दर्ज नहीं'}
                  </p>
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
                <p className="text-slate-500">
                  पूर्व स्कूल: <strong className="text-slate-800">{student.previousSchool || 'लागू नहीं (प्रथम प्रवेश)'}</strong>
                </p>
                <p className="text-slate-500">
                  पूर्व टी.सी.: <strong className="text-slate-800">{student.previousTcNo || 'उपलब्ध नहीं'}</strong>
                </p>
                <p className="text-slate-500">
                  प्रवेश दिनांक: <strong className="text-slate-800">{student.admissionDate}</strong>
                </p>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">बैंक खाता विवरण (DBT)</h3>
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs space-y-1">
                <p className="text-slate-500">
                  खाता सं.: <strong className="text-slate-800">{student.bankAccountNo || 'खाता लिंक नहीं है'}</strong>
                </p>
                <p className="text-slate-500">
                  बैंक: <strong className="text-slate-800">{student.bankName || '—'}</strong>
                </p>
                <p className="text-slate-500">
                  IFSC: <strong className="text-slate-800">{student.ifscCode || '—'}</strong>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <span className="text-xs text-slate-500">विद्या सेतु स्कूल प्रबंधन प्रणाली • स्कॉलर रजिस्टर</span>
          <div className="flex items-center gap-2">
            {isTcIssued && (
              <button
                onClick={() => setIsReAdmitOpen(true)}
                className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <UserCheck className="h-3.5 w-3.5" />
                <span>पुनः प्रवेश</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="px-5 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-xl transition-colors shadow-xs cursor-pointer"
            >
              बंद करें
            </button>
          </div>
        </div>
      </div>

      <IssueTcModal
        isOpen={isTcModalOpen}
        student={student}
        onClose={() => setIsTcModalOpen(false)}
        onSuccess={(updated) => {
          onIssueTc(student.id);
          if (onStudentUpdated) onStudentUpdated(updated);
          setIsTcModalOpen(false);
        }}
      />

      <ReAdmissionModal
        isOpen={isReAdmitOpen}
        student={student}
        onClose={() => setIsReAdmitOpen(false)}
        onSuccess={(updated) => {
          if (onStudentUpdated) onStudentUpdated(updated);
          setIsReAdmitOpen(false);
        }}
        assignedClasses={assignedClasses}
        userRole={userRole}
      />
    </div>
  );
}
