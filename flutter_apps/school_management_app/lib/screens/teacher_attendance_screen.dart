import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/user_model.dart';
import '../models/attendance_model.dart';
import '../services/api_client.dart';
import '../services/auth_service.dart';
import '../services/student_service.dart';
import '../widgets/activity_log_sheet.dart';
import 'login_screen.dart';
import 'exams_screen.dart';
import 'leave_applications_screen.dart';
import 'lms_screen.dart';
import 'student_detail_screen.dart';

class TeacherAttendanceScreen extends StatefulWidget {
  final UserModel user;
  const TeacherAttendanceScreen({super.key, required this.user});

  @override
  State<TeacherAttendanceScreen> createState() => _TeacherAttendanceScreenState();
}

class _TeacherAttendanceScreenState extends State<TeacherAttendanceScreen> {
  final ApiClient _api = ApiClient();
  int _currentTabIndex = 0;

  // Attendance Tab State
  DateTime _selectedDate = DateTime.now();
  String _selectedClass = 'Class 10';
  List<String> _availableClasses = [];
  List<String> _allClasses = [];
  List<AttendanceRecordModel> _records = [];
  bool _isLoadingAttendance = true;
  String _statusFilter = 'All'; // 'All', 'Absent', 'Present', 'Leave', 'Unmarked'
  String _searchQuery = '';
  final TextEditingController _searchController = TextEditingController();

  // Notices Tab State
  List<dynamic> _notices = [];
  bool _isLoadingNotices = false;

