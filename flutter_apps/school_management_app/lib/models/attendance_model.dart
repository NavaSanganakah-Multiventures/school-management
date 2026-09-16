class AttendanceRecordModel {
  final String id;
  final String studentId;
  final String studentName;
  final String scholarNumber;
  final String className;
  final String section;
  final String parentName;
  final String parentPhone;
  final String date;
  final String status; // 'Present', 'Absent', 'Leave', 'Unmarked'
  final bool isMarked;
  final String remarks;
  final String markedBy;

  AttendanceRecordModel({
    required this.id,
    required this.studentId,
    required this.studentName,
    required this.scholarNumber,
    required this.className,
    required this.section,
    required this.parentName,
    required this.parentPhone,
    required this.date,
    required this.status,
    required this.isMarked,
    required this.remarks,
    required this.markedBy,
  });

  factory AttendanceRecordModel.fromJson(Map<String, dynamic> json) {
    return AttendanceRecordModel(
      id: json['id'] ?? '',
      studentId: json['studentId'] ?? '',
      studentName: json['studentName'] ?? '',
      scholarNumber: json['scholarNumber'] ?? '',
      className: json['className'] ?? '',
      section: json['section'] ?? '',
      parentName: json['parentName'] ?? 'अभिभावक',
      parentPhone: json['parentPhone'] ?? '',
      date: json['date'] ?? '',
      status: json['status'] ?? 'Unmarked',
      isMarked: json['isMarked'] ?? false,
      remarks: json['remarks'] ?? '',
      markedBy: json['markedBy'] ?? '',
    );
  }

  AttendanceRecordModel copyWith({
    String? status,
    bool? isMarked,
    String? remarks,
  }) {
    return AttendanceRecordModel(
      id: id,
      studentId: studentId,
      studentName: studentName,
      scholarNumber: scholarNumber,
      className: className,
      section: section,
      parentName: parentName,
      parentPhone: parentPhone,
      date: date,
      status: status ?? this.status,
      isMarked: isMarked ?? this.isMarked,
      remarks: remarks ?? this.remarks,
      markedBy: markedBy,
    );
  }
}

class AttendanceStatsModel {
  final int total;
  final int present;
  final int absent;
  final int leave;
  final int unmarked;
  final int rate;
  final bool isRecorded;

  AttendanceStatsModel({
    required this.total,
    required this.present,
    required this.absent,
    required this.leave,
    required this.unmarked,
    required this.rate,
    required this.isRecorded,
  });

  factory AttendanceStatsModel.fromJson(Map<String, dynamic> json) {
    return AttendanceStatsModel(
      total: json['total'] ?? 0,
      present: json['present'] ?? 0,
      absent: json['absent'] ?? 0,
      leave: json['leave'] ?? 0,
      unmarked: json['unmarked'] ?? 0,
      rate: json['rate'] ?? 0,
      isRecorded: json['isRecorded'] ?? false,
    );
  }
}
