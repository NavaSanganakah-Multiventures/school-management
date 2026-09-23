import 'package:flutter/material.dart';
import '../models/plan_model.dart';
import '../models/school_model.dart';
import '../services/school_service.dart';
import '../widgets/app_ui.dart';

/// Reusable dialogs & the school action sheet used by the Schools screen.

const _cycles = ['monthly', 'quarterly', 'annual'];

String _dateOnly(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

Map<String, String> _msgs(dynamic res) {
  final map = res is Map ? Map<String, dynamic>.from(res) : <String, dynamic>{};
  return {
    'message': (map['message'] ?? '').toString(),
    'paymentLink': (map['paymentLink'] ?? '').toString(),
  };
}

// ---------------------------------------------------------------------------
// School action sheet (bottom sheet with all per-school operations)
// ---------------------------------------------------------------------------

Future<void> showSchoolActionsSheet({
  required BuildContext context,
  required SchoolModel school,
  required SchoolService service,
  required VoidCallback onChanged,
}) async {
  final action = await showModalBottomSheet<_SchoolAction>(
    context: context,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
    builder: (ctx) => SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Text(
                    school.schoolName,
                    style: const TextStyle(
                        fontSize: 16, fontWeight: FontWeight.bold),
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: () => Navigator.of(ctx).pop(),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                smartStatusPill(school.status, overrideLabel: school.statusLabel),
                smartStatusPill(school.registrationStatus,
                    overrideLabel: school.regStatusLabel),
                statusPill(school.planName.isEmpty ? school.planId : school.planName,
                    color: const Color(0xFF4338CA)),
              ],
            ),
            const SizedBox(height: 14),
            _actionTile(ctx, _SchoolAction.edit, Icons.edit_outlined, 'स्कूल जानकारी संपादित करें'),
            if (school.isPending) ...[
              _actionTile(ctx, _SchoolAction.approve, Icons.check_circle_outline, 'स्वीकृत करें + प्लान चुनें',
                  color: const Color(0xFF047857)),
              _actionTile(ctx, _SchoolAction.reject, Icons.cancel_outlined, 'पंजीकरण अस्वीकार करें',
                  color: const Color(0xFFBE123C)),
            ],
            _actionTile(ctx, _SchoolAction.plan, Icons.swap_horiz, 'प्लान बदलें'),
            _actionTile(ctx, _SchoolAction.expiry, Icons.event_outlined, 'समाप्ति तिथि सेट करें'),
            _actionTile(ctx, _SchoolAction.extendTrial, Icons.timelapse, 'ट्रायल बढ़ाएं (+दिन)'),
            _actionTile(ctx, _SchoolAction.emailConfig, Icons.mail_outline, 'ईमेल कोटा / सेंडर कॉन्फ़िग'),
            _actionTile(ctx, _SchoolAction.paymentLink, Icons.link_outlined, 'पेमेंट लिंक भेजें',
                color: const Color(0xFF0F766E)),
            _actionTile(ctx, _SchoolAction.notify, Icons.notifications_active_outlined, 'पुश नोटिफिकेशन भेजें'),
            if (!school.isProvisionedLive)
              _actionTile(ctx, _SchoolAction.provision, Icons.cloud_upload_outlined, 'डेडीकेटेड वर्कर प्रोविज़न करें')
            else
              _actionTile(ctx, _SchoolAction.provisionCheck, Icons.health_and_safety_outlined, 'प्रोविज़न स्टेटस जांचें'),
            if (school.isProvisionedLive || school.hasDedicatedConfig)
              _actionTile(ctx, _SchoolAction.deprovision, Icons.cloud_download_outlined, 'डी-प्रोविज़न (शेयर्ड मोड)',
                  color: const Color(0xFFB45309)),
            _actionTile(ctx, _SchoolAction.delete, Icons.delete_outline, 'स्कूल हटाएं (Soft Delete)',
                color: const Color(0xFFBE123C)),
          ],
        ),
      ),
    ),
  );

  await _runAction(context, action, school, service, onChanged);
}

enum _SchoolAction {
  approve,
  reject,
  edit,
  plan,
  expiry,
  extendTrial,
  emailConfig,
  paymentLink,
  notify,
  provision,
  provisionCheck,
  deprovision,
  delete,
}

Widget _actionTile(BuildContext ctx, _SchoolAction action, IconData icon,
    String label, {Color color = const Color(0xFF0F172A)}) {
  return Padding(
    padding: const EdgeInsets.only(bottom: 6),
    child: ListTile(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      tileColor: color.withValues(alpha: 0.06),
      leading: Icon(icon, color: color, size: 22),
      title: Text(label, style: TextStyle(fontSize: 13, color: color)),
      trailing: Icon(Icons.chevron_right, color: color.withValues(alpha: 0.4)),
      onTap: () => Navigator.of(ctx).pop(action),
    ),
  );
}

