import '../models/transaction_model.dart';
import 'api_client.dart';

class TransactionService {
  final SuperAdminApiClient _api = SuperAdminApiClient();

  /// GET /api/admin/transactions?status=&schoolId=&from=&to=
  Future<(List<TransactionModel>, TxnSummaryModel?)> fetchTransactions({
    String? status,
    String? schoolId,
  }) async {
    final res = await _api.get('/api/admin/transactions', queryParams: {
      if (status != null && status != 'All') 'status': status,
      if (schoolId != null && schoolId.isNotEmpty) 'schoolId': schoolId,
    });
    if (res is Map && res['success'] == true) {
      final list = ((res['transactions'] as List?) ?? [])
          .whereType<Map>()
          .map((e) => TransactionModel.fromJson(Map<String, dynamic>.from(e)))
          .toList();
      final summary = res['summary'] is Map
          ? TxnSummaryModel.fromJson(Map<String, dynamic>.from(res['summary'] as Map))
          : null;
      return (list, summary);
    }
    return (<TransactionModel>[], null);
  }

  /// GET /api/admin/webhook-events — Razorpay webhook audit
  Future<List<WebhookEventModel>> fetchWebhookEvents() async {
    final res = await _api.get('/api/admin/webhook-events');
    if (res is Map && res['success'] == true) {
      return ((res['events'] as List?) ?? [])
          .whereType<Map>()
          .map((e) => WebhookEventModel.fromJson(Map<String, dynamic>.from(e)))
          .toList();
    }
    return [];
  }
}