'use client';

import React, { useState } from 'react';
import { X, Sparkles, Send, Loader2, CheckCircle2, MessageSquarePlus } from 'lucide-react';

interface RequestFeatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function RequestFeatureModal({ isOpen, onClose, onSuccess }: RequestFeatureModalProps) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('custom_feature');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      setErrorMsg('कृपया आवश्यकता का शीर्षक और विस्तृत विवरण दर्ज करें।');
      return;
    }

    setErrorMsg(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/features/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, category, description }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessMsg(data.message || 'आपकी आवश्यकता सुपर एडमिन को भेज दी गई है।');
        setTimeout(() => {
          setSuccessMsg(null);
          setTitle('');
          setDescription('');
          onClose();
          if (onSuccess) onSuccess();
        }, 1800);
      } else {
        setErrorMsg(data.message || 'अनुरोध भेजने में विफल।');
      }
    } catch (e) {
      setErrorMsg('नेटवर्क त्रुटि हुई। कृपया पुनः प्रयास करें।');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <MessageSquarePlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900">विशेष आवश्यकता / कस्टम फीचर अनुरोध</h3>
              <p className="text-[11px] text-slate-500">सुपर एडमिन सीधे आपकी आवश्यकता की समीक्षा करेंगे</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {successMsg ? (
          <div className="py-8 text-center space-y-3">
            <div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h4 className="text-sm font-bold text-slate-900">अनुरोध सफलतापूर्वक भेजा गया!</h4>
            <p className="text-xs text-slate-600">{successMsg}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4 text-xs">
            {errorMsg && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700">
                {errorMsg}
              </div>
            )}

            <div>
              <label className="block font-bold text-slate-700 mb-1.5">आवश्यकता का शीर्षक *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="उदा. बायोमेट्रिक अटेंडेंस मशीन इंटीग्रेशन / बस GPS"
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1.5">श्रेणी (Category)</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-600 cursor-pointer"
              >
                <option value="custom_feature">नया सॉफ्टवेयर फीचर (Custom Feature)</option>
                <option value="hardware_integration">हार्डवेयर/बायोमेट्रिक इंटीग्रेशन</option>
                <option value="reports_format">कस्टम रिपोर्ट व मार्कशीट फॉर्मेट</option>
                <option value="lms_addon">एलएमएस व ई-लर्निंग ऐड-ऑन</option>
                <option value="bus_tracking">स्कूल बस जीपीएस ट्रैकिंग</option>
                <option value="other">अन्य विशेष आवश्यकता</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1.5">विस्तृत आवश्यकता विवरण *</label>
              <textarea
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="आपकी आवश्यकता क्या है, कितने छात्रों/स्टाफ के लिए चाहिए, और कोई विशिष्ट निर्देश हो तो लिखें..."
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>

            <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-100 flex items-start gap-2 text-[11px] text-blue-900 leading-relaxed">
              <Sparkles className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
              <span>Pragnya Mitra टीम आपकी आवश्यकता के आधार पर नया प्लगइन या कस्टम सर्विस तैयार करके आपके स्कूल को आवंटित कर सकती है।</span>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl font-bold cursor-pointer"
              >
                रद्द करें
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-xs transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                <span>{submitting ? 'भेजा जा रहा है...' : 'अनुरोध सबमिट करें'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
