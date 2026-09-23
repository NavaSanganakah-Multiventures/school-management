import 'package:flutter/material.dart';
import '../models/plan_model.dart';
import '../services/plan_service.dart';
import '../widgets/app_ui.dart';

class PlansScreen extends StatefulWidget {
  final VoidCallback refreshBadges;
  const PlansScreen({super.key, required this.refreshBadges});

  @override
  State<PlansScreen> createState() => _PlansScreenState();
}

const _moduleOptions = [
  'dashboard', 'students', 'attendance', 'staff', 'notices', 'fees',
  'exams', 'principal', 'settings', 'billing', 'lms',
];

const _flagOptions = [
  ('reportCards', 'रिपोर्ट कार्ड'),
  ('principalHistory', 'प्रधानाचार्य इतिहास'),
  ('autopay', 'ऑटो-पे बिलिंग'),
  ('domainEmail', 'डोमेन ईमेल'),
  ('multiSchool', 'मल्टी-स्कूल टेनेंसी'),
  ('prioritySupport', 'प्राथमिकता सहायता'),
  ('customDomainIncluded', 'कस्टम डोमेन शामिल'),
  ('dedicatedWorker', 'डेडिकेटेड वर्कर'),
];

class _PlansScreenState extends State<PlansScreen> {
  final _service = PlanService();

