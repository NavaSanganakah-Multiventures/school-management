// Widget tests for the school-action dialogs in the Super Admin console.
//
// WHY THESE EXIST
//
// Seven of these dialogs discarded their result: both buttons called
// Navigator.pop() with no value and the follow-up action ran unconditionally. So
// tapping "रद्द करें" approved a pending school, overwrote the school record,
// changed the billing plan, replaced the sender config, sent a payment-link
// email plus an FCM push, push-notified an entire school, and triggered a CI
// deploy workflow. The last one is why this file is not cosmetic.
//
// scripts/verify-flutter-dialogs.mjs is a source-shape check: it proves the guard
// is present in the source, and it runs in `npm test` on every pull request.
// It cannot tell whether the widget actually behaves that way. That is what these
// do -- they pump the real dialog, tap the real Cancel button, and assert the
// service was never called.
//
// THE CONTROL CASE MATTERS MORE HERE THAN ANYWHERE ELSE IN THIS REPO
//
// A dialog that never called the service at all would pass every "Cancel did
// nothing" assertion below, and would ship a console where no button works. So
// every negative test has a matching positive one: Cancel calls nothing, Confirm
// calls exactly the expected one call. The positives are the tests that would
// fail if the fix had been done by simply deleting the action.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
// Package-qualified, matching test/widget_test.dart. Relative imports of lib/ from
// test/ resolve to a DIFFERENT library instance, so the top-level functions the
// dialogs live in are simply not in scope -- which is why `dart analyze` reported
// "confirmDialog isn't defined" rather than anything about the dialogs themselves.
import 'package:vidyasetu_super_admin_app/models/school_model.dart';
import 'package:vidyasetu_super_admin_app/screens/school_actions.dart';
import 'package:vidyasetu_super_admin_app/services/school_service.dart';
import 'package:vidyasetu_super_admin_app/widgets/app_ui.dart';

/// A SchoolService that records calls instead of making them.
///
/// Subclasses the real class so no signature changes are needed for the sake of a
/// test. Every method the dialogs call is overridden; the base implementations
/// are never reached because nothing here performs I/O.
class _RecordingService extends SchoolService {
  final List<String> calls = <String>[];

  @override
  Future<Map<String, dynamic>> approveSchool(
    String schoolId, {
    String? planId,
    String? trialEndsAt,
  }) async {
    calls.add('approveSchool');
    return {'success': true, 'message': 'approved'};
  }

  @override
  Future<Map<String, dynamic>> updateSchool(
      String schoolId, Map<String, dynamic> fields) async {
    calls.add('updateSchool');
    return {'success': true, 'message': 'updated'};
  }

  @override
  Future<Map<String, dynamic>> changePlan(
    String schoolId,
    String planId, {
    String? trialEndsAt,
  }) async {
    calls.add('changePlan');
    return {'success': true, 'message': 'plan changed'};
  }

  @override
  Future<Map<String, dynamic>> saveEmailConfig({
    required String schoolId,
    String? limit,
    String fromName = '',
    String fromEmail = '',
    String replyTo = '',
    bool isActive = true,
  }) async {
    calls.add('saveEmailConfig');
    return {'success': true, 'message': 'saved'};
  }

  @override
  Future<Map<String, dynamic>> sendPaymentLink({
    required String schoolId,
    required String planId,
    String billingCycle = 'annual',
  }) async {
    calls.add('sendPaymentLink');
    return {'success': true, 'message': 'sent'};
  }

  @override
  Future<Map<String, dynamic>> notifySchool({
    required String schoolId,
    required String title,
    required String body,
    String targetRole = 'Director',
    String priority = 'Normal',
    String actionUrl = '',
  }) async {
    calls.add('notifySchool');
    return {'success': true, 'message': 'notified'};
  }

  @override
  Future<Map<String, dynamic>> provisionSchool(String schoolId,
      {String? slug, String? domain}) async {
    calls.add('provisionSchool');
    return {'success': true, 'message': 'provisioning'};
  }
}

// SchoolModel has 21 required fields, all named. Listing them is noise, but a
// missing one is a compile error rather than a silent default -- which is the
// point: a new required field upstream breaks this loudly instead of leaving a
// test that quietly exercises nothing.
const SchoolModel _school = SchoolModel(
      id: 'school-1',
      schoolName: 'Test School',
      subdomain: 'test',
      customDomain: '',
      contactEmail: 'admin@test.school',
      contactPhone: '+910000000000',
      status: 'Active',
      registrationStatus: 'Approved',
      planId: 'trial',
      planName: 'Trial',
      trialEndsAt: '',
      // Non-nullable String on every one of these, not String?. An empty string is
      // the "not set" value; passing null is a type error, which is what dart
      // analyze caught when this was first written.
      deletedAt: '',
      createdAt: '2026-01-01',
      provisioningStatus: 'live',
      dedicatedSlug: 'test',
      dedicatedDomain: 'test.pragnya.nasven.com',
      d1DatabaseId: '',
      r2BucketName: '',
      kvNamespaceId: '',
      provisionedAt: '',
      provisioningError: '',
    );

