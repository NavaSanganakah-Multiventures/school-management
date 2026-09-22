import 'package:flutter/material.dart';
import '../models/user_model.dart';
import '../services/api_client.dart';
import '../widgets/common_widgets.dart';

/// Classes screen — mirrors React classes-screen.tsx.
/// Director/Principal can assign/remove class teachers.
class ClassesScreen extends StatefulWidget {
  final UserModel user;
  const ClassesScreen({super.key, required this.user});

  @override
  State<ClassesScreen> createState() => _ClassesScreenState();
}

class _ClassAssignment {
  final String className;
  String? teacherUserId;
  String? teacherName;
  String? teacherEmail;

  _ClassAssignment({
    required this.className,
    this.teacherUserId,
    this.teacherName,
    this.teacherEmail,
  });
}

class _StaffOption {
  final String id;
  final String name;
  final String designation;
  final String email;

  _StaffOption({required this.id, required this.name, required this.designation, required this.email});
}

class _ClassesScreenState extends State<ClassesScreen> {
  final _api = ApiClient();
  List<_ClassAssignment> _classes = [];
  List<_StaffOption> _staff = [];
  bool _loading = true;
  String? _message;
  String? _error;
  final Map<String, bool> _savingMap = {};

  bool get _canManage =>
      widget.user.role == UserRole.director ||
      widget.user.role == UserRole.principal;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await Future.wait([
        _api.get('/api/classes'),
        _api.get('/api/staff'),
      ]);
      final cRes = results[0];
      final sRes = results[1];

      if (cRes['success'] == true) {
        final classList = (cRes['classes'] as List?) ?? [];
        _classes = classList.map((c) {
          final m = c as Map<String, dynamic>;
          return _ClassAssignment(
            className: m['className'] ?? '',
            teacherUserId: m['classTeacherUserId']?.toString(),
            teacherName: m['classTeacherName']?.toString(),
            teacherEmail: m['classTeacherEmail']?.toString(),
          );
        }).toList();
      }

