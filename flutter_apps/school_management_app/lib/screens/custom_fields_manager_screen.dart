import 'package:flutter/material.dart';
import '../models/user_model.dart';
import '../models/custom_field_model.dart';
import '../services/api_client.dart';
import '../services/student_service.dart';
import '../widgets/common_widgets.dart';

/// School Director / Principal manager for per-school dynamic custom fields.
///
/// Fields defined here appear ONLY for this school in the Add/Edit Student
/// forms and Student Detail view. Staff and teachers can only fill values;
/// only Directors/Principals configure the schema (enforced server-side too).
class CustomFieldsManagerScreen extends StatefulWidget {
  final UserModel user;
  const CustomFieldsManagerScreen({super.key, required this.user});

  @override
  State<CustomFieldsManagerScreen> createState() => _CustomFieldsManagerScreenState();
}

class _CustomFieldsManagerScreenState extends State<CustomFieldsManagerScreen> {
  final _svc = StudentService();
  bool _loading = true;
  String? _error;
  List<CustomFieldModel> _fields = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final fields = await _svc.getCustomFieldDefs();
      if (mounted) setState(() {
        _fields = fields;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() {
        _error = e.message;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() {
        _error = 'फ़ील्ड लोड नहीं हो सकीं';
        _loading = false;
      });
    }
  }

