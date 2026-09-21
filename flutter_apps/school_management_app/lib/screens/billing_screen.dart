import 'package:flutter/material.dart';
import '../models/user_model.dart';
import '../services/billing_service.dart';
import '../services/api_client.dart';
import '../widgets/common_widgets.dart';

class BillingScreen extends StatefulWidget {
  final UserModel user;
  const BillingScreen({super.key, required this.user});

  @override
  State<BillingScreen> createState() => _BillingScreenState();
}

class _BillingScreenState extends State<BillingScreen> {
  final _svc = BillingService();
  bool _loading = true;
  String? _error;
  Map<String, dynamic>? _subscription;
  List<Map<String, dynamic>> _plans = [];
  List<Map<String, dynamic>> _invoices = [];

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
      _subscription = await _svc.getSubscription();
      try {
        _plans = await _svc.getPlans();
      } catch (_) {}
      try {
        _invoices = await _svc.getInvoices();
      } catch (_) {}
      if (mounted) setState(() => _loading = false);
    } on ApiException catch (e) {
      if (mounted) setState(() {
        _error = e.message;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() {
        _error = 'बिलिंग डेटा लोड नहीं हो सका';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('सदस्यता एवं बिलिंग', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
        backgroundColor: const Color(0xFF1E293B),
        foregroundColor: Colors.white,
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
        ],
      ),
      body: _loading
          ? const LoadingView()
          : _error != null
              ? ErrorRetryView(message: _error!, onRetry: _load)
              : ResponsiveCenter(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        _buildSubscriptionCard(),
                        const SizedBox(height: 16),
                        const SectionTitle('उपलब्ध प्लान', icon: Icons.price_check),
                        const SizedBox(height: 8),
                        ..._plans.map((p) => _planCard(p)),
                        if (_invoices.isNotEmpty) ...[
                          const SizedBox(height: 16),
                          const SectionTitle('चालान इतिहास', icon: Icons.receipt),
                          const SizedBox(height: 8),
                          ..._invoices.map((inv) => ListTile(
                                leading: const CircleAvatar(child: Icon(Icons.receipt_outlined, size: 18)),
                                title: Text(inv['invoiceNumber']?.toString() ?? '-', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
                                subtitle: Text(inv['amount']?.toString() ?? '', style: const TextStyle(fontSize: 11, color: Colors.grey)),
                                trailing: Text(inv['status']?.toString() ?? '', style: const TextStyle(fontSize: 11)),
                              )),
                        ],
                      ],
                    ),
                  ),
                ),
    );
  }

  Widget _buildSubscriptionCard() {
    final plan = _subscription?['planDetails'] ?? _subscription?['plan'] ?? {};
    final isTrialExpired = _subscription?['isTrialExpired'] == true;
    final trialEndsAt = _subscription?['trialEndsAt'];

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: const LinearGradient(colors: [Color(0xFF334155), Color(0xFF1E293B)]),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.workspace_premium, color: Colors.amber, size: 28),
              const SizedBox(width: 10),
              Expanded(
                child: Text(plan['name']?.toString() ?? 'वर्तमान प्लान', style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
              ),
              if (isTrialExpired)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(color: Colors.red.shade400, borderRadius: BorderRadius.circular(12)),
                  child: const Text('समाप्त', style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold)),
                ),
            ],
          ),
          const SizedBox(height: 12),
          if (trialEndsAt != null)
            Text('ट्रायल समाप्ति: $trialEndsAt', style: const TextStyle(color: Colors.white70, fontSize: 12)),
          if (plan['maxStudentsLabel'] != null || plan['maxStudents'] != null)
            Text('छात्र सीमा: ${plan['maxStudentsLabel'] ?? plan['maxStudents']}', style: const TextStyle(color: Colors.white70, fontSize: 12)),
          if (plan['features'] is List) ...[
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              children: (plan['features'] as List).map((f) => Chip(
                label: Text(f.toString(), style: const TextStyle(fontSize: 10)),
                visualDensity: VisualDensity.compact,
              )).toList(),
            ),
          ],
        ],
      ),
    );
  }

  Widget _planCard(Map<String, dynamic> p) {
    final price = p['monthlyPrice'];
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: ListTile(
        leading: const CircleAvatar(child: Icon(Icons.star_border, size: 18)),
        title: Text(p['name']?.toString() ?? '', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
        subtitle: Text(price != null ? '₹$price / माह' : 'मूल्य निर्धारित नहीं', style: const TextStyle(fontSize: 12, color: Colors.grey)),
        trailing: p['recommended'] == true
            ? const Icon(Icons.recommend, color: Colors.amber)
            : (widget.user.role == UserRole.director ? FilledButton(onPressed: () => _subscribe(p), child: const Text('चुनें', style: TextStyle(fontSize: 11))) : null),
      ),
    );
  }

  void _subscribe(Map<String, dynamic> p) async {
    final planId = p['id']?.toString();
    if (planId == null) return;
    try {
      await _svc.subscribe(planId: planId);
      if (mounted) {
        showSnack(context, 'प्लान चुना गया — भुगतान निर्देश देखें');
        _load();
      }
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.message, isError: true);
    }
  }
}
