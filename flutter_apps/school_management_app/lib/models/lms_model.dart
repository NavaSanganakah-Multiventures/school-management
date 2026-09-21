class LmsCourseModel {
  final String id;
  final String title;
  final String className;
  final String subject;
  final String? description;
  final String? thumbnailUrl;
  final String? board;

  LmsCourseModel({
    required this.id,
    required this.title,
    required this.className,
    required this.subject,
    this.description,
    this.thumbnailUrl,
    this.board,
  });

  factory LmsCourseModel.fromJson(Map<String, dynamic> json) {
    return LmsCourseModel(
      id: json['id']?.toString() ?? '',
      title: json['title'] ?? '',
      className: json['className'] ?? json['class_name'] ?? '',
      subject: json['subject'] ?? '',
      description: json['description']?.toString(),
      thumbnailUrl: json['thumbnailUrl']?.toString() ?? json['thumbnail_url']?.toString(),
      board: json['board']?.toString(),
    );
  }
}

class LmsLessonModel {
  final String? id;
  final String title;
  final String? description;
  final String? contentType;
  final String? contentUrl;
  final int? durationMins;
  final int? sequenceOrder;

  LmsLessonModel({
    this.id,
    required this.title,
    this.description,
    this.contentType,
    this.contentUrl,
    this.durationMins,
    this.sequenceOrder,
  });

  factory LmsLessonModel.fromJson(Map<String, dynamic> json) {
    return LmsLessonModel(
      id: json['id']?.toString(),
      title: json['title'] ?? '',
      description: json['description']?.toString(),
      contentType: json['contentType']?.toString() ?? json['content_type']?.toString(),
      contentUrl: json['contentUrl']?.toString() ?? json['content_url']?.toString(),
      durationMins: json['durationMins'] is int
          ? json['durationMins']
          : int.tryParse(json['durationMins']?.toString() ?? '') ?? (json['duration_mins'] is int ? json['duration_mins'] : int.tryParse(json['duration_mins']?.toString() ?? '')),
      sequenceOrder: json['sequenceOrder'] is int
          ? json['sequenceOrder']
          : int.tryParse(json['sequenceOrder']?.toString() ?? '') ?? (json['sequence_order'] is int ? json['sequence_order'] : int.tryParse(json['sequence_order']?.toString() ?? '')),
    );
  }
}

class LmsAssignmentModel {
  final String id;
  final String title;
  final String? instructions;
  final String? dueDate;
  final int? maxMarks;
  final String? targetType;

  LmsAssignmentModel({
    required this.id,
    required this.title,
    this.instructions,
    this.dueDate,
    this.maxMarks,
    this.targetType,
  });

  factory LmsAssignmentModel.fromJson(Map<String, dynamic> json) {
    return LmsAssignmentModel(
      id: json['id']?.toString() ?? '',
      title: json['title'] ?? '',
      instructions: json['instructions']?.toString(),
      dueDate: json['dueDate']?.toString() ?? json['due_date']?.toString(),
      maxMarks: json['maxMarks'] is int
          ? json['maxMarks']
          : int.tryParse(json['maxMarks']?.toString() ?? '') ?? (json['max_marks'] is int ? json['max_marks'] : int.tryParse(json['max_marks']?.toString() ?? '')),
      targetType: json['targetType']?.toString() ?? json['target_type']?.toString(),
    );
  }
}

class LmsSubmissionModel {
  final String? id;
  final String? studentName;
  final String? submissionText;
  final String? attachmentUrl;
  final String? status;
  final int? marksObtained;
  final String? teacherFeedback;

  LmsSubmissionModel({
    this.id,
    this.studentName,
    this.submissionText,
    this.attachmentUrl,
    this.status,
    this.marksObtained,
    this.teacherFeedback,
  });

  factory LmsSubmissionModel.fromJson(Map<String, dynamic> json) {
    return LmsSubmissionModel(
      id: json['id']?.toString(),
      studentName: json['studentName']?.toString() ?? json['student_name']?.toString(),
      submissionText: json['submissionText']?.toString() ?? json['submission_text']?.toString(),
      attachmentUrl: json['attachmentUrl']?.toString() ?? json['attachment_url']?.toString(),
      status: json['status']?.toString(),
      marksObtained: json['marksObtained'] is int
          ? json['marksObtained']
          : int.tryParse(json['marksObtained']?.toString() ?? '') ?? (json['marks_obtained'] is int ? json['marks_obtained'] : int.tryParse(json['marks_obtained']?.toString() ?? '')),
      teacherFeedback: json['teacherFeedback']?.toString() ?? json['teacher_feedback']?.toString(),
    );
  }
}
