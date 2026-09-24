import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../models/custom_field_model.dart';

/// Dynamically renders the school's custom "Student Extra Fields".
///
/// One instance renders ALL configured fields for the school as
/// Form-ready inputs (text / number / dropdown / date / checkbox).
/// Existing values can be pre-filled via [initialValues] (fieldKey -> value).
///
/// The widget keeps its own controllers so it can be used both inside
/// AlertDialogs (quick add) and full edit forms. It reports the latest
/// values through [onChanged] — a map of fieldKey -> string value
/// (checkboxes store "Yes"/"No").
class CustomFieldsEditor extends StatefulWidget {
  final List<CustomFieldModel> defs;
  final Map<String, dynamic> initialValues;
  final ValueChanged<Map<String, dynamic>> onChanged;
  final Key? formKey;

  const CustomFieldsEditor({
    super.key,
    required this.defs,
    this.initialValues = const {},
    required this.onChanged,
    this.formKey,
  });

  @override
  State<CustomFieldsEditor> createState() => _CustomFieldsEditorState();
}

class _CustomFieldsEditorState extends State<CustomFieldsEditor> {
  final Map<String, TextEditingController> _ctrls = {};
  final Map<String, String> _dropdowns = {};
  final Map<String, DateTime?> _dates = {};
  final Map<String, bool> _checks = {};

  @override
  void initState() {
    super.initState();
    for (final d in widget.defs) {
      final existing = widget.initialValues[d.fieldKey]?.toString() ?? '';
      switch (d.fieldType) {
        case 'dropdown':
          _dropdowns[d.fieldKey] = existing;
          break;
        case 'checkbox':
          _checks[d.fieldKey] = existing.toLowerCase() == 'yes' || existing.toLowerCase() == 'true';
          break;
        case 'date':
          _dates[d.fieldKey] = existing.isNotEmpty ? DateTime.tryParse(existing) : null;
          _ctrls[d.fieldKey] = TextEditingController(text: existing);
          break;
        default:
          _ctrls[d.fieldKey] = TextEditingController(text: existing);
      }
    }
  }

  @override
  void dispose() {
    for (final c in _ctrls.values) c.dispose();
    super.dispose();
  }

  Map<String, dynamic> _collect() {
    final out = <String, dynamic>{};
    for (final d in widget.defs) {
      switch (d.fieldType) {
        case 'dropdown':
          final v = _dropdowns[d.fieldKey];
          if (v != null && v.isNotEmpty) out[d.fieldKey] = v;
          break;
        case 'checkbox':
          out[d.fieldKey] = _checks[d.fieldKey] == true ? 'Yes' : 'No';
          break;
        case 'date':
          final dt = _dates[d.fieldKey];
          out[d.fieldKey] = dt != null ? DateFormat('yyyy-MM-dd').format(dt) : '';
          break;
        default:
          out[d.fieldKey] = _ctrls[d.fieldKey]?.text.trim() ?? '';
      }
    }
    return out;
  }

  void _emit() => widget.onChanged(_collect());

  Future<void> _pickDate(BuildContext context, CustomFieldModel d) async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _dates[d.fieldKey] ?? DateTime(2015, 1, 1),
      firstDate: DateTime(1980),
      lastDate: DateTime.now(),
    );
    if (picked != null) {
      setState(() {
        _dates[d.fieldKey] = picked;
        _ctrls[d.fieldKey]?.text = DateFormat('yyyy-MM-dd').format(picked);
      });
      _emit();
    }
  }

  @override
  Widget build(BuildContext context) {
    if (widget.defs.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 8),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: const Color(0xFFF1F5F9),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xFFCBD5E1)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(Icons.dynamic_form_rounded, size: 18, color: Color(0xFF1E3A8A)),
                  const SizedBox(width: 6),
                  Text(
                    'अतिरिक्त फ़ील्ड (Extra Fields)',
                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: Color(0xFF1E3A8A)),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              const Text(
                'स्कूल-विशिष्ट जानकारी',
                style: TextStyle(fontSize: 11, color: Colors.grey),
              ),
              const Divider(height: 18),
              for (final d in widget.defs) ...[
                if (d.fieldType == 'checkbox')
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    dense: true,
                    title: Text(d.label, style: const TextStyle(fontSize: 13)),
                    value: _checks[d.fieldKey] ?? false,
                    onChanged: (v) {
                      setState(() => _checks[d.fieldKey] = v);
                      _emit();
                    },
                  )
                else if (d.fieldType == 'dropdown')
                  DropdownButtonFormField<String>(
                    initialValue: _dropdowns[d.fieldKey],
                    decoration: InputDecoration(
                      labelText: d.label + (d.required ? ' *' : ''),
                      isDense: true,
                      border: const OutlineInputBorder(),
                    ),
                    items: d.options
                        .map((o) => DropdownMenuItem(value: o, child: Text(o)))
                        .toList(),
                    onChanged: (v) {
                      if (v != null) {
                        setState(() => _dropdowns[d.fieldKey] = v);
                        _emit();
                      }
                    },
                    validator: d.required
                        ? (v) => (v == null || v.isEmpty) ? 'आवश्यक' : null
                        : null,
                  )
                else if (d.fieldType == 'date')
                  TextFormField(
                    controller: _ctrls[d.fieldKey],
                    readOnly: true,
                    decoration: InputDecoration(
                      labelText: d.label + (d.required ? ' *' : ''),
                      isDense: true,
                      border: const OutlineInputBorder(),
                      suffixIcon: const Icon(Icons.calendar_today, size: 16),
                    ),
                    onTap: () => _pickDate(context, d),
                    validator: d.required
                        ? (v) => (v == null || v.isEmpty) ? 'आवश्यक' : null
                        : null,
                  )
                else
                  TextFormField(
                    controller: _ctrls[d.fieldKey],
                    keyboardType: d.fieldType == 'number' ? TextInputType.number : TextInputType.text,
                    decoration: InputDecoration(
                      labelText: d.label + (d.required ? ' *' : ''),
                      isDense: true,
                      border: const OutlineInputBorder(),
                    ),
                    onChanged: (_) => _emit(),
                    validator: d.required
                        ? (v) => (v == null || v.trim().isEmpty) ? 'आवश्यक' : null
                        : null,
                  ),
                const SizedBox(height: 12),
              ],
            ],
          ),
        ),
      ],
    );
  }
}