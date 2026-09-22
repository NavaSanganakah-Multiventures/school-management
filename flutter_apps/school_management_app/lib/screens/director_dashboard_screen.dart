import 'package:flutter/material.dart';
import '../config/app_config.dart';
import '../models/user_model.dart';
import '../services/api_client.dart';
import '../routes/auth_actions.dart';
import '../widgets/activity_log_sheet.dart';
import '../widgets/responsive_layout.dart';
import 'principal_dashboard_screen.dart';
import 'teacher_attendance_screen.dart';
import 'exams_screen.dart';
import 'fees_screen.dart';
import 'staff_management_screen.dart';
import 'subjects_screen.dart';
import 'leave_applications_screen.dart';
import 'school_profile_screen.dart';
import 'notifications_screen.dart';
import 'lms_screen.dart';
import 'ai_screen.dart';
import 'billing_screen.dart';
import 'settings_screen.dart';
import 'students_list_screen.dart';
import 'classes_screen.dart';
import 'notices_screen.dart';
import 'analytics_dashboard_screen.dart';

class DirectorDashboardScreen extends StatefulWidget {
  final UserModel user;
  const DirectorDashboardScreen({super.key, required this.user});

  @override
  State<DirectorDashboardScreen> createState() => _DirectorDashboardScreenState();
}

class _DirectorDashboardScreenState extends State<DirectorDashboardScreen> {
  final ApiClient _api = ApiClient();
  int _currentTabIndex = 0;
  bool _isLoading = true;
  Map<String, dynamic> _stats = {};
  String _currentServer = AppConfig.defaultApiBaseUrl;

  @override
  void initState() {
    super.initState();
    _loadStats();
    _loadServerInfo();
  }

  Future<void> _loadServerInfo() async {
    final server = await AppConfig.getActiveBaseUrl();
    if (mounted) setState(() => _currentServer = server);
  }

  Future<void> _loadStats() async {
    setState(() => _isLoading = true);
    try {
      final res = await _api.get('/api/dashboard-stats');
      if (res['success'] == true) {
        setState(() {
          _stats = res['stats'] ?? {};
          _isLoading = false;
        });
      }
    } catch (_) {
      setState(() => _isLoading = false);
    }
  }

