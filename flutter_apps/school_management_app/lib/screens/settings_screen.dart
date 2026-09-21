import 'package:flutter/material.dart';
import '../config/app_config.dart';
import '../models/user_model.dart';
import '../services/auth_service.dart';
import '../widgets/common_widgets.dart';
import 'login_screen.dart';
class SettingsScreen extends StatefulWidget {
  final UserModel user;
  const SettingsScreen({super.key, required this.user});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final _urlCtrl = TextEditingController();
  final _domainCtrl = TextEditingController();
  String _currentServer = AppConfig.defaultApiBaseUrl;
  String? _currentDomain;

  @override
  void initState() {
    super.initState();
    _loadConfig();
  }

  Future<void> _loadConfig() async {
    _currentServer = await AppConfig.getActiveBaseUrl();
    _currentDomain = await AppConfig.getSchoolDomain();
    _urlCtrl.text = _currentServer;
    _domainCtrl.text = _currentDomain ?? '';
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _urlCtrl.dispose();
    _domainCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('सेटिंग्स', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
        backgroundColor: const Color(0xFF334155),
        foregroundColor: Colors.white,
      ),
      body: ResponsiveCenter(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Profile card
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: Colors.grey.shade200),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        CircleAvatar(
                          radius: 26,
                          backgroundColor: const Color(0xFF334155).withValues(alpha: 0.1),
                          child: Icon(Icons.person, color: const Color(0xFF334155), size: 28),
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(widget.user.fullName, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                              Text(widget.user.email, style: const TextStyle(fontSize: 12, color: Colors.grey)),
                              Text(roleToDisplayName(widget.user.role), style: const TextStyle(fontSize: 11, color: Colors.grey)),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),

              // Server config
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: Colors.grey.shade200),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SectionTitle('सर्वर कॉन्फ़िगरेशन', icon: Icons.dns),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _urlCtrl,
                      decoration: const InputDecoration(
                        labelText: 'API बेस URL',
                        border: OutlineInputBorder(),
                        isDense: true,
                        helperText: 'प्रत्यक्ष डोमेन (जैसे https://dps.pragnya.nasven.com)',
                      ),
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      controller: _domainCtrl,
                      decoration: const InputDecoration(
                        labelText: 'स्कूल सबडोमेन/स्लग',
                        border: OutlineInputBorder(),
                        isDense: true,
                        helperText: 'जैसे dps या dps.pragnya.nasven.com',
                      ),
                    ),
                    const SizedBox(height: 12),
                    Wrap(
                      spacing: 8,
                      children: [
                        ActionChip(
                          label: const Text('प्लेटफ़ॉर्म डिफ़ॉल्ट'),
                          onPressed: () {
                            _urlCtrl.text = AppConfig.defaultApiBaseUrl;
                            _domainCtrl.clear();
                          },
                        ),
                        ActionChip(
                          label: const Text('लोकल देव'),
                          onPressed: () {
                            _urlCtrl.text = 'http://10.0.2.2:8787';
                          },
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: () async {
                              await AppConfig.resetToDefault();
                              await _loadConfig();
                              showSnack(context, 'डिफ़ॉल्ट पर रीसेट');
                            },
                            icon: const Icon(Icons.restart_alt, size: 18),
                            label: const Text('रीसेट'),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: FilledButton.icon(
                            onPressed: () async {
                              final domain = _domainCtrl.text.trim();
                              final newUrl = domain.isNotEmpty ? null : _urlCtrl.text.trim();
                              final prevServer = _currentServer;
                              final prevDomain = _currentDomain;
                              if (domain.isNotEmpty) {
                                await AppConfig.setSchoolSubdomainOrDomain(domain);
                              } else {
                                await AppConfig.setCustomBaseUrl(_urlCtrl.text.trim());
                              }
                              await _loadConfig();
                              // If the host actually changed, invalidate the
                              // old JWT so it is not leaked to the new server,
                              // and force a fresh login.
                              final hostChanged = _currentServer != prevServer || _currentDomain != prevDomain;
                              if (hostChanged && newUrl != null) {
                                await AuthService().logout();
                                showSnack(context, 'सर्वर बदला। कृपया पुनः लॉगिन करें।');
                                if (context.mounted) {
                                  Navigator.of(context).pushAndRemoveUntil(
                                    MaterialPageRoute(builder: (_) => const LoginScreen()),
                                    (_) => false,
                                  );
                                }
                              } else {
                                showSnack(context, 'सहेजा गया। लॉगिन करें।');
                              }
                            },
                            icon: const Icon(Icons.save, size: 18),
                            label: const Text('सहेजें'),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text('सक्रिय सर्वर: $_currentServer', style: const TextStyle(fontSize: 11, color: Colors.grey)),
                  ],
                ),
              ),
              const SizedBox(height: 16),

              // About
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: Colors.grey.shade200),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SectionTitle('ऐप के बारे में', icon: Icons.info),
                    const SizedBox(height: 8),
                    _row('ऐप', AppConfig.appName),
                    _row('वर्शन', AppConfig.appVersion),
                    _row('स्कूल ID', widget.user.schoolId),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              OutlinedButton.icon(
                style: OutlinedButton.styleFrom(foregroundColor: Colors.red.shade700, side: BorderSide(color: Colors.red.shade300)),
                onPressed: () async {
                  await AuthService().logout();
                  if (context.mounted) {
                    Navigator.of(context).pushAndRemoveUntil(
                      MaterialPageRoute(builder: (_) => const LoginScreen()),
                      (_) => false,
                    );
                  }
                },
                icon: const Icon(Icons.logout),
                label: const Text('लॉगआउट'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _row(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(fontSize: 12, color: Colors.grey)),
          Text(value, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }
}
