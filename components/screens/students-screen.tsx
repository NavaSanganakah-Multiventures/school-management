'use client';

import React, { useState, useEffect } from 'react';
import { Search, Plus, Filter, Phone, UserCheck, Award, Eye, FileText, AlertCircle, Building2, UserX, Sparkles, History } from 'lucide-react';
import { AddScholarModal } from '../modals/add-scholar-modal';
import { ViewScholarModal } from '../modals/view-scholar-modal';
import { IssueTcModal } from '../modals/issue-tc-modal';
import { ReAdmissionModal } from '../modals/re-admission-modal';

interface StudentsScreenProps {
  userRole: 'Director' | 'Principal' | 'Staff';
  currentUser?: any;
}

export function StudentsScreen({ userRole, currentUser }: StudentsScreenProps) {
  const [students, setStudents] = useState<any[]>([]);
  const [selectedClass, setSelectedClass] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [activeScholar, setActiveScholar] = useState<any | null>(null);
  const [tcStudent, setTcStudent] = useState<any | null>(null);
  const [reAdmitStudent, setReAdmitStudent] = useState<any | null>(null);
  const [assignedClasses, setAssignedClasses] = useState<string[]>([]);
  const [isClassTeacher, setIsClassTeacher] = useState(false);
  const [loading, setLoading] = useState(true);

  // Check class teacher assignment
  useEffect(() => {
    fetch('/api/classes/my-classes')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.assignedClasses)) {
          setAssignedClasses(data.assignedClasses);
          setIsClassTeacher(data.assignedClasses.length > 0);
          // If staff and assigned to a class, auto-filter to their assigned class by default
          if (userRole === 'Staff' && data.assignedClasses.length > 0) {
            setSelectedClass(data.assignedClasses[0]);
          }
        }
      })
      .catch(() => {});
  }, [userRole]);

  const isAdmin = userRole === 'Director' || userRole === 'Principal';
  const canManageStudents = isAdmin || isClassTeacher;

  const classesList = [
    'All',
    'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5',
    'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10',
    'Class 11 (Science)', 'Class 11 (Commerce)', 'Class 12 (Science)', 'Class 12 (Commerce)'
  ];

  const fetchStudents = () => {
    const url = `/api/students?class=${selectedClass}&status=${selectedStatus}&q=${encodeURIComponent(searchQuery)}`;
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setStudents(data.students);
        }
      })
      .catch(() => {})
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchStudents();
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

  const handleStudentUpdated = (updated: any) => {
    setStudents((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    if (activeScholar && activeScholar.id === updated.id) {
      setActiveScholar(updated);
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
            {isClassTeacher && userRole === 'Staff' && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                <span>अधिकृत कक्षा अध्यापक: {assignedClasses.join(', ')}</span>
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            भारतीय विद्यालय मानक दाखिला-खारिज (SR) रजिस्टर — स्कॉलर क्रमांक, माता-पिता संपर्क, टी.सी. व पुनः प्रवेश (Re-Admission) प्रबंधन।
          </p>
        </div>

        {canManageStudents ? (
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-md hover:bg-blue-700 transition-all shrink-0 hover:scale-102 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>+ नया स्कॉलर प्रवेश</span>
          </button>
        ) : (
          <div className="text-xs px-3 py-2 bg-slate-100 rounded-xl text-slate-600 font-medium">
            स्टाफ मोड: केवल अवलोकन अनुमति (आप किसी कक्षा के अधिकृत क्लास टीचर नहीं हैं)
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
            placeholder="नाम, SR नंबर, फोन, आधार या रोल नं..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs font-medium rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500 bg-slate-50"
          />
        </div>

        {/* Class Filter */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <Filter className="h-4 w-4 text-slate-400 shrink-0" />
          <select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="w-full md:w-48 px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-slate-50 text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
          >
            {classesList.map((c) => (
              <option key={c} value={c}>
                {c === 'All' ? 'सभी कक्षाएं (All Classes)' : c}
              </option>
            ))}
          </select>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 w-full md:w-auto md:ml-auto overflow-x-auto pb-1 md:pb-0">
          {[
            { id: 'All', label: 'सभी' },
            { id: 'Active', label: 'सक्रिय छात्र' },
            { id: 'TC_Issued', label: 'टी.सी. निर्गत (पुनः प्रवेश हेतु)' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedStatus(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                selectedStatus === tab.id
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table Section */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-500">विद्यार्थी सूची लोड हो रही है...</div>
        ) : students.length === 0 ? (
          <div className="p-12 text-center">
            <UserCheck className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-slate-800">कोई छात्र रिकॉर्ड नहीं मिला</h3>
            <p className="text-xs text-slate-500 mt-1">फ़िल्टर बदलकर देखें या नया स्कॉलर प्रवेश दर्ज करें।</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                  <th className="px-4 py-3.5">स्कॉलर क्रमांक (SR)</th>
                  <th className="px-4 py-3.5">विद्यार्थी नाम</th>
                  <th className="px-4 py-3.5">कक्षा व वर्ग</th>
                  <th className="px-4 py-3.5">पिता का नाम</th>
                  <th className="px-4 py-3.5">अभिभावक फोन</th>
                  <th className="px-4 py-3.5">प्रवेश दिनांक</th>
                  <th className="px-4 py-3.5">स्थिति</th>
                  <th className="px-4 py-3.5 text-right">कार्यवाई (Actions)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
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
                          <p className="flex items-center gap-1">
                            {student.fullName}
                            {student.missingDetails && (
                              <AlertCircle className="h-3.5 w-3.5 text-rose-500 shrink-0" title={`Missing Details: ${student.missingDetails}`} />
                            )}
                          </p>
                          <p className="text-[11px] text-slate-400 font-normal">
                            रोल नं: {student.rollNumber || '—'}
                            {student.missingDetails && <span className="ml-2 text-rose-500 truncate max-w-[120px] inline-block align-bottom" title={student.missingDetails}>(Missing: {student.missingDetails})</span>}
                          </p>
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
                            ? 'bg-amber-100 text-amber-800 border border-amber-300'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {student.status === 'Active' ? 'सक्रिय' : student.status === 'TC_Issued' ? 'टी.सी. निर्गत' : student.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Quick Re-Admit Button if student has TC issued */}
                        {student.status === 'TC_Issued' && canManageStudents && (
                          <button
                            onClick={() => setReAdmitStudent(student)}
                            title="1 वर्ष या अंतराल बाद पुनः प्रवेश करें"
                            className="flex items-center gap-1 px-2.5 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 rounded-lg text-[11px] font-bold transition cursor-pointer shadow-2xs"
                          >
                            <UserCheck className="h-3.5 w-3.5 text-emerald-700" />
                            <span>पुनः प्रवेश</span>
                          </button>
                        )}

                        <button
                          onClick={() => setActiveScholar(student)}
                          title="स्कॉलर कार्ड व इतिहास देखें"
                          className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setTcStudent(student)}
                          title={student.status === 'TC_Issued' ? 'टी.सी. देखें व प्रिंट करें' : 'टी.सी. निर्गत करें'}
                          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                            student.status === 'TC_Issued'
                              ? 'text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100'
                              : 'text-slate-500 hover:text-amber-600 hover:bg-amber-50'
                          }`}
                        >
                          <FileText className="h-4 w-4" />
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => handleDelete(student.id, student.fullName)}
                            title="हटाएं"
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
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
        assignedClasses={assignedClasses}
        isClassTeacher={isClassTeacher && userRole === 'Staff'}
        onSuccess={(newStudent) => {
          setStudents((prev) => [newStudent, ...prev]);
        }}
      />

      <ViewScholarModal
        student={activeScholar}
        onClose={() => setActiveScholar(null)}
        canManage={canManageStudents}
        assignedClasses={assignedClasses}
        userRole={userRole}
        onStudentUpdated={handleStudentUpdated}
        onIssueTc={(studentId) => {
          setStudents((prev) =>
            prev.map((s) => (s.id === studentId ? { ...s, status: 'TC_Issued' } : s))
          );
          fetchStudents();
        }}
      />

      <IssueTcModal
        isOpen={!!tcStudent}
        student={tcStudent}
        onClose={() => setTcStudent(null)}
        onSuccess={(updated) => {
          handleStudentUpdated(updated);
          fetchStudents();
        }}
      />

      <ReAdmissionModal
        isOpen={!!reAdmitStudent}
        student={reAdmitStudent}
        onClose={() => setReAdmitStudent(null)}
        assignedClasses={assignedClasses}
        userRole={userRole}
        onSuccess={(updated) => {
          handleStudentUpdated(updated);
          fetchStudents();
        }}
      />
    </div>
  );
}
