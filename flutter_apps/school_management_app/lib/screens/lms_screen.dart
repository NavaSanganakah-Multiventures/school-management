import 'package:flutter/material.dart';
import '../models/lms_model.dart';
import '../models/user_model.dart';
import '../services/lms_service.dart';
import '../services/api_client.dart';
import '../widgets/common_widgets.dart';

class LmsScreen extends StatefulWidget {
  final UserModel user;
  const LmsScreen({super.key, required this.user});

  @override
  State<LmsScreen> createState() => _LmsScreenState();
}

class _LmsScreenState extends State<LmsScreen> {
  final _svc = LmsService();
  bool _loading = true;
  String? _error;
  List<LmsCourseModel> _courses = [];
  bool get _canManage =>
      widget.user.role == UserRole.director ||
      widget.user.role == UserRole.principal ||
      widget.user.role == UserRole.staff;

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
      _courses = await _svc.getCourses();
      if (mounted) setState(() => _loading = false);
    } on ApiException catch (e) {
      if (mounted) setState(() {
        _error = e.message;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() {
        _error = 'कोर्स लोड नहीं हो सके';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('पाठ्यक्रम (LMS)', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
        backgroundColor: const Color(0xFF7E22CE),
        foregroundColor: Colors.white,
        actions: [
          if (_canManage) IconButton(icon: const Icon(Icons.add_circle), tooltip: 'कोर्स बनाएं', onPressed: _createDialog),
          IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
        ],
      ),
      body: _loading
          ? const LoadingView()
          : _error != null
              ? ErrorRetryView(message: _error!, onRetry: _load)
              : _courses.isEmpty
                  ? const EmptyState(message: 'कोई कोर्स उपलब्ध नहीं', icon: Icons.menu_book)
                  : ResponsiveCenter(
                      child: ListView.builder(
                        padding: const EdgeInsets.all(12),
                        itemCount: _courses.length,
                        itemBuilder: (c, i) => _courseCard(_courses[i]),
                      ),
                    ),
      floatingActionButton: _canManage
          ? FloatingActionButton.extended(
              onPressed: _createDialog,
              icon: const Icon(Icons.add),
              label: const Text('नया कोर्स'),
              backgroundColor: const Color(0xFF7E22CE),
            )
          : null,
    );
  }

  Widget _courseCard(LmsCourseModel c) {
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: ListTile(
        leading: const CircleAvatar(child: Icon(Icons.menu_book_outlined, size: 20)),
        title: Text(c.title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${c.className} • ${c.subject}', style: const TextStyle(fontSize: 11, color: Colors.grey)),
            if (c.description != null) Text(c.description!, style: const TextStyle(fontSize: 11, color: Colors.grey), maxLines: 1, overflow: TextOverflow.ellipsis),
          ],
        ),
        isThreeLine: true,
        trailing: const Icon(Icons.chevron_right),
        onTap: () {
          Navigator.push(context, MaterialPageRoute(builder: (_) => _CourseDetailScreen(courseId: c.id, courseName: c.title, user: widget.user)));
        },
      ),
    );
  }

  void _createDialog() {
    final title = TextEditingController();
    final className = TextEditingController();
    final subject = TextEditingController();
    final description = TextEditingController();
    showDialog(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('नया कोर्स'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(controller: title, decoration: const InputDecoration(labelText: 'शीर्षक *', border: OutlineInputBorder(), isDense: true)),
              const SizedBox(height: 8),
              TextField(controller: className, decoration: const InputDecoration(labelText: 'कक्षा *', border: OutlineInputBorder(), isDense: true)),
              const SizedBox(height: 8),
              TextField(controller: subject, decoration: const InputDecoration(labelText: 'विषय *', border: OutlineInputBorder(), isDense: true)),
              const SizedBox(height: 8),
              TextField(controller: description, maxLines: 2, decoration: const InputDecoration(labelText: 'विवरण', border: OutlineInputBorder(), isDense: true)),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c), child: const Text('रद्द करें')),
          FilledButton(
            onPressed: () async {
              if (title.text.isEmpty || className.text.isEmpty || subject.text.isEmpty) return;
              try {
                await _svc.createCourse({
                  'title': title.text.trim(),
                  'className': className.text.trim(),
                  'subject': subject.text.trim(),
                  if (description.text.isNotEmpty) 'description': description.text.trim(),
                });
                if (c.mounted) Navigator.pop(c);
                showSnack(context, 'कोर्स बन गया');
                _load();
              } on ApiException catch (e) {
                if (c.mounted) showSnack(context, e.message, isError: true);
              }
            },
            child: const Text('बनाएं'),
          ),
        ],
      ),
    );
  }
}

