'use client';

import React, { useState, useEffect } from 'react';
import { Users, UserPlus, Phone, Mail, GraduationCap, DollarSign, Trash2, Search, Filter, KeyRound, ShieldCheck } from 'lucide-react';

interface StaffScreenProps {
  userRole: 'Director' | 'Principal' | 'Staff';
}

export function StaffScreen({ userRole }: StaffScreenProps) {
  const [staffList, setStaffList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [newStaff, setNewStaff] = useState({
    name: '',
    designation: 'प्रशिक्षित स्नातक शिक्षक (TGT)',
    department: 'गणित संकाय (Mathematics)',
    subject: 'गणित',
    phone: '',
    email: '',
    qualification: 'M.Sc., B.Ed.',
    salary: '55000',
    password: '',
  });

  const [passwordStaff, setPasswordStaff] = useState<any | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const canManage = userRole === 'Director' || userRole === 'Principal';
  const isDirector = userRole === 'Director';

  useEffect(() => {
    let active = true;
    fetch('/api/staff?q=' + encodeURIComponent(search))
      .then((res) => res.json())
      .then((data) => {
        if (active && data.success) {
          setStaffList(data.staff);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [search]);

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!newStaff.password || newStaff.password.length < 6) {
      setFormError('लॉगिन पासवर्ड आवश्यक है (कम से कम 6 अक्षर)।');
      return;
    }
    try {
      const res = await fetch('/api/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newStaff),
      });
      const data = await res.json();
      if (data.success) {
        setStaffList((prev) => [...prev, data.staffMember]);
        setIsAddOpen(false);
        setFormError(null);
        setNewStaff({
          name: '',
          designation: 'प्रशिक्षित स्नातक शिक्षक (TGT)',
          department: 'गणित संकाय (Mathematics)',
          subject: 'गणित',
          phone: '',
          email: '',
          qualification: 'M.Sc., B.Ed.',
          salary: '55000',
          password: '',
        });
      } else {
        setFormError(data.message || 'स्टाफ जोड़ने में त्रुटि हुई।');
      }
    } catch {
      setFormError('नेटवर्क त्रुटि हुई। कृपया पुनः प्रयास करें।');
    }
  };

  const handleDeleteStaff = async (id: string, name: string) => {
    if (!confirm('क्या आप निश्चित रूप से ' + name + ' को स्टाफ से हटाना चाहते हैं?')) return;
    try {
      const res = await fetch('/api/staff/' + id, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setStaffList((prev) => prev.filter((s) => s.id !== id));
      }
    } catch {
      //
    }
  };

  const openPasswordModal = (staff: any) => {
    setPasswordStaff(staff);
    setNewPassword('');
    setPasswordError(null);
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordStaff) return;
    setPasswordError(null);
    if (!newPassword || newPassword.length < 6) {
      setPasswordError('पासवर्ड कम से कम 6 अक्षरों का होना चाहिए।');
      return;
    }
    try {
      const res = await fetch('/api/staff/' + passwordStaff.id + '/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword }),
      });
      const data = await res.json();
      if (data.success) {
        setStaffList((prev) => prev.map((s) => s.id === passwordStaff.id ? { ...s, hasLogin: true, username: data.username } : s));
        setPasswordStaff(null);
        setNewPassword('');
      } else {
        setPasswordError(data.message || 'पासवर्ड सेट करने में त्रुटि हुई।');
      }
    } catch {
      setPasswordError('नेटवर्क त्रुटि हुई। कृपया पुनः प्रयास करें।');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-900">स्टाफ एवं शिक्षक निर्देशिका</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800">
              कुल: {staffList.length} शिक्षक व कर्मचारी
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            विद्यालय के सभी शिक्षकों, विभागाध्यक्षों (HoDs) व कर्मचारियों का पदभार, योग्यता व संपर्क विवरण।
          </p>
        </div>

        {canManage && (
          <button
            onClick={() => setIsAddOpen(true)}
            className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-md hover:bg-indigo-700 transition-all shrink-0 hover:scale-102"
          >
            <UserPlus className="h-4 w-4" />
            <span>नया शिक्षक / स्टाफ जोड़ें</span>
          </button>
        )}
      </div>

      {/* Search */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="शिक्षक का नाम, कोड या विषय खोजें..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-200 pl-9 pr-4 py-2 text-xs focus:border-indigo-600 focus:outline-hidden"
          />
        </div>
      </div>

      {/* Staff Grid */}
      {loading ? (
        <div className="p-12 text-center text-xs text-slate-500">स्टाफ निर्देशिका लोड हो रही है...</div>
      ) : staffList.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-xs">
          <GraduationCap className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-700">कोई शिक्षक या स्टाफ सदस्य दर्ज नहीं है</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            स्टाफ निर्देशिका स्वच्छ है। विद्यालय के शिक्षकों एवं शैक्षणिक कर्मचारियों का रिकॉर्ड जोड़ने के लिए नीचे दिए बटन पर क्लिक करें।
          </p>
          {canManage && (
            <button
              onClick={() => setIsAddOpen(true)}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-indigo-700 bg-indigo-50 rounded-xl hover:bg-indigo-100 transition"
            >
              <UserPlus className="h-3.5 w-3.5" />
              <span>पहला शिक्षक / स्टाफ जोड़ें</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {staffList.map((staff) => (
            <div key={staff.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between hover:shadow-md transition-shadow">
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-11 w-11 rounded-xl bg-indigo-50 text-indigo-700 font-bold flex items-center justify-center text-sm">
                      {staff.name.slice(0, 1)}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">{staff.name}</h3>
                      <p className="text-[11px] text-slate-500">{staff.designation}</p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700">
                    {staff.employeeCode}
                  </span>
                </div>

                <div className="mt-4 space-y-1.5 text-xs text-slate-600 border-t border-slate-100 pt-3">
                <p className="flex items-center gap-2">
                  <GraduationCap className="h-3.5 w-3.5 text-slate-400" />
                  <span>विभाग: <strong className="text-slate-800">{staff.department}</strong> ({staff.subject})</span>
                </p>
                <p className="flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5 text-emerald-600" />
                  <span>{staff.phone}</span>
                </p>
                <p className="flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5 text-blue-600" />
                  <span>{staff.email}</span>
                </p>
                <p className="flex items-center gap-2">
                  {staff.hasLogin ? (
                    <>
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                      <span className="text-emerald-700">लॉगिन सक्षम · <strong>{staff.username}</strong></span>
                    </>
                  ) : (
                    <>
                      <KeyRound className="h-3.5 w-3.5 text-amber-500" />
                      <span className="text-amber-600">लॉगिन सक्षम नहीं</span>
                    </>
                  )}
                </p>
                {isDirector && (
                  <p className="flex items-center gap-2 pt-1 font-semibold text-emerald-700">
                    <DollarSign className="h-3.5 w-3.5 text-emerald-600" />
                    <span>मासिक वेतन: ₹{(staff.salary || 0).toLocaleString('en-IN')}</span>
                  </p>
                )}
              </div>
            </div>

            {(isDirector || canManage) && (
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                {canManage ? (
                  <button
                    onClick={() => openPasswordModal(staff)}
                    className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold flex items-center gap-1 hover:bg-indigo-50 px-2.5 py-1 rounded-lg transition-colors"
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                    <span>{staff.hasLogin ? 'पासवर्ड रीसेट करें' : 'लॉगिन पासवर्ड सेट करें'}</span>
                  </button>
                ) : (
                  <span />
                )}
                {isDirector && (
                  <button
                    onClick={() => handleDeleteStaff(staff.id, staff.name)}
                    className="text-xs text-rose-600 hover:text-rose-700 font-semibold flex items-center gap-1 hover:bg-rose-50 px-2.5 py-1 rounded-lg transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>स्टाफ से हटाएं</span>
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      )}

      {/* Add Staff Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-indigo-600 p-5 text-white flex items-center justify-between">
              <h2 className="text-base font-bold">नया शिक्षक / स्टाफ सदस्य जोड़ें</h2>
              <button onClick={() => setIsAddOpen(false)} className="text-white/80 hover:text-white">✕</button>
            </div>
            <form onSubmit={handleAddStaff} className="p-6 space-y-3.5 max-h-[80vh] overflow-y-auto">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">शिक्षक का पूरा नाम *</label>
                <input
                  type="text"
                  required
                  placeholder="उदा. श्री विकास मेहरा"
                  value={newStaff.name}
                  onChange={(e) => setNewStaff({ ...newStaff, name: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:outline-hidden"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">पद (Designation)</label>
                  <input
                    type="text"
                    value={newStaff.designation}
                    onChange={(e) => setNewStaff({ ...newStaff, designation: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:outline-hidden"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">विभाग (Department)</label>
                  <input
                    type="text"
                    value={newStaff.department}
                    onChange={(e) => setNewStaff({ ...newStaff, department: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:outline-hidden"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">मोबाइल नंबर *</label>
                  <input
                    type="tel"
                    required
                    placeholder="+91 98000 00000"
                    value={newStaff.phone}
                    onChange={(e) => setNewStaff({ ...newStaff, phone: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:outline-hidden"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">ईमेल *</label>
                  <input
                    type="email"
                    required
                    placeholder="teacher@vidyasetu.edu"
                    value={newStaff.email}
                    onChange={(e) => setNewStaff({ ...newStaff, email: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:outline-hidden"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">विषय विशेषज्ञता</label>
                  <input
                    type="text"
                    value={newStaff.subject}
                    onChange={(e) => setNewStaff({ ...newStaff, subject: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:outline-hidden"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">मासिक वेतन (₹)</label>
                  <input
                    type="number"
                    value={newStaff.salary}
                    onChange={(e) => setNewStaff({ ...newStaff, salary: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:outline-hidden"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">लॉगिन पासवर्ड * (कम से कम 6 अक्षर)</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  placeholder="शिक्षक के लॉगिन हेतु पासवर्ड"
                  value={newStaff.password}
                  onChange={(e) => setNewStaff({ ...newStaff, password: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:outline-hidden"
                />
                <p className="text-[10px] text-slate-500">इस पासवर्ड से शिक्षक लॉगिन कर सकेगा और सूचनाएँ (push notifications) प्राप्त कर सकेगा।</p>
              </div>

              {formError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">{formError}</div>
              )}

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  रद्द करें
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs"
                >
                  स्टाफ में शामिल करें
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Set/Reset Login Password Modal */}
      {passwordStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-indigo-600 p-4 text-white flex items-center justify-between">
              <h2 className="text-sm font-bold">लॉगिन पासवर्ड {passwordStaff.hasLogin ? 'रीसेट' : 'सेट'} करें</h2>
              <button onClick={() => setPasswordStaff(null)} className="text-white/80 hover:text-white">✕</button>
            </div>
            <form onSubmit={handleSetPassword} className="p-5 space-y-3">
              <p className="text-xs text-slate-600">
                <strong>{passwordStaff.name}</strong> ({passwordStaff.email}) के लिए नया पासवर्ड सेट करें।
              </p>
              {passwordError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">{passwordError}</div>
              )}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">नया पासवर्ड (कम से कम 6 अक्षर)</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:outline-hidden"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button type="button" onClick={() => setPasswordStaff(null)} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl">रद्द करें</button>
                <button type="submit" className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs">सहेजें</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
