import 'package:flutter/material.dart';
import '../models/notice_model.dart';
import '../models/user_model.dart';
import '../services/notification_service.dart';
import '../services/api_client.dart';
import '../widgets/common_widgets.dart';

class NotificationsScreen extends StatefulWidget {
  final UserModel user;
  const NotificationsScreen({super.key, required this.user});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  final _svc = NotificationService();
  bool _loading = true;
  String? _error;
  List<NotificationHistoryModel> _history = [];
  bool get _isAdmin => widget.user.isAdminRole;

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
      _history = await _svc.getHistory();
      if (mounted) setState(() => _loading = false);
    } on ApiException catch (e) {
      if (mounted) setState(() {
        _error = e.message;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() {
        _error = 'सूचनाएं लोड नहीं हो सकीं';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('सूचना केंद्र', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
        backgroundColor: const Color(0xFFB45309),
        foregroundColor: Colors.white,
        actions: [
          if (_isAdmin) IconButton(icon: const Icon(Icons.campaign), tooltip: 'प्रसारण', onPressed: _broadcastDialog),
          IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
        ],
      ),
      body: _loading
          ? const LoadingView()
          : _error != null
              ? ErrorRetryView(message: _error!, onRetry: _load)
              : _history.isEmpty
                  ? const EmptyState(message: 'कोई सूचना इतिहास नहीं', icon: Icons.notifications_none)
                  : ResponsiveCenter(
                      child: ListView.builder(
                        padding: const EdgeInsets.all(12),
                        itemCount: _history.length,
                        itemBuilder: (c, i) => _notifCard(_history[i]),
                      ),
                    ),
      floatingActionButton: _isAdmin
          ? FloatingActionButton.extended(
              onPressed: _broadcastDialog,
              icon: const Icon(Icons.campaign),
              label: const Text('प्रसारण भेजें'),
              backgroundColor: const Color(0xFFB45309),
            )
          : null,
    );
  }

  Widget _notifCard(NotificationHistoryModel n) {
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: const Color(0xFFB45309).withValues(alpha: 0.12),
          child: const Icon(Icons.notifications, color: Color(0xFFB45309), size: 20),
        ),
        title: Text(n.title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(n.body, style: const TextStyle(fontSize: 12)),
            const SizedBox(height: 2),
            Text(n.sentAt ?? '', style: const TextStyle(fontSize: 10, color: Colors.grey)),
          ],
        ),
        isThreeLine: true,
      ),
    );
  }

  void _broadcastDialog() {
    final title = TextEditingController();
    final body = TextEditingController();
    String? targetRole;
    showDialog(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('प्रसारण भेजें'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(controller: title, decoration: const InputDecoration(labelText: 'शीर्षक *', border: OutlineInputBorder(), isDense: true)),
              const SizedBox(height: 10),
              TextField(controller: body, maxLines: 3, decoration: const InputDecoration(labelText: 'संदेश *', border: OutlineInputBorder(), isDense: true)),
              const SizedBox(height: 10),
              DropdownButtonFormField<String>(
                value: targetRole,
                decoration: const InputDecoration(labelText: 'लक्षित श्रोता', border: OutlineInputBorder(), isDense: true),
                items: const [
                  DropdownMenuItem(value: null, child: Text('सभी')),
                  DropdownMenuItem(value: 'Parents', child: Text('अभिभावक')),
                  DropdownMenuItem(value: 'Students', child: Text('विद्यार्थी')),
                  DropdownMenuItem(value: 'Teachers', child: Text('शिक्षक')),
                ],
                onChanged: (v) => targetRole = v,
              ),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c), child: const Text('रद्द करें')),
          FilledButton(
            onPressed: () async {
              if (title.text.isEmpty || body.text.isEmpty) {
                showSnack(context, 'शीर्षक व संदेश भरें', isError: true);
                return;
              }
              try {
                await _svc.broadcast(title: title.text.trim(), body: body.text.trim(), targetRole: targetRole);
                if (c.mounted) Navigator.pop(c);
                showSnack(context, 'प्रसारण भेजा गया');
                _load();
              } on ApiException catch (e) {
                if (c.mounted) showSnack(context, e.message, isError: true);
              }
            },
            child: const Text('भेजें'),
          ),
        ],
      ),
    );
  }
}
