import 'package:flutter/material.dart';
import '../models/plan_model.dart';
import '../models/school_model.dart';
import '../services/school_service.dart';
import '../widgets/app_ui.dart';
import 'school_actions.dart';

class SchoolsScreen extends StatefulWidget {
  final VoidCallback refreshBadges;
  const SchoolsScreen({super.key, required this.refreshBadges});

  @override
  State<SchoolsScreen> createState() => _SchoolsScreenState();
}

class _SchoolsScreenState extends State<SchoolsScreen> {
  final _service = SchoolService();

  bool _loading = true;
  String? _error;
  List<SchoolModel> _schools = [];
  List<SchoolModel> _registrations = [];
  List<SchoolModel> _deleted = [];
  List<PlanModel> _plans = const [];

  int _segment = 0; // 0 = स्कूल, 1 = लंबित अनुमोदन, 2 = हटाए गए
  String _search = '';
  String _statusFilter = 'all';

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
        _service.fetchDeletedSchools(),
        _service.fetchPlans(),
      ]);
      if (!mounted) return;
      setState(() {
        _schools = results[0] as List<SchoolModel>;
        _registrations = results[1] as List<SchoolModel>;
        _deleted = results[2] as List<SchoolModel>;
        final plans = results[3] as List<PlanModel>;
        if (plans.isNotEmpty) _plans = plans;
        _loading = false;
      });
      widget.refreshBadges();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _loading = false;
      });
    }
  }

  Future<void> _addSchool() async {
    final data = await showAddSchoolDialog(context, _plans);
    if (data == null || !mounted) return;
    try {
      final res = await _service.createSchool(
        schoolName: data['schoolName']!,
        directorName: data['directorName']!,
        email: data['email']!,
        phone: data['phone']!,
        password: data['password']!,
        subdomain: data['subdomain'] ?? '',
        customDomain: data['customDomain'] ?? '',
        planId: data['planId'] ?? 'trial',
        billingCycle: data['billingCycle'] ?? 'monthly',
        trialEndsAt: data['trialEndsAt'] ?? '',
        address: data['address'] ?? '',
        city: data['city'] ?? '',
        state: data['state'] ?? '',
        pincode: data['pincode'] ?? '',
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
      showSnack(context, 'स्कूल बनाने में त्रुटि: ${e.toString().replaceFirst('Exception: ', '')}',
          ok: false);
    }
  }

  List<SchoolModel> get _filteredSchools {
    final q = _search.trim().toLowerCase();
    return _schools.where((t) {
      final matchesSearch = q.isEmpty ||
          t.schoolName.toLowerCase().contains(q) ||
          t.contactEmail.toLowerCase().contains(q) ||
          t.contactPhone.contains(q) ||
          t.subdomain.toLowerCase().contains(q);
      final matchesStatus = _statusFilter == 'all' ||
          (_statusFilter == 'pending' ? t.isPending : t.status == _statusFilter);
      return matchesSearch && matchesStatus;
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _addSchool,
        backgroundColor: kPrimaryDark,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add_business),
        label: const Text('स्कूल जोड़ें',
            style: TextStyle(fontWeight: FontWeight.bold)),
      ),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            color: Colors.white,
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        decoration: fieldDec('स्कूल / ईमेल / फोन / subdomain खोजें…')
                            .copyWith(prefixIcon: const Icon(Icons.search, size: 20)),
                        onChanged: (v) => setState(() => _search = v),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      _segChip(0, 'स्कूल (${_schools.length})'),
                      _segChip(1, 'लंबित (${_registrations.length})'),
                      _segChip(2, 'हटाए गए (${_deleted.length})'),
                      const SizedBox(width: 14),
                      if (_segment == 0) ...[
                        for (final f in const [
                          ('all', 'सभी'),
                          ('Trial', 'ट्रायल'),
                          ('Active', 'सक्रिय'),
                          ('Suspended', 'निलंबित'),
                        ])
                          _filterChip(f.$1, f.$2),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: 10),
              ],
            ),
          ),
          Expanded(child: _buildBody()),
        ],
      ),
    );
  }

  Widget _segChip(int index, String label) {
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

  Widget _filterChip(String value, String label) {
    final selected = _statusFilter == value;
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: ChoiceChip(
        label: Text(label, style: const TextStyle(fontSize: 11)),
        selected: selected,
        onSelected: (_) => setState(() => _statusFilter = value),
      ),
    );
  }

  Widget _buildBody() {
    if (_loading) return loadingIndicator(message: 'स्कूल लोड हो रहे हैं…');
    if (_error != null && _error!.isNotEmpty && _segment != 0) {
      return SingleChildScrollView(padding: const EdgeInsets.all(16), child: errorBanner(_error!));
    }
    if (_error != null && _error!.isNotEmpty && _schools.isEmpty) {
      return SingleChildScrollView(padding: const EdgeInsets.all(16), child: errorBanner(_error!));
    }

    final list = _segment == 0
        ? _filteredSchools
        : (_segment == 1 ? _registrations : _deleted);

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.separated(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
        itemCount: list.length + 1,
        separatorBuilder: (_, __) => const SizedBox(height: 10),
        itemBuilder: (context, index) {
          if (index == 0) {
            return sectionHeader(
              _segment == 0
                  ? 'स्कूल टेनेंट्स'
                  : (_segment == 1 ? 'पंजीकरण अनुरोध' : 'हटाए गए स्कूल'),
              trailing: 'कुल: ${list.length}',
            );
          }
          final school = list[index - 1];
          return _schoolCard(school, isDeletedSegment: _segment == 2);
        },
      ),
    );
  }

  Widget _schoolCard(SchoolModel t, {bool isDeletedSegment = false}) {
    final isPending = t.isPending;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
            color: isPending
                ? Colors.amber.shade300
                : (isDeletedSegment ? Colors.red.shade200 : Colors.grey.shade200)),
        boxShadow: const [BoxShadow(color: Color(0x05000000), blurRadius: 4)],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(t.schoolName,
                    style:
                        const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
              ),
              smartStatusPill(isPending ? 'Pending_Approval' : t.status,
                  overrideLabel: isPending ? t.regStatusLabel : t.statusLabel),
            ],
          ),
          const SizedBox(height: 6),
          Text('✉ ${t.contactEmail}  •  ☎ ${t.contactPhone}',
              style: const TextStyle(fontSize: 12, color: Colors.black54)),
          Text(
            'Subdomain: ${t.subdomain.isEmpty ? '—' : t.subdomain} • '
            'प्लान: ${t.planName.isEmpty ? t.planId : t.planName}',
            style: const TextStyle(fontSize: 11, color: Colors.grey),
          ),
          if (t.trialEndsAt.isNotEmpty)
            Text('समाप्ति: ${t.trialEndsAt}',
                style: const TextStyle(fontSize: 11, color: Colors.grey)),
          if (t.isProvisionedLive)
            const Padding(
              padding: EdgeInsets.only(top: 4),
              child: Text('🟢 डेडीकेटेड वर्कर लाइव',
                  style: TextStyle(fontSize: 11, color: Color(0xFF047857))),
            ),
          if (t.isProvisioningPending)
            const Padding(
              padding: EdgeInsets.only(top: 4),
              child: Text('🟡 प्रोविज़निंग जारी…',
                  style: TextStyle(fontSize: 11, color: Color(0xFFB45309))),
            ),
          if (t.provisioningError.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text('⚠ ${t.provisioningError}',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 10, color: Color(0xFFBE123C))),
            ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => showSchoolActionsSheet(
                    context: context,
                    school: t,
                    service: _service,
                    onChanged: _load,
                  ),
                  icon: const Icon(Icons.more_horiz, size: 16),
                  label: const Text('कार्रवाई', style: TextStyle(fontSize: 11)),
                ),
              ),
              if (isDeletedSegment) ...[
                const SizedBox(width: 8),
                FilledButton.icon(
                  onPressed: () => _restore(t),
                  style: FilledButton.styleFrom(
                      backgroundColor: const Color(0xFF047857)),
                  icon: const Icon(Icons.restore, size: 16),
                  label: const Text('Restore', style: TextStyle(fontSize: 11)),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }

  Future<void> _restore(SchoolModel t) async {
    final ok = await confirmDialog(
      context,
      title: 'स्कूल वापस लाएं?',
      message: '"${t.schoolName}" को वापस सक्रिय कर दिया जाएगा।',
      confirmText: 'Restore करें',
    );
    if (!ok || !mounted) return;
    try {
      final res = await _service.restoreSchool(t.id);
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
}