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
  final String deletedAt;
  final String createdAt;
  final String provisioningStatus;
  final String dedicatedSlug;
  final String dedicatedDomain;
  final String d1DatabaseId;
  final String r2BucketName;
  final String kvNamespaceId;
  final String provisionedAt;
  final String provisioningError;
  final int? emailQuotaLimit;
  final int emailQuotaUsed;
  final String emailQuotaResetAt;
  final String emailFromName;
  final String emailFromEmail;
  final String emailReplyTo;
  final bool emailConfigActive;
  final int estimatedStudents;
  final int estimatedStaff;
  final String preferredPlanId;
  final String customRequirements;

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
    required this.deletedAt,
    required this.createdAt,
    required this.provisioningStatus,
    required this.dedicatedSlug,
    required this.dedicatedDomain,
    required this.d1DatabaseId,
    required this.r2BucketName,
    required this.kvNamespaceId,
    required this.provisionedAt,
    required this.provisioningError,
    this.emailQuotaLimit,
    this.emailQuotaUsed = 0,
    this.emailQuotaResetAt = '',
    this.emailFromName = '',
    this.emailFromEmail = '',
    this.emailReplyTo = '',
    this.emailConfigActive = true,
    this.estimatedStudents = 0,
    this.estimatedStaff = 0,
    this.preferredPlanId = '',
    this.customRequirements = '',
  });

  bool get isPending => registrationStatus == 'Pending_Approval';
  bool get isDeleted => deletedAt.isNotEmpty;
  bool get isTrial => status == 'Trial';
  bool get isActive => status == 'Active';
  bool get isSuspended => status == 'Suspended';
  bool get isProvisionedLive => provisioningStatus == 'live';
  bool get isProvisioningPending =>
      provisioningStatus == 'pending' || provisioningStatus == 'provisioning';
  bool get hasDedicatedConfig => dedicatedSlug.isNotEmpty || dedicatedDomain.isNotEmpty;

  factory SchoolModel.fromJson(Map<String, dynamic> json) {
    String str(dynamic v) => (v ?? '').toString();
    int toInt(dynamic v) => (v is num ? v.round() : int.tryParse(str(v)) ?? 0);
    return SchoolModel(
      id: str(json['id']),
      schoolName: str(json['schoolName']).isEmpty ? 'अज्ञात स्कूल' : str(json['schoolName']),
      subdomain: str(json['subdomain']),
      customDomain: str(json['customDomain']),
      contactEmail: str(json['contactEmail']),
      contactPhone: str(json['contactPhone']),
      status: str(json['status']).isEmpty ? 'Active' : str(json['status']),
      registrationStatus: str(json['registrationStatus']).isEmpty ? 'Active' : str(json['registrationStatus']),
      planId: str(json['planId']).isEmpty ? 'trial' : str(json['planId']),
      planName: str(json['planName']),
      trialEndsAt: str(json['trialEndsAt']),
      deletedAt: str(json['deletedAt']),
      createdAt: str(json['createdAt']),
      provisioningStatus: str(json['provisioningStatus']).isEmpty ? 'none' : str(json['provisioningStatus']),
      dedicatedSlug: str(json['dedicatedSlug']),
      dedicatedDomain: str(json['dedicatedDomain']),
      d1DatabaseId: str(json['d1DatabaseId']),
      r2BucketName: str(json['r2BucketName']),
      kvNamespaceId: str(json['kvNamespaceId']),
      provisionedAt: str(json['provisionedAt']),
      provisioningError: str(json['provisioningError']),
      emailQuotaLimit: json['emailQuotaLimit'] == null ? null : toInt(json['emailQuotaLimit']),
      emailQuotaUsed: toInt(json['emailQuotaUsed']),
      emailQuotaResetAt: str(json['emailQuotaResetAt']),
      emailFromName: str(json['emailFromName']),
      emailFromEmail: str(json['emailFromEmail']),
      emailReplyTo: str(json['emailReplyTo']),
      emailConfigActive: json['emailConfigActive'] == null ? true : json['emailConfigActive'] == true || json['emailConfigActive'] == 1,
      estimatedStudents: toInt(json['estimatedStudents']),
      estimatedStaff: toInt(json['estimatedStaff']),
      preferredPlanId: str(json['preferredPlanId']),
      customRequirements: str(json['customRequirements']),
    );
  }

  /// Status label in Hindi for UI chips.
  String get statusLabel {
    switch (status) {
      case 'Trial':
        return 'ट्रायल';
      case 'Active':
        return 'सक्रिय';
      case 'Suspended':
        return 'निलंबित';
      default:
        return status;
    }
  }

  String get regStatusLabel {
    switch (registrationStatus) {
      case 'Pending_Approval':
        return 'लंबित अनुमोदन';
      case 'Approved':
        return 'स्वीकृत';
      case 'Rejected':
        return 'अस्वीकृत';
      case 'Deleted':
        return 'हटाया गया';
      case 'Trial_Expired':
        return 'ट्रायल समाप्त';
      default:
        return registrationStatus;
    }
  }
}