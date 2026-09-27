import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
// The barrel exports UserModel, ApiClient and AppConfig, so importing the
// re-export shims alongside it would be redundant (unnecessary_import).
import 'package:pragnya_shared/pragnya_shared.dart';

class AuthService {
  static final AuthService _instance = AuthService._internal();
  factory AuthService() => _instance;
  AuthService._internal();

  final _api = ApiClient();
  final _storage = const FlutterSecureStorage();

  /// Dedicated hosts already retried during this login attempt, so a second
  /// USE_DEDICATED_DOMAIN cannot spin.
  final Set<String?> _redirectedTo = <String?>{};

  UserModel? _currentUser;
  UserModel? get currentUser => _currentUser;

  /// Caches a user in memory without a network round-trip.
  /// Used by the Riverpod auth controller after login / session restore.
  void cacheUser(UserModel user) => _currentUser = user;

  Future<UserModel> login(String identifier, String password) async {
    var response = await _api.post('/api/auth/login', body: {
      'email': identifier.trim(),
      'password': password.trim(),
    });

    // The platform worker refuses school logins and names the school's dedicated
    // portal, because a school lives on its own worker now. If we asked the
    // platform for a login that belongs on a school worker, follow the redirect
    // ONCE instead of showing the user a message telling them to open the URL
    // they are already on.
    //
    // This is a safety net, not the fix. AppConfig.getActiveBaseUrl() already
    // prefers the origin the app is served from, so on web this branch should not
    // be reachable at all. It stays because a stale custom base URL in secure
    // storage survives an app update, and a user with one would otherwise be
    // permanently locked out with a message that looks like a dead end.
    //
    // Guarded against a loop: the retried host is remembered, and a second
    // USE_DEDICATED_DOMAIN from the same host is surfaced rather than retried.
    if (response['success'] != true &&
        response['code'] == 'USE_DEDICATED_DOMAIN' &&
        !_redirectedTo.contains(response['dedicatedDomain'])) {
      final domain = response['dedicatedDomain'] as String?;
      if (domain != null && domain.trim().isNotEmpty) {
        _redirectedTo.add(domain);
        // No cache to invalidate: ApiClient resolves the base URL on every
        // request via AppConfig.getActiveBaseUrl(), and setCustomBaseUrl updates
        // AppConfig's cache before it returns, so the retry reaches the new host.
        await AppConfig.setCustomBaseUrl('https://${domain.trim()}');
        response = await _api.post('/api/auth/login', body: {
          'email': identifier.trim(),
          'password': password.trim(),
        });
      }
    }

    if (response['success'] == true && response['token'] != null) {
      final token = response['token'] as String;
      await _api.saveToken(token);

      final userData = response['user'] as Map<String, dynamic>;
      final UserModel user;
      try {
        user = UserModel.fromJson(userData);
      } on FormatException catch (e) {
        // Unrecognized role — surface a clean message instead of the
        // FormatException prefix. Never silently downgrade to staff.
        throw ApiException(e.message);
      }
      _currentUser = user;

      // Save user profile locally
      await _storage.write(key: 'user_profile', value: jsonEncode(user.toJson()));
      return user;
    } else {
      // Never show a "go to <url>" message for a host the user is already on.
      // That reads as a broken app and invites an endless retry.
      final message = response['message'] as String?;
      final domain = response['dedicatedDomain'] as String?;
      if (response['code'] == 'USE_DEDICATED_DOMAIN' &&
          domain != null &&
          domain.trim().isNotEmpty) {
        throw ApiException(
          'यह स्कूल अपने पोर्टल ${domain.trim()} पर है, लेकिन यह ऐप वहाँ नहीं खुला है। '
          'कृपया $domain पर जाकर लॉगिन करें।',
        );
      }
      throw ApiException(message ?? 'लॉगिन असफल रहा।');
    }
  }

  Future<UserModel?> getSavedUser() async {
    if (_currentUser != null) return _currentUser;
    try {
      final jsonStr = await _storage.read(key: 'user_profile');
      if (jsonStr != null) {
        _currentUser = UserModel.fromJson(jsonDecode(jsonStr));
        return _currentUser;
      }
    } catch (_) {}
    return null;
  }

  Future<void> logout() async {
    try {
      await _api.post('/api/auth/logout');
    } catch (_) {}
    _currentUser = null;
    await _api.clearAuth();
  }

  /// Clears the in-memory user (used by the global 401 handler).
  void clearCurrentUser() {
    _currentUser = null;
  }

  /// Fetches the current authenticated user profile from the server.
  Future<UserModel?> refreshProfile() async {
    try {
      final res = await _api.get('/api/auth/me');
      if (res['success'] == true && res['user'] != null) {
        final user = UserModel.fromJson(res['user'] as Map<String, dynamic>);
        _currentUser = user;
        await _storage.write(key: 'user_profile', value: jsonEncode(user.toJson()));
        return user;
      }
    } catch (_) {}
    return null;
  }

  Future<void> forgotPassword(String email) async {
    await _api.post('/api/auth/forgot-password', body: {'email': email.trim()});
  }

  Future<void> resetPassword(String token, String password) async {
    await _api.post('/api/auth/reset-password', body: {'token': token, 'password': password});
  }
}
