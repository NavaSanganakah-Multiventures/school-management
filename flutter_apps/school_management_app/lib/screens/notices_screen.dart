import 'package:flutter/material.dart';
import '../models/user_model.dart';
import '../models/notice_model.dart';
import '../services/api_client.dart';
import '../widgets/common_widgets.dart';

/// Notice board screen — mirrors React notices-screen.tsx.
/// Shows notices with category filter and FCM history tab.
class NoticesScreen extends StatefulWidget {
  final UserModel user;
  const NoticesScreen({super.key, required this.user});

  @override
  State<NoticesScreen> createState() => _NoticesScreenState();
}

class _NoticeItem {
  final String id;
  final String title;
  final String content;
  final String category;
  final String targetAudience;
  final String publishedBy;
  final String publishedDate;
  final String priority;
  final bool alertSent;

  _NoticeItem({
    required this.id,
    required this.title,
    required this.content,
    required this.category,
    required this.targetAudience,
    required this.publishedBy,
    required this.publishedDate,
    required this.priority,
    required this.alertSent,
  });

  factory _NoticeItem.fromJson(Map<String, dynamic> json) {
    return _NoticeItem(
      id: json['id']?.toString() ?? '',
      title: json['title'] ?? '',
      content: json['content'] ?? '',
      category: json['category'] ?? 'General',
      targetAudience: json['targetAudience'] ?? 'All',
      publishedBy: json['publishedBy'] ?? '',
      publishedDate: json['publishedDate'] ?? '',
      priority: json['priority'] ?? 'Normal',
      alertSent: json['alertSent'] == true,
    );
  }
}

class _NoticesScreenState extends State<NoticesScreen> with SingleTickerProviderStateMixin {
  final _api = ApiClient();
  late TabController _tabController;

  List<_NoticeItem> _notices = [];
  List<NotificationHistoryModel> _fcmHistory = [];
  bool _loading = true;
  String _category = 'All';

  static const _categories = [
    ('All', 'सभी'),
    ('General', 'सामान्य'),
    ('Academic', 'शैक्षणिक'),
    ('Holiday', 'अवकाश'),
    ('Exam', 'परीक्षा'),
    ('Sports', 'खेलकूद'),
  ];

