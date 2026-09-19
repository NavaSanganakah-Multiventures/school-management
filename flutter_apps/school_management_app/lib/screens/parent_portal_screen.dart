import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/user_model.dart';
import '../services/api_client.dart';
import '../services/auth_service.dart';
import 'login_screen.dart';

class ParentPortalScreen extends StatefulWidget {
  final UserModel user;
  const ParentPortalScreen({super.key, required this.user});

  @override
  State<ParentPortalScreen> createState() => _ParentPortalScreenState();
}

class _ParentPortalScreenState extends State<ParentPortalScreen> {
  final ApiClient _api = ApiClient();
  int _currentTabIndex = 0;
  bool _isLoading = true;
  List<dynamic> _notices = [];
  final String _today = DateFormat('yyyy-MM-dd').format(DateTime.now());

  // Real-time attendance stats for child
  int _totalDays = 0;
  int _presentDays = 0;
  int _absentDays = 0;
  int _leaveDays = 0;
  String _todayStatus = 'Unmarked';
  String? _childName;
  String? _childClass;

  @override
  void initState() {
    super.initState();
    _loadParentData();
  }

  Future<void> _loadParentData() async {
    setState(() => _isLoading = true);
    try {
      final noticesRes = await _api.get('/api/notices', queryParams: {'limit': '20'});
      final summaryRes = await _api.get('/api/attendance/summary');

      setState(() {
        if (noticesRes['success'] == true) {
          _notices = noticesRes['notices'] ?? [];
        }
        if (summaryRes['success'] == true) {
          final stats = summaryRes['stats'] ?? {};
          _totalDays = stats['total'] ?? 0;
          _presentDays = stats['present'] ?? 0;
          _absentDays = stats['absent'] ?? 0;
          _leaveDays = stats['leave'] ?? 0;
          _todayStatus = summaryRes['todayStatus'] ?? 'Unmarked';
          if (summaryRes['student'] != null) {
            final s = summaryRes['student'];
            _childName = '${s['first_name'] ?? ''} ${s['last_name'] ?? ''}'.trim();
            _childClass = 'कक्षा: ${s['class_name'] ?? ''}-${s['section'] ?? ''}';
          }
        }
        _isLoading = false;
      });
    } catch (_) {
      setState(() => _isLoading = false);
    }
  }

