import 'package:flutter/material.dart';
import '../services/api_client.dart';
import '../services/school_service.dart';
import '../services/subscription_service.dart';
import '../widgets/app_ui.dart';
import 'dashboard_screen.dart';
import 'feature_requests_screen.dart';
import 'plans_screen.dart';
import 'plugins_screen.dart';
import 'schools_screen.dart';
import 'subscriptions_screen.dart';
import 'super_admin_login_screen.dart';
import 'transactions_screen.dart';

class SuperAdminHomeScreen extends StatefulWidget {
  final Map<String, dynamic> adminProfile;
  const SuperAdminHomeScreen({super.key, required this.adminProfile});

  @override
  State<SuperAdminHomeScreen> createState() => _SuperAdminHomeScreenState();
}

class _NavItem {
  final String label;
  final IconData icon;
  final IconData selectedIcon;
  const _NavItem(this.label, this.icon, this.selectedIcon);
}

class _SuperAdminHomeScreenState extends State<SuperAdminHomeScreen> {
  final _api = SuperAdminApiClient();
  final _schoolService = SchoolService();

  int _index = 0;

  // Badge data refreshed lazily by child screens via callbacks.
  int _pendingCount = 0;
  int _requestCount = 0;

  static const _navItems = [
    _NavItem('डैशबोर्ड', Icons.dashboard_outlined, Icons.dashboard),
    _NavItem('स्कूल', Icons.school_outlined, Icons.school),
    _NavItem('लेन-देन', Icons.payments_outlined, Icons.payments),
    _NavItem('प्लगइन', Icons.extension_outlined, Icons.extension),
    _NavItem('प्लान', Icons.workspace_premium_outlined, Icons.workspace_premium),
    _NavItem('फीचर अनुरोध', Icons.lightbulb_outline, Icons.lightbulb),
    _NavItem('सदस्यता', Icons.repeat, Icons.repeat_on),
  ];

  @override
  void initState() {
    super.initState();
    SuperAdminApiClient.onAuthFailure = _forceLogout;
    _refreshBadges();
  }

  @override
  void dispose() {
    SuperAdminApiClient.onAuthFailure = null;
    super.dispose();
  }

