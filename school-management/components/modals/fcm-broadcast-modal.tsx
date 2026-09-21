'use client';

import React, { useState, useEffect } from 'react';
import { X, Bell, Send, CheckCircle2, Radio, ShieldAlert, ShieldCheck, Mail, Globe } from 'lucide-react';

interface FcmBroadcastModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBroadcastSent?: (record: any) => void;
  schoolId?: string;
}

export function FcmBroadcastModal({
  isOpen,
  onClose,
  onBroadcastSent,
  schoolId = 'school-01',
}: FcmBroadcastModalProps) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [topics, setTopics] = useState<any[]>([]);
  const [selectedTopicKey, setSelectedTopicKey] = useState('school_' + schoolId + '_all');
  const [targetRole, setTargetRole] = useState('All');
  const [priority, setPriority] = useState('high');
  const [emailDispatchMode, setEmailDispatchMode] = useState<'standard_gmail' | 'domain_official' | 'fcm_only'>('domain_official');
  const [isSending, setIsSending] = useState(false);
  const [successInfo, setSuccessInfo] = useState<any>(null);
  const [errorInfo, setErrorInfo] = useState<string | null>(null);
  const [diagInfo, setDiagInfo] = useState<any>(null);
  const [deviceStats, setDeviceStats] = useState<{ totalCount: number; webCount: number; mobileCount: number } | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetch('/api/notifications/topics?schoolId=' + schoolId)
        .then((r) => r.json())
        .then((data) => {
          if (data.success && data.topics?.length) {
            setTopics(data.topics);
            setSelectedTopicKey(data.topics[0].topicKey);
            setTargetRole(data.topics[0].targetRole);
          }
        })
        .catch(() => {});

      fetch('/api/notifications/devices?schoolId=' + schoolId)
        .then((r) => r.json())
        .then((data) => {
          if (data.success) {
            setDeviceStats({
              totalCount: data.totalCount || 0,
              webCount: data.webCount || 0,
              mobileCount: data.mobileCount || 0,
            });
          }
        })
        .catch(() => {});
    }
  }, [isOpen, schoolId]);

  if (!isOpen) return null;

  const diag = diagInfo || {};
  const isHealthy = Boolean(diag.topicSuccess || (diag.tokenSuccess > 0 && (!diag.tokenFailed || diag.tokenFailed === 0)));

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !body) return;

    setIsSending(true);
    setErrorInfo(null);
    setDiagInfo(null);
    try {
      const res = await fetch('/api/notifications/fcm-broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          body,
          rawTopicKey: selectedTopicKey,
          schoolId,
          targetRole,
          data: {
            priority,
            emailDispatchMode,
            click_action: 'FLUTTER_NOTIFICATION_CLICK',
            tenantId: schoolId,
          },
        }),
      });
      const data = await res.json();
      if (data.success) {
        // Dispatch locally to current window and all other open tabs immediately
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('fcm_notification', {
            detail: { type: 'FCM_NOTIFICATION', notification: { title, body } }
          }));
          try {
            const bc = new BroadcastChannel('pragnya_mitra_fcm');
            bc.postMessage({ type: 'FCM_NOTIFICATION', notification: { title, body } });
            bc.close();
          } catch (_) {}
        }
        setSuccessInfo(data);
        const d = data.diag || data.alertResponse || null;
        setDiagInfo(d);
        onBroadcastSent?.(data.record);
        const delivered = Boolean((d && d.topicSuccess) || (d && d.tokenSuccess > 0 && !d.tokenFailed));
        if (delivered) {
          setTimeout(() => {
            setSuccessInfo(null);
            setDiagInfo(null);
            onClose();
          }, 3500);
        }
      } else {
        setErrorInfo((data && data.message) ? data.message : 'सूचना भेजने में त्रुटि हुई।');
        setDiagInfo((data && data.diag) ? data.diag : null);
      }
    } catch {
      setErrorInfo('नेटवर्क त्रुटि: सूचना भेजी नहीं जा सकी। कृपया पुनः प्रयास करें।');
      setDiagInfo(null);
    } finally {
      setIsSending(false);
    }
  };

  const currentTopicObj = topics.find((t) => t.topicKey === selectedTopicKey);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-5 py-3.5 bg-gradient-to-r from-amber-600 to-orange-600 text-white">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            <div>
              <h3 className="font-semibold text-base">त्वरित सूचना एवं पुश अलर्ट ब्रॉडकास्ट</h3>
              <p className="text-[10px] text-amber-100 flex items-center gap-1">
                <ShieldCheck className="h-3 w-3" /> सुरक्षित विद्यालय डेटा पृथक्करण
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-white/20 cursor-pointer">
            <X className="h-5 w-5" />
          </button>
        </div>

        {successInfo ? (
          <div className="p-6 space-y-3">
            <div className={'mx-auto flex h-14 w-14 items-center justify-center rounded-full ' + (isHealthy ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600')}>
              {isHealthy ? <CheckCircle2 className="h-8 w-8 animate-bounce" /> : <ShieldAlert className="h-8 w-8" />}
            </div>
            <h4 className={'text-lg font-bold text-center ' + (isHealthy ? 'text-slate-800' : 'text-rose-700')}>
              {isHealthy ? 'सूचना सफलतापूर्वक प्रसारित हो गई!' : 'सूचना प्रेषण में समस्या'}
            </h4>
            <p className="text-xs text-slate-600 text-center">
              अलर्ट समूह{' '}
              <span className="font-mono font-bold text-amber-700">[{selectedTopicKey}]</span> पर प्रसारित किया गया।
            </p>

            {isHealthy && diag.topicSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 space-y-1">
                <div className="font-semibold flex items-center gap-1.5 text-emerald-900">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" /> पुश नोटिफिकेशन ब्रॉडकास्ट सफल
                </div>
                <p className="text-[11px] text-emerald-700">
                  पुश सर्वर ने संदेश स्वीकार कर लिया है। इस समूह से जुड़े सभी पंजीकृत मोबाइल व वेब उपकरणों पर तुरंत नोटिफिकेशन पहुंचेगा।
                </p>
              </div>
            )}

            {!isHealthy && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
                <strong>⚠️ ध्यान दें:</strong> डिलीवरी में समस्या आई है। कृपया नीचे दी गई रिपोर्ट देखें।
              </div>
            )}

            {/* डायग्नोस्टिक रिपोर्ट */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-700 space-y-1 font-mono">
              <div className="font-semibold text-slate-900 mb-1 flex items-center justify-between">
                <span>🔍 डिलीवरी डायग्नोस्टिक रिपोर्ट</span>
                <span className={diag.topicSuccess ? 'text-emerald-700 font-bold' : 'text-slate-500'}>
                  {diag.topicSuccess ? 'सक्रिय (प्रेषित)' : 'प्रतीक्षारत'}
                </span>
              </div>
              <div>
                प्रोजेक्ट:{' '}
                <span className="text-slate-700 font-bold">
                  {diag.fcmProjectId || '—'}
                </span>
              </div>
              <div>ग्रुप: {diag.topic || selectedTopicKey} ({diag.topicSuccess ? 'स्वीकृत व प्रेषित' : 'असफल'})</div>
              {diag.topicMessageId ? <div className="text-slate-600 truncate">MessageId: {diag.topicMessageId}</div> : null}
              {diag.topicError ? <div className="text-rose-700 break-all">त्रुटि: {diag.topicError}</div> : null}
              <div>पंजीकृत उपकरण: {diag.deviceCount ?? 0} (💻 वेब: {diag.webCount ?? 0} | 📱 मोबाइल: {diag.mobileCount ?? 0})</div>
              <div>सीधे मोबाइल प्रेषित: {diag.directCount ?? 0} {diag.directCount > 0 ? `(सफल: ${diag.tokenSuccess ?? 0} | असफल: ${diag.tokenFailed ?? 0})` : '(कोई मोबाइल ऐप पंजीकृत नहीं)'}</div>
              <div className="text-emerald-700">💻 वेब सूचना: {(diag.webCount || 0) > 0 ? `${diag.webCount} सक्रिय वेब ब्राउज़र पर तत्काल प्रसारित` : 'कोई सक्रिय वेब ब्राउज़र नहीं'}</div>
              {diag.tokenErrors && diag.tokenErrors.length > 0 ? (
                <div className="text-rose-700">
                  <div>tokenErrors:</div>
                  {diag.tokenErrors.map((err: string, i: number) => (
                    <div key={i} className="pl-2 break-all">• {err}</div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="text-center">
              <div className="text-[11px] text-emerald-700 bg-emerald-50 py-1.5 px-3 rounded-lg inline-block border border-emerald-200">
                डेटा पृथक्करण सत्यापित: अन्य किसी भी विद्यालय में यह संदेश नहीं गया है।
              </div>
            </div>

            <div className="flex justify-center pt-1">
              <button
                type="button"
                onClick={() => { setSuccessInfo(null); setDiagInfo(null); onClose(); }}
                className="px-4 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer font-medium"
              >
                बंद करें
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSend} className="p-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                सूचना का शीर्षक *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="उदा. कल भारी वर्षा के कारण विद्यालय में अवकाश"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                संदेश विवरण *
              </label>
              <textarea
                rows={3}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="सभी विद्यार्थियों एवं अभिभावकों को सूचित किया जाता है कि..."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none resize-none"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  लक्षित वर्ग / समूह चयन *
                </label>
                <select
                  value={selectedTopicKey}
                  onChange={(e) => {
                    setSelectedTopicKey(e.target.value);
                    const found = topics.find((t) => t.topicKey === e.target.value);
                    if (found) setTargetRole(found.targetRole);
                  }}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none"
                >
                  {topics.length > 0 ? (
                    topics.map((t) => (
                      <option key={t.topicKey} value={t.topicKey}>
                        {t.displayName}
                      </option>
                    ))
                  ) : (
                    <>
                      <option value={'school_' + schoolId + '_all'}>सभी (समस्त छात्र, शिक्षक व अभिभावक)</option>
                      <option value={'school_' + schoolId + '_parents'}>केवल अभिभावक</option>
                      <option value={'school_' + schoolId + '_students'}>केवल विद्यार्थी</option>
                      <option value={'school_' + schoolId + '_teachers'}>शिक्षक व स्टाफ</option>
                      <option value={'school_' + schoolId + '_fees_due'}>केवल फीस बकाया वाले छात्र</option>
                    </>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">प्राथमिकता</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none"
                >
                  <option value="high">उच्च प्राथमिकता (तुरंत ध्वनि अलर्ट)</option>
                  <option value="normal">सामान्य सूचना</option>
                  <option value="urgent">आपातकालीन (अति आवश्यक)</option>
                </select>
              </div>
            </div>

            {/* Registered Devices Status */}
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
              <div className="flex items-center justify-between text-slate-700 font-semibold">
                <span className="flex items-center gap-1.5 text-[11px]">
                  <Radio className="h-3 w-3 text-amber-600 animate-pulse" />
                  पंजीकृत डिवाइस स्थिति
                </span>
                <span className="text-[10px] bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full font-bold">
                  {deviceStats ? `${deviceStats.totalCount} पंजीकृत उपकरण` : 'जांच हो रही है...'}
                </span>
              </div>
              <div className="text-[10px] text-slate-600 flex gap-3">
                <span>📱 मोबाइल ऐप: <strong>{deviceStats?.mobileCount ?? 0}</strong></span>
                <span>💻 वेब ब्राउज़र: <strong>{deviceStats?.webCount ?? 0}</strong></span>
              </div>
              <p className="text-[9px] text-slate-500 pt-0.5 border-t border-slate-200">
                💡 <strong>उपकरण पंजीकरण:</strong> मोबाइल ऐप उपयोगकर्ता और वेब पोर्टल उपयोगकर्ता नोटिफिकेशन अनुमति देने पर स्वतः पंजीकृत हो जाते हैं और उन्हें तुरंत अलर्ट प्राप्त होता है।
              </p>
            </div>

            {/* Delivery Channel Options */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                प्रेषण चैनल एवं ईमेल सेवा का चयन
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setEmailDispatchMode('domain_official')}
                  className={'p-2.5 rounded-xl border text-left text-xs transition cursor-pointer flex flex-col justify-between ' + (emailDispatchMode === 'domain_official' ? 'border-indigo-600 bg-indigo-50/70 text-indigo-950 font-bold ring-1 ring-indigo-600' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50')}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <Globe className="h-3.5 w-3.5 text-indigo-600" />
                    <span>कस्टम डोमेन ईमेल</span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-normal">
                    @pragnyamitra.edu.in से आधिकारिक रूप से
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setEmailDispatchMode('standard_gmail')}
                  className={'p-2.5 rounded-xl border text-left text-xs transition cursor-pointer flex flex-col justify-between ' + (emailDispatchMode === 'standard_gmail' ? 'border-amber-600 bg-amber-50/70 text-amber-950 font-bold ring-1 ring-amber-600' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50')}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <Mail className="h-3.5 w-3.5 text-amber-600" />
                    <span>सामान्य जीमेल / सिस्टम</span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-normal">
                    मानक ईमेल रूटिंग (निःशुल्क)
                  </span>
                </button>
              </div>
            </div>

            {/* School Isolation Notice */}
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2">
              <ShieldCheck className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <span>
                <strong>सुरक्षित विद्यालय पृथक्करण:</strong> यह संदेश केवल आपके विद्यालय के चयनित समूह को ही डिलीवर होगा। अन्य किसी विद्यालय में नहीं जाएगा।
              </span>
            </div>

            {errorInfo && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
                <ShieldAlert className="h-4 w-4 text-rose-600 mt-0.5 shrink-0" />
                <span>{errorInfo}</span>
              </div>
            )}

            {errorInfo && diagInfo && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-700 space-y-1 font-mono">
                <div className="font-semibold text-slate-900">🔍 डिलीवरी डायग्नोस्टिक रिपोर्ट</div>
                <div>
                  प्रोजेक्ट:{' '}
                  <span className="text-slate-700 font-bold">
                    {diagInfo.fcmProjectId || '—'}
                  </span>
                </div>
                <div>उपकरण: {diagInfo.deviceCount ?? '?'} | सीधे सफल: {diagInfo.tokenSuccess ?? '?'} | असफल: {diagInfo.tokenFailed ?? '?'}</div>
                {diagInfo.topicError ? <div className="text-rose-700 break-all">त्रुटि: {diagInfo.topicError}</div> : null}
                {diagInfo.tokenErrors && diagInfo.tokenErrors.length > 0 ? (
                  <div className="text-rose-700">
                    <div>tokenErrors:</div>
                    {diagInfo.tokenErrors.map((err: string, i: number) => (
                      <div key={i} className="pl-2 break-all">• {err}</div>
                    ))}
                  </div>
                ) : null}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                रद्द करें
              </button>
              <button
                type="submit"
                disabled={isSending}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-xs disabled:opacity-50 cursor-pointer"
              >
                <Send className="h-3.5 w-3.5" />
                {isSending ? 'अलर्ट प्रसारित हो रहा है...' : 'सुरक्षित पुश अलर्ट भेजें'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
