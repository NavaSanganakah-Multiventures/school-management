'use client';

import React, { useState } from 'react';
import { X, Bell, Send, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';

interface AddNoticeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newNotice: any) => void;
}

export function AddNoticeModal({ isOpen, onClose, onSuccess }: AddNoticeModalProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('General');
  const [targetAudience, setTargetAudience] = useState('All');
  const [priority, setPriority] = useState('Normal');
  const [publishedBy, setPublishedBy] = useState('प्राचार्य कार्यालय (Principal Office)');
  const [sendFcm, setSendFcm] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      setError('कृपया नोटिस शीर्षक एवं विवरण भरें।');
      return;
    }

    setSubmitting(true);
    setError('');
    setSuccessMsg('');

    try {
      const res = await fetch('/api/notices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
          category,
          targetAudience,
          priority,
          publishedBy,
          sendFcm,
        }),
      });

      const data = await res.json();
      if (data.success && data.notice) {
        setSuccessMsg(data.message || 'सूचना सफलतापूर्वक प्रकाशित की गई।');
        onSuccess(data.notice);
        setTimeout(() => {
          onClose();
        }, 1200);
      } else {
        setError(data.message || 'सूचना प्रकाशित करने में त्रुटि हुई।');
      }
    } catch {
      setError('सर्वर से संपर्क करने में त्रुटि हुई।');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-900 to-indigo-950 p-5 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/10 rounded-xl">
              <Bell className="h-5 w-5 text-amber-300" />
            </div>
            <div>
              <h2 className="text-base font-bold">नया विद्यालय परिपत्र / नोटिस प्रकाशित करें</h2>
              <p className="text-xs text-blue-200">डिजिटल सूचना पट्ट एवं अभिभावक मोबाइल अलर्ट</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-col grow overflow-hidden">
          <div className="p-5 space-y-3.5 overflow-y-auto grow text-xs">
            {error && (
              <div className="flex items-center gap-2 rounded-xl bg-rose-50 border border-rose-200 p-3 text-rose-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {successMsg && (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-emerald-700">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* Title */}
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                सूचना शीर्षक (Notice Title) <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="उदा. शीतकालीन अवकाश घोषणा / अर्धवार्षिक परीक्षा समय-सारणी"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-2.5 focus:border-blue-500 focus:outline-hidden font-medium"
              />
            </div>

            {/* Category & Audience */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">श्रेणी (Category)</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white p-2.5 focus:border-blue-500 focus:outline-hidden"
                >
                  <option value="General">सामान्य (General)</option>
                  <option value="Academic">शैक्षणिक (Academic)</option>
                  <option value="Holiday">अवकाश (Holiday)</option>
                  <option value="Exam">परीक्षा (Exam)</option>
                  <option value="Sports">खेलकूद (Sports)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">लक्षित वर्ग (Target Audience)</label>
                <select
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white p-2.5 focus:border-blue-500 focus:outline-hidden"
                >
                  <option value="All">समस्त (सभी सदस्य)</option>
                  <option value="Parents">केवल अभिभावक (Parents)</option>
                  <option value="Students">केवल विद्यार्थी (Students)</option>
                  <option value="Teachers">केवल शिक्षक व स्टाफ (Staff)</option>
                </select>
              </div>
            </div>

            {/* Priority & Published By */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">प्राथमिकता (Priority)</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white p-2.5 focus:border-blue-500 focus:outline-hidden"
                >
                  <option value="Normal">सामान्य (Normal)</option>
                  <option value="High">महत्वपूर्ण (High Priority)</option>
                  <option value="Urgent">अति-आवश्यक (Urgent / Emergency)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">जारीकर्ता (Published By)</label>
                <input
                  type="text"
                  value={publishedBy}
                  onChange={(e) => setPublishedBy(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-2.5 focus:border-blue-500 focus:outline-hidden"
                />
              </div>
            </div>

            {/* Notice Content */}
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                सूचना का विस्तृत विवरण (Notice Content) <span className="text-rose-500">*</span>
              </label>
              <textarea
                required
                rows={4}
                placeholder="परिपत्र का सम्पूर्ण विवरण यहां लिखें..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-2.5 focus:border-blue-500 focus:outline-hidden"
              />
            </div>

            {/* Instant Push Checkbox */}
            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200">
              <input
                type="checkbox"
                id="sendFcmCheckbox"
                checked={sendFcm}
                onChange={(e) => setSendFcm(e.target.checked)}
                className="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
              />
              <label htmlFor="sendFcmCheckbox" className="text-xs text-amber-950 font-medium cursor-pointer">
                <strong>त्वरित FCM मोबाइल पुश अलर्ट भेजें:</strong> लक्षित वर्ग के सभी पंजीकृत मोबाइल डिवाइस पर तुरंत सूचना प्राप्त होगी।
              </label>
            </div>
          </div>

          {/* Actions */}
          <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              रद्द करें
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-blue-900 hover:bg-blue-800 rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              <span>{submitting ? 'प्रकाशित हो रहा है...' : 'सूचना प्रकाशित करें (Publish)'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
