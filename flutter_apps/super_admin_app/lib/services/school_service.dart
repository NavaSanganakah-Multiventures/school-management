import '../models/school_model.dart';
import '../models/plan_model.dart';
import 'api_client.dart';

/// All Super-Admin school/tenant backend calls in one place.
/// Backend source of truth: `api/admin/index.ts`.
class SchoolService {
  final SuperAdminApiClient _api = SuperAdminApiClient();

  final String _schoolsEnd = '/api/admin/schools';

  Map<String, dynamic> _asMap(dynamic res) =>
      res is Map ? Map<String, dynamic>.from(res) : <String, dynamic>{};

  String _message(Map<String, dynamic> res, String fallback) =>
      (res['message'] ?? fallback).toString();

  List<SchoolModel> _parseSchoolList(dynamic res, {String key = 'schools'}) {
    if (res is Map && res['success'] == true) {
      final list = (res[key] as List?) ?? [];
      return list
          .whereType<Map>()
          .map((e) => SchoolModel.fromJson(Map<String, dynamic>.from(e)))
          .toList();
    }
    throw Exception((res is Map ? res['message'] : null) ?? 'स्कूल सूची लोड नहीं हुई।');
  }

  /// GET /api/admin/schools — सभी स्कूल टेनेंट्स
  Future<List<SchoolModel>> fetchSchools() async {
    final res = await _api.get(_schoolsEnd);
    return _parseSchoolList(res);
  }

  /// GET /api/admin/registrations — पेंडिंग अनुमोदन अनुरोध
  Future<List<SchoolModel>> fetchRegistrations() async {
    final res = await _api.get('/api/admin/registrations');
    return _parseSchoolList(res, key: 'registrations');
  }

  /// GET /api/admin/schools/deleted — हटाए गए स्कूल (restore के लिए)
  Future<List<SchoolModel>> fetchDeletedSchools() async {
    final res = await _api.get('$_schoolsEnd/deleted');
    return _parseSchoolList(res);
  }

  /// GET /api/admin/plans — सभी प्लान
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

