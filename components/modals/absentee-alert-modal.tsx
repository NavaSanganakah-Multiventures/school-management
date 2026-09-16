'use client';

import React, { useState } from 'react';
import { X, Bell, Send, CheckCircle2, MessageCircle, Phone, AlertTriangle, Users, Loader2, Sparkles } from 'lucide-react';

interface AbsenteeStudent {
  studentId: string;
  studentName: string;
  className: string;
  section?: string;
  scholarNumber?: string;
  parentName?: string;
  parentPhone?: string;
}

interface AbsenteeAlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  date: string;
  className: string;
  absentees: AbsenteeStudent[];
  onAlertSent?: () => void;
}

export function AbsenteeAlertModal({
  isOpen,
  onClose,
  date,
  className,
  absentees,
  onAlertSent,
}: AbsenteeAlertModalProps) {
  const [customMessage, setCustomMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [successResult, setSuccessResult] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const defaultMessage = `आज दिनांक ${date} को आपका बच्चा कक्षा ${className || 'विद्यालय'} में अनुपस्थित दर्ज हुआ है। कृपया अनुपस्थिति का कारण विद्यालय को सूचित करें।`;

  const handleSendPush = async () => {
    setIsSending(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/attendance/notify-absentees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          className,
          customMessage: customMessage.trim() || defaultMessage,
          studentIds: absentees.map((s) => s.studentId),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccessResult(data);
        onAlertSent?.();
      } else {
        setErrorMessage(data.message || 'अलर्ट भेजने में त्रुटि हुई।');
      }
    } catch {
      setErrorMessage('नेटवर्क त्रुटि: सर्वर से संपर्क नहीं हो सका।');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-red-600 to-amber-600 text-white shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/10 rounded-xl">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-base">अनुपस्थित छात्र अभिभावक पुश अलर्ट</h3>
              <p className="text-[11px] text-red-100">
                {className ? `कक्षा: ${className} • ` : ''}दिनांक: {date} • कुल अनुपस्थित: {absentees.length}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-white/20 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {successResult ? (
            <div className="space-y-4 text-center py-4">
              <div className="h-14 w-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-8 w-8 animate-bounce" />
              </div>
              <div>
                <h4 className="text-base font-bold text-slate-900">पुश नोटिफिकेशन सफलतापूर्वक भेजा गया!</h4>
                <p className="text-xs text-slate-600 mt-1 max-w-md mx-auto">
                  {successResult.message || `${absentees.length} अनुपस्थित छात्रों के अभिभावकों के पंजीकृत ऐप व डिवाइस पर अलर्ट प्रेषित हो गया है।`}
                </p>
              </div>

              {/* Action list with direct WhatsApp links */}
              {successResult.studentAlertList && successResult.studentAlertList.length > 0 && (
                <div className="text-left mt-4 border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-2">
                  <span className="text-xs font-bold text-slate-700 block">
                    त्वरित WhatsApp / SMS बैकअप संपर्क:
                  </span>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {successResult.studentAlertList.map((item: any) => (
                      <div
                        key={item.studentId}
                        className="flex items-center justify-between p-2 bg-white rounded-lg border border-slate-200 text-xs"
                      >
                        <div>
                          <span className="font-bold text-slate-900">{item.studentName}</span>
                          <span className="text-slate-500 text-[11px] ml-2">
                            ({item.parentName} - {item.parentPhone || 'फोन नहीं'})
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          {item.whatsappUrl && (
                            <a
                              href={item.whatsappUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-1 px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-[11px] font-semibold transition cursor-pointer"
                            >
                              <MessageCircle className="h-3 w-3" />
                              <span>WhatsApp</span>
                            </a>
                          )}
                          {item.parentPhone && (
                            <a
                              href={`tel:${item.parentPhone}`}
                              className="flex items-center gap-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-[11px] font-semibold transition cursor-pointer"
                            >
                              <Phone className="h-3 w-3" />
                              <span>कॉल</span>
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={onClose}
                className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition cursor-pointer"
              >
                बंद करें
              </button>
            </div>
          ) : (
            <>
              {errorMessage && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Absentee Student Pill Badges */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-2 flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-red-600" />
                  <span>चयनित अनुपस्थित छात्र ({absentees.length}):</span>
                </label>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-2 bg-slate-50 border border-slate-200 rounded-xl">
                  {absentees.length === 0 ? (
                    <span className="text-xs text-slate-400">कोई छात्र अनुपस्थित दर्ज नहीं है।</span>
                  ) : (
                    absentees.map((s) => (
                      <span
                        key={s.studentId}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-100 text-red-800 border border-red-200 rounded-lg text-xs font-semibold"
                      >
                        <span>{s.studentName}</span>
                        {s.parentPhone && <span className="text-[10px] text-red-600">({s.parentPhone})</span>}
                      </span>
                    ))
                  )}
                </div>
              </div>

              {/* Message Content */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  पुश नोटिफिकेशन संदेश (Notification Text):
                </label>
                <textarea
                  rows={3}
                  value={customMessage || defaultMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-500 font-medium"
                  placeholder="संदेश दर्ज करें..."
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  * यह संदेश अभिभावकों के स्मार्टफोन पर ऐप नोटिफिकेशन व पॉपअप के रूप में प्राप्त होगा।
                </span>
              </div>

              {/* Direct WhatsApp Quick Contact Preview */}
              <div className="border border-amber-200 bg-amber-50/70 p-3 rounded-xl text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-amber-900">
                  <Sparkles className="h-3.5 w-3.5 text-amber-600" />
                  <span>त्वरित मल्टी-चैनल अलर्ट:</span>
                </div>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  पुश नोटिफिकेशन भेजने के साथ-साथ आपको प्रत्येक छात्र के अभिभावक को सीधे <strong>WhatsApp संदेश</strong> व <strong>फ़ोन कॉल</strong> करने का लिंक भी प्रदान किया जाएगा।
                </p>
              </div>

              {/* Footer Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSending}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                >
                  रद्द करें
                </button>
                <button
                  type="button"
                  onClick={handleSendPush}
                  disabled={isSending || absentees.length === 0}
                  className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-700 hover:to-amber-700 disabled:opacity-50 rounded-xl shadow-xs transition cursor-pointer"
                >
                  {isSending ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>अलर्ट भेजा जा रहा है...</span>
                    </>
                  ) : (
                    <>
                      <Send className="h-3.5 w-3.5" />
                      <span>{absentees.length} अभिभावकों को पुश भेजें</span>
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
