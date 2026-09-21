import 'api_client.dart';

class AiService {
  final _api = ApiClient();

  Future<String> chat(String prompt, {List<Map<String, dynamic>>? files}) async {
    final res = await _api.post('/api/ai/chat', body: {
      'prompt': prompt,
      if (files != null) 'files': files,
    });
    return res['message']?.toString() ?? '';
  }

  Future<Map<String, dynamic>> reportAnalysis({String? examId, String? className, String? subject}) async {
    final res = await _api.post('/api/ai/report-analysis', body: {
      if (examId != null) 'examId': examId,
      if (className != null) 'className': className,
      if (subject != null) 'subject': subject,
    });
    return res['analysis'] ?? res;
  }

  Future<Map<String, dynamic>> getSettings() async {
    return await _api.get('/api/ai/settings');
  }

  Future<void> updateSettings({String? apiKey}) async {
    await _api.put('/api/ai/settings', body: {if (apiKey != null) 'apiKey': apiKey});
  }
}
