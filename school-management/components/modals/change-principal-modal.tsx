'use client';

import React, { useState } from 'react';
import { UserCheck, X, ShieldAlert } from 'lucide-react';

interface ChangePrincipalModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPrincipal: any;
  onSuccess: () => void;
}

export function ChangePrincipalModal({
  isOpen,
  onClose,
  currentPrincipal,
  onSuccess,
}: ChangePrincipalModalProps) {
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    qualification: '',
    salary: '125000',
    appointedDate: new Date().toISOString().split('T')[0],
    remarks: 'डायरेक्टर द्वारा नए प्रधानाचार्य की नियुक्ति',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.fullName || !formData.email || !formData.phone) {
      setError('कृपया प्रधानाचार्य का पूरा नाम, ईमेल और फोन नंबर अवश्य भरें।');
      return;
    }

    try {
      setLoading(true);
      setError('');
      const res = await fetch('/api/principal/change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (data.success) {
        onSuccess();
        onClose();
      } else {
        setError(data.message || 'प्रधानाचार्य बदलने में विफलता');
      }
    } catch {
      setError('सर्वर से जुड़ने में त्रुटि हुई।');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-600 to-amber-700 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-white/20 p-2">
              <UserCheck className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold">प्रधानाचार्य बदलें / नया पदभार सौंपें</h2>
              <p className="text-xs text-amber-100">केवल निदेशक (Director) के विशेष प्रशासनिक अधिकार</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 hover:bg-white/20 transition-colors text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Current Principal Note */}
        {currentPrincipal && (
          <div className="mx-6 mt-4 p-3 bg-amber-50 rounded-xl border border-amber-200 flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900 leading-relaxed">
              वर्तमान प्रधानाचार्य: <strong className="font-semibold">{currentPrincipal.fullName}</strong> ({currentPrincipal.email})।
              नया प्रधानाचार्य नियुक्त करने पर वर्तमान प्रधानाचार्य का रिकॉर्ड स्वतः पूर्व प्रधानाचार्य इतिहास में सुरक्षित हो जाएगा।
            </div>
          </div>
        )}

        {error && (
          <div className="mx-6 mt-3 p-3 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs font-medium">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700">नए प्रधानाचार्य का पूरा नाम *</label>
            <input
              type="text"
              required
              placeholder="उदा. डॉ. आनंद मोहन त्रिवेदी"
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-amber-600 focus:outline-hidden"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">आधिकारिक ईमेल आईडी *</label>
              <input
                type="email"
                required
                placeholder="principal@pragnyamitra.edu.in"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-amber-600 focus:outline-hidden"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">मोबाइल / फोन नंबर *</label>
              <input
                type="tel"
                required
                placeholder="+91 98222 34567"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-amber-600 focus:outline-hidden"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">शैक्षणिक योग्यता (Qualification)</label>
              <input
                type="text"
                placeholder="उदा. M.A., M.Ed., Ph.D."
                value={formData.qualification}
                onChange={(e) => setFormData({ ...formData, qualification: e.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-amber-600 focus:outline-hidden"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">मासिक वेतन (₹ Salary)</label>
              <input
                type="number"
                placeholder="125000"
                value={formData.salary}
                onChange={(e) => setFormData({ ...formData, salary: e.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-amber-600 focus:outline-hidden"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700">पदभार ग्रहण दिनांक (Appointment Date) *</label>
            <input
              type="date"
              required
              value={formData.appointedDate}
              onChange={(e) => setFormData({ ...formData, appointedDate: e.target.value })}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-amber-600 focus:outline-hidden"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700">टिप्पणी / आदेश विवरण (Remarks)</label>
            <textarea
              rows={2}
              placeholder="प्रबंधन समिति के निर्णय अनुसार पदभार सौंपा गया..."
              value={formData.remarks}
              onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-amber-600 focus:outline-hidden"
            />
          </div>

          {/* Action buttons */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            >
              रद्द करें
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 text-sm font-bold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 rounded-xl shadow-md transition-all flex items-center gap-2"
            >
              {loading ? 'अपडेट हो रहा है...' : 'पुष्टि करें एवं नया पदभार सौंपें'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
