import 'package:flutter/material.dart';
import '../models/user_model.dart';
import '../models/student_model.dart';
import '../services/student_service.dart';
import '../services/api_client.dart';
import '../widgets/common_widgets.dart';

/// Students list screen — mirrors React students-screen.tsx.
/// Supports search, class filter, status filter, and admin actions.
class StudentsListScreen extends StatefulWidget {
  final UserModel user;
  const StudentsListScreen({super.key, required this.user});

  @override
  State<StudentsListScreen> createState() => _StudentsListScreenState();
}

class _StudentsListScreenState extends State<StudentsListScreen> {
  final _svc = StudentService();
  final _searchCtrl = TextEditingController();

  List<StudentModel> _students = [];
  List<String> _assignedClasses = [];
  bool _isClassTeacher = false;
  bool _loading = true;
  String _selectedClass = 'All';
  String _selectedStatus = 'All';
  String _searchQuery = '';

  bool get _isAdmin =>
      widget.user.role == UserRole.director ||
      widget.user.role == UserRole.principal;
  bool get _canManage => _isAdmin || _isClassTeacher;

  static const _classesList = [
    'All',
    'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5',
    'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10',
    'Class 11 (Science)', 'Class 11 (Commerce)',
    'Class 12 (Science)', 'Class 12 (Commerce)',
  ];

  @override
  void initState() {
    super.initState();
    _loadAssignedClasses();
    _loadStudents();
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadAssignedClasses() async {
    try {
      final res = await ApiClient().get('/api/classes/my-classes');
      if (res['success'] == true && res['assignedClasses'] is List) {
        final classes = List<String>.from(res['assignedClasses']);
        setState(() {
          _assignedClasses = classes;
          _isClassTeacher = classes.isNotEmpty;
          if (widget.user.role == UserRole.staff && classes.isNotEmpty) {
            _selectedClass = classes.first;
          }
        });
      }
    } catch (_) {
      // Non-critical — proceed without class-teacher info.
    }
  }

  Future<void> _loadStudents() async {
    setState(() => _loading = true);
    try {
      final result = await _svc.getStudents(
        className: _selectedClass == 'All' ? null : _selectedClass,
        status: _selectedStatus == 'All' ? null : _selectedStatus,
        q: _searchQuery.isEmpty ? null : _searchQuery,
      );
      if (mounted) setState(() => _students = result);
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.message, isError: true);
    } catch (_) {
      if (mounted) showSnack(context, 'छात्र सूची लोड नहीं हो सकी', isError: true);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _deleteStudent(StudentModel s) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('स्कॉलर रिकॉर्ड हटाएं?'),
        content: Text('क्या आप निश्चित रूप से ${s.fullName} का रिकॉर्ड हटाना चाहते हैं?'),
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
    try {
      await _svc.deleteStudent(s.id);
      setState(() => _students.removeWhere((st) => st.id == s.id));
      if (mounted) showSnack(context, '${s.fullName} का रिकॉर्ड हटा दिया गया।');
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.message, isError: true);
    } catch (_) {
      if (mounted) showSnack(context, 'हटाने में त्रुटि', isError: true);
    }
  }

