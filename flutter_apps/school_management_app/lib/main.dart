import 'package:flutter/material.dart';
import 'services/auth_service.dart';
import 'models/user_model.dart';
import 'screens/login_screen.dart';
import 'screens/director_dashboard_screen.dart';
import 'screens/principal_dashboard_screen.dart';
import 'screens/teacher_attendance_screen.dart';
import 'screens/parent_portal_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const VidyaSetuApp());
}

class VidyaSetuApp extends StatelessWidget {
  const VidyaSetuApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'विद्या सेतु (VidyaSetu)',
      debugShowCheckedModeBanner: false,
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
