import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/staff_model.dart';
import '../models/user_model.dart';
import '../services/staff_service.dart';
import '../services/api_client.dart';
import '../widgets/common_widgets.dart';

class StaffManagementScreen extends StatefulWidget {
  final UserModel user;
  const StaffManagementScreen({super.key, required this.user});

  @override
  State<StaffManagementScreen> createState() => _StaffManagementScreenState();
}

class _StaffManagementScreenState extends State<StaffManagementScreen> {
  final _svc = StaffService();
  bool _loading = true;
  String? _error;
  List<StaffModel> _staff = [];
  List<ClassModel> _classes = [];
  final _searchCtrl = TextEditingController();
  bool get _isAdmin => widget.user.canManageStaff;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final staff = await _svc.getStaff(q: _searchCtrl.text.trim().isEmpty ? null : _searchCtrl.text.trim());
      _staff = staff;
      if (_isAdmin) {
        try {
          _classes = await _svc.getClasses();
        } catch (_) {}
      }
      if (mounted) setState(() => _loading = false);
    } on ApiException catch (e) {
      if (mounted) setState(() {
        _error = e.message;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() {
        _error = 'स्टाफ डेटा लोड नहीं हो सका';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: _isAdmin ? 2 : 1,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('स्टाफ प्रबंधन', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
          backgroundColor: const Color(0xFF6D28D9),
          foregroundColor: Colors.white,
          actions: [
            IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
          ],
          bottom: _isAdmin
              ? const TabBar(tabs: [
                  Tab(icon: Icon(Icons.badge), text: 'स्टाफ सूची'),
                  Tab(icon: Icon(Icons.supervisor_account), text: 'क्लास टीचर'),
                ])
              : null,
        ),
        floatingActionButton: _isAdmin
            ? FloatingActionButton.extended(
                onPressed: _addStaffDialog,
                icon: const Icon(Icons.person_add),
                label: const Text('स्टाफ जोड़ें'),
                backgroundColor: const Color(0xFF6D28D9),
              )
            : null,
        body: _loading
            ? const LoadingView()
            : _error != null
                ? ErrorRetryView(message: _error!, onRetry: _load)
                : _isAdmin
                    ? TabBarView(children: [_staffList(), _classTeacherTab()])
                    : _staffList(),
      ),
    );
  }

  Widget _staffList() {
    return ResponsiveCenter(
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: TextField(
              controller: _searchCtrl,
              decoration: InputDecoration(
                labelText: 'खोजें (नाम, विभाग)',
                prefixIcon: const Icon(Icons.search),
                border: const OutlineInputBorder(),
                isDense: true,
                suffixIcon: _searchCtrl.text.isNotEmpty
                    ? IconButton(icon: const Icon(Icons.clear), onPressed: () { _searchCtrl.clear(); _load(); })
                    : null,
              ),
              onSubmitted: (_) => _load(),
            ),
          ),
          Expanded(
            child: _staff.isEmpty
                ? const EmptyState(message: 'कोई स्टाफ सदस्य नहीं', icon: Icons.badge)
                : ListView.builder(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    itemCount: _staff.length,
                    itemBuilder: (c, i) => _staffCard(_staff[i]),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _staffCard(StaffModel s) {
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: const Color(0xFF6D28D9).withValues(alpha: 0.12),
          child: Text(s.name.isNotEmpty ? s.name[0].toUpperCase() : '?', style: const TextStyle(color: Color(0xFF6D28D9), fontWeight: FontWeight.bold)),
        ),
        title: Text(s.name, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (s.designation != null) Text(s.designation!, style: const TextStyle(fontSize: 11, color: Colors.grey)),
            if (s.subject != null) Text('विषय: ${s.subject}', style: const TextStyle(fontSize: 11, color: Colors.grey)),
            if (s.phone != null) Text(s.phone!, style: const TextStyle(fontSize: 11, color: Colors.grey)),
          ],
        ),
        trailing: _isAdmin && widget.user.role == UserRole.director
            ? IconButton(icon: const Icon(Icons.delete_outline, color: Colors.red), onPressed: () => _deleteStaff(s))
            : StatusChip(status: s.status),
        onTap: s.phone != null ? () => _launch('tel:${s.phone}') : null,
      ),
    );
  }

  Widget _classTeacherTab() {
    return ResponsiveCenter(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const SectionTitle('कक्षाध्यापक असाइनमेंट', icon: Icons.supervisor_account),
            const SizedBox(height: 12),
            ..._classes.map((c) => Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: ListTile(
                    leading: const CircleAvatar(child: Icon(Icons.class_outlined, size: 18)),
                    title: Text(c.className, style: const TextStyle(fontWeight: FontWeight.bold)),
                    subtitle: Text(c.classTeacherName ?? 'असाइन नहीं', style: const TextStyle(fontSize: 12, color: Colors.grey)),
                    trailing: IconButton(
                      icon: const Icon(Icons.edit, size: 18),
                      onPressed: () => _assignTeacherDialog(c),
                    ),
                  ),
                )),
          ],
        ),
      ),
    );
  }

  void _assignTeacherDialog(ClassModel cls) {
    final ctrl = TextEditingController();
    showDialog(
      context: context,
      builder: (c) => AlertDialog(
        title: Text('${cls.className} — शिक्षक असाइन करें'),
        content: TextField(
          controller: ctrl,
          decoration: const InputDecoration(labelText: 'शिक्षक User ID दर्ज करें', border: OutlineInputBorder(), isDense: true),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c), child: const Text('रद्द करें')),
          FilledButton(
            onPressed: () async {
              if (ctrl.text.trim().isEmpty) return;
              try {
                await _svc.assignTeacher(className: cls.className, teacherUserId: ctrl.text.trim());
                if (c.mounted) Navigator.pop(c);
                showSnack(context, 'शिक्षक असाइन हो गया');
                _load();
              } on ApiException catch (e) {
                if (c.mounted) showSnack(context, e.message, isError: true);
              }
            },
            child: const Text('असाइन करें'),
          ),
        ],
      ),
    );
  }

  void _addStaffDialog() {
    final name = TextEditingController();
    final phone = TextEditingController();
    final email = TextEditingController();
    final designation = TextEditingController();
    final department = TextEditingController();
    final subject = TextEditingController();
    final password = TextEditingController();
    showDialog(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('नया स्टाफ जोड़ें'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(controller: name, decoration: const InputDecoration(labelText: 'नाम *', border: OutlineInputBorder(), isDense: true)),
              const SizedBox(height: 8),
              TextField(controller: phone, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'फ़ोन *', border: OutlineInputBorder(), isDense: true)),
              const SizedBox(height: 8),
              TextField(controller: email, decoration: const InputDecoration(labelText: 'ईमेल *', border: OutlineInputBorder(), isDense: true)),
              const SizedBox(height: 8),
              TextField(controller: designation, decoration: const InputDecoration(labelText: 'पद', border: OutlineInputBorder(), isDense: true)),
              const SizedBox(height: 8),
              TextField(controller: department, decoration: const InputDecoration(labelText: 'विभाग', border: OutlineInputBorder(), isDense: true)),
              const SizedBox(height: 8),
              TextField(controller: subject, decoration: const InputDecoration(labelText: 'विषय', border: OutlineInputBorder(), isDense: true)),
              const SizedBox(height: 8),
              TextField(controller: password, obscureText: true, decoration: const InputDecoration(labelText: 'पासवर्ड (वैकल्पिक)', border: OutlineInputBorder(), isDense: true)),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c), child: const Text('रद्द करें')),
          FilledButton(
            onPressed: () async {
              if (name.text.isEmpty || phone.text.isEmpty || email.text.isEmpty) {
                showSnack(context, 'आवश्यक फ़ील्ड भरें', isError: true);
                return;
              }
              try {
                await _svc.addStaff({
                  'name': name.text.trim(),
                  'phone': phone.text.trim(),
                  'email': email.text.trim(),
                  if (designation.text.isNotEmpty) 'designation': designation.text.trim(),
                  if (department.text.isNotEmpty) 'department': department.text.trim(),
                  if (subject.text.isNotEmpty) 'subject': subject.text.trim(),
                  if (password.text.isNotEmpty) 'password': password.text.trim(),
                });
                if (c.mounted) Navigator.pop(c);
                showSnack(context, 'स्टाफ जोड़ा गया');
                _load();
              } on ApiException catch (e) {
                if (c.mounted) showSnack(context, e.message, isError: true);
              }
            },
            child: const Text('जोड़ें'),
          ),
        ],
      ),
    );
  }

  void _deleteStaff(StaffModel s) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text('${s.name} को हटाएं?'),
        content: const Text('यह स्टाफ को निष्क्रिय कर देगा और लॉगिन अक्षम कर देगा।'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('रद्द करें')),
          FilledButton(style: FilledButton.styleFrom(backgroundColor: Colors.red.shade700), onPressed: () => Navigator.pop(c, true), child: const Text('हटाएं')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await _svc.deleteStaff(s.id);
      showSnack(context, 'स्टाफ हटा दिया गया');
      _load();
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.message, isError: true);
    }
  }

  void _launch(String url) async {
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) await launchUrl(uri);
  }
}
