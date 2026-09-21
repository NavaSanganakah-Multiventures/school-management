import 'api_client.dart';
import '../models/lms_model.dart';

class LmsService {
  final _api = ApiClient();

  Future<List<LmsCourseModel>> getCourses({String? className, String? subject, String? board}) async {
    final res = await _api.get('/api/lms/courses', queryParams: {
      if (className != null) 'className': className,
      if (subject != null) 'subject': subject,
      if (board != null) 'board': board,
    });
    final list = res['courses'] as List? ?? [];
    return list.map((e) => LmsCourseModel.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<String> createCourse(Map<String, dynamic> body) async {
    final res = await _api.post('/api/lms/courses', body: body);
    return res['courseId']?.toString() ?? '';
  }

  Future<({LmsCourseModel? course, List<LmsLessonModel> lessons, List<LmsAssignmentModel> assignments})>
      getCourseDetail(String id) async {
    final res = await _api.get('/api/lms/courses/$id');
    final course = res['course'] != null
        ? LmsCourseModel.fromJson(res['course'] as Map<String, dynamic>)
        : null;
    final lessons = (res['lessons'] as List? ?? [])
        .map((e) => LmsLessonModel.fromJson(e as Map<String, dynamic>))
        .toList();
    final assignments = (res['assignments'] as List? ?? [])
        .map((e) => LmsAssignmentModel.fromJson(e as Map<String, dynamic>))
        .toList();
    return (course: course, lessons: lessons, assignments: assignments);
  }

  Future<void> addLesson(String courseId, Map<String, dynamic> body) async {
    await _api.post('/api/lms/courses/$courseId/lessons', body: body);
  }

  Future<void> addAssignment(String courseId, Map<String, dynamic> body) async {
    await _api.post('/api/lms/courses/$courseId/assignments', body: body);
  }

  Future<List<LmsSubmissionModel>> getSubmissions(String assignmentId) async {
    final res = await _api.get('/api/lms/assignments/$assignmentId/submissions');
    final list = res['submissions'] as List? ?? [];
    return list.map((e) => LmsSubmissionModel.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> submitAssignment(String assignmentId, {String? submissionText, String? attachmentUrl, String? studentName}) async {
    await _api.post('/api/lms/assignments/$assignmentId/submit', body: {
      if (submissionText != null) 'submissionText': submissionText,
      if (attachmentUrl != null) 'attachmentUrl': attachmentUrl,
      if (studentName != null) 'studentName': studentName,
    });
  }

  Future<void> gradeSubmission(String submissionId, {int? marksObtained, String? teacherFeedback}) async {
    await _api.post('/api/lms/submissions/$submissionId/grade', body: {
      if (marksObtained != null) 'marksObtained': marksObtained,
      if (teacherFeedback != null) 'teacherFeedback': teacherFeedback,
    });
  }
}
