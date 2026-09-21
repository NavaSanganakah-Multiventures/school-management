'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Award,
  Calendar,
  ChevronRight,
  CheckCircle,
  GraduationCap,
  Printer,
  Plus,
  Edit3,
  Search,
  School,
  AlertCircle,
  Loader2,
  RefreshCw,
  Clock,
  Bell,
  Download,
  FileText,
} from 'lucide-react';
import { MarksEntryModal } from '../modals/marks-entry-modal';
import { AcademicSetupPanel } from './academic-setup-panel';
import { AnalyticsDashboard } from './analytics-dashboard';
import { CBSETemplate, StateBoardTemplate, ModernTemplate } from '../report-templates';

export function ExamsScreen() {
  const [activeMainTab, setActiveMainTab] = useState<'exams' | 'setup' | 'analytics'>('exams');
  const [exams, setExams] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [reportCard, setReportCard] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);
  const [isMarksModalOpen, setIsMarksModalOpen] = useState(false);
  const [isNewExamModalOpen, setIsNewExamModalOpen] = useState(false);
  
  // Real-time updates state
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState<boolean>(true);
  const [refreshInterval, setRefreshInterval] = useState<number>(30000); // 30 seconds
  const [refreshInProgress, setRefreshInProgress] = useState<boolean>(false);
  const [recentChanges, setRecentChanges] = useState<number>(0);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  // New exam form state
  const [newExamName, setNewExamName] = useState('');
  const [newExamTerm, setNewExamTerm] = useState('कक्षा 1 से 12');
  const [newExamStartDate, setNewExamStartDate] = useState('');
  const [newExamEndDate, setNewExamEndDate] = useState('');
  const [savingExam, setSavingExam] = useState(false);

  // Report card template state
  const [selectedTemplate, setSelectedTemplate] = useState<'cbse' | 'state' | 'modern'>('cbse');
  const [schoolName, setSchoolName] = useState<string>('');
  const reportCardRef = useRef<HTMLDivElement>(null);

  // Initial load
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        const [examsRes, studentsRes] = await Promise.all([
          fetch('/api/exams'),
          fetch('/api/students'),
        ]);
        const examsData = await examsRes.json();
        const studentsData = await studentsRes.json();

        if (isMounted) {
          if (examsData.success && examsData.exams) {
            setExams(examsData.exams);
          }
          if (studentsData.success && studentsData.students && studentsData.students.length > 0) {
            setStudents(studentsData.students);
            setSelectedStudentId(studentsData.students[0].id);
          }
        }
      } catch {
        //
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadData();
    return () => {
      isMounted = false;
    };
  }, []);

  // Fetch report card whenever selected student changes
  const fetchReportCard = async (studentId: string) => {
    if (!studentId) return;
    setLoadingReport(true);
    try {
      const res = await fetch(`/api/exams/report-card/${studentId}`);
      const data = await res.json();
      if (data.success) {
        setReportCard(data.reportCard);
        setLastUpdated(data.reportCard?.lastUpdated || new Date().toISOString());
      } else {
        setReportCard(null);
      }
    } catch {
      setReportCard(null);
    } finally {
      setLoadingReport(false);
    }
  };

  // Function to refresh data
  const refreshData = useCallback(async (force = false) => {
    if (refreshInProgress && !force) return;
    
    setRefreshInProgress(true);
    try {
      // If we have a selected student, refresh their marks
      if (selectedStudentId) {
        const res = await fetch(`/api/exams/report-card/${selectedStudentId}`);
        const data = await res.json();
        if (data.success) {
          const previousTotal = reportCard?.totalMarks || 0;
          const newTotal = data.reportCard?.totalMarks || 0;
          
          // Check if marks have changed
          if (Math.abs(newTotal - previousTotal) > 0.1) {
            setRecentChanges(prev => prev + 1);
          }
          
          setReportCard(data.reportCard);
          setLastUpdated(data.reportCard?.lastUpdated || new Date().toISOString());
        }
      }
      
      // Also refresh exams list
      const examsRes = await fetch('/api/exams');
      const examsData = await examsRes.json();
      if (examsData.success) {
        setExams(examsData.exams);
      }
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      setRefreshInProgress(false);
    }
  }, [refreshInProgress, selectedStudentId, reportCard]);

  // Auto-refresh effect
  useEffect(() => {
    if (autoRefreshEnabled) {
      refreshTimerRef.current = setInterval(() => {
        refreshData();
      }, refreshInterval);
    } else if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
    }

    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
    };
  }, [autoRefreshEnabled, refreshInterval, selectedStudentId, refreshData]);

  // Listen for marks entry success
  useEffect(() => {
    if (selectedStudentId) {
      fetchReportCard(selectedStudentId);
    }
  }, [selectedStudentId]);

  const handleCreateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExamName.trim()) return;
    setSavingExam(true);
    try {
      const res = await fetch('/api/exams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          examName: newExamName,
          classes: newExamTerm,
          startDate: newExamStartDate || new Date().toISOString().split('T')[0],
          endDate: newExamEndDate || new Date().toISOString().split('T')[0],
        }),
      });
      const data = await res.json();
      if (data.success && data.exam) {
        setExams((prev) => [...prev, data.exam]);
        setIsNewExamModalOpen(false);
        setNewExamName('');
        // Trigger refresh to show new exam
        setTimeout(() => refreshData(), 1000);
      }
    } catch {
      //
    } finally {
      setSavingExam(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = async () => {
    if (!reportCardRef.current) return;
    try {
      const html2pdf = (await import('html2pdf.js')).default;
      const filename = `${reportCard?.studentName || 'marksheets'}_${reportCard?.className || ''}_${reportCard?.term || ''}.pdf`
        .replace(/\s+/g, '_')
        .replace(/[\/\\]/g, '-');
      const opt = {
        margin: [10, 10, 10, 10] as [number, number, number, number],
        filename,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, letterRendering: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
      };
      await html2pdf().set(opt).from(reportCardRef.current).save();
    } catch (error) {
      console.error('PDF download failed:', error);
      alert('PDF डाउनलोड में त्रुटि। कृपया पुनः प्रयास करें।');
    }
  };

  // Load school preferences for default template
  useEffect(() => {
    (async () => {
      try {
        const [prefsRes, profileRes] = await Promise.all([
          fetch('/api/exams/school-preferences'),
          fetch('/api/school-profile'),
        ]);
        const prefsData = await prefsRes.json();
        const profileData = await profileRes.json();
        if (prefsData.success && prefsData.preferences?.default_report_template_id) {
          const t = prefsData.preferences.default_report_template_id.replace('template_', '');
          if (t === 'cbse' || t === 'state' || t === 'modern') {
            setSelectedTemplate(t as any);
          }
        }
        if (profileData.success && profileData.profile?.school_name) {
          setSchoolName(profileData.profile.school_name);
        }
      } catch {
        //
      }
    })();
  }, []);

  // Format time ago
  const formatTimeAgo = (timestamp: string) => {
    if (!timestamp) return 'Never updated';
    
    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) return 'Invalid date';
      
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      if (diffMs < 0) return 'Future time';
      
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins} min${diffMins !== 1 ? 's' : ''} ago`;
      if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
      return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    } catch (error) {
      return 'Error formatting time';
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-500">
        <div className="relative">
          <Loader2 className="h-12 w-12 animate-spin text-blue-600 mb-4" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-6 h-6 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full animate-pulse"></div>
          </div>
        </div>
        <span className="text-sm font-medium mt-2">परीक्षा डेटा लोड हो रहा है...</span>
        <span className="text-xs text-slate-400 mt-1">Real-time updates will start once loaded</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="flex bg-slate-100 p-1 rounded-xl w-max mb-2 overflow-x-auto">
        <button
          onClick={() => setActiveMainTab('exams')}
          className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap ${
            activeMainTab === 'exams' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          परीक्षा व मार्कशीट (Exams & Results)
        </button>
        <button
          onClick={() => setActiveMainTab('analytics')}
          className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap ${
            activeMainTab === 'analytics' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          एनालिटिक्स (Analytics Dashboard)
        </button>
        <button
          onClick={() => setActiveMainTab('setup')}
          className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap ${
            activeMainTab === 'setup' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          अकादमिक सेटअप (Subjects & Terms)
        </button>
      </div>

      {activeMainTab === 'analytics' ? (
        <AnalyticsDashboard />
      ) : activeMainTab === 'setup' ? (
        <AcademicSetupPanel />
      ) : (
        <>
          {/* Header & Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-blue-900 to-indigo-900 p-6 text-white shadow-md print:hidden">
            <div className="flex items-center gap-3.5">
              <div className="p-3 bg-white/10 rounded-2xl backdrop-blur-xs border border-white/20 shrink-0">
                <GraduationCap className="h-7 w-7 text-amber-300" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-black">परीक्षा एवं परिणाम पोर्टल</h1>
                  <span className="bg-amber-400/20 text-amber-300 border border-amber-400/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
                    सत्र 2026-27
                  </span>
                </div>
                <p className="text-xs text-blue-200 mt-0.5">
                  परीक्षा समय सारिणी, अंक प्रविष्टि एवं सीबीएसई/स्टेट बोर्ड मानक डिजिटल रिपोर्ट कार्ड।
                </p>
                
                {/* Real-time Status Indicator */}
                <div className="flex items-center gap-3 mt-2">
                  <div className="flex items-center gap-1 text-xs">
                    <Clock className="h-3 w-3 text-blue-300" />
                    <span className="text-blue-100">
                      Last updated: {formatTimeAgo(lastUpdated)}
                    </span>
                  </div>
                  {recentChanges > 0 && (
                    <div className="flex items-center gap-1 text-xs bg-emerald-500/30 border border-emerald-400/30 px-2 py-0.5 rounded-full">
                      <Bell className="h-3 w-3 text-emerald-300" />
                      <span className="text-emerald-100">{recentChanges} recent update{recentChanges !== 1 ? 's' : ''}</span>
                    </div>
                  )}
                  {refreshInProgress && (
                    <div className="flex items-center gap-1 text-xs bg-amber-500/30 border border-amber-400/30 px-2 py-0.5 rounded-full">
                      <Loader2 className="h-3 w-3 animate-spin text-amber-300" />
                      <span className="text-amber-100">Updating...</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-2 shrink-0">
              {/* Real-time Controls */}
              <div className="flex items-center gap-2 bg-white/10 border border-white/20 rounded-xl px-3 py-1.5">
                <button
                  onClick={() => setAutoRefreshEnabled(!autoRefreshEnabled)}
                  className={`flex items-center gap-1 text-xs ${
                    autoRefreshEnabled ? 'text-emerald-300' : 'text-slate-300'
                  }`}
                  title={autoRefreshEnabled ? 'Disable auto-refresh' : 'Enable auto-refresh'}
                >
                  <div className={`w-2 h-2 rounded-full ${autoRefreshEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'}`}></div>
                  <span>Auto</span>
                </button>
                <select
                  value={refreshInterval}
                  onChange={(e) => setRefreshInterval(Number(e.target.value))}
                  className="bg-transparent border-none text-xs text-white focus:outline-hidden w-20"
                  disabled={!autoRefreshEnabled}
                >
                  <option value="15000" className="text-slate-900">15 sec</option>
                  <option value="30000" className="text-slate-900">30 sec</option>
                  <option value="60000" className="text-slate-900">1 min</option>
                  <option value="300000" className="text-slate-900">5 min</option>
                </select>
                <button
                  onClick={() => refreshData(true)}
                  disabled={refreshInProgress}
                  className="text-xs text-white hover:text-blue-200 disabled:opacity-50"
                  title="Refresh now"
                >
                  <RefreshCw className={`h-3 w-3 ${refreshInProgress ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {/* Action Buttons */}
              <button
                onClick={() => setIsNewExamModalOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold border border-white/20 transition-all cursor-pointer"
              >
                <Plus className="h-4 w-4 text-amber-300" />
                <span>+ नई परीक्षा जोड़ें</span>
              </button>
              <button
                onClick={() => setIsMarksModalOpen(true)}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-black shadow-md transition-all active:scale-95 cursor-pointer"
              >
                <Edit3 className="h-4 w-4" />
                <span>अंक प्रविष्टि करें</span>
              </button>
            </div>
          </div>

          {/* Examination Schedule Cards */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-3 print:hidden">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-xs text-slate-600 uppercase tracking-wider">
                परीक्षा समय-सारणी एवं सत्र कैलेंडर
              </h2>
              <span className="text-xs text-blue-900 font-semibold">{exams.length} परीक्षाएं सूचीबद्ध</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {exams.map((ex) => (
                <div
                  key={ex.id}
                  className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between hover:bg-slate-100/70 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-lg bg-blue-100 text-blue-800">
                      <Calendar className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-xs text-slate-900">{ex.name}</h3>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {ex.startDate} से {ex.endDate} • {ex.classes || 'समस्त कक्षाएं'}
                      </p>
                    </div>
                  </div>
                  <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0">
                    {ex.status === 'Completed' ? 'सम्पन्न' : 'सक्रिय'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Student Selector Bar */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-slate-700 whitespace-nowrap">
                  विद्यार्थी चुनें:
                </label>
                {reportCard && reportCard.hasData && (
                  <div className="flex items-center gap-1 text-xs">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                    <span className="text-emerald-700 font-medium">Live Data</span>
                  </div>
                )}
              </div>
              <select
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                className="text-xs rounded-xl border border-slate-300 bg-white px-3 py-2 font-medium text-slate-800 focus:border-blue-500 focus:outline-hidden min-w-[240px]"
              >
                {students.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.fullName} ({st.className} - रोल: {st.rollNumber})
                  </option>
                ))}
              </select>
              <div className="hidden sm:flex items-center gap-1 text-xs text-slate-500">
                <Clock className="h-3 w-3" />
                {lastUpdated ? formatTimeAgo(lastUpdated) : 'Select student'}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <label className="text-xs font-bold text-slate-700 whitespace-nowrap">टेम्पलेट:</label>
                <select
                  value={selectedTemplate}
                  onChange={(e) => setSelectedTemplate(e.target.value as any)}
                  className="text-xs rounded-xl border border-slate-300 bg-white px-3 py-2 font-medium text-slate-800 focus:border-blue-500 focus:outline-hidden"
                >
                  <option value="cbse">CBSE फॉर्मेट</option>
                  <option value="state">राज्य बोर्ड फॉर्मेट</option>
                  <option value="modern">मॉडर्न डिजिटल</option>
                </select>
              </div>
              <button
                onClick={() => setIsMarksModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-blue-900 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl transition-colors cursor-pointer"
              >
                <Edit3 className="h-3.5 w-3.5" />
                <span>अंक बदलें</span>
              </button>
              <button
                onClick={() => refreshData(true)}
                disabled={refreshInProgress}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${refreshInProgress ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
              <button
                onClick={handleDownloadPDF}
                disabled={!reportCard}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-40"
              >
                <Download className="h-3.5 w-3.5" />
                <span>PDF डाउनलोड</span>
              </button>
              <button
                onClick={handlePrint}
                disabled={!reportCard}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-40"
              >
                <Printer className="h-3.5 w-3.5" />
                <span>प्रिंट</span>
              </button>
            </div>
          </div>

          {/* Report Card Viewer (Screen + Printable Layout) */}
          {loadingReport ? (
            <div className="p-12 text-center text-xs text-slate-500 bg-white rounded-2xl border border-slate-200">
              मार्कशीट डेटा लोड हो रहा है...
            </div>
          ) : reportCard ? (
            <div className="rounded-3xl border-2 border-slate-300 bg-white p-6 sm:p-8 shadow-md print:border-none print:shadow-none print:p-2 print:m-0">
              <div ref={reportCardRef} className="print-target">
                {selectedTemplate === 'cbse' && (
                  <CBSETemplate data={reportCard} schoolName={schoolName || undefined} />
                )}
                {selectedTemplate === 'state' && (
                  <StateBoardTemplate data={reportCard} schoolName={schoolName || undefined} />
                )}
                {selectedTemplate === 'modern' && (
                  <ModernTemplate data={reportCard} schoolName={schoolName || undefined} />
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center space-y-2">
              <p className="text-sm font-semibold text-slate-700">इस छात्र के लिए कोई रिपोर्ट कार्ड उपलब्ध नहीं है</p>
              <button
                onClick={() => setIsMarksModalOpen(true)}
                className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 bg-blue-900 text-white text-xs font-bold rounded-xl shadow-xs"
              >
                <Plus className="h-4 w-4" />
                <span>अभी अंक प्रविष्ट करें</span>
              </button>
            </div>
          )}
        </>
      )}

      {/* Marks Entry Modal */}
      <MarksEntryModal
        isOpen={isMarksModalOpen}
        onClose={() => setIsMarksModalOpen(false)}
        preselectedStudentId={selectedStudentId}
        onSuccess={() => {
          if (selectedStudentId) {
            // Trigger immediate refresh with force
            refreshData(true);
            // Show notification for changes
            setRecentChanges(prev => prev + 1);
            
            // Clear notification after 5 seconds
            setTimeout(() => {
              setRecentChanges(prev => Math.max(0, prev - 1));
            }, 5000);
          }
        }}
      />

      {/* Schedule Exam Modal */}
      {isNewExamModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-900 p-5 text-white flex items-center justify-between">
              <h3 className="text-sm font-bold">नई परीक्षा अनुसूची जोड़ें</h3>
              <button
                onClick={() => setIsNewExamModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateExam} className="p-5 space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">परीक्षा का नाम *</label>
                <input
                  type="text"
                  required
                  placeholder="उदा. प्रथम इकाई परीक्षा / Pre-Board 2027"
                  value={newExamName}
                  onChange={(e) => setNewExamName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-2.5 focus:border-blue-500 focus:outline-hidden"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">कक्षाएं</label>
                <input
                  type="text"
                  value={newExamTerm}
                  onChange={(e) => setNewExamTerm(e.target.value)}
                  placeholder="कक्षा 9वीं व 10वीं"
                  className="w-full rounded-lg border border-slate-300 p-2.5 focus:border-blue-500 focus:outline-hidden"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">प्रारंभ दिनांक</label>
                  <input
                    type="date"
                    value={newExamStartDate}
                    onChange={(e) => setNewExamStartDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 p-2 focus:border-blue-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">समापन दिनांक</label>
                  <input
                    type="date"
                    value={newExamEndDate}
                    onChange={(e) => setNewExamEndDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 p-2 focus:border-blue-500 focus:outline-hidden"
                  />
                </div>
              </div>
              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsNewExamModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-100 text-slate-600 font-semibold"
                >
                  रद्द करें
                </button>
                <button
                  type="submit"
                  disabled={savingExam}
                  className="px-4 py-2 rounded-lg bg-blue-900 text-white font-bold"
                >
                  {savingExam ? 'सहेजा जा रहा है...' : 'परीक्षा जोड़ें'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

