class SubjectModel {
  final String? id;
  final String subjectName;
  final String? subjectCode;

  SubjectModel({this.id, required this.subjectName, this.subjectCode});

  factory SubjectModel.fromJson(Map<String, dynamic> json) {
    return SubjectModel(
      id: json['id']?.toString(),
      subjectName: json['subjectName'] ?? json['subject_name'] ?? json['name'] ?? '',
      subjectCode: json['subjectCode']?.toString() ?? json['subject_code']?.toString(),
    );
  }
}

class ClassSubjectModel {
  final String className;
  final String subjectName;
  final String? subjectType;
  final bool? isOptional;
  final int? maxMarks;

  ClassSubjectModel({
    required this.className,
    required this.subjectName,
    this.subjectType,
    this.isOptional,
    this.maxMarks,
  });

  factory ClassSubjectModel.fromJson(Map<String, dynamic> json) {
    return ClassSubjectModel(
      className: json['className'] ?? json['class_name'] ?? '',
      subjectName: json['subjectName'] ?? json['subject_name'] ?? '',
      subjectType: json['subjectType']?.toString() ?? json['subject_type']?.toString(),
      // Backend stores is_optional as int 0/1.
      isOptional: json['isOptional'] == true || json['is_optional'] == true || json['is_optional'] == 1,
      maxMarks: json['maxMarks'] is int
          ? json['maxMarks']
          : int.tryParse(json['maxMarks']?.toString() ?? '') ?? (json['max_marks'] is int ? json['max_marks'] : int.tryParse(json['max_marks']?.toString() ?? '')),
    );
  }
}
