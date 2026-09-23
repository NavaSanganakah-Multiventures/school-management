import 'package:flutter/material.dart';
import '../models/subscription_model.dart';
import '../services/subscription_service.dart';
import '../widgets/app_ui.dart';

/// फीचर अनुरोध प्रबंधन — स्थिति अपडेट व एडमिन नोट्स।
class FeatureRequestsScreen extends StatefulWidget {
  final VoidCallback refreshBadges;
  const FeatureRequestsScreen({super.key, required this.refreshBadges});

  @override
  State<FeatureRequestsScreen> createState() => _FeatureRequestsScreenState();
}

class _FeatureRequestsScreenState extends State<FeatureRequestsScreen> {
  final _service = FeatureRequestService();

  bool _loading = true;
  String? _error;
  List<FeatureRequestModel> _requests = [];

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
      final list = await _service.fetchRequests();
      if (!mounted) return;
      setState(() {
        _requests = list;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _loading = false;
      });
    }
  }

  Future<void> _updateStatus(FeatureRequestModel r) async {
    String status = r.status;
    final notes = TextEditingController(text: r.adminNotes);
    final saved = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSt) => AlertDialog(
          title: const Text('अनुरोध स्थिति अपडेट करें'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(r.title,
                    style: const TextStyle(
                        fontWeight: FontWeight.w600, fontSize: 13)),
                const SizedBox(height: 4),
                Text('${r.schoolName} • ${r.category}',
                    style:
                        const TextStyle(fontSize: 11, color: Colors.black54)),
                const SizedBox(height: 14),
                DropdownButtonFormField<String>(
                  initialValue: status,
                  decoration: fieldDec('स्थिति *'),
                  items: [
                    for (final s in FeatureRequestModel.validStatuses)
                      DropdownMenuItem(
                        value: s,
                        child: Text(
                          _statusLabel(s),
                          style: const TextStyle(fontSize: 13),
                        ),
                      ),
                  ],
                  onChanged: (v) => setSt(() => status = v ?? status),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: notes,
                  maxLines: 3,
                  decoration:
                      fieldDec('एडमिन नोट्स', hint: 'एडमिन के नोट्स/टिप्पणी…'),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.of(ctx).pop(false),
                child: const Text('रद्द करें')),
            FilledButton(
              onPressed: () => Navigator.of(ctx).pop(true),
              child: const Text('अपडेट करें'),
            ),
          ],
        ),
      ),
    );
    if (saved != true || !mounted) return;

    try {
      final res = await _service.updateStatus(
        id: r.id,
        status: status,
        adminNotes: notes.text.trim(),
      );
      if (!mounted) return;
      if (res['success'] == true) {
        showSnack(context, res['message'].toString());
        await _load();
        widget.refreshBadges();
      } else {
        showSnack(context, res['message'].toString(), ok: false);
      }
    } catch (e) {
      if (!mounted) return;
      showSnack(context, 'त्रुटि: $e', ok: false);
    }
  }

  String _statusLabel(String status) {
    switch (status) {
      case 'Pending':
        return 'लंबित';
      case 'In_Review':
        return 'समीक्षा में';
      case 'Approved':
        return 'स्वीकृत';
      case 'Delivered':
        return 'वितरित';
      case 'Rejected':
        return 'अस्वीकृत';
      default:
        return status;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: refreshableList(
        onRefresh: _load,
        isLoading: _loading,
        error: _error,
        children: [
          const Text('फीचर अनुरोध',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
          const SizedBox(height: 4),
          Text('${_requests.length} अनुरोध — स्थिति अपडेट करें व नोट्स जोड़ें',
              style: const TextStyle(fontSize: 12, color: Colors.grey)),
          const SizedBox(height: 14),
          if (_requests.isEmpty)
            emptyState('कोई फीचर अनुरोध नहीं।')
          else
            ..._requests.map((r) => _requestCard(r)),
        ],
      ),
    );
  }

  Widget _requestCard(FeatureRequestModel r) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.grey.shade200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(r.title,
                        style: const TextStyle(
                            fontWeight: FontWeight.bold, fontSize: 13)),
                    const SizedBox(height: 3),
                    Text(
                      '${r.schoolName}${r.schoolId.isNotEmpty ? ' • ${r.schoolId}' : ''}',
                      style: const TextStyle(
                          fontSize: 11, color: Colors.black54),
                    ),
                  ],
                ),
              ),
              smartStatusPill(r.status, overrideLabel: r.statusLabel),
            ],
          ),
          if (r.description.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(r.description,
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                    fontSize: 12, color: Colors.black87, height: 1.4)),
          ],
          const SizedBox(height: 8),
          Wrap(
            spacing: 12,
            runSpacing: 4,
            children: [
              if (r.category.isNotEmpty)
                _meta('श्रेणी', r.category),
              if (r.subdomain.isNotEmpty)
                _meta('सबडोमेन', r.subdomain),
              if (r.planId.isNotEmpty) _meta('प्लान', r.planId),
              if (r.createdAt.isNotEmpty)
                _meta('दिनांक', r.createdAt.substring(0, 10)),
            ],
          ),
          if (r.contactEmail.isNotEmpty || r.contactPhone.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(
              [r.contactEmail, r.contactPhone]
                  .where((e) => e.isNotEmpty)
                  .join(' • '),
              style: const TextStyle(fontSize: 10, color: Colors.grey),
            ),
          ],
          if (r.adminNotes.isNotEmpty) ...[
            const SizedBox(height: 6),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: const Color(0xFFF1F5F9),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text('नोट्स: ${r.adminNotes}',
                  style: const TextStyle(fontSize: 10, color: Colors.black54)),
            ),
          ],
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerRight,
            child: OutlinedButton.icon(
              onPressed: () => _updateStatus(r),
              icon: const Icon(Icons.update, size: 15),
              label: const Text('स्थिति अपडेट करें',
                  style: TextStyle(fontSize: 11)),
            ),
          ),
        ],
      ),
    );
  }

  Widget _meta(String label, String value) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text('$label: ',
            style: const TextStyle(fontSize: 10, color: Colors.grey)),
        Text(value,
            style: const TextStyle(
                fontSize: 10,
                color: Colors.black87,
                fontWeight: FontWeight.w600)),
      ],
    );
  }
}