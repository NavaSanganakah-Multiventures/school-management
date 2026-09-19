import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class AppConfig {
  // Official Central Cloudflare Workers Platform base URL & base domain
  static const String defaultApiBaseUrl = 'https://pragnya.nasven.com';
  static const String platformBaseDomain = 'pragnya.nasven.com';
  
  static const String appName = 'विद्या सेतु (VidyaSetu)';
  static const String appTagline = 'विद्यालय प्रबंधन एवं छात्र उपस्थिति पोर्टल';
  static const String appVersion = '1.2.0';

  static const _storage = FlutterSecureStorage();
  static const String _keyCustomBaseUrl = 'custom_api_base_url';
  static const String _keySchoolDomain = 'custom_school_domain';
  static String? _cachedBaseUrl;
  static String? _cachedSchoolDomain;

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

  /// Retrieve active host/domain string for request headers (e.g. pragnya.nasven.com or dps.pragnya.nasven.com)
  static Future<String> getActiveHost() async {
    final url = await getActiveBaseUrl();
    try {
      final uri = Uri.parse(url);
      if (uri.host.isNotEmpty) return uri.host;
    } catch (_) {}
    return platformBaseDomain;
  }

  /// Retrieve custom school domain or slug if explicitly set
  static Future<String?> getSchoolDomain() async {
    if (_cachedSchoolDomain != null) return _cachedSchoolDomain;
    try {
      _cachedSchoolDomain = await _storage.read(key: _keySchoolDomain);
      return _cachedSchoolDomain;
    } catch (_) {
      return null;
    }
  }

  /// Update the base URL (for enterprise dedicated schools or custom domains).
  static Future<void> setCustomBaseUrl(String? url) async {
    if (url == null || url.trim().isEmpty || url.trim() == defaultApiBaseUrl) {
      _cachedBaseUrl = defaultApiBaseUrl;
      await _storage.delete(key: _keyCustomBaseUrl);
    } else {
      var clean = url.trim();
      if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
        clean = 'https://$clean';
      }
      if (clean.endsWith('/')) {
        clean = clean.substring(0, clean.length - 1);
      }
      _cachedBaseUrl = clean;
      await _storage.write(key: _keyCustomBaseUrl, value: clean);
    }
  }

  /// Configure school by subdomain (e.g. 'dps' -> 'https://dps.pragnya.nasven.com') or full custom domain
  static Future<void> setSchoolSubdomainOrDomain(String input) async {
    final clean = input.trim().toLowerCase();
    if (clean.isEmpty) {
      await resetToDefault();
      return;
    }

    if (clean.contains('.')) {
      // Full domain or subdomain provided (e.g. 'dps.pragnya.nasven.com' or 'portal.dps.edu.in')
      await setCustomBaseUrl(clean);
    } else {
      // Just slug provided (e.g. 'dps') -> build 'https://dps.pragnya.nasven.com'
      await setCustomBaseUrl('https://$clean.$platformBaseDomain');
    }
    await _storage.write(key: _keySchoolDomain, value: clean);
    _cachedSchoolDomain = clean;
  }

  /// Reset to platform default
  static Future<void> resetToDefault() async {
    _cachedBaseUrl = defaultApiBaseUrl;
    _cachedSchoolDomain = null;
    await _storage.delete(key: _keyCustomBaseUrl);
    await _storage.delete(key: _keySchoolDomain);
  }
}
