import 'package:flutter/material.dart';
import '../models/exam_model.dart';
import '../models/student_model.dart';
import '../models/user_model.dart';
import '../services/exam_service.dart';
import '../services/student_service.dart';
import '../services/api_client.dart';
import '../widgets/common_widgets.dart';

class ExamsScreen extends StatefulWidget {
  final UserModel user;
  const ExamsScreen({super.key, required this.user});

  @override
  State<ExamsScreen> createState() => _ExamsScreenState();
}

class _ExamsScreenState extends State<ExamsScreen> {
  final _examSvc = ExamService();
  final _studentSvc = StudentService();
  bool _loading = true;
  String? _error;
  List<ExamModel> _exams = [];
  List<StudentModel> _students = [];
  String? _selectedExamId;
  String? _selectedClass;
  List<String> _classes = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final exams = await _examSvc.getExams();
      _exams = exams;
      if (exams.isNotEmpty && _selectedExamId == null) {
        _selectedExamId = exams.first.id;
      }
      await _loadStudents();
      if (mounted) setState(() => _loading = false);
    } on ApiException catch (e) {
      if (mounted) setState(() {
        _error = e.message;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() {
        _error = 'परीक्षा डेटा लोड नहीं हो सका';
        _loading = false;
      });
    }
  }

  Future<void> _loadStudents() async {
    try {
      final students = await _studentSvc.getStudents(className: _selectedClass);
      _students = students;
      final classSet = <String>{};
      for (final s in students) {
        if (s.className.isNotEmpty) classSet.add(s.className);
      }
      _classes = classSet.toList()..sort();
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('परीक्षा एवं अंक', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
          backgroundColor: const Color(0xFF7C2D12),
          foregroundColor: Colors.white,
          actions: [
            IconButton(icon: const Icon(Icons.refresh), tooltip: 'ताज़ा करें', onPressed: _load),
          ],
          bottom: const TabBar(
            tabs: [
              Tab(icon: Icon(Icons.list_alt), text: 'अंक प्रविष्टि'),
              Tab(icon: Icon(Icons.receipt_long), text: 'रिपोर्ट कार्ड'),
              Tab(icon: Icon(Icons.analytics), text: 'विश्लेषण'),
            ],
          ),
        ),
        body: _loading
            ? const LoadingView()
            : _error != null
                ? ErrorRetryView(message: _error!, onRetry: _load)
                : TabBarView(
                    children: [
                      _MarksEntryTab(
                        user: widget.user,
                        examId: _selectedExamId,
                        exams: _exams,
                        students: _students,
                        classes: _classes,
                        selectedClass: _selectedClass,
                        onExamChanged: (id) async {
                          _selectedExamId = id;
                          await _loadStudents();
                          setState(() {});
                        },
                        onClassChanged: (c) async {
                          _selectedClass = c;
                          await _loadStudents();
                          setState(() {});
                        },
                      ),
                      _ReportCardTab(user: widget.user, examId: _selectedExamId, exams: _exams, students: _students),
                      _AnalyticsTab(examId: _selectedExamId, exams: _exams),
                    ],
                  ),
      ),
    );
  }
}

// ── Marks Entry ──────────────────────────────────────────────────────────
class _MarksEntryTab extends StatefulWidget {
  final UserModel user;
  final String? examId;
  final List<ExamModel> exams;
  final List<StudentModel> students;
  final List<String> classes;
  final String? selectedClass;
  final ValueChanged<String?> onExamChanged;
  final ValueChanged<String?> onClassChanged;

  const _MarksEntryTab({
    required this.user,
    required this.examId,
    required this.exams,
    required this.students,
    required this.classes,
    required this.selectedClass,
    required this.onExamChanged,
    required this.onClassChanged,
  });

  @override
  State<_MarksEntryTab> createState() => _MarksEntryTabState();
}