  void _navigateTo(Widget screen) {
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => screen));
  }

  @override
  Widget build(BuildContext context) {
    return ResponsiveLayout(
      mobile: _buildMobileLayout(),
      desktop: _buildDesktopLayout(),
    );
  }

  // ====================== DESKTOP / WEB LAYOUT ======================
  Widget _buildDesktopLayout() {
    // Sidebar items: overview shows inline, others navigate to full screen
    final modules = <_NavModule>[
      _NavModule('डैशबोर्ड', Icons.insights_rounded, null),
      _NavModule('उपस्थिति मॉनिटर', Icons.checklist_rounded, PrincipalDashboardScreen(user: widget.user)),
      _NavModule('हाजिरी रजिस्टर', Icons.edit_calendar_rounded, TeacherAttendanceScreen(user: widget.user)),
      _NavModule('विद्यार्थी', Icons.people_rounded, StudentsListScreen(user: widget.user)),
      _NavModule('कक्षा प्रबंधन', Icons.class_rounded, ClassesScreen(user: widget.user)),
      _NavModule('नोटिस बोर्ड', Icons.campaign_rounded, NoticesScreen(user: widget.user)),
      _NavModule('परीक्षा एवं अंक', Icons.assignment_turned_in_rounded, ExamsScreen(user: widget.user)),
      _NavModule('एनालिटिक्स', Icons.bar_chart_rounded, AnalyticsDashboardScreen(user: widget.user)),
      _NavModule('फीस प्रबंधन', Icons.payments_rounded, FeesScreen(user: widget.user)),
      _NavModule('स्टाफ प्रबंधन', Icons.badge_rounded, StaffManagementScreen(user: widget.user)),
      _NavModule('विषय', Icons.menu_book_rounded, SubjectsScreen(user: widget.user)),
      _NavModule('अवकाश', Icons.event_available_rounded, LeaveApplicationsScreen(user: widget.user)),
      _NavModule('सूचनाएं', Icons.notifications_rounded, NotificationsScreen(user: widget.user)),
      _NavModule('पाठ्यक्रम (LMS)', Icons.video_library_rounded, LmsScreen(user: widget.user)),
      _NavModule('AI सहायक', Icons.smart_toy_rounded, AiScreen(user: widget.user)),
      _NavModule('बिलिंग', Icons.workspace_premium_rounded, BillingScreen(user: widget.user)),
      _NavModule('विद्यालय प्रोफ़ाइल', Icons.school_rounded, SchoolProfileScreen(user: widget.user)),
      _NavModule('सेटिंग्स', Icons.settings_rounded, SettingsScreen(user: widget.user)),
    ];

    return Scaffold(
      body: Row(
        children: [
          // ===== SIDEBAR =====
          Container(
            width: 250,
            decoration: BoxDecoration(
              color: const Color(0xFF78350F),
              boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.15), blurRadius: 8)],
            ),
            child: Column(
              children: [
                // Brand header
                Container(
                  padding: const EdgeInsets.fromLTRB(16, 20, 16, 16),
                  child: Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.15),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: const Icon(Icons.school, color: Colors.white, size: 22),
                      ),
                      const SizedBox(width: 10),
                      const Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Pragnya Mitra', style: TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.bold)),
                            Text('Director Panel', style: TextStyle(color: Colors.white54, fontSize: 10)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                Divider(color: Colors.white.withOpacity(0.15), height: 1),
                // User info
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  child: Row(
                    children: [
                      CircleAvatar(
                        radius: 16,
                        backgroundColor: Colors.amber.shade300,
                        child: Text(
                          widget.user.fullName.isNotEmpty ? widget.user.fullName[0].toUpperCase() : '?',
                          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(widget.user.fullName, style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600), overflow: TextOverflow.ellipsis),
                            Text('DIRECTOR', style: TextStyle(color: Colors.white.withOpacity(0.5), fontSize: 9, letterSpacing: 1)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                Divider(color: Colors.white.withOpacity(0.15), height: 1),
                const SizedBox(height: 8),
                // Nav items
                Expanded(
                  child: ListView.builder(
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    itemCount: modules.length,
                    itemBuilder: (context, index) {
                      final m = modules[index];
                      final isSelected = _currentTabIndex == index;
                      return _SidebarTile(
                        icon: m.icon,
                        label: m.label,
                        isSelected: isSelected,
                        onTap: () {
                          if (m.screen == null) {
                            // Dashboard — show overview inline
                            setState(() => _currentTabIndex = 0);
                          } else {
                            // Navigate to full screen
                            _navigateTo(m.screen!);
                          }
                        },
                      );
                    },
                  ),
                ),
                // Logout
                Padding(
                  padding: const EdgeInsets.all(12),
                  child: SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      onPressed: () async {
                        await performLogout(context);
                      },
                      icon: const Icon(Icons.logout, size: 16, color: Colors.white70),
                      label: const Text('लॉगआउट', style: TextStyle(color: Colors.white70, fontSize: 12)),
                      style: OutlinedButton.styleFrom(
                        side: BorderSide(color: Colors.white.withOpacity(0.2)),
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          // ===== CONTENT AREA =====
          Expanded(child: _buildDesktopOverview()),
        ],
      ),
    );
  }

  /// Desktop overview — the main dashboard content shown inline
  Widget _buildDesktopOverview() {
    final totalStudents = _stats['totalStudents'] ?? 0;
    final totalStaff = _stats['totalStaff'] ?? 0;
    final attRate = _stats['attendanceRate'] ?? 0;
    final feeCollected = _stats['totalFeeCollected'] ?? 0;

    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1100),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Page header
              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Welcome back, ${widget.user.fullName}',
                            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Color(0xFF1E293B))),
                        const SizedBox(height: 4),
                        Text('School administration overview & quick actions',
                            style: TextStyle(fontSize: 13, color: Colors.grey.shade500)),
                      ],
                    ),
                  ),
                  IconButton(
                    onPressed: _loadStats,
                    icon: const Icon(Icons.refresh),
                    tooltip: 'Refresh',
                  ),
                ],
              ),
              const SizedBox(height: 24),

              // KPI Cards Row
              LayoutBuilder(
                builder: (context, constraints) {
                  final crossCount = constraints.maxWidth > 800 ? 4 : 2;
                  return GridView.count(
                    crossAxisCount: crossCount,
                    crossAxisSpacing: 16,
                    mainAxisSpacing: 16,
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    childAspectRatio: 2.0,
                    children: [
                      _DesktopKpiCard('कुल छात्र', '$totalStudents', Icons.groups_rounded, Colors.blue),
                      _DesktopKpiCard('स्टाफ सदस्य', '$totalStaff', Icons.badge_rounded, Colors.purple),
                      _DesktopKpiCard('उपस्थिति दर', '$attRate%', Icons.fact_check_rounded, Colors.teal),
                      _DesktopKpiCard('फीस संकलन', '₹$feeCollected', Icons.currency_rupee_rounded, Colors.green),
                    ],
                  );
                },
              ),
              const SizedBox(height: 28),

              // Quick Actions Section
              const Text('Quick Actions', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Color(0xFF1E293B))),
              const SizedBox(height: 12),
              LayoutBuilder(
                builder: (context, constraints) {
                  final crossCount = constraints.maxWidth > 800 ? 3 : (constraints.maxWidth > 500 ? 2 : 1);
                  return GridView.count(
                    crossAxisCount: crossCount,
                    crossAxisSpacing: 12,
                    mainAxisSpacing: 12,
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    childAspectRatio: 3.0,
                    children: [
                      _QuickAction(Icons.checklist_rounded, 'उपस्थिति मॉनिटर', Colors.teal, () => _navigateTo(PrincipalDashboardScreen(user: widget.user))),
                      _QuickAction(Icons.edit_calendar_rounded, 'हाजिरी रजिस्टर', Colors.blue, () => _navigateTo(TeacherAttendanceScreen(user: widget.user))),
                      _QuickAction(Icons.assignment_turned_in_rounded, 'परीक्षा एवं अंक', const Color(0xFF7C2D12), () => _navigateTo(ExamsScreen(user: widget.user))),
                      _QuickAction(Icons.payments_rounded, 'फीस प्रबंधन', const Color(0xFF065F46), () => _navigateTo(FeesScreen(user: widget.user))),
                      _QuickAction(Icons.badge_rounded, 'स्टाफ प्रबंधन', const Color(0xFF6D28D9), () => _navigateTo(StaffManagementScreen(user: widget.user))),
                      _QuickAction(Icons.menu_book_rounded, 'विषय एवं मैपिंग', const Color(0xFF1F2937), () => _navigateTo(SubjectsScreen(user: widget.user))),
                      _QuickAction(Icons.event_available_rounded, 'अवकाश आवेदन', const Color(0xFF0F766E), () => _navigateTo(LeaveApplicationsScreen(user: widget.user))),
                      _QuickAction(Icons.campaign_rounded, 'सूचना प्रसारण', const Color(0xFFB45309), () => _navigateTo(NotificationsScreen(user: widget.user))),
                      _QuickAction(Icons.video_library_rounded, 'पाठ्यक्रम (LMS)', const Color(0xFF7E22CE), () => _navigateTo(LmsScreen(user: widget.user))),
                      _QuickAction(Icons.smart_toy_rounded, 'AI सहायक', const Color(0xFF4338CA), () => _navigateTo(AiScreen(user: widget.user))),
                      _QuickAction(Icons.workspace_premium_rounded, 'बिलिंग', const Color(0xFF1E293B), () => _navigateTo(BillingScreen(user: widget.user))),
                      _QuickAction(Icons.school_rounded, 'विद्यालय प्रोफ़ाइल', const Color(0xFF1E3A8A), () => _navigateTo(SchoolProfileScreen(user: widget.user))),
                    ],
                  );
                },
              ),
              const SizedBox(height: 28),

              // Audit Trail inline
              const Text('Recent Activity', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Color(0xFF1E293B))),
              const SizedBox(height: 12),
              SizedBox(
                height: 300,
                child: ActivityLogSheet(user: widget.user),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ====================== MOBILE LAYOUT ======================
  Widget _buildMobileLayout() {
    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('निदेशक डैशबोर्ड (Director)', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            Text(widget.user.fullName, style: const TextStyle(fontSize: 11, color: Colors.white70)),
          ],
        ),
        backgroundColor: const Color(0xFF78350F),
        foregroundColor: Colors.white,
        actions: [
          IconButton(icon: const Icon(Icons.history_edu), tooltip: 'ऑडिट ट्रेल', onPressed: () => ActivityLogSheet.show(context, user: widget.user)),
          IconButton(icon: const Icon(Icons.refresh), tooltip: 'ताज़ा करें', onPressed: _loadStats),
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: 'लॉगआउट',
            onPressed: () async {
              await performLogout(context);
            },
          ),
        ],
      ),
      body: IndexedStack(
        index: _currentTabIndex,
        children: [
          _buildMobileOverview(),
          _buildMobileOperations(),
          ActivityLogSheet(user: widget.user),
          _buildMobileSettings(),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _currentTabIndex,
        onDestinationSelected: (idx) => setState(() => _currentTabIndex = idx),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.insights_outlined), selectedIcon: Icon(Icons.insights, color: Color(0xFFB45309)), label: 'डैशबोर्ड'),
          NavigationDestination(icon: Icon(Icons.business_center_outlined), selectedIcon: Icon(Icons.business_center, color: Color(0xFFB45309)), label: 'संचालन'),
          NavigationDestination(icon: Icon(Icons.policy_outlined), selectedIcon: Icon(Icons.policy, color: Color(0xFFB45309)), label: 'ऑडिट'),
          NavigationDestination(icon: Icon(Icons.settings_outlined), selectedIcon: Icon(Icons.settings, color: Color(0xFFB45309)), label: 'प्रोफ़ाइल'),
        ],
      ),
    );
  }

  Widget _buildMobileOverview() {
    final totalStudents = _stats['totalStudents'] ?? 0;
    final totalStaff = _stats['totalStaff'] ?? 0;
    final attRate = _stats['attendanceRate'] ?? 0;
    final feeCollected = _stats['totalFeeCollected'] ?? 0;

    return _isLoading
        ? const Center(child: CircularProgressIndicator())
        : RefreshIndicator(
            onRefresh: _loadStats,
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Profile Banner
                  Container(
                    padding: const EdgeInsets.all(18),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(colors: [Color(0xFF92400E), Color(0xFFB45309)]),
                      borderRadius: BorderRadius.circular(20),
                      boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.1), blurRadius: 12, offset: const Offset(0, 4))],
                    ),
                    child: Row(
                      children: [
                        const CircleAvatar(radius: 26, backgroundColor: Colors.white24, child: Icon(Icons.stars, color: Colors.white, size: 28)),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(widget.user.fullName, style: const TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.bold)),
                              const SizedBox(height: 2),
                              Text('स्कूल निदेशक • सम्पूर्ण प्रशासनिक नियंत्रण', style: TextStyle(color: Colors.amber.shade100, fontSize: 12)),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 18),
                  // Quick Buttons
                  Row(
                    children: [
                      Expanded(
                        child: ElevatedButton.icon(
                          onPressed: () => _navigateTo(PrincipalDashboardScreen(user: widget.user)),
                          icon: const Icon(Icons.remove_red_eye_outlined, size: 16),
                          label: const Text('अनुपस्थिति रिपोर्ट', style: TextStyle(fontSize: 12)),
                          style: ElevatedButton.styleFrom(backgroundColor: Colors.red.shade700, foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(vertical: 12), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: ElevatedButton.icon(
                          onPressed: () => _navigateTo(TeacherAttendanceScreen(user: widget.user)),
                          icon: const Icon(Icons.checklist, size: 16),
                          label: const Text('हाजिरी रजिस्टर', style: TextStyle(fontSize: 12)),
                          style: ElevatedButton.styleFrom(backgroundColor: Colors.blue.shade800, foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(vertical: 12), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),
                  const Text('विद्यालय की मुख्य सांख्यिकी', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                  const SizedBox(height: 12),
                  GridView.count(
                    crossAxisCount: 2,
                    crossAxisSpacing: 10,
                    mainAxisSpacing: 10,
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    childAspectRatio: 1.6,
                    children: [
                      _MobileKpiCard('कुल छात्र', '$totalStudents', Icons.groups_rounded, Colors.blue),
                      _MobileKpiCard('स्टाफ सदस्य', '$totalStaff', Icons.badge_rounded, Colors.purple),
                      _MobileKpiCard('उपस्थिति दर', '$attRate%', Icons.fact_check_rounded, Colors.teal),
                      _MobileKpiCard('फीस संकलन', '₹$feeCollected', Icons.currency_rupee_rounded, Colors.green),
                    ],
                  ),
                ],
              ),
            ),
          );
  }

  Widget _buildMobileOperations() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('विद्यालय संचालन प्रबंधन', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
          const SizedBox(height: 16),
          _MobileTile('उपस्थिति मॉनिटर', Icons.checklist_rounded, Colors.teal, () => _navigateTo(PrincipalDashboardScreen(user: widget.user))),
          _MobileTile('शिक्षक उपस्थिति पंजिका', Icons.edit_calendar_rounded, Colors.blue, () => _navigateTo(TeacherAttendanceScreen(user: widget.user))),
          _MobileTile('परीक्षा एवं अंक', Icons.assignment_turned_in_rounded, const Color(0xFF7C2D12), () => _navigateTo(ExamsScreen(user: widget.user))),
          _MobileTile('फीस प्रबंधन', Icons.payments_rounded, const Color(0xFF065F46), () => _navigateTo(FeesScreen(user: widget.user))),
          _MobileTile('स्टाफ प्रबंधन', Icons.badge_rounded, const Color(0xFF6D28D9), () => _navigateTo(StaffManagementScreen(user: widget.user))),
          _MobileTile('विषय एवं मैपिंग', Icons.menu_book_rounded, const Color(0xFF1F2937), () => _navigateTo(SubjectsScreen(user: widget.user))),
          _MobileTile('अवकाश आवेदन', Icons.event_available_rounded, const Color(0xFF0F766E), () => _navigateTo(LeaveApplicationsScreen(user: widget.user))),
          _MobileTile('विद्यालय प्रोफ़ाइल', Icons.school_rounded, const Color(0xFF1E3A8A), () => _navigateTo(SchoolProfileScreen(user: widget.user))),
          _MobileTile('सूचना प्रसारण', Icons.campaign_rounded, const Color(0xFFB45309), () => _navigateTo(NotificationsScreen(user: widget.user))),
          _MobileTile('पाठ्यक्रम (LMS)', Icons.video_library_rounded, const Color(0xFF7E22CE), () => _navigateTo(LmsScreen(user: widget.user))),
          _MobileTile('AI सहायक', Icons.smart_toy_rounded, const Color(0xFF4338CA), () => _navigateTo(AiScreen(user: widget.user))),
          _MobileTile('सदस्यता एवं बिलिंग', Icons.workspace_premium_rounded, const Color(0xFF1E293B), () => _navigateTo(BillingScreen(user: widget.user))),
        ],
      ),
    );
  }

  Widget _buildMobileSettings() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Card(
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(children: [
                    CircleAvatar(radius: 24, backgroundColor: Colors.amber.shade100, child: Icon(Icons.person, color: Colors.amber.shade900, size: 28)),
                    const SizedBox(width: 14),
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(widget.user.fullName, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                      Text(widget.user.email, style: const TextStyle(fontSize: 12, color: Colors.grey)),
                    ])),
                  ]),
                  const Divider(height: 24),
                  _InfoRow('पद / भूमिका', 'स्कूल निदेशक'),
                  _InfoRow('स्कूल आईडी', widget.user.schoolId),
                  _InfoRow('सर्वर', _currentServer),
                  _InfoRow('वर्शन', AppConfig.appVersion),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          Row(children: [
            Expanded(child: OutlinedButton.icon(onPressed: () => _navigateTo(SchoolProfileScreen(user: widget.user)), icon: const Icon(Icons.school, size: 18), label: const Text('प्रोफ़ाइल', style: TextStyle(fontSize: 12)))),
            const SizedBox(width: 10),
            Expanded(child: OutlinedButton.icon(onPressed: () => _navigateTo(SettingsScreen(user: widget.user)), icon: const Icon(Icons.settings, size: 18), label: const Text('सेटिंग्स', style: TextStyle(fontSize: 12)))),
          ]),
          const SizedBox(height: 16),
          ElevatedButton.icon(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red.shade700, foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(vertical: 14), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
            onPressed: () async {
              await performLogout(context);
            },
            icon: const Icon(Icons.logout),
            label: const Text('सुरक्षित लॉगआउट करें'),
          ),
        ],
      ),
    );
  }
}

