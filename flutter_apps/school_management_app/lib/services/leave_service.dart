import 'api_client.dart';
import '../models/leave_model.dart';

class LeaveService {
  final _api = ApiClient();

  Future<List<LeaveApplicationModel>> getApplications() async {
    final res = await _api.get('/api/leave-applications');
    final list = res['leaveApplications'] as List? ?? [];
    return list.map((e) => LeaveApplicationModel.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> applyLeave({
    required String studentId,
    required String startDate,
    required String endDate,
    required String reason,
  }) async {
    await _api.post('/api/leave-applications', body: {
      'studentId': studentId,
      'startDate': startDate,
      'endDate': endDate,
      'reason': reason,
    });
  }

  Future<void> updateStatus(String id, String status) async {
    await _api.put('/api/leave-applications/$id/status', body: {'status': status});
  }
}
