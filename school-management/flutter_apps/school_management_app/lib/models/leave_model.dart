import 'package:flutter/material.dart' show Color;

class LeaveApplicationModel {
  final String id;
  final String? studentId;
  final String? studentName;
  final String? className;
  final String startDate;
  final String endDate;
  final String reason;
  final String status;

  LeaveApplicationModel({
    required this.id,
    this.studentId,
    this.studentName,
    this.className,
    required this.startDate,
    required this.endDate,
    required this.reason,
    required this.status,
  });

  factory LeaveApplicationModel.fromJson(Map<String, dynamic> json) {
    final student = json['student'] is Map ? json['student'] : null;
    // Backend returns raw rows with snake_case: first_name, last_name, class_name,
    // student_id, start_date, end_date. Accept both camelCase and snake_case.
    final firstName = json['firstName'] ?? json['first_name'] ?? student?['first_name'] ?? student?['firstName'];
    final lastName = json['lastName'] ?? json['last_name'] ?? student?['last_name'] ?? student?['lastName'];
    final composedName = (firstName != null || lastName != null)
        ? '${firstName ?? ''} ${lastName ?? ''}'.trim()
        : null;
    return LeaveApplicationModel(
      id: json['id']?.toString() ?? '',
      studentId: json['studentId']?.toString() ?? json['student_id']?.toString() ?? student?['id']?.toString(),
      studentName: json['studentName']?.toString() ?? composedName ?? student?['fullName']?.toString() ?? student?['studentName']?.toString() ?? '',
      className: json['className']?.toString() ?? json['class_name']?.toString() ?? student?['class_name']?.toString() ?? student?['className']?.toString(),
      startDate: json['startDate'] ?? json['start_date'] ?? '',
      endDate: json['endDate'] ?? json['end_date'] ?? '',
      reason: json['reason'] ?? '',
      status: json['status'] ?? 'Pending',
    );
  }

  Color get statusColor {
    switch (status.toLowerCase()) {
      case 'approved':
        return const Color(0xFF16A34A);
      case 'rejected':
        return const Color(0xFFDC2626);
      default:
        return const Color(0xFFD97706);
    }
  }
}
