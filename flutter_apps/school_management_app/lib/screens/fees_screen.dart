import 'package:flutter/material.dart';
import '../models/fee_model.dart';
import '../models/user_model.dart';
import '../services/fee_service.dart';
import '../services/api_client.dart';
import '../widgets/common_widgets.dart';

class FeesScreen extends StatefulWidget {
  final UserModel user;
  const FeesScreen({super.key, required this.user});

  @override
  State<FeesScreen> createState() => _FeesScreenState();
}

class _FeesScreenState extends State<FeesScreen> {
  final _svc = FeeService();
  bool _loading = true;
  String? _error;
  FeeSummaryModel? _summary;
  List<FeeInvoiceModel> _invoices = [];
  String? _statusFilter;

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
      final res = await _svc.getInvoices(status: _statusFilter);
      _summary = res.summary;
      _invoices = res.invoices;
      if (mounted) setState(() => _loading = false);
    } on ApiException catch (e) {
      if (mounted) setState(() {
        _error = e.message;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() {
        _error = 'फीस डेटा लोड नहीं हो सका';
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
          title: const Text('फीस प्रबंधन', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
          backgroundColor: const Color(0xFF065F46),
          foregroundColor: Colors.white,
          actions: [
            IconButton(icon: const Icon(Icons.refresh), tooltip: 'ताज़ा करें', onPressed: _load),
          ],
          bottom: _isAdmin
              ? const TabBar(tabs: [
                  Tab(icon: Icon(Icons.receipt), text: 'बिल'),
                  Tab(icon: Icon(Icons.settings), text: 'सेटअप'),
                ])
              : null,
        ),
        floatingActionButton: _isAdmin
            ? FloatingActionButton.extended(
                onPressed: _showCreateDialog,
                icon: const Icon(Icons.add),
                label: const Text('नई बिल'),
                backgroundColor: const Color(0xFF065F46),
              )
            : null,
        body: _loading
            ? const LoadingView()
            : _error != null
                ? ErrorRetryView(message: _error!, onRetry: _load)
                : _isAdmin
                    ? TabBarView(
                        children: [
                          _buildInvoicesTab(),
                          _FeeSetupTab(),
                        ],
                      )
                    : _buildInvoicesTab(),
      ),
    );
  }

  Widget _buildInvoicesTab() {
    return Column(
      children: [
        if (_summary != null)
          Container(
            padding: const EdgeInsets.all(16),
            color: const Color(0xFF065F46).withValues(alpha: 0.06),
            child: ResponsiveCenter(
              maxWidth: 720,
              child: GridView.count(
                crossAxisCount: 3,
                crossAxisSpacing: 10,
                mainAxisSpacing: 10,
                shrinkWrap: true,
                childAspectRatio: 1.4,
                physics: const NeverScrollableScrollPhysics(),
                children: [
                  KpiCard(label: 'कुल प्राप्य', value: '₹${_format(_summary!.totalReceivable)}', icon: Icons.account_balance, color: Colors.blue),
                  KpiCard(label: 'संकलित', value: '₹${_format(_summary!.totalCollected)}', icon: Icons.check_circle, color: Colors.green),
                  KpiCard(label: 'बकाया', value: '₹${_format(_summary!.totalPending)}', icon: Icons.error, color: Colors.red),
                ],
              ),
            ),
          ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: ResponsiveCenter(
            maxWidth: 720,
            child: DropdownButtonFormField<String>(
              value: _statusFilter,
              decoration: const InputDecoration(labelText: 'स्थिति फ़िल्टर', border: OutlineInputBorder(), isDense: true),
              items: const [
                DropdownMenuItem(value: null, child: Text('सभी')),
                DropdownMenuItem(value: 'Paid', child: Text('भुगतान हो गया')),
                DropdownMenuItem(value: 'Partial', child: Text('आंशिक')),
                DropdownMenuItem(value: 'Unpaid', child: Text('अवैतनिक')),
                DropdownMenuItem(value: 'Overdue', child: Text('समय से अधिक')),
              ],
              onChanged: (v) {
                _statusFilter = v;
                _load();
              },
            ),
          ),
        ),
        Expanded(
          child: _invoices.isEmpty
              ? const EmptyState(message: 'कोई बिल नहीं मिली', icon: Icons.receipt_long)
              : ResponsiveCenter(
                  maxWidth: 720,
                  child: ListView.builder(
                    padding: const EdgeInsets.all(12),
                    itemCount: _invoices.length,
                    itemBuilder: (c, i) => _invoiceCard(_invoices[i]),
                  ),
                ),
        ),
      ],
    );
  }

  Widget _invoiceCard(FeeInvoiceModel inv) {
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
                Expanded(
                  child: Text(inv.title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                ),
                StatusChip(status: inv.status),
              ],
            ),
            const SizedBox(height: 6),
            Text(inv.studentName, style: const TextStyle(fontSize: 12, color: Colors.grey)),
            if (inv.className != null && inv.className!.isNotEmpty)
              Text('${inv.className}${inv.section != null ? ' • ${inv.section}' : ''}',
                  style: const TextStyle(fontSize: 11, color: Colors.grey)),
            const Divider(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                _amt('कुल', inv.total),
                _amt('भुगतान', inv.paid),
                _amt('बकाया', inv.due, highlight: inv.due > 0),
              ],
            ),
            if (inv.dueDate != null)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text('अंतिम तिथि: ${inv.dueDate}', style: const TextStyle(fontSize: 11, color: Colors.grey)),
              ),
            if (inv.status.toLowerCase() != 'paid' && _isAdmin)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    onPressed: () => _showPayDialog(inv),
                    icon: const Icon(Icons.payment, size: 16),
                    label: const Text('भुगतान दर्ज करें', style: TextStyle(fontSize: 12)),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _amt(String label, double value, {bool highlight = false}) {
    return Column(
      children: [
        Text(label, style: const TextStyle(fontSize: 10, color: Colors.grey)),
        Text('₹${_format(value)}',
            style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: highlight ? Colors.red : Colors.black87)),
      ],
    );
  }

  void _showCreateDialog() {
    final studentName = TextEditingController();
    final title = TextEditingController(text: 'मासिक फीस');
    final amount = TextEditingController();
    final className = TextEditingController();
    final scholarNumber = TextEditingController();
    showDialog(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('नई बिल बनाएं'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(controller: studentName, decoration: const InputDecoration(labelText: 'छात्र का नाम *', border: OutlineInputBorder(), isDense: true)),
              const SizedBox(height: 10),
              TextField(controller: title, decoration: const InputDecoration(labelText: 'शीर्षक *', border: OutlineInputBorder(), isDense: true)),
              const SizedBox(height: 10),
              TextField(controller: amount, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'कुल राशि *', border: OutlineInputBorder(), isDense: true)),
              const SizedBox(height: 10),
              TextField(controller: className, decoration: const InputDecoration(labelText: 'कक्षा', border: OutlineInputBorder(), isDense: true)),
              const SizedBox(height: 10),
              TextField(controller: scholarNumber, decoration: const InputDecoration(labelText: 'स्कॉलर नंबर', border: OutlineInputBorder(), isDense: true)),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c), child: const Text('रद्द करें')),
          FilledButton(
            onPressed: () async {
              if (studentName.text.isEmpty || amount.text.isEmpty) {
                showSnack(context, 'आवश्यक फ़ील्ड भरें', isError: true);
                return;
              }
              try {
                await _svc.createInvoice({
                  'studentName': studentName.text.trim(),
                  'title': title.text.trim(),
                  'totalAmount': amount.text.trim(),
                  if (className.text.isNotEmpty) 'className': className.text.trim(),
                  if (scholarNumber.text.isNotEmpty) 'scholarNumber': scholarNumber.text.trim(),
                });
                if (c.mounted) Navigator.pop(c);
                showSnack(context, 'बिल बन गई');
                _load();
              } on ApiException catch (e) {
                if (c.mounted) showSnack(context, e.message, isError: true);
              } catch (_) {
                if (c.mounted) showSnack(context, 'विफल', isError: true);
              }
            },
            child: const Text('बनाएं'),
          ),
        ],
      ),
    );
  }

  void _showPayDialog(FeeInvoiceModel inv) {
    final amount = TextEditingController(text: inv.due > 0 ? inv.due.toStringAsFixed(0) : '');
    final txn = TextEditingController();
    showDialog(
      context: context,
      builder: (c) => AlertDialog(
        title: Text('भुगतान: ${inv.title}'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('${inv.studentName} • बकाया ₹${_format(inv.due)}', style: const TextStyle(fontSize: 12, color: Colors.grey)),
            const SizedBox(height: 10),
            TextField(controller: amount, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'राशि', border: OutlineInputBorder(), isDense: true)),
            const SizedBox(height: 10),
            TextField(controller: txn, decoration: const InputDecoration(labelText: 'लेन-देन आईडी (वैकल्पिक)', border: OutlineInputBorder(), isDense: true)),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c), child: const Text('रद्द करें')),
          FilledButton(
            onPressed: () async {
              try {
                await _svc.payInvoice(
                  invoiceId: inv.id,
                  amount: amount.text.trim().isEmpty ? null : amount.text.trim(),
                  paymentMethod: 'Cash',
                  transactionId: txn.text.trim().isEmpty ? null : txn.text.trim(),
                );
                if (c.mounted) Navigator.pop(c);
                showSnack(context, 'भुगतान दर्ज हो गया');
                _load();
              } on ApiException catch (e) {
                if (c.mounted) showSnack(context, e.message, isError: true);
              } catch (_) {
                if (c.mounted) showSnack(context, 'विफल', isError: true);
              }
            },
            child: const Text('दर्ज करें'),
          ),
        ],
      ),
    );
  }

  String _format(double v) => v.toStringAsFixed(v == v.roundToDouble() ? 0 : 2);
}

