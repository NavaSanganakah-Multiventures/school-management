import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../models/user_model.dart';
import 'api_client.dart';

class AuthService {
  static final AuthService _instance = AuthService._internal();
  factory AuthService() => _instance;
  AuthService._internal();

  final _api = ApiClient();
  final _storage = const FlutterSecureStorage();

  UserModel? _currentUser;
  UserModel? get currentUser => _currentUser;

  /// Caches a user in memory without a network round-trip.
  /// Used by the Riverpod auth controller after login / session restore.
  void cacheUser(UserModel user) => _currentUser = user;

  Future<UserModel> login(String identifier, String password) async {
    final response = await _api.post('/api/auth/login', body: {
      'email': identifier.trim(),
      'password': password.trim(),
    });

    if (response['success'] == true && response['token'] != null) {
      final token = response['token'] as String;
      await _api.saveToken(token);

      final userData = response['user'] as Map<String, dynamic>;
      final user = UserModel.fromJson(userData);
      _currentUser = user;

      // Save user profile locally
      await _storage.write(key: 'user_profile', value: jsonEncode(user.toJson()));
      return user;
    } else {
      throw ApiException(response['message'] ?? 'लॉगिन असफल रहा।');
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
