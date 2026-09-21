class ExamModel {
  final String id;
  final String name;
  final String? academicYear;
  final String? term;
  final String? startDate;
  final String? endDate;
  final String status;

  ExamModel({
    required this.id,
    required this.name,
    this.academicYear,
    this.term,
    this.startDate,
    this.endDate,
    required this.status,
  });

  factory ExamModel.fromJson(Map<String, dynamic> json) {
    return ExamModel(
      id: json['id']?.toString() ?? '',
      name: json['name'] ?? '',
      academicYear: json['academicYear']?.toString(),
      term: json['term']?.toString() ?? json['classes']?.toString(),
      startDate: json['startDate']?.toString(),
      endDate: json['endDate']?.toString(),
      status: json['status'] ?? 'Active',
    );
  }
}

class ExamSubjectModel {
  final String? id;
  final String subjectName;
  final String? subjectId;
  final int? maxMarks;
  final int? passingMarks;
  final String? subjectType;
  final bool? isOptional;

  ExamSubjectModel({
    this.id,
    required this.subjectName,
    this.subjectId,
    this.maxMarks,
    this.passingMarks,
    this.subjectType,
    this.isOptional,
  });

  factory ExamSubjectModel.fromJson(Map<String, dynamic> json) {
    return ExamSubjectModel(
      id: json['id']?.toString(),
      subjectName: json['subjectName'] ?? json['subject_name'] ?? '',
      subjectId: json['subjectId']?.toString() ?? json['subject_id']?.toString(),
      maxMarks: json['maxMarks'] is int
          ? json['maxMarks']
          : int.tryParse(json['maxMarks']?.toString() ?? '') ?? (json['max_marks'] is int ? json['max_marks'] : int.tryParse(json['max_marks']?.toString() ?? '')),
      passingMarks: json['passingMarks'] is int
          ? json['passingMarks']
          : int.tryParse(json['passingMarks']?.toString() ?? '') ?? (json['passing_marks'] is int ? json['passing_marks'] : int.tryParse(json['passing_marks']?.toString() ?? '')),
      subjectType: json['subjectType']?.toString() ?? json['subject_type']?.toString(),
      isOptional: json['isOptional'] == true || json['is_optional'] == true || json['is_optional'] == 1,
    );
  }
}

class MarkEntryModel {
  final String subject;
  final int? maxMarks;
  final String? marksObtained;
  final String? grade;
  final String? remarks;

  MarkEntryModel({
    required this.subject,
    this.maxMarks,
    this.marksObtained,
    this.grade,
    this.remarks,
  });

  Map<String, dynamic> toJson() => {
        'subject': subject,
        if (maxMarks != null) 'maxMarks': maxMarks,
        if (marksObtained != null && marksObtained!.isNotEmpty)
          'marksObtained': marksObtained,
        if (grade != null && grade!.isNotEmpty) 'grade': grade,
        if (remarks != null && remarks!.isNotEmpty) 'remarks': remarks,
      };
}

class SubjectMarkModel {
  final String subject;
  final int? maxMarks;
  final String? marksObtained;
  final String? grade;
  final String? remarks;

  SubjectMarkModel({
    required this.subject,
    this.maxMarks,
    this.marksObtained,
    this.grade,
    this.remarks,
  });

  factory SubjectMarkModel.fromJson(Map<String, dynamic> json) {
    // Report-card subjects use `marks` (obtained) + `maxMarks`; marks-list rows
    // use `max_marks`/`marks_obtained`. Accept all variants.
    final obtained = json['marksObtained']?.toString() ??
        json['marks_obtained']?.toString() ??
        json['marks']?.toString();
    return SubjectMarkModel(
      subject: json['subject'] ?? json['subject_name'] ?? '',
      maxMarks: json['maxMarks'] is int
          ? json['maxMarks']
          : int.tryParse(json['maxMarks']?.toString() ?? '') ?? (json['max_marks'] is int ? json['max_marks'] : int.tryParse(json['max_marks']?.toString() ?? '')),
      marksObtained: obtained,
      grade: json['grade']?.toString() ?? json['finalGrade']?.toString(),
      remarks: json['remarks']?.toString(),
    );
  }
}

class ReportCardModel {
  final String studentName;
  final String className;
  final String? examName;
  final List<SubjectMarkModel> subjects;
  final int? totalMarks;
  final int? obtainedMarks;
  final String? percentage;
  final String? grade;

