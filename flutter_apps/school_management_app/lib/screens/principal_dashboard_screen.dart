import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/user_model.dart';
import '../services/api_client.dart';
import '../services/auth_service.dart';
import '../widgets/activity_log_sheet.dart';
import '../widgets/responsive_layout.dart';
import 'login_screen.dart';
import 'teacher_attendance_screen.dart';
import 'exams_screen.dart';
import 'fees_screen.dart';
import 'staff_management_screen.dart';
import 'subjects_screen.dart';
import 'leave_applications_screen.dart';
import 'notifications_screen.dart';
import 'lms_screen.dart';
import 'settings_screen.dart';

class PrincipalDashboardScreen extends StatefulWidget {
  final UserModel user;
  const PrincipalDashboardScreen({super.key, required this.user});

  @override
  State<PrincipalDashboardScreen> createState() => _PrincipalDashboardScreenState();
}

class _PrincipalDashboardScreenState extends State<PrincipalDashboardScreen> {
  final ApiClient _api = ApiClient();
  int _currentTabIndex = 0;

  bool _isLoading = true;
  Map<String, dynamic> _stats = {};
  List<dynamic> _schoolAbsentees = [];
  final String _today = DateFormat('yyyy-MM-dd').format(DateTime.now());

  // Search & Filter for Absentees
  String _absenteeSearch = '';
  String _selectedClassFilter = 'All';

  // Notices Tab State
  List<dynamic> _notices = [];
  bool _isLoadingNotices = false;

  @override
  void initState() {
    super.initState();
    _loadDashboardData();
  }

  Future<void> _loadDashboardData() async {
    if (!mounted) return;
    setState(() => _isLoading = true);
    try {
      final statsRes = await _api.get('/api/dashboard-stats');
      final absentRes = await _api.get('/api/attendance/absentees-summary', queryParams: {'date': _today});

      if (!mounted) return;
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
      if (!mounted) return;
      setState(() => _isLoading = false);
    }
  }