Future<void> _runAction(
  BuildContext context,
  _SchoolAction? action,
  SchoolModel school,
  SchoolService service,
  VoidCallback onChanged,
) async {
  if (action == null || !context.mounted) return;
  switch (action) {
    case _SchoolAction.approve:
      await showApproveDialog(context, school, service, onChanged);
    case _SchoolAction.reject:
      await _reject(context, school, service, onChanged);
    case _SchoolAction.edit:
      await showEditSchoolDialog(context, school, service, onChanged);
    case _SchoolAction.plan:
      await showChangePlanDialog(context, school, service, onChanged);
    case _SchoolAction.expiry:
      await showExpiryDialog(context, school, service, onChanged);
    case _SchoolAction.extendTrial:
      await showExtendTrialDialog(context, school, service, onChanged);
    case _SchoolAction.emailConfig:
      await showEmailConfigDialog(context, school, service, onChanged);
    case _SchoolAction.paymentLink:
      await showPaymentLinkDialog(context, school, service, onChanged);
    case _SchoolAction.notify:
      await showNotifyDialog(context, school, service, onChanged);
    case _SchoolAction.provision:
      await showProvisionDialog(context, school, service, onChanged);
    case _SchoolAction.provisionCheck:
      await _provisionCheck(context, school, service, onChanged);
    case _SchoolAction.deprovision:
      await _deprovision(context, school, service, onChanged);
    case _SchoolAction.delete:
      await _delete(context, school, service, onChanged);
  }
}

Future<void> _reject(BuildContext context, SchoolModel school,
    SchoolService service, VoidCallback onChanged) async {
  if (!context.mounted) return;
  final ok = await confirmDialog(
    context,
    title: 'पंजीकरण अस्वीकार करें?',
    message: '"${school.schoolName}" का पंजीकरण अनुरोध reject कर दिया जाएगा।',
    confirmText: 'Reject करें',
    destructive: true,
  );
  if (!ok || !context.mounted) return;
  try {
    final res = await service.rejectSchool(school.id);
    if (res['success'] == true) {
      showSnack(context, 'पंजीकरण अस्वीकृत कर दिया गया।');
      onChanged();
    } else {
      showSnack(context, res['message'].toString(), ok: false);
    }
  } catch (e) {
    showSnack(context, 'त्रुटि: $e', ok: false);
  }
}

Future<void> _delete(BuildContext context, SchoolModel school,
    SchoolService service, VoidCallback onChanged) async {
  if (!context.mounted) return;
  final ok = await confirmDialog(
    context,
    title: 'स्कूल हटाएं (Soft Delete)?',
    message:
        '"${school.schoolName}" को निष्क्रिय कर दिया जाएगा। डेटा सुरक्षित रहेगा, बाद में restore किया जा सकता है।',
    confirmText: 'हटाएं',
    destructive: true,
  );
  if (!ok || !context.mounted) return;
  try {
    final res = await service.deleteSchool(school.id);
    if (res['success'] == true) {
      showSnack(context, 'स्कूल हटा दिया गया (soft-delete)।');
      onChanged();
    } else {
      showSnack(context, res['message'].toString(), ok: false);
    }
  } catch (e) {
    showSnack(context, 'त्रुटि: $e', ok: false);
  }
}

// ---------------------------------------------------------------------------
// Approve registration (plan + trial end date)
// ---------------------------------------------------------------------------

Future<void> showApproveDialog(BuildContext context, SchoolModel school,
    SchoolService service, VoidCallback onChanged) async {
  final plans = await _loadPlans(context);
  if (plans == null || !context.mounted) return;
  String planId = plans.any((p) => p.id == 'trial') ? 'trial' : plans.first.id;
  DateTime trialEnds =
      DateTime.now().add(const Duration(days: 7));

  await showDialog<void>(
    context: context,
    builder: (ctx) => StatefulBuilder(
      builder: (ctx, setSt) => AlertDialog(
        title: Text('"${school.schoolName}" स्वीकृत करें'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              DropdownButtonFormField<String>(
                initialValue: planId,
                decoration: fieldDec('प्लान चुनें'),
                items: plans
                    .map((p) => DropdownMenuItem(
                        value: p.id,
                        child: Text(p.name, style: const TextStyle(fontSize: 13))))
                    .toList(),
                onChanged: (v) => setSt(() => planId = v ?? planId),
              ),
              const SizedBox(height: 12),
              InkWell(
                onTap: () async {
                  final picked = await showDatePicker(
                    context: ctx,
                    initialDate: trialEnds,
                    firstDate: DateTime.now(),
                    lastDate: DateTime.now().add(const Duration(days: 365 * 3)),
                  );
                  if (picked != null) setSt(() => trialEnds = picked);
                },
                child: InputDecorator(
                  decoration: fieldDec('समाप्ति तिथि'),
                  child: Text(_dateOnly(trialEnds)),
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.of(ctx).pop(), child: const Text('रद्द करें')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: const Color(0xFF047857)),
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('स्वीकृत करें (Approve)'),
          ),
        ],
      ),
    ),
  );

  if (!context.mounted) return;
  _busy(context, () async {
    final res = await service.approveSchool(school.id,
        planId: planId, trialEndsAt: _dateOnly(trialEnds));
    return res;
  }, (res) {
    if (res['success'] == true) {
      showSnack(context, res['message'].toString());
      onChanged();
    } else {
      showSnack(context, res['message'].toString(), ok: false);
    }
  });
}

