import 'package:flutter/material.dart';
import '../services/api_client.dart';
import 'super_admin_login_screen.dart';

class SuperAdminDashboardScreen extends StatefulWidget {
  final Map<String, dynamic> adminProfile;
  const SuperAdminDashboardScreen({super.key, required this.adminProfile});

  @override
  State<SuperAdminDashboardScreen> createState() => _SuperAdminDashboardScreenState();
}

class _SuperAdminDashboardScreenState extends State<SuperAdminDashboardScreen> {
  final _api = SuperAdminApiClient();
  bool _isLoading = true;
  List<dynamic> _tenants = [];

  @override
  void initState() {
    super.initState();
    _loadDashboard();
  }

  Future<void> _loadDashboard() async {
    setState(() => _isLoading = true);
    try {
      final tenantsRes = await _api.get('/api/admin/tenants');

      setState(() {
        if (tenantsRes['success'] == true) {
          _tenants = tenantsRes['tenants'] ?? [];
        }
        _isLoading = false;
      });
    } catch (_) {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _approveTenant(String tenantId, String schoolName) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('स्कूल पंजीकरण अनुमोदन'),
        content: Text('क्या आप "$schoolName" के पंजीकरण को स्वीकृत करके 7-दिन का फ्री ट्रायल सक्रिय करना चाहते हैं?'),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('रद्द करें')),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.green, foregroundColor: Colors.white),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('स्वीकृत करें (Approve)'),
          ),
        ],
      ),
    );

    if (confirm != true) return;

    try {
      final res = await _api.post('/api/admin/tenants/$tenantId/approve');
      if (res['success'] == true) {
        _loadDashboard();
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('"$schoolName" का ट्रायल सक्रिय हो गया है।'), backgroundColor: Colors.green),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('अनुमोदन त्रुटि: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final totalTenants = _tenants.length;
    final pendingCount = _tenants.where((t) => t['registration_status'] == 'Pending_Approval').length;

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Super Admin Console', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            Text(widget.adminProfile['fullName'] ?? 'प्लेटफॉर्म एडमिन', style: const TextStyle(fontSize: 11, color: Colors.white70)),
          ],
        ),
        backgroundColor: const Color(0xFF881337), // Rose-900
        foregroundColor: Colors.white,
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _loadDashboard),
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () async {
              await _api.clearAuth();
              if (context.mounted) {
                Navigator.of(context).pushReplacement(
                  MaterialPageRoute(builder: (_) => const SuperAdminLoginScreen()),
                );
              }
            },
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _loadDashboard,
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Overview Stats
                    Row(
                      children: [
                        Expanded(
                          child: _buildMetricCard('कुल स्कूल', '$totalTenants', 'पंजीकृत टेनेंट्स', Colors.blue),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: _buildMetricCard('लंबित अनुमोदन', '$pendingCount', 'कार्रवाई आवश्यक', const Color(0xFFE11D48)),
                        ),
                      ],
                    ),
                    const SizedBox(height: 20),

                    // Registered Schools List Header
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('स्कूल टेनेंट्स व पंजीकरण अनुरोध', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                        Text('कुल: $totalTenants', style: const TextStyle(fontSize: 12, color: Colors.grey)),
                      ],
                    ),
                    const SizedBox(height: 10),

                    if (_tenants.isEmpty)
                      Container(
                        padding: const EdgeInsets.all(24),
                        decoration: BoxDecoration(
                          color: Colors.grey.shade50,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: Colors.grey.shade200),
                        ),
                        child: const Center(child: Text('कोई पंजीकृत स्कूल नहीं मिला।', style: TextStyle(color: Colors.grey))),
                      )
                    else
                      ListView.separated(
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        itemCount: _tenants.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 10),
                        itemBuilder: (context, index) {
                          final t = _tenants[index];
                          final isPending = t['registration_status'] == 'Pending_Approval';
                          final status = t['status'] ?? 'Active';

                          return Container(
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(16),
                              border: Border.all(color: isPending ? Colors.amber.shade300 : Colors.grey.shade200),
                              boxShadow: const [
                                BoxShadow(color: Color(0x05000000), blurRadius: 4),
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
                                        t['school_name'] ?? 'अज्ञात स्कूल',
                                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                                      ),
                                    ),
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                      decoration: BoxDecoration(
                                        color: isPending ? Colors.amber.shade100 : Colors.green.shade100,
                                        borderRadius: BorderRadius.circular(8),
                                      ),
                                      child: Text(
                                        isPending ? 'लंबित अनुमोदन' : status,
                                        style: TextStyle(
                                          fontSize: 10,
                                          fontWeight: FontWeight.bold,
                                          color: isPending ? Colors.amber.shade900 : Colors.green.shade900,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  'ईमेल: ${t['contact_email'] ?? "—"} • फोन: ${t['contact_phone'] ?? "—"}',
                                  style: const TextStyle(fontSize: 12, color: Colors.black54),
                                ),
                                Text(
                                  'सबडोमेन: ${t['subdomain'] ?? "—"} • प्लान: ${t['plan_id'] ?? "Trial"}',
                                  style: const TextStyle(fontSize: 11, color: Colors.grey),
                                ),

                                if (isPending) ...[
                                  const SizedBox(height: 12),
                                  ElevatedButton.icon(
                                    onPressed: () => _approveTenant(t['id'], t['school_name'] ?? 'स्कूल'),
                                    icon: const Icon(Icons.check, size: 16),
                                    label: const Text('स्कूल अनुमोदन करें और 7-दिन ट्रायल शुरू करें', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: const Color(0xFF047857),
                                      foregroundColor: Colors.white,
                                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                                      padding: const EdgeInsets.symmetric(vertical: 8),
                                    ),
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

  Widget _buildMetricCard(String title, String value, String sub, Color color) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withAlpha(50)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(fontSize: 11, color: Colors.grey)),
          const SizedBox(height: 4),
          Text(value, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: color)),
          const SizedBox(height: 2),
          Text(sub, style: const TextStyle(fontSize: 10, color: Colors.black45)),
        ],
      ),
    );
  }
}
