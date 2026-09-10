'use client';

import React, { useState, useEffect } from 'react';
import { UserCheck, Shield, Phone, Mail, GraduationCap, Calendar, History, ArrowRight, AlertTriangle, Sparkles } from 'lucide-react';
import { ChangePrincipalModal } from '../modals/change-principal-modal';

interface PrincipalScreenProps {
  userRole: string;
}

export function PrincipalManagementScreen({ userRole }: PrincipalScreenProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    let active = true;
    fetch('/api/principal')
      .then((res) => res.json())
      .then((json) => {
        if (active && json.success) {
          setData(json);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [refreshTrigger]);

  if (userRole !== 'Director') {
    return (
      <div className="p-8 text-center bg-rose-50 rounded-2xl border border-rose-200 text-rose-800">
        <AlertTriangle className="h-10 w-10 text-rose-600 mx-auto mb-3" />
        <h3 className="text-lg font-bold">पहुंच प्रतिबंधित (Access Restricted)</h3>
        <p className="text-sm text-rose-700 mt-1 max-w-md mx-auto">
          प्रधानाचार्य का पदभार बदलने और प्रबंधित करने का विशेष अधिकार केवल स्कूल निदेशक (Director) के पास सुरक्षित है।
        </p>
      </div>
    );
  }

  const principal = data?.currentPrincipal;
  const history = data?.history || [];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-amber-600 via-amber-700 to-amber-800 rounded-2xl p-6 text-white shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/20 rounded-full text-xs font-bold text-amber-100 mb-2">
            <Shield className="h-3.5 w-3.5" />
            <span>निदेशक नियंत्रण कक्ष (Director Control Room)</span>
          </div>
          <h1 className="text-2xl font-black">प्रधानाचार्य प्रबंधन एवं पदभार</h1>
          <p className="text-xs text-amber-100 mt-1">
            स्कूल के शैक्षणिक प्रमुख (Principal) का विवरण, संपर्क, वेतन एवं आवश्यकता पड़ने पर नए प्रधानाचार्य की नियुक्ति का सीधा नियंत्रण।
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="px-5 py-3 rounded-xl bg-white text-amber-900 hover:bg-amber-50 font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 shrink-0 hover:scale-102"
        >
          <UserCheck className="h-5 w-5 text-amber-700" />
          <span>प्रधानाचार्य बदलें / नया पदभार</span>
        </button>
      </div>

      {/* Current Principal Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Sparkles className="h-4 w-4 text-amber-600" />
            <span>वर्तमान में पदस्थ प्रधानाचार्य (Current Head of School)</span>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            सक्रिय कार्यकाल (Active Tenure)
          </span>
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-slate-500">डेटा लोड हो रहा है...</div>
        ) : principal ? (
          <div className="mt-6 flex flex-col md:flex-row items-start md:items-center gap-6">
            <div className="h-24 w-24 rounded-2xl bg-gradient-to-tr from-amber-600 to-amber-500 text-white flex items-center justify-center text-3xl font-black shadow-md shrink-0">
              {principal.fullName?.slice(0, 1) || 'प्र'}
            </div>

            <div className="space-y-2 grow">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-xl font-bold text-slate-900">{principal.fullName}</h2>
                <span className="text-xs font-semibold px-2.5 py-0.5 bg-slate-100 text-slate-700 rounded-lg">
                  {principal.designation}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-2">
                <div className="flex items-center gap-2 text-slate-600">
                  <Mail className="h-4 w-4 text-amber-600 shrink-0" />
                  <span>ईमेल: <strong className="text-slate-900">{principal.email}</strong></span>
                </div>
                <div className="flex items-center gap-2 text-slate-600">
                  <Phone className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>फोन: <strong className="text-slate-900">{principal.phone}</strong></span>
                </div>
                <div className="flex items-center gap-2 text-slate-600">
                  <GraduationCap className="h-4 w-4 text-blue-600 shrink-0" />
                  <span>योग्यता: <strong className="text-slate-900">{principal.qualification}</strong></span>
                </div>
              </div>

              <div className="pt-2 flex flex-wrap items-center gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-slate-400" />
                  पदभार ग्रहण दिनांक: <strong className="text-slate-700">{principal.createdAt || '2022-06-01'}</strong>
                </span>
                <span>•</span>
                <span>मासिक वेतन: <strong className="text-slate-900 font-semibold">₹{(principal.salary || 125000).toLocaleString('en-IN')}</strong></span>
              </div>
            </div>

            <button
              onClick={() => setIsModalOpen(true)}
              className="px-4 py-2 text-xs font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl transition-colors shrink-0"
            >
              विवरण संपादित करें
            </button>
          </div>
        ) : (
          <div className="py-12 text-center text-sm text-slate-500">कोई सक्रिय प्रधानाचार्य दर्ज नहीं है।</div>
        )}
      </div>

      {/* Appointment History */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <History className="h-4 w-4 text-slate-600" />
            <span>प्रधानाचार्य नियुक्ति एवं कार्यकाल इतिहास (Appointment History)</span>
          </div>
          <span className="text-xs text-slate-500">कुल दर्ज रिकॉर्ड: {history.length}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-700 uppercase font-bold border-y border-slate-200">
              <tr>
                <th className="px-4 py-3">प्रधानाचार्य का नाम</th>
                <th className="px-4 py-3">संपर्क सूत्र (ईमेल / फोन)</th>
                <th className="px-4 py-3">योग्यता</th>
                <th className="px-4 py-3">कार्यकाल (नियुक्ति - कार्यमुक्ति)</th>
                <th className="px-4 py-3">स्थिति</th>
                <th className="px-4 py-3">नियुक्तिकर्ता / टिप्पणी</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {history.map((h: any) => (
                <tr key={h.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-4 py-3 font-bold text-slate-900">{h.fullName}</td>
                  <td className="px-4 py-3">
                    <p className="text-slate-800">{h.email}</p>
                    <p className="text-slate-500 text-[11px]">{h.phone}</p>
                  </td>
                  <td className="px-4 py-3">{h.qualification}</td>
                  <td className="px-4 py-3">
                    <span className="font-semibold text-slate-800">{h.appointedDate}</span>
                    {h.relievedDate && <span className="text-slate-400"> से {h.relievedDate}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                      h.status === 'Active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {h.status === 'Active' ? 'वर्तमान में कार्यरत' : 'पूर्व प्रधानाचार्य'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{h.remarks || h.appointedBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Change Principal Modal */}
      <ChangePrincipalModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        currentPrincipal={principal}
        onSuccess={() => {
          setRefreshTrigger((prev) => prev + 1);
        }}
      />
    </div>
  );
}