// ---------------------------------------------------------------------------
// Edit school
// ---------------------------------------------------------------------------

Future<void> showEditSchoolDialog(BuildContext context, SchoolModel school,
    SchoolService service, VoidCallback onChanged) async {
  final plans = await _loadPlans(context);
  if (plans == null || !context.mounted) return;

  final name = TextEditingController(text: school.schoolName);
  final email = TextEditingController(text: school.contactEmail);
  final phone = TextEditingController(text: school.contactPhone);
  final subdomain = TextEditingController(text: school.subdomain);
  final customDomain = TextEditingController(text: school.customDomain);
  final trialEnds = TextEditingController(text: school.trialEndsAt);
  String status = school.status;
  String planId = school.planId.isEmpty ? 'trial' : school.planId;

  await showDialog<void>(
    context: context,
    builder: (ctx) => StatefulBuilder(
      builder: (ctx, setSt) => AlertDialog(
        title: Text('"${school.schoolName}" संपादित करें'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextField(controller: name, decoration: fieldDec('स्कूल का नाम')),
              const SizedBox(height: 10),
              Row(children: [
                Expanded(
                    child: TextField(controller: email,
                        decoration: fieldDec('ईमेल'),
                        keyboardType: TextInputType.emailAddress)),
                const SizedBox(width: 8),
                Expanded(
                    child: TextField(controller: phone,
                        decoration: fieldDec('फोन'),
                        keyboardType: TextInputType.phone)),
              ]),
              const SizedBox(height: 10),
              TextField(controller: subdomain, decoration: fieldDec('Subdomain')),
              const SizedBox(height: 10),
              TextField(controller: customDomain, decoration: fieldDec('Custom Domain')),
              const SizedBox(height: 10),
              DropdownButtonFormField<String>(
                initialValue:
                    plans.any((p) => p.id == planId) ? planId : plans.first.id,
                decoration: fieldDec('प्लान'),
                items: plans
                    .map((p) => DropdownMenuItem(
                        value: p.id,
                        child: Text(p.name, style: const TextStyle(fontSize: 13))))
                    .toList(),
                onChanged: (v) => setSt(() => planId = v ?? planId),
              ),
              const SizedBox(height: 10),
              DropdownButtonFormField<String>(
                initialValue: status,
                decoration: fieldDec('स्टेटस'),
                items: const [
                  DropdownMenuItem(value: 'Active', child: Text('सक्रिय (Active)')),
                  DropdownMenuItem(value: 'Trial', child: Text('ट्रायल (Trial)')),
                  DropdownMenuItem(value: 'Suspended', child: Text('निलंबित (Suspended)')),
                ],
                onChanged: (v) => setSt(() => status = v ?? status),
              ),
              const SizedBox(height: 10),
              TextField(controller: trialEnds, decoration: fieldDec('समाप्ति तिथि (YYYY-MM-DD)')),
            ],
          ),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.of(ctx).pop(), child: const Text('रद्द करें')),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('सेव करें'),
          ),
        ],
      ),
    ),
  );

  if (!context.mounted) return;
  _busy(context, () async {
    return service.updateSchool(school.id, {
      'schoolName': name.text,
      'email': email.text,
      'phone': phone.text,
      'subdomain': subdomain.text,
      'customDomain': customDomain.text,
      'status': status,
      'planId': planId,
      if (trialEnds.text.trim().isNotEmpty) 'trialEndsAt': trialEnds.text.trim(),
    });
  }, (res) {
    if (res['success'] == true) {
      showSnack(context, res['message'].toString());
      onChanged();
    } else {
      showSnack(context, res['message'].toString(), ok: false);
    }
  });
}

