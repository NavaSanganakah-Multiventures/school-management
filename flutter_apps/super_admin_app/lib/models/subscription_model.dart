/// Feature request & recurring subscription / Razorpay plan models.
library;

/// Feature request row (GET /api/admin/feature-requests).
class FeatureRequestModel {
  final String id;
  final String schoolId;
  final String schoolName;
  final String contactEmail;
  final String contactPhone;
  final String subdomain;
  final String planId;
  final String title;
  final String description;
  final String category;
  final String status; // Pending | In_Review | Approved | Delivered | Rejected
  final String adminNotes;
  final String createdAt;
  final String updatedAt;

  const FeatureRequestModel({
    required this.id,
    required this.schoolId,
    required this.schoolName,
    this.contactEmail = '',
    this.contactPhone = '',
    this.subdomain = '',
    this.planId = '',
    this.title = '',
    this.description = '',
    this.category = '',
    this.status = 'Pending',
    this.adminNotes = '',
    this.createdAt = '',
    this.updatedAt = '',
  });

  static const validStatuses = ['Pending', 'In_Review', 'Approved', 'Delivered', 'Rejected'];

  String get statusLabel {
    switch (status) {
      case 'Pending':
        return 'लंबित';
      case 'In_Review':
        return 'समीक्षा में';
      case 'Approved':
        return 'स्वीकृत';
      case 'Delivered':
        return 'वितरित';
      case 'Rejected':
        return 'अस्वीकृत';
      default:
        return status;
    }
  }

  factory FeatureRequestModel.fromJson(Map<String, dynamic> json) {
    return FeatureRequestModel(
      id: (json['id'] ?? '').toString(),
      schoolId: (json['school_id'] ?? '').toString(),
      schoolName: (json['school_name'] ?? '').toString(),
      contactEmail: (json['contact_email'] ?? '').toString(),
      contactPhone: (json['contact_phone'] ?? '').toString(),
      subdomain: (json['subdomain'] ?? '').toString(),
      planId: (json['plan_id'] ?? '').toString(),
      title: (json['title'] ?? '').toString(),
      description: (json['description'] ?? '').toString(),
      category: (json['category'] ?? '').toString(),
      status: (json['status'] ?? 'Pending').toString(),
      adminNotes: (json['admin_notes'] ?? '').toString(),
      createdAt: (json['created_at'] ?? '').toString(),
      updatedAt: (json['updated_at'] ?? '').toString(),
    );
  }
}

/// Recurring subscription row (GET /api/admin/subscriptions).
class RecurringSubscriptionModel {
  final String schoolId;
  final String planId;
  final String planName;
  final String billingCycle;
  final String status;
  final bool autoPayEnabled;
  final String mandateId;
  final String mandateStatus;
  final String razorpaySubscriptionId;
  final String razorpayPlanId;
  final int totalCycles;
  final int remainingCycles;
  final String currentCycleStart;
  final String currentCycleEnd;
  final String nextBillingDate;
  final String pausedAt;
  final String updatedAt;
  final String schoolName;
  final String schoolStatus;
  final String contactEmail;

  const RecurringSubscriptionModel({
    required this.schoolId,
    required this.planId,
    required this.planName,
    this.billingCycle = '',
    this.status = '',
    this.autoPayEnabled = false,
    this.mandateId = '',
    this.mandateStatus = '',
    this.razorpaySubscriptionId = '',
    this.razorpayPlanId = '',
    this.totalCycles = 0,
    this.remainingCycles = 0,
    this.currentCycleStart = '',
    this.currentCycleEnd = '',
    this.nextBillingDate = '',
    this.pausedAt = '',
    this.updatedAt = '',
    this.schoolName = '',
    this.schoolStatus = '',
    this.contactEmail = '',
  });

  bool get isPaused => status == 'Paused' || pausedAt.isNotEmpty;

  factory RecurringSubscriptionModel.fromJson(Map<String, dynamic> json) {
    int toInt(dynamic v) =>
        v is num ? v.round() : (int.tryParse((v ?? '0').toString()) ?? 0);
    return RecurringSubscriptionModel(
      schoolId: (json['school_id'] ?? '').toString(),
      planId: (json['plan_id'] ?? '').toString(),
      planName: (json['plan_name'] ?? '').toString(),
      billingCycle: (json['billing_cycle'] ?? '').toString(),
      status: (json['status'] ?? '').toString(),
      autoPayEnabled: json['auto_pay_enabled'] == true || json['auto_pay_enabled'] == 1,
      mandateId: (json['mandate_id'] ?? '').toString(),
      mandateStatus: (json['mandate_status'] ?? '').toString(),
      razorpaySubscriptionId: (json['razorpay_subscription_id'] ?? '').toString(),
      razorpayPlanId: (json['razorpay_plan_id'] ?? '').toString(),
      totalCycles: toInt(json['total_cycles']),
      remainingCycles: toInt(json['remaining_cycles']),
      currentCycleStart: (json['current_cycle_start'] ?? '').toString(),
      currentCycleEnd: (json['current_cycle_end'] ?? '').toString(),
      nextBillingDate: (json['next_billing_date'] ?? '').toString(),
      pausedAt: (json['paused_at'] ?? '').toString(),
      updatedAt: (json['updated_at'] ?? '').toString(),
      schoolName: (json['school_name'] ?? '').toString(),
      schoolStatus: (json['school_status'] ?? '').toString(),
      contactEmail: (json['contact_email'] ?? '').toString(),
    );
  }
}

/// Cached Razorpay plan row (GET /api/admin/razorpay/plans).
class RazorpayPlanModel {
  final String id;
  final String platformPlanId;
  final String razorpayPlanId;
  final String period; // monthly | yearly
  final int amount; // stored in paise
  final String razorpayItemId;
  final String createdAt;

  const RazorpayPlanModel({
    required this.id,
    required this.platformPlanId,
    required this.razorpayPlanId,
    this.period = '',
    this.amount = 0,
    this.razorpayItemId = '',
    this.createdAt = '',
  });

  factory RazorpayPlanModel.fromJson(Map<String, dynamic> json) {
    return RazorpayPlanModel(
      id: (json['id'] ?? '').toString(),
      platformPlanId: (json['platform_plan_id'] ?? '').toString(),
      razorpayPlanId: (json['razorpay_plan_id'] ?? '').toString(),
      period: (json['period'] ?? '').toString(),
      amount: json['amount'] is num
          ? (json['amount'] as num).round()
          : (int.tryParse((json['amount'] ?? '0').toString()) ?? 0),
      razorpayItemId: (json['razorpay_item_id'] ?? '').toString(),
      createdAt: (json['created_at'] ?? '').toString(),
    );
  }
}