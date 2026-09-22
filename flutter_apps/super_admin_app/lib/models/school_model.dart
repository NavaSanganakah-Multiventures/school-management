/// School tenant model — mirrors `tenantToJson()` in `api/admin/index.ts`.
class SchoolModel {
  final String id;
  final String schoolName;
  final String subdomain;
  final String customDomain;
  final String contactEmail;
  final String contactPhone;
  final String status;
  final String registrationStatus;
  final String planId;
  final String planName;
  final String trialEndsAt;
  final String createdAt;

  const SchoolModel({
    required this.id,
    required this.schoolName,
    required this.subdomain,
    required this.customDomain,
    required this.contactEmail,
    required this.contactPhone,
    required this.status,
    required this.registrationStatus,
    required this.planId,
    required this.planName,
    required this.trialEndsAt,
    required this.createdAt,
  });

  bool get isPending => registrationStatus == 'Pending_Approval';

  factory SchoolModel.fromJson(Map<String, dynamic> json) {
    return SchoolModel(
      id: (json['id'] ?? '').toString(),
      schoolName: (json['schoolName'] ?? 'अज्ञात स्कूल').toString(),
      subdomain: (json['subdomain'] ?? '').toString(),
      customDomain: (json['customDomain'] ?? '').toString(),
      contactEmail: (json['contactEmail'] ?? '').toString(),
      contactPhone: (json['contactPhone'] ?? '').toString(),
      status: (json['status'] ?? 'Active').toString(),
      registrationStatus: (json['registrationStatus'] ?? 'Active').toString(),
      planId: (json['planId'] ?? 'trial').toString(),
      planName: (json['planName'] ?? '').toString(),
      trialEndsAt: (json['trialEndsAt'] ?? '').toString(),
      createdAt: (json['createdAt'] ?? '').toString(),
    );
  }
}

/// Subscription plan model — mirrors `planRowToDefinition()` in `api/db.ts`.
class PlanModel {
  final String id;
  final String name;
  final bool isTrial;

  const PlanModel({required this.id, required this.name, required this.isTrial});

  factory PlanModel.fromJson(Map<String, dynamic> json) {
    return PlanModel(
      id: (json['id'] ?? '').toString(),
      name: (json['name'] ?? json['id'] ?? '').toString(),
      isTrial: json['isTrial'] == true || json['is_trial'] == 1 || json['id'] == 'trial',
    );
  }
}
