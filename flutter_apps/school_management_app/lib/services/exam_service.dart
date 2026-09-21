import 'api_client.dart';
import '../models/exam_model.dart';

class ExamService {
  final _api = ApiClient();

  Future<List<ExamModel>> getExams() async {
    final res = await _api.get('/api/exams');
    final list = res['exams'] as List? ?? [];
    return list.map((e) => ExamModel.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<ExamModel> createExam(Map<String, dynamic> body) async {
    final res = await _api.post('/api/exams', body: body);
    return ExamModel.fromJson(res['exam'] ?? res);
  }

  Future<List<ExamSubjectModel>> getExamSubjects(String examId) async {
    final res = await _api.get('/api/exams/$examId/subjects');
    final list = res['subjects'] as List? ?? [];
    return list.map((e) => ExamSubjectModel.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> addExamSubject(String examId, Map<String, dynamic> body) async {
    await _api.post('/api/exams/$examId/subjects', body: body);
  }

  Future<List<SubjectMarkModel>> getMarks({String? studentId, String? examId}) async {
    final res = await _api.get('/api/exams/marks', queryParams: {
      if (studentId != null) 'studentId': studentId,
      if (examId != null) 'examId': examId,
    });
    final list = res['marks'] as List? ?? [];
    return list.map((e) => SubjectMarkModel.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> enterMarks({
    required String examId,
    required String studentId,
    required List<MarkEntryModel> marks,
  }) async {
    await _api.post('/api/exams/marks', body: {
      'examId': examId,
      'studentId': studentId,
      'marks': marks.map((m) => m.toJson()).toList(),
    });
  }

  Future<ReportCardModel> getReportCard(String studentId, {String? examId}) async {
    final res = await _api.get('/api/exams/report-card/$studentId',
        queryParams: {if (examId != null) 'examId': examId});
    final rc = res['reportCard'];
    if (rc != null) {
      return ReportCardModel.fromJson(rc as Map<String, dynamic>);
    }
    return ReportCardModel.fromJson(res);
  }

  Future<ExamAnalyticsModel> getAnalytics(String examId) async {
    final res = await _api.get('/api/exams/$examId/analytics');
    return ExamAnalyticsModel.fromJson(res['analytics'] ?? res);
  }
}
