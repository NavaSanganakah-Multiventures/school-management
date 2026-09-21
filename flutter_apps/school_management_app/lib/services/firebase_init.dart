import 'dart:async';
import 'dart:convert';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'api_client.dart';

/// Initializes Firebase using the web config served by the backend
/// (GET /api/config/ -> firebaseWebConfig, which is a JSON string).
/// Runs after the first frame so it never blocks app startup. Falls back
/// gracefully (no-op) when Firebase is unavailable.
void scheduleFirebaseInit() {
  // Defer until after the first frame so the UI renders immediately.
  WidgetsBinding.instance.addPostFrameCallback((_) => _initFirebase());
}

Future<void> _initFirebase() async {
  try {
    if (Firebase.apps.isNotEmpty) return;
    final api = ApiClient();
    final res = await api.get('/api/config/').timeout(const Duration(seconds: 4));
    final raw = res is Map ? res['firebaseWebConfig'] : null;
    Map<String, dynamic>? config;
    if (raw is String) {
      try {
        config = jsonDecode(raw) as Map<String, dynamic>?;
      } catch (_) {
        config = null;
      }
    } else if (raw is Map) {
      config = Map<String, dynamic>.from(raw);
    }
    if (config != null && config['apiKey'] != null) {
      final options = FirebaseOptions(
        apiKey: config['apiKey'].toString(),
        appId: config['appId']?.toString() ?? '',
        messagingSenderId: config['messagingSenderId']?.toString() ?? '',
        projectId: config['projectId']?.toString() ?? '',
        authDomain: config['authDomain']?.toString(),
        storageBucket: config['storageBucket']?.toString(),
        measurementId: config['measurementId']?.toString(),
      );
      await Firebase.initializeApp(options: options);
      if (kDebugMode) debugPrint('[Firebase] initialized from server config');
    } else if (kDebugMode) {
      debugPrint('[Firebase] no web config from server; FCM will be skipped');
    }
  } catch (e) {
    if (kDebugMode) debugPrint('[Firebase] init failed: $e');
  }
}
