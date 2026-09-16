import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/user_model.dart';
import '../models/attendance_model.dart';
import '../services/api_client.dart';
import '../services/auth_service.dart';
import 'login_screen.dart';

class TeacherAttendanceScreen extends StatefulWidget {
  final UserModel user;
  const TeacherAttendanceScreen({super.key, required this.user});

  @override
  State<TeacherAttendanceScreen> createState() => _TeacherAttendanceScreenState();
}

class _TeacherAttendanceScreenState extends State<TeacherAttendanceScreen> {
  final ApiClient _api = ApiClient();
  DateTime _selectedDate = DateTime.now();
  String _selectedClass = 'Class 10';
  List<String> _availableClasses = [];
  List<AttendanceRecordModel> _records = [];
  bool _isLoading = true;
  String _statusFilter = 'All'; // 'All', 'Absent', 'Present', 'Leave', 'Unmarked'

  @override
  void initState() {
    super.initState();
    _loadInitialData();
  }

  String get _formattedDate => DateFormat('yyyy-MM-dd').format(_selectedDate);

  Future<void> _loadInitialData() async {
    setState(() => _isLoading = true);
    try {
      final res = await _api.get('/api/classes/my-classes');
      if (res['success'] == true) {
        final classes = List<String>.from(res['classes'] ?? []);
        final assigned = List<String>.from(res['assignedClasses'] ?? []);
        setState(() {
          _availableClasses = classes;
          if (assigned.isNotEmpty) {
            _selectedClass = assigned.first;
          } else if (classes.isNotEmpty) {
            _selectedClass = classes.first;
          }
        });
      }
      await _loadAttendance();
    } catch (_) {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _loadAttendance() async {
    setState(() => _isLoading = true);
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
          _isLoading = false;
        });
      }
    } catch (e) {
      setState(() => _isLoading = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('डेटा लोड त्रुटि: $e'), backgroundColor: Colors.red),
        );
      }
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
        title: const Text('अनुपस्थित अभिभावक पुश अलर्ट'),
        content: Text(
          'क्या आप आज अनुपस्थित ${_selectedClass} के ${absentees.length} छात्रों के अभिभावकों के मोबाइल पर त्वरित पुश अलर्ट भेजना चाहते हैं?',
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
      'सादर नमस्कार। आपका बच्चा $studentName आज ($_formattedDate) कक्षा $_selectedClass में अनुपस्थित दर्ज हुआ है। - विद्या सेतु',
    );
    final uri = Uri.parse('https://wa.me/$num?text=$msg');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _records.where((r) {
      if (_statusFilter == 'All') return true;
      return r.status == _statusFilter;
    }).toList();

    final absentCount = _records.where((r) => r.status == 'Absent').length;

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'दैनिक उपस्थिति पंजिका',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
            ),
            Text(
              '${widget.user.fullName} (${widget.user.designation ?? "शिक्षक"})',
              style: const TextStyle(fontSize: 11, color: Colors.white70),
            ),
          ],
        ),
        backgroundColor: const Color(0xFF0F172A),
        foregroundColor: Colors.white,
        actions: [
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
      body: Column(
        children: [
          // Date & Class Selector Bar
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            color: const Color(0xFF1E293B),
            child: Row(
              children: [
                // Date Picker Button
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
                        const Icon(Icons.calendar_today, size: 14, color: Colors.white),
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
                        value: _availableClasses.contains(_selectedClass) ? _selectedClass : null,
                        hint: const Text('कक्षा चुनें', style: TextStyle(color: Colors.white70, fontSize: 12)),
                        dropdownColor: const Color(0xFF1E293B),
                        icon: const Icon(Icons.arrow_drop_down, color: Colors.white),
                        isExpanded: true,
                        style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold),
                        items: _availableClasses.map((c) {
                          return DropdownMenuItem(value: c, child: Text(c));
                        }).toList(),
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

          // KPI Stats Cards
          Container(
            padding: const EdgeInsets.all(12),
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

          // Action Toolbar: Mark All Present & Absent Alert Button
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
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
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : filtered.isEmpty
                    ? Center(
                        child: Text(
                          _statusFilter == 'All'
                              ? '$_selectedClass में कोई छात्र नहीं मिला।'
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
                                  color: Colors.black.withOpacity(0.02),
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

                                // P / A / L Buttons
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
      ),
    );
  }

  Widget _buildKpiCard(String label, String count, Color color, String filter) {
    final isSelected = _statusFilter == filter;
    return Expanded(
      child: InkWell(
        onTap: () => setState(() => _statusFilter = filter),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(
            color: isSelected ? color.withOpacity(0.15) : Colors.white,
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
