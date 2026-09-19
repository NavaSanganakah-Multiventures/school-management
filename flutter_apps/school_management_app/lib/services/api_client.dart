import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../config/app_config.dart';

class ApiClient {
  static final ApiClient _instance = ApiClient._internal();
  factory ApiClient() => _instance;
  ApiClient._internal();

  final _storage = const FlutterSecureStorage();

  Future<String?> getToken() async {
    return await _storage.read(key: 'jwt_token');
  }

  Future<void> saveToken(String token) async {
    await _storage.write(key: 'jwt_token', value: token);
  }

  Future<void> clearAuth() async {
    await _storage.delete(key: 'jwt_token');
    await _storage.delete(key: 'user_profile');
  }

  Future<Map<String, String>> _buildHeaders({String? schoolId}) async {
    final token = await getToken();
    final headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    if (token != null && token.isNotEmpty) {
      headers['Authorization'] = 'Bearer $token';
    }
    if (schoolId != null && schoolId.isNotEmpty) {
      headers['X-School-Id'] = schoolId;
    }
    return headers;
  }

  Future<Uri> _buildUri(String path, [Map<String, dynamic>? queryParams]) async {
    final baseUrl = await AppConfig.getActiveBaseUrl();
    final cleanBase = baseUrl.endsWith('/') ? baseUrl.substring(0, baseUrl.length - 1) : baseUrl;
    final cleanPath = path.startsWith('/') ? path : '/$path';
    return Uri.parse('$cleanBase$cleanPath').replace(
      queryParameters: queryParams?.map((k, v) => MapEntry(k, v.toString())),
    );
  }

  Future<dynamic> get(String path, {Map<String, dynamic>? queryParams, String? schoolId}) async {
    final url = await _buildUri(path, queryParams);
    final headers = await _buildHeaders(schoolId: schoolId);

    final response = await http.get(url, headers: headers);
    return _processResponse(response);
  }

  Future<dynamic> post(String path, {dynamic body, String? schoolId}) async {
    final url = await _buildUri(path);
    final headers = await _buildHeaders(schoolId: schoolId);

    final response = await http.post(
      url,
      headers: headers,
      body: body != null ? jsonEncode(body) : null,
    );
    return _processResponse(response);
  }

  dynamic _processResponse(http.Response response) {
    dynamic body;
    try {
      body = jsonDecode(response.body);
    } catch (_) {
      body = {'success': false, 'message': response.body};
    }

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return body;
    } else {
      final msg = body is Map && body.containsKey('message')
          ? body['message']
          : (body is Map && body.containsKey('error') ? body['error'] : 'सर्वर त्रुटि (Status ${response.statusCode})');
      throw ApiException(msg.toString(), statusCode: response.statusCode);
    }
  }
}

class ApiException implements Exception {
  final String message;
  final int statusCode;
  ApiException(this.message, {this.statusCode = 500});

  @override
  String toString() => message;
}
