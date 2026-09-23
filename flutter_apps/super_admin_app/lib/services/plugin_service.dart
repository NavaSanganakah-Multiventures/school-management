import '../models/plugin_model.dart';
import 'api_client.dart';

/// Plugin catalog + school plugin subscription/trial management.
class PluginService {
  final SuperAdminApiClient _api = SuperAdminApiClient();

  Map<String, dynamic> _asMap(dynamic res) =>
      res is Map ? Map<String, dynamic>.from(res) : <String, dynamic>{};

  /// GET /api/admin/plugins
  Future<List<PluginModel>> fetchPlugins() async {
    final res = await _api.get('/api/admin/plugins');
    if (res is Map && res['success'] == true) {
      return ((res['plugins'] as List?) ?? [])
          .whereType<Map>()
          .map((e) => PluginModel.fromJson(Map<String, dynamic>.from(e)))
          .toList();
    }
    throw Exception((res is Map ? res['message'] : null) ?? 'प्लगइन सूची लोड नहीं हुई।');
  }

  /// POST /api/admin/plugins/toggle
  Future<Map<String, dynamic>> togglePlugin(String id) async {
    final res = await _api.post('/api/admin/plugins/toggle', body: {'id': id});
    return _asMap(res);
  }

  /// POST /api/admin/plugins/create
  Future<Map<String, dynamic>> createPlugin(Map<String, dynamic> fields) async {
    final res = await _api.post('/api/admin/plugins/create', body: fields);
    return _asMap(res);
  }

  /// POST /api/admin/plugins/update
  Future<Map<String, dynamic>> updatePlugin(Map<String, dynamic> fields) async {
    final res = await _api.post('/api/admin/plugins/update', body: fields);
    return _asMap(res);
  }

  /// GET /api/admin/plugins/subscriptions
  Future<List<PluginSubscriptionModel>> fetchSubscriptions() async {
    final res = await _api.get('/api/admin/plugins/subscriptions');
    if (res is Map && res['success'] == true) {
      return ((res['subscriptions'] as List?) ?? [])
          .whereType<Map>()
          .map((e) => PluginSubscriptionModel.fromJson(Map<String, dynamic>.from(e)))
          .toList();
    }
    return [];
  }

  /// POST /api/admin/plugins/assign (activate) | revoke
  Future<Map<String, dynamic>> activatePlugin(String schoolId, String pluginId) async {
    final res = await _api.post('/api/admin/plugins/assign', body: {
      'schoolId': schoolId,
      'pluginId': pluginId,
      'status': 'active',
    });
    return _asMap(res);
  }

  /// POST /api/admin/plugins/revoke
  Future<Map<String, dynamic>> revokePlugin(String schoolId, String pluginId) async {
    final res = await _api.post('/api/admin/plugins/revoke', body: {
      'schoolId': schoolId,
      'pluginId': pluginId,
    });
    return _asMap(res);
  }

  /// GET /api/admin/plugins/trials
  Future<List<PluginTrialModel>> fetchTrials() async {
    final res = await _api.get('/api/admin/plugins/trials');
    if (res is Map && res['success'] == true) {
      return ((res['trials'] as List?) ?? [])
          .whereType<Map>()
          .map((e) => PluginTrialModel.fromJson(Map<String, dynamic>.from(e)))
          .toList();
    }
    return [];
  }

  /// POST /api/admin/plugins/grant-trial — N-दिन ट्रायल दें
  Future<Map<String, dynamic>> grantTrial({
    required String schoolId,
    required String pluginId,
    required int trialDays,
  }) async {
    final res = await _api.post('/api/admin/plugins/grant-trial', body: {
      'schoolId': schoolId,
      'pluginId': pluginId,
      'trialDays': trialDays.clamp(1, 365),
    });
    return _asMap(res);
  }

  /// POST /api/admin/plugins/revoke-trial
  Future<Map<String, dynamic>> revokeTrial(String schoolId, String pluginId) async {
    final res = await _api.post('/api/admin/plugins/revoke-trial', body: {
      'schoolId': schoolId,
      'pluginId': pluginId,
    });
    return _asMap(res);
  }

  /// POST /api/admin/plugins/send-payment-link
  Future<Map<String, dynamic>> sendPaymentLink({
    required String schoolId,
    required String pluginId,
    String billingCycle = 'monthly',
  }) async {
    final res = await _api.post('/api/admin/plugins/send-payment-link', body: {
      'schoolId': schoolId,
      'pluginId': pluginId,
      'billingCycle': billingCycle,
    });
    return _asMap(res);
  }
}