  void _onFilterChanged({String? className, String? status, String? query}) {
    setState(() {
      if (className != null) _selectedClass = className;
      if (status != null) _selectedStatus = status;
      if (query != null) _searchQuery = query;
    });
    _loadStudents();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('स्कॉलर रजिस्टर'),
        actions: [
          if (_canManage)
            IconButton(
              icon: const Icon(Icons.person_add_alt_1_rounded),
              tooltip: 'नया स्कॉलर प्रवेश',
              onPressed: () {
                // TODO(phase-3): Navigate to AddScholarModal / screen
                showSnack(context, 'नया स्कॉलर फॉर्म जल्द आ रहा है।');
              },
            ),
        ],
      ),
      body: Column(
        children: [
          // ---- Header with class-teacher badge ----
          if (_isClassTeacher && widget.user.role == UserRole.staff)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              color: Colors.green.shade50,
              child: Row(
                children: [
                  const Icon(Icons.auto_awesome, size: 14, color: Colors.green),
                  const SizedBox(width: 6),
                  Text(
                    'अधिकृत कक्षा अध्यापक: ${_assignedClasses.join(', ')}',
                    style: TextStyle(fontSize: 11, color: Colors.green.shade800, fontWeight: FontWeight.w600),
                  ),
                ],
              ),
            ),

          // ---- Search & Filter Bar ----
          _buildFilterBar(),

          // ---- Status Tabs ----
          _buildStatusTabs(),

          // ---- Table / List ----
          Expanded(
            child: _loading
                ? const LoadingView()
                : _students.isEmpty
                    ? const EmptyState(
                        message: 'कोई छात्र रिकॉर्ड नहीं मिला',
                        icon: Icons.person_search_rounded,
                      )
                    : _buildStudentList(),
          ),
        ],
      ),
    );
  }

  Widget _buildFilterBar() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      color: Colors.white,
      child: Row(
        children: [
          // Search
          Expanded(
            flex: 3,
            child: TextField(
              controller: _searchCtrl,
              decoration: InputDecoration(
                hintText: 'नाम, SR नंबर, फोन...',
                hintStyle: const TextStyle(fontSize: 12),
                prefixIcon: const Icon(Icons.search, size: 18),
                isDense: true,
                contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
              ),
              style: const TextStyle(fontSize: 12),
              onChanged: (v) => _onFilterChanged(query: v),
            ),
          ),
          const SizedBox(width: 8),
          // Class filter
          Expanded(
            flex: 2,
            child: DropdownButtonFormField<String>(
              initialValue: _selectedClass,
              isDense: true,
              decoration: InputDecoration(
                contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                isDense: true,
              ),
              style: const TextStyle(fontSize: 11, color: Colors.black87),
              items: _classesList
                  .map((c) => DropdownMenuItem(
                        value: c,
                        child: Text(c == 'All' ? 'सभी कक्षाएं' : c, overflow: TextOverflow.ellipsis),
                      ))
                  .toList(),
              onChanged: (v) {
                if (v != null) _onFilterChanged(className: v);
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStatusTabs() {
    final tabs = [
      ('All', 'सभी'),
      ('Active', 'सक्रिय'),
      ('TC_Issued', 'टी.सी. निर्गत'),
    ];
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      child: Row(
        children: tabs.map((t) {
          final isSelected = _selectedStatus == t.$1;
          return Padding(
            padding: const EdgeInsets.only(right: 6),
            child: ChoiceChip(
              label: Text(t.$2, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: isSelected ? Colors.white : Colors.grey.shade700)),
              selected: isSelected,
              selectedColor: Colors.blue.shade600,
              backgroundColor: Colors.grey.shade100,
              onSelected: (_) => _onFilterChanged(status: t.$1),
              visualDensity: VisualDensity.compact,
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildStudentList() {
    return RefreshIndicator(
      onRefresh: _loadStudents,
      child: ListView.separated(
        padding: const EdgeInsets.all(12),
        itemCount: _students.length,
        separatorBuilder: (_, __) => const SizedBox(height: 6),
        itemBuilder: (context, index) {
          final s = _students[index];
          return _StudentTile(
            student: s,
            canManage: _canManage,
            isAdmin: _isAdmin,
            onTap: () {
              // TODO(phase-3): Navigate to student detail screen
              showSnack(context, 'विद्यार्थी विवरण जल्द आ रहा है।');
            },
            onDelete: _isAdmin ? () => _deleteStudent(s) : null,
          );
        },
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Student Tile
// ---------------------------------------------------------------------------
class _StudentTile extends StatelessWidget {
  final StudentModel student;
  final bool canManage;
  final bool isAdmin;
  final VoidCallback? onTap;
  final VoidCallback? onDelete;

  const _StudentTile({
    required this.student,
    required this.canManage,
    required this.isAdmin,
    this.onTap,
    this.onDelete,
  });

  Color get _statusColor {
    switch (student.status) {
      case 'Active':
        return const Color(0xFF16A34A);
      case 'TC_Issued':
        return const Color(0xFFD97706);
      default:
        return const Color(0xFF64748B);
    }
  }

  String get _statusLabel {
    switch (student.status) {
      case 'Active':
        return 'सक्रिय';
      case 'TC_Issued':
        return 'टी.सी. निर्गत';
      default:
        return student.status;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12), side: BorderSide(color: Colors.grey.shade200)),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              // Avatar
              CircleAvatar(
                radius: 18,
                backgroundColor: Colors.blue.shade50,
                child: Text(
                  student.fullName.isNotEmpty ? student.fullName[0].toUpperCase() : '?',
                  style: TextStyle(color: Colors.blue.shade700, fontWeight: FontWeight.bold, fontSize: 14),
                ),
              ),
              const SizedBox(width: 12),
              // Info
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            student.fullName,
                            style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: _statusColor.withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Text(_statusLabel, style: TextStyle(color: _statusColor, fontSize: 9, fontWeight: FontWeight.bold)),
                        ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'SR: ${student.scholarNumber}  •  ${student.className}${student.section != null ? ' (${student.section})' : ''}',
                      style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
                    ),
                    const SizedBox(height: 1),
                    Text(
                      'पिता: ${student.fatherName}${student.parentPhone != null ? '  📞 ${student.parentPhone}' : ''}',
                      style: TextStyle(fontSize: 10, color: Colors.grey.shade500),
                    ),
                  ],
                ),
              ),
              // Actions
              if (onDelete != null)
                IconButton(
                  icon: Icon(Icons.delete_outline_rounded, size: 18, color: Colors.red.shade400),
                  tooltip: 'हटाएं',
                  onPressed: onDelete,
                  constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
