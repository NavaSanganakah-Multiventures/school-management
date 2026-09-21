import 'api_client.dart';

class BillingService {
  final _api = ApiClient();

  Future<List<Map<String, dynamic>>> getPlans() async {
    final res = await _api.get('/api/billing/plans');
    final list = res['plans'] as List? ?? [];
    return list.map((e) => e as Map<String, dynamic>).toList();
  }

  Future<Map<String, dynamic>> getSubscription() async {
    return await _api.get('/api/billing/subscription');
  }

  Future<Map<String, dynamic>> subscribe({required String planId, String? billingCycle}) async {
    return await _api.post('/api/billing/subscribe', body: {
      'planId': planId,
      if (billingCycle != null) 'billingCycle': billingCycle,
    });
  }

  Future<List<Map<String, dynamic>>> getInvoices() async {
    final res = await _api.get('/api/billing/invoices');
    final list = res['invoices'] as List? ?? [];
    return list.map((e) => e as Map<String, dynamic>).toList();
  }

  Future<Map<String, dynamic>> getPluginsActive() async {
    return await _api.get('/api/plugins/active');
  }

  Future<Map<String, dynamic>> getPluginMarketplace() async {
    return await _api.get('/api/plugins/marketplace');
  }

  Future<void> subscribePlugin(String pluginId) async {
    await _api.post('/api/plugins/subscribe', body: {'pluginId': pluginId});
  }

  Future<void> unsubscribePlugin(String pluginId) async {
    await _api.post('/api/plugins/unsubscribe', body: {'pluginId': pluginId});
  }
}
