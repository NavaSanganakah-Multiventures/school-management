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

  // Builds a route whose screen needs the signed-in user. Falls back to the
  // login screen if auth vanished between redirect and build (e.g. a global
  // 401 fired mid-navigation) instead of crashing on a null assertion.
  GoRoute userRoute(String path, Widget Function(UserModel user) screen) {
    return GoRoute(
      path: path,
      builder: (context, state) {
        final user = ref.read(authControllerProvider);
        if (user == null) return const LoginScreen();
        return screen(user);
      },
    );
  }

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

      // Role dashboards (URL-addressable)
      userRoute('/director/dashboard', (u) => DirectorDashboardScreen(user: u)),
      userRoute('/principal/dashboard', (u) => PrincipalDashboardScreen(user: u)),
      userRoute('/teacher/attendance', (u) => TeacherAttendanceScreen(user: u)),
      userRoute('/parent/portal', (u) => ParentPortalScreen(user: u)),
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