class _MarksEntryTabState extends State<_MarksEntryTab> {
  final _examSvc = ExamService();
  StudentModel? _selectedStudent;
  List<ExamSubjectModel> _subjects = [];
  final _marksControllers = <String, TextEditingController>{};
  bool _loadingSubjects = false;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    if (widget.examId != null) _loadSubjects();
  }

  @override
  void didUpdateWidget(_MarksEntryTab old) {
    super.didUpdateWidget(old);
    if (old.examId != widget.examId) {
      _loadSubjects();
    }
  }

  Future<void> _loadSubjects() async {
    if (widget.examId == null) return;
    setState(() => _loadingSubjects = true);
    try {
      final subs = await _examSvc.getExamSubjects(widget.examId!);
      _subjects = subs;
      for (final s in subs) {
        _marksControllers[s.subjectName] ??= TextEditingController();
      }
      if (mounted) setState(() => _loadingSubjects = false);
    } catch (_) {
      if (mounted) setState(() => _loadingSubjects = false);
    }
  }

  Future<void> _save() async {
    if (_selectedStudent == null || widget.examId == null) {
      showSnack(context, 'छात्र चुनें', isError: true);
      return;
    }
    final marks = <MarkEntryModel>[];
    for (final s in _subjects) {
      final val = _marksControllers[s.subjectName]?.text.trim() ?? '';
      marks.add(MarkEntryModel(
        subject: s.subjectName,
        maxMarks: s.maxMarks,
        marksObtained: val.isEmpty ? null : val,
      ));
    }
    setState(() => _saving = true);
    try {
      await _examSvc.enterMarks(
        examId: widget.examId!,
        studentId: _selectedStudent!.id,
        marks: marks,
      );
      if (mounted) showSnack(context, 'अंक सहेजे गए');
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.message, isError: true);
    } catch (_) {
      if (mounted) showSnack(context, 'अंक सहेजने में विफल', isError: true);
    }
    if (mounted) setState(() => _saving = false);
  }

  @override
  void dispose() {
    for (final c in _marksControllers.values) c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ResponsiveCenter(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Exam dropdown
            DropdownButtonFormField<String>(
              value: widget.examId,
              decoration: const InputDecoration(labelText: 'परीक्षा चुनें', border: OutlineInputBorder(), isDense: true),
              items: widget.exams.map((e) => DropdownMenuItem(value: e.id, child: Text(e.name))).toList(),
              onChanged: widget.onExamChanged,
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              value: widget.selectedClass,
              decoration: const InputDecoration(labelText: 'कक्षा फ़िल्टर', border: OutlineInputBorder(), isDense: true),
              items: [
                const DropdownMenuItem(value: null, child: Text('सभी कक्षाएं')),
                ...widget.classes.map((c) => DropdownMenuItem(value: c, child: Text(c))),
              ],
              onChanged: widget.onClassChanged,
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<StudentModel>(
              value: _selectedStudent,
              decoration: const InputDecoration(labelText: 'छात्र चुनें', border: OutlineInputBorder(), isDense: true),
              items: widget.students.map((s) => DropdownMenuItem(value: s, child: Text('${s.fullName} (${s.className})'))).toList(),
              onChanged: (s) => setState(() => _selectedStudent = s),
            ),
            const SizedBox(height: 16),
            if (_loadingSubjects)
              const Center(child: Padding(padding: EdgeInsets.all(20), child: CircularProgressIndicator()))
            else if (_subjects.isEmpty)
              const EmptyState(message: 'इस परीक्षा के लिए कोई विषय कॉन्फ़िगर नहीं है', icon: Icons.subject)
            else ...[
              const SectionTitle('विषयवार अंक प्रविष्टि', icon: Icons.edit_note),
              const SizedBox(height: 8),
              ..._subjects.map((s) => Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: TextFormField(
                      controller: _marksControllers[s.subjectName],
                      keyboardType: TextInputType.number,
                      decoration: InputDecoration(
                        labelText: '${s.subjectName}${s.maxMarks != null ? ' (अधिकतम ${s.maxMarks})' : ''}',
                        border: const OutlineInputBorder(),
                        isDense: true,
                        suffixText: s.maxMarks != null ? '/ ${s.maxMarks}' : null,
                      ),
                    ),
                  )),
              const SizedBox(height: 12),
              if (widget.user.role == UserRole.staff || widget.user.role == UserRole.principal || widget.user.role == UserRole.director)
                FilledButton.icon(
                  onPressed: _saving ? null : _save,
                  icon: _saving
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : const Icon(Icons.save, size: 18),
                  label: const Text('अंक सहेजें'),
                ),
            ],
          ],
        ),
      ),
    );
  }
}

