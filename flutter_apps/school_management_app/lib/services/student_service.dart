import 'api_client.dart';
import '../models/student_model.dart';

class StudentService {
  final _api = ApiClient();

  Future<List<StudentModel>> getStudents({String? className, String? status, String? q}) async {
    final res = await _api.get('/api/students', queryParams: {
      if (className != null) 'class': className,
      if (status != null) 'status': status,
      if (q != null) 'q': q,
    });
    final list = res['students'] as List? ?? [];
    return list.map((e) => StudentModel.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<StudentModel> getStudent(String id) async {
    final res = await _api.get('/api/students/$id');
    final student = res['student'] ?? res;
    return StudentModel.fromJson(student as Map<String, dynamic>);
  }

  Future<StudentModel> addStudent(Map<String, dynamic> body) async {
    final res = await _api.post('/api/students', body: body);
    final student = res['student'] ?? res;
    return StudentModel.fromJson(student as Map<String, dynamic>);
  }

  Future<StudentModel> updateStudent(String id, Map<String, dynamic> body) async {
    final res = await _api.put('/api/students/$id', body: body);
    final student = res['student'] ?? res;
    return StudentModel.fromJson(student as Map<String, dynamic>);
  }

  Future<void> issueTC(String id, Map<String, dynamic> body) async {
    await _api.post('/api/students/$id/issue-tc', body: body);
  }

  Future<void> deleteStudent(String id) async {
    await _api.delete('/api/students/$id');
  }
}