  bool _loading = true;
  String? _error;
  List<PlanModel> _plans = [];
  List<Map<String, dynamic>> _rzPlans = [];
  bool _syncing = false;

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
        _service.fetchPlans(),
        _service.fetchRazorpayPlans(),
      ]);
      if (!mounted) return;
      setState(() {
        _plans = results[0] as List<PlanModel>;
        _rzPlans = results[1] as List<Map<String, dynamic>>;
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

  // ---------------- Plan create/edit ----------------

  Future<void> _openPlanDialog([PlanModel? existing]) async {
    final isEdit = existing != null;
    final id = TextEditingController(text: existing?.id ?? '');
    final name = TextEditingController(text: existing?.name ?? '');
    final tagline = TextEditingController(text: existing?.tagline ?? '');
    final badge = TextEditingController(text: existing?.badge ?? '');
    final monthly = TextEditingController(
        text: existing == null ? '' : existing.monthlyPrice.toStringAsFixed(0));
    final quarterly = TextEditingController(
        text: existing == null ? '' : existing.quarterlyPrice.toStringAsFixed(0));
    final annual = TextEditingController(
        text: existing == null ? '' : existing.annualPrice.toStringAsFixed(0));
    final maxStudents = TextEditingController(
        text: existing?.maxStudentsLimit?.toString() ?? '');
    final maxStaff = TextEditingController(
        text: existing?.maxStaffLimit?.toString() ?? '');
    final features = TextEditingController(
        text: existing?.features.join(', ') ?? '');
    final sortOrder = TextEditingController(
        text: (existing?.sortOrder ?? 0).toString());

    final modules = List<String>.from(existing?.modules ?? const []);
    final flags = Map<String, bool>.from(
        (existing?.featureFlags ?? {}).map((k, v) => MapEntry(k, v == true)));
    bool recommended = existing?.recommended ?? false;
    bool active = existing?.active ?? true;
    bool isTrial = existing?.isTrial ?? false;

    final saved = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSt) => AlertDialog(
          title: Text(isEdit ? 'प्लान संपादित करें' : 'नया प्लान बनाएं'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                TextField(
                    controller: id,
                    enabled: !isEdit,
                    decoration: fieldDec('Plan ID (lowercase) *')),
                const SizedBox(height: 10),
                TextField(controller: name, decoration: fieldDec('प्लान नाम *')),
                const SizedBox(height: 10),
                Row(children: [
                  Expanded(
                      child: TextField(controller: tagline,
                          decoration: fieldDec('Tagline'))),
                  const SizedBox(width: 8),
                  Expanded(
                      child: TextField(controller: badge,
                          decoration: fieldDec('Badge'))),
                ]),
                const SizedBox(height: 10),
                Row(children: [
                  Expanded(
                      child: TextField(controller: monthly,
                          keyboardType: TextInputType.number,
                          decoration: fieldDec('मासिक ₹'))),
                  const SizedBox(width: 8),
                  Expanded(
                      child: TextField(controller: quarterly,
                          keyboardType: TextInputType.number,
                          decoration: fieldDec('त्रैमासिक ₹'))),
                  const SizedBox(width: 8),
                  Expanded(
                      child: TextField(controller: annual,
                          keyboardType: TextInputType.number,
                          decoration: fieldDec('वार्षिक ₹'))),
                ]),
                const SizedBox(height: 10),
                Row(children: [
                  Expanded(
                      child: TextField(controller: maxStudents,
                          keyboardType: TextInputType.number,
                          decoration: fieldDec('Max Students (खाली=∞)'))),
                  const SizedBox(width: 8),
                  Expanded(
                      child: TextField(controller: maxStaff,
                          keyboardType: TextInputType.number,
                          decoration: fieldDec('Max Staff (खाली=∞)'))),
                ]),
                const SizedBox(height: 10),
                TextField(controller: features,
                    decoration: fieldDec('Features (comma से अलग करें)')),
                const SizedBox(height: 10),
                TextField(controller: sortOrder,
                    keyboardType: TextInputType.number,
                    decoration: fieldDec('Sort Order')),
                const SizedBox(height: 10),
                const Text('मॉड्यूल्स (चुनें)',
                    style:
                        TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    for (final m in _moduleOptions)
                      FilterChip(
                        label: Text(m, style: const TextStyle(fontSize: 10)),
                        selected: modules.contains(m),
                        onSelected: (sel) => setSt(() {
                          if (sel) {
                            if (!modules.contains(m)) modules.add(m);
                          } else {
                            modules.remove(m);
                          }
                        }),
                      ),
                  ],
                ),
                const SizedBox(height: 10),
                const Text('फीचर फ्लैग्स',
                    style:
                        TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                const SizedBox(height: 4),
                for (final (key, label) in _flagOptions)
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    dense: true,
                    title: Text(label, style: const TextStyle(fontSize: 12)),
                    value: flags[key] ?? false,
                    onChanged: (v) => setSt(() => flags[key] = v),
                  ),
                const SizedBox(height: 4),
                CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  dense: true,
                  title: const Text('Recommended',
                      style: TextStyle(fontSize: 12)),
                  value: recommended,
                  onChanged: (v) => setSt(() => recommended = v ?? false),
                ),
                CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  dense: true,
                  title: const Text('सक्रिय (Active)',
                      style: TextStyle(fontSize: 12)),
                  value: active,
                  onChanged: (v) => setSt(() => active = v ?? false),
                ),
                CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  dense: true,
                  title: const Text('Trial प्लान (isTrial)',
                      style: TextStyle(fontSize: 12)),
                  value: isTrial,
                  onChanged: (v) => setSt(() => isTrial = v ?? false),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.of(ctx).pop(false),
                child: const Text('रद्द करें')),
            FilledButton(
              onPressed: () {
                if (id.text.trim().isEmpty || name.text.trim().isEmpty) {
                  showSnack(ctx, 'Plan ID और नाम आवश्यक हैं।', ok: false);
                  return;
                }
                Navigator.of(ctx).pop(true);
              },
              child: const Text('सेव करें'),
            ),
          ],
        ),
      ),
    );

    if (saved != true || !mounted) return;
    double? numOrNull(TextEditingController c) {
      final t = c.text.trim();
      return t.isEmpty ? null : (double.tryParse(t));
    }

    final body = <String, dynamic>{
      'id': id.text.trim().toLowerCase().replaceAll(RegExp(r'[^a-z0-9-_]'), ''),
      'name': name.text.trim(),
      'tagline': tagline.text.trim(),
      'badge': badge.text.trim(),
      'monthlyPrice': numOrNull(monthly) ?? 0,
      'quarterlyPrice': numOrNull(quarterly) ?? 0,
      'annualPrice': numOrNull(annual) ?? 0,
      'maxStudents': numOrNull(maxStudents)?.toString() ?? '',
      'maxStaff': numOrNull(maxStaff)?.toString() ?? '',
      'features': features.text
          .split(',')
          .map((e) => e.trim())
          .where((e) => e.isNotEmpty)
          .toList(),
      'modules': modules,
      'featureFlags': flags,
      'recommended': recommended,
      'active': active,
      'isTrial': isTrial,
      'sortOrder': int.tryParse(sortOrder.text.trim()) ?? 0,
    };

    try {
      final res = isEdit
          ? await _service.updatePlan(body)
          : await _service.createPlan(body);
      if (res['success'] == true) {
        showSnack(context, res['message'].toString());
        _load();
      } else {
        showSnack(context, res['message'].toString(), ok: false);
      }
    } catch (e) {
      showSnack(context, 'त्रुटि: $e', ok: false);
    }
  }

  Future<void> _deletePlan(PlanModel p) async {
    final ok = await confirmDialog(
      context,
      title: 'प्लान निष्क्रिय करें?',
      message: '"${p.name}" प्लान को निष्क्रिय कर दिया जाएगा।',
      confirmText: 'निष्क्रिय करें',
      destructive: true,
    );
    if (!ok || !mounted) return;
    try {
      final res = await _service.deletePlan(p.id);
      if (res['success'] == true) {
        showSnack(context, res['message'].toString());
        _load();
      } else {
        showSnack(context, res['message'].toString(), ok: false);
      }
    } catch (e) {
      showSnack(context, 'त्रुटि: $e', ok: false);
    }
  }

  Future<void> _createRazorpayPlan(PlanModel p) async {
    String cycle = 'monthly';
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSt) => AlertDialog(
          title: Text('Razorpay प्लान बनाएं — ${p.name}'),
          content: DropdownButtonFormField<String>(
            initialValue: cycle,
            decoration: fieldDec('Billing Cycle'),
            items: const [
              DropdownMenuItem(value: 'monthly', child: Text('Monthly')),
              DropdownMenuItem(value: 'quarterly', child: Text('Quarterly')),
              DropdownMenuItem(value: 'annual', child: Text('Annual')),
            ],
            onChanged: (v) => setSt(() => cycle = v ?? cycle),
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.of(ctx).pop(false),
                child: const Text('रद्द करें')),
            FilledButton(
                onPressed: () => Navigator.of(ctx).pop(true),
                child: const Text('बनाएं')),
          ],
        ),
      ),
    );
    if (ok != true || !mounted) return;
    try {
      final res = await _service.createRazorpayPlan(p.id, cycle);
      if (res['success'] == true) {
        showSnack(context, res['message'].toString());
        _load();
      } else {
        showSnack(context, res['message'].toString(), ok: false);
      }
    } catch (e) {
      showSnack(context, 'त्रुटि: $e', ok: false);
    }
  }

  Future<void> _syncAllRazorpay() async {
    final ok = await confirmDialog(
      context,
      title: 'सभी प्लान sync करें?',
      message:
          'सभी सक्रिय प्लानों के लिए तीनों cycles (monthly/quarterly/annual) की Razorpay प्लान बनाई जाएंगी।',
      confirmText: 'Sync All',
    );
    if (!ok || !mounted) return;
    setState(() => _syncing = true);
    try {
      final res = await _service.syncAllRazorpayPlans();
      if (res['success'] == true) {
        showSnack(context, res['message'].toString());
        _load();
      } else {
        showSnack(context, res['message'].toString(), ok: false);
      }
    } catch (e) {
      showSnack(context, 'त्रुटि: $e', ok: false);
    } finally {
      if (mounted) setState(() => _syncing = false);
    }
  }

  // ---------------- UI ----------------

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _openPlanDialog(),
        backgroundColor: const Color(0xFF1E293B),
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add),
        label: const Text('नया प्लान',
            style: TextStyle(fontWeight: FontWeight.bold)),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('सब्सक्रिप्शन प्लान',
                  style: const TextStyle(
                      fontSize: 18, fontWeight: FontWeight.w800)),
              const SizedBox(height: 4),
              const Text('प्लान CRUD, फीचर फ्लैग्स व Razorpay सिंक',
                  style: TextStyle(fontSize: 12, color: Colors.grey)),
              const SizedBox(height: 14),
              if (_error != null) errorBanner(_error!),
              if (_loading)
                loadingIndicator(message: 'प्लान लोड हो रहे हैं…')
              else ...[
                ..._plans.map((p) => _planCard(p)),
                const SizedBox(height: 20),
                sectionHeader(
                  'Razorpay प्लान (${_rzPlans.length})',
                  action: TextButton.icon(
                    onPressed: _syncing ? null : _syncAllRazorpay,
                    icon: _syncing
                        ? const SizedBox(
                            width: 14,
                            height: 14,
                            child: CircularProgressIndicator(strokeWidth: 2))
                        : const Icon(Icons.sync, size: 16),
                    label: Text(_syncing ? 'सिंक जारी…' : 'Sync All'),
                  ),
                ),
                const SizedBox(height: 8),
                if (_rzPlans.isEmpty)
                  emptyState('कोई Razorpay प्लान cached नहीं। "Sync All" दबाएं।')
                else
                  ..._rzPlans.map((r) => Container(
                        margin: const EdgeInsets.only(bottom: 6),
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: Colors.grey.shade200),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.credit_card,
                                size: 18, color: Color(0xFF0F766E)),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                      '${r['platform_plan_id']} (${r['period']})',
                                      style: const TextStyle(
                                          fontSize: 12,
                                          fontWeight: FontWeight.w600)),
                                  Text(r['razorpay_plan_id'].toString(),
                                      style: const TextStyle(
                                          fontSize: 10, color: Colors.grey)),
                                ],
                              ),
                            ),
                            Text(
                                '₹${((r['amount'] ?? 0) is int ? (r['amount'] as int) / 100 : (double.tryParse((r['amount'] ?? '0').toString()) ?? 0) / 100).toStringAsFixed(0)}',
                                style: const TextStyle(
                                    fontSize: 13, fontWeight: FontWeight.w800)),
                          ],
                        ),
                      )),
              ],
              const SizedBox(height: 90),
            ],
          ),
        ),
      ),
    );
  }

  Widget _planCard(PlanModel p) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: p.recommended
              ? const Color(0xFFE11D48).withValues(alpha: 0.5)
              : Colors.grey.shade200,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(p.name,
                    style: const TextStyle(
                        fontWeight: FontWeight.bold, fontSize: 14)),
              ),
              Wrap(
                spacing: 5,
                runSpacing: 5,
                children: [
                  if (p.recommended)
                    statusPill('Recommended', color: const Color(0xFFE11D48)),
                  if (p.isTrial) statusPill('ट्रायल', color: const Color(0xFFB45309)),
                  statusPill(p.active ? 'सक्रिय' : 'निष्क्रिय',
                      color: p.active
                          ? const Color(0xFF047857)
                          : const Color(0xFFBE123C)),
                ],
              ),
            ],
          ),
          if (p.tagline.isNotEmpty)
            Text(p.tagline,
                style: const TextStyle(fontSize: 11, color: Colors.black54)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 14,
            runSpacing: 6,
            children: [
              _price('मासिक', p.monthlyPrice),
              _price('त्रैमासिक', p.quarterlyPrice),
              _price('वार्षिक', p.annualPrice),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            'छात्र: ${p.maxStudents.isEmpty ? (p.maxStudentsLimit ?? '∞') : p.maxStudents} • '
            'स्टाफ: ${p.maxStaffLimit ?? '∞'} • मॉड्यूल्स: ${p.modules.length} • फ्लैग्स: ${p.featureFlags.length}',
            style: const TextStyle(fontSize: 11, color: Colors.grey),
          ),
          if (p.features.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(p.features.take(4).join(' • '),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 10, color: Colors.black45)),
            ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              OutlinedButton.icon(
                onPressed: () => _openPlanDialog(p),
                icon: const Icon(Icons.edit_outlined, size: 15),
                label: const Text('संपादित', style: TextStyle(fontSize: 11)),
              ),
              OutlinedButton.icon(
                onPressed: () => _createRazorpayPlan(p),
                icon: const Icon(Icons.credit_card, size: 15),
                label: const Text('Razorpay प्लान',
                    style: TextStyle(fontSize: 11)),
              ),
              if (p.active)
                OutlinedButton.icon(
                  onPressed: () => _deletePlan(p),
                  style: OutlinedButton.styleFrom(
                      foregroundColor: const Color(0xFFBE123C)),
                  icon: const Icon(Icons.delete_outline, size: 15),
                  label: const Text('निष्क्रिय करें',
                      style: TextStyle(fontSize: 11)),
                ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _price(String label, double value) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label,
            style: const TextStyle(fontSize: 9, color: Colors.grey)),
        Text(value == 0 ? '—' : money(value),
            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
      ],
    );
  }
}