class _CourseDetailScreen extends StatefulWidget {
  final String courseId;
  final String courseName;
  final UserModel user;

  const _CourseDetailScreen({required this.courseId, required this.courseName, required this.user});

  @override
  State<_CourseDetailScreen> createState() => _CourseDetailScreenState();
}

class _CourseDetailScreenState extends State<_CourseDetailScreen> {
  final _svc = LmsService();
  bool _loading = true;
  List<LmsLessonModel> _lessons = [];
  List<LmsAssignmentModel> _assignments = [];
  bool get _canManage =>
      widget.user.role == UserRole.director ||
      widget.user.role == UserRole.principal ||
      widget.user.role == UserRole.staff;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final res = await _svc.getCourseDetail(widget.courseId);
      _lessons = res.lessons;
      _assignments = res.assignments;
      if (mounted) setState(() => _loading = false);
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: Text(widget.courseName, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
          backgroundColor: const Color(0xFF7E22CE),
          foregroundColor: Colors.white,
          actions: [
            IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
          ],
          bottom: const TabBar(tabs: [
            Tab(icon: Icon(Icons.video_library), text: 'पाठ'),
            Tab(icon: Icon(Icons.assignment), text: 'असाइनमेंट'),
          ]),
        ),
        body: _loading
            ? const LoadingView()
            : TabBarView(
                children: [
                  _lessons.isEmpty
                      ? const EmptyState(message: 'कोई पाठ नहीं', icon: Icons.video_library_outlined)
                      : ListView.builder(
                          padding: const EdgeInsets.all(12),
                          itemCount: _lessons.length,
                          itemBuilder: (c, i) {
                            final l = _lessons[i];
                            return ListTile(
                              leading: const CircleAvatar(child: Icon(Icons.play_circle_outline, size: 18)),
                              title: Text(l.title, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
                              subtitle: l.durationMins != null ? Text('${l.durationMins} मिनट', style: const TextStyle(fontSize: 11)) : null,
                            );
                          },
                        ),
                  _assignments.isEmpty
                      ? const EmptyState(message: 'कोई असाइनमेंट नहीं', icon: Icons.assignment_outlined)
                      : ListView.builder(
                          padding: const EdgeInsets.all(12),
                          itemCount: _assignments.length,
                          itemBuilder: (c, i) {
                            final a = _assignments[i];
                            return Card(
                              margin: const EdgeInsets.only(bottom: 10),
                              child: ListTile(
                                leading: const CircleAvatar(child: Icon(Icons.assignment, size: 18)),
                                title: Text(a.title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                                subtitle: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    if (a.dueDate != null) Text('अंतिम तिथि: ${a.dueDate}', style: const TextStyle(fontSize: 11, color: Colors.grey)),
                                    if (a.maxMarks != null) Text('अधिकतम अंक: ${a.maxMarks}', style: const TextStyle(fontSize: 11, color: Colors.grey)),
                                  ],
                                ),
                                isThreeLine: true,
                                trailing: !_canManage
                                    ? FilledButton.tonal(onPressed: () => _submitDialog(a), child: const Text('जमा करें', style: TextStyle(fontSize: 11)))
                                    : const Icon(Icons.chevron_right),
                                onTap: _canManage
                                    ? () => Navigator.push(context, MaterialPageRoute(builder: (_) => _SubmissionsScreen(assignmentId: a.id, title: a.title)))
                                    : () => _submitDialog(a),
                              ),
                            );
                          },
                        ),
                ],
              ),
      ),
    );
  }

  void _submitDialog(LmsAssignmentModel a) {
    final text = TextEditingController();
    showDialog(
      context: context,
      builder: (c) => AlertDialog(
        title: Text('जमा करें: ${a.title}'),
        content: TextField(controller: text, maxLines: 4, decoration: const InputDecoration(labelText: 'अपना उत्तर', border: OutlineInputBorder(), isDense: true)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c), child: const Text('रद्द करें')),
          FilledButton(
            onPressed: () async {
              try {
                await _svc.submitAssignment(a.id, submissionText: text.text.trim());
                if (c.mounted) Navigator.pop(c);
                showSnack(context, 'जमा हो गया');
              } on ApiException catch (e) {
                if (c.mounted) showSnack(context, e.message, isError: true);
              }
            },
            child: const Text('जमा करें'),
          ),
        ],
      ),
    );
  }
}