// ---------------------------------------------------------------------------
// Change plan
// ---------------------------------------------------------------------------

Future<void> showChangePlanDialog(BuildContext context, SchoolModel school,
    SchoolService service, VoidCallback onChanged) async {
  final plans = await _loadPlans(context);
  if (plans == null || !context.mounted) return;
  String planId = school.planId.isEmpty ? 'trial' : school.planId;
  final trialEnds = TextEditingController(text: school.trialEndsAt);

  await showDialog<void>(
    context: context,
    builder: (ctx) => StatefulBuilder(
      builder: (ctx, setSt) => AlertDialog(
        title: Text('"${school.schoolName}" का प्लान बदलें'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              DropdownButtonFormField<String>(
                initialValue:
                    plans.any((p) => p.id == planId) ? planId : plans.first.id,
                decoration: fieldDec('Plan चुनें'),
                items: plans
                    .map((p) => DropdownMenuItem(
                        value: p.id,
                        child: Text(p.name, style: const TextStyle(fontSize: 13))))
                    .toList(),
                onChanged: (v) => setSt(() => planId = v ?? planId),
              ),
              const SizedBox(height: 12),
              TextField(
                  controller: trialEnds,
                  decoration: fieldDec('समाप्ति तिथि (YYYY-MM-DD, optional)')),
            ],
          ),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.of(ctx).pop(), child: const Text('रद्द करें')),
          FilledButton(
              onPressed: () => Navigator.of(ctx).pop(), child: const Text('सेव करें')),
        ],
      ),
    ),
  );

  if (!context.mounted) return;
  _busy(context, () async {
    return service.changePlan(school.id, planId,
        trialEndsAt: trialEnds.text.trim());
  }, (res) {
    if (res['success'] == true) {
      showSnack(context, res['message'].toString());
      onChanged();
    } else {
      showSnack(context, res['message'].toString(), ok: false);
    }
  });
}

// ---------------------------------------------------------------------------
// Set expiry date
// ---------------------------------------------------------------------------

Future<void> showExpiryDialog(BuildContext context, SchoolModel school,
    SchoolService service, VoidCallback onChanged) async {
  final controller = TextEditingController(text: school.trialEndsAt);
  DateTime selected = DateTime.now().add(const Duration(days: 7));
  try {
    final parts = school.trialEndsAt.split('-');
    if (parts.length == 3) {
      selected = DateTime(int.parse(parts[0]), int.parse(parts[1]), int.parse(parts[2]));
    }
  } catch (_) {}

  final dateStr = await showDialog<String>(
    context: context,
    builder: (ctx) => StatefulBuilder(
      builder: (ctx, setSt) => AlertDialog(
        title: const Text('समाप्ति तिथि सेट करें'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextField(
                controller: controller,
                decoration: fieldDec('YYYY-MM-DD')),
            const SizedBox(height: 10),
            OutlinedButton.icon(
              icon: const Icon(Icons.calendar_today, size: 16),
              label: const Text('कैलेंडर से चुनें'),
              onPressed: () async {
                final picked = await showDatePicker(
                  context: ctx,
                  initialDate: selected,
                  firstDate: DateTime(2020),
                  lastDate: DateTime.now().add(const Duration(days: 365 * 5)),
                );
                if (picked != null) {
                  setSt(() {
                    controller.text = _dateOnly(picked);
                    selected = picked;
                  });
                }
              },
            ),
            const Text(
              'अतीत की तिथि → स्कूल Suspended हो जाएगा। भविष्य → Active/Trial।',
              style: TextStyle(fontSize: 11, color: Colors.grey),
            ),
          ],
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.of(ctx).pop(), child: const Text('रद्द करें')),
          FilledButton(
              onPressed: () =>
                  Navigator.of(ctx).pop(controller.text.trim()),
              child: const Text('सेट करें')),
        ],
      ),
    ),
  );

  if (dateStr == null || !context.mounted) return;
  _busy(context, () async {
    return service.setExpiryDate(school.id, dateStr);
  }, (res) {
    if (res['success'] == true) {
      showSnack(context, res['message'].toString());
      onChanged();
    } else {
      showSnack(context, res['message'].toString(), ok: false);
    }
  });
}

// ---------------------------------------------------------------------------
// Extend trial
// ---------------------------------------------------------------------------

