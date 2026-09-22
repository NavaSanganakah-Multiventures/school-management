import '../models/school_model.dart';
import 'api_client.dart';

/// All Super-Admin backend calls in one place.
/// Backend source of truth: `api/admin/index.ts`.
class SchoolService {
  final SuperAdminApiClient _api = SuperAdminApiClient();

  /// GET /api/admin/schools — सभी स्कूल टेनेंट्स
  Future<List<SchoolModel>> fetchSchools() async {
    final res = await _api.get('/api/admin/schools');
    if (res is Map && res['success'] == true) {
      final list = (res['schools'] as List?) ?? [];
      return list.whereType<Map>().map((e) => SchoolModel.fromJson(Map<String, dynamic>.from(e))).toList();
    }
    throw Exception((res is Map ? res['message'] : null) ?? 'स्कूल सूची लोड नहीं हुई।');
  }

  /// GET /api/admin/plans — प्लान dropdown के लिए
  Future<List<PlanModel>> fetchPlans() async {
    final res = await _api.get('/api/admin/plans');
    if (res is Map && res['success'] == true) {
      final list = (res['plans'] as List?) ?? [];
      return list.whereType<Map>().map((e) => PlanModel.fromJson(Map<String, dynamic>.from(e))).toList();
    }
    // Plans optional hain — khaali list par form phir bhi 'trial' se kaam karega.
    return const [PlanModel(id: 'trial', name: '7-दिन फ्री ट्रायल', isTrial: true)];
  }

  /// POST /api/admin/schools/create — Super Admin द्वारा नया स्कूल जोड़ें.
  ///
  /// Required (backend validation): schoolName, directorName, email, phone, password.
  /// Optional: subdomain, customDomain, planId (default 'trial'),
  /// trialEndsAt (YYYY-MM-DD), billingCycle (monthly|quarterly|annual).
  Future<Map<String, dynamic>> createSchool({
    required String schoolName,
    required String directorName,
    required String email,
    required String phone,
    required String password,
    String subdomain = '',
    String customDomain = '',
    String planId = 'trial',
    String trialEndsAt = '',
    String billingCycle = 'monthly',
  }) async {
    final body = {
      'schoolName': schoolName.trim(),
      'directorName': directorName.trim(),
      'email': email.trim().toLowerCase(),
      'phone': phone.trim(),
      'password': password,
      if (subdomain.trim().isNotEmpty) 'subdomain': subdomain.trim().toLowerCase(),
      if (customDomain.trim().isNotEmpty) 'customDomain': customDomain.trim(),
      'planId': planId.trim().isEmpty ? 'trial' : planId.trim(),
      if (trialEndsAt.trim().isNotEmpty) 'trialEndsAt': trialEndsAt.trim(),
      'billingCycle': billingCycle.trim().isEmpty ? 'monthly' : billingCycle.trim(),
    };
    final res = await _api.post('/api/admin/schools/create', body: body);
    return Map<String, dynamic>.from(res as Map);
  }

  /// POST /api/admin/registrations/approve
  Future<Map<String, dynamic>> approveSchool(String schoolId, {String? planId, String? trialEndsAt}) async {
    final res = await _api.post('/api/admin/registrations/approve', body: {
      'schoolId': schoolId,
      if (planId != null && planId.isNotEmpty) 'planId': planId,
      if (trialEndsAt != null && trialEndsAt.isNotEmpty) 'trialEndsAt': trialEndsAt,
    });
    return Map<String, dynamic>.from(res as Map);
  }

  /// POST /api/admin/registrations/reject
  Future<Map<String, dynamic>> rejectSchool(String schoolId) async {
    final res = await _api.post('/api/admin/registrations/reject', body: {'schoolId': schoolId});
    return Map<String, dynamic>.from(res as Map);
  }

  /// POST /api/admin/schools/delete (soft-delete)
  Future<Map<String, dynamic>> deleteSchool(String schoolId) async {
    final res = await _api.post('/api/admin/schools/delete', body: {'schoolId': schoolId});
    return Map<String, dynamic>.from(res as Map);
  }

  /// POST /api/admin/schools/plan — plan assign/override
  Future<Map<String, dynamic>> changePlan(String schoolId, String planId) async {
    final res = await _api.post('/api/admin/schools/plan', body: {'schoolId': schoolId, 'planId': planId});
    return Map<String, dynamic>.from(res as Map);
  }
}
