import 'package:flutter/material.dart';
import '../models/school_model.dart';
import '../services/api_client.dart';
import '../services/school_service.dart';
import 'super_admin_login_screen.dart';

class SuperAdminDashboardScreen extends StatefulWidget {
  final Map<String, dynamic> adminProfile;
  const SuperAdminDashboardScreen({super.key, required this.adminProfile});

  @override
  State<SuperAdminDashboardScreen> createState() => _SuperAdminDashboardScreenState();
}

class _SuperAdminDashboardScreenState extends State<SuperAdminDashboardScreen> {
  final _api = SuperAdminApiClient();
  final _service = SchoolService();

  bool _isLoading = true;
  bool _isSubmitting = false;
  String? _error;
  List<SchoolModel> _tenants = [];
  List<PlanModel> _plans = [const PlanModel(id: 'trial', name: '7-दिन फ्री ट्रायल', isTrial: true)];

  String _search = '';
  String _statusFilter = 'all'; // all | Pending_Approval | Trial | Active | Suspended

  List<SchoolModel> get _filtered {
    return _tenants.where((t) {
      final q = _search.trim().toLowerCase();
      final matchesSearch = q.isEmpty ||
          t.schoolName.toLowerCase().contains(q) ||
          t.contactEmail.toLowerCase().contains(q) ||
          t.contactPhone.contains(q) ||
          t.subdomain.toLowerCase().contains(q);
      final matchesStatus = _statusFilter == 'all' ||
          (_statusFilter == 'Pending_Approval' ? t.isPending : t.status == _statusFilter);
      return matchesSearch && matchesStatus;
    }).toList();
  }

  @override
  void initState() {
    super.initState();
    _loadDashboard();
  }

