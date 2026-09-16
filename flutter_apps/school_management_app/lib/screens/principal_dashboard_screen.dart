import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/user_model.dart';
import '../services/api_client.dart';
import '../services/auth_service.dart';
import 'login_screen.dart';
import 'teacher_attendance_screen.dart';

class PrincipalDashboardScreen extends StatefulWidget {
  final UserModel user;
  const PrincipalDashboardScreen({super.key, required this.user});

  @override
  State<PrincipalDashboardScreen> createState() => _PrincipalDashboardScreenState();
}

class _PrincipalDashboardScreenState extends State<PrincipalDashboardScreen> {
  final ApiClient _api = ApiClient();
  bool _isLoading = true;
  Map<String, dynamic> _stats = {};
  List<dynamic> _schoolAbsentees = [];
  String _today = DateFormat('yyyy-MM-dd').format(DateTime.now());

  @override
  void initState() {
    super.initState();
    _loadDashboardData();
  }

  Future<void> _loadDashboardData() async {
    setState(() => _isLoading = true);
    try {
      final statsRes = await _api.get('/api/dashboard-stats');
      final absentRes = await _api.get('/api/attendance/absentees-summary', queryParams: {'date': _today});

      setState(() {
        if (statsRes['success'] == true) {
          _stats = statsRes['stats'] ?? {};
        }
        if (absentRes['success'] == true) {
          _schoolAbsentees = absentRes['absentees'] ?? [];
        }
        _isLoading = false;
      });
    } catch (_) {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _sendSchoolWideAbsentAlert() async {
    if (_schoolAbsentees.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('आज कोई छात्र अनुपस्थित नहीं है।')),
      );
      return;
    }

    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('समस्त विद्यालय अनुपस्थित अलर्ट'),
        content: Text(
          'क्या आप आज अनुपस्थित सभी ${_schoolAbsentees.length} छात्रों के अभिभावकों को सामूहिक पुश नोटिफिकेशन भेजना चाहते हैं?',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('रद्द करें')),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red, foregroundColor: Colors.white),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('भेजें'),
          ),
        ],
      ),
    );

    if (confirm != true) return;

    try {
      final res = await _api.post('/api/attendance/notify-absentees', body: {
        'date': _today,
        'className': 'All',
      });

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(res['message'] ?? 'पुश अलर्ट भेज दिया गया।'),
            backgroundColor: Colors.green,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('त्रुटि: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final todayPresent = _stats['todayPresent'] ?? 0;
    final todayAbsent = _stats['todayAbsent'] ?? _schoolAbsentees.length;
    final attRate = _stats['attendanceRate'] ?? 0;

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('प्रधानाचार्य पोर्टल (Principal)', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            Text(widget.user.fullName, style: const TextStyle(fontSize: 11, color: Colors.white70)),
          ],
        ),
        backgroundColor: const Color(0xFF1E1B4B), // Deep indigo
        foregroundColor: Colors.white,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadDashboardData,
          ),
          IconButton(
            icon: const Icon(Icons.logout),
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
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _loadDashboardData,
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Welcome Banner
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(
                          colors: [Color(0xFF312E81), Color(0xFF4338CA)],
                        ),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: Colors.white.withOpacity(0.15),
                              borderRadius: BorderRadius.circular(16),
                            ),
                            child: const Icon(Icons.account_balance, color: Colors.white, size: 32),
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text(
                                  'दैनिक विद्यालय पर्यवेक्षण',
                                  style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  'तारीख: $_today • सत्र 2026-2027',
                                  style: TextStyle(color: Colors.indigo.shade100, fontSize: 12),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),

                    // Quick Action: Take Class Attendance
                    OutlinedButton.icon(
                      onPressed: () {
                        Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => TeacherAttendanceScreen(user: widget.user),
                          ),
                        );
                      },
                      icon: const Icon(Icons.checklist_rtl),
                      label: const Text('कक्षा-वार उपस्थिति रजिस्टर खोलें →'),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        side: const BorderSide(color: Color(0xFF4338CA)),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                    ),
                    const SizedBox(height: 16),

                    // Today Attendance KPI Cards
                    Row(
                      children: [
                        Expanded(
                          child: _buildMetricCard(
                            'आज की उपस्थिति',
                            '$attRate%',
                            '$todayPresent उपस्थित',
                            const Color(0xFF047857),
                            const Color(0xFFECFDF5),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: _buildMetricCard(
                            'कुल अनुपस्थित',
                            '$todayAbsent छात्र',
                            'त्वरित अलर्ट उपलब्ध',
                            Colors.red.shade700,
                            const Color(0xFFFEF2F2),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 20),

                    // Absentee Report Header & Broadcast Button
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          'आज के अनुपस्थित छात्र (${_schoolAbsentees.length})',
                          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
                        ),
                        if (_schoolAbsentees.isNotEmpty)
                          ElevatedButton.icon(
                            onPressed: _sendSchoolWideAbsentAlert,
                            icon: const Icon(Icons.send, size: 14),
                            label: const Text('सभी को अलर्ट', style: TextStyle(fontSize: 11)),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: Colors.red,
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 10),

                    // Absentee List Cards
                    if (_schoolAbsentees.isEmpty)
                      Container(
                        padding: const EdgeInsets.all(24),
                        decoration: BoxDecoration(
                          color: Colors.grey.shade50,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: Colors.grey.shade200),
                        ),
                        child: const Center(
                          child: Text(
                            'आज कोई अनुपस्थित छात्र दर्ज नहीं है।',
                            style: TextStyle(color: Colors.grey),
                          ),
                        ),
                      )
                    else
                      ListView.separated(
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        itemCount: _schoolAbsentees.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 8),
                        itemBuilder: (context, index) {
                          final item = _schoolAbsentees[index];
                          final phone = item['parentPhone'] ?? '';

                          return Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(14),
                              border: Border.all(color: Colors.red.shade100),
                            ),
                            child: Row(
                              children: [
                                Container(
                                  padding: const EdgeInsets.all(8),
                                  decoration: BoxDecoration(
                                    color: Colors.red.shade50,
                                    borderRadius: BorderRadius.circular(10),
                                  ),
                                  child: Text(
                                    item['className'] ?? '',
                                    style: TextStyle(
                                      fontWeight: FontWeight.bold,
                                      color: Colors.red.shade900,
                                      fontSize: 11,
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        item['studentName'] ?? '',
                                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                                      ),
                                      Text(
                                        'अभिभावक: ${item['parentName'] ?? ""} ($phone)',
                                        style: const TextStyle(fontSize: 11, color: Colors.black54),
                                      ),
                                    ],
                                  ),
                                ),
                                if (phone.isNotEmpty) ...[
                                  IconButton(
                                    icon: const Icon(Icons.chat, color: Colors.green, size: 20),
                                    tooltip: 'WhatsApp',
                                    onPressed: () {
                                      final num = phone.replaceAll(RegExp(r'[^0-9]'), '');
                                      final msg = Uri.encodeComponent(
                                        'सादर नमस्कार। आपका बच्चा ${item['studentName']} आज ($_today) अनुपस्थित है। कृपया विद्यालय को सूचित करें।',
                                      );
                                      launchUrl(Uri.parse('https://wa.me/91$num?text=$msg'), mode: LaunchMode.externalApplication);
                                    },
                                  ),
                                  IconButton(
                                    icon: const Icon(Icons.call, color: Colors.blue, size: 20),
                                    tooltip: 'कॉल करें',
                                    onPressed: () {
                                      launchUrl(Uri.parse('tel:$phone'));
                                    },
                                  ),
                                ],
                              ],
                            ),
                          );
                        },
                      ),
                  ],
                ),
              ),
            ),
    );
  }

  Widget _buildMetricCard(String title, String value, String sub, Color color, Color bg) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withOpacity(0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w600)),
          const SizedBox(height: 4),
          Text(value, style: TextStyle(color: color, fontSize: 18, fontWeight: FontWeight.w900)),
          const SizedBox(height: 2),
          Text(sub, style: TextStyle(color: color.withOpacity(0.8), fontSize: 10)),
        ],
      ),
    );
  }
}
