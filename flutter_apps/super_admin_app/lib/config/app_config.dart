import 'package:flutter/foundation.dart';

class AppConfig {
  /// Super Admin console की API base URL।
  ///
  /// Web पर same-origin रखा गया है ताकि console चाहे pragnya.nasven.com से
  /// serve हो या admin.pragnya.nasven.com से, API calls बिना CORS के उसी origin
  /// पर जाएँ (दोनों workers एक ही production D1 पर हैं)। Mobile/desktop
  /// (Android/iOS) build के लिए platform origin पर fallback।
  static String get apiBaseUrl {
    if (kIsWeb) {
      final origin = Uri.base.origin;
      if (origin.isNotEmpty && origin != 'null') return origin;
    }
    return 'https://pragnya.nasven.com';
  }

  static const String appName = 'Pragnya Mitra Admin';
  static const String appVersion = '1.0.0';
}