Future<void> showExtendTrialDialog(BuildContext context, SchoolModel school,
    SchoolService service, VoidCallback onChanged) async {
  final days = TextEditingController(text: '7');
  final result = await showDialog<int>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text('"${school.schoolName}" का ट्रायल बढ़ाएं'),
      content: TextField(
        controller: days,
        keyboardType: TextInputType.number,
        decoration: fieldDec('दिन (1–60)'),
      ),
      actions: [
        TextButton(
            onPressed: () => Navigator.of(ctx).pop(), child: const Text('रद्द करें')),
        FilledButton(
            onPressed: () {
              final n = int.tryParse(days.text.trim());
              Navigator.of(ctx).pop(n == null ? 7 : n.clamp(1, 60));
            },
            child: const Text('बढ़ाएं')),
      ],
    ),
  );
  if (result == null || !context.mounted) return;
  _busy(context, () async {
    return service.extendTrial(school.id, result);
  }, (res) {
    if (res['success'] == true) {
      showSnack(context, res['message'].toString());
      onChanged();
    } else {
      showSnack(context, res['message'].toString(), ok: false);
    }
  });
}

// ---------------------------------------------------------------------------
// Email config
// ---------------------------------------------------------------------------

Future<void> showEmailConfigDialog(BuildContext context, SchoolModel school,
    SchoolService service, VoidCallback onChanged) async {
  final limit = TextEditingController(
      text: school.emailQuotaLimit?.toString() ?? '');
  final fromName = TextEditingController(text: school.emailFromName);
  final fromEmail = TextEditingController(text: school.emailFromEmail);
  final replyTo = TextEditingController(text: school.emailReplyTo);
  bool isActive = school.emailConfigActive;

  await showDialog<void>(
    context: context,
    builder: (ctx) => StatefulBuilder(
      builder: (ctx, setSt) => AlertDialog(
        title: const Text('ईमेल कोटा / सेंडर कॉन्फ़िग'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextField(
                  controller: limit,
                  keyboardType: TextInputType.number,
                  decoration: fieldDec('मासिक ईमेल कोटा (खाली = असीमित)')),
              const SizedBox(height: 10),
              TextField(controller: fromName, decoration: fieldDec('From Name')),
              const SizedBox(height: 10),
              TextField(
                  controller: fromEmail,
                  decoration: fieldDec('From Email'),
                  keyboardType: TextInputType.emailAddress),
              const SizedBox(height: 10),
              TextField(
                  controller: replyTo,
                  decoration: fieldDec('Reply-To Email'),
                  keyboardType: TextInputType.emailAddress),
              const SizedBox(height: 8),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('सेंडर कॉन्फ़िग सक्रिय',
                    style: TextStyle(fontSize: 13)),
                value: isActive,
                onChanged: (v) => setSt(() => isActive = v),
              ),
              Text(
                'वर्तमान उपयोग: ${school.emailQuotaUsed} (माह: ${school.emailQuotaResetAt.isEmpty ? '—' : school.emailQuotaResetAt})',
                style: const TextStyle(fontSize: 11, color: Colors.grey),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.of(ctx).pop(), child: const Text('रद्द करें')),
          FilledButton(
              onPressed: () => Navigator.of(ctx).pop(),
              child: const Text('सेव करें')),
        ],
      ),
    ),
  );

  if (!context.mounted) return;
  _busy(context, () async {
    return service.saveEmailConfig(
      schoolId: school.id,
      limit: limit.text.trim().isEmpty ? null : limit.text.trim(),
      fromName: fromName.text,
      fromEmail: fromEmail.text,
      replyTo: replyTo.text,
      isActive: isActive,
    );
  }, (res) {
    if (res['success'] == true) {
      showSnack(context, res['message'].toString());
      onChanged();
    } else {
      showSnack(context, res['message'].toString(), ok: false);
    }
  });
}

// ---------------------------------------------------------------------------
// Send payment link
// ---------------------------------------------------------------------------