  /// POST /api/admin/schools/create — नया स्कूल + Director login
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
    String affiliationNumber = '',
    String boardName = '',
    String address = '',
    String city = '',
    String state = '',
    String pincode = '',
    String principalName = '',
  }) async {
    final body = <String, dynamic>{
      'schoolName': schoolName.trim(),
      'directorName': directorName.trim(),
      'email': email.trim().toLowerCase(),
      'phone': phone.trim(),
      'password': password,
      'planId': planId.trim().isEmpty ? 'trial' : planId.trim(),
      'billingCycle': billingCycle.trim().isEmpty ? 'monthly' : billingCycle.trim(),
      if (subdomain.trim().isNotEmpty) 'subdomain': subdomain.trim().toLowerCase(),
      if (customDomain.trim().isNotEmpty) 'customDomain': customDomain.trim(),
      if (trialEndsAt.trim().isNotEmpty) 'trialEndsAt': trialEndsAt.trim(),
      if (affiliationNumber.trim().isNotEmpty) 'affiliationNumber': affiliationNumber.trim(),
      if (boardName.trim().isNotEmpty) 'boardName': boardName.trim(),
      if (address.trim().isNotEmpty) 'address': address.trim(),
      if (city.trim().isNotEmpty) 'city': city.trim(),
      if (state.trim().isNotEmpty) 'state': state.trim(),
      if (pincode.trim().isNotEmpty) 'pincode': pincode.trim(),
      if (principalName.trim().isNotEmpty) 'principalName': principalName.trim(),
    };
    final res = await _api.post('$_schoolsEnd/create', body: body);
    return _asMap(res);
  }

  /// POST /api/admin/registrations/approve — plan choice + trial तिथि सहित
  Future<Map<String, dynamic>> approveSchool(
    String schoolId, {
    String? planId,
    String? trialEndsAt,
  }) async {
    final res = await _api.post('/api/admin/registrations/approve', body: {
      'schoolId': schoolId,
      if (planId != null && planId.isNotEmpty) 'planId': planId,
      if (trialEndsAt != null && trialEndsAt.isNotEmpty) 'trialEndsAt': trialEndsAt,
    });
    return _asMap(res);
  }

  /// POST /api/admin/registrations/reject
  Future<Map<String, dynamic>> rejectSchool(String schoolId) async {
    final res = await _api.post('/api/admin/registrations/reject', body: {'schoolId': schoolId});
    return _asMap(res);
  }

  /// POST /api/admin/schools/delete (soft-delete)
  Future<Map<String, dynamic>> deleteSchool(String schoolId) async {
    final res = await _api.post('$_schoolsEnd/delete', body: {'schoolId': schoolId});
    return _asMap(res);
  }

  /// POST /api/admin/schools/restore
  Future<Map<String, dynamic>> restoreSchool(String schoolId) async {
    final res = await _api.post('$_schoolsEnd/restore', body: {'schoolId': schoolId});
    return _asMap(res);
  }

  /// POST /api/admin/schools/plan — plan assign + optional trialEndsAt
  Future<Map<String, dynamic>> changePlan(
    String schoolId,
    String planId, {
    String? trialEndsAt,
  }) async {
    final res = await _api.post('$_schoolsEnd/plan', body: {
      'schoolId': schoolId,
      'planId': planId,
      if (trialEndsAt != null && trialEndsAt.isNotEmpty) 'trialEndsAt': trialEndsAt,
    });
    return _asMap(res);
  }

  /// POST /api/admin/schools/expiry-date — समाप्ति तिथि सेट करें
  Future<Map<String, dynamic>> setExpiryDate(String schoolId, String expiryDate) async {
    final res = await _api.post('$_schoolsEnd/expiry-date', body: {
      'schoolId': schoolId,
      'expiryDate': expiryDate,
    });
    return _asMap(res);
  }

  /// POST /api/admin/trial/extend — ट्रायल +N दिन बढ़ाएं
  Future<Map<String, dynamic>> extendTrial(String schoolId, int days) async {
    final res = await _api.post('/api/admin/trial/extend', body: {
      'schoolId': schoolId,
      'days': days.clamp(1, 60),
    });
    return _asMap(res);
  }

  /// POST /api/admin/schools/update — स्कूल प्रोफ़ाइल / स्टेटस / प्लान अपडेट
  Future<Map<String, dynamic>> updateSchool(String schoolId, Map<String, dynamic> fields) async {
    final res = await _api.post('$_schoolsEnd/update', body: {'schoolId': schoolId, ...fields});
    return _asMap(res);
  }

  /// POST /api/admin/schools/email-config — मासिक कोटा + sender config
  Future<Map<String, dynamic>> saveEmailConfig({
    required String schoolId,
    String? limit,
    String fromName = '',
    String fromEmail = '',
    String replyTo = '',
    bool isActive = true,
  }) async {
    final res = await _api.post('$_schoolsEnd/email-config', body: {
      'schoolId': schoolId,
      'limit': limit == null || limit.trim().isEmpty ? null : limit.trim(),
      'fromName': fromName.trim(),
      'fromEmail': fromEmail.trim(),
      'replyTo': replyTo.trim(),
      'isActive': isActive,
    });
    return _asMap(res);
  }

  /// POST /api/admin/schools/send-payment-link — Razorpay पेमेंट लिंक (email + FCM)
  Future<Map<String, dynamic>> sendPaymentLink({
    required String schoolId,
    required String planId,
    String billingCycle = 'annual',
  }) async {
    final res = await _api.post('$_schoolsEnd/send-payment-link', body: {
      'schoolId': schoolId,
      'planId': planId,
      'billingCycle': billingCycle,
    });
    return _asMap(res);
  }

  /// POST /api/admin/schools/notify — मैन्युअल FCM पुश नोटिफिकेशन
  Future<Map<String, dynamic>> notifySchool({
    required String schoolId,
    required String title,
    required String body,
    String targetRole = 'Director',
    String priority = 'high',
    String actionUrl = '',
  }) async {
    final res = await _api.post('$_schoolsEnd/notify', body: {
      'schoolId': schoolId,
      'title': title,
      'body': body,
      'targetRole': targetRole,
      'priority': priority,
      if (actionUrl.isNotEmpty) 'actionUrl': actionUrl,
    });
    return _asMap(res);
  }

  /// POST /api/admin/schools/provision — डेडीकेटेड वर्कर प्रोविजन
  Future<Map<String, dynamic>> provisionSchool(String schoolId, {String? slug, String? domain}) async {
    final res = await _api.post('$_schoolsEnd/provision', body: {
      'schoolId': schoolId,
      if (slug != null && slug.isNotEmpty) 'slug': slug,
      if (domain != null && domain.isNotEmpty) 'domain': domain,
    });
    return _asMap(res);
  }

  /// POST /api/admin/schools/provision/deprovision — शेयर्ड मोड में लौटाएं
  Future<Map<String, dynamic>> deprovisionSchool(String schoolId) async {
    final res = await _api.post('$_schoolsEnd/provision/deprovision', body: {'schoolId': schoolId});
    return _asMap(res);
  }

  /// POST /api/admin/schools/provision/check — लाइव स्टेटस जांचें
  Future<Map<String, dynamic>> checkProvision(String schoolId) async {
    final res = await _api.post('$_schoolsEnd/provision/check', body: {'schoolId': schoolId});
    return _asMap(res);
  }

  /// POST /api/admin/trial/process — सभी ट्रायल समाप्ति मैन्युअली प्रोसेस करें
  Future<Map<String, dynamic>> processTrials() async {
    final res = await _api.post('/api/admin/trial/process', body: {});
    return _asMap(res);
  }

  /// POST /api/admin/plugins/process-trials — प्लगइन ट्रायल मैन्युअली प्रोसेस करें
  Future<Map<String, dynamic>> processPluginTrials() async {
    final res = await _api.post('/api/admin/plugins/process-trials', body: {});
    return _asMap(res);
  }

  /// POST /api/admin/registrations/approve wrapper for pending approvals tab.
  String successMessage(Map<String, dynamic> res, String fallback) => _message(res, fallback);
  String errorMessage(Map<String, dynamic> res, String fallback) => _message(res, fallback);
}