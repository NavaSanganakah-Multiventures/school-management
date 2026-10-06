import 'api_client.dart';
import '../models/exam_model.dart';

/// Thrown when the server answers "this student has no marks" rather than a card.
///
/// The endpoint returns **HTTP 200** with `{success:false, hasData:false, message:…}`
/// when there are no marks (api/exams/index.ts:310-315). ApiClient only throws on
/// non-2xx, so that 200 arrived here as a successful response.
///
/// The old code then fell through to `ReportCardModel.fromJson(res)` on the error
/// envelope, producing a model with no subjects and null totals. The screen rendered
/// the student's name over an empty card with an enabled "download PDF" button, so a
/// teacher saw an empty report card instead of the server's explanation. This is the
/// case the repo's own guidance warns about: a 2xx envelope is not a success.
class NoReportCardDataException implements Exception {
final String message;
final String studentName;
NoReportCardDataException(this.message, this.studentName);

@override
String toString() => message;
}

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

    if (res['success'] == false || res['hasData'] == false) {
      final info = res['studentInfo'];
      throw NoReportCardDataException(
        (res['message'] ?? 'इस छात्र के लिए कोई परीक्षा अंक प्रविष्ट नहीं हुए हैं।').toString(),
        (info != null && info['studentName'] != null ? info['studentName'] : '').toString(),
      );
    }

    final rc = res['reportCard'];
    if (rc != null) {
      return ReportCardModel.fromJson(rc as Map<String, dynamic>);
    }
    return ReportCardModel.fromJson(res);
  }

  Future<ExamAnalyticsModel> getAnalytics(String examId) async {
    final res = await _api.get('/api/exams/analytics/$examId');
    return ExamAnalyticsModel.fromJson(res['analytics'] ?? res);
  }
}