// ===== SHARED PRIVATE WIDGETS =====

class _NavModule {
  final String label;
  final IconData icon;
  final Widget? screen; // null = dashboard overview (inline)
  _NavModule(this.label, this.icon, this.screen);
}

class _SidebarTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool isSelected;
  final VoidCallback onTap;

  const _SidebarTile({required this.icon, required this.label, required this.isSelected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(8),
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: isSelected ? Colors.white.withOpacity(0.15) : Colors.transparent,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Row(
            children: [
              Icon(icon, size: 18, color: isSelected ? Colors.white : Colors.white60),
              const SizedBox(width: 10),
              Expanded(child: Text(label, style: TextStyle(fontSize: 13, color: isSelected ? Colors.white : Colors.white70, fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal))),
            ],
          ),
        ),
      ),
    );
  }
}

class _DesktopKpiCard extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color color;
  const _DesktopKpiCard(this.label, this.value, this.icon, this.color);

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14), side: BorderSide(color: Colors.grey.shade200)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            CircleAvatar(radius: 20, backgroundColor: color.withOpacity(0.12), child: Icon(icon, color: color, size: 22)),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(value, style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: color)),
                  Text(label, style: TextStyle(fontSize: 12, color: Colors.grey.shade500)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _QuickAction extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;
  const _QuickAction(this.icon, this.label, this.color, this.onTap);

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12), side: BorderSide(color: Colors.grey.shade200)),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(
            children: [
              CircleAvatar(radius: 18, backgroundColor: color.withOpacity(0.12), child: Icon(icon, color: color, size: 18)),
              const SizedBox(width: 12),
              Expanded(child: Text(label, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600))),
              Icon(Icons.arrow_forward_ios, size: 14, color: Colors.grey.shade400),
            ],
          ),
        ),
      ),
    );
  }
}

