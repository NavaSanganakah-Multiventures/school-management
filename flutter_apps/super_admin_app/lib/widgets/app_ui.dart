import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

/// Shared UI helpers for the Super Admin app.

const Color kPrimary = Color(0xFFE11D48);
const Color kPrimaryDark = Color(0xFF881337);
const Color kBackground = Color(0xFFF8FAFC);
const Color kSidebar = Color(0xFF0F172A);

final NumberFormat _inr = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 2);

String money(double amt) => _inr.format(amt);

/// Shows a SnackBar; [ok]=true for success (green), false for error (red).
void showSnack(BuildContext context, String msg, {bool ok = true}) {
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(
      content: Text(msg),
      backgroundColor: ok ? const Color(0xFF047857) : const Color(0xFFBE123C),
      behavior: SnackBarBehavior.floating,
    ),
  );
}

/// Generic confirm dialog returns true when confirmed.
Future<bool> confirmDialog(
  BuildContext context, {
  required String title,
  required String message,
  String confirmText = 'पुष्टि करें',
  bool destructive = false,
}) async {
  final result = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title),
      content: Text(message),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(ctx).pop(false),
          child: const Text('रद्द करें'),
        ),
        FilledButton(
          style: FilledButton.styleFrom(
            backgroundColor: destructive ? const Color(0xFFBE123C) : kPrimaryDark,
          ),
          onPressed: () => Navigator.of(ctx).pop(true),
          child: Text(confirmText),
        ),
      ],
    ),
  );
  return result == true;
}

/// Error banner shown at the top of content.
Widget errorBanner(String message) {
  return Container(
    width: double.infinity,
    margin: const EdgeInsets.only(bottom: 12),
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      color: const Color(0xFFFFF1F2),
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: const Color(0xFFFECDD3)),
    ),
    child: Text(message, style: const TextStyle(color: Color(0xFFBE123C), fontSize: 12)),
  );
}

/// Metric / stat card used across dashboard-like views.
Widget metricCard({
  required String title,
  required String value,
  String? subtitle,
  required Color color,
  IconData? icon,
  VoidCallback? onTap,
}) {
  return Material(
    color: Colors.white,
    borderRadius: BorderRadius.circular(16),
    child: InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: color.withValues(alpha: 0.25)),
          color: Colors.white,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                if (icon != null) ...[
                  Icon(icon, size: 16, color: color),
                  const SizedBox(width: 6),
                ],
                Expanded(
                  child: Text(
                    title,
                    style: const TextStyle(fontSize: 11, color: Colors.grey),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              value,
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w900,
                color: color,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            if (subtitle != null) ...[
              const SizedBox(height: 2),
              Text(subtitle, style: const TextStyle(fontSize: 10, color: Colors.black45)),
            ],
          ],
        ),
      ),
    ),
  );
}

/// Colored status pill.
Widget statusPill(String label, {Color color = const Color(0xFF475569)}) {
  return Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
    decoration: BoxDecoration(
      color: color.withValues(alpha: 0.12),
      borderRadius: BorderRadius.circular(8),
    ),
    child: Text(
      label,
      style: TextStyle(
        fontSize: 10,
        fontWeight: FontWeight.bold,
        color: color,
      ),
    ),
  );
}

Color _shade(String status) {
  switch (status) {
    case 'Active':
    case 'Paid':
    case 'Approved':
    case 'Delivered':
      return const Color(0xFF047857);
    case 'Trial':
    case 'Pending':
    case 'Processing':
    case 'Pending_Approval':
    case 'In_Review':
      return const Color(0xFFB45309);
    case 'Suspended':
    case 'Failed':
    case 'Rejected':
    case 'Canceled':
    case 'Expired':
    case 'Trial_Expired':
      return const Color(0xFFBE123C);
    case 'live':
      return const Color(0xFF047857);
    case 'pending':
    case 'provisioning':
      return const Color(0xFFB45309);
    default:
      return const Color(0xFF475569);
  }
}

Color statusColor(String status) => _shade(status);

/// Smart status pill — color auto-picked from a known status vocabulary.
Widget smartStatusPill(String status, {String? overrideLabel}) {
  return statusPill(overrideLabel ?? status, color: statusColor(status));
}

/// Section header with optional right-side action.
Widget sectionHeader(String title, {String? trailing, Widget? action}) {
  return Row(
    mainAxisAlignment: MainAxisAlignment.spaceBetween,
    children: [
      Text(title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
      if (action != null)
        action
      else if (trailing != null)
        Text(trailing, style: const TextStyle(fontSize: 12, color: Colors.grey)),
    ],
  );
}

/// Standard outlined text field decorator.
InputDecoration fieldDec(String label, {String? hint, IconData? icon}) {
  return InputDecoration(
    labelText: label,
    hintText: hint,
    prefixIcon: icon != null ? Icon(icon, size: 20) : null,
    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
    filled: true,
    fillColor: Colors.white,
    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
  );
}

/// Full-screen centered loader.
Widget loadingIndicator({String? message}) {
  return Center(
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const CircularProgressIndicator(),
        if (message != null) ...[
          const SizedBox(height: 12),
          Text(message, style: const TextStyle(fontSize: 12, color: Colors.grey)),
        ],
      ],
    ),
  );
}

/// Empty state placeholder.
Widget emptyState(String message, {IconData icon = Icons.inbox_outlined}) {
  return Container(
    width: double.infinity,
    padding: const EdgeInsets.all(28),
    decoration: BoxDecoration(
      color: Colors.grey.shade50,
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: Colors.grey.shade200),
    ),
    child: Column(
      children: [
        Icon(icon, size: 40, color: Colors.grey.shade400),
        const SizedBox(height: 10),
        Text(
          message,
          textAlign: TextAlign.center,
          style: const TextStyle(color: Colors.grey, fontSize: 13),
        ),
      ],
    ),
  );
}

/// Wraps a future-list in RefreshIndicator + scroll view + states.
Widget refreshableList({
  required Future<void> Function() onRefresh,
  required bool isLoading,
  String? error,
  required List<Widget> children,
  EdgeInsets padding = const EdgeInsets.all(16),
}) {
  if (isLoading) return loadingIndicator(message: 'लोड हो रहा है…');
  if (error != null && error.isNotEmpty) {
    return SingleChildScrollView(
      padding: padding,
      child: Column(children: [errorBanner(error)]),
    );
  }
  return RefreshIndicator(
    onRefresh: onRefresh,
    child: SingleChildScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: padding,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: children,
      ),
    ),
  );
}