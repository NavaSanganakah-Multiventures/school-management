import 'package:flutter/material.dart';
import '../models/school_model.dart';
import '../services/school_service.dart';
import '../services/transaction_service.dart';
import '../widgets/app_ui.dart';

class DashboardScreen extends StatefulWidget {
  final Map<String, dynamic> profile;
  final VoidCallback refreshBadges;
  final int pendingCount;
  const DashboardScreen({
    super.key,
    required this.profile,
    required this.refreshBadges,
    required this.pendingCount,
  });

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  final _service = SchoolService();
  final _txnService = TransactionService();

  bool _loading = true;
  String? _error;
  List<SchoolModel> _schools = [];
  List<SchoolModel> _pending = [];
  double _collected = 0;
  double _pendingAmount = 0;
  int _paidCount = 0;
  bool _runningTrial = false;

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
      final results = await Future.wait([
        _service.fetchSchools(),
        _service.fetchRegistrations(),
        _txnService.fetchTransactions(),
      ]);
      final schools = results[0] as List<SchoolModel>;
      final pending = results[1] as List<SchoolModel>;
      final (_, summary) = results[2] as (List, dynamic);
      if (!mounted) return;
      setState(() {
        _schools = schools;
        _pending = pending;
        _collected = summary?.collected ?? 0;
        _pendingAmount = summary?.pending ?? 0;
        _paidCount = summary?.paidCount ?? 0;
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

  int _count(String status) => _schools.where((s) => s.status == status).length;

  Future<void> _runTrialProcess() async {
    final ok = await confirmDialog(
      context,
      title: 'ट्रायल जांच शुरू करें?',
      message:
          'सभी स्कूलों की ट्रायल समाप्ति जांच (processTrialExpirations) चलेगी और समाप्त ट्रायल पर ईमेल भेजे जाएंगे।',
      confirmText: 'शुरू करें',
    );
    if (!ok || !mounted) return;
    setState(() => _runningTrial = true);
    try {
      final res = await _service.processTrials();
      if (res['success'] == true) {
        showSnack(context, res['message'].toString());
        _load();
      } else {
        showSnack(context, res['message'].toString(), ok: false);
      }
    } catch (e) {
      showSnack(context, 'त्रुटि: $e', ok: false);
    } finally {
      if (mounted) setState(() => _runningTrial = false);
    }
  }

  Future<void> _runPluginTrialProcess() async {
    final ok = await confirmDialog(
      context,
      title: 'प्लगइन ट्रायल जांच शुरू करें?',
      message: 'सभी प्लगइन ट्रायल की समाप्ति जांच चलेगी।',
      confirmText: 'शुरू करें',
    );
    if (!ok || !mounted) return;
    setState(() => _runningTrial = true);
    try {
      final res = await _service.processPluginTrials();
      if (res['success'] == true) {
        showSnack(context, res['message'].toString());
      } else {
        showSnack(context, res['message'].toString(), ok: false);
      }
    } catch (e) {
      showSnack(context, 'त्रुटि: $e', ok: false);
    } finally {
      if (mounted) setState(() => _runningTrial = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final adminName =
        (widget.profile['fullName'] ?? 'प्लेटफॉर्म एडमिन').toString();

    return Scaffold(
      body: _loading
          ? loadingIndicator(message: 'डैशबोर्ड लोड हो रहा है…')
          : RefreshIndicator(
              onRefresh: _load,
              child: SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text('नमस्ते, $adminName 👋',
                        style: const TextStyle(
                            fontSize: 20, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 4),
                    const Text(
                        'प्लेटफॉर्म स्वास्थ्य, स्कूल अनुमोदन एवं राजस्व का त्वरित सारांश',
                        style: TextStyle(fontSize: 12, color: Colors.grey)),
                    const SizedBox(height: 16),
                    if (_error != null) errorBanner(_error!),
                    GridView.count(
                      crossAxisCount: MediaQuery.sizeOf(context).width >= 600
                          ? 3
                          : 2,
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      mainAxisSpacing: 10,
                      crossAxisSpacing: 10,
                      childAspectRatio: 1.5,
                      children: [
                        metricCard(
                          title: 'कुल स्कूल',
                          value: '${_schools.length}',
                          subtitle: 'पंजीकृत टेनेंट्स',
                          color: const Color(0xFF2563EB),
                          icon: Icons.school,
                        ),
                        metricCard(
                          title: 'लंबित अनुमोदन',
                          value: '${widget.pendingCount}',
                          subtitle: 'कार्रवाई आवश्यक',
                          color: kPrimary,
                          icon: Icons.pending_actions,
                        ),
                        metricCard(
                          title: 'ट्रायल',
                          value: '${_count('Trial')}',
                          subtitle: '7-दिन फ्री ट्रायल',
                          color: const Color(0xFFB45309),
                          icon: Icons.timer_outlined,
                        ),
                        metricCard(
                          title: 'सक्रिय',
                          value: '${_count('Active')}',
                          subtitle: 'भुगतान या स्वीकृत',
                          color: const Color(0xFF047857),
                          icon: Icons.verified_outlined,
                        ),
                        metricCard(
                          title: 'एकत्रित राजस्व',
                          value: money(_collected),
                          subtitle: '$_paidCount भुगतान सफल',
                          color: const Color(0xFF0F766E),
                          icon: Icons.payments_outlined,
                        ),
                        metricCard(
                          title: 'लंबित राशि',
                          value: money(_pendingAmount),
                          subtitle: 'Processing / Pending',
                          color: const Color(0xFFBE123C),
                          icon: Icons.schedule_outlined,
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    sectionHeader('त्वरित कार्रवाई'),
                    const SizedBox(height: 10),
                    Wrap(
                      spacing: 10,
                      runSpacing: 10,
                      children: [
                        FilledButton.icon(
                          onPressed: _runningTrial ? null : _runTrialProcess,
                          style: FilledButton.styleFrom(
                              backgroundColor: const Color(0xFF881337)),
                          icon: _runningTrial
                              ? const SizedBox(
                                  width: 16,
                                  height: 16,
                                  child: CircularProgressIndicator(
                                      color: Colors.white, strokeWidth: 2))
                              : const Icon(Icons.autorenew, size: 18),
                          label: const Text('ट्रायल प्रोसेस करें'),
                        ),
                        OutlinedButton.icon(
                          onPressed: _runningTrial ? null : _runPluginTrialProcess,
                          icon: const Icon(Icons.extension, size: 18),
                          label: const Text('प्लगइन ट्रायल प्रोसेस'),
                        ),
                      ],
                    ),
                    const SizedBox(height: 20),
                    if (_pending.isNotEmpty) ...[
                      sectionHeader('हाल के पंजीकरण अनुरोध',
                          trailing: '${_pending.length} लंबित'),
                      const SizedBox(height: 10),
                      ..._pending.take(5).map((s) => Padding(
                            padding: const EdgeInsets.only(bottom: 8),
                            child: Container(
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: Colors.white,
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(
                                    color: Colors.amber.shade200),
                              ),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(s.schoolName,
                                            style: const TextStyle(
                                                fontWeight: FontWeight.bold,
                                                fontSize: 13)),
                                        Text(s.contactEmail,
                                            style: const TextStyle(
                                                fontSize: 11,
                                                color: Colors.grey)),
                                      ],
                                    ),
                                  ),
                                  smartStatusPill('Pending_Approval',
                                      overrideLabel: 'लंबित'),
                                ],
                              ),
                            ),
                          )),
                    ],
                  ],
                ),
              ),
            ),
    );
  }
}