import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../config/app_config.dart';

class SuperAdminApiClient {
  static final SuperAdminApiClient _instance = SuperAdminApiClient._internal();
  factory SuperAdminApiClient() => _instance;
  SuperAdminApiClient._internal();

  final _storage = const FlutterSecureStorage();

  Future<String?> getToken() async => await _storage.read(key: 'super_admin_jwt');
  Future<void> saveToken(String token) async => await _storage.write(key: 'super_admin_jwt', value: token);
  Future<void> clearAuth() async => await _storage.delete(key: 'super_admin_jwt');

  Future<Map<String, String>> _headers() async {
    final token = await getToken();
    return {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
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

  dynamic _process(http.Response response) {
    dynamic body;
    try {
      body = jsonDecode(response.body);
    } catch (_) {
      body = {'success': false, 'message': response.body};
    }
    if (response.statusCode >= 200 && response.statusCode < 300) {
      return body;
    } else {
      final msg = body is Map && body.containsKey('message') ? body['message'] : 'त्रुटि (Status ${response.statusCode})';
      throw Exception(msg);
    }
  }
}
