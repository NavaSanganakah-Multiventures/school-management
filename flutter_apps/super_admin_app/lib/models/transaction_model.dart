/// Transaction / billing invoice models — mirror `/api/admin/transactions`.
library;

class TransactionModel {
  final String id;
  final String invoiceNumber;
  final String schoolId;
  final String schoolName;
  final String subdomain;
  final String contactEmail;
  final String description;
  final String planName;
  final String billingCycle;
  final double subtotal;
  final double gstPercent;
  final double gstAmount;
  final double totalAmount;
  final String paymentStatus;
  final String paymentMethod;
  final String transactionId;
  final String invoiceDate;
  final String paidAt;
  final String razorpayOrderId;
  final String razorpayPaymentId;
  final String razorpayPaymentLinkId;
  final String razorpayPaymentLinkUrl;
  final String webhookReceivedAt;

  const TransactionModel({
    required this.id,
    required this.invoiceNumber,
    required this.schoolId,
    required this.schoolName,
    this.subdomain = '',
    this.contactEmail = '',
    this.description = '',
    this.planName = '',
    this.billingCycle = '',
    this.subtotal = 0,
    this.gstPercent = 0,
    this.gstAmount = 0,
    this.totalAmount = 0,
    this.paymentStatus = '',
    this.paymentMethod = '',
    this.transactionId = '',
    this.invoiceDate = '',
    this.paidAt = '',
    this.razorpayOrderId = '',
    this.razorpayPaymentId = '',
    this.razorpayPaymentLinkId = '',
    this.razorpayPaymentLinkUrl = '',
    this.webhookReceivedAt = '',
  });

  bool get isPaid => paymentStatus == 'Paid';
  bool get isPending => paymentStatus == 'Processing' || paymentStatus == 'Pending';

  factory TransactionModel.fromJson(Map<String, dynamic> json) {
    double money(dynamic v) =>
        v is num ? v.toDouble() : (double.tryParse((v ?? '0').toString()) ?? 0);
    return TransactionModel(
      id: (json['id'] ?? '').toString(),
      invoiceNumber: (json['invoiceNumber'] ?? '').toString(),
      schoolId: (json['schoolId'] ?? '').toString(),
      schoolName: (json['schoolName'] ?? '').toString(),
      subdomain: (json['subdomain'] ?? '').toString(),
      contactEmail: (json['contactEmail'] ?? '').toString(),
      description: (json['description'] ?? '').toString(),
      planName: (json['planName'] ?? '').toString(),
      billingCycle: (json['billingCycle'] ?? '').toString(),
      subtotal: money(json['subtotal']),
      gstPercent: money(json['gstPercent']),
      gstAmount: money(json['gstAmount']),
      totalAmount: money(json['totalAmount']),
      paymentStatus: (json['paymentStatus'] ?? '').toString(),
      paymentMethod: (json['paymentMethod'] ?? '').toString(),
      transactionId: (json['transactionId'] ?? '').toString(),
      invoiceDate: (json['invoiceDate'] ?? '').toString(),
      paidAt: (json['paidAt'] ?? '').toString(),
      razorpayOrderId: (json['razorpayOrderId'] ?? '').toString(),
      razorpayPaymentId: (json['razorpayPaymentId'] ?? '').toString(),
      razorpayPaymentLinkId: (json['razorpayPaymentLinkId'] ?? '').toString(),
      razorpayPaymentLinkUrl: (json['razorpayPaymentLinkUrl'] ?? '').toString(),
      webhookReceivedAt: (json['webhookReceivedAt'] ?? '').toString(),
    );
  }
}

/// Aggregate summary returned alongside transactions.
class TxnSummaryModel {
  final int count;
  final int paidCount;
  final double totalAmount;
  final double collected;
  final double pending;
  final int failedCount;

  const TxnSummaryModel({
    this.count = 0,
    this.paidCount = 0,
    this.totalAmount = 0,
    this.collected = 0,
    this.pending = 0,
    this.failedCount = 0,
  });

  factory TxnSummaryModel.fromJson(Map<String, dynamic> json) {
    double money(dynamic v) =>
        v is num ? v.toDouble() : (double.tryParse((v ?? '0').toString()) ?? 0);
    int toInt(dynamic v) =>
        v is num ? v.round() : (int.tryParse((v ?? '0').toString()) ?? 0);
    return TxnSummaryModel(
      count: toInt(json['count']),
      paidCount: toInt(json['paidCount']),
      totalAmount: money(json['totalAmount']),
      collected: money(json['collected']),
      pending: money(json['pending']),
      failedCount: toInt(json['failedCount']),
    );
  }
}

/// Razorpay webhook event audit row (GET /api/admin/webhook-events).
class WebhookEventModel {
  final String id;
  final String eventId;
  final String eventType;
  final String entityId;
  final String schoolId;
  final bool processed;
  final String processedAt;
  final String receivedAt;

  const WebhookEventModel({
    required this.id,
    this.eventId = '',
    this.eventType = '',
    this.entityId = '',
    this.schoolId = '',
    this.processed = false,
    this.processedAt = '',
    this.receivedAt = '',
  });

  factory WebhookEventModel.fromJson(Map<String, dynamic> json) {
    return WebhookEventModel(
      id: (json['id'] ?? '').toString(),
      eventId: (json['event_id'] ?? '').toString(),
      eventType: (json['event_type'] ?? '').toString(),
      entityId: (json['entity_id'] ?? '').toString(),
      schoolId: (json['school_id'] ?? '').toString(),
      processed: json['processed'] == true || json['processed'] == 1,
      processedAt: (json['processed_at'] ?? '').toString(),
      receivedAt: (json['received_at'] ?? '').toString(),
    );
  }
}