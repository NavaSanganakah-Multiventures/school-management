import 'package:flutter/material.dart';
import '../services/api_client.dart';

/// Public "New School Registration" screen — new schools can sign up from the
/// management portal (pragnya.nasven.com). Registration creates the tenant with
/// Pending_Approval status; the Super Admin approves it from the console, and
/// the school's dedicated portal is provisioned automatically.
class SchoolRegistrationScreen extends StatefulWidget {
  const SchoolRegistrationScreen({super.key});

  @override
  State<SchoolRegistrationScreen> createState() => _SchoolRegistrationScreenState();
}

class _SchoolRegistrationScreenState extends State<SchoolRegistrationScreen> {
  final _api = SuperAdminApiClient();

  final _schoolName = TextEditingController();
  final _directorName = TextEditingController();
  final _email = TextEditingController();
  final _phone = TextEditingController();
  final _password = TextEditingController();
  final _estimatedStudents = TextEditingController();
  final _estimatedStaff = TextEditingController();
  final _subdomain = TextEditingController();

  String _preferredPlan = 'trial';
  bool _isLoading = false;
  String? _errorMessage;
  String? _successMessage;
  String? _registeredSchoolId;

  Future<void> _handleRegister() async {
    final schoolName = _schoolName.text.trim();
    final directorName = _directorName.text.trim();
    final email = _email.text.trim().toLowerCase();
    final phone = _phone.text.trim();
    final password = _password.text.trim();

    if (schoolName.isEmpty ||
        directorName.isEmpty ||
        email.isEmpty ||
        phone.isEmpty ||
        password.isEmpty) {
      setState(() => _errorMessage = 'स्कूल का नाम, डायरेक्टर का नाम, ईमेल, फोन और पासवर्ड अनिवार्य हैं।');
      return;
    }
    if (password.length < 6) {
      setState(() => _errorMessage = 'पासवर्ड कम से कम 6 अक्षरों का होना चाहिए।');
      return;
    }

    setState(() {
      _isLoading = true;
      _errorMessage = null;
      _successMessage = null;
    });

    try {
      final res = await _api.post('/api/auth/register', body: {
        'schoolName': schoolName,
        'directorName': directorName,
        'email': email,
        'phone': phone,
        'password': password,
        'subdomain': _subdomain.text.trim(),
        'estimatedStudents': int.tryParse(_estimatedStudents.text.trim()) ?? 0,
        'estimatedStaff': int.tryParse(_estimatedStaff.text.trim()) ?? 0,
        'preferredPlanId': _preferredPlan,
      });

      if (res['success'] == true) {
        setState(() {
          _successMessage = res['message'] ?? 'स्कूल पंजीकरण अनुरोध प्राप्त हुआ।';
          _registeredSchoolId = res['schoolId']?.toString();
          _errorMessage = null;
        });
      } else {
        throw Exception(res['message'] ?? 'पंजीकरण असफल रहा।');
      }
    } catch (e) {
      setState(() => _errorMessage = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0F172A),
        foregroundColor: Colors.white,
        title: const Text('नया स्कूल पंजीकरण'),
      ),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 520),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text(
                    'Pragnya Mitra — स्कूल रजिस्ट्रेशन',
                    style: TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'रजिस्ट्रेशन के बाद Super Admin अनुमोदन पर आपके स्कूल का निजी पोर्टल स्वतः बन जाएगा।',
                    style: TextStyle(color: Color(0xFF94A3B8), fontSize: 13),
                  ),
                  const SizedBox(height: 24),

                  if (_successMessage != null) ...[
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: const Color(0xFFECFDF5),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: const Color(0xFF34D399)),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Row(
                            children: [
                              Icon(Icons.check_circle, color: Color(0xFF059669)),
                              SizedBox(width: 8),
                              Text('पंजीकरण सफल', style: TextStyle(color: Color(0xFF065F46), fontWeight: FontWeight.bold)),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Text(_successMessage!, style: const TextStyle(color: Color(0xFF065F46), fontSize: 13)),
                          if (_registeredSchoolId != null) ...[
                            const SizedBox(height: 4),
                            Text('स्कूल संदर्भ ID: $_registeredSchoolId',
                                style: const TextStyle(color: Color(0xFF065F46), fontSize: 12, fontWeight: FontWeight.w600)),
                          ],
                          const SizedBox(height: 12),
                          OutlinedButton(
                            onPressed: () => Navigator.of(context).pop(),
                            child: const Text('लॉगिन पर लौटें'),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                  ],

                  if (_errorMessage != null) ...[
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: const Color(0xFFFFF1F2),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        _errorMessage!,
                        style: const TextStyle(color: Color(0xFFBE123C), fontSize: 13),
                      ),
                    ),
                    const SizedBox(height: 16),
                  ],

                  Container(
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        TextField(
                          controller: _schoolName,
                          decoration: _dec('स्कूल का नाम *', Icons.school),
                        ),
                        const SizedBox(height: 14),
                        TextField(
                          controller: _directorName,
                          decoration: _dec('डायरेक्टर / प्रधानाचार्य का नाम *', Icons.person),
                        ),
                        const SizedBox(height: 14),
                        TextField(
                          controller: _email,
                          keyboardType: TextInputType.emailAddress,
                          decoration: _dec('ईमेल *', Icons.email),
                        ),
                        const SizedBox(height: 14),
                        TextField(
                          controller: _phone,
                          keyboardType: TextInputType.phone,
                          decoration: _dec('फोन *', Icons.phone),
                        ),
                        const SizedBox(height: 14),
                        TextField(
                          controller: _password,
                          obscureText: true,
                          decoration: _dec('पासवर्ड (कम से कम 6 अक्षर) *', Icons.lock),
                        ),
                        const SizedBox(height: 14),
                        TextField(
                          controller: _subdomain,
                          decoration: _dec('उप-डोमेन (वैकल्पिक, जैसे my-school)', Icons.link),
                        ),
                        const SizedBox(height: 14),
                        Row(
                          children: [
                            Expanded(
                              child: TextField(
                                controller: _estimatedStudents,
                                keyboardType: TextInputType.number,
                                decoration: _dec('अनुमानित छात्र', Icons.groups),
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: TextField(
                                controller: _estimatedStaff,
                                keyboardType: TextInputType.number,
                                decoration: _dec('अनुमानित स्टाफ', Icons.badge),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 14),
                        DropdownButtonFormField<String>(
                          initialValue: _preferredPlan,
                          decoration: _dec('पसंदीदा योजना (वैकल्पिक)', Icons.workspace_premium),
                          items: const [
                            DropdownMenuItem(value: 'trial', child: Text('7-दिन फ्री ट्रायल')),
                            DropdownMenuItem(value: 'starter', child: Text('Starter')),
                            DropdownMenuItem(value: 'pro', child: Text('Pro')),
                            DropdownMenuItem(value: 'enterprise', child: Text('Enterprise')),
                          ],
                          onChanged: (v) => setState(() => _preferredPlan = v ?? 'trial'),
                        ),
                        const SizedBox(height: 24),
                        ElevatedButton(
                          onPressed: _isLoading ? null : _handleRegister,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFFE11D48),
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(vertical: 14),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          ),
                          child: _isLoading
                              ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                              : const Text('स्कूल रजिस्टर करें →', style: TextStyle(fontWeight: FontWeight.bold)),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  InputDecoration _dec(String label, IconData icon) {
    return InputDecoration(
      labelText: label,
      prefixIcon: Icon(icon, size: 20),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
      filled: true,
      fillColor: const Color(0xFFF8FAFC),
      isDense: true,
    );
  }
}