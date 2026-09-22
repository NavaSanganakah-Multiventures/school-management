import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:pragnya_shared/pragnya_shared.dart';
import '../providers/auth_provider.dart';
import '../screens/login_screen.dart';
import '../screens/director_dashboard_screen.dart';
import '../screens/principal_dashboard_screen.dart';
import '../screens/teacher_attendance_screen.dart';
import '../screens/parent_portal_screen.dart';

/// Global navigator key so the ApiClient 401 handler can navigate to login
/// without a BuildContext.
final GlobalKey<NavigatorState> rootNavigatorKey = GlobalKey<NavigatorState>();

/// Notifies go_router to re-run `redirect` whenever the auth state changes.
class _AuthRefresh extends ChangeNotifier {
  void ping() => notifyListeners();
}

final goRouterProvider = Provider<GoRouter>((ref) {
  // Re-evaluate redirect on login/logout/global-401 — without rebuilding
  // the router itself (which would reset its internal navigation state).
  final authRefresh = _AuthRefresh();
  final sub = ref.listen(
    authControllerProvider,
    (_, __) => authRefresh.ping(),
  );
  ref.onDispose(() {
    sub.close();
    authRefresh.dispose();
  });

  return GoRouter(
    navigatorKey: rootNavigatorKey,
    initialLocation: '/login',
    debugLogDiagnostics: kDebugMode,
    refreshListenable: authRefresh,
    redirect: (context, state) {
      final user = ref.read(authControllerProvider);
      final loc = state.matchedLocation;

      // Not logged in → only /login is reachable.
      if (user == null) {
        return loc == '/login' ? null : '/login';
      }

      // Logged in → /login always bounces to the role dashboard.
      if (loc == '/login' || loc == '/') {
        return dashboardPathForRole(user.role);
      }

      // SuperAdmins must use the dedicated super_admin_app.
      if (user.role == UserRole.superAdmin && !loc.startsWith('/superadmin')) {
        return '/login';
      }

      return null;
    },
    routes: [
      GoRoute(
        path: '/login',
        builder: (context, state) => const LoginScreen(),
      ),

      // ── Director ──────────────────────────────────────────────
      GoRoute(
        path: '/director/dashboard',
        builder: (context, state) => DirectorDashboardScreen(
          user: ref.read(authControllerProvider)!,
        ),
      ),

      // ── Principal ─────────────────────────────────────────────
      GoRoute(
        path: '/principal/dashboard',
        builder: (context, state) => PrincipalDashboardScreen(
          user: ref.read(authControllerProvider)!,
        ),
      ),

      // ── Teacher / Staff ───────────────────────────────────────
      GoRoute(
        path: '/teacher/attendance',
        builder: (context, state) => TeacherAttendanceScreen(
          user: ref.read(authControllerProvider)!,
        ),
      ),

      // ── Parent / Student ──────────────────────────────────────
      GoRoute(
        path: '/parent/portal',
        builder: (context, state) => ParentPortalScreen(
          user: ref.read(authControllerProvider)!,
        ),
      ),
    ],
    errorBuilder: (context, state) => Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline, size: 48, color: Colors.grey),
            const SizedBox(height: 12),
            Text('पेज नहीं मिला: ${state.matchedLocation}'),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: () => context.go('/login'),
              child: const Text('लॉगिन पर लौटें'),
            ),
          ],
        ),
      ),
    ),
  );
});
