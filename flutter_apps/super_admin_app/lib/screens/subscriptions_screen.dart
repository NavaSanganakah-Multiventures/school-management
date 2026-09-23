import 'package:flutter/material.dart';
import '../models/subscription_model.dart';
import '../services/subscription_service.dart';
import '../widgets/app_ui.dart';

/// Recurring सदस्यता प्रबंधन — pause / resume / cancel / detail।
class SubscriptionsScreen extends StatefulWidget {
  final VoidCallback refreshBadges;
  const SubscriptionsScreen({super.key, required this.refreshBadges});

  @override
  State<SubscriptionsScreen> createState() => _SubscriptionsScreenState();
}

class _SubscriptionsScreenState extends State<SubscriptionsScreen> {
  final _service = SubscriptionService();

  bool _loading = true;
  String? _error;
  List<RecurringSubscriptionModel> _subs = [];

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
      final list = await _service.fetchSubscriptions();
      if (!mounted) return;
      setState(() {
        _subs = list;
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

  String _cycleLabel(String cycle) {
    switch (cycle) {
      case 'monthly':
        return 'मासिक';
      case 'quarterly':
        return 'त्रैमासिक';
      case 'annual':
        return 'वार्षिक';
      default:
        return cycle;
    }
  }

  // ---------------- Actions ----------------

  Future<void> _pause(RecurringSubscriptionModel s) async {
    final ok = await confirmDialog(
      context,
      title: 'सदस्यता रोकें?',
      message: '"${s.schoolName}" की recurring सदस्यता रोक दी जाएगी।',
      confirmText: 'रोकें',
    );
    if (!ok || !mounted) return;
    try {
      final res = await _service.pauseSubscription(s.schoolId);
      if (!mounted) return;
      if (res['success'] == true) {
        showSnack(context, res['message'].toString());
        _load();
      } else {
        showSnack(context, res['message'].toString(), ok: false);
      }
    } catch (e) {
      if (!mounted) return;
      showSnack(context, 'त्रुटि: $e', ok: false);
    }
  }

  Future<void> _resume(RecurringSubscriptionModel s) async {
    final ok = await confirmDialog(
      context,
      title: 'सदस्यता फिर से शुरू करें?',
      message: '"${s.schoolName}" की सदस्यता दोबारा सक्रिय हो जाएगी।',
      confirmText: 'शुरू करें',
    );
    if (!ok || !mounted) return;
    try {
      final res = await _service.resumeSubscription(s.schoolId);
      if (!mounted) return;
      if (res['success'] == true) {
        showSnack(context, res['message'].toString());
        _load();
      } else {
        showSnack(context, res['message'].toString(), ok: false);
      }
    } catch (e) {
      if (!mounted) return;
      showSnack(context, 'त्रुटि: $e', ok: false);
    }
  }

  Future<void> _cancel(RecurringSubscriptionModel s) async {
    bool atCycleEnd = false;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSt) => AlertDialog(
          title: const Text('सदस्यता रद्द करें'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                '"${s.schoolName}" (${s.planName}) की recurring सदस्यता रद्द होगी।',
                style: const TextStyle(fontSize: 12),
              ),
              const SizedBox(height: 12),
              CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                dense: true,
                title: const Text('वर्तमान चक्र के अंत में रद्द करें',
                    style: TextStyle(fontSize: 12)),
                subtitle: const Text(
                    'चयनित = अगले बिलिंग के बाद रद्द • अचयनित = तुरंत रद्द',
                    style: TextStyle(fontSize: 10)),
                value: atCycleEnd,
                onChanged: (v) => setSt(() => atCycleEnd = v ?? false),
              ),
            ],
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.of(ctx).pop(false),
                child: const Text('रद्द करें')),
            FilledButton(
              style: FilledButton.styleFrom(
                  backgroundColor: const Color(0xFFBE123C)),
              onPressed: () => Navigator.of(ctx).pop(true),
              child: const Text('रेडिकल रद्द करें'),
            ),
          ],
        ),
      ),
    );
    if (ok != true || !mounted) return;
    try {
      final res = await _service.cancelSubscription(
        s.schoolId,
        atCycleEnd: atCycleEnd,
      );
      if (!mounted) return;
      if (res['success'] == true) {
        showSnack(context, res['message'].toString());
        _load();
      } else {
        showSnack(context, res['message'].toString(), ok: false);
      }
    } catch (e) {
      if (!mounted) return;
      showSnack(context, 'त्रुटि: $e', ok: false);
    }
  }

  Future<void> _showDetail(RecurringSubscriptionModel s) async {
    showDialog(
      context: context,
      builder: (ctx) => Dialog(
        insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 520),
          child: FutureBuilder<Map<String, dynamic>>(
            future: _service.fetchSubscriptionDetail(s.schoolId),
            builder: (ctx, snap) {
              if (snap.connectionState != ConnectionState.done) {
                return Padding(
                  padding: const EdgeInsets.all(40),
                  child: loadingIndicator(message: 'विवरण लोड हो रहा है…'),
                );
              }
              final data = snap.data ?? <String, dynamic>{};
              final hasError = data['success'] != true;
              final sub = hasError
                  ? <String, dynamic>{}
                  : Map<String, dynamic>.from(
                      (data['subscription'] is Map
                          ? data['subscription']
                          : <String, dynamic>{}) as Map);
              final rz = data['razorpayDetail'];

              return SingleChildScrollView(
                padding: const EdgeInsets.all(20),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        const Expanded(
                          child: Text('सदस्यता विवरण',
                              style: TextStyle(
                                  fontSize: 16, fontWeight: FontWeight.w800)),
                        ),
                        IconButton(
                          onPressed: () => Navigator.of(ctx).pop(),
                          icon: const Icon(Icons.close),
                        ),
                      ],
                    ),
                    if (hasError)
                      errorBanner(
                          (data['message'] ?? 'विवरण प्राप्त नहीं हो सका.')
                              .toString())
                    else ...[
                      _kv('स्कूल', s.schoolName),
                      _kv('प्लान', sub['planName'].toString()),
                      _kv('साइकिल', _cycleLabel(sub['billingCycle'].toString())),
                      _kv('स्थिति', sub['status'].toString()),
                      _kv('ऑटो-पे', (sub['autoPayEnabled'] == true) ? 'सक्षम' : 'बंद'),
                      _kv('Mandate', sub['mandateStatus'].toString()),
                      _kv('साइकिल', '${sub['totalCycles']} कुल • ${sub['remainingCycles']} शेष'),
                      _kv('चालू चक्र', sub['currentCycleStart'].toString()),
                      _kv('अगला बिलिंग', sub['nextBillingDate'].toString()),
                      if (sub['razorpaySubscriptionId'].toString().isNotEmpty)
                        _kv('Razorpay सब्सक्रिप्शन',
                            sub['razorpaySubscriptionId'].toString()),
                      if (rz != null && rz is Map)
                        _kv('Razorpay स्थिति',
                            (rz['status'] ?? '').toString()),
                      if (rz != null && rz is Map && rz['short_url'] != null)
                        _kv('भुगतान URL', rz['short_url'].toString()),
                    ],
                  ],
                ),
              );
            },
          ),
        ),
      ),
    );
  }

  Widget _kv(String key, String value) {
    if (value.isEmpty || value == 'null') return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 130,
            child: Text(key,
                style: const TextStyle(fontSize: 11, color: Colors.grey)),
          ),
          Expanded(
            child: Text(value,
                style: const TextStyle(fontSize: 12, color: Colors.black87)),
          ),
        ],
      ),
    );
  }

  // ---------------- UI ----------------

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: refreshableList(
        onRefresh: _load,
        isLoading: _loading,
        error: _error,
        children: [
          const Text('Recurring सदस्यताएं',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
          const SizedBox(height: 4),
          Text('${_subs.length} सक्रिय recurring सदस्यताएं (Razorpay)',
              style: const TextStyle(fontSize: 12, color: Colors.grey)),
          const SizedBox(height: 14),
          if (_subs.isEmpty)
            emptyState('कोई recurring सदस्यता नहीं।')
          else
            ..._subs.map((s) => _subCard(s)),
        ],
      ),
    );
  }

  Widget _subCard(RecurringSubscriptionModel s) {
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
                    Text(s.schoolName,
                        style: const TextStyle(
                            fontWeight: FontWeight.bold, fontSize: 13)),
                    const SizedBox(height: 2),
                    Text(
                        '${s.planName.isNotEmpty ? '${s.planName} • ' : ''}${_cycleLabel(s.billingCycle)}',
                        style: const TextStyle(
                            fontSize: 11, color: Colors.black54)),
                  ],
                ),
              ),
              Wrap(
                spacing: 5,
                runSpacing: 5,
                children: [
                  smartStatusPill(s.status.isEmpty ? '—' : s.status),
                  if (s.isPaused)
                    statusPill('रोकी गई', color: const Color(0xFFB45309)),
                  if (s.autoPayEnabled)
                    statusPill('AutoPay', color: const Color(0xFF047857)),
                ],
              ),
            ],
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 14,
            runSpacing: 6,
            children: [
              _meta('साइकिल',
                  '${s.totalCycles} कुल • ${s.remainingCycles} शेष'),
              if (s.nextBillingDate.isNotEmpty)
                _meta('अगला बिलिंग', s.nextBillingDate.substring(0, 10)),
              if (s.razorpaySubscriptionId.isNotEmpty)
                _meta('Razorpay ID', s.razorpaySubscriptionId),
            ],
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              OutlinedButton.icon(
                onPressed: () => _showDetail(s),
                icon: const Icon(Icons.visibility_outlined, size: 15),
                label: const Text('विवरण', style: TextStyle(fontSize: 11)),
              ),
              if (!s.isPaused)
                OutlinedButton.icon(
                  onPressed: () => _pause(s),
                  icon: const Icon(Icons.pause_outlined, size: 15),
                  label: const Text('रोकें', style: TextStyle(fontSize: 11)),
                )
              else
                OutlinedButton.icon(
                  onPressed: () => _resume(s),
                  style: OutlinedButton.styleFrom(
                      foregroundColor: const Color(0xFF047857)),
                  icon: const Icon(Icons.play_arrow, size: 15),
                  label:
                      const Text('शुरू करें', style: TextStyle(fontSize: 11)),
                ),
              OutlinedButton.icon(
                onPressed: () => _cancel(s),
                style: OutlinedButton.styleFrom(
                    foregroundColor: const Color(0xFFBE123C)),
                icon: const Icon(Icons.cancel_outlined, size: 15),
                label: const Text('रद्द करें', style: TextStyle(fontSize: 11)),
              ),
            ],
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