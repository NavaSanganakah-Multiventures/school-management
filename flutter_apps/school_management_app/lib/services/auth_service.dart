import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
// The barrel exports UserModel, ApiClient and AppConfig, so importing the
// re-export shims alongside it would be redundant (unnecessary_import).
import 'package:pragnya_shared/pragnya_shared.dart';

import 'pdf_service.dart' show PdfService;
import 'fcm_notification_service.dart' show FcmNotificationService;

class AuthService {
  static final AuthService _instance = AuthService._internal();
  factory AuthService() => _instance;
  AuthService._internal();

  final _api = ApiClient();
  final _storage = const FlutterSecureStorage();

  /// Dedicated hosts already retried during this login attempt, so a second
  /// USE_DEDICATED_DOMAIN cannot spin.
  ///
  /// Scope is ONE login attempt, not the process lifetime. It used to live on the
  /// singleton and was never cleared, so the loop guard outlived the reason for it:
  /// sign in via the apex → the app follows the redirect once and the set now holds
  /// `dps.pragnya.nasven.com` → log out → Settings → "रीसेट" (which resets
  /// AppConfig to the platform) → sign in again. This time the USE_DEDICATED_DOMAIN
  /// branch is skipped, so the code fell through to the dead-end message "यह स्कूल अपने
  /// पोर्टल dps.pragnya.nasven.com पर है, लेकिन यह ऐप वहाँ नहीं खुला है" — telling the user
  /// to open the exact URL the app is already pointed at, with no recovery short of a full
  /// process restart.
  ///
  /// Clearing it in [logout] and [clearCurrentUser] restores the correct scope: the guard
  /// is about one attempt's loop, not about the user's whole session history.
  final Set<String?> _redirectedTo = <String?>{};

  /// Empties the redirect guard. Called whenever the identity changes.
  void _resetRedirectGuard() => _redirectedTo.clear();

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
    // PdfService caches the school profile in a static field for 5 minutes so repeated
    // PDF exports do not refetch it. Without this line the cache survives the logout:
    // signing in as a different school within that window printed the PREVIOUS school's
    // name, address and phone on the new school's bonafide, receipt and report card.
    PdfService.clearSchoolCache();
    // The redirect guard is scoped to one login attempt, so a new session starts fresh.
    _resetRedirectGuard();
    // Leave this school's FCM topics. Subscriptions live on the device, not in the
    // token, so without this the phone keeps receiving the previous school's attendance
    // and absentee broadcasts after signing in to a different school.
    await FcmNotificationService().unsubscribeAll();
    await _api.clearAuth();
  }

  /// Clears the in-memory user (used by the global 401 handler).
  void clearCurrentUser() {
    _currentUser = null;
    _resetRedirectGuard();
    // Same reason as logout(): an expired session is still a switch of identity, and the
    // PDF header cache would otherwise carry the old school's details forward.
    PdfService.clearSchoolCache();
    // Fire-and-forget here: clearCurrentUser is synchronous and is called from the 401
    // handler, which cannot await. The topic list is held in memory, so it is safe to
    // walk it asynchronously.
    FcmNotificationService().unsubscribeAll();
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
