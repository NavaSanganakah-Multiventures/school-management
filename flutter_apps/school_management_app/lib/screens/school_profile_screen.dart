import 'package:flutter/material.dart';
import '../models/school_profile_model.dart';
import '../models/user_model.dart';
import '../services/school_profile_service.dart';
import '../services/api_client.dart';
import '../widgets/common_widgets.dart';

class SchoolProfileScreen extends StatefulWidget {
  final UserModel user;
  const SchoolProfileScreen({super.key, required this.user});

  @override
  State<SchoolProfileScreen> createState() => _SchoolProfileScreenState();
}

class _SchoolProfileScreenState extends State<SchoolProfileScreen> {
  final _svc = SchoolProfileService();
  bool _loading = true;
  bool _saving = false;
  bool _editing = false;
  String? _error;
  SchoolProfileModel? _profile;
  final _ctrl = <String, TextEditingController>{};
  bool get _isAdmin => widget.user.role == UserRole.director;

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
      _profile = await _svc.getProfile();
      _initControllers(_profile!);
      if (mounted) setState(() => _loading = false);
    } on ApiException catch (e) {
      if (mounted) setState(() {
        _error = e.message;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() {
        _error = 'प्रोफ़ाइल लोड नहीं हो सका';
        _loading = false;
      });
    }
  }

  void _initControllers(SchoolProfileModel p) {
    _assign('schoolName', p.schoolName);
    _assign('affiliationNumber', p.affiliationNumber ?? '');
    _assign('boardName', p.boardName ?? '');
    _assign('schoolCode', p.schoolCode ?? '');
    _assign('email', p.email ?? '');
    _assign('phone', p.phone ?? '');
    _assign('alternatePhone', p.alternatePhone ?? '');
    _assign('address', p.address ?? '');
    _assign('city', p.city ?? '');
    _assign('state', p.state ?? '');
    _assign('pincode', p.pincode ?? '');
    _assign('academicSession', p.academicSession ?? '');
    _assign('directorName', p.directorName ?? '');
    _assign('principalName', p.principalName ?? '');
  }

  void _assign(String k, String v) {
    _ctrl[k] ??= TextEditingController();
    _ctrl[k]!.text = v;
  }

  String _v(String k) => _ctrl[k]?.text.trim() ?? '';

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      final body = <String, dynamic>{};
      for (final k in [
        'schoolName', 'affiliationNumber', 'boardName', 'schoolCode', 'email',
        'phone', 'alternatePhone', 'address', 'city', 'state', 'pincode',
        'academicSession', 'directorName', 'principalName',
      ]) {
        if (_v(k).isNotEmpty) body[k] = _v(k);
      }
      await _svc.updateProfile(body);
      if (mounted) {
        showSnack(context, 'प्रोफ़ाइल अपडेट हो गया');
        setState(() {
          _editing = false;
          _saving = false;
        });
        _load();
      }
    } on ApiException catch (e) {
      if (mounted) {
        showSnack(context, e.message, isError: true);
        setState(() => _saving = false);
      }
    } catch (_) {
      if (mounted) {
        showSnack(context, 'अपडेट विफल', isError: true);
        setState(() => _saving = false);
      }
    }
  }

  @override
  void dispose() {
    for (final c in _ctrl.values) c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('विद्यालय प्रोफ़ाइल', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
        backgroundColor: const Color(0xFF1E3A8A),
        foregroundColor: Colors.white,
        actions: [
          if (_profile != null && _isAdmin && !_editing)
            IconButton(icon: const Icon(Icons.edit), onPressed: () => setState(() => _editing = true)),
          IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
        ],
      ),
      body: _loading
          ? const LoadingView()
          : _error != null
              ? ErrorRetryView(message: _error!, onRetry: _load)
              : ResponsiveCenter(
                  child: _editing ? _buildEdit() : _buildView(),
                ),
    );
  }

  Widget _buildView() {
    final p = _profile!;
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              gradient: const LinearGradient(colors: [Color(0xFF1E40AF), Color(0xFF2563EB)]),
              borderRadius: BorderRadius.circular(18),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(p.schoolName, style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
                if (p.boardName != null) Text(p.boardName!, style: const TextStyle(color: Colors.white70, fontSize: 12)),
              ],
            ),
          ),
          const SizedBox(height: 16),
          _section('पहचान', [
            _info('विद्यालय नाम', p.schoolName),
            if (p.affiliationNumber != null) _info('संबंध नंबर', p.affiliationNumber!),
            if (p.boardName != null) _info('बोर्ड', p.boardName!),
            if (p.schoolCode != null) _info('विद्यालय कोड', p.schoolCode!),
            if (p.academicSession != null) _info('शैक्षणिक सत्र', p.academicSession!),
          ]),
          _section('संपर्क', [
            if (p.phone != null) _info('फ़ोन', p.phone!),
            if (p.alternatePhone != null) _info('वैकल्पिक फ़ोन', p.alternatePhone!),
            if (p.email != null) _info('ईमेल', p.email!),
          ]),
          _section('पता', [
            if (p.address != null) _info('पता', p.address!),
            if (p.city != null) _info('शहर', p.city!),
            if (p.state != null) _info('राज्य', p.state!),
            if (p.pincode != null) _info('पिन कोड', p.pincode!),
          ]),
          _section('प्रशासन', [
            if (p.directorName != null) _info('निदेशक', p.directorName!),
            if (p.principalName != null) _info('प्रधानाचार्य', p.principalName!),
          ]),
        ],
      ),
    );
  }

  Widget _buildEdit() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SectionTitle('विद्यालय प्रोफ़ाइल संपादित करें', icon: Icons.edit),
          const SizedBox(height: 16),
          _field('schoolName', 'विद्यालय नाम'),
          _field('affiliationNumber', 'संबंध नंबर'),
          _field('boardName', 'बोर्ड'),
          _field('schoolCode', 'विद्यालय कोड'),
          _field('email', 'ईमेल'),
          _field('phone', 'फ़ोन'),
          _field('alternatePhone', 'वैकल्पिक फ़ोन'),
          _field('address', 'पता', maxLines: 2),
          _field('city', 'शहर'),
          _field('state', 'राज्य'),
          _field('pincode', 'पिन कोड'),
          _field('academicSession', 'शैक्षणिक सत्र'),
          _field('directorName', 'निदेशक'),
          _field('principalName', 'प्रधानाचार्य'),
          const SizedBox(height: 20),
          Row(
            children: [
              Expanded(child: OutlinedButton(onPressed: _saving ? null : () => setState(() => _editing = false), child: const Text('रद्द करें'))),
              const SizedBox(width: 10),
              Expanded(
                child: FilledButton.icon(
                  onPressed: _saving ? null : _save,
                  icon: _saving
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : const Icon(Icons.save, size: 18),
                  label: const Text('सहेजें'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _field(String k, String label, {int maxLines = 1}) {
    _assign(k, _ctrl[k]?.text ?? '');
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextField(
        controller: _ctrl[k],
        maxLines: maxLines,
        decoration: InputDecoration(labelText: label, border: const OutlineInputBorder(), isDense: true),
      ),
    );
  }

  Widget _section(String title, List<Widget> children) {
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: Colors.grey.shade200)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: Color(0xFF1E3A8A))),
          const Divider(height: 14),
          ...children,
        ],
      ),
    );
  }

  Widget _info(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Flexible(child: Text(label, style: const TextStyle(fontSize: 12, color: Colors.grey))),
          const SizedBox(width: 12),
          Flexible(child: Text(value, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold), textAlign: TextAlign.right)),
        ],
      ),
    );
  }
}
