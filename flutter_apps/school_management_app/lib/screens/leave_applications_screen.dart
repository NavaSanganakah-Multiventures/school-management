import 'package:flutter/material.dart';
import '../models/leave_model.dart';
import '../models/user_model.dart';
import '../services/leave_service.dart';
import '../services/api_client.dart';
import '../widgets/common_widgets.dart';

class LeaveApplicationsScreen extends StatefulWidget {
  final UserModel user;
  const LeaveApplicationsScreen({super.key, required this.user});

  @override
  State<LeaveApplicationsScreen> createState() => _LeaveApplicationsScreenState();
}

class _LeaveApplicationsScreenState extends State<LeaveApplicationsScreen> {
  final _svc = LeaveService();
  bool _loading = true;
  String? _error;
  List<LeaveApplicationModel> _apps = [];
  bool get _isAdmin => widget.user.role == UserRole.director || widget.user.role == UserRole.principal || widget.user.role == UserRole.staff;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      _apps = await _svc.getApplications();
      if (mounted) setState(() => _loading = false);
    } on ApiException catch (e) {
      if (mounted) setState(() {
        _error = e.message;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() {
        _error = 'अवकाश आवेदन लोड नहीं हो सके';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('अवकाश आवेदन', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
        backgroundColor: const Color(0xFF0F766E),
        foregroundColor: Colors.white,
        actions: [
          if (!_isAdmin)
            IconButton(icon: const Icon(Icons.add_circle), tooltip: 'नया आवेदन', onPressed: _applyDialog),
          IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
        ],
      ),
      body: _loading
          ? const LoadingView()
          : _error != null
              ? ErrorRetryView(message: _error!, onRetry: _load)
              : _apps.isEmpty
                  ? const EmptyState(message: 'कोई अवकाश आवेदन नहीं', icon: Icons.event_busy)
                  : ResponsiveCenter(
                      child: ListView.builder(
                        padding: const EdgeInsets.all(12),
                        itemCount: _apps.length,
                        itemBuilder: (c, i) => _appCard(_apps[i]),
                      ),
                    ),
      floatingActionButton: !_isAdmin
          ? FloatingActionButton.extended(
              onPressed: _applyDialog,
              icon: const Icon(Icons.add),
              label: const Text('अवकाश के लिए आवेदन'),
              backgroundColor: const Color(0xFF0F766E),
            )
          : null,
    );
  }

  Widget _appCard(LeaveApplicationModel a) {
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.event, size: 18, color: Color(0xFF0F766E)),
                const SizedBox(width: 6),
                Expanded(
                  child: Text((a.studentName ?? '').isEmpty ? 'अवकाश आवेदन' : (a.studentName ?? ''),
                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                ),
                StatusChip(status: a.status, color: a.statusColor),
              ],
            ),
            if (a.className != null) ...[
              const SizedBox(height: 4),
              Text(a.className!, style: const TextStyle(fontSize: 11, color: Colors.grey)),
            ],
            const SizedBox(height: 6),
            Text('${a.startDate} → ${a.endDate}', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
            const SizedBox(height: 4),
            Text(a.reason, style: const TextStyle(fontSize: 12, color: Colors.grey)),
            if (_isAdmin && a.status.toLowerCase() == 'pending') ...[
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => _updateStatus(a, 'Rejected'),
                      icon: const Icon(Icons.close, size: 16, color: Colors.red),
                      label: const Text('अस्वीकार', style: TextStyle(fontSize: 12, color: Colors.red)),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: FilledButton.icon(
                      onPressed: () => _updateStatus(a, 'Approved'),
                      icon: const Icon(Icons.check, size: 16),
                      label: const Text('स्वीकार', style: TextStyle(fontSize: 12)),
                      style: FilledButton.styleFrom(backgroundColor: Colors.green.shade700),
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  void _updateStatus(LeaveApplicationModel a, String status) async {
    try {
      await _svc.updateStatus(a.id, status);
      showSnack(context, 'स्थिति अपडेट हो गई');
      _load();
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.message, isError: true);
    }
  }

  void _applyDialog() {
    final studentId = TextEditingController();
    final start = TextEditingController(text: DateTime.now().toIso8601String().substring(0, 10));
    final end = TextEditingController(text: DateTime.now().toIso8601String().substring(0, 10));
    final reason = TextEditingController();
    showDialog(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('अवकाश आवेदन'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(controller: studentId, decoration: const InputDecoration(labelText: 'छात्र ID *', border: OutlineInputBorder(), isDense: true)),
              const SizedBox(height: 10),
              TextField(controller: start, decoration: const InputDecoration(labelText: 'प्रारंभ तिथि (YYYY-MM-DD) *', border: OutlineInputBorder(), isDense: true)),
              const SizedBox(height: 10),
              TextField(controller: end, decoration: const InputDecoration(labelText: 'समाप्ति तिथि (YYYY-MM-DD) *', border: OutlineInputBorder(), isDense: true)),
              const SizedBox(height: 10),
              TextField(controller: reason, maxLines: 2, decoration: const InputDecoration(labelText: 'कारण *', border: OutlineInputBorder(), isDense: true)),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c), child: const Text('रद्द करें')),
          FilledButton(
            onPressed: () async {
              if (studentId.text.isEmpty || reason.text.isEmpty) {
                showSnack(context, 'आवश्यक फ़ील्ड भरें', isError: true);
                return;
              }
              try {
                await _svc.applyLeave(
                  studentId: studentId.text.trim(),
                  startDate: start.text.trim(),
                  endDate: end.text.trim(),
                  reason: reason.text.trim(),
                );
                if (c.mounted) Navigator.pop(c);
                showSnack(context, 'आवेदन जमा हो गया');
                _load();
              } on ApiException catch (e) {
                if (c.mounted) showSnack(context, e.message, isError: true);
              }
            },
            child: const Text('जमा करें'),
          ),
        ],
      ),
    );
  }
}