  Future<void> _loadDashboard() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });
    try {
      final results = await Future.wait([
        _service.fetchSchools(),
        _service.fetchPlans(),
      ]);
      setState(() {
        _tenants = results[0] as List<SchoolModel>;
        final plans = results[1] as List<PlanModel>;
        if (plans.isNotEmpty) _plans = plans;
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _isLoading = false;
      });
    }
  }

  void _snack(String msg, {bool ok = true}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), backgroundColor: ok ? Colors.green : Colors.red),
    );
  }

  // ---------------- Approve / Reject / Delete / Plan ----------------

  Future<void> _approveTenant(SchoolModel t) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('स्कूल पंजीकरण अनुमोदन'),
        content: Text('क्या आप "${t.schoolName}" के पंजीकरण को स्वीकृत करके 7-दिन का फ्री ट्रायल सक्रिय करना चाहते हैं?'),
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
      final res = await _service.approveSchool(t.id);
      if (res['success'] == true) {
        _snack('"${t.schoolName}" का ट्रायल सक्रिय हो गया है।');
        _loadDashboard();
      } else {
        _snack((res['message'] ?? 'अनुमोदन विफल।').toString(), ok: false);
      }
    } catch (e) {
      _snack('अनुमोदन त्रुटि: $e', ok: false);
    }
  }

  Future<void> _rejectTenant(SchoolModel t) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('पंजीकरण अस्वीकार करें?'),
        content: Text('"${t.schoolName}" का पंजीकरण अनुरोध reject कर दिया जाएगा।'),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('रद्द करें')),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red, foregroundColor: Colors.white),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Reject करें'),
          ),
        ],
      ),
    );
    if (confirm != true) return;
    try {
      final res = await _service.rejectSchool(t.id);
      if (res['success'] == true) {
        _snack('पंजीकरण अस्वीकृत कर दिया गया।');
        _loadDashboard();
      } else {
        _snack((res['message'] ?? 'अस्वीकृति विफल।').toString(), ok: false);
      }
    } catch (e) {
      _snack('त्रुटि: $e', ok: false);
    }
  }

  Future<void> _deleteTenant(SchoolModel t) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('स्कूल हटाएं (Soft Delete)?'),
        content: Text('"${t.schoolName}" को निष्क्रिय कर दिया जाएगा। डेटा सुरक्षित रहेगा, बाद में restore किया जा सकता है।'),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('रद्द करें')),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red, foregroundColor: Colors.white),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('हटाएं'),
          ),
        ],
      ),
    );
    if (confirm != true) return;
    try {
      final res = await _service.deleteSchool(t.id);
      if (res['success'] == true) {
        _snack('स्कूल हटा दिया गया।');
        _loadDashboard();
      } else {
        _snack((res['message'] ?? 'हटाने में त्रुटि।').toString(), ok: false);
      }
    } catch (e) {
      _snack('त्रुटि: $e', ok: false);
    }
  }

  Future<void> _changePlan(SchoolModel t) async {
    String selected = t.planId.isEmpty ? 'trial' : t.planId;
    final confirm = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('"${t.schoolName}" का प्लान बदलें'),
        content: DropdownButtonFormField<String>(
          initialValue: _plans.any((p) => p.id == selected) ? selected : _plans.first.id,
          items: _plans.map((p) => DropdownMenuItem(value: p.id, child: Text(p.name))).toList(),
          onChanged: (v) => selected = v ?? selected,
          decoration: const InputDecoration(border: OutlineInputBorder(), labelText: 'Plan चुनें'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('रद्द करें')),
          ElevatedButton(onPressed: () => Navigator.of(ctx).pop(selected), child: const Text('सेव करें')),
        ],
      ),
    );
    if (confirm == null || confirm.isEmpty) return;
    try {
      final res = await _service.changePlan(t.id, confirm);
      if (res['success'] == true) {
        _snack((res['message'] ?? 'प्लान बदल दिया गया।').toString());
        _loadDashboard();
      } else {
        _snack((res['message'] ?? 'प्लान बदलने में त्रुटि।').toString(), ok: false);
      }
    } catch (e) {
      _snack('त्रुटि: $e', ok: false);
    }
  }

  // ---------------- Add School (POST /api/admin/schools/create) ----------------

  Future<void> _openAddSchoolSheet() async {
    final formKey = GlobalKey<FormState>();
    final schoolName = TextEditingController();
    final directorName = TextEditingController();
    final email = TextEditingController();
    final phone = TextEditingController();
    final password = TextEditingController();
    final subdomain = TextEditingController();
    String planId = _plans.any((p) => p.id == 'trial') ? 'trial' : _plans.first.id;
    String billingCycle = 'monthly';
    DateTime trialDate = DateTime.now().add(const Duration(days: 7));
    bool obscure = true;

    final created = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheet) => Padding(
          padding: EdgeInsets.only(
            left: 20, right: 20, top: 20,
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 20,
          ),
          child: SingleChildScrollView(
            child: Form(
              key: formKey,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('नया स्कूल जोड़ें', style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold)),
                      IconButton(onPressed: () => Navigator.of(ctx).pop(false), icon: const Icon(Icons.close)),
                    ],
                  ),
                  const Text(
                    'API: POST /api/admin/schools/create — Director login अपने-आप बन जाएगा।',
                    style: TextStyle(fontSize: 11, color: Colors.grey),
                  ),
                  const SizedBox(height: 14),
                  TextFormField(
                    controller: schoolName,
                    decoration: _dec('स्कूल का नाम *', 'e.g. Pragnya Public School'),
                    validator: (v) => (v == null || v.trim().isEmpty) ? 'स्कूल का नाम आवश्यक है' : null,
                  ),
                  const SizedBox(height: 10),
                  TextFormField(
                    controller: directorName,
                    decoration: _dec('डायरेक्टर का नाम *', 'e.g. Ramesh Kumar'),
                    validator: (v) => (v == null || v.trim().isEmpty) ? 'डायरेक्टर नाम आवश्यक है' : null,
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Expanded(
                        child: TextFormField(
                          controller: email,
                          keyboardType: TextInputType.emailAddress,
                          decoration: _dec('ईमेल *', 'school@example.com'),
                          validator: (v) {
                            final s = (v ?? '').trim();
                            if (s.isEmpty) return 'ईमेल आवश्यक है';
                            if (!RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(s)) return 'मान्य ईमेल लिखें';
                            return null;
                          },
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: TextFormField(
                          controller: phone,
                          keyboardType: TextInputType.phone,
                          maxLength: 10,
                          decoration: _dec('फोन *', '10-digit mobile'),
                          validator: (v) {
                            final s = (v ?? '').trim();
                            if (s.isEmpty) return 'फोन आवश्यक है';
                            if (!RegExp(r'^[0-9]{10}$').hasMatch(s)) return '10 अंक का मोबाइल नंबर';
                            return null;
                          },
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Expanded(
                        child: TextFormField(
                          controller: password,
                          obscureText: obscure,
                          decoration: _dec('Director पासवर्ड *', 'min 6 chars').copyWith(
                            suffixIcon: IconButton(
                              icon: Icon(obscure ? Icons.visibility_off : Icons.visibility, size: 18),
                              onPressed: () => setSheet(() => obscure = !obscure),
                            ),
                          ),
                          validator: (v) => (v == null || v.trim().length < 6) ? 'कम से कम 6 अक्षर' : null,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: TextFormField(
                          controller: subdomain,
                          decoration: _dec('Subdomain (optional)', 'e.g. mypublicschool'),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Expanded(
                        child: DropdownButtonFormField<String>(
                          initialValue: planId,
                          decoration: _dec('Plan', null),
                          items: _plans.map((p) => DropdownMenuItem(value: p.id, child: Text(p.name, style: const TextStyle(fontSize: 12)))).toList(),
                          onChanged: (v) => setSheet(() => planId = v ?? planId),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: DropdownButtonFormField<String>(
                          initialValue: billingCycle,
                          decoration: _dec('Billing Cycle', null),
                          items: const [
                            DropdownMenuItem(value: 'monthly', child: Text('Monthly')),
                            DropdownMenuItem(value: 'quarterly', child: Text('Quarterly')),
                            DropdownMenuItem(value: 'annual', child: Text('Annual')),
                          ],
                          onChanged: (v) => setSheet(() => billingCycle = v ?? billingCycle),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  InkWell(
                    onTap: () async {
                      final picked = await showDatePicker(
                        context: ctx,
                        initialDate: trialDate,
                        firstDate: DateTime.now(),
                        lastDate: DateTime.now().add(const Duration(days: 365 * 3)),
                      );
                      if (picked != null) setSheet(() => trialDate = picked);
                    },
                    child: InputDecorator(
                      decoration: _dec('Trial समाप्ति तिथि (YYYY-MM-DD)', null),
                      child: Text(
                        trialDate.toIso8601String().split('T')[0],
                        style: const TextStyle(fontSize: 13),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: _isSubmitting
                        ? null
                        : () async {
                            if (!formKey.currentState!.validate()) return;
                            setSheet(() {});
                            Navigator.of(ctx).pop(true);
                          },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF881337),
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    child: const Text('स्कूल बनाएं + Director Login', style: TextStyle(fontWeight: FontWeight.bold)),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );

    if (created != true) return;

    setState(() => _isSubmitting = true);
    try {
      final res = await _service.createSchool(
        schoolName: schoolName.text,
        directorName: directorName.text,
        email: email.text,
        phone: phone.text,
        password: password.text,
        subdomain: subdomain.text,
        planId: planId,
        trialEndsAt: trialDate.toIso8601String().split('T')[0],
        billingCycle: billingCycle,
      );
      if (res['success'] == true) {
        _snack('विद्यालय सफलतापूर्वक जोड़ा गया। Director login तैयार है।');
        _loadDashboard();
      } else {
        _snack((res['message'] ?? 'स्कूल बनाने में त्रुटि।').toString(), ok: false);
      }
    } catch (e) {
      _snack('स्कूल बनाने में त्रुटि: ${e.toString().replaceFirst('Exception: ', '')}', ok: false);
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  InputDecoration _dec(String label, String? hint) {
    return InputDecoration(
      labelText: label,
      hintText: hint,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
      filled: true,
      fillColor: const Color(0xFFF8FAFC),
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
    );
  }

  // ---------------- UI ----------------

  @override
  Widget build(BuildContext context) {
    final totalTenants = _tenants.length;
    final pendingCount = _tenants.where((t) => t.isPending).length;
    final list = _filtered;

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Super Admin Console', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            Text(widget.adminProfile['fullName'] ?? 'प्लेटफॉर्म एडमिन', style: const TextStyle(fontSize: 11, color: Colors.white70)),
          ],
        ),
        backgroundColor: const Color(0xFF881337),
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
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _isSubmitting ? null : _openAddSchoolSheet,
        backgroundColor: const Color(0xFF881337),
        foregroundColor: Colors.white,
        icon: _isSubmitting
            ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
            : const Icon(Icons.add_business),
        label: const Text('स्कूल जोड़ें', style: TextStyle(fontWeight: FontWeight.bold)),
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
                    if (_error != null)
                      Container(
                        margin: const EdgeInsets.only(bottom: 12),
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(color: const Color(0xFFFFF1F2), borderRadius: BorderRadius.circular(12)),
                        child: Text(_error!, style: const TextStyle(color: Color(0xFFBE123C), fontSize: 12)),
                      ),
                    Row(
                      children: [
                        Expanded(child: _buildMetricCard('कुल स्कूल', '$totalTenants', 'पंजीकृत टेनेंट्स', Colors.blue)),
                        const SizedBox(width: 10),
                        Expanded(child: _buildMetricCard('लंबित अनुमोदन', '$pendingCount', 'कार्रवाई आवश्यक', const Color(0xFFE11D48))),
                      ],
                    ),
                    const SizedBox(height: 14),
                    TextField(
                      decoration: InputDecoration(
                        hintText: 'स्कूल / ईमेल / फोन / subdomain खोजें…',
                        prefixIcon: const Icon(Icons.search, size: 20),
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                        filled: true,
                        fillColor: Colors.white,
                        contentPadding: const EdgeInsets.symmetric(vertical: 0, horizontal: 12),
                      ),
                      onChanged: (v) => setState(() => _search = v),
                    ),
                    const SizedBox(height: 10),
                    SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: Row(
                        children: [
                          _filterChip('all', 'सभी ($totalTenants)'),
                          _filterChip('Pending_Approval', 'लंबित ($pendingCount)'),
                          _filterChip('Trial', 'ट्रायल'),
                          _filterChip('Active', 'सक्रिय'),
                          _filterChip('Suspended', 'निलंबित'),
                        ],
                      ),
                    ),
                    const SizedBox(height: 14),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('स्कूल टेनेंट्स व पंजीकरण अनुरोध', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                        Text('कुल: ${list.length}', style: const TextStyle(fontSize: 12, color: Colors.grey)),
                      ],
                    ),
                    const SizedBox(height: 10),
                    if (list.isEmpty)
                      Container(
                        padding: const EdgeInsets.all(24),
                        decoration: BoxDecoration(
                          color: Colors.grey.shade50,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: Colors.grey.shade200),
                        ),
                        child: const Center(child: Text('कोई स्कूल नहीं मिला। + "स्कूल जोड़ें" से नया बनाएं।', style: TextStyle(color: Colors.grey))),
                      )
                    else
                      ListView.separated(
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        itemCount: list.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 10),
                        itemBuilder: (context, index) => _schoolCard(list[index]),
                      ),
                    const SizedBox(height: 80),
                  ],
                ),
              ),
            ),
    );
  }

  Widget _filterChip(String value, String label) {
    final selected = _statusFilter == value;
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: ChoiceChip(
        label: Text(label, style: const TextStyle(fontSize: 11)),
        selected: selected,
        onSelected: (_) => setState(() => _statusFilter = value),
      ),
    );
  }

  Widget _schoolCard(SchoolModel t) {
    final isPending = t.isPending;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: isPending ? Colors.amber.shade300 : Colors.grey.shade200),
        boxShadow: const [BoxShadow(color: Color(0x05000000), blurRadius: 4)],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(child: Text(t.schoolName, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14))),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: isPending ? Colors.amber.shade100 : Colors.green.shade100,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  isPending ? 'लंबित अनुमोदन' : t.status,
                  style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: isPending ? Colors.amber.shade900 : Colors.green.shade900),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text('ईमेल: ${t.contactEmail} • फोन: ${t.contactPhone}', style: const TextStyle(fontSize: 12, color: Colors.black54)),
          Text('सबडोमेन: ${t.subdomain} • प्लान: ${t.planName.isEmpty ? t.planId : t.planName}', style: const TextStyle(fontSize: 11, color: Colors.grey)),
          if (t.trialEndsAt.isNotEmpty) Text('समाप्ति: ${t.trialEndsAt}', style: const TextStyle(fontSize: 11, color: Colors.grey)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              if (isPending) ...[
                ElevatedButton.icon(
                  onPressed: () => _approveTenant(t),
                  icon: const Icon(Icons.check, size: 16),
                  label: const Text('Approve + Trial', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
                  style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF047857), foregroundColor: Colors.white),
                ),
                OutlinedButton.icon(
                  onPressed: () => _rejectTenant(t),
                  icon: const Icon(Icons.close, size: 16),
                  label: const Text('Reject', style: TextStyle(fontSize: 11)),
                  style: OutlinedButton.styleFrom(foregroundColor: Colors.red),
                ),
              ],
              OutlinedButton.icon(
                onPressed: () => _changePlan(t),
                icon: const Icon(Icons.swap_horiz, size: 16),
                label: const Text('Plan', style: TextStyle(fontSize: 11)),
              ),
              OutlinedButton.icon(
                onPressed: () => _deleteTenant(t),
                icon: const Icon(Icons.delete_outline, size: 16),
                label: const Text('हटाएं', style: TextStyle(fontSize: 11)),
                style: OutlinedButton.styleFrom(foregroundColor: Colors.red),
              ),
            ],
          ),
        ],
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