// ── Report Card ──────────────────────────────────────────────────────────
class _ReportCardTab extends StatefulWidget {
  final UserModel user;
  final String? examId;
  final List<ExamModel> exams;
  final List<StudentModel> students;

  const _ReportCardTab({required this.user, required this.examId, required this.exams, required this.students});

  @override
  State<_ReportCardTab> createState() => _ReportCardTabState();
}

class _ReportCardTabState extends State<_ReportCardTab> {
  final _examSvc = ExamService();
  StudentModel? _selectedStudent;
  ReportCardModel? _report;
  bool _loading = false;

  Future<void> _viewReport() async {
    if (_selectedStudent == null) {
      showSnack(context, 'छात्र चुनें', isError: true);
      return;
    }
    setState(() => _loading = true);
    try {
      final rc = await _examSvc.getReportCard(_selectedStudent!.id, examId: widget.examId);
      setState(() {
        _report = rc;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.message, isError: true);
      if (mounted) setState(() => _loading = false);
    } catch (_) {
      if (mounted) {
        showSnack(context, 'रिपोर्ट कार्ड लोड नहीं हो सका', isError: true);
        setState(() => _loading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return ResponsiveCenter(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            DropdownButtonFormField<String>(
              value: widget.examId,
              decoration: const InputDecoration(labelText: 'परीक्षा', border: OutlineInputBorder(), isDense: true),
              items: widget.exams.map((e) => DropdownMenuItem(value: e.id, child: Text(e.name))).toList(),
              onChanged: (_) {},
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<StudentModel>(
              value: _selectedStudent,
              decoration: const InputDecoration(labelText: 'छात्र चुनें', border: OutlineInputBorder(), isDense: true),
              items: widget.students.map((s) => DropdownMenuItem(value: s, child: Text('${s.fullName} (${s.className})'))).toList(),
              onChanged: (s) => setState(() => _selectedStudent = s),
            ),
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: _loading ? null : _viewReport,
              icon: const Icon(Icons.visibility, size: 18),
              label: const Text('रिपोर्ट कार्ड देखें'),
            ),
            const SizedBox(height: 16),
            if (_loading)
              const Center(child: CircularProgressIndicator())
            else if (_report != null)
              _buildReportCard()
            else
              const EmptyState(message: 'रिपोर्ट कार्ड देखने के लिए छात्र चुनें', icon: Icons.receipt_long),
          ],
        ),
      ),
    );
  }

  Widget _buildReportCard() {
    final r = _report!;
    return Card(
      elevation: 3,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Text(r.studentName, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            ),
            if (r.examName != null)
              Center(child: Text(r.examName!, style: const TextStyle(color: Colors.grey, fontSize: 13))),
            const SizedBox(height: 4),
            Center(child: Text('कक्षा: ${r.className}', style: const TextStyle(fontSize: 12, color: Colors.grey))),
            const Divider(height: 20),
            ...r.subjects.map((s) => Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(child: Text(s.subject, style: const TextStyle(fontSize: 13))),
                      Text('${s.marksObtained ?? '-'}${s.maxMarks != null ? ' / ${s.maxMarks}' : ''}',
                          style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: const Color(0xFF7C2D12))),
                      if (s.grade != null) ...[
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(color: const Color(0xFF7C2D12).withValues(alpha: 0.1), borderRadius: BorderRadius.circular(8)),
                          child: Text(s.grade!, style: const TextStyle(fontSize: 11, color: Color(0xFF7C2D12), fontWeight: FontWeight.bold)),
                        ),
                      ],
                    ],
                  ),
                )),
            const Divider(height: 20),
            if (r.obtainedMarks != null || r.totalMarks != null)
              _summaryRow('कुल अंक', '${r.obtainedMarks ?? 0} / ${r.totalMarks ?? 0}'),
            if (r.percentage != null) _summaryRow('प्रतिशत', '${r.percentage}%'),
            if (r.grade != null) _summaryRow('ग्रेड', r.grade!),
          ],
        ),
      ),
    );
  }

  Widget _summaryRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(fontSize: 13, color: Colors.grey)),
          Text(value, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }
}

