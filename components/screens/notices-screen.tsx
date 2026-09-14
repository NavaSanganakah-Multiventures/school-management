import React, { useState, useEffect } from 'react';
import { Bell, Sparkles, Send, ShieldAlert, Tag, CheckCheck, Plus, Trash2 } from 'lucide-react';
import { AddNoticeModal } from '../modals/add-notice-modal';

interface NoticesScreenProps {
  onOpenFcmModal: () => void;
}

export function NoticesScreen({ onOpenFcmModal }: NoticesScreenProps) {
  const [notices, setNotices] = useState<any[]>([]);
  const [fcmHistory, setFcmHistory] = useState<any[]>([]);
  const [category, setCategory] = useState('All');
  const [activeTab, setActiveTab] = useState<'notices' | 'fcm'>('notices');
  const [isAddNoticeOpen, setIsAddNoticeOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      try {
        const [noticesRes, fcmRes] = await Promise.all([
          fetch(`/api/notices?category=${category}`),
          fetch('/api/notifications/history'),
        ]);
        const noticesData = await noticesRes.json();
        const fcmData = await fcmRes.json();
        if (isMounted) {
          if (noticesData.success) setNotices(noticesData.notices);
          if (fcmData.success) setFcmHistory(fcmData.history);
        }
      } catch {
        //
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    load();
    return () => {
      isMounted = false;
    };
  }, [category]);

  const handleDeleteNotice = async (id: string, title: string) => {
    if (!confirm(`क्या आप निश्चित रूप से "${title}" नोटिस हटाना चाहते हैं?`)) return;
    try {
      const res = await fetch(`/api/notices/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setNotices((prev) => prev.filter((n) => n.id !== id));
      }
    } catch {
      //
    }
  };

  return (
    <div className="space-y-4 pb-12">
      {/* Header with Broadcast Action */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800">नोटिस बोर्ड एवं त्वरित सूचना अलर्ट</h2>
          <p className="text-xs text-slate-500">स्कूल परिपत्र, अवकाश एवं आवश्यक सूचना प्रसारण</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsAddNoticeOpen(true)}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-blue-900 hover:bg-blue-800 text-white px-4 py-2 text-xs font-semibold shadow-sm active:scale-95 transition-all cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>+ नया नोटिस प्रकाशित करें</span>
          </button>
          <button
            onClick={onOpenFcmModal}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 text-xs font-semibold shadow-sm active:scale-95 transition-all cursor-pointer"
          >
            <Sparkles className="h-4 w-4" />
            <span>त्वरित FCM अलर्ट</span>
          </button>
        </div>
      </div>

      {/* Tabs between General Notices & Broadcast Delivery Logs */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('notices')}
          className={`pb-2.5 px-4 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
            activeTab === 'notices'
              ? 'border-blue-900 text-blue-900'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          नोटिस बोर्ड ({notices.length})
        </button>
        <button
          onClick={() => setActiveTab('fcm')}
          className={`pb-2.5 px-4 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
            activeTab === 'fcm'
              ? 'border-amber-600 text-amber-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          प्रसारित अलर्ट संदेश इतिहास ({fcmHistory.length})
        </button>
      </div>

      {activeTab === 'notices' ? (
        <div className="space-y-3">
          {/* Categories */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {['All', 'General', 'Academic', 'Holiday', 'Exam', 'Sports'].map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-all shrink-0 ${
                  category === cat
                    ? 'bg-blue-900 text-white'
                    : 'bg-white border border-slate-200 text-slate-600'
                }`}
              >
                {cat === 'All' ? 'सभी' : cat}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="p-8 text-center text-xs text-slate-500">नोटिस लोड हो रहे हैं...</div>
          ) : notices.length === 0 ? (
            <div className="p-12 text-center bg-white border border-slate-200 rounded-2xl shadow-xs">
              <Bell className="h-10 w-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-bold text-slate-700">वर्तमान में कोई सूचना अथवा परिपत्र प्रकाशित नहीं है</p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                डिजिटल सूचना पट्ट रिक्त है। अभिभावकों, छात्रों या शिक्षकों के लिए नया परिपत्र प्रसारित करने के लिए ऊपर &quot;नया सूचना अलर्ट प्रसारित करें&quot; बटन का उपयोग करें।
              </p>
            </div>
          ) : (
            notices.map((n) => (
              <div
                key={n.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs hover:shadow-xs transition-all space-y-2"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        n.priority === 'High'
                          ? 'bg-rose-100 text-rose-800'
                          : n.priority === 'Urgent'
                          ? 'bg-red-200 text-red-900'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {n.category}
                    </span>
                    {(n.alertSent || (n as any).fcmSent) && (
                      <span className="flex items-center gap-0.5 text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                        <CheckCheck className="h-3 w-3" /> त्वरित अलर्ट प्रेषित
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400">{n.publishedDate}</span>
                    <button
                      onClick={() => handleDeleteNotice(n.id, n.title)}
                      title="नोटिस हटाएं"
                      className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <h3 className="font-bold text-sm text-slate-900">{n.title}</h3>
                <p className="text-xs text-slate-600 leading-relaxed">{n.content}</p>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                  <span>जारीकर्ता: <strong>{n.publishedBy}</strong></span>
                  <span>लक्षित वर्ग: {n.targetAudience}</span>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
            अभिभावकों एवं स्टाफ सदस्यों को प्रसारित किए गए सभी महत्वपूर्ण अलर्ट संदेशों की रिपोर्ट।
          </div>

          {fcmHistory.length === 0 ? (
            <div className="p-12 text-center bg-white border border-slate-200 rounded-2xl space-y-2">
              <p className="text-sm font-semibold text-slate-700">अभी कोई पूर्व सूचना अलर्ट दर्ज नहीं है।</p>
              <p className="text-xs text-slate-400">
                नया परिपत्र या आपातकालीन सूचना प्रसारित करने के लिए ऊपर &quot;नया सूचना अलर्ट प्रसारित करें&quot; बटन का उपयोग करें।
              </p>
            </div>
          ) : (
            fcmHistory.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-2 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] text-slate-400">{item.fcmMessageId || item.id}</span>
                  <span className={item.deliveryStatus === 'Delivered' ? 'bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.5 rounded-full text-[10px]' : item.deliveryStatus === 'Failed' ? 'bg-rose-100 text-rose-800 font-semibold px-2 py-0.5 rounded-full text-[10px]' : 'bg-amber-100 text-amber-800 font-semibold px-2 py-0.5 rounded-full text-[10px]'}>
                    {item.deliveryStatus === 'Delivered' ? 'प्रसारित (सफल)' : item.deliveryStatus === 'Failed' ? 'असफल' : item.deliveryStatus || 'प्रसारित'}
                  </span>
                </div>
                <h4 className="font-bold text-sm text-slate-900">{item.title}</h4>
                <p className="text-slate-600">{item.body}</p>
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                  <span>टॉपिक: <strong>{item.targetTopic}</strong></span>
                  <span>समय: {item.sentAt ? new Date(item.sentAt).toLocaleString('hi-IN') : ''}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Add Notice Modal */}
      <AddNoticeModal
        isOpen={isAddNoticeOpen}
        onClose={() => setIsAddNoticeOpen(false)}
        onSuccess={(newNotice) => {
          setNotices((prev) => [newNotice, ...prev]);
        }}
      />
    </div>
  );
}
