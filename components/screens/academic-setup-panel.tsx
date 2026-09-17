'use client';

import React, { useState, useEffect } from 'react';
import { BookOpen, CalendarRange, Plus, Loader2, Save } from 'lucide-react';

export function AcademicSetupPanel() {
  const [activeSubTab, setActiveSubTab] = useState<'subjects' | 'terms'>('subjects');
  
  const [subjects, setSubjects] = useState<any[]>([]);
  const [classSubjects, setClassSubjects] = useState<any[]>([]);
  const [examTerms, setExamTerms] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(true);
  
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

  const loadData = async () => {
    setLoading(true);
    try {
      const [sRes, tRes] = await Promise.all([
        fetch('/api/subjects'),
        fetch('/api/exams/terms')
      ]);
      const sData = await sRes.json();
      const tData = await tRes.json();
      if (sData.success) {
        setSubjects(sData.subjects || []);
        setClassSubjects(sData.classSubjects || []);
      }
      if (tData.success) {
        setExamTerms(tData.examTerms || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const addSubject = async () => {
    if (!newSubjectName) return;
    try {
      const res = await fetch('/api/subjects', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectName: newSubjectName, subjectCode: newSubjectCode })
      });
      if ((await res.json()).success) {
        setNewSubjectName('');
        setNewSubjectCode('');
        loadData();
      }
    } catch (e) {}
  };

  const mapSubjectToClass = async () => {
    if (!mapClass || !mapSubject) return;
    try {
      const res = await fetch('/api/subjects/map', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ className: mapClass, subjectId: mapSubject, subjectType: mapType, maxMarks: parseFloat(mapMaxMarks) })
      });
      if ((await res.json()).success) {
        setMapSubject('');
        loadData();
      }
    } catch (e) {}
  };

  const addTerm = async () => {
    if (!newTermName) return;
    try {
      const res = await fetch('/api/exams/terms', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ termName: newTermName, weightagePercent: parseFloat(newTermWeight) })
      });
      if ((await res.json()).success) {
        setNewTermName('');
        loadData();
      }
    } catch (e) {}
  };

  if (loading) {
    return <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-400" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex bg-slate-100 p-1 rounded-xl w-max">
        <button onClick={() => setActiveSubTab('subjects')} className={`px-4 py-2 text-sm font-semibold rounded-lg ${activeSubTab === 'subjects' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600'}`}>Subjects & Mapping</button>
        <button onClick={() => setActiveSubTab('terms')} className={`px-4 py-2 text-sm font-semibold rounded-lg ${activeSubTab === 'terms' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600'}`}>Exam Terms</button>
      </div>

      {activeSubTab === 'subjects' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-3">Master Subjects (मुख्य विषय)</h3>
            <div className="flex gap-2">
              <input value={newSubjectName} onChange={(e) => setNewSubjectName(e.target.value)} placeholder="Subject Name (e.g. Mathematics)" className="px-3 py-2 border rounded-lg text-sm flex-1" />
              <input value={newSubjectCode} onChange={(e) => setNewSubjectCode(e.target.value)} placeholder="Code (e.g. MAT)" className="px-3 py-2 border rounded-lg text-sm w-32" />
              <button onClick={addSubject} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1"><Plus className="h-4 w-4"/> Add</button>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-3">Map Subject to Class (कक्षा अनुसार विषय सेट करें)</h3>
            <div className="flex flex-col sm:flex-row gap-2">
              <select value={mapClass} onChange={(e) => setMapClass(e.target.value)} className="px-3 py-2 border rounded-lg text-sm flex-1">
                {[...Array(12)].map((_, i) => <option key={i+1} value={String(i+1)}>Class {i+1}</option>)}
              </select>
              <select value={mapSubject} onChange={(e) => setMapSubject(e.target.value)} className="px-3 py-2 border rounded-lg text-sm flex-1">
                <option value="">Select Subject</option>
                {subjects.map(s => <option key={s.id} value={s.id}>{s.subject_name}</option>)}
              </select>
              <select value={mapType} onChange={(e) => setMapType(e.target.value)} className="px-3 py-2 border rounded-lg text-sm w-32">
                <option value="Theory">Theory</option>
                <option value="Practical">Practical</option>
                <option value="Co-Scholastic">Co-Scholastic</option>
              </select>
              <input type="number" value={mapMaxMarks} onChange={(e) => setMapMaxMarks(e.target.value)} placeholder="Max Marks" className="px-3 py-2 border rounded-lg text-sm w-24" />
              <button onClick={mapSubjectToClass} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1"><Save className="h-4 w-4"/> Map</button>
            </div>
            
            <div className="mt-4 border border-slate-100 rounded-lg overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="p-3 font-semibold">Class</th>
                    <th className="p-3 font-semibold">Subject</th>
                    <th className="p-3 font-semibold">Type</th>
                    <th className="p-3 font-semibold">Max Marks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {classSubjects.map(cs => (
                    <tr key={cs.id}>
                      <td className="p-3">Class {cs.class_name}</td>
                      <td className="p-3 font-medium">{cs.subject_name}</td>
                      <td className="p-3 text-slate-500">{cs.subject_type}</td>
                      <td className="p-3">{cs.max_marks}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeSubTab === 'terms' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
          <h3 className="font-bold text-slate-800">Exam Terms (परीक्षा सत्र)</h3>
          <p className="text-xs text-slate-500">मार्कशीट जनरेशन के लिए Terms (जैसे Term 1, Half-Yearly) सेट करें।</p>
          <div className="flex gap-2">
            <input value={newTermName} onChange={(e) => setNewTermName(e.target.value)} placeholder="e.g. Term 1" className="px-3 py-2 border rounded-lg text-sm flex-1" />
            <input type="number" value={newTermWeight} onChange={(e) => setNewTermWeight(e.target.value)} placeholder="Weightage %" className="px-3 py-2 border rounded-lg text-sm w-32" />
            <button onClick={addTerm} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1"><Plus className="h-4 w-4"/> Add Term</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
            {examTerms.map(t => (
              <div key={t.id} className="p-4 bg-slate-50 border rounded-xl flex items-center gap-3">
                <div className="bg-white p-2 rounded-lg shadow-sm border border-slate-100"><CalendarRange className="h-5 w-5 text-indigo-500" /></div>
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">{t.term_name}</h4>
                  <p className="text-xs text-slate-500">Weightage: {t.weightage_percent}%</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
