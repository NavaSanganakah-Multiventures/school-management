import 'package:flutter/material.dart';
import '../models/plugin_model.dart';
import '../models/school_model.dart';
import '../services/plugin_service.dart';
import '../services/school_service.dart';
import '../widgets/app_ui.dart';

class PluginsScreen extends StatefulWidget {
  const PluginsScreen({super.key});

  @override
  State<PluginsScreen> createState() => _PluginsScreenState();
}

class _PluginsScreenState extends State<PluginsScreen> {
  final _service = PluginService();
  final _schoolService = SchoolService();

  bool _loading = true;
  String? _error;
  List<PluginModel> _plugins = [];
  List<PluginSubscriptionModel> _subs = [];
  List<PluginTrialModel> _trials = [];
  List<SchoolModel> _schools = [];
  int _segment = 0; // 0 = कैटलॉग, 1 = सब्सक्रिप्शन्स, 2 = ट्रायल्स
  String _search = '';

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
        _service.fetchPlugins(),
        _service.fetchSubscriptions(),
        _service.fetchTrials(),
        _schoolService.fetchSchools(),
      ]);
      if (!mounted) return;
      setState(() {
        _plugins = results[0] as List<PluginModel>;
        _subs = results[1] as List<PluginSubscriptionModel>;
        _trials = results[2] as List<PluginTrialModel>;
        _schools = results[3] as List<SchoolModel>;
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

  List<PluginModel> get _filtered {
    final q = _search.trim().toLowerCase();
    if (q.isEmpty) return _plugins;
    return _plugins
        .where((p) =>
            p.name.toLowerCase().contains(q) ||
            p.description.toLowerCase().contains(q) ||
            p.id.toLowerCase().contains(q))
        .toList();
  }

  // ---------------- Actions ----------------

  Future<void> _toggle(PluginModel p) async {
    try {
      final res = await _service.togglePlugin(p.id);
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

  Future<void> _openPluginDialog([PluginModel? existing]) async {
    final id = TextEditingController(text: existing?.id ?? '');
    final name = TextEditingController(text: existing?.name ?? '');
    final description =
        TextEditingController(text: existing?.description ?? '');
    final price = TextEditingController(
        text: existing == null ? '0' : existing.price.toStringAsFixed(0));
    String type = existing?.type ?? 'global';
    bool isActive = existing?.isActive ?? true;

    final saved = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSt) => AlertDialog(
          title: Text(existing == null ? 'नया प्लगइन' : 'प्लगइन संपादित करें'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                TextField(controller: id,
                    enabled: existing == null,
                    decoration: fieldDec('Plugin ID *')),
                const SizedBox(height: 10),
                TextField(controller: name, decoration: fieldDec('नाम *')),
                const SizedBox(height: 10),
                TextField(controller: description,
                    maxLines: 2, decoration: fieldDec('विवरण')),
                const SizedBox(height: 10),
                TextField(
                    controller: price,
                    keyboardType: TextInputType.number,
                    decoration: fieldDec('मूल्य (₹/cycle)')),
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  initialValue: type,
                  decoration: fieldDec('प्रकार'),
                  items: const [
                    DropdownMenuItem(value: 'global', child: Text('Global')),
                    DropdownMenuItem(value: 'private', child: Text('Private')),
                  ],
                  onChanged: (v) => setSt(() => type = v ?? type),
                ),
                const SizedBox(height: 8),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title:
                      const Text('सक्रिय', style: TextStyle(fontSize: 13)),
                  value: isActive,
                  onChanged: (v) => setSt(() => isActive = v),
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
                  showSnack(ctx, 'Plugin ID और नाम आवश्यक हैं।', ok: false);
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
    try {
      final body = {
        'id': id.text.trim(),
        'name': name.text.trim(),
        'description': description.text.trim(),
        'type': type,
        'price': double.tryParse(price.text.trim()) ?? 0,
        'isActive': isActive,
      };
      final res = existing == null
          ? await _service.createPlugin(body)
          : await _service.updatePlugin(body);
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

  Future<void> _openAssignDialog() async {
    if (_schools.isEmpty || _plugins.isEmpty) {
      showSnack(context, 'स्कूल और प्लगइन सूची खाली है।', ok: false);
      return;
    }
    String schoolId = _schools.first.id;
    String pluginId = _plugins.first.id;

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSt) => AlertDialog(
          title: const Text('प्लगइन असाइन करें'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              DropdownButtonFormField<String>(
                initialValue: schoolId,
                decoration: fieldDec('स्कूल'),
                items: _schools
                    .map((s) => DropdownMenuItem(
                        value: s.id,
                        child: Text(s.schoolName,
                            style: const TextStyle(fontSize: 12))))
                    .toList(),
                onChanged: (v) => setSt(() => schoolId = v ?? schoolId),
              ),
              const SizedBox(height: 10),
              DropdownButtonFormField<String>(
                initialValue: pluginId,
                decoration: fieldDec('प्लगइन'),
                items: _plugins
                    .map((p) => DropdownMenuItem(
                        value: p.id,
                        child: Text(p.name,
                            style: const TextStyle(fontSize: 12))))
                    .toList(),
                onChanged: (v) => setSt(() => pluginId = v ?? pluginId),
              ),
            ],
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.of(ctx).pop(false),
                child: const Text('रद्द करें')),
            FilledButton(
                onPressed: () => Navigator.of(ctx).pop(true),
                child: const Text('सक्रिय करें')),
          ],
        ),
      ),
    );
    if (ok != true || !mounted) return;
    try {
      final res = await _service.activatePlugin(schoolId, pluginId);
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

  Future<void> _grantTrial() async {
    if (_schools.isEmpty || _plugins.isEmpty) {
      showSnack(context, 'स्कूल और प्लगइन सूची खाली है।', ok: false);
      return;
    }
    String schoolId = _schools.first.id;
    String pluginId = _plugins.first.id;
    final days = TextEditingController(text: '7');

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSt) => AlertDialog(
          title: const Text('प्लगइन ट्रायल दें'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              DropdownButtonFormField<String>(
                initialValue: schoolId,
                decoration: fieldDec('स्कूल'),
                items: _schools
                    .map((s) => DropdownMenuItem(
                        value: s.id,
                        child: Text(s.schoolName,
                            style: const TextStyle(fontSize: 12))))
                    .toList(),
                onChanged: (v) => setSt(() => schoolId = v ?? schoolId),
              ),
              const SizedBox(height: 10),
              DropdownButtonFormField<String>(
                initialValue: pluginId,
                decoration: fieldDec('प्लगइन'),
                items: _plugins
                    .map((p) => DropdownMenuItem(
                        value: p.id,
                        child: Text(p.name,
                            style: const TextStyle(fontSize: 12))))
                    .toList(),
                onChanged: (v) => setSt(() => pluginId = v ?? pluginId),
              ),
              const SizedBox(height: 10),
              TextField(
                  controller: days,
                  keyboardType: TextInputType.number,
                  decoration: fieldDec('ट्रायल दिन (1–365)')),
            ],
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.of(ctx).pop(false),
                child: const Text('रद्द करें')),
            FilledButton(
                onPressed: () => Navigator.of(ctx).pop(true),
                child: const Text('ट्रायल दें')),
          ],
        ),
      ),
    );
    if (ok != true || !mounted) return;
    try {
      final res = await _service.grantTrial(
        schoolId: schoolId,
        pluginId: pluginId,
        trialDays: int.tryParse(days.text.trim()) ?? 7,
      );
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

  Future<void> _revokeTrial(PluginTrialModel t) async {
    final ok = await confirmDialog(
      context,
      title: 'ट्रायल रद्द करें?',
      message: '"${t.schoolName}" के "${t.pluginName}" प्लगइन का ट्रायल रद्द कर दिया जाएगा।',
      confirmText: 'रद्द करें',
      destructive: true,
    );
    if (!ok || !mounted) return;
    try {
      final res = await _service.revokeTrial(t.schoolId, t.pluginId);
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

  Future<void> _sendPluginPaymentLink(PluginTrialModel t) async {
    String cycle = 'monthly';
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSt) => AlertDialog(
          title: const Text('पेमेंट लिंक भेजें'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('${t.schoolName} → ${t.pluginName}',
                  style: const TextStyle(fontSize: 12, color: Colors.grey)),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: cycle,
                decoration: fieldDec('Billing Cycle'),
                items: const [
                  DropdownMenuItem(value: 'monthly', child: Text('Monthly')),
                  DropdownMenuItem(value: 'annual', child: Text('Annual')),
                ],
                onChanged: (v) => setSt(() => cycle = v ?? cycle),
              ),
            ],
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.of(ctx).pop(false),
                child: const Text('रद्द करें')),
            FilledButton(
                onPressed: () => Navigator.of(ctx).pop(true),
                child: const Text('भेजें')),
          ],
        ),
      ),
    );
    if (ok != true || !mounted) return;
    try {
      final res = await _service.sendPaymentLink(
          schoolId: t.schoolId, pluginId: t.pluginId, billingCycle: cycle);
      if (res['success'] == true) {
        showSnack(context, res['message'].toString());
      } else {
        showSnack(context, res['message'].toString(), ok: false);
      }
    } catch (e) {
      showSnack(context, 'त्रुटि: $e', ok: false);
    }
  }

  Future<void> _toggleSub(PluginSubscriptionModel sub) async {
    final res = sub.status == 'active'
        ? await _service.revokePlugin(sub.schoolId, sub.pluginId)
        : await _service.activatePlugin(sub.schoolId, sub.pluginId);
    if (res['success'] == true) {
      showSnack(context, res['message'].toString());
      _load();
    } else {
      showSnack(context, res['message'].toString(), ok: false);
    }
  }

  // ---------------- UI ----------------

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      floatingActionButton: _segment == 0
          ? FloatingActionButton.extended(
              onPressed: () => _openPluginDialog(),
              backgroundColor: const Color(0xFF4338CA),
              foregroundColor: Colors.white,
              icon: const Icon(Icons.add),
              label: const Text('नया प्लगइन',
                  style: TextStyle(fontWeight: FontWeight.bold)),
            )
          : null,
      body: RefreshIndicator(
        onRefresh: _load,
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('प्लगइन प्रबंधन',
                  style: const TextStyle(
                      fontSize: 18, fontWeight: FontWeight.w800)),
              const SizedBox(height: 4),
              Text('कैटलॉग, स्कूल सब्सक्रिप्शन्स व ट्रायल्स',
                  style: const TextStyle(fontSize: 12, color: Colors.grey)),
              const SizedBox(height: 14),
              if (_error != null) errorBanner(_error!),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    _seg(0, 'कैटलॉग (${_plugins.length})'),
                    _seg(1, 'सब्सक्रिप्शन्स (${_subs.length})'),
                    _seg(2, 'ट्रायल्स (${_trials.length})'),
                  ],
                ),
              ),
              const SizedBox(height: 10),
              if (_segment == 0) ...[
                TextField(
                  decoration: fieldDec('प्लगइन खोजें…')
                      .copyWith(prefixIcon: const Icon(Icons.search, size: 20)),
                  onChanged: (v) => setState(() => _search = v),
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: _openAssignDialog,
                        icon: const Icon(Icons.link, size: 16),
                        label: const Text('स्कूल को असाइन करें',
                            style: TextStyle(fontSize: 11)),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                if (_loading)
                  loadingIndicator()
                else if (_filtered.isEmpty)
                  emptyState('कोई प्लगइन नहीं मिला।')
                else
                  ..._filtered.map((p) => _pluginCard(p)),
              ] else if (_segment == 1) ...[
                if (_loading)
                  loadingIndicator()
                else if (_subs.isEmpty)
                  emptyState('कोई प्लगइन सब्सक्रिप्शन नहीं।')
                else
                  ..._subs.map((s) => _subCard(s)),
              ] else ...[
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: _grantTrial,
                        icon: const Icon(Icons.card_giftcard, size: 16),
                        label: const Text('ट्रायल दें',
                            style: TextStyle(fontSize: 11)),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                if (_loading)
                  loadingIndicator()
                else if (_trials.isEmpty)
                  emptyState('कोई प्लगइन ट्रायल नहीं।')
                else
                  ..._trials.map((t) => _trialCard(t)),
              ],
              const SizedBox(height: 90),
            ],
          ),
        ),
      ),
    );
  }

  Widget _seg(int index, String label) {
    final selected = _segment == index;
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: ChoiceChip(
        label: Text(label, style: const TextStyle(fontSize: 11)),
        selected: selected,
        onSelected: (_) => setState(() => _segment = index),
      ),
    );
  }

  Widget _pluginCard(PluginModel p) {
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
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: const Color(0xFF4338CA).withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(Icons.extension,
                    color: Color(0xFF4338CA), size: 18),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(p.name,
                        style: const TextStyle(
                            fontWeight: FontWeight.bold, fontSize: 13)),
                    Text(p.id,
                        style: const TextStyle(fontSize: 10, color: Colors.grey)),
                  ],
                ),
              ),
              statusPill(p.isActive ? 'सक्रिय' : 'निष्क्रिय',
                  color: p.isActive
                      ? const Color(0xFF047857)
                      : const Color(0xFFBE123C)),
            ],
          ),
          if (p.description.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(p.description,
                style: const TextStyle(fontSize: 11, color: Colors.black54)),
          ],
          const SizedBox(height: 8),
          Wrap(
            spacing: 10,
            runSpacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Text('₹${p.price.toStringAsFixed(0)} /cycle',
                  style: const TextStyle(
                      fontSize: 12, fontWeight: FontWeight.w700)),
              Text('${p.activeSubscribersCount} ग्राहक',
                  style: const TextStyle(fontSize: 11, color: Colors.grey)),
              const Spacer(),
              TextButton.icon(
                onPressed: () => _openPluginDialog(p),
                icon: const Icon(Icons.edit_outlined, size: 15),
                label:
                    const Text('संपादित', style: TextStyle(fontSize: 11)),
              ),
              Switch(
                value: p.isActive,
                activeThumbColor: const Color(0xFF047857),
                onChanged: (_) => _toggle(p),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _subCard(PluginSubscriptionModel s) {
    final active = s.status == 'active';
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.grey.shade200),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(s.schoolName,
                    style: const TextStyle(
                        fontWeight: FontWeight.bold, fontSize: 13)),
                Text('${s.pluginName} • ${s.status}',
                    style: const TextStyle(fontSize: 11, color: Colors.black54)),
                if (s.validUntil.isNotEmpty)
                  Text('वैध: ${s.validUntil}',
                      style:
                          const TextStyle(fontSize: 10, color: Colors.grey)),
              ],
            ),
          ),
          statusPill(active ? 'सक्रिय' : 'निष्क्रिय',
              color: active
                  ? const Color(0xFF047857)
                  : const Color(0xFFBE123C)),
          const SizedBox(width: 6),
          TextButton(
            onPressed: () => _toggleSub(s),
            child: Text(active ? 'Revoke' : 'Activate',
                style: TextStyle(
                    fontSize: 11,
                    color: active
                        ? const Color(0xFFBE123C)
                        : const Color(0xFF047857))),
          ),
        ],
      ),
    );
  }

  Widget _trialCard(PluginTrialModel t) {
    final isTrial = t.paymentStatus == 'trial';
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
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(t.schoolName,
                        style: const TextStyle(
                            fontWeight: FontWeight.bold, fontSize: 13)),
                    Text(t.pluginName,
                        style: const TextStyle(
                            fontSize: 11, color: Colors.black54)),
                  ],
                ),
              ),
              smartStatusPill(isTrial ? 'Trial' : t.paymentStatus,
                  overrideLabel: isTrial ? 'ट्रायल' : t.paymentStatus),
            ],
          ),
          if (t.trialEndsAt.isNotEmpty)
            Text('ट्रायल समाप्ति: ${t.trialEndsAt}',
                style: const TextStyle(fontSize: 11, color: Colors.grey)),
          if (t.validUntil.isNotEmpty)
            Text('वैध: ${t.validUntil}',
                style: const TextStyle(fontSize: 10, color: Colors.grey)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              OutlinedButton.icon(
                onPressed: () => _sendPluginPaymentLink(t),
                icon: const Icon(Icons.link, size: 15),
                label: const Text('पेमेंट लिंक',
                    style: TextStyle(fontSize: 11)),
              ),
              OutlinedButton.icon(
                onPressed: () => _revokeTrial(t),
                style: OutlinedButton.styleFrom(
                    foregroundColor: const Color(0xFFBE123C)),
                icon: const Icon(Icons.close, size: 15),
                label: const Text('ट्रायल रद्द करें',
                    style: TextStyle(fontSize: 11)),
              ),
            ],
          ),
        ],
      ),
    );
  }
}