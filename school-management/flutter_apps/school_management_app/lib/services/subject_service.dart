import 'api_client.dart';
import '../models/subject_model.dart';

class SubjectService {
  final _api = ApiClient();

  Future<({List<SubjectModel> subjects, List<ClassSubjectModel> classSubjects})>
      getSubjects() async {
    final res = await _api.get('/api/subjects');
    final subs = (res['subjects'] as List? ?? [])
        .map((e) => SubjectModel.fromJson(e as Map<String, dynamic>))
        .toList();
    final classSubs = (res['classSubjects'] as List? ?? [])
        .map((e) => ClassSubjectModel.fromJson(e as Map<String, dynamic>))
        .toList();
    return (subjects: subs, classSubjects: classSubs);
  }

  Future<void> createSubject(String subjectName, {String? subjectCode}) async {
    await _api.post('/api/subjects', body: {
      'subjectName': subjectName,
      if (subjectCode != null) 'subjectCode': subjectCode,
    });
  }

  Future<void> mapSubject({
    required String className,
    required String subjectId,
    String? subjectType,
    bool? isOptional,
    int? maxMarks,
  }) async {
    await _api.post('/api/subjects/map', body: {
      'className': className,
      'subjectId': subjectId,
      if (subjectType != null) 'subjectType': subjectType,
      if (isOptional != null) 'isOptional': isOptional,
      if (maxMarks != null) 'maxMarks': maxMarks,
    });
  }
}
