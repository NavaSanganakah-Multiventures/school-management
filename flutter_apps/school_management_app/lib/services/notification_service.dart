import 'api_client.dart';
import '../models/notice_model.dart';

class NotificationService {
  final _api = ApiClient();

  Future<List<NotificationHistoryModel>> getHistory() async {
    final res = await _api.get('/api/notifications/history');
    final list = res['history'] as List? ?? [];
    return list.map((e) => NotificationHistoryModel.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<Map<String, dynamic>> getTopics() async {
    return await _api.get('/api/notifications/topics');
  }

  Future<void> broadcast({
    required String title,
    required String body,
    String? topic,
    String? targetRole,
    String? priority,
  }) async {
    await _api.post('/api/notifications/broadcast', body: {
      'title': title,
      'body': body,
      if (topic != null) 'topic': topic,
      if (targetRole != null) 'targetRole': targetRole,
      if (priority != null) 'priority': priority,
    });
  }

  Future<List<Map<String, dynamic>>> getDevices() async {
    final res = await _api.get('/api/notifications/devices');
    final list = res['devices'] as List? ?? [];
    return list.map((e) => e as Map<String, dynamic>).toList();
  }
}