  @override
  void initState() {
    super.initState();
    _loadInitialData();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  String get _formattedDate => DateFormat('yyyy-MM-dd').format(_selectedDate);
  String get _classLabel => _selectedClass == 'All' ? 'सभी कक्षाओं' : _selectedClass;

  Future<void> _loadInitialData() async {
    setState(() => _isLoadingAttendance = true);
    try {
      final res = await _api.get('/api/classes/my-classes');
      if (res['success'] == true) {
        final classes = List<String>.from(res['classes'] ?? []);
        final assigned = List<String>.from(res['assignedClasses'] ?? []);
        final allClasses = List<String>.from(res['allClasses'] ?? []);
        setState(() {
          _availableClasses = classes;
          _allClasses = allClasses.isNotEmpty
              ? allClasses
              : (classes.isNotEmpty ? classes : <String>[]);
          if (assigned.isNotEmpty) {
            _selectedClass = assigned.first;
          } else if (classes.isNotEmpty) {
            _selectedClass = classes.first;
          }
        });
      }
      await _loadAttendance();
    } catch (_) {
      setState(() => _isLoadingAttendance = false);
    }
  }

  Future<void> _loadAttendance() async {
    setState(() => _isLoadingAttendance = true);
    try {
      final res = await _api.get(
        '/api/attendance',
        queryParams: {
          'date': _formattedDate,
          'class': _selectedClass,
        },
      );

      if (res['success'] == true) {
        final recList = (res['records'] as List? ?? [])
            .map((e) => AttendanceRecordModel.fromJson(e))
            .toList();
        setState(() {
          _records = recList;
          _isLoadingAttendance = false;
        });
      }
    } catch (e) {
      setState(() => _isLoadingAttendance = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('डेटा लोड त्रुटि: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }

  Future<void> _loadNotices() async {
    setState(() => _isLoadingNotices = true);
    try {
      final res = await _api.get('/api/notices', queryParams: {'limit': '20'});
      if (res['success'] == true) {
        setState(() {
          _notices = res['notices'] ?? [];
          _isLoadingNotices = false;
        });
      }
    } catch (_) {
      setState(() => _isLoadingNotices = false);
    }
  }

  Future<void> _updateStudentStatus(String studentId, String status) async {
    // Optimistic local update
    setState(() {
      _records = _records.map((r) {
        if (r.studentId == studentId) {
          return r.copyWith(status: status, isMarked: true);
        }
        return r;
      }).toList();
    });

    try {
      await _api.post('/api/attendance/mark', body: {
        'studentId': studentId,
        'status': status,
        'date': _formattedDate,
      });
      _loadAttendance();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('स्थिति सहेजने में त्रुटि: $e'), backgroundColor: Colors.red),
        );
      }
      _loadAttendance();
    }
  }

  Future<void> _markAllPresent() async {
    try {
      final res = await _api.post('/api/attendance/mark-all-present', body: {
        'date': _formattedDate,
        'className': _selectedClass,
      });
      if (res['success'] == true) {
        _loadAttendance();
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('कक्षा के सभी छात्रों को Present दर्ज कर दिया गया।'),
              backgroundColor: Colors.green,
            ),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('त्रुटि: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }

  Future<void> _sendAbsenteeAlert() async {
    final absentees = _records.where((r) => r.status == 'Absent').toList();
    if (absentees.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('कक्षा में कोई छात्र अनुपस्थित नहीं है।')),
      );
      return;
    }

    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('अनुपस्थित अभिभावक अलर्ट'),
        content: Text(
          'क्या आप आज $_classLabel में अनुपस्थित ${absentees.length} छात्रों के अभिभावकों के मोबाइल पर त्वरित पुश अलर्ट भेजना चाहते हैं?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('रद्द करें'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red, foregroundColor: Colors.white),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('अलर्ट भेजें'),
          ),
        ],
      ),
    );

    if (confirm != true) return;

    try {
      final res = await _api.post('/api/attendance/notify-absentees', body: {
        'date': _formattedDate,
        'className': _selectedClass,
        'studentIds': absentees.map((s) => s.studentId).toList(),
      });

      if (mounted) {
        showDialog(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Row(
              children: [
                Icon(Icons.check_circle, color: Colors.green),
                SizedBox(width: 8),
                Text('अलर्ट सफलतापूर्वक प्रेषित'),
              ],
            ),
            content: Text(
              res['message'] ?? '${absentees.length} अभिभावकों को मोबाइल पुश नोटिफिकेशन भेज दिया गया है।',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(ctx).pop(),
                child: const Text('ठीक है'),
              ),
            ],
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('अलर्ट भेजने में त्रुटि: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }

  void _openWhatsApp(String phone, String studentName) async {
    final clean = phone.replaceAll(RegExp(r'[^0-9]'), '');
    final num = clean.length == 10 ? '91$clean' : clean;
    final msg = Uri.encodeComponent(
      'सादर नमस्कार। आपका बच्चा $studentName आज ($_formattedDate) कक्षा $_selectedClass में अनुपस्थित दर्ज हुआ है। कृपया विद्यालय को सूचित करें। - Pragnya Mitra',
    );
    final uri = Uri.parse('https://wa.me/$num?text=$msg');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  void _makePhoneCall(String phone) async {
    final uri = Uri.parse('tel:$phone');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    }
  }

  Future<void> _openAddStudentDialog() async {
    final nameCtrl = TextEditingController();
    final scholarCtrl = TextEditingController();
    final parentCtrl = TextEditingController();
    final phoneCtrl = TextEditingController();
    String gender = 'Male';
    String dialogClass = _selectedClass == 'All' ? (_availableClasses.isNotEmpty ? _availableClasses.first : 'Class 1') : _selectedClass;
    DateTime? dob;
    bool isSaving = false;

    await showDialog(
      context: context,
      barrierDismissible: false,
      builder: (dialogCtx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          title: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: const Color(0xFF0F172A).withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(Icons.person_add_rounded, color: Color(0xFF0F172A), size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('नया छात्र प्रवेश', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                    Text('कक्षा व विवरण भरें', style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                  ],
                ),
              ),
            ],
          ),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                DropdownButtonFormField<String>(
                  initialValue: dialogClass,
                  decoration: const InputDecoration(
                    labelText: 'कक्षा *',
                    isDense: true,
                    border: OutlineInputBorder(),
                  ),
                  items: (_allClasses.isNotEmpty ? _allClasses : _availableClasses)
                      .map((c) => DropdownMenuItem(value: c, child: Text(c)))
                      .toList(),
                  onChanged: (val) {
                    if (val != null) setDialogState(() => dialogClass = val);
                  },
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: nameCtrl,
                  decoration: const InputDecoration(
                    labelText: 'विद्यार्थी का पूरा नाम *',
                    hintText: 'उदा. अमित कुमार शर्मा',
                    isDense: true,
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: scholarCtrl,
                  decoration: const InputDecoration(
                    labelText: 'स्कॉलर / एस.आर. नंबर (ऐच्छिक)',
                    hintText: 'उदा. SR-2026-089',
                    isDense: true,
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: parentCtrl,
                  decoration: const InputDecoration(
                    labelText: 'पिता / अभिभावक का नाम *',
                    hintText: 'उदा. राजेश शर्मा',
                    isDense: true,
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: phoneCtrl,
                  keyboardType: TextInputType.phone,
                  decoration: const InputDecoration(
                    labelText: 'अभिभावक मोबाइल नंबर *',
                    hintText: '10 अंकों का मोबाइल',
                    isDense: true,
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: DropdownButtonFormField<String>(
                        initialValue: gender,
                        decoration: const InputDecoration(
                          labelText: 'लिंग',
                          isDense: true,
                          border: OutlineInputBorder(),
                        ),
                        items: const [
                          DropdownMenuItem(value: 'Male', child: Text('छात्र (M)')),
                          DropdownMenuItem(value: 'Female', child: Text('छात्रा (F)')),
                          DropdownMenuItem(value: 'Other', child: Text('अन्य')),
                        ],
                        onChanged: (val) {
                          if (val != null) setDialogState(() => gender = val);
                        },
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: InkWell(
                        onTap: () async {
                          final picked = await showDatePicker(
                            context: ctx,
                            initialDate: DateTime(2015, 1, 1),
                            firstDate: DateTime(2000),
                            lastDate: DateTime.now(),
                          );
                          if (picked != null) {
                            setDialogState(() => dob = picked);
                          }
                        },
                        child: InputDecorator(
                          decoration: const InputDecoration(
                            labelText: 'जन्म तिथि',
                            isDense: true,
                            border: OutlineInputBorder(),
                          ),
                          child: Text(
                            dob != null ? DateFormat('dd/MM/yyyy').format(dob!) : 'चुनें',
                            style: TextStyle(
                              fontSize: 13,
                              color: dob != null ? Colors.black87 : Colors.grey,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: isSaving ? null : () => Navigator.of(dialogCtx).pop(),
              child: const Text('रद्द करें'),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF0F172A),
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
              onPressed: isSaving
                  ? null
                  : () async {
                      final name = nameCtrl.text.trim();
                      final parent = parentCtrl.text.trim();
                      final phone = phoneCtrl.text.trim();

                      if (name.isEmpty) {
                        ScaffoldMessenger.of(ctx).showSnackBar(
                          const SnackBar(content: Text('कृपया विद्यार्थी का नाम भरें।'), backgroundColor: Colors.red),
                        );
                        return;
                      }
                      if (phone.isEmpty || phone.length < 10) {
                        ScaffoldMessenger.of(ctx).showSnackBar(
                          const SnackBar(content: Text('कृपया वैध मोबाइल नंबर भरें।'), backgroundColor: Colors.red),
                        );
                        return;
                      }

                      setDialogState(() => isSaving = true);

                      try {
                        await StudentService().addStudent({
                          'fullName': name,
                          'className': dialogClass,
                          'fatherName': parent,
                          'parentPhone': phone,
                          'scholarNumber': scholarCtrl.text.trim(),
                          'gender': gender,
                          'dob': dob != null ? DateFormat('yyyy-MM-dd').format(dob!) : null,
                          'status': 'Active',
                        });

                        if (dialogCtx.mounted) Navigator.of(dialogCtx).pop();
                        if (mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              content: Text('छात्र $name को कक्षा $dialogClass में सफलतापूर्वक प्रवेशित किया गया।'),
                              backgroundColor: Colors.green,
                            ),
                          );
                          _loadAttendance();
                        }
                      } catch (err) {
                        setDialogState(() => isSaving = false);
                        if (mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text('त्रुटि: $err'), backgroundColor: Colors.red),
                          );
                        }
                      }
                    },
              child: isSaving
                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Text('प्रवेश दर्ज करें'),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'शिक्षक पोर्टल (Teacher)',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
            ),
            Text(
              '${widget.user.fullName} • ${widget.user.designation ?? "स्टाफ"}',
              style: const TextStyle(fontSize: 11, color: Colors.white70),
            ),
          ],
        ),
        backgroundColor: const Color(0xFF0F172A),
        foregroundColor: Colors.white,
        actions: [
          IconButton(
            icon: const Icon(Icons.person_add_alt_1),
            tooltip: 'नया छात्र प्रवेश',
            onPressed: _openAddStudentDialog,
          ),
          IconButton(
            icon: const Icon(Icons.history_edu),
            tooltip: 'कार्य डायरी',
            onPressed: () => ActivityLogSheet.show(context, user: widget.user),
          ),
          PopupMenuButton<String>(
            icon: const Icon(Icons.apps),
            tooltip: 'मॉड्यूल',
            onSelected: (v) {
              switch (v) {
                case 'exams':
                  Navigator.push(context, MaterialPageRoute(builder: (_) => ExamsScreen(user: widget.user)));
                  break;
                case 'leave':
                  Navigator.push(context, MaterialPageRoute(builder: (_) => LeaveApplicationsScreen(user: widget.user)));
                  break;
                case 'lms':
                  Navigator.push(context, MaterialPageRoute(builder: (_) => LmsScreen(user: widget.user)));
                  break;
              }
            },
            itemBuilder: (c) => [
              const PopupMenuItem(value: 'exams', child: ListTile(leading: Icon(Icons.assignment_turned_in), title: Text('परीक्षा एवं अंक'))),
              const PopupMenuItem(value: 'leave', child: ListTile(leading: Icon(Icons.event_available), title: Text('अवकाश आवेदन'))),
              const PopupMenuItem(value: 'lms', child: ListTile(leading: Icon(Icons.video_library), title: Text('पाठ्यक्रम (LMS)'))),
            ],
          ),
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: 'लॉगआउट',
            onPressed: () async {
              await AuthService().logout();
              if (context.mounted) {
                Navigator.of(context).pushReplacement(
                  MaterialPageRoute(builder: (_) => const LoginScreen()),
                );
              }
            },
          ),
        ],
      ),
      body: IndexedStack(
        index: _currentTabIndex,
        children: [
          _buildAttendanceTab(),
          _buildStudentDirectoryTab(),
          _buildNoticesTab(),
          _buildActivityLogTab(),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _currentTabIndex,
        onDestinationSelected: (idx) {
          setState(() => _currentTabIndex = idx);
          if (idx == 2 && _notices.isEmpty) {
            _loadNotices();
          }
        },
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.checklist_rtl),
            selectedIcon: Icon(Icons.checklist, color: Color(0xFF0284C7)),
            label: 'हाजिरी',
          ),
          NavigationDestination(
            icon: Icon(Icons.people_outline),
            selectedIcon: Icon(Icons.people, color: Color(0xFF0284C7)),
            label: 'छात्र पंजी',
          ),
          NavigationDestination(
            icon: Icon(Icons.campaign_outlined),
            selectedIcon: Icon(Icons.campaign, color: Color(0xFF0284C7)),
            label: 'सूचनाएं',
          ),
          NavigationDestination(
            icon: Icon(Icons.menu_book_outlined),
            selectedIcon: Icon(Icons.menu_book, color: Color(0xFF0284C7)),
            label: 'मेरी डायरी',
          ),
        ],
      ),
    );
  }

  // TAB 1: Attendance Marking
  Widget _buildAttendanceTab() {
    final filtered = _records.where((r) {
      final matchesFilter = (_statusFilter == 'All') || (r.status == _statusFilter);
      final matchesSearch = _searchQuery.isEmpty ||
          r.studentName.toLowerCase().contains(_searchQuery.toLowerCase()) ||
          r.scholarNumber.toLowerCase().contains(_searchQuery.toLowerCase());
      return matchesFilter && matchesSearch;
    }).toList();

    final absentCount = _records.where((r) => r.status == 'Absent').length;

    return Column(
      children: [
        // Class & Date Control Bar
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          color: const Color(0xFF1E293B),
          child: Row(
            children: [
              // Date Picker
              InkWell(
                onTap: () async {
                  final picked = await showDatePicker(
                    context: context,
                    initialDate: _selectedDate,
                    firstDate: DateTime(2025),
                    lastDate: DateTime(2030),
                  );
                  if (picked != null) {
                    setState(() => _selectedDate = picked);
                    _loadAttendance();
                  }
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: const Color(0xFF334155),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.calendar_month, size: 15, color: Colors.white),
                      const SizedBox(width: 6),
                      Text(
                        _formattedDate,
                        style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 10),

              // Class Dropdown
              Expanded(
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  decoration: BoxDecoration(
                    color: const Color(0xFF334155),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: DropdownButtonHideUnderline(
                    child: DropdownButton<String>(
                      value: (_selectedClass == 'All' || _availableClasses.contains(_selectedClass)) ? _selectedClass : null,
                      hint: const Text('कक्षा चुनें', style: TextStyle(color: Colors.white70, fontSize: 12)),
                      dropdownColor: const Color(0xFF1E293B),
                      icon: const Icon(Icons.arrow_drop_down, color: Colors.white),
                      isExpanded: true,
                      style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold),
                      items: [
                        const DropdownMenuItem(value: 'All', child: Text('सभी कक्षाएं (All)')),
                        ..._availableClasses.map((c) {
                          return DropdownMenuItem(value: c, child: Text(c));
                        }),
                      ],
                      onChanged: (val) {
                        if (val != null) {
                          setState(() => _selectedClass = val);
                          _loadAttendance();
                        }
                      },
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),

        // KPI Status Chips
        Container(
          padding: const EdgeInsets.all(10),
          color: const Color(0xFFF8FAFC),
          child: Row(
            children: [
              _buildKpiCard('कुल', '${_records.length}', Colors.blueGrey, 'All'),
              const SizedBox(width: 6),
              _buildKpiCard('उपस्थित', '${_records.where((r) => r.status == 'Present').length}', Colors.green, 'Present'),
              const SizedBox(width: 6),
              _buildKpiCard('अनुपस्थित', '$absentCount', Colors.red, 'Absent'),
              const SizedBox(width: 6),
              _buildKpiCard('अवकाश', '${_records.where((r) => r.status == 'Leave').length}', Colors.amber, 'Leave'),
              const SizedBox(width: 6),
              _buildKpiCard('लंबित', '${_records.where((r) => r.status == 'Unmarked').length}', Colors.grey, 'Unmarked'),
            ],
          ),
        ),

        // Search Bar for Instant Student Filtering
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
          child: TextField(
            controller: _searchController,
            onChanged: (val) => setState(() => _searchQuery = val.trim()),
            decoration: InputDecoration(
              hintText: 'छात्र या स्कॉलर नंबर खोजें...',
              hintStyle: const TextStyle(fontSize: 12),
              prefixIcon: const Icon(Icons.search, size: 18),
              suffixIcon: _searchQuery.isNotEmpty
                  ? IconButton(
                      icon: const Icon(Icons.clear, size: 16),
                      onPressed: () {
                        _searchController.clear();
                        setState(() => _searchQuery = '');
                      },
                    )
                  : null,
              isDense: true,
              filled: true,
              fillColor: Colors.white,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: Colors.grey.shade300),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: Colors.grey.shade300),
              ),
            ),
          ),
        ),

        // Action Toolbar: Mark All Present & Alert Absentees
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
          child: Row(
            children: [
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: _markAllPresent,
                  icon: const Icon(Icons.check_circle_outline, size: 16),
                  label: const Text('सभी उपस्थित करें', style: TextStyle(fontSize: 12)),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.teal.shade700,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: absentCount > 0 ? _sendAbsenteeAlert : null,
                  icon: const Icon(Icons.send_rounded, size: 16),
                  label: Text('अभिभावक अलर्ट ($absentCount)', style: const TextStyle(fontSize: 12)),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.red.shade700,
                    foregroundColor: Colors.white,
                    disabledBackgroundColor: Colors.grey.shade300,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                ),
              ),
            ],
          ),
        ),

        const Divider(height: 1),

        // Student Attendance List
        Expanded(
          child: _isLoadingAttendance
              ? const Center(child: CircularProgressIndicator())
              : filtered.isEmpty
                  ? Center(
                      child: Text(
                        _searchQuery.isNotEmpty
                            ? 'खोज के अनुरूप कोई छात्र नहीं मिला।'
                            : _statusFilter == 'All'
                                ? '$_classLabel में कोई छात्र नहीं मिला।'
                                : '$_statusFilter श्रेणी में कोई छात्र नहीं है।',
                        style: const TextStyle(color: Colors.grey),
                      ),
                    )
                  : ListView.separated(
                      padding: const EdgeInsets.all(12),
                      itemCount: filtered.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 8),
                      itemBuilder: (context, index) {
                        final rec = filtered[index];
                        final isPresent = rec.status == 'Present';
                        final isAbsent = rec.status == 'Absent';
                        final isLeave = rec.status == 'Leave';

                        return Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: isAbsent ? const Color(0xFFFFF1F2) : Colors.white,
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(
                              color: isAbsent ? Colors.red.shade200 : Colors.grey.shade200,
                            ),
                            boxShadow: [
                              BoxShadow(
                                color: Colors.black.withValues(alpha: 0.02),
                                blurRadius: 4,
                                offset: const Offset(0, 2),
                              ),
                            ],
                          ),
                          child: Row(
                            children: [
                              // Status Circle Badge
                              CircleAvatar(
                                radius: 18,
                                backgroundColor: isPresent
                                    ? Colors.green.shade100
                                    : isAbsent
                                        ? Colors.red.shade100
                                        : isLeave
                                            ? Colors.amber.shade100
                                            : Colors.grey.shade200,
                                child: Text(
                                  isPresent ? 'P' : isAbsent ? 'A' : isLeave ? 'L' : '?',
                                  style: TextStyle(
                                    fontWeight: FontWeight.bold,
                                    fontSize: 13,
                                    color: isPresent
                                        ? Colors.green.shade800
                                        : isAbsent
                                            ? Colors.red.shade800
                                            : isLeave
                                                ? Colors.amber.shade900
                                                : Colors.grey.shade700,
                                  ),
                                ),
                              ),
                              const SizedBox(width: 12),

                              // Student Name & Info
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      rec.studentName,
                                      style: const TextStyle(
                                        fontWeight: FontWeight.bold,
                                        fontSize: 14,
                                        color: Color(0xFF0F172A),
                                      ),
                                    ),
                                    const SizedBox(height: 2),
                                    Text(
                                      'स्कॉलर: ${rec.scholarNumber.isEmpty ? "—" : rec.scholarNumber} • अभि: ${rec.parentName}',
                                      style: const TextStyle(fontSize: 11, color: Colors.black54),
                                    ),
                                  ],
                                ),
                              ),

                              // WhatsApp direct link if Absent
                              if (isAbsent && rec.parentPhone.isNotEmpty) ...[
                                IconButton(
                                  icon: const Icon(Icons.chat, color: Colors.green, size: 20),
                                  tooltip: 'WhatsApp भेजें',
                                  onPressed: () => _openWhatsApp(rec.parentPhone, rec.studentName),
                                ),
                              ],

                              // P / A / L Action Buttons
                              Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  _buildStatusButton('P', 'Present', isPresent, Colors.green, rec.studentId),
                                  const SizedBox(width: 4),
                                  _buildStatusButton('A', 'Absent', isAbsent, Colors.red, rec.studentId),
                                  const SizedBox(width: 4),
                                  _buildStatusButton('L', 'Leave', isLeave, Colors.amber.shade800, rec.studentId),
                                ],
                              ),
                            ],
                          ),
                        );
                      },
                    ),
        ),
      ],
    );
  }

  // TAB 2: Student Directory
  Widget _buildStudentDirectoryTab() {
    final search = _searchQuery.toLowerCase();
    final students = _records.where((r) {
      if (search.isEmpty) return true;
      return r.studentName.toLowerCase().contains(search) ||
          r.scholarNumber.toLowerCase().contains(search) ||
          r.parentName.toLowerCase().contains(search);
    }).toList();

    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: const Color(0xFF0F172A),
        foregroundColor: Colors.white,
        onPressed: _openAddStudentDialog,
        icon: const Icon(Icons.person_add_alt_1),
        label: const Text('नया छात्र प्रवेश'),
      ),
      body: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            color: Colors.white,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        '$_classLabel के विद्यार्थी (${students.length})',
                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                      ),
                    ),
                    TextButton.icon(
                      onPressed: _openAddStudentDialog,
                      icon: const Icon(Icons.add, size: 16),
                      label: const Text('प्रवेश जोड़ें', style: TextStyle(fontSize: 12)),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                DropdownButtonFormField<String>(
                  initialValue: (_selectedClass == 'All' || _availableClasses.contains(_selectedClass)) ? _selectedClass : null,
                  decoration: const InputDecoration(
                    labelText: 'कक्षा चुनें',
                    isDense: true,
                    border: OutlineInputBorder(),
                    contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  ),
                  items: [
                    const DropdownMenuItem(value: 'All', child: Text('सभी कक्षाएं (All)')),
                    ..._availableClasses.map((c) => DropdownMenuItem(value: c, child: Text(c))),
                  ],
                  onChanged: (val) {
                    if (val != null) {
                      setState(() => _selectedClass = val);
                      _loadAttendance();
                    }
                  },
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          Expanded(
            child: students.isEmpty
                ? const Center(child: Text('कोई छात्र नहीं मिला।', style: TextStyle(color: Colors.grey)))
                : ListView.separated(
                    padding: const EdgeInsets.all(12),
                    itemCount: students.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 8),
                    itemBuilder: (context, idx) {
                      final s = students[idx];
                      return InkWell(
                        onTap: () {
                          if (s.studentId.isNotEmpty) {
                            Navigator.push(context, MaterialPageRoute(
                              builder: (_) => StudentDetailScreen(
                                studentId: s.studentId,
                                studentName: s.studentName,
                                user: widget.user,
                              ),
                            ));
                          }
                        },
                        borderRadius: BorderRadius.circular(12),
                        child: Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: Colors.grey.shade200),
                        ),
                        child: Row(
                          children: [
                            CircleAvatar(
                              backgroundColor: Colors.indigo.shade50,
                              child: Text(
                                s.studentName.isNotEmpty ? s.studentName[0] : 'S',
                                style: TextStyle(fontWeight: FontWeight.bold, color: Colors.indigo.shade800),
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(s.studentName, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                                  const SizedBox(height: 2),
                                  Text('स्कॉलर: ${s.scholarNumber.isEmpty ? "—" : s.scholarNumber} • अभिभावक: ${s.parentName}',
                                      style: const TextStyle(fontSize: 11, color: Colors.grey)),
                                  if (s.parentPhone.isNotEmpty)
                                    Text('मोबाइल: ${s.parentPhone}', style: TextStyle(fontSize: 11, color: Colors.blueGrey.shade700)),
                                ],
                              ),
                            ),
                            const Icon(Icons.chevron_right, color: Colors.grey, size: 18),
                            if (s.parentPhone.isNotEmpty) ...[
                              IconButton(
                                icon: const Icon(Icons.call, color: Colors.blue, size: 20),
                                tooltip: 'कॉल करें',
                                onPressed: () => _makePhoneCall(s.parentPhone),
                              ),
                              IconButton(
                                icon: const Icon(Icons.chat, color: Colors.green, size: 20),
                                tooltip: 'WhatsApp',
                                onPressed: () => _openWhatsApp(s.parentPhone, s.studentName),
                              ),
                            ],
                          ],
                        ),
                      ),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }

  // TAB 3: School Notices Tab
  Widget _buildNoticesTab() {
    return _isLoadingNotices
        ? const Center(child: CircularProgressIndicator())
        : _notices.isEmpty
            ? Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.campaign_outlined, size: 48, color: Colors.grey),
                    const SizedBox(height: 12),
                    const Text('वर्तमान में कोई नई सूचना उपलब्ध नहीं है।', style: TextStyle(color: Colors.grey)),
                    const SizedBox(height: 8),
                    ElevatedButton(onPressed: _loadNotices, child: const Text('ताज़ा करें')),
                  ],
                ),
              )
            : RefreshIndicator(
                onRefresh: _loadNotices,
                child: ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: _notices.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (context, index) {
                    final n = _notices[index];
                    return Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: Colors.grey.shade200),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: 0.02),
                            blurRadius: 6,
                          ),
                        ],
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Expanded(
                                child: Text(
                                  n['title'] ?? '',
                                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                                ),
                              ),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                decoration: BoxDecoration(
                                  color: Colors.indigo.shade50,
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Text(
                                  n['publishedDate'] ?? n['date'] ?? '',
                                  style: TextStyle(fontSize: 10, color: Colors.indigo.shade700, fontWeight: FontWeight.bold),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 6),
                          Text(
                            n['content'] ?? n['description'] ?? '',
                            style: TextStyle(fontSize: 12, color: Colors.grey.shade800),
                          ),
                        ],
                      ),
                    );
                  },
                ),
              );
  }

  // TAB 4: Activity Log
  Widget _buildActivityLogTab() {
    return ActivityLogSheet(user: widget.user);
  }

  Widget _buildKpiCard(String label, String count, Color color, String filter) {
    final isSelected = _statusFilter == filter;
    return Expanded(
      child: InkWell(
        onTap: () => setState(() => _statusFilter = filter),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(
            color: isSelected ? color.withValues(alpha: 0.15) : Colors.white,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: isSelected ? color : Colors.grey.shade300,
              width: isSelected ? 1.5 : 1,
            ),
          ),
          child: Column(
            children: [
              Text(
                count,
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: color),
              ),
              Text(
                label,
                style: TextStyle(fontSize: 10, color: Colors.grey.shade700),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildStatusButton(String shortLabel, String fullStatus, bool isActive, Color color, String studentId) {
    return InkWell(
      onTap: () => _updateStudentStatus(studentId, fullStatus),
      child: Container(
        width: 32,
        height: 32,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: isActive ? color : Colors.grey.shade100,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: isActive ? color : Colors.grey.shade300),
        ),
        child: Text(
          shortLabel,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.bold,
            color: isActive ? Colors.white : const Color(0xFF1E293B),
          ),
        ),
      ),
    );
  }
}
