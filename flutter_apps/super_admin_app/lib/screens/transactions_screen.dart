import 'package:flutter/material.dart';
import '../models/transaction_model.dart';
import '../services/transaction_service.dart';
import '../widgets/app_ui.dart';

class TransactionsScreen extends StatefulWidget {
  const TransactionsScreen({super.key});

  @override
  State<TransactionsScreen> createState() => _TransactionsScreenState();
}

class _TransactionsScreenState extends State<TransactionsScreen> {
  final _service = TransactionService();

  bool _loading = true;
  String? _error;
  List<TransactionModel> _txns = [];
  TxnSummaryModel? _summary;
  List<WebhookEventModel> _events = [];
  bool _showEvents = false;
  String _statusFilter = 'All';

  static const _statuses = [
    'All', 'Paid', 'Processing', 'Pending', 'Failed', 'Refunded',
  ];

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
        _service.fetchTransactions(status: _statusFilter),
        _service.fetchWebhookEvents(),
      ]);
      final (txns, summary) = results[0] as (List<TransactionModel>, TxnSummaryModel?);
      if (!mounted) return;
      setState(() {
        _txns = txns;
        _summary = summary;
        _events = results[1] as List<WebhookEventModel>;
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

  Color _statusColor(String s) {
    switch (s) {
      case 'Paid':
        return const Color(0xFF047857);
      case 'Processing':
      case 'Pending':
        return const Color(0xFFB45309);
      case 'Failed':
      case 'Refunded':
        return const Color(0xFFBE123C);
      default:
        return const Color(0xFF475569);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: _loading
          ? loadingIndicator(message: 'लेन-देन लोड हो रहे हैं…')
          : RefreshIndicator(
              onRefresh: _load,
              child: SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text('बिलिंग लेन-देन',
                        style: TextStyle(
                            fontSize: 18, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 4),
                    const Text('सभी स्कूलों के भुगतान, चालान व Razorpay रसीदें',
                        style: TextStyle(fontSize: 12, color: Colors.grey)),
                    const SizedBox(height: 14),
                    if (_error != null) errorBanner(_error!),
                    if (_summary != null)
                      GridView.count(
                        crossAxisCount:
                            MediaQuery.sizeOf(context).width >= 700 ? 4 : 2,
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        mainAxisSpacing: 10,
                        crossAxisSpacing: 10,
                        childAspectRatio: 1.6,
                        children: [
                          metricCard(
                            title: 'कुल मूल्य',
                            value: money(_summary!.totalAmount),
                            subtitle: '${_summary!.count} चालान',
                            color: const Color(0xFF2563EB),
                            icon: Icons.receipt_long,
                          ),
                          metricCard(
                            title: 'एकत्रित',
                            value: money(_summary!.collected),
                            subtitle: '${_summary!.paidCount} सफल',
                            color: const Color(0xFF047857),
                            icon: Icons.verified,
                          ),
                          metricCard(
                            title: 'लंबित',
                            value: money(_summary!.pending),
                            subtitle: 'Processing / Pending',
                            color: const Color(0xFFB45309),
                            icon: Icons.schedule,
                          ),
                          metricCard(
                            title: 'असफल',
                            value: '${_summary!.failedCount}',
                            subtitle: 'असफल भुगतान',
                            color: const Color(0xFFBE123C),
                            icon: Icons.error_outline,
                          ),
                        ],
                      ),
                    const SizedBox(height: 14),
                    SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: Row(
                        children: [
                          for (final s in _statuses)
                            Padding(
                              padding: const EdgeInsets.only(right: 8),
                              child: ChoiceChip(
                                label: Text(s,
                                    style: const TextStyle(fontSize: 11)),
                                selected: _statusFilter == s,
                                onSelected: (_) {
                                  setState(() => _statusFilter = s);
                                  _load();
                                },
                              ),
                            ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    sectionHeader('चालान (Invoices)',
                        trailing: 'कुल: ${_txns.length}'),
                    const SizedBox(height: 10),
                    if (_txns.isEmpty)
                      emptyState('कोई लेन-देन नहीं मिला।')
                    else
                      ..._txns.map((t) => _txnCard(t)),
                    const SizedBox(height: 14),
                    sectionHeader(
                      'Webhook Events (audit)',
                      action: TextButton.icon(
                        onPressed: () => setState(() => _showEvents = !_showEvents),
                        icon: Icon(_showEvents
                            ? Icons.expand_less
                            : Icons.expand_more),
                        label: Text(_showEvents ? 'छिपाएं' : 'दिखाएं (${_events.length})'),
                      ),
                    ),
                    if (_showEvents && _events.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      ..._events.take(50).map((e) => Container(
                            margin: const EdgeInsets.only(bottom: 6),
                            padding: const EdgeInsets.all(10),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(10),
                              border:
                                  Border.all(color: Colors.grey.shade200),
                            ),
                            child: Row(
                              children: [
                                Icon(
                                  e.processed
                                      ? Icons.check_circle
                                      : Icons.pending,
                                  size: 18,
                                  color: e.processed
                                      ? const Color(0xFF047857)
                                      : const Color(0xFFB45309),
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(e.eventType,
                                          style: const TextStyle(
                                              fontSize: 12,
                                              fontWeight: FontWeight.w600)),
                                      Text(
                                          '${e.entityId} • ${e.receivedAt}',
                                          style: const TextStyle(
                                              fontSize: 10,
                                              color: Colors.grey)),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          )),
                    ] else if (_showEvents)
                      emptyState('कोई webhook इवेंट नहीं।'),
                  ],
                ),
              ),
            ),
    );
  }

  Widget _txnCard(TransactionModel t) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
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
            children: [
              Expanded(
                child: Text(t.schoolName,
                    style: const TextStyle(
                        fontWeight: FontWeight.bold, fontSize: 13)),
              ),
              statusPill(t.paymentStatus, color: _statusColor(t.paymentStatus)),
            ],
          ),
          const SizedBox(height: 4),
          Text('${t.planName.isEmpty ? t.description : t.planName} • ${t.billingCycle}',
              style: const TextStyle(fontSize: 11, color: Colors.black54)),
          Text('चालान: ${t.invoiceNumber} • ${t.invoiceDate}',
              style: const TextStyle(fontSize: 10, color: Colors.grey)),
          const SizedBox(height: 6),
          Row(
            children: [
              Text(money(t.totalAmount),
                  style: const TextStyle(
                      fontSize: 16, fontWeight: FontWeight.w900)),
              const Spacer(),
              if (t.transactionId.isNotEmpty)
                Text(t.transactionId,
                    style: const TextStyle(fontSize: 10, color: Colors.grey)),
            ],
          ),
        ],
      ),
    );
  }
}