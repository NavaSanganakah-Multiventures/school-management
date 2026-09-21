import 'package:flutter/material.dart' show Color;

class FeeInvoiceModel {
  final String id;
  final String? invoiceNumber;
  final String? studentId;
  final String studentName;
  final String? scholarNumber;
  final String? className;
  final String? section;
  final String title;
  final String totalAmount;
  final String paidAmount;
  final String? dueDate;
  final String status;
  final String? paymentMethod;
  final String? transactionId;
  final String? paidAt;

  FeeInvoiceModel({
    required this.id,
    this.invoiceNumber,
    this.studentId,
    required this.studentName,
    this.scholarNumber,
    this.className,
    this.section,
    required this.title,
    required this.totalAmount,
    required this.paidAmount,
    this.dueDate,
    required this.status,
    this.paymentMethod,
    this.transactionId,
    this.paidAt,
  });

  factory FeeInvoiceModel.fromJson(Map<String, dynamic> json) {
    return FeeInvoiceModel(
      id: json['id']?.toString() ?? '',
      invoiceNumber: json['invoiceNumber']?.toString(),
      studentId: json['studentId']?.toString(),
      studentName: json['studentName'] ?? '',
      scholarNumber: json['scholarNumber']?.toString(),
      className: json['className']?.toString(),
      section: json['section']?.toString(),
      title: json['title'] ?? '',
      totalAmount: json['totalAmount']?.toString() ?? '0',
      paidAmount: json['paidAmount']?.toString() ?? '0',
      dueDate: json['dueDate']?.toString(),
      status: json['status'] ?? 'Unpaid',
      paymentMethod: json['paymentMethod']?.toString(),
      transactionId: json['transactionId']?.toString(),
      paidAt: json['paidAt']?.toString(),
    );
  }

  double get total => double.tryParse(totalAmount) ?? 0;
  double get paid => double.tryParse(paidAmount) ?? 0;
  double get due => total - paid;

  Color get statusColor {
    switch (status.toLowerCase()) {
      case 'paid':
        return const Color(0xFF16A34A);
      case 'partial':
        return const Color(0xFFD97706);
      case 'overdue':
        return const Color(0xFFDC2626);
      default:
        return const Color(0xFF64748B);
    }
  }
}

class FeeSummaryModel {
  final double totalReceivable;
  final double totalCollected;
  final double totalPending;
  final int invoiceCount;

  FeeSummaryModel({
    required this.totalReceivable,
    required this.totalCollected,
    required this.totalPending,
    required this.invoiceCount,
  });

  factory FeeSummaryModel.fromJson(Map<String, dynamic> json) {
    return FeeSummaryModel(
      totalReceivable: double.tryParse(json['totalReceivable']?.toString() ?? '0') ?? 0,
      totalCollected: double.tryParse(json['totalCollected']?.toString() ?? '0') ?? 0,
      totalPending: double.tryParse(json['totalPending']?.toString() ?? '0') ?? 0,
      invoiceCount: json['invoiceCount'] is int
          ? json['invoiceCount']
          : int.tryParse(json['invoiceCount']?.toString() ?? '') ?? 0,
    );
  }
}

class FeeHeadModel {
  final String? id;
  final String headName;
  final String? description;

  FeeHeadModel({this.id, required this.headName, this.description});

  factory FeeHeadModel.fromJson(Map<String, dynamic> json) {
    return FeeHeadModel(
      id: json['id']?.toString(),
      headName: json['headName'] ?? json['name'] ?? '',
      description: json['description']?.toString(),
    );
  }
}

class FeeStructureModel {
  final String className;
  final String feeHeadName;
  final String? feeHeadId;
  final String amount;
  final String? billingCycle;

  FeeStructureModel({
    required this.className,
    required this.feeHeadName,
    this.feeHeadId,
    required this.amount,
    this.billingCycle,
  });

  factory FeeStructureModel.fromJson(Map<String, dynamic> json) {
    return FeeStructureModel(
      className: json['className'] ?? '',
      feeHeadName: json['feeHeadName'] ?? json['headName'] ?? '',
      feeHeadId: json['feeHeadId']?.toString(),
      amount: json['amount']?.toString() ?? '0',
      billingCycle: json['billingCycle']?.toString(),
    );
  }
}
