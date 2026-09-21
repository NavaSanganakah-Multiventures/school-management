import 'api_client.dart';
import '../models/fee_model.dart';

class FeeService {
  final _api = ApiClient();

  Future<({FeeSummaryModel summary, List<FeeInvoiceModel> invoices})>
      getInvoices({String? status, String? q}) async {
    final res = await _api.get('/api/fees', queryParams: {
      if (status != null) 'status': status,
      if (q != null) 'q': q,
    });
    final summary = FeeSummaryModel.fromJson(res['summary'] ?? {});
    final list = (res['invoices'] as List? ?? [])
        .map((e) => FeeInvoiceModel.fromJson(e as Map<String, dynamic>))
        .toList();
    return (summary: summary, invoices: list);
  }

  Future<FeeInvoiceModel> createInvoice(Map<String, dynamic> body) async {
    final res = await _api.post('/api/fees/create-invoice', body: body);
    return FeeInvoiceModel.fromJson(res['invoice'] ?? res);
  }

  Future<void> createBulk({required String className, required String title, required String totalAmount, String? dueDate}) async {
    await _api.post('/api/fees/create-bulk', body: {
      'className': className,
      'title': title,
      'totalAmount': totalAmount,
      if (dueDate != null) 'dueDate': dueDate,
    });
  }

  Future<void> payInvoice({required String invoiceId, String? amount, String? paymentMethod, String? transactionId}) async {
    await _api.post('/api/fees/pay', body: {
      'invoiceId': invoiceId,
      if (amount != null) 'amount': amount,
      if (paymentMethod != null) 'paymentMethod': paymentMethod,
      if (transactionId != null) 'transactionId': transactionId,
    });
  }

  Future<List<FeeHeadModel>> getHeads() async {
    final res = await _api.get('/api/fees/heads');
    final list = res['feeHeads'] as List? ?? [];
    return list.map((e) => FeeHeadModel.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> createHead(String headName, {String? description}) async {
    await _api.post('/api/fees/heads', body: {'headName': headName, if (description != null) 'description': description});
  }

  Future<List<FeeStructureModel>> getStructure() async {
    final res = await _api.get('/api/fees/structure');
    final list = res['feeStructure'] as List? ?? [];
    return list.map((e) => FeeStructureModel.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> createStructure({required String className, required String feeHeadId, required String amount, String? billingCycle}) async {
    await _api.post('/api/fees/structure', body: {
      'className': className,
      'feeHeadId': feeHeadId,
      'amount': amount,
      if (billingCycle != null) 'billingCycle': billingCycle,
    });
  }
}
