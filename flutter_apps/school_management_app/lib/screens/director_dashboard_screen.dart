import 'package:flutter/material.dart';
import '../config/app_config.dart';
import '../models/user_model.dart';
import '../services/api_client.dart';
import '../services/auth_service.dart';
import '../widgets/activity_log_sheet.dart';
import 'login_screen.dart';
import 'principal_dashboard_screen.dart';
import 'teacher_attendance_screen.dart';

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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('निदेशक डैशबोर्ड (Director)', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            Text(widget.user.fullName, style: const TextStyle(fontSize: 11, color: Colors.white70)),
          ],
        ),
        backgroundColor: const Color(0xFF78350F), // Royal Amber-900
        foregroundColor: Colors.white,
        actions: [
          IconButton(
            icon: const Icon(Icons.history_edu),
            tooltip: 'विद्यालय ऑडिट ट्रेल',
            onPressed: () => ActivityLogSheet.show(context, user: widget.user),
          ),
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'ताज़ा करें',
            onPressed: _loadStats,
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
          _buildExecutiveOverviewTab(),
          _buildOperationsTab(),
          _buildAuditTab(),
          _buildSettingsTab(),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _currentTabIndex,
        onDestinationSelected: (idx) => setState(() => _currentTabIndex = idx),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.insights_outlined),
            selectedIcon: Icon(Icons.insights, color: Color(0xFFB45309)),
            label: 'डैशबोर्ड',
          ),
          NavigationDestination(
            icon: Icon(Icons.business_center_outlined),
            selectedIcon: Icon(Icons.business_center, color: Color(0xFFB45309)),
            label: 'संचालन',
          ),
          NavigationDestination(
            icon: Icon(Icons.policy_outlined),
            selectedIcon: Icon(Icons.policy, color: Color(0xFFB45309)),
            label: 'ऑडिट ट्रेल',
          ),
          NavigationDestination(
            icon: Icon(Icons.settings_outlined),
            selectedIcon: Icon(Icons.settings, color: Color(0xFFB45309)),
            label: 'प्रोफ़ाइल',
          ),
        ],
      ),
    );
  }

  // TAB 1: Executive Overview
  Widget _buildExecutiveOverviewTab() {
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
                  // Director Profile Banner
                  Container(
                    padding: const EdgeInsets.all(18),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [Color(0xFF92400E), Color(0xFFB45309)],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                      borderRadius: BorderRadius.circular(20),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.1),
                          blurRadius: 12,
                          offset: const Offset(0, 4),
                        ),
                      ],
                    ),
                    child: Row(
                      children: [
                        const CircleAvatar(
                          radius: 26,
                          backgroundColor: Colors.white24,
                          child: Icon(Icons.stars, color: Colors.white, size: 28),
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                widget.user.fullName,
                                style: const TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.bold),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                'स्कूल निदेशक • सम्पूर्ण प्रशासनिक नियंत्रण',
                                style: TextStyle(color: Colors.amber.shade100, fontSize: 12),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 18),

                  // Quick Shortcuts
                  Row(
                    children: [
                      Expanded(
                        child: ElevatedButton.icon(
                          onPressed: () {
                            Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (_) => PrincipalDashboardScreen(user: widget.user),
                              ),
                            );
                          },
                          icon: const Icon(Icons.remove_red_eye_outlined, size: 16),
                          label: const Text('अनुपस्थिति रिपोर्ट', style: TextStyle(fontSize: 12)),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.red.shade700,
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(vertical: 12),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: ElevatedButton.icon(
                          onPressed: () {
                            Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (_) => TeacherAttendanceScreen(user: widget.user),
                              ),
                            );
                          },
                          icon: const Icon(Icons.checklist, size: 16),
                          label: const Text('हाजिरी रजिस्टर', style: TextStyle(fontSize: 12)),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.blue.shade800,
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(vertical: 12),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),

                  // Key Performance Indicators Grid
                  const Text('विद्यालय की मुख्य सांख्यिकी', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                  const SizedBox(height: 12),

                  GridView.count(
                    crossAxisCount: 2,
                    crossAxisSpacing: 10,
                    mainAxisSpacing: 10,
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    children: [
                      _buildGridCard('कुल छात्र संख्या', '$totalStudents', Icons.groups_rounded, Colors.blue),
                      _buildGridCard('स्टाफ सदस्य', '$totalStaff', Icons.badge_rounded, Colors.purple),
                      _buildGridCard('दैनिक उपस्थिति दर', '$attRate%', Icons.fact_check_rounded, Colors.teal),
                      _buildGridCard('कुल फीस संकलन', '₹$feeCollected', Icons.currency_rupee_rounded, Colors.green),
                    ],
                  ),
                ],
              ),
            ),
          );
  }

  // TAB 2: School Operations Tab
  Widget _buildOperationsTab() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('विद्यालय संचालन प्रबंधन', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
          const SizedBox(height: 4),
          const Text('शैक्षणिक एवं प्रशासनिक मॉड्यूल तक त्वरित पहुंच', style: TextStyle(fontSize: 12, color: Colors.grey)),
          const SizedBox(height: 16),

          _buildOperationTile(
            title: 'उपस्थिति एवं अनुपस्थिति मॉनिटर',
            subtitle: 'कक्षावार हाजिरी देखें एवं अनुपस्थित छात्रों के अभिभावकों से संपर्क करें',
            icon: Icons.checklist_rounded,
            color: Colors.teal,
            onTap: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => PrincipalDashboardScreen(user: widget.user)),
              );
            },
          ),
          const SizedBox(height: 10),

          _buildOperationTile(
            title: 'शिक्षक उपस्थिति पंजिका (रजिस्टर)',
            subtitle: 'कक्षावार छात्रों की उपस्थिति दर्ज करें या नया छात्र प्रवेश जोड़ें',
            icon: Icons.edit_calendar_rounded,
            color: Colors.blue,
            onTap: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => TeacherAttendanceScreen(user: widget.user)),
              );
            },
          ),
          const SizedBox(height: 10),

          _buildOperationTile(
            title: 'विद्यालय ऑडिट ट्रेल व गतिविधि डायरी',
            subtitle: 'स्टाफ एवं शिक्षकों द्वारा दर्ज किए गए सभी वास्तविक कार्यों का रिकॉर्ड',
            icon: Icons.history_edu_rounded,
            color: const Color(0xFF78350F),
            onTap: () => ActivityLogSheet.show(context, user: widget.user),
          ),
        ],
      ),
    );
  }

  // TAB 3: Audit Trail Tab
  Widget _buildAuditTab() {
    return ActivityLogSheet(user: widget.user);
  }

  // TAB 4: Profile & Settings Tab
  Widget _buildSettingsTab() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Profile Details Card
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: Colors.grey.shade200),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    CircleAvatar(
                      radius: 24,
                      backgroundColor: Colors.amber.shade100,
                      child: Icon(Icons.person, color: Colors.amber.shade900, size: 28),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(widget.user.fullName, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                          Text(widget.user.email, style: const TextStyle(fontSize: 12, color: Colors.grey)),
                        ],
                      ),
                    ),
                  ],
                ),
                const Divider(height: 24),
                _buildInfoRow('पद / भूमिका', 'स्कूल निदेशक (Director)'),
                _buildInfoRow('स्कूल आईडी / टेनेंट', widget.user.schoolId),
                _buildInfoRow('संबद्ध सर्वर', _currentServer),
                _buildInfoRow('ऐप वर्शन', AppConfig.appVersion),
              ],
            ),
          ),
          const SizedBox(height: 20),

          // Logout Button
          ElevatedButton.icon(
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.red.shade700,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 14),
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
            label: const Text('सुरक्षित लॉगआउट करें'),
          ),
        ],
      ),
    );
  }

  Widget _buildGridCard(String label, String value, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
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
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          CircleAvatar(
            radius: 18,
            backgroundColor: color.withValues(alpha: 0.12),
            child: Icon(icon, color: color, size: 20),
          ),
          const SizedBox(height: 10),
          Text(value, style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: color)),
          Text(label, style: const TextStyle(fontSize: 12, color: Colors.grey)),
        ],
      ),
    );
  }

  Widget _buildOperationTile({
    required String title,
    required String subtitle,
    required IconData icon,
    required Color color,
    required VoidCallback onTap,
  }) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.grey.shade200),
      ),
      child: ListTile(
        onTap: onTap,
        leading: CircleAvatar(
          backgroundColor: color.withValues(alpha: 0.12),
          child: Icon(icon, color: color),
        ),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
        subtitle: Text(subtitle, style: const TextStyle(fontSize: 11, color: Colors.grey)),
        trailing: const Icon(Icons.chevron_right, color: Colors.grey),
      ),
    );
  }

  Widget _buildInfoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(fontSize: 12, color: Colors.grey)),
          Flexible(
            child: Text(
              value,
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}