class _MobileKpiCard extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color color;
  const _MobileKpiCard(this.label, this.value, this.icon, this.color);

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.grey.shade200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          CircleAvatar(radius: 16, backgroundColor: color.withOpacity(0.12), child: Icon(icon, color: color, size: 18)),
          const SizedBox(height: 8),
          Text(value, style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold, color: color)),
          Text(label, style: const TextStyle(fontSize: 11, color: Colors.grey)),
        ],
      ),
    );
  }
}

class _MobileTile extends StatelessWidget {
  final String title;
  final IconData icon;
  final Color color;
  final VoidCallback onTap;
  const _MobileTile(this.title, this.icon, this.color, this.onTap);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        elevation: 0,
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
            decoration: BoxDecoration(borderRadius: BorderRadius.circular(14), border: Border.all(color: Colors.grey.shade200)),
            child: Row(
              children: [
                CircleAvatar(backgroundColor: color.withOpacity(0.12), child: Icon(icon, color: color, size: 20)),
                const SizedBox(width: 14),
                Expanded(child: Text(title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14))),
                Icon(Icons.chevron_right, color: Colors.grey.shade400, size: 20),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final String label;
  final String value;
  const _InfoRow(this.label, this.value);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TextStyle(fontSize: 12, color: Colors.grey.shade500)),
          Flexible(child: Text(value, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold), overflow: TextOverflow.ellipsis)),
        ],
      ),
    );
  }
}