  void _makePhoneCall(String phone) async {
    final uri = Uri.parse('tel:$phone');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    }
  }

  void _openWhatsApp(String phone) async {
    final clean = phone.replaceAll(RegExp(r'[^0-9]'), '');
    final num = clean.length == 10 ? '91$clean' : clean;
    final msg = Uri.encodeComponent('सादर नमस्कार। मैं ${widget.user.fullName} का अभिभावक हूँ।');
    final uri = Uri.parse('https://wa.me/$num?text=$msg');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('अभिभावक पोर्टल (Parent Portal)', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            Text(widget.user.fullName, style: const TextStyle(fontSize: 11, color: Colors.white70)),
          ],
        ),
        backgroundColor: const Color(0xFF047857), // Emerald-700
        foregroundColor: Colors.white,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'ताज़ा करें',
            onPressed: _loadParentData,
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
          _buildNoticesTab(),
          _buildHelpdeskTab(),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _currentTabIndex,
        onDestinationSelected: (idx) => setState(() => _currentTabIndex = idx),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.assignment_ind_outlined),
            selectedIcon: Icon(Icons.assignment_ind, color: Color(0xFF047857)),
            label: 'उपस्थिति',
          ),
          NavigationDestination(
            icon: Icon(Icons.campaign_outlined),
            selectedIcon: Icon(Icons.campaign, color: Color(0xFF047857)),
            label: 'सूचनाएं',
          ),
          NavigationDestination(
            icon: Icon(Icons.support_agent_outlined),
            selectedIcon: Icon(Icons.support_agent, color: Color(0xFF047857)),
            label: 'संपर्क',
          ),
        ],
      ),
    );
  }

  // TAB 1: Attendance & Child Progress
  Widget _buildAttendanceTab() {
    final double attendanceRate = _totalDays > 0 ? (_presentDays / _totalDays) * 100 : 100.0;

    Color statusColor;
    Color statusBgColor;
    Color statusBorderColor;
    IconData statusIcon;
    String statusTitle;
    String statusSub;

    switch (_todayStatus) {
      case 'Present':
        statusColor = const Color(0xFF047857);
        statusBgColor = const Color(0xFFECFDF5);
        statusBorderColor = const Color(0xFFA7F3D0);
        statusIcon = Icons.check_circle_rounded;
        statusTitle = 'आज की स्थिति: उपस्थित (Present)';
        statusSub = 'छात्र आज विद्यालय में उपस्थित है।';
        break;
      case 'Absent':
        statusColor = Colors.red.shade700;
        statusBgColor = const Color(0xFFFEF2F2);
        statusBorderColor = const Color(0xFFFECACA);
        statusIcon = Icons.cancel_rounded;
        statusTitle = 'आज की स्थिति: अनुपस्थित (Absent)';
        statusSub = 'कृपया अनुपस्थिति का कारण विद्यालय को सूचित करें।';
        break;
      case 'Leave':
        statusColor = Colors.amber.shade800;
        statusBgColor = const Color(0xFFFFFBEB);
        statusBorderColor = const Color(0xFFFDE68A);
        statusIcon = Icons.event_busy_rounded;
        statusTitle = 'आज की स्थिति: स्वीकृत अवकाश (Leave)';
        statusSub = 'छात्र का अवकाश आवेदन स्वीकृत है।';
        break;
      default:
        statusColor = const Color(0xFF0284C7);
        statusBgColor = const Color(0xFFF0F9FF);
        statusBorderColor = const Color(0xFFBAE6FD);
        statusIcon = Icons.access_time_rounded;
        statusTitle = 'आज की स्थिति: अद्यावधिक (लंबित)';
        statusSub = 'आज की उपस्थिति कक्षा अध्यापक द्वारा शीघ्र दर्ज की जाएगी।';
        break;
    }

    return _isLoading
        ? const Center(child: CircularProgressIndicator())
        : RefreshIndicator(
            onRefresh: _loadParentData,
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Child Profile Banner
                  Container(
                    padding: const EdgeInsets.all(18),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [Color(0xFF065F46), Color(0xFF047857)],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                      borderRadius: BorderRadius.circular(20),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.1),
                          blurRadius: 10,
                        ),
                      ],
                    ),
                    child: Row(
                      children: [
                        const CircleAvatar(
                          radius: 26,
                          backgroundColor: Colors.white24,
                          child: Icon(Icons.school_rounded, color: Colors.white, size: 30),
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                _childName != null ? 'पाल्य: $_childName' : 'नमस्ते, ${widget.user.fullName}',
                                style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                '${_childClass ?? 'अभिभावक पोर्टल'} • तारीख: $_today',
                                style: const TextStyle(color: Color(0xFFD1FAE5), fontSize: 12),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Today Attendance Status Banner
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: statusBgColor,
                      border: Border.all(color: statusBorderColor),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: statusColor,
                            shape: BoxShape.circle,
                          ),
                          child: Icon(statusIcon, color: Colors.white, size: 20),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                statusTitle,
                                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: statusColor),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                statusSub,
                                style: TextStyle(fontSize: 11, color: statusColor.withValues(alpha: 0.9)),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Attendance Progress Card with Circular Chart
                  Container(
                    padding: const EdgeInsets.all(18),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: Colors.grey.shade200),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.02),
                          blurRadius: 8,
                        ),
                      ],
                    ),
                    child: Column(
                      children: [
                        const Text(
                          'सत्र की कुल उपस्थिति प्रगति',
                          style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
                        ),
                        const SizedBox(height: 16),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Stack(
                              alignment: Alignment.center,
                              children: [
                                SizedBox(
                                  width: 96,
                                  height: 96,
                                  child: CircularProgressIndicator(
                                    value: attendanceRate / 100,
                                    strokeWidth: 9,
                                    backgroundColor: Colors.grey.shade200,
                                    color: const Color(0xFF047857),
                                  ),
                                ),
                                Column(
                                  children: [
                                    Text(
                                      '${attendanceRate.toStringAsFixed(1)}%',
                                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: Color(0xFF047857)),
                                    ),
                                    const Text('हाजिरी', style: TextStyle(fontSize: 10, color: Colors.grey)),
                                  ],
                                ),
                              ],
                            ),
                            const SizedBox(width: 24),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                _buildStatIndicator('कुल कार्य दिवस', '$_totalDays दिन', Colors.blueGrey),
                                const SizedBox(height: 6),
                                _buildStatIndicator('उपस्थित दिन', '$_presentDays दिन', Colors.green),
                                const SizedBox(height: 6),
                                _buildStatIndicator('अनुपस्थित दिन', '$_absentDays दिन', Colors.red),
                                const SizedBox(height: 6),
                                _buildStatIndicator('अवकाश (Leave)', '$_leaveDays दिन', Colors.amber.shade800),
                              ],
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),

                  // FCM Notification Active Card
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: const Color(0xFFEFF6FF),
                      border: Border.all(color: const Color(0xFFBFDBFE)),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(8),
                          decoration: const BoxDecoration(
                            color: Color(0xFF3B82F6),
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(Icons.notifications_active, color: Colors.white, size: 18),
                        ),
                        const SizedBox(width: 12),
                        const Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'FCM मोबाइल पुश अलर्ट सक्रिय',
                                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: Color(0xFF1E3A8A)),
                              ),
                              SizedBox(height: 2),
                              Text(
                                'किसी भी दिन अनुपस्थिति दर्ज होने पर आपके मोबाइल पर तुरंत सूचना भेजी जाएगी।',
                                style: TextStyle(fontSize: 11, color: Color(0xFF1D4ED8)),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          );
  }

  // TAB 2: School Notices
  Widget _buildNoticesTab() {
    return _isLoading
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
                    ElevatedButton(onPressed: _loadParentData, child: const Text('ताज़ा करें')),
                  ],
                ),
              )
            : RefreshIndicator(
                onRefresh: _loadParentData,
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
                                  color: const Color(0xFFECFDF5),
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Text(
                                  n['date'] ?? '',
                                  style: const TextStyle(fontSize: 10, color: Color(0xFF047857), fontWeight: FontWeight.bold),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 6),
                          Text(
                            n['description'] ?? '',
                            style: const TextStyle(fontSize: 12, color: Colors.black87),
                          ),
                        ],
                      ),
                    );
                  },
                ),
              );
  }

  // TAB 3: Helpdesk & School Contact
  Widget _buildHelpdeskTab() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: Colors.grey.shade200),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(
                  children: [
                    Icon(Icons.contact_phone_rounded, color: Color(0xFF047857)),
                    SizedBox(width: 8),
                    Text('विद्यालय संपर्क केंद्र', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                  ],
                ),
                const SizedBox(height: 6),
                const Text(
                  'किसी भी पूछताछ या अवकाश प्रार्थना हेतु सीधे विद्यालय कार्यालय से संपर्क करें।',
                  style: TextStyle(fontSize: 12, color: Colors.grey),
                ),
                const Divider(height: 24),

                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const CircleAvatar(
                    backgroundColor: Color(0xFFECFDF5),
                    child: Icon(Icons.call, color: Color(0xFF047857)),
                  ),
                  title: const Text('विद्यालय हेल्पलाइन नंबर'),
                  subtitle: const Text('+91 9876543210'),
                  trailing: ElevatedButton(
                    style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF047857), foregroundColor: Colors.white),
                    onPressed: () => _makePhoneCall('+919876543210'),
                    child: const Text('कॉल करें'),
                  ),
                ),
                const Divider(),

                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const CircleAvatar(
                    backgroundColor: Color(0xFFECFDF5),
                    child: Icon(Icons.chat, color: Colors.green),
                  ),
                  title: const Text('WhatsApp सहायता केंद्र'),
                  subtitle: const Text('त्वरित संदेश सहायता'),
                  trailing: ElevatedButton(
                    style: ElevatedButton.styleFrom(backgroundColor: Colors.green, foregroundColor: Colors.white),
                    onPressed: () => _openWhatsApp('+919876543210'),
                    child: const Text('WhatsApp'),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),

          // Logout
          OutlinedButton.icon(
            style: OutlinedButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 14),
              foregroundColor: Colors.red.shade700,
              side: BorderSide(color: Colors.red.shade300),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            onPressed: () async {
              await AuthService().logout();
              if (mounted) {
                Navigator.of(context).pushReplacement(
                  MaterialPageRoute(builder: (_) => const LoginScreen()),
                );
              }
            },
            icon: const Icon(Icons.logout),
            label: const Text('लॉगआउट करें'),
          ),
        ],
      ),
    );
  }

  Widget _buildStatIndicator(String label, String value, Color color) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 10,
          height: 10,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 8),
        Text('$label: ', style: const TextStyle(fontSize: 12, color: Colors.grey)),
        Text(value, style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: color)),
      ],
    );
  }
}
