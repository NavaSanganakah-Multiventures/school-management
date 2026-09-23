import 'package:flutter/material.dart';
import 'screens/super_admin_home_screen.dart';
import 'screens/super_admin_login_screen.dart';
import 'services/api_client.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const SuperAdminApp());
}

class SuperAdminApp extends StatelessWidget {
  const SuperAdminApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Pragnya Mitra Admin',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        fontFamily: 'Roboto',
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFFE11D48),
          primary: const Color(0xFFE11D48),
        ),
        scaffoldBackgroundColor: const Color(0xFFF8FAFC),
      ),
      home: const AuthGate(),
    );
  }
}

/// Stored token हो तो सीधे कंसोल खोलता है, नहीं तो लॉगिन स्क्रीन।
class AuthGate extends StatefulWidget {
  const AuthGate({super.key});

  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  final _api = SuperAdminApiClient();
  bool _checking = true;
  Map<String, dynamic>? _profile;

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  @override
  void dispose() {
    SuperAdminApiClient.onAuthFailure = null;
    super.dispose();
  }

  Future<void> _bootstrap() async {
    // 401 आने पर लॉगिन स्क्रीन पर वापस भेजें।
    SuperAdminApiClient.onAuthFailure = () {
      if (!mounted) return;
      setState(() {
        _profile = null;
        _checking = false;
      });
    };

    try {
      if (await _api.hasToken()) {
        final user = await _api.fetchCurrentUser();
        if (user.isNotEmpty && user['role'] == 'SuperAdmin') {
          SuperAdminApiClient.onAuthFailure = null;
          if (!mounted) return;
          setState(() {
            _profile = user;
            _checking = false;
          });
          return;
        }
        // Token है पर role SuperAdmin नहीं — token हटाएं।
        await _api.clearAuth();
      }
    } catch (_) {
      // Token अमान्य / नेटवर्क त्रुटि — लॉगिन पर जाएं।
    }
    if (!mounted) return;
    setState(() {
      _profile = null;
      _checking = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_checking) {
      return const Scaffold(
        backgroundColor: Color(0xFF0F172A),
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              CircularProgressIndicator(color: Color(0xFFF43F5E)),
              SizedBox(height: 16),
              Text('सुपर एडमिन कंसोल लोड हो रहा है…',
                  style: TextStyle(color: Color(0xFF94A3B8), fontSize: 12)),
            ],
          ),
        ),
      );
    }
    if (_profile != null) {
      return SuperAdminHomeScreen(adminProfile: _profile!);
    }
    return const SuperAdminLoginScreen();
  }
}