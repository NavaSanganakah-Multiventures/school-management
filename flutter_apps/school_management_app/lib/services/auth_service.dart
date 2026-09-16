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
}