      if (sRes['success'] == true) {
        final staffList = (sRes['staff'] as List?) ?? [];
        _staff = staffList.map((s) {
          final m = s as Map<String, dynamic>;
          return _StaffOption(
            id: (m['loginUserId'] ?? m['id'])?.toString() ?? '',
            name: m['name']?.toString() ?? '',
            designation: m['designation']?.toString() ?? '',
            email: m['email']?.toString() ?? '',
          );
        }).toList();
      }
    } catch (_) {
      _error = 'डेटा लोड करने में त्रुटि।';
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _assignTeacher(String className, String teacherUserId) async {
    setState(() => _savingMap[className] = true);
    _message = null;
    _error = null;
    try {
      final data = await _api.post('/api/classes/assign-teacher', body: {
        'className': className,
        'teacherUserId': teacherUserId,
      });
      if (data['success'] == true) {
        setState(() {
          _message = data['message']?.toString();
          final idx = _classes.indexWhere((c) => c.className == className);
          if (idx != -1) {
            final staff = _staff.where((s) => s.id == teacherUserId).firstOrNull;
            _classes[idx].teacherUserId = teacherUserId;
            _classes[idx].teacherName = data['teacherName']?.toString() ?? staff?.name;
            _classes[idx].teacherEmail = staff?.email;
          }
        });
      } else {
        _error = data['message']?.toString() ?? 'आवंटन विफल।';
      }
    } catch (_) {
      _error = 'नेटवर्क त्रुटि।';
    } finally {
      if (mounted) setState(() => _savingMap[className] = false);
    }
  }

  Future<void> _removeTeacher(String className) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('कक्षा अध्यापक हटाएं?'),
        content: Text('$className से कक्षा अध्यापक हटाना चाहते हैं?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('रद्द करें')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('हटाएं'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    setState(() => _savingMap[className] = true);
    try {
      final data = await _api.post('/api/classes/remove-teacher', body: {'className': className});
      if (data['success'] == true) {
        setState(() {
          _message = data['message']?.toString();
          final idx = _classes.indexWhere((c) => c.className == className);
          if (idx != -1) {
            _classes[idx].teacherUserId = null;
            _classes[idx].teacherName = null;
            _classes[idx].teacherEmail = null;
          }
        });
      } else {
        _error = data['message']?.toString() ?? 'हटाने में विफल।';
      }
    } catch (_) {
      _error = 'नेटवर्क त्रुटि।';
    } finally {
      if (mounted) setState(() => _savingMap[className] = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!_canManage) {
      return Scaffold(
        appBar: AppBar(title: const Text('कक्षा प्रबंधन')),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.lock_rounded, size: 48, color: Colors.red.shade300),
                const SizedBox(height: 12),
                const Text('पहुँच प्रतिबंधित', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                const SizedBox(height: 6),
                Text(
                  'केवल Director और Principal कक्षा अध्यापक नियुक्त कर सकते हैं।',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(title: const Text('कक्षा प्रबंधन')),
      body: Column(
        children: [
          // Info banner
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            color: Colors.blue.shade50,
            child: Row(
              children: [
                Icon(Icons.info_outline, size: 16, color: Colors.blue.shade700),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'प्रत्येक कक्षा के लिए कक्षा अध्यापक नियुक्त करें। केवल नियुक्त अध्यापक उस कक्षा की उपस्थिति दर्ज कर सकते हैं।',
                    style: TextStyle(fontSize: 11, color: Colors.blue.shade800),
                  ),
                ),
              ],
            ),
          ),

          // Messages
          if (_message != null)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(10),
              margin: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.green.shade50,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: Colors.green.shade200),
              ),
              child: Text(_message!, style: TextStyle(fontSize: 12, color: Colors.green.shade800)),
            ),
          if (_error != null)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(10),
              margin: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.red.shade50,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: Colors.red.shade200),
              ),
              child: Text(_error!, style: TextStyle(fontSize: 12, color: Colors.red.shade800)),
            ),

          // Class list
          Expanded(
            child: _loading
                ? const LoadingView()
                : RefreshIndicator(
                    onRefresh: _loadData,
                    child: ListView.separated(
                      padding: const EdgeInsets.all(12),
                      itemCount: _classes.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 6),
                      itemBuilder: (context, index) {
                        final cls = _classes[index];
                        final isSaving = _savingMap[cls.className] == true;
                        return Card(
                          elevation: 0,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                            side: BorderSide(color: Colors.grey.shade200),
                          ),
                          child: Padding(
                            padding: const EdgeInsets.all(14),
                            child: Row(
                              children: [
                                // Class icon
                                Container(
                                  padding: const EdgeInsets.all(8),
                                  decoration: BoxDecoration(
                                    color: Colors.indigo.shade50,
                                    borderRadius: BorderRadius.circular(10),
                                  ),
                                  child: Icon(Icons.class_rounded, size: 20, color: Colors.indigo.shade600),
                                ),
                                const SizedBox(width: 12),
                                // Class name & teacher info
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        cls.className,
                                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                                      ),
                                      const SizedBox(height: 2),
                                      if (cls.teacherName != null)
                                        Text(
                                          '${cls.teacherName!}${cls.teacherEmail != null ? '\n${cls.teacherEmail!}' : ''}',
                                          style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
                                        )
                                      else
                                        Text(
                                          'अध्यापक नियुक्त नहीं',
                                          style: TextStyle(fontSize: 11, color: Colors.amber.shade700, fontStyle: FontStyle.italic),
                                        ),
                                    ],
                                  ),
                                ),
                                // Assign / Remove
                                if (isSaving)
                                  const SizedBox(
                                    width: 20,
                                    height: 20,
                                    child: CircularProgressIndicator(strokeWidth: 2),
                                  )
                                else ...[
                                  SizedBox(
                                    width: 160,
                                    child: DropdownButtonFormField<String>(
                                      initialValue: cls.teacherUserId,
                                      isDense: true,
                                      decoration: InputDecoration(
                                        hintText: '-- अध्यापक चुनें --',
                                        hintStyle: const TextStyle(fontSize: 11),
                                        contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                                        isDense: true,
                                      ),
                                      style: const TextStyle(fontSize: 11, color: Colors.black87),
                                      items: _staff
                                          .map((s) => DropdownMenuItem(
                                                value: s.id,
                                                child: Text('${s.name} (${s.designation})', overflow: TextOverflow.ellipsis),
                                              ))
                                          .toList(),
                                      onChanged: (v) {
                                        if (v != null) _assignTeacher(cls.className, v);
                                      },
                                    ),
                                  ),
                                  if (cls.teacherUserId != null) ...[
                                    const SizedBox(width: 6),
                                    IconButton(
                                      icon: Icon(Icons.close_rounded, size: 18, color: Colors.red.shade400),
                                      tooltip: 'हटाएं',
                                      onPressed: () => _removeTeacher(cls.className),
                                      constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
                                    ),
                                  ],
                                ],
                              ],
                            ),
                          ),
                        );
                      },
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}
