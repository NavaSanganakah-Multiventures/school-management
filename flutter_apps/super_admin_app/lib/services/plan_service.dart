import '../models/plan_model.dart';
import 'api_client.dart';

/// Subscription plan CRUD + Razorpay plan sync.
class PlanService {
  final SuperAdminApiClient _api = SuperAdminApiClient();

  Map<String, dynamic> _asMap(dynamic res) =>
      res is Map ? Map<String, dynamic>.from(res) : <String, dynamic>{};

  /// GET /api/admin/plans
  Future<List<PlanModel>> fetchPlans() async {
    final res = await _api.get('/api/admin/plans');
    if (res is Map && res['success'] == true) {
      final list = (res['plans'] as List?) ?? [];
      return list
          .whereType<Map>()
          .map((e) => PlanModel.fromJson(Map<String, dynamic>.from(e)))
          .toList();
    }
    return const [
      PlanModel(id: 'trial', name: '7-दिन फ्री ट्रायल', isTrial: true),
    ];
  }

  /// POST /api/admin/plans — नया प्लान
  Future<Map<String, dynamic>> createPlan(Map<String, dynamic> fields) async {
    final res = await _api.post('/api/admin/plans', body: fields);
    return _asMap(res);
  }

  /// POST /api/admin/plans/update
  Future<Map<String, dynamic>> updatePlan(Map<String, dynamic> fields) async {
    final res = await _api.post('/api/admin/plans/update', body: fields);
    return _asMap(res);
  }

  /// POST /api/admin/plans/delete
  Future<Map<String, dynamic>> deletePlan(String id) async {
    final res = await _api.post('/api/admin/plans/delete', body: {'id': id});
    return _asMap(res);
  }

  // ---------- Razorpay plans ----------

  /// GET /api/admin/razorpay/plans
  Future<List<Map<String, dynamic>>> fetchRazorpayPlans() async {
    final res = await _api.get('/api/admin/razorpay/plans');
    if (res is Map && res['success'] == true) {
      return ((res['plans'] as List?) ?? [])
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
    }
    return [];
  }

  /// POST /api/admin/razorpay/plans/create
  Future<Map<String, dynamic>> createRazorpayPlan(String planId, String billingCycle) async {
    final res = await _api.post('/api/admin/razorpay/plans/create', body: {
      'planId': planId,
      'billingCycle': billingCycle,
    });
    return _asMap(res);
  }

  /// POST /api/admin/razorpay/plans/sync-all
  Future<Map<String, dynamic>> syncAllRazorpayPlans() async {
    final res = await _api.post('/api/admin/razorpay/plans/sync-all', body: {});
    return _asMap(res);
  }

  /// GET /api/admin/razorpay/plans/detail
  Future<Map<String, dynamic>> razorpayPlanDetail(String razorpayPlanId) async {
    final res = await _api.get('/api/admin/razorpay/plans/detail', queryParams: {
      'razorpayPlanId': razorpayPlanId,
    });
    return _asMap(res);
  }
}