  void _forceLogout() {
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const SuperAdminLoginScreen()),
      (route) => false,
    );
  }

  Future<void> _refreshBadges() async {
    try {
      final pending = await _schoolService.fetchRegistrations();
      var reqCount = 0;
      try {
        reqCount = (await FeatureRequestService().fetchRequests()).length;
      } catch (_) {}
      if (!mounted) return;
      setState(() {
        _pendingCount = pending.length;
        _requestCount = reqCount;
      });
    } catch (_) {}
  }

  Future<void> _logout() async {
    final ok = await confirmDialog(
      context,
      title: 'लॉगआउट',
      message: 'क्या आप सुपर एडमिन कंसोल से लॉगआउट करना चाहते हैं?',
      confirmText: 'लॉगआउट करें',
      destructive: true,
    );
    if (!ok) return;
    await _api.clearAuth();
    _forceLogout();
  }

  void _onSelect(int i) => setState(() => _index = i);

  @override
  Widget build(BuildContext context) {
    final isWide = MediaQuery.sizeOf(context).width >= 1000;
    final screens = [
      DashboardScreen(
        profile: widget.adminProfile,
        refreshBadges: _refreshBadges,
        pendingCount: _pendingCount,
      ),
      SchoolsScreen(refreshBadges: _refreshBadges),
      const TransactionsScreen(),
      const PluginsScreen(),
      PlansScreen(refreshBadges: _refreshBadges),
      FeatureRequestsScreen(refreshBadges: _refreshBadges),
      SubscriptionsScreen(refreshBadges: _refreshBadges),
    ];

    final adminName = (widget.adminProfile['fullName'] ?? 'प्लेटफॉर्म एडमिन').toString();
    final adminEmail = (widget.adminProfile['email'] ?? '').toString();

    if (isWide) {
      return Scaffold(
        body: Row(
          children: [
            _buildSidebar(adminName, adminEmail),
            Expanded(child: screens[_index]),
          ],
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        backgroundColor: kPrimaryDark,
        foregroundColor: Colors.white,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Super Admin Console',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            Text(adminName,
                style: const TextStyle(fontSize: 11, color: Colors.white70)),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'लॉगआउट',
            icon: const Icon(Icons.logout),
            onPressed: _logout,
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(48),
          child: Container(
            color: kPrimaryDark,
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 8),
              child: Row(
                children: [
                  for (var i = 0; i < _navItems.length; i++)
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 2),
                      child: ChoiceChip(
                        label: Text(_navItems[i].label,
                            style: const TextStyle(fontSize: 11)),
                        selected: _index == i,
                        onSelected: (_) => _onSelect(i),
                        selectedColor: Colors.white,
                        backgroundColor: Colors.white.withValues(alpha: 0.15),
                        labelStyle: TextStyle(
                          color: _index == i ? kPrimaryDark : Colors.white70,
                          fontWeight:
                              _index == i ? FontWeight.bold : FontWeight.normal,
                        ),
                        side: BorderSide.none,
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
        automaticallyImplyLeading: false,
      ),
      body: IndexedStack(index: _index, children: screens),
    );
  }

  Widget _buildSidebar(String name, String email) {
    return Container(
      width: 264,
      color: kSidebar,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.all(20),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(9),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child:
                      const Icon(Icons.security, color: Colors.white, size: 22),
                ),
                const SizedBox(width: 12),
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Pragnya Mitra',
                          style: TextStyle(
                              color: Colors.white,
                              fontSize: 15,
                              fontWeight: FontWeight.bold)),
                      Text('Super Admin Console',
                          style:
                              TextStyle(color: Colors.white54, fontSize: 10)),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const Divider(color: Colors.white12, height: 1),
          Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 18,
                  backgroundColor: Colors.white.withValues(alpha: 0.15),
                  child: Text(
                    name.isNotEmpty ? name[0].toUpperCase() : '?',
                    style: const TextStyle(
                        color: Colors.white, fontWeight: FontWeight.bold),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              color: Colors.white,
                              fontSize: 13,
                              fontWeight: FontWeight.w600)),
                      Text(email.isNotEmpty ? email : 'SUPER ADMIN',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                              color: Colors.white.withValues(alpha: 0.5),
                              fontSize: 10)),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const Divider(color: Colors.white12, height: 1),
          const SizedBox(height: 10),
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.symmetric(horizontal: 8),
              itemCount: _navItems.length,
              itemBuilder: (context, i) {
                final item = _navItems[i];
                final selected = _index == i;
                return Padding(
                  padding: const EdgeInsets.only(bottom: 3),
                  child: Material(
                    color: Colors.transparent,
                    borderRadius: BorderRadius.circular(10),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(10),
                      onTap: () => _onSelect(i),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 14, vertical: 11),
                        decoration: BoxDecoration(
                          color: selected
                              ? Colors.white.withValues(alpha: 0.12)
                              : Colors.transparent,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Row(
                          children: [
                            Icon(
                              selected ? item.selectedIcon : item.icon,
                              size: 20,
                              color:
                                  selected ? Colors.white : Colors.white54,
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Text(
                                item.label,
                                style: TextStyle(
                                  fontSize: 13,
                                  fontWeight: selected
                                      ? FontWeight.w600
                                      : FontWeight.normal,
                                  color: selected
                                      ? Colors.white
                                      : Colors.white70,
                                ),
                              ),
                            ),
                            if (i == 1 && _pendingCount > 0)
                              _badge('$_pendingCount'),
                            if (i == 5 && _requestCount > 0)
                              _badge('$_requestCount'),
                          ],
                        ),
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
          const Divider(color: Colors.white12, height: 1),
          Padding(
            padding: const EdgeInsets.all(12),
            child: OutlinedButton.icon(
              onPressed: _logout,
              style: OutlinedButton.styleFrom(
                foregroundColor: Colors.white70,
                side: const BorderSide(color: Colors.white24),
              ),
              icon: const Icon(Icons.logout, size: 18),
              label: const Text('लॉगआउट'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _badge(String value) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: kPrimary,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(
        value,
        style: const TextStyle(
            color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold),
      ),
    );
  }
}