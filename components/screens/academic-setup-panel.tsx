'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { BookOpen, CalendarRange, Plus, Loader2, Save, ClipboardList, Trash2, Settings } from 'lucide-react';

export function AcademicSetupPanel() {
  const [activeSubTab, setActiveSubTab] = useState<'subjects' | 'terms' | 'exam-subjects'>('subjects');
  
  const [subjects, setSubjects] = useState<any[]>([]);
  const [classSubjects, setClassSubjects] = useState<any[]>([]);
  const [examTerms, setExamTerms] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);
  const [selectedExam, setSelectedExam] = useState<string>('');
  const [examSubjects, setExamSubjects] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Subject state
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newSubjectCode, setNewSubjectCode] = useState('');
  
  // Class Subject state
  const [mapClass, setMapClass] = useState('1');
  const [mapSubject, setMapSubject] = useState('');
  const [mapType, setMapType] = useState('Theory');
  const [mapMaxMarks, setMapMaxMarks] = useState('100');

  // Term state
  const [newTermName, setNewTermName] = useState('');
  const [newTermWeight, setNewTermWeight] = useState('100');

  // Exam Subject Assignment state
  const [examSubjectName, setExamSubjectName] = useState('');
  const [examSubjectMaxMarks, setExamSubjectMaxMarks] = useState('100');
  const [examSubjectPassingMarks, setExamSubjectPassingMarks] = useState('33');
  const [examSubjectType, setExamSubjectType] = useState('Theory');
  const [examSubjectOptional, setExamSubjectOptional] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, tRes, eRes] = await Promise.all([
        fetch('/api/subjects'),
        fetch('/api/exams/terms'),
        fetch('/api/exams')
      ]);
      const sData = await sRes.json();
      const tData = await tRes.json();
      const eData = await eRes.json();
      
      if (sData.success) {
        setSubjects(sData.subjects || []);
        setClassSubjects(sData.classSubjects || []);
      }
      if (tData.success) {
        setExamTerms(tData.examTerms || []);
      }
      if (eData.success) {
        setExams(eData.exams || []);
        if (eData.exams && eData.exams.length > 0 && !selectedExam) {
          setSelectedExam(eData.exams[0].id);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadExamSubjects = async (examId: string) => {
    if (!examId) return;
    try {
      const res = await fetch(`/api/exams/${examId}/subjects`);
      const data = await res.json();
      if (data.success) {
        setExamSubjects(data.subjects || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (selectedExam) {
      loadExamSubjects(selectedExam);
    }
  }, [selectedExam]);

  const addSubject = async () => {
    if (!newSubjectName) return;
    setSaving(true);
    try {
      const res = await fetch('/api/subjects', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectName: newSubjectName, subjectCode: newSubjectCode })
      });
      const data = await res.json();
      if (data.success) {
        setNewSubjectName('');
        setNewSubjectCode('');
        await loadData();
      } else {
        alert(data.message || 'विषय जोड़ने में त्रुटि।');
      }
    } catch (e) {
      alert('नेटवर्क त्रुटि। कृपया पुनः प्रयास करें।');
    } finally {
      setSaving(false);
    }
  };

  const mapSubjectToClass = async () => {
    if (!mapClass || !mapSubject) return;
    setSaving(true);
    try {
      const res = await fetch('/api/subjects/map', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ className: mapClass, subjectId: mapSubject, subjectType: mapType, maxMarks: parseFloat(mapMaxMarks) })
      });
      const data = await res.json();
      if (data.success) {
        setMapSubject('');
        await loadData();
      } else {
        alert(data.message || 'मैपिंग में त्रुटि।');
      }
    } catch (e) {
      alert('नेटवर्क त्रुटि।');
    } finally {
      setSaving(false);
    }
  };

  const addTerm = async () => {
    if (!newTermName) return;
    setSaving(true);
    try {
      const res = await fetch('/api/exams/terms', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ termName: newTermName, weightagePercent: parseFloat(newTermWeight) })
      });
      const data = await res.json();
      if (data.success) {
        setNewTermName('');
        await loadData();
      } else {
        alert(data.message || 'टर्म जोड़ने में त्रुटि।');
      }
    } catch (e) {
      alert('नेटवर्क त्रुटि।');
    } finally {
      setSaving(false);
    }
  };

  const addExamSubject = async () => {
    if (!selectedExam || !examSubjectName.trim()) {
      alert('कृपया परीक्षा चुनें और विषय का नाम भरें।');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/exams/${selectedExam}/subjects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjectName: examSubjectName.trim(),
          maxMarks: parseFloat(examSubjectMaxMarks) || 100,
          passingMarks: parseFloat(examSubjectPassingMarks) || 33,
          subjectType: examSubjectType,
          isOptional: examSubjectOptional,
        })
      });
      const data = await res.json();
      if (data.success) {
        setExamSubjectName('');
        setExamSubjectMaxMarks('100');
        setExamSubjectPassingMarks('33');
        setExamSubjectType('Theory');
        setExamSubjectOptional(false);
        await loadExamSubjects(selectedExam);
      } else {
        alert(data.message || 'विषय जोड़ने में त्रुटि।');
      }
    } catch (e) {
      alert('नेटवर्क त्रुटि।');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center">
        <Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-400" />
        <p className="text-sm text-slate-500 mt-2">डेटा लोड हो रहा है...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex bg-slate-100 p-1 rounded-xl w-max overflow-x-auto">
        <button onClick={() => setActiveSubTab('subjects')} className={`px-4 py-2 text-sm font-semibold rounded-lg whitespace-nowrap ${activeSubTab === 'subjects' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
          <BookOpen className="h-4 w-4 inline mr-1" />
          Subjects & Mapping
        </button>
        <button onClick={() => setActiveSubTab('exam-subjects')} className={`px-4 py-2 text-sm font-semibold rounded-lg whitespace-nowrap ${activeSubTab === 'exam-subjects' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
          <ClipboardList className="h-4 w-4 inline mr-1" />
          परीक्षा-विषय असाइनमेंट
        </button>
        <button onClick={() => setActiveSubTab('terms')} className={`px-4 py-2 text-sm font-semibold rounded-lg whitespace-nowrap ${activeSubTab === 'terms' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
          <CalendarRange className="h-4 w-4 inline mr-1" />
          Exam Terms
        </button>
      </div>

      {activeSubTab === 'subjects' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-indigo-600" />
              Master Subjects (मुख्य विषय)
            </h3>
            <p className="text-xs text-slate-500 mb-3">स्कूल में पढ़ाए जाने वाले सभी विषयों की सूची बनाएं।</p>
            <div className="flex gap-2">
              <input 
                value={newSubjectName} 
                onChange={(e) => setNewSubjectName(e.target.value)} 
                placeholder="Subject Name (e.g. Mathematics)" 
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm flex-1 focus:border-blue-500 focus:outline-hidden" 
              />
              <input 
                value={newSubjectCode} 
                onChange={(e) => setNewSubjectCode(e.target.value)} 
                placeholder="Code (e.g. MAT)" 
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm w-32 focus:border-blue-500 focus:outline-hidden" 
              />
              <button 
                onClick={addSubject} 
                disabled={saving || !newSubjectName.trim()}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Plus className="h-4 w-4"/> Add
              </button>
            </div>
            
            {subjects.length > 0 && (
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {subjects.map(s => (
                  <div key={s.id} className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                    <div className="font-bold text-slate-800">{s.subject_name}</div>
                    {s.subject_code && <div className="text-slate-500">{s.subject_code}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
              <Settings className="h-5 w-5 text-emerald-600" />
              Map Subject to Class (कक्षा अनुसार विषय सेट करें)
            </h3>
            <p className="text-xs text-slate-500 mb-3">प्रत्येक कक्षा के लिए विषय असाइन करें।</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <select value={mapClass} onChange={(e) => setMapClass(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm flex-1 focus:border-emerald-500 focus:outline-hidden">
                {[...Array(12)].map((_, i) => <option key={i+1} value={String(i+1)}>Class {i+1}</option>)}
              </select>
              <select value={mapSubject} onChange={(e) => setMapSubject(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm flex-1 focus:border-emerald-500 focus:outline-hidden">
                <option value="">Select Subject</option>
                {subjects.map(s => <option key={s.id} value={s.id}>{s.subject_name}</option>)}
              </select>
              <select value={mapType} onChange={(e) => setMapType(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm w-32 focus:border-emerald-500 focus:outline-hidden">
                <option value="Theory">Theory</option>
                <option value="Practical">Practical</option>
                <option value="Co-Scholastic">Co-Scholastic</option>
              </select>
              <input type="number" value={mapMaxMarks} onChange={(e) => setMapMaxMarks(e.target.value)} placeholder="Max Marks" className="px-3 py-2 border border-slate-300 rounded-lg text-sm w-24 focus:border-emerald-500 focus:outline-hidden" />
              <button 
                onClick={mapSubjectToClass} 
                disabled={saving || !mapSubject}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Save className="h-4 w-4"/> Map
              </button>
            </div>
            
            {classSubjects.length > 0 && (
              <div className="mt-4 border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="p-3 font-semibold text-slate-700">Class</th>
                      <th className="p-3 font-semibold text-slate-700">Subject</th>
                      <th className="p-3 font-semibold text-slate-700">Type</th>
                      <th className="p-3 font-semibold text-slate-700">Max Marks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {classSubjects.map(cs => (
                      <tr key={cs.id} className="hover:bg-slate-50">
                        <td className="p-3">Class {cs.class_name}</td>
                        <td className="p-3 font-medium text-slate-900">{cs.subject_name}</td>
                        <td className="p-3 text-slate-500">{cs.subject_type}</td>
                        <td className="p-3 font-mono text-slate-700">{cs.max_marks}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeSubTab === 'exam-subjects' && (
        <div className="space-y-4">
          <div className="bg-gradient-to-r from-indigo-50 to-blue-50 rounded-xl border border-indigo-200 p-5">
            <h3 className="font-bold text-indigo-900 mb-2 flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              परीक्षा-विषय असाइनमेंट (Exam-Subject Assignment)
            </h3>
            <p className="text-xs text-indigo-700">प्रत्येक परीक्षा के लिए विषय, पूर्णांक और उत्तीर्णांक निर्धारित करें। यह मार्कशीट जनरेशन में उपयोग होगा।</p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="mb-4">
              <label className="block text-sm font-bold text-slate-700 mb-2">परीक्षा चुनें (Select Exam)</label>
              <select 
                value={selectedExam} 
                onChange={(e) => setSelectedExam(e.target.value)} 
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm font-medium focus:border-indigo-500 focus:outline-hidden"
              >
                <option value="">-- परीक्षा चुनें --</option>
                {exams.map(ex => (
                  <option key={ex.id} value={ex.id}>{ex.name} ({ex.academicYear})</option>
                ))}
              </select>
            </div>

            {selectedExam && (
              <>
                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 mb-4">
                  <h4 className="font-bold text-slate-800 text-sm mb-3">नया विषय जोड़ें (Add Subject to Exam)</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">विषय का नाम *</label>
                      <input 
                        value={examSubjectName} 
                        onChange={(e) => setExamSubjectName(e.target.value)} 
                        placeholder="e.g. हिंदी, Mathematics" 
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:border-indigo-500 focus:outline-hidden" 
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">पूर्णांक (Max Marks)</label>
                      <input 
                        type="number" 
                        value={examSubjectMaxMarks} 
                        onChange={(e) => setExamSubjectMaxMarks(e.target.value)} 
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:border-indigo-500 focus:outline-hidden" 
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">उत्तीर्णांक (Passing Marks)</label>
                      <input 
                        type="number" 
                        value={examSubjectPassingMarks} 
                        onChange={(e) => setExamSubjectPassingMarks(e.target.value)} 
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:border-indigo-500 focus:outline-hidden" 
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">विषय प्रकार</label>
                      <select 
                        value={examSubjectType} 
                        onChange={(e) => setExamSubjectType(e.target.value)} 
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:border-indigo-500 focus:outline-hidden"
                      >
                        <option value="Theory">Theory</option>
                        <option value="Practical">Practical</option>
                        <option value="Co-Scholastic">Co-Scholastic</option>
                      </select>
                    </div>
                    <div className="flex items-center pt-6">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={examSubjectOptional} 
                          onChange={(e) => setExamSubjectOptional(e.target.checked)} 
                          className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" 
                        />
                        <span className="text-xs font-semibold text-slate-700">Optional Subject</span>
                      </label>
                    </div>
                    <div className="flex items-end">
                      <button 
                        onClick={addExamSubject} 
                        disabled={saving || !examSubjectName.trim()}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4"/>}
                        Add Subject
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-bold text-slate-800 text-sm mb-3">
                    परीक्षा में विषय ({examSubjects.length})
                  </h4>
                  {examSubjects.length === 0 ? (
                    <div className="p-8 text-center text-sm text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-300">
                      इस परीक्षा के लिए कोई विषय नहीं जोड़ा गया है। कृपया ऊपर से विषय जोड़ें।
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 border-b border-slate-200">
                          <tr>
                            <th className="p-3 font-semibold text-slate-700">विषय</th>
                            <th className="p-3 font-semibold text-slate-700">प्रकार</th>
                            <th className="p-3 font-semibold text-slate-700 text-center">पूर्णांक</th>
                            <th className="p-3 font-semibold text-slate-700 text-center">उत्तीर्णांक</th>
                            <th className="p-3 font-semibold text-slate-700 text-center">Optional</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {examSubjects.map(es => (
                            <tr key={es.id} className="hover:bg-slate-50">
                              <td className="p-3 font-medium text-slate-900">{es.subject_name}</td>
                              <td className="p-3 text-slate-600">{es.subject_type}</td>
                              <td className="p-3 text-center font-mono text-blue-900 font-bold">{es.max_marks}</td>
                              <td className="p-3 text-center font-mono text-slate-700">{es.passing_marks}</td>
                              <td className="p-3 text-center">
                                {es.is_optional ? (
                                  <span className="inline-block px-2 py-0.5 bg-amber-100 text-amber-800 text-xs font-bold rounded-full">Yes</span>
                                ) : (
                                  <span className="text-slate-400 text-xs">—</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}

            {!selectedExam && (
              <div className="p-12 text-center text-sm text-slate-500">
                कृपया ऊपर से कोई परीक्षा चुनें।
              </div>
            )}
          </div>
        </div>
      )}

      {activeSubTab === 'terms' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div>
            <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-2">
              <CalendarRange className="h-5 w-5 text-blue-600" />
              Exam Terms (परीक्षा सत्र)
            </h3>
            <p className="text-xs text-slate-500">मार्कशीट जनरेशन के लिए Terms (जैसे Term 1, Half-Yearly) सेट करें।</p>
          </div>
          <div className="flex gap-2">
            <input 
              value={newTermName} 
              onChange={(e) => setNewTermName(e.target.value)} 
              placeholder="e.g. Term 1, Half-Yearly" 
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm flex-1 focus:border-blue-500 focus:outline-hidden" 
            />
            <input 
              type="number" 
              value={newTermWeight} 
              onChange={(e) => setNewTermWeight(e.target.value)} 
              placeholder="Weightage %" 
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm w-32 focus:border-blue-500 focus:outline-hidden" 
            />
            <button 
              onClick={addTerm} 
              disabled={saving || !newTermName.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Plus className="h-4 w-4"/> Add Term
            </button>
          </div>
          {examTerms.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
              {examTerms.map(t => (
                <div key={t.id} className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-3 hover:shadow-md transition-shadow">
                  <div className="bg-white p-2.5 rounded-lg shadow-sm border border-slate-100">
                    <CalendarRange className="h-5 w-5 text-indigo-500" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-bold text-slate-800 text-sm">{t.term_name}</h4>
                    <p className="text-xs text-slate-500">Weightage: {t.weightage_percent}%</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-sm text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-300">
              कोई टर्म नहीं जोड़ा गया है। कृपया ऊपर से जोड़ें।
            </div>
          )}
        </div>
      )}
    </div>
  );
}
