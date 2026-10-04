import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../config/app_config.dart';

class SuperAdminApiClient {
  static final SuperAdminApiClient _instance = SuperAdminApiClient._internal();
  factory SuperAdminApiClient() => _instance;
  SuperAdminApiClient._internal();

  final _storage = const FlutterSecureStorage();

  /// Global callback invoked when a request returns 401 (token expired).
  /// Set by the app shell to force logout + redirect to login screen.
  static void Function()? onAuthFailure;

  Future<String?> getToken() async => await _storage.read(key: 'super_admin_jwt');
  Future<void> saveToken(String token) async => await _storage.write(key: 'super_admin_jwt', value: token);
  Future<void> clearAuth() async => await _storage.delete(key: 'super_admin_jwt');
  Future<bool> hasToken() async => (await getToken())?.isNotEmpty ?? false;

  /// GET /api/auth/me — stored token से current user profile लौटाता है।
  /// वापसी: user map (खाली map यदि सत्र वैध नहीं है)।
  Future<Map<String, dynamic>> fetchCurrentUser() async {
    final res = await get('/api/auth/me');
    if (res is Map && res['success'] == true && res['user'] is Map) {
      return Map<String, dynamic>.from(res['user'] as Map);
    }
    return <String, dynamic>{};
  }

  Future<Map<String, String>> _headers() async {
    final token = await getToken();
    return {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      if (token != null && token.isNotEmpty) 'Authorization': 'Bearer $token',
    };
  }

  Uri _uri(String path, [Map<String, dynamic>? queryParams]) {
    final cleanPath = path.startsWith('/') ? path : '/$path';
    return Uri.parse('${AppConfig.apiBaseUrl}$cleanPath').replace(
      queryParameters: queryParams?.map((k, v) => MapEntry(k, v.toString())),
    );
  }

  Future<dynamic> get(String path, {Map<String, dynamic>? queryParams}) async {
    final response = await http.get(_uri(path, queryParams), headers: await _headers());
    return _process(response);
  }

  Future<dynamic> post(String path, {dynamic body}) async {
    final response = await http.post(_uri(path), headers: await _headers(), body: body != null ? jsonEncode(body) : null);
    return _process(response);
  }

  Future<dynamic> put(String path, {dynamic body}) async {
    final response = await http.put(_uri(path), headers: await _headers(), body: body != null ? jsonEncode(body) : null);
    return _process(response);
  }

  Future<dynamic> delete(String path) async {
    final response = await http.delete(_uri(path), headers: await _headers());
    return _process(response);
  }

  // Async because the 401 branch has to finish deleting the stored token BEFORE
  // onAuthFailure navigates to the login screen. See the note on `await clearAuth()`
  // below for why that ordering matters.
  Future<dynamic> _process(http.Response response) async {
    dynamic body;
    try {
      body = jsonDecode(response.body);
    } catch (_) {
      body = {'success': false, 'message': response.body};
    }
    if (response.statusCode >= 200 && response.statusCode < 300) {
      return body;
    } else {
      if (response.statusCode == 401) {
        // Session expired — clear token and bounce the user to login.
        //
        // `await` is load-bearing here and was missing. clearAuth() is async, so
        // `try { clearAuth(); } catch (_) {}` could never catch anything, and a
        // PlatformException surfaced as an unhandled async error instead. Worse, the
        // delete was still in flight when onAuthFailure navigated to login, so a fast
        // re-login could store a fresh token and then have the pending delete land
        // afterwards — erasing the new token and bouncing the user to login again on
        // next launch. The shared client gets this right at
        // shared/lib/src/services/api_client.dart:199-204.
        try {
          await clearAuth();
        } catch (_) {}
        onAuthFailure?.call();
      }
      final msg = body is Map && body.containsKey('message')
          ? body['message']
          : (body is Map && body.containsKey('error')
              ? body['error']
              : 'त्रुटि (Status ${response.statusCode})');
      throw Exception(msg);
    }
  }
}