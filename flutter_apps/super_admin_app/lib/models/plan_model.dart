import 'dart:convert';

/// Subscription plan model — mirrors `planRowToDefinition()` in `api/db.ts`.
class PlanModel {
  final String id;
  final String name;
  final String tagline;
  final String badge;
  final double monthlyPrice;
  final double quarterlyPrice;
  final double annualPrice;
  final String maxStudents;
  final int? maxStudentsLimit;
  final int? maxStaffLimit;
  final int? maxStaff;
  final int? emailQuotaLimit;
  final List<String> features;
  final List<String> modules;
  final Map<String, dynamic> featureFlags;
  final bool recommended;
  final bool active;
  final bool isTrial;
  final int sortOrder;

  const PlanModel({
    required this.id,
    required this.name,
    this.tagline = '',
    this.badge = '',
    this.monthlyPrice = 0,
    this.quarterlyPrice = 0,
    this.annualPrice = 0,
    this.maxStudents = '',
    this.maxStudentsLimit,
    this.maxStaffLimit,
    this.maxStaff,
    this.emailQuotaLimit,
    this.features = const [],
    this.modules = const [],
    this.featureFlags = const {},
    this.recommended = false,
    this.active = true,
    this.isTrial = false,
    this.sortOrder = 0,
  });

  bool get dedicatedWorker => featureFlags['dedicatedWorker'] == true;
  bool get autopay => featureFlags['autopay'] == true;
  bool get domainEmail => featureFlags['domainEmail'] == true;
  bool get reportCards => featureFlags['reportCards'] == true;

  double priceForCycle(String cycle) {
    switch (cycle) {
      case 'monthly':
        return monthlyPrice;
      case 'quarterly':
        return quarterlyPrice;
      case 'annual':
        return annualPrice;
      default:
        return monthlyPrice;
    }
  }

  factory PlanModel.fromJson(Map<String, dynamic> json) {
    double money(dynamic v) =>
        v is num ? v.toDouble() : (double.tryParse((v ?? '0').toString()) ?? 0);
    int? limitOf(dynamic v) => (v == null || v == '')
        ? null
        : (v is num ? v.round() : int.tryParse(v.toString()));
    List<String> strList(dynamic v) =>
        (v is List) ? v.map((e) => e.toString()).toList() : <String>[];
    Map<String, dynamic> flagMap(dynamic v) {
      if (v is Map) return Map<String, dynamic>.from(v);
      if (v is String) {
        try {
          final decoded = jsonDecode(v);
          if (decoded is Map) return Map<String, dynamic>.from(decoded);
        } catch (_) {}
      }
      return <String, dynamic>{};
    }

    return PlanModel(
      id: (json['id'] ?? '').toString(),
      name: (json['name'] ?? json['id'] ?? '').toString(),
      tagline: (json['tagline'] ?? '').toString(),
      badge: (json['badge'] ?? '').toString(),
      monthlyPrice: money(json['monthlyPrice']),
      quarterlyPrice: money(json['quarterlyPrice']),
      annualPrice: money(json['annualPrice']),
      maxStudents: (json['maxStudents'] ?? '').toString(),
      maxStudentsLimit: limitOf(json['maxStudentsLimit']),
      maxStaffLimit: limitOf(json['maxStaffLimit']),
      maxStaff: limitOf(json['maxStaff']),
      emailQuotaLimit: limitOf(json['emailQuotaLimit']),
      features: strList(json['features']),
      modules: strList(json['modules']),
      featureFlags: flagMap(json['featureFlags']),
      recommended: json['recommended'] == true || json['recommended'] == 1,
      active: json['active'] == null
          ? true
          : (json['active'] == true || json['active'] == 1),
      isTrial: json['isTrial'] == true || json['is_trial'] == 1 || json['id'] == 'trial',
      sortOrder: json['sortOrder'] is num
          ? (json['sortOrder'] as num).round()
          : (int.tryParse((json['sortOrder'] ?? '0').toString()) ?? 0),
    );
  }
}