'use client';

import React, { useState, useEffect } from 'react';
import { Search, Plus, Filter, Phone, UserCheck, Award, Eye, FileText, AlertCircle, Building2, UserX } from 'lucide-react';
import { AddScholarModal } from '../modals/add-scholar-modal';
import { ViewScholarModal } from '../modals/view-scholar-modal';

interface StudentsScreenProps {
  userRole: 'Director' | 'Principal' | 'Staff';
}

export function StudentsScreen({ userRole }: StudentsScreenProps) {
  const [students, setStudents] = useState<any[]>([]);
  const [selectedClass, setSelectedClass] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [activeScholar, setActiveScholar] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const canManageStudents = userRole === 'Director' || userRole === 'Principal';

  const classesList = [
    'All',
    'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5',
    'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10',
    'Class 11 (Science)', 'Class 11 (Commerce)', 'Class 12 (Science)', 'Class 12 (Commerce)'
  ];

  useEffect(() => {
    let active = true;
    const url = `/api/students?class=${selectedClass}&status=${selectedStatus}&q=${encodeURIComponent(searchQuery)}`;
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (active && data.success) {
          setStudents(data.students);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedClass, selectedStatus, searchQuery]);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`क्या आप निश्चित रूप से ${name} का स्कॉलर रिकॉर्ड हटाना चाहते हैं?`)) return;
    try {
      const res = await fetch(`/api/students/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setStudents((prev) => prev.filter((s) => s.id !== id));
      }
    } catch {
      //
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-900">स्कॉलर रजिस्टर एवं विद्यार्थी निर्देशिका</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
              कुल: {students.length} छात्र
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            भारतीय विद्यालय मानक दाखिला-खारिज (SR) रजिस्टर — स्कॉलर क्रमांक, माता-पिता संपर्क, आधार व टी.सी. प्रबंधन।
          </p>
        </div>

        {canManageStudents ? (
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-md hover:bg-blue-700 transition-all shrink-0 hover:scale-102"
          >
            <Plus className="h-4 w-4" />
            <span>नया स्कॉलर प्रवेश (New Admission)</span>
          </button>
        ) : (
          <div className="text-xs px-3 py-2 bg-slate-100 rounded-xl text-slate-600 font-medium">
            स्टाफ मोड: केवल अवलोकन अनुमति (Read Only)
          </div>
        )}
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col md:flex-row items-center gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="स्कॉलर नं., नाम, पिता का नाम या फोन..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-xs focus:border-blue-600 focus:outline-hidden"
          />
        </div>

        {/* Class Filter */}
        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          <Filter className="h-4 w-4 text-slate-400 shrink-0 ml-1" />
          <span className="text-xs font-semibold text-slate-600 shrink-0">कक्षा:</span>
          <select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-blue-600 focus:outline-hidden bg-white"
          >
            {classesList.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <span className="text-xs font-semibold text-slate-600 shrink-0">स्थिति:</span>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-blue-600 focus:outline-hidden bg-white"
          >
            <option value="All">सभी (All)</option>
            <option value="Active">सक्रिय (Active)</option>
            <option value="TC_Issued">टी.सी. निर्गत (TC Issued)</option>
          </select>
        </div>
      </div>

      {/* Students Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-sm text-slate-500">डेटा लोड हो रहा है...</div>
        ) : students.length === 0 ? (
          <div className="py-16 text-center">
            <FileText className="h-12 w-12 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-700">कोई स्कॉलर छात्र नहीं मिला</p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              दिए गए फ़िल्टर या खोज के अनुसार कोई रिकॉर्ड उपलब्ध नहीं है। नया प्रवेश दर्ज करने के लिए ऊपर दिए बटन का उपयोग करें।
            </p>
            {canManageStudents && (
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="mt-4 px-4 py-2 text-xs font-bold text-blue-600 bg-blue-50 rounded-xl hover:bg-blue-100"
              >
                + पहला छात्र जोड़ें
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-slate-700 uppercase font-bold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3.5">स्कॉलर क्रमांक (SR No.)</th>
                  <th className="px-4 py-3.5">विद्यार्थी का नाम</th>
                  <th className="px-4 py-3.5">कक्षा व वर्ग</th>
                  <th className="px-4 py-3.5">पिता का नाम</th>
                  <th className="px-4 py-3.5">अभिभावक संपर्क</th>
                  <th className="px-4 py-3.5">प्रवेश दिनांक</th>
                  <th className="px-4 py-3.5">स्थिति</th>
                  <th className="px-4 py-3.5 text-right">कार्य (Actions)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.map((student) => (
                  <tr
                    key={student.id}
                    onClick={() => setActiveScholar(student)}
                    className="hover:bg-blue-50/40 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3.5 font-bold text-blue-700">
                      {student.scholarNumber}
                    </td>
                    <td className="px-4 py-3.5 font-bold text-slate-900">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-full bg-slate-100 text-slate-700 font-bold flex items-center justify-center shrink-0 text-xs">
                          {student.fullName.slice(0, 1)}
                        </div>
                        <div>
                          <p>{student.fullName}</p>
                          <p className="text-[11px] text-slate-400 font-normal">रोल नं: {student.rollNumber}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="font-semibold text-slate-800">{student.className}</span>
                      <span className="text-slate-400 ml-1">({student.section})</span>
                    </td>
                    <td className="px-4 py-3.5 text-slate-700">
                      {student.fatherName}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="font-medium text-slate-800">{student.parentPhone}</span>
                    </td>
                    <td className="px-4 py-3.5 text-slate-500">
                      {student.admissionDate}
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          student.status === 'Active'
                            ? 'bg-emerald-100 text-emerald-800'
                            : student.status === 'TC_Issued'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {student.status === 'Active' ? 'सक्रिय' : student.status === 'TC_Issued' ? 'टी.सी. निर्गत' : student.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setActiveScholar(student)}
                          title="स्कॉलर कार्ड देखें"
                          className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {canManageStudents && (
                          <button
                            onClick={() => handleDelete(student.id, student.fullName)}
                            title="हटाएं"
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          >
                            <UserX className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      <AddScholarModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={(newStudent) => {
          setStudents((prev) => [newStudent, ...prev]);
        }}
      />

      <ViewScholarModal
        student={activeScholar}
        onClose={() => setActiveScholar(null)}
        canManage={canManageStudents}
        onIssueTc={(studentId) => {
          setStudents((prev) =>
            prev.map((s) => (s.id === studentId ? { ...s, status: 'TC_Issued' } : s))
          );
        }}
      />
    </div>
  );
}
