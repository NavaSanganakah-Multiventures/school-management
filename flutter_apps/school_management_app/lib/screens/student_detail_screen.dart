import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/student_model.dart';
import '../models/user_model.dart';
import '../services/student_service.dart';
import '../services/api_client.dart';
import '../widgets/common_widgets.dart';

class StudentDetailScreen extends StatefulWidget {
  final String studentId;
  final String? studentName;
  final UserModel user;

  const StudentDetailScreen({
    super.key,
    required this.studentId,
    required this.user,
    this.studentName,
  });

  @override
  State<StudentDetailScreen> createState() => _StudentDetailScreenState();
}

class _StudentDetailScreenState extends State<StudentDetailScreen> {
  final _svc = StudentService();
  final _formKey = GlobalKey<FormState>();
  bool _loading = true;
  bool _saving = false;
  bool _editing = false;
  String? _error;
  StudentModel? _student;

  final _ctrl = <String, TextEditingController>{};
  bool get _isAdmin => widget.user.role == UserRole.director || widget.user.role == UserRole.principal;

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
      final s = await _svc.getStudent(widget.studentId);
      _student = s;
      _initControllers(s);
      if (mounted) setState(() => _loading = false);
    } on ApiException catch (e) {
      if (mounted) setState(() {
        _error = e.message;
        _loading = false;
      });
    } catch (e) {
      if (mounted) setState(() {
        _error = 'छात्र डेटा लोड नहीं हो सका';
        _loading = false;
      });
    }
  }

  void _initControllers(StudentModel s) {
    _assign('fullName', s.fullName);
    _assign('fatherName', s.fatherName);
    _assign('motherName', s.motherName ?? '');
    _assign('className', s.className);
    _assign('section', s.section ?? '');
    _assign('scholarNumber', s.scholarNumber);
    _assign('rollNumber', s.rollNumber);
    _assign('dob', s.dob ?? '');
    _assign('gender', s.gender ?? '');
    _assign('category', s.category ?? '');
    _assign('religion', s.religion ?? '');
    _assign('parentPhone', s.parentPhone ?? '');
    _assign('whatsappNumber', s.whatsappNumber ?? '');
    _assign('email', s.email ?? '');
    _assign('currentAddress', s.currentAddress ?? '');
    _assign('permanentAddress', s.permanentAddress ?? '');
    _assign('bloodGroup', s.bloodGroup ?? '');
    _assign('aadhaarNumber', s.aadhaarNumber ?? '');
  }

  void _assign(String key, String val) {
    _ctrl[key] ??= TextEditingController();
    _ctrl[key]!.text = val;
  }

  String _v(String key) => _ctrl[key]?.text.trim() ?? '';

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _saving = true);
    try {
      final body = <String, dynamic>{
        'fullName': _v('fullName'),
        'fatherName': _v('fatherName'),
        'className': _v('className'),
        'section': _v('section'),
        'parentPhone': _v('parentPhone'),
      };
      for (final e in [
        'motherName', 'scholarNumber', 'rollNumber', 'dob', 'gender', 'category',
        'religion', 'whatsappNumber', 'email', 'currentAddress', 'permanentAddress',
        'bloodGroup', 'aadhaarNumber',
      ]) {
        if (_v(e).isNotEmpty) body[e] = _v(e);
      }
      await _svc.updateStudent(widget.studentId, body);
      if (mounted) {
        showSnack(context, 'छात्र विवरण अपडेट हो गया');
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

  Future<void> _issueTC() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('TC जारी करें?'),
        content: const Text('क्या आप वाकई इस छात्र के लिए ट्रांसफर सर्टिफिकेट जारी करना चाहते हैं? यह क्रिया छात्र को निष्क्रिय कर देगी।'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('रद्द करें')),
          FilledButton(
            onPressed: () => Navigator.pop(c, true),
            style: FilledButton.styleFrom(backgroundColor: Colors.red.shade700),
            child: const Text('TC जारी करें'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await _svc.issueTC(widget.studentId, {});
      if (mounted) {
        showSnack(context, 'TC जारी हो गया');
        _load();
      }
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.message, isError: true);
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
        title: Text(_student?.fullName ?? widget.studentName ?? 'छात्र विवरण',
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
        backgroundColor: const Color(0xFF1E3A8A),
        foregroundColor: Colors.white,
        actions: [
          if (_student != null && _isAdmin && !_editing)
            IconButton(
              icon: const Icon(Icons.edit),
              tooltip: 'संपादित करें',
              onPressed: () => setState(() => _editing = true),
            ),
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: 'ताज़ा करें',
            onPressed: _load,
          ),
        ],
      ),
      body: _loading
          ? const LoadingView()
          : _error != null
              ? ErrorRetryView(message: _error!, onRetry: _load)
              : ResponsiveCenter(
                  child: _editing ? _buildEditForm() : _buildView(),
                ),
    );
  }

  Widget _buildView() {
    final s = _student!;
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFF1E40AF), Color(0xFF3B82F6)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(18),
            ),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 30,
                  backgroundColor: Colors.white24,
                  child: Text(
                    s.fullName.isNotEmpty ? s.fullName[0].toUpperCase() : '?',
                    style: const TextStyle(fontSize: 26, color: Colors.white, fontWeight: FontWeight.bold),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(s.fullName, style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                      const SizedBox(height: 2),
                      Text('${s.className}${s.section != null && s.section!.isNotEmpty ? ' • ${s.section}' : ''}',
                          style: const TextStyle(color: Colors.white70, fontSize: 12)),
                      const SizedBox(height: 4),
                      StatusChip(status: s.status),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          _section('व्यक्तिगत विवरण', [
            _infoRow('छात्र का नाम', s.fullName),
            _infoRow('पिता का नाम', s.fatherName),
            if (s.motherName != null) _infoRow('माता का नाम', s.motherName!),
            if (s.dob != null) _infoRow('जन्म तिथि', s.dob!),
            if (s.gender != null) _infoRow('लिंग', s.gender!),
            if (s.bloodGroup != null) _infoRow('रक्त समूह', s.bloodGroup!),
            if (s.religion != null) _infoRow('धर्म', s.religion!),
            if (s.category != null) _infoRow('वर्ग', s.category!),
          ]),
          _section('संपर्क विवरण', [
            _infoRow('अभिभावक फ़ोन', s.parentPhone ?? '-'),
            if (s.whatsappNumber != null) _infoRow('व्हाट्सएप नंबर', s.whatsappNumber!),
            if (s.email != null) _infoRow('ईमेल', s.email!),
            if (s.currentAddress != null) _infoRow('पता', s.currentAddress!),
          ]),
          _section('शैक्षणिक विवरण', [
            _infoRow('स्कॉलर नंबर', s.scholarNumber.isEmpty ? '-' : s.scholarNumber),
            _infoRow('कक्षा', s.className),
            if (s.section != null) _infoRow('अनुभाग', s.section!),
            _infoRow('रोल नंबर', s.rollNumber.isEmpty ? '-' : s.rollNumber),
            if (s.admissionDate != null) _infoRow('प्रवेश तिथि', s.admissionDate!),
          ]),
          if (s.parentPhone != null && s.parentPhone!.isNotEmpty) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => _launch('tel:${s.parentPhone}'),
                    icon: const Icon(Icons.phone, size: 18),
                    label: const Text('कॉल', style: TextStyle(fontSize: 12)),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => _launch('https://wa.me/${s.parentPhone!.replaceAll(RegExp(r'[^0-9]'), '')}'),
                    icon: const Icon(Icons.chat, color: Colors.green, size: 18),
                    label: const Text('व्हाट्सएप', style: TextStyle(fontSize: 12)),
                  ),
                ),
              ],
            ),
          ],
          if (_isAdmin && s.status.toLowerCase() == 'active') ...[
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: _issueTC,
              icon: const Icon(Icons.assignment_return, color: Colors.red, size: 18),
              label: const Text('TC जारी करें', style: TextStyle(color: Colors.red, fontSize: 12)),
              style: OutlinedButton.styleFrom(side: BorderSide(color: Colors.red.shade300)),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildEditForm() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const SectionTitle('छात्र विवरण संपादित करें', icon: Icons.edit),
            const SizedBox(height: 16),
            _field('fullName', 'छात्र का नाम *', required: true),
            _field('fatherName', 'पिता का नाम *', required: true),
            _field('motherName', 'माता का नाम'),
            _field('className', 'कक्षा *', required: true),
            _field('section', 'अनुभाग'),
            _field('scholarNumber', 'स्कॉलर नंबर'),
            _field('rollNumber', 'रोल नंबर'),
            _field('dob', 'जन्म तिथि (YYYY-MM-DD)'),
            _field('gender', 'लिंग'),
            _field('parentPhone', 'अभिभावक फ़ोन'),
            _field('whatsappNumber', 'व्हाट्सएप नंबर'),
            _field('email', 'ईमेल'),
            _field('currentAddress', 'पता', maxLines: 2),
            _field('bloodGroup', 'रक्त समूह'),
            _field('aadhaarNumber', 'आधार नंबर'),
            const SizedBox(height: 20),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: _saving ? null : () => setState(() => _editing = false),
                    child: const Text('रद्द करें'),
                  ),
                ),
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
      ),
    );
  }

  Widget _field(String key, String label, {bool required = false, int maxLines = 1}) {
    _assign(key, _ctrl[key]?.text ?? '');
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextFormField(
        controller: _ctrl[key],
        maxLines: maxLines,
        decoration: InputDecoration(
          labelText: label,
          border: const OutlineInputBorder(),
          isDense: true,
        ),
        validator: required ? (v) => (v == null || v.trim().isEmpty) ? 'आवश्यक' : null : null,
      ),
    );
  }

  Widget _section(String title, List<Widget> children) {
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.grey.shade200),
      ),
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

  Widget _infoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Flexible(child: Text(label, style: const TextStyle(fontSize: 12, color: Colors.grey))),
          const SizedBox(width: 12),
          Flexible(
            child: Text(value, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold), textAlign: TextAlign.right),
          ),
        ],
      ),
    );
  }

  void _launch(String url) async {
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) await launchUrl(uri, mode: url.contains('wa.me') ? LaunchMode.externalApplication : LaunchMode.platformDefault);
  }
}