Future<void> showPaymentLinkDialog(BuildContext context, SchoolModel school,
    SchoolService service, VoidCallback onChanged) async {
  final plans = await _loadPlans(context);
  if (plans == null || !context.mounted) return;
  final nonTrial =
      plans.where((p) => !p.isTrial && p.active).toList();
  if (nonTrial.isEmpty) {
    showSnack(context, 'कोई भुगतान प्लान उपलब्ध नहीं है।', ok: false);
    return;
  }
  String planId = nonTrial.first.id;
  String cycle = 'annual';

  await showDialog<void>(
    context: context,
    builder: (ctx) => StatefulBuilder(
      builder: (ctx, setSt) => AlertDialog(
        title: const Text('पेमेंट लिंक भेजें'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('स्कूल: ${school.schoolName}',
                style: const TextStyle(fontSize: 12, color: Colors.grey)),
            const SizedBox(height: 10),
            DropdownButtonFormField<String>(
              initialValue: planId,
              decoration: fieldDec('प्लान (non-trial)'),
              items: nonTrial
                  .map((p) => DropdownMenuItem(
                      value: p.id,
                      child: Text(p.name, style: const TextStyle(fontSize: 13))))
                  .toList(),
              onChanged: (v) => setSt(() => planId = v ?? planId),
            ),
            const SizedBox(height: 10),
            DropdownButtonFormField<String>(
              initialValue: cycle,
              decoration: fieldDec('Billing Cycle'),
              items: _cycles
                  .map((c) => DropdownMenuItem(value: c, child: Text(c)))
                  .toList(),
              onChanged: (v) => setSt(() => cycle = v ?? cycle),
            ),
          ],
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.of(ctx).pop(), child: const Text('रद्द करें')),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('भेजें (email + FCM)'),
          ),
        ],
      ),
    ),
  );

  if (!context.mounted) return;
  _busy(context, () async {
    return service.sendPaymentLink(
        schoolId: school.id, planId: planId, billingCycle: cycle);
  }, (res) {
    if (res['success'] == true) {
      final link = _msgs(res)['paymentLink'] ?? '';
      showSnack(context,
          link.isEmpty ? res['message'].toString() : '${res['message']}\nलिंक: $link');
      onChanged();
    } else {
      showSnack(context, res['message'].toString(), ok: false);
    }
  });
}

// ---------------------------------------------------------------------------
// Send notification
// ---------------------------------------------------------------------------

Future<void> showNotifyDialog(BuildContext context, SchoolModel school,
    SchoolService service, VoidCallback onChanged) async {
  final title = TextEditingController();
  final body = TextEditingController();
  String targetRole = 'Director';
  String priority = 'high';

  await showDialog<void>(
    context: context,
    builder: (ctx) => StatefulBuilder(
      builder: (ctx, setSt) => AlertDialog(
        title: Text('"${school.schoolName}" को नोटिफिकेशन भेजें'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextField(controller: title, decoration: fieldDec('शीर्षक *')),
            const SizedBox(height: 10),
            TextField(
                controller: body,
                maxLines: 3,
                decoration: fieldDec('संदेश *')),
            const SizedBox(height: 10),
            DropdownButtonFormField<String>(
              initialValue: targetRole,
              decoration: fieldDec('लक्षित भूमिका'),
              items: const [
                DropdownMenuItem(value: 'Director', child: Text('Director')),
                DropdownMenuItem(value: 'Principal', child: Text('Principal')),
                DropdownMenuItem(value: 'Staff', child: Text('Staff')),
                DropdownMenuItem(value: 'Students', child: Text('Students')),
                DropdownMenuItem(value: 'Parents', child: Text('Parents')),
              ],
              onChanged: (v) => setSt(() => targetRole = v ?? targetRole),
            ),
            const SizedBox(height: 10),
            DropdownButtonFormField<String>(
              initialValue: priority,
              decoration: fieldDec('प्राथमिकता'),
              items: const [
                DropdownMenuItem(value: 'high', child: Text('उच्च (High)')),
                DropdownMenuItem(value: 'normal', child: Text('सामान्य (Normal)')),
              ],
              onChanged: (v) => setSt(() => priority = v ?? priority),
            ),
          ],
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.of(ctx).pop(), child: const Text('रद्द करें')),
          FilledButton(
            onPressed: () {
              if (title.text.trim().isEmpty || body.text.trim().isEmpty) {
                showSnack(ctx, 'शीर्षक और संदेश आवश्यक हैं।', ok: false);
                return;
              }
              Navigator.of(ctx).pop();
            },
            child: const Text('भेजें'),
          ),
        ],
      ),
    ),
  );

  if (!context.mounted) return;
  _busy(context, () async {
    return service.notifySchool(
      schoolId: school.id,
      title: title.text,
      body: body.text,
      targetRole: targetRole,
      priority: priority,
    );
  }, (res) {
    if (res['success'] == true) {
      showSnack(context, res['message'].toString());
    } else {
      showSnack(context, res['message'].toString(), ok: false);
    }
  });
}

// ---------------------------------------------------------------------------
// Provision dedicated worker
// ---------------------------------------------------------------------------

