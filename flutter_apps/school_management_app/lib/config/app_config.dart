import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class AppConfig {
  // Official Central Cloudflare Workers Platform base URL
  static const String defaultApiBaseUrl = 'https://pragnya.nasven.com';
  
  static const String appName = 'विद्या सेतु (VidyaSetu)';
  static const String appTagline = 'विद्यालय प्रबंधन एवं छात्र उपस्थिति पोर्टल';
  static const String appVersion = '1.2.0';

  static const _storage = FlutterSecureStorage();
  static const String _keyCustomBaseUrl = 'custom_api_base_url';
  static String? _cachedBaseUrl;

  /// Retrieve the active base URL (custom if configured, otherwise default).
  static Future<String> getActiveBaseUrl() async {
    if (_cachedBaseUrl != null && _cachedBaseUrl!.isNotEmpty) {
      return _cachedBaseUrl!;
    }
    try {
      final saved = await _storage.read(key: _keyCustomBaseUrl);
      if (saved != null && saved.trim().isNotEmpty) {
        _cachedBaseUrl = saved.trim();
        return _cachedBaseUrl!;
      }
    } catch (_) {}
    _cachedBaseUrl = defaultApiBaseUrl;
    return defaultApiBaseUrl;
  }

  /// Update the base URL (for enterprise dedicated schools or local dev).
  static Future<void> setCustomBaseUrl(String? url) async {
    if (url == null || url.trim().isEmpty || url.trim() == defaultApiBaseUrl) {
      _cachedBaseUrl = defaultApiBaseUrl;
      await _storage.delete(key: _keyCustomBaseUrl);
    } else {
      var clean = url.trim();
      if (clean.endsWith('/')) {
        clean = clean.substring(0, clean.length - 1);
      }
      _cachedBaseUrl = clean;
      await _storage.write(key: _keyCustomBaseUrl, value: clean);
    }
  }

  /// Reset to platform default
  static Future<void> resetToDefault() async {
    _cachedBaseUrl = defaultApiBaseUrl;
    await _storage.delete(key: _keyCustomBaseUrl);
  }
}
