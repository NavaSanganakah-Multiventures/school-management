import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/auth_provider.dart';
import 'app_router.dart';

/// Logout from anywhere: clears the Riverpod auth state (which also clears
/// the server session + local storage) and navigates to the login screen.
///
/// Works from plain `StatefulWidget`s — no `ConsumerWidget` needed, because
/// it resolves the container from the given context.
Future<void> performLogout(BuildContext context) async {
  final container = ProviderScope.containerOf(context, listen: false);
  await container.read(authControllerProvider.notifier).logout();
  if (context.mounted) {
    container.read(goRouterProvider).go('/login');
  }
}