// ── Analytics ────────────────────────────────────────────────────────────
class _AnalyticsTab extends StatefulWidget {
  final String? examId;
  final List<ExamModel> exams;
  const _AnalyticsTab({required this.examId, required this.exams});

  @override
  State<_AnalyticsTab> createState() => _AnalyticsTabState();
}

class _AnalyticsTabState extends State<_AnalyticsTab> {
  final _examSvc = ExamService();
  ExamAnalyticsModel? _analytics;
  bool _loading = false;
  String? _examId;

  @override
  void initState() {
    super.initState();
    _examId = widget.examId;
  }

  Future<void> _load() async {
    if (_examId == null) return;
    setState(() => _loading = true);
    try {
      final a = await _examSvc.getAnalytics(_examId!);
      setState(() => _analytics = a);
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.message, isError: true);
    } catch (_) {
      if (mounted) showSnack(context, 'विश्लेषण लोड नहीं हो सका', isError: true);
    }
    if (mounted) setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    return ResponsiveCenter(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            DropdownButtonFormField<String>(
              value: _examId,
              decoration: const InputDecoration(labelText: 'परीक्षा चुनें', border: OutlineInputBorder(), isDense: true),
              items: widget.exams.map((e) => DropdownMenuItem(value: e.id, child: Text(e.name))).toList(),
              onChanged: (v) => setState(() {
                _examId = v;
                _analytics = null;
              }),
            ),
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: _loading ? null : _load,
              icon: const Icon(Icons.analytics, size: 18),
              label: const Text('विश्लेषण देखें'),
            ),
            const SizedBox(height: 16),
            if (_loading)
              const Center(child: CircularProgressIndicator())
            else if (_analytics != null)
              _buildAnalytics()
            else
              const EmptyState(message: 'विश्लेषण देखने के लिए परीक्षा चुनें', icon: Icons.analytics),
          ],
        ),
      ),
    );
  }

  Widget _buildAnalytics() {
    final a = _analytics!;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(a.examName, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
        const SizedBox(height: 12),
        GridView.count(
          crossAxisCount: 2,
          crossAxisSpacing: 10,
          mainAxisSpacing: 10,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          children: [
            KpiCard(label: 'कुल छात्र', value: '${a.totalStudents}', icon: Icons.groups, color: Colors.blue),
            KpiCard(label: 'उत्तीर्ण', value: '${a.studentsPassed}', icon: Icons.check_circle, color: Colors.green),
            KpiCard(label: 'उत्तीर्ण %', value: '${a.passPercentage ?? 0}%', icon: Icons.percent, color: Colors.teal),
            KpiCard(label: 'औसत %', value: '${a.averagePercentage ?? 0}%', icon: Icons.trending_up, color: Colors.orange),
            KpiCard(label: 'उच्चतम %', value: '${a.highestPercentage ?? 0}%', icon: Icons.emoji_events, color: Colors.amber),
            KpiCard(label: 'न्यूनतम %', value: '${a.lowestPercentage ?? 0}%', icon: Icons.south, color: Colors.red),
          ],
        ),
        if (a.gradeDistribution.isNotEmpty) ...[
          const SizedBox(height: 20),
          const SectionTitle('ग्रेड वितरण', icon: Icons.bar_chart),
          const SizedBox(height: 8),
          ...a.gradeDistribution.map((g) {
            final label = (g['label'] ?? g['range'] ?? '').toString();
            final count = (g['count'] is num) ? (g['count'] as num).toInt() : int.tryParse(g['count']?.toString() ?? '') ?? 0;
            return Padding(
              padding: const EdgeInsets.symmetric(vertical: 3),
              child: Row(
                children: [
                  SizedBox(width: 120, child: Text(label, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12))),
                  const SizedBox(width: 8),
                  Expanded(
                    child: LinearProgressIndicator(
                      value: (a.totalStudents > 0) ? count / a.totalStudents : 0,
                      minHeight: 14,
                      backgroundColor: Colors.grey.shade200,
                    ),
                  ),
                  const SizedBox(width: 8),
                  SizedBox(width: 30, child: Text('$count', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold))),
                ],
              ),
            );
          }),
        ],
      ],
    );
  }
}