class _SubmissionsScreen extends StatefulWidget {
  final String assignmentId;
  final String title;
  const _SubmissionsScreen({required this.assignmentId, required this.title});

  @override
  State<_SubmissionsScreen> createState() => _SubmissionsScreenState();
}

class _SubmissionsScreenState extends State<_SubmissionsScreen> {
  final _svc = LmsService();
  bool _loading = true;
  List<LmsSubmissionModel> _subs = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      _subs = await _svc.getSubmissions(widget.assignmentId);
      if (mounted) setState(() => _loading = false);
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('सबमिशन: ${widget.title}', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold)),
        backgroundColor: const Color(0xFF7E22CE),
        foregroundColor: Colors.white,
      ),
      body: _loading
          ? const LoadingView()
          : _subs.isEmpty
              ? const EmptyState(message: 'कोई सबमिशन नहीं', icon: Icons.assignment_returned)
              : ResponsiveCenter(
                  child: ListView.builder(
                    padding: const EdgeInsets.all(12),
                    itemCount: _subs.length,
                    itemBuilder: (c, i) => Card(
                      margin: const EdgeInsets.only(bottom: 10),
                      child: ListTile(
                        title: Text(_subs[i].studentName ?? 'विद्यार्थी', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                        subtitle: Text(_subs[i].submissionText ?? '-', style: const TextStyle(fontSize: 12)),
                        trailing: Text(_subs[i].marksObtained != null ? '${_subs[i].marksObtained} अंक' : 'ग्रेड लंबित',
                            style: TextStyle(fontSize: 11, color: _subs[i].marksObtained != null ? Colors.green : Colors.orange)),
                        onTap: () => _gradeDialog(_subs[i]),
                      ),
                    ),
                  ),
                ),
    );
  }

  void _gradeDialog(LmsSubmissionModel s) {
    final marks = TextEditingController(text: s.marksObtained?.toString() ?? '');
    final feedback = TextEditingController(text: s.teacherFeedback ?? '');
    showDialog(
      context: context,
      builder: (c) => AlertDialog(
        title: Text(s.studentName ?? 'ग्रेडिंग'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (s.submissionText != null) Padding(padding: const EdgeInsets.only(bottom: 10), child: Text(s.submissionText!, style: const TextStyle(fontSize: 12))),
            TextField(controller: marks, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'अंक', border: OutlineInputBorder(), isDense: true)),
            const SizedBox(height: 8),
            TextField(controller: feedback, maxLines: 2, decoration: const InputDecoration(labelText: 'प्रतिक्रिया', border: OutlineInputBorder(), isDense: true)),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c), child: const Text('रद्द करें')),
          FilledButton(
            onPressed: () async {
              try {
                await _svc.gradeSubmission(s.id!, marksObtained: int.tryParse(marks.text.trim()), teacherFeedback: feedback.text.trim().isEmpty ? null : feedback.text.trim());
                if (c.mounted) Navigator.pop(c);
                showSnack(context, 'ग्रेड सहेजा गया');
                _load();
              } on ApiException catch (e) {
                if (c.mounted) showSnack(context, e.message, isError: true);
              }
            },
            child: const Text('सहेजें'),
          ),
        ],
      ),
    );
  }
}
