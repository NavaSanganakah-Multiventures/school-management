import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:pragnya_shared/pragnya_shared.dart';
import '../services/auth_service.dart';

/// Session-restore seed for [authControllerProvider].
///
/// Overridden in `main()` with the user read from secure storage *before*
/// the first frame, so the router's very first redirect already knows the
/// signed-in role (no splash-route round-trip needed).
final initialUserProvider = Provider<UserModel?>((ref) => null);

/// Holds the currently authenticated user (null = not logged in).
///
/// This is the single source of truth for auth state, used by both the
/// go_router redirect logic and the screens themselves.
class AuthController extends StateNotifier<UserModel?> {
  AuthController(super.initialUser);

  /// Restore the saved session (called once at startup).
  Future<void> loadSavedUser() async {
    state = await AuthService().getSavedUser();
  }

  /// Set after a successful login.
  Future<void> setUser(UserModel user) async {
    AuthService().cacheUser(user);
    state = user;
  }

  /// Full logout: clears server session + local storage + state.
  Future<void> logout() async {
    await AuthService().logout();
    state = null;
  }

  /// Local-only clear (used by the global 401 handler).
  void clear() {
    AuthService().clearCurrentUser();
    state = null;
  }
}

final authControllerProvider =
    StateNotifierProvider<AuthController, UserModel?>((ref) {
  return AuthController(ref.watch(initialUserProvider));
});

/// Dashboard path for a given role — used by the router redirect.
String dashboardPathForRole(UserRole role) {
  switch (role) {
    case UserRole.director:
      return '/director/dashboard';
    case UserRole.principal:
      return '/principal/dashboard';
    case UserRole.staff:
      return '/teacher/attendance';
    case UserRole.parents:
    case UserRole.students:
      return '/parent/portal';
    case UserRole.superAdmin:
      // Super admins use the dedicated super_admin_app.
      return '/login';
  }
}
