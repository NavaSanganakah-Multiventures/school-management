class AppConfig {
  /// Super Admin Console ke liye dedicated admin subdomain.
  /// Health check: GET /api/health → {"status":"online"} (verified 2026-09-22)
  static const String apiBaseUrl = 'https://admin.pragnya.nasven.com';
  static const String appName = 'Pragnya Mitra Super Admin';
  static const String appVersion = '1.0.0';
}
