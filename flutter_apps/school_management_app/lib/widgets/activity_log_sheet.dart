import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../models/user_model.dart';
import '../services/api_client.dart';

class ActivityLogSheet extends StatefulWidget {
  final UserModel user;

  const ActivityLogSheet({super.key, required this.user});

  static void show(BuildContext context, {required UserModel user}) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => ActivityLogSheet(user: user),
    );
  }

  @override
  State<ActivityLogSheet> createState() => _ActivityLogSheetState();
}

class _ActivityLogSheetState extends State<ActivityLogSheet> {
  final ApiClient _api = ApiClient();
  bool _isLoading = true;
  List<dynamic> _logs = [];
  String? _error;

  @override
  void initState() {
    super.initState();
    _fetchLogs();
  }

  Future<void> _fetchLogs() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final res = await _api.get('/api/activity-logs', queryParams: {'limit': '50'});
      if (res['success'] == true) {
        setState(() {
          _logs = res['logs'] ?? [];
          _isLoading = false;
        });
      } else {
        setState(() {
          _error = res['error'] ?? 'लॉग लोड करने में विफल';
          _isLoading = false;
        });
      }
    } catch (e) {
      setState(() {
        _error = 'नेटवर्क त्रुटि: $e';
        _isLoading = false;
      });
    }
  }

  Color _getActionColor(String? actionType) {
    switch (actionType) {
      case 'STUDENT_ADD':
        return const Color(0xFF059669);
      case 'STUDENT_READMIT':
        return Colors.blue;
      case 'TC_ISSUE':
        return Colors.orange;
      case 'ATTENDANCE_MARK':
        return Colors.teal;
      case 'MARKS_ENTRY':
        return Colors.purple;
      case 'NOTICE_PUBLISH':
        return Colors.indigo;
      case 'CLASS_TEACHER_ASSIGN':
        return Colors.cyan;
      default:
        return Colors.blueGrey;
    }
  }

  IconData _getActionIcon(String? actionType) {
    switch (actionType) {
      case 'STUDENT_ADD':
        return Icons.person_add;
      case 'STUDENT_READMIT':
        return Icons.replay_circle_filled;
      case 'TC_ISSUE':
        return Icons.card_membership;
      case 'ATTENDANCE_MARK':
        return Icons.checklist;
      case 'MARKS_ENTRY':
        return Icons.assignment;
      case 'NOTICE_PUBLISH':
        return Icons.campaign;
      case 'CLASS_TEACHER_ASSIGN':
        return Icons.school;
      default:
        return Icons.history;
    }
  }

  String _formatTimestamp(String? iso) {
    if (iso == null || iso.isEmpty) return '—';
    try {
      final dt = DateTime.parse(iso).toLocal();
      return DateFormat('dd MMM yyyy, hh:mm a').format(dt);
    } catch (_) {
      return iso;
    }
  }

  @override
  Widget build(BuildContext context) {
    final isTeacher = widget.user.role == UserRole.staff;
    final title = isTeacher ? 'मेरी गतिविधि डायरी (My Activity Log)' : 'विद्यालय कार्यकलाप ऑडिट (School Audit Trail)';

    return Container(
      height: MediaQuery.of(context).size.height * 0.85,
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: Column(
        children: [
          // Header handle
          Container(
            margin: const EdgeInsets.only(top: 12),
            width: 44,
            height: 4,
            decoration: BoxDecoration(
              color: Colors.grey.shade300,
              borderRadius: BorderRadius.circular(2),
            ),
          ),

          // Title & Refresh
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 12, 16, 8),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF0F172A),
                        ),
                      ),
                      Text(
                        isTeacher
                            ? 'कक्षा व आपके द्वारा किए गए सभी कार्यों का प्रमाणिक रिकॉर्ड'
                            : 'सभी शिक्षकों एवं स्टाफ द्वारा किए गए वास्तविक कार्यों का विवरण',
                        style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.refresh, color: Colors.indigo),
                  tooltip: 'ताज़ा करें',
                  onPressed: _fetchLogs,
                ),
              ],
            ),
          ),
          const Divider(height: 1),

          // Content
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : _error != null
                    ? Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(_error!, style: const TextStyle(color: Colors.red)),
                            const SizedBox(height: 12),
                            ElevatedButton(
                              onPressed: _fetchLogs,
                              child: const Text('पुनः प्रयास करें'),
                            ),
                          ],
                        ),
                      )
                    : _logs.isEmpty
                        ? const Center(
                            child: Text(
                              'कोई हालिया गतिविधि नहीं मिली।',
                              style: TextStyle(color: Colors.grey),
                            ),
                          )
                        : RefreshIndicator(
                            onRefresh: _fetchLogs,
                            child: ListView.separated(
                              padding: const EdgeInsets.all(16),
                              itemCount: _logs.length,
                              separatorBuilder: (_, __) => const SizedBox(height: 10),
                              itemBuilder: (context, index) {
                                final item = _logs[index];
                                final actionType = item['action_type']?.toString();
                                final color = _getActionColor(actionType);
                                final icon = _getActionIcon(actionType);

                                return Container(
                                  padding: const EdgeInsets.all(12),
                                  decoration: BoxDecoration(
                                    color: Colors.white,
                                    borderRadius: BorderRadius.circular(14),
                                    border: Border.all(color: Colors.grey.shade200),
                                    boxShadow: [
                                      BoxShadow(
                                        color: Colors.black.withValues(alpha: 0.03),
                                        blurRadius: 4,
                                        offset: const Offset(0, 2),
                                      ),
                                    ],
                                  ),
                                  child: Row(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      CircleAvatar(
                                        radius: 18,
                                        backgroundColor: color.withValues(alpha: 0.12),
                                        child: Icon(icon, color: color, size: 20),
                                      ),
                                      const SizedBox(width: 12),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Row(
                                              children: [
                                                Expanded(
                                                  child: Text(
                                                    item['action_title'] ?? 'कार्य विवरण',
                                                    style: const TextStyle(
                                                      fontWeight: FontWeight.bold,
                                                      fontSize: 13,
                                                      color: Color(0xFF0F172A),
                                                    ),
                                                  ),
                                                ),
                                                Text(
                                                  _formatTimestamp(item['created_at']),
                                                  style: const TextStyle(fontSize: 10, color: Colors.grey),
                                                ),
                                              ],
                                            ),
                                            const SizedBox(height: 4),
                                            Text(
                                              item['details'] ?? '',
                                              style: TextStyle(fontSize: 12, color: Colors.grey.shade700),
                                            ),
                                            if (item['performed_by_name'] != null && !isTeacher) ...[
                                              const SizedBox(height: 4),
                                              Text(
                                                'कर्ता: ${item['performed_by_name']} (${item['performed_by_role'] ?? ""})',
                                                style: TextStyle(fontSize: 11, color: Colors.indigo.shade700, fontWeight: FontWeight.w500),
                                              ),
                                            ],
                                          ],
                                        ),
                                      ),
                                    ],
                                  ),
                                );
                              },
                            ),
                          ),
          ),
        ],
      ),
    );
  }
}