/// Opens a dialog on the next frame and returns once it has closed AND the action
/// it guards has run.
///
/// The dialogs are async and read a live BuildContext, so the future has to be
/// driven while the tree is mounted. Without the post-frame kick the dialog is
/// built before there is a context, and without awaiting [done] the test would
/// assert on a tree that has not settled.
Future<void> _drive(
  WidgetTester tester,
  Future<void> Function(BuildContext) open,
) async {
  final done = Completer<void>();
  await tester.pumpWidget(MaterialApp(
    home: Scaffold(
      body: Builder(builder: (context) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          open(context).whenComplete(done.complete);
        });
        return const SizedBox.shrink();
      }),
    ),
  ));
  await tester.pumpAndSettle();
  await done.future;
  await tester.pumpAndSettle();
}

/// Matches a button by its label. The dialogs use TextButton for Cancel and
/// FilledButton for Confirm, so matching the Text is what tells them apart
/// without depending on the class.
Finder _btn(String label) => find.widgetWithText(Text, label);

void main() {
  group('confirmDialog', () {
    testWidgets('cancelling reports false', (tester) async {
      bool? result;
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: Builder(builder: (context) {
            return TextButton(
              onPressed: () async {
                result = await confirmDialog(context,
                    title: 'शीर्षक', message: 'संदेश');
              },
              child: const Text('open'),
            );
          }),
        ),
      ));
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
      await tester.tap(_btn('रद्द करें'));
      await tester.pumpAndSettle();
      expect(result, isFalse);
    });

    testWidgets('confirming reports true', (tester) async {
      bool? result;
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: Builder(builder: (context) {
            return TextButton(
              onPressed: () async {
                result = await confirmDialog(context,
                    title: 'शीर्षक', message: 'संदेश');
              },
              child: const Text('open'),
            );
          }),
        ),
      ));
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
      await tester.tap(_btn('पुष्टि करें'));
      await tester.pumpAndSettle();
      expect(result, isTrue);
    });

    testWidgets('a barrier dismissal is not a confirmation', (tester) async {
      // A dismissed dialog returns null. `result == true` has to treat that as
      // "no", and a `if (result)` would not. This is the case a "dismissed means
      // cancel by default" bug hides in.
      bool? result;
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: Builder(builder: (context) {
            return TextButton(
              onPressed: () async {
                result = await confirmDialog(context,
                    title: 'शीर्षक', message: 'संदेश');
              },
              child: const Text('open'),
            );
          }),
        ),
      ));
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
      await tester.tapAt(const Offset(10, 10)); // outside the dialog
      await tester.pumpAndSettle();
      expect(result, isNot(true));
    });
  });

  group('school action dialogs', () {
    // The two dialogs that need no network call before opening, so the test does
    // not have to stub a plan list or a provisioning check first. The other five
    // fetch before they render, which is why the source audit covers those: it
    // asserts the guard is present without needing the dialog to open.

    testWidgets('provision: cancel does NOT trigger a deploy, confirm does',
        (tester) async {
      final service = _RecordingService();
      const school = _school;

      // --- cancel ---
      await _drive(tester, (context) =>
          showProvisionDialog(context, school, service, () {}));
      expect(_btn('प्रोविज़न शुरू करें'), findsOneWidget,
          reason: 'the confirm button must exist for this test to mean anything');
      await tester.tap(_btn('रद्द करें'));
      await tester.pumpAndSettle();
      expect(service.calls, isEmpty,
          reason: 'cancelling must not trigger a CI deploy workflow');

      // --- confirm: the control case ---
      await _drive(tester, (context) =>
          showProvisionDialog(context, school, service, () {}));
      await tester.tap(_btn('प्रोविज़न शुरू करें'));
      await tester.pumpAndSettle();
      expect(service.calls, contains('provisionSchool'),
          reason: 'confirming must actually provision, or the fix was a deletion');
    });

    testWidgets('notify: cancel does NOT notify the school, confirm does',
        (tester) async {
      final service = _RecordingService();
      const school = _school;

      // --- cancel ---
      await _drive(tester, (context) =>
          showNotifyDialog(context, school, service, () {}));
      // Assert the dialog really opened before concluding anything from an empty
      // call list. Without this, a dialog that failed to open at all would look
      // exactly like a correct cancel.
      expect(_btn('भेजें'), findsOneWidget,
          reason: 'the send button must exist for this test to mean anything');
      await tester.tap(_btn('रद्द करें'));
      await tester.pumpAndSettle();
      expect(service.calls, isEmpty,
          reason: 'cancelling must not push-notify a whole school');

      // --- confirm: the control case ---
      await _drive(tester, (context) =>
          showNotifyDialog(context, school, service, () {}));
      await tester.tap(_btn('भेजें'));
      await tester.pumpAndSettle();
      expect(service.calls, contains('notifySchool'),
          reason: 'confirming must actually notify, or the fix was a deletion');
    });
  });
}
