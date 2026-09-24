/// Per-school dynamic custom field definition ("Student Extra Field").
///
/// Defined by the School Director / Principal for their school only
/// (school-scoped). Rendered dynamically in Add/Edit Student forms.
class CustomFieldModel {
  final String id;
  final String fieldKey;
  final String label;
  final String fieldType; // text | number | dropdown | date | checkbox
  final List<String> options;
  final bool required;
  final int sortOrder;
  final bool isActive;

  const CustomFieldModel({
    required this.id,
    required this.fieldKey,
    required this.label,
    required this.fieldType,
    this.options = const [],
    this.required = false,
    this.sortOrder = 0,
    this.isActive = true,
  });

  factory CustomFieldModel.fromJson(Map<String, dynamic> json) {
    final opts = json['options'];
    return CustomFieldModel(
      id: json['id']?.toString() ?? '',
      fieldKey: json['fieldKey']?.toString() ?? '',
      label: json['label']?.toString() ?? '',
      fieldType: json['fieldType']?.toString() ?? 'text',
      options: opts is List ? opts.map((e) => e.toString()).toList() : const [],
      required: json['required'] == true || json['required'] == 1,
      sortOrder: (json['sortOrder'] as num?)?.toInt() ?? 0,
      isActive: json['isActive'] != false,
    );
  }

  Map<String, dynamic> toJson({bool includeKey = true}) {
    return {
      if (includeKey) 'fieldKey': fieldKey,
      'label': label,
      'fieldType': fieldType,
      'options': options,
      'required': required,
      'sortOrder': sortOrder,
      'isActive': isActive,
    };
  }
}