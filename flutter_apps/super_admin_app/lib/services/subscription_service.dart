import '../models/subscription_model.dart';
import 'api_client.dart';

class FeatureRequestService {
  final SuperAdminApiClient _api = SuperAdminApiClient();

  Map<String, dynamic> _asMap(dynamic res) =>
      res is Map ? Map<String, dynamic>.from(res) : <String, dynamic>{};

  /// GET /api/admin/feature-requests
  Future<List<FeatureRequestModel>> fetchRequests() async {
    final res = await _api.get('/api/admin/feature-requests');
    if (res is Map && res['success'] == true) {
      return ((res['requests'] as List?) ?? [])
          .whereType<Map>()
          .map((e) => FeatureRequestModel.fromJson(Map<String, dynamic>.from(e)))
          .toList();
    }
    return [];
  }

  /// POST /api/admin/feature-requests/status
  Future<Map<String, dynamic>> updateStatus({
    required String id,
    required String status,
    String adminNotes = '',
  }) async {
    final res = await _api.post('/api/admin/feature-requests/status', body: {
      'id': id,
      'status': status,
      'adminNotes': adminNotes,
    });
    return _asMap(res);
  }
}

class SubscriptionService {
  final SuperAdminApiClient _api = SuperAdminApiClient();

  Map<String, dynamic> _asMap(dynamic res) =>
      res is Map ? Map<String, dynamic>.from(res) : <String, dynamic>{};

  /// GET /api/admin/subscriptions — recurring सदस्यताएं
  Future<List<RecurringSubscriptionModel>> fetchSubscriptions() async {
    final res = await _api.get('/api/admin/subscriptions');
    if (res is Map && res['success'] == true) {
      return ((res['subscriptions'] as List?) ?? [])
          .whereType<Map>()
          .map((e) => RecurringSubscriptionModel.fromJson(Map<String, dynamic>.from(e)))
          .toList();
    }
    return [];
  }

  /// GET /api/admin/subscriptions/detail?schoolId=
  Future<Map<String, dynamic>> fetchSubscriptionDetail(String schoolId) async {
    final res = await _api.get('/api/admin/subscriptions/detail', queryParams: {
      'schoolId': schoolId,
    });
    return _asMap(res);
  }

  /// POST /api/admin/subscriptions/cancel
  Future<Map<String, dynamic>> cancelSubscription(String schoolId, {bool atCycleEnd = false}) async {
    final res = await _api.post('/api/admin/subscriptions/cancel', body: {
      'schoolId': schoolId,
      'cancelAtCycleEnd': atCycleEnd,
    });
    return _asMap(res);
  }

  /// POST /api/admin/subscriptions/pause
  Future<Map<String, dynamic>> pauseSubscription(String schoolId) async {
    final res = await _api.post('/api/admin/subscriptions/pause', body: {'schoolId': schoolId});
    return _asMap(res);
  }

  /// POST /api/admin/subscriptions/resume
  Future<Map<String, dynamic>> resumeSubscription(String schoolId) async {
    final res = await _api.post('/api/admin/subscriptions/resume', body: {'schoolId': schoolId});
    return _asMap(res);
  }
}