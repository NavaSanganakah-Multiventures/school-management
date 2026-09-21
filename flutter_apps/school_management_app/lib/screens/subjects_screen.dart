import 'package:flutter/material.dart';
import '../models/subject_model.dart';
import '../models/user_model.dart';
import '../services/subject_service.dart';
import '../services/api_client.dart';
import '../widgets/common_widgets.dart';

class SubjectsScreen extends StatefulWidget {
  final UserModel user;
  const SubjectsScreen({super.key, required this.user});

  @override
  State<SubjectsScreen> createState() => _SubjectsScreenState();
}

class _SubjectsScreenState extends State<SubjectsScreen> {
  final _svc = SubjectService();
  bool _loading = true;
  String? _error;
  List<SubjectModel> _subjects = [];
  List<ClassSubjectModel> _classSubjects = [];
  bool get _isAdmin => widget.user.role == UserRole.director || widget.user.role == UserRole.principal;

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
      final res = await _svc.getSubjects();
      _subjects = res.subjects;
      _classSubjects = res.classSubjects;
      if (mounted) setState(() => _loading = false);
    } on ApiException catch (e) {
      if (mounted) setState(() {
        _error = e.message;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() {
        _error = 'विषय डेटा लोड नहीं हो सका';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('विषय प्रबंधन', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
        backgroundColor: const Color(0xFF1F2937),
        foregroundColor: Colors.white,
        actions: [
          if (_isAdmin) IconButton(icon: const Icon(Icons.add_circle), tooltip: 'नया विषय', onPressed: _addSubjectDialog),
          IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
        ],
      ),
      body: _loading
          ? const LoadingView()
          : _error != null
              ? ErrorRetryView(message: _error!, onRetry: _load)
              : ResponsiveCenter(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const SectionTitle('विषय सूची', icon: Icons.menu_book),
                        const SizedBox(height: 8),
                        if (_subjects.isEmpty)
                          const EmptyState(message: 'कोई विषय नहीं मिला', icon: Icons.menu_book)
                        else
                          ..._subjects.map((s) => ListTile(
                                leading: const CircleAvatar(child: Icon(Icons.book_outlined, size: 18)),
                                title: Text(s.subjectName),
                                subtitle: s.subjectCode != null ? Text('कोड: ${s.subjectCode}', style: const TextStyle(fontSize: 11)) : null,
                              )),
                        const Divider(height: 24),
                        const SectionTitle('कक्षा-विषय मैपिंग', icon: Icons.link),
                        const SizedBox(height: 8),
                        if (_classSubjects.isEmpty)
                          const EmptyState(message: 'कोई मैपिंग नहीं', icon: Icons.link_off)
                        else
                          ..._classSubjects.map((c) => ListTile(
                                leading: const CircleAvatar(child: Icon(Icons.class_outlined, size: 18)),
                                title: Text('${c.className} — ${c.subjectName}'),
                                subtitle: c.subjectType != null
                                    ? Text('${c.subjectType}${c.isOptional == true ? ' (वैकल्पिक)' : ''}', style: const TextStyle(fontSize: 11))
                                    : null,
                              )),
                      ],
                    ),
                  ),
                ),
      floatingActionButton: _isAdmin
          ? FloatingActionButton.extended(
              onPressed: _mapDialog,
              icon: const Icon(Icons.link),
              label: const Text('विषय मैप करें'),
              backgroundColor: const Color(0xFF1F2937),
            )
          : null,
    );
  }

  void _addSubjectDialog() {
    final name = TextEditingController();
    final code = TextEditingController();
    showDialog(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('नया विषय'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: name, decoration: const InputDecoration(labelText: 'विषय नाम *', border: OutlineInputBorder(), isDense: true)),
            const SizedBox(height: 10),
            TextField(controller: code, decoration: const InputDecoration(labelText: 'विषय कोड', border: OutlineInputBorder(), isDense: true)),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c), child: const Text('रद्द करें')),
          FilledButton(
            onPressed: () async {
              if (name.text.trim().isEmpty) return;
              try {
                await _svc.createSubject(name.text.trim(), subjectCode: code.text.trim().isEmpty ? null : code.text.trim());
                if (c.mounted) Navigator.pop(c);
                showSnack(context, 'विषय जोड़ा गया');
                _load();
              } on ApiException catch (e) {
                if (c.mounted) showSnack(context, e.message, isError: true);
              }
            },
            child: const Text('जोड़ें'),
          ),
        ],
      ),
    );
  }

  void _mapDialog() {
    final className = TextEditingController();
    final subjectId = TextEditingController();
    showDialog(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('विषय मैप करें'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: className, decoration: const InputDecoration(labelText: 'कक्षा *', border: OutlineInputBorder(), isDense: true)),
            const SizedBox(height: 10),
            DropdownButtonFormField<String>(
              decoration: const InputDecoration(labelText: 'विषय *', border: OutlineInputBorder(), isDense: true),
              items: _subjects.map((s) => DropdownMenuItem(value: s.id, child: Text(s.subjectName))).toList(),
              onChanged: (v) => subjectId.text = v ?? '',
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c), child: const Text('रद्द करें')),
          FilledButton(
            onPressed: () async {
              if (className.text.trim().isEmpty || subjectId.text.isEmpty) return;
              try {
                await _svc.mapSubject(className: className.text.trim(), subjectId: subjectId.text);
                if (c.mounted) Navigator.pop(c);
                showSnack(context, 'विषय मैप हो गया');
                _load();
              } on ApiException catch (e) {
                if (c.mounted) showSnack(context, e.message, isError: true);
              }
            },
            child: const Text('मैप करें'),
          ),
        ],
      ),
    );
  }
}
