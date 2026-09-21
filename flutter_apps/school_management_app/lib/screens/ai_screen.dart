import 'package:flutter/material.dart';
import '../models/user_model.dart';
import '../services/ai_service.dart';
import '../services/api_client.dart';
import '../widgets/common_widgets.dart';

class AiScreen extends StatefulWidget {
  final UserModel user;
  const AiScreen({super.key, required this.user});

  @override
  State<AiScreen> createState() => _AiScreenState();
}

class _AiScreenState extends State<AiScreen> {
  final _svc = AiService();
  final _promptCtrl = TextEditingController();
  bool _loading = false;
  String _response = '';

  @override
  void dispose() {
    _promptCtrl.dispose();
    super.dispose();
  }

  Future<void> _ask() async {
    if (_promptCtrl.text.trim().isEmpty) return;
    setState(() => _loading = true);
    try {
      final res = await _svc.chat(_promptCtrl.text.trim());
      setState(() => _response = res);
    } on ApiException catch (e) {
      showSnack(context, e.message, isError: true);
    } catch (_) {
      showSnack(context, 'AI उत्तर नहीं दे सका', isError: true);
    }
    if (mounted) setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('AI सहायक', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
        backgroundColor: const Color(0xFF4338CA),
        foregroundColor: Colors.white,
      ),
      body: Column(
        children: [
          Expanded(
            child: _response.isEmpty && !_loading
                ? const EmptyState(message: 'कोई प्रश्न पूछें\nजैसे: "नई कक्षा के छात्र जोड़ें..."', icon: Icons.smart_toy)
                : _loading
                    ? const Center(child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          CircularProgressIndicator(color: Color(0xFF4338CA)),
                          SizedBox(height: 12),
                          Text('AI सोच रहा है...', style: TextStyle(color: Colors.grey)),
                        ],
                      ))
                    : SingleChildScrollView(
                        padding: const EdgeInsets.all(16),
                        child: Container(
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: const Color(0xFF4338CA).withValues(alpha: 0.06),
                            borderRadius: BorderRadius.circular(14),
                          ),
                          child: SelectableText(_response, style: const TextStyle(fontSize: 14, height: 1.5)),
                        ),
                      ),
          ),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.white,
              border: Border(top: BorderSide(color: Colors.grey.shade200)),
            ),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _promptCtrl,
                    maxLines: 2,
                    decoration: const InputDecoration(
                      hintText: 'प्रश्न पूछें...',
                      border: OutlineInputBorder(),
                      isDense: true,
                    ),
                    onSubmitted: (_) => _ask(),
                  ),
                ),
                const SizedBox(width: 10),
                IconButton.filled(
                  onPressed: _loading ? null : _ask,
                  icon: const Icon(Icons.send),
                  style: IconButton.styleFrom(backgroundColor: const Color(0xFF4338CA)),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
