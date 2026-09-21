import 'api_client.dart';
import '../models/staff_model.dart';

class StaffService {
  final _api = ApiClient();

  Future<List<StaffModel>> getStaff({String? department, String? q}) async {
    final res = await _api.get('/api/staff', queryParams: {
      if (department != null) 'department': department,
      if (q != null) 'q': q,
    });
    final list = res['staff'] as List? ?? [];
    return list.map((e) => StaffModel.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<Map<String, dynamic>> addStaff(Map<String, dynamic> body) async {
    return await _api.post('/api/staff', body: body);
  }

  Future<void> setStaffPassword(String id, {String? password}) async {
    await _api.post('/api/staff/$id/login', body: {if (password != null) 'password': password});
  }

  Future<void> deleteStaff(String id) async {
    await _api.delete('/api/staff/$id');
  }

  Future<List<ClassModel>> getClasses() async {
    final res = await _api.get('/api/classes');
    final list = res['classes'] as List? ?? [];
    return list.map((e) => ClassModel.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<Map<String, dynamic>> getMyClasses() async {
    return await _api.get('/api/classes/my-classes');
  }

  Future<void> assignTeacher({required String className, required String teacherUserId}) async {
    await _api.post('/api/classes/assign-teacher', body: {
      'className': className,
      'teacherUserId': teacherUserId,
    });
  }

  Future<void> removeTeacher(String className) async {
    await _api.post('/api/classes/remove-teacher', body: {'className': className});
  }

  Future<Map<String, dynamic>> getPrincipal() async {
    return await _api.get('/api/principal');
  }

  Future<void> changePrincipal(Map<String, dynamic> body) async {
    await _api.post('/api/principal/change', body: body);
  }
}