  ReportCardModel({
    required this.studentName,
    required this.className,
    this.examName,
    required this.subjects,
    this.totalMarks,
    this.obtainedMarks,
    this.percentage,
    this.grade,
  });

  factory ReportCardModel.fromJson(Map<String, dynamic> json) {
    final sc = json['studentInfo'] ?? json['student'] ?? {};
    final subsRaw = json['subjects'] ?? json['marks'] ?? [];
    // Backend report-card: top-level `totalMarks` = obtained sum, `maxTotal` = max sum,
    // `finalGrade` = grade, `term`/`examName` = exam name. Map accordingly.
    final int? obtained = json['obtainedMarks'] is int
        ? json['obtainedMarks']
        : int.tryParse(json['obtainedMarks']?.toString() ?? '') ?? (json['totalMarks'] is int ? json['totalMarks'] : int.tryParse(json['totalMarks']?.toString() ?? ''));
    final int? maxTotal = json['maxTotal'] is int
        ? json['maxTotal']
        : int.tryParse(json['maxTotal']?.toString() ?? '') ?? (json['totalMarks'] is int ? json['totalMarks'] : int.tryParse(json['totalMarks']?.toString() ?? ''));
    return ReportCardModel(
      studentName: sc['studentName'] ?? sc['fullName'] ?? sc['name'] ?? json['studentName'] ?? '',
      className: sc['className'] ?? sc['class_name'] ?? sc['class'] ?? json['className'] ?? '',
      examName: json['examName']?.toString() ?? json['term']?.toString(),
      subjects: (subsRaw as List)
          .map((s) => SubjectMarkModel.fromJson(s as Map<String, dynamic>))
          .toList(),
      totalMarks: maxTotal,
      obtainedMarks: obtained,
      percentage: json['percentage']?.toString(),
      grade: json['grade']?.toString() ?? json['finalGrade']?.toString(),
    );
  }
}

class ExamAnalyticsModel {
  final String examName;
  final int totalStudents;
  final int studentsPassed;
  final int? passPercentage;
  final int? averagePercentage;
  final int? highestPercentage;
  final int? lowestPercentage;
  final String? topperStudentId;
  final List<Map<String, dynamic>> subjectWiseAnalysis;
  final List<Map<String, dynamic>> gradeDistribution;

  ExamAnalyticsModel({
    required this.examName,
    required this.totalStudents,
    required this.studentsPassed,
    this.passPercentage,
    this.averagePercentage,
    this.highestPercentage,
    this.lowestPercentage,
    this.topperStudentId,
    required this.subjectWiseAnalysis,
    required this.gradeDistribution,
  });

  factory ExamAnalyticsModel.fromJson(Map<String, dynamic> json) {
    return ExamAnalyticsModel(
      examName: json['examName'] ?? '',
      totalStudents: json['totalStudents'] is int
          ? json['totalStudents']
          : int.tryParse(json['totalStudents']?.toString() ?? '') ?? 0,
      studentsPassed: json['studentsPassed'] is int
          ? json['studentsPassed']
          : int.tryParse(json['studentsPassed']?.toString() ?? '') ?? 0,
      // Percentages are fractional doubles (e.g. 95.5); parse as double, display as int.
      passPercentage: _pct(json['passPercentage']),
      averagePercentage: _pct(json['averagePercentage']),
      highestPercentage: _pct(json['highestPercentage']),
      lowestPercentage: _pct(json['lowestPercentage']),
      topperStudentId: json['topperStudentId']?.toString(),
      // Backend returns arrays of objects, not maps keyed by grade.
      subjectWiseAnalysis: json['subjectWiseAnalysis'] is List
          ? (json['subjectWiseAnalysis'] as List).map((e) => Map<String, dynamic>.from(e as Map)).toList()
          : [],
      gradeDistribution: json['gradeDistribution'] is List
          ? (json['gradeDistribution'] as List).map((e) => Map<String, dynamic>.from(e as Map)).toList()
          : [],
    );
  }
}

int? _pct(dynamic v) {
  if (v == null) return null;
  if (v is int) return v;
  if (v is double) return v.round();
  return double.tryParse(v.toString())?.round() ?? int.tryParse(v.toString());
}