  Future<void> _openDialog({CustomFieldModel? existing}) async {
    final labelCtrl = TextEditingController(text: existing?.label ?? '');
    final keyCtrl = TextEditingController(text: existing?.fieldKey ?? '');
    String fieldType = existing?.fieldType ?? 'text';
    String optionsText = (existing?.options ?? []).join(', ');
    bool required = existing?.required ?? false;
    bool isActive = existing?.isActive ?? true;
    int sortOrder = existing?.sortOrder ?? 0;
    final formKey = GlobalKey<FormState>();
    bool saving = false;

    await showDialog(
      context: context,
      barrierDismissible: false,
      builder: (dialogCtx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          title: Text(existing == null ? 'नई अतिरिक्त फ़ील्ड' : 'फ़ील्ड संपादित करें',
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
          content: SingleChildScrollView(
            child: Form(
              key: formKey,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  TextFormField(
                    controller: labelCtrl,
                    decoration: const InputDecoration(
                      labelText: 'लेबल (Label) *',
                      hintText: 'जैसे: बस रूट, कास्ट सर्टिफिकेट नं.',
                      isDense: true,
                      border: OutlineInputBorder(),
                    ),
                    validator: (v) => (v == null || v.trim().isEmpty) ? 'लेबल अनिवार्य है' : null,
                  ),
                  const SizedBox(height: 12),
                  if (existing == null)
                    TextFormField(
                      controller: keyCtrl,
                      decoration: const InputDecoration(
                        labelText: 'फ़ील्ड कुंजी (Key) *',
                        hintText: 'lowercase, underscores — जैसे: bus_route',
                        isDense: true,
                        border: OutlineInputBorder(),
                        helperText: 'एक बार बनाने के बाद नहीं बदल सकते',
                      ),
                      validator: (v) {
                        final val = (v ?? '').trim();
                        if (val.isEmpty) return 'कुंजी अनिवार्य है';
                        if (!RegExp(r'^[a-z0-9_]+$').hasMatch(val)) {
                          return 'केवल lowercase अक्षर, अंक और _ की अनुमति है';
                        }
                        return null;
                      },
                    ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    initialValue: fieldType,
                    decoration: const InputDecoration(
                      labelText: 'प्रकार',
                      isDense: true,
                      border: OutlineInputBorder(),
                    ),
                    items: const [
                      DropdownMenuItem(value: 'text', child: Text('पाठ (Text)')),
                      DropdownMenuItem(value: 'number', child: Text('संख्या (Number)')),
                      DropdownMenuItem(value: 'dropdown', child: Text('सूची (Dropdown)')),
                      DropdownMenuItem(value: 'date', child: Text('तारीख (Date)')),
                      DropdownMenuItem(value: 'checkbox', child: Text('चेकबॉक्स (Yes/No)')),
                    ],
                    onChanged: (v) {
                      if (v != null) setDialogState(() => fieldType = v);
                    },
                  ),
                  if (fieldType == 'dropdown') ...[
                    const SizedBox(height: 12),
                    TextFormField(
                      initialValue: optionsText,
                      decoration: const InputDecoration(
                        labelText: 'विकल्प (कॉमा से अलग करें)',
                        hintText: 'जैसे: Bus, Van, Cycle, Walk',
                        isDense: true,
                        border: OutlineInputBorder(),
                      ),
                      onChanged: (v) => optionsText = v,
                    ),
                  ],
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: TextFormField(
                          initialValue: sortOrder.toString(),
                          keyboardType: TextInputType.number,
                          decoration: const InputDecoration(
                            labelText: 'क्रम (Sort Order)',
                            isDense: true,
                            border: OutlineInputBorder(),
                          ),
                          onChanged: (v) => sortOrder = int.tryParse(v) ?? 0,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: CheckboxListTile(
                          contentPadding: EdgeInsets.zero,
                          dense: true,
                          controlAffinity: ListTileControlAffinity.leading,
                          title: const Text('अनिवार्य (आवश्यक)', style: TextStyle(fontSize: 12)),
                          value: required,
                          onChanged: (v) => setDialogState(() => required = v ?? false),
                        ),
                      ),
                    ],
                  ),
                  if (existing != null) ...[
                    const SizedBox(height: 8),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      dense: true,
                      title: const Text('सक्रिय (फॉर्म में दिखाएं)', style: TextStyle(fontSize: 13)),
                      value: isActive,
                      onChanged: (v) => setDialogState(() => isActive = v),
                    ),
                  ],
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: saving ? null : () => Navigator.of(dialogCtx).pop(),
              child: const Text('रद्द करें'),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF0F172A),
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
              onPressed: saving
                  ? null
                  : () async {
                      if (!(formKey.currentState?.validate() ?? false)) return;
                      setDialogState(() => saving = true);
                      try {
                        final options = fieldType == 'dropdown'
                            ? optionsText.split(',').map((o) => o.trim()).where((o) => o.isNotEmpty).toList()
                            : <String>[];
                        if (existing == null) {
                          await _svc.createCustomField({
                            'fieldKey': keyCtrl.text.trim().toLowerCase(),
                            'label': labelCtrl.text.trim(),
                            'fieldType': fieldType,
                            'options': options,
                            'required': required,
                            'sortOrder': sortOrder,
                          });
                          if (dialogCtx.mounted) Navigator.of(dialogCtx).pop();
                          showSnack(context, 'अतिरिक्त फ़ील्ड जोड़ दी गई।');
                        } else {
                          await _svc.updateCustomField(existing.id, {
                            'label': labelCtrl.text.trim(),
                            'fieldType': fieldType,
                            'options': options,
                            'required': required,
                            'sortOrder': sortOrder,
                            'isActive': isActive,
                          });
                          if (dialogCtx.mounted) Navigator.of(dialogCtx).pop();
                          showSnack(context, 'फ़ील्ड अद्यतित हो गई।');
                        }
                        await _load();
                      } on ApiException catch (e) {
                        if (dialogCtx.mounted) {
                          setDialogState(() => saving = false);
                          showSnack(context, e.message, isError: true);
                        }
                      } catch (_) {
                        if (dialogCtx.mounted) {
                          setDialogState(() => saving = false);
                          showSnack(context, 'सहेजा नहीं जा सका', isError: true);
                        }
                      }
                    },
              child: saving
                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Text('सहेजें'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _confirmDelete(CustomFieldModel f) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('फ़ील्ड हटाएं?'),
        content: Text('क्या आप "${f.label}" हटाना चाहते हैं? सभी छात्रों के इस फ़ील्ड के मान भी हट जाएंगे।'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('रद्द करें')),
          FilledButton(
            onPressed: () => Navigator.pop(c, true),
            style: FilledButton.styleFrom(backgroundColor: Colors.red.shade700),
            child: const Text('हटाएं'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await _svc.deleteCustomField(f.id);
      showSnack(context, 'फ़ील्ड हटा दी गई।');
      await _load();
    } on ApiException catch (e) {
      showSnack(context, e.message, isError: true);
    } catch (_) {
      showSnack(context, 'हटाया नहीं जा सका', isError: true);
    }
  }

  Future<void> _toggleActive(CustomFieldModel f, bool active) async {
    try {
      await _svc.updateCustomField(f.id, {'isActive': active});
      await _load();
    } on ApiException catch (e) {
      showSnack(context, e.message, isError: true);
    } catch (_) {
      showSnack(context, 'अद्यतन विफल', isError: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('अतिरिक्त फ़ील्ड (Custom Fields)',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
        backgroundColor: const Color(0xFF0F172A),
        foregroundColor: Colors.white,
        actions: [
          if (widget.user.isAdminRole)
            IconButton(
              icon: const Icon(Icons.add),
              tooltip: 'नई फ़ील्ड जोड़ें',
              onPressed: () => _openDialog(),
            ),
        ],
      ),
      body: _loading
          ? const LoadingView()
          : _error != null
              ? ErrorRetryView(message: _error!, onRetry: _load)
              : ResponsiveCenter(
                  child: _fields.isEmpty
                      ? _buildEmpty()
                      : _buildList(),
                ),
    );
  }

  Widget _buildEmpty() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.dynamic_form_rounded, size: 56, color: Colors.grey),
            const SizedBox(height: 12),
            const Text('अभी कोई अतिरिक्त फ़ील्ड नहीं बनी।',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold)),
            const SizedBox(height: 6),
            Text(
              'यहां जोड़ी गई फ़ील्ड सिर्फ़ इसी स्कूल के छात्र फॉर्म में दिखेंगी।',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
            ),
            const SizedBox(height: 16),
            if (widget.user.isAdminRole)
              FilledButton.icon(
                onPressed: () => _openDialog(),
                icon: const Icon(Icons.add, size: 18),
                label: const Text('पहली फ़ील्ड जोड़ें'),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildList() {
    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: _fields.length,
      separatorBuilder: (_, __) => const SizedBox(height: 10),
      itemBuilder: (context, index) {
        final f = _fields[index];
        final typeLabel = switch (f.fieldType) {
          'number' => 'संख्या',
          'dropdown' => 'सूची (${f.options.length} विकल्प)',
          'date' => 'तारीख',
          'checkbox' => 'Yes/No',
          _ => 'पाठ',
        };
        return Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: f.isActive ? Colors.grey.shade200 : Colors.grey.shade300),
          ),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: const Color(0xFF1E3A8A).withOpacity(0.08),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(Icons.dynamic_form_rounded, color: Color(0xFF1E3A8A), size: 20),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      f.label,
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.bold,
                        color: f.isActive ? Colors.black87 : Colors.grey,
                        decoration: f.isActive ? null : TextDecoration.lineThrough,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${f.fieldKey} • $typeLabel${f.required ? ' • अनिवार्य' : ''}',
                      style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
                    ),
                  ],
                ),
              ),
              if (widget.user.isAdminRole)
                IconButton(
                  icon: const Icon(Icons.edit_outlined, size: 18),
                  tooltip: 'संपादित करें',
                  onPressed: () => _openDialog(existing: f),
                ),
              if (widget.user.isAdminRole)
                IconButton(
                  icon: Icon(Icons.delete_outline, size: 18, color: Colors.red.shade400),
                  tooltip: 'हटाएं',
                  onPressed: () => _confirmDelete(f),
                ),
              if (widget.user.isAdminRole)
                Switch(
                  value: f.isActive,
                  onChanged: (v) => _toggleActive(f, v),
                ),
            ],
          ),
        );
      },
    );
  }
}