Future<void> showProvisionDialog(BuildContext context, SchoolModel school,
    SchoolService service, VoidCallback onChanged) async {
  final slug = TextEditingController(text: school.subdomain);
  final domain =
      TextEditingController(text: school.dedicatedDomain);

  await showDialog<void>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('डेडीकेटेड वर्कर प्रोविज़न'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
              controller: slug,
              decoration: fieldDec('Slug (a-z, 0-9, -)')),
          const SizedBox(height: 10),
          TextField(
              controller: domain,
              decoration: fieldDec('Domain (optional)')),
          const Text(
            'केवल Enterprise प्लान हेतु। GitHub commit → deploy.yml → provision-school.mjs प्रवाह चलेगा।',
            style: TextStyle(fontSize: 11, color: Colors.grey),
          ),
        ],
      ),
      actions: [
        TextButton(
            onPressed: () => Navigator.of(ctx).pop(), child: const Text('रद्द करें')),
        FilledButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('प्रोविज़न शुरू करें')),
      ],
    ),
  );

  if (!context.mounted) return;
  _busy(context, () async {
    return service.provisionSchool(school.id,
        slug: slug.text.trim(), domain: domain.text.trim());
  }, (res) {
    if (res['success'] == true) {
      showSnack(context, res['message'].toString());
      onChanged();
    } else {
      showSnack(context, res['message'].toString(), ok: false);
    }
  });
}

Future<void> _provisionCheck(BuildContext context, SchoolModel school,
    SchoolService service, VoidCallback onChanged) async {
  if (!context.mounted) return;
  _busy(context, () async {
    return service.checkProvision(school.id);
  }, (res) {
    if (res['success'] == true) {
      final live = res['live'] == true;
      showSnack(context,
          live ? '🎉 डेडीकेटेड वर्कर लाइव है!' : 'स्टेटस: ${res['status'] ?? 'pending'} (deploy जारी)',
          ok: live);
      onChanged();
    } else {
      showSnack(context, res['message'].toString(), ok: false);
    }
  });
}

Future<void> _deprovision(BuildContext context, SchoolModel school,
    SchoolService service, VoidCallback onChanged) async {
  if (!context.mounted) return;
  final ok = await confirmDialog(
    context,
    title: 'डी-प्रोविज़न?',
    message:
        '"${school.schoolName}" को शेयर्ड वर्कर मोड में बदल दिया जाएगा। क्या आप सुनिश्चित हैं?',
    confirmText: 'डी-प्रोविज़न करें',
    destructive: true,
  );
  if (!ok || !context.mounted) return;
  _busy(context, () async {
    return service.deprovisionSchool(school.id);
  }, (res) {
    if (res['success'] == true) {
      showSnack(context, res['message'].toString());
      onChanged();
    } else {
      showSnack(context, res['message'].toString(), ok: false);
    }
  });
}

// ---------------------------------------------------------------------------
// Add school (full form)
// ---------------------------------------------------------------------------

