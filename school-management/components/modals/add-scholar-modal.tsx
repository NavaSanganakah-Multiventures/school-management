'use client';

import React, { useState } from 'react';
import { UserPlus, X, FileText, User, Users, MapPin, Building2, CreditCard } from 'lucide-react';

interface AddScholarModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newStudent: any) => void;
  assignedClasses?: string[];
  isClassTeacher?: boolean;
}

export function AddScholarModal({
  isOpen,
  onClose,
  onSuccess,
  assignedClasses = [],
  isClassTeacher = false,
}: AddScholarModalProps) {
  const defaultClass = isClassTeacher && assignedClasses.length > 0 ? assignedClasses[0] : 'Class 10';

  const [formData, setFormData] = useState({
    scholarNumber: '',
    rollNumber: '',
    fullName: '',
    fatherName: '',
    fatherOccupation: '',
    motherName: '',
    className: defaultClass,
    section: 'A',
    dob: '2011-05-15',
    gender: 'Male',
    category: 'General',
    religion: 'Hindu',
    aadhaarNumber: '',
    samagraId: '',
    bloodGroup: 'B+',
    parentPhone: '',
    whatsappNumber: '',
    email: '',
    currentAddress: '',
    permanentAddress: '',
    previousSchool: '',
    previousTcNo: '',
    admissionDate: new Date().toISOString().split('T')[0],
    bankAccountNo: '',
    bankName: '',
    ifscCode: '',
    remarks: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.fullName || !formData.fatherName || !formData.parentPhone) {
      setError('कृपया छात्र का नाम, पिता का नाम और मोबाइल नंबर अनिवार्य रूप से भरें।');
      return;
    }

    try {
      setLoading(true);
      setError('');
      const res = await fetch('/api/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (data.success) {
        onSuccess(data.student);
        onClose();
      } else {
        setError(data.message || 'छात्र का प्रवेश दर्ज करने में त्रुटि');
      }
    } catch {
      setError('सर्वर से संपर्क करने में समस्या आई।');
    } finally {
      setLoading(false);
    }
  };

  const classesList = [
    'Nursery', 'LKG', 'UKG',
    'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5',
    'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10',
    'Class 11 (Science)', 'Class 11 (Commerce)', 'Class 11 (Arts)',
    'Class 12 (Science)', 'Class 12 (Commerce)', 'Class 12 (Arts)'
  ];

  const availableClasses = isClassTeacher && assignedClasses.length > 0
    ? assignedClasses
    : classesList;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-slate-900 px-6 py-4 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-blue-600 p-2 text-white">
              <UserPlus className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">नया स्कॉलर छात्र प्रवेश (Scholar Admission)</h2>
              <p className="text-xs text-slate-300">
                {isClassTeacher
                  ? `कक्षा अध्यापक मोड • अधिकृत कक्षा: ${assignedClasses.join(', ')}`
                  : 'भारतीय स्कूल मानक दाखिला-खारिज (SR) रजिस्टर फॉर्म'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Notice about Returning Students (Re-Admission) */}
        <div className="mx-6 mt-3 p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 flex items-start gap-2 shrink-0">
          <FileText className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <strong>महत्वपूर्ण निर्देश (पुनः प्रवेश):</strong> यदि कोई विद्यार्थी पूर्व में इस विद्यालय में पढ़कर टी.सी. ले गया था (जैसे 1 वर्ष अन्य स्कूल में पढ़कर लौटा है), तो नया स्कॉलर बनाने के बजाय <strong>स्कॉलर रजिस्टर</strong> में उस विद्यार्थी पर <strong>&quot;पुनः प्रवेश (Re-Admission)&quot;</strong> बटन का उपयोग करें, ताकि उसका मूल इतिहास व क्रमांक सुरक्षित रहे।
          </div>
        </div>

        {error && (
          <div className="mx-6 mt-2 p-3 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs font-medium shrink-0">
            {error}
          </div>
        )}

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto grow">
          {/* Section 1: शैक्षणिक एवं स्कॉलर पहचान */}
          <div>
            <div className="flex items-center gap-2 pb-2 border-b border-slate-200 mb-3 text-slate-900 font-bold text-sm">
              <FileText className="h-4 w-4 text-blue-600" />
              <span>1. शैक्षणिक एवं स्कॉलर पहचान (Academic Identity)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-semibold text-slate-700">स्कॉलर क्रमांक (Scholar No. / SR No.)</label>
                <input
                  type="text"
                  placeholder="उदा. SR-2026/005 (खाली छोड़ने पर स्वतः बनेगा)"
                  value={formData.scholarNumber}
                  onChange={(e) => setFormData({ ...formData, scholarNumber: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-hidden"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">कक्षा (Class) *</label>
                <select
                  value={formData.className}
                  onChange={(e) => setFormData({ ...formData, className: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-hidden"
                >
                  {availableClasses.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">वर्ग / सेक्शन (Section)</label>
                <select
                  value={formData.section}
                  onChange={(e) => setFormData({ ...formData, section: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-hidden"
                >
                  <option value="A">Section A</option>
                  <option value="B">Section B</option>
                  <option value="C">Section C</option>
                  <option value="D">Section D</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">रोल नंबर (Roll Number)</label>
                <input
                  type="text"
                  placeholder="उदा. 101"
                  value={formData.rollNumber}
                  onChange={(e) => setFormData({ ...formData, rollNumber: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-hidden"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">प्रवेश दिनांक (Admission Date) *</label>
                <input
                  type="date"
                  required
                  value={formData.admissionDate}
                  onChange={(e) => setFormData({ ...formData, admissionDate: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-hidden"
                />
              </div>
            </div>
          </div>

          {/* Section 2: छात्र का व्यक्तिगत विवरण */}
          <div>
            <div className="flex items-center gap-2 pb-2 border-b border-slate-200 mb-3 text-slate-900 font-bold text-sm">
              <User className="h-4 w-4 text-emerald-600" />
              <span>2. विद्यार्थी का व्यक्तिगत विवरण (Student Details)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-semibold text-slate-700">विद्यार्थी का पूरा नाम (Full Name) *</label>
                <input
                  type="text"
                  required
                  placeholder="उदा. आरव शर्मा"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-hidden"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">लिंग (Gender) *</label>
                <select
                  value={formData.gender}
                  onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-hidden"
                >
                  <option value="Male">छात्र (Male)</option>
                  <option value="Female">छात्रा (Female)</option>
                  <option value="Other">अन्य (Other)</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">जन्म तिथि (DOB) *</label>
                <input
                  type="date"
                  required
                  value={formData.dob}
                  onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-hidden"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">जाति श्रेणी (Category)</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-hidden"
                >
                  <option value="General">सामान्य (General)</option>
                  <option value="OBC">अन्य पिछड़ा वर्ग (OBC)</option>
                  <option value="SC">अनुसूचित जाति (SC)</option>
                  <option value="ST">अनुसूचित जनजाति (ST)</option>
                  <option value="EWS">आर्थिक पिछड़ा (EWS)</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">धर्म (Religion)</label>
                <input
                  type="text"
                  placeholder="हिन्दू / मुस्लिम / सिख आदि"
                  value={formData.religion}
                  onChange={(e) => setFormData({ ...formData, religion: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-hidden"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">रक्त समूह (Blood Group)</label>
                <select
                  value={formData.bloodGroup}
                  onChange={(e) => setFormData({ ...formData, bloodGroup: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-hidden"
                >
                  {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map((bg) => (
                    <option key={bg} value={bg}>{bg}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">आधार कार्ड संख्या (Aadhaar No. - 12 अंक)</label>
                <input
                  type="text"
                  maxLength={14}
                  placeholder="उदा. 4829 1938 2011"
                  value={formData.aadhaarNumber}
                  onChange={(e) => setFormData({ ...formData, aadhaarNumber: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-hidden"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">समग्र / परिवार आईडी (Family ID)</label>
                <input
                  type="text"
                  placeholder="उदा. 10482910"
                  value={formData.samagraId}
                  onChange={(e) => setFormData({ ...formData, samagraId: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-hidden"
                />
              </div>
            </div>
          </div>

          {/* Section 3: माता-पिता व अभिभावक विवरण */}
          <div>
            <div className="flex items-center gap-2 pb-2 border-b border-slate-200 mb-3 text-slate-900 font-bold text-sm">
              <Users className="h-4 w-4 text-purple-600" />
              <span>3. माता-पिता एवं अभिभावक संपर्क (Parent & Guardian)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">पिता का नाम (Father&apos;s Name) *</label>
                <input
                  type="text"
                  required
                  placeholder="श्री राजेश शर्मा"
                  value={formData.fatherName}
                  onChange={(e) => setFormData({ ...formData, fatherName: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-hidden"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">पिता का व्यवसाय (Occupation)</label>
                <input
                  type="text"
                  placeholder="व्यवसायी / सर्विस / किसान"
                  value={formData.fatherOccupation}
                  onChange={(e) => setFormData({ ...formData, fatherOccupation: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-hidden"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">माता का नाम (Mother&apos;s Name)</label>
                <input
                  type="text"
                  placeholder="श्रीमती सुनीता शर्मा"
                  value={formData.motherName}
                  onChange={(e) => setFormData({ ...formData, motherName: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-hidden"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">प्राथमिक मोबाइल नंबर *</label>
                <input
                  type="tel"
                  required
                  placeholder="+91 98765 43210"
                  value={formData.parentPhone}
                  onChange={(e) => setFormData({ ...formData, parentPhone: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-hidden"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">व्हाट्सएप नंबर (WhatsApp)</label>
                <input
                  type="tel"
                  placeholder="+91 98765 43210"
                  value={formData.whatsappNumber}
                  onChange={(e) => setFormData({ ...formData, whatsappNumber: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-hidden"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">ईमेल आईडी (Parent Email)</label>
                <input
                  type="email"
                  placeholder="parent@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-hidden"
                />
              </div>
            </div>
          </div>

          {/* Section 4: आवासीय पता */}
          <div>
            <div className="flex items-center gap-2 pb-2 border-b border-slate-200 mb-3 text-slate-900 font-bold text-sm">
              <MapPin className="h-4 w-4 text-rose-600" />
              <span>4. आवासीय पता (Residential Address)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">वर्तमान पता (Current Address) *</label>
                <textarea
                  rows={2}
                  required
                  placeholder="मकान संख्या, गली, मोहल्ला, शहर एवं पिनकोड"
                  value={formData.currentAddress}
                  onChange={(e) => setFormData({ ...formData, currentAddress: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-hidden"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">स्थायी पता (Permanent Address)</label>
                <textarea
                  rows={2}
                  placeholder="मूल निवास, ग्राम, तहसील, जिला एवं राज्य"
                  value={formData.permanentAddress}
                  onChange={(e) => setFormData({ ...formData, permanentAddress: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-hidden"
                />
              </div>
            </div>
          </div>

          {/* Section 5: पूर्व विद्यालय व टीसी */}
          <div>
            <div className="flex items-center gap-2 pb-2 border-b border-slate-200 mb-3 text-slate-900 font-bold text-sm">
              <Building2 className="h-4 w-4 text-amber-600" />
              <span>5. पूर्व विद्यालय एवं टी.सी. विवरण (Previous School & TC)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">पूर्व विद्यालय का नाम (Previous School)</label>
                <input
                  type="text"
                  placeholder="उदा. दिल्ली पब्लिक स्कूल / केंद्रीय विद्यालय"
                  value={formData.previousSchool}
                  onChange={(e) => setFormData({ ...formData, previousSchool: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-hidden"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">पूर्व टी.सी. क्रमांक (Transfer Certificate No.)</label>
                <input
                  type="text"
                  placeholder="उदा. TC-2026/894"
                  value={formData.previousTcNo}
                  onChange={(e) => setFormData({ ...formData, previousTcNo: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-hidden"
                />
              </div>
            </div>
          </div>

          {/* Section 6: बैंक खाता विवरण */}
          <div>
            <div className="flex items-center gap-2 pb-2 border-b border-slate-200 mb-3 text-slate-900 font-bold text-sm">
              <CreditCard className="h-4 w-4 text-cyan-600" />
              <span>6. बैंक खाता विवरण (छात्रवृत्ति / डीबीटी के लिए)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">बैंक खाता संख्या (Account No.)</label>
                <input
                  type="text"
                  placeholder="उदा. 918273645012"
                  value={formData.bankAccountNo}
                  onChange={(e) => setFormData({ ...formData, bankAccountNo: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-hidden"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">बैंक का नाम (Bank Name)</label>
                <input
                  type="text"
                  placeholder="State Bank of India / PNB"
                  value={formData.bankName}
                  onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-hidden"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">IFSC कोड</label>
                <input
                  type="text"
                  placeholder="SBIN0001234"
                  value={formData.ifscCode}
                  onChange={(e) => setFormData({ ...formData, ifscCode: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-hidden"
                />
              </div>
            </div>
          </div>

          {/* Footer Action Buttons */}
          <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-200 sticky bottom-0 bg-white">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            >
              रद्द करें
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-7 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl shadow-md transition-all flex items-center gap-2"
            >
              {loading ? 'प्रवेश दर्ज हो रहा है...' : 'प्रवेश पंजीयन पूर्ण करें'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
