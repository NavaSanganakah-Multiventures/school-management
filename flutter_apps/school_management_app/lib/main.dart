import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'firebase_options.dart';
import 'providers/auth_provider.dart';
import 'routes/app_router.dart';
import 'services/api_client.dart';
import 'services/auth_service.dart';

/// Wires the ApiClient's global 401 handler to Riverpod + go_router.
///
/// Kept in a Provider so it is installed exactly once, and torn down if the
/// root provider tree is ever disposed.
final _authFailureWireProvider = Provider<void>((ref) {
  ApiClient.onAuthFailure = () {
    // The HTTP callback fires outside the widget tree — hop back onto the
    // framework's frame callback before touching providers/navigator.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final ctx = rootNavigatorKey.currentContext;
      if (ctx == null) return; // App not built yet — nothing to redirect.
      final container = ProviderScope.containerOf(ctx, listen: false);
      container.read(authControllerProvider.notifier).clear();
      container.read(goRouterProvider).go('/login');
    });
  };
  ref.onDispose(() => ApiClient.onAuthFailure = null);
});

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Firebase (Android/iOS/Web) — non-fatal: the app still works without it
  // (FCM service already guards its own failures).
  try {
    await Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
    );
  } catch (e) {
    debugPrint('[Firebase] init skipped: $e');
  }

  // Restore the saved session *before* the first frame so the router's
  // initial redirect already knows the user's role.
  final savedUser = await AuthService().getSavedUser();

  runApp(
    ProviderScope(
      overrides: [initialUserProvider.overrideWithValue(savedUser)],
      child: const PragnyaMitraApp(),
    ),
  );
}

class PragnyaMitraApp extends ConsumerWidget {
  const PragnyaMitraApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Install the global 401 → logout/redirect wiring (once).
    ref.watch(_authFailureWireProvider);
    final router = ref.watch(goRouterProvider);

    return MaterialApp.router(
      title: 'Pragnya Mitra',
      debugShowCheckedModeBanner: false,
      routerConfig: router,
      theme: ThemeData(
        useMaterial3: true,
        fontFamily: 'Roboto',
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF0284C7),
          primary: const Color(0xFF0284C7),
        ),
        scaffoldBackgroundColor: const Color(0xFFF8FAFC),
      ),
    );
  }
}
