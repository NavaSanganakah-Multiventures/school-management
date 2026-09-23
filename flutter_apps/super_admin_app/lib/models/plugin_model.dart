/// Plugin models — mirror `/api/admin/plugins*` responses.
library;

class PluginModel {
  final String id;
  final String name;
  final String description;
  final String type; // global | private
  final double price;
  final bool isActive;
  final String? targetSchoolId;
  final int activeSubscribersCount;
  final String createdAt;
  final String updatedAt;

  const PluginModel({
    required this.id,
    required this.name,
    this.description = '',
    this.type = 'global',
    this.price = 0,
    this.isActive = true,
    this.targetSchoolId,
    this.activeSubscribersCount = 0,
    this.createdAt = '',
    this.updatedAt = '',
  });

  factory PluginModel.fromJson(Map<String, dynamic> json) {
    return PluginModel(
      id: (json['id'] ?? '').toString(),
      name: (json['name'] ?? '').toString(),
      description: (json['description'] ?? '').toString(),
      type: (json['type'] ?? 'global').toString(),
      price: json['price'] is num
          ? (json['price'] as num).toDouble()
          : (double.tryParse((json['price'] ?? '0').toString()) ?? 0),
      isActive: json['is_active'] == true || json['is_active'] == 1,
      targetSchoolId: (json['target_school_id'] as Object?)?.toString(),
      activeSubscribersCount:
          ((json['active_subscribers_count'] ?? 0) is num)
              ? ((json['active_subscribers_count'] as num).round())
              : (int.tryParse((json['active_subscribers_count'] ?? '0').toString()) ?? 0),
      createdAt: (json['created_at'] ?? '').toString(),
      updatedAt: (json['updated_at'] ?? '').toString(),
    );
  }
}

/// A school's plugin subscription row (GET /api/admin/plugins/subscriptions).
class PluginSubscriptionModel {
  final String id;
  final String schoolId;
  final String pluginId;
  final String status; // active | inactive | expired
  final String validUntil;
  final String createdAt;
  final String updatedAt;
  final String schoolName;
  final String pluginName;
  final double pluginPrice;

  const PluginSubscriptionModel({
    required this.id,
    required this.schoolId,
    required this.pluginId,
    required this.status,
    this.validUntil = '',
    this.createdAt = '',
    this.updatedAt = '',
    this.schoolName = '',
    this.pluginName = '',
    this.pluginPrice = 0,
  });

  factory PluginSubscriptionModel.fromJson(Map<String, dynamic> json) {
    return PluginSubscriptionModel(
      id: (json['id'] ?? '').toString(),
      schoolId: (json['school_id'] ?? '').toString(),
      pluginId: (json['plugin_id'] ?? '').toString(),
      status: (json['status'] ?? '').toString(),
      validUntil: (json['valid_until'] ?? '').toString(),
      createdAt: (json['created_at'] ?? '').toString(),
      updatedAt: (json['updated_at'] ?? '').toString(),
      schoolName: (json['school_name'] ?? '').toString(),
      pluginName: (json['plugin_name'] ?? '').toString(),
      pluginPrice: json['plugin_price'] is num
          ? (json['plugin_price'] as num).toDouble()
          : (double.tryParse((json['plugin_price'] ?? '0').toString()) ?? 0),
    );
  }
}

/// Plugin trial row (GET /api/admin/plugins/trials).
class PluginTrialModel {
  final String id;
  final String schoolId;
  final String pluginId;
  final String status;
  final String validUntil;
  final String trialEndsAt;
  final String trialGrantedBy;
  final String trialGrantedAt;
  final String paymentStatus;
  final double pricePerCycle;
  final String billingCycle;
  final String nextBillingDate;
  final String schoolName;
  final String pluginName;
  final double pluginPrice;

  const PluginTrialModel({
    required this.id,
    required this.schoolId,
    required this.pluginId,
    required this.status,
    this.validUntil = '',
    this.trialEndsAt = '',
    this.trialGrantedBy = '',
    this.trialGrantedAt = '',
    this.paymentStatus = '',
    this.pricePerCycle = 0,
    this.billingCycle = '',
    this.nextBillingDate = '',
    this.schoolName = '',
    this.pluginName = '',
    this.pluginPrice = 0,
  });

  factory PluginTrialModel.fromJson(Map<String, dynamic> json) {
    double money(dynamic v) =>
        v is num ? v.toDouble() : (double.tryParse((v ?? '0').toString()) ?? 0);
    return PluginTrialModel(
      id: (json['id'] ?? '').toString(),
      schoolId: (json['school_id'] ?? '').toString(),
      pluginId: (json['plugin_id'] ?? '').toString(),
      status: (json['status'] ?? '').toString(),
      validUntil: (json['valid_until'] ?? '').toString(),
      trialEndsAt: (json['trial_ends_at'] ?? '').toString(),
      trialGrantedBy: (json['trial_granted_by'] ?? '').toString(),
      trialGrantedAt: (json['trial_granted_at'] ?? '').toString(),
      paymentStatus: (json['payment_status'] ?? '').toString(),
      pricePerCycle: money(json['price_per_cycle']),
      billingCycle: (json['billing_cycle'] ?? '').toString(),
      nextBillingDate: (json['next_billing_date'] ?? '').toString(),
      schoolName: (json['school_name'] ?? '').toString(),
      pluginName: (json['plugin_name'] ?? '').toString(),
      pluginPrice: money(json['plugin_price']),
    );
  }
}