// ── Fee Setup Tab (heads + structure) ─────────────────────────────────────
class _FeeSetupTab extends StatefulWidget {
  @override
  State<_FeeSetupTab> createState() => _FeeSetupTabState();
}

class _FeeSetupTabState extends State<_FeeSetupTab> {
  final _svc = FeeService();
  List<FeeHeadModel> _heads = [];
  List<FeeStructureModel> _structure = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final heads = await _svc.getHeads();
      final structure = await _svc.getStructure();
      setState(() {
        _heads = heads;
        _structure = structure;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingView();
    return ResponsiveCenter(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                const Expanded(child: SectionTitle('फीस शीर्ष', icon: Icons.category)),
                TextButton.icon(
                  onPressed: _addHead,
                  icon: const Icon(Icons.add, size: 18),
                  label: const Text('जोड़ें'),
                ),
              ],
            ),
            const SizedBox(height: 8),
            ..._heads.map((h) => ListTile(
                  leading: const CircleAvatar(child: Icon(Icons.category_outlined, size: 18)),
                  title: Text(h.headName),
                  subtitle: h.description != null ? Text(h.description!, style: const TextStyle(fontSize: 11)) : null,
                )),
            const Divider(height: 24),
            const SectionTitle('फीस संरचना (कक्षावार)', icon: Icons.account_tree),
            const SizedBox(height: 8),
            if (_structure.isEmpty)
              const EmptyState(message: 'कोई फीस संरचना सेट नहीं है', icon: Icons.account_tree_outlined)
            else
              ..._structure.map((s) => ListTile(
                    leading: const CircleAvatar(child: Icon(Icons.class_outlined, size: 18)),
                    title: Text('${s.className} — ${s.feeHeadName}'),
                    subtitle: Text('₹${s.amount}${s.billingCycle != null ? ' • ${s.billingCycle}' : ''}',
                        style: const TextStyle(fontSize: 11)),
                  )),
          ],
        ),
      ),
    );
  }

  void _addHead() {
    final name = TextEditingController();
    showDialog(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('नया फीस शीर्ष'),
        content: TextField(controller: name, decoration: const InputDecoration(labelText: 'शीर्ष नाम *', border: OutlineInputBorder(), isDense: true)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c), child: const Text('रद्द करें')),
          FilledButton(
            onPressed: () async {
              if (name.text.trim().isEmpty) return;
              try {
                await _svc.createHead(name.text.trim());
                if (c.mounted) Navigator.pop(c);
                showSnack(context, 'फीस शीर्ष जोड़ा गया');
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
}