  static const _audienceLabels = {
    'All': 'समस्त',
    'Parents': 'केवल अभिभावक',
    'Students': 'केवल विद्यार्थी',
    'Teachers': 'शिक्षक व स्टाफ',
  };

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _loadNotices();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _loadNotices() async {
    setState(() => _loading = true);
    try {
      final results = await Future.wait([
        _api.get('/api/notices', queryParams: {
          if (_category != 'All') 'category': _category,
        }),
        _api.get('/api/notifications/history'),
      ]);
      final nRes = results[0];
      final fRes = results[1];

      if (nRes['success'] == true) {
        final list = (nRes['notices'] as List?) ?? [];
        _notices = list.map((n) => _NoticeItem.fromJson(n as Map<String, dynamic>)).toList();
      }
      if (fRes['success'] == true) {
        final list = (fRes['history'] as List?) ?? [];
        _fcmHistory = list.map((h) => NotificationHistoryModel.fromJson(h as Map<String, dynamic>)).toList();
      }
    } catch (_) {
      if (mounted) showSnack(context, 'नोटिस लोड नहीं हो सके', isError: true);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _deleteNotice(_NoticeItem n) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('नोटिस हटाएं?'),
        content: Text('क्या आप "${n.title}" नोटिस हटाना चाहते हैं?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('रद्द करें')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('हटाएं'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await _api.delete('/api/notices/${n.id}');
      setState(() => _notices.removeWhere((item) => item.id == n.id));
      if (mounted) showSnack(context, 'नोटिस हटा दिया गया।');
    } catch (_) {
      if (mounted) showSnack(context, 'हटाने में त्रुटि', isError: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('नोटिस बोर्ड'),
        bottom: TabBar(
          controller: _tabController,
          labelColor: Colors.blue.shade900,
          unselectedLabelColor: Colors.grey,
          indicatorColor: Colors.blue.shade900,
          tabs: [
            Tab(text: 'नोटिस (${_notices.length})'),
            Tab(text: 'अलर्ट इतिहास (${_fcmHistory.length})'),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.campaign_rounded),
            tooltip: 'त्वरित पुश अलर्ट',
            onPressed: () {
              // TODO(phase-3): FCM push alert modal
              showSnack(context, 'पुश अलर्ट जल्द आ रहा है।');
            },
          ),
        ],
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _buildNoticesTab(),
          _buildFcmHistoryTab(),
        ],
      ),
    );
  }

  // ==================== Notices Tab ====================
  Widget _buildNoticesTab() {
    return Column(
      children: [
        // Category chips
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: _categories.map((c) {
                final isSelected = _category == c.$1;
                return Padding(
                  padding: const EdgeInsets.only(right: 6),
                  child: ChoiceChip(
                    label: Text(c.$2, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: isSelected ? Colors.white : Colors.grey.shade700)),
                    selected: isSelected,
                    selectedColor: Colors.blue.shade900,
                    backgroundColor: Colors.white,
                    side: BorderSide(color: isSelected ? Colors.blue.shade900 : Colors.grey.shade300),
                    onSelected: (_) {
                      setState(() => _category = c.$1);
                      _loadNotices();
                    },
                    visualDensity: VisualDensity.compact,
                  ),
                );
              }).toList(),
            ),
          ),
        ),

        // Notices list
        Expanded(
          child: _loading
              ? const LoadingView()
              : _notices.isEmpty
                  ? const EmptyState(
                      message: 'कोई नोटिस नहीं',
                      icon: Icons.campaign_outlined,
                    )
                  : RefreshIndicator(
                      onRefresh: _loadNotices,
                      child: ListView.separated(
                        padding: const EdgeInsets.all(12),
                        itemCount: _notices.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 8),
                        itemBuilder: (context, index) => _NoticeCard(
                          notice: _notices[index],
                          audienceLabels: _audienceLabels,
                          onDelete: () => _deleteNotice(_notices[index]),
                        ),
                      ),
                    ),
        ),
      ],
    );
  }

  // ==================== FCM History Tab ====================
  Widget _buildFcmHistoryTab() {
    if (_fcmHistory.isEmpty) {
      return const Center(
        child: EmptyState(
          message: 'कोई पूर्व सूचना अलर्ट दर्ज नहीं है',
          icon: Icons.notifications_off_outlined,
        ),
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.all(12),
      itemCount: _fcmHistory.length,
      separatorBuilder: (_, __) => const SizedBox(height: 6),
      itemBuilder: (context, index) {
        final item = _fcmHistory[index];
        return Card(
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
            side: BorderSide(color: Colors.grey.shade200),
          ),
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        item.title,
                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: Colors.green.shade50,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        'प्रसारित',
                        style: TextStyle(fontSize: 9, color: Colors.green.shade700, fontWeight: FontWeight.bold),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(item.body, style: TextStyle(fontSize: 12, color: Colors.grey.shade700)),
                const SizedBox(height: 6),
                Row(
                  children: [
                    if (item.targetRole != null) ...[
                      Icon(Icons.group_outlined, size: 12, color: Colors.grey.shade500),
                      const SizedBox(width: 4),
                      Text(item.targetRole!, style: TextStyle(fontSize: 10, color: Colors.grey.shade500)),
                    ],
                    const Spacer(),
                    if (item.sentAt != null)
                      Text(
                        item.sentAt!,
                        style: TextStyle(fontSize: 10, color: Colors.grey.shade400),
                      ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

// ---------------------------------------------------------------------------
// Notice Card
// ---------------------------------------------------------------------------
class _NoticeCard extends StatelessWidget {
  final _NoticeItem notice;
  final Map<String, String> audienceLabels;
  final VoidCallback onDelete;

  const _NoticeCard({
    required this.notice,
    required this.audienceLabels,
    required this.onDelete,
  });

  Color get _priorityColor {
    switch (notice.priority) {
      case 'High':
        return const Color(0xFFDC2626);
      case 'Urgent':
        return const Color(0xFFB91C1C);
      default:
        return const Color(0xFF2563EB);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: Colors.grey.shade200),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Category badge + alert sent
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: _priorityColor.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    notice.category,
                    style: TextStyle(color: _priorityColor, fontSize: 10, fontWeight: FontWeight.bold),
                  ),
                ),
                if (notice.alertSent) ...[
                  const SizedBox(width: 6),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: Colors.amber.shade50,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: Colors.amber.shade200),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.check_circle, size: 10, color: Colors.amber.shade700),
                        const SizedBox(width: 3),
                        Text('अलर्ट प्रेषित', style: TextStyle(fontSize: 9, color: Colors.amber.shade700, fontWeight: FontWeight.bold)),
                      ],
                    ),
                  ),
                ],
                const Spacer(),
                IconButton(
                  icon: Icon(Icons.delete_outline_rounded, size: 16, color: Colors.grey.shade400),
                  onPressed: onDelete,
                  constraints: const BoxConstraints(minWidth: 28, minHeight: 28),
                  padding: EdgeInsets.zero,
                ),
              ],
            ),
            const SizedBox(height: 8),
            // Title
            Text(notice.title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
            const SizedBox(height: 4),
            // Content
            Text(notice.content, style: TextStyle(fontSize: 12, color: Colors.grey.shade700, height: 1.4)),
            const SizedBox(height: 8),
            // Footer
            Container(
              padding: const EdgeInsets.only(top: 8),
              decoration: BoxDecoration(border: Border(top: BorderSide(color: Colors.grey.shade100))),
              child: Row(
                children: [
                  Text(
                    'जारीकर्ता: ${notice.publishedBy}',
                    style: TextStyle(fontSize: 10, color: Colors.grey.shade500),
                  ),
                  const Spacer(),
                  Text(
                    'लक्षित: ${audienceLabels[notice.targetAudience] ?? notice.targetAudience}',
                    style: TextStyle(fontSize: 10, color: Colors.grey.shade500),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    notice.publishedDate,
                    style: TextStyle(fontSize: 10, color: Colors.grey.shade400),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