  Future<void> _loadNotices() async {
    if (!mounted) return;
    setState(() => _isLoadingNotices = true);
    try {
      final res = await _api.get('/api/notices', queryParams: {'limit': '20'});
      if (!mounted) return;
      if (res['success'] == true) {
        setState(() {
          _notices = res['notices'] ?? [];
          _isLoadingNotices = false;
        });
      }
    } catch (_) {
      if (!mounted) return;
      setState(() => _isLoadingNotices = false);
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
            child: const Text('अलर्ट भेजें'),
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
            content: Text(res['message'] ?? 'सामूहिक पुश अलर्ट प्रेषित कर दिया गया।'),
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

  Future<void> _openCreateNoticeDialog() async {
    final titleCtrl = TextEditingController();
    final descCtrl = TextEditingController();
    bool isSubmitting = false;

    await showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          title: const Row(
            children: [
              Icon(Icons.campaign, color: Color(0xFF1E1B4B)),
              SizedBox(width: 8),
              Text('नई सूचना / परिपत्र जारी करें', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            ],
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: titleCtrl,
                decoration: const InputDecoration(
                  labelText: 'शीर्षक *',
                  hintText: 'उदा. स्वतंत्रता दिवस समारोह',
                  border: OutlineInputBorder(),
                  isDense: true,
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: descCtrl,
                maxLines: 4,
                decoration: const InputDecoration(
                  labelText: 'विवरण *',
                  hintText: 'सूचना का पूरा विवरण लिखें...',
                  border: OutlineInputBorder(),
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: isSubmitting ? null : () => Navigator.pop(ctx),
              child: const Text('रद्द करें'),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF1E1B4B),
                foregroundColor: Colors.white,
              ),
              onPressed: isSubmitting
                  ? null
                  : () async {
                      final title = titleCtrl.text.trim();
                      final desc = descCtrl.text.trim();
                      if (title.isEmpty || desc.isEmpty) {
                        ScaffoldMessenger.of(ctx).showSnackBar(
                          const SnackBar(content: Text('कृपया शीर्षक व विवरण दोनों भरें।')),
                        );
                        return;
                      }

                      setDialogState(() => isSubmitting = true);
                      try {
                        await _api.post('/api/notices', body: {
                          'title': title,
                          'content': desc,
                          'targetAudience': 'All',
                          'priority': 'Normal',
                        });
                        if (ctx.mounted) Navigator.pop(ctx);
                        _loadNotices();
                        if (mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(content: Text('सूचना सफलतापूर्वक प्रकाशित की गई।'), backgroundColor: Colors.green),
                          );
                        }
                      } catch (e) {
                        setDialogState(() => isSubmitting = false);
                        if (mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text('त्रुटि: $e'), backgroundColor: Colors.red),
                          );
                        }
                      }
                    },
              child: isSubmitting
                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Text('प्रकाशित करें'),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ResponsiveLayout(
      mobile: _buildMobileLayout(),
      desktop: _buildDesktopLayout(),
    );
  }

  void _navigateTo(Widget screen) {
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => screen));
  }

  // ====================== DESKTOP / WEB LAYOUT ======================
  Widget _buildDesktopLayout() {
    return WebShell(
      user: widget.user,
      selectedIndex: _currentTabIndex,
      sidebarColor: const Color(0xFF1E1B4B),
      onIndexChanged: (idx) {
        setState(() => _currentTabIndex = idx);
        if (idx == 2 && _notices.isEmpty) _loadNotices();
      },
      items: [
        WebShellItem(label: 'अवलोकन', icon: Icons.dashboard_rounded, child: _buildOverviewTab()),
        WebShellItem(label: 'अनुपस्थित छात्र', icon: Icons.person_off_rounded, child: _buildAbsenteeTab(), badge: _schoolAbsentees.isEmpty ? null : _schoolAbsentees.length, badgeColor: Colors.red),
        WebShellItem(label: 'नोटिस बोर्ड', icon: Icons.campaign_rounded, child: _buildNoticesTab()),
        WebShellItem(label: 'स्टाफ ऑडिट', icon: Icons.verified_user_rounded, child: ActivityLogSheet(user: widget.user)),
      ],
    );
  }

  // ====================== MOBILE LAYOUT ======================
  Widget _buildMobileLayout() {
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
            icon: const Icon(Icons.history_edu),
            tooltip: 'स्टाफ कार्यकलाप ऑडिट',
            onPressed: () => ActivityLogSheet.show(context, user: widget.user),
          ),
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'ताज़ा करें',
            onPressed: _loadDashboardData,
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
          _buildOverviewTab(),
          _buildAbsenteeTab(),
          _buildNoticesTab(),
          _buildAuditTab(),
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
            icon: Icon(Icons.dashboard_outlined),
            selectedIcon: Icon(Icons.dashboard, color: Color(0xFF4338CA)),
            label: 'अवलोकन',
          ),
          NavigationDestination(
            icon: Icon(Icons.person_off_outlined),
            selectedIcon: Icon(Icons.person_off, color: Colors.red),
            label: 'अनुपस्थित',
          ),
          NavigationDestination(
            icon: Icon(Icons.campaign_outlined),
            selectedIcon: Icon(Icons.campaign, color: Color(0xFF4338CA)),
            label: 'नोटिस बोर्ड',
          ),
          NavigationDestination(
            icon: Icon(Icons.verified_user_outlined),
            selectedIcon: Icon(Icons.verified_user, color: Color(0xFF4338CA)),
            label: 'स्टाफ ऑडिट',
          ),
        ],
      ),
    );
  }

  // TAB 1: Daily Overview
  Widget _buildOverviewTab() {
    final todayPresent = _stats['todayPresent'] ?? 0;
    final todayAbsent = _stats['todayAbsent'] ?? _schoolAbsentees.length;
    final attRate = _stats['attendanceRate'] ?? 0;
    final totalStudents = _stats['totalStudents'] ?? 0;
    final totalStaff = _stats['totalStaff'] ?? 0;

    return _isLoading
        ? const Center(child: CircularProgressIndicator())
        : RefreshIndicator(
            onRefresh: _loadDashboardData,
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 900),
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
                          child: const Icon(Icons.account_balance_rounded, color: Colors.white, size: 32),
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

                  // Quick Action Buttons
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: () {
                            Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (_) => TeacherAttendanceScreen(user: widget.user),
                              ),
                            );
                          },
                          icon: const Icon(Icons.checklist_rtl, size: 16),
                          label: const Text('उपस्थिति पंजिका', style: TextStyle(fontSize: 12)),
                          style: OutlinedButton.styleFrom(
                            padding: const EdgeInsets.symmetric(vertical: 12),
                            side: const BorderSide(color: Color(0xFF4338CA)),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: ElevatedButton.icon(
                          onPressed: _openCreateNoticeDialog,
                          icon: const Icon(Icons.campaign, size: 16),
                          label: const Text('नोटिस जारी करें', style: TextStyle(fontSize: 12)),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF312E81),
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(vertical: 12),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),

                  // Today Attendance KPI Cards
                  Row(
                    children: [
                      Expanded(
                        child: _buildMetricCard(
                          'आज की उपस्थिति दर',
                          '$attRate%',
                          '$todayPresent छात्र उपस्थित',
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
                  const SizedBox(height: 12),

                  Row(
                    children: [
                      Expanded(
                        child: _buildMetricCard(
                          'कुल नामांकित छात्र',
                          '$totalStudents',
                          'सभी कक्षाएं मिलाकर',
                          Colors.blue.shade800,
                          const Color(0xFFEFF6FF),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: _buildMetricCard(
                          'कार्यरत स्टाफ',
                          '$totalStaff शिक्षक/कर्मचारी',
                          'सक्रिय सदस्य',
                          Colors.purple.shade800,
                          const Color(0xFFFAF5FF),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),

                  // Modules quick-access grid
                  const Text('प्रबंधन मॉड्यूल', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                  const SizedBox(height: 10),
                  GridView.count(
                    crossAxisCount: 3,
                    crossAxisSpacing: 8,
                    mainAxisSpacing: 8,
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    childAspectRatio: 1.0,
                    children: [
                      _moduleChip(Icons.assignment_turned_in, 'परीक्षा', const Color(0xFF7C2D12), () => Navigator.push(context, MaterialPageRoute(builder: (_) => ExamsScreen(user: widget.user)))),
                      _moduleChip(Icons.payments, 'फीस', const Color(0xFF065F46), () => Navigator.push(context, MaterialPageRoute(builder: (_) => FeesScreen(user: widget.user)))),
                      _moduleChip(Icons.badge, 'स्टाफ', const Color(0xFF6D28D9), () => Navigator.push(context, MaterialPageRoute(builder: (_) => StaffManagementScreen(user: widget.user)))),
                      _moduleChip(Icons.menu_book, 'विषय', const Color(0xFF1F2937), () => Navigator.push(context, MaterialPageRoute(builder: (_) => SubjectsScreen(user: widget.user)))),
                      _moduleChip(Icons.event_available, 'अवकाश', const Color(0xFF0F766E), () => Navigator.push(context, MaterialPageRoute(builder: (_) => LeaveApplicationsScreen(user: widget.user)))),
                      _moduleChip(Icons.campaign, 'सूचना', const Color(0xFFB45309), () => Navigator.push(context, MaterialPageRoute(builder: (_) => NotificationsScreen(user: widget.user)))),
                      _moduleChip(Icons.video_library, 'पाठ्यक्रम', const Color(0xFF7E22CE), () => Navigator.push(context, MaterialPageRoute(builder: (_) => LmsScreen(user: widget.user)))),
                      _moduleChip(Icons.settings, 'सेटिंग्स', const Color(0xFF334155), () => Navigator.push(context, MaterialPageRoute(builder: (_) => SettingsScreen(user: widget.user)))),
                      _moduleChip(Icons.checklist_rtl, 'हाजिरी', const Color(0xFF4338CA), () => Navigator.push(context, MaterialPageRoute(builder: (_) => TeacherAttendanceScreen(user: widget.user)))),
                    ],
                  ),
                  const SizedBox(height: 20),

                  // Quick Absentee Banner Link to Tab 1
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: Colors.grey.shade200),
                    ),
                    child: Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: Colors.red.shade50,
                            shape: BoxShape.circle,
                          ),
                          child: Icon(Icons.person_off, color: Colors.red.shade700, size: 20),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'आज ${_schoolAbsentees.length} छात्र अनुपस्थित दर्ज हैं',
                                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                              ),
                              const Text('अभिभावकों को WhatsApp या कॉल करने के लिए देखें', style: TextStyle(fontSize: 11, color: Colors.grey)),
                            ],
                          ),
                        ),
                        TextButton(
                          onPressed: () => setState(() => _currentTabIndex = 1),
                          child: const Text('सूची देखें →'),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
  }

  // TAB 2: Absentee Roster with Search & Direct Call/WhatsApp
  Widget _buildAbsenteeTab() {
    final filtered = _schoolAbsentees.where((a) {
      final name = (a['studentName'] ?? '').toString().toLowerCase();
      final parent = (a['parentName'] ?? '').toString().toLowerCase();
      final cls = (a['className'] ?? '').toString();
      final matchesSearch = _absenteeSearch.isEmpty || name.contains(_absenteeSearch.toLowerCase()) || parent.contains(_absenteeSearch.toLowerCase());
      final matchesClass = (_selectedClassFilter == 'All') || (cls == _selectedClassFilter);
      return matchesSearch && matchesClass;
    }).toList();

    // Unique classes for filter
    final classes = {'All', ..._schoolAbsentees.map((e) => e['className']?.toString() ?? '')}.toList();

    return Column(
      children: [
        Container(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
          color: Colors.white,
          child: Column(
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'अनुपस्थित छात्र (${_schoolAbsentees.length})',
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
                  ),
                  if (_schoolAbsentees.isNotEmpty)
                    ElevatedButton.icon(
                      onPressed: _sendSchoolWideAbsentAlert,
                      icon: const Icon(Icons.send_rounded, size: 14),
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
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      onChanged: (val) => setState(() => _absenteeSearch = val.trim()),
                      decoration: InputDecoration(
                        hintText: 'छात्र या अभिभावक खोजें...',
                        prefixIcon: const Icon(Icons.search, size: 18),
                        isDense: true,
                        filled: true,
                        fillColor: const Color(0xFFF8FAFC),
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: Colors.grey.shade300)),
                      ),
                    ),
                  ),
                  if (classes.length > 2) ...[
                    const SizedBox(width: 8),
                    DropdownButton<String>(
                      value: _selectedClassFilter,
                      items: classes.map((c) => DropdownMenuItem(value: c, child: Text(c, style: const TextStyle(fontSize: 12)))).toList(),
                      onChanged: (v) {
                        if (v != null) setState(() => _selectedClassFilter = v);
                      },
                    ),
                  ],
                ],
              ),
            ],
          ),
        ),
        const Divider(height: 1),

        Expanded(
          child: filtered.isEmpty
              ? const Center(
                  child: Text('कोई अनुपस्थित छात्र नहीं मिला।', style: TextStyle(color: Colors.grey)),
                )
              : ListView.separated(
                  padding: const EdgeInsets.all(12),
                  itemCount: filtered.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 8),
                  itemBuilder: (context, index) {
                    final item = filtered[index];
                    final phone = item['parentPhone'] ?? '';

                    return Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: Colors.red.shade100),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withOpacity(0.02),
                            blurRadius: 4,
                          ),
                        ],
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
                                final fullNum = num.length == 10 ? '91$num' : num;
                                final msg = Uri.encodeComponent(
                                  'सादर नमस्कार। आपका बच्चा ${item['studentName']} आज ($_today) विद्यालय में अनुपस्थित है। कृपया विद्यालय प्रशासन को सूचित करें।',
                                );
                                launchUrl(Uri.parse('https://wa.me/$fullNum?text=$msg'), mode: LaunchMode.externalApplication);
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
        ),
      ],
    );
  }

  // TAB 3: Notices & Circulars
  Widget _buildNoticesTab() {
    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: const Color(0xFF1E1B4B),
        foregroundColor: Colors.white,
        onPressed: _openCreateNoticeDialog,
        icon: const Icon(Icons.add),
        label: const Text('नई सूचना जारी करें'),
      ),
      body: _isLoadingNotices
          ? const Center(child: CircularProgressIndicator())
          : _notices.isEmpty
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.campaign_outlined, size: 48, color: Colors.grey),
                      const SizedBox(height: 12),
                      const Text('वर्तमान में कोई सूचना उपलब्ध नहीं है।', style: TextStyle(color: Colors.grey)),
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
                                Text(
                                  n['publishedDate'] ?? n['date'] ?? '',
                                  style: const TextStyle(fontSize: 10, color: Colors.grey),
                                ),
                              ],
                            ),
                            const SizedBox(height: 6),
                            Text(
                              n['content'] ?? n['description'] ?? '',
                              style: const TextStyle(fontSize: 12, color: Colors.black87),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
                ),
    );
  }

  // TAB 4: Staff Audit Trail
  Widget _buildAuditTab() {
    return ActivityLogSheet(user: widget.user);
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

  Widget _moduleChip(IconData icon, String label, Color color, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: Colors.grey.shade200),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            CircleAvatar(
              radius: 18,
              backgroundColor: color.withOpacity(0.12),
              child: Icon(icon, color: color, size: 20),
            ),
            const SizedBox(height: 6),
            Text(label, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600), textAlign: TextAlign.center),
          ],
        ),
      ),
    );
  }
}
