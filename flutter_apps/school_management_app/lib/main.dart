import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'services/auth_service.dart';
import 'services/firebase_init.dart';
import 'services/api_client.dart';
import 'models/user_model.dart';
import 'screens/login_screen.dart';
import 'screens/director_dashboard_screen.dart';
import 'screens/principal_dashboard_screen.dart';
import 'screens/teacher_attendance_screen.dart';
import 'screens/parent_portal_screen.dart';

final GlobalKey<NavigatorState> appNavigatorKey = GlobalKey<NavigatorState>();

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Firebase init runs after the first frame (non-blocking, with a timeout),
  // so it never delays app startup on slow networks.
  scheduleFirebaseInit();
  runApp(const PragnyaMitraApp());
}

class PragnyaMitraApp extends StatelessWidget {
  const PragnyaMitraApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Pragnya Mitra',
      debugShowCheckedModeBanner: false,
      navigatorKey: appNavigatorKey,
      theme: ThemeData(
        useMaterial3: true,
        fontFamily: 'Roboto',
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF0284C7),
          primary: const Color(0xFF0284C7),
        ),
        scaffoldBackgroundColor: const Color(0xFFF8FAFC),
      ),
      home: const AuthGatekeeper(),
    );
  }
}

class AuthGatekeeper extends StatefulWidget {
  const AuthGatekeeper({super.key});

  @override
  State<AuthGatekeeper> createState() => _AuthGatekeeperState();
}

class _AuthGatekeeperState extends State<AuthGatekeeper> {
  bool _checking = true;
  UserModel? _user;

  @override
  void initState() {
    super.initState();
    // Wire up the global 401 auto-logout: clear session and bounce to login.
    ApiClient.onAuthFailure = () {
      SchedulerBinding.instance.addPostFrameCallback((_) {
        AuthService().clearCurrentUser();
        appNavigatorKey.currentState?.pushAndRemoveUntil(
          MaterialPageRoute(builder: (_) => const LoginScreen()),
          (_) => false,
        );
      });
    };
    _checkExistingSession();
  }

  Future<void> _checkExistingSession() async {
    final user = await AuthService().getSavedUser();
    if (mounted) {
      setState(() {
        _user = user;
        _checking = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_checking) {
      return const Scaffold(
        backgroundColor: Color(0xFF0F172A),
        body: Center(
          child: CircularProgressIndicator(color: Color(0xFF38BDF8)),
        ),
      );
    }

    if (_user == null) {
      return const LoginScreen();
    }

    // Auto-detect saved role and route directly
    switch (_user!.role) {
      case UserRole.director:
        return DirectorDashboardScreen(user: _user!);
      case UserRole.principal:
        return PrincipalDashboardScreen(user: _user!);
      case UserRole.staff:
        return TeacherAttendanceScreen(user: _user!);
      case UserRole.parents:
      case UserRole.students:
        return ParentPortalScreen(user: _user!);
      case UserRole.superAdmin:
        return const LoginScreen();
    }
  }
}