Future<Map<String, dynamic>?> showAddSchoolDialog(
    BuildContext context, List<PlanModel> plans) async {
  final formKey = GlobalKey<FormState>();
  final schoolName = TextEditingController();
  final directorName = TextEditingController();
  final email = TextEditingController();
  final phone = TextEditingController();
  final password = TextEditingController();
  final subdomain = TextEditingController();
  final customDomain = TextEditingController();
  final address = TextEditingController();
  final city = TextEditingController();
  final state = TextEditingController();
  final pincode = TextEditingController();
  String planId = plans.any((p) => p.id == 'trial') ? 'trial' : plans.first.id;
  String billingCycle = 'monthly';
  DateTime trialDate = DateTime.now().add(const Duration(days: 7));
  bool obscure = true;

  final saved = await showDialog<bool>(
    context: context,
    builder: (ctx) => StatefulBuilder(
      builder: (ctx, setSt) => AlertDialog(
        title: const Text('नया स्कूल जोड़ें'),
        content: SingleChildScrollView(
          child: Form(
            key: formKey,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                TextFormField(
                  controller: schoolName,
                  decoration: fieldDec('स्कूल का नाम *'),
                  validator: (v) =>
                      (v == null || v.trim().isEmpty) ? 'आवश्यक' : null,
                ),
                const SizedBox(height: 10),
                TextFormField(
                  controller: directorName,
                  decoration: fieldDec('डायरेक्टर का नाम *'),
                  validator: (v) =>
                      (v == null || v.trim().isEmpty) ? 'आवश्यक' : null,
                ),
                const SizedBox(height: 10),
                Row(children: [
                  Expanded(
                    child: TextFormField(
                      controller: email,
                      keyboardType: TextInputType.emailAddress,
                      decoration: fieldDec('ईमेल *'),
                      validator: (v) =>
                          RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
                                  .hasMatch((v ?? '').trim())
                              ? null
                              : 'मान्य ईमेल दर्ज करें',
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: TextFormField(
                      controller: phone,
                      keyboardType: TextInputType.phone,
                      decoration: fieldDec('फोन *'),
                      validator: (v) =>
                          RegExp(r'^[0-9]{10}$').hasMatch((v ?? '').trim())
                              ? null
                              : '10 अंक',
                    ),
                  ),
                ]),
                const SizedBox(height: 10),
                Row(children: [
                  Expanded(
                    child: TextFormField(
                      controller: password,
                      obscureText: obscure,
                      decoration: fieldDec('Director पासवर्ड *').copyWith(
                        suffixIcon: IconButton(
                          icon: Icon(obscure
                              ? Icons.visibility_off
                              : Icons.visibility,
                              size: 18),
                          onPressed: () => setSt(() => obscure = !obscure),
                        ),
                      ),
                      validator: (v) => (v == null || v.trim().length < 6)
                          ? 'कम से कम 6 अक्षर'
                          : null,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: TextFormField(
                      controller: subdomain,
                      decoration: fieldDec('Subdomain (optional)'),
                    ),
                  ),
                ]),
                const SizedBox(height: 10),
                TextFormField(
                  controller: customDomain,
                  decoration: fieldDec('Custom Domain (optional)'),
                ),
                const SizedBox(height: 10),
                TextFormField(
                  controller: address,
                  decoration: fieldDec('पता (optional)'),
                ),
                const SizedBox(height: 10),
                Row(children: [
                  Expanded(
                    child: TextFormField(
                        controller: city, decoration: fieldDec('शहर')),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: TextFormField(
                        controller: state, decoration: fieldDec('राज्य')),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: TextFormField(
                        controller: pincode,
                        decoration: fieldDec('PIN')),
                  ),
                ]),
                const SizedBox(height: 10),
                Row(children: [
                  Expanded(
                    child: DropdownButtonFormField<String>(
                      initialValue: planId,
                      decoration: fieldDec('प्लान'),
                      items: plans
                          .map((p) => DropdownMenuItem(
                              value: p.id,
                              child: Text(p.name,
                                  style: const TextStyle(fontSize: 12))))
                          .toList(),
                      onChanged: (v) => setSt(() => planId = v ?? planId),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: DropdownButtonFormField<String>(
                      initialValue: billingCycle,
                      decoration: fieldDec('Billing Cycle'),
                      items: _cycles
                          .map((c) =>
                              DropdownMenuItem(value: c, child: Text(c)))
                          .toList(),
                      onChanged: (v) =>
                          setSt(() => billingCycle = v ?? billingCycle),
                    ),
                  ),
                ]),
                const SizedBox(height: 10),
                InkWell(
                  onTap: () async {
                    final picked = await showDatePicker(
                      context: ctx,
                      initialDate: trialDate,
                      firstDate: DateTime.now(),
                      lastDate: DateTime.now().add(const Duration(days: 365 * 3)),
                    );
                    if (picked != null) setSt(() => trialDate = picked);
                  },
                  child: InputDecorator(
                    decoration: fieldDec('Trial समाप्ति तिथि'),
                    child: Text(_dateOnly(trialDate)),
                  ),
                ),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: const Text('रद्द करें')),
          FilledButton(
            onPressed: () {
              if (!formKey.currentState!.validate()) return;
              Navigator.of(ctx).pop(true);
            },
            child: const Text('स्कूल बनाएं + Director Login'),
          ),
        ],
      ),
    ),
  );

  if (saved != true) return null;
  return {
    'schoolName': schoolName.text,
    'directorName': directorName.text,
    'email': email.text,
    'phone': phone.text,
    'password': password.text,
    'subdomain': subdomain.text,
    'customDomain': customDomain.text,
    'planId': planId,
    'billingCycle': billingCycle,
    'trialEndsAt': _dateOnly(trialDate),
    'address': address.text,
    'city': city.text,
    'state': state.text,
    'pincode': pincode.text,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

Future<List<PlanModel>?> _loadPlans(BuildContext context) async {
  try {
    return await SchoolService().fetchPlans();
  } catch (e) {
    if (context.mounted) {
      showSnack(context, 'प्लान लोड करने में त्रुटि: $e', ok: false);
    }
    return null;
  }
}

/// Runs a busy operation with inline progress + result handling.
Future<void> _busy(
  BuildContext context,
  Future<Map<String, dynamic>> Function() op,
  void Function(Map<String, dynamic> res) onResult,
) async {
  if (!context.mounted) return;
  showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (ctx) => const Center(
      child: Card(
        child: Padding(
          padding: EdgeInsets.all(20),
          child: CircularProgressIndicator(),
        ),
      ),
    ),
  );
  try {
    final res = await op();
    if (context.mounted) Navigator.of(context).pop();
    onResult(res);
  } catch (e) {
    if (context.mounted) {
      Navigator.of(context).pop();
      showSnack(context, 'त्रुटि: ${e.toString().replaceFirst('Exception: ', '')}',
          ok: false);
    }
  }
}