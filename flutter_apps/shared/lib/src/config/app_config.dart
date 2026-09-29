// visibleForTesting is imported for debugResetCache. It was missing the first
// time that method was added and `dart analyze` was what said so: `show kIsWeb`
// is a closed list, so using a second symbol from the same library does not bring
// it into scope.
import 'package:flutter/foundation.dart' show kIsWeb, visibleForTesting;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Multi-tenant app configuration.
///
/// Handles the active base URL (custom school subdomain/domain vs the origin the
/// app is served from) and school-domain persistence via secure storage.
class AppConfig {
  // Official Central Cloudflare Workers Platform base URL & base domain
  static const String defaultApiBaseUrl = 'https://pragnya.nasven.com';
  static const String platformBaseDomain = 'pragnya.nasven.com';

  static const String appName = 'Pragnya Mitra';
  static const String appTagline = 'School Management System';
  static const String appVersion = '1.2.0';

  static const _storage = FlutterSecureStorage();
  static const String _keyCustomBaseUrl = 'custom_api_base_url';
  static const String _keySchoolDomain = 'custom_school_domain';
  static String? _cachedBaseUrl;
  static String? _cachedSchoolDomain;

  /// Retrieve the active base URL.
  ///
  /// ORDER MATTERS, and getting it wrong is what made dedicated logins impossible.
  ///
  /// 1. An explicitly configured base URL wins. `setCustomBaseUrl` deletes the
  ///    stored key when given the platform default, so a stored value is always a
  ///    deliberate choice (a custom domain, or an API on a different host).
  /// 2. Otherwise, on web, use the ORIGIN THE APP IS SERVED FROM.
  /// 3. Otherwise fall back to the platform default, for native builds where
  ///    there is no meaningful origin.
  ///
  /// WHY 2 IS THE CORRECT DEFAULT ON WEB
  ///
  /// Every dedicated school worker serves BOTH the Flutter app and the API on the
  /// same host -- that is the whole point of the per-school `[[routes]]` entry, and
  /// the reason it exists at all rather than putting the app on the apex. So the
  /// API the app should talk to is always its own origin.
  ///
  /// This function used to skip that and return the hardcoded apex. The app was
  /// therefore served from `yagyaashram.pragnya.nasven.com` while every request
  /// went to `pragnya.nasven.com`. The apex has no `IS_DEDICATED_WORKER`, so it
  /// ran the platform-tier branch of the login handler, which finds the tenant,
  /// sees it has a dedicated domain, and answers:
  ///
  ///     403 USE_DEDICATED_DOMAIN
  ///     "आपका स्कूल अपने निजी पोर्टल पर चला गया है। कृपया
  ///      https://yagyaashram.pragnya.nasven.com से लॉगिन करें।"
  ///
  /// The app surfaced that message verbatim. It told the user to open the URL they
  /// were already on, so retrying changed nothing and no Director could ever log
  /// in. The API was never the problem: `POST
  /// yagyaashram.pragnya.nasven.com/api/auth/login` returns a valid Director token
  /// on the first try.
  ///
  /// This also fixes the Super Admin app, which is served from
  /// `admin.pragnya.nasven.com` and needs the platform worker -- its own origin.
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

    if (kIsWeb) {
      // Uri.base is the browser's current location, so .origin drops the path,
      // query and the #/login fragment, leaving scheme://host[:port].
      final origin = Uri.base.origin;
      if (origin.isNotEmpty && !origin.startsWith('null')) {
        _cachedBaseUrl = origin;
        return origin;
      }
    }

    _cachedBaseUrl = defaultApiBaseUrl;
    return defaultApiBaseUrl;
  }

  /// Retrieve active host/domain string for request headers
  /// (e.g. pragnya.nasven.com or dps.pragnya.nasven.com).
  static Future<String> getActiveHost() async {
    final url = await getActiveBaseUrl();
    try {
      final uri = Uri.parse(url);
      if (uri.host.isNotEmpty) return uri.host;
    } catch (_) {}
    return platformBaseDomain;
  }

  /// Retrieve custom school domain or slug if explicitly set.
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

  /// Configure school by subdomain (e.g. 'dps' -> 'https://dps.pragnya.nasven.com')
  /// or full custom domain.
  static Future<void> setSchoolSubdomainOrDomain(String input) async {
    final clean = input.trim().toLowerCase();
    if (clean.isEmpty) {
      await resetToDefault();
      return;
    }

    if (clean.contains('.')) {
      // Full domain or subdomain provided (e.g. 'dps.pragnya.nasven.com')
      await setCustomBaseUrl(clean);
    } else {
      // Just slug provided (e.g. 'dps') -> build 'https://dps.pragnya.nasven.com'
      await setCustomBaseUrl('https://$clean.$platformBaseDomain');
    }
    await _storage.write(key: _keySchoolDomain, value: clean);
    _cachedSchoolDomain = clean;
  }

  /// Reset to platform default.
  static Future<void> resetToDefault() async {
    _cachedBaseUrl = defaultApiBaseUrl;
    _cachedSchoolDomain = null;
    await _storage.delete(key: _keyCustomBaseUrl);
    await _storage.delete(key: _keySchoolDomain);
  }

  /// Clears the in-memory caches WITHOUT writing anything to storage.
  ///
  /// WHY THIS IS NEEDED AND WHY [resetToDefault] IS NOT ENOUGH
  ///
  /// `_cachedBaseUrl` and `_cachedSchoolDomain` are process-lifetime statics, and
  /// `getActiveBaseUrl` returns the cache without consulting storage when it is
  /// set. [resetToDefault] therefore cannot put the object back into a "nothing
  /// cached, ask storage" state -- it seeds the cache with the platform default,
  /// which is a different state and produces a different answer.
  ///
  /// Without this, every test after the first would read the first test's value
  /// and pass or fail for reasons that have nothing to do with the code. That is
  /// the same class of defect as the cached school profile in the school app: a
  /// static cache with no defined invalidation, which is also how one process
  /// serving two tenants shows the first tenant's data to the second.
  ///
  /// Test-only by intent: nothing in the app should need to clear the cache
  /// without also clearing storage, because that would leave the next
  /// `getActiveBaseUrl` reading a value the user had already discarded.
  @visibleForTesting
  static void debugResetCache() {
    _cachedBaseUrl = null;
    _cachedSchoolDomain = null;
  }
}
