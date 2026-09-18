'use client';

import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  Video,
  FileText,
  CheckCircle2,
  Clock,
  Plus,
  Search,
  Filter,
  GraduationCap,
  Layers,
  Award,
  AlertCircle,
  ChevronRight,
  ExternalLink,
  UploadCloud,
  Send
} from 'lucide-react';

interface Course {
  id: string;
  title: string;
  class_name: string;
  subject: string;
  description: string;
  teacher_name: string;
  created_at: string;
}

interface Lesson {
  id: string;
  course_id: string;
  title: string;
  description: string;
  content_type: 'video' | 'document' | 'quiz' | 'link';
  content_url: string;
  duration_mins: number;
  sequence_order: number;
}

interface Assignment {
  id: string;
  course_id: string;
  title: string;
  instructions: string;
  due_date: string;
  max_marks: number;
  attachment_url: string;
  created_at: string;
}

interface Submission {
  id: string;
  assignment_id: string;
  student_name: string;
  submission_text: string;
  status: string;
  marks_obtained?: number;
  teacher_feedback?: string;
  submitted_at: string;
}

export function PluginLmsScreen() {
  const [activeTab, setActiveTab] = useState<'courses' | 'assignments' | 'createCourse'>('courses');
  const [courses, setCourses] = useState<Course[]>([]);
  const [stats, setStats] = useState({ totalCourses: 0, totalLessons: 0, totalAssignments: 0, totalSubmissions: 0 });
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [courseLessons, setCourseLessons] = useState<Lesson[]>([]);
  const [courseAssignments, setCourseAssignments] = useState<Assignment[]>([]);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [assignmentSubmissions, setAssignmentSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterClass, setFilterClass] = useState('All');

  // Form states
  const [newTitle, setNewTitle] = useState('');
  const [newClass, setNewClass] = useState('कक्षा 10');
  const [newSubject, setNewSubject] = useState('गणित (Mathematics)');
  const [newDesc, setNewDesc] = useState('');

  // Lesson form
  const [isAddLessonOpen, setIsAddLessonOpen] = useState(false);
  const [lessonTitle, setLessonTitle] = useState('');
  const [lessonDesc, setLessonDesc] = useState('');
  const [lessonType, setLessonType] = useState<'video' | 'document' | 'link'>('video');
  const [lessonUrl, setLessonUrl] = useState('');
  const [lessonDuration, setLessonDuration] = useState('20');

  // Assignment form
  const [isAddAssignmentOpen, setIsAddAssignmentOpen] = useState(false);
  const [asgTitle, setAsgTitle] = useState('');
  const [asgInstructions, setAsgInstructions] = useState('');
  const [asgDueDate, setAsgDueDate] = useState('');
  const [asgMaxMarks, setAsgMaxMarks] = useState('100');

  // Grading form
  const [gradingSubId, setGradingSubId] = useState<string | null>(null);
  const [gradeMarks, setGradeMarks] = useState('');
  const [gradeFeedback, setGradeFeedback] = useState('');

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/lms/stats');
      const data = await res.json();
      if (data.success && data.stats) setStats(data.stats);
    } catch (e) {}
  };

  const fetchCourses = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/lms/courses');
      const data = await res.json();
      if (data.success && Array.isArray(data.courses)) {
        setCourses(data.courses);
        if (data.courses.length > 0 && !selectedCourse) {
          loadCourseDetails(data.courses[0]);
        }
      }
    } catch (e) {}
    setLoading(false);
  };

  const loadCourseDetails = async (course: Course) => {
    setSelectedCourse(course);
    try {
      const res = await fetch(`/api/lms/courses/${course.id}`);
      const data = await res.json();
      if (data.success) {
        setCourseLessons(data.lessons || []);
        setCourseAssignments(data.assignments || []);
      }
    } catch (e) {}
  };

  const loadSubmissions = async (assignment: Assignment) => {
    setSelectedAssignment(assignment);
    try {
      const res = await fetch(`/api/lms/assignments/${assignment.id}/submissions`);
      const data = await res.json();
      if (data.success) {
        setAssignmentSubmissions(data.submissions || []);
      }
    } catch (e) {}
  };

  useEffect(() => {
    fetchStats();
    fetchCourses();
  }, []);

  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    try {
      const res = await fetch('/api/lms/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle,
          className: newClass,
          subject: newSubject,
          description: newDesc
        })
      });
      const data = await res.json();
      if (data.success) {
        setNewTitle('');
        setNewDesc('');
        setActiveTab('courses');
        await fetchCourses();
        await fetchStats();
      } else {
        alert(data.message || 'कोर्स बनाने में त्रुटि।');
      }
    } catch (e) {
      alert('नेटवर्क त्रुटि।');
    }
  };

  const handleAddLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourse || !lessonTitle.trim()) return;

    try {
      const res = await fetch(`/api/lms/courses/${selectedCourse.id}/lessons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: lessonTitle,
          description: lessonDesc,
          contentType: lessonType,
          contentUrl: lessonUrl,
          durationMins: Number(lessonDuration),
          sequenceOrder: courseLessons.length + 1
        })
      });
      const data = await res.json();
      if (data.success) {
        setLessonTitle('');
        setLessonDesc('');
        setLessonUrl('');
        setIsAddLessonOpen(false);
        await loadCourseDetails(selectedCourse);
        await fetchStats();
      }
    } catch (e) {}
  };

  const handleAddAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourse || !asgTitle.trim() || !asgDueDate) return;

    try {
      const res = await fetch(`/api/lms/courses/${selectedCourse.id}/assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: asgTitle,
          instructions: asgInstructions,
          dueDate: asgDueDate,
          maxMarks: Number(asgMaxMarks)
        })
      });
      const data = await res.json();
      if (data.success) {
        setAsgTitle('');
        setAsgInstructions('');
        setAsgDueDate('');
        setIsAddAssignmentOpen(false);
        await loadCourseDetails(selectedCourse);
        await fetchStats();
      }
    } catch (e) {}
  };

  const handleGradeSubmission = async (subId: string) => {
    if (!gradeMarks) return;
    try {
      const res = await fetch(`/api/lms/submissions/${subId}/grade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          marksObtained: Number(gradeMarks),
          teacherFeedback: gradeFeedback
        })
      });
      const data = await res.json();
      if (data.success) {
        setGradingSubId(null);
        setGradeMarks('');
        setGradeFeedback('');
        if (selectedAssignment) await loadSubmissions(selectedAssignment);
      }
    } catch (e) {}
  };

  const filteredCourses = courses.filter(c => {
    const matchesSearch = c.title.toLowerCase().includes(searchTerm.toLowerCase()) || c.subject.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesClass = filterClass === 'All' || c.class_name === filterClass;
    return matchesSearch && matchesClass;
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-indigo-900 rounded-3xl p-6 lg:p-8 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/15 backdrop-blur-md rounded-full text-xs font-semibold text-blue-100 mb-3 border border-white/20">
            <GraduationCap className="h-3.5 w-3.5" />
            <span>विद्या सेतु डिजिटल LMS प्लगइन</span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-black tracking-tight">डिजिटल क्लासरूम एवं ई-लर्निंग पोर्टल</h1>
          <p className="text-sm text-blue-100 mt-1 max-w-2xl leading-relaxed">
            कक्षावार वीडियो लेक्चर्स, इंटरैक्टिव पाठ्य सामग्री, डिजिटल असाइनमेंट्स और छात्रों का प्रगति विश्लेषण।
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveTab('createCourse')}
            className="px-4 py-2.5 bg-white text-blue-900 hover:bg-blue-50 font-bold text-xs rounded-xl shadow-md transition flex items-center gap-2 cursor-pointer shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span>नया कोर्स जोड़ें</span>
          </button>
        </div>
      </div>

      {/* Overview Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
            <BookOpen className="h-6 w-6" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900">{stats.totalCourses}</div>
            <div className="text-xs text-slate-500 font-medium">कुल सक्रिय कोर्सेज</div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold">
            <Video className="h-6 w-6" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900">{stats.totalLessons}</div>
            <div className="text-xs text-slate-500 font-medium">वीडियो व पाठ्य सामग्री</div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
            <FileText className="h-6 w-6" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900">{stats.totalAssignments}</div>
            <div className="text-xs text-slate-500 font-medium">सक्रिय असाइनमेंट्स</div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
            <Award className="h-6 w-6" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900">{stats.totalSubmissions}</div>
            <div className="text-xs text-slate-500 font-medium">कुल छात्र सबमिशन</div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('courses')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-2 ${
            activeTab === 'courses' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <BookOpen className="h-4 w-4" />
          <span>कोर्सेज एवं पाठ सामग्री</span>
        </button>

        <button
          onClick={() => setActiveTab('assignments')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-2 ${
            activeTab === 'assignments' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <FileText className="h-4 w-4" />
          <span>असाइनमेंट्स एवं सबमिशन जांच</span>
        </button>

        <button
          onClick={() => setActiveTab('createCourse')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-2 ${
            activeTab === 'createCourse' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Plus className="h-4 w-4" />
          <span>नया कोर्स बनाएं</span>
        </button>
      </div>

      {/* Tab 1: Courses & Lessons */}
      {activeTab === 'courses' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Courses Sidebar */}
          <div className="lg:col-span-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="कोर्स या विषय खोजें..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                />
              </div>
              <select
                value={filterClass}
                onChange={(e) => setFilterClass(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl text-xs py-2 px-3 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="All">सभी कक्षाएं</option>
                <option value="कक्षा 9">कक्षा 9</option>
                <option value="कक्षा 10">कक्षा 10</option>
                <option value="कक्षा 11">कक्षा 11</option>
                <option value="कक्षा 12">कक्षा 12</option>
              </select>
            </div>

            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
              {filteredCourses.length === 0 ? (
                <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 text-slate-400 text-xs">
                  कोई कोर्स उपलब्ध नहीं है। नया कोर्स जोड़ें।
                </div>
              ) : (
                filteredCourses.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => loadCourseDetails(c)}
                    className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                      selectedCourse?.id === c.id
                        ? 'bg-blue-50/70 border-blue-500 shadow-xs'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                        {c.class_name} • {c.subject}
                      </span>
                      <ChevronRight className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 mt-2 line-clamp-1">{c.title}</h3>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{c.description || 'कोई विवरण नहीं।'}</p>
                    <div className="text-[10px] text-slate-400 font-medium mt-3 flex items-center justify-between">
                      <span>शिक्षक: {c.teacher_name || 'विद्यालय संकाय'}</span>
                      <span>सक्रिय</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Course Details View */}
          <div className="lg:col-span-8 bg-white rounded-3xl p-6 border border-slate-200/80 shadow-2xs space-y-6">
            {selectedCourse ? (
              <>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                  <div>
                    <div className="text-xs font-bold text-blue-600 uppercase tracking-wider">
                      {selectedCourse.class_name} • {selectedCourse.subject}
                    </div>
                    <h2 className="text-xl font-black text-slate-900 mt-1">{selectedCourse.title}</h2>
                    <p className="text-xs text-slate-600 mt-1">{selectedCourse.description}</p>
                  </div>
                  <button
                    onClick={() => setIsAddLessonOpen(true)}
                    className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer shrink-0 self-start sm:self-auto"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>पाठ जोड़ें</span>
                  </button>
                </div>

                {/* Lessons List */}
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <Layers className="h-4 w-4 text-indigo-600" />
                    <span>पाठ एवं अध्ययन सामग्री ({courseLessons.length})</span>
                  </h3>

                  {courseLessons.length === 0 ? (
                    <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-slate-400 text-xs">
                      इस कोर्स में अभी कोई पाठ नहीं जोड़ा गया है।
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {courseLessons.map((lsn, idx) => (
                        <div
                          key={lsn.id}
                          className="p-3.5 rounded-xl bg-slate-50 hover:bg-slate-100/80 border border-slate-200/70 flex items-center justify-between gap-3 transition"
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-black shrink-0">
                              {idx + 1}
                            </div>
                            <div>
                              <div className="text-xs font-bold text-slate-900">{lsn.title}</div>
                              <div className="text-[10px] text-slate-500 flex items-center gap-2 mt-0.5">
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" /> {lsn.duration_mins} मिनट
                                </span>
                                <span>•</span>
                                <span className="capitalize">{lsn.content_type}</span>
                              </div>
                            </div>
                          </div>

                          {lsn.content_url && (
                            <a
                              href={lsn.content_url}
                              target="_blank"
                              rel="noreferrer"
                              className="p-2 bg-white hover:bg-blue-50 text-blue-600 border border-slate-200 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition shadow-2xs"
                            >
                              <span>देखें</span>
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Modal: Add Lesson */}
                {isAddLessonOpen && (
                  <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
                      <h3 className="text-base font-bold text-slate-900">नया पाठ जोड़ें ({selectedCourse.title})</h3>
                      <form onSubmit={handleAddLesson} className="space-y-3">
                        <div>
                          <label className="text-xs font-semibold text-slate-700">पाठ का शीर्षक *</label>
                          <input
                            type="text"
                            required
                            value={lessonTitle}
                            onChange={(e) => setLessonTitle(e.target.value)}
                            placeholder="उदा. अध्याय 1: वास्तविक संख्याएँ"
                            className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 font-medium"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-slate-700">कंटेंट प्रकार</label>
                          <select
                            value={lessonType}
                            onChange={(e) => setLessonType(e.target.value as any)}
                            className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium"
                          >
                            <option value="video">वीडियो लेक्चर (YouTube / MP4)</option>
                            <option value="document">दस्तावेज़ / PDF</option>
                            <option value="link">वेब लिंक / संदर्भ</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-slate-700">URL / लिंक</label>
                          <input
                            type="url"
                            value={lessonUrl}
                            onChange={(e) => setLessonUrl(e.target.value)}
                            placeholder="https://..."
                            className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-slate-700">अवधि (मिनट में)</label>
                          <input
                            type="number"
                            value={lessonDuration}
                            onChange={(e) => setLessonDuration(e.target.value)}
                            className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium"
                          />
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                          <button
                            type="button"
                            onClick={() => setIsAddLessonOpen(false)}
                            className="px-4 py-2 border border-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
                          >
                            रद्द करें
                          </button>
                          <button
                            type="submit"
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl cursor-pointer"
                          >
                            सुरक्षित करें
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="p-12 text-center text-slate-400 text-sm">विवरण देखने के लिए कोई कोर्स चुनें।</div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Assignments & Submissions */}
      {activeTab === 'assignments' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-white rounded-3xl p-6 border border-slate-200/80 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <FileText className="h-5 w-5 text-indigo-600" />
                <span>असाइनमेंट सूची</span>
              </h3>
              {selectedCourse && (
                <button
                  onClick={() => setIsAddAssignmentOpen(true)}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>असाइनमेंट बनाएं</span>
                </button>
              )}
            </div>

            {selectedCourse ? (
              <div className="space-y-2">
                {courseAssignments.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs">इस कोर्स में कोई असाइनमेंट नहीं है।</div>
                ) : (
                  courseAssignments.map((asg) => (
                    <div
                      key={asg.id}
                      onClick={() => loadSubmissions(asg)}
                      className={`p-3.5 rounded-2xl border cursor-pointer transition ${
                        selectedAssignment?.id === asg.id
                          ? 'bg-indigo-50/70 border-indigo-500 shadow-2xs'
                          : 'bg-slate-50 border-slate-200/70 hover:bg-slate-100'
                      }`}
                    >
                      <div className="text-xs font-bold text-slate-900">{asg.title}</div>
                      <div className="text-[11px] text-slate-500 mt-1 line-clamp-2">{asg.instructions}</div>
                      <div className="flex items-center justify-between text-[10px] text-slate-400 mt-2 font-medium">
                        <span>अंतिम तिथि: {asg.due_date}</span>
                        <span>पूर्णांक: {asg.max_marks}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="p-6 text-center text-slate-400 text-xs">पहले कोई कोर्स चुनें।</div>
            )}
          </div>

          {/* Submissions View */}
          <div className="lg:col-span-7 bg-white rounded-3xl p-6 border border-slate-200/80 shadow-2xs space-y-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Award className="h-5 w-5 text-emerald-600" />
              <span>छात्र सबमिशन ({assignmentSubmissions.length})</span>
            </h3>

            {selectedAssignment ? (
              <div className="space-y-3">
                {assignmentSubmissions.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs">अभी तक कोई सबमिशन प्राप्त नहीं हुआ है।</div>
                ) : (
                  assignmentSubmissions.map((sub) => (
                    <div key={sub.id} className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900">{sub.student_name}</span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            sub.status === 'graded' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {sub.status === 'graded' ? `जांचा गया (${sub.marks_obtained || 0} अंक)` : 'जांच हेतु लंबित'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600">{sub.submission_text || 'कोई लिखित उत्तर नहीं।'}</p>

                      {sub.teacher_feedback && (
                        <div className="p-2.5 rounded-xl bg-emerald-50/80 text-emerald-900 text-xs border border-emerald-200 font-medium">
                          शिक्षक फीडबैक: {sub.teacher_feedback}
                        </div>
                      )}

                      {sub.status !== 'graded' && (
                        <div className="pt-2">
                          {gradingSubId === sub.id ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                placeholder="अंक"
                                value={gradeMarks}
                                onChange={(e) => setGradeMarks(e.target.value)}
                                className="w-20 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold"
                              />
                              <input
                                type="text"
                                placeholder="फीडबैक / टिप्पणी"
                                value={gradeFeedback}
                                onChange={(e) => setGradeFeedback(e.target.value)}
                                className="flex-1 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-medium"
                              />
                              <button
                                onClick={() => handleGradeSubmission(sub.id)}
                                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg cursor-pointer"
                              >
                                दर्ज करें
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setGradingSubId(sub.id)}
                              className="text-xs text-blue-600 font-bold hover:underline cursor-pointer"
                            >
                              अंक व फीडबैक दें →
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="p-8 text-center text-slate-400 text-xs">सबमिशन देखने के लिए कोई असाइनमेंट चुनें।</div>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Create Course Form */}
      {activeTab === 'createCourse' && (
        <div className="bg-white rounded-3xl p-6 lg:p-8 border border-slate-200/80 shadow-2xs max-w-2xl mx-auto space-y-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
              <Plus className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">नया LMS कोर्स बनाएं</h2>
              <p className="text-xs text-slate-500">पाठ्यक्रम और डिजिटल अध्ययन सामग्री प्रकाशित करें।</p>
            </div>
          </div>

          <form onSubmit={handleCreateCourse} className="space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-700">कोर्स का शीर्षक *</label>
              <input
                type="text"
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="उदा. कक्षा 10 गणित: त्रिकोणमिति एवं ज्यामिति"
                className="w-full mt-1.5 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 font-medium"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-700">कक्षा *</label>
                <select
                  value={newClass}
                  onChange={(e) => setNewClass(e.target.value)}
                  className="w-full mt-1.5 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium"
                >
                  <option value="कक्षा 6">कक्षा 6</option>
                  <option value="कक्षा 7">कक्षा 7</option>
                  <option value="कक्षा 8">कक्षा 8</option>
                  <option value="कक्षा 9">कक्षा 9</option>
                  <option value="कक्षा 10">कक्षा 10</option>
                  <option value="कक्षा 11">कक्षा 11</option>
                  <option value="कक्षा 12">कक्षा 12</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700">विषय *</label>
                <input
                  type="text"
                  required
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  placeholder="उदा. गणित / विज्ञान"
                  className="w-full mt-1.5 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700">विवरण</label>
              <textarea
                rows={3}
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="इस कोर्स का मुख्य उद्देश्य एवं पाठ्य विवरण लिखें..."
                className="w-full mt-1.5 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium"
              />
            </div>

            <div className="pt-2 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setActiveTab('courses')}
                className="px-5 py-2.5 border border-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
              >
                रद्द करें
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer transition"
              >
                कोर्स प्रकाशित करें
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
