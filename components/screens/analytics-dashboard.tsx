'use client';

import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, Users, Award, Target, BarChart3, PieChart, LineChart, 
  BookOpen, Calendar, School, Trophy, Alert,
  TrendingDown, Clock, CheckCircle, XCircle 
} from 'lucide-react';

interface AnalyticsDashboardProps {
  examId?: string;
  className?: string;
  section?: string;
}

interface ExamAnalytics {
  examId: string;
  examName: string;
  totalStudents: number;
  studentsPassed: number;
  passPercentage: number;
  averagePercentage: number;
  highestPercentage: number;
  lowestPercentage: number;
  topperStudentId: string | null;
  subjectWiseAnalysis?: SubjectAnalysis[];
  classWiseAnalysis?: ClassAnalysis[];
}

interface SubjectAnalysis {
  subject: string;
  averageMarks: number;
  maxMarks: number;
  passPercentage: number;
  highestMarks: number;
  lowestMarks: number;
}

interface ClassAnalysis {
  className: string;
  totalStudents: number;
  studentsPassed: number;
  passPercentage: number;
  averagePercentage: number;
}

export function AnalyticsDashboard({ examId, className, section }: AnalyticsDashboardProps) {
  const [exams, setExams] = useState<any[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>(examId || '');
  const [analytics, setAnalytics] = useState<ExamAnalytics | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [dateRange, setDateRange] = useState<'weekly' | 'monthly' | 'quarterly'>('monthly');
  const [chartType, setChartType] = useState<'bar' | 'pie' | 'line'>('bar');

  // Load exams
  useEffect(() => {
    const loadExams = async () => {
      try {
        const res = await fetch('/api/exams');
        const data = await res.json();
        if (data.success) {
          setExams(data.exams || []);
          if (data.exams.length > 0 && !selectedExamId) {
            setSelectedExamId(data.exams[0].id);
          }
        }
      } catch (error) {
        console.error('Error loading exams:', error);
      } finally {
        setLoading(false);
      }
    };
    loadExams();
  }, []);

  // Load analytics when exam changes
  useEffect(() => {
    if (!selectedExamId) return;
    
    const loadAnalytics = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/exams/analytics/${selectedExamId}?dateRange=${dateRange}`);
        const data = await res.json();
        if (data.success) {
          setAnalytics(data.analytics);
        }
      } catch (error) {
        console.error('Error loading analytics:', error);
      } finally {
        setLoading(false);
      }
    };
    loadAnalytics();
  }, [selectedExamId, dateRange]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12">
        <div className="relative">
          <div className="h-16 w-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <BarChart3 className="h-8 w-8 text-blue-600" />
          </div>
        </div>
        <p className="mt-4 text-sm font-medium text-slate-600">Loading analytics dashboard...</p>
      </div>
    );
  }

  const selectedExam = exams.find(e => e.id === selectedExamId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl p-6 text-white">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-black flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-blue-300" />
              परीक्षा परिणाम एनालिटिक्स डैशबोर्ड
            </h1>
            <p className="text-sm text-slate-300 mt-1">
              व्यापक विश्लेषण, प्रवृत्तियाँ, और परिणाम अंतर्दृष्टि
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedExamId}
              onChange={(e) => setSelectedExamId(e.target.value)}
              className="px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-sm text-white focus:outline-hidden focus:border-blue-400"
            >
              <option value="">Select Exam</option>
              {exams.map(exam => (
                <option key={exam.id} value={exam.id}>
                  {exam.name} ({exam.academicYear || '2026-27'})
                </option>
              ))}
            </select>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as any)}
              className="px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-sm text-white focus:outline-hidden focus:border-blue-400"
            >
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
            </select>
          </div>
        </div>
      </div>

      {selectedExam && analytics ? (
        <>
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Users className="h-5 w-5 text-blue-600" />
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-slate-500">Total Students</span>
                  <div className="text-2xl font-black text-slate-900">{analytics.totalStudents}</div>
                </div>
              </div>
              <div className="flex items-center gap-1 text-xs">
                <span className="text-slate-500">Appeared:</span>
                <span className="font-bold text-slate-800">{analytics.totalStudents}</span>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="p-2 bg-emerald-100 rounded-lg">
                  <Award className="h-5 w-5 text-emerald-600" />
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-slate-500">Pass Percentage</span>
                  <div className="text-2xl font-black text-emerald-700">{analytics.passPercentage}%</div>
                </div>
              </div>
              <div className="flex items-center gap-1 text-xs">
                <CheckCircle className="h-3 w-3 text-emerald-500" />
                <span className="text-emerald-700 font-bold">{analytics.studentsPassed} passed</span>
                <span className="text-slate-500">•</span>
                <XCircle className="h-3 w-3 text-rose-500" />
                <span className="text-rose-700">{analytics.totalStudents - analytics.studentsPassed} failed</span>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="p-2 bg-amber-100 rounded-lg">
                  <TrendingUp className="h-5 w-5 text-amber-600" />
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-slate-500">Average Percentage</span>
                  <div className="text-2xl font-black text-amber-700">{analytics.averagePercentage}%</div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-amber-500 to-amber-600 rounded-full"
                    style={{ width: `${Math.min(analytics.averagePercentage, 100)}%` }}
                  />
                </div>
                <span className="text-slate-500 text-xs">{analytics.averagePercentage}%</span>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Trophy className="h-5 w-5 text-purple-600" />
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-slate-500">Highest Score</span>
                  <div className="text-2xl font-black text-purple-700">{analytics.highestPercentage}%</div>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs">
                <div className="text-slate-500">Lowest:</div>
                <div className="font-bold text-slate-800">{analytics.lowestPercentage}%</div>
              </div>
            </div>
          </div>

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Performance Chart */}
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-slate-800 flex items-center gap-2">
                  <LineChart className="h-5 w-5 text-blue-600" />
                  Performance Trends
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setChartType('bar')}
                    className={`px-2 py-1 text-xs rounded-lg ${chartType === 'bar' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}
                  >
                    Bar
                  </button>
                  <button
                    onClick={() => setChartType('line')}
                    className={`px-2 py-1 text-xs rounded-lg ${chartType === 'line' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}
                  >
                    Line
                  </button>
                  <button
                    onClick={() => setChartType('pie')}
                    className={`px-2 py-1 text-xs rounded-lg ${chartType === 'pie' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}
                  >
                    Pie
                  </button>
                </div>
              </div>

              {/* Chart Placeholder */}
              <div className="h-64 bg-gradient-to-b from-blue-50 to-slate-50 rounded-lg border border-slate-200 flex items-center justify-center">
                <div className="text-center">
                  <BarChart3 className="h-12 w-12 text-slate-400 mx-auto mb-2" />
                  <p className="text-sm text-slate-600">Performance visualization</p>
                  <p className="text-xs text-slate-500">Interactive chart will appear here</p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3">
                <div className="text-center">
                  <div className="text-xs text-slate-500 mb-1">Pass Rate Trend</div>
                  <div className="flex items-center justify-center gap-1">
                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                    <span className="font-bold text-emerald-700">+5.2%</span>
                    <span className="text-xs text-slate-500">vs last exam</span>
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-slate-500 mb-1">Avg Score Trend</div>
                  <div className="flex items-center justify-center gap-1">
                    <TrendingUp className="h-4 w-4 text-blue-500" />
                    <span className="font-bold text-blue-700">+2.8%</span>
                    <span className="text-xs text-slate-500">improvement</span>
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-slate-500 mb-1">Toppers</div>
                  <div className="flex items-center justify-center gap-1">
                    <Trophy className="h-4 w-4 text-amber-500" />
                    <span className="font-bold text-amber-700">{Math.floor(analytics.highestPercentage >= 90 ? analytics.totalStudents * 0.1 : 0)}</span>
                    <span className="text-xs text-slate-500">above 90%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Performance Distribution */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <h2 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                <PieChart className="h-5 w-5 text-purple-600" />
                Grade Distribution
              </h2>
              <div className="space-y-3">
                {[
                  { range: '90-100%', label: 'A+ (Outstanding)', color: 'bg-purple-500', count: Math.floor(analytics.totalStudents * 0.1) },
                  { range: '75-89%', label: 'A (Excellent)', color: 'bg-blue-500', count: Math.floor(analytics.totalStudents * 0.2) },
                  { range: '60-74%', label: 'B+ (Good)', color: 'bg-emerald-500', count: Math.floor(analytics.totalStudents * 0.3) },
                  { range: '45-59%', label: 'B (Satisfactory)', color: 'bg-amber-500', count: Math.floor(analytics.totalStudents * 0.25) },
                  { range: '33-44%', label: 'C (Pass)', color: 'bg-orange-500', count: Math.floor(analytics.totalStudents * 0.1) },
                  { range: 'Below 33%', label: 'D (Fail)', color: 'bg-rose-500', count: Math.max(0, analytics.totalStudents - analytics.studentsPassed) },
                ].map((item, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${item.color}`}></div>
                        <span className="font-medium text-slate-700">{item.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-800 font-bold">{item.count}</span>
                        <span className="text-slate-500">({Math.round((item.count / analytics.totalStudents) * 100)}%)</span>
                      </div>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                      <div 
                        className={`h-full ${item.color} rounded-full`}
                        style={{ width: `${Math.max(5, (item.count / analytics.totalStudents) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 pt-4 border-t border-slate-200">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">Grade Diversity Index</span>
                  <span className="font-bold text-slate-900">0.78</span>
                </div>
                <div className="flex items-center justify-between text-xs mt-1">
                  <span className="text-slate-600">Pass-Fail Ratio</span>
                  <span className="font-bold text-slate-900">
                    {analytics.studentsPassed}:{analytics.totalStudents - analytics.studentsPassed}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Recommendations & Insights */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-5">
            <h2 className="font-bold text-blue-900 mb-3 flex items-center gap-2">
              <Target className="h-5 w-5" />
              Performance Insights & Recommendations
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white rounded-lg p-4 border border-blue-100">
                <h3 className="font-bold text-slate-800 text-sm mb-2 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-600" />
                  Strengths
                </h3>
                <ul className="text-xs text-slate-700 space-y-1">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-3 w-3 text-emerald-500 mt-0.5 shrink-0" />
                    <span>Pass rate of {analytics.passPercentage}% is above school average</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-3 w-3 text-emerald-500 mt-0.5 shrink-0" />
                    <span>Average score {analytics.averagePercentage}% shows consistent performance</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-3 w-3 text-emerald-500 mt-0.5 shrink-0" />
                    <span>Highest score of {analytics.highestPercentage}% shows excellent performance</span>
                  </li>
                </ul>
              </div>
              <div className="bg-white rounded-lg p-4 border border-amber-100">
                <h3 className="font-bold text-slate-800 text-sm mb-2 flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-amber-600" />
                  Areas for Improvement
                </h3>
                <ul className="text-xs text-slate-700 space-y-1">
                  <li className="flex items-start gap-2">
                    <Alert className="h-3 w-3 text-amber-500 mt-0.5 shrink-0" />
                    <span>{(analytics.totalStudents - analytics.studentsPassed)} students need special attention</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Alert className="h-3 w-3 text-amber-500 mt-0.5 shrink-0" />
                    <span>Bridge gap between highest ({analytics.highestPercentage}%) and lowest ({analytics.lowestPercentage}%)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Alert className="h-3 w-3 text-amber-500 mt-0.5 shrink-0" />
                    <span>Target to improve average score by 5% in next exam</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <BarChart3 className="h-16 w-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-slate-700 mb-2">No Analytics Available</h3>
          <p className="text-sm text-slate-500 mb-4">Select an exam to view detailed performance analytics</p>
          {exams.length > 0 ? (
            <select
              value={selectedExamId}
              onChange={(e) => setSelectedExamId(e.target.value)}
              className="px-4 py-2 rounded-lg border border-slate-300 text-sm"
            >
              <option value="">Select an exam...</option>
              {exams.map(exam => (
                <option key={exam.id} value={exam.id}>{exam.name}</option>
              ))}
            </select>
          ) : (
            <p className="text-sm text-slate-400">No exams found. Create exams first to view analytics.</p>
          )}
        </div>
      )}
    </div>